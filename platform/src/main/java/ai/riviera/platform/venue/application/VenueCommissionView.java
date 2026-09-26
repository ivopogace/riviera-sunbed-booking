package ai.riviera.platform.venue.application;

/**
 * One venue's commission configuration for the platform-admin surface (A7): {@code commissionBps}
 * is the venue's <strong>live</strong> rate, the one the next accrual uses, in exact-integer basis
 * points (1500 = 15.00%, invariant #5 — never a float or a percent string on the wire), and
 * {@code payoutCurrency} its ISO-4217 payout code. {@code name} and {@code beach} make the list
 * operable (two venues can share a name on different beaches); nothing owner-specific travels —
 * which operator owns a venue is the {@code operator} module's answer.
 */
public record VenueCommissionView(long venueId, String name, String beach, int commissionBps,
		String payoutCurrency) {
}
