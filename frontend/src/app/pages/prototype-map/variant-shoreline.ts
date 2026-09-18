/**
 * PROTOTYPE variant A — **Shoreline**. The baseline to beat: the expected two-pane split, but
 * with the three measured faults of the shipped page fixed.
 *
 *   - no 1080 px cap, so the map takes `clamp(520px, 44vw, 900px)` instead of 42% of 1080;
 *   - the hero shrinks to one band, so the map is above the fold on first paint;
 *   - each pane scrolls on its own, so the map never scrolls away.
 *
 * It claims nothing new about hierarchy: list and map are peers. Its argument is cost — it is
 * the smallest diff from what ships today.
 */
import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { SemanticChip } from '../../shared/semantic-chip';
import { AmenityChip } from '../../shared/amenity-chip';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { fitHandleToPins } from './prototype-camera';
import { PrototypeFilterBar } from './prototype-filter-bar';

@Component({
  selector: 'app-variant-shoreline',
  imports: [
    RouterLink,
    CardGlass,
    PhotoScrim,
    SemanticChip,
    AmenityChip,
    RivieraMap,
    VenuePinLayer,
    PrototypeFilterBar,
  ],
  host: { class: 'block' },
  template: `
    <!-- One viewport-high shell. The two panes scroll independently, so the map cannot scroll away
         and the list cannot drag it. 68px is the app header. -->
    <div
      class="grid h-[calc(100dvh-68px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_clamp(520px,44vw,900px)]"
    >
      <div class="min-w-0 overflow-y-auto scrollbar-thin px-6 pt-5 pb-16 lg:px-8">
        <!-- The hero, retired to one band: on desktop its job is orientation, not spectacle, and
             the 66px headline cost the map its place above the fold. -->
        <div class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 class="text-[26px] leading-[1.1] font-bold tracking-[-0.02em] text-riv-ink">
            Find your spot on the Riviera.
          </h1>
          <p class="text-[14.5px] text-riv-ink-soft">
            Pick a beach, then choose your sunbed from the venue’s own map.
          </p>
        </div>

        <app-prototype-filter-bar [state]="state()" (filtered)="filtered.emit($event)" />

        <ul class="mt-5 grid list-none grid-cols-[repeat(auto-fill,minmax(272px,1fr))] gap-4">
          @for (card of state().cards; track card.id) {
            <li
              class="group/card relative rounded-[24px]"
              [attr.data-selected]="selected() === card.id ? '' : null"
            >
              <a
                appCardGlass
                class="flex h-full flex-col overflow-hidden rounded-[24px] no-underline shadow-[0_10px_32px_rgba(7,42,58,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-[26px] backdrop-saturate-[1.7] motion-safe:[transition:transform_0.2s_ease,box-shadow_0.2s_ease] motion-safe:group-hover/card:[transform:translateY(-4px)] group-hover/card:shadow-riv-card-hover group-data-[selected]/card:outline-[3px] group-data-[selected]/card:outline-offset-[3px] group-data-[selected]/card:outline-riv-accent-ink"
                [routerLink]="['/venues', card.id]"
                [attr.aria-label]="card.ariaLabel"
                (mouseenter)="selected.set(card.id)"
              >
                <span class="relative block aspect-[3/2] bg-(image:--riv-photo-grad)">
                  <img
                    class="absolute inset-0 size-full object-cover"
                    [src]="card.photos[0].url"
                    alt=""
                  />
                  <span appPhotoScrim></span>
                  <span
                    appSemanticChip
                    class="absolute top-3 left-3 px-[11px] py-[5px] text-[11px]"
                  >
                    {{ card.modeLabel }}
                  </span>
                  <span
                    class="absolute bottom-3 left-4 text-[12.5px] leading-[15px] font-semibold text-riv-photo-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]"
                  >
                    {{ card.beachLabel }} · {{ card.regionLabel }}
                  </span>
                </span>
                <span class="flex flex-1 flex-col gap-2 px-[17px] pt-4 pb-[17px]">
                  <span
                    class="text-[20px] leading-[1.08] font-bold tracking-[-0.01em] text-riv-card-ink"
                  >
                    {{ card.name }}
                  </span>
                  <span class="flex items-center gap-[7px] text-[13px] text-riv-card-ink-soft">
                    @if (card.isRated) {
                      <span class="text-[#f4a939]" aria-hidden="true">★</span>
                      <span class="font-bold text-riv-card-ink">{{ card.rating }}</span>
                      <span class="opacity-30" aria-hidden="true">·</span>
                      {{ card.reviewsLabel }}
                    } @else {
                      <span appSemanticChip class="px-[9px] py-px">New</span>
                    }
                  </span>
                  <span class="flex flex-wrap gap-1.5">
                    @if (card.water) {
                      <span appAmenityChip water>{{ card.water }}</span>
                    }
                    @for (a of card.amenities.slice(0, 2); track a.code) {
                      <span appAmenityChip>{{ a.label }}</span>
                    }
                  </span>
                  <span class="mt-2 block h-1.5 overflow-hidden rounded-full bg-riv-card-track">
                    <span
                      class="block h-full bg-(image:--riv-bar-grad)"
                      [style.width.%]="card.freePercent"
                    ></span>
                  </span>
                  <span class="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                    <span class="text-[13.5px] text-riv-card-ink-soft">
                      from
                      <strong class="text-[16px] font-extrabold text-riv-accent-ink">{{
                        card.priceLabel
                      }}</strong>
                      / set
                    </span>
                    <span class="text-[12.5px] text-riv-card-ink-soft">
                      {{ card.free }} of {{ card.total }} free
                    </span>
                  </span>
                </span>
              </a>
            </li>
          }
        </ul>
      </div>

      <!-- The map pane: its own full-height box, not a card inside the scroller. -->
      <div #pane class="relative hidden p-3 lg:block">
        <app-riviera-map class="size-full" [nearMe]="true" />
        <app-venue-pin-layer
          [pins]="state().pins"
          [map]="mapHandle()"
          [selected]="selectedPin()"
          [maxZoom]="maxZoom"
          (chosen)="onPin($event)"
        />
      </div>
    </div>
  `,
})
export class VariantShoreline {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  private readonly map = viewChild(RivieraMap);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  /** The open venue's id. Numeric here; the pin layer wants it as a string. */
  protected readonly selected = signal<number | null>(null);
  protected readonly selectedPin = computed(() => {
    const id = this.selected();
    return id === null ? null : String(id);
  });

  protected onPin(id: string): void {
    this.selected.set(Number(id));
  }

  /** The pane the map fills, measured so the camera can be fitted to it. */
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');

  constructor() {
    // One orchestrated camera move: whenever the handle or the result set changes, frame the pins
    // for THIS pane. See prototype-camera.ts — the shipped fixed camera is a finding, not a given.
    effect(() => {
      const handle = this.mapHandle();
      const pins = this.state().pins;
      if (handle !== undefined) {
        fitHandleToPins(
          handle,
          pins.map((p) => p.at),
          this.pane().nativeElement,
        );
      }
    });
  }
}
