package ai.riviera.platform;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.booking.application.refund.RefundOutboxStatus;
import ai.riviera.platform.booking.application.refund.RefundResubmission;
import ai.riviera.platform.shared.ResubmissionOutcome;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the ADMIN refund outbox ({@code /api/admin/refund-outbox}, #454) through the real
 * filter chain — the {@code AdminMailOutboxControllerTest} pattern on the money path:
 *
 * <ol>
 * <li><strong>ADMIN role gate</strong> (AC-6): an ADMIN succeeds; an OPERATOR / CUSTOMER is
 * {@code 403}; an anonymous request {@code 401} — and none of them reaches the port, which matters
 * doubly here: reaching it would consume the cooldown, and this port fronts a lever that re-drives
 * money-path work.</li>
 * <li><strong>All three outcomes are {@code 200}</strong>, each carrying the count and the retry
 * window, because a refusal is an expected flow the admin acts on rather than an error.</li>
 * <li><strong>Nothing leaks</strong> (invariant #7): counts and an outcome token only — the
 * publications' serialized payloads are exactly where booking ids live, and none of that reaches the
 * wire.</li>
 * </ol>
 *
 * <p>Lives in the root test package, unlike the controller it covers, because {@code WebSliceStubs} is
 * package-private here and the subject is the admin surface <em>through</em> {@code SecurityConfig}.
 * The policy has its own tests ({@code RefundResubmissionServiceTest}), as does the scope
 * ({@code RefundOutboxScopeTest}, {@code RefundOutboxScopeIT}). Docker-free {@code @WebMvcTest} slice.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminRefundOutboxControllerTest {

	private static final String OUTBOX = "/api/admin/refund-outbox";

	private static final String RESUBMIT = OUTBOX + "/resubmit";

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	RefundResubmission resubmission;

	@Test
	void adminReadsWhatTheRegistryStillOwes() throws Exception {
		when(resubmission.status()).thenReturn(new RefundOutboxStatus(2, Duration.ZERO));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN", "OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outstanding").value(2))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(0));
	}

	@Test
	void adminResubmitsAndGetsTheCount() throws Exception {
		when(resubmission.resubmit()).thenReturn(new ResubmissionOutcome.Resubmitted(2, COOLDOWN));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN", "OPERATOR")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("RESUBMITTED"))
				.andExpect(jsonPath("$.resubmitted").value(2))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(60));

		verify(resubmission).resubmit();
	}

	@Test
	void aConcurrentPressReportsAlreadyRunningAndResubmitsNothing() throws Exception {
		when(resubmission.resubmit()).thenReturn(new ResubmissionOutcome.AlreadyRunning(COOLDOWN));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("ALREADY_RUNNING"))
				.andExpect(jsonPath("$.resubmitted").value(0));
	}

	/** Rounded up, so an admin polling at the reported second finds the lever accepting, not one short. */
	@Test
	void aPressInsideTheWindowReportsCoolingDownWithTheRoundedUpRemainder() throws Exception {
		when(resubmission.resubmit())
				.thenReturn(new ResubmissionOutcome.CoolingDown(Duration.ofMillis(40_400)));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("COOLING_DOWN"))
				.andExpect(jsonPath("$.resubmitted").value(0))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(41));
	}

	/**
	 * The carry has to survive a sub-millisecond tail — the ordinary case for a
	 * {@code Duration.between} on a nanosecond clock; a {@code plusMillis(999)} ceiling would truncate
	 * it back down (#405's F-4, inherited as a test rather than re-learned).
	 */
	@Test
	void roundsUpARemainderThatIsNotAWholeMillisecond() throws Exception {
		when(resubmission.resubmit()).thenReturn(
				new ResubmissionOutcome.CoolingDown(Duration.ofSeconds(40).plusNanos(500_000)));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(41));
	}

	/** A window that divides evenly is not rounded up past itself — the carry must not add a second. */
	@Test
	void leavesAWholeNumberOfSecondsAlone() throws Exception {
		when(resubmission.status()).thenReturn(new RefundOutboxStatus(0, Duration.ofSeconds(30)));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(30));
	}

	/** Invariant #7 / AC-7: the outbox's payloads carry booking ids; its API carries counts only. */
	@Test
	void theResponseCarriesCountsAndNothingElse() throws Exception {
		when(resubmission.status()).thenReturn(new RefundOutboxStatus(1, Duration.ofSeconds(30)));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN")))
				.andExpect(status().isOk())
				.andExpect(content().json("{\"outstanding\":1,\"cooldownRemainingSeconds\":30}", true));
	}

	@Test
	void operatorAndCustomerSessionsAreForbiddenOnBothEndpoints() throws Exception {
		mvc.perform(get(OUTBOX).with(user("op").roles("OPERATOR"))).andExpect(status().isForbidden());
		mvc.perform(get(OUTBOX).with(user("t@example.com").roles("CUSTOMER"))).andExpect(status().isForbidden());
		mvc.perform(post(RESUBMIT).with(user("op").roles("OPERATOR")).with(csrf()))
				.andExpect(status().isForbidden());
		mvc.perform(post(RESUBMIT).with(user("t@example.com").roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isForbidden());

		verifyNoInteractions(resubmission);
	}

	@Test
	void anonymousIsUnauthorizedOnBothEndpoints() throws Exception {
		mvc.perform(get(OUTBOX)).andExpect(status().isUnauthorized());
		mvc.perform(post(RESUBMIT).with(csrf())).andExpect(status().isUnauthorized());

		verifyNoInteractions(resubmission);
	}

	/**
	 * The write is CSRF-protected like every other session-authenticated write; a missing token is
	 * {@code 403} and, critically, does not consume the cooldown.
	 */
	@Test
	void aResubmitWithoutACsrfTokenIsRejectedAndDoesNotConsumeTheCooldown() throws Exception {
		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")))
				.andExpect(status().isForbidden());

		verify(resubmission, never()).resubmit();
	}
}
