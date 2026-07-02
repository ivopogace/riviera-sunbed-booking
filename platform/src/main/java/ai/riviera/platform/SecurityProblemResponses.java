package ai.riviera.platform;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

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

	private SecurityProblemResponses() {
	}

	/** The entry-point 401: no (or no longer valid) session on a protected endpoint. */
	static void writeUnauthenticated(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.UNAUTHORIZED, UNAUTHENTICATED_BODY);
	}

	private static void write(HttpServletResponse response, HttpStatus status, String body)
			throws IOException {
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter().write(body);
	}
}
