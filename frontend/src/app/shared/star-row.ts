import { Component, computed, input } from '@angular/core';

import { STAR_FILL, StarIcon } from './star-icon';

/**
 * A stored rating as five stars, filled up to it — the read-only echo on the venue's review list,
 * the admin review queue and a guest's own review. Decorative: the wrapper that places it is a
 * `role="img"` named by `starsOutOfFive`, so the row itself is `aria-hidden`. The wrapper sizes
 * the stars with `[&_svg]:size-[15px]` and sets their ink.
 */
@Component({
  selector: 'app-star-row',
  imports: [StarIcon],
  host: { 'aria-hidden': 'true', class: 'inline-flex items-center gap-[3px]' },
  template: `@for (filled of fills(); track $index) {
    <app-star-icon [class]="filled ? STAR_FILL : null" />
  }`,
})
export class StarRow {
  /** The rating, 1..5. */
  readonly stars = input.required<number>();

  protected readonly STAR_FILL = STAR_FILL;
  protected readonly fills = computed(() => [1, 2, 3, 4, 5].map((n) => n <= this.stars()));
}
