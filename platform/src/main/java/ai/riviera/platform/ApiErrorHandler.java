package ai.riviera.platform;

import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.InvalidApiRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;

/**
 * The single {@code @RestControllerAdvice}: every failure becomes an RFC-7807 {@link ProblemDetail} with a
 * stable {@code code} via {@link ApiProblem}; {@code detail} states the condition, never a remedy, and never
 * echoes an exception message, ids or a booking code (invariant #7). Per-controller {@code @ExceptionHandler}s
 * are forbidden. {@link NotVenueOwnerException} (invariant #13) and {@link CurrentOperator}'s denial → 403.
 * Raw {@link IllegalArgumentException} is deliberately unmapped: a server bug, left to the logged 500.
 * Full mapping: {@code .claude/skills/riviera-java-conventions/references/error-contract.md}.
 */
@RestControllerAdvice
public class ApiErrorHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

	/** 413 by value — the {@code HttpStatus} constant for it is deprecated/renamed across versions. */
	private static final int PAYLOAD_TOO_LARGE_STATUS = 413;

	@ExceptionHandler(NotVenueOwnerException.class)
	ProblemDetail onNotVenueOwner(NotVenueOwnerException e) {
		return ApiProblem.of(HttpStatus.FORBIDDEN, "NOT_VENUE_OWNER",
				"The authenticated operator does not own this venue.");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail onAccessDenied(AccessDeniedException e) {
		return ApiProblem.of(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Access denied.");
	}

	/**
	 * A failed session login ({@code AuthController} drives the {@code AuthenticationManager} from MVC). One
	 * indistinguishable body for every cause — distinguishing them is account enumeration. Filter-chain 401s
	 * stay with the entry point in {@code SecurityConfig}.
	 */
	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail onAuthenticationFailure(AuthenticationException e) {
		return ApiProblem.of(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid credentials.");
	}

	@ExceptionHandler(InvalidApiRequestException.class)
	ProblemDetail onInvalidRequest(InvalidApiRequestException e) {
		return ApiProblem.of(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed.");
	}

	@ExceptionHandler(BlockedPasswordException.class)
	ProblemDetail onBlockedPassword(BlockedPasswordException e) {
		return ApiProblem.of(HttpStatus.BAD_REQUEST, "PASSWORD_CONTAINS_BLOCKED_TERM",
				"The password contains a blocked term.");
	}

	@ExceptionHandler(DuplicateKeyException.class)
	ProblemDetail onConstraintRace(DuplicateKeyException e) {
		// Class names only, never the message or stack: a constraint violation's DB message embeds
		// the offending column values — user-controlled text (CRLF log forging, §10) or even a
		// booking code on a code-collision insert (invariant #7, booking_code_uniq).
		log.warn("Unique-constraint race surfaced to the API as 409 CONFLICT: {} (root cause {})",
				e.getClass().getSimpleName(), e.getMostSpecificCause().getClass().getName());
		return ApiProblem.of(HttpStatus.CONFLICT, "CONFLICT", "The change conflicts with existing data.");
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
			HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
		ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
		if (response != null && response.getBody() instanceof ProblemDetail problem) {
			problem.setProperty(ApiProblem.CODE_PROPERTY, defaultCode(statusCode));
			// Framework-built bodies bypass ApiProblem, so the instance redaction (invariant #7 —
			// Spring would auto-fill the request URI, a booking code on the code-scoped paths)
			// must be re-applied here.
			problem.setInstance(ApiProblem.REDACTED_INSTANCE);
		}
		return response;
	}

	/**
	 * Framework-raised errors: client-input faults share {@code INVALID_REQUEST}, the rest carry the HTTP
	 * status name. 413 is pinned literally: the base class's handler is {@code final} and the {@code HttpStatus}
	 * constant is mid-rename across versions, so the wire code must not drift with it.
	 */
	private static String defaultCode(HttpStatusCode statusCode) {
		if (statusCode.equals(HttpStatus.BAD_REQUEST)) {
			return "INVALID_REQUEST";
		}
		if (statusCode.value() == PAYLOAD_TOO_LARGE_STATUS) {
			return "PAYLOAD_TOO_LARGE";
		}
		HttpStatus status = HttpStatus.resolve(statusCode.value());
		return status != null ? status.name() : "ERROR";
	}
}
