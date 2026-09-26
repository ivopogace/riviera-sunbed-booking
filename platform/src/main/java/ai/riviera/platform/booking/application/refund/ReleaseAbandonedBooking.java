package ai.riviera.platform.booking.application.refund;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The single, shared "cancel an unpaid booking and free its set" seam — the guarded
 * {@code AWAITING_PAYMENT → CANCELLED} transition plus the {@code (set, date)} availability release
 * (invariant #2), in one transaction. Two drivers call it: the {@code payment_intent.canceled}
 * webhook listener and the abandoned-payment TTL sweep. The guarded {@code UPDATE … RETURNING} is
 * the atomic primitive, so whichever driver reaches a booking first performs the single release and
 * the other is a no-op — the two paths can never double-act (idempotent).
 */
public interface ReleaseAbandonedBooking {

	/**
	 * Cancel the booking if it is still {@code AWAITING_PAYMENT} and release its held set.
	 *
	 * @return {@code true} iff this call performed the transition (and thus the single release);
	 *     {@code false} if confirmed, cancelled or taken by the other driver first (benign no-op).
	 */
	boolean release(BookingId bookingId);
}
