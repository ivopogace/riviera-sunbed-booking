import { Component } from '@angular/core';

/**
 * The fill a call site binds on a star that counts: `[class]="filled ? STAR_FILL : null"`. CSS
 * `fill` outranks the svg's `fill="none"` attribute, so the same outline becomes the filled star.
 */
export const STAR_FILL = '[&_svg]:fill-current';

/**
 * The rating star — the one geometry behind the rating radiogroup (`star-rating.ts`), every
 * read-only row (`star-row.ts`) and each static rating mark beside a venue's score. Otherwise
 * zero API surface — `shared/clock-icon.ts` explains the shape.
 *
 * An outline with no `filled` input (ICON-2): a star counts when its call site binds
 * {@link STAR_FILL}, so filled and hollow are one path, never two font-dependent codepoints —
 * the radiogroup's WCAG 1.4.1 claim (selection by shape, not colour alone) rests on that.
 */
@Component({
  selector: 'app-star-icon',
  host: { 'aria-hidden': 'true', class: 'contents' },
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  >
    <path
      d="m12 3 2.75 5.6 6.15.9-4.45 4.35 1.05 6.15L12 17.1 6.5 20l1.05-6.15L3.1 9.5l6.15-.9L12 3Z"
    />
  </svg>`,
})
export class StarIcon {}
