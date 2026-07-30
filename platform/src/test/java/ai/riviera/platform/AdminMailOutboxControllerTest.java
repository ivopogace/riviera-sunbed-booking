package ai.riviera.platform;

import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.notification.application.MailOutboxStatus;
import ai.riviera.platform.notification.application.MailResubmission;
import ai.riviera.platform.notification.application.MailResubmissionOutcome;

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
 * HTTP contract for the ADMIN mail outbox ({@code /api/admin/mail-outbox}, #405) through the real
 * filter chain — the {@code AdminEmailSuppressionControllerTest} pattern:
 *
 * <ol>
 * <li><strong>ADMIN role gate</strong> (AC-6): an ADMIN succeeds; an OPERATOR / CUSTOMER is
 * {@code 403}; an anonymous request {@code 401} — and none of them reaches the port, which matters
 * more here than on a read-only surface, since reaching it would consume the cooldown.</li>
 * <li><strong>All three outcomes are {@code 200}</strong>, each carrying the count and the retry
 * window, because a refusal is an expected flow the admin acts on rather than an error.</li>
 * <li><strong>Nothing leaks</strong> (invariant #7): the response bodies are counts and an outcome
 * token, with no address, arrival code or registry payload anywhere.</li>
 * </ol>
 *
 * <p>Lives in the root test package, unlike the controller it covers, because {@code WebSliceStubs} is
 * package-private here and the subject is really the admin surface <em>through</em>
 * {@code SecurityConfig}. The policy behind the port has its own tests
 * ({@code MailResubmissionServiceTest}), as does the scope ({@code MailOutboxScopeTest},
 * {@code MailOutboxScopeIT}). Docker-free {@code @WebMvcTest} slice.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminMailOutboxControllerTest {

	private static final String OUTBOX = "/api/admin/mail-outbox";

	private static final String RESUBMIT = OUTBOX + "/resubmit";

	private static final Duration COOLDOWN = Duration.ofSeconds(60);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	MailResubmission resubmission;

	@Test
	void adminReadsWhatTheRegistryStillOwes() throws Exception {
		when(resubmission.status()).thenReturn(new MailOutboxStatus(4, Duration.ZERO));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN", "OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outstanding").value(4))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(0));
	}

	@Test
	void adminResubmitsAndGetsTheCount() throws Exception {
		when(resubmission.resubmit()).thenReturn(new MailResubmissionOutcome.Resubmitted(4, COOLDOWN));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN", "OPERATOR")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("RESUBMITTED"))
				.andExpect(jsonPath("$.resubmitted").value(4))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(60));

		verify(resubmission).resubmit();
	}

	@Test
	void aConcurrentPressReportsAlreadyRunningAndResubmitsNothing() throws Exception {
		when(resubmission.resubmit()).thenReturn(new MailResubmissionOutcome.AlreadyRunning(COOLDOWN));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("ALREADY_RUNNING"))
				.andExpect(jsonPath("$.resubmitted").value(0));
	}

	/** Rounded up, so an admin polling at the reported second finds the lever accepting, not one short. */
	@Test
	void aPressInsideTheWindowReportsCoolingDownWithTheRoundedUpRemainder() throws Exception {
		when(resubmission.resubmit())
				.thenReturn(new MailResubmissionOutcome.CoolingDown(Duration.ofMillis(40_400)));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("COOLING_DOWN"))
				.andExpect(jsonPath("$.resubmitted").value(0))
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(41));
	}

	/**
	 * The carry has to survive a sub-millisecond tail, which is the ordinary case: the remaining window
	 * is a {@code Duration.between} on a nanosecond-resolution clock, so it is rarely a whole number of
	 * milliseconds. A {@code plusMillis(999)} ceiling silently truncates these back down and reports a
	 * second less than the contract promises.
	 */
	@Test
	void roundsUpARemainderThatIsNotAWholeMillisecond() throws Exception {
		when(resubmission.resubmit()).thenReturn(
				new MailResubmissionOutcome.CoolingDown(Duration.ofSeconds(40).plusNanos(500_000)));

		mvc.perform(post(RESUBMIT).with(user("operator").roles("ADMIN")).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(41));
	}

	/** A window that divides evenly is not rounded up past itself — the carry must not add a second. */
	@Test
	void leavesAWholeNumberOfSecondsAlone() throws Exception {
		when(resubmission.status()).thenReturn(new MailOutboxStatus(0, Duration.ofSeconds(30)));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.cooldownRemainingSeconds").value(30));
	}

	/** Invariant #7: the outbox's payloads carry booking ids and arrival codes; its API carries neither. */
	@Test
	void theResponseCarriesCountsAndNothingElse() throws Exception {
		when(resubmission.status()).thenReturn(new MailOutboxStatus(2, Duration.ofSeconds(30)));

		mvc.perform(get(OUTBOX).with(user("operator").roles("ADMIN")))
				.andExpect(status().isOk())
				.andExpect(content().json("{\"outstanding\":2,\"cooldownRemainingSeconds\":30}", true));
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
