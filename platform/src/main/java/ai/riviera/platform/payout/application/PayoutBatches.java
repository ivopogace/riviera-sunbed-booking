package ai.riviera.platform.payout.application;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The {@code payout} module's outbound persistence port for the BKT payout batches (U9, issue #12).
 * Internal to the module — implemented by {@code JdbcPayoutBatches} (explicit SQL, invariant #1).
 */
public interface PayoutBatches {

	/**
	 * Generate or <strong>refresh</strong> the {@code DRAFT} batch for {@code (venueId, period)} with
	 * the recomputed total — {@code INSERT … ON CONFLICT (venue_id, period_key) DO UPDATE} guarded by
	 * {@code WHERE status = 'DRAFT'}, so a re-run recomputes a still-draft batch but <strong>freezes</strong>
	 * one already {@code REPORTED}/{@code SETTLED} (idempotent generation, invariant #9). New rows start
	 * {@code DRAFT}.
	 */
	void upsertDraft(VenuePeriodTotal total, PeriodKey period);

	/** Every batch for {@code period}, ordered by venue, for the report read. Empty when none exist. */
	List<PayoutBatch> forPeriod(PeriodKey period);

	/** The batch with {@code id}, or empty if none — read before a status transition. */
	Optional<PayoutBatch> findById(long id);

	/**
	 * Move the batch with {@code id} from {@code expected} to {@code target}, stamping
	 * {@code updated_at} — returning the row <strong>as persisted</strong>, or empty when no row
	 * matched. Empty means the batch is gone or another actor already moved it off {@code expected};
	 * the caller re-reads to tell those apart. The expected status is part of the write's own
	 * predicate, so a caller acting on a stale read cannot regress a batch (invariant #9).
	 */
	Optional<PayoutBatch> transition(long id, BatchStatus expected, BatchStatus target);
}
