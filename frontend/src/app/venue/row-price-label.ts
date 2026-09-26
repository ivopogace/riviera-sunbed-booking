import { formatMoneyRange } from '../shared/money';
import { tierLabel } from '../shared/set-label';
import { SetView } from '../shared/venue-views';

/** The separator between the price and its qualifier — the venue's own labels compose with it too. */
const SEPARATOR = '·';

/** What a walk-in zone's chip says instead of a row name: you cannot book this one online. */
const WALK_IN_QUALIFIER = 'at venue';

/**
 * A zone chip's one qualifier — never the row label's words, which the rail already shows. By
 * priority, true of **every** set: all walk-in → "at venue" (invariant #3; outranks all), else all
 * premium → the tier label, else none. A row mixing pools or tiers claims neither.
 */
function qualifierOf(sets: readonly SetView[]): string | null {
  if (sets.every((s) => s.pool === 'WALK_IN')) {
    return WALK_IN_QUALIFIER;
  }
  return sets.every((s) => s.tier === 'PREMIUM') ? tierLabel('PREMIUM') : null;
}

/**
 * One row's price chip (its non-empty sets, as `VenueMap.rows` groups them): the amount or min–max
 * span plus {@link qualifierOf}'s — `€45 · Front row`, `€25 · at venue`, bare `€35`. The map zones
 * rows by this label, so a walk-in row priced like the online row above opens its own zone.
 */
export function rowPriceLabel(sets: readonly SetView[]): string {
  const price = formatMoneyRange(sets.map((s) => s.price));
  const qualifier = qualifierOf(sets);
  return qualifier === null ? price : `${price} ${SEPARATOR} ${qualifier}`;
}
