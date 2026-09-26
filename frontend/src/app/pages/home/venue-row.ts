import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AmenityChip } from '../../shared/amenity-chip';
import { photoSrcset } from '../../shared/photo-url';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { VenueCard } from './venue-card';
import { StarIcon } from '../../shared/star-icon';

/**
 * One desktop-panel venue: the phone sheet's card as a flat row, which IS the pin's preview. Its
 * hairline and track use the page ink, not the card family (a dark line on riviera's dark panel).
 * Dusk (invariant #4): desaturate, never fade (a fade drops the name under 3:1); the chip takes the
 * price's slot and carries the state beyond colour (WCAG 1.4.1). Every arm of a slot costs the
 * same height (92 px, 121 px selected), or the panel's rhythm tracks state. Only the selected row
 * expands (amenities; the mode only if not Instant Book), inside the anchor's outlined text column.
 */
@Component({
  selector: 'app-venue-row',
  imports: [AmenityChip, RouterLink, SemanticChip, SetsFree, StarIcon],
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
