import { Component, computed, input } from '@angular/core';
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
 * on an opaque panel was the design's templated tell, and on an opaque panel a hairline reads,
 * which is why the phone keeps its cards over tinted glass.
 *
 * <p>The facts line carries the **review count**, which only this surface has room for: a 4.6 from
 * 3 reviews is not a 4.6 from 300, and the phone's card fills that space with the distance chip.
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

  protected readonly cover = computed(() => this.card().photos[0] ?? null);
  protected readonly srcset = computed(() => {
    const cover = this.cover();
    return cover ? photoSrcset(cover) : null;
  });
  /** What the expanded row adds; absent for a default-mode venue with no amenities to show. */
  protected readonly hasChips = computed(
    () => !this.card().instantBook || this.card().amenities.length > 0,
  );
}
