package ai.riviera.platform;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Per-IP and per-code rate limiting for the three public, unauthenticated booking endpoints
 * (issue #56): {@code GET /api/bookings/{code}}, {@code POST /api/bookings/{code}/cancel} and
 * {@code POST /api/bookings} — plus, since issue #109, the session login
 * ({@code POST /api/auth/operator/login}) on its own stricter per-IP budget (D-8: the login is a
 * credential-guessing oracle exactly like the code endpoints). They are {@code permitAll} because
 * the booking code is the bearer credential (invariant #7); the {@code 200}/{@code 404} answer is
 * otherwise a brute-force oracle, so this filter caps request volume.
 *
 * <p><strong>Keying.</strong> The per-IP bucket guards all three endpoints (the primary defence
 * against an enumerator trying many codes from one IP); the per-code bucket additionally guards the
 * two code-keyed endpoints (against hammering a single known code). A request is rejected if
 * <em>either</em> bucket is empty. The per-code limit is configured above the frontend's ~20/30s
 * payment poll so a real payer is never throttled (ADR-0006).
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
	// The session login (issue #109, D-8): per-IP throttled on its OWN, stricter budget — a
	// credential-guessing oracle, like the booking-code endpoints, but a separate dimension so
	// tightening one never starves the other. Mirrors SecurityConfig's LOGIN_PATH.
	private static final String LOGIN_PATH = "/api/auth/operator/login";

	private final RateLimitProperties props;
	private final Clock clock;
	private final AntPathMatcher paths = new AntPathMatcher();
	private final Map<String, TokenBucket> ipBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> codeBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> loginBuckets = new ConcurrentHashMap<>();

	RateLimitFilter(RateLimitProperties props, Clock clock) {
		this.props = props;
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		// The session login rides its own per-IP budget (issue #109, D-8) — checked first because
		// it is not one of the booking Targets below.
		if (props.enabled() && isLoginAttempt(request)) {
			Instant now = clock.instant();
			String ip = ClientIpResolver.resolve(request);
			TokenBucket loginBucket = bucketFor(loginBuckets, ip, props.login(), now);
			if (!loginBucket.tryAcquire(now)) {
				reject(response, loginBucket.retryAfterSeconds(now), ip, "login");
				return;
			}
			chain.doFilter(request, response);
			return;
		}

		// Classify the request once: skip non-booking endpoints, preflights, and (when disabled) all.
		Target target = props.enabled() ? targetOf(request) : null;
		if (target == null) {
			chain.doFilter(request, response);
			return;
		}

		Instant now = clock.instant();
		String ip = ClientIpResolver.resolve(request);

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

	/** The session login POST (never an OPTIONS preflight — the method check excludes it). */
	private boolean isLoginAttempt(HttpServletRequest request) {
		return HttpMethod.POST.matches(request.getMethod())
				&& LOGIN_PATH.equals(pathWithinApplication(request));
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

	private static String pathWithinApplication(HttpServletRequest request) {
		String uri = request.getRequestURI();
		String context = request.getContextPath();
		return (context != null && !context.isEmpty() && uri.startsWith(context))
				? uri.substring(context.length())
				: uri;
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
