package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the booking-endpoint rate limiter (issue #56). Tiny limits (capacity 2, refill an
 * hour out so nothing replenishes mid-test) make the over-limit boundary cheap to hit; the fixed clock
 * keeps every bucket frozen. Each test uses unique IPs/codes so buckets don't collide across methods
 * sharing the slice's context. An allowed request is a {@code 404} (stubbed unknown code/set); a
 * {@code 429} is unambiguously the limiter.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, RateLimitTestStubs.class})
@TestPropertySource(properties = {
		"riviera.ratelimit.enabled=true",
		"riviera.ratelimit.per-ip.capacity=2",
		"riviera.ratelimit.per-ip.refill-period=PT1H",
		"riviera.ratelimit.per-code.capacity=2",
		"riviera.ratelimit.per-code.refill-period=PT1H",
		"riviera.ratelimit.max-tracked-keys=100000",
})
class RateLimitFilterTest {

	private static final String ALLOWED_ORIGIN = "https://ivopogace.github.io";
	private static final String CREATE_BODY = """
			{"setId": 1, "bookingDate": "2030-01-01",
			 "contact": {"email": "h@e.com", "fullName": "Guest", "phone": "+355699"}}
			""";

	@Autowired
	MockMvc mvc;

	private static RequestPostProcessor fromIp(String ip) {
		return request -> {
			request.setRemoteAddr(ip);
			return request;
		};
	}

	private ResultActions viewFromIp(String ip, String code) throws Exception {
		return mvc.perform(get("/api/bookings/{code}", code).with(fromIp(ip)));
	}

	@Test
	void perIpOverLimitIs429() throws Exception {
		String ip = "10.1.0.1";
		viewFromIp(ip, "perip-A").andExpect(status().isNotFound());
		viewFromIp(ip, "perip-B").andExpect(status().isNotFound());
		viewFromIp(ip, "perip-C")
				.andExpect(status().isTooManyRequests())
				.andExpect(header().exists("Retry-After"))
				.andExpect(jsonPath("$.error").value("RATE_LIMITED"));
	}

	@Test
	void perIpIsKeyedByClientIp() throws Exception {
		viewFromIp("10.2.0.1", "kip-A").andExpect(status().isNotFound());
		viewFromIp("10.2.0.1", "kip-B").andExpect(status().isNotFound());
		viewFromIp("10.2.0.1", "kip-C").andExpect(status().isTooManyRequests()); // IP exhausted

		// A different IP keeps its own budget.
		viewFromIp("10.2.0.2", "kip-D").andExpect(status().isNotFound());
	}

	@Test
	void perCodeOverLimitIs429() throws Exception {
		// Same code from three distinct IPs: each IP bucket is untouched, so only the per-code
		// bucket can trip — isolating the code dimension.
		viewFromIp("10.3.0.1", "percode-Z").andExpect(status().isNotFound());
		viewFromIp("10.3.0.2", "percode-Z").andExpect(status().isNotFound());
		viewFromIp("10.3.0.3", "percode-Z")
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.error").value("RATE_LIMITED"));
	}

	@Test
	void perCodeIsKeyedByCode() throws Exception {
		viewFromIp("10.4.0.1", "kcode-Y").andExpect(status().isNotFound());
		viewFromIp("10.4.0.2", "kcode-Y").andExpect(status().isNotFound());
		viewFromIp("10.4.0.3", "kcode-Y").andExpect(status().isTooManyRequests()); // code exhausted

		// A different code from a fresh IP is unaffected.
		viewFromIp("10.4.0.4", "kcode-W").andExpect(status().isNotFound());
	}

	@Test
	void createIsPerIpLimited() throws Exception {
		String ip = "10.5.0.1";
		for (int i = 0; i < 2; i++) {
			mvc.perform(post("/api/bookings").with(fromIp(ip))
							.contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
					.andExpect(status().isNotFound()); // stub: NO_SUCH_SET
		}
		mvc.perform(post("/api/bookings").with(fromIp(ip))
						.contentType(MediaType.APPLICATION_JSON).content(CREATE_BODY))
				.andExpect(status().isTooManyRequests())
				.andExpect(jsonPath("$.error").value("RATE_LIMITED"));
	}

	@Test
	void usesForwardedForClientIp() throws Exception {
		// The XFF client is constant while the socket address varies → the limiter must key on XFF.
		mvc.perform(get("/api/bookings/{code}", "xff-A")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.1")))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "xff-B")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.2")))
				.andExpect(status().isNotFound());
		mvc.perform(get("/api/bookings/{code}", "xff-C")
				.header("X-Forwarded-For", "203.0.113.50").with(fromIp("10.6.0.3")))
				.andExpect(status().isTooManyRequests());

		// A different forwarded client is unaffected.
		mvc.perform(get("/api/bookings/{code}", "xff-D")
				.header("X-Forwarded-For", "203.0.113.99").with(fromIp("10.6.0.4")))
				.andExpect(status().isNotFound());
	}

	@Test
	void preflightIsNotCounted() throws Exception {
		String ip = "10.7.0.1";
		// Five preflights (> capacity 2) must never be rate-limited.
		for (int i = 0; i < 5; i++) {
			mvc.perform(options("/api/bookings/{code}", "preflight")
							.header("Origin", ALLOWED_ORIGIN)
							.header("Access-Control-Request-Method", "GET")
							.with(fromIp(ip)))
					.andExpect(status().isOk());
		}
		// And the IP's real budget is intact afterwards.
		viewFromIp(ip, "pf-real-A").andExpect(status().isNotFound());
		viewFromIp(ip, "pf-real-B").andExpect(status().isNotFound());
	}
}
