package ai.riviera.platform.payout.application;

import java.util.List;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The weekly BKT payout-report use case (U9, issue #12) — the inbound port the operator-gated web
 * adapter calls to generate, read, and advance the per-venue payout batches for a settlement
 * {@link PeriodKey} (invariant #9). Settlement itself is manual via BKT (no Stripe Connect, ADR-0002);
 * this port produces the report the founder acts on. Internal to {@code payout} ({@code application.in}).
 */
public interface PayoutReport {

	/**
	 * Generate (or refresh) the {@code DRAFT} batches for {@code period} from the ledger — one per venue
	 * with activity that period — and return them. Idempotent: re-running refreshes still-{@code DRAFT}
	 * batches and leaves {@code REPORTED}/{@code SETTLED} ones frozen (invariant #9).
	 */
	List<PayoutBatch> generate(PeriodKey period);

	/** The batches for {@code period}, ordered by venue (the report read). Empty when none generated. */
	List<PayoutBatch> forPeriod(PeriodKey period);

	/** Advance one batch's status (DRAFT→REPORTED→SETTLED); returns the typed {@link BatchStatusOutcome}. */
	BatchStatusOutcome mark(long batchId, BatchStatus target);
}
