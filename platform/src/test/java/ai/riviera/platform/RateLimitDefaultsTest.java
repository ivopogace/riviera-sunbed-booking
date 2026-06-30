package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Drift-regression guard (issue #56, AC-5): with the <strong>shipped</strong> defaults from
 * {@code application.properties} (per-code 30/30s, per-IP 60/1min — deliberately no
 * {@code @TestPropertySource} override), the frontend payment-confirmation poll — ~20
 * {@code GET /api/bookings/{code}} within 30s on one code from one IP ({@code booking-pay.ts}) — must
 * never be throttled. This is the exact case the Issue-intake grill surfaced that the issue text
 * missed; pinning it stops a future tightening from silently breaking a real payer.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, RateLimitTestStubs.class})
class RateLimitDefaultsTest {

	@Autowired
	MockMvc mvc;

	private static RequestPostProcessor fromIp(String ip) {
		return request -> {
			request.setRemoteAddr(ip);
			return request;
		};
	}

	@Test
	void paymentPollingWithinDefaultsIsNotLimited() throws Exception {
		String ip = "192.0.2.10";
		String code = "POLLINGCODE";
		// The booking-pay poll budget: 30s window / 1.5s interval ≈ 20 requests.
		for (int i = 0; i < 20; i++) {
			mvc.perform(get("/api/bookings/{code}", code).with(fromIp(ip)))
					.andExpect(status().isNotFound()); // 404, never 429
		}
	}
}
