import { formatMoneyRange } from '../shared/money';
import { tierLabel } from '../shared/set-label';
import { SetView } from '../shared/venue-views';

/**
 * A label segment that only restates where the row sits — a bare code (`A`, `AA`, matching
 * {@link rowCode}'s own shape) or an ordinal (`4`, `Row 4`, `Row 12`). Those words say nothing the
 * left rail's row chip does not already say, so the chip skips them. Deliberately narrow: it
 * matches one or two letters, never three, so real short words (`VIP`, `Bar`, `Spa`) always survive.
 */
const POSITIONAL_SEGMENT = /^(row\s+)?([a-z]{1,2}|\d{1,3})$/i;

/** The separator the venue's own row labels compose with ("Front row · Sea view"), and the chip's. */
const SEPARATOR = '·';

/** What a walk-in zone's chip says instead of a row name: you cannot book this one online. */
const WALK_IN_QUALIFIER = 'at venue';

/**
 * The one qualifier a zone's chip carries, resolved by priority — the first that can be claimed
 * **truthfully of every set in the row** wins:
 *
 * <ol>
 * <li><b>the channel</b> — an all-walk-in row is "at venue"; "you cannot book this online"
 * (invariant #3) is the fact a tourist must not miss, so it outranks the venue's own words;</li>
 * <li><b>the venue's own words</b> — the first segment of its row label that is not merely
 * positional ("Front row · Sea view" → "Front row", "Row 4 · Back" → "Back");</li>
 * <li><b>the tier</b> — an all-premium row with nothing but a position for a label (`A`, `Row 1`:
 * what the operator layout editor writes for every venue created in-product) is named by its
 * tier, from the same {@link tierLabel} the operator surfaces use;</li>
 * <li><b>nothing</b> — a standard row with no words of its own keeps the bare price it has
 * always rendered.</li>
 * </ol>
 *
 * A row that mixes pools or tiers claims neither: the qualifier is a promise about the whole row.
 */
function qualifierOf(sets: readonly SetView[]): string | null {
  if (sets.every((s) => s.pool === 'WALK_IN')) {
    return WALK_IN_QUALIFIER;
  }
  const named = sets[0].rowLabel
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .find((segment) => segment.length > 0 && !POSITIONAL_SEGMENT.test(segment));
  if (named !== undefined) {
    return named;
  }
  return sets.every((s) => s.tier === 'PREMIUM') ? tierLabel('PREMIUM') : null;
}

/**
 * The tourist map's rail chip for one row: what the price buys, not just what it costs (#702) —
 * `€45 · Front row`, `€30 · Back`, `€25 · at venue`, or the bare `€35` when the row has no meaning
 * to add. The price half is unchanged from #689 (the one amount, or the min–max span when the
 * row's sets differ), and the qualifier composes onto it; {@link qualifierOf} owns which one.
 *
 * <p>Pure, so it is unit-tested directly. The map renders one chip per **zone**, where a zone is a
 * run of rows whose chip label matches — so a walk-in row priced like the online row above it now
 * opens a zone of its own, which is the point: same price, different channel.
 *
 * <p>The sets must be one row's own (non-empty, sharing a `rowLabel`), as `VenueMap.rows` groups them.
 */
export function rowPriceLabel(sets: readonly SetView[]): string {
  const price = formatMoneyRange(sets.map((s) => s.price));
  const qualifier = qualifierOf(sets);
  return qualifier === null ? price : `${price} ${SEPARATOR} ${qualifier}`;
}
