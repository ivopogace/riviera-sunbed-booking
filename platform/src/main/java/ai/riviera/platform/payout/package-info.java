/**
 * Payout bounded context — the venue payout ledger (booking amounts − commission)
 * and manual BKT batch reporting (invariant #9: a booking contributes exactly once;
 * refunds reverse it). Aggregate roots: {@code PayoutLedgerEntry}, {@code PayoutBatch}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Payout",
    // U5: payout reacts to booking::api's BookingConfirmed event and re-reads the commission rate
    // from venue::api at accrual time (invariant #11). Deny-by-default: these are the only two.
    allowedDependencies = { "booking::api", "venue::api" }
)
package ai.riviera.platform.payout;
