package ai.riviera.platform;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Operator self-registration endpoint (design D-5/D-8). A fresh username creates a
 * <strong>PENDING</strong> account and does <em>NOT</em> sign the operator in (no {@code SESSION}
 * cookie) — a PENDING operator cannot authenticate until a platform admin approves it. An
 * already-taken username returns a <strong>byte-identical</strong> {@code 202} response with no second
 * row (non-enumeration); the password policy is enforced server-side before any write. Real Postgres
 * via Testcontainers, so the full Flyway chain (incl. V29) backs the row. Each request carries a unique
 * {@code X-Forwarded-For} so suite-cumulative traffic never shares a rate bucket.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class OperatorRegistrationIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String REGISTER_PATH = "/api/auth/operator/register";
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	private static final String PASSWORD = "operator-pw-123";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'reg-op-%'").update();
	}

	@Test
	void registersPendingAndCannotLogInUntilApproved() throws Exception {
		register("reg-op-alice", PASSWORD, "alice@venue.example")
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE)); // no auto-sign-in — awaits admin approval

		String status = jdbc.sql("SELECT status FROM operator WHERE username = :u")
				.param("u", "reg-op-alice").query(String.class).single();
		assertEquals("PENDING", status, "a self-registered operator starts PENDING");

		// A PENDING account cannot authenticate (generic 401) — the edge builds a disabled principal.
		login("reg-op-alice", PASSWORD).andExpect(status().isUnauthorized());
	}

	@Test
	void duplicateRegistrationIsIndistinguishable() throws Exception {
		String freshBody = register("reg-op-bob", PASSWORD, "bob@venue.example")
				.andExpect(status().isAccepted())
				.andReturn().getResponse().getContentAsString();

		// A second registration for the same username (even a different password + email): byte-identical
		// status + body, no session, and no second/overwritten row (D-8).
		register("reg-op-bob", "a-different-password", "someone-else@venue.example")
				.andExpect(status().isAccepted())
				.andExpect(content().string(freshBody))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		Integer rows = jdbc.sql("SELECT count(*) FROM operator WHERE username = :u")
				.param("u", "reg-op-bob").query(Integer.class).single();
		assertEquals(1, rows, "a duplicate registration must not write a second row");
	}

	@Test
	void rejectsPasswordOutsidePolicy() throws Exception {
		register("reg-op-carol", "short", "carol@venue.example") // 5 chars < the 8 minimum
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		Integer rows = jdbc.sql("SELECT count(*) FROM operator WHERE username = :u")
				.param("u", "reg-op-carol").query(Integer.class).single();
		assertEquals(0, rows, "a policy-rejected registration must write nothing");
	}

	private ResultActions register(String username, String password, String contactEmail) throws Exception {
		return mvc.perform(post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s", "contactEmail": "%s"}"""
						.formatted(username, password, contactEmail)));
	}

	private ResultActions login(String username, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s"}""".formatted(username, password)));
	}
}
