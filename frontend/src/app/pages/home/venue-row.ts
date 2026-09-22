import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { photoSrcset } from '../../shared/photo-url';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { VenueCard } from './venue-card';

/**
 * One venue on the **desktop panel** — the flat list entry the panel renders where the phone's
 * sheet renders a card. Same record, same job (the row IS the pin's preview), different form: a
 * 72 px thumbnail, the name and price on one line, one facts line, a 72 px availability bar beside
 * its own number, and a hairline under it. No card edge, no shadow: three nested rounded surfaces
 * — page, panel, card — was the design's templated tell. The hairline and the track follow the
 * page ink rather than the card family, which riviera does not redeclare and which would leave a
 * dark line on its dark panel.
 *
 * <p>The facts line carries the **review count**, which only this surface has room for: a 4.6 from
 * 3 reviews is not a 4.6 from 300, and the phone's card fills that space with the distance chip.
 *
 * <p>A venue whose sales for the chosen day have closed (invariant #4) keeps its row but wears
 * **dusk**, as its card does on the sheet and its pin does on the map: desaturated, never faded —
 * a faded row put its name under 3:1 in every theme — and the **price gives way** to the fact that
 * outranks it. The price's own slot is what carries the chip, which is why dusk costs the row no
 * height and the panel's geometry proofs still measure 92 px at rest and 121 px selected. That
 * only holds because the name line HOLDS the price's 24 px box: the chip's own is 20.5 px, so
 * without the floor a selected closed row came out 3 px short and the panel jittered as the
 * selection moved between a closed venue and a selling one. Colour alone would leave the state
 * invisible to a tourist who cannot see it (WCAG 1.4.1), and text alone is what the panel had.
 *
 * <p>The **selected** row is the only one that expands, to its amenity chips and its booking mode,
 * and only when that mode is not the default — `Instant Book` on twenty rows of twenty-six is
 * noise, while `Request to Book` is the fact a tourist needs. If a venue population is ever mostly
 * request-mode the rule inverts: it is the exception that gets named, not one particular value.
 * The chips live inside the anchor's own text column, so the selected row's outline contains them.
 */
@Component({
  selector: 'app-venue-row',
  imports: [AmenityChip, RouterLink, SemanticChip, SetsFree],
  host: { class: 'contents' },
  templateUrl: './venue-row.html',
})
export class VenueRow {
  readonly card = input.required<VenueCard>();
  /** This is the venue whose pin is open: the row lights, and it is the one row that expands. */
  readonly selected = input(false);
  /** The date the panel is showing, carried into the beach map the row links to. */
  readonly date = input('');
  /**
   * The pointer, or the keyboard, has come to this row or left it — the map answers by lighting
   * the venue's pin. Focus is in it for parity: a keyboard walking the list lights the same pins
   * a pointer would.
   */
  readonly pointed = output<boolean>();

  protected readonly cover = computed(() => this.card().photos[0] ?? null);
  protected readonly srcset = computed(() => {
    const cover = this.cover();
    return cover ? photoSrcset(cover) : null;
  });
  /**
   * The closed claim the price slot gives way to, or `null` while the venue still sells. Compressed
   * to fit a price's box beside a truncating name — the sheet card's `Sales closed for today` and
   * its reopen day do not fit a 420 px panel, and `card().ariaLabel` carries both in full anyway.
   */
  protected readonly closedLabel = computed(() => {
    const card = this.card();
    if (card.closedForSeason) {
      return 'Closed for season';
    }
    return card.salesClosed ? 'Closed today' : null;
  });
  /** What the expanded row adds; absent for a default-mode venue with no amenities to show. */
  protected readonly hasChips = computed(
    () => !this.card().instantBook || this.card().amenities.length > 0,
  );
}
