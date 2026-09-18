/**
 * PROTOTYPE variant L — **Map mode**. The maintainer's own proposal, built rather than argued:
 * desktop gets the phone's List / Map toggle; List is the venues as they show today, with no map
 * at all; Map swaps the whole page for variant B's full-bleed chart with the glass rail over it.
 *
 * <p>Round 2 built round 1's verdict as variant G for the same reason — a verdict argued in prose
 * is not a verdict anyone can look at. So the rail stays on the LEFT where the proposal puts it,
 * the map opens on whatever the filters are showing (which is how it would really ship), and the
 * two states are screenshot side by side.
 *
 * <p>Its one real advantage over every other variant in four rounds, and it is not small: with no
 * map in the list state, the cards get the whole page — five columns at 1440 against A's two and
 * B's one-up rows. Nothing else here gives the list its width back.
 *
 * <p>`?variant=L&map=1` opens in the map state.
 */
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

import { CardGlass } from '../../shared/card-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { PrototypeFilterBar } from './prototype-filter-bar';
import { PrototypeVenueCard } from './prototype-venue-card';
import { fitHandleToPins } from './prototype-camera';

/** The rail's width plus its gutters — map the rail covers, not map beside it. */
const RAIL_PX = 432;

@Component({
  selector: 'app-variant-map-mode',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    CardGlass,
    PanelGlass,
    SemanticChip,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    PrototypeFilterBar,
    PrototypeVenueCard,
  ],
  host: { class: 'block' },
  template: `
    @if (onMap()) {
      <div class="relative h-[calc(100dvh-68px)] overflow-hidden">
        <div #pane class="absolute inset-0 overflow-hidden [&>app-riviera-map]:rounded-none">
          <app-riviera-map class="size-full" [nearMe]="true" />
        </div>
        <app-venue-pin-layer
          [pins]="state().pins"
          [map]="mapHandle()"
          [selected]="selectedPin()"
          [maxZoom]="maxZoom"
          (chosen)="selected.set(+$event)"
        />

        <div
          appPanelGlass
          class="absolute top-4 bottom-4 left-4 z-[6] flex w-[400px] flex-col overflow-hidden rounded-[26px] shadow-[0_18px_56px_rgba(7,42,58,0.3)]"
        >
          <div class="shrink-0 px-[18px] pt-[17px] pb-3">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h1 class="text-[21px] leading-[1.08] font-bold tracking-[-0.02em] text-riv-ink">
                Find your spot.
              </h1>
              <ng-container [ngTemplateOutlet]="toggle" />
            </div>
            <app-prototype-filter-bar
              [state]="state()"
              [tight]="true"
              (filtered)="filtered.emit($event)"
            />
          </div>
          <ul
            class="min-h-0 list-none flex-1 overflow-y-auto scrollbar-thin px-[18px] pt-1 pb-[18px]"
          >
            @for (card of state().cards; track card.id) {
              <li class="mb-2">
                <a
                  appCardGlass
                  class="flex items-stretch gap-3 overflow-hidden rounded-[18px] p-2 no-underline motion-safe:[transition:background_0.15s_ease] hover:bg-white/70 aria-[current]:outline-2 aria-[current]:-outline-offset-2 aria-[current]:outline-riv-accent-ink"
                  [routerLink]="['/venues', card.id]"
                  [attr.aria-label]="card.ariaLabel"
                  [attr.aria-current]="selected() === card.id ? 'true' : null"
                  (mouseenter)="selected.set(card.id)"
                >
                  <img
                    class="size-[76px] shrink-0 rounded-[12px] object-cover"
                    [src]="card.photos[0].url"
                    alt=""
                  />
                  <span class="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span class="flex items-baseline justify-between gap-2">
                      <span
                        class="truncate text-[15.5px] leading-tight font-bold text-riv-card-ink"
                      >
                        {{ card.name }}
                      </span>
                      <strong class="shrink-0 text-[15px] font-extrabold text-riv-accent-ink">
                        {{ card.priceLabel }}
                      </strong>
                    </span>
                    <span class="truncate text-[12.5px] text-riv-card-ink-soft">
                      {{ card.beachLabel }} · {{ card.regionLabel }}
                    </span>
                    <span class="flex items-center gap-2 text-[12px] text-riv-card-ink-soft">
                      @if (card.isRated) {
                        <span class="text-[#f4a939]" aria-hidden="true">★</span>
                        <span class="font-bold text-riv-card-ink">{{ card.rating }}</span>
                      } @else {
                        <span appSemanticChip class="px-[7px] py-px text-[10.5px]">New</span>
                      }
                      <span class="opacity-30" aria-hidden="true">·</span>
                      <span>{{ card.free }} of {{ card.total }} free</span>
                    </span>
                  </span>
                </a>
              </li>
            }
          </ul>
        </div>
      </div>
    } @else {
      <!-- The list state: no map, so the cards take the page. Five columns at 1440. -->
      <div class="mx-auto max-w-[1800px] px-6 pt-5 pb-10">
        <div
          appPanelGlass
          class="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[22px] px-4 py-3.5"
        >
          <div class="mr-2">
            <h1 class="text-[25px] leading-[1.05] font-bold tracking-[-0.02em] text-riv-ink">
              Find your spot on the Riviera.
            </h1>
            <p class="mt-0.5 text-[13.5px] text-riv-ink-soft">
              <strong class="text-riv-accent-ink">{{ state().cards.length }}</strong>
              {{ state().cards.length === 1 ? 'venue' : 'venues' }} on {{ state().dateLabel }}
            </p>
          </div>
          <app-prototype-filter-bar
            class="flex-1 [&_form]:border-0 [&_form]:bg-transparent [&_form]:shadow-none [&_form]:backdrop-blur-none"
            [state]="state()"
            (filtered)="filtered.emit($event)"
          />
          <ng-container [ngTemplateOutlet]="toggle" />
        </div>

        <ul
          class="grid list-none grid-cols-2 gap-4 md:grid-cols-3 [@media(min-width:1280px)]:grid-cols-4 [@media(min-width:1640px)]:grid-cols-5"
        >
          @for (card of state().cards; track card.id) {
            <li>
              <app-prototype-venue-card [card]="card" />
            </li>
          }
        </ul>
      </div>
    }

    <!-- One control, both states — the phone's toggle, brought to the desktop unchanged. -->
    <ng-template #toggle>
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-full border border-riv-field-border bg-white/70 p-0.5"
        role="group"
        aria-label="How to browse"
      >
        @for (mode of MODES; track mode) {
          <button
            type="button"
            appTouchTarget
            class="rounded-full px-3.5 text-[13.5px] font-bold motion-safe:[transition:background_0.14s_ease]"
            [class]="
              onMap() === (mode === 'Map')
                ? 'bg-riv-accent-ink text-white'
                : 'text-riv-ink-soft hover:bg-white/80'
            "
            [attr.aria-pressed]="onMap() === (mode === 'Map')"
            (click)="onMap.set(mode === 'Map')"
          >
            {{ mode }}
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class VariantMapMode {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();
  /** `?map=1` opens in the map state, so both halves of the proposal are screenshot-able. */
  readonly startOnMap = input(false);

  protected readonly MODES = ['List', 'Map'] as const;
  protected readonly onMap = signal(false);
  protected readonly selected = signal<number | null>(null);
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly selectedPin = computed(() => {
    const id = this.selected();
    return id === null ? null : String(id);
  });

  constructor() {
    afterRenderEffect(() => {
      if (this.startOnMap()) this.onMap.set(true);
    });
    afterRenderEffect(() => {
      const handle = this.mapHandle();
      const pins = this.state().pins;
      const pane = this.pane()?.nativeElement;
      if (handle === undefined || pane === undefined) return;
      fitHandleToPins(
        handle,
        pins.map((p) => p.at),
        pane,
        RAIL_PX,
      );
    });
  }
}
