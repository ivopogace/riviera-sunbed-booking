package ai.riviera.platform.payout.application;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * One venue's venue-caused refunds, as the admin's abuse guard reads them: how many bookings a
 * remodel refunded, what those refunds returned to guests, and what the venue paid in fees. Money is
 * integer minor units + ISO currency (invariant #5).
 *
 * <p>The two amounts come from different ledger entry types and are never added: {@code refundedMinor}
 * is what the {@code REVERSAL}s returned, {@code feeMinor} what the {@code FEE}s charged.
 */
public record VenueChangeRefundTotal(VenueId venueId, int refundCount, long refundedMinor, long feeMinor,
		String currency) {
}
