package ai.riviera.platform.payout.domain;

/**
 * The kind of payout-ledger entry (invariant #9). A confirmed booking accrues; a refund reverses.
 * Stored as the {@code TEXT} token the DB {@code CHECK} constraint also lists (kept in lockstep).
 *
 * <ul>
 *   <li>{@link #ACCRUAL} — the platform owes the venue {@code net = gross − commission} (U5).</li>
 *   <li>{@link #REVERSAL} — a refund cancels a prior accrual (U6/U10; reserved here so the ledger
 *       schema and value set are stable from the start).</li>
 * </ul>
 */
public enum EntryType {
	ACCRUAL,
	REVERSAL
}
