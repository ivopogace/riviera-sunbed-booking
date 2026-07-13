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
import org.springframework.test.web.servlet.ResultActions;

import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
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
 * S2 #111 customer sign-in via the S1 session mechanism (design D-1/D-2/D-8): a registered customer
 * logs in, rides the {@code SESSION} cookie, {@code /me} reports {@code principalType=CUSTOMER}, and
 * logout invalidates the server session. Login failures are a single generic {@code 401
 * INVALID_CREDENTIALS} for unknown-email and wrong-password alike (no account enumeration). Real
 * Postgres via Testcontainers; the account is seeded through the module's provisioning port with an
 * edge-encoded hash. Unique {@code X-Forwarded-For} per login keeps suite-cumulative logins off one
 * rate bucket (#127).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CustomerLoginIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String LOGIN_PATH = "/api/auth/customer/login";
	private static final String EMAIL = "login-it-alice@example.com";
	private static final String PASSWORD = "password123";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void seed() {
		jdbc.sql("DELETE FROM customer_account WHERE email LIKE 'login-it-%'").update();
		provisioning.register(EMAIL, encoder.encode(PASSWORD));
	}

	@Test
	void loginEstablishesSessionAndMeReflectsCustomerType() throws Exception {
		Cookie session = login(EMAIL, PASSWORD)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(EMAIL))
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"))
				.andExpect(cookie().exists(SESSION_COOKIE))
				.andReturn().getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(session, "login must establish a session cookie");

		mvc.perform(get("/api/auth/me").cookie(session))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.username").value(EMAIL))
				.andExpect(jsonPath("$.principalType").value("CUSTOMER"));
	}

	@Test
	void logoutInvalidatesSession() throws Exception {
		Cookie session = login(EMAIL, PASSWORD).andReturn().getResponse().getCookie(SESSION_COOKIE);

		mvc.perform(post("/api/auth/logout").cookie(session).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void unknownEmailAndWrongPasswordAreIndistinguishable() throws Exception {
		String unknownEmail = attemptExpecting401("login-it-ghost@example.com", "whatever8");
		String wrongPassword = attemptExpecting401(EMAIL, "wrong-password");
		assertEquals(unknownEmail, wrongPassword,
				"the 401 body must not reveal WHY the login failed (D-8)");
	}

	private String attemptExpecting401(String email, String password) throws Exception {
		return login(email, password)
				.andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
				.andReturn().getResponse().getContentAsString();
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post(LOGIN_PATH).with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(email, password)));
	}
}
