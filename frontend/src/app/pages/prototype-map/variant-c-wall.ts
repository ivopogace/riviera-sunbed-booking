import { Component, input, output } from '@angular/core';

import { REGION_CATALOGUE } from '../../shared/beaches';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { MapSurface } from './map-surface';

/** How wide the panorama renders per degree of the fence's 2.2° span — a deliberately huge wall. */
const WALL_WIDTH_PX = 4400;

/**
 * PROTOTYPE — Variant C, "The wall map". Desktop-first swing #3 — the one meant to feel unlike a
 * typical map-search product. There is no list, no table, not even a scroll-synced rail: the page
 * IS one giant panoramic chart of the coast, the length of the coastline itself rather than the
 * shape of a viewport, and every venue lives at its real spot on it. Navigation is entirely
 * spatial — scroll the coast, not a result set — closer to a coastal atlas poster than search UI.
 * The region names along the top are the only wayfinding device, each a plain in-page anchor.
 */
@Component({
  selector: 'app-variant-c',
  imports: [MapSurface],
  host: { class: 'block' },
  template: `
    <section class="flex h-screen w-full flex-col overflow-hidden">
      <header
        class="z-10 flex items-center justify-between border-b border-riv-card-border bg-riv-card-glass px-6 py-3"
      >
        <h1 class="text-[16px] font-bold text-riv-card-ink">The riviera, unrolled</h1>
        <p class="text-[12px] text-riv-card-ink-soft">Scroll to travel the coast · {{ date() }}</p>
      </header>
      <div
        class="relative flex-1 overflow-x-auto overflow-y-hidden"
        data-testid="variant-c-scroller"
      >
        <div class="relative h-full" [style.width.px]="wallWidth">
          <div class="absolute inset-0">
            <app-map-surface
              class="h-full w-full"
              [pins]="pins()"
              [date]="date()"
              [selected]="selected()"
              (venueSelected)="venueSelected.emit($event)"
            />
          </div>
          <div class="pointer-events-none absolute inset-x-0 top-3 flex justify-between px-8">
            @for (region of regions; track region.code) {
              <span
                class="rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-3 py-1 text-[11px] font-semibold tracking-[0.05em] text-riv-solid-btn-ink uppercase"
                >{{ region.label }}</span
              >
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class VariantC {
  readonly venues = input.required<readonly VenueCard[]>();
  readonly pins = input.required<readonly VenuePin[]>();
  readonly date = input.required<string>();
  readonly selected = input<string | null>(null);
  readonly venueSelected = output<string | null>();

  protected readonly wallWidth = WALL_WIDTH_PX;
  protected readonly regions = REGION_CATALOGUE;
}
