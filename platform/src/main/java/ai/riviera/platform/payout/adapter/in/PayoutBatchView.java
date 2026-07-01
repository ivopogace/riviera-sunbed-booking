package ai.riviera.platform.payout.adapter.in;

import ai.riviera.platform.payout.domain.PayoutBatch;

/**
 * The HTTP response for a payout batch (U9, issue #12): the BKT report row for a {@code (venue, period)}.
 * A thin wire DTO over {@link PayoutBatch} — exposes {@code venueId} as a plain {@code long} and the
 * enums/value objects as their tokens. {@code totalNetMinor} is the signed net owed in integer minor
 * units (invariant #5/#9).
 */
record PayoutBatchView(long id, long venueId, String periodKey, long totalNetMinor, String currency,
		String status) {

	static PayoutBatchView of(PayoutBatch batch) {
		return new PayoutBatchView(batch.id(), batch.venueId().value(), batch.periodKey().value(),
				batch.totalNetMinor(), batch.currency(), batch.status().name());
	}
}
