package ai.riviera.platform.payout.domain;

/**
 * The kind of payout-ledger entry (invariant #9). A confirmed booking accrues; a refund reverses; a
 * refund the venue's own change caused also charges a fee. Stored as the {@code TEXT} token the DB
 * {@code CHECK} constraint also lists (kept in lockstep).
 *
 * <p><strong>Direction lives here, never in the amount</strong> — every amount is a non-negative
 * magnitude, so a sum reads {@code Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net}. A type not named by
 * a sum is a deduction.
 *
 * <ul>
 *   <li>{@link #ACCRUAL} — the platform owes the venue {@code net = gross − commission} (U5).</li>
 *   <li>{@link #REVERSAL} — a refund cancels a prior accrual, sized to the refund (U6/U10).</li>
 *   <li>{@link #FEE} — what the venue is charged for a refund its own change caused. No gross and no
 *       commission, so it is the one type the net CHECK exempts.</li>
 * </ul>
 */
public enum EntryType {
	ACCRUAL,
	REVERSAL,
	FEE
}
