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
 * Serves the bundled Angular single-page app (issue #110). The built SPA is baked into
 * {@code classpath:/static/} by the Docker image's Node stage ({@code platform/Dockerfile});
 * Spring serves its hashed assets directly and falls back to {@code index.html} for
 * client-side routes (deep links like {@code /operator/1}) so a browser refresh boots the
 * app instead of hard-404ing. Backend paths are excluded from the fallback — an unmapped
 * {@code /api/**} or {@code /actuator/**} request stays a 404/401, never the SPA shell.
 *
 * <p>Same-origin hosting is the whole point: with the SPA and {@code /api/**} on one origin,
 * the S1 session + CSRF cookies (issue #109) are first-party, so {@code SameSite=Lax} and the
 * {@code .spa()} cookie-to-header echo work with <strong>no auth-model change</strong>. The
 * public-shell authorization lives in {@link SecurityConfig}'s SPA filter chain; this class
 * only maps request paths to static resources.
 *
 * <p>An app-wide web concern, so it lives in the root package next to {@link SecurityConfig}
 * and {@link WebCorsConfig} — not inside a bounded-context module (invariant #11).
 */
@Component
class SpaWebConfig implements WebMvcConfigurer {

	/** The SPA entry document; every non-asset client route resolves here. */
	private static final String INDEX = "static/index.html";
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
	 * Serves the requested static asset when it exists; otherwise returns {@code index.html}
	 * so the Angular router owns the route. Returns {@code null} (→ not-found) for backend
	 * paths so an unmapped {@code /api}/{@code /actuator} request is never masked as the shell.
	 */
	private static final class SpaFallbackResolver extends PathResourceResolver {
		@Override
		protected Resource getResource(String resourcePath, @NonNull Resource location) throws IOException {
			if (resourcePath.startsWith(API_PREFIX) || resourcePath.startsWith(ACTUATOR_PREFIX)) {
				return null;
			}
			// An empty path (a request for "/") resolves to the static/ DIRECTORY, which "exists";
			// serve the shell for it instead of the directory. Every real asset has a non-empty path.
			if (!resourcePath.isEmpty()) {
				Resource requested = location.createRelative(resourcePath);
				if (requested.exists() && requested.isReadable()) {
					return requested;
				}
			}
			Resource index = new ClassPathResource(INDEX);
			return index.exists() ? index : null;
		}
	}
}
