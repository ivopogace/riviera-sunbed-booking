package ai.riviera.platform.payout.domain;

/**
 * The kind of payout-ledger entry (invariant #9), stored as the {@code TEXT} token the DB
 * {@code CHECK} lists (keep in lockstep). Direction lives here, never in the amount: amounts are
 * non-negative, so a sum reads {@code Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net}; an unnamed type
 * deducts. {@link #ACCRUAL}: a confirmed booking owes the venue {@code net = gross − commission}.
 * {@link #REVERSAL}: a refund cancels a prior accrual, sized to the refund. {@link #FEE}: charged
 * for a refund the venue's own change caused; no gross or commission, so the net CHECK exempts it.
 */
public enum EntryType {
	ACCRUAL,
	REVERSAL,
	FEE
}
