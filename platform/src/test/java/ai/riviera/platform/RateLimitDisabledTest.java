package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The master switch (issue #56, AC-8): with {@code riviera.ratelimit.enabled=false} no request is ever
 * rate-limited, even with capacity set to 1 — far past which an enabled limiter would 429.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, RateLimitTestStubs.class})
@TestPropertySource(properties = {
		"riviera.ratelimit.enabled=false",
		"riviera.ratelimit.per-ip.capacity=1",
		"riviera.ratelimit.per-ip.refill-period=PT1H",
		"riviera.ratelimit.per-code.capacity=1",
		"riviera.ratelimit.per-code.refill-period=PT1H",
})
class RateLimitDisabledTest {

	@Autowired
	MockMvc mvc;

	private static RequestPostProcessor fromIp(String ip) {
		return request -> {
			request.setRemoteAddr(ip);
			return request;
		};
	}

	@Test
	void disabledNeverLimits() throws Exception {
		String ip = "198.51.100.1";
		String code = "SAMECODE";
		for (int i = 0; i < 5; i++) {
			mvc.perform(get("/api/bookings/{code}", code).with(fromIp(ip)))
					.andExpect(status().isNotFound()); // capacity 1 would 429 at the 2nd if enabled
		}
	}
}
