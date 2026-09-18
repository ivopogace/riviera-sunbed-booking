/**
 * PROTOTYPE variant K — **Locator**. Round 4's answer to "should desktop get a Map button?":
 * no, because the map only needs a *mode* if it is the wrong *shape*.
 *
 * <p>The move is `prototype-aspect.ts`: the result set has an aspect ratio of its own — 4.51 : 1
 * tall for the 26 venues, 2.07 : 1 for Sarandë's four, 0.60 : 1 for Himarë's eleven — so the map's
 * box is **derived from the pins** rather than designed, and the map is never big enough to be in
 * the way, never the wrong shape, and never has to be hidden behind a toggle to get the list its
 * width. The column runs the window's height and takes the width that shape needs (344 px for the
 * whole coast, 490 for Sarandë), so the card grid gains or loses a column as you narrow.
 *
 * <p>Which settles rounds 1–3's argument rather than joining it. A **column** (round 1's A, C, G)
 * and a **turned band** (round 2's E, round 3's H, I, J) are not rival layouts; they are the same
 * layout at two aspects, and which one a page should wear is a measurement, not a taste. So K
 * computes it: a set taller than {@link COLUMN_ASPECT} gets the ribbon down the left — the whole
 * coast, or any north–south stretch — and a wider one gets the band across the top, turned to its
 * own bearing so the sea lies at the foot, because that is the only way a wide set fills a wide
 * box (round 2's finding, now with the rule that says when to reach for it).
 *
 * <p>The width the ribbon does not spend on geography is spent on *labels*, not on padding —
 * variant F's insight ("the inland waste is the label field") turned vertical. Every beach with a
 * venue gets a leader into the right-hand gutter with its count and its from-price, which is
 * variant C's coast index drawn ON the coast instead of beside it, at a quarter of C's width.
 *
 * <p>Pins are dots, not the shipped pills: a 152 px pin field cannot wear a 90 px price pill. The
 * label gutter carries the text instead, which is the whole point of having one.
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

import { CardGlass } from '../../shared/card-glass';
import { FieldGlass } from '../../shared/field-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { LngLat } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { PrototypeVenueCard } from './prototype-venue-card';
import { contentAspect } from './prototype-aspect';
import { bearingFor, PrototypeBand } from './prototype-band';
import { fitHandleToPins } from './prototype-camera';
import { COAST } from './prototype-coast';

/**
 * The gutter is the label field; whatever is left of the pane is the pin field. The pane's WIDTH
 * is derived (see {@link VariantLocator.paneW}) so the ribbon always fills the column's height:
 * a set of 4.51 wants a 161 px pin field, one of 2.07 wants 350, and the column follows.
 */
const GUTTER = 140;
const MIN_PANE = 344;
const MAX_PANE = 556;
/** Chrome the fit keeps clear of, matching `prototype-camera`'s own pad. */
const FIT_PAD = 76;
/** A bay is wide and shallow, but a 60 px ribbon reads as a bug rather than as a bay. */
const MIN_RIBBON = 170;
/** Rows in the gutter never touch: the smallest gap two 12 px labels can sit at. */
const LABEL_STEP = 23;
/**
 * Taller than this and the set wants a column down the side; wider and it wants a band across the
 * top. 1.3 is where a 400 px column at a 900 px window stops being able to hold the set at all.
 */
const COLUMN_ASPECT = 1.3;
/** The band's own floor and ceiling; inside them its depth is the turned set's own shape. */
const MIN_BAND = 230;
const MAX_BAND = 430;

interface Dot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Tick {
  readonly code: string;
  readonly label: string;
  readonly venues: number;
  readonly from: string;
  /** Where the beach is. */
  readonly x: number;
  readonly y: number;
  /** Where its label sits in the gutter, after de-overlapping. */
  labelY: number;
}

@Component({
  selector: 'app-variant-locator',
  imports: [
    CardGlass,
    FieldGlass,
    PanelGlass,
    TouchTarget,
    RivieraMap,
    PrototypeBand,
    PrototypeVenueCard,
  ],
  host: { class: 'block' },
  template: `
    @if (shape() === 'column') {
      <div class="flex h-[calc(100dvh-68px)]">
        <aside
          #column
          class="flex shrink-0 flex-col overflow-hidden p-4 motion-safe:[transition:width_0.2s_ease]"
          [style.width.px]="paneW() + 32"
        >
          <div
            #pane
            class="relative min-h-0 shrink-0 overflow-hidden rounded-[20px] shadow-[0_10px_32px_rgba(7,42,58,0.18)] [&>app-riviera-map]:rounded-[20px] [&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:hidden"
            [style.height.px]="ribbonHeight()"
          >
            <app-riviera-map class="size-full" [nearMe]="false" />
            <p
              class="pointer-events-auto absolute top-2.5 left-2.5 z-[6] m-0 rounded-[10px] border border-riv-solid-btn-border bg-riv-solid-btn-fill px-2 py-0.5 text-[10.5px] leading-[14px] text-riv-solid-btn-ink"
            >
              © <a class="underline" href="https://openmaptiles.org/">OpenMapTiles</a> ©
              <a class="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
            </p>

            <!-- The label field, as a field: inland fades to paper so the names read as a column. -->
            <span
              class="pointer-events-none absolute inset-y-0 right-0 z-[2] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.82)_38%,rgba(255,255,255,0.93))]"
              [style.width.px]="GUTTER + 26"
              aria-hidden="true"
            ></span>

            <svg
              class="pointer-events-none absolute inset-0 z-[3] size-full"
              [attr.viewBox]="'0 0 ' + paneW() + ' ' + ribbonHeight()"
              aria-hidden="true"
            >
              @for (tick of ticks(); track tick.code) {
                <path
                  class="fill-none stroke-riv-accent-ink/40"
                  stroke-width="1.5"
                  [attr.d]="leader(tick)"
                />
              }
            </svg>
            @for (dot of dots(); track dot.id) {
              <span
                class="pointer-events-none absolute z-[4] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-riv-accent-ink shadow-[0_2px_6px_rgba(7,42,58,0.45)] motion-safe:[transition:width_0.12s_ease,height_0.12s_ease]"
                [class]="hovered() === dot.id ? 'size-[15px]' : 'size-[9px]'"
                [style.left.px]="dot.x"
                [style.top.px]="dot.y"
              ></span>
            }

            <!-- A beach's name, its count and its from-price, on the land side. -->
            @for (tick of ticks(); track tick.code) {
              <button
                type="button"
                class="absolute z-[5] flex h-[22px] -translate-y-1/2 items-center gap-1.5 rounded-full px-1.5 text-left text-[11.5px] leading-none whitespace-nowrap motion-safe:[transition:background_0.12s_ease] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
                data-touch-exempt="prototype — the ribbon's label field is 22px by design"
                [class.bg-white]="state().beach === tick.code"
                [style.left.px]="paneW() - GUTTER + 4"
                [style.width.px]="GUTTER - 10"
                [style.top.px]="tick.labelY"
                (click)="filtered.emit({ beach: tick.code })"
              >
                <span class="truncate font-bold text-riv-ink">{{ tick.label }}</span>
                <span class="shrink-0 text-riv-ink-soft">{{ tick.from }}</span>
                <span
                  class="ml-auto shrink-0 rounded-full bg-riv-accent-ink px-[5px] py-px text-[10px] font-bold text-white"
                  >{{ tick.venues }}</span
                >
              </button>
            }
          </div>
        </aside>

        <main class="min-w-0 flex-1 overflow-y-auto scrollbar-thin pt-4 pr-5 pb-8 pl-1">
          <div
            appPanelGlass
            class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-4 py-3"
          >
            <h1 class="text-[21px] leading-tight font-bold tracking-[-0.02em] text-riv-ink">
              {{ heading() }}
            </h1>
            <p class="text-[13.5px] text-riv-ink-soft">
              <strong class="text-riv-accent-ink">{{ state().cards.length }}</strong>
              {{ state().cards.length === 1 ? 'venue' : 'venues' }} on {{ state().dateLabel }}
            </p>
            <label class="ml-auto flex items-center gap-2 text-[12.5px] text-riv-ink-soft">
              Going on
              <input
                appTouchTarget
                appFieldGlass
                class="cursor-pointer rounded-[12px] px-3 py-2 text-[14.5px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
                type="date"
                [value]="state().date"
                (change)="onDate($event)"
              />
            </label>
          </div>

          <nav class="mb-4 flex flex-wrap gap-1.5" aria-label="The coast">
            <button
              type="button"
              class="rounded-full border px-2.5 py-[5px] text-[12px] font-bold motion-safe:[transition:background_0.12s_ease] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
              data-touch-exempt="prototype — the coast strip is a 26px chip row by design"
              [class]="
                state().region === '' && state().beach === ''
                  ? 'border-transparent bg-riv-accent-ink text-white'
                  : 'border-riv-field-border bg-white/60 text-riv-ink-soft hover:bg-white'
              "
              (click)="filtered.emit({ region: '', beach: '' })"
            >
              Whole coast
            </button>
            @for (region of COAST; track region.code) {
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[12px] font-bold motion-safe:[transition:background_0.12s_ease] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
                data-touch-exempt="prototype — the coast strip is a 26px chip row by design"
                [class]="
                  state().region === region.code
                    ? 'border-transparent bg-riv-accent-ink text-white'
                    : 'border-riv-field-border bg-white/60 text-riv-ink-soft hover:bg-white'
                "
                (click)="filtered.emit({ region: region.code })"
              >
                {{ region.label }}
                <span class="text-[11px] font-semibold opacity-70">{{ region.venues }}</span>
              </button>
            }
          </nav>

          <ul
            class="grid list-none grid-cols-2 gap-4 [@media(min-width:1320px)]:grid-cols-3 [@media(min-width:1760px)]:grid-cols-4"
          >
            @for (card of state().cards; track card.id) {
              <li>
                <app-prototype-venue-card
                  [card]="card"
                  [selected]="hovered() === card.id"
                  (hovered)="hovered.set($event)"
                />
              </li>
            }
          </ul>
          @if (state().cards.length === 0) {
            <p appCardGlass class="rounded-[20px] px-4 py-6 text-[14px] text-riv-ink-soft">
              No venues on that stretch for this date. Pick another place on the coast.
            </p>
          }
        </main>
      </div>
    } @else {
      <!-- A wide set takes the band, turned so its own sea is at the foot. -->
      <app-prototype-band
        class="block w-full"
        [style.height.px]="bandDepth()"
        [pins]="state().pins"
        [cards]="state().cards"
        [date]="state().date"
        [bearing]="bearing()"
        [padding]="bandPadding"
        [hovered]="hovered()"
        (narrowed)="filtered.emit({ beach: $event })"
      />
      <div class="mx-auto max-w-[1800px] px-5 pt-4 pb-10">
        <div
          appPanelGlass
          class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-4 py-3"
        >
          <h1 class="text-[21px] leading-tight font-bold tracking-[-0.02em] text-riv-ink">
            {{ heading() }}
          </h1>
          <p class="text-[13.5px] text-riv-ink-soft">
            <strong class="text-riv-accent-ink">{{ state().cards.length }}</strong>
            {{ state().cards.length === 1 ? 'venue' : 'venues' }} on {{ state().dateLabel }}
          </p>
          <label class="ml-auto flex items-center gap-2 text-[12.5px] text-riv-ink-soft">
            Going on
            <input
              appTouchTarget
              appFieldGlass
              class="cursor-pointer rounded-[12px] px-3 py-2 text-[14.5px] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink"
              type="date"
              [value]="state().date"
              (change)="onDate($event)"
            />
          </label>
        </div>

        <nav class="mb-4 flex flex-wrap gap-1.5" aria-label="The coast">
          <button
            type="button"
            class="rounded-full border px-2.5 py-[5px] text-[12px] font-bold motion-safe:[transition:background_0.12s_ease] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
            data-touch-exempt="prototype — the coast strip is a 26px chip row by design"
            [class]="
              state().region === '' && state().beach === ''
                ? 'border-transparent bg-riv-accent-ink text-white'
                : 'border-riv-field-border bg-white/60 text-riv-ink-soft hover:bg-white'
            "
            (click)="filtered.emit({ region: '', beach: '' })"
          >
            Whole coast
          </button>
          @for (region of COAST; track region.code) {
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[12px] font-bold motion-safe:[transition:background_0.12s_ease] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
              data-touch-exempt="prototype — the coast strip is a 26px chip row by design"
              [class]="
                state().region === region.code
                  ? 'border-transparent bg-riv-accent-ink text-white'
                  : 'border-riv-field-border bg-white/60 text-riv-ink-soft hover:bg-white'
              "
              (click)="filtered.emit({ region: region.code })"
            >
              {{ region.label }}
              <span class="text-[11px] font-semibold opacity-70">{{ region.venues }}</span>
            </button>
          }
        </nav>

        <ul
          class="grid list-none grid-cols-2 gap-4 md:grid-cols-3 [@media(min-width:1280px)]:grid-cols-4 [@media(min-width:1660px)]:grid-cols-5"
        >
          @for (card of state().cards; track card.id) {
            <li>
              <app-prototype-venue-card
                [card]="card"
                [selected]="hovered() === card.id"
                (hovered)="hovered.set($event)"
              />
            </li>
          }
        </ul>
        @if (state().cards.length === 0) {
          <p appCardGlass class="rounded-[20px] px-4 py-6 text-[14px] text-riv-ink-soft">
            No venues on that stretch for this date. Pick another place on the coast.
          </p>
        }
      </div>
    }
  `,
})
export class VariantLocator {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly GUTTER = GUTTER;
  protected readonly COAST = COAST;

  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly column = viewChild<ElementRef<HTMLElement>>('column');
  private readonly handle = computed(() => this.map()?.handle());
  /** Bumped on every camera move, so the dots and leaders re-project. */
  private readonly moved = signal(0);

  protected readonly hovered = signal<number | null>(null);

  protected readonly heading = computed(() => {
    const cards = this.state().cards;
    if (this.state().beach !== '' && cards.length > 0) return `${cards[0].beachLabel}.`;
    if (this.state().region !== '' && cards.length > 0) return `${cards[0].regionLabel}.`;
    return 'Find your spot on the Riviera.';
  });

  /**
   * The ribbon runs the column's full height, and its WIDTH is what the set's shape asks for at
   * that height. That is the variant: the whole coast is a 161 px pin field, Sarandë's four are
   * 350, and the card grid beside it gains or loses a column to suit.
   */
  protected readonly ribbonHeight = computed(() => Math.max(MIN_RIBBON, this.columnRoom()));

  protected readonly paneW = computed(() => {
    const aspect = this.aspect();
    if (aspect === null) return MIN_PANE;
    const pinField = (this.ribbonHeight() - FIT_PAD) / aspect;
    return Math.round(Math.max(MIN_PANE, Math.min(MAX_PANE, pinField + GUTTER + FIT_PAD)));
  });

  /** What the column has to give, measured once it is laid out. */
  private readonly columnRoom = signal(560);
  /** The page's own width, for the band's depth. */
  private readonly pageWidth = signal(1440);

  /** The set's own shape, north up. Everything below is derived from this one number. */
  protected readonly aspect = computed(() => contentAspect(this.state().pins.map((p) => p.at)));

  /**
   * The rule, and the whole variant: a tall set gets a column, a wide one gets a band. Nothing
   * about the page is chosen; it is measured off the pins that came back.
   */
  protected readonly shape = computed<'column' | 'band'>(() => {
    const aspect = this.aspect();
    return aspect === null || aspect >= COLUMN_ASPECT ? 'column' : 'band';
  });

  /** The band's bearing puts the stretch's own sea at its foot (round 2's move, round 4's rule). */
  protected readonly bearing = computed(() => bearingFor(this.state().region, this.state().beach));
  protected readonly bandPadding = { top: 30, bottom: 96, left: 72, right: 132 };

  /** Deep enough for the turned set and no deeper — the same measurement, in the other axis. */
  protected readonly bandDepth = computed(() => {
    const turned = contentAspect(
      this.state().pins.map((p) => p.at),
      this.bearing(),
    );
    if (turned === null) return MIN_BAND;
    const usable = this.pageWidth() - this.bandPadding.left - this.bandPadding.right;
    const depth = usable * turned + this.bandPadding.top + this.bandPadding.bottom;
    return Math.round(Math.max(MIN_BAND, Math.min(MAX_BAND, depth)));
  });

  protected readonly dots = computed<readonly Dot[]>(() => {
    this.moved();
    const handle = this.handle();
    if (handle === undefined) return [];
    return this.state().pins.map((pin) => {
      const at = handle.project(pin.at);
      return { id: Number(pin.id), x: at.x, y: at.y };
    });
  });

  /** One label per beach in the set, de-overlapped down the gutter. */
  protected readonly ticks = computed<readonly Tick[]>(() => {
    this.moved();
    const handle = this.handle();
    if (handle === undefined) return [];
    const byBeach = new Map<string, VenueCard[]>();
    for (const card of this.state().cards) {
      const on = byBeach.get(card.beach) ?? [];
      on.push(card);
      byBeach.set(card.beach, on);
    }
    const placed = [...byBeach.entries()]
      .map(([code, cards]) => {
        const at: LngLat = {
          lng: mean(cards.map((c) => c.location!.longitude)),
          lat: mean(cards.map((c) => c.location!.latitude)),
        };
        const point = handle.project(at);
        const minor = Math.min(...cards.map((c) => c.fromPrice?.minorUnits ?? Infinity));
        return {
          code,
          label: cards[0].beachLabel,
          venues: cards.length,
          from: `€${(minor / 100).toFixed(0)}`,
          x: point.x,
          y: point.y,
          labelY: point.y,
        };
      })
      .sort((a, b) => a.y - b.y);

    const top = 16;
    const foot = this.ribbonHeight() - 14;
    const laid = placed.map((tick) => ({ ...tick, labelY: Math.min(foot, Math.max(top, tick.y)) }));
    for (let i = 1; i < laid.length; i++) {
      laid[i].labelY = Math.max(laid[i].labelY, laid[i - 1].labelY + LABEL_STEP);
    }
    for (let i = laid.length - 2; i >= 0; i--) {
      laid[i].labelY = Math.min(laid[i].labelY, laid[i + 1].labelY - LABEL_STEP);
    }
    return laid;
  });

  protected leader(tick: Tick): string {
    const gutterX = this.paneW() - GUTTER;
    const knee = Math.max(tick.x + 8, gutterX - 14);
    return `M ${tick.x + 6} ${tick.y} H ${knee} L ${gutterX} ${tick.labelY} H ${gutterX + 4}`;
  }

  protected onDate(event: Event): void {
    this.filtered.emit({ date: (event.target as HTMLInputElement).value });
  }

  constructor() {
    let watching = false;
    // afterRender, not effect: the fit reads a box the ribbon's own height binding just set.
    afterRenderEffect(() => {
      const handle = this.handle();
      const pins = this.state().pins;
      this.ribbonHeight();
      this.paneW();
      this.pageWidth.set(window.innerWidth);
      const column = this.column()?.nativeElement;
      if (column !== undefined) {
        // The column holds the ribbon and nothing else, so its box minus its padding IS the room.
        this.columnRoom.set(Math.max(MIN_RIBBON, column.clientHeight - 32));
      }
      const pane = this.pane()?.nativeElement;
      if (handle === undefined || pane === undefined) return;
      if (!watching) {
        handle.onMove(() => this.moved.update((n) => n + 1));
        watching = true;
      }
      fitHandleToPins(
        handle,
        pins.map((p) => p.at),
        pane,
        0,
        GUTTER,
      );
    });
  }
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
