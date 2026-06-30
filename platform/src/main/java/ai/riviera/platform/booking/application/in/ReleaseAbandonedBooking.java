package ai.riviera.platform.booking.application.in;

import ai.riviera.platform.booking.api.BookingId;

/**
 * The single, shared "cancel an unpaid booking and free its set" seam (issue #51) — the guarded
 * {@code AWAITING_PAYMENT → CANCELLED} transition plus the {@code (set, date)} availability release
 * (invariant #2), in one transaction. Two drivers call it: the {@code payment_intent.canceled}
 * webhook listener (U4) and the abandoned-payment TTL sweep. Because the underlying
 * {@code UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING} is the atomic primitive, whichever
 * driver reaches a given booking first performs the single release; the other is a no-op — so the
 * two paths can never double-act (idempotent).
 */
public interface ReleaseAbandonedBooking {

	/**
	 * Cancel the booking if it is still {@code AWAITING_PAYMENT} and release its held set.
	 *
	 * @return {@code true} iff this call performed the transition (and thus the single release);
	 *     {@code false} if the booking was no longer {@code AWAITING_PAYMENT} (already
	 *     confirmed/cancelled, or another driver got there first) — a benign no-op.
	 */
	boolean release(BookingId bookingId);
}
