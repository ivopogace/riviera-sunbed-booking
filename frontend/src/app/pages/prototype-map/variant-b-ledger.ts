import { Component, input, output } from '@angular/core';

import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { MapSurface } from './map-surface';

/**
 * PROTOTYPE — Variant B, "Coastal ledger". Desktop-first #2: the map becomes an ORIENTATION
 * strip — a short, full-width panorama of the whole 230km coast, fence-framed rather than
 * pin-framed — and the real work happens in a dense sortable-feeling table below it. The map
 * answers "where am I on the coast"; the ledger answers "which venue". A row press eases the
 * strip's camera to that venue without leaving the row.
 */
@Component({
  selector: 'app-variant-b',
  imports: [MapSurface, TouchTarget],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-[1400px] px-6 py-8">
      <h1 class="mb-1 text-[28px] font-bold text-riv-ink">The Albanian riviera, coast to coast</h1>
      <p class="mb-4 text-[14px] text-riv-ink-soft">
        {{ venues().length }} venues, Velipojë to Ksamil · {{ date() }}
      </p>

      <app-map-surface
        class="mb-6 block h-[220px] w-full overflow-hidden rounded-[20px]"
        [pins]="pins()"
        [date]="date()"
        [selected]="selected()"
        (venueSelected)="venueSelected.emit($event)"
      />

      <table
        class="w-full border-separate border-spacing-y-1 text-[14px]"
        data-testid="variant-b-ledger"
      >
        <thead>
          <tr class="text-left text-[11px] tracking-[0.08em] text-riv-ink-soft uppercase">
            <th class="px-3 py-1"></th>
            <th class="px-3 py-1">Venue</th>
            <th class="px-3 py-1">Beach</th>
            <th class="px-3 py-1">From</th>
            <th class="px-3 py-1">Free today</th>
            <th class="px-3 py-1">Mode</th>
          </tr>
        </thead>
        <tbody>
          @for (card of venues(); track card.id) {
            <tr
              appCardGlass
              appTouchTarget
              class="cursor-pointer rounded-[14px] [&[data-selected]]:outline-[3px] [&[data-selected]]:outline-riv-accent-ink"
              [attr.data-selected]="String(card.id) === selected() ? '' : null"
              (click)="venueSelected.emit(String(card.id))"
            >
              <td class="rounded-l-[14px] px-3 py-2">
                <img
                  [src]="card.photos[0]?.url"
                  alt=""
                  class="h-10 w-14 rounded-[8px] object-cover"
                />
              </td>
              <td class="px-3 py-2 font-semibold text-riv-card-ink">{{ card.name }}</td>
              <td class="px-3 py-2 text-riv-card-ink-soft">{{ card.beachLabel }}</td>
              <td class="px-3 py-2 font-bold text-riv-accent-ink">
                {{ card.priceLabel ?? '—' }}
              </td>
              <td class="px-3 py-2 text-riv-card-ink-soft">{{ card.free }} / {{ card.total }}</td>
              <td class="rounded-r-[14px] px-3 py-2 text-riv-card-ink-soft">
                {{ card.modeLabel }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
})
export class VariantB {
  readonly venues = input.required<readonly VenueCard[]>();
  readonly pins = input.required<readonly VenuePin[]>();
  readonly date = input.required<string>();
  readonly selected = input<string | null>(null);
  readonly venueSelected = output<string | null>();

  protected readonly String = String;
}
