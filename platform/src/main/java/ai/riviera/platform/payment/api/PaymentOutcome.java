package ai.riviera.platform.payment.api;

/**
 * The result of collecting a payment — a closed, caller-mappable set (invariant: typed
 * outcomes for expected flows, not exceptions). The {@code booking} module confirms only on
 * {@link Succeeded}. A sealed interface so callers {@code switch} exhaustively.
 *
 * <p>The stub (default profile) returns {@link Succeeded} synchronously — collection is
 * in-process, so the booking confirms in the create transaction. The real Stripe gateway
 * (U4, {@code stripe} profile) returns {@link Pending}: a PaymentIntent has been created but
 * collection completes asynchronously, and the booking is confirmed only by a
 * <strong>signature-verified webhook</strong> (invariant #8), never the client. The
 * {@code booking} module switches on this outcome.
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
	 * back to the booking. Real Stripe collection (U4).
	 */
	record Pending(String clientSecret, String paymentIntentId) implements PaymentOutcome {
	}

	/** Payment not collected (declined / error). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements PaymentOutcome {
	}
}
