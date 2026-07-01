package ai.riviera.platform.payment.vocabulary;

/**
 * The result of cancelling a booking's PaymentIntent — a closed, caller-mappable set (typed
 * outcomes for expected flows, not exceptions). Used by the abandoned-payment TTL sweep (issue
 * #51): the sweep cancels the lingering PaymentIntent so Stripe stops retrying, then releases the
 * held {@code (set, date)} — but only when the cancel is authoritative.
 *
 * <p>Collect-only — a cancel voids an <em>uncollected</em> PaymentIntent; it moves no money (no
 * Connect, no refund — ADR-0002 / invariant #8). A sealed interface so callers {@code switch}
 * exhaustively.
 */
public sealed interface PaymentCancellation
		permits PaymentCancellation.Canceled, PaymentCancellation.NotCancellable,
		PaymentCancellation.Failed {

	/**
	 * The PaymentIntent is now canceled (or was already canceled). The payment can no longer
	 * succeed, so the caller may safely cancel the booking and release its claim.
	 */
	record Canceled() implements PaymentCancellation {
	}

	/**
	 * The PaymentIntent must not be canceled — it reached a terminal {@code succeeded} (the payment
	 * went through; a confirm webhook will/has confirmed the booking), or no collection is on record.
	 * The caller leaves the booking untouched. {@code reason} is a short, non-PII code.
	 */
	record NotCancellable(String reason) implements PaymentCancellation {
	}

	/**
	 * The cancel could not be completed due to a transient gateway error. The caller skips this
	 * booking and retries on the next sweep. {@code reason} is a short, non-PII code.
	 */
	record Failed(String reason) implements PaymentCancellation {
	}
}
