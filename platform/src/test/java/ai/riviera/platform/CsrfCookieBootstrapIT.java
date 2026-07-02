package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pins the SPA's CSRF bootstrap (issue #109): any response — here the public venue list a
 * fresh browser loads first — issues the JS-readable {@code XSRF-TOKEN} cookie the frontend
 * echoes back as {@code X-XSRF-TOKEN} on writes, without creating a server session.
 *
 * <p>Deliberately its own class, and it must NEVER use the {@code csrf()} test post-processor
 * (nor share a context with tests that do): {@code SecurityMockMvcRequestPostProcessors.csrf()}
 * permanently swaps the shared {@code CsrfFilter}'s repository for a session-backed test one
 * ({@code WebTestUtils.setCsrfTokenRepository}), after which real cookie issuance can no longer
 * be observed in that context. The distinct {@code @SpringBootTest} property keeps this context
 * un-cached from the classes that log in.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.csrf-bootstrap-it.marker=isolated-context")
@AutoConfigureMockMvc
class CsrfCookieBootstrapIT {

	@Autowired
	MockMvc mvc;

	@Test
	void xsrfCookieIsIssuedOnAPublicReadWithHardenedFlags() throws Exception {
		mvc.perform(get("/api/venues"))
				.andExpect(status().isOk())
				.andExpect(cookie().exists("XSRF-TOKEN"))
				// The SPA must READ this cookie (cookie-to-header) — HttpOnly=false is the point.
				.andExpect(cookie().httpOnly("XSRF-TOKEN", false))
				.andExpect(cookie().secure("XSRF-TOKEN", true))
				.andExpect(cookie().attribute("XSRF-TOKEN", "SameSite", "Lax"))
				// No server session for an anonymous read: the token lives in the cookie alone.
				.andExpect(cookie().doesNotExist("SESSION"));
	}
}
