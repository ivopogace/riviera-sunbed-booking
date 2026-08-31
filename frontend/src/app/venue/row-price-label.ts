import { formatMoneyRange } from '../shared/money';
import { tierLabel } from '../shared/set-label';
import { SetView } from '../shared/venue-views';

/** The separator between the price and its qualifier — the venue's own labels compose with it too. */
const SEPARATOR = '·';

/** What a walk-in zone's chip says instead of a row name: you cannot book this one online. */
const WALK_IN_QUALIFIER = 'at venue';

/**
 * The one qualifier a zone's chip carries — only ever a fact the venue's own row label cannot
 * state. The rail chip beside the price renders the stored `rowLabel` verbatim (#724: the one
 * per-venue row identity, since #723/#726 authored freely by the operator), so echoing any of
 * the label's words here would restate the rail — the same redundancy #702 dropped bare codes
 * for, just mirrored. What remains is resolved by priority, the first claimed **truthfully of
 * every set in the row** winning:
 *
 * <ol>
 * <li><b>the channel</b> — an all-walk-in row is "at venue"; "you cannot book this online"
 * (invariant #3) is the fact a tourist must not miss, so it outranks everything;</li>
 * <li><b>the tier</b> — an all-premium row is named by its tier, from the same
 * {@link tierLabel} the map card's legend uses for those tiles;</li>
 * <li><b>nothing</b> — a standard online row keeps the bare price it has always rendered.</li>
 * </ol>
 *
 * A row that mixes pools or tiers claims neither: the qualifier is a promise about the whole row.
 */
function qualifierOf(sets: readonly SetView[]): string | null {
  if (sets.every((s) => s.pool === 'WALK_IN')) {
    return WALK_IN_QUALIFIER;
  }
  return sets.every((s) => s.tier === 'PREMIUM') ? tierLabel('PREMIUM') : null;
}

/**
 * The tourist map's price chip for one row: what the price buys beyond what the row's own rail
 * chip already says (#702, narrowed by #724) — `€45 · Front row`, `€25 · at venue`, or the bare
 * `€35` when channel and tier add nothing. The price half is unchanged from #689 (the one
 * amount, or the min–max span when the row's sets differ), and the qualifier composes onto it;
 * {@link qualifierOf} owns which one.
 *
 * <p>Pure, so it is unit-tested directly. The map renders one chip per **zone**, where a zone is
 * a run of rows whose chip label matches — so a walk-in row priced like the online row above it
 * opens a zone of its own, which is the point: same price, different channel. Two same-price
 * standard rows now zone together whatever their names say — the rail tells them apart.
 *
 * <p>The sets must be one row's own (non-empty, sharing a `rowLabel`), as `VenueMap.rows`
 * groups them.
 */
export function rowPriceLabel(sets: readonly SetView[]): string {
  const price = formatMoneyRange(sets.map((s) => s.price));
  const qualifier = qualifierOf(sets);
  return qualifier === null ? price : `${price} ${SEPARATOR} ${qualifier}`;
}
