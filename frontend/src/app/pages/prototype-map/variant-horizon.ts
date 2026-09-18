/**
 * PROTOTYPE variant E — **Horizon**. The map is turned so the sea lies at the bottom and the coast
 * runs left → right, north on the left — the postcard view of a riviera, and the only orientation
 * in which a coast that is a LINE fills a rectangle instead of crossing one corner of it. That one
 * move frees the layout: the map becomes a full-width landscape band in the hero's slot, sticky
 * under the header, and the cards take the whole width below it in four columns. Nothing is a
 * pane beside anything.
 *
 * <p>The coast index (round 1's C) is drawn on the geography instead of beside it: the place
 * pills along the band ARE the beaches in reading order, and a row of region chips along the
 * band's foot moves the camera along the coast. The Beach select goes; a beach is picked on the
 * band (a pill's press narrows the list, as shipped).
 *
 * <p>What it costs: north is not up. A compass says so, and every ease keeps the sea at the
 * bottom, so the rule is learnable in one glance. And the port has to grow a bearing —
 * `prototype-raw-map.ts` reaches past it for now and says what would ship.
 *
 * <p>Phone: the same band at 240 px, chips scrolling sideways, the cards below — map and venues
 * on the first screen with no List/Map toggle and no sheet gesture to learn.
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

import { beachEntry, RegionCode } from '../../shared/beaches';
import { FieldGlass } from '../../shared/field-glass';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenuePreviewCard } from '../home/venue-preview-card';
import { VenueCard } from '../home/venue-card';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import { COAST } from './prototype-coast';
import { PrototypeVenueCard } from './prototype-venue-card';
import {
  COAST_BEARING,
  constrainRotated,
  fitRotated,
  rawMap,
  REGION_BEARING,
} from './prototype-raw-map';

/** A region chip: the shipped solid-button skin on the glass strip, inverted when pressed. */
const CHIP =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ' +
  'text-riv-ink whitespace-nowrap hover:bg-riv-ink/8 ' +
  'aria-pressed:bg-riv-accent-ink aria-pressed:text-riv-on-accent-ink';

@Component({
  selector: 'app-variant-horizon',
  imports: [
    FieldGlass,
    PanelGlass,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    VenuePreviewCard,
    PrototypeVenueCard,
  ],
  host: { class: 'block', '(keydown.escape)': 'open.set(null)' },
  template: `
    <!-- Sticky as one block: the strip is the instrument's controls, the band is the instrument. -->
    <div class="sticky top-0 z-[8] sm:top-[72px]">
      <div
        appPanelGlass
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-x-0 border-t-0 px-4 py-2 lg:px-6"
      >
        <h1
          class="hidden text-[20px] leading-[1.1] font-bold tracking-[-0.02em] text-riv-ink min-[1280px]:block"
        >
          Find your spot on the Riviera.
        </h1>
        <p class="flex items-center gap-x-2 text-[13px] whitespace-nowrap text-riv-ink-soft">
          <strong class="text-[15px] font-extrabold text-riv-accent-ink">{{
            state().cards.length
          }}</strong>
          {{ state().cards.length === 1 ? 'venue' : 'venues' }} on
          <label class="inline-flex items-center">
            <span class="sr-only">Date</span>
            <input
              appTouchTarget
              appFieldGlass
              class="cursor-pointer rounded-[10px] px-2 text-[13px]"
              type="date"
              [value]="state().date"
              (change)="filtered.emit({ date: dateOf($event) })"
            />
          </label>
        </p>
        <!-- The coast as chips, north → south, left → right: the way the band below runs. -->
        <nav
          class="-mx-4 flex min-w-0 basis-full gap-0.5 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:flex-1 lg:basis-auto lg:justify-end lg:px-0"
          aria-label="The coast, north to south"
        >
          <button
            type="button"
            appTouchTarget
            [class]="chip"
            [attr.aria-pressed]="state().region === '' && state().beach === ''"
            (click)="pickRegion('')"
          >
            Whole coast
          </button>
          @for (region of coast; track region.code) {
            <button
              type="button"
              appTouchTarget
              [class]="chip"
              [attr.aria-pressed]="activeRegion() === region.code"
              (click)="pickRegion(region.code)"
            >
              {{ region.label }}
              <span
                class="rounded-full bg-riv-ink/10 px-1.5 text-[11px] font-bold tabular-nums aria-pressed:bg-white/25"
                aria-hidden="true"
                >{{ region.venues }}</span
              >
            </button>
          }
        </nav>
      </div>

      <!-- The band: nothing over it but the map's own chrome, the pills and an open preview. -->
      <div
        #pane
        class="relative h-[250px] overflow-hidden bg-riv-solid-btn-fill lg:h-[clamp(360px,46vh,520px)]"
      >
        <div class="absolute inset-0 [&>app-riviera-map]:rounded-none">
          <app-riviera-map class="size-full" [nearMe]="true" (mapClick)="open.set(null)" />
        </div>
        <app-venue-pin-layer
          class="rounded-none!"
          [pins]="state().pins"
          [map]="mapHandle()"
          [selected]="litPin()"
          [maxZoom]="maxZoom"
          (chosen)="open.set($event)"
          (narrowed)="filtered.emit({ beach: $event })"
        />
        <span
          class="absolute top-3 left-3 z-[6] hidden h-9 items-center gap-0.5 rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill px-2.5 text-[12px] font-extrabold text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.22)] lg:inline-flex"
          [attr.aria-label]="'North is ' + bearing() + ' degrees anticlockwise from up'"
          title="North"
          ><span class="text-[15px] leading-none" [style.rotate]="-bearing() + 'deg'">↑</span
          >N</span
        >
        @if (openCard(); as card) {
          <app-venue-preview-card
            class="absolute bottom-3 left-3 z-[7] w-[min(380px,calc(100%-24px))]"
            [card]="card"
            [date]="state().date"
            (closed)="open.set(null)"
          />
        }
      </div>
    </div>

    <!-- The whole width for the venues: four columns at 1440, five at 1920. -->
    <div class="px-4 pt-5 pb-28 lg:px-6">
      @if (state().beach) {
        <p class="mb-3 flex items-center gap-3 text-[14px] text-riv-ink-soft">
          Showing <strong class="text-riv-ink">{{ beachName() }}</strong> only.
          <button
            type="button"
            appTouchTarget
            class="rounded-full border border-riv-accent-border bg-riv-accent-fill px-3 text-[13px] font-bold text-riv-accent-ink"
            (click)="filtered.emit({ beach: '' })"
          >
            Show the whole {{ activeRegion() ? 'region' : 'coast' }}
          </button>
        </p>
      }
      <ul class="grid list-none grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4">
        @for (card of state().cards; track card.id) {
          <li>
            <app-prototype-venue-card
              [card]="card"
              [selected]="litPin() === card.id + ''"
              photoClass="aspect-[16/9]"
              (hovered)="hovered.set($event)"
            />
          </li>
        }
      </ul>
    </div>
  `,
})
export class VariantHorizon {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly chip = CHIP;
  protected readonly coast = COAST;
  private readonly map = viewChild(RivieraMap);
  protected readonly mapHandle = computed(() => this.map()?.handle());
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  private readonly pane = viewChild.required<ElementRef<HTMLElement>>('pane');

  /** The venue whose preview is open (a pin press, or `?open=` on load), and the one a card hover points at. */
  protected readonly open = signal<string | null>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('open'),
  );
  protected readonly hovered = signal<number | null>(null);
  protected readonly litPin = computed(() => {
    const hover = this.hovered();
    return this.open() ?? (hover === null ? null : String(hover));
  });
  protected readonly openCard = computed<VenueCard | null>(() => {
    const id = this.open();
    return id === null ? null : (this.state().cards.find((c) => String(c.id) === id) ?? null);
  });

  /** The region the camera is on: the chosen one, or the chosen beach's. */
  protected readonly activeRegion = computed<RegionCode | ''>(() => {
    const { region, beach } = this.state();
    if (region !== '') {
      return region as RegionCode;
    }
    return beach === '' ? '' : (beachEntry(beach)?.region ?? '');
  });
  /** Up on the band, in compass degrees: the stretch's own bearing so the sea stays at the foot. */
  protected readonly bearing = computed(() => {
    const region = this.activeRegion();
    return region === '' ? COAST_BEARING : REGION_BEARING[region];
  });
  protected readonly beachName = computed(
    () => this.state().beaches.find((b) => b.code === this.state().beach)?.label ?? '',
  );

  protected pickRegion(code: string): void {
    this.filtered.emit({ region: code, beach: '' });
  }

  protected dateOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  constructor() {
    // Per result set: turn to the stretch's bearing and frame its pins clear of the band's chrome.
    let fenced = false;
    effect(() => {
      const handle = this.mapHandle();
      const pins = this.state().pins.map((p) => p.at);
      const bearing = this.bearing();
      if (handle === undefined) {
        return;
      }
      const raw = rawMap(handle);
      if (raw === null) {
        return;
      }
      if (!fenced) {
        constrainRotated(raw, RIVIERA_MAP_OPTIONS.maxBounds, () => this.bearing());
        // A full-width band would otherwise eat the page's wheel: zoom takes ctrl/⌘ + wheel here.
        raw.map.cooperativeGestures.enable();
        fenced = true;
      }
      const wide = this.pane().nativeElement.clientWidth >= 1024;
      // The foot's extra room absorbs the fence's push (prototype-raw-map.ts): ~60 px at 1440.
      fitRotated(raw, pins, bearing, {
        top: wide ? 20 : 28,
        bottom: wide ? 124 : 48,
        left: 64,
        right: wide ? 120 : 130,
      });
    });
  }
}
