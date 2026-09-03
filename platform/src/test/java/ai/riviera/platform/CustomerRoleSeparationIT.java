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
import ai.riviera.platform.operator.api.OperatorProvisioning;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Role separation (AC-5, invariant #13 posture). A signed-in CUSTOMER session carries
 * {@code ROLE_CUSTOMER}, which never satisfies an operator role-gate — hitting an operator-only
 * endpoint is a {@code 403} (authenticated, wrong role), not a {@code 401}. And the two identity
 * namespaces are disjoint: an operator credential presented to the customer login (and vice versa) is
 * unknown there, so it is a generic {@code 401}. Each login carries a unique {@code X-Forwarded-For}
 * to stay off a shared rate bucket.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CustomerRoleSeparationIT {

	private static final String SESSION_COOKIE = "SESSION";
	private static final String CUSTOMER_EMAIL = "sep-cust@example.com";
	private static final String CUSTOMER_PASSWORD = "passphrase-123";
	private static final String OPERATOR_USERNAME = "sep-op";
	private static final String OPERATOR_PASSWORD = "op-passphrase-1";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	OperatorProvisioning operatorProvisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void seed() {
		jdbc.sql("DELETE FROM customer_account WHERE email = :e").param("e", CUSTOMER_EMAIL).update();
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", OPERATOR_USERNAME).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", OPERATOR_USERNAME).update();
		customerProvisioning.register(CUSTOMER_EMAIL, encoder.encode(CUSTOMER_PASSWORD));
		operatorProvisioning.provision(OPERATOR_USERNAME, encoder.encode(OPERATOR_PASSWORD));
	}

	@Test
	void customerSessionCannotReachOperatorEndpoint() throws Exception {
		Cookie session = customerLogin().andReturn().getResponse().getCookie(SESSION_COOKIE);
		assertNotNull(session, "customer login must establish a session cookie");

		// An operator-only endpoint (role-gated in the filter chain). The CUSTOMER role is authenticated
		// but lacks ROLE_OPERATOR → 403, not 401. Venue existence is irrelevant: the role gate runs
		// before the controller, so no venue need exist.
		mvc.perform(get("/api/venues/{v}/takings", 1).cookie(session))
				.andExpect(status().isForbidden());
	}

	@Test
	void credentialsDoNotCrossPrincipalTypes() throws Exception {
		// An operator credential submitted to the CUSTOMER login is unknown in that namespace → 401.
		mvc.perform(post("/api/auth/customer/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(OPERATOR_USERNAME, OPERATOR_PASSWORD)))
				.andExpect(status().isUnauthorized());

		// A customer credential submitted to the OPERATOR login is unknown in that namespace → 401.
		mvc.perform(post("/api/auth/operator/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username": "%s", "password": "%s"}""".formatted(CUSTOMER_EMAIL, CUSTOMER_PASSWORD)))
				.andExpect(status().isUnauthorized());
	}

	private ResultActions customerLogin() throws Exception {
		return mvc.perform(post("/api/auth/customer/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "%s", "password": "%s"}""".formatted(CUSTOMER_EMAIL, CUSTOMER_PASSWORD)))
				.andExpect(status().isOk());
	}
}
