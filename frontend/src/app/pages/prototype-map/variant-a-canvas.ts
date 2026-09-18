import { Component, input, output } from '@angular/core';

import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { TouchTarget } from '../../shared/touch-target';
import { MapSurface } from './map-surface';

/**
 * PROTOTYPE — Variant A, "Map canvas". Desktop-first swing #1: the map is the ENTIRE page from
 * the first pixel — no hero, no headline, no split. A slim glass rail floats over its right edge
 * carrying the venue cards; a floating capsule top-centre carries the day and the live count. The
 * inversion from shipped (list-primary, map 42%) to map-primary, list-as-overlay.
 */
@Component({
  selector: 'app-variant-a',
  imports: [MapSurface, TouchTarget],
  host: { class: 'block' },
  template: `
    <section class="relative h-screen w-full overflow-hidden">
      <div class="absolute inset-0">
        <app-map-surface
          class="h-full w-full"
          [pins]="pins()"
          [date]="date()"
          [selected]="selected()"
          (venueSelected)="venueSelected.emit($event)"
        />
      </div>

      <div
        class="pointer-events-none absolute top-5 left-1/2 z-10 -translate-x-1/2 rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill px-6 py-3 text-center text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)]"
      >
        <p class="text-[13px] font-semibold tracking-[0.02em]">{{ dateLabel() }}</p>
        <p class="text-[11px] opacity-70">{{ venues().length }} venues on the riviera</p>
      </div>

      <aside
        class="absolute top-0 right-0 z-10 flex h-full w-[380px] flex-col gap-3 overflow-y-auto bg-[color-mix(in_srgb,var(--riv-header-glass)_92%,transparent)] p-4 pt-6 backdrop-blur-[22px]"
        data-testid="variant-a-rail"
      >
        @for (card of venues(); track card.id) {
          <button
            type="button"
            appCardGlass
            appTouchTarget
            class="flex touch-manipulation gap-3 rounded-[18px] p-2 text-left [&[data-selected]]:outline-[3px] [&[data-selected]]:outline-riv-accent-ink"
            [attr.data-selected]="card.id === selectedId() ? '' : null"
            (click)="venueSelected.emit(idOf(card))"
          >
            <img
              [src]="card.photos[0]?.url"
              alt=""
              class="h-16 w-20 shrink-0 rounded-[12px] object-cover"
            />
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="truncate text-[14px] font-bold text-riv-card-ink">{{ card.name }}</span>
              <span class="text-[12px] text-riv-card-ink-soft">{{ card.beachLabel }}</span>
              <span class="text-[12px] font-bold text-riv-accent-ink">{{
                card.priceLabel ? 'from ' + card.priceLabel : 'No sets yet'
              }}</span>
            </span>
          </button>
        }
      </aside>
    </section>
  `,
})
export class VariantA {
  readonly venues = input.required<readonly VenueCard[]>();
  readonly pins = input.required<readonly VenuePin[]>();
  readonly date = input.required<string>();
  readonly selected = input<string | null>(null);
  readonly venueSelected = output<string | null>();

  protected selectedId(): number | null {
    const id = this.selected();
    return id === null ? null : Number(id);
  }

  protected dateLabel(): string {
    return this.date();
  }

  protected idOf(card: VenueCard): string {
    return String(card.id);
  }
}
