import { Component, computed, input } from '@angular/core';

import { formatDayMonth } from './booking-date';
import { SemanticChip } from './semantic-chip';

/** The two boxes the chip is laid out in: the Discover card's photo band and the beach-map header. */
export type ClosedForSeasonChipVariant = 'card' | 'header';

const BOX: Record<ClosedForSeasonChipVariant, string> = {
  card: 'inline-flex items-center px-[11px] py-[5px] text-[11px] tracking-[0.03em]',
  header: 'inline-block px-3 py-[5px] text-[0.78rem]',
};

/**
 * The "Closed for season" badge — a platform claim about how booking will go, so it wears the
 * semantic-chip skin beside the mode chip on the Discover card and the beach-map header. Names the
 * reopen day when one is set ("· reopens 15 May"). The host drops out of layout; the call site picks
 * the box through `variant`, because the two surfaces already size their chips differently.
 */
@Component({
  selector: 'app-closed-for-season-chip',
  imports: [SemanticChip],
  host: { class: 'contents' },
  template: `<span appSemanticChip class="closed-for-season-chip {{ box() }}">{{ label() }}</span>`,
})
export class ClosedForSeasonChip {
  readonly reopensOn = input<string | null | undefined>(null);
  readonly variant = input<ClosedForSeasonChipVariant>('card');

  protected readonly box = computed(() => BOX[this.variant()]);
  protected readonly label = computed(() => {
    const day = this.reopensOn();
    return day ? `Closed for season · reopens ${formatDayMonth(day)}` : 'Closed for season';
  });
}
