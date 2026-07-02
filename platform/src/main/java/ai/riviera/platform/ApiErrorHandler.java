package ai.riviera.platform;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;

/**
 * The one {@code @RestControllerAdvice} owning exception-to-wire mapping (issue #97): every
 * thrown failure becomes an RFC-7807 {@link ProblemDetail} with a stable {@code code} via
 * {@link ApiProblem}. Per-controller {@code @ExceptionHandler}s are forbidden
 * ({@code ErrorContractArchitectureTests}); controllers map their own <em>typed outcomes</em>
 * with the same factory. Extends {@link ResponseEntityExceptionHandler} so framework-raised
 * errors (unreadable body, type mismatch, missing param, 405/406/415) carry the same shape —
 * {@link #handleExceptionInternal} stamps their {@code code}.
 *
 * <p>Mapping, centrally defined (invariant references per {@code CLAUDE.md}):
 * <ul>
 *   <li>{@link NotVenueOwnerException} — operator does not own the target venue (invariant #13,
 *       BOLA/OWASP API #1) → {@code 403 NOT_VENUE_OWNER}. The body never echoes operator/venue ids.</li>
 *   <li>{@link AccessDeniedException} — thrown by {@link CurrentOperator} when the principal maps
 *       to no active operator → {@code 403 ACCESS_DENIED}. Intentionally broad: any authorization
 *       denial reaching MVC dispatch gets the one uniform {@code 403} shape; role-gate denials in
 *       the security filter chain never reach this advice, so 401/403 filter behavior is untouched.</li>
 *   <li>{@link IllegalArgumentException} — request-DTO {@code toCommand()} validation, bad enum /
 *       period tokens → {@code 400 INVALID_REQUEST}. The detail is generic on purpose: an
 *       exception message may echo internals or user input, and validation style is
 *       centralized-explicit per the §6b decision (plan doc {@code error-contract-problemdetail}).</li>
 *   <li>{@link DataIntegrityViolationException} — a DB constraint beat a pre-check in a race
 *       (e.g. the V2/V12 layout UNIQUE) → {@code 409 CONFLICT}, not 500: the constraint is the
 *       correctness guarantee (invariant #12). Logged at WARN because the same exception from a
 *       genuine bug (e.g. a NOT-NULL violation) must stay diagnosable.</li>
 * </ul>
 */
@RestControllerAdvice
class ApiErrorHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

	@ExceptionHandler(NotVenueOwnerException.class)
	ProblemDetail onNotVenueOwner(NotVenueOwnerException e) {
		return ApiProblem.of(HttpStatus.FORBIDDEN, "NOT_VENUE_OWNER", "You do not manage this venue.");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail onAccessDenied(AccessDeniedException e) {
		return ApiProblem.of(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Access denied.");
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ProblemDetail onInvalidRequest(IllegalArgumentException e) {
		return ApiProblem.of(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed.");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	ProblemDetail onConstraintViolation(DataIntegrityViolationException e) {
		log.warn("Data-integrity violation surfaced to the API as 409 CONFLICT", e);
		return ApiProblem.of(HttpStatus.CONFLICT, "CONFLICT", "The change conflicts with existing data.");
	}

	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
			HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
		ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
		if (response != null && response.getBody() instanceof ProblemDetail problem) {
			problem.setProperty(ApiProblem.CODE_PROPERTY, defaultCode(statusCode));
		}
		return response;
	}

	/** Framework-raised errors: client-input faults share {@code INVALID_REQUEST}; the rest use the status name. */
	private static String defaultCode(HttpStatusCode statusCode) {
		if (statusCode.equals(HttpStatus.BAD_REQUEST)) {
			return "INVALID_REQUEST";
		}
		HttpStatus status = HttpStatus.resolve(statusCode.value());
		return status != null ? status.name() : "ERROR";
	}
}
