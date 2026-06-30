package ai.riviera.platform.booking.application.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.booking.application.in.DailyBooking;
import ai.riviera.platform.venue.api.VenueId;

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
	 * Load a booking by its {@code code} (the bearer credential, invariant #7) for the view and
	 * cancel use cases (U6), or {@code empty} if no booking has that code. Read-only — carries the
	 * full row the caller needs (status, ids, amount, the cancellation audit) without exposing the
	 * aggregate.
	 */
	Optional<BookingRecord> findByCode(String code);

	/**
	 * Transition the booking to {@code CONFIRMED}, stamping {@code confirmed_at}, and return the
	 * confirmed booking's facts (for the {@code BookingConfirmed} payload, built atomically with
	 * the transition via SQL {@code RETURNING}). Strict: a non-{@code AWAITING_PAYMENT} row is an
	 * error (the synchronous stub path, where exactly-once is guaranteed within the create
	 * transaction).
	 */
	ConfirmedBooking confirm(long bookingId, Instant confirmedAt);

	/**
	 * Confirm from a signature-verified Stripe webhook (U4): transition
	 * {@code AWAITING_PAYMENT → CONFIRMED} and return the confirmed booking's facts.
	 * <strong>Idempotent</strong> — a 0-row update (already confirmed/cancelled, or a re-delivered
	 * event) yields {@code empty}, never an error (the redelivery-safe sibling of {@link #confirm}).
	 * A present result means it actually transitioned, so the caller publishes exactly one
	 * {@code BookingConfirmed}.
	 */
	Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant confirmedAt);

	/**
	 * Cancel from a verified {@code payment_intent.canceled} webhook (U4): transition
	 * {@code AWAITING_PAYMENT → CANCELLED}. Returns the {@link ClaimRef} of the booking's
	 * {@code (set, date)} <strong>iff</strong> it actually transitioned, so the caller releases
	 * the availability claim exactly once (invariant #2); empty if the booking was no longer
	 * {@code AWAITING_PAYMENT} (already confirmed/cancelled) — then nothing is released.
	 */
	Optional<ClaimRef> cancelAwaitingPayment(long bookingId);

	/**
	 * Cancel a confirmed booking: transition {@code CONFIRMED → CANCELLED}, stamping
	 * {@code cancelled_at}, the server-computed {@code refundMinor}, and the {@code reason} (U6 tourist
	 * {@code POLICY} / U9 admin {@code WEATHER}), and return the booking's facts (for the refund +
	 * {@code BookingCancelled} payload, built atomically via SQL {@code RETURNING}). The guarded
	 * {@code WHERE status = 'CONFIRMED'} makes a double-cancel a 0-row {@code empty} no-op (so the
	 * release/refund/event fire exactly once); a non-{@code CONFIRMED} booking yields empty.
	 */
	Optional<CancelledBooking> cancelConfirmed(long bookingId, java.time.Instant cancelledAt,
			long refundMinor, ai.riviera.platform.booking.api.RefundReason reason);

	/**
	 * The {@code CONFIRMED} bookings for {@code venueId} on {@code date}, as {@code (setId, code)}
	 * rows ordered by set, for the U8 staff daily view (issue #10). Read-only; excludes
	 * awaiting-payment and cancelled bookings. The {@code code} is the bearer credential (invariant
	 * #7) — carried to the operator-gated caller, never logged. Empty list when there are none.
	 */
	List<DailyBooking> findConfirmedForVenueOn(VenueId venueId, LocalDate date);

	/**
	 * The {@code CONFIRMED} bookings for {@code venueId} on {@code date} as {@code (id, amountMinor)}
	 * rows — the candidate set for the admin weather refund (U9, issue #12). Read-only; excludes
	 * awaiting-payment and already-cancelled bookings. The caller force-cancels each with a full
	 * refund via the guarded {@link #cancelConfirmed} (so a concurrent cancel makes the matching row a
	 * no-op). Ordered by id for stable iteration; empty when there are none.
	 */
	List<RefundableBooking> findConfirmedForWeatherRefund(VenueId venueId, LocalDate date);

	/**
	 * The ids of bookings still {@code AWAITING_PAYMENT} that were created strictly before
	 * {@code olderThan} — the abandoned-payment TTL sweep's candidate set (issue #51). A closed tab
	 * produces no terminating webhook, so such a booking lingers and keeps its {@code (set, date)}
	 * claimed; the sweep cancels the PaymentIntent and releases the claim. Read-only; ordered by id
	 * for stable iteration. Empty when none are stale. Served by the partial index on
	 * {@code (created_at) WHERE status = 'AWAITING_PAYMENT'} (V13).
	 */
	List<BookingId> findExpirableAwaitingPayment(Instant olderThan);
}
