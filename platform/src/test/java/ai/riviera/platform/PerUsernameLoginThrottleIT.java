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

import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end proof of the per-username login throttle on the <em>real</em> login path
 * against DB-backed credentials — the half {@code RateLimitFilterTest}'s web slice cannot cover, since
 * that slice's stub stores can never authenticate a login (every attempt there is a 401). A tiny
 * per-username budget (capacity 2, an hour's refill so nothing replenishes mid-test) makes the boundary
 * cheap to hit; each login presents a unique client IP so the per-IP budget never trips first.
 *
 * <p>The two tests use <strong>distinct</strong> usernames so their buckets never bleed across methods
 * sharing this cached context: {@code throttle-success} proves a successful login is
 * refunded (never net-consumes), and {@code throttle-fail} proves failed logins for one username across
 * many IPs are throttled by the per-username dimension the per-IP buckets structurally miss.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"riviera.operator.password=bootstrap-pw",
		"riviera.ratelimit.username.capacity=2",
		"riviera.ratelimit.username.refill-period=PT1H",
})
@AutoConfigureMockMvc
class PerUsernameLoginThrottleIT {

	private static final String RIGHT_PW = "right-password";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;

	@BeforeEach
	void provisionOperators() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username IN ('throttle-success', 'throttle-fail'))").update();
		jdbc.sql("DELETE FROM operator WHERE username IN ('throttle-success', 'throttle-fail')").update();
		provisioning.provision("throttle-success", encoder.encode(RIGHT_PW));
		provisioning.provision("throttle-fail", encoder.encode(RIGHT_PW));
	}

	@Test
	void aSuccessfulLoginNeverConsumesTheUsernameBudget() throws Exception {
		// Capacity 2, but THREE successful logins for one username (each from a unique IP, so the per-IP
		// budget cannot trip) all succeed — proving a successful login is refunded and never net-consumes
		// a token. A count-all limiter would 429 the third (operatorSession asserts 200 and would fail).
		for (int i = 0; i < 3; i++) {
			SessionLoginSupport.operatorSession(mvc, "throttle-success", RIGHT_PW);
		}
	}

	@Test
	void failedLoginsForOneUsernameAcrossIpsAreThrottled() throws Exception {
		// The real-DB AC-1: capacity 2 failed logins (wrong password) for one username from three unique
		// IPs — the per-IP buckets stay untouched, so the third 429 is unambiguously the per-username budget.
		wrongPassword("throttle-fail").andExpect(status().isUnauthorized());
		wrongPassword("throttle-fail").andExpect(status().isUnauthorized());
		wrongPassword("throttle-fail")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));
	}

	private ResultActions wrongPassword(String username) throws Exception {
		return mvc.perform(post("/api/auth/operator/login").with(csrf())
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"username\": \"%s\", \"password\": \"wrong-password\"}".formatted(username)));
	}
}
