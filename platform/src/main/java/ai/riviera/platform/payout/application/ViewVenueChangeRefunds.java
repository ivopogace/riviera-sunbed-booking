package ai.riviera.platform.payout.application;

import java.util.List;

/**
 * The platform admin's read of venue-caused refunds, per venue. Built from ledger rows the refund
 * path always writes, so no venue can be missing from it by omission — which is what makes it the
 * abuse guard rather than a report someone maintains.
 *
 * <p>Platform-wide, not venue-scoped: role-gated at the edge and exempt from the per-venue ownership
 * check (invariant #13). Module-internal driving port for the REST adapter.
 */
public interface ViewVenueChangeRefunds {

	/** Every venue with at least one venue-caused refund, by venue id. Empty when there are none. */
	List<VenueChangeRefundTotal> perVenue();
}
