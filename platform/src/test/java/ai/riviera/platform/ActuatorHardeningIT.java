package ai.riviera.platform;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.endpoint.web.PathMappedEndpoints;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import ai.riviera.platform.customer.api.CustomerAccountProvisioning;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The actuator posture ({@code docs/deploy/production-hardening.md}): the exposure allowlist is {@code health},
 * {@code info} and {@code prometheus}; anonymously only health's status and info's commit id answer; prometheus
 * and health's details are ADMIN-only, since a plain operator may be a PENDING self-registrant (#1652); every
 * other actuator path is denied to every session, so a newly exposed endpoint fails closed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ActuatorHardeningIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PASSWORD = SharedTestProperties.OPERATOR_PASSWORD;
	private static final String PLAIN_OPERATOR = "actuator-plain-op";
	private static final String PLAIN_OPERATOR_PASSWORD = "quiet-harbour-lantern-7";
	private static final String CUSTOMER_EMAIL = "actuator-customer@example.com";
	private static final String CUSTOMER_PASSWORD = "amber-pebble-tideline-4";
	private static final String PROMETHEUS = "/actuator/prometheus";
	private static final String HEALTH = "/actuator/health";

	/** Actuator endpoints that expose internals; none may be reachable in production. */
	private static final List<String> SENSITIVE_ENDPOINTS = List.of(
			"/actuator/env", "/actuator/beans", "/actuator/mappings", "/actuator/configprops",
			"/actuator/heapdump", "/actuator/threaddump", "/actuator/loggers", "/actuator/metrics",
			"/actuator/modulith", "/actuator");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	CustomerAccountProvisioning customerProvisioning;
	@Autowired
	PasswordEncoder encoder;
	@Autowired
	PathMappedEndpoints exposedEndpoints;

	private Cookie adminSession;

	@BeforeEach
	void logIn() throws Exception {
		adminSession = SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PASSWORD);
	}

	@Test
	void theExposureAllowlistIsHealthInfoAndPrometheus() {
		// The primary control, proven apart from the route policy, which now denies the rest to every session.
		assertEquals(Set.of("health", "info", "prometheus"), Set.copyOf(exposedEndpoints.getAllRootPaths()));
	}

	@Test
	void sensitiveEndpointsAreUnauthorizedForAnonymous() throws Exception {
		for (String path : SENSITIVE_ENDPOINTS) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void sensitiveEndpointsAreForbiddenToEverySession() throws Exception {
		for (Cookie session : List.of(adminSession, plainOperatorSession(), customerSession())) {
			for (String path : SENSITIVE_ENDPOINTS) {
				mvc.perform(get(path).cookie(session)).andExpect(status().isForbidden());
			}
		}
	}

	@Test
	void healthIsPublicButHidesDetailsFromAnonymous() throws Exception {
		mvc.perform(get(HEALTH))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components").doesNotExist());
	}

	@Test
	void healthHidesDetailsFromAPlainOperator() throws Exception {
		mvc.perform(get(HEALTH).cookie(plainOperatorSession()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components").doesNotExist());
	}

	@Test
	void healthShowsDetailsToAnAdmin() throws Exception {
		mvc.perform(get(HEALTH).cookie(adminSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components.db.status").value("UP"));
	}

	@Test
	void infoIsPublicAndCarriesTheCommitIdAlone() throws Exception {
		mvc.perform(get("/actuator/info"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", aMapWithSize(1)))
				.andExpect(jsonPath("$.commit").value(SharedTestProperties.BUILD_COMMIT));
	}

	@Test
	void infoShowsAnAdminNothingMore() throws Exception {
		mvc.perform(get("/actuator/info").cookie(adminSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", aMapWithSize(1)))
				.andExpect(jsonPath("$.commit").value(SharedTestProperties.BUILD_COMMIT));
	}

	@Test
	void infoOpensOnlyItsGet() throws Exception {
		// With a valid CSRF token, an all-methods permitAll would reach the read-only endpoint (405), not the gate.
		mvc.perform(post("/actuator/info").with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(get("/actuator/info/anything")).andExpect(status().isUnauthorized());
		mvc.perform(post("/actuator/info").cookie(adminSession).with(csrf())).andExpect(status().isForbidden());
	}

	@Test
	void prometheusIsUnauthorizedForAnonymous() throws Exception {
		mvc.perform(get(PROMETHEUS)).andExpect(status().isUnauthorized());
	}

	@Test
	void prometheusIsForbiddenToACustomer() throws Exception {
		mvc.perform(get(PROMETHEUS).cookie(customerSession())).andExpect(status().isForbidden());
	}

	@Test
	void prometheusIsForbiddenToAPlainOperator() throws Exception {
		mvc.perform(get(PROMETHEUS).cookie(plainOperatorSession())).andExpect(status().isForbidden());
	}

	@Test
	void prometheusIsReadableByAnAdmin() throws Exception {
		mvc.perform(get(PROMETHEUS).cookie(adminSession))
				.andExpect(status().isOk())
				.andExpect(content().string(containsString("# HELP")));
	}

	/** A PENDING self-registrant: the operator any stranger can become. Registration is idempotent on the name. */
	private Cookie plainOperatorSession() throws Exception {
		boolean registered = jdbc.sql("SELECT EXISTS (SELECT 1 FROM operator WHERE username = :u)")
				.param("u", PLAIN_OPERATOR).query(Boolean.class).single();
		if (!registered) {
			mvc.perform(post("/api/auth/operator/register").with(csrf())
							.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
							.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
							.contentType(MediaType.APPLICATION_JSON)
							.content("""
									{"username": "%s", "password": "%s", "contactEmail": "actuator-op@venue.example"}"""
									.formatted(PLAIN_OPERATOR, PLAIN_OPERATOR_PASSWORD)))
					.andExpect(status().isAccepted());
		}
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PASSWORD);
	}

	private Cookie customerSession() throws Exception {
		customerProvisioning.register(CUSTOMER_EMAIL, encoder.encode(CUSTOMER_PASSWORD));
		MvcResult result = mvc.perform(SessionLoginSupport.loginRequest("/api/auth/customer/login",
						"""
								{"email": "%s", "password": "%s"}""".formatted(CUSTOMER_EMAIL, CUSTOMER_PASSWORD))
				.with(csrf()))
				.andExpect(status().isOk())
				.andReturn();
		Cookie session = result.getResponse().getCookie("SESSION");
		if (session == null) {
			throw new IllegalStateException("customer login must establish a session cookie");
		}
		return session;
	}
}
