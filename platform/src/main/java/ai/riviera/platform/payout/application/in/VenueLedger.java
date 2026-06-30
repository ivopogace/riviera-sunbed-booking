package ai.riviera.platform.payout.application.in;

import java.util.List;

import ai.riviera.platform.venue.api.VenueId;

/**
 * A venue's payout ledger (U9, issue #12): its entries oldest-first (each carrying the running net
 * owed) plus the {@code netOwedMinor} total — what the platform currently owes the venue,
 * {@code Σ(ACCRUAL.net) − Σ(REVERSAL.net)} in integer minor units + ISO currency (invariant #5/#9). An
 * empty ledger has {@code netOwedMinor == 0} and no entries.
 */
public record VenueLedger(VenueId venueId, String currency, long netOwedMinor,
		List<LedgerEntryView> entries) {
}
