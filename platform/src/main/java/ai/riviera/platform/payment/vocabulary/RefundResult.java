package ai.riviera.platform.payment.vocabulary;

/**
 * The result of issuing a refund: a closed, caller-mappable set of typed outcomes, sealed so callers
 * {@code switch} exhaustively. A refund is <strong>server-initiated</strong> through the gateway, its
 * amount computed by {@code booking}, never by the client (invariant #10). A {@link Failed} never
 * undoes the committed cancellation: {@code booking} throws so the publication is re-driven, safe at
 * any distance in time because the gateway checks what it already holds before creating a refund.
 */
public sealed interface RefundResult permits RefundResult.Refunded, RefundResult.Failed {

	/** Refund accepted by the gateway. {@code refundId} is the gateway's handle (Stripe {@code re_…}). */
	record Refunded(String refundId) implements RefundResult {
	}

	/** Refund not issued (gateway error / no collection to refund). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements RefundResult {
	}
}
