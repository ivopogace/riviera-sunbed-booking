package ai.riviera.platform.booking.application.reserve;

import java.time.Instant;

/**
 * The single internal seam through which a booking transitions to {@code CONFIRMED} (U5, issue #9).
 * Both confirm paths route through it — the synchronous stub path
 * ({@code CreateBookingService}) and the asynchronous Stripe-webhook path
 * ({@code PaymentEventListener}) — so that {@code BookingConfirmed} is published from exactly one
 * place, not duplicated per call site. The implementation performs the DB transition and publishes
 * the event from the facts the transition returns.
 *
 * <p>An <em>internal</em> inbound port ({@code application.in}), not part of the module's
 * cross-module {@code api/} surface: no other module confirms a booking — they react to the
 * published {@code BookingConfirmed} event instead (invariant #11).
 */
public interface ConfirmBooking {

	/**
	 * Strict stub-path confirm: transition {@code AWAITING_PAYMENT → CONFIRMED} and publish one
	 * {@code BookingConfirmed}. A non-{@code AWAITING_PAYMENT} booking is an error here — the
	 * in-process stub path guarantees exactly-once within the create transaction.
	 */
	void confirm(long bookingId, Instant confirmedAt);

	/**
	 * Idempotent webhook-path confirm: transition {@code AWAITING_PAYMENT → CONFIRMED} and publish
	 * one {@code BookingConfirmed} <strong>iff</strong> it actually transitioned. A re-delivered or
	 * already-applied event is a benign no-op (publishes nothing) returning {@code false}. Returns
	 * {@code true} iff it transitioned.
	 */
	boolean confirmFromPayment(long bookingId, Instant confirmedAt);
}
