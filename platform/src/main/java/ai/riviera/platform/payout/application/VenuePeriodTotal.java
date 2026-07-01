package ai.riviera.platform.payout.application;

import ai.riviera.platform.venue.api.VenueId;

/**
 * The signed net owed to one venue for one settlement period (U9, issue #12) — the aggregate the BKT
 * report turns into a {@link ai.riviera.platform.payout.domain.PayoutBatch}. {@code netMinor} is
 * {@code Σ(ACCRUAL.net) − Σ(REVERSAL.net)} for the period in integer minor units (invariant #5/#9) and
 * may be negative. A read projection internal to the {@code payout} module.
 */
public record VenuePeriodTotal(VenueId venueId, long netMinor, String currency) {
}
