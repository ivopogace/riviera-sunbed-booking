package ai.riviera.platform.payment.events;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * Published when a signature-verified Stripe {@code payment_intent.canceled} webhook arrives
 * (invariant #8) — a terminal state for the collection. The {@code booking} module listens and, if
 * the booking is still {@code AWAITING_PAYMENT}, cancels it and releases the {@code (set, date)}
 * claim so the set is re-bookable (invariant #2).
 *
 * <p>{@code payment_intent.payment_failed} is not terminal (the intent can be retried), so it never
 * produces this event. Id-based payload (invariant #11): a {@link BookingRef} only.
 */
public record PaymentCanceled(BookingRef bookingRef) {
}
