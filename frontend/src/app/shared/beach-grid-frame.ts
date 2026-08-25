import { Component, input } from '@angular/core';

import { CardGlass } from './card-glass';

/**
 * The sea-facing beach-grid frame — the glass card with the "▲ Facing the sea"
 * and "▼ Promenade · Entrance" orientation banners that make a grid of tiles read as a beach map.
 *
 * <p>The shared chrome of every beach-map surface — the tourist map, the operator layout
 * editor, the Daily view and the per-set editor, all via {@link BeachMapCanvas}.
 * The <strong>tiles differ by purpose</strong> — booking, painting, availability
 * marking, selection — so only the framing (card + banners + orientation) is shared here; each
 * consumer owns its own tile rendering and interaction, projected via {@code <ng-content>}.
 * Theme-agnostic glass via {@link CardGlass}, elevated with the restyle's blur + drop shadow so
 * the card reads as a card on the bare page gradient (not only on the console shell); the banner
 * gradient is the restyle's sea teal. The ▲/▼ glyphs are {@code aria-hidden} — the banner text
 * carries the meaning.
 */
@Component({
  selector: 'app-beach-grid-frame',
  imports: [CardGlass],
  template: `
    <section
      appCardGlass
      class="overflow-hidden rounded-[28px] px-[18px] pb-4 backdrop-blur-[26px] backdrop-saturate-[1.7] shadow-[0_14px_44px_rgba(7,42,58,0.28),inset_0_1px_0_rgba(255,255,255,0.8)]"
      [attr.data-testid]="testid()"
      [attr.aria-label]="label() || null"
    >
      <p
        class="sea-banner -mx-[18px] mb-3.5 bg-[linear-gradient(180deg,#0e7a89,#0c6675)] px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-white"
      >
        <span aria-hidden="true">▲</span>&nbsp;&nbsp;Facing the sea
      </p>

      <ng-content />

      <p
        class="promenade -mx-[18px] mt-3 border-t border-dashed border-(--riv-map-frame-border) px-3 py-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-(--riv-card-ink)"
      >
        <span aria-hidden="true">▼</span>&nbsp;&nbsp;Promenade · Entrance
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
