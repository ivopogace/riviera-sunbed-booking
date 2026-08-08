package ai.riviera.platform.payout.application;

import java.time.LocalDate;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator console's "online takings today" read use case. Returns a venue's gross
 * confirmed-online takings for one service date with the venue's commission applied — an
 * <strong>indicative</strong> per-service-date figure, distinct from the payout ledger's per-booking
 * ISO-week accrual. Package-private implementation behind this port (invariant #11); the
 * per-venue ownership check (invariant #13) lives in the service.
 */
public interface ViewDailyTakings {

	DailyTakingsView forVenueOn(OperatorId operator, VenueId venueId, LocalDate date);
}
