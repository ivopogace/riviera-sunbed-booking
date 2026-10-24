import { formatMoneyRange } from '../shared/money';
import { SetView } from '../shared/venue-views';

/**
 * One row's price chip (its non-empty sets, as `VenueMap.rows` groups them): the amount or min–max
 * span alone — `€45`, `€35–€45` (#1587).
 */
export function rowPriceLabel(sets: readonly SetView[]): string {
  return formatMoneyRange(sets.map((s) => s.price));
}

/**
 * What the map zones rows by: the chip's price plus whether every set is walk-in (invariant #3).
 * A walk-in row priced like the online row above opens its own zone (#702); a row mixing pools
 * zones with the online rows. A tier change opens no zone (#1625).
 */
export function rowZoneKey(sets: readonly SetView[]): string {
  const walkIn = sets.every((s) => s.pool === 'WALK_IN');
  return `${rowPriceLabel(sets)}|${walkIn ? 'walk-in' : 'online'}`;
}
