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
				// requests — does not apply. The matcher is the EXACT path "/api/bookings", so it
				// covers only this endpoint (a later sub-path like "/api/bookings/{code}" is not
				// matched). Only POST is mapped/permitted here; other methods 401 regardless.
				// The Stripe webhook (U4) is a server-to-server POST authenticated by its own
				// signature header (invariant #8), not a session/cookie — so CSRF does not apply
				// and it must be reachable without auth. Its security IS the signature check in
				// StripeWebhookController; an unverified call is rejected there with 400.
				.csrf(csrf -> csrf.ignoringRequestMatchers("/api/bookings",
						"/api/bookings/*/cancel", "/api/payments/stripe/webhook"))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/bookings").permitAll()
						// View a booking by its code (U6) — the code is the bearer credential
						// (invariant #7), so knowing it authorizes the read. One path segment only.
						.requestMatchers(HttpMethod.GET, "/api/bookings/*").permitAll()
						// Cancel a booking by its code (U6) — authorized by the code (invariant #7),
						// stateless/token-less (CSRF-exempt above). The amount is server-computed.
						.requestMatchers(HttpMethod.POST, "/api/bookings/*/cancel").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/payments/stripe/webhook").permitAll()
						.anyRequest().authenticated())
				.httpBasic(Customizer.withDefaults());
		return http.build();
	}
}
