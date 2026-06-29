package ai.riviera.platform.payment.api;

/**
 * Published when a Stripe {@code payment_intent.succeeded} webhook is received and its
 * signature verified (invariant #8) — the single fact that authorizes confirming a booking.
 * The {@code booking} module listens and transitions the booking to {@code CONFIRMED}; the
 * client redirect never triggers this.
 *
 * <p>Id-based payload (invariant #11): the booking is carried as a {@link BookingRef}, plus the
 * Stripe {@code paymentIntentId} for traceability. No aggregates, no mutable fields. Part of
 * the {@code payment} module's published surface so subscribers depend on {@code payment::api}.
 */
public record PaymentConfirmed(BookingRef bookingRef, String paymentIntentId) {
}
