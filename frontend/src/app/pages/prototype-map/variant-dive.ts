/**
 * PROTOTYPE variant I — **Dive**. One continuous zoom from the whole riviera to one lounger.
 *
 * <p>The riviera map and a venue's beach map are the same subject at two scales, and today the
 * change of scale is a page change. Round 1's D put the two maps side by side; this variant puts
 * them on ONE camera: the map is the page, the wheel zooms, and past beach scale the venue under
 * the camera's centre unfolds its own set grid from its pin — rows parallel to the shore, the
 * front row at the water, because the band is turned with the sea at the foot so "facing the
 * sea" is simply down. A depth gauge on the left names the four scales and moves between them.
 *
 * <p>The finding this rests on, measured: the unfolding is a LENS, not a projection. A sunbed set
 * is ~2.5 m across; at the map's own ceiling (zoom 16, 512 px tiles, latitude 40°) a pixel is
 * ~0.9 m, so a set drawn to scale is three pixels. The grid therefore holds a fixed screen size
 * and only grows into place between zoom 13 and 15 — the zoom is continuous, the scale is not.
 */
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { bearingFor, PrototypeBand } from './prototype-band';
import { COAST } from './prototype-coast';
import { prototypeRows, PrototypeTileState } from './prototype-sets';

const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ' +
  'text-riv-ink whitespace-nowrap hover:bg-riv-ink/8 ' +
  'aria-pressed:bg-riv-accent-ink aria-pressed:text-riv-on-accent-ink';

const TILE_CLASS: Record<PrototypeTileState, string> = {
  available:
    'border-riv-tile-available-border bg-riv-tile-available-fill text-riv-tile-available-ink',
  premium: 'bg-riv-tile-premium-fill border-riv-tile-premium-border text-riv-tile-premium-ink',
  walkin:
    'bg-riv-tile-walkin-fill bg-[repeating-linear-gradient(135deg,var(--riv-tile-walkin-hatch)_0px,var(--riv-tile-walkin-hatch)_3px,transparent_3px,transparent_8px)] border-riv-tile-walkin-border text-riv-tile-walkin-ink',
  taken:
    'bg-riv-tile-taken-fill border-dashed border-riv-tile-taken-border text-riv-tile-taken-ink',
};

/** The four scales the gauge names, and the zoom each sits at. */
interface Depth {
  readonly label: string;
  readonly zoom: number;
}
const DEPTHS: readonly Depth[] = [
  { label: 'The coast', zoom: 8.1 },
  { label: 'A region', zoom: 10.6 },
  { label: 'A beach', zoom: 13 },
  { label: 'Your set', zoom: 15.2 },
];

/** The grid starts to unfold here and is whole at BLOOM_FULL. */
const BLOOM_START = 13;
const BLOOM_FULL = 15;

@Component({
  selector: 'app-variant-dive',
  imports: [PanelGlass, TouchTarget, PrototypeBand],
  host: { class: 'block' },
  template: `
    <app-prototype-band
      #band
      class="h-[calc(100dvh-72px)] min-h-[520px]"
      [pins]="state().pins"
      [cards]="state().cards"
      [date]="state().date"
      [bearing]="bearing()"
      [padding]="padding"
      [fitMaxZoom]="fitMaxZoom"
      [cooperative]="false"
      [preview]="false"
      [initialOpen]="initialOpen"
      (narrowed)="filtered.emit({ beach: $event })"
      (opened)="dive($event)"
    >
      <!-- The coast as chips, floating over the top of the map: the coarse navigator. -->
      <div
        appPanelGlass
        class="absolute top-3 left-1/2 z-[6] hidden max-w-[calc(100%-360px)] -translate-x-1/2 items-center gap-0.5 rounded-full px-1.5 py-1 lg:flex"
      >
        <button
          type="button"
          appTouchTarget
          [class]="chip"
          [attr.aria-pressed]="state().region === '' && state().beach === ''"
          (click)="filtered.emit({ region: '', beach: '' })"
        >
          Whole coast
        </button>
        @for (region of coast; track region.code) {
          <button
            type="button"
            appTouchTarget
            [class]="chip"
            [attr.aria-pressed]="state().region === region.code"
            (click)="filtered.emit({ region: region.code, beach: '' })"
          >
            {{ region.label }}
          </button>
        }
      </div>

      <!-- THE DEPTH GAUGE: the one zoom, named at four scales; the marker is where the camera is. -->
      <div
        appPanelGlass
        class="absolute top-1/2 left-4 z-[6] hidden w-[176px] -translate-y-1/2 rounded-[22px] px-3 pt-3 pb-4 lg:block"
        role="group"
        aria-label="Depth: how close the map is"
      >
        <div class="relative ml-[9px] h-[220px] border-l-2 border-riv-ink/25">
          @for (depth of depths; track depth.label; let i = $index) {
            <button
              type="button"
              appTouchTarget
              class="absolute -left-[11px] flex h-11 -translate-y-1/2 items-center gap-2.5 text-left text-[13px] font-semibold whitespace-nowrap text-riv-ink"
              [style.top.%]="gaugeAt(depth.zoom)"
              [attr.aria-pressed]="nearest() === i"
              (click)="goTo(depth)"
            >
              <span
                class="block size-[18px] rounded-full border-[3px] border-riv-solid-btn-fill shadow-[0_2px_8px_rgba(7,42,58,0.3)]"
                [class]="nearest() === i ? 'bg-riv-accent-ink' : 'bg-riv-ink/40'"
                aria-hidden="true"
              ></span>
              {{ depth.label }}
            </button>
          }
          <!-- The camera's own position on the gauge. -->
          <span
            class="absolute -left-[5px] h-px w-[8px] bg-riv-accent-ink motion-safe:[transition:top_0.15s_linear]"
            [style.top.%]="gaugeAt(zoom())"
            aria-hidden="true"
          ></span>
        </div>
        <p class="mt-2 text-[11.5px] leading-[1.35] text-riv-ink-soft">
          Scroll to dive. Sets unfold past the beach.
        </p>
      </div>

      <!-- THE BLOOM: the focus venue's grid, unfolding from its pin, front row at the water. -->
      @if (bloom(); as b) {
        <div
          class="pointer-events-none absolute z-[5] w-[400px] origin-bottom"
          [style.left.px]="b.x"
          [style.top.px]="b.y - 26"
          [style.translate]="'-50% -100%'"
          [style.scale]="b.scale"
          [style.opacity]="b.scale"
        >
          <div
            appPanelGlass
            class="pointer-events-auto rounded-[20px] px-3 pt-2.5 pb-3 shadow-[0_18px_50px_rgba(7,42,58,0.35)]"
          >
            <p class="mb-2 flex items-baseline justify-between gap-2 px-1">
              <strong class="truncate text-[15px] font-bold text-riv-ink">{{ b.card.name }}</strong>
              <span class="shrink-0 text-[12px] text-riv-ink-soft">
                {{ b.card.free }} of {{ b.card.total }} free · {{ state().dateLabel }}
              </span>
            </p>
            <!-- Rows land-side first, so the FRONT row is the last one: at the foot, on the water. -->
            <div class="flex flex-col gap-1">
              @for (row of b.rows; track row.code) {
                <div class="flex items-center gap-1" [class.mt-2]="row.zoneEnd">
                  <span class="w-4 text-[10px] font-bold text-riv-ink-faint">{{ row.code }}</span>
                  <ul class="grid flex-1 list-none grid-cols-10 gap-1">
                    @for (tile of row.tiles; track tile.id) {
                      <li
                        class="set-tile flex h-[26px] items-center justify-center rounded-[7px] border-[1.5px] text-[10.5px] font-bold"
                        [class]="tileClass[tile.state]"
                      >
                        @if (tile.state === 'available' || tile.state === 'premium') {
                          <button
                            type="button"
                            data-touch-exempt="prototype lens: the shipped beach map owns the real tiles"
                            class="flex size-full items-center justify-center rounded-[inherit] border-0 bg-transparent text-inherit hover:bg-riv-tile-hover aria-pressed:bg-riv-solid-btn-ink aria-pressed:text-riv-solid-btn-fill"
                            [attr.aria-label]="'Book ' + tile.name"
                            [attr.aria-pressed]="picked() === tile.id"
                            (click)="picked.set(tile.id)"
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
                  <span class="w-[104px] text-right text-[10.5px] font-bold text-riv-ink-soft">
                    @if (row.priceLabel) {
                      {{ row.priceLabel }}
                    }
                  </span>
                </div>
              }
            </div>
            <p class="mt-2 flex items-center justify-between px-1 text-[12px] text-riv-ink-soft">
              <span>▼ the water</span>
              @if (picked(); as set) {
                <a
                  appTouchTarget
                  class="inline-flex items-center rounded-full border border-riv-cta-border bg-(image:--riv-cta-grad) px-4 text-[13px] font-bold text-white no-underline"
                  [href]="'/venues/' + b.card.id"
                  >Book {{ set.split('-')[1] }} · {{ b.card.priceLabel }}</a
                >
              } @else {
                <span>press a set</span>
              }
            </p>
          </div>
        </div>
      }
    </app-prototype-band>
  `,
})
export class VariantDive {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly chip = CHIP;
  protected readonly coast = COAST;
  protected readonly depths = DEPTHS;
  protected readonly tileClass = TILE_CLASS;
  protected readonly padding = { top: 90, bottom: 120, left: 200, right: 140 };
  protected readonly fitMaxZoom = 15.2;

  private readonly band = viewChild.required(PrototypeBand);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly initialOpen = this.query.get('open');
  private readonly initialDepth = Number(this.query.get('depth') ?? DEPTHS[3].zoom);
  protected readonly picked = signal<string | null>(null);

  private readonly tick = signal(0);
  protected readonly zoom = computed(() => {
    this.tick();
    return this.band().handle()?.view().zoom ?? RIVIERA_MAP_OPTIONS.view.zoom;
  });
  protected readonly nearest = computed(() => {
    const z = this.zoom();
    let best = 0;
    DEPTHS.forEach((d, i) => {
      if (Math.abs(d.zoom - z) < Math.abs(DEPTHS[best].zoom - z)) best = i;
    });
    return best;
  });

  /** The open venue's stretch decides which way the sea lies; else the filter's. */
  protected readonly bearing = computed(() => {
    const open = this.band().open();
    const card = open === null ? null : this.state().cards.find((c) => String(c.id) === open);
    return card ? bearingFor('', card.beach) : bearingFor(this.state().region, this.state().beach);
  });

  /**
   * The venue whose grid unfolds: the open one, else — once past beach scale — the pin nearest
   * the centre of the band. `null` when the camera is too far out to show one.
   */
  protected readonly bloom = computed(() => {
    this.tick();
    const zoom = this.zoom();
    if (zoom < BLOOM_START) return null;
    const band = this.band();
    const host = this.element.nativeElement;
    const cx = host.clientWidth / 2;
    const cy = host.clientHeight / 2;
    const open = band.open();
    let focus: { card: VenueCard; x: number; y: number } | null = null;
    let bestDistance = Infinity;
    for (const pin of this.state().pins) {
      const at = band.project(pin.at);
      if (at === null) continue;
      const distance = open === pin.id ? -1 : Math.hypot(at.x - cx, at.y - cy);
      if (distance < bestDistance) {
        bestDistance = distance;
        focus = { card: pin.card, x: at.x, y: at.y };
      }
    }
    if (focus === null) return null;
    const { card, x, y } = focus;
    const rows = [...prototypeRows(card.id, card.fromPrice?.minorUnits ?? 2000, 10)]
      .reverse()
      .map((row, i, all) => ({ ...row, zoneEnd: i > 0 && all[i - 1].zoneStart }));
    return {
      card,
      x,
      y,
      rows,
      scale: Math.max(0, Math.min(1, (zoom - BLOOM_START) / (BLOOM_FULL - BLOOM_START))),
    };
  });

  /** Depth reads downward: the coast at the top of the gauge, one set at the bottom. */
  protected gaugeAt(zoom: number): number {
    const { minZoom, maxZoom } = RIVIERA_MAP_OPTIONS;
    return ((Math.max(minZoom, Math.min(maxZoom, zoom)) - minZoom) / (maxZoom - minZoom)) * 100;
  }

  /** A gauge stop: the same centre, a different depth — "Your set" dives on the focus venue. */
  protected goTo(depth: Depth): void {
    const band = this.band();
    const handle = band.handle();
    if (!handle) return;
    const focus = this.bloom()?.card ?? this.nearestCard();
    if (depth.zoom >= BLOOM_START && focus?.location) {
      band.flyTo(
        { lng: focus.location.longitude, lat: focus.location.latitude },
        depth.zoom,
        bearingFor('', focus.beach),
      );
      band.open.set(String(focus.id));
    } else {
      band.flyTo(handle.view().center, depth.zoom);
    }
  }

  /** A pin press is a dive: the camera goes to set scale on that venue, turned to its stretch. */
  protected dive(id: string | null, zoom = DEPTHS[3].zoom): void {
    const card = this.state().cards.find((c) => String(c.id) === id);
    if (card?.location) {
      this.picked.set(null);
      this.band().flyTo(
        { lng: card.location.longitude, lat: card.location.latitude },
        zoom,
        bearingFor('', card.beach),
      );
    }
  }

  private nearestCard(): VenueCard | null {
    const band = this.band();
    const host = this.element.nativeElement;
    let best: VenueCard | null = null;
    let bestDistance = Infinity;
    for (const pin of this.state().pins) {
      const at = band.project(pin.at);
      if (at === null) continue;
      const d = Math.hypot(at.x - host.clientWidth / 2, at.y - host.clientHeight / 2);
      if (d < bestDistance) {
        bestDistance = d;
        best = pin.card;
      }
    }
    return best;
  }

  constructor() {
    effect((onCleanup) => {
      const handle = this.band().handle();
      if (handle) onCleanup(handle.onMove(() => this.tick.update((n) => n + 1)));
    });
    // `?open=` on load: dive to that venue once the band's own fit has landed (it eases for 700 ms
    // and would otherwise win). `?depth=` seeds the zoom, for a shot of the grid mid-unfold.
    effect(() => {
      const handle = this.band().handle();
      if (handle && this.initialOpen !== null) {
        setTimeout(() => this.dive(this.initialOpen, this.initialDepth), 900);
      }
    });
  }
}
