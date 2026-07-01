package ai.riviera.platform.operator.api;

/**
 * Thrown by {@link VenueOwnership#assertOwns} when the authenticated operator does not own the
 * target venue (a broken-object-level-authorization attempt — OWASP API #1). Framework-free by
 * design: the HTTP mapping to {@code 403} lives in a single root {@code @RestControllerAdvice}, so
 * this {@code api} type stays free of Spring Web. Carries ids only (never a secret), and the wire
 * body does not echo them.
 */
public final class NotVenueOwnerException extends RuntimeException {

	private final transient OperatorId operator;
	private final transient VenueRef venue;

	public NotVenueOwnerException(OperatorId operator, VenueRef venue) {
		super("operator " + operator.value() + " does not own venue " + venue.value());
		this.operator = operator;
		this.venue = venue;
	}

	public OperatorId operator() {
		return operator;
	}

	public VenueRef venue() {
		return venue;
	}
}
