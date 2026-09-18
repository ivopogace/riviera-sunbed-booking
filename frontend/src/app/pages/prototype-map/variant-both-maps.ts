/**
 * PROTOTYPE variant D — **Both maps**. The product's pitch is "pick the exact spot", and today
 * that costs a page change: the riviera map on Discover, then the venue's own beach map on
 * `/venues/:id`. On a phone that is right — there is only ever room for one map. On a 1440px
 * desktop there is room for both, so this variant spends the width on the funnel instead of on
 * more cards: coast on the left, and the moment you press a pin, that venue's SET GRID on the
 * right, with the price zones, the taken sets and the book action.
 *
 * <p>This is the only variant that changes what the page is *for*. The others rearrange Discover;
 * this one absorbs the first half of the venue page into it.
 *
 * <p>The honest constraint, and the reason to judge this from the screenshot: a real venue's grid
 * runs up to ~20 sets wide, and the panel here is ~520px. The grid pans horizontally (the shared
 * canvas already does that) but a tourist comparing front-row availability across venues will be
 * dragging. Modelled with 12 columns, which is where it starts to bite.
 */
import {
  Component,
  computed,
  effect,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { CardGlass } from '../../shared/card-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { BeachMapCanvas, BeachMapRowDef } from '../../shared/beach-map-canvas';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { fitHandleToPins } from './prototype-camera';
import { PrototypeFilterBar } from './prototype-filter-bar';
import { prototypeRows, PrototypeTileState } from './prototype-sets';

/** The tile skins, token for token as `venue/map-tile.ts` paints them. */
const TILE_CLASS: Record<PrototypeTileState, string> = {
  available:
    'border-riv-tile-available-border bg-riv-tile-available-fill text-riv-tile-available-ink',
  premium: 'bg-riv-tile-premium-fill border-riv-tile-premium-border text-riv-tile-premium-ink',
  walkin:
    'bg-riv-tile-walkin-fill bg-[repeating-linear-gradient(135deg,var(--riv-tile-walkin-hatch)_0px,var(--riv-tile-walkin-hatch)_3px,transparent_3px,transparent_8px)] border-riv-tile-walkin-border text-riv-tile-walkin-ink',
  taken:
    'bg-riv-tile-taken-fill border-dashed border-riv-tile-taken-border text-riv-tile-taken-ink',
};

@Component({
  selector: 'app-variant-both-maps',
  imports: [
    RouterLink,
    CardGlass,
    PanelGlass,
    SemanticChip,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    BeachMapCanvas,
    BeachMapRowDef,
    PrototypeFilterBar,
  ],
  host: { class: 'block' },
  template: `
    <div
      class="grid h-[calc(100dvh-68px)] grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_clamp(440px,38vw,620px)]"
    >
      <!-- Left: the coast. Keeps a slim filter bar, because this variant does not replace the
           filters the way the coast index does. -->
      <div class="flex min-h-0 flex-col gap-3">
        <app-prototype-filter-bar [state]="state()" (filtered)="filtered.emit($event)" />
        <div #pane class="relative min-h-0 flex-1">
          <app-riviera-map class="size-full" [nearMe]="true" />
          <app-venue-pin-layer
            [pins]="state().pins"
            [map]="mapHandle()"
            [selected]="selectedId()"
            [maxZoom]="maxZoom"
            (chosen)="selectedId.set($event)"
          />
        </div>
      </div>

      <!-- Right: the spot panel. The list until a venue is open, then that venue's beach map. -->
      <div appPanelGlass class="flex min-h-0 flex-col overflow-hidden rounded-[24px] max-lg:hidden">
        @if (openCard(); as card) {
          <div class="relative h-[168px] shrink-0">
            <img
              class="absolute inset-0 size-full object-cover"
              [src]="card.photos[0].url"
              alt=""
            />
            <span
              class="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,42,58,0.1)_0%,rgba(7,42,58,0.78)_100%)]"
            ></span>
            <button
              type="button"
              appTouchTarget
              class="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-3 text-[13px] font-bold text-riv-solid-btn-ink"
              (click)="selectedId.set(null)"
            >
              <span aria-hidden="true">←</span> All venues
            </button>
            <div class="absolute inset-x-4 bottom-3">
              <p class="flex flex-wrap items-center gap-2">
                <span appSemanticChip class="px-2.5 py-0.5 text-[10.5px]">{{
                  card.modeLabel
                }}</span>
                <span
                  class="text-[12.5px] font-semibold text-riv-photo-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]"
                >
                  {{ card.beachLabel }} · {{ card.regionLabel }}
                </span>
              </p>
              <h2
                class="mt-0.5 text-[25px] leading-[1.05] font-bold tracking-[-0.02em] text-riv-photo-ink [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]"
              >
                {{ card.name }}
              </h2>
            </div>
          </div>

          <!-- The beach map, inline. This is the whole point of the variant. -->
          <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3.5">
            <p class="mb-2.5 flex items-baseline justify-between gap-2">
              <strong class="text-[14px] font-bold text-riv-ink">Pick your set</strong>
              <span class="text-[12.5px] text-riv-ink-soft">
                {{ card.free }} of {{ card.total }} free · {{ state().dateLabel }}
              </span>
            </p>
            <!-- fitWidth: the panel is ~520px and a real beach runs 12-20 sets wide, so the
                 canvas shrinks the tile to fit rather than handing the tourist a drag. Its own
                 clamp stops the tiles going below a usable size — past that it pans again. -->
            <app-beach-map-canvas
              label="Beach map — {{ card.name }}"
              railCodes="letters"
              priceChips="capped-phrases"
              [fitWidth]="true"
            >
              <ng-template [appBeachMapRow]="rows()" let-row>
                <ul
                  class="set-row grid h-full list-none grid-cols-[repeat(var(--riv-map-cols,1),var(--riv-tile))] gap-1.5"
                >
                  @for (tile of row.tiles; track tile.id) {
                    <li
                      class="set-tile flex h-full min-w-0 items-center justify-center rounded-[10px] border-[1.5px] text-[12px] font-bold"
                      [class]="tileClass[tile.state]"
                    >
                      @if (tile.state === 'available' || tile.state === 'premium') {
                        <button
                          type="button"
                          appTouchTarget
                          class="flex size-full cursor-pointer items-center justify-center rounded-[inherit] border-0 bg-transparent text-inherit hover:bg-riv-tile-hover focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-tile-focus"
                          [attr.aria-label]="'Book ' + tile.name"
                        >
                          {{ tile.name.replace('Set ', '') }}
                        </button>
                      } @else {
                        <span [attr.aria-label]="tile.name">{{
                          tile.name.replace('Set ', '')
                        }}</span>
                      }
                    </li>
                  }
                </ul>
              </ng-template>
            </app-beach-map-canvas>
          </div>

          <p
            class="flex shrink-0 items-center justify-between gap-3 border-t border-riv-ink/10 px-4 py-3"
          >
            <span class="text-[13.5px] text-riv-ink-soft">
              from
              <strong class="text-[17px] font-extrabold text-riv-accent-ink">{{
                card.priceLabel
              }}</strong>
              / set
            </span>
            <a
              appTouchTarget
              class="inline-flex items-center rounded-full border border-riv-cta-border bg-(image:--riv-cta-grad) px-5 text-[14px] font-bold text-white no-underline"
              [routerLink]="['/venues', card.id]"
            >
              See the full beach
            </a>
          </p>
        } @else {
          <p class="shrink-0 px-4 pt-4 pb-2">
            <strong class="text-[17px] font-bold text-riv-ink"
              >{{ state().cards.length }} venues</strong
            >
            <span class="mt-0.5 block text-[12.5px] text-riv-ink-soft">
              Press a pin or a row to open its beach map here — no page change.
            </span>
          </p>
          <ul class="min-h-0 list-none flex-1 overflow-y-auto scrollbar-thin px-2.5 pb-3">
            @for (card of state().cards; track card.id) {
              <li class="mb-1.5">
                <button
                  type="button"
                  appCardGlass
                  appTouchTarget
                  class="flex w-full items-center gap-3 rounded-[16px] p-2 text-left hover:bg-white/70"
                  (click)="open(card.id)"
                >
                  <img
                    class="size-[58px] shrink-0 rounded-[11px] object-cover"
                    [src]="card.photos[0].url"
                    alt=""
                  />
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="flex items-baseline justify-between gap-2">
                      <span class="truncate text-[15px] font-bold text-riv-card-ink">{{
                        card.name
                      }}</span>
                      <strong class="shrink-0 text-[14.5px] font-extrabold text-riv-accent-ink">{{
                        card.priceLabel
                      }}</strong>
                    </span>
                    <span class="truncate text-[12.5px] text-riv-card-ink-soft">
                      {{ card.beachLabel }} · {{ card.free }} of {{ card.total }} free
                    </span>
                  </span>
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class VariantBothMaps {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  private readonly map = viewChild(RivieraMap);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  /** `?open=<venue id>` opens that venue's beach map on load; pressing a pin overrides it. */
  private readonly asked = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });
  protected readonly selectedId = linkedSignal<string | null, string | null>({
    source: () => this.asked().get('open'),
    computation: (asked, previous) => (previous === undefined ? asked : previous.value),
  });
  protected readonly tileClass = TILE_CLASS;

  protected open(id: number): void {
    this.selectedId.set(String(id));
  }

  protected readonly openCard = computed<VenueCard | null>(() => {
    const id = this.selectedId();
    return id === null ? null : (this.state().cards.find((c) => String(c.id) === id) ?? null);
  });

  /** Twelve columns: wide enough to look like a real beach, narrow enough to show the pan cost. */
  protected readonly rows = computed(() => {
    const card = this.openCard();
    return card === null ? [] : prototypeRows(card.id, card.fromPrice?.minorUnits ?? 2000, 12);
  });

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
