package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The customer twin of {@link OperatorAccountControllerTest}, for {@code POST /api/me/password} — a new
 * test, since no web slice pinned this endpoint's revoke/write <em>ordering</em> before it.
 * {@code MeSurfaceRoleGateTest} is a {@code @WebMvcTest} that POSTs here, but only to prove the role gate;
 * the ordering had nowhere cheap to live, so the two twins could drift without anything failing.
 *
 * <p>Scope is deliberately narrow — the ordering and session-rotation contract only. The
 * password-policy, SSO-only-account (S4 F-1) and role-gate behaviours are already pinned by
 * {@code SetPasswordIT} and {@code MeSurfaceRoleGateTest} and are not restated here.
 *
 * <p>Every request carries a unique {@code X-Forwarded-For} (rate-bucket isolation) — the change path
 * shares a per-IP budget across the cached context of a full-suite run.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class MyAccountControllerTest {

	private static final String SET_PASSWORD = "/api/me/password";
	private static final String REQUEST_VERIFICATION = "/api/me/verify-email/request";
	private static final String EMAIL = "tourist@example.com";
	private static final CustomerAccountId ACCOUNT_ID = new CustomerAccountId(7L);
	private static final String CURRENT_PASSWORD = "current-pass1";
	private static final String NEW_PASSWORD = "rotated-pass2";

	@Autowired
	MockMvc mvc;

	@Autowired
	PasswordEncoder passwordEncoder;

	/** Replaces the inert stub so {@link CurrentCustomer} resolves the principal to an account. */
	@MockitoBean
	CustomerAccountDirectory directory;

	@MockitoBean
	CustomerAccounts accounts;

	@MockitoBean
	CustomerRecovery recovery;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	/**
	 * AC-5: revoke-before-write, so a failing credential write can never leave the customer's password
	 * rotated while the response says it was not — the state that makes the natural retry fail.
	 */
	@Test
	void revokesOtherSessionsBeforeWritingTheNewCredential() throws Exception {
		givenAccountWithPassword();

		mvc.perform(changePassword(CURRENT_PASSWORD, NEW_PASSWORD)).andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, recovery);
		effects.verify(sessionRevoker).revokeAllExcept(eq(EMAIL), any());
		effects.verify(recovery).setPassword(eq(ACCOUNT_ID), anyString());
	}

	@Test
	void aFailedRevokeNeverRotatesTheCredential() {
		givenAccountWithPassword();
		doThrow(new DataAccessResourceFailureException("connection reset"))
				.when(sessionRevoker).revokeAllExcept(anyString(), any());

		assertThatThrownBy(() -> mvc.perform(changePassword(CURRENT_PASSWORD, NEW_PASSWORD)))
				.hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

		verify(recovery, never()).setPassword(any(), anyString());
	}

	/**
	 * AC-2's mock-level half: the surviving session is rotated, and the revoke kept the PRE-rotation id.
	 *
	 * <p>Asserted on the <em>request's</em> session rather than the handle passed in: the rotation
	 * retires the old session outright and puts a fresh one in its place, instead of renaming it where a
	 * concurrent request could write the old id back. Twin of
	 * {@code OperatorAccountControllerTest.rotatesTheSurvivingSessionIdAfterKeepingItThroughTheRevoke}.
	 */
	@Test
	void rotatesTheSurvivingSessionIdAfterKeepingItThroughTheRevoke() throws Exception {
		givenAccountWithPassword();
		MockHttpSession thisSession = new MockHttpSession();
		String idBeforeTheChange = thisSession.getId();

		MvcResult result = mvc.perform(changePassword(CURRENT_PASSWORD, NEW_PASSWORD).session(thisSession))
				.andExpect(status().isNoContent())
				.andReturn();

		verify(sessionRevoker).revokeAllExcept(EMAIL, idBeforeTheChange);
		assertThat(thisSession.isInvalid()).isTrue();
		assertThat(result.getRequest().getSession(false).getId()).isNotEqualTo(idBeforeTheChange);
	}

	@Test
	void aRejectedChangeLeavesTheSessionIdUntouched() throws Exception {
		givenAccountWithPassword();
		MockHttpSession thisSession = new MockHttpSession();
		String idBeforeTheChange = thisSession.getId();

		mvc.perform(changePassword("not-the-current-one", NEW_PASSWORD).session(thisSession))
				.andExpect(status().isBadRequest());

		assertThat(thisSession.getId()).isEqualTo(idBeforeTheChange);
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * AC-1/AC-2: the resend answers {@code 200} carrying whether the mail was withheld, so the
	 * account page can stop claiming one was sent when the suppression list silently withheld it. The
	 * disclosure is safe on <em>this</em> endpoint alone — it is {@code ROLE_CUSTOMER}-gated and answers
	 * about the caller's own session principal, never a supplied address, so there is no account to
	 * enumerate (the anonymous {@code forgot-password} copy stays hedged, D-8).
	 */
	@Test
	void reportsAWithheldVerificationMailForASuppressedAddress() throws Exception {
		when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT_ID));
		when(recovery.isVerificationMailWithheld(EMAIL)).thenReturn(true);

		mvc.perform(requestVerification())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emailWithheld").value(true));
		verify(recovery).sendVerificationEmail(ACCOUNT_ID, EMAIL);
	}

	@Test
	void reportsADeliverableVerificationMail() throws Exception {
		when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT_ID));
		when(recovery.isVerificationMailWithheld(EMAIL)).thenReturn(false);

		mvc.perform(requestVerification())
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emailWithheld").value(false));
		// false is Mockito's default, so without this the case would pass against a hardcoded literal.
		verify(recovery).isVerificationMailWithheld(EMAIL);
	}

	private void givenAccountWithPassword() {
		when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT_ID));
		when(accounts.findByEmail(EMAIL)).thenReturn(Optional.of(
				new CustomerAccountCredential(EMAIL, passwordEncoder.encode(CURRENT_PASSWORD))));
	}

	private static MockHttpServletRequestBuilder requestVerification() {
		return post(REQUEST_VERIFICATION).with(csrf()).with(user(EMAIL).roles("CUSTOMER"))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
	}

	private static MockHttpServletRequestBuilder changePassword(String current, String next) {
		return post(SET_PASSWORD).with(csrf()).with(user(EMAIL).roles("CUSTOMER"))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"currentPassword": "%s", "newPassword": "%s"}""".formatted(current, next));
	}
}
