package ai.riviera.platform.payout.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The {@code payout} module's outbound persistence port for the BKT payout batches.
 * Internal to the module — implemented by {@code JdbcPayoutBatches} (explicit SQL, invariant #1).
 */
public interface PayoutBatches {

	/**
	 * Serialize generation of {@code period} for the caller's transaction, in a statement of its own before the ledger
	 * read, so two runs refresh its batches in the order they read the ledger (#1309).
	 */
	void lockPeriod(PeriodKey period);

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
	 * Move the batch from {@code expected} at {@code expectedTotalNetMinor} to {@code target} in one guarded write
	 * (invariant #9), stamping {@code updated_at}; returns the persisted row, or empty if it is gone, moved off
	 * {@code expected} or refreshed to another total (the caller re-reads to tell which).
	 */
	Optional<PayoutBatch> transition(long id, BatchStatus expected, BatchStatus target, long expectedTotalNetMinor);
}
