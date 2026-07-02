package ai.riviera.platform;

import java.time.Clock;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.CorsFilter;

import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * Application-level security. The {@code spring-boot-starter-security} dependency locks every
 * endpoint by default, which would stop the app booting a usable health check — so this permits the
 * actuator health endpoint and requires authentication for everything else.
 *
 * <p>Public tourist reads (the venue/beach-map catalogue, U1) are permitted; the venue write +
 * staff/admin surfaces are gated behind a <strong>server-side session</strong> with role
 * {@code OPERATOR} (issue #109, design D-1): an operator signs in once via
 * {@code POST /api/auth/operator/login} ({@code AuthController} driving the framework
 * {@link AuthenticationManager}) and rides an {@code HttpOnly; Secure; SameSite=Lax} cookie —
 * sessions persist in Postgres via Spring Session JDBC (V19) so a restart keeps operators signed
 * in. Credentials are <strong>per-operator and DB-backed</strong> (#74):
 * {@link #operatorDetailsService} loads each operator's stored hash from the {@code operator}
 * module ({@link OperatorAccounts}) and {@code DaoAuthenticationProvider} verifies it against the
 * delegating {@link #passwordEncoder()} — no shared password, no JWT, no custom token filter. The
 * bootstrap operator's credential is provisioned from {@code RIVIERA_OPERATOR_PASSWORD} at startup
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
	/** A single laid-out set (PATCH/DELETE target); session + CSRF token required (issue #109). */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";
	/** A set's per-day staff availability (U8 mark POST / release DELETE); session + CSRF token required. */
	private static final String SET_AVAILABILITY_PATH = "/api/venues/*/sets/*/availability";
	/** The operator-only staff daily-bookings read (U8); must be gated BEFORE the public venue GET. */
	private static final String STAFF_BOOKINGS_PATH = "/api/venues/*/bookings";
	/** The admin weather-refund write (U9); an operator-session POST, CSRF-protected like every write. */
	private static final String WEATHER_REFUND_PATH = "/api/venues/*/weather-refund";
	/** The operator-only per-venue payout ledger read (U9); must be gated BEFORE the public venue GET. */
	private static final String PAYOUT_LEDGER_PATH = "/api/venues/*/payout-ledger";
	/** The operator-only weekly BKT payout-batch report (U9): generate (POST) / list (GET). */
	private static final String PAYOUT_BATCHES_PATH = "/api/admin/payout-batches";
	/** A single payout batch (U9): status transition (PATCH). Session + CSRF token required. */
	private static final String PAYOUT_BATCH_ITEM_PATH = "/api/admin/payout-batches/*";
	/** The session login (issue #109, D-2 principal-typed path); anonymous by definition. */
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	/** The session logout; handled by the framework {@code LogoutFilter}, not a controller. */
	private static final String LOGOUT_PATH = "/api/auth/logout";

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
				// CSRF (issue #109, D-1 layer 2): the operator surface now rides a SESSION cookie,
				// so its writes REQUIRE the cookie-to-header token — CookieCsrfTokenRepository
				// issues the JS-readable XSRF-TOKEN cookie (Secure; SameSite=Lax), the SPA echoes
				// it as X-XSRF-TOKEN, and SpaCsrfTokenRequestHandler (the framework's documented
				// SPA recipe) resolves the raw header while keeping BREACH protection for rendered
				// tokens. The ONLY exemptions left are the genuinely token-less surfaces:
				// guest booking create/cancel — authorized by the booking code alone (invariant #7),
				// deliberately session-free — and the Stripe webhook, a server-to-server POST
				// authenticated by its signature header (invariant #8; an unverified call is
				// rejected in StripeWebhookController with 400). A CSRF rejection is answered by
				// CsrfFilter itself through the accessDeniedHandler below → 403 INVALID_CSRF_TOKEN.
				.csrf(csrf -> csrf
						.csrfTokenRepository(csrfTokenRepository())
						.csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler())
						.ignoringRequestMatchers("/api/bookings", "/api/bookings/*/cancel",
								"/api/payments/stripe/webhook"))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						// Session login (issue #109): anonymous by definition — authentication happens
						// INSIDE the endpoint (AuthController → AuthenticationManager). /api/auth/me
						// stays behind anyRequest().authenticated(); logout is the LogoutFilter below.
						.requestMatchers(HttpMethod.POST, LOGIN_PATH).permitAll()
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
				// Session logout (issue #109): the framework LogoutFilter invalidates the server
				// session and clears the context; 204 (no redirect — this is an SPA's API).
				.logout(logout -> logout
						.logoutUrl(LOGOUT_PATH)
						.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
				// Unauthenticated access to a protected endpoint → RFC-7807 401 UNAUTHENTICATED. This
				// fires in the filter chain (never reaches ApiErrorHandler), so the body is
				// hand-mirrored — the RateLimitFilter pattern (issue #97 conformance for #109).
				.exceptionHandling(handling -> handling
						.authenticationEntryPoint((request, response, exception) ->
								SecurityProblemResponses.writeUnauthenticated(response))
						.accessDeniedHandler((request, response, exception) ->
								SecurityProblemResponses.writeAccessDenied(response, exception)));
		return http.build();
	}

	/**
	 * The SPA-readable CSRF token cookie: {@code HttpOnly=false} is the point (cookie-to-header
	 * requires JS to read it — the token is not a secret from the page, it is a secret from
	 * OTHER origins); {@code Secure} + {@code SameSite=Lax} mirror the session cookie's posture.
	 */
	private static CookieCsrfTokenRepository csrfTokenRepository() {
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookieCustomizer(cookie -> cookie.secure(true).sameSite("Lax"));
		return repository;
	}

	/**
	 * The framework authentication manager (issue #109): built by Spring Security's global
	 * {@link AuthenticationConfiguration} from {@link #operatorDetailsService} +
	 * {@link #passwordEncoder()} — the exact same {@code DaoAuthenticationProvider} path Basic
	 * used, now driven by {@code AuthController}'s session login. No custom filter (D-1).
	 */
	@Bean
	AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
		return configuration.getAuthenticationManager();
	}

	/**
	 * Where {@code AuthController} saves the authenticated context: the HTTP session — which
	 * Spring Session transparently persists to Postgres (V19). The filter chain's default
	 * delegating repository reads the same {@code SPRING_SECURITY_CONTEXT} attribute back on
	 * every later request, so save and load stay in lockstep.
	 */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/**
	 * The session cookie's D-1 posture, owned in code: {@code HttpOnly} (no JS access),
	 * {@code Secure} (browsers treat {@code http://localhost} as a trustworthy origin, so local
	 * dev still works), {@code SameSite=Lax} (CSRF layer 1 — the cookie-to-header token is
	 * layer 2). A user-defined {@link CookieSerializer} bean makes Boot's session
	 * auto-configuration back off, which keeps these flags deterministic in every environment
	 * (embedded Tomcat, mock-MVC tests, e2e) instead of depending on the
	 * {@code server.servlet.session.cookie.*} property mapping — which did not reach the Spring
	 * Session cookie under a mock web environment. Pinned by {@code AuthSessionIT}.
	 */
	@Bean
	CookieSerializer cookieSerializer() {
		DefaultCookieSerializer serializer = new DefaultCookieSerializer();
		serializer.setCookieName("SESSION");
		serializer.setUseHttpOnlyCookie(true);
		serializer.setUseSecureCookie(true);
		serializer.setSameSite("Lax");
		return serializer;
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
