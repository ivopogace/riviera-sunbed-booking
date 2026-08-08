package ai.riviera.platform;

import java.io.IOException;

import org.jspecify.annotations.NonNull;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the bundled Angular single-page app. The built SPA is baked into
 * {@code classpath:/static/} by the Docker image's Node stage ({@code platform/Dockerfile});
 * Spring serves its hashed assets directly and falls back to {@code index.html} for
 * client-side routes (deep links like {@code /operator/1}) so a browser refresh boots the
 * app instead of hard-404ing. Backend paths are excluded from the fallback — an unmapped
 * {@code /api/**} or {@code /actuator/**} request stays a 404/401, never the SPA shell.
 *
 * <p>Same-origin hosting is the whole point: with the SPA and {@code /api/**} on one origin,
 * the S1 session + CSRF cookies are first-party, so {@code SameSite=Lax} and the
 * {@code .spa()} cookie-to-header echo work with <strong>no auth-model change</strong>. The
 * public-shell authorization lives in {@link SecurityConfig}'s SPA filter chain; this class
 * only maps request paths to static resources.
 *
 * <p>An app-wide web concern, so it lives in the root package next to {@link SecurityConfig}
 * and {@link WebCorsConfig} — not inside a bounded-context module (invariant #11).
 */
@Component
class SpaWebConfig implements WebMvcConfigurer {

	/** The SPA entry document, resolved once; every extensionless client route falls back here. */
	private static final Resource INDEX = new ClassPathResource("static/index.html");
	/** Backend path prefixes (relative, no leading slash) that must never be served the shell. */
	private static final String API_PREFIX = "api/";
	private static final String ACTUATOR_PREFIX = "actuator/";

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/**")
				.addResourceLocations("classpath:/static/")
				.resourceChain(true)
				.addResolver(new SpaFallbackResolver());
	}

	/**
	 * Serves the requested static asset when it exists; for an extensionless CLIENT ROUTE (a deep
	 * link like {@code /operator/1}) with no matching file, falls back to {@code index.html} so the
	 * Angular router owns it. A missing path that looks like an ASSET (has a file extension — e.g.
	 * a stale hashed {@code .js} chunk after a redeploy) returns {@code null} (→ 404), NOT the
	 * shell: serving HTML for a {@code .js} makes the browser refuse it as a module and the page
	 * breaks instead of recovering with a reload. Backend paths never fall back either.
	 */
	static final class SpaFallbackResolver extends PathResourceResolver {
		@Override
		protected Resource getResource(String resourcePath, @NonNull Resource location) throws IOException {
			if (resourcePath.startsWith(API_PREFIX) || resourcePath.startsWith(ACTUATOR_PREFIX)) {
				return null;
			}
			if (!resourcePath.isEmpty()) {
				// Delegate real-asset resolution to the base resolver: it applies its own
				// path-traversal guard (createRelative + checkResource), so a user-controlled path
				// can never escape static/ — and the resolution sink stays in framework code.
				Resource resolved = super.getResource(resourcePath, location);
				if (resolved != null) {
					return resolved;
				}
				// No matching file: a missing ASSET must 404, not serve the shell (see the note).
				if (looksLikeAsset(resourcePath)) {
					return null;
				}
			}
			// An empty path (a request for "/") or an extensionless client route → the SPA shell.
			return INDEX.exists() ? INDEX : null;
		}

		/** True when the last path segment carries a file extension (a static asset, not a route). */
		private static boolean looksLikeAsset(String resourcePath) {
			return resourcePath.indexOf('.', resourcePath.lastIndexOf('/') + 1) >= 0;
		}
	}
}
