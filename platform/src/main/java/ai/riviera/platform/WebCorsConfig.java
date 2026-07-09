package ai.riviera.platform;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Cross-origin policy for browser callers. Since #110 the deployed sandbox is
 * <strong>same-origin</strong> (Spring Boot serves the SPA), so the default origin list is
 * empty — no cross-origin caller, so no CORS is needed there. The list is still configurable
 * ({@code app.web.cors.allowed-origins}, overridable via the {@code CORS_ALLOWED_ORIGINS} env
 * var, comma-separated) for environments that ARE cross-origin: local dev's Angular dev server
 * ({@code :4200 → :8080}) sets it via the {@code dev} profile.
 *
 * <p>Consumed by {@link SecurityConfig} via {@code http.cors(...)}.
 */
@Configuration
class WebCorsConfig {

	private final List<String> allowedOrigins;

	WebCorsConfig(@Value("${app.web.cors.allowed-origins}") List<String> allowedOrigins) {
		// A blank entry (an empty property binds to [""]) must never become an "allowed origin";
		// filter blanks so an empty config means "no cross-origin caller" (R-6), not a malformed
		// empty-string origin that could match an empty Origin header.
		this.allowedOrigins = allowedOrigins.stream().filter(origin -> !origin.isBlank()).toList();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		if (allowedOrigins.isEmpty()) {
			// Same-origin deployment (#110): no cross-origin browser caller, so register NO mapping —
			// getCorsConfiguration then returns null for every request. This matters behind Render's
			// TLS-terminating proxy: with no forward-headers strategy Spring sees the internal scheme
			// as http while the browser's Origin is https, so CorsUtils.isCorsRequest treats a
			// SAME-origin POST as cross-origin. With a null config DefaultCorsProcessor lets an actual
			// request continue (only a genuine cross-origin PREFLIGHT is rejected) — so same-origin
			// writes work, instead of the deny-all 403 an empty allowlist would produce (R-6).
			return source;
		}
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		// Session auth (issue #109): the browser only attaches/accepts the session + CSRF cookies
		// cross-origin when credentials are allowed — safe here because the origins above are an
		// explicit allowlist, never "*". (Local dev and the real-backend e2e run :4200 → :8080.)
		config.setAllowCredentials(true);
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
