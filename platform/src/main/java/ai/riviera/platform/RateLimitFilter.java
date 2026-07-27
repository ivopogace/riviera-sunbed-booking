package ai.riviera.platform;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UriUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Per-IP and per-code rate limiting for the three public, unauthenticated booking endpoints
 * (issue #56): {@code GET /api/bookings/{code}}, {@code POST /api/bookings/{code}/cancel} and
 * {@code POST /api/bookings} — plus, since issue #109, the session login
 * ({@code POST /api/auth/operator/login}) on its own stricter per-IP budget (D-8: the login is a
 * credential-guessing oracle exactly like the code endpoints), and since S4 (#112) the SSO
 * authorize/callback GETs on their own per-IP budget. They are {@code permitAll} because
 * the booking code is the bearer credential (invariant #7); the {@code 200}/{@code 404} answer is
 * otherwise a brute-force oracle, so this filter caps request volume.
 *
 * <p><strong>Keying.</strong> The per-IP bucket guards all three endpoints (the primary defence
 * against an enumerator trying many codes from one IP); the per-code bucket additionally guards the
 * two code-keyed endpoints (against hammering a single known code). A request is rejected if
 * <em>either</em> bucket is empty. The per-code limit is configured above the frontend's ~20/30s
 * payment poll so a real payer is never throttled (ADR-0006).
 *
 * <p><strong>Per-identity login dimension (issue #292).</strong> The two logins
 * ({@code POST /api/auth/operator/login}, {@code POST /api/auth/customer/login}) carry an additional
 * bucket keyed on the <em>submitted identity</em> — the operator {@code username} / the normalised
 * customer {@code email} — <em>not</em> the client IP. It covers the attack per-IP throttling is
 * structurally worst at: one account guessed from many source addresses (a botnet, or a rotating CDN
 * edge). A login is rejected if <em>either</em> the per-IP or the per-identity bucket is empty. Reading
 * the identity means reading the request body, so the two login requests are wrapped in a re-readable
 * {@link CachedBodyRequest} (the servlet stream is single-consumption) — invisible downstream. Two
 * deliberate properties: (1) only a <em>failed</em> authentication ({@code 401}) net-consumes an
 * identity token — the filter spends a token before the chain and refunds it after on any non-401
 * outcome — so a legitimate sign-in is never throttled <em>by its own success</em> and the auth-IT
 * corpus's session logins stay free (the #127 full-suite lockout class); a known account can still be
 * denied login by an attacker draining its budget (the accepted lock-out-by-proxy trade-off, tuned by a
 * modest capacity + steady refill). (2) the bucket key is a per-process-salted SHA-256 <em>hash</em> of
 * the identity, so the tracking map cannot be dictionary-confirmed for valid usernames and no identity
 * (PII + a credential half) is ever held in clear or logged (non-enumeration, D-8). Per-IP stays
 * count-all (request-volume control); per-identity is failure-only (credential-guess control) — a
 * deliberate asymmetry.
 *
 * <p><strong>Authenticated budgets refund a denied request (issue #343).</strong> This filter is installed
 * ahead of {@code CsrfFilter} and {@code AuthorizationFilter}, so it spends a token before anything checks
 * who is calling. On the budgets that guard an <em>authenticated</em> endpoint that let a caller with no
 * session, no account and no CSRF token drain the budget for everyone on the address — and venue WiFi /
 * CGNAT is exactly the topology those budgets were split for, so an operator behind it met a {@code 429}
 * on the page whose purpose is rotating a credential they believe is compromised. Those budgets now
 * release the token when the request was denied before reaching the work they guard. The policy is
 * per-budget and not filter-wide, because on a login the identical {@code 401} means the opposite thing —
 * see {@link AuthBudget}.
 *
 * <p><strong>State.</strong> In-memory token buckets in bounded {@link ConcurrentHashMap}s — correct
 * for the single Render instance (ADR-0004); no Redis. Each map is hard-bounded by
 * {@code maxTrackedKeys}: when the cap is reached we first prune <em>full</em> (idle) buckets
 * (lossless — a full bucket is indistinguishable from a fresh one), and only if that frees nothing
 * (an extreme key-rotation flood, itself gated by the per-IP limit) do we reset the map as a backstop,
 * so memory cannot grow without bound. Time comes from the injected {@link Clock} (testable).
 *
 * <p>App-level web concern in the root package (like {@link SecurityConfig}/{@link WebCorsConfig}),
 * not a Modulith module; it matches endpoints by URL path only and imports nothing from the booking
 * module. The booking code is used solely as a map key and is <strong>never logged</strong>
 * (invariant #7); only the (newline-sanitised) IP and a dimension label may appear at debug level.
 */
final class RateLimitFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

	/**
	 * Mirrors the {@code ApiProblem} RFC-7807 shape (issue #97) by hand: this filter rejects before
	 * MVC dispatch, so {@code ApiErrorHandler} can never map it. Kept in lockstep by
	 * {@code RateLimitFilterTest}.
	 */
	private static final String RATE_LIMITED_BODY = """
			{"type":"about:blank","title":"Too Many Requests","status":429,\
			"detail":"Too many requests. Retry later.","code":"RATE_LIMITED"}""";

	// Mirrors the SecurityConfig matchers for the three public booking endpoints: CREATE_PATH is the
	// exact create POST; VIEW_TEMPLATE the view-by-code GET; CANCEL_TEMPLATE the cancel POST.
	private static final String CREATE_PATH = "/api/bookings";
	private static final String VIEW_TEMPLATE = "/api/bookings/{code}";
	private static final String CANCEL_TEMPLATE = "/api/bookings/{code}/cancel";
	private static final String CODE_VAR = "code";
	// The session logins (issue #109, D-8): per-IP throttled on their OWN, stricter budget — a
	// credential-guessing oracle, like the booking-code endpoints, but a separate dimension so
	// tightening one never starves the other. Mirrors SecurityConfig's login/register paths. Customer
	// register (S2 #111) shares the login budget: it is as abusable (spam / enumeration) as a login.
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	// Operator self-registration (S6 #115, D-8): its OWN per-IP budget, SEPARATE from operator login, so
	// a burst of registrations can never starve operator login (the S2 operator-lockout lesson, #127).
	private static final String OPERATOR_REGISTER_PATH = "/api/auth/operator/register";
	/**
	 * The two authenticated password-change endpoints (#326, D-8) — operator and customer. Each is a
	 * credential oracle like a login (an attempt reveals whether the submitted <em>current</em> password
	 * was right), so both must be throttled; the customer one had no budget at all until the #326
	 * generalization audit found it.
	 *
	 * <p>They get <strong>separate</strong> maps, and neither is the login map. A change flood must not
	 * exhaust the LOGIN budget (that is the #111 operator-lockout defect), and the two principal types
	 * must not share a per-IP budget either: venue WiFi / CGNAT puts tourists and operators behind one
	 * address, so a tourist flood would otherwise block an operator from rotating a credential it
	 * believes is compromised.
	 */
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	private static final String CUSTOMER_PASSWORD_PATH = "/api/me/password";
	private static final String CUSTOMER_LOGIN_PATH = "/api/auth/customer/login";
	private static final String CUSTOMER_REGISTER_PATH = "/api/auth/customer/register";
	// The account-recovery POSTs (S8 #113, D-8): forgot-password / reset-password / verify-email (public)
	// and the authenticated verification-resend. Each is a mail-sending or token-guessing oracle, so they
	// ride their OWN per-IP budget — separate from customerAuthBuckets, so recovery spam can never starve
	// login (the S2 operator-lockout lesson, #127). Exact paths (all POST); no path templates needed.
	private static final Set<String> RECOVERY_PATHS = Set.of(
			"/api/auth/customer/forgot-password", "/api/auth/customer/reset-password",
			"/api/auth/customer/verify-email", "/api/me/verify-email/request");
	// The SSO redirect/callback GETs (S4 #112, D-3/D-8): unauthenticated oracles like the logins —
	// authorize mints sessions, callback exchanges codes — so they ride a per-IP budget too. Templates
	// (one {provider} segment) so the deeper mock-authorize path (/sso/mock/{provider}/authorize) never
	// matches and is not throttled.
	private static final String SSO_PATH_PREFIX = "/api/auth/sso/";
	private static final String SSO_AUTHORIZE_TEMPLATE = "/api/auth/sso/{provider}/authorize";
	private static final String SSO_CALLBACK_TEMPLATE = "/api/auth/sso/{provider}/callback";

	// Upper bound on a login body we will buffer to read the identity (issue #292): a real login body is
	// ~60 bytes, so 8 KiB is vast headroom while keeping the in-filter buffer bounded. A larger (or
	// unknown-length) body is not buffered — the per-IP budget still applies and the controller rejects it.
	private static final int MAX_CACHED_BODY_BYTES = 8 * 1024;
	// The status a failed authentication lands on (AuthController → ApiErrorHandler → 401): the ONLY
	// outcome that spends a per-identity token, so a successful (200) or malformed (400) login does not.
	private static final int FAILED_AUTH_STATUS = HttpStatus.UNAUTHORIZED.value();

	/**
	 * The two login endpoints that carry the per-identity budget (issue #292) and the JSON field each is
	 * keyed on. Operator login keys on the raw {@code username} (mirroring the value {@code AuthController}
	 * passes to {@code authenticate()}); customer login keys on the {@code email} normalised the same way
	 * the {@code customer} module stores it, so case/whitespace variants share one bucket (AC-3). The
	 * {@code scope} prefix keeps the two identity spaces from ever colliding in the shared bucket map.
	 */
	private enum LoginEndpoint {
		OPERATOR(LOGIN_PATH, "username", false, "op"),
		CUSTOMER(CUSTOMER_LOGIN_PATH, "email", true, "cust");

		private final String path;
		private final String identityField;
		private final boolean normalizeEmail;
		private final String scope;

		LoginEndpoint(String path, String identityField, boolean normalizeEmail, String scope) {
			this.path = path;
			this.identityField = identityField;
			this.normalizeEmail = normalizeEmail;
			this.scope = scope;
		}
	}

	private final RateLimitProperties props;
	private final Clock clock;
	private final ClientIpResolver clientIps;
	private final AntPathMatcher paths = new AntPathMatcher();
	private final Map<String, TokenBucket> ipBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> codeBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> loginBuckets = new ConcurrentHashMap<>();
	// Customer login + register draw on their OWN per-IP budget, separate from operator login
	// (S2 #111): a burst of unauthenticated customer registrations from a shared IP (venue WiFi /
	// CGNAT) must never exhaust the operator-login budget and lock operators out.
	private final Map<String, TokenBucket> customerAuthBuckets = new ConcurrentHashMap<>();
	// Operator self-registration (S6 #115) on its OWN per-IP budget, separate from operator login so a
	// registration flood can never lock operators out (the #127 lockout lesson).
	private final Map<String, TokenBucket> operatorRegisterBuckets = new ConcurrentHashMap<>();
	// The two password-change budgets (#326), one per principal type — see OPERATOR_PASSWORD_PATH.
	private final Map<String, TokenBucket> operatorPasswordBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> customerPasswordBuckets = new ConcurrentHashMap<>();
	// SSO authorize/callback GETs draw on their OWN per-IP budget (S4 #112), separate from the logins so
	// tightening one never starves the other — same rationale as customerAuthBuckets.
	private final Map<String, TokenBucket> ssoBuckets = new ConcurrentHashMap<>();
	// Account-recovery POSTs (S8 #113) on their OWN per-IP budget — see RECOVERY_PATHS.
	private final Map<String, TokenBucket> recoveryBuckets = new ConcurrentHashMap<>();
	// Per-submitted-identity login budget (issue #292): one map for both logins, keyed by a scoped SHA-256
	// hash of the identity so the two identity spaces never collide and no plaintext identity is retained.
	private final Map<String, TokenBucket> usernameBuckets = new ConcurrentHashMap<>();

	private final ObjectMapper objectMapper;
	// A per-process random salt for the per-identity bucket keys (issue #292), so the map keys cannot be
	// dictionary-confirmed against a candidate username list; regenerated each restart (buckets are
	// in-memory, so nothing depends on key stability across restarts).
	private final byte[] identitySalt = new byte[16];

	RateLimitFilter(RateLimitProperties props, Clock clock, ObjectMapper objectMapper) {
		this.props = props;
		this.clock = clock;
		this.objectMapper = objectMapper;
		this.clientIps = new ClientIpResolver(props.trustedProxies(), props.clientIpHeader());
		new SecureRandom().nextBytes(identitySalt);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		// The auth endpoints ride their own per-IP budgets (issue #109 / S2 #111, D-8) — checked first
		// because they are not one of the booking Targets below. Operator login and the customer auth
		// endpoints use SEPARATE bucket maps under the same limit, so customer traffic can't starve
		// operator login from a shared IP.
		if (props.enabled()) {
			Optional<AuthBudget> authBudget = authBudgetFor(request);
			if (authBudget.isPresent()) {
				throttleAuthEndpoint(authBudget.get(), request, response, chain);
				return;
			}
		}

		// Classify the request once: skip non-booking endpoints, preflights, and (when disabled) all.
		Target target = props.enabled() ? targetOf(request) : null;
		if (target == null) {
			chain.doFilter(request, response);
			return;
		}

		Instant now = clock.instant();
		String ip = clientIps.resolve(request);

		// Per-IP: all three endpoints.
		TokenBucket ipBucket = bucketFor(ipBuckets, ip, props.perIp(), now);
		if (!ipBucket.tryAcquire(now)) {
			reject(response, ipBucket.retryAfterSeconds(now), ip, "ip");
			return;
		}

		// Per-code: only the two code-keyed endpoints carry a code.
		if (target.code() != null) {
			TokenBucket codeBucket = bucketFor(codeBuckets, target.code(), props.perCode(), now);
			if (!codeBucket.tryAcquire(now)) {
				reject(response, codeBucket.retryAfterSeconds(now), ip, "code");
				return;
			}
		}

		chain.doFilter(request, response);
	}

	/** A matched booking endpoint and its booking code ({@code null} for the code-less create). */
	private record Target(String code) {
	}

	/**
	 * The per-IP budget an auth request draws on, and whether a token it spent is released again when the
	 * request was denied before reaching the work that budget protects (issue #343).
	 *
	 * <p><strong>Why the policy travels with the budget instead of being one filter-wide rule.</strong>
	 * The refund keys on {@code 401}/{@code 403}. On a password change those statuses can only mean the
	 * caller never reached the credential check — {@link OperatorAccountController} answers
	 * {@code 400}/{@code 409}/{@code 204}, and {@link MyAccountController} {@code 400}/{@code 204} or the
	 * {@code 403} of {@link CurrentCustomer#require}, which is itself a "no account resolved, nothing
	 * checked" outcome. On a <em>login</em> the very same {@code 401} is the controller's answer to a wrong
	 * password — precisely what that budget exists to charge for. Same status code, opposite meaning, so a
	 * filter-wide refund would silently disable login throttling while looking like a safety improvement.
	 *
	 * <p><strong>What this deliberately gives up.</strong> A caller that omits its CSRF token is refunded
	 * too, so a token-less flood costs the attacker nothing. That is accepted: {@code CsrfFilter} rejects
	 * it with no database read, no bcrypt and no mail sent — the guarded work is never reached, which is
	 * the same reason the refund is correct in the first place. Volume control against traffic the chain
	 * throws away is not this filter's job; it is not any endpoint's job outside these budgets either.
	 */
	private record AuthBudget(Map<String, TokenBucket> buckets, boolean refundedWhenAccessDenied) {

		/** An anonymous surface: every request spends, because request volume IS what is being limited. */
		static AuthBudget spendsEveryRequest(Map<String, TokenBucket> buckets) {
			return new AuthBudget(buckets, false);
		}

		/** A budget guarding authenticated work: a request denied before reaching it must cost nothing. */
		static AuthBudget guardsAuthenticatedWork(Map<String, TokenBucket> buckets) {
			return new AuthBudget(buckets, true);
		}
	}

	/**
	 * Apply an auth endpoint's per-IP budget, run the chain, and refund the token if the budget
	 * {@linkplain AuthBudget#refundedWhenAccessDenied() refunds} and access was denied.
	 *
	 * <p>Spend-then-refund, not peek-then-spend, so the cap stays exact under concurrency — the same trade
	 * {@link #throttlePerIdentity} already makes, and the reason a burst can leave the bucket momentarily
	 * empty for a concurrent caller. The refund is deliberately not in a {@code finally}: an exception
	 * escaping the chain is a {@code 500}, not an access denial, and must not be refunded.
	 */
	private void throttleAuthEndpoint(AuthBudget budget, HttpServletRequest request,
			HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
		Instant now = clock.instant();
		String ip = clientIps.resolve(request);
		TokenBucket ipBucket = bucketFor(budget.buckets(), ip, props.login(), now);
		if (!ipBucket.tryAcquire(now)) {
			reject(response, ipBucket.retryAfterSeconds(now), ip, "login");
			return;
		}
		// The two logins additionally carry a per-identity budget (issue #292); the other auth
		// POSTs (register / recovery / SSO) stay per-IP only.
		LoginEndpoint login = loginEndpointOf(request);
		if (login != null) {
			throttlePerIdentity(login, request, response, chain, ip, now);
			return;
		}
		chain.doFilter(request, response);
		if (budget.refundedWhenAccessDenied() && accessWasDenied(response)) {
			ipBucket.release(now);
		}
	}

	/**
	 * Was the request denied without reaching the work its budget guards? Deliberately not expressed with
	 * {@link #FAILED_AUTH_STATUS}: that constant is the <em>login controller's</em> {@code 401}, the one
	 * status that spends a per-identity token. This is the opposite concept wearing the same number, and
	 * folding the two together is exactly the mistake {@link AuthBudget} warns about.
	 */
	private static boolean accessWasDenied(HttpServletResponse response) {
		int status = response.getStatus();
		return status == HttpStatus.UNAUTHORIZED.value() || status == HttpStatus.FORBIDDEN.value();
	}

	/**
	 * The per-IP auth budget a request draws on, or empty if it is not an auth request. Operator login
	 * draws on {@code loginBuckets}; the customer auth endpoints (login + register) draw on the SEPARATE
	 * {@code customerAuthBuckets} under the same {@code login} limit, so tourist-side traffic can never
	 * exhaust operator login (a shared IP on venue WiFi / CGNAT). Never an OPTIONS preflight — the method
	 * check excludes it. Each budget also carries its refund policy; see {@link AuthBudget}.
	 */
	private Optional<AuthBudget> authBudgetFor(HttpServletRequest request) {
		String method = request.getMethod();
		String path = pathWithinApplication(request);
		if (HttpMethod.POST.matches(method)) {
			return authPostBudgetFor(path);
		}
		// SSO authorize/callback are GETs (the OIDC redirect flow, S4 #112); throttle them per-IP too. A
		// cheap prefix pre-check keeps the two AntPathMatcher matches off every hot public venue/booking GET.
		if (HttpMethod.GET.matches(method) && path.startsWith(SSO_PATH_PREFIX)
				&& (paths.match(SSO_AUTHORIZE_TEMPLATE, path) || paths.match(SSO_CALLBACK_TEMPLATE, path))) {
			return Optional.of(AuthBudget.spendsEveryRequest(ssoBuckets));
		}
		return Optional.empty();
	}

	/**
	 * The budget an auth <em>POST</em> draws on, split out of {@link #authBudgetFor} so each path stays
	 * within the cognitive-complexity bar as budgets accumulate (#326 was the branch that tipped it).
	 * Every endpoint here is a credential or mail-sending oracle, and each named budget is deliberately
	 * separate: the recurring defect this shape prevents is one surface's flood exhausting another's
	 * budget and locking legitimate users out (#111/#127).
	 *
	 * <p>The {@code spendsEveryRequest} / {@code guardsAuthenticatedWork} choice per budget is issue #343:
	 * an anonymous surface throttles every request, while a budget protecting an authenticated endpoint
	 * refunds a request the chain denied — otherwise a caller with no session at all drains the budget and
	 * denies real operators the credential rotation the endpoint exists for. See {@link AuthBudget}.
	 */
	private Optional<AuthBudget> authPostBudgetFor(String path) {
		if (LOGIN_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(loginBuckets));
		}
		// Operator self-registration (S6 #115) on its own budget, separate from operator login.
		if (OPERATOR_REGISTER_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(operatorRegisterBuckets));
		}
		// The password changes (#326) on their own per-principal-type budgets, never the login ones.
		if (OPERATOR_PASSWORD_PATH.equals(path)) {
			return Optional.of(AuthBudget.guardsAuthenticatedWork(operatorPasswordBuckets));
		}
		if (CUSTOMER_PASSWORD_PATH.equals(path)) {
			return Optional.of(AuthBudget.guardsAuthenticatedWork(customerPasswordBuckets));
		}
		if (CUSTOMER_LOGIN_PATH.equals(path) || CUSTOMER_REGISTER_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(customerAuthBuckets));
		}
		// Account-recovery POSTs (S8 #113) on their own per-IP budget, so recovery spam never starves login.
		if (RECOVERY_PATHS.contains(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(recoveryBuckets));
		}
		return Optional.empty();
	}

	/**
	 * Classify the request in a single pass: {@code null} if it is a CORS preflight or not one of the
	 * three booking endpoints; otherwise a {@link Target} carrying the booking code (or {@code null}
	 * for create). Computes the path and runs the matcher once, not per check.
	 */
	private Target targetOf(HttpServletRequest request) {
		String method = request.getMethod();
		if (HttpMethod.OPTIONS.matches(method)) {
			return null; // CORS preflight — never counted
		}
		String path = pathWithinApplication(request);
		if (HttpMethod.GET.matches(method) && paths.match(VIEW_TEMPLATE, path)) {
			return new Target(paths.extractUriTemplateVariables(VIEW_TEMPLATE, path).get(CODE_VAR));
		}
		if (HttpMethod.POST.matches(method)) {
			if (paths.match(CANCEL_TEMPLATE, path)) {
				return new Target(paths.extractUriTemplateVariables(CANCEL_TEMPLATE, path).get(CODE_VAR));
			}
			if (path.equals(CREATE_PATH)) {
				return new Target(null); // create carries no code → per-IP only
			}
		}
		return null;
	}

	/**
	 * The request path every budget here is keyed on — decoded and stripped of matrix parameters, so it is
	 * the <strong>same</strong> path Spring Security's matchers and {@code @PostMapping} route on.
	 *
	 * <p>It deliberately does not use the raw {@code getRequestURI()}. The servlet spec leaves that
	 * percent-encoded, so {@code …/passwor%64} compared against a plain constant matched nothing, spent no
	 * token, and still reached the controller — an unthrottled brute-force oracle against the credential
	 * this filter exists to protect. Found at the #342 review gate; the defect predated #326 and applied to
	 * <em>every</em> budget here, operator login included.
	 *
	 * <p>Matrix parameters ({@code …/password;a=b}) are the sibling bypass and are deliberately <em>not</em>
	 * handled here: {@code StrictHttpFirewall} rejects a {@code ;} outright, before any filter of ours runs,
	 * so a strip would be unreachable code that no test can exercise. {@code RateLimitFilterTest} pins that
	 * dependency as a tripwire, so relaxing the firewall fails a test rather than silently opening the hole.
	 */
	private static String pathWithinApplication(HttpServletRequest request) {
		String uri = request.getRequestURI();
		String context = request.getContextPath();
		String withinApp = (context != null && !context.isEmpty() && uri.startsWith(context))
				? uri.substring(context.length())
				: uri;
		return decodePath(withinApp);
	}

	/** A malformed escape keeps the raw form: it matches no budget, and the filter chain still rejects it. */
	static String decodePath(String path) {
		try {
			return UriUtils.decode(path, StandardCharsets.UTF_8);
		}
		catch (IllegalArgumentException malformedEscape) {
			return path;
		}
	}

	/**
	 * Fetch (or create) the bucket for {@code key}, keeping the map hard-bounded by
	 * {@code maxTrackedKeys}: an existing key is a single lookup; a new key past the cap first prunes
	 * full (idle) buckets — lossless — and, only if that frees nothing under an extreme key-rotation
	 * flood, resets the map as a backstop so memory cannot grow without bound.
	 */
	private TokenBucket bucketFor(Map<String, TokenBucket> buckets, String key,
			RateLimitProperties.Limit limit, Instant now) {
		TokenBucket existing = buckets.get(key);
		if (existing != null) {
			return existing;
		}
		if (buckets.size() >= props.maxTrackedKeys()) {
			buckets.values().removeIf(bucket -> bucket.isFull(now)); // lossless: full == fresh
			if (buckets.size() >= props.maxTrackedKeys()) {
				log.debug("Rate-limit key map hit the {} cap under heavy churn — resetting", props.maxTrackedKeys());
				buckets.clear(); // backstop: bounds memory; only reachable under a flood the per-IP limit gates
			}
		}
		return buckets.computeIfAbsent(key,
				ignored -> new TokenBucket(limit.capacity(), limit.refillPeriod(), now));
	}

	/**
	 * Apply the per-identity login budget (issue #292): wrap the body so it stays readable downstream,
	 * extract + hash the identity, and gate on its bucket. Peek <em>before</em> the chain (an empty bucket
	 * rejects the attempt) and spend <em>after</em> it only on a failed authentication ({@code 401}), so a
	 * successful login never consumes a token. If the body cannot be buffered or the identity is absent,
	 * the per-IP budget (already applied) stands alone and the request proceeds unchanged.
	 */
	private void throttlePerIdentity(LoginEndpoint login, HttpServletRequest request,
			HttpServletResponse response, FilterChain chain, String ip, Instant now)
			throws ServletException, IOException {
		Optional<byte[]> buffered = cacheableBody(request);
		if (buffered.isEmpty()) {
			// An unknown-length (chunked) or oversized login body is not buffered — the per-identity check
			// is skipped and only the per-IP budget applies. Logged so the skip is observable in prod.
			log.debug("Login body not buffered — per-username dimension skipped, from {}", ip);
			chain.doFilter(request, response);
			return;
		}
		byte[] body = buffered.get();
		HttpServletRequest cached = new CachedBodyRequest(request, body);
		String identityKey = identityKeyOf(login, body);
		if (identityKey == null) {
			chain.doFilter(cached, response); // no identity to key on — the controller will reject a bad body
			return;
		}
		// Spend-then-refund so the cap is exact under concurrency: acquire before the request runs (an
		// empty bucket rejects it), then release on any non-401 outcome — so only a failed authentication
		// net-consumes a token and a successful login is refunded (never throttled by its own success).
		TokenBucket bucket = bucketFor(usernameBuckets, identityKey, props.username(), now);
		if (!bucket.tryAcquire(now)) {
			reject(response, bucket.retryAfterSeconds(now), ip, "username");
			return;
		}
		chain.doFilter(cached, response);
		if (response.getStatus() != FAILED_AUTH_STATUS) {
			bucket.release(now);
		}
	}

	/** The login endpoint this request targets (issue #292), or {@code null} if it is not one of the two. */
	private static LoginEndpoint loginEndpointOf(HttpServletRequest request) {
		if (!HttpMethod.POST.matches(request.getMethod())) {
			return null;
		}
		String path = pathWithinApplication(request);
		for (LoginEndpoint endpoint : LoginEndpoint.values()) {
			if (endpoint.path.equals(path)) {
				return endpoint;
			}
		}
		return null;
	}

	/**
	 * The scoped SHA-256 bucket key for the identity in {@code body}, or {@code null} when the field is
	 * absent/blank or the body is unparseable. The customer email is normalised through the one canonical
	 * {@link CustomerPasswords#normalizeEmail} so it matches how the module stores it (AC-3); the operator
	 * username is used raw. Hashing keeps any valid username out of the tracking map + logs (AC-5/AC-6).
	 */
	private String identityKeyOf(LoginEndpoint login, byte[] body) {
		String raw = readJsonField(body, login.identityField);
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String identity = login.normalizeEmail ? CustomerPasswords.normalizeEmail(raw) : raw;
		return login.scope + ':' + saltedSha256Hex(identity);
	}

	/**
	 * The scalar value of {@code field} in the JSON {@code body} as a string, or {@code null} if absent,
	 * a container/null, or malformed. Accepts any scalar node — not just a JSON string — because the login
	 * DTO binding coerces a scalar (e.g. a bare number) to its {@code String} field, so an all-digits
	 * username submitted as {@code "username": 123} must key the same bucket the controller authenticates.
	 */
	private String readJsonField(byte[] body, String field) {
		try {
			JsonNode value = objectMapper.readTree(body).path(field);
			return value.isValueNode() && !value.isNull() ? value.asString() : null;
		}
		catch (JacksonException malformedBody) {
			return null;
		}
	}

	/**
	 * The login body as bytes when it is safe to buffer (a known Content-Length within
	 * {@link #MAX_CACHED_BODY_BYTES}), else {@link Optional#empty()} — an unknown or oversized body is not
	 * read here, so the input stream is left untouched for the downstream controller and only the per-IP
	 * budget bites. {@code Optional} (not {@code null}) so "don't buffer" is not confused with an empty body.
	 */
	private static Optional<byte[]> cacheableBody(HttpServletRequest request) throws IOException {
		long length = request.getContentLengthLong();
		if (length < 0 || length > MAX_CACHED_BODY_BYTES) {
			return Optional.empty();
		}
		return Optional.of(request.getInputStream().readAllBytes());
	}

	/**
	 * A SHA-256 hex digest of {@code value}, prefixed with a per-process random {@link #identitySalt} so
	 * the tracking-map keys cannot be dictionary-confirmed against a candidate username list (the salt is
	 * unknown outside the process and changes each restart) — only the same identity within one run maps
	 * to the same bucket, which is all the limiter needs.
	 */
	private String saltedSha256Hex(String value) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			digest.update(identitySalt);
			return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException impossible) {
			throw new IllegalStateException("SHA-256 is a required JDK algorithm", impossible);
		}
	}

	/**
	 * A request whose body is buffered in memory and served afresh on each {@code getInputStream()} /
	 * {@code getReader()} call, so the identity read in this filter does not consume the single-use servlet
	 * stream the downstream {@code @RequestBody} controller also needs (issue #292). Wraps only the two
	 * login requests, and only after their small body was already read into {@code body}.
	 */
	private static final class CachedBodyRequest extends HttpServletRequestWrapper {

		private final byte[] body;

		CachedBodyRequest(HttpServletRequest request, byte[] body) {
			super(request);
			this.body = body;
		}

		@Override
		public ServletInputStream getInputStream() {
			ByteArrayInputStream source = new ByteArrayInputStream(body);
			return new ServletInputStream() {
				@Override
				public int read() {
					return source.read();
				}

				@Override
				public boolean isFinished() {
					return source.available() == 0;
				}

				@Override
				public boolean isReady() {
					return true;
				}

				@Override
				public void setReadListener(ReadListener readListener) {
					throw new UnsupportedOperationException("async reads are not used on the login path");
				}
			};
		}

		@Override
		public BufferedReader getReader() {
			return new BufferedReader(new InputStreamReader(getInputStream(), charset()));
		}

		private Charset charset() {
			String encoding = getCharacterEncoding();
			return encoding != null ? Charset.forName(encoding) : StandardCharsets.UTF_8;
		}
	}

	private void reject(HttpServletResponse response, long retryAfterSeconds, String ip, String dimension)
			throws IOException {
		response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
		response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter().write(RATE_LIMITED_BODY);
		// IP is newline-sanitised by ClientIpResolver; the booking code is NEVER logged (invariant #7).
		log.debug("Rate-limited request from {} on the {} dimension", ip, dimension);
	}
}
