package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentCustomer;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.shared.ApiProblem;
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
 * Per-IP, per-code and per-identity limiting of the oracle endpoints: the {@code permitAll} booking-code
 * routes (the code is the bearer credential, invariant #7), logins, registration, password change,
 * recovery, SSO and the challenge GET. <strong>Every surface gets its own bucket map</strong>, so one
 * surface's flood never starves another; a request needs a token from every bucket it draws on.
 * In-memory and bounded by {@code maxTrackedKeys}: correct on a single instance only (ADR-0004). The
 * booking code is a map key only and is <strong>never logged</strong> (invariant #7).
 */
final class RateLimitFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

	/**
	 * Hand-built RFC-7807 body: this filter rejects before MVC, so {@code ApiErrorHandler} never maps it.
	 * No {@code instance}, so no URI is ever written (invariant #7); the wait is in {@code Retry-After}.
	 */
	private static final String RATE_LIMITED_BODY = """
			{"type":"about:blank","title":"Too Many Requests","status":429,\
			"detail":"Too many requests.","code":"RATE_LIMITED"}""";

	// Mirrors the SecurityConfig matchers for the eight public booking endpoints.
	private static final String CREATE_PATH = "/api/bookings";
	/** A literal sibling of the {@code {code}} routes (#795): it carries no code to key a bucket on. */
	private static final String TERMS_PATH = "/api/bookings/cancellation-terms";
	private static final String VIEW_TEMPLATE = "/api/bookings/{code}";
	private static final String CANCEL_TEMPLATE = "/api/bookings/{code}/cancel";
	private static final String WITHDRAW_TEMPLATE = "/api/bookings/{code}/withdraw";
	private static final String REVIEW_TEMPLATE = "/api/bookings/{code}/review";
	/** Submit, edit and delete — one resource, one budget. */
	private static final Set<String> REVIEW_METHODS =
			Set.of(HttpMethod.POST.name(), HttpMethod.PUT.name(), HttpMethod.DELETE.name());
	private static final String CODE_VAR = "code";

	// The auth POSTs, each on its own budget below; mirrors SecurityConfig's paths.
	private static final String LOGIN_PATH = "/api/auth/operator/login";
	private static final String OPERATOR_REGISTER_PATH = "/api/auth/operator/register";
	private static final String OPERATOR_PASSWORD_PATH = "/api/auth/operator/password";
	private static final String CUSTOMER_PASSWORD_PATH = "/api/me/password";
	private static final String CUSTOMER_LOGIN_PATH = "/api/auth/customer/login";
	private static final String CUSTOMER_REGISTER_PATH = "/api/auth/customer/register";

	/**
	 * The account-recovery POSTs; {@code /api/me/verify-email/request} is CUSTOMER-only, hence a refunding
	 * budget. Safe for the three public paths: their only refunded pre-controller denial is a CSRF
	 * {@code 403}, which sends no mail and redeems no token.
	 */
	private static final Set<String> RECOVERY_PATHS = Set.of(
			"/api/auth/customer/forgot-password", "/api/auth/customer/reset-password",
			"/api/auth/customer/verify-email", "/api/me/verify-email/request");

	// Templates (one {provider} segment), so the deeper mock-authorize path never matches.
	private static final String SSO_PATH_PREFIX = "/api/auth/sso/";
	private static final String SSO_AUTHORIZE_TEMPLATE = "/api/auth/sso/{provider}/authorize";
	private static final String SSO_CALLBACK_TEMPLATE = "/api/auth/sso/{provider}/callback";

	/**
	 * The proof-of-work challenge GET, on its own budget so a challenge flood never starves a login.
	 * The {@code challenge} module owns the route; {@code ChallengeEndpointTest} keeps this literal in
	 * lockstep with it.
	 */
	private static final String CHALLENGE_PATH = "/api/auth/challenge";

	/**
	 * Upper bound on a login body buffered to read the identity: a real one is ~60 bytes, so this is vast
	 * headroom while keeping the in-filter buffer bounded. A larger (or unknown-length) body is not
	 * buffered — the per-IP budget still applies and the controller rejects it.
	 */
	private static final int MAX_CACHED_BODY_BYTES = 8 * 1024;

	/** The failed-authentication status — the only outcome that net-spends a per-identity token. */
	private static final int FAILED_AUTH_STATUS = HttpStatus.UNAUTHORIZED.value();

	/**
	 * The two login endpoints carrying the per-identity budget, and the JSON field each is keyed on.
	 * Operator login keys on the raw {@code username} (mirroring what {@code AuthController} passes to
	 * {@code authenticate()}); customer login on the {@code email} normalised the way the {@code customer}
	 * module stores it, so case/whitespace variants share one bucket. The {@code scope} prefix keeps the
	 * two identity spaces from ever colliding in the shared bucket map.
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

	// One map per surface, never shared — see the class Javadoc.
	private final Map<String, TokenBucket> ipBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> codeBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> loginBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> customerAuthBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> operatorRegisterBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> operatorPasswordBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> customerPasswordBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> ssoBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> recoveryBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> challengeBuckets = new ConcurrentHashMap<>();

	/** Both logins share this one, keyed by a scoped hash so their identity spaces never collide. */
	private final Map<String, TokenBucket> usernameBuckets = new ConcurrentHashMap<>();

	private final ObjectMapper objectMapper;

	/** Regenerated each restart; the buckets are in-memory, so no key stability is needed across them. */
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
		// The auth endpoints ride their own budgets and are not one of the booking Targets below.
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

		// Per-IP: all eight endpoints.
		TokenBucket ipBucket = bucketFor(ipBuckets, ip, props.perIp(), now);
		if (!ipBucket.tryAcquire(now)) {
			reject(response, ipBucket.retryAfterSeconds(now), ip, "ip");
			return;
		}

		// Per-code: only the six code-keyed endpoints carry a code.
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
	 * An auth request's per-IP budget and whether a token is refunded when the chain denies access
	 * ({@code 401}/{@code 403}). The policy travels with the budget, never filter-wide: on a password
	 * change those mean the credential check was never reached (as does {@link CurrentCustomer#require}'s
	 * {@code 403}), but on a <em>login</em> the same {@code 401} is a wrong password, precisely what must
	 * be charged. Accepted cost: a CSRF-token-less flood is refunded too, as {@code CsrfFilter} rejects it
	 * before any DB read, bcrypt or mail.
	 */
	private record AuthBudget(Map<String, TokenBucket> buckets, RateLimitProperties.Limit limit,
			boolean refundedWhenAccessDenied) {

		/** An anonymous surface: every request spends, because request volume IS what is being limited. */
		static AuthBudget spendsEveryRequest(Map<String, TokenBucket> buckets, RateLimitProperties.Limit limit) {
			return new AuthBudget(buckets, limit, false);
		}

		/** A budget guarding authenticated work: a request denied before reaching it must cost nothing. */
		static AuthBudget guardsAuthenticatedWork(Map<String, TokenBucket> buckets, RateLimitProperties.Limit limit) {
			return new AuthBudget(buckets, limit, true);
		}
	}

	/**
	 * Spend-then-refund (exact under concurrency); the refund is not in a {@code finally}, as an escaping
	 * exception is a {@code 500}, not a denial. The two logins return early into
	 * {@link #throttlePerIdentity}, so a login budget's refund flag is silently ignored.
	 */
	private void throttleAuthEndpoint(AuthBudget budget, HttpServletRequest request,
			HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
		Instant now = clock.instant();
		String ip = clientIps.resolve(request);
		TokenBucket ipBucket = bucketFor(budget.buckets(), ip, budget.limit(), now);
		if (!ipBucket.tryAcquire(now)) {
			reject(response, ipBucket.retryAfterSeconds(now), ip, "login");
			return;
		}
		// Only the two logins carry a per-identity budget; every other auth POST is per-IP only.
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
	 * Denied before reaching the guarded work. Deliberately not {@link #FAILED_AUTH_STATUS}: that is the
	 * login's spend status, the opposite concept wearing the same number (see {@link AuthBudget}).
	 */
	private static boolean accessWasDenied(HttpServletResponse response) {
		int status = response.getStatus();
		return status == HttpStatus.UNAUTHORIZED.value() || status == HttpStatus.FORBIDDEN.value();
	}

	/**
	 * The per-IP auth budget a request draws on, or empty if it is not an auth request. Never an OPTIONS
	 * preflight — the method check excludes it. Each budget also carries its refund policy; see
	 * {@link AuthBudget}.
	 */
	private Optional<AuthBudget> authBudgetFor(HttpServletRequest request) {
		String method = request.getMethod();
		String path = RequestPaths.withinApplication(request);
		if (HttpMethod.POST.matches(method)) {
			return authPostBudgetFor(path);
		}
		if (!HttpMethod.GET.matches(method)) {
			return Optional.empty();
		}
		if (CHALLENGE_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(challengeBuckets, props.challenge()));
		}
		// A cheap prefix pre-check keeps the two matcher calls off every hot public venue/booking GET.
		if (path.startsWith(SSO_PATH_PREFIX)
				&& (paths.match(SSO_AUTHORIZE_TEMPLATE, path) || paths.match(SSO_CALLBACK_TEMPLATE, path))) {
			return Optional.of(AuthBudget.spendsEveryRequest(ssoBuckets, props.login()));
		}
		return Optional.empty();
	}

	/**
	 * The budget an auth <em>POST</em> draws on, each on its own map; the refund policy per budget is
	 * {@link AuthBudget}'s.
	 */
	private Optional<AuthBudget> authPostBudgetFor(String path) {
		RateLimitProperties.Limit limit = props.login();
		if (LOGIN_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(loginBuckets, limit));
		}
		if (OPERATOR_REGISTER_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(operatorRegisterBuckets, limit));
		}
		if (OPERATOR_PASSWORD_PATH.equals(path)) {
			return Optional.of(AuthBudget.guardsAuthenticatedWork(operatorPasswordBuckets, limit));
		}
		if (CUSTOMER_PASSWORD_PATH.equals(path)) {
			return Optional.of(AuthBudget.guardsAuthenticatedWork(customerPasswordBuckets, limit));
		}
		if (CUSTOMER_LOGIN_PATH.equals(path) || CUSTOMER_REGISTER_PATH.equals(path)) {
			return Optional.of(AuthBudget.spendsEveryRequest(customerAuthBuckets, limit));
		}
		if (RECOVERY_PATHS.contains(path)) {
			return Optional.of(AuthBudget.guardsAuthenticatedWork(recoveryBuckets, limit));
		}
		return Optional.empty();
	}

	/**
	 * Classify the request in a single pass: {@code null} if it is a CORS preflight or not one of the
	 * eight booking endpoints; otherwise a {@link Target} carrying the booking code (or {@code null}
	 * for create). Computes the path and runs the matcher once, not per check.
	 */
	private Target targetOf(HttpServletRequest request) {
		String method = request.getMethod();
		if (HttpMethod.OPTIONS.matches(method)) {
			return null; // CORS preflight — never counted
		}
		String path = RequestPaths.withinApplication(request);
		if (HttpMethod.GET.matches(method) && paths.match(VIEW_TEMPLATE, path)) {
			// The terms segment is no code — a shared "code" bucket would 429 site-wide. Per-IP only.
			return new Target(TERMS_PATH.equals(path)
					? null
					: paths.extractUriTemplateVariables(VIEW_TEMPLATE, path).get(CODE_VAR));
		}
		// All three review verbs share one budget: they are one resource behind one credential.
		if (REVIEW_METHODS.contains(method) && paths.match(REVIEW_TEMPLATE, path)) {
			return new Target(paths.extractUriTemplateVariables(REVIEW_TEMPLATE, path).get(CODE_VAR));
		}
		if (HttpMethod.POST.matches(method)) {
			if (paths.match(CANCEL_TEMPLATE, path)) {
				return new Target(paths.extractUriTemplateVariables(CANCEL_TEMPLATE, path).get(CODE_VAR));
			}
			if (paths.match(WITHDRAW_TEMPLATE, path)) {
				return new Target(paths.extractUriTemplateVariables(WITHDRAW_TEMPLATE, path).get(CODE_VAR));
			}
			if (path.equals(CREATE_PATH)) {
				return new Target(null); // create carries no code → per-IP only
			}
		}
		return null;
	}

	/**
	 * Fetch or create the bucket for {@code key}, hard-bounded by {@code maxTrackedKeys}: past the cap a
	 * new key first prunes full (idle) buckets, losslessly, and only if that frees nothing resets the map.
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
	 * The per-identity login budget: only a failed authentication ({@code 401}) net-spends a token, so a
	 * successful login never does. An unbufferable body or absent identity leaves the per-IP budget alone.
	 */
	private void throttlePerIdentity(LoginEndpoint login, HttpServletRequest request,
			HttpServletResponse response, FilterChain chain, String ip, Instant now)
			throws ServletException, IOException {
		Optional<byte[]> buffered = cacheableBody(request);
		if (buffered.isEmpty()) {
			// Logged so the skip is observable in prod: only the per-IP budget applies here.
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
		// Spend-then-refund so the cap is exact under concurrency; only a 401 net-consumes a token.
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

	/** The login endpoint this request targets, or {@code null} if it is not one of the two. */
	private static LoginEndpoint loginEndpointOf(HttpServletRequest request) {
		if (!HttpMethod.POST.matches(request.getMethod())) {
			return null;
		}
		String path = RequestPaths.withinApplication(request);
		for (LoginEndpoint endpoint : LoginEndpoint.values()) {
			if (endpoint.path.equals(path)) {
				return endpoint;
			}
		}
		return null;
	}

	/**
	 * The scoped, salted SHA-256 bucket key for the identity in {@code body}, or {@code null} if absent or
	 * unparseable. The customer email goes through {@link Emails#normalize}; the operator username is raw.
	 * Hashing keeps any valid username out of the tracking map and the logs.
	 */
	private String identityKeyOf(LoginEndpoint login, byte[] body) {
		String raw = readJsonField(body, login.identityField);
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String identity = login.normalizeEmail ? Emails.normalize(raw) : raw;
		return login.scope + ':' + saltedSha256Hex(identity);
	}

	/**
	 * The scalar value of {@code field} as a string, or {@code null}. Any scalar node, not just a string:
	 * DTO binding coerces {@code "username": 123} to a {@code String}, so it must key the same bucket.
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
	 * The login body when its known Content-Length is within {@link #MAX_CACHED_BODY_BYTES}; otherwise
	 * empty and the stream is left untouched for the controller, so only the per-IP budget bites.
	 */
	private static Optional<byte[]> cacheableBody(HttpServletRequest request) throws IOException {
		long length = request.getContentLengthLong();
		if (length < 0 || length > MAX_CACHED_BODY_BYTES) {
			return Optional.empty();
		}
		return Optional.of(request.getInputStream().readAllBytes());
	}

	/**
	 * SHA-256 hex of {@code value} under the per-process random {@link #identitySalt}, so tracking-map keys
	 * cannot be dictionary-confirmed against a username list (non-enumeration, D-8).
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
	 * stream the downstream {@code @RequestBody} controller also needs. Wraps only the two login requests,
	 * and only after their small body was already read into {@code body}.
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
