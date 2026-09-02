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
 * The one {@code @RestControllerAdvice} owning exception-to-wire mapping: every
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
 *   <li>{@link InvalidApiRequestException} — typed edge validation: request-DTO
 *       {@code toCommand()} conversion, bad enum / period tokens, the password policy →
 *       {@code 400 INVALID_REQUEST}. The detail is generic on purpose: an exception message may echo
 *       internals or user input, and validation style is centralized-explicit per the §6b decision
 *       (#97).</li>
 *   <li>{@link DuplicateKeyException} — a unique constraint beat a pre-check in a race
 *       (e.g. the V2/V12 layout UNIQUE) → {@code 409 CONFLICT}, not 500: the constraint is the
 *       correctness guarantee (invariant #12). Logged at WARN so the race stays diagnosable.</li>
 * </ul>
 *
 * <p><strong>Deliberately unmapped</strong> (#118): a raw
 * {@link IllegalArgumentException} and a non-duplicate
 * {@link org.springframework.dao.DataIntegrityViolationException} signal server-side defects — a
 * domain invariant tripping on stored data, a schema/FK/NOT-NULL bug — and propagate to the
 * framework's logged 500. Mapping them here blamed the caller (an unlogged 400/409) and hid the bug
 * from 5xx monitoring; edge code that validates request input throws (or wraps into) the typed
 * exception instead.
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
	 * A failed session login: {@code AuthController} drives the
	 * {@code AuthenticationManager} from MVC, so — unlike the old filter-chain Basic — its
	 * failures DO reach this advice. One deliberately indistinguishable body for every cause
	 * (wrong password, unknown username, suspended account): distinguishing them is account
	 * enumeration (design D-8). Filter-chain 401s (no/expired session) stay with the entry
	 * point in {@code SecurityConfig}.
	 */
	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail onAuthenticationFailure(AuthenticationException e) {
		return ApiProblem.of(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid credentials.");
	}

	@ExceptionHandler(InvalidApiRequestException.class)
	ProblemDetail onInvalidRequest(InvalidApiRequestException e) {
		return ApiProblem.of(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed.");
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
	 * Framework-raised errors: client-input faults share {@code INVALID_REQUEST}; the rest carry
	 * the HTTP status name ({@code METHOD_NOT_ALLOWED}, {@code NOT_ACCEPTABLE}, …) — derived, so
	 * stable, and documented in §6b as part of the contract's vocabulary.
	 *
	 * <p>413 is pinned literally: the multipart max-size backstop is handled by the
	 * {@code ResponseEntityExceptionHandler} base class (its handler is {@code final}, so declaring
	 * our own would be an ambiguous duplicate), and its {@code HttpStatus} constant name is mid-rename
	 * across framework versions — the wire code must not drift with it.
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
