package ai.riviera.platform.payout.domain;

/**
 * The lifecycle of a {@link PayoutBatch}, strictly forward. Settlement is <strong>manual</strong>
 * via BKT (ADR-0002): these record where a period's payout stands and drive no transfer. Mirrors
 * the {@code payout_batch.status} CHECK (V15) one-to-one: {@link #DRAFT} — the total still tracks
 * the ledger; {@link #REPORTED} — sent to BKT, frozen; {@link #SETTLED} — the venue has been paid.
 */
public enum BatchStatus {
	DRAFT,
	REPORTED,
	SETTLED;

	/** Whether {@code this → target} is a legal forward transition (DRAFT→REPORTED→SETTLED). */
	public boolean canTransitionTo(BatchStatus target) {
		return (this == DRAFT && target == REPORTED) || (this == REPORTED && target == SETTLED);
	}
}
