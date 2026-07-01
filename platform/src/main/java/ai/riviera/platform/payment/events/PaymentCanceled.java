package ai.riviera.platform.payment.events;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * Published when a Stripe {@code payment_intent.canceled} webhook is received and its signature
 * verified (invariant #8) — a terminal state for the collection. The {@code booking} module
 * listens and, if the booking is still {@code AWAITING_PAYMENT}, cancels it and releases the
 * {@code (set, date)} availability claim so the set is re-bookable (invariant #2).
 *
 * <p>Note: {@code payment_intent.payment_failed} is <strong>not</strong> terminal in Stripe (the
 * intent can be retried), so it does not produce this event — only an explicit cancellation
 * does. Id-based payload (invariant #11): a {@link BookingRef} only.
 */
public record PaymentCanceled(BookingRef bookingRef) {
}
