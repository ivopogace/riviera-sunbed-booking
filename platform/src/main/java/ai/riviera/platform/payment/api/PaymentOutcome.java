package ai.riviera.platform.payment.api;

/**
 * The result of collecting a payment — a closed, caller-mappable set (invariant: typed
 * outcomes for expected flows, not exceptions). The {@code booking} module confirms only on
 * {@link Succeeded}. A sealed interface so callers {@code switch} exhaustively.
 *
 * <p>U3's stub always returns {@link Succeeded}. The shape already accommodates U4's real
 * Stripe flow, where success is established by a signature-verified webhook (invariant #8),
 * not the client.
 */
public sealed interface PaymentOutcome permits PaymentOutcome.Succeeded, PaymentOutcome.Failed {

	/** Payment collected. {@code reference} is the gateway's handle (stub id now; PaymentIntent id in U4). */
	record Succeeded(String reference) implements PaymentOutcome {
	}

	/** Payment not collected (declined / error). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements PaymentOutcome {
	}
}
