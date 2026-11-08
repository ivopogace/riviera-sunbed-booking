package ai.riviera.platform.payment.vocabulary;

/**
 * The result of collecting a payment — a closed, caller-mappable set (typed outcomes for expected
 * flows, not exceptions); sealed so callers {@code switch} exhaustively. The {@code booking}
 * module confirms in the create transaction only on {@link Succeeded}.
 *
 * <p>The stub (default profile) returns {@link Succeeded} synchronously; a collecting gateway returns
 * {@link Pending}, and the booking is confirmed only by a verified webhook (invariant #8), never the
 * client.
 */
public sealed interface PaymentOutcome
		permits PaymentOutcome.Succeeded, PaymentOutcome.Pending, PaymentOutcome.Failed, PaymentOutcome.MixedPayees {

	/** Payment collected synchronously (the in-process stub). {@code reference} is the gateway's handle. */
	record Succeeded(String reference) implements PaymentOutcome {
	}

	/**
	 * Collection initiated and now awaits a verified webhook (invariant #8). The booking stays
	 * {@code AWAITING_PAYMENT}; {@code instruction} tells the browser how to complete the payment.
	 */
	record Pending(CheckoutInstruction instruction) implements PaymentOutcome {
	}

	/** Payment not collected (declined / error). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements PaymentOutcome {
	}

	/** Refused before any gateway call: the shares name more than one venue, and a payment never spans venues. */
	record MixedPayees() implements PaymentOutcome {
	}
}
