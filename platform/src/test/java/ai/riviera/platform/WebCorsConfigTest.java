package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the CORS contract for the deployed frontend (invariant: FE↔BE works across
 * origins). A browser preflight from the configured Pages origin must be answered
 * with a matching {@code Access-Control-Allow-Origin}; an unknown origin must not be.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class})
@TestPropertySource(properties = "app.web.cors.allowed-origins=https://ivopogace.github.io")
class WebCorsConfigTest {

	@Autowired
	MockMvc mockMvc;

	@Test
	void preflightFromPagesOriginIsAllowed() throws Exception {
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://ivopogace.github.io")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isOk())
				.andExpect(header().string("Access-Control-Allow-Origin", "https://ivopogace.github.io"));
	}

	@Test
	void preflightFromUnknownOriginIsRejected() throws Exception {
		mockMvc.perform(options("/actuator/health")
						.header("Origin", "https://evil.example.com")
						.header("Access-Control-Request-Method", "GET"))
				.andExpect(status().isForbidden());
	}
}
