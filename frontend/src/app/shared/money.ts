import { MoneyView } from '../venue/venue.model';

/**
 * Render integer minor units as a localized currency string (display only — money is never stored
 * or computed as a float, invariant #5). Pinned to a fixed Eurozone-English locale so output is
 * deterministic across deploy environments (a runtime-default locale would render "45 €" under
 * de/fr). Whole amounts drop the cents; fractional amounts show two decimals.
 */
export function formatMoney(amount: MoneyView): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: amount.currency,
    minimumFractionDigits: amount.minorUnits % 100 === 0 ? 0 : 2,
  }).format(amount.minorUnits / 100);
}

/**
 * Parse a euros input string to integer minor units (invariant #5 — the conversion at the edge), or
 * `null` when the input is empty or not a number. The caller MUST treat `null` as "no change", never
 * as €0 — a cleared field must not silently reprice to free. Negatives clamp to 0. This is the single
 * home for the euros↔minor boundary; new price inputs reuse it rather than re-deriving the rounding.
 */
export function eurosToMinorUnits(raw: string): number | null {
  const euros = Number.parseFloat(raw);
  return Number.isFinite(euros) ? Math.max(0, Math.round(euros * 100)) : null;
}

/** Integer minor units as a plain euros string for a number input (3500 → "35", 4250 → "42.5"). */
export function minorUnitsToEuros(minorUnits: number): string {
  return (minorUnits / 100).toString();
}
