package ai.riviera.platform;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.csrf.CsrfException;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Hand-mirrored RFC-7807 bodies for rejections that happen <em>inside the security filter
 * chain</em> — before MVC dispatch, where {@link ApiErrorHandler}/{@link ApiProblem} can never
 * run (the same constraint and pattern as {@code RateLimitFilter}'s {@code RATE_LIMITED} body).
 * Used by {@link SecurityConfig}'s authentication entry point (session missing/expired →
 * {@code 401 UNAUTHENTICATED}). Kept in lockstep with the contract by {@code AuthSessionIT}.
 *
 * <p>{@code instance} is pinned to {@code about:blank} just like {@link ApiProblem} builds it —
 * these literals must never echo the request URI (invariant #7 posture).
 */
final class SecurityProblemResponses {

	private static final String UNAUTHENTICATED_BODY = """
			{"type":"about:blank","title":"Unauthorized","status":401,\
			"detail":"Authentication is required.","code":"UNAUTHENTICATED",\
			"instance":"about:blank"}""";

	private static final String INVALID_CSRF_BODY = """
			{"type":"about:blank","title":"Forbidden","status":403,\
			"detail":"Missing or invalid CSRF token.","code":"INVALID_CSRF_TOKEN",\
			"instance":"about:blank"}""";

	private static final String ACCESS_DENIED_BODY = """
			{"type":"about:blank","title":"Forbidden","status":403,\
			"detail":"Access denied.","code":"ACCESS_DENIED",\
			"instance":"about:blank"}""";

	private SecurityProblemResponses() {
	}

	/** The entry-point 401: no (or no longer valid) session on a protected endpoint. */
	static void writeUnauthenticated(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.UNAUTHORIZED, UNAUTHENTICATED_BODY);
	}

	/**
	 * Filter-chain 403s: a CSRF rejection ({@code CsrfFilter} handles its own denial — it sits
	 * upstream of {@code ExceptionTranslationFilter}) gets the distinct {@code INVALID_CSRF_TOKEN}
	 * code so the SPA can tell "refresh your token" from a genuine authorization denial; anything
	 * else mirrors the advice's {@code ACCESS_DENIED}.
	 */
	static void writeAccessDenied(HttpServletResponse response, AccessDeniedException exception)
			throws IOException {
		String body = exception instanceof CsrfException ? INVALID_CSRF_BODY : ACCESS_DENIED_BODY;
		write(response, HttpStatus.FORBIDDEN, body);
	}

	private static void write(HttpServletResponse response, HttpStatus status, String body)
			throws IOException {
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter().write(body);
	}
}
