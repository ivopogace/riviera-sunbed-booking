package ai.riviera.platform.payment.events;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * Published when a signature-verified Stripe {@code payment_intent.succeeded} webhook arrives
 * (invariant #8) — the single fact that authorizes confirming a booking; the client redirect never
 * triggers it. The {@code booking} module listens and moves the booking to {@code CONFIRMED}.
 *
 * <p>Id-based payload (invariant #11): a {@link BookingRef} plus the Stripe {@code paymentIntentId}
 * for traceability. Subscribers depend on {@code payment::events} + {@code payment::vocabulary}.
 */
public record PaymentConfirmed(BookingRef bookingRef, String paymentIntentId) {
}
