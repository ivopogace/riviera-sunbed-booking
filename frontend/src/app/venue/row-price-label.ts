import { formatMoneyRange } from '../shared/money';
import { tierLabel } from '../shared/set-label';
import { SetView } from '../shared/venue-views';

/** Where a row sits on the map, as `VenueMap.rows` derives it: its rail code and its 1-based ordinal. */
export interface RowPosition {
  readonly code: string;
  readonly ordinal: number;
}

/** A label segment shaped like a row reference: a bare code/ordinal, or one word plus one. */
const ROW_REFERENCE = /^(?:\p{L}+\s+)?(\p{L}{1,2}|\d{1,3})$/u;

/** The separator the venue's own row labels compose with ("Front row · Sea view"), and the chip's. */
const SEPARATOR = '·';

/** What a walk-in zone's chip says instead of a row name: you cannot book this one online. */
const WALK_IN_QUALIFIER = 'at venue';

/**
 * Whether a label segment only restates where this row already says it is — `A` or `4` on their
 * own, or one word of any language plus one of those: `Row 4`, `Rreshti 4`, `Fila B`.
 *
 * <p>The test is against the row's ACTUAL position, never against a vocabulary of words meaning
 * "row": matching the leading word without checking what follows it would read `Cabana 5` as a
 * position and drop the venue's own name for the row — worse, on a premium row it would then be
 * renamed `Front row` by the tier fallback, which is wrong information rather than missing
 * information. So `Cabana 5` is positional on row 5 and a name everywhere else.
 */
function restatesPosition(segment: string, position: RowPosition): boolean {
  const reference = ROW_REFERENCE.exec(segment)?.[1];
  return (
    reference !== undefined &&
    (reference.toUpperCase() === position.code || reference === String(position.ordinal))
  );
}

/**
 * The one qualifier a zone's chip carries, resolved by priority — the first that can be claimed
 * **truthfully of every set in the row** wins:
 *
 * <ol>
 * <li><b>the channel</b> — an all-walk-in row is "at venue"; "you cannot book this online"
 * (invariant #3) is the fact a tourist must not miss, so it outranks the venue's own words;</li>
 * <li><b>the venue's own words</b> — the first segment of its row label that does not merely
 * restate the row's position ("Front row · Sea view" → "Front row", "Row 4 · Back" → "Back");</li>
 * <li><b>the tier</b> — an all-premium row whose label says only where it is (`A`, `Row 1`: what
 * the operator layout editor writes for every venue created in-product) is named by its tier,
 * from the same {@link tierLabel} the operator surfaces use;</li>
 * <li><b>nothing</b> — a standard row with no words of its own keeps the bare price it has
 * always rendered.</li>
 * </ol>
 *
 * A row that mixes pools or tiers claims neither: the qualifier is a promise about the whole row.
 */
function qualifierOf(sets: readonly SetView[], position: RowPosition): string | null {
  if (sets.every((s) => s.pool === 'WALK_IN')) {
    return WALK_IN_QUALIFIER;
  }
  const named = sets[0].rowLabel
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .find((segment) => segment.length > 0 && !restatesPosition(segment, position));
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
 * <p>The sets must be one row's own (non-empty, sharing a `rowLabel`), as `VenueMap.rows` groups
 * them, and `position` must be that row's own — it is what the label is read against.
 */
export function rowPriceLabel(sets: readonly SetView[], position: RowPosition): string {
  const price = formatMoneyRange(sets.map((s) => s.price));
  const qualifier = qualifierOf(sets, position);
  return qualifier === null ? price : `${price} ${SEPARATOR} ${qualifier}`;
}
