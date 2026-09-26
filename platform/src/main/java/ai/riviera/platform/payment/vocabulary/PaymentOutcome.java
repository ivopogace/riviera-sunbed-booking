package ai.riviera.platform.payment.vocabulary;

/**
 * The result of collecting a payment — a closed, caller-mappable set (typed outcomes for expected
 * flows, not exceptions); sealed so callers {@code switch} exhaustively. The {@code booking}
 * module confirms in the create transaction only on {@link Succeeded}.
 *
 * <p>The stub (default profile) returns {@link Succeeded} synchronously; the Stripe gateway
 * ({@code stripe} profile) returns {@link Pending}, and the booking is confirmed only by a
 * signature-verified webhook (invariant #8), never the client.
 */
public sealed interface PaymentOutcome
		permits PaymentOutcome.Succeeded, PaymentOutcome.Pending, PaymentOutcome.Failed {

	/** Payment collected synchronously (the in-process stub). {@code reference} is the gateway's handle. */
	record Succeeded(String reference) implements PaymentOutcome {
	}

	/**
	 * Collection initiated and now awaits a signature-verified webhook (invariant #8). The
	 * booking stays {@code AWAITING_PAYMENT}; the {@code clientSecret} lets the browser confirm
	 * the card with Stripe.js, and {@code paymentIntentId} is the handle the webhook correlates
	 * back to the booking. Real Stripe collection.
	 */
	record Pending(String clientSecret, String paymentIntentId) implements PaymentOutcome {
	}

	/** Payment not collected (declined / error). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements PaymentOutcome {
	}
}
