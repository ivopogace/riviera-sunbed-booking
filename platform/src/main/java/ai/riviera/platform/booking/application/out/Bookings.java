package ai.riviera.platform.booking.application.out;

import java.time.Instant;
import java.util.Optional;
import java.util.OptionalLong;

/**
 * The {@code booking} module's outbound persistence port (driven seam). Two narrow writes
 * model the Instant-Book lifecycle: insert the row in {@code AWAITING_PAYMENT}, then
 * {@code confirm} it once the stub gateway succeeds. Separating persistence from the
 * orchestration ({@code CreateBookingService}) keeps the SQL out of the use case and lets the
 * branch logic be unit-tested with a fake. Implemented by {@code JdbcBookings} (explicit SQL,
 * invariant #1).
 */
public interface Bookings {

	/**
	 * Insert a new booking in {@code AWAITING_PAYMENT}, returning its generated id, or
	 * {@code empty} if the booking {@code code} already exists (an atomic
	 * {@code INSERT ... ON CONFLICT (code) DO NOTHING}, invariant #7's {@code UNIQUE(code)}).
	 * Empty is the caller's signal to regenerate the code and retry — a normal, expected flow
	 * that does <strong>not</strong> abort the surrounding transaction (a thrown unique
	 * violation would). Other integrity failures (FK/CHECK) still throw.
	 */
	OptionalLong insertAwaitingPayment(NewBooking booking);

	/**
	 * Transition the booking to {@code CONFIRMED}, stamping {@code confirmed_at}. Strict: a
	 * non-{@code AWAITING_PAYMENT} row is an error (the synchronous stub path, where exactly-once
	 * is guaranteed within the create transaction).
	 */
	void confirm(long bookingId, Instant confirmedAt);

	/**
	 * Confirm from a signature-verified Stripe webhook (U4): transition
	 * {@code AWAITING_PAYMENT → CONFIRMED}. <strong>Idempotent</strong> — a 0-row update (already
	 * confirmed/cancelled, or a re-delivered event) is a benign no-op returning {@code false},
	 * never an error (the redelivery-safe sibling of {@link #confirm}). Returns {@code true} iff
	 * it transitioned.
	 */
	boolean confirmFromPayment(long bookingId, Instant confirmedAt);

	/**
	 * Cancel from a verified {@code payment_intent.canceled} webhook (U4): transition
	 * {@code AWAITING_PAYMENT → CANCELLED}. Returns the {@link ClaimRef} of the booking's
	 * {@code (set, date)} <strong>iff</strong> it actually transitioned, so the caller releases
	 * the availability claim exactly once (invariant #2); empty if the booking was no longer
	 * {@code AWAITING_PAYMENT} (already confirmed/cancelled) — then nothing is released.
	 */
	Optional<ClaimRef> cancelAwaitingPayment(long bookingId);
}
