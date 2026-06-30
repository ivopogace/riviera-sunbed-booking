package ai.riviera.platform.booking.application;

/**
 * Thrown when the payment gateway returns {@code Failed} while initiating collection — i.e. the
 * Stripe PaymentIntent could not be created (issue #52, two-phase create). By then the booking +
 * claim are already committed, so {@code CreateBookingService} first <strong>compensates</strong>
 * (cancels the booking + frees the set via {@code ReleaseAbandonedBooking}) and then throws this to
 * surface the failure — a set is never left held for a booking that couldn't pay. <strong>Never
 * thrown by the in-process stub</strong> (it always succeeds); it exists so the
 * {@code PaymentOutcome.Failed} branch is handled exhaustively.
 */
class PaymentDeclinedException extends RuntimeException {

	PaymentDeclinedException(String reason) {
		super("payment declined: " + reason);
	}
}
