package ai.riviera.platform.booking.application.request;

/**
 * The facts the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition yields via SQL
 * {@code RETURNING} — exactly what the payment request needs (the amount fixed at request time,
 * integer minor units + ISO currency, invariant #5), read atomically with the transition so no
 * second query can race a concurrent change.
 */
public record AcceptedRequest(long bookingId, long amountMinor, String currency) {
}
