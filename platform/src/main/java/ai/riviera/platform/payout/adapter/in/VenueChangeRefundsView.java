package ai.riviera.platform.payout.adapter.in;

import java.util.List;

import ai.riviera.platform.payout.application.VenueChangeRefundTotal;

/**
 * Venue-caused refunds on the wire, one row per venue: how many bookings a remodel refunded, what
 * those refunds returned to guests, and what the venue paid in venue-change fees. Amounts are
 * integer minor units + ISO currency (invariant #5) and are deliberately reported apart — a fee is
 * not part of what a guest got back.
 *
 * <p>Aggregates only. No booking id and no booking code ride this surface (invariant #7); the venue
 * is a technical id the console resolves to a name from its own venue list.
 */
record VenueChangeRefundsView(List<VenueRow> venues) {

	static VenueChangeRefundsView of(List<VenueChangeRefundTotal> totals) {
		return new VenueChangeRefundsView(totals.stream().map(VenueRow::of).toList());
	}

	record VenueRow(long venueId, int refundCount, long refundedMinor, long feeMinor, String currency) {

		static VenueRow of(VenueChangeRefundTotal total) {
			return new VenueRow(total.venueId().value(), total.refundCount(), total.refundedMinor(),
					total.feeMinor(), total.currency());
		}
	}
}
