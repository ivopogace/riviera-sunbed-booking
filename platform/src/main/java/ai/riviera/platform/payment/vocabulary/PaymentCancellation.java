package ai.riviera.platform.payment.vocabulary;

/**
 * The result of cancelling a booking's PaymentIntent: a closed, caller-mappable set of typed
 * outcomes, sealed so callers {@code switch} exhaustively. The abandoned-payment sweep cancels the
 * lingering intent so Stripe stops retrying, then releases the held {@code (set, date)}, but only
 * when the cancel is authoritative.
 *
 * <p>A cancel voids an <em>uncollected</em> PaymentIntent and moves no money: collect-only, no
 * Connect, no refund (ADR-0002).
 */
public sealed interface PaymentCancellation
		permits PaymentCancellation.Canceled, PaymentCancellation.NotCancellable,
		PaymentCancellation.NoCollection, PaymentCancellation.Failed {

	/**
	 * The PaymentIntent is now canceled (or was already canceled). The payment can no longer
	 * succeed, so the caller may safely cancel the booking and release its claim.
	 */
	record Canceled() implements PaymentCancellation {
	}

	/**
	 * The PaymentIntent must not be canceled — it reached a terminal {@code succeeded}: the payment
	 * went through and a confirm webhook will/has confirmed the booking (invariant #8). The caller
	 * leaves the booking untouched. {@code reason} is a short, non-PII code.
	 */
	record NotCancellable(String reason) implements PaymentCancellation {
	}

	/**
	 * No PaymentIntent on record to cancel: a {@code pay()} that threw after the reserve commit never
	 * registered one. Unlike {@link NotCancellable} nothing succeeded, so the sweep may release a stale
	 * booking, else stranded for good; an orphan intent at the gateway auto-expires unpaid.
	 */
	record NoCollection() implements PaymentCancellation {
	}

	/**
	 * The cancel could not be completed due to a transient gateway error. The caller skips this
	 * booking and retries on the next sweep. {@code reason} is a short, non-PII code.
	 */
	record Failed(String reason) implements PaymentCancellation {
	}
}
