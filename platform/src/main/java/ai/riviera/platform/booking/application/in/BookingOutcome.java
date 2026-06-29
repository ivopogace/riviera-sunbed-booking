package ai.riviera.platform.booking.application.in;

/**
 * The closed set of outcomes of {@link CreateBooking#create}. A sealed type so callers (the
 * REST adapter) {@code switch} exhaustively and map each case to an HTTP status — a lost
 * race or an out-of-bounds request is normal, expected flow, returned as a value rather than
 * thrown (riviera-java-conventions: typed outcomes for expected flows).
 */
public sealed interface BookingOutcome permits BookingOutcome.Confirmed, BookingOutcome.Rejected {

	/** The booking was created and confirmed. */
	record Confirmed(BookingConfirmation confirmation) implements BookingOutcome {
	}

	/**
	 * The booking was not created. Each reason maps to one HTTP status in the controller:
	 * {@code SET_TAKEN}→409, {@code NOT_ONLINE_POOL}/{@code BOOKING_CLOSED}→422,
	 * {@code NO_SUCH_SET}→404.
	 */
	enum Rejected implements BookingOutcome {
		/** The {@code (set, date)} is already held by another party (invariant #2). */
		SET_TAKEN,
		/** The set is in the walk-in pool — not bookable online (invariant #3). */
		NOT_ONLINE_POOL,
		/** No set has the given id. */
		NO_SUCH_SET,
		/** The evening-before cutoff for that date has passed (invariant #4). */
		BOOKING_CLOSED
	}
}
