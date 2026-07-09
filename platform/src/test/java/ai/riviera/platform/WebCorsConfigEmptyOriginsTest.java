package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
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
	void anyCrossOriginPreflightIsRejectedWhenNoOriginsConfigured() throws Exception {
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://ivopogace.github.io")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isForbidden());
	}
}
