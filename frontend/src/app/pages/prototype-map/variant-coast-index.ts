/**
 * PROTOTYPE variant C — **Coast index**. The one that comes from the subject rather than from
 * another product's map page.
 *
 * <p>The riviera is not a city: it is a ~200 km line, and `shared/beaches.ts` already declares
 * its 36 beaches in "the order a tourist reads the coast" (north to south) with a recorded camera
 * per beach. So the coast itself is the navigation instrument — a rail down the left, region by
 * region, each beach carrying its venue count and its from-price. Pressing one eases the map to
 * that beach's own camera (a capability #1141 already shipped; this is a better control for it
 * than a `<select>`) and narrows the list.
 *
 * <p>Two things go on purpose:
 *   - the hero headline. The rail says "this is a coast, pick a place on it" better than a
 *     sentence claiming the same thing, and a headline above a wayfinding instrument is the
 *     label-above-content tell.
 *   - the Beach and Region selects. The rail *is* both of them, visible at once, with the counts
 *     a select can never show.
 *
 * <p>Cost: three columns need width. Under ~1180px the rail folds to a horizontal scroller above
 * the map, which is the same instrument in a worse form. Honest failure mode, modelled here.
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
import { beachesInRegion } from '../../shared/beaches';
import { PROTOTYPE_VENUES } from './prototype-venues';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { fitHandleToPins } from './prototype-camera';

/** A rail row: a beach that has venues, with what the rail shows about it. */
interface RailBeach {
  readonly code: string;
  readonly label: string;
  readonly venues: number;
  /** The cheapest set on that beach, already formatted — the rail's one number worth comparing. */
  readonly from: string;
}

@Component({
  selector: 'app-variant-coast-index',
  imports: [
    RouterLink,
    CardGlass,
    PanelGlass,
    SemanticChip,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
  ],
  host: { class: 'block' },
  template: `
    <div
      class="grid h-[calc(100dvh-68px)] grid-cols-1 gap-3 p-3 min-[1180px]:grid-cols-[236px_minmax(0,1fr)_clamp(320px,26vw,420px)]"
    >
      <!-- The coast, north to south. Its own scroller: 36 beaches do not fit a viewport. -->
      <nav
        appPanelGlass
        class="order-1 flex min-h-0 flex-col overflow-hidden rounded-[22px]"
        aria-label="The coast, north to south"
      >
        <p
          class="shrink-0 px-4 pt-3.5 pb-2 text-[11px] font-bold tracking-[0.1em] uppercase text-riv-ink-faint"
        >
          North ↓ South
        </p>
        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
          @for (region of railRegions(); track region.code) {
            <p class="px-2 pt-2.5 pb-1 text-[13px] font-bold text-riv-ink">{{ region.label }}</p>
            @for (b of region.beaches; track b.code) {
              <button
                type="button"
                appTouchTarget
                class="flex w-full items-center gap-2 rounded-[12px] px-2 text-left text-[13.5px] text-riv-ink-soft hover:bg-white/55 aria-pressed:bg-riv-accent-ink aria-pressed:font-semibold aria-pressed:text-riv-on-accent-ink"
                [attr.aria-pressed]="state().beach === b.code"
                (click)="pick(b.code)"
              >
                <span class="min-w-0 flex-1 truncate">{{ b.label }}</span>
                <span class="shrink-0 text-[12px] tabular-nums opacity-70">{{ b.from }}</span>
                <span
                  class="shrink-0 rounded-full bg-riv-ink/10 px-1.5 text-[11px] font-bold tabular-nums text-riv-ink aria-pressed:bg-white/25"
                  aria-hidden="true"
                  >{{ b.venues }}</span
                >
              </button>
            }
          }
        </div>
        @if (state().beach) {
          <button
            type="button"
            appTouchTarget
            class="m-2 shrink-0 rounded-[12px] border-2 border-riv-accent-border bg-riv-accent-fill px-3 text-[13px] font-bold text-riv-accent-ink"
            (click)="pick('')"
          >
            Show the whole coast
          </button>
        }
      </nav>

      <!-- The map keeps the widest column: this variant spends its space on the geography. -->
      <div #pane class="relative order-2 min-h-[300px]">
        <app-riviera-map class="size-full" [nearMe]="true" />
        <app-venue-pin-layer
          [pins]="state().pins"
          [map]="mapHandle()"
          [selected]="selectedPin()"
          [maxZoom]="maxZoom"
          (chosen)="onPin($event)"
        />
      </div>

      <!-- The list, narrowed by the rail. Compact rows: it is the third column, not the subject. -->
      <div
        appPanelGlass
        class="order-3 flex min-h-0 flex-col overflow-hidden rounded-[22px] max-[1179px]:hidden"
      >
        <p class="shrink-0 px-4 pt-3.5 pb-2">
          <strong class="text-[17px] font-bold text-riv-ink">
            {{ state().beach ? beachName() : 'The whole coast' }}
          </strong>
          <span class="mt-0.5 block text-[12.5px] text-riv-ink-soft">
            {{ state().cards.length }} {{ state().cards.length === 1 ? 'venue' : 'venues' }} ·
            {{ state().dateLabel }}
          </span>
        </p>
        <ul class="min-h-0 list-none flex-1 overflow-y-auto scrollbar-thin px-2.5 pb-3">
          @for (card of state().cards; track card.id) {
            <li class="mb-2">
              <a
                appCardGlass
                class="block overflow-hidden rounded-[16px] no-underline hover:bg-white/70 aria-[current]:outline-2 aria-[current]:-outline-offset-2 aria-[current]:outline-riv-accent-ink"
                [routerLink]="['/venues', card.id]"
                [attr.aria-label]="card.ariaLabel"
                [attr.aria-current]="selected() === card.id ? 'true' : null"
                (mouseenter)="selected.set(card.id)"
              >
                <span class="relative block h-[92px]">
                  <img
                    class="absolute inset-0 size-full object-cover"
                    [src]="card.photos[0].url"
                    alt=""
                  />
                  <span
                    class="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,42,58,0)_35%,rgba(7,42,58,0.72)_100%)]"
                  ></span>
                  <span appSemanticChip class="absolute top-2 left-2 px-2 py-0.5 text-[10.5px]">
                    {{ card.modeLabel }}
                  </span>
                  <span
                    class="absolute inset-x-2.5 bottom-1.5 flex items-baseline justify-between gap-2"
                  >
                    <span
                      class="truncate text-[14.5px] font-bold text-riv-photo-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]"
                    >
                      {{ card.name }}
                    </span>
                    <strong
                      class="shrink-0 text-[14px] font-extrabold text-riv-photo-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]"
                    >
                      {{ card.priceLabel }}
                    </strong>
                  </span>
                </span>
                <span
                  class="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px] text-riv-card-ink-soft"
                >
                  <span class="flex items-center gap-1.5">
                    @if (card.isRated) {
                      <span class="text-[#f4a939]" aria-hidden="true">★</span>
                      <span class="font-bold text-riv-card-ink">{{ card.rating }}</span>
                    } @else {
                      <span appSemanticChip class="px-[7px] py-px text-[10.5px]">New</span>
                    }
                  </span>
                  <span>{{ card.free }} of {{ card.total }} free</span>
                </span>
              </a>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class VariantCoastIndex {
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

  /**
   * The rail's regions, each with the beaches that actually have venues — counted and priced off
   * the WHOLE fixture, never off the narrowed list, so the rail's numbers do not collapse to the
   * one beach you already picked.
   */
  protected readonly railRegions = computed(() =>
    this.state().regions.map((region) => ({
      code: region.code,
      label: region.label,
      beaches: beachesInRegion(region.code).flatMap<RailBeach>((entry) => {
        const on = PROTOTYPE_VENUES.filter((v) => v.beach === entry.code);
        if (on.length === 0) {
          return [];
        }
        const cheapest = Math.min(...on.map((v) => v.fromPrice?.minorUnits ?? Infinity));
        return [
          {
            code: entry.code,
            label: entry.label,
            venues: on.length,
            from: `€${(cheapest / 100).toFixed(0)}`,
          },
        ];
      }),
    })),
  );

  protected readonly beachName = computed(
    () => this.state().beaches.find((b) => b.code === this.state().beach)?.label ?? '',
  );

  protected pick(code: string): void {
    this.filtered.emit({ beach: code });
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
