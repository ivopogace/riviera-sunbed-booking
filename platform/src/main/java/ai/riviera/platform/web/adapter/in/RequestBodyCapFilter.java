package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Caps a POST, PUT or PATCH body under {@code /api/**} at {@link #MAX_BODY_BYTES} (a layout write at
 * {@link #MAX_LAYOUT_BODY_BYTES}, {@link #WEBHOOK_PATH} at {@link #MAX_WEBHOOK_BODY_BYTES}), refused {@code 413}
 * before CSRF and the proof-of-work claim. The photo upload keeps Spring's multipart limits; a body
 * {@code RateLimitFilter} already caps is never read twice. The path is never logged: it may carry a booking
 * code (invariant #7). Rationale: RESPONSIBILITIES.md §Platform edge.
 */
final class RequestBodyCapFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RequestBodyCapFilter.class);

	static final int MAX_BODY_BYTES = 64 * 1024;
	/** A whole layout: {@code LayoutCommand.MAX_SETS} sets on 40-character two-byte row labels is ~223 KB. */
	static final int MAX_LAYOUT_BODY_BYTES = 256 * 1024;
	static final int MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

	private static final int UNCAPPED = -1;

	private static final String API_PREFIX = "/api/";
	private static final String WEBHOOK_PATH = "/api/payments/stripe/webhook";
	/** The layout writes, by method and path template, as their controllers map them. */
	private static final Map<String, Set<String>> LAYOUT_WRITES = Map.of(
			HttpMethod.PUT.name(), Set.of("/api/venues/{venueId}/beach-map"),
			HttpMethod.POST.name(), Set.of("/api/venues/{venueId}/beach-map/preview",
					"/api/venues/{venueId}/beach-map/commit"));
	/** The one multipart route, as {@code VenuePhotoController} maps it: Spring's multipart limits bound it. */
	private static final String PHOTO_UPLOAD_TEMPLATE = "/api/venues/{venueId}/photos/{slot}";
	private static final String MULTIPART_PREFIX = "multipart/";
	private static final Set<String> BODY_METHODS =
			Set.of(HttpMethod.POST.name(), HttpMethod.PUT.name(), HttpMethod.PATCH.name());

	private final AntPathMatcher paths = new AntPathMatcher();
	private final Predicate<HttpServletRequest> cappedUpstream;

	/** {@code cappedUpstream}: the requests an earlier filter already reads to its own, smaller cap. */
	RequestBodyCapFilter(Predicate<HttpServletRequest> cappedUpstream) {
		this.cappedUpstream = cappedUpstream;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		int cap = capOf(request);
		if (cap == UNCAPPED) {
			chain.doFilter(request, response);
			return;
		}
		long declared = request.getContentLengthLong();
		if (declared > cap) {
			refuse(response, cap);
			return;
		}
		if (declared >= 0) {
			chain.doFilter(request, response); // the container ends the stream at the declared length
			return;
		}
		byte[] body = request.getInputStream().readNBytes(cap + 1);
		if (body.length > cap) {
			refuse(response, cap);
			return;
		}
		chain.doFilter(new CachedBodyRequest(request, body), response);
	}

	/** The cap on {@code request}'s body, or {@link #UNCAPPED} if this filter leaves it alone. */
	private int capOf(HttpServletRequest request) {
		if (!BODY_METHODS.contains(request.getMethod())) {
			return UNCAPPED;
		}
		String path = RequestPaths.withinApplication(request);
		if (!path.startsWith(API_PREFIX) || cappedUpstream.test(request) || isPhotoUpload(request, path)) {
			return UNCAPPED;
		}
		if (WEBHOOK_PATH.equals(path)) {
			return MAX_WEBHOOK_BODY_BYTES;
		}
		return isLayoutWrite(request.getMethod(), path) ? MAX_LAYOUT_BODY_BYTES : MAX_BODY_BYTES;
	}

	private boolean isPhotoUpload(HttpServletRequest request, String path) {
		return HttpMethod.POST.matches(request.getMethod())
				&& StringUtils.startsWithIgnoreCase(request.getContentType(), MULTIPART_PREFIX)
				&& paths.match(PHOTO_UPLOAD_TEMPLATE, path);
	}

	private boolean isLayoutWrite(String method, String path) {
		return LAYOUT_WRITES.getOrDefault(method, Set.of()).stream().anyMatch(template -> paths.match(template, path));
	}

	private static void refuse(HttpServletResponse response, int cap) throws IOException {
		SecurityProblemResponses.writeBodyTooLarge(response);
		log.debug("Request body over the {}-byte cap refused", cap);
	}
}
