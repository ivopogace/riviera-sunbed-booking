package ai.riviera.platform.booking.application.reserve;

/**
 * The {@code booking} module's inbound (driving) port for the Instant-Book use case. The REST
 * adapter depends on this interface, not on the concrete service — keeping the web layer at
 * arm's length from the orchestration (invariant #11 hexagonal layout). One implementation
 * today ({@code CreateBookingService}); the seam exists to give the controller a public,
 * mockable entry point while the service stays package-private.
 */
public interface CreateBooking {

	/**
	 * Attempt to create and confirm an Instant booking. Never throws on an expected rejection
	 * (taken set, walk-in pool, unknown set, closed cutoff) — those are returned as a
	 * {@link BookingOutcome}. The whole operation is one transaction: a failure after the
	 * availability claim rolls the claim back too.
	 */
	BookingOutcome create(CreateBookingCommand command);
}
