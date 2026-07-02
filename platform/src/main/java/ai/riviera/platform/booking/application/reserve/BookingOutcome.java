package ai.riviera.platform.booking.application.reserve;

/**
 * The closed set of outcomes of {@link CreateBooking#create}. A sealed type so callers (the
 * REST adapter) {@code switch} exhaustively and map each case to an HTTP status — a lost
 * race or an out-of-bounds request is normal, expected flow, returned as a value rather than
 * thrown (riviera-java-conventions: typed outcomes for expected flows).
 */
public sealed interface BookingOutcome
		permits BookingOutcome.Confirmed, BookingOutcome.AwaitingPayment, BookingOutcome.Requested,
		BookingOutcome.Rejected {

	/** The booking was created and confirmed (the synchronous stub path → {@code 201}). */
	record Confirmed(BookingConfirmation confirmation) implements BookingOutcome {
	}

	/**
	 * Request-to-Book (issue #98): the venue sells by request, so the booking was created
	 * {@code PENDING_REQUEST} — the {@code (set, date)} is soft-held (invariant #2), but no
	 * PaymentIntent exists and no card is charged until the venue accepts. The controller maps
	 * this to {@code 202}; {@code requestExpiresAt} is the venue-response deadline
	 * (min(now + expiry-window, evening-before cutoff)).
	 */
	record Requested(BookingConfirmation confirmation, java.time.Instant requestExpiresAt)
			implements BookingOutcome {
	}

	/**
	 * The booking was created and a Stripe PaymentIntent initiated, but it stays
	 * {@code AWAITING_PAYMENT} until a signature-verified webhook confirms it (invariant #8) —
	 * the controller maps this to {@code 202} and returns the {@code clientSecret} so the browser
	 * can complete the card payment with Stripe.js. {@code paymentIntentId} is the gateway handle.
	 */
	record AwaitingPayment(BookingConfirmation confirmation, String clientSecret,
			String paymentIntentId) implements BookingOutcome {
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
