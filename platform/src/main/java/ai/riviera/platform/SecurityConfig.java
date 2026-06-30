package ai.riviera.platform;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Application-level security for the scaffold. The {@code spring-boot-starter-security}
 * dependency locks every endpoint by default, which would stop the app booting a
 * usable health check — so this permits the actuator health endpoint and requires
 * authentication for everything else.
 *
 * <p>This is an intentionally minimal placeholder. The real authentication model
 * (staff, admin, booking-code verification) is a later concern and will replace this.
 * Public tourist reads (the venue/beach-map catalogue, U1) are permitted; the venue
 * onboarding + beach-map write API (U7) is gated behind a single explicit operator
 * credential (httpBasic, role {@code OPERATOR}) defined by {@link #operatorDetailsService}.
 * The operator's password is supplied per environment via {@code RIVIERA_OPERATOR_PASSWORD}
 * ({@link RivieraOperatorProperties}) and is never committed; everything else still requires
 * authentication.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(RivieraOperatorProperties.class)
class SecurityConfig {

	private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

	/** The single role that gates the U7 operator write surface. */
	private static final String OPERATOR_ROLE = "OPERATOR";
	/** A single laid-out set (PATCH/DELETE target); also CSRF-exempt as a token-less write path. */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";

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
				// The venue write API (U7) is a stateless operator surface authenticated by httpBasic
				// (no session/cookie), so CSRF — which protects cookie/session-authenticated
				// requests — does not apply; ignore it on those paths like the other token-less APIs.
				.csrf(csrf -> csrf.ignoringRequestMatchers("/api/bookings",
						"/api/bookings/*/cancel", "/api/payments/stripe/webhook",
						"/api/venues", "/api/venues/*/sets", SET_ITEM_PATH))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						// Venue onboarding + beach-map editing (U7) — an operator-only write surface.
						// The real staff/admin identity model is deferred; for now a single configured
						// operator credential (role OPERATOR) gates every write. GET stays public above.
						.requestMatchers(HttpMethod.POST, "/api/venues").hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, "/api/venues/*/sets").hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PATCH, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
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

	/** Delegating encoder so the in-memory operator password is stored hashed, never in clear. */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/**
	 * The single operator account for the U7 write API. Defining this {@link UserDetailsService}
	 * replaces Spring Boot's auto-generated default user. The password comes from
	 * {@code RIVIERA_OPERATOR_PASSWORD} (never committed); when it is blank — local dev, or a test
	 * that doesn't set it — a random one is generated so the context still boots, leaving the write
	 * API effectively locked until a real password is configured. The generated value is NOT logged
	 * (credentials are secrets, invariant #7 posture); set the env var to obtain a known login.
	 */
	@Bean
	UserDetailsService operatorDetailsService(RivieraOperatorProperties operator, PasswordEncoder encoder) {
		String password = operator.password();
		if (password == null || password.isBlank()) {
			password = UUID.randomUUID().toString();
			log.warn("No RIVIERA_OPERATOR_PASSWORD set — generated a random operator password for this "
					+ "run; the venue write API is locked until you configure one. Set RIVIERA_OPERATOR_PASSWORD "
					+ "to log in as operator '{}'.", operator.username());
		}
		UserDetails user = User.withUsername(operator.username())
				.password(encoder.encode(password))
				.roles(OPERATOR_ROLE)
				.build();
		return new InMemoryUserDetailsManager(user);
	}
}
