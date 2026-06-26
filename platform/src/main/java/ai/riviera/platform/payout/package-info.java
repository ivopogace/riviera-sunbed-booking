/**
 * Payout bounded context — the venue payout ledger (booking amounts − commission)
 * and manual BKT batch reporting (invariant #9: a booking contributes exactly once;
 * refunds reverse it). Aggregate roots: {@code PayoutLedgerEntry}, {@code PayoutBatch}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Payout")
package ai.riviera.platform.payout;
