package ai.riviera.platform;

import java.nio.charset.StandardCharsets;

import org.springframework.web.util.UriUtils;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The request path the edge filters key on — decoded and relative to the context path, so it is
 * the <strong>same</strong> path Spring Security's matchers and {@code @PostMapping} route on.
 *
 * <p>Never the raw {@code getRequestURI()}: the servlet spec leaves that percent-encoded, so
 * {@code …/passwor%64} matched no constant, spent no rate-limit token, and still reached the
 * controller. Matrix parameters ({@code …/password;a=b}) are deliberately <em>not</em> stripped:
 * {@code StrictHttpFirewall} rejects a {@code ;} before any filter of ours runs, which
 * {@code RateLimitFilterTest} pins as a tripwire.
 */
final class RequestPaths {

	private RequestPaths() {
	}

	static String withinApplication(HttpServletRequest request) {
		String uri = request.getRequestURI();
		String context = request.getContextPath();
		String withinApp = (context != null && !context.isEmpty() && uri.startsWith(context))
				? uri.substring(context.length())
				: uri;
		return decode(withinApp);
	}

	/** A malformed escape keeps the raw form: it matches no route, and the filter chain still rejects it. */
	static String decode(String path) {
		try {
			return UriUtils.decode(path, StandardCharsets.UTF_8);
		}
		catch (IllegalArgumentException malformedEscape) {
			return path;
		}
	}
}
