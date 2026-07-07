package ai.riviera.platform.payout.domain;

/**
 * The split of a gross amount into commission + net, in integer minor units (invariant #5) — the
 * single home of the commission formula. Commission is rounded <strong>down</strong>:
 * {@code commission = floorDiv(gross × bps, 10000)}; the venue keeps the sub-cent remainder
 * ({@code net = gross − commission}). {@code bps} is the venue's commission rate in basis points
 * (1500 = 15.00%). Used by both the payout-ledger {@link PayoutLedgerEntry#accrual accrual}
 * (per confirmed booking) and the operator console's daily-takings read (per service date, #171),
 * so the arithmetic is written once and never diverges.
 */
public record CommissionSplit(long grossMinor, long commissionMinor, long netMinor) {

	private static final long BPS_DENOMINATOR = 10_000L;

	/** Apply {@code commissionBps} to {@code grossMinor}, rounding the commission down (invariant #5). */
	public static CommissionSplit of(long grossMinor, int commissionBps) {
		long commission = Math.floorDiv(grossMinor * commissionBps, BPS_DENOMINATOR);
		return new CommissionSplit(grossMinor, commission, grossMinor - commission);
	}
}
