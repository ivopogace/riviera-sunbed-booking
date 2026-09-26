import { Component, input } from '@angular/core';

import { CardGlass } from './card-glass';

/**
 * One glass KPI tile (label, projected value, optional `sub` caption) for both console stat strips.
 * Keep `sub` an input, never a second `<ng-content>`: projected content under `@if` still builds
 * its nodes (angular.dev content-projection caveats), and an `undefined` `sub` must omit the
 * element. The host is `display: contents` so the `<article>` is the strip's grid item; the radius
 * stays on the article, off {@link CardGlass}, because competing `border-radius` utilities resolve
 * by stylesheet order.
 */
@Component({
  selector: 'app-stat-tile',
  imports: [CardGlass],
  host: { class: 'contents' },
  template: `
    <article
      appCardGlass
      class="riv-stat flex flex-col gap-0.5 rounded-[16px] px-3.5 py-3 shadow-[0_1px_2px_rgba(7,42,58,0.06)]"
    >
      <span
        class="riv-stat-label text-[11px] font-bold uppercase tracking-[0.1em] text-riv-card-ink-faint"
        >{{ label() }}</span
      >
      <div
        class="riv-stat-value text-[27px] font-bold text-riv-card-ink"
        [attr.data-testid]="valueTestId()"
      >
        <ng-content />
      </div>
      @if (sub(); as caption) {
        <span
          class="riv-stat-sub text-[11.5px] text-riv-card-ink-soft"
          [attr.data-testid]="subTestId()"
          >{{ caption }}</span
        >
      }
    </article>
  `,
})
export class StatTile {
  /** What the number is, in the strip's uppercase label voice ("Suspended", "Free today"). */
  readonly label = input.required<string>();
  /** Test id for the value element — the hook specs and e2e read the rendered number through. */
  readonly valueTestId = input.required<string>();
  /** The line under the value, or `undefined` to render no sub-caption element at all. */
  readonly sub = input<string | undefined>(undefined);
  /** Test id for the sub-caption, when there is one. */
  readonly subTestId = input<string | undefined>(undefined);
}
