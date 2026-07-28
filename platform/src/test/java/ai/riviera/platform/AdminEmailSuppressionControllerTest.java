package ai.riviera.platform;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.notification.application.ReinstateOutcome;
import ai.riviera.platform.notification.application.ReinstateSuppression;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for lifting an email suppression ({@code POST /api/admin/email-suppressions/reinstate},
 * #391) through the real filter chain — the {@code AdminErasureControllerTest} pattern:
 *
 * <ol>
 * <li><strong>ADMIN role gate</strong> (AC-7): an ADMIN succeeds; an OPERATOR / CUSTOMER is
 * {@code 403}; an anonymous request {@code 401} — none reaches the port. Reinstatement is an ops
 * judgment call, never self-service.</li>
 * <li><strong>All three outcomes are {@code 200}</strong>, each carrying the row's technical facts,
 * because that response is what lets the slice ship without a standing suppression-lookup
 * endpoint.</li>
 * <li><strong>Error contract:</strong> a blank or shapeless email is {@code 400} RFC-7807 with a
 * stable {@code code} and never reaches the port.</li>
 * </ol>
 *
 * <p>Lives in the root test package, unlike the controller it covers, because {@code WebSliceStubs}
 * is package-private here and the subject is really the admin surface <em>through</em>
 * {@code SecurityConfig}. The module-internal behaviour behind the port has its own tests
 * ({@code SuppressionReinstatementServiceTest}, {@code EmailSuppressionReinstatementIT}).
 * Docker-free {@code @WebMvcTest} slice.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminEmailSuppressionControllerTest {

	private static final String REINSTATE = "/api/admin/email-suppressions/reinstate";
	private static final String EMAIL = "recovered@example.com";
	private static final String BODY = "{\"email\":\"" + EMAIL + "\"}";

	private static final Instant FIRST_SUPPRESSED = Instant.parse("2026-07-20T08:31:00Z");
	private static final Instant LAST_EVENT = Instant.parse("2026-07-22T14:02:00Z");
	private static final Instant LIFTED_AT = Instant.parse("2026-07-25T11:14:00Z");

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ReinstateSuppression reinstatement;

	@Test
	void adminLiftsASuppressionAndGetsTheRowsFacts() throws Exception {
		when(reinstatement.reinstate(EMAIL)).thenReturn(new ReinstateOutcome.Reinstated(
				SuppressionReason.HARD_BOUNCE, FIRST_SUPPRESSED, LAST_EVENT));

		mvc.perform(admin(BODY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("REINSTATED"))
				.andExpect(jsonPath("$.reason").value("HARD_BOUNCE"))
				.andExpect(jsonPath("$.firstSuppressedAt").isNotEmpty())
				.andExpect(jsonPath("$.lastEventAt").isNotEmpty())
				.andExpect(jsonPath("$.reinstatedAt").isEmpty());

		verify(reinstatement).reinstate(EMAIL);
	}

	@Test
	void anAddressThatWasNeverListedReportsNotSuppressed() throws Exception {
		when(reinstatement.reinstate(EMAIL)).thenReturn(new ReinstateOutcome.NotSuppressed());

		mvc.perform(admin(BODY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("NOT_SUPPRESSED"))
				.andExpect(jsonPath("$.reason").isEmpty());
	}

	@Test
	void aRepeatLiftReportsTheOriginalReinstatement() throws Exception {
		when(reinstatement.reinstate(EMAIL)).thenReturn(new ReinstateOutcome.AlreadyReinstated(
				SuppressionReason.COMPLAINT, FIRST_SUPPRESSED, LAST_EVENT, LIFTED_AT));

		mvc.perform(admin(BODY))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.outcome").value("ALREADY_REINSTATED"))
				.andExpect(jsonPath("$.reinstatedAt").isNotEmpty());
	}

	@Test
	void aBlankOrShapelessEmailIsRejectedWithProblemDetailAndNoLift() throws Exception {
		mvc.perform(admin("{\"email\":\"   \"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		// Without this branch a typo'd address would answer the technically-true but misleading
		// NOT_SUPPRESSED, which reads to an admin as "nothing to do here".
		mvc.perform(admin("{\"email\":\"not-an-address\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(reinstatement, never()).reinstate(any());
	}

	@Test
	void operatorAndCustomerSessionsAreForbidden() throws Exception {
		mvc.perform(post(REINSTATE).with(user("op").roles("OPERATOR")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(BODY))
				.andExpect(status().isForbidden());
		mvc.perform(post(REINSTATE).with(user("t@example.com").roles("CUSTOMER")).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(BODY))
				.andExpect(status().isForbidden());

		verify(reinstatement, never()).reinstate(any());
	}

	@Test
	void anonymousIsUnauthorized() throws Exception {
		mvc.perform(post(REINSTATE).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(BODY))
				.andExpect(status().isUnauthorized());

		verify(reinstatement, never()).reinstate(any());
	}

	private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder admin(String body) {
		return post(REINSTATE).with(user("admin").roles("ADMIN")).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(body);
	}
}
