package ai.riviera.platform.payout.application;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The weekly BKT payout-report use case. {@link #generate} folds the ledger into one {@code DRAFT} batch per venue
 * for the period (idempotent refresh, invariant #9), one run per period at a time; {@link #mark} advances a batch
 * through {@code DRAFT → REPORTED → SETTLED} at the total its caller reviewed, answering a typed outcome otherwise.
 * Money is integer minor units throughout (invariant #5).
 * Package-private behind {@link PayoutReport} (invariant #11).
 */
@Service
class PayoutReportService implements PayoutReport {

	private static final Logger log = LoggerFactory.getLogger(PayoutReportService.class);

	private final PayoutLedger ledger;
	private final PayoutBatches batches;

	PayoutReportService(PayoutLedger ledger, PayoutBatches batches) {
		this.ledger = ledger;
		this.batches = batches;
	}

	@Override
	@Transactional
	public List<PayoutBatch> generate(PeriodKey period) {
		batches.lockPeriod(period);
		Map<Long, PayoutBatch> existing = batches.forPeriod(period).stream()
				.collect(Collectors.toMap(b -> b.venueId().value(), Function.identity()));
		List<VenuePeriodTotal> totals = ledger.netTotalsForPeriod(period);
		for (VenuePeriodTotal total : totals) {
			warnIfFrozenAndStale(existing.get(total.venueId().value()), total, period);
			batches.upsertDraft(total, period);
		}
		log.info("generated/refreshed {} payout batch(es) for period {}", totals.size(), period.value());
		return batches.forPeriod(period);
	}

	/**
	 * A batch past {@code DRAFT} is frozen ({@code upsertDraft} skips it, invariant #9), so a no-op
	 * refresh gives no signal: warn when the ledger now nets differently, as the reported/settled
	 * total then diverges and must be reconciled manually.
	 */
	private void warnIfFrozenAndStale(PayoutBatch existing, VenuePeriodTotal total, PeriodKey period) {
		if (existing != null && existing.status() != BatchStatus.DRAFT
				&& existing.totalNetMinor() != total.netMinor()) {
			log.warn("payout batch for venue {} period {} is {} (frozen at {}) but the ledger now nets {}"
					+ " — re-generation cannot refresh it; reconcile manually", total.venueId().value(),
					period.value(), existing.status(), existing.totalNetMinor(), total.netMinor());
		}
	}

	@Override
	@Transactional(readOnly = true)
	public List<PayoutBatch> forPeriod(PeriodKey period) {
		return batches.forPeriod(period);
	}

	@Override
	@Transactional
	public BatchStatusOutcome mark(long batchId, BatchStatus target, OptionalLong reviewedTotalNetMinor) {
		if (target == BatchStatus.REPORTED && reviewedTotalNetMinor.isEmpty()) {
			throw new IllegalArgumentException("REPORTED freezes the total, so it needs the one the admin reviewed");
		}
		var found = batches.findById(batchId);
		if (found.isEmpty()) {
			return new BatchStatusOutcome.NotFound();
		}
		PayoutBatch batch = found.get();
		if (!batch.status().canTransitionTo(target)) {
			return new BatchStatusOutcome.IllegalTransition(batch.status(), target);
		}
		long expectedTotal = target == BatchStatus.REPORTED ? reviewedTotalNetMinor.getAsLong() : batch.totalNetMinor();
		Optional<PayoutBatch> moved = batches.transition(batchId, batch.status(), target, expectedTotal);
		if (moved.isEmpty()) {
			return lostRace(batchId, target, expectedTotal);
		}
		log.info("payout batch {} ({} {}) -> {}", batchId, batch.venueId().value(),
				batch.periodKey().value(), target);
		return new BatchStatusOutcome.Marked(moved.get());
	}

	/**
	 * The guarded write matched no row: re-read and say why. Already at {@code target} and {@code expectedTotal} is
	 * {@link BatchStatusOutcome.Marked}; at another total, before or at {@code target}, {@link BatchStatusOutcome.TotalChanged}.
	 * Needs READ COMMITTED (the default) so the re-read sees the winner's commit, not a snapshot.
	 */
	private static BatchStatusOutcome classify(PayoutBatch current, BatchStatus target, long expectedTotal) {
		if (current.status() == target && current.totalNetMinor() == expectedTotal) {
			return new BatchStatusOutcome.Marked(current);
		}
		if (current.status() == target || current.status().canTransitionTo(target)) {
			return new BatchStatusOutcome.TotalChanged(current);
		}
		return new BatchStatusOutcome.IllegalTransition(current.status(), target);
	}

	private BatchStatusOutcome lostRace(long batchId, BatchStatus target, long expectedTotal) {
		return batches.findById(batchId)
				.map(current -> classify(current, target, expectedTotal))
				.orElseGet(BatchStatusOutcome.NotFound::new);
	}
}
