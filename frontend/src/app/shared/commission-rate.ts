/**
 * The commission rate's percent↔basis-points boundary — the platform's cut of a booking, stored as
 * whole basis points so the split stays exact-integer arithmetic (invariant #5). A rate is not money,
 * so it lives beside `money.ts` rather than inside it: they share a divisor, not a concept.
 *
 * <p>Basis points are the contract everywhere — `venue_commission_bps_check`, `NewVenueCommand`, and
 * A7's admin write all speak bps, and 1500 means 15.00%. Percent is a **rendering**, and the one
 * place it travels the other way (an editor) must show the exact integer it will store, which is why
 * {@link commissionPercentToBps} returns that integer rather than writing it anywhere itself.
 */

/** The stored basis points as the percentage a human reads: 1500 → "15%", 1550 → "15.5%". */
export function formatCommissionPercent(bps: number): string {
  return `${bps / 100}%`;
}

/** Basis points as the plain percent string a number input starts from (1500 → "15", 1550 → "15.5"). */
export function commissionBpsToPercentInput(bps: number): string {
  return (bps / 100).toString();
}

/**
 * Parse a typed percentage to the exact basis points that would be stored, or `null` when the input
 * is blank, not a number, or outside 0..100 — never a coerced `0`, which would read a cleared field
 * as "this venue is free".
 *
 * <p>Parsing is strict rather than prefix-tolerant (`'15abc'` is rejected, not read as 15): a rate is
 * a commercial term, and silently keeping the readable prefix of a typo is the wrong direction on a
 * field that sets what the platform charges.
 *
 * <p>The result is rounded to whole basis points, the storage grain — so a caller MUST render the
 * returned integer beside the field. That is the whole contract: rounding is allowed to happen, it is
 * not allowed to happen unseen, and the wire only ever carries the integer (invariant #5).
 */
export function commissionPercentToBps(raw: string): number | null {
  const trimmed = raw.trim();
  const percent = trimmed === '' ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  return Math.round(percent * 100);
}
