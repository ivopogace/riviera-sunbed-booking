package ai.riviera.platform;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Cross-origin policy for browser callers. The deployed sandbox is <strong>same-origin</strong>
 * (Spring Boot serves the SPA), so the default origin list is empty and no CORS is needed. It
 * stays configurable ({@code app.web.cors.allowed-origins}, env {@code CORS_ALLOWED_ORIGINS},
 * comma-separated) for cross-origin environments: the {@code dev} profile sets it for the Angular
 * dev server ({@code :4200 → :8080}). Consumed by {@link SecurityConfig} via
 * {@code http.cors(...)}.
 */
@Configuration
class WebCorsConfig {

	private final List<String> allowedOrigins;

	WebCorsConfig(@Value("${app.web.cors.allowed-origins}") List<String> allowedOrigins) {
		// A blank entry (an empty property binds to [""]) must never become an "allowed origin";
		// filter blanks so an empty config means "no cross-origin caller", not a malformed
		// empty-string origin that could match an empty Origin header.
		this.allowedOrigins = allowedOrigins.stream().filter(origin -> !origin.isBlank()).toList();
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		if (allowedOrigins.isEmpty()) {
			// Same-origin deployment: no cross-origin browser caller, so register NO mapping —
			// getCorsConfiguration then returns null for every request. This matters behind Render's
			// TLS-terminating proxy: with no forward-headers strategy Spring sees the internal scheme
			// as http while the browser's Origin is https, so CorsUtils.isCorsRequest treats a
			// SAME-origin POST as cross-origin. With a null config DefaultCorsProcessor lets an actual
			// request continue (only a genuine cross-origin PREFLIGHT is rejected) — so same-origin
			// writes work, instead of the deny-all 403 an empty allowlist would produce.
			return source;
		}
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		// Session auth: the browser only attaches/accepts the session + CSRF cookies
		// cross-origin when credentials are allowed — safe here because the origins above are an
		// explicit allowlist, never "*". (Local dev and the real-backend e2e run :4200 → :8080.)
		config.setAllowCredentials(true);
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
