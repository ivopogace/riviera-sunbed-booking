import { Component, input, output, signal } from '@angular/core';

import { TouchTarget } from '../../shared/touch-target';
import { VenueCard } from '../home/venue-card';
import { VenuePin } from '../home/pin-crowding';
import { MapSurface } from './map-surface';

/**
 * PROTOTYPE — Variant D, "Pocket coast". The one MOBILE-FIRST variant: designed at 390×844 first,
 * then grown up. Phone: the map fills the screen; a glass rail is docked to the bottom third as a
 * horizontally snap-scrolling filmstrip, so the map AND at least one venue card are both on the
 * very first screen — no List/Map toggle, nothing to switch. A drag-handle button expands the
 * rail into a full vertical list (the second screen state) without ever hiding the map entirely.
 *
 * <p>Grown to desktop: the SAME rail becomes a left-docked vertical column (the map's one instance
 * just gets more room via `lg:flex-row-reverse`, never duplicated) — the map takes the majority of
 * a wide viewport instead of a phone's minority, because there is room to give it more without
 * losing the list.
 */
@Component({
  selector: 'app-variant-d',
  imports: [MapSurface, TouchTarget],
  host: { class: 'block' },
  template: `
    <section class="relative flex h-screen w-full flex-col overflow-hidden lg:flex-row-reverse">
      <div class="relative min-h-0 flex-1">
        <div class="absolute inset-0 lg:static lg:h-full lg:w-full">
          <app-map-surface
            class="h-full w-full"
            [pins]="pins()"
            [date]="date()"
            [selected]="selected()"
            (venueSelected)="venueSelected.emit($event)"
          />
        </div>
      </div>

      <aside
        class="absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[22px] border border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink transition-[height] duration-300 lg:static lg:h-full lg:w-[380px] lg:rounded-none"
        [class]="expanded() ? 'max-lg:h-[78%]' : 'max-lg:h-[38%]'"
        data-testid="variant-d-rail"
      >
        <button
          type="button"
          appTouchTarget
          class="mx-auto mt-1 flex h-8 w-16 shrink-0 touch-manipulation items-center justify-center lg:hidden"
          [attr.aria-expanded]="expanded()"
          data-testid="variant-d-expand"
          (click)="expanded.set(!expanded())"
        >
          <span class="block h-1.5 w-10 rounded-full bg-riv-solid-btn-ink/40"></span>
        </button>
        <p class="px-4 pb-2 text-[12px] opacity-70 lg:pt-4">
          {{ venues().length }} venues · {{ date() }}
        </p>
        <div
          class="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto"
          [class.flex-col]="expanded()"
          [class.overflow-y-auto]="expanded()"
        >
          @for (card of venues(); track card.id) {
            <button
              type="button"
              appTouchTarget
              class="flex w-[230px] shrink-0 touch-manipulation flex-col overflow-hidden rounded-[16px] bg-riv-solid-btn-hover text-left lg:w-auto lg:flex-row lg:gap-3 lg:bg-transparent lg:p-1 [&[data-selected]]:outline-[3px] [&[data-selected]]:outline-riv-solid-btn-ink"
              [attr.data-selected]="String(card.id) === selected() ? '' : null"
              (click)="venueSelected.emit(idOf(card))"
            >
              <img
                [src]="card.photos[0]?.url"
                alt=""
                class="h-24 w-full shrink-0 object-cover lg:h-14 lg:w-20 lg:rounded-[10px]"
              />
              <span class="flex min-w-0 flex-col gap-0.5 p-2 lg:p-0">
                <span class="truncate text-[13px] font-bold">{{ card.name }}</span>
                <span class="text-[11px] opacity-70">{{ card.beachLabel }}</span>
                <span class="text-[12px] font-bold">{{
                  card.priceLabel ? 'from ' + card.priceLabel : 'No sets yet'
                }}</span>
              </span>
            </button>
          }
        </div>
      </aside>
    </section>
  `,
})
export class VariantD {
  readonly venues = input.required<readonly VenueCard[]>();
  readonly pins = input.required<readonly VenuePin[]>();
  readonly date = input.required<string>();
  readonly selected = input<string | null>(null);
  readonly venueSelected = output<string | null>();

  protected readonly expanded = signal(false);
  protected readonly String = String;

  protected idOf(card: VenueCard): string {
    return String(card.id);
  }
}
