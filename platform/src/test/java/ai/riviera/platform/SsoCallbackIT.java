package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * S4 (#112) end-to-end mock SSO flow (design D-3/D-4): a tourist runs the "Continue with Google/Apple"
 * authorize→callback dance against the mock IdP, ends signed-in with a {@code SESSION} cookie
 * ({@code /me} reports {@code CUSTOMER}), first sign-in creates a password-less account + link and a
 * second reuses it, and a bad/missing {@code state} is rejected with no session and no account (AC-7).
 * Real Postgres via Testcontainers (exercises V27); unique {@code X-Forwarded-For} per flow keeps
 * suite-cumulative SSO GETs off one rate bucket (#127).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SsoCallbackIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String GOOGLE_EMAIL = "google.tourist@example.com";
	private static final String APPLE_EMAIL = "apple.tourist@example.com";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM customer_sso_identity WHERE email LIKE '%.tourist@example.com'").update();
		jdbc.sql("DELETE FROM customer_account WHERE email LIKE '%.tourist@example.com'").update();
	}

	@Test
	void mockGoogleFlowEstablishesSessionAndCreatesAPasswordlessAccount() throws Exception {
		SignedIn google = signIn("google");

		mvc.perform(get("/api/auth/me").cookie(google.session()).header("X-Forwarded-For", google.ip()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(GOOGLE_EMAIL))
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));

		assertEquals(1, accountRows(GOOGLE_EMAIL));
		assertEquals(1, passwordlessAccountRows(GOOGLE_EMAIL));
		assertEquals(1, identityRows("GOOGLE"));
	}

	@Test
	void mockAppleFlowSignsInToADistinctAccount() throws Exception {
		SignedIn apple = signIn("apple");

		mvc.perform(get("/api/auth/me").cookie(apple.session()).header("X-Forwarded-For", apple.ip()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(APPLE_EMAIL))
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));
		assertEquals(1, accountRows(APPLE_EMAIL));
	}

	@Test
	void secondGoogleSignInReusesTheSameAccount() throws Exception {
		signIn("google");
		signIn("google");

		assertEquals(1, accountRows(GOOGLE_EMAIL), "a returning subject must not create a second account");
		assertEquals(1, identityRows("GOOGLE"));
	}

	@Test
	void callbackWithBadStateIsRejectedAndCreatesNoSessionOrAccount() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		MvcResult authorize = mvc.perform(get("/api/auth/sso/{provider}/authorize", "google")
				.header("X-Forwarded-For", ip)).andExpect(status().isFound()).andReturn();
		Cookie session = authorize.getResponse().getCookie(SESSION_COOKIE);

		mvc.perform(get("/api/auth/sso/{provider}/callback", "google")
				.param("code", "mock-google")
				.param("state", "tampered-state")
				.cookie(session)
				.header("X-Forwarded-For", ip))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		assertEquals(0, accountRows(GOOGLE_EMAIL), "a rejected callback must create no account");
	}

	@Test
	void callbackWithoutAPriorAuthorizeIsRejected() throws Exception {
		mvc.perform(get("/api/auth/sso/{provider}/callback", "google")
				.param("code", "mock-google")
				.param("state", "whatever")
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isBadRequest());

		assertEquals(0, accountRows(GOOGLE_EMAIL));
	}

	@Test
	void mockIdpRedirectsBackToTheOwnCallbackWithACannedCode() throws Exception {
		mvc.perform(get("/api/auth/sso/mock/{provider}/authorize", "google")
				.param("state", "state-xyz")
				.param("redirect_uri", "http://localhost/api/auth/sso/google/callback")
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isFound())
				.andExpect(header().string("Location", containsString("/api/auth/sso/google/callback")))
				.andExpect(header().string("Location", containsString("code=mock-google")))
				.andExpect(header().string("Location", containsString("state=state-xyz")));
	}

	@Test
	void mockIdpRejectsAForeignRedirectUri() throws Exception {
		// A redirect_uri on a different host/scheme must not be honoured (no open redirect).
		mvc.perform(get("/api/auth/sso/mock/{provider}/authorize", "google")
				.param("state", "s")
				.param("redirect_uri", "https://evil.example/api/auth/sso/google/callback")
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isBadRequest());
	}

	/** Run the full mock authorize→callback flow on a fresh unique IP; return the signed-in session. */
	private SignedIn signIn(String providerSlug) throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();
		MvcResult authorize = mvc.perform(get("/api/auth/sso/{provider}/authorize", providerSlug)
				.header("X-Forwarded-For", ip)).andExpect(status().isFound()).andReturn();
		Cookie authorizeSession = authorize.getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(authorizeSession, "authorize must start a session to hold the state");
		String state = queryParam(authorize.getResponse().getRedirectedUrl(), "state");

		MvcResult callback = mvc.perform(get("/api/auth/sso/{provider}/callback", providerSlug)
				.param("code", "mock-" + providerSlug)
				.param("state", state)
				.cookie(authorizeSession)
				.header("X-Forwarded-For", ip))
				.andExpect(status().isFound())
				.andExpect(redirectedUrl("/"))
				.andReturn();
		Cookie signedIn = callback.getResponse().getCookie(SESSION_COOKIE);
		return new SignedIn(signedIn != null ? signedIn : authorizeSession, ip);
	}

	private record SignedIn(Cookie session, String ip) {
	}

	private static String queryParam(String url, String name) {
		return UriComponentsBuilder.fromUriString(url).build().getQueryParams().getFirst(name);
	}

	private int accountRows(String email) {
		return jdbc.sql("SELECT count(*) FROM customer_account WHERE email = :email")
				.param("email", email).query(Integer.class).single();
	}

	private int passwordlessAccountRows(String email) {
		return jdbc.sql("SELECT count(*) FROM customer_account WHERE email = :email AND password_hash IS NULL")
				.param("email", email).query(Integer.class).single();
	}

	private int identityRows(String provider) {
		// Scope to this test's own canned mock identities (the emails clean() removes), so a sibling test's
		// GOOGLE/APPLE identity in the shared full-suite DB can never inflate the count (full-suite isolation).
		return jdbc.sql("""
				SELECT count(*) FROM customer_sso_identity
				WHERE provider = :provider AND email LIKE '%.tourist@example.com'
				""")
				.param("provider", provider).query(Integer.class).single();
	}
}
