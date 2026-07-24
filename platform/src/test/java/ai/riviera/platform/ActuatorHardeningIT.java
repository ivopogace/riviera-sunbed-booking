package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.http.Cookie;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Issue #75 (P0 launch blocker): operational-exposure hardening of the Spring Boot Actuator.
 *
 * <p>Only {@code /actuator/health} is web-exposed <em>publicly</em>; every other operational
 * endpoint — {@code env}, {@code beans}, {@code mappings}, {@code configprops}, {@code heapdump},
 * {@code threaddump}, {@code loggers}, {@code metrics}, and the Spring-Modulith {@code modulith}
 * endpoint — must be **unreachable**. Two independent layers back that: the exposure allowlist (a
 * non-exposed endpoint returns {@code 404}) and the security filter chain ({@link SecurityConfig}
 * gates everything but {@code health} behind authentication, so an anonymous call is {@code 401}).
 * Health itself stays public for Render's health check + the CD poll, but its component details are
 * shown only {@code when-authorized} (invariant: a public status probe must not leak internal
 * component state).
 *
 * <p>Issue #100 (D4 observability) adds {@code /actuator/prometheus} to the exposure allowlist —
 * the <em>deliberate</em> extension the issue sanctioned. It is <strong>not</strong> public: it
 * falls through the same {@code anyRequest().authenticated()} rule, so an anonymous scrape is
 * {@code 401} and only an authenticated operator can read it. The #75 lockdown therefore holds —
 * the sole public actuator surface is still {@code /actuator/health}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class ActuatorHardeningIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";

	/** Actuator endpoints that expose internals; none may be reachable in production. */
	private static final List<String> SENSITIVE_ENDPOINTS = List.of(
			"/actuator/env", "/actuator/beans", "/actuator/mappings", "/actuator/configprops",
			"/actuator/heapdump", "/actuator/threaddump", "/actuator/loggers", "/actuator/metrics",
			"/actuator/modulith");

	@Autowired
	MockMvc mvc;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	@Test
	void sensitiveEndpointsAreNotPubliclyReachable() throws Exception {
		// AC-1: an anonymous caller is rejected by the security filter chain (401) — never a 200 body.
		for (String path : SENSITIVE_ENDPOINTS) {
			mvc.perform(get(path)).andExpect(status().isUnauthorized());
		}
	}

	@Test
	void sensitiveEndpointsAreNotExposedEvenToOperator() throws Exception {
		// AC-2: even an authenticated operator cannot reach them — they are not on the exposure
		// allowlist, so the endpoint handler does not exist (404). Proves the lockdown is exposure,
		// not merely authorization.
		for (String path : SENSITIVE_ENDPOINTS) {
			mvc.perform(get(path).cookie(operatorSession)).andExpect(status().isNotFound());
		}
	}

	@Test
	void healthIsPublicButHidesDetailsFromAnonymous() throws Exception {
		// AC-3: the public health probe (Render / CD poll) sees status only — no component details.
		mvc.perform(get("/actuator/health"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components").doesNotExist());
	}

	@Test
	void healthShowsDetailsToOperator() throws Exception {
		// AC-4: an authenticated operator sees component details (show-details=when-authorized).
		mvc.perform(get("/actuator/health").cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("UP"))
				.andExpect(jsonPath("$.components.db.status").value("UP"));
	}

	@Test
	void prometheusIsNotPubliclyReachable() throws Exception {
		// #100 AC-3: the metrics scrape endpoint is exposed but NOT public — an anonymous scrape is
		// rejected by the security filter chain (401), never a 200 body. The #75 lockdown holds:
		// health remains the only anonymous actuator surface.
		mvc.perform(get("/actuator/prometheus")).andExpect(status().isUnauthorized());
	}

	@Test
	void prometheusIsReadableByOperator() throws Exception {
		// #100 AC-3: an authenticated operator can scrape metrics in Prometheus text format.
		mvc.perform(get("/actuator/prometheus").cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(content().string(containsString("# HELP")));
	}
}
