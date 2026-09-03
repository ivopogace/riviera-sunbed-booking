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
 * cookie) — the 202 itself is session-less either branch; since #694 the PENDING account can sign
 * in immediately (approval gates tourist visibility, not access). An
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
	void registersPendingWithoutASessionAndCanSignInImmediately() throws Exception {
		register("reg-op-alice", PASSWORD, "alice@venue.example")
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("PENDING"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE)); // the 202 itself never signs in (D-8)

		String status = jdbc.sql("SELECT status FROM operator WHERE username = :u")
				.param("u", "reg-op-alice").query(String.class).single();
		assertEquals("PENDING", status, "a self-registered operator starts PENDING");

		// A PENDING account authenticates (#694): approval gates tourist visibility, not access.
		login("reg-op-alice", PASSWORD)
				.andExpect(status().isOk())
				.andExpect(cookie().exists(SESSION_COOKIE));
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
		register("reg-op-carol", "elevenchars", "carol@venue.example") // 11 chars < the 12 minimum
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		register("reg-op-carol", "a".repeat(73), "carol@venue.example") // 73 bytes > bcrypt's cap
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		assertNoOperator("reg-op-carol");
	}

	@Test
	void rejectsAPasswordContainingTheUsername() throws Exception {
		register("reg-op-dana", "Reg-Op-DANA-2026!!", "dana@venue.example")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_CONTAINS_BLOCKED_TERM"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertNoOperator("reg-op-dana");
	}

	@Test
	void rejectsAPasswordContainingTheServiceName() throws Exception {
		register("reg-op-erin", "Riviera-summer-26", "erin@venue.example")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("PASSWORD_CONTAINS_BLOCKED_TERM"));

		assertNoOperator("reg-op-erin");
	}

	private void assertNoOperator(String username) {
		Integer rows = jdbc.sql("SELECT count(*) FROM operator WHERE username = :u")
				.param("u", username).query(Integer.class).single();
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
