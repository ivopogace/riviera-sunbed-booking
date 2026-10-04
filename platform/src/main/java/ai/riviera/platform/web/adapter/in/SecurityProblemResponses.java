package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.shared.ApiProblem;
import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.csrf.CsrfException;

import jakarta.servlet.http.HttpServletResponse;

/**
 * Hand-mirrored RFC-7807 bodies for rejections <em>inside the security filter chain</em>, before
 * MVC dispatch, where {@link ApiErrorHandler}/{@link ApiProblem} never run (as with
 * {@code RateLimitFilter}'s {@code RATE_LIMITED}): {@link SecurityConfig}'s entry point
 * ({@code 401 UNAUTHENTICATED}, {@code AuthSessionIT}), {@link ChallengeVerificationFilter}'s refusals
 * ({@code ChallengeVerificationFilterTest}) and the edge's {@code 413} ({@code RequestBodyCapFilterTest}).
 * No {@code instance}: no URI is ever written (invariant #7).
 */
final class SecurityProblemResponses {

	private static final String UNAUTHENTICATED_BODY = """
			{"type":"about:blank","title":"Unauthorized","status":401,\
			"detail":"Authentication is required.","code":"UNAUTHENTICATED"}""";

	private static final String INVALID_CSRF_BODY = """
			{"type":"about:blank","title":"Forbidden","status":403,\
			"detail":"Missing or invalid CSRF token.","code":"INVALID_CSRF_TOKEN"}""";

	private static final String ACCESS_DENIED_BODY = """
			{"type":"about:blank","title":"Forbidden","status":403,\
			"detail":"Access denied.","code":"ACCESS_DENIED"}""";

	private static final String CHALLENGE_REQUIRED_BODY = """
			{"type":"about:blank","title":"Bad Request","status":400,\
			"detail":"A solved proof-of-work challenge is required.","code":"CHALLENGE_REQUIRED"}""";

	private static final String CHALLENGE_INVALID_BODY = """
			{"type":"about:blank","title":"Bad Request","status":400,\
			"detail":"The proof-of-work solution is not valid.","code":"CHALLENGE_INVALID"}""";

	private static final String CHALLENGE_EXPIRED_BODY = """
			{"type":"about:blank","title":"Bad Request","status":400,\
			"detail":"The proof-of-work challenge has expired or was already used.","code":"CHALLENGE_EXPIRED"}""";

	private static final String BODY_TOO_LARGE_BODY = """
			{"type":"about:blank","title":"Content Too Large","status":413,\
			"detail":"The request body is too large.","code":"PAYLOAD_TOO_LARGE"}""";

	/** 413 by value, as in {@code ApiErrorHandler}: the {@code HttpStatus} constant is mid-rename. */
	private static final int BODY_TOO_LARGE_STATUS = 413;

	private SecurityProblemResponses() {
	}

	/** The entry-point 401: no session, or an expired one, on a protected endpoint. */
	static void writeUnauthenticated(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.UNAUTHORIZED, UNAUTHENTICATED_BODY);
	}

	/**
	 * Filter-chain 403s: a CSRF rejection ({@code CsrfFilter}'s own, upstream of
	 * {@code ExceptionTranslationFilter}) gets {@code INVALID_CSRF_TOKEN}, so the SPA can tell a
	 * stale token from an authorization denial; the rest mirror the advice's {@code ACCESS_DENIED}.
	 */
	static void writeAccessDenied(HttpServletResponse response, AccessDeniedException exception)
			throws IOException {
		String body = exception instanceof CsrfException ? INVALID_CSRF_BODY : ACCESS_DENIED_BODY;
		write(response, HttpStatus.FORBIDDEN, body);
	}

	/** A fenced write arrived without a solved challenge in its header. */
	static void writeChallengeRequired(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.BAD_REQUEST, CHALLENGE_REQUIRED_BODY);
	}

	/** The solution is unparseable, forged, or wrong. */
	static void writeChallengeInvalid(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.BAD_REQUEST, CHALLENGE_INVALID_BODY);
	}

	/** The challenge is past its expiry, or this solution was already accepted once — fetch a fresh one. */
	static void writeChallengeExpired(HttpServletResponse response) throws IOException {
		write(response, HttpStatus.BAD_REQUEST, CHALLENGE_EXPIRED_BODY);
	}

	/** A body past its edge cap: {@code RateLimitFilter}'s login cap or {@code RequestBodyCapFilter}'s. */
	static void writeBodyTooLarge(HttpServletResponse response) throws IOException {
		write(response, BODY_TOO_LARGE_STATUS, BODY_TOO_LARGE_BODY);
	}

	private static void write(HttpServletResponse response, HttpStatus status, String body)
			throws IOException {
		write(response, status.value(), body);
	}

	private static void write(HttpServletResponse response, int status, String body) throws IOException {
		response.setStatus(status);
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter().write(body);
	}
}
