package ai.riviera.platform;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Operator self-service password change (#326) — {@code POST /api/auth/operator/password}.
 *
 * <p><strong>Why not under {@code /api/me/**}</strong> (which the issue proposed): since #317 that
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
 * Every request carries a unique {@code X-Forwarded-For} (#127 rate-bucket isolation).
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

		mvc.perform(isolated(post(CHANGE_PASSWORD)).session(thisSession)
						.with(user(OPERATOR_USERNAME).roles("OPERATOR"))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(CURRENT_PASSWORD, NEW_PASSWORD)))
				.andExpect(status().isNoContent());

		verify(provisioning).setPassword(eq(OPERATOR_USERNAME), anyString());
		verify(sessionRevoker).revokeAllExcept(OPERATOR_USERNAME, thisSession.getId());
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
	 * R-8 defence-in-depth: a suspended operator has no live session to reach this with (#128 revokes them
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
