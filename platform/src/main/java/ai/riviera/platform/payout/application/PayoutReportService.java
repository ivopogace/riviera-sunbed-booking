package ai.riviera.platform.payout.application;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.payout.application.in.BatchStatusOutcome;
import ai.riviera.platform.payout.application.in.PayoutReport;
import ai.riviera.platform.payout.application.out.PayoutBatches;
import ai.riviera.platform.payout.application.out.PayoutLedger;
import ai.riviera.platform.payout.application.out.VenuePeriodTotal;
import ai.riviera.platform.payout.domain.BatchStatus;
import ai.riviera.platform.payout.domain.PayoutBatch;
import ai.riviera.platform.payout.domain.PeriodKey;

/**
 * The weekly BKT payout-report use case (U9, issue #12). {@link #generate} folds the ledger into one
 * {@code DRAFT} batch per venue for the period (idempotent refresh, invariant #9); {@link #mark}
 * advances a batch through {@code DRAFT → REPORTED → SETTLED}, rejecting illegal moves with a typed
 * outcome rather than an exception. Money is integer minor units throughout (invariant #5).
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
		List<VenuePeriodTotal> totals = ledger.netTotalsForPeriod(period);
		for (VenuePeriodTotal total : totals) {
			batches.upsertDraft(total, period);
		}
		log.info("generated/refreshed {} payout batch(es) for period {}", totals.size(), period.value());
		return batches.forPeriod(period);
	}

	@Override
	@Transactional(readOnly = true)
	public List<PayoutBatch> forPeriod(PeriodKey period) {
		return batches.forPeriod(period);
	}

	@Override
	@Transactional
	public BatchStatusOutcome mark(long batchId, BatchStatus target) {
		var found = batches.findById(batchId);
		if (found.isEmpty()) {
			return new BatchStatusOutcome.NotFound();
		}
		PayoutBatch batch = found.get();
		if (!batch.status().canTransitionTo(target)) {
			return new BatchStatusOutcome.IllegalTransition(batch.status(), target);
		}
		batches.updateStatus(batchId, target);
		log.info("payout batch {} ({} {}) -> {}", batchId, batch.venueId().value(),
				batch.periodKey().value(), target);
		return new BatchStatusOutcome.Marked(new PayoutBatch(batch.id(), batch.venueId(),
				batch.periodKey(), batch.totalNetMinor(), batch.currency(), target));
	}
}
