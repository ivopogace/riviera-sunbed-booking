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

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Operational-exposure hardening of the Spring Boot Actuator.
 *
 * <p>Only {@code /actuator/health} and {@code /actuator/info} are web-exposed <em>publicly</em>; every other operational
 * endpoint — {@code env}, {@code beans}, {@code mappings}, {@code configprops}, {@code heapdump},
 * {@code threaddump}, {@code loggers}, {@code metrics}, and the Spring-Modulith {@code modulith}
 * endpoint — must be **unreachable**. Two independent layers back that: the exposure allowlist (a
 * non-exposed endpoint returns {@code 404}) and the security filter chain ({@code SecurityConfig}
 * gates everything but {@code health} and a {@code GET} of {@code info} behind authentication, so an anonymous call is
 * {@code 401}). Info carries the build's commit id and nothing else, for anyone (the CD poll, #1632).
 * Health itself stays public for Render's health check + the CD poll, but its component details are
 * shown only {@code when-authorized} (invariant: a public status probe must not leak internal
 * component state).
 *
 * <p>Observability instrumentation adds {@code /actuator/prometheus} to the exposure allowlist —
 * a <em>deliberate</em> extension, not an oversight. It is <strong>not</strong> public: it
 * falls through the same {@code anyRequest().authenticated()} rule, so an anonymous scrape is
 * {@code 401} and only an authenticated operator can read it.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
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
	void infoIsPublicAndCarriesTheCommitIdAlone() throws Exception {
		mvc.perform(get("/actuator/info"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", aMapWithSize(1)))
				.andExpect(jsonPath("$.commit").value(SharedTestProperties.BUILD_COMMIT));
	}

	@Test
	void infoShowsAnOperatorNothingMore() throws Exception {
		mvc.perform(get("/actuator/info").cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$", aMapWithSize(1)))
				.andExpect(jsonPath("$.commit").value(SharedTestProperties.BUILD_COMMIT));
	}

	@Test
	void infoOpensOnlyItsGet() throws Exception {
		// The permitAll is GET-only: an anonymous write never reaches an endpoint.
		mvc.perform(post("/actuator/info")).andExpect(status().is4xxClientError());
		mvc.perform(get("/actuator/info/anything")).andExpect(status().isUnauthorized());
	}

	@Test
	void prometheusIsNotPubliclyReachable() throws Exception {
		// AC-3: the metrics scrape endpoint is exposed but NOT public — an anonymous scrape is rejected (401), never a 200 body.
		mvc.perform(get("/actuator/prometheus")).andExpect(status().isUnauthorized());
	}

	@Test
	void prometheusIsReadableByOperator() throws Exception {
		// AC-3: an authenticated operator can scrape metrics in Prometheus text format.
		mvc.perform(get("/actuator/prometheus").cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(content().string(containsString("# HELP")));
	}
}
