package ai.riviera.platform.payment.api;

/**
 * An opaque reference to the booking a payment is for, carried as a technical id (invariant
 * #11). The {@code payment} module treats it as a correlation handle — it does not import
 * the {@code booking} module's types. In U4 it seeds the Stripe idempotency key.
 */
public record BookingRef(long value) {
}
