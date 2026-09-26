package ai.riviera.platform;

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
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.CorsFilter;

import ai.riviera.platform.audit.api.AdminAuditLog;
import ai.riviera.platform.challenge.api.ProofOfWorkChallenges;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * Application-level security: public tourist reads are permitted; venue writes and the staff/admin
 * surfaces need a <strong>server-side session</strong> (Spring Session JDBC) with a role. Operator
 * credentials are DB-backed ({@link #operatorDetailsService} + {@link #passwordEncoder()}); no JWT, no
 * custom token filter. Per-<em>venue</em> authorization (invariant #13) is object-level and lives in
 * the application services, never here; this class is only the role layer above it.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({RivieraOperatorProperties.class, RateLimitProperties.class,
		RecoveryProperties.class})
class SecurityConfig {

	/** The single role that gates the operator write surface. */
	private static final String OPERATOR_ROLE = "OPERATOR";
	/** The role gating the signed-in tourist's own-bookings surface. */
	private static final String CUSTOMER_ROLE = "CUSTOMER";
	/**
	 * Gates <strong>every</strong> path in {@code /api/admin/**}, with no opt-out allow-list;
	 * {@code AdminSurfaceRoleGateTest} discovers the mapped admin endpoints, so one with no matcher fails.
	 */
	private static final String ADMIN_ROLE = "ADMIN";
	/** A single laid-out set (PATCH/DELETE target); session + CSRF token required. */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";
	/** The set collection: add one (POST) or batch-apply price/tier/pool to many (PATCH); session + CSRF. */
	private static final String SETS_PATH = "/api/venues/*/sets";
	/** A single venue item (PATCH profile edit — amenities + distance-to-water); session + CSRF. */
	private static final String VENUE_ITEM_PATH = "/api/venues/*";
	/**
	 * The operator-only venue-write {@code PUT}s (layout replace, row reprice/rename), gated per-verb
	 * because {@code /api/venues/**} also serves the public {@code GET};
	 * {@code EndpointRoleGateCoverageTest} catches a newly mapped verb falling through.
	 */
	private static final String BEACH_MAP_PATH = "/api/venues/*/beach-map";
	private static final String BEACH_MAP_PREVIEW_PATH = "/api/venues/*/beach-map/preview";
	private static final String BEACH_MAP_COMMIT_PATH = "/api/venues/*/beach-map/commit";
	/** The mock transport's recorded booking mails; the controller exists only where the mock does. */
	private static final String MOCK_MAIL_PATH = "/api/mock-mail/**";
	/** The owner's remodel receipts: who was moved where. Order-sensitive against the public venue GET. */
	private static final String REMODEL_RECEIPTS_PATH = "/api/venues/*/remodels";
	private static final String REMODEL_RECEIPT_PATH = "/api/venues/*/remodels/*";
	private static final String ROW_PRICE_PATH = "/api/venues/*/rows/*/price";
	private static final String ROW_NAME_PATH = "/api/venues/*/rows/*/name";
	/**
	 * A single venue photo slot: POST upload / DELETE remove, operator-only. The public GET serving path
	 * falls under {@code GET /api/venues/**} below.
	 */
	private static final String PHOTO_ITEM_PATH = "/api/venues/*/photos/*";
	/** A set's per-day staff availability (mark POST / release DELETE); session + CSRF token required. */
	private static final String SET_AVAILABILITY_PATH = "/api/venues/*/sets/*/availability";
	/** The operator-only staff daily-bookings read. Order-sensitive — see the ordering rule below. */
	private static final String STAFF_BOOKINGS_PATH = "/api/venues/*/bookings";

	/** Staff check-in (#583): flips lifecycle state off a bearer code — operator-gated (invariant #7). */
	private static final String BOOKING_CHECK_IN_PATH = "/api/venues/*/bookings/*/check-in";
	/** The guest's one review on their own stay — POST / PUT / DELETE, all code-gated (invariant #7). */
	private static final String BOOKING_REVIEW_PATH = "/api/bookings/*/review";
	/** The admin weather-refund write; an operator-session POST, CSRF-protected like every write. */
	private static final String WEATHER_REFUND_PATH = "/api/venues/*/weather-refund";
	/** The operator-only per-venue payout ledger read. Order-sensitive. */
	private static final String PAYOUT_LEDGER_PATH = "/api/venues/*/payout-ledger";
	/**
	 * The operator-only venue admin-profile read: it returns the venue's commission rate + payout
	 * currency, which must never reach the public tourist read. Order-sensitive.
	 */
	private static final String VENUE_PROFILE_PATH = "/api/venues/*/profile";
	/** The owner's close/reopen state transition; non-GET, so it never shadows the public read. */
	private static final String SEASON_CLOSURE_PATH = "/api/venues/*/season-closure";
	/** The operator-only per-venue daily online-takings read. Order-sensitive. */
	private static final String TAKINGS_PATH = "/api/venues/*/takings";
	/**
	 * The operator-only per-venue daily availability-states read: per-set {@code BOOKED_ONLINE} /
	 * {@code STAFF_MARKED} tokens — the hold split the public FREE/TAKEN map hides. Order-sensitive.
	 * A single {@code *} segment, so it never collides with the deeper {@code /sets/*} writes.
	 */
	private static final String DAILY_AVAILABILITY_PATH = "/api/venues/*/availability";
	/**
	 * The signed-in operator's own-venues read — it returns the operator↔venue ownership map for the
	 * session principal. Order-sensitive: without it this falls through to {@code permitAll} and hands
	 * the ownership map to anyone. A literal segment, so it never collides with {@code /api/venues/*}.
	 */
	private static final String MY_VENUES_PATH = "/api/venues/mine";

	/**
	 * The operator create form's defaults read (issue #692) — the platform commission the create
	 * path stamps. Operator-gated: the platform's commercial terms are operator-facing, not public.
	 */
	private static final String VENUE_DEFAULTS_PATH = "/api/venue-defaults";
	/** The operator-only pending-requests queue. Order-sensitive. */
	private static final String BOOKING_REQUESTS_PATH = "/api/venues/*/booking-requests";
	/** Accept/decline a pending request; operator-session POSTs, CSRF token required. */
	private static final String BOOKING_REQUEST_ACCEPT_PATH = "/api/venues/*/booking-requests/*/accept";
	private static final String BOOKING_REQUEST_DECLINE_PATH = "/api/venues/*/booking-requests/*/decline";
	/**
	 * The admin BKT payout-batch report (POST generate / GET list). It and {@link #PAYOUT_BATCH_ITEM_PATH}
	 * are not venue-scoped and exempt from invariant #13, so the ADMIN gate is the whole authorization:
	 * an OPERATOR gate would let any operator read competitors' payout figures.
	 */
	private static final String PAYOUT_BATCHES_PATH = "/api/admin/payout-batches";
	/** A single payout batch: status transition (PATCH). Session + CSRF token required. */
	private static final String PAYOUT_BATCH_ITEM_PATH = "/api/admin/payout-batches/*";
	/** The platform-admin operator-approval surface: list pending registrations, approve/reject them. */
	private static final String ADMIN_OPERATORS_PATH = "/api/admin/operators";
	private static final String ADMIN_OPERATOR_APPROVE_PATH = "/api/admin/operators/*/approve";
	private static final String ADMIN_OPERATOR_REJECT_PATH = "/api/admin/operators/*/reject";
	/** The decided-accounts list + the suspend/reinstate transitions — same ADMIN gate. */
	private static final String ADMIN_OPERATOR_ACCOUNTS_PATH = "/api/admin/operators/accounts";
	private static final String ADMIN_OPERATOR_SUSPEND_PATH = "/api/admin/operators/*/suspend";
	private static final String ADMIN_OPERATOR_REINSTATE_PATH = "/api/admin/operators/*/reinstate";
	/** Platform-admin data-subject erasure. */
	private static final String ADMIN_ERASURE_PATH = "/api/admin/erasure";
	/**
	 * Lifting an email suppression. Deliberately admin-only and never self-service: a complainer
	 * un-suppressing themselves through a public endpoint would be an abuse and enumeration vector.
	 */
	private static final String ADMIN_SUPPRESSION_REINSTATE_PATH = "/api/admin/email-suppressions/reinstate";
	/**
	 * The mail outbox — what the Event Publication Registry still owes {@code notification}, and the
	 * lever that re-drives it without waiting for the next deploy.
	 */
	private static final String ADMIN_MAIL_OUTBOX_PATH = "/api/admin/mail-outbox";
	private static final String ADMIN_MAIL_OUTBOX_RESUBMIT_PATH = "/api/admin/mail-outbox/resubmit";
	/**
	 * The refund outbox — the mail outbox's twin on the money path. The lever's own scope (an exact
	 * listener id) is what keeps it off every other listener.
	 */
	private static final String ADMIN_REFUND_OUTBOX_PATH = "/api/admin/refund-outbox";
	private static final String ADMIN_REFUND_OUTBOX_RESUBMIT_PATH = "/api/admin/refund-outbox/resubmit";
	/** The per-venue venue-caused refund report: aggregates only, no booking id or code. */
	private static final String ADMIN_VENUE_CHANGE_REFUNDS_PATH = "/api/admin/venue-change-refunds";
	/** The venue-change fee an admin reads and writes: one platform-wide amount, no venue scope. */
	private static final String ADMIN_VENUE_CHANGE_FEE_PATH = "/api/admin/venue-change-fee";
	/**
	 * The per-booking mail-delivery view and resend (for a confirmation whose publication completed).
	 * The lookup is a {@code POST} although it reads: its key is an email address, which a query string
	 * would leave in access, proxy and browser-history logs.
	 */
	private static final String ADMIN_MAIL_DELIVERY_LOOKUP_PATH = "/api/admin/mail-deliveries/lookup";
	private static final String ADMIN_MAIL_DELIVERY_RESEND_PATH = "/api/admin/mail-deliveries/*/resend";
	/**
	 * Admin venue-photo takedown on one venue's data, relying on the invariant-#13 exemption: the
	 * venue-scoped DELETE answers a non-owner {@code 403 NOT_VENUE_OWNER}. Wildcards: venue id, slot.
	 */
	private static final String ADMIN_VENUE_PHOTO_PATH = "/api/admin/venues/*/photos/*";
	/**
	 * The moderation <em>read</em> that makes the takedown usable — without it an admin could delete a
	 * photo it could not see. One wildcard, not two: this path ends at {@code /photos}, which is what
	 * keeps it and the slot-addressed {@code DELETE} above from ever matching each other.
	 */
	private static final String ADMIN_VENUE_PHOTOS_PATH = "/api/admin/venues/*/photos";
	/**
	 * The admin commission surface: the venues-with-commission list and the rate write (a venue never
	 * sets its own). The list is the bare namespace root and the write ends at a literal
	 * {@code /commission}, so neither can shadow the photo patterns above.
	 */
	private static final String ADMIN_VENUE_COMMISSIONS_PATH = "/api/admin/venues";
	private static final String ADMIN_VENUE_COMMISSION_ITEM_PATH = "/api/admin/venues/*/commission";
	/**
	 * Admin review moderation: the per-venue list (reaching venues the public list hides) and the two
	 * takedown verbs by review id. The list ends at a literal {@code /reviews}, so it shadows no pattern
	 * above; the verbs have their own {@code /api/admin/reviews} namespace.
	 */
	private static final String ADMIN_VENUE_REVIEWS_PATH = "/api/admin/venues/*/reviews";
	private static final String ADMIN_REVIEW_HIDE_PATH = "/api/admin/reviews/*/hide";
	private static final String ADMIN_REVIEW_UNHIDE_PATH = "/api/admin/reviews/*/unhide";
	/**
	 * The admin audit-trail read (ADR-0013), newest first. Rows are written by {@link AdminAuditFilter},
	 * registered after the authorization filter so only actions past the gate leave one.
	 */
	private static final String ADMIN_AUDIT_PATH = "/api/admin/audit";
	/** The namespace {@link AdminAuditFilter} audits — every mutating request under it leaves a row. */
	private static final String ADMIN_AUDIT_NAMESPACE = "/api/admin/";
	/** The session login; anonymous by definition. */
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	/**
	 * Operator self-registration: anonymous by definition — it creates a {@code PENDING} account that
	 * cannot authenticate until a platform admin approves it, so nothing is signed in here. On its own
	 * rate-limit budget so register spam can never starve operator login.
	 */
	private static final String OPERATOR_REGISTER_PATH = "/api/auth/operator/register";
	/**
	 * The signed-in operator's own password change, <strong>authenticated</strong>. Not under
	 * {@code /api/me/**}, which is CUSTOMER-only (see {@link #ME_PATHS}). Own rate-limit budget, so a
	 * change flood can never starve operator login.
	 */
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	/** Customer session login + registration; anonymous by definition, like the operator login. */
	private static final String CUSTOMER_LOGIN_PATH = "/api/auth/customer/login";
	private static final String CUSTOMER_REGISTER_PATH = "/api/auth/customer/register";
	/**
	 * The proof-of-work challenge fetched before a fenced write: anonymous (the solution, not a session,
	 * is what the fence checks), on its own rate-limit budget. {@code ChallengeEndpointTest} keeps this
	 * literal in lockstep with the {@code challenge} module's route.
	 */
	private static final String CHALLENGE_PATH = "/api/auth/challenge";
	/**
	 * The signed-in tourist's own surface: {@code CUSTOMER}-only and <strong>method-agnostic</strong>, so
	 * any future verb fails closed. <strong>Never add a non-customer endpoint under this prefix</strong>;
	 * put it elsewhere, as {@code GET /api/venues/mine} does for operators.
	 */
	private static final String ME_PATHS = "/api/me/**";
	/**
	 * Public account-recovery POSTs (reset request/redeem, verification redeem): anonymous, as the emailed
	 * token is the bearer credential (invariant #7); recovery rate-limit budget. CSRF-protected like the
	 * customer login, so deliberately NOT in the CSRF ignore list.
	 */
	private static final String FORGOT_PASSWORD_PATH = "/api/auth/customer/forgot-password";
	private static final String RESET_PASSWORD_PATH = "/api/auth/customer/reset-password";
	private static final String VERIFY_EMAIL_PATH = "/api/auth/customer/verify-email";
	/**
	 * The SSO authorize, callback and mock-IdP GETs: anonymous, as the callback establishes the session
	 * itself; GETs are never CSRF-challenged, so the {@code state} nonce is the callback's forgery defence.
	 */
	private static final String SSO_PATHS = "/api/auth/sso/**";
	/** The session logout; handled by the framework {@code LogoutFilter}, not a controller. */
	private static final String LOGOUT_PATH = "/api/auth/logout";

	/**
	 * The {@code /api/**} + {@code /actuator/**} chain, ordered first. <strong>First match wins</strong>:
	 * each operator-only {@code GET /api/venues/*&#47;…} MUST precede the public one, or its data leaks.
	 * CSRF is {@code .spa()}, exempting only booking-code writes and the signed webhook (invariants #7, #8).
	 */
	@Bean
	@Order(1)
	SecurityFilterChain apiSecurityFilterChain(HttpSecurity http, RateLimitProperties rateLimitProperties,
			Clock clock, ObjectMapper objectMapper, AdminAuditLog adminAuditLog,
			ProofOfWorkChallenges challenges) {
		// One instance, so the chain and the logout success handler stay in lockstep.
		CookieCsrfTokenRepository csrfTokenRepository = csrfCookieRepository();
		http
				.securityMatcher("/api/**", "/actuator/**")
				.cors(Customizer.withDefaults())
				// After CORS (preflight first), before authorization: the 200/404 code oracle needs throttling.
				.addFilterAfter(new RateLimitFilter(rateLimitProperties, clock, objectMapper), CorsFilter.class)
				// After the rate limiter and the CSRF check, so a 429 wins and the registry claim comes last.
				.addFilterAfter(new ChallengeVerificationFilter(challenges), CsrfFilter.class)
				// After AuthorizationFilter, so only actions past the gate leave an audit row.
				.addFilterAfter(new AdminAuditFilter(adminAuditLog, ADMIN_AUDIT_NAMESPACE), AuthorizationFilter.class)
				.csrf(csrf -> csrf
						.spa()
						// Hardened to mirror the session cookie's posture (keeps spa()'s handler).
						.csrfTokenRepository(csrfTokenRepository)
						.ignoringRequestMatchers("/api/bookings", "/api/bookings/*/cancel",
								"/api/bookings/*/withdraw", BOOKING_REVIEW_PATH,
								"/api/payments/stripe/webhook"))
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/actuator/health/**").permitAll()
						// Anonymous by definition — authentication happens INSIDE the endpoint.
						.requestMatchers(HttpMethod.POST, LOGIN_PATH).permitAll()
						.requestMatchers(HttpMethod.POST, OPERATOR_REGISTER_PATH).permitAll()
						// Register auto-signs-in on success; both ride the login rate-limit budget.
						.requestMatchers(HttpMethod.POST, CUSTOMER_LOGIN_PATH, CUSTOMER_REGISTER_PATH).permitAll()
						.requestMatchers(HttpMethod.GET, CHALLENGE_PATH).permitAll()
						// The emailed token is the credential (invariant #7); rate-limited per-IP.
						.requestMatchers(HttpMethod.POST, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH,
								VERIFY_EMAIL_PATH).permitAll()
						.requestMatchers(HttpMethod.GET, SSO_PATHS).permitAll()
						// Order-sensitive: booking codes are bearer credentials (invariant #7).
						.requestMatchers(HttpMethod.GET, STAFF_BOOKINGS_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, BOOKING_CHECK_IN_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: venue financial data.
						.requestMatchers(HttpMethod.GET, PAYOUT_LEDGER_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: returns the commission rate + payout currency.
						.requestMatchers(HttpMethod.GET, VENUE_PROFILE_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: venue financial data.
						.requestMatchers(HttpMethod.GET, TAKINGS_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: exposes the hold split the public map hides.
						.requestMatchers(HttpMethod.GET, DAILY_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: the owner's map read carries which sets guests hold.
						.requestMatchers(HttpMethod.GET, BEACH_MAP_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: a receipt names which bookings a remodel moved.
						.requestMatchers(HttpMethod.GET, REMODEL_RECEIPTS_PATH, REMODEL_RECEIPT_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: exposes the operator↔venue ownership map.
						.requestMatchers(HttpMethod.GET, MY_VENUES_PATH).hasRole(OPERATOR_ROLE)
						// The platform's venue-creation terms; a literal path outside /api/venues/**.
						.requestMatchers(HttpMethod.GET, VENUE_DEFAULTS_PATH).hasRole(OPERATOR_ROLE)
						// Order-sensitive: guest names and venue demand are operator data.
						.requestMatchers(HttpMethod.GET, BOOKING_REQUESTS_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, BOOKING_REQUEST_ACCEPT_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, BOOKING_REQUEST_DECLINE_PATH).hasRole(OPERATOR_ROLE)
						// Issues real refunds + payout reversals for a washed-out venue+date (invariant #10).
						.requestMatchers(HttpMethod.POST, WEATHER_REFUND_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(PAYOUT_BATCHES_PATH, PAYOUT_BATCH_ITEM_PATH).hasRole(ADMIN_ROLE)
						// A plain OPERATOR reaching any /api/admin/** rule is 403 (authenticated, wrong role).
						.requestMatchers(HttpMethod.GET, ADMIN_OPERATORS_PATH, ADMIN_OPERATOR_ACCOUNTS_PATH)
								.hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_OPERATOR_APPROVE_PATH,
								ADMIN_OPERATOR_REJECT_PATH, ADMIN_OPERATOR_SUSPEND_PATH,
								ADMIN_OPERATOR_REINSTATE_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_ERASURE_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_SUPPRESSION_REINSTATE_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_MAIL_OUTBOX_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_OUTBOX_RESUBMIT_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_CHANGE_REFUNDS_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_CHANGE_FEE_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.PUT, ADMIN_VENUE_CHANGE_FEE_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_REFUND_OUTBOX_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_REFUND_OUTBOX_RESUBMIT_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_DELIVERY_LOOKUP_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_MAIL_DELIVERY_RESEND_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_PHOTOS_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.DELETE, ADMIN_VENUE_PHOTO_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_COMMISSIONS_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.PUT, ADMIN_VENUE_COMMISSION_ITEM_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_VENUE_REVIEWS_PATH).hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.POST, ADMIN_REVIEW_HIDE_PATH, ADMIN_REVIEW_UNHIDE_PATH)
								.hasRole(ADMIN_ROLE)
						.requestMatchers(HttpMethod.GET, ADMIN_AUDIT_PATH).hasRole(ADMIN_ROLE)
						// The public tourist read. Everything order-sensitive above precedes it.
						.requestMatchers(HttpMethod.GET, "/api/venues/**").permitAll()
						// Staff tap-to-mark walk-in — operator-only mark/release of (set, date).
						.requestMatchers(HttpMethod.POST, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_AVAILABILITY_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, "/api/venues").hasRole(OPERATOR_ROLE)
						// `*` matches one segment, so it never shadows the /sets/* matchers.
						.requestMatchers(HttpMethod.PATCH, VENUE_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, SETS_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PATCH, SETS_PATH, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PUT, BEACH_MAP_PATH, ROW_PRICE_PATH, ROW_NAME_PATH)
						.hasRole(OPERATOR_ROLE)
						// The remodel dry run reads which sets guests hold (ADR-0020); owner-asserted in the modules.
						.requestMatchers(HttpMethod.POST, BEACH_MAP_PREVIEW_PATH).hasRole(OPERATOR_ROLE)
						// The remodel commit moves bookings (ADR-0020); owner-asserted in the modules.
						.requestMatchers(HttpMethod.POST, BEACH_MAP_COMMIT_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.GET, MOCK_MAIL_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PUT, SEASON_CLOSURE_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SEASON_CLOSURE_PATH).hasRole(OPERATOR_ROLE)
						// Non-GET, so these never shadow the public serving read above.
						.requestMatchers(HttpMethod.POST, PHOTO_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, PHOTO_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.POST, "/api/bookings").permitAll()
						// Knowing the booking code authorizes the read (invariant #7). One segment only.
						.requestMatchers(HttpMethod.GET, "/api/bookings/*").permitAll()
						// Authorized by the code (invariant #7); the refund amount is server-computed.
						.requestMatchers(HttpMethod.POST, "/api/bookings/*/cancel").permitAll()
						.requestMatchers(HttpMethod.POST, "/api/bookings/*/withdraw").permitAll()
						.requestMatchers(HttpMethod.POST, BOOKING_REVIEW_PATH).permitAll()
						// Same credential, same resource: the code-holder may also amend their own review.
						.requestMatchers(HttpMethod.PUT, BOOKING_REVIEW_PATH).permitAll()
						.requestMatchers(HttpMethod.DELETE, BOOKING_REVIEW_PATH).permitAll()
						.requestMatchers(HttpMethod.POST, "/api/payments/stripe/webhook").permitAll()
						.requestMatchers(HttpMethod.POST, OPERATOR_PASSWORD_PATH).hasRole(OPERATOR_ROLE)
						// Every verb, not just GET — anonymous → 401, operator session → 403.
						.requestMatchers(ME_PATHS).hasRole(CUSTOMER_ROLE)
						.anyRequest().authenticated())
				// The framework LogoutFilter invalidates the server session; 204, no redirect.
				.logout(logout -> logout
						.logoutUrl(LOGOUT_PATH)
						.logoutSuccessHandler(csrfReissuingLogoutSuccessHandler(csrfTokenRepository)))
				// Never reaches ApiErrorHandler, so the RFC-7807 body is hand-mirrored here.
				.exceptionHandling(handling -> handling
						.authenticationEntryPoint((_, response, _) ->
								SecurityProblemResponses.writeUnauthenticated(response))
						.accessDeniedHandler((_, response, exception) ->
								SecurityProblemResponses.writeAccessDenied(response, exception)));
		return http.build();
	}

	/**
	 * The public SPA shell: every non-API, non-actuator path is anonymous; ordered last. CSRF stays at
	 * its default (enabled): only safe static GETs pass here, and disabling it would trip CodeQL's
	 * {@code java/spring-disabled-csrf-protection} for nothing.
	 */
	@Bean
	@Order(2)
	SecurityFilterChain spaSecurityFilterChain(HttpSecurity http) {
		http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
		return http.build();
	}

	/**
	 * The operator authentication manager, built by Spring Security's global
	 * {@link AuthenticationConfiguration} from {@link #operatorDetailsService} +
	 * {@link #passwordEncoder()}. No custom filter.
	 */
	@Bean
	AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) {
		return configuration.getAuthenticationManager();
	}

	/**
	 * The CUSTOMER manager, separate from the operator one so a customer credential can never
	 * authenticate as an operator. {@link CustomerUserDetailsService} is built inline: a second
	 * {@code UserDetailsService} bean would make {@link AuthenticationConfiguration} ambiguous.
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
	 * Where {@code AuthController} saves the authenticated context: the HTTP session, which Spring
	 * Session transparently persists to Postgres. The chain's default delegating repository reads the
	 * same attribute back on every later request, so save and load stay in lockstep.
	 */
	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	/**
	 * Answers {@code 204} <strong>and</strong> re-issues an {@code XSRF-TOKEN} cookie: logout clears the
	 * CSRF cookie and short-circuits before {@code .spa()} can mint one, so the SPA's next POST would
	 * otherwise get {@code 403 INVALID_CSRF_TOKEN}.
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
	 * The SPA-readable CSRF token cookie: {@code HttpOnly=false} is the point — cookie-to-header requires
	 * JS to read it, and the token is a secret from OTHER origins, not from the page. {@code Secure} +
	 * {@code SameSite=Lax} mirror the session cookie's posture.
	 */
	private static CookieCsrfTokenRepository csrfCookieRepository() {
		CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
		repository.setCookieCustomizer(cookie -> cookie.secure(true).sameSite("Lax"));
		return repository;
	}

	/**
	 * The session cookie's posture, owned in code as the {@code server.servlet.session.cookie.*} mapping
	 * may not reach Spring Session: {@code HttpOnly}, {@code Secure} (localhost still works),
	 * {@code SameSite=Lax} (CSRF layer 1). Pinned by {@code AuthSessionIT}.
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

	/** Delegating encoder ({@code {bcrypt}} by default) — verifies the stored per-operator hash. */
	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	/**
	 * The per-operator {@link UserDetailsService}: each login resolves to a DB-backed operator account via
	 * {@link OperatorAccounts}; defining it replaces Boot's auto-generated default user.
	 */
	@Bean
	UserDetailsService operatorDetailsService(OperatorAccounts accounts) {
		return new OperatorUserDetailsService(accounts);
	}

}
