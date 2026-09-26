/**
 * The payout module: the venue payout ledger ({@code Σ amounts − commission − fees}), manual BKT
 * batch reporting, and the platform's own settings (today only the venue-change fee). A booking
 * accrues exactly once, a refund reverses it, and a refund the venue's own change caused also
 * charges it a fee (invariant #9); direction is the entry type, never the sign. Hexagonal
 * (invariant #11) and publishes no {@code api}/{@code spi} of its own. Rationale:
 * {@code RESPONSIBILITIES.md} §payout, ADR-0021.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    /**
     * Deny-by-default, least privilege per surface (invariant #11): booking events and takings read;
     * booking::spi to implement VenueChangeFeeRate (inverted, as booking -> payout would cycle); venue's
     * commission rate; operator ownership checks (invariant #13).
     */
    allowedDependencies = { "booking::api", "booking::events", "booking::spi", "booking::vocabulary", "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.payout;
