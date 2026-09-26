package ai.riviera.platform.payout.domain;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * A weekly BKT payout batch — what the platform owes one venue for one settlement
 * {@link PeriodKey}, paid manually via BKT (invariant #9, ADR-0002). One row per
 * {@code (venue, period)}.
 *
 * <p>{@code totalNetMinor} is the <strong>signed</strong> net owed for the period —
 * {@code Σ(ACCRUAL.net) − Σ(REVERSAL.net) − Σ(FEE.net)} in integer minor units (invariant #5),
 * negative when deductions exceed accruals. {@code id} is {@code null} before the row is persisted.
 */
public record PayoutBatch(Long id, VenueId venueId, PeriodKey periodKey, long totalNetMinor,
		String currency, BatchStatus status) {

	public PayoutBatch {
		if (venueId == null || periodKey == null || currency == null || currency.isBlank()
				|| status == null) {
			throw new IllegalArgumentException("venueId, periodKey, currency and status are required");
		}
	}
}
