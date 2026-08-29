package ai.riviera.platform.booking.domain;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * The server-side cancellation refund policy (invariant #10). Pure integer arithmetic, no Spring —
 * the refund decision lives with the rule it encodes, unit-testable in isolation (mirrors the
 * commission math in {@code payout.domain.PayoutLedgerEntry}).
 *
 * <p>Three tiers, one per {@link CancellationWindow}: full before the evening-before cutoff, the
 * venue's configurable basis-point share after it, and nothing once the service day has opened.
 * Money is integer minor units (invariant #5) and the share rounds <strong>down</strong>
 * ({@code floorDiv}) — the platform keeps the sub-cent, consistent with the commission rounding
 * direction.
 */
public final class RefundPolicy {

	private static final long BPS_DENOMINATOR = 10_000L;

	private RefundPolicy() {
	}

	/**
	 * The refund due in minor units, one tier per {@link CancellationWindow}: {@code FREE} refunds
	 * the full {@code grossMinor}; {@code LATE} refunds {@code floorDiv(grossMinor × lateCancelBps,
	 * 10000)} (0 bps ⇒ non-refundable); {@code CLOSED} refunds nothing, because the cancellation
	 * itself is refused. The amount is always computed here from server state — never supplied by
	 * the caller (invariant #10).
	 *
	 * @param grossMinor    the amount the tourist paid, integer minor units
	 * @param window        where the request falls relative to the service day (invariant #4/#6)
	 * @param lateCancelBps the venue's after-cutoff refund share in basis points (0..10000)
	 */
	public static long refundMinor(long grossMinor, CancellationWindow window, int lateCancelBps) {
		return switch (window) {
			case FREE -> grossMinor;
			case LATE -> Math.floorDiv(grossMinor * lateCancelBps, BPS_DENOMINATOR);
			case CLOSED -> 0L;
		};
	}
}
