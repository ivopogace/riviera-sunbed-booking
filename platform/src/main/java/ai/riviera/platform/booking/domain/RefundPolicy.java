package ai.riviera.platform.booking.domain;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * The server-side cancellation refund policy (invariant #10): pure integer arithmetic, no Spring.
 * Three tiers, one per {@link CancellationWindow}: full before the evening-before cutoff, the
 * venue's configurable basis-point share after it, and nothing once the service day has opened.
 * Money is integer minor units (invariant #5) and the share rounds <strong>down</strong>
 * ({@code floorDiv}): the platform keeps the sub-cent, as with the commission in
 * {@code payout.domain.PayoutLedgerEntry}.
 */
public final class RefundPolicy {

	private static final long BPS_DENOMINATOR = 10_000L;

	private RefundPolicy() {
	}

	/**
	 * The refund due in minor units, from server state, never caller-supplied (invariant #10): FREE
	 * the full {@code grossMinor}; LATE {@code floorDiv(grossMinor × lateCancelBps, 10000)}, bps in
	 * 0..10000 (0 ⇒ non-refundable); CLOSED nothing, because the cancellation itself is refused.
	 */
	public static long refundMinor(long grossMinor, CancellationWindow window, int lateCancelBps) {
		return switch (window) {
			case FREE -> grossMinor;
			case LATE -> Math.floorDiv(grossMinor * lateCancelBps, BPS_DENOMINATOR);
			case CLOSED -> 0L;
		};
	}
}
