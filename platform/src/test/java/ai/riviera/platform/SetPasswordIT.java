package ai.riviera.platform;

import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S8 (#113, AC-5) authenticated set-password — closes the S4 F-1 gap. An SSO-only (password-less)
 * account sets its first password from within its own session (its SSO email is provider-verified), then
 * can password-login. An account that already has a password must supply the correct current one; a
 * missing/wrong current password is {@code 400 INVALID_CURRENT_PASSWORD}, and the stored password is
 * unchanged. The signed-in principal is faked with {@code user(email).roles("CUSTOMER")} so the SSO-only
 * case (which cannot password-login) can still be driven; {@code CurrentCustomer} resolves it to the real
 * DB account by email. Never a register-time UPSERT.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SetPasswordIT {

	private static final String SET_PASSWORD_PATH = "/api/me/password";
	private static final String LOGIN_PATH = "/api/auth/customer/login";
	private static final String ME_PATH = "/api/auth/me";

	@Autowired
	MockMvc mvc;
	@Autowired
	SsoAccountProvisioning sso;
	@Autowired
	FindByIndexNameSessionRepository<? extends Session> sessions;

	// No DB cleanup: unique emails against a fresh Testcontainers DB (deleting accounts would trip the
	// customer_sso_identity FK), the SsoAccountProvisioningIT pattern.

	@Test
	void ssoOnlyAccountSetsFirstPasswordThenCanLogin() throws Exception {
		String email = "setpw-it-sso@example.com";
		sso.resolveOrCreate(SsoProvider.GOOGLE, "setpw-it-sub", email);
		login(email, "before-any-password").andExpect(status().isUnauthorized()); // no local password yet

		setPassword(email, """
				{"newPassword": "brandnewpass1"}""") // no current password required for an SSO-only account
				.andExpect(status().isNoContent());

		login(email, "brandnewpass1").andExpect(status().isOk()); // first password set — F-1 closed
	}

	@Test
	void existingPasswordAccountRequiresTheCorrectCurrentPassword() throws Exception {
		String email = "setpw-it-pw@example.com";
		register(email, "originalpass1");

		setPassword(email, """
				{"newPassword": "changedpass2", "currentPassword": "the-wrong-one"}""")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
		setPassword(email, """
				{"newPassword": "changedpass2"}""") // missing current password on an account that has one
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_CURRENT_PASSWORD"));
		login(email, "originalpass1").andExpect(status().isOk()); // unchanged

		setPassword(email, """
				{"newPassword": "changedpass2", "currentPassword": "originalpass1"}""")
				.andExpect(status().isNoContent());
		login(email, "originalpass1").andExpect(status().isUnauthorized()); // old gone
		login(email, "changedpass2").andExpect(status().isOk());             // new works
	}

	private ResultActions setPassword(String email, String jsonBody) throws Exception {
		return mvc.perform(post(SET_PASSWORD_PATH).with(user(email).roles("CUSTOMER")).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonBody));
	}

	/**
	 * #128 generalization: changing your password must not leave your OTHER sessions alive — the same
	 * bug class the issue names for operator suspend, found by the Phase-1 generalization audit. The
	 * session doing the change survives (signing you out of the device you are actively using is bad
	 * UX and is not what the OWASP guidance asks for); every other session of that principal dies.
	 *
	 * <p>Since #344 "survives" is asserted through the <strong>re-issued</strong> cookie: the calling
	 * session is rotated, so it lives on under a new id. A browser applies the replacement
	 * {@code Set-Cookie} silently; MockMvc must carry it forward by hand. That the pre-change value is
	 * dead is {@link #theSurvivingSessionIsRotatedSoTheOldCookieValueDies}'s assertion, not this one's.
	 */
	@Test
	void changingThePasswordRevokesEveryOtherSessionButKeepsTheCurrentOne() throws Exception {
		String email = "setpw-it-revoke@example.com";
		register(email, "originalpass1");

		Cookie otherDevice = sessionFrom(login(email, "originalpass1").andExpect(status().isOk()));
		Cookie thisDevice = sessionFrom(login(email, "originalpass1").andExpect(status().isOk()));
		mvc.perform(get(ME_PATH).cookie(otherDevice)).andExpect(status().isOk());

		Cookie thisDeviceReissued = mvc.perform(post(SET_PASSWORD_PATH).cookie(thisDevice).with(csrf())
				// #326 put this path on its own per-IP budget; without a unique key this call would share
				// the loopback bucket with the rest of a cached-context full-suite run (the #127 class).
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"newPassword": "rotatedpass2", "currentPassword": "originalpass1"}"""))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		mvc.perform(get(ME_PATH).cookie(otherDevice)).andExpect(status().isUnauthorized());
		assertNotNull(thisDeviceReissued, "the calling session must be re-issued, not dropped");
		mvc.perform(get(ME_PATH).cookie(thisDeviceReissued)).andExpect(status().isOk());
	}

	/**
	 * AC-2 for #344 — the customer twin of {@code OperatorPasswordChangeIT}'s rotation proof: the calling
	 * session stays signed in but under a new id, so a stolen copy of the cookie that made the change dies
	 * with the credential it was proving. Only reachable end-to-end: the rotation is persisted to
	 * {@code SPRING_SESSION} and re-issued as a cookie by the real {@code SessionRepositoryFilter}.
	 */
	@Test
	void theSurvivingSessionIsRotatedSoTheOldCookieValueDies() throws Exception {
		String email = "setpw-it-rotate@example.com";
		register(email, "originalpass1");
		Cookie beforeTheChange = sessionFrom(login(email, "originalpass1").andExpect(status().isOk()));

		Cookie afterTheChange = mvc.perform(post(SET_PASSWORD_PATH).cookie(beforeTheChange).with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"newPassword": "rotatedpass3", "currentPassword": "originalpass1"}"""))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		assertNotNull(afterTheChange, "the change must hand back the rotated SESSION cookie");
		assertNotEquals(beforeTheChange.getValue(), afterTheChange.getValue());
		mvc.perform(get(ME_PATH).cookie(beforeTheChange)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(afterTheChange)).andExpect(status().isOk());
	}

	/**
	 * AC-3 for #359 — the customer twin of {@code OperatorPasswordChangeIT}'s concurrent-save proof, kept
	 * so the two password endpoints do not drift. A second request on the same session (a background poll,
	 * a second tab) loads it before the change commits and saves it after; Spring Session's save writes
	 * that request's in-memory id, which before this slice put the retired id back on the row.
	 *
	 * <p>Rides the <strong>register</strong> auto-sign-in session rather than a separate login, so this
	 * unique email has exactly one live session for the principal-index read to return.
	 */
	@Test
	void aConcurrentSaveOnTheOldSessionCannotResurrectItsId() throws Exception {
		assertConcurrentSaveCannotResurrect(sessions);
	}

	/**
	 * Generic so the package-private {@code JdbcSession} type is only ever inferred, never named: the
	 * repository's element type is not visible outside {@code org.springframework.session.jdbc}.
	 */
	private <S extends Session> void assertConcurrentSaveCannotResurrect(
			FindByIndexNameSessionRepository<S> repository) throws Exception {
		String email = "setpw-it-concurrent@example.com";
		Cookie beforeTheChange = sessionFrom(register(email, "originalpass1"));
		S concurrentRequest = repository.findById(onlySessionIdOf(repository, email));
		assertNotNull(concurrentRequest, "the concurrent request must have loaded the pre-change session");

		Cookie afterTheChange = mvc.perform(post(SET_PASSWORD_PATH).cookie(beforeTheChange).with(csrf())
						.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"newPassword": "rotatedpass4", "currentPassword": "originalpass1"}"""))
				.andExpect(status().isNoContent())
				.andReturn().getResponse().getCookie("SESSION");

		// The overlapping request now completes, and its deferred save lands with the id it loaded.
		concurrentRequest.setLastAccessedTime(Instant.now());
		repository.save(concurrentRequest);

		assertNotNull(afterTheChange, "the change must hand back the rotated SESSION cookie");
		mvc.perform(get(ME_PATH).cookie(beforeTheChange)).andExpect(status().isUnauthorized());
		mvc.perform(get(ME_PATH).cookie(afterTheChange)).andExpect(status().isOk());
	}

	/** Read from the principal index, not the cookie — {@code DefaultCookieSerializer} base64-encodes it. */
	private static <S extends Session> String onlySessionIdOf(
			FindByIndexNameSessionRepository<S> repository, String principal) {
		Set<String> ids = repository.findByPrincipalName(principal).keySet();
		assertEquals(1, ids.size(), "the test expects exactly one live session for " + principal);
		return ids.iterator().next();
	}

	private static Cookie sessionFrom(ResultActions result) {
		Cookie session = result.andReturn().getResponse().getCookie("SESSION");
		if (session == null) {
			throw new IllegalStateException("expected a SESSION cookie on a successful login");
		}
		return session;
	}

	/** Returns the result so a caller can take the auto-sign-in session (S2) instead of logging in again. */
	private ResultActions register(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)))
				.andExpect(status().isCreated());
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)));
	}
}
