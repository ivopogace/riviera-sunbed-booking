package ai.riviera.platform.payout.domain;

/**
 * The kind of payout-ledger entry (invariant #9), stored as the {@code TEXT} token the DB {@code CHECK}
 * lists (keep in lockstep). Direction lives here, never in the amount: only an {@link #ACCRUAL} adds
 * ({@code net = gross − commission}); a {@link #REVERSAL} backs a refund out pro rata; a
 * {@link #DAY_REVERSAL} backs out one service day's share, keyed by the day (ADR-0026); a {@link #FEE}
 * charges a venue-caused refund with no gross or commission, so the net CHECK exempts it (ADR-0021).
 */
public enum EntryType {
	ACCRUAL,
	REVERSAL,
	FEE,
	DAY_REVERSAL
}
