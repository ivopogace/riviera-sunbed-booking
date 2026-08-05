package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.shared.CurrentOperator;
import java.time.Clock;

import tools.jackson.databind.ObjectMapper;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.CorsFilter;

import ai.riviera.platform.customer.api.CustomerAccounts;
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
 * sessions persist in Postgres via Spring Session JDBC (V20) so a restart keeps operators signed
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
@EnableConfigurationProperties({RivieraOperatorProperties.class, RateLimitProperties.class,
		RecoveryProperties.class})
class SecurityConfig {

	/** The single role that gates the U7 operator write surface. */
	private static final String OPERATOR_ROLE = "OPERATOR";
	/** The role gating the signed-in tourist's own-bookings surface (S3 #114). */
	private static final String CUSTOMER_ROLE = "CUSTOMER";
	/** The platform-admin role that gates the {@code /api/admin/operators/**} approval surface (S6 #115). */
	private static final String ADMIN_ROLE = "ADMIN";
	/** A single laid-out set (PATCH/DELETE target); session + CSRF token required (issue #109). */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";
	/** A single venue item (PATCH profile edit — amenities + distance-to-water, T7 #140); session + CSRF. */
	private static final String VENUE_ITEM_PATH = "/api/venues/*";
	/**
	 * The two operator-only venue-write {@code PUT}s — bulk beach-map layout replace (O3 #172) and row
	 * reprice (O4 #174). Both had <strong>no matcher at all</strong> until #328: the block gated
	 * {@code GET}/{@code POST}/{@code PATCH}/{@code DELETE} and {@code PUT} zero times, so both fell
	 * through to {@code anyRequest().authenticated()} where any authenticated principal — a signed-in
	 * tourist included — passed the filter, leaving only {@code CurrentOperator.require} to stop them.
	 *
	 * <p>Gated per-verb rather than by namespace, deliberately: unlike {@code /api/me/**} (#317, where a
	 * method-agnostic rule is right because every verb belongs to one principal type),
	 * {@code /api/venues/**} mixes the <em>public</em> tourist {@code GET} with operator-only writes, so
	 * a namespace rule would be wrong here. The per-verb shape's weakness — a newly mapped verb falling
	 * through unnoticed, three times over (#316, #317, #328) — is covered by
	 * {@code EndpointRoleGateCoverageTest} instead. {@code *} matches exactly one segment, so neither
	 * pattern widens. Object-level ownership (invariant #13) stays in {@code VenueAdminService}; this is
	 * only the role layer above it. Session + CSRF token required like every venue write.
	 */
	private static final String BEACH_MAP_PATH = "/api/venues/*/beach-map";
	private static final String ROW_PRICE_PATH = "/api/venues/*/rows/*/price";
	// A single venue photo slot (#142): POST upload / DELETE remove, operator-only. The public GET
	// serving path /api/venues/*/photos/(hash) falls under "GET /api/venues/**" below.
	private static final String PHOTO_ITEM_PATH = "/api/venues/*/photos/*";
	/** A set's per-day staff availability (U8 mark POST / release DELETE); session + CSRF token required. */
	private static final String SET_AVAILABILITY_PATH = "/api/venues/*/sets/*/availability";
	/** The operator-only staff daily-bookings read (U8); must be gated BEFORE the public venue GET. */
	private static final String STAFF_BOOKINGS_PATH = "/api/venues/*/bookings";
	/** The admin weather-refund write (U9); an operator-session POST, CSRF-protected like every write. */
	private static final String WEATHER_REFUND_PATH = "/api/venues/*/weather-refund";
	/** The operator-only per-venue payout ledger read (U9); must be gated BEFORE the public venue GET. */
	private static final String PAYOUT_LEDGER_PATH = "/api/venues/*/payout-ledger";
	/**
	 * The operator-only venue admin-profile read (O8 #177): it returns the venue's commission rate +
	 * payout currency, which must NEVER reach the public tourist read. MUST be gated BEFORE the public
	 * "GET /api/venues/**" below (first match wins), exactly like the payout ledger + takings reads.
	 */
	private static final String VENUE_PROFILE_PATH = "/api/venues/*/profile";
	/** The operator-only per-venue daily online-takings read (#171, O2); gated BEFORE the public venue GET. */
	private static final String TAKINGS_PATH = "/api/venues/*/takings";
	/**
	 * The operator-only per-venue daily availability-states read (#207): per-set
	 * {@code BOOKED_ONLINE}/{@code STAFF_MARKED} tokens — the hold split the public FREE/TAKEN map
	 * hides — so it MUST be gated BEFORE the public "GET /api/venues/**" below (first match wins).
	 * A single {@code *} segment: never collides with the deeper {@code /sets/*}/availability writes.
	 */
	private static final String DAILY_AVAILABILITY_PATH = "/api/venues/*/availability";
	/**
	 * The signed-in operator's own-venues read (S9 #277) — {@code MyVenuesController}. It returns the
	 * operator↔venue ownership map for the session principal, so it MUST be gated BEFORE the public
	 * "GET /api/venues/**" below (first match wins): without that ordering it would fall through to
	 * {@code permitAll} and hand the ownership map to anyone. A literal segment, so it never collides
	 * with the venue-scoped {@code /api/venues/*} rules.
	 */
	private static final String MY_VENUES_PATH = "/api/venues/mine";
	/** The operator-only pending-requests queue (#98); must be gated BEFORE the public venue GET. */
	private static final String BOOKING_REQUESTS_PATH = "/api/venues/*/booking-requests";
	/** Accept/decline a pending request (#98); operator-session POSTs, CSRF token required (issue #109). */
	private static final String BOOKING_REQUEST_ACCEPT_PATH = "/api/venues/*/booking-requests/*/accept";
	private static final String BOOKING_REQUEST_DECLINE_PATH = "/api/venues/*/booking-requests/*/decline";
	/**
	 * The platform-admin weekly BKT payout-batch report (U9): generate (POST) / list (GET).
	 *
	 * <p>Tightened from {@code OPERATOR} to {@code ADMIN} by #348 A4. Neither this path nor
	 * {@link #PAYOUT_BATCH_ITEM_PATH} is venue-scoped — the GET reports every venue's
	 * gross/commission/net for the period and the PATCH addresses a batch by id — so under the
	 * {@code OPERATOR} gate any approved operator could read competitors' payout figures and mark
	 * their batches settled (object-level authorization by role alone, OWASP API #1). Invariant #13
	 * exempts {@code /api/admin/**} from per-venue ownership, which is why the role has to be the
	 * strict one: the gate is the whole authorization.
	 */
	private static final String PAYOUT_BATCHES_PATH = "/api/admin/payout-batches";
	/** A single payout batch (U9): status transition (PATCH). Session + CSRF token required. */
	private static final String PAYOUT_BATCH_ITEM_PATH = "/api/admin/payout-batches/*";
	/**
	 * The platform-admin operator-approval surface (S6 #115, design D-5): list pending registrations
	 * (GET) and approve/reject them (POST). Role-gated to {@code ADMIN} and NOT venue-scoped — a
	 * platform-wide admin action, exempt from the per-venue authorization of invariant #13, like every
	 * other {@code /api/admin/**} path (uniformly since #348 A4 retired the payout-batch carve-out).
	 */
	private static final String ADMIN_OPERATORS_PATH = "/api/admin/operators";
	private static final String ADMIN_OPERATOR_APPROVE_PATH = "/api/admin/operators/*/approve";
	private static final String ADMIN_OPERATOR_REJECT_PATH = "/api/admin/operators/*/reject";
	/** The decided-accounts list + the suspend/reinstate transitions (#128) — same ADMIN gate. */
	private static final String ADMIN_OPERATOR_ACCOUNTS_PATH = "/api/admin/operators/accounts";
	private static final String ADMIN_OPERATOR_SUSPEND_PATH = "/api/admin/operators/*/suspend";
	private static final String ADMIN_OPERATOR_REINSTATE_PATH = "/api/admin/operators/*/reinstate";
	/**
	 * Platform-admin data-subject erasure (#101 [D5]) — role-gated to {@code ADMIN}, NOT venue-scoped
	 * (the same {@code /api/admin/**} exemption from invariant #13 as the operator-approval surface).
	 */
	private static final String ADMIN_ERASURE_PATH = "/api/admin/erasure";
	/**
	 * Lifting an email suppression (#391) — the same ADMIN gate and the same {@code /api/admin/**}
	 * exemption from invariant #13. Deliberately admin-only and never self-service: a complainer
	 * un-suppressing themselves through a public endpoint would be an abuse and enumeration vector.
	 */
	private static final String ADMIN_SUPPRESSION_REINSTATE_PATH = "/api/admin/email-suppressions/reinstate";
	/**
	 * The mail outbox (#405) — what the Event Publication Registry still owes the {@code notification}
	 * module, and the lever that re-drives it without waiting for the next deploy. The same ADMIN gate
	 * and the same {@code /api/admin/**} exemption from invariant #13: this is platform-wide delivery
	 * state, owned by no venue, so per-venue ownership has nothing to check here.
	 */
	private static final String ADMIN_MAIL_OUTBOX_PATH = "/api/admin/mail-outbox";
	private static final String ADMIN_MAIL_OUTBOX_RESUBMIT_PATH = "/api/admin/mail-outbox/resubmit";
	/**
	 * The refund outbox (#454) — the mail outbox's twin on the money path: what the registry still owes
	 * {@code booking}'s refund listener, and the lever that re-drives it. The same ADMIN gate and the
	 * same {@code /api/admin/**} exemption from invariant #13; the lever's own scope (exact listener
	 * id) is what keeps it off every other listener.
	 */
	private static final String ADMIN_REFUND_OUTBOX_PATH = "/api/admin/refund-outbox";
	private static final String ADMIN_REFUND_OUTBOX_RESUBMIT_PATH = "/api/admin/refund-outbox/resubmit";
	/**
	 * The per-booking mail-delivery view and its resend (#380) — the support lever the outbox above
	 * cannot be: that one re-drives what the registry still <em>owes</em>, while this one re-sends a
	 * confirmation whose publication already completed, which is the common "never got the email" case.
	 * Same ADMIN gate and the same {@code /api/admin/**} exemption from invariant #13.
	 *
	 * <p>The lookup is a {@code POST} although it reads: its key is an email address, and a query string
	 * would deposit that address in access, proxy and browser-history logs.
	 */
	private static final String ADMIN_MAIL_DELIVERY_LOOKUP_PATH = "/api/admin/mail-deliveries/lookup";
	private static final String ADMIN_MAIL_DELIVERY_RESEND_PATH = "/api/admin/mail-deliveries/*/resend";
	/**
	 * Platform-admin venue-photo takedown (#504) — the same ADMIN gate and the same
	 * {@code /api/admin/**} exemption from invariant #13 as the operator-approval surface. Unlike the
	 * admin surfaces above it is <em>not</em> platform-wide state: it acts on one venue's data, and the
	 * exemption is the whole point. The venue-scoped {@code PHOTO_ITEM_PATH} DELETE below answers a
	 * non-owner {@code 403 NOT_VENUE_OWNER}, which is exactly the case moderation exists for, so the
	 * takedown takes a role gate instead of an ownership check — object-level authorization has nothing
	 * to check when the actor is the platform. Two single-segment wildcards: venue id, then slot.
	 */
	private static final String ADMIN_VENUE_PHOTO_PATH = "/api/admin/venues/*/photos/*";
	/**
	 * The moderation <em>read</em> that makes the takedown above usable (#511) — same ADMIN gate, same
	 * invariant-#13 exemption, and the same deliberate ownership-freedom: the venue-scoped
	 * {@code GET /api/venues/{venueId}/profile} is the only other per-slot view and it answers a
	 * non-owner {@code 403 NOT_VENUE_OWNER}, so an admin could delete a photo it could not see. One
	 * wildcard, not two: this path ends at {@code /photos}, which is what keeps it and the
	 * slot-addressed {@code DELETE} above from ever matching each other.
	 */
	private static final String ADMIN_VENUE_PHOTOS_PATH = "/api/admin/venues/*/photos";
	/**
	 * The platform-admin audit-trail read (#507, required by ADR-0013) — the latest recorded mutating
	 * {@code /api/admin/**} actions, newest first. Same ADMIN gate and the same {@code /api/admin/**}
	 * exemption from invariant #13: platform accountability state, owned by no venue. The
	 * <em>writes</em> it reads are recorded by {@link AdminAuditFilter}, registered after the
	 * authorization filter below so only actions past the gate leave a row.
	 */
	private static final String ADMIN_AUDIT_PATH = "/api/admin/audit";
	/** The namespace {@link AdminAuditFilter} audits — every mutating request under it leaves a row. */
	private static final String ADMIN_AUDIT_NAMESPACE = "/api/admin/";
	/** The session login (issue #109, D-2 principal-typed path); anonymous by definition. */
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	/**
	 * Operator self-registration (S6 #115, design D-5/D-8): anonymous by definition — it creates a
	 * {@code PENDING} account that cannot authenticate until a platform admin approves it, so nothing is
	 * signed in here. On its OWN rate-limit budget (RateLimitFilter) so register spam can never starve
	 * operator login. CSRF-protected like the other auth POSTs (the SPA holds the bootstrapped token).
	 */
	private static final String OPERATOR_REGISTER_PATH = "/api/auth/operator/register";
	/**
	 * The signed-in operator's own password change (#326, {@link OperatorAccountController}) — unlike the
	 * two paths above it is <strong>authenticated</strong>, gated to {@code OPERATOR}. It lives here rather
	 * than under {@code /api/me/**} precisely because that namespace is CUSTOMER-only and method-agnostic
	 * (see {@link #ME_PATHS}); putting it there would 403 every operator and quietly falsify that rule.
	 * On its own {@code operatorPasswordBuckets} rate-limit budget (under the existing {@code login}
	 * limit — no new property) so a change flood can never starve operator login (the #111 shared-bucket
	 * lockout). CSRF-protected like every write.
	 */
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	/** Customer session login + registration (S2 #111, D-2); anonymous by definition, like the operator login. */
	private static final String CUSTOMER_LOGIN_PATH = "/api/auth/customer/login";
	private static final String CUSTOMER_REGISTER_PATH = "/api/auth/customer/register";
	/**
	 * The signed-in tourist's own surface — my-bookings (S3 #114), set-password + verification-resend
	 * (S8 #113), self-service erasure (#101 [D5]). {@code CUSTOMER}-only, and deliberately
	 * <strong>method-agnostic</strong> (#317): {@code /api/me/**} is by definition the session customer's
	 * own resources, so every verb belongs to the same principal type. Method-scoped rules were the
	 * defect this replaces — a {@code GET}-only matcher let each new {@code POST} fall through to
	 * {@code anyRequest().authenticated()}, where only {@code CurrentCustomer.require} stopped an
	 * operator session, twice (#316 patched erasure alone). A namespace rule fails <em>closed</em> for
	 * any future verb instead of silently falling through, so this subsumes — and replaces — the former
	 * {@code GET /api/me/**} and {@code POST /api/me/erasure} matchers. Writes stay CSRF-protected (the
	 * SPA holds the bootstrapped XSRF-TOKEN); {@code CurrentCustomer.require} remains as
	 * defence-in-depth. <strong>Adding a non-customer endpoint under this prefix would make the rule
	 * wrong</strong> — put it elsewhere (as {@code GET /api/venues/mine} does for operators).
	 */
	private static final String ME_PATHS = "/api/me/**";
	/**
	 * Public customer account-recovery POSTs (S8 #113, design D-6/D-8): request a reset link, redeem a
	 * reset token, redeem a verification token. Anonymous by definition — the emailed token is the bearer
	 * credential (invariant #7); behind the {@code RateLimitFilter} recovery budget. CSRF-protected like the
	 * customer login (the SPA holds the bootstrapped XSRF-TOKEN), so NOT added to the CSRF ignore list. The
	 * authenticated set-password + resend endpoints live under {@code /api/me/**} (CUSTOMER-gated below).
	 */
	private static final String FORGOT_PASSWORD_PATH = "/api/auth/customer/forgot-password";
	private static final String RESET_PASSWORD_PATH = "/api/auth/customer/reset-password";
	private static final String VERIFY_EMAIL_PATH = "/api/auth/customer/verify-email";
	/**
	 * The SSO redirect/callback surface (S4 #112, D-3): the authorize + callback GETs and the mock IdP
	 * authorize GET. Anonymous by definition — the callback completes the OIDC exchange and establishes the
	 * session internally; GETs are never CSRF-challenged, and the {@code state} nonce is the callback's
	 * forgery defence. Behind the {@code RateLimitFilter} per-IP budget.
	 */
	private static final String SSO_PATHS = "/api/auth/sso/**";
	/** The session logout; handled by the framework {@code LogoutFilter}, not a controller. */
	private static final String LOGOUT_PATH = "/api/auth/logout";

	@Bean
	@Order(1)
	SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, RateLimitProperties rateLimitProperties,
			Clock clock, ObjectMapper objectMapper, AdminAuditLog adminAuditLog) {
		// One shared CSRF cookie repository instance: the filter chain issues/reads the XSRF-TOKEN
		// cookie through it, and the logout success handler (#247) re-issues a fresh one through the
		// SAME hardened config, so both stay in lockstep.
		CookieCsrfTokenRepository csrfTokenRepository = csrfCookieRepository();
		http
				// Scope this chain to the backend surface only (issue #110): the SPA shell is a
				// separate, PUBLIC chain below. Ordered FIRST, so /api + /actuator match here and
				// keep the full authorization/CSRF/rate-limit posture unchanged. Every controller
				// mapping is under /api (VenueReadController … AuthController), and actuator under
				// /actuator, so no endpoint escapes to the permit-all SPA chain.
				.securityMatcher("/api/**", "/actuator/**")
				.cors(Customizer.withDefaults())
				// Per-IP + per-code rate limiting for the public booking endpoints (issue #56) and,
				// on its own stricter per-IP budget, the session login (issue #109, D-8): runs
				// just after CORS so a preflight is handled first (and is skipped by the filter anyway),
				// and before authorization — the booking endpoints are permitAll, so the code IS the
				// authorization and the 200/404 oracle must be throttled. App-level concern, not a module.
				.addFilterAfter(new RateLimitFilter(rateLimitProperties, clock, objectMapper), CorsFilter.class)
				// #507 audit trail: after AuthorizationFilter, so only actions past the gate leave a row.
				.addFilterAfter(new AdminAuditFilter(adminAuditLog, ADMIN_AUDIT_NAMESPACE), AuthorizationFilter.class)
				// CSRF (issue #109, D-1 layer 2): the operator surface now rides a SESSION cookie,
				// so its writes REQUIRE the cookie-to-header token. `.spa()` is Spring Security 7's
				// native single-page-app posture: CookieCsrfTokenRepository issues the JS-readable
				// XSRF-TOKEN cookie, the SPA echoes it as X-XSRF-TOKEN (resolved plain, while
				// rendered tokens keep BREACH/Xor protection), and the token loads eagerly so every
				// response can (re)issue the cookie. The ONLY exemptions left are the genuinely
				// token-less surfaces: guest booking create/cancel/withdraw — authorized by the booking code
				// alone (invariant #7), deliberately session-free — and the Stripe webhook, a
				// server-to-server POST authenticated by its signature header (invariant #8; an
				// unverified call is rejected in StripeWebhookController with 400). A CSRF rejection
				// is answered by CsrfFilter itself through the accessDeniedHandler below →
				// 403 INVALID_CSRF_TOKEN.
				.csrf(csrf -> csrf
						.spa()
						// spa()'s CookieCsrfTokenRepository, hardened: Secure + SameSite=Lax to
						// mirror the session cookie's posture (the override keeps spa()'s handler).
						.csrfTokenRepository(csrfTokenRepository)
						.ignoringRequestMatchers("/api/bookings", "/api/bookings/*/cancel",
								"/api/bookings/*/withdraw", "/api/payments/stripe/webhook"))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						// Session login (issue #109): anonymous by definition — authentication happens
						// INSIDE the endpoint (AuthController → AuthenticationManager). /api/auth/me
						// stays behind anyRequest().authenticated(); logout is the LogoutFilter below.
						.requestMatchers(HttpMethod.POST, LOGIN_PATH).permitAll()
						// Operator self-registration (S6 #115): anonymous — it creates a PENDING account that
						// cannot sign in until a platform admin approves it (D-5). Non-enumerating + on its own
						// rate-limit budget (D-8, RateLimitFilter).
						.requestMatchers(HttpMethod.POST, OPERATOR_REGISTER_PATH).permitAll()
						// Customer session login + registration (S2 #111): anonymous like the operator
						// login — the endpoints authenticate/create internally. Register auto-signs-in on
						// success. Both ride the login rate-limit budget (D-8, RateLimitFilter).
						.requestMatchers(HttpMethod.POST, CUSTOMER_LOGIN_PATH, CUSTOMER_REGISTER_PATH).permitAll()
						// Public customer account-recovery (S8 #113): forgot-password / reset-password /
						// verify-email are anonymous — the emailed token is the credential (invariant #7) —
						// and rate-limited per-IP (D-8, RateLimitFilter). The authenticated set-password +
						// verification-resend endpoints are under /api/me/** (CUSTOMER-gated) below.
						.requestMatchers(HttpMethod.POST, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH,
								VERIFY_EMAIL_PATH).permitAll()
						// SSO redirect/callback (S4 #112, D-3): anonymous GETs that complete the OIDC exchange
						// and establish the session internally; rate-limited per-IP like the logins (D-8).
						.requestMatchers(HttpMethod.GET, SSO_PATHS).permitAll()
						// Staff daily-bookings read (U8) — operator-only because booking codes are bearer
						// credentials (invariant #7). MUST precede the public "GET /api/venues/**" below,
						// or codes would leak to anyone (first match wins in Spring Security).
						.requestMatchers(HttpMethod.GET, STAFF_BOOKINGS_PATH).hasRole(OPERATOR_ROLE)
						// Per-venue payout ledger read (U9) — operator-only venue financial data. MUST
						// precede the public "GET /api/venues/**" below (first match wins).
						.requestMatchers(HttpMethod.GET, PAYOUT_LEDGER_PATH).hasRole(OPERATOR_ROLE)
						// Venue admin-profile read (O8 #177) — returns the commission rate + payout
						// currency, so it is operator-only. MUST precede the public "GET /api/venues/**"
						// below (first match wins); the per-venue ownership check itself lives in the
						// application service (invariant #13). `*` matches one segment, never /sets/*.
						.requestMatchers(HttpMethod.GET, VENUE_PROFILE_PATH).hasRole(OPERATOR_ROLE)
						// Per-venue daily online-takings read (#171) — operator-only venue financial data.
						// MUST precede the public "GET /api/venues/**" below (first match wins); the
						// per-venue ownership check itself lives in the application service (invariant #13).
						.requestMatchers(HttpMethod.GET, TAKINGS_PATH).hasRole(OPERATOR_ROLE)
						// #207 — MUST precede the public "GET /api/venues/**" (rationale on the constant).
						.requestMatchers(HttpMethod.GET, DAILY_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						// S9 #277: MUST precede the public "GET /api/venues/**" below, or ownership leaks.
						.requestMatchers(HttpMethod.GET, MY_VENUES_PATH).hasRole(OPERATOR_ROLE)
						// Pending-requests queue + accept/decline (#98) — operator-only: guest names and
						// venue demand are operator data. The GET MUST precede the public venue GET below
						// (first match wins). The ownership check itself lives in the application services
						// (invariant #13); this is the role layer on top.
						.requestMatchers(HttpMethod.GET, BOOKING_REQUESTS_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, BOOKING_REQUEST_ACCEPT_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, BOOKING_REQUEST_DECLINE_PATH).hasRole(OPERATOR_ROLE)
						// Admin weather refund (U9) — operator-only: it issues real refunds + payout
						// reversals for a washed-out venue+date (invariant #10).
						.requestMatchers(HttpMethod.POST, WEATHER_REFUND_PATH).hasRole(OPERATOR_ROLE)
						// Weekly BKT payout-batch report (U9) — ADMIN across all methods (rationale on the constant).
						.requestMatchers(PAYOUT_BATCHES_PATH, PAYOUT_BATCH_ITEM_PATH).hasRole(ADMIN_ROLE)
						// Operator-approval surface (S6 #115) — platform-admin only, NOT venue-scoped
						// (invariant #13's /api/admin/** exemption). Gated to the stricter ADMIN role: a
						// plain OPERATOR reaching these is 403 (authenticated, wrong role). The GET is
						// listed before the public "GET /api/venues/**" is irrelevant (different prefix),
						// but stays above anyRequest() like every explicit rule.
						.requestMatchers(HttpMethod.GET, ADMIN_OPERATORS_PATH, ADMIN_OPERATOR_ACCOUNTS_PATH)
								.hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_OPERATOR_APPROVE_PATH,
								ADMIN_OPERATOR_REJECT_PATH, ADMIN_OPERATOR_SUSPEND_PATH,
								ADMIN_OPERATOR_REINSTATE_PATH).hasRole(ADMIN_ROLE)
						// Platform-admin data-subject erasure (#101 [D5]) — ADMIN only, not venue-scoped.
						.requestMatchers(HttpMethod.POST, ADMIN_ERASURE_PATH).hasRole(ADMIN_ROLE)
						// Lifting an email suppression (#391) — same ADMIN gate, never self-service.
						.requestMatchers(HttpMethod.POST, ADMIN_SUPPRESSION_REINSTATE_PATH).hasRole(ADMIN_ROLE)
						// The mail outbox (#405) — same ADMIN gate; platform-wide state, no venue owns it.
						.requestMatchers(HttpMethod.GET, ADMIN_MAIL_OUTBOX_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_OUTBOX_RESUBMIT_PATH).hasRole(ADMIN_ROLE)
						// The refund outbox (#454) — same ADMIN gate; the money-path twin of the above.
						.requestMatchers(HttpMethod.GET, ADMIN_REFUND_OUTBOX_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_REFUND_OUTBOX_RESUBMIT_PATH).hasRole(ADMIN_ROLE)
						// Per-booking mail delivery + resend (#380) — same ADMIN gate, platform-wide state.
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_DELIVERY_LOOKUP_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_DELIVERY_RESEND_PATH).hasRole(ADMIN_ROLE)
						// Venue-photo moderation (#504 takedown, #511 read) — ADMIN only; any venue, owned or not.
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_PHOTOS_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.DELETE, ADMIN_VENUE_PHOTO_PATH).hasRole(ADMIN_ROLE)
						// The admin audit trail (#507) — same ADMIN gate; platform accountability state.
						.requestMatchers(HttpMethod.GET, ADMIN_AUDIT_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						// Staff tap-to-mark walk-in (U8) — operator-only mark/release of (set, date).
						.requestMatchers(HttpMethod.POST, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						// Venue onboarding + beach-map editing (U7) — an operator-only write surface.
						// The real staff/admin identity model is deferred; for now a single configured
						// operator credential (role OPERATOR) gates every write. GET stays public above.
						.requestMatchers(HttpMethod.POST, "/api/venues").hasRole(OPERATOR_ROLE)
						// Venue profile edit (T7 #140) — amenities + distance-to-water. Object-level
						// ownership (invariant #13) is enforced in the application service; this is the
						// role layer. `*` matches one segment, so it never shadows the /sets/* matchers.
						.requestMatchers(HttpMethod.PATCH, VENUE_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, "/api/venues/*/sets").hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PATCH, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						// The venue-write PUTs (#328) — unmatched until then; rationale on the constants above.
						.requestMatchers(HttpMethod.PUT, BEACH_MAP_PATH, ROW_PRICE_PATH).hasRole(OPERATOR_ROLE)
						// Venue photo upload/remove (#142) — operator-only writes. Object-level ownership
						// (invariant #13) is enforced in VenuePhotoService; this is the role layer. The
						// serving GET stays public via "GET /api/venues/**" above. Non-GET, so it never
						// shadows that public read.
						.requestMatchers(HttpMethod.POST, PHOTO_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, PHOTO_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, "/api/bookings").permitAll()
						// View a booking by its code (U6) — the code is the bearer credential
						// (invariant #7), so knowing it authorizes the read. One path segment only.
						.requestMatchers(HttpMethod.GET, "/api/bookings/*").permitAll()
						// Cancel a booking by its code (U6) — authorized by the code (invariant #7),
						// stateless/token-less (CSRF-exempt above). The amount is server-computed.
						.requestMatchers(HttpMethod.POST, "/api/bookings/*/cancel").permitAll()
						// Withdraw a pending request (#123) — same posture as cancel above.
						.requestMatchers(HttpMethod.POST, "/api/bookings/*/withdraw").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/payments/stripe/webhook").permitAll()
						// Operator self-service password change (#326) — authenticated, OPERATOR-only.
						.requestMatchers(HttpMethod.POST, OPERATOR_PASSWORD_PATH).hasRole(OPERATOR_ROLE)
						// Every verb, not just GET (#317) — anonymous → 401, operator session → 403.
						.requestMatchers(ME_PATHS).hasRole(CUSTOMER_ROLE)
						.anyRequest().authenticated())
				// Session logout (issue #109): the framework LogoutFilter invalidates the server
				// session and clears the context; 204 (no redirect — this is an SPA's API). The
				// success handler also re-issues a fresh XSRF-TOKEN cookie (#247) — see below.
				.logout(logout -> logout
						.logoutUrl(LOGOUT_PATH)
						.logoutSuccessHandler(csrfReissuingLogoutSuccessHandler(csrfTokenRepository)))
				// Unauthenticated access to a protected endpoint → RFC-7807 401 UNAUTHENTICATED. This
				// fires in the filter chain (never reaches ApiErrorHandler), so the body is
				// hand-mirrored — the RateLimitFilter pattern (issue #97 conformance for #109).
				.exceptionHandling(handling -> handling
						.authenticationEntryPoint((_, response, _) ->
								SecurityProblemResponses.writeUnauthenticated(response))
						.accessDeniedHandler((_, response, exception) ->
								SecurityProblemResponses.writeAccessDenied(response, exception)));
		return http.build();
	}

	/**
	 * The public single-page-app shell (issue #110): every non-API, non-actuator path — the
	 * Angular index, its hashed assets, and the client-side deep-link routes served by
	 * {@link SpaWebConfig} — is anonymous. Before this slice these fell under the API chain's
	 * {@code anyRequest().authenticated()} and returned 401, which is what stopped the deployed
	 * SPA from even loading. Ordered LAST, so it only catches what the API chain's
	 * {@code securityMatcher} did not. Serving the SPA same-origin is what makes the S1
	 * session/CSRF cookies first-party — no auth-model change.
	 *
	 * <p>CSRF is left at its <strong>default (enabled)</strong>: this chain serves only safe static
	 * GETs, which CSRF never challenges, so there is nothing to protect and nothing to disable —
	 * every state-changing surface lives under {@code /api/**} in {@link #apiSecurityFilterChain}
	 * with the {@code .spa()} token. Explicitly disabling CSRF here would trip
	 * {@code java/spring-disabled-csrf-protection} (CodeQL) for no security benefit.
	 */
	@Bean
	@Order(2)
	SecurityFilterChain spaSecurityFilterChain(HttpSecurity http) {
		http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
		return http.build();
	}

	/**
	 * The framework authentication manager (issue #109): built by Spring Security's global
	 * {@link AuthenticationConfiguration} from {@link #operatorDetailsService} +
	 * {@link #passwordEncoder()} — the exact same {@code DaoAuthenticationProvider} path Basic
	 * used, now driven by {@code AuthController}'s session login. No custom filter (D-1).
	 */
	@Bean
	AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) {
		return configuration.getAuthenticationManager();
	}

	/**
	 * The CUSTOMER authentication manager (S2 #111, design D-2): an explicit {@link ProviderManager}
	 * over a {@link DaoAuthenticationProvider} whose {@link CustomerUserDetailsService} is built INLINE.
	 * Kept separate from the operator {@link #authenticationManager} so a customer credential can never
	 * authenticate as an operator (AC-5) — {@code AuthController} selects the manager per principal-typed
	 * endpoint. Deliberately NOT wired as a second {@code UserDetailsService} bean: that would make
	 * {@link AuthenticationConfiguration} ambiguous and break the operator manager's auto-wiring, so S1's
	 * operator path stays untouched. The stored hash is verified against the same delegating
	 * {@link #passwordEncoder()}.
	 */
	@Bean
	AuthenticationManager customerAuthenticationManager(CustomerAccounts customerAccounts,
			PasswordEncoder passwordEncoder) {
		DaoAuthenticationProvider provider =
				new DaoAuthenticationProvider(new CustomerUserDetailsService(customerAccounts));
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

	/**
	 * Where {@code AuthController} saves the authenticated context: the HTTP session — which
	 * Spring Session transparently persists to Postgres (V20). The filter chain's default
	 * delegating repository reads the same {@code SPRING_SECURITY_CONTEXT} attribute back on
	 * every later request, so save and load stay in lockstep.
	 */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/**
	 * Logout success handler that answers {@code 204} <strong>and</strong> re-issues a fresh
	 * {@code XSRF-TOKEN} cookie (#247). The framework's {@code CsrfLogoutHandler} — added because CSRF
	 * is enabled and {@code .logout(...)} is configured — <em>clears</em> the CSRF cookie during
	 * logout, and {@code LogoutFilter} then writes this {@code 204} and short-circuits the chain, so
	 * {@code .spa()}'s deferred-token machinery (which re-issues the cookie on ordinary responses)
	 * never runs on the logout response. That left the SPA with <em>no</em> token, so its immediate
	 * next CSRF-protected POST (the re-login) sent no {@code X-XSRF-TOKEN} and got
	 * {@code 403 INVALID_CSRF_TOKEN}, succeeding only on the retry that the 403's re-seeded cookie
	 * enabled. Generating + saving a new token here (this runs <em>after</em> {@code CsrfLogoutHandler}
	 * cleared the old one, and before the {@code 204} commits) restores the invariant that every
	 * response leaves a usable token. The repository is stateless — the token lives in the cookie, not
	 * the just-invalidated session — so the fresh cookie authenticates the next request. Applies to
	 * both principal types (operator + customer): one shared logout filter, one shared fix.
	 */
	private static LogoutSuccessHandler csrfReissuingLogoutSuccessHandler(CsrfTokenRepository csrfTokenRepository) {
		HttpStatusReturningLogoutSuccessHandler noContent =
				new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT);
		return (request, response, authentication) -> {
			// Save the cookie BEFORE the 204 commits (the status handler flushes the response).
			csrfTokenRepository.saveToken(csrfTokenRepository.generateToken(request), request, response);
			noContent.onLogoutSuccess(request, response, authentication);
		};
	}

	/**
	 * The SPA-readable CSRF token cookie: {@code HttpOnly=false} is the point (cookie-to-header
	 * requires JS to read it — the token is a secret from OTHER origins, not from the page);
	 * {@code Secure} + {@code SameSite=Lax} mirror the session cookie's posture.
	 */
	private static CookieCsrfTokenRepository csrfCookieRepository() {
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookieCustomizer(cookie -> cookie.secure(true).sameSite("Lax"));
		return repository;
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
