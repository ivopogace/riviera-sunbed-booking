package ai.riviera.platform.booking.application.reserve;

/**
 * Thrown when the payment gateway returns {@code Failed} while initiating collection (the Stripe
 * PaymentIntent could not be created). The booking + claim are already committed by then, so
 * {@code CreateBookingService} first <strong>compensates</strong> (cancels the booking + frees the
 * set via {@code ReleaseAbandonedBooking}) and then throws this — a set is never left held for a
 * booking that couldn't pay. Never thrown by the in-process stub (it always succeeds).
 */
class PaymentDeclinedException extends RuntimeException {

	PaymentDeclinedException(String reason) {
		super("payment declined: " + reason);
	}
}
