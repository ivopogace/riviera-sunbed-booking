import { Component, input } from '@angular/core';

import { CardGlass } from '../shared/card-glass';

/**
 * The sea-facing beach-grid frame — the porcelain glass card with the "▲ Facing the sea"
 * and "▼ Promenade · Entrance" orientation banners that make a grid of tiles read as a beach map.
 *
 * <p>Extracted as the shared chrome of the two operator-console grids (the rule of three): the
 * layout editor's paint grid and this slice's Daily view availability grid both project their
 * rows into it. The <strong>tiles differ by purpose</strong>
 * — the editor paints tier/pool/gap, the daily grid shows FREE / booked-online / walk-in availability —
 * so only the framing (card + banners + orientation) is shared here; each consumer owns its own tile
 * rendering and interaction, projected via {@code <ng-content>}. Always porcelain (inherited from the
 * console shell); glass via {@link CardGlass}. The ▲/▼ glyphs are {@code aria-hidden} — the banner text
 * carries the meaning.
 */
@Component({
  selector: 'app-beach-grid-frame',
  imports: [CardGlass],
  template: `
    <section
      appCardGlass
      class="overflow-hidden rounded-[24px] px-[18px] pb-4"
      [attr.data-testid]="testid()"
    >
      <p
        class="sea-banner -mx-[18px] mb-3.5 bg-[linear-gradient(180deg,#0a6e85,#0a5a6e)] px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-white"
      >
        <span aria-hidden="true">▲</span>&nbsp;&nbsp;Facing the sea
      </p>

      <ng-content />

      <p
        class="promenade -mx-[18px] mt-3 border-t border-dashed border-[#0c2a33]/25 px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-(--riv-card-ink)"
      >
        <span aria-hidden="true">▼</span>&nbsp;&nbsp;Promenade · Entrance
      </p>
    </section>
  `,
})
export class BeachGridFrame {
  /** The section's `data-testid` (defaults to `beach-grid`), so a host can scope its own grid queries. */
  readonly testid = input<string>('beach-grid');
}
