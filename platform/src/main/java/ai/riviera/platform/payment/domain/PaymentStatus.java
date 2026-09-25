package ai.riviera.platform.payment.domain;

/**
 * The lifecycle of a Stripe collection. Mirrors the {@code payment.status} CHECK constraint
 * (V7) one-to-one — keep the Java enum and the SQL token set in lockstep.
 *
 * <p>{@link #REQUIRES_PAYMENT} is the state at PaymentIntent creation; the signature-verified
 * webhook (invariant #8) moves it to {@link #SUCCEEDED} (booking confirms), {@link #FAILED} (a
 * non-terminal attempt failure — the PI may be retried), or {@link #CANCELED} (terminal — the
 * booking is cancelled and its availability claim released). A recorded refund moves a
 * {@code SUCCEEDED} collection to {@link #REFUNDED} (every share refunded in full) or
 * {@link #PARTIALLY_REFUNDED} (anything less — a partial after-cutoff share, or one booking of a
 * group refunded while its siblings stand; invariant #10).
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
