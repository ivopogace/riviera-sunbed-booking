package ai.riviera.platform.payout.domain;

import ai.riviera.platform.venue.api.VenueId;

/**
 * A weekly BKT payout batch (U9, issue #12) — what the platform owes one venue for one settlement
 * {@link PeriodKey}, the unit the founder pays manually via BKT (invariant #9; no Stripe Connect,
 * ADR-0002). Aggregate root: one row per {@code (venue, period)}.
 *
 * <p>{@code totalNetMinor} is the <strong>signed</strong> net owed for the period —
 * {@code Σ(ACCRUAL.net) − Σ(REVERSAL.net)} in integer minor units (invariant #5) — which may be
 * negative when a period's reversals exceed its accruals. {@code id} is {@code null} before the row is
 * persisted.
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
