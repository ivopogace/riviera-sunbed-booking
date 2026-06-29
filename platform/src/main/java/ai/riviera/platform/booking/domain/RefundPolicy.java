package ai.riviera.platform.booking.domain;

/**
 * The server-side cancellation refund policy (invariant #10). Pure integer arithmetic, no Spring —
 * the refund decision lives with the rule it encodes, unit-testable in isolation (mirrors the
 * commission math in {@code payout.domain.PayoutLedgerEntry}).
 *
 * <p>Free cancellation <strong>before</strong> the evening-before cutoff yields a full refund; an
 * after-cutoff cancellation yields the venue's configurable share in basis points. Money is integer
 * minor units (invariant #5) and the share rounds <strong>down</strong> ({@code floorDiv}) — the
 * platform keeps the sub-cent, consistent with the commission rounding direction (U5).
 */
public final class RefundPolicy {

	private static final long BPS_DENOMINATOR = 10_000L;

	private RefundPolicy() {
	}

	/**
	 * The refund due in minor units. Before the cutoff: the full {@code grossMinor}. After: {@code
	 * floorDiv(grossMinor × lateCancelBps, 10000)} (0 bps ⇒ non-refundable). The amount is always
	 * computed here from server state — never supplied by the caller (invariant #10).
	 *
	 * @param grossMinor    the amount the tourist paid, integer minor units
	 * @param beforeCutoff  whether "now" is before the free-cancellation cutoff (invariant #4/#6)
	 * @param lateCancelBps the venue's after-cutoff refund share in basis points (0..10000)
	 */
	public static long refundMinor(long grossMinor, boolean beforeCutoff, int lateCancelBps) {
		if (beforeCutoff) {
			return grossMinor;
		}
		return Math.floorDiv(grossMinor * lateCancelBps, BPS_DENOMINATOR);
	}
}
