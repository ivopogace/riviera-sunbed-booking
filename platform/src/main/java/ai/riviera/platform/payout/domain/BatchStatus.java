package ai.riviera.platform.payout.domain;

/**
 * The lifecycle of a {@link PayoutBatch} (U9, issue #12). Settlement is <strong>manual</strong> via BKT
 * (no Stripe Connect, ADR-0002) — these statuses record where a period's payout stands, they do not
 * drive an automated transfer. Mirrors the {@code payout_batch.status} CHECK (V15) one-to-one.
 *
 * <ul>
 *   <li>{@link #DRAFT} — generated/refreshed from the ledger; the total still tracks the ledger.</li>
 *   <li>{@link #REPORTED} — the report has been sent to BKT for the manual transfer; frozen.</li>
 *   <li>{@link #SETTLED} — the venue has been paid.</li>
 * </ul>
 *
 * <p>Transitions go strictly forward {@code DRAFT → REPORTED → SETTLED}; any other move is rejected.
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
