package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Issue #110 (same-origin hosting): Spring Boot serves the bundled Angular SPA, so the app
 * shell and its client-side deep links are <strong>public</strong> while {@code /api/**} keeps
 * its per-endpoint rules. Pins the {@link SecurityConfig} carve-out (a new SPA filter chain
 * must not widen the API surface — R-2) and the {@link SpaWebConfig} deep-link fallback (R-3).
 *
 * <p>A stub {@code index.html} under {@code src/test/resources/static/} lets the slice assert
 * the fallback without a real Angular build. Every assertion is anonymous — the point is that
 * the shell is reachable without a session while the API stays gated — so this is a fast
 * {@code @WebMvcTest} slice (no Testcontainers), the same shape as {@link WebCorsConfigTest}.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, SpaWebConfig.class, WebSliceStubs.class})
@TestPropertySource(properties = "app.web.cors.allowed-origins=https://ivopogace.github.io")
class SpaShellTest {

	@Autowired
	MockMvc mvc;

	@Test
	void rootServesTheSpaShell() throws Exception {
		// GET / is handled by Spring Boot's welcome-page mapping, which forwards to index.html
		// (the SPA shell). MockMvc records the forward rather than following it; the real
		// DispatcherServlet re-dispatches it to the bundled static index.html. The deep-link
		// test below proves the actual shell content is served for non-root client routes.
		mvc.perform(get("/"))
				.andExpect(status().isOk())
				.andExpect(forwardedUrl("index.html"));
	}

	@Test
	void deepLinkFallsBackToTheShell() throws Exception {
		// A client-side route has no matching file; the SPA fallback serves index.html so a
		// browser refresh on /operator/1 boots the app instead of hard-404ing (AC-3).
		mvc.perform(get("/operator/1"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
				.andExpect(content().string(containsString("app-root")));
	}

	@Test
	void shellIsPublicToAnonymous() throws Exception {
		// AC-5: the shell must never 401 — it did before the carve-out, under
		// anyRequest().authenticated(), which is exactly what broke sign-in in the sandbox.
		mvc.perform(get("/")).andExpect(status().isOk());
		mvc.perform(get("/operator/1")).andExpect(status().isOk());
	}

	@Test
	void publicApiReadStillWorks() throws Exception {
		// AC-4: the public tourist read is unchanged (stub catalogue → empty list, 200).
		mvc.perform(get("/api/venues")).andExpect(status().isOk());
	}

	@Test
	void protectedApiStillRequiresAuth() throws Exception {
		// AC-4: /api/auth/me stays behind authentication — the SPA chain must not open it.
		mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void unknownApiPathIsNotMaskedAsTheShell() throws Exception {
		// AC-4 / R-3: an unmapped /api path stays a 401 to anonymous (the API chain's
		// authenticated() catch-all), never the SPA shell — the fallback resolver excludes
		// api/ + actuator/ prefixes, and the API chain authorizes before the resource handler.
		mvc.perform(get("/api/does-not-exist")).andExpect(status().isUnauthorized());
	}
}
