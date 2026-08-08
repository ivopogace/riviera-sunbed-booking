package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-4: the public account-recovery endpoints are rate-limited per-IP. With the recovery budget
 * pinned to a small capacity, the first N requests from one IP pass and the next is {@code 429 RATE_LIMITED};
 * a different IP is unaffected (its own bucket) — proving recovery has its OWN per-IP budget, not a shared
 * one (R-8, the S2 operator-lockout lesson). Recovery reuses the {@code login} limit, so the capacity is
 * pinned here via {@code riviera.ratelimit.login.capacity}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "riviera.ratelimit.login.capacity=3")
class RecoveryRateLimitIT {

	private static final String FORGOT_PATH = "/api/auth/customer/forgot-password";
	private static final int CAPACITY = 3;

	@Autowired
	MockMvc mvc;

	@Test
	void forgotPasswordIsRateLimitedPerIp() throws Exception {
		String ip = "203.0.113.7";
		for (int i = 0; i < CAPACITY; i++) {
			forgot(ip).andExpect(status().isNoContent()); // within budget
		}
		forgot(ip) // budget exhausted for this IP
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.code").value("RATE_LIMITED"));

		forgot("203.0.113.8").andExpect(status().isNoContent()); // a different IP has its own budget
	}

	private org.springframework.test.web.servlet.ResultActions forgot(String ip) throws Exception {
		return mvc.perform(post(FORGOT_PATH).with(csrf())
				.header("X-Forwarded-For", ip)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"email": "ratelimit-it@example.com"}"""));
	}
}
