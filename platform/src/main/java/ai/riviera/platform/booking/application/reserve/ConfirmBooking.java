package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;

/**
 * The single seam through which a booking transitions to {@code CONFIRMED}. Both confirm paths
 * route through it — the synchronous stub path ({@code CreateBookingService}) and the Stripe
 * webhook path ({@code PaymentEventListener}) — so {@code BookingConfirmed} is published from
 * exactly one place, built from the facts the DB transition returns.
 *
 * <p>Internal to {@code booking}, not {@code api/}: no other module confirms a booking — they react
 * to the published {@code BookingConfirmed} event instead (invariant #11).
 */
public interface ConfirmBooking {

	/**
	 * Strict stub-path confirm (instant create and request accept, each after its own commit):
	 * transition {@code AWAITING_PAYMENT → CONFIRMED} and publish one {@code BookingConfirmed}. A
	 * non-{@code AWAITING_PAYMENT} booking is an error; the caller releases the claim and rethrows.
	 */
	void confirm(long bookingId, Instant confirmedAt);

	/**
	 * Idempotent webhook-path confirm: transition {@code AWAITING_PAYMENT → CONFIRMED} and publish
	 * one {@code BookingConfirmed} <strong>iff</strong> it transitioned, returning {@code true}; a
	 * re-delivered or already-applied event is a no-op: publishes nothing, returns {@code false}.
	 */
	boolean confirmFromPayment(long bookingId, Instant confirmedAt);
}
