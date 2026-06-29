package ai.riviera.platform.payment.domain;

/**
 * The lifecycle of a Stripe collection. Mirrors the {@code payment.status} CHECK constraint
 * (V7) one-to-one — keep the Java enum and the SQL token set in lockstep.
 *
 * <p>{@link #REQUIRES_PAYMENT} is the state at PaymentIntent creation; the signature-verified
 * webhook (invariant #8) moves it to {@link #SUCCEEDED} (booking confirms), {@link #FAILED} (a
 * non-terminal attempt failure — the PI may be retried), or {@link #CANCELED} (terminal — the
 * booking is cancelled and its availability claim released).
 */
public enum PaymentStatus {
	REQUIRES_PAYMENT,
	SUCCEEDED,
	FAILED,
	CANCELED
}
