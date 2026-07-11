/**
 * Parse clean digits to a non-negative whole number, or `undefined` when the input isn't clean digits
 * ('4.5' / '12abc' / '' are rejected, NOT truncated). Shared by the operator surfaces that keep numeric
 * fields as strings and parse them on submit (the server re-validates ranges) — venue onboarding's
 * commission/price fields and the Venue tab's distance-to-water — so the digit-guard lives in one place
 * (callers apply their own lower bound, e.g. `> 0` for a positive distance).
 */
export function parseWholeNumber(raw: string): number | undefined {
  return /^\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : undefined;
}
