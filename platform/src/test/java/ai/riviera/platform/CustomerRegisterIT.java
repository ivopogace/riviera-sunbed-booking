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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The registration endpoint (design D-8). A fresh email creates the account and auto-signs-in
 * (a {@code SESSION} cookie is set); an already-registered email returns a <strong>byte-identical</strong>
 * response but establishes NO session (non-enumeration — the only residual signal is the cookie's
 * presence, an accepted trade-off); password policy is enforced server-side before any write. Real
 * Postgres via Testcontainers, so the full Flyway chain (incl. V25) backs the account row. Each request
 * carries a unique {@code X-Forwarded-For} so suite-cumulative traffic never shares a rate bucket.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CustomerRegisterIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String REGISTER_PATH = "/api/auth/customer/register";
	private static final String LOGIN_PATH = "/api/auth/customer/login";
	private static final String BLOCKED_TERM_CODE = "PASSWORD_CONTAINS_BLOCKED_TERM";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM customer_account WHERE email LIKE 'reg-it-%'").update();
	}

	@Test
	void freshEmailRegistersAndSignsIn() throws Exception {
		MvcResult result = register("reg-it-alice@example.com", "passphrase-123")
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.username").value("reg-it-alice@example.com"))
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"))
				.andExpect(cookie().exists(SESSION_COOKIE))
				.andExpect(cookie().httpOnly(SESSION_COOKIE, true))
				.andReturn();

		// The session (not a replayed credential) authenticates the follow-up /me as a CUSTOMER.
		Cookie session = result.getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(session, "a fresh registration must establish a session cookie");
		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));
	}

	@Test
	void duplicateEmailResponseIsIdenticalButSessionless() throws Exception {
		String freshBody = register("reg-it-bob@example.com", "passphrase-123")
				.andExpect(status().isCreated())
				.andExpect(cookie().exists(SESSION_COOKIE))
				.andReturn().getResponse().getContentAsString();

		// Second registration for the same email (even a different password): identical body + status,
		// but NO session cookie (D-8) and no overwrite.
		register("reg-it-bob@example.com", "a-different-password")
				.andExpect(status().isCreated())
				.andExpect(content().string(freshBody))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		Integer rows = jdbc.sql("SELECT count(*) FROM customer_account WHERE email = :e")
				.param("e", "reg-it-bob@example.com").query(Integer.class).single();
		assertEquals(1, rows, "a duplicate registration must not write a second row");
	}

	@Test
	void rejectsPasswordOutsidePolicy() throws Exception {
		register("reg-it-carol@example.com", "elevenchars") // 11 chars < the 12 minimum
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));
		register("reg-it-carol@example.com", "a".repeat(73)) // 73 bytes > bcrypt's 72-byte cap
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		assertNoAccount("reg-it-carol@example.com");
	}

	@Test
	void rejectsAPasswordContainingTheEmailName() throws Exception {
		register("reg-it-dana@example.com", "Reg-It-DANA-2026!!")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(BLOCKED_TERM_CODE))
				.andExpect(cookie().doesNotExist(SESSION_COOKIE));

		assertNoAccount("reg-it-dana@example.com");
	}

	@Test
	void rejectsAPasswordContainingTheServiceName() throws Exception {
		register("reg-it-erin@example.com", "Riviera-summer-26")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value(BLOCKED_TERM_CODE));

		assertNoAccount("reg-it-erin@example.com");
	}

	@Test
	void acceptsATwelveCharacterPasswordWithSurroundingSpacesVerbatim() throws Exception {
		String spaced = " spaced-pw1 ";
		assertEquals(12, spaced.length());
		register("reg-it-finn@example.com", spaced)
				.andExpect(status().isCreated())
				.andExpect(cookie().exists(SESSION_COOKIE));

		login("reg-it-finn@example.com", spaced).andExpect(status().isOk());
		login("reg-it-finn@example.com", spaced.trim()).andExpect(status().isUnauthorized());
	}

	private void assertNoAccount(String email) {
		Integer rows = jdbc.sql("SELECT count(*) FROM customer_account WHERE email = :e")
				.param("e", email).query(Integer.class).single();
		assertEquals(0, rows, "a policy-rejected registration must write nothing");
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)));
	}

	private ResultActions register(String email, String password) throws Exception {
		return mvc.perform(post(REGISTER_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)));
	}
}
