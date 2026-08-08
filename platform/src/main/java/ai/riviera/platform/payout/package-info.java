/**
 * Payout bounded context — the venue payout ledger (booking amounts − commission)
 * and manual BKT batch reporting (invariant #9: a booking contributes exactly once;
 * refunds reverse it). Aggregate roots: {@code PayoutLedgerEntry}, {@code PayoutBatch}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code application},
 * {@code domain}, {@code adapter.in/out}. Publishes nothing — no {@code api}/{@code spi} of its own;
 * it consumes {@code booking}/{@code venue} events and query ports (incl. {@code booking::api} for the
 * console's daily-takings read) and re-reads {@code venue}'s commission rate.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    /**
     * U5: payout reacts to booking::events (BookingConfirmed/BookingCancelled) and re-reads the commission rate
     * from venue::api at accrual time (invariant #11). booking::api: the console daily-takings read
     * pulls a venue's gross confirmed-online takings synchronously. operator::api: both reads assert
     * per-venue ownership (invariant #13). Deny-by-default: each provider granted per surface at least
     * privilege — api+events+vocabulary from booking, api+vocabulary from venue and operator.
     */
    allowedDependencies = { "booking::api", "booking::events", "booking::vocabulary", "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary", "shared" }
)
package ai.riviera.platform.payout;
