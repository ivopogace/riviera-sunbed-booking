import { Component, input } from '@angular/core';

import { CardGlass } from './card-glass';
import { TriangleIcon } from './triangle-icon';

/**
 * The sea-facing beach-grid frame: the glass card with the "Facing the sea" and "Promenade ·
 * Entrance" banners that make a grid of tiles read as a beach map, shared by every beach-map
 * surface via `BeachMapCanvas`. Tiles differ by purpose, so each consumer owns its tile
 * rendering and interaction, projected via {@code <ng-content>}. Theme-agnostic {@link CardGlass}
 * with blur + drop shadow so the card reads on the bare page gradient, not only the console shell.
 * Banner triangles ({@link TriangleIcon}) are {@code aria-hidden}; the text carries the meaning.
 */
@Component({
  selector: 'app-beach-grid-frame',
  imports: [CardGlass, TriangleIcon],
  template: `
    <section
      appCardGlass
      class="overflow-hidden rounded-[28px] px-[18px] pb-4 backdrop-blur-[26px] backdrop-saturate-[1.7] shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)]"
      [attr.data-testid]="testid()"
      [attr.aria-label]="label() || null"
    >
      <p
        class="sea-banner -mx-[18px] mb-3.5 flex items-center justify-center gap-2 bg-(image:--riv-sea-grad) px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-white"
      >
        <app-triangle-icon class="[&_svg]:size-[9px]" />Facing the sea
      </p>

      <ng-content />

      <p
        class="promenade -mx-[18px] mt-3 flex items-center justify-center gap-2 border-t border-dashed border-riv-map-frame-border px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-riv-card-ink"
      >
        <app-triangle-icon class="[&_svg]:size-[9px] [&_svg]:rotate-180" />Promenade · Entrance
      </p>
    </section>
  `,
})
export class BeachGridFrame {
  /** The section's `data-testid` (defaults to `beach-grid`), so a host can scope its own grid queries. */
  readonly testid = input<string>('beach-grid');
  /** Optional accessible name for the section (e.g. "Beach map — Miramar"); empty renders none. */
  readonly label = input<string>('');
}
