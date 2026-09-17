import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { ClosedForSeasonChip } from '../../shared/closed-for-season-chip';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from './venue-card';
import { CrowdStack } from './prototype-1134/variant-named-cycle';

/** The heading the dialog is named by; one preview is open at a time, so one id is enough. */
const HEADING_ID = 'venue-preview-heading';

/**
 * The riviera map's venue preview: the compact Liquid Glass card a pin opens, carrying the same
 * facts the list card carries — it is fed the very {@link VenueCard} the list renders, so the two
 * cannot disagree — and leading into the existing pick-your-set funnel at `/venues/:id`.
 *
 * <p>A non-modal `dialog` named by its heading: focus is moved in when it opens and handed back
 * to the pin when it closes, but the page behind it is never inert — the card list stays the
 * fully accessible path to every venue, the map included.
 */
@Component({
  selector: 'app-venue-preview-card',
  imports: [
    RouterLink,
    CardGlass,
    PhotoScrim,
    PhotoSlideshow,
    ClosedForSeasonChip,
    SemanticChip,
    TouchTarget,
  ],
  host: {
    class:
      'block overflow-hidden rounded-[22px] shadow-[0_16px_44px_rgba(7,42,58,0.32),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7] motion-safe:transition-opacity motion-safe:starting:opacity-0',
    role: 'dialog',
    tabindex: '-1',
    '[attr.aria-labelledby]': 'headingId',
    'data-testid': 'venue-preview',
  },
  templateUrl: './venue-preview-card.html',
})
export class VenuePreviewCard {
  /** The card the list is already rendering for this venue — never a second view of it. */
  readonly card = input.required<VenueCard>();
  /** The chosen booking day, carried into the beach-map link so the funnel opens on it. */
  readonly date = input.required<string>();

  readonly closed = output<void>();

  /** PROTOTYPE, variant D: the crowd this venue shares its spot with, or `null` alone. */
  readonly stack = input<CrowdStack | null>(null);
  /** PROTOTYPE, variant D: the tourist stepped to this neighbour at the same spot. */
  readonly stepped = output<string>();

  /** PROTOTYPE, variant D: one dot per crowd member while the rail fits; past six, a count. */
  protected readonly stackDots = computed(() => {
    const count = this.stack()?.count ?? 0;
    return count <= 6 ? Array.from({ length: count }, (_unused, at) => at) : [];
  });

  protected readonly headingId = HEADING_ID;

  /** The cover alone: a preview is one photo, never the card's whole crossfading stack. */
  readonly coverPhoto = computed(() => this.card().photos.slice(0, 1));
}
