package ai.riviera.platform;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Cross-origin policy for the deployed frontend. The Angular app is served from a
 * different origin than the backend (GitHub Pages → Render), so the browser needs an
 * explicit {@code Access-Control-Allow-Origin} to call even the public health
 * endpoint. Allowed origins come from configuration
 * ({@code app.web.cors.allowed-origins}, overridable via the
 * {@code APP_WEB_CORS_ALLOWED_ORIGINS} env var) so no origin is hard-coded into the
 * deploy — non-prod defaults to the project's GitHub Pages origin.
 *
 * <p>Consumed by {@link SecurityConfig} via {@code http.cors(...)}.
 */
@Configuration
class WebCorsConfig {

	private final List<String> allowedOrigins;

	WebCorsConfig(@Value("${app.web.cors.allowed-origins}") List<String> allowedOrigins) {
		this.allowedOrigins = allowedOrigins;
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOrigins(allowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
