import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { ClosedForSeasonChip } from '../../shared/closed-for-season-chip';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { SalesClosedChip } from '../../shared/sales-closed-chip';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { TouchTarget } from '../../shared/touch-target';
import { CrowdStack } from './pin-crowding';
import { VenueCard } from './venue-card';

/** The heading the dialog is named by; one preview is open at a time, so one id is enough. */
const HEADING_ID = 'venue-preview-heading';

/** Up to this many crowd members the stepper shows a dot per venue; beyond it, a `k / n` count. */
const MAX_DOTS = 6;

/** The stepper's two chevrons: 44 px hit boxes on the card's track pill, in the card ink. */
const CHEVRON_CLASSES =
  'inline-flex touch-manipulation items-center justify-center rounded-full pb-[2px] text-[22px] ' +
  'leading-none font-semibold text-riv-card-ink hover:text-riv-accent-ink';

/**
 * The riviera map's venue preview: the compact Liquid Glass card a pin opens, carrying the same
 * facts the list card carries — it is fed the very {@link VenueCard} the list renders, so the two
 * cannot disagree — and leading into the existing pick-your-set funnel at `/venues/:id`.
 *
 * <p>A non-modal `dialog` named by its heading: focus is moved in when it opens and handed back
 * to the pin when it closes, but the page behind it is never inert — the card list stays the
 * fully accessible path to every venue, the map included.
 *
 * <p>While the venue is one of a crowd the camera cannot separate, the card carries the crowd
 * stepper: `‹` dots `›` on the card's track pill, walking the same crowd in the same order the
 * place pill's press-again walks it, wrapping. The dialog stays mounted across a step — the page
 * swaps the card and the stack, never the element — so the pressed chevron keeps focus, and the
 * position is announced from a live region that lives as long as the card does
 * (`shared/load-announcer.ts` says why it is not inside the stepper's own branch).
 */
@Component({
  selector: 'app-venue-preview-card',
  imports: [
    RouterLink,
    CardGlass,
    PhotoScrim,
    PhotoSlideshow,
    ClosedForSeasonChip,
    SalesClosedChip,
    SemanticChip,
    SetsFree,
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

  /** The crowd this venue shares its spot with, or `null` for a venue on its own. */
  readonly stack = input<CrowdStack | null>(null);
  /** The neighbour at the same spot the tourist stepped to; the page opens its preview. */
  readonly stepped = output<string>();

  protected readonly headingId = HEADING_ID;
  protected readonly chevronClasses = CHEVRON_CLASSES;

  /** One dot per crowd member while the rail fits; past {@link MAX_DOTS}, none — the count shows. */
  protected readonly stackDots = computed<readonly number[]>(() => {
    const count = this.stack()?.count ?? 0;
    return count <= MAX_DOTS ? Array.from({ length: count }, (_unused, at) => at) : [];
  });

  /** The live region's sentence — `2 of 3 here, Folie Marine` — or nothing without a crowd. */
  protected readonly stackPosition = computed(() => {
    const stack = this.stack();
    return stack ? `${stack.index + 1} of ${stack.count} here, ${this.card().name}` : '';
  });

  /** The cover alone: a preview is one photo, never the card's whole crossfading stack. */
  readonly coverPhoto = computed(() => this.card().photos.slice(0, 1));
}
