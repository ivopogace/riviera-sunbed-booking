package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The session-auth foundation proof (issue #109, S1 of epic #108 — design D-1/D-2/D-8): an
 * operator signs in ONCE via {@code POST /api/auth/operator/login} and rides an
 * {@code HttpOnly; Secure; SameSite=Lax} session cookie afterwards — no more per-request
 * {@code Authorization: Basic}. Auth errors are on the RFC-7807 contract (#97): a failed login is
 * {@code 401 INVALID_CREDENTIALS} with an <em>identical</em> body for wrong-password / unknown-user /
 * suspended (no account enumeration, D-8), and an unauthenticated request to a protected endpoint
 * gets {@code 401 UNAUTHENTICATED} from the entry point (hand-mirrored shape, the
 * {@code RateLimitFilter} pattern).
 *
 * <p>Like {@code PerOperatorLoginIT} this runs the real login path (DB-backed credentials via
 * {@link OperatorProvisioning}); the staff daily-bookings read is again the "which principal am I"
 * probe. Session fixation (D-1): the session id ROTATES on login and the pre-login id dies.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=bootstrap-pw")
@AutoConfigureMockMvc
class AuthSessionIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String LOGIN_PATH = "/api/auth/operator/login";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	private long venueOwnedByA;

	@BeforeEach
	void provisionOperator() throws Exception {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('op-a', 'op-c'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('op-a', 'op-c')").update();

		venueOwnedByA = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Session Auth Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();

		OperatorId operatorA = provisioning.provision("op-a", encoder.encode("pw-a"));
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueOwnedByA).param("o", operatorA.value()).update();
	}

	// ---- AC-1: login establishes the session cookie with the D-1 flags ----

	@Test
	void loginEstablishesSessionCookieWithSecureFlags() throws Exception {
		MvcResult result = mvc.perform(post(LOGIN_PATH).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "op-a", "password": "pw-a"}"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("op-a"))
				.andExpect(jsonPath("$.principalType").value("OPERATOR"))
				.andExpect(cookie().exists(SESSION_COOKIE))
				.andExpect(cookie().httpOnly(SESSION_COOKIE, true))
				.andExpect(cookie().secure(SESSION_COOKIE, true))
				.andExpect(cookie().attribute(SESSION_COOKIE, "SameSite", "Lax"))
				.andReturn();

		// The session (not a replayed credential) is what authenticates the next request.
		Cookie session = result.getResponse().getCookie(SESSION_COOKIE);
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).cookie(session))
				.andExpect(status().isOk());
	}

	// ---- AC-2: login failures are a generic RFC-7807 401 — no account enumeration ----

	@Test
	void badCredentialsGetGeneric401() throws Exception {
		provisioning.provision("op-c", encoder.encode("pw-c"));
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE username = 'op-c'").update();

		String wrongPassword = attemptLoginExpecting401("op-a", "not-the-password");
		String unknownUser = attemptLoginExpecting401("ghost", "whatever");
		String suspended = attemptLoginExpecting401("op-c", "pw-c");

		// One indistinguishable body: the response must not reveal WHY the login failed (D-8).
		assertEquals(wrongPassword, unknownUser);
		assertEquals(wrongPassword, suspended);
	}

	private String attemptLoginExpecting401(String username, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s"}""".formatted(username, password)))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
				.andExpect(jsonPath("$.instance").value("about:blank"))
				.andReturn().getResponse().getContentAsString();
	}

	// ---- AC-6: logout invalidates the server session; login rotates the session id ----

	@Test
	void logoutInvalidatesServerSession() throws Exception {
		Cookie session = login();

		mvc.perform(post("/api/auth/logout").cookie(session).with(csrf()))
				.andExpect(status().isNoContent());

		// The old cookie is dead server-side — not just cleared in the browser.
		mvc.perform(get("/api/venues/{v}/bookings", venueOwnedByA).cookie(session))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void sessionIdRotatesOnLogin() throws Exception {
		Cookie preLogin = login();

		// A login arriving WITH an existing session must not keep its id (fixation, D-1).
		MvcResult result = mvc.perform(post(LOGIN_PATH).with(csrf())
				.cookie(preLogin)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "op-a", "password": "pw-a"}"""))
				.andExpect(status().isOk())
				.andExpect(cookie().exists(SESSION_COOKIE))
				.andReturn();

		Cookie postLogin = result.getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(postLogin);
		assertNotEquals(preLogin.getValue(), postLogin.getValue());

		// The rotated session works; the pre-login id no longer authenticates anything.
		mvc.perform(get("/api/auth/me").cookie(postLogin)).andExpect(status().isOk());
		mvc.perform(get("/api/auth/me").cookie(preLogin)).andExpect(status().isUnauthorized());
	}

	// ---- The current-principal read: the FE's reload-restore endpoint (AC-8's server half) ----

	@Test
	void meReturnsThePrincipalForASessionAnd401ProblemWhenAnonymous() throws Exception {
		Cookie session = login();

		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value("op-a"))
				.andExpect(jsonPath("$.principalType").value("OPERATOR"));

		// Anonymous → the entry point's hand-mirrored RFC-7807 401 (same pattern as RATE_LIMITED).
		mvc.perform(get("/api/auth/me"))
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("UNAUTHENTICATED"))
				.andExpect(jsonPath("$.instance").value("about:blank"));
	}

	private Cookie login() throws Exception {
		MvcResult result = mvc.perform(post(LOGIN_PATH).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "op-a", "password": "pw-a"}"""))
				.andExpect(status().isOk())
				.andReturn();
		Cookie session = result.getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(session, "login must establish a session cookie");
		return session;
	}
}
