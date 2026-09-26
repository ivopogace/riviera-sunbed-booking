package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import ai.riviera.platform.venue.application.VenueCommissionView;

/**
 * The wire response for {@code GET /api/admin/venues} (A7) — every venue with the commission rate
 * the platform takes from it.
 *
 * <p>An object wrapping the array, not a bare array, so the list can gain a total or page window
 * without breaking clients. {@code commissionBps} travels as the exact stored integer
 * (1500 = 15.00%, invariant #5): the percent is the console's rendering, never the contract's, so
 * no rounding enters through the wire.
 */
record AdminVenueCommissionsResponse(List<VenueCommission> venues) {

	/**
	 * One venue's rate. {@code name} and {@code beach} are here so the list reads as venues rather than
	 * ids — two venues can share a name on different beaches. No owner travels: which operator owns a
	 * venue is the {@code operator} module's answer and is not what a rate decision turns on.
	 */
	record VenueCommission(long venueId, String name, String beach, int commissionBps,
			String payoutCurrency) {

		static VenueCommission from(VenueCommissionView v) {
			return new VenueCommission(v.venueId(), v.name(), v.beach(), v.commissionBps(),
					v.payoutCurrency());
		}
	}

	static AdminVenueCommissionsResponse from(List<VenueCommissionView> venues) {
		return new AdminVenueCommissionsResponse(venues.stream().map(VenueCommission::from).toList());
	}
}
