package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The {@code CUSTOMER} role gate over the <strong>whole</strong> {@code /api/me/**} surface —
 * specifically that it holds <em>at the security filter layer</em>, for every method, not only for the
 * {@code GET} and the {@code POST /api/me/erasure} that once had dedicated matchers.
 *
 * <p><strong>Why a status assertion would pin nothing.</strong> Every {@code /api/me} controller opens
 * with {@link CurrentCustomer#require}, which throws {@code AccessDeniedException} for a non-customer
 * principal. That reaches {@link ApiErrorHandler#onAccessDenied} and produces
 * {@code 403 ACCESS_DENIED} — <em>byte-identical</em> to what
 * {@link SecurityProblemResponses#writeAccessDenied} emits from inside the filter chain. So neither the
 * status code nor the response body can tell the two layers apart, and a test asserting only
 * {@code isForbidden()} passes just as happily against a {@code SecurityConfig} with no matcher at all.
 * A {@code verify(collaborator, never())} is no better on its own: {@code require} is the controller's
 * first statement, so nothing downstream is touched on either path.
 *
 * <p><strong>The discriminator</strong> is therefore structural — {@link MvcResult#getHandler()}. It is
 * {@code null} exactly when the security chain short-circuited before {@code DispatcherServlet} ever
 * dispatched, and non-{@code null} once a handler method was selected. {@link
 * #customerRequestDoesReachTheController} is the positive control that proves the assertion varies:
 * same endpoint, customer principal, non-{@code null} handler.
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}), like every other web-slice
 * test here. Docker-free. The real-schema behaviour of these endpoints stays {@code SetPasswordIT}'s
 * and {@code EmailVerificationIT}'s job.
 *
 * <p>Every request carries a unique {@code X-Forwarded-For} (rate-bucket isolation), as every other
 * recovery-path test does. {@code /api/me/verify-email/request} is one of {@code RateLimitFilter}'s
 * {@code RECOVERY_PATHS}, that budget is the 10-per-minute {@code login} limit, and the limiter sits
 * <em>ahead of</em> authorization — so even the {@code 403}/{@code 401} requests below spend a token.
 * Sharing the default loopback key with the rest of a cached-context full-suite run is precisely how
 * a shared rate bucket once turned green scoped batches into a CI-only wall of {@code 429}s.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class MeSurfaceRoleGateTest {

	private static final String SET_PASSWORD = "/api/me/password";
	private static final String REQUEST_VERIFICATION = "/api/me/verify-email/request";
	private static final String CUSTOMER_EMAIL = "alice@example.com";
	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7);
	private static final String NEW_PASSWORD_BODY = """
			{"newPassword": "a-strong-new-pass1"}""";

	@Autowired
	MockMvc mvc;

	/** Replaces the {@link WebSliceStubs} instance so "the controller never ran" is observable. */
	@MockitoBean
	CustomerRecovery recovery;

	/** Replaces the inert stub so {@link CurrentCustomer} can resolve a real customer principal. */
	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	@Test
	void operatorPostToSetPasswordIsRejectedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(isolated(post(SET_PASSWORD)).with(user("op").roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON).content(NEW_PASSWORD_BODY))
				.andExpect(status().isForbidden())
				.andReturn();

		assertNeverDispatched(result);
		verify(recovery, never()).setPassword(any(), any());
	}

	@Test
	void operatorPostToRequestVerificationIsRejectedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(isolated(post(REQUEST_VERIFICATION)).with(user("op").roles("OPERATOR")))
				.andExpect(status().isForbidden())
				.andReturn();

		assertNeverDispatched(result);
		verify(recovery, never()).sendVerificationEmail(any(), any());
	}

	@Test
	void anonymousPostsAreUnauthorizedBeforeTheController() throws Exception {
		assertNeverDispatched(mvc.perform(isolated(post(REQUEST_VERIFICATION)))
				.andExpect(status().isUnauthorized())
				.andReturn());

		verify(recovery, never()).sendVerificationEmail(any(), any());
	}

	/**
	 * The positive control for the two tests above, and the AC-4 guarantee that a genuine customer sees
	 * no change: the identical request under a {@code CUSTOMER} principal <em>does</em> resolve a
	 * handler and reach the application.
	 */
	@Test
	void customerRequestDoesReachTheController() throws Exception {
		when(directory.accountFor(CUSTOMER_EMAIL)).thenReturn(Optional.of(ACCOUNT));

		MvcResult result = mvc.perform(isolated(post(REQUEST_VERIFICATION))
						.with(user(CUSTOMER_EMAIL).roles("CUSTOMER")))
				.andExpect(status().isOk())
				.andReturn();

		assertThat(result.getHandler())
				.as("a CUSTOMER request must still be dispatched — otherwise the assertion above is vacuous")
				.isNotNull();
		verify(recovery).sendVerificationEmail(ACCOUNT, CUSTOMER_EMAIL);
	}

	@Test
	void customerCanStillSetItsPassword() throws Exception {
		when(directory.accountFor(CUSTOMER_EMAIL)).thenReturn(Optional.of(ACCOUNT));

		mvc.perform(isolated(post(SET_PASSWORD)).with(user(CUSTOMER_EMAIL).roles("CUSTOMER"))
						.contentType(MediaType.APPLICATION_JSON).content(NEW_PASSWORD_BODY))
				.andExpect(status().isNoContent());

		verify(recovery).setPassword(eq(ACCOUNT), any());
	}

	/** CSRF token + a unique rate-bucket client IP — the two things every request in this class needs. */
	private static MockHttpServletRequestBuilder isolated(MockHttpServletRequestBuilder request) {
		return request.with(csrf()).header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
	}

	private static void assertNeverDispatched(MvcResult result) {
		assertThat(result.getHandler())
				.as("the rejection must come from the security filter chain — a non-null handler means "
						+ "the request reached the controller and CurrentCustomer produced the 403 instead")
				.isNull();
	}
}
