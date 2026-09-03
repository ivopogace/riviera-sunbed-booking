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
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.filter.CorsFilter;

import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.operator.api.OperatorAccounts;

/**
 * Application-level security. Public tourist reads are permitted; venue writes and the staff/admin
 * surfaces are gated behind a <strong>server-side session</strong> (Spring Session JDBC, so a restart
 * keeps operators signed in) with role {@code OPERATOR}. Credentials are per-operator and DB-backed:
 * {@link #operatorDetailsService} loads the stored hash via {@link OperatorAccounts} and
 * {@code DaoAuthenticationProvider} verifies it against {@link #passwordEncoder()} — no JWT, no custom
 * token filter.
 *
 * <p>Per-<em>venue</em> authorization (invariant #13) is object-level and lives in the application
 * services, never here. This class is only the role layer above it.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({RivieraOperatorProperties.class, RateLimitProperties.class,
		RecoveryProperties.class, AltchaProperties.class})
class SecurityConfig {

	/** The single role that gates the operator write surface. */
	private static final String OPERATOR_ROLE = "OPERATOR";
	/** The role gating the signed-in tourist's own-bookings surface. */
	private static final String CUSTOMER_ROLE = "CUSTOMER";
	/**
	 * The platform-admin role gating <strong>every</strong> path in {@code /api/admin/**}, uniformly.
	 * Machine-checked by {@code AdminSurfaceRoleGateTest}, which discovers the mapped admin endpoints
	 * rather than reading a list — so a new admin endpoint added below with no matcher at all fails the
	 * build instead of falling through to {@code anyRequest().authenticated()}. There is deliberately no
	 * allow-list to opt out through.
	 */
	private static final String ADMIN_ROLE = "ADMIN";
	/** A single laid-out set (PATCH/DELETE target); session + CSRF token required. */
	private static final String SET_ITEM_PATH = "/api/venues/*/sets/*";
	/** A single venue item (PATCH profile edit — amenities + distance-to-water); session + CSRF. */
	private static final String VENUE_ITEM_PATH = "/api/venues/*";
	/**
	 * The operator-only venue-write {@code PUT}s — bulk beach-map layout replace, row reprice, row rename.
	 *
	 * <p>Gated per-verb rather than by namespace, deliberately: unlike {@code /api/me/**} (where a
	 * method-agnostic rule is right because every verb belongs to one principal type),
	 * {@code /api/venues/**} mixes the <em>public</em> tourist {@code GET} with operator-only writes, so
	 * a namespace rule would be wrong here. That shape's weakness — a newly mapped verb falling through
	 * unnoticed — is covered by {@code EndpointRoleGateCoverageTest} instead.
	 */
	private static final String BEACH_MAP_PATH = "/api/venues/*/beach-map";
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
	 * The platform-admin weekly BKT payout-batch report: generate (POST) / list (GET). Neither this nor
	 * {@link #PAYOUT_BATCH_ITEM_PATH} is venue-scoped — the GET reports every venue's gross/commission/net
	 * and the PATCH addresses a batch by id — so under an {@code OPERATOR} gate any approved operator
	 * could read competitors' payout figures (OWASP API #1). Invariant #13 exempts {@code /api/admin/**}
	 * from per-venue ownership, which is precisely why the role has to be the strict one: here the gate
	 * is the whole authorization.
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
	/**
	 * The per-booking mail-delivery view and its resend — the support lever the outbox cannot be: that
	 * re-drives what the registry still <em>owes</em>, this re-sends a confirmation whose publication
	 * already completed (the common "never got the email" case).
	 *
	 * <p>The lookup is a {@code POST} although it reads: its key is an email address, and a query string
	 * would deposit that address in access, proxy and browser-history logs.
	 */
	private static final String ADMIN_MAIL_DELIVERY_LOOKUP_PATH = "/api/admin/mail-deliveries/lookup";
	private static final String ADMIN_MAIL_DELIVERY_RESEND_PATH = "/api/admin/mail-deliveries/*/resend";
	/**
	 * Platform-admin venue-photo takedown. Unlike the other admin surfaces it is not platform-wide
	 * state — it acts on one venue's data, and the invariant-#13 exemption is the whole point: the
	 * venue-scoped DELETE answers a non-owner {@code 403 NOT_VENUE_OWNER}, which is exactly the case
	 * moderation exists for. Two single-segment wildcards: venue id, then slot.
	 */
	private static final String ADMIN_VENUE_PHOTO_PATH = "/api/admin/venues/*/photos/*";
	/**
	 * The moderation <em>read</em> that makes the takedown usable — without it an admin could delete a
	 * photo it could not see. One wildcard, not two: this path ends at {@code /photos}, which is what
	 * keeps it and the slot-addressed {@code DELETE} above from ever matching each other.
	 */
	private static final String ADMIN_VENUE_PHOTOS_PATH = "/api/admin/venues/*/photos";
	/**
	 * The platform-admin commission surface — the venues-with-commission list and the rate write. An
	 * admin does not <em>own</em> a rate, so object-level authorization has nothing to check; the
	 * venue-scoped alternative treats the rate as read-only on purpose (a venue does not set its own
	 * commission). The list path is the bare namespace root and the write ends at a literal
	 * {@code /commission} segment, so neither can shadow the photo patterns above.
	 */
	private static final String ADMIN_VENUE_COMMISSIONS_PATH = "/api/admin/venues";
	private static final String ADMIN_VENUE_COMMISSION_ITEM_PATH = "/api/admin/venues/*/commission";
	/**
	 * Platform-admin review moderation: the per-venue list that makes a takedown operable (it must
	 * reach venues the public list hides), and the two takedown verbs by review id. The list ends at
	 * a literal {@code /reviews} segment, so it cannot shadow the photo or commission patterns; the
	 * verbs sit under {@code /api/admin/reviews}, a namespace of their own.
	 */
	private static final String ADMIN_VENUE_REVIEWS_PATH = "/api/admin/venues/*/reviews";
	private static final String ADMIN_REVIEW_HIDE_PATH = "/api/admin/reviews/*/hide";
	private static final String ADMIN_REVIEW_UNHIDE_PATH = "/api/admin/reviews/*/unhide";
	/**
	 * The platform-admin audit-trail read (required by ADR-0013) — the latest recorded mutating
	 * {@code /api/admin/**} actions, newest first. The <em>writes</em> it reads are recorded by
	 * {@link AdminAuditFilter}, registered after the authorization filter so only actions past the gate
	 * leave a row.
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
	 * The signed-in operator's own password change — unlike the two paths above it is
	 * <strong>authenticated</strong>. It lives here rather than under {@code /api/me/**} precisely
	 * because that namespace is CUSTOMER-only and method-agnostic (see {@link #ME_PATHS}); putting it
	 * there would 403 every operator and quietly falsify that rule. On its own rate-limit budget so a
	 * change flood can never starve operator login.
	 */
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	/** Customer session login + registration; anonymous by definition, like the operator login. */
	private static final String CUSTOMER_LOGIN_PATH = "/api/auth/customer/login";
	private static final String CUSTOMER_REGISTER_PATH = "/api/auth/customer/register";
	/**
	 * The proof-of-work challenge the widget fetches before a fenced write: anonymous by definition
	 * (the solution, not a session, is what the fence checks), on its own rate-limit budget.
	 */
	private static final String CHALLENGE_PATH = ChallengeController.PATH;
	/**
	 * The signed-in tourist's own surface — my-bookings, set-password + verification-resend,
	 * self-service erasure. {@code CUSTOMER}-only, and deliberately <strong>method-agnostic</strong>:
	 * {@code /api/me/**} is by definition the session customer's own resources, so every verb belongs to
	 * the same principal type. A namespace rule fails <em>closed</em> for any future verb, where a
	 * {@code GET}-only matcher let each new {@code POST} fall through to
	 * {@code anyRequest().authenticated()}. {@code CurrentCustomer.require} remains as defence-in-depth.
	 * <strong>Adding a non-customer endpoint under this prefix would make the rule wrong</strong> — put
	 * it elsewhere, as {@code GET /api/venues/mine} does for operators.
	 */
	private static final String ME_PATHS = "/api/me/**";
	/**
	 * Public customer account-recovery POSTs: request a reset link, redeem a reset token, redeem a
	 * verification token. Anonymous by definition — the emailed token is the bearer credential
	 * (invariant #7); behind the recovery rate-limit budget. CSRF-protected like the customer login, so
	 * deliberately NOT in the CSRF ignore list.
	 */
	private static final String FORGOT_PASSWORD_PATH = "/api/auth/customer/forgot-password";
	private static final String RESET_PASSWORD_PATH = "/api/auth/customer/reset-password";
	private static final String VERIFY_EMAIL_PATH = "/api/auth/customer/verify-email";
	/**
	 * The SSO redirect/callback surface: the authorize + callback GETs and the mock IdP authorize GET.
	 * Anonymous by definition — the callback completes the OIDC exchange and establishes the session
	 * internally; GETs are never CSRF-challenged, and the {@code state} nonce is the callback's forgery
	 * defence.
	 */
	private static final String SSO_PATHS = "/api/auth/sso/**";
	/** The session logout; handled by the framework {@code LogoutFilter}, not a controller. */
	private static final String LOGOUT_PATH = "/api/auth/logout";

	/**
	 * The backend chain, scoped to {@code /api/**} + {@code /actuator/**} and ordered FIRST so the SPA
	 * shell's permit-all chain below only catches what this one did not match.
	 *
	 * <p><strong>ORDERING RULE — first match wins.</strong> Every operator-only
	 * {@code GET /api/venues/*&#47;…} rule below MUST precede the public {@code GET /api/venues/**}, or
	 * its data leaks to anyone. Each such rule carries an "order-sensitive" note on its path constant.
	 *
	 * <p>{@code .spa()} is Spring Security 7's single-page-app CSRF posture: a JS-readable XSRF-TOKEN
	 * cookie the SPA echoes as {@code X-XSRF-TOKEN}. The only exemptions are the genuinely token-less
	 * surfaces — guest booking create/cancel/withdraw, authorized by the booking code alone
	 * (invariant #7) and deliberately session-free, and the Stripe webhook, a server-to-server POST
	 * authenticated by its signature header (invariant #8).
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
						.requestMatchers(HttpMethod.POST, "/api/venues/*/sets").hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PATCH, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.DELETE, SET_ITEM_PATH).hasRole(OPERATOR_ROLE)
						.requestMatchers(HttpMethod.PUT, BEACH_MAP_PATH, ROW_PRICE_PATH, ROW_NAME_PATH)
						.hasRole(OPERATOR_ROLE)
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
	 * The public single-page-app shell: every non-API, non-actuator path — the Angular index, its hashed
	 * assets, and the client-side deep-link routes served by {@link SpaWebConfig} — is anonymous.
	 * Ordered LAST, so it only catches what the API chain's {@code securityMatcher} did not.
	 *
	 * <p>CSRF is left at its <strong>default (enabled)</strong>: this chain serves only safe static GETs,
	 * which CSRF never challenges, so there is nothing to protect and nothing to disable. Explicitly
	 * disabling it would trip {@code java/spring-disabled-csrf-protection} (CodeQL) for no benefit.
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
	 * The CUSTOMER authentication manager: an explicit {@link ProviderManager} whose
	 * {@link CustomerUserDetailsService} is built INLINE. Kept separate from the operator
	 * {@link #authenticationManager} so a customer credential can never authenticate as an operator —
	 * {@code AuthController} selects the manager per principal-typed endpoint. Deliberately NOT wired as
	 * a second {@code UserDetailsService} bean: that would make {@link AuthenticationConfiguration}
	 * ambiguous and break the operator manager's auto-wiring.
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
	 * Logout success handler that answers {@code 204} <strong>and</strong> re-issues a fresh
	 * {@code XSRF-TOKEN} cookie. The framework's {@code CsrfLogoutHandler} clears the CSRF cookie during
	 * logout and {@code LogoutFilter} then short-circuits the chain, so {@code .spa()}'s deferred-token
	 * machinery never runs on the logout response — leaving the SPA with no token, and its next
	 * CSRF-protected POST answering {@code 403 INVALID_CSRF_TOKEN}. Generating a new token here restores
	 * the invariant that every response leaves a usable token. The repository is stateless (the token
	 * lives in the cookie, not the just-invalidated session), and one shared logout filter covers both
	 * principal types.
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
	 * The session cookie's posture, owned in code: {@code HttpOnly}, {@code Secure} (browsers treat
	 * {@code http://localhost} as trustworthy, so local dev still works), {@code SameSite=Lax} (CSRF
	 * layer 1 — the cookie-to-header token is layer 2). A user-defined {@link CookieSerializer} bean
	 * makes Boot's session auto-configuration back off, which keeps these flags deterministic in every
	 * environment rather than depending on the {@code server.servlet.session.cookie.*} property mapping —
	 * which did not reach the Spring Session cookie under a mock web environment. Pinned by
	 * {@code AuthSessionIT}.
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
	 * The per-operator {@link UserDetailsService}: each login is resolved to a DB-backed operator account
	 * via {@link OperatorAccounts} and verified against the stored hash. Defining it here replaces both
	 * Boot's auto-generated default user and the old single shared in-memory operator — nothing is held
	 * in memory.
	 */
	@Bean
	UserDetailsService operatorDetailsService(OperatorAccounts accounts) {
		return new OperatorUserDetailsService(accounts);
	}

	/**
	 * One issuer/verifier for the challenge endpoint and the verification filter; the registry adapter
	 * is the only Postgres-backed collaborator, which is what the web slices substitute.
	 */
	@Bean
	ProofOfWorkChallenges proofOfWorkChallenges(AltchaProperties altchaProperties, Clock clock,
			ChallengeRegistry challengeRegistry) {
		return new ProofOfWorkChallenges(altchaProperties, clock, challengeRegistry);
	}
}
