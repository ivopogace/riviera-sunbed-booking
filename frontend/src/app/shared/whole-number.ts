/**
 * Parse clean digits to a non-negative whole number, else `undefined` ('4.5' / '12abc' / '' are
 * rejected, NOT truncated). For operator fields kept as strings and parsed on submit; the server
 * re-validates ranges and callers apply their own lower bound (e.g. `> 0` for a distance).
 */
export function parseWholeNumber(raw: string): number | undefined {
  return /^\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : undefined;
}
