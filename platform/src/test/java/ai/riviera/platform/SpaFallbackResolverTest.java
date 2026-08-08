package ai.riviera.platform;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

import ai.riviera.platform.SpaWebConfig.SpaFallbackResolver;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Direct unit test for the SPA fallback resolver. Exercises the resolver's branches
 * head-on — including the backend-path guard a MockMvc slice can't drive (a request only reaches
 * the resolver past the security filter chain, so an anonymous {@code /api} 401s first), and the
 * empty-path root that the welcome-page mapping normally intercepts. Complements {@link SpaShellTest}
 * (which proves the HTTP-level behaviour through the full web stack).
 */
class SpaFallbackResolverTest {

	private final SpaFallbackResolver resolver = new SpaFallbackResolver();
	private final Resource location = new ClassPathResource("static/");

	@Test
	void backendPathsNeverResolveToTheShell() throws IOException {
		// Defensive: an authenticated-but-unmapped /api or /actuator path must resolve to nothing
		// (→ 404), never the SPA shell — a stale index.html for an /api call would mask real errors.
		assertNull(resolver.getResource("api/whatever", location));
		assertNull(resolver.getResource("actuator/env", location));
	}

	@Test
	void existingAssetResolvesMissingAssetIsNullRouteAndRootFallBackToShell() throws IOException {
		assertTrue(resolver.getResource("index.html", location).exists());  // a real bundled asset
		assertNull(resolver.getResource("chunk-STALE.js", location));       // missing asset → 404
		assertTrue(resolver.getResource("operator/1", location).exists());  // deep-link route → shell
		assertTrue(resolver.getResource("", location).exists());            // "/" → shell
	}
}
