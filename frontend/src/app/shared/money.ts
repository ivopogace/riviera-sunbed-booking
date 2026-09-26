/**
 * An amount of money as it travels the wire: integer minor units + ISO currency code
 * (invariant #5 — never floating point). The platform's money vocabulary lives here, in the
 * one home of the euros↔minor boundary, beside its renderer and parser.
 */
export interface MoneyView {
  readonly minorUnits: number;
  readonly currency: string;
}

/**
 * Render integer minor units as a currency string (display only, invariant #5). Pinned to `en-IE`
 * so output is deterministic across environments (a runtime-default locale renders "45 €" under
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
 * Render amounts as one label: exactly {@link formatMoney} when every amount is equal, else the
 * min–max span ("€35–€45"). Bounds are chosen by integer minor units (invariant #5), each rendered
 * in its own currency. The list must not be empty.
 */
export function formatMoneyRange(amounts: readonly MoneyView[]): string {
  let min = amounts[0];
  let max = amounts[0];
  for (const amount of amounts) {
    min = amount.minorUnits < min.minorUnits ? amount : min;
    max = amount.minorUnits > max.minorUnits ? amount : max;
  }
  return min.minorUnits === max.minorUnits
    ? formatMoney(min)
    : `${formatMoney(min)}–${formatMoney(max)}`;
}

/**
 * Parse a euros input to integer minor units (invariant #5), or `null` when empty or not a number.
 * The caller MUST treat `null` as "no change", never €0: a cleared field must not reprice to free.
 * Negatives clamp to 0. The single euros↔minor boundary; new price inputs reuse its rounding.
 */
export function eurosToMinorUnits(raw: string): number | null {
  const euros = Number.parseFloat(raw);
  return Number.isFinite(euros) ? Math.max(0, Math.round(euros * 100)) : null;
}

/** Integer minor units as a plain euros string for a number input (3500 → "35", 4250 → "42.5"). */
export function minorUnitsToEuros(minorUnits: number): string {
  return (minorUnits / 100).toString();
}
