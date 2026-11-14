package ai.riviera.platform.web.adapter.in;

import java.io.IOException;

import org.jspecify.annotations.NonNull;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the Angular SPA baked into {@code classpath:/static/}: hashed assets directly, and a client route's
 * locale shell ({@link SpaLocale}) so a deep-link refresh boots the app; {@link SpaShellController} serves the
 * routes whose shell carries link-preview tags. Unmapped {@code /api/**} and {@code /actuator/**} never get the
 * shell. Same-origin hosting keeps the session and CSRF cookies first-party (ADR-0004); authorization is
 * {@code SecurityConfig}'s SPA chain.
 */
@Component
public class SpaWebConfig implements WebMvcConfigurer {

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
	 * link like {@code /sq/venues/1}) with no matching file, falls back to its locale's {@code index.html}
	 * so the Angular router owns it. A missing path that looks like an ASSET (has a file extension — e.g.
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
			// An empty path (a request for "/") or an extensionless client route → its locale's shell.
			Resource index = SpaLocale.ofResourcePath(resourcePath).index();
			return index.exists() ? index : null;
		}

		/** True when the last path segment carries a file extension (a static asset, not a route). */
		private static boolean looksLikeAsset(String resourcePath) {
			return resourcePath.indexOf('.', resourcePath.lastIndexOf('/') + 1) >= 0;
		}
	}
}
