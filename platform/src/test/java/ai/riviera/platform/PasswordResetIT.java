package ai.riviera.platform;

import java.net.URI;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;

import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

import jakarta.servlet.http.Cookie;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Password-reset journey end-to-end against real Postgres + the mock mailer:
 * <ul>
 *   <li><strong>AC-3:</strong> a reset rotates the password AND invalidates the account's existing
 *       sessions — the old session cookie is unauthenticated afterward, the old password stops working,
 *       the new one works.</li>
 *   <li><strong>AC-4 (non-enumeration):</strong> {@code forgot-password} returns the identical
 *       {@code 204} for a known, an unknown, and an SSO-only email.</li>
 *   <li><strong>AC-6:</strong> an SSO-only (password-less) account gains its first password via the
 *       reset flow, then can password-login (a second path that closes S4 F-1).</li>
 * </ul>
 * Each request carries a unique {@code X-Forwarded-For} (rate-bucket isolation).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class PasswordResetIT {

	private static final String LOGIN_PATH = "/api/auth/customer/login";
	private static final String FORGOT_PATH = "/api/auth/customer/forgot-password";
	private static final String RESET_PATH = "/api/auth/customer/reset-password";
	private static final String SESSION_COOKIE = "SESSION";

	@Autowired
	MockMvc mvc;
	@Autowired
	MockMailer mailer;
	@Autowired
	SsoAccountProvisioning sso;

	// No DB cleanup: each test uses unique emails against a fresh Testcontainers DB (the SsoAccountProvisioningIT
	// pattern) — deleting accounts would trip the customer_sso_identity FK. Only the shared mock outbox is reset.
	@BeforeEach
	void clearOutbox() {
		mailer.clear();
	}

	@Test
	void resetInvalidatesSessionsAndRotatesPassword() throws Exception {
		String email = "reset-it-alice@example.com";
		Cookie oldSession = register(email, "passphrase-123").getResponse().getCookie(SESSION_COOKIE);
		mvc.perform(get("/api/auth/me").cookie(oldSession)).andExpect(status().isOk());

		forgot(email).andExpect(status().isNoContent());
		String token = tokenFrom(mailer.lastTo(email).orElseThrow().link());
		reset(token, "newpassword456").andExpect(status().isNoContent());

		mvc.perform(get("/api/auth/me").cookie(oldSession))
				.andExpect(status().isUnauthorized()); // the pre-reset session was revoked (AC-3)
		login(email, "passphrase-123").andExpect(status().isUnauthorized());   // old password is dead
		login(email, "newpassword456").andExpect(status().isOk());           // new password works
	}

	/**
	 * The blocklist knows the account behind the token without consuming it, so a rejected password
	 * leaves the emailed link usable for the retry.
	 */
	@Test
	void rejectsAPasswordContainingTheAccountsEmailNameAndKeepsTheToken() throws Exception {
		String email = "reset-it-dana@example.com";
		register(email, "passphrase-123");
		forgot(email).andExpect(status().isNoContent());
		String token = tokenFrom(mailer.lastTo(email).orElseThrow().link());

		reset(token, "Reset-It-Dana-2026")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_CONTAINS_BLOCKED_TERM"));
		login(email, "passphrase-123").andExpect(status().isOk()); // nothing rotated

		reset(token, "newpassword456").andExpect(status().isNoContent()); // the token survived
		login(email, "newpassword456").andExpect(status().isOk());
	}

	@Test
	void forgotPasswordResponseIsIdenticalRegardlessOfAccountState() throws Exception {
		register("reset-it-known@example.com", "passphrase-123");
		sso.resolveOrCreate(SsoProvider.GOOGLE, "reset-it-sso-sub-1", "reset-it-ssoacct@example.com");

		String known = forgot("reset-it-known@example.com")
				.andExpect(status().isNoContent()).andReturn().getResponse().getContentAsString();
		String unknown = forgot("reset-it-nobody@example.com")
				.andExpect(status().isNoContent()).andReturn().getResponse().getContentAsString();
		String ssoOnly = forgot("reset-it-ssoacct@example.com")
				.andExpect(status().isNoContent()).andReturn().getResponse().getContentAsString();

		// Byte-identical (empty) bodies — a forgot-password reveals nothing about which emails have accounts.
		assertIdentical(known, unknown);
		assertIdentical(known, ssoOnly);
	}

	@Test
	void ssoOnlyAccountCanSetItsFirstPasswordViaReset() throws Exception {
		String email = "reset-it-sso@example.com";
		sso.resolveOrCreate(SsoProvider.GOOGLE, "reset-it-sso-sub-2", email);
		login(email, "anything-goes").andExpect(status().isUnauthorized()); // no local password yet

		forgot(email).andExpect(status().isNoContent());
		String token = tokenFrom(mailer.lastTo(email).orElseThrow().link());
		reset(token, "ssopassword789").andExpect(status().isNoContent());

		login(email, "ssopassword789").andExpect(status().isOk()); // first password set — closes S4 F-1
	}

	private org.springframework.test.web.servlet.MvcResult register(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/customer/register").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)))
				.andExpect(status().isCreated())
				.andReturn();
	}

	private ResultActions authPost(String path, String jsonBody) throws Exception {
		return mvc.perform(post(path).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content(jsonBody));
	}

	private ResultActions login(String email, String password) throws Exception {
		return authPost(LOGIN_PATH, """
				{"email": "%s", "password": "%s"}""".formatted(email, password));
	}

	private ResultActions forgot(String email) throws Exception {
		return authPost(FORGOT_PATH, """
				{"email": "%s"}""".formatted(email));
	}

	private ResultActions reset(String token, String newPassword) throws Exception {
		return authPost(RESET_PATH, """
				{"token": "%s", "newPassword": "%s"}""".formatted(token, newPassword));
	}

	private static void assertIdentical(String a, String b) {
		org.junit.jupiter.api.Assertions.assertEquals(a, b, "forgot-password responses must be byte-identical (D-8)");
	}

	private static String tokenFrom(URI link) {
		return UriComponentsBuilder.fromUri(link).build().getQueryParams().getFirst("token");
	}
}
