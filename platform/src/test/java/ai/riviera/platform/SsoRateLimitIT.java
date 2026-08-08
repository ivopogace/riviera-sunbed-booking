package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-8: the SSO authorize/callback GETs are behind the {@code RateLimitFilter} per-IP budget
 * (design D-8) — an enumerator hammering the callback from one IP is throttled to {@code 429}, while a
 * fresh IP is unaffected. A dedicated unique IP exhausts its own bucket, so this test does not disturb —
 * and is not disturbed by — the suite's other per-IP budgets.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class SsoRateLimitIT {

	private static final int MAX_ATTEMPTS = 60;

	@Autowired
	MockMvc mvc;

	@Test
	void ssoAuthorizeIsRateLimitedPerIp() throws Exception {
		String ip = SessionLoginSupport.uniqueClientIp();

		boolean throttled = false;
		for (int i = 0; i < MAX_ATTEMPTS && !throttled; i++) {
			int statusCode = mvc.perform(get("/api/auth/sso/{provider}/authorize", "google")
					.header("X-Forwarded-For", ip)).andReturn().getResponse().getStatus();
			throttled = statusCode == HttpStatus.TOO_MANY_REQUESTS.value();
		}
		assertTrue(throttled, "the SSO authorize endpoint must be rate-limited per IP");

		// A different IP has its own budget and is not throttled by the exhausted one.
		mvc.perform(get("/api/auth/sso/{provider}/authorize", "google")
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isFound());
	}
}
