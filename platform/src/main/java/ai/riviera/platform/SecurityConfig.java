package ai.riviera.platform;

import java.time.Clock;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.filter.CorsFilter;

import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * Application-level security. The {@code spring-boot-starter-security} dependency locks every
 * endpoint by default, which would stop the app booting a usable health check — so this permits the
 * actuator health endpoint and requires authentication for everything else.
 *
 * <p>Public tourist reads (the venue/beach-map catalogue, U1) are permitted; the venue write +
 * staff/admin surfaces are gated behind {@code httpBasic} with role {@code OPERATOR}. Credentials are
 * <strong>per-operator and DB-backed</strong> (#74): {@link #operatorDetailsService} loads each
 * operator's stored hash from the {@code operator} module ({@link OperatorAccounts}) and Spring
 * Security's {@code DaoAuthenticationProvider} verifies it against the delegating
 * {@link #passwordEncoder()} — no shared password, no JWT, no custom token filter. The bootstrap
 * operator's credential is provisioned from {@code RIVIERA_OPERATOR_PASSWORD} at startup
 * ({@link OperatorCredentialInitializer}); additional operators are provisioned via the
 * {@code operator} module's provisioning port. The per-<em>venue</em> authorization (invariant #13)
 * is object-level and enforced in the application services, not here.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({RivieraOperatorProperties.class, RateLimitProperties.class})
class SecurityConfig {

	/** The single role that gates the U7 operator write surface. */
	private static final String OPERATOR_ROLE = "OPERATOR";
	/** A single laid-out set (PATCH/DELETE target); also CSRF-exempt as a token-less write path. */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";
	/** A set's per-day staff availability (U8 mark POST / release DELETE); CSRF-exempt token-less write. */
	private static final String SET_AVAILABILITY_PATH = "/api/venues/*/sets/*/availability";
	/** The operator-only staff daily-bookings read (U8); must be gated BEFORE the public venue GET. */
	private static final String STAFF_BOOKINGS_PATH = "/api/venues/*/bookings";
	/** The admin weather-refund write (U9); token-less operator POST, CSRF-exempt like the other writes. */
	private static final String WEATHER_REFUND_PATH = "/api/venues/*/weather-refund";
	/** The operator-only per-venue payout ledger read (U9); must be gated BEFORE the public venue GET. */
	private static final String PAYOUT_LEDGER_PATH = "/api/venues/*/payout-ledger";
	/** The operator-only pending-requests queue (#98); must be gated BEFORE the public venue GET. */
	private static final String BOOKING_REQUESTS_PATH = "/api/venues/*/booking-requests";
	/** Accept/decline a pending request (#98); token-less operator POSTs, CSRF-exempt like the rest. */
	private static final String BOOKING_REQUEST_ACCEPT_PATH = "/api/venues/*/booking-requests/*/accept";
	private static final String BOOKING_REQUEST_DECLINE_PATH = "/api/venues/*/booking-requests/*/decline";
	/** The operator-only weekly BKT payout-batch report (U9): generate (POST) / list (GET). */
	private static final String PAYOUT_BATCHES_PATH = "/api/admin/payout-batches";
	/** A single payout batch (U9): status transition (PATCH). CSRF-exempt token-less write. */
	private static final String PAYOUT_BATCH_ITEM_PATH = "/api/admin/payout-batches/*";

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, RateLimitProperties rateLimitProperties,
			Clock clock) throws Exception {
		http
				.cors(Customizer.withDefaults())
				// Per-IP + per-code rate limiting for the public booking endpoints (issue #56): runs
				// just after CORS so a preflight is handled first (and is skipped by the filter anyway),
				// and before authorization — the booking endpoints are permitAll, so the code IS the
				// authorization and the 200/404 oracle must be throttled. App-level concern, not a module.
				.addFilterAfter(new RateLimitFilter(rateLimitProperties, clock), CorsFilter.class)
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
						"/api/venues", "/api/venues/*/sets", SET_ITEM_PATH, SET_AVAILABILITY_PATH,
						WEATHER_REFUND_PATH, PAYOUT_BATCHES_PATH, PAYOUT_BATCH_ITEM_PATH,
						BOOKING_REQUEST_ACCEPT_PATH, BOOKING_REQUEST_DECLINE_PATH))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						// Staff daily-bookings read (U8) — operator-only because booking codes are bearer
						// credentials (invariant #7). MUST precede the public "GET /api/venues/**" below,
						// or codes would leak to anyone (first match wins in Spring Security).
						.requestMatchers(HttpMethod.GET, STAFF_BOOKINGS_PATH).hasRole(OPERATOR_ROLE)
						// Per-venue payout ledger read (U9) — operator-only venue financial data. MUST
						// precede the public "GET /api/venues/**" below (first match wins).
						.requestMatchers(HttpMethod.GET, PAYOUT_LEDGER_PATH).hasRole(OPERATOR_ROLE)
						// Admin weather refund (U9) — operator-only: it issues real refunds + payout
						// reversals for a washed-out venue+date (invariant #10).
						.requestMatchers(HttpMethod.POST, WEATHER_REFUND_PATH).hasRole(OPERATOR_ROLE)
						// Weekly BKT payout-batch report (U9) — operator-only across all methods
						// (generate/list/transition). A new /api/admin namespace, gated explicitly.
						.requestMatchers(PAYOUT_BATCHES_PATH, PAYOUT_BATCH_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						// Staff tap-to-mark walk-in (U8) — operator-only mark/release of (set, date).
						.requestMatchers(HttpMethod.POST, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
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

	/** Delegating encoder ({@code {bcrypt}} by default) — used to verify the stored per-operator hash. */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/**
	 * The per-operator {@link UserDetailsService} (#74): each login is resolved to a DB-backed operator
	 * account via the {@code operator} module's {@link OperatorAccounts} port and verified against the
	 * stored hash by {@code DaoAuthenticationProvider} + {@link #passwordEncoder()}. Defining it here
	 * replaces both Spring Boot's auto-generated default user and the old single shared in-memory
	 * operator. Credentials are provisioned into the DB (bootstrap operator at startup via
	 * {@link OperatorCredentialInitializer}; others via the provisioning port) — nothing is held in
	 * memory here.
	 */
	@Bean
	UserDetailsService operatorDetailsService(OperatorAccounts accounts) {
		return new OperatorUserDetailsService(accounts);
	}
}
