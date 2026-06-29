package ai.riviera.platform;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Application-level security for the scaffold. The {@code spring-boot-starter-security}
 * dependency locks every endpoint by default, which would stop the app booting a
 * usable health check — so this permits the actuator health endpoint and requires
 * authentication for everything else.
 *
 * <p>This is an intentionally minimal placeholder. The real authentication model
 * (staff, admin, booking-code verification) is a later concern and will replace this.
 * Public tourist reads (the venue/beach-map catalogue, U1) are permitted; everything
 * else still requires authentication.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
				.cors(Customizer.withDefaults())
				// Public guest checkout (U3): the booking POST is token-less and stateless (no
				// session, no auth), so CSRF — which protects cookie/session-authenticated
				// requests — does not apply. Scope the exemption to exactly that endpoint.
				.csrf(csrf -> csrf.ignoringRequestMatchers("/api/bookings"))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/bookings").permitAll()
						.anyRequest().authenticated())
				.httpBasic(Customizer.withDefaults());
		return http.build();
	}
}
