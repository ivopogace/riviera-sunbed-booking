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
 * {@code POST /api/bookings}. They are {@code permitAll} because the booking code is the bearer
 * credential (invariant #7); the {@code 200}/{@code 404} answer is otherwise a brute-force oracle,
 * so this filter caps request volume.
 *
 * <p><strong>Keying.</strong> The per-IP bucket guards all three endpoints (the primary defence
 * against an enumerator trying many codes from one IP); the per-code bucket additionally guards the
 * two code-keyed endpoints (against hammering a single known code). A request is rejected if
 * <em>either</em> bucket is empty. The per-code limit is configured above the frontend's ~20/30s
 * payment poll so a real payer is never throttled (ADR-0006).
 *
 * <p><strong>State.</strong> In-memory token buckets in bounded {@link ConcurrentHashMap}s — correct
 * for the single Render instance (ADR-0004); no Redis. Maps are pruned of full (idle) buckets when a
 * soft cap is hit so an attacker rotating codes cannot grow memory without bound (a full bucket
 * carries no state, so eviction is lossless). Time comes from the injected {@link Clock} (testable).
 *
 * <p>App-level web concern in the root package (like {@link SecurityConfig}/{@link WebCorsConfig}),
 * not a Modulith module; it matches endpoints by URL path only and imports nothing from the booking
 * module. The booking code is used solely as a map key and is <strong>never logged</strong>
 * (invariant #7); only the (newline-sanitised) IP and a dimension label may appear at debug level.
 */
final class RateLimitFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

	private static final String RATE_LIMITED_BODY = "{\"error\":\"RATE_LIMITED\"}";

	/** Mirrors the {@link SecurityConfig} matchers for the three public booking endpoints. */
	private static final String CREATE_PATH = "/api/bookings";
	private static final String VIEW_TEMPLATE = "/api/bookings/{code}";          // GET {code}
	private static final String CANCEL_TEMPLATE = "/api/bookings/{code}/cancel"; // POST {code}/cancel
	private static final String CODE_VAR = "code";

	private final RateLimitProperties props;
	private final Clock clock;
	private final AntPathMatcher paths = new AntPathMatcher();
	private final Map<String, TokenBucket> ipBuckets = new ConcurrentHashMap<>();
	private final Map<String, TokenBucket> codeBuckets = new ConcurrentHashMap<>();

	RateLimitFilter(RateLimitProperties props, Clock clock) {
		this.props = props;
		this.clock = clock;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (!props.enabled() || isPreflight(request) || !isBookingEndpoint(request)) {
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
		String code = bookingCode(request);
		if (code != null) {
			TokenBucket codeBucket = bucketFor(codeBuckets, code, props.perCode(), now);
			if (!codeBucket.tryAcquire(now)) {
				reject(response, codeBucket.retryAfterSeconds(now), ip, "code");
				return;
			}
		}

		chain.doFilter(request, response);
	}

	private boolean isPreflight(HttpServletRequest request) {
		return HttpMethod.OPTIONS.matches(request.getMethod());
	}

	private boolean isBookingEndpoint(HttpServletRequest request) {
		String method = request.getMethod();
		String path = pathWithinApplication(request);
		if (HttpMethod.GET.matches(method)) {
			return paths.match(VIEW_TEMPLATE, path);
		}
		if (HttpMethod.POST.matches(method)) {
			return path.equals(CREATE_PATH) || paths.match(CANCEL_TEMPLATE, path);
		}
		return false;
	}

	/** The booking code for the two code-keyed endpoints, or {@code null} for create (no code). */
	private String bookingCode(HttpServletRequest request) {
		String method = request.getMethod();
		String path = pathWithinApplication(request);
		if (HttpMethod.GET.matches(method) && paths.match(VIEW_TEMPLATE, path)) {
			return paths.extractUriTemplateVariables(VIEW_TEMPLATE, path).get(CODE_VAR);
		}
		if (HttpMethod.POST.matches(method) && paths.match(CANCEL_TEMPLATE, path)) {
			return paths.extractUriTemplateVariables(CANCEL_TEMPLATE, path).get(CODE_VAR);
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

	private TokenBucket bucketFor(Map<String, TokenBucket> buckets, String key,
			RateLimitProperties.Limit limit, Instant now) {
		if (buckets.size() >= props.maxTrackedKeys() && !buckets.containsKey(key)) {
			buckets.values().removeIf(bucket -> bucket.isFull(now)); // lossless: full == fresh
		}
		return buckets.computeIfAbsent(key,
				ignored -> new TokenBucket(limit.capacity(), limit.refillPeriod(), now));
	}

	private void reject(HttpServletResponse response, long retryAfterSeconds, String ip, String dimension)
			throws IOException {
		response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
		response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.getWriter().write(RATE_LIMITED_BODY);
		// IP is newline-sanitised by ClientIpResolver; the booking code is NEVER logged (invariant #7).
		log.debug("Rate-limited request from {} on the {} dimension", ip, dimension);
	}
}
