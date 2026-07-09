package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Issue #110: with the deployed sandbox now same-origin (Spring serves the SPA), the default
 * CORS origin list is <strong>empty</strong> — there is no cross-origin browser caller. Pins
 * that an empty list wires cleanly (no bean failure — R-6; a blank property must not become a
 * malformed empty-string "allowed origin") and that it denies every cross-origin preflight, so
 * an empty config can never accidentally allow a stray origin.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, SpaWebConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = "app.web.cors.allowed-origins=")
class WebCorsConfigEmptyOriginsTest {

	@Autowired
	MockMvc mockMvc;

	@Test
	void crossOriginGetsNoAllowOriginHeaderWhenNoOriginsConfigured() throws Exception {
		// Same-origin app: with no CORS mapping registered, a cross-origin request/preflight receives
		// NO Access-Control-Allow-Origin header, so the browser blocks it. The server does NOT 403 —
		// a blanket 403 would also reject legitimate same-origin writes behind the TLS proxy (the
		// review-fixed bug); the browser enforces the cross-origin block via the missing header.
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://evil.example.com")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
	}

	@Test
	void sameOriginActualRequestIsNotRejectedWhenNoOriginsConfigured() throws Exception {
		// Behind Render's TLS-terminating proxy, Spring sees a SAME-origin request as cross-origin
		// (internal http vs the browser's https Origin), so CorsUtils.isCorsRequest is true even for
		// a same-origin call. With no origins configured the source registers no mapping, so an
		// ACTUAL request must still pass (only a genuine cross-origin PREFLIGHT is denied) — else
		// every same-origin write would 403 in production. Regression test for the review finding.
		mockMvc.perform(get("/api/venues")
						.header("Origin", "https://riviera-sunbed-booking.onrender.com"))
				.andExpect(status().isOk());
	}
}
