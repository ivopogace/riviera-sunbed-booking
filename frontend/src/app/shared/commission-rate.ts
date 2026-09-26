/**
 * The commission rate's percent↔basis-points boundary — the platform's cut of a booking, stored as
 * whole basis points so the split stays exact-integer arithmetic (invariant #5). A rate is not money,
 * so it lives beside `money.ts` rather than inside it: they share a divisor, not a concept.
 *
 * <p>Basis points are the contract everywhere (`venue_commission_bps_check`, the admin rate write;
 * 1500 = 15.00%). Percent is a **rendering**; an editor must show the exact integer it will store,
 * hence {@link commissionPercentToBps} returns it rather than writing it anywhere.
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
 * Parse a typed percentage to the bps stored; `null` if blank, non-numeric or outside 0..100, never
 * a coerced `0` (a cleared field read as free); strict: `'15abc'` is `null`. Rounded to whole bps,
 * so a caller MUST render the result beside the field. Rationale: RESPONSIBILITIES.md §Frontend.
 */
export function commissionPercentToBps(raw: string): number | null {
  const trimmed = raw.trim();
  const percent = trimmed === '' ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  return Math.round(percent * 100);
}
