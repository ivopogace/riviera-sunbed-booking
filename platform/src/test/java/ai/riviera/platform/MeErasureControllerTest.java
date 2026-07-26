package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.customer.api.AccountErasure;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.EraseOutcome;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for self-service erasure ({@code POST /api/me/erasure}, #101 [D5]) through the real filter
 * chain — the things a unit test of the controller cannot prove:
 *
 * <ol>
 * <li><strong>The CUSTOMER role gate holds for a POST</strong> (R-1): an operator session is {@code 403}
 * and an anonymous request {@code 401} — neither reaches the scrub. The gate is now the method-agnostic
 * {@code /api/me/**} matcher (#317), which replaced this endpoint's dedicated one; that it still holds
 * here is the regression proof that collapsing the rules lost no coverage. Which <em>layer</em> emits
 * the {@code 403} is {@code MeSurfaceRoleGateTest}'s job — the status alone cannot tell.</li>
 * <li><strong>The happy path</strong> (AC-3): a signed-in CUSTOMER gets {@code 204}, the scrub runs for the
 * session's resolved account, and every session for the principal is revoked.</li>
 * <li><strong>The revoke brackets the scrub</strong> (#357, AC-11): it runs before <em>and</em> after, and a
 * failed revoke leaves the account unscrubbed.</li>
 * </ol>
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}). Docker-free. The real-schema
 * scrub behaviour is {@code AccountErasureIT}'s job.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class MeErasureControllerTest {

	private static final String ERASURE = "/api/me/erasure";
	private static final String EMAIL = "alice@example.com";
	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7);

	@Autowired
	MockMvc mvc;

	@MockitoBean
	AccountErasure erasure;

	/** Replaces the inert stub so {@link CurrentCustomer} resolves the principal to an account. */
	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	@Test
	void signedInCustomerErasesOwnAccountAndAllSessionsAreRevoked() throws Exception {
		givenTheAccountCanBeErased();

		mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isNoContent());

		verify(erasure).eraseAccount(ACCOUNT);
		verify(sessionRevoker, times(2)).revokeAll(EMAIL);
	}

	/**
	 * #357: the revoke must run <strong>before</strong> the scrub. Ordered the other way (as this shipped),
	 * a transient failure in the revoke — a connection reset, a Neon failover — is raised after the PII has
	 * already been scrubbed, so the tourist is told the erasure failed while their sessions stay alive on an
	 * erased account, and no retry can put either back.
	 */
	@Test
	void revokesSessionsBeforeScrubbingTheAccount() throws Exception {
		givenTheAccountCanBeErased();

		mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, erasure);
		effects.verify(sessionRevoker).revokeAll(EMAIL);
		effects.verify(erasure).eraseAccount(ACCOUNT);
	}

	/**
	 * The other half of the bracket (#357 D-1): revoking first would, on its own, open a window in which the
	 * credential still works — a sign-in landing there would produce a session that outlives the erasure. The
	 * trailing revoke this endpoint already had closes it, so it is kept rather than moved.
	 */
	@Test
	void revokesAgainAfterTheScrub() throws Exception {
		givenTheAccountCanBeErased();

		mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf()))
				.andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, erasure, sessionRevoker);
		effects.verify(sessionRevoker).revokeAll(EMAIL);
		effects.verify(erasure).eraseAccount(ACCOUNT);
		effects.verify(sessionRevoker).revokeAll(EMAIL);
	}

	/** The failure direction the ordering buys: a revoke that fails must leave the account unscrubbed. */
	@Test
	void aFailedRevokeNeverScrubsTheAccount() {
		when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT));
		doThrow(new DataAccessResourceFailureException("connection reset"))
				.when(sessionRevoker).revokeAll(anyString());

		assertThatThrownBy(() -> mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf())))
				.hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

		verify(erasure, never()).eraseAccount(any());
	}

	@Test
	void operatorSessionIsForbiddenAndNothingIsErased() throws Exception {
		mvc.perform(post(ERASURE).with(user("op").roles("OPERATOR")).with(csrf()))
				.andExpect(status().isForbidden());

		verify(erasure, never()).eraseAccount(any());
		verify(sessionRevoker, never()).revokeAll(any());
	}

	@Test
	void anonymousIsUnauthorizedAndNothingIsErased() throws Exception {
		mvc.perform(post(ERASURE).with(csrf()))
				.andExpect(status().isUnauthorized());

		verify(erasure, never()).eraseAccount(any());
	}

	private void givenTheAccountCanBeErased() {
		when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT));
		when(erasure.eraseAccount(ACCOUNT)).thenReturn(EraseOutcome.ERASED);
	}
}
