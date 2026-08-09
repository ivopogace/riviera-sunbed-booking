package ai.riviera.platform.payment.vocabulary;

/**
 * How far this deployment's gateway has taken a booking's refund. {@link #NO_COLLECTION} means the
 * gateway holds no collected money for the booking (no payment row, or an intent that never
 * succeeded) — it is never a failure signal. {@link #OUTSTANDING} means money was collected and no
 * refund has been accepted yet; {@link #ACCEPTED} means the gateway accepted one (full or partial).
 * Acceptance is not settlement — the money may still be days from the guest's statement.
 */
public enum RefundProgress {
	NO_COLLECTION,
	OUTSTANDING,
	ACCEPTED
}
