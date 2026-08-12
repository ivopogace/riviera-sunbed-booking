package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;

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
 * Operator self-service password change — {@code POST /api/auth/operator/password}.
 *
 * <p><strong>Why not under {@code /api/me/**}</strong> (which the issue proposed): that
 * namespace is a method-agnostic {@code hasRole(CUSTOMER)} rule, and {@code SecurityConfig} states that
 * adding a non-customer endpoint under it makes the rule wrong. The endpoint therefore joins the other
 * two operator-credential surfaces under {@code /api/auth/operator/**} with its own {@code OPERATOR} matcher.
 *
 * <p>The stored hash is produced by the <strong>real</strong> delegating {@link PasswordEncoder} from
 * {@code SecurityConfig}, not a literal: that is what makes {@link #rejectsWrongCurrentPasswordWithoutRevoking}
 * able to catch the defect this slice's risk register calls R-1 — verifying the current password by
 * re-encoding it and comparing hashes instead of {@code matches(raw, storedHash)}. bcrypt re-salts, so a
 * hash-vs-hash comparison never matches and every correct password would be rejected.
 *
 * <p>The filter-layer assertions use {@link MvcResult#getHandler()} rather than the status alone, for the
 * reason {@code MeSurfaceRoleGateTest} documents: a {@code 403} from inside the filter chain and one from a
 * controller-level check are byte-identical, so only "was a handler ever selected" tells the layers apart.
 * Every request carries a unique {@code X-Forwarded-For} (rate-bucket isolation).
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class OperatorAccountControllerTest {

	private static final String CHANGE_PASSWORD = "/api/auth/operator/password";
	private static final String OPERATOR_USERNAME = "adriatica";
	/** Matches {@code riviera.operator.username}'s default — the env-managed bootstrap admin (AC-4). */
	private static final String BOOTSTRAP_USERNAME = "operator";
	private static final String CURRENT_PASSWORD = "current-pass1";
	private static final String NEW_PASSWORD = "rotated-pass2";

	/**
	 * Shared with the customer twin at {@code POST /api/me/password}; that the two stay equal is
	 * {@code CurrentPasswordDetailTwinTest}'s job, not this literal's.
	 */
	private static final String NO_CURRENT_PASSWORD_DETAIL = "The request carries no current password.";

	@Autowired
	MockMvc mvc;

	@Autowired
	PasswordEncoder passwordEncoder;

	@MockitoBean
	OperatorAccounts accounts;

	@MockitoBean
	OperatorProvisioning provisioning;

	@MockitoBean
	PrincipalSessionRevoker sessionRevoker;

	@Test
	void changesPasswordAndRevokesOnlyOtherSessions() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);
		MockHttpSession thisSession = new MockHttpSession();
		String callingSessionId = thisSession.getId();

		mvc.perform(isolated(post(CHANGE_PASSWORD)).session(thisSession)
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isNoContent());

		verify(provisioning).setPassword(eq(OPERATOR_USERNAME), anyString());
		verify(sessionRevoker).revokeAllExcept(OPERATOR_USERNAME, callingSessionId);
	}

	/**
	 * The revoke must run <strong>before</strong> the credential write. Ordered the other way,
	 * a transient failure in the revoke — a connection reset, a Neon failover — is
	 * raised <em>after</em> the hash has already rotated, so the operator is told the change did not happen,
	 * retries with what they believe is their current password, and is met with
	 * {@code INVALID_CURRENT_PASSWORD}. Meanwhile the other device's session, the whole point of the call,
	 * is still alive. Revoke-first leaves only failure states the operator's natural retry recovers from.
	 */
	@Test
	void revokesOtherSessionsBeforeWritingTheNewCredential() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isNoContent());

		InOrder effects = inOrder(sessionRevoker, provisioning);
		effects.verify(sessionRevoker).revokeAllExcept(eq(OPERATOR_USERNAME), any());
		effects.verify(provisioning).setPassword(eq(OPERATOR_USERNAME), anyString());
	}

	/** The other half of the ordering guarantee: a revoke that fails must not rotate the credential. */
	@Test
	void aFailedRevokeNeverRotatesTheCredential() {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);
		doThrow(new DataAccessResourceFailureException("connection reset"))
				.when(sessionRevoker).revokeAllExcept(anyString(), any());

		assertThatThrownBy(() -> mvc.perform(isolated(post(CHANGE_PASSWORD))
				.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
				.contentType(MediaType.APPLICATION_JSON)
				.content(body(CURRENT_PASSWORD, NEW_PASSWORD))))
				.hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

		verify(provisioning, never()).setPassword(anyString(), anyString());
	}

	/**
	 * The surviving session gets a <strong>new id</strong>, so the cookie value that made the
	 * change dies with the credential it was proving. Without this, an exfiltrated cookie names the very
	 * session the change deliberately spares and keeps full operator authority afterwards.
	 *
	 * <p>The captured keep-id pins the ordering constraint that makes this safe (that slice's own R-1 —
	 * not the R-1 this class's header names, the current-password hash-vs-hash defect): the revoke must be
	 * handed the <strong>pre-rotation</strong> id, the only one its own {@code findByPrincipalName} query
	 * can see. Rotating first would hand it an id no {@code SPRING_SESSION} row carries — the rotation
	 * deletes the caller's row and the replacement is not persisted until the filter commits — leaving the
	 * keep-contract vacuous rather than merely mis-targeted.
	 *
	 * <p>Asserted on the <em>request's</em> session rather than the handle passed in, because the
	 * rotation retires that handle instead of renaming it in place: the old session is invalidated outright
	 * and a fresh one takes its place, which is what stops a concurrent save from resurrecting the old id.
	 */
	@Test
	void rotatesTheSurvivingSessionIdAfterKeepingItThroughTheRevoke() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);
		MockHttpSession thisSession = new MockHttpSession();
		String idBeforeTheChange = thisSession.getId();

		MvcResult result = mvc.perform(isolated(post(CHANGE_PASSWORD)).session(thisSession)
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isNoContent())
				.andReturn();

		ArgumentCaptor<String> keptSessionId = ArgumentCaptor.forClass(String.class);
		verify(sessionRevoker).revokeAllExcept(eq(OPERATOR_USERNAME), keptSessionId.capture());
		assertThat(keptSessionId.getValue()).isEqualTo(idBeforeTheChange);
		assertThat(thisSession.isInvalid()).isTrue();
		assertThat(result.getRequest().getSession(false).getId()).isNotEqualTo(idBeforeTheChange);
	}

	/**
	 * A rejected change must not rotate the caller's session id — a dimension this slice added. That it also
	 * writes and revokes nothing is {@link #rejectsWrongCurrentPasswordWithoutRevoking}'s assertion.
	 */
	@Test
	void aRejectedChangeLeavesTheSessionIdUntouched() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);
		MockHttpSession thisSession = new MockHttpSession();
		String idBeforeTheChange = thisSession.getId();

		mvc.perform(isolated(post(CHANGE_PASSWORD)).session(thisSession)
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("not-the-current-one", NEW_PASSWORD)))
				.andExpect(status().isBadRequest());

		assertThat(thisSession.getId()).isEqualTo(idBeforeTheChange);
	}

	/** The new hash must verify against the new raw password — i.e. the edge encoded, not stored plaintext. */
	@Test
	void storesAnEncodedHashOfTheNewPassword() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isNoContent());

		ArgumentCaptor<String> storedHash = ArgumentCaptor.forClass(String.class);
		verify(provisioning).setPassword(eq(OPERATOR_USERNAME), storedHash.capture());
		assertThat(storedHash.getValue()).isNotEqualTo(NEW_PASSWORD);
		assertThat(passwordEncoder.matches(NEW_PASSWORD, storedHash.getValue())).isTrue();
	}

	@Test
	void rejectsWrongCurrentPasswordWithoutRevoking() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("not-the-current-one", NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	@Test
	void rejectsWeakNewPassword() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, "short")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * An omitted current password is its own fault, not a new-password policy violation. Until this
	 * slice the record's compact constructor threw {@link IllegalArgumentException} for it and the global
	 * advice funnelled that into the same {@code INVALID_REQUEST} {@link #rejectsWeakNewPassword} produces —
	 * so a caller whose new password was perfectly good was told to choose one of 8–72 characters. Both
	 * shapes are covered: the field absent from the body, and present but empty.
	 */
	@Test
	void reportsAnOmittedCurrentPasswordDistinctly() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"newPassword": "%s"}""".formatted(NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"))
				.andExpect(jsonPath("$.detail").value(NO_CURRENT_PASSWORD_DETAIL));

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("", NEW_PASSWORD)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"))
				.andExpect(jsonPath("$.detail").value(NO_CURRENT_PASSWORD_DETAIL));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * With both fields wrong the missing one wins — the order {@code operator-password.ts} validates in,
	 * and the order the compact constructor enforced before this slice. Pinned so a later reordering cannot
	 * silently revive the wrong-length answer for a caller who never filled the current-password field.
	 */
	@Test
	void anOmittedCurrentPasswordOutranksTheNewPasswordPolicy() throws Exception {
		givenStoredCredential(OPERATOR_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body("", "short")))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("MISSING_CURRENT_PASSWORD"))
				.andExpect(jsonPath("$.detail").value(NO_CURRENT_PASSWORD_DETAIL));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * AC-4 / R-3: the bootstrap admin's credential is env-managed. {@code OperatorCredentialInitializer}
	 * re-stamps {@code RIVIERA_OPERATOR_PASSWORD} on every boot and treats the difference as a genuine
	 * rotation, so a self-service change here would be silently reverted at the next deploy — and would
	 * revoke the admin's own session on the way. Refused rather than half-supported.
	 */
	@Test
	void refusesBootstrapAdminSelfService() throws Exception {
		givenStoredCredential(BOOTSTRAP_USERNAME, CURRENT_PASSWORD);

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(BOOTSTRAP_USERNAME).roles("OPERATOR", "ADMIN"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("BOOTSTRAP_CREDENTIAL_MANAGED"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	/**
	 * R-8 defence-in-depth: a suspended operator has no live session to reach this with (suspension revokes them
	 * and the pre-auth check bars re-login), but a suspend racing an in-flight request must not slip a
	 * credential change through.
	 */
	@Test
	void refusesAnAccountThatIsNotActive() throws Exception {
		when(accounts.findByUsername(OPERATOR_USERNAME)).thenReturn(Optional.of(new OperatorCredential(
				OPERATOR_USERNAME, passwordEncoder.encode(CURRENT_PASSWORD), false, false)));

		mvc.perform(isolated(post(CHANGE_PASSWORD)).with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("ACCOUNT_NOT_ACTIVE"));

		verify(provisioning, never()).setPassword(anyString(), anyString());
		verify(sessionRevoker, never()).revokeAllExcept(anyString(), any());
	}

	@Test
	void customerIsRejectedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(isolated(post(CHANGE_PASSWORD))
						.with(user("tourist@example.com").roles("CUSTOMER"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isForbidden())
				.andReturn();

		assertNeverDispatched(result);
		verify(provisioning, never()).setPassword(anyString(), anyString());
	}

	@Test
	void anonymousIsUnauthorizedBeforeTheController() throws Exception {
		MvcResult result = mvc.perform(isolated(post(CHANGE_PASSWORD))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isUnauthorized())
				.andReturn();

		assertNeverDispatched(result);
		verify(provisioning, never()).setPassword(anyString(), anyString());
	}

	private void givenStoredCredential(String username, String rawPassword) {
		when(accounts.findByUsername(username)).thenReturn(Optional.of(new OperatorCredential(
				username, passwordEncoder.encode(rawPassword), true, BOOTSTRAP_USERNAME.equals(username))));
	}

	private static String body(String currentPassword, String newPassword) {
		return """
				{"currentPassword": "%s", "newPassword": "%s"}""".formatted(currentPassword, newPassword);
	}

	/** CSRF token + a unique rate-bucket client IP — the two things every request in this class needs. */
	private static MockHttpServletRequestBuilder isolated(MockHttpServletRequestBuilder request) {
		return request.with(csrf()).header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp());
	}

	private static void assertNeverDispatched(MvcResult result) {
		assertThat(result.getHandler())
				.as("the rejection must come from the security filter chain — a non-null handler means the "
						+ "request reached the controller, so the SecurityConfig matcher is missing")
				.isNull();
	}
}
