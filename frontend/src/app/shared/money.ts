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
