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
    // U5: payout reacts to booking::events (BookingConfirmed/BookingCancelled) and re-reads the commission rate
    // from venue::api at accrual time (invariant #11). operator::api (#73): the ledger read asserts
    // per-venue ownership (invariant #13). Deny-by-default: three providers, each granted per
    // surface at least privilege (issue #95) — events+vocabulary from booking, api+vocabulary
    // from venue and operator.
    allowedDependencies = { "booking::events", "booking::vocabulary", "venue::api", "venue::vocabulary", "operator::api", "operator::vocabulary" }
)
package ai.riviera.platform.payout;
