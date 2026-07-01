package ai.riviera.platform;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import ai.riviera.platform.operator.api.NotVenueOwnerException;

/**
 * Maps a failed per-venue authorization check (invariant #13) to {@code 403} for every venue-scoped
 * controller — one place, so the wire shape is consistent (RFC-7807 {@link ProblemDetail}) rather
 * than a per-controller body. Two edge failures land here:
 * <ul>
 *   <li>{@link NotVenueOwnerException} — the operator is known but does not own the target venue
 *       (BOLA attempt, OWASP API #1);</li>
 *   <li>{@link AccessDeniedException} thrown by {@link CurrentOperator} when the principal maps to
 *       no active operator.</li>
 * </ul>
 * The body deliberately does not echo operator/venue ids. Role-gate denials from the Spring Security
 * filter chain are handled by the framework (they never reach this advice), so this does not affect
 * the existing 401/403 role behavior.
 *
 * <p>Mapping {@link AccessDeniedException} is intentionally broad: any authorization denial that
 * reaches MVC dispatch should return one uniform {@code 403} shape. There is no method security
 * ({@code @EnableMethodSecurity}) today, so the only such exception in dispatch is {@link
 * CurrentOperator}'s "principal is not an active operator"; if method security is added later, its
 * denials will correctly land here as {@code 403} too.
 */
@RestControllerAdvice
class VenueAuthorizationExceptionHandler {

	@ExceptionHandler(NotVenueOwnerException.class)
	ProblemDetail onNotVenueOwner(NotVenueOwnerException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "You do not manage this venue.");
	}

	@ExceptionHandler(AccessDeniedException.class)
	ProblemDetail onAccessDenied(AccessDeniedException e) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access denied.");
	}
}
