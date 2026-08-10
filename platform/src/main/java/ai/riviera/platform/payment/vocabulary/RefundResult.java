package ai.riviera.platform.payment.vocabulary;

/**
 * The result of issuing a refund — a closed, caller-mappable set (typed outcomes for expected
 * flows, not exceptions). A refund is <strong>server-initiated</strong> through the gateway
 * (invariant #8/#10); the amount is computed by {@code booking} server-side, never
 * by the client. The {@code booking} module logs a {@link Failed} for ops follow-up but does not
 * abort the cancellation — the call is safe to retry at any distance in time, because the gateway
 * checks what it already holds before creating a refund. A sealed interface so callers
 * {@code switch} exhaustively.
 */
public sealed interface RefundResult permits RefundResult.Refunded, RefundResult.Failed {

	/** Refund accepted by the gateway. {@code refundId} is the gateway's handle (Stripe {@code re_…}). */
	record Refunded(String refundId) implements RefundResult {
	}

	/** Refund not issued (gateway error / no collection to refund). {@code reason} is a short, non-PII code. */
	record Failed(String reason) implements RefundResult {
	}
}
