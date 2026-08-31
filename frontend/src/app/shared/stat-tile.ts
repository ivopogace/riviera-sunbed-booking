import { Component, input } from '@angular/core';

import { CardGlass } from './card-glass';

/**
 * One glass KPI tile: an uppercase label, a large projected value, and an optional sub-caption —
 * the shape both console stat strips draw (the operator's strip and the admin console's strip).
 *
 * <p><strong>Why it lives in `shared/`.</strong> It is pure presentation with no HTTP and no state,
 * and two features now need it; `admin/` may not import `operator/`, so the alternative was a
 * fourth near-identical copy of the same four Tailwind lines. Promoting it is the frontend
 * structure rule, not a convenience.
 *
 * <p><strong>The value is projected, the sub-caption is an input.</strong> A value is sometimes
 * composite — the operator's "Free today" tile renders `{free}` with a smaller `/ {total}` beside
 * it — so it has to be markup the caller owns. A sub-caption is always a single string, and making
 * it an input is what lets the tile omit the element entirely rather than render an empty styled
 * span: `sub` left `undefined` means there is nothing to say, which is not the same as saying
 * nothing.
 *
 * <p><strong>A second projection slot for the sub-caption would be wrong, not merely heavier.</strong>
 * Angular's content-projection guide forbids putting an `<ng-content>` under `@if`/`@for`/`@switch`,
 * because it "always instantiates and creates DOM nodes for content rendered to a `<ng-content>`
 * placeholder, even if that `<ng-content>` placeholder is hidden"
 * (angular.dev/guide/components/content-projection — <em>Caveats</em>). A projected sub-caption
 * behind the `@if` below would still build its nodes, so the omit-rather-than-empty contract above
 * would quietly be false. The string input is what makes that contract real — keep it an input.
 * The value's own `<ng-content>` is unconditional, which is why it is allowed to stay projected.
 *
 * <p><strong>The host is `display: contents` on purpose.</strong> Every strip lays its tiles out as
 * a CSS grid, so the grid item has to be the `<article>` itself; a laid-out host element between
 * them would swallow the grid placement. The host carries no semantics to lose by collapsing.
 *
 * <p>The glass surface comes from {@link CardGlass}, so the recipe stays shared at the directive
 * layer rather than copied — and the radius stays on the article, off the surface directive,
 * because competing `border-radius` utilities resolve by stylesheet order.
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
