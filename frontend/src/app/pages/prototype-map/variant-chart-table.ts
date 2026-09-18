/**
 * PROTOTYPE variant B — **Chart table**. The map is not a panel on the page; it *is* the page,
 * full bleed under everything, and one glass rail floats over it.
 *
 * <p>The argument is the material. Liquid Glass is a *backdrop* material — `backdrop-blur-[26px]`
 * over a near-white page gradient has nothing to blur, so today every glass surface reads as flat
 * translucent white. Put the real coast behind it and the whole design language starts doing the
 * job it was chosen for. Nothing else on the page changes token.
 *
 * <p>Cost: the rail is 400px, so the card has to get denser — a 1-up row with the photo at
 * 104px, not a 3:2 card grid squeezed. That is a real editorial loss and the reason to look hard
 * at the screenshot rather than the idea.
 *
 * <p>On a phone the same rail becomes a bottom sheet at three detents, so the map is never traded
 * away by a List/Map toggle. The peek detent is modelled here.
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
import { PanelGlass } from '../../shared/panel-glass';
import { SemanticChip } from '../../shared/semantic-chip';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { fitHandleToPins } from './prototype-camera';
import { PrototypeFilterBar } from './prototype-filter-bar';

/** The rail's own width plus its two gutters — map the rail covers, not map beside it. */
const RAIL_PX = 432;
/** Tailwind's `lg`, where the rail stops being a sheet and starts covering the map. */
const RAIL_BREAKPOINT_PX = 1024;

@Component({
  selector: 'app-variant-chart-table',
  imports: [
    RouterLink,
    CardGlass,
    PanelGlass,
    SemanticChip,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    PrototypeFilterBar,
  ],
  host: { class: 'block' },
  template: `
    <div class="relative h-[calc(100dvh-68px)] overflow-hidden">
      <!-- The ground. No inset, no card: the map is the page's floor. The wrapper does the
           positioning: overriding the map host's own position utility from here would be decided
           by stylesheet order, not by this class list. Its 26px radius is clipped off here. -->
      <div #pane class="absolute inset-0 overflow-hidden">
        <app-riviera-map class="size-full" [nearMe]="true" />
      </div>
      <app-venue-pin-layer
        [pins]="state().pins"
        [map]="mapHandle()"
        [selected]="selectedPin()"
        [maxZoom]="maxZoom"
        (chosen)="onPin($event)"
      />

      <!-- The one floating rail. Sea side (left) on purpose: the coast runs down the right of the
           camera, so the rail covers water, not the pins it indexes. -->
      <div
        appPanelGlass
        class="absolute top-4 bottom-4 left-4 z-[6] hidden w-[400px] flex-col overflow-hidden rounded-[26px] shadow-[0_18px_56px_rgba(7,42,58,0.3)] lg:flex"
      >
        <div class="shrink-0 px-[18px] pt-[17px] pb-3">
          <h1 class="mb-0.5 text-[23px] leading-[1.08] font-bold tracking-[-0.02em] text-riv-ink">
            Find your spot on the Riviera.
          </h1>
          <p class="mb-3.5 text-[13.5px] leading-[1.45] text-riv-ink-soft">
            {{ state().cards.length }} venues open on {{ state().dateLabel }}.
          </p>
          <app-prototype-filter-bar
            [state]="state()"
            [tight]="true"
            (filtered)="filtered.emit($event)"
          />
        </div>

        <!-- The rail scrolls; the map behind it never moves. -->
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
                    <span class="truncate text-[15.5px] leading-tight font-bold text-riv-card-ink">
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

      <!-- Phone: the same rail as a sheet at its peek detent — the map stays behind it, always. -->
      <div
        appPanelGlass
        class="absolute inset-x-0 bottom-[76px] z-[6] flex h-[168px] flex-col rounded-t-[24px] px-4 pt-2.5 shadow-[0_-10px_40px_rgba(7,42,58,0.28)] lg:hidden"
      >
        <button
          type="button"
          appTouchTarget
          class="mx-auto flex w-full max-w-[220px] flex-col items-center gap-1.5"
          aria-label="Expand the venue list"
        >
          <span class="h-1 w-10 rounded-full bg-riv-ink/25" aria-hidden="true"></span>
          <span class="text-[13px] font-semibold text-riv-ink">
            {{ state().cards.length }} venues · drag up
          </span>
        </button>
        <ul class="-mx-4 flex list-none gap-2.5 overflow-x-auto scrollbar-none px-4 pt-2 pb-3">
          @for (card of state().cards.slice(0, 6); track card.id) {
            <li class="shrink-0">
              <a
                appCardGlass
                class="flex w-[188px] items-center gap-2.5 rounded-[16px] p-2 no-underline"
                [routerLink]="['/venues', card.id]"
                [attr.aria-label]="card.ariaLabel"
              >
                <img
                  class="size-12 shrink-0 rounded-[10px] object-cover"
                  [src]="card.photos[0].url"
                  alt=""
                />
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-[13.5px] font-bold text-riv-card-ink">{{
                    card.name
                  }}</span>
                  <span class="text-[12px] text-riv-card-ink-soft">
                    from <strong class="text-riv-accent-ink">{{ card.priceLabel }}</strong>
                  </span>
                </span>
              </a>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class VariantChartTable {
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
    // The rail COVERS the map from lg up, so the fit is offset by it; below lg the rail is a
    // bottom sheet and the map is unobstructed, so the inset goes back to zero.
    effect(() => {
      const handle = this.mapHandle();
      const pins = this.state().pins;
      const pane = this.pane().nativeElement;
      if (handle !== undefined) {
        const inset = pane.clientWidth >= RAIL_BREAKPOINT_PX ? RAIL_PX : 0;
        fitHandleToPins(
          handle,
          pins.map((p) => p.at),
          pane,
          inset,
        );
      }
    });
  }
}
