/**
 * Payout bounded context — the venue payout ledger (booking amounts − commission)
 * and manual BKT batch reporting (invariant #9: a booking contributes exactly once;
 * refunds reverse it). Aggregate roots: {@code PayoutLedgerEntry}, {@code PayoutBatch}.
 *
 * <p>Hexagonal layout (invariant #11, ADR-0007 full template): {@code application},
 * {@code domain}, {@code adapter.in/out}. Pure event subscriber — no {@code api}/{@code spi}
 * (it consumes {@code booking}/{@code venue} events and ports, exposing nothing).
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    // U5: payout reacts to booking::api's BookingConfirmed event and re-reads the commission rate
    // from venue::api at accrual time (invariant #11). operator::api (#73): the ledger read asserts
    // per-venue ownership (invariant #13). Deny-by-default: these are the only three.
    allowedDependencies = { "booking::api", "venue::api", "operator::api" }
)
package ai.riviera.platform.payout;
