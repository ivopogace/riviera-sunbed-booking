package ai.riviera.platform.payout.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The {@code payout} module's outbound persistence port for the BKT payout batches (U9).
 * Internal to the module — implemented by {@code JdbcPayoutBatches} (explicit SQL, invariant #1).
 */
public interface PayoutBatches {

	/**
	 * Generate or <strong>refresh</strong> the {@code DRAFT} batch for {@code (venueId, period)}
	 * with the recomputed total; one already {@code REPORTED}/{@code SETTLED} stays
	 * <strong>frozen</strong> (idempotent generation, invariant #9). New rows start {@code DRAFT}.
	 */
	void upsertDraft(VenuePeriodTotal total, PeriodKey period);

	/** Every batch for {@code period}, ordered by venue, for the report read. Empty when none exist. */
	List<PayoutBatch> forPeriod(PeriodKey period);

	/** The batch with {@code id}, or empty if none — read before a status transition. */
	Optional<PayoutBatch> findById(long id);

	/**
	 * Move the batch from {@code expected} to {@code target} in one guarded write (no stale-read
	 * regression, invariant #9), stamping {@code updated_at}; returns the persisted row, or empty
	 * if it is gone or already moved off {@code expected} (the caller re-reads to tell which).
	 */
	Optional<PayoutBatch> transition(long id, BatchStatus expected, BatchStatus target);
}
