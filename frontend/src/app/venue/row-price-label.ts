import { formatMoneyRange } from '../shared/money';
import { tierLabel } from '../shared/set-label';
import { SetView } from '../shared/venue-views';

/** Where a row sits on the map, as `VenueMap.rows` derives it: its rail code and its 1-based ordinal. */
export interface RowPosition {
  readonly code: string;
  readonly ordinal: number;
}

/** A bare row reference — a code (`A`, `AA`) or an ordinal (`4`), with no words of its own. */
const BARE_REFERENCE = /^(\p{L}{1,2}|\d{1,3})$/u;

/** One word plus a row reference: `Row 4`, `Rreshti 4`, `Fila B` — and also `Cabana 5`. */
const NAMED_REFERENCE = /^\p{L}+\s+(\p{L}{1,2}|\d{1,3})$/u;

/** The separator the venue's own row labels compose with ("Front row · Sea view"), and the chip's. */
const SEPARATOR = '·';

/** What a walk-in zone's chip says instead of a row name: you cannot book this one online. */
const WALK_IN_QUALIFIER = 'at venue';

/**
 * Whether a label segment says nothing the row's own rail chip does not already say.
 *
 * <p>Two shapes, judged differently, because they differ in what dropping them costs:
 *
 * <ul>
 * <li>A <b>bare</b> code or ordinal (`A`, `AA`, `4`) has no words to lose, so it goes whatever
 * the row's position is. It need not match: the map derives its rail codes from insertion order,
 * while the venue's labels come from grid rows — a walkway row saves no sets, so the venue's `C`
 * can legitimately land on rail `B`, and `€35 · C` beside a chip reading `B` helps nobody.</li>
 * <li>One <b>word plus</b> a code or ordinal (`Row 4`, `Rreshti 4`, `Fila B`) goes only when that
 * reference is this row's own. The word is matched, never named — hard-coding `row` would read
 * only the English half of an Albanian-riviera venue's labels — but a word carries meaning, so
 * `Cabana 5` is a restatement on row 5 and the venue's name for the row everywhere else.</li>
 * </ul>
 */
function restatesPosition(segment: string, position: RowPosition): boolean {
  if (BARE_REFERENCE.test(segment)) {
    return true;
  }
  const reference = NAMED_REFERENCE.exec(segment)?.[1];
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
 * from the same {@link tierLabel} the map card's own legend uses for those tiles. Whatever row it
 * sits on: the name is the tier's, not a claim about the map, and gating it on the first row would
 * make two identically-priced premium rows read differently and split into two zones;</li>
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
