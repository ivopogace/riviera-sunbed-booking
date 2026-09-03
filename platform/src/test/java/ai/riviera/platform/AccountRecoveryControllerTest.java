package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.ResetPasswordOutcome;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The password-reset endpoint's <strong>effect ordering</strong> — {@code POST
 * /api/auth/customer/reset-password}. The token lifecycle itself (single-use, expiry, the uniform
 * rejection) is pinned against real Postgres by {@code PasswordResetIT} and
 * {@code CustomerAccountRecoveryIT}; what those cannot show cheaply is the order of the two
 * non-atomic effects, and what happens when one of them fails.
 *
 * <p>Before this slice the account's email was known only from {@code ResetPasswordOutcome.Reset} —
 * i.e. after the single-use token had been redeemed and the new password written — so the revoke could
 * only run afterwards. A transient failure there returned {@code 500} with the password already
 * changed, and the customer's retry of the emailed link drew {@code 400 INVALID_OR_EXPIRED_TOKEN}
 * while the attacker's session stayed live. That is the worst place to have it: this flow is most
 * often running <em>because</em> an account is already compromised.
 *
 * <p>Lives in the root test package because the web slice imports the package-private edge config
 * ({@code SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs}). Docker-free. Every request
 * carries a unique {@code X-Forwarded-For}: this path rides the recovery per-IP budget, so without it
 * the class would pass alone and {@code 429} inside the full suite.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AccountRecoveryControllerTest {

	private static final String RESET = "/api/auth/customer/reset-password";
	private static final String RAW_TOKEN = "bH9k2Qm4Xr7pLs1v";
	private static final String EMAIL = "alice@example.com";
	private static final String NEW_PASSWORD = "rotated-pass2";
	private static final CustomerAccountId ACCOUNT = new CustomerAccountId(7);

	@Autowired
	MockMvc mvc;

	/** Replaces the inert {@code WebSliceStubs} bean — the edge orchestrator that hashes the raw token. */
	@MockitoBean
	CustomerRecovery recovery;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	/**
	 * The revoke must run <strong>before</strong> the token is consumed and the password written,
	 * which is only possible because the account can now be named without consuming the token.
	 */
	@Test
	void revokesTheAccountsSessionsBeforeConsumingTheToken() throws Exception {
		givenARedeemableToken();

		mvc.perform(reset(RAW_TOKEN, NEW_PASSWORD)).andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, recovery);
		effects.verify(sessionRevoker).revokeAll(EMAIL);
		effects.verify(recovery).resetPassword(eq(RAW_TOKEN), anyString());
	}

	/**
	 * The other half of the bracket (D-1): revoking only first would open a window in which the OLD
	 * password still works — precisely the credential an attacker holds in the flow this endpoint exists
	 * to recover from. The trailing revoke this endpoint already had closes it, so it is kept, not moved.
	 */
	@Test
	void revokesAgainAfterTheResetSoAWindowSessionCannotSurvive() throws Exception {
		givenARedeemableToken();

		mvc.perform(reset(RAW_TOKEN, NEW_PASSWORD)).andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, recovery, sessionRevoker);
		effects.verify(sessionRevoker).revokeAll(EMAIL);
		effects.verify(recovery).resetPassword(eq(RAW_TOKEN), anyString());
		effects.verify(sessionRevoker).revokeAll(EMAIL);
		verify(sessionRevoker, times(2)).revokeAll(EMAIL);
	}

	/**
	 * The failure direction the ordering buys: a revoke that fails must leave the token unredeemed, so
	 * the customer's retry of the same emailed link still works instead of being rejected as expired.
	 */
	@Test
	void aFailedRevokeNeverConsumesTheToken() {
		givenARedeemableToken();
		doThrow(new DataAccessResourceFailureException("connection reset"))
				.when(sessionRevoker).revokeAll(anyString());

		assertThatThrownBy(() -> mvc.perform(reset(RAW_TOKEN, NEW_PASSWORD)))
				.hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

		verify(recovery, never()).resetPassword(anyString(), anyString());
	}

	/**
	 * An unknown, expired, or already-consumed token names no account, so there is nothing to revoke —
	 * and the response stays the one generic rejection every bad token gets (non-enumeration, D-8). The
	 * pre-read repeats the redemption predicate exactly, so it can never disagree with the write.
	 */
	@Test
	void anInvalidTokenRevokesNothingAndKeepsTheGenericRejection() throws Exception {
		when(recovery.emailForResetToken(RAW_TOKEN)).thenReturn(Optional.empty());
		when(recovery.resetPassword(eq(RAW_TOKEN), anyString()))
				.thenReturn(new ResetPasswordOutcome.InvalidOrExpired());

		mvc.perform(reset(RAW_TOKEN, NEW_PASSWORD))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));

		verify(sessionRevoker, never()).revokeAll(anyString());
	}

	/**
	 * The blocklist needs the account's name, so it reads the token — without consuming it — and still
	 * revokes nothing and writes nothing.
	 */
	@Test
	void aBlockedPasswordNamesTheAccountButRevokesNothing() throws Exception {
		givenARedeemableToken();

		mvc.perform(reset(RAW_TOKEN, "Alice-2026-pw!!"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_CONTAINS_BLOCKED_TERM"));

		verify(sessionRevoker, never()).revokeAll(anyString());
		verify(recovery, never()).resetPassword(anyString(), anyString());
	}

	/** The password policy still runs first: a weak password revokes nothing and reads no token. */
	@Test
	void aWeakPasswordIsRejectedBeforeAnyRevoke() throws Exception {
		mvc.perform(reset(RAW_TOKEN, "elevenchars"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(sessionRevoker, never()).revokeAll(anyString());
		verify(recovery, never()).emailForResetToken(anyString());
		verify(recovery, never()).resetPassword(anyString(), anyString());
	}

	private void givenARedeemableToken() {
		when(recovery.emailForResetToken(RAW_TOKEN)).thenReturn(Optional.of(EMAIL));
		when(recovery.resetPassword(eq(RAW_TOKEN), anyString()))
				.thenReturn(new ResetPasswordOutcome.Reset(ACCOUNT, EMAIL));
	}

	/** CSRF token + a unique recovery-budget client IP — the two things every request here needs. */
	private static MockHttpServletRequestBuilder reset(String token, String newPassword) {
		return post(RESET).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"token": "%s", "newPassword": "%s"}""".formatted(token, newPassword));
	}
}
