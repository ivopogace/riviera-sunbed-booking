package ai.riviera.platform;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						.anyRequest().authenticated())
				.httpBasic(Customizer.withDefaults());
		return http.build();
	}
}
