package ai.riviera.platform.payment.domain;

/**
 * The lifecycle of a Stripe collection. Mirrors the {@code payment.status} CHECK constraint (as
 * redefined in V11) one-to-one — keep the Java enum and the SQL token set in lockstep.
 *
 * <p>{@link #REQUIRES_PAYMENT} at PaymentIntent creation; the verified webhook (invariant #8) moves
 * it to {@link #SUCCEEDED}, {@link #FAILED} (retryable at Stripe) or {@link #CANCELED} (terminal:
 * booking cancelled, claim released). A refund moves {@code SUCCEEDED} to {@link #REFUNDED} (every
 * share in full) or {@link #PARTIALLY_REFUNDED} (anything less; invariant #10).
 */
public enum PaymentStatus {
	REQUIRES_PAYMENT,
	SUCCEEDED,
	FAILED,
	CANCELED,
	REFUNDED,
	PARTIALLY_REFUNDED;

	/**
	 * Whether the gateway holds money it collected under this status — the states a refund can be
	 * recorded against, and the ones in which a booking with nothing refunded is still owed.
	 */
	public boolean holdsCollectedMoney() {
		return this == SUCCEEDED || this == REFUNDED || this == PARTIALLY_REFUNDED;
	}
}
