package ai.riviera.platform.payment.domain;

import java.util.Set;

/**
 * Whether a gateway refund status means <strong>no money reached the guest</strong>.
 *
 * <p>The predicate is deliberately narrow: only a definitively dead status answers {@code true}, so
 * an unrecognised or absent status reads as still-live. Both readers depend on that direction — the
 * refund-execution path must not create a second refund on a guess, and the webhook path must not
 * un-record a refund on one.
 */
public final class RefundLifecycle {

	/** Gateway refund statuses in which the money came back to the platform, so the refund is still owed. */
	private static final Set<String> DEAD_STATUSES = Set.of("failed", "canceled");

	private RefundLifecycle() {
	}

	/** Whether {@code refundStatus} is a definitive "this refund returned nothing". */
	public static boolean returnedNoMoney(String refundStatus) {
		return refundStatus != null && DEAD_STATUSES.contains(refundStatus);
	}
}
