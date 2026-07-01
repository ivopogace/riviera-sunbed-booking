package ai.riviera.platform.payout.application;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The per-venue payout-ledger read use case (U9, issue #12) — the inbound port the operator-gated web
 * adapter calls to show a venue's accruals + reversals and the running net owed (invariant #9).
 * Internal to {@code payout} ({@code application.in}); the admin surface is not cross-module {@code api/}.
 *
 * <p>The ledger is venue financial data, so it is venue-scoped: the implementation asserts
 * {@code operator} owns {@code venueId} first (invariant #13) and returns {@code 403} on a mismatch.
 */
public interface ViewPayoutLedger {

	/** The {@link VenueLedger} for {@code venueId} (entries + running/total net owed); never {@code null}. */
	VenueLedger forVenue(OperatorId operator, VenueId venueId);
}
