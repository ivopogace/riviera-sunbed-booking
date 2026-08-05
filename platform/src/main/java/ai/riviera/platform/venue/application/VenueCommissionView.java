package ai.riviera.platform.venue.application;

/**
 * One venue's commission configuration for the platform-admin surface (A7, epic #348):
 * {@code commissionBps} is the venue's <strong>live</strong> rate in exact-integer basis points
 * (1500 = 15.00%, invariant #5 — never a float and never a percent string on the wire), and
 * {@code payoutCurrency} is its ISO-4217 payout code.
 *
 * <p>{@code name} and {@code beach} are here to make the list operable rather than a column of bare
 * ids — two venues can share a name on different beaches. Nothing venue-scoped or owner-specific
 * travels: the admin owns none of these venues, and which operator does is the {@code operator}
 * module's answer, not this read's.
 *
 * <p>The rate shown is the live one, so it changes the moment a write lands even though the write
 * takes effect for <em>reporting</em> from the next service date. That is the honest reading: the
 * live rate is what the next accrual will use.
 */
public record VenueCommissionView(long venueId, String name, String beach, int commissionBps,
		String payoutCurrency) {
}
