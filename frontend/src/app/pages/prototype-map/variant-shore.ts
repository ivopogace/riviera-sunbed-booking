/**
 * PROTOTYPE variant Q — **Shore**. Built from the research rather than from memory: the map is
 * the GROUND and the list is a SHEET over it with three resting heights — the grammar
 * Airbnb's mobile search actually uses (measured: a 390 × 307 map band under a sheet resting at
 * y ≈ 441, the list being that same sheet pulled to the top), the one Google Maps and Apple Maps
 * settled on, and the one the HIG and Material both specify (medium/large detents, a grabber, a
 * sliver of map kept visible even at full).
 *
 * <p>What it takes, and from where:
 *
 * <ul>
 *   <li><b>One screen, three heights</b> (Airbnb 2026, Google Maps): no List/Map switch, no fixed
 *       band. The thumb sets the split; the map is never traded away and never in the way.
 *   <li><b>The first screen's map is a poster</b> (`prototype-poster.ts`): a still image of the
 *       region's fitted camera with the shipped pins live over it, so the first paint costs one
 *       image rather than a WebGL context, 341 kB of glyphs and a tile fetch — the research's cost
 *       tables (Airbnb 14.8 MB; a vector map's first view 0.8–2 MB; a static image, one request).
 *       The live map arrives at the poster's camera the moment the camera has to move.
 *   <li><b>The sheet's head carries the query</b> — where, when, and the region's beaches as a
 *       chip rail (SunEasy's town → beach → club) — and stays visible at every
 *       height, so the day is never out of sight (invariant #4).
 *   <li><b>The row is the preview</b>: a pin press raises the sheet to half and brings the row to
 *       its top, lit. No second card over the map.
 *   <li><b>Sun rules</b> from the glare research: dark ink on light glass, no text under 12.5 px,
 *       nothing thinner than semibold on the map, 44 px pins with room around them.
 * </ul>
 *
 * <p>From `lg` up the sheet becomes the left panel and the ground the right pane — the map takes
 * the width the set's shape needs (a 360 px column for the whole coast, up to 60 % for Himarë)
 * and the list keeps the rest. Desktop is the same page with the sheet
 * pinned open beside the map, not a second design.
 *
 * <p>The phone sheet is a CSS scroll-snap container that starts at the full line, so nothing it
 * holds paints over the map's sliver: a transparent spacer the height of peek-to-full, the peek
 * and half rest points as zero-height snap targets inside it, and the sheet itself snapping at
 * full. Past full the sheet covers the snapport, which the spec lets rest anywhere — one finger
 * raises the sheet, keeps scrolling the list, and lowers it again by pulling the list down.
 * Touches on the spacer fall through to the map.
 *
 * <p>URL: `?variant=Q` · `&sheet=peek|half|full` · `&live=1` (the live map from the first paint,
 * for the cost row) · `&here=lng,lat` · `&region=` · `&beach=` · `&now=16:30` ·
 * `&poster=<key>` (the driver's poster-rendering mode: the bare fitted map at 440 × 380).
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { beachEntry, regionLabel } from '../../shared/beaches';
import { todayBookingDate } from '../../shared/booking-date';
import { GeolocationGateway } from '../../shared/geolocation';
import { LngLat, MapHandle, MapView } from '../../shared/map-engine';
import { PanelGlass } from '../../shared/panel-glass';
import { RivieraMap, RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { TouchTarget } from '../../shared/touch-target';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { contentAspect } from './prototype-aspect';
import { fitPins } from './prototype-camera';
import { COAST } from './prototype-coast';
import { PrototypeCoastPicker } from './prototype-coast-picker';
import { closedForTodayAt, daysFrom, parseClock } from './prototype-days';
import { PrototypeFilter, PrototypeState } from './prototype-map-page';
import {
  BeachGroup,
  distanceKm,
  distanceLabel,
  groupByBeach,
  locationOf,
  nearestRegion,
} from './prototype-place';
import {
  HEADER_H,
  POSTER_H,
  POSTER_W,
  PosterHandle,
  posterCamera,
  posterKey,
  posterUrl,
} from './prototype-poster';
import { PROTOTYPE_VENUES } from './prototype-venues';
import { PrototypeVenueCard } from './prototype-venue-card';
import { PrototypeVenueRow } from './prototype-venue-row';

const PHONE_DEFAULT_REGION = 'HIMARE';
/** Tailwind's `lg`. */
const WIDE_PX = 1024;
/** The shipped phone tab bar. */
const TAB_BAR = 61;
/** The sheet's head at peek: the grabber and the place row only — Airbnb's collapsed header is ~80. */
const HEAD_PEEK = 80;
/** At full the map keeps a sliver under the header — Google Maps' rule; the sliver is the way back. */
const FULL_SLIVER = 44;
/** Chrome the fit keeps clear of, on the live map. */
const PAD = 76;
const DUSK_CLASSES = ['opacity-45', 'saturate-50'];

type Detent = 'peek' | 'half' | 'full';

interface Focus {
  readonly cards: readonly VenueCard[];
  readonly region: string;
  readonly beach: string;
}

/** A rail entering: from a little above and transparent; leaving: back the same way, held until it ends. */
const RAIL =
  'flex gap-1.5 overflow-x-auto px-3 pt-1 pb-1 scrollbar-none starting:-translate-y-1 starting:opacity-0 ' +
  'motion-safe:[transition:opacity_0.18s_ease,translate_0.18s_ease]';
const RAIL_LEAVE = 'opacity-0 -translate-y-1';

const CHIP =
  'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-[13px] text-[14px] font-semibold ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'aria-[current]:border-riv-accent-ink aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink ' +
  'border-riv-field-border bg-riv-field-fill text-riv-ink';
const COUNT =
  'inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold ' +
  'bg-riv-accent-ink text-riv-on-accent-ink group-aria-[current]:bg-riv-on-accent-ink group-aria-[current]:text-riv-accent-ink';
const MAP_BUTTON =
  'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-full border-2 px-[14px] text-[14px] font-bold ' +
  'shadow-[0_6px_18px_rgba(7,42,58,0.3)]';

@Component({
  selector: 'app-variant-shore',
  imports: [
    NgTemplateOutlet,
    PanelGlass,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    PrototypeCoastPicker,
    PrototypeVenueRow,
    PrototypeVenueCard,
  ],
  host: { class: 'block' },
  template: `
    <!-- ── The head: where, when, which beach. The phone sheet's and the desktop panel's. ── -->
    <ng-template #head>
      <div class="flex items-center gap-2 px-3" data-strip>
        <button
          type="button"
          appTouchTarget
          data-open-picker
          class="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-1.5 text-left"
          [attr.aria-expanded]="pickerOpen()"
          (click)="pickerOpen.set(!pickerOpen())"
        >
          <span
            class="text-[19px] leading-none"
            [class]="state().here !== null ? 'text-riv-accent-ink' : 'text-riv-ink-faint'"
            aria-hidden="true"
            >{{ state().here !== null ? '◎' : '⌖' }}</span
          >
          <span class="flex min-w-0 flex-col">
            <span
              class="truncate text-[19px] leading-[1.1] font-bold tracking-[-0.01em] text-riv-ink"
              >{{ title() }}
              <span class="text-[13px] font-normal text-riv-ink-faint" aria-hidden="true">▾</span>
            </span>
            <span class="truncate text-[12.5px] leading-[1.25] text-riv-ink-soft">{{
              subtitle()
            }}</span>
          </span>
        </button>
        <button
          type="button"
          appTouchTarget
          data-ctl="day"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-riv-field-border bg-riv-field-fill px-3 text-[14px] font-semibold text-riv-ink"
          [attr.aria-expanded]="dayOpen()"
          (click)="dayOpen.set(!dayOpen()); beachesOpen.set(false)"
        >
          <span aria-hidden="true">📅</span>{{ dayWord() }}
          <span class="text-[11px] text-riv-ink-faint" aria-hidden="true">▾</span>
        </button>
      </div>
      @if (railsShown()) {
        @if (dayOpen()) {
          <div [class]="RAIL" [animate.leave]="RAIL_LEAVE" role="group" aria-label="Day">
            @for (day of days(); track day.date) {
              <button
                type="button"
                appTouchTarget
                [class]="CHIP"
                [attr.aria-current]="day.date === state().date ? 'true' : null"
                (click)="pickDay(day.date)"
              >
                {{ day.isToday ? 'Today' : day.weekday + ' ' + day.label }}
              </button>
            }
          </div>
        } @else if (beachesOpen()) {
          <div [class]="RAIL" [animate.leave]="RAIL_LEAVE" role="group" aria-label="Beach">
            <button
              type="button"
              appTouchTarget
              [class]="CHIP + ' group'"
              [attr.aria-current]="focus().beach === '' ? 'true' : null"
              (click)="pickBeach('')"
            >
              All <span [class]="COUNT">{{ regionCards().length }}</span>
            </button>
            @for (b of beaches(); track b.code) {
              <button
                type="button"
                appTouchTarget
                [class]="CHIP + ' group'"
                [attr.aria-current]="focus().beach === b.code ? 'true' : null"
                (click)="pickBeach(b.code)"
              >
                {{ b.label }} <span [class]="COUNT">{{ b.venues }}</span>
              </button>
            }
          </div>
        } @else {
          <!-- The rail gathered into one chip: the beach that is chosen, or all of them; press to open it. -->
          <div [class]="RAIL" [animate.leave]="RAIL_LEAVE">
            <button
              type="button"
              appTouchTarget
              data-ctl="beaches"
              [class]="CHIP + ' group'"
              [attr.aria-current]="focus().beach !== '' ? 'true' : null"
              aria-expanded="false"
              (click)="openBeaches()"
            >
              <span aria-hidden="true">⛱</span>
              {{ beachChipLabel() }}
              <span [class]="COUNT">{{ beachChipCount() }}</span>
              <span class="text-[11px] opacity-70" aria-hidden="true">▾</span>
            </button>
          </div>
        }
        @if (selectedCard(); as card) {
          <!-- The pin's preview: its row, in the head, until the map is tapped clear. -->
          <div
            class="px-3 pt-1 pb-2 starting:opacity-0 motion-safe:[transition:opacity_0.18s_ease]"
            [animate.leave]="'opacity-0'"
          >
            <app-prototype-venue-row
              [card]="card"
              [date]="state().date"
              [selected]="true"
              [dusk]="duskIds().has('' + card.id)"
              [km]="rowKm(card)"
            />
          </div>
        }
      }
    </ng-template>

    <!-- ── The list: the beach as the unit, the row as the preview. ── -->
    <ng-template #list>
      <div [class]="cardsGrid() ? 'grid gap-3 ' + gridCols() : 'flex flex-col'">
        @for (group of groups(); track group.code) {
          <h2
            class="col-span-full mt-3 mb-1.5 flex items-baseline gap-2 px-1 text-[13px] text-riv-ink-soft first:mt-1"
            [class.mb-0]="cardsGrid()"
          >
            <span class="text-[16px] font-bold tracking-[-0.01em] text-riv-ink">{{
              group.label
            }}</span>
            @if (group.km !== null) {
              <span class="font-semibold text-riv-accent-ink">{{ kmLabel(group.km) }}</span>
            }
            <span class="ml-auto shrink-0"
              >{{ group.cards.length }} {{ group.cards.length === 1 ? 'venue' : 'venues' }}</span
            >
          </h2>
          @for (card of group.cards; track card.id) {
            @if (cardsGrid()) {
              <div [attr.data-row]="card.id">
                <app-prototype-venue-card
                  [card]="card"
                  [selected]="selected() === '' + card.id"
                  (hovered)="hovered.set($event)"
                />
              </div>
            } @else {
              <app-prototype-venue-row
                class="mb-2"
                [card]="card"
                [date]="state().date"
                [selected]="selected() === '' + card.id"
                [dusk]="duskIds().has('' + card.id)"
                [km]="rowKm(card)"
                (pressed)="selected.set('' + $event)"
              />
            }
          }
        }
      </div>
      @if (groups().length === 0) {
        <p class="px-2 py-8 text-center text-[14px] text-riv-ink-soft">
          No venues here for this date. Pick another place on the coast.
        </p>
      }
    </ng-template>

    <!-- ── The ground: the poster, then the live map when the camera has to move. ── -->
    <ng-template #ground>
      @if (!wide() && !liveReady()) {
        <!-- The poster's touch surface is a control: a finger on it is a pan, and wakes the live map. -->
        <button
          type="button"
          class="absolute inset-0 z-[1] block cursor-grab touch-none"
          aria-label="Move the map"
          data-touch-exempt="the whole ground"
          (pointerdown)="wake(null)"
          (click)="selected.set(null)"
        >
          <img
            class="pointer-events-none absolute top-0 left-1/2 max-w-none -translate-x-1/2 select-none"
            [style.width.px]="POSTER_W"
            [style.height.px]="POSTER_H"
            [src]="posterSrc()"
            alt=""
            draggable="false"
            data-poster
          />
        </button>
      }
      @if (live() || wide()) {
        <div
          class="absolute inset-0 [&>app-riviera-map]:rounded-none"
          [class]="wide() ? '' : PHONE_CHROME"
          [class.opacity-0]="!wide() && !liveReady()"
        >
          <app-riviera-map class="size-full" [nearMe]="false" (mapClick)="selected.set(null)" />
        </div>
      }
      <app-venue-pin-layer
        class="rounded-none!"
        [pins]="pins()"
        [map]="handle()"
        [selected]="litPin()"
        [maxZoom]="maxZoom"
        (chosen)="choose($event)"
        (narrowed)="filtered.emit({ beach: $event })"
      />
      @if (hereDot(); as dot) {
        <span
          class="pointer-events-none absolute z-[3] block size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_0_0_6px_rgba(10,79,94,0.18),0_4px_12px_rgba(7,42,58,0.35)]"
          role="img"
          aria-label="You are here"
          [style.left.px]="dot.x"
          [style.top.px]="dot.y"
        ></span>
      }
      <!-- Near me: on the phone, the map's foot at half — mid-screen, the thumb's natural zone. -->
      @if (wide() || detent() !== 'full') {
        <button
          type="button"
          appTouchTarget
          data-ctl="near-me"
          class="absolute right-3 z-[8]"
          [class]="
            MAP_BUTTON +
            ' ' +
            (state().here !== null
              ? 'border-riv-solid-btn-fill bg-riv-solid-btn-ink text-riv-solid-btn-fill'
              : 'border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink')
          "
          [style.top.px]="wide() ? null : nearMeTop()"
          [style.bottom.px]="wide() ? 12 : null"
          [attr.aria-pressed]="state().here !== null"
          (click)="locate()"
        >
          <span aria-hidden="true">◎</span>
          {{ state().here !== null ? 'You are here' : 'Near me' }}
        </button>
      }
    </ng-template>

    @if (poster() !== null) {
      <!-- The driver's poster mode: the bare fitted map, nothing else, at the poster's box. -->
      <div
        class="fixed top-0 left-0 z-[1000] bg-riv-solid-btn-fill [&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:hidden [&>app-riviera-map]:rounded-none"
        [style.width.px]="POSTER_W"
        [style.height.px]="POSTER_H"
      >
        <app-riviera-map class="size-full" [nearMe]="false" />
      </div>
    } @else if (wide()) {
      <!-- ── Desktop: the sheet is the left panel, pinned open; the map is the rest. ── -->
      <div class="flex h-[calc(100dvh-68px)] gap-3 p-3 pr-0">
        <aside
          appPanelGlass
          class="flex shrink-0 flex-col overflow-hidden rounded-[22px] shadow-[0_10px_32px_rgba(7,42,58,0.16)]"
          [style.width.px]="panelWidth()"
        >
          <div class="relative shrink-0 border-b border-riv-header-border pt-3 pb-1">
            <ng-container *ngTemplateOutlet="head" />
            @if (pickerOpen()) {
              <app-prototype-coast-picker
                [region]="state().region"
                [beach]="state().beach"
                [located]="state().here !== null"
                (picked)="filtered.emit($event)"
                (nearMe)="locate()"
                (closed)="pickerOpen.set(false)"
              />
            }
          </div>
          <div #body class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
            <ng-container *ngTemplateOutlet="list" />
          </div>
        </aside>
        <div
          #pane
          class="relative min-w-0 flex-1 overflow-hidden rounded-l-[22px] bg-riv-solid-btn-fill"
        >
          <ng-container *ngTemplateOutlet="ground" />
        </div>
      </div>
    } @else {
      <!-- ── Phone: the ground under the glass header, the sheet over it, the tab bar under all. ── -->
      <div #pane class="fixed inset-0 z-[1] overflow-hidden bg-riv-solid-btn-fill">
        <ng-container *ngTemplateOutlet="ground" />
      </div>

      <!-- The sheet: a scroll-snap container from the full line down (see the class doc). -->
      <div
        #scroller
        class="pointer-events-none fixed inset-x-0 z-[10] overflow-y-auto overscroll-contain scrollbar-none motion-safe:scroll-smooth snap-y snap-mandatory"
        [style.top.px]="tops().full"
        [style.bottom.px]="TAB_BAR"
        [attr.data-detent]="detent()"
        (scroll)="onScroll()"
      >
        <div class="relative" [style.height.px]="tops().peek - tops().full">
          <div class="absolute inset-x-0 top-0 h-0 snap-start snap-always"></div>
          <div
            class="absolute inset-x-0 h-0 snap-start snap-always"
            [style.top.px]="tops().peek - tops().half"
          ></div>
        </div>
        <div
          appPanelGlass
          class="pointer-events-auto snap-start snap-always rounded-t-[26px] shadow-[0_-12px_40px_rgba(7,42,58,0.28)]"
          [style.min-height.px]="viewport().h - TAB_BAR - tops().full"
          role="region"
          aria-label="Venues"
        >
          <div
            class="sticky top-0 z-[2] rounded-t-[26px] bg-riv-pop-surface backdrop-blur-[22px]"
            data-head
          >
            <button
              type="button"
              class="flex h-[22px] w-full items-center justify-center"
              data-ctl="grabber"
              data-touch-exempt="the whole head is the drag surface; the bar is its cue"
              aria-label="Resize the list"
              (click)="cycle()"
            >
              <span
                class="block h-[5px] w-9 rounded-full bg-riv-ink-faint"
                aria-hidden="true"
              ></span>
            </button>
            <ng-container *ngTemplateOutlet="head" />
          </div>
          <div data-body class="px-3 pb-6">
            <ng-container *ngTemplateOutlet="list" />
          </div>
        </div>
      </div>

      @if (detent() === 'full') {
        <div
          class="pointer-events-none fixed inset-x-0 z-[11] flex justify-center"
          [style.bottom.px]="TAB_BAR + 12"
        >
          <button
            type="button"
            appTouchTarget
            data-ctl="map-pill"
            class="pointer-events-auto inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-riv-accent-ink px-5 text-[15px] font-bold text-riv-on-accent-ink shadow-[0_10px_28px_rgba(7,42,58,0.35)]"
            (click)="go('half')"
          >
            <span aria-hidden="true">⌖</span> Map
          </button>
        </div>
      }

      @if (pickerOpen()) {
        <app-prototype-coast-picker
          [region]="state().region"
          [beach]="state().beach"
          [located]="state().here !== null"
          (picked)="filtered.emit($event)"
          (nearMe)="locate()"
          (closed)="pickerOpen.set(false)"
        />
      }
    }
  `,
})
export class VariantShore {
  readonly state = input.required<PrototypeState>();
  readonly filtered = output<PrototypeFilter>();

  protected readonly CHIP = CHIP;
  protected readonly RAIL = RAIL;
  protected readonly RAIL_LEAVE = RAIL_LEAVE;
  protected readonly COUNT = COUNT;
  protected readonly MAP_BUTTON = MAP_BUTTON;
  protected readonly TAB_BAR = TAB_BAR;
  protected readonly POSTER_W = POSTER_W;
  protected readonly POSTER_H = POSTER_H;
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  /** No zoom column below `lg` (a pinch zooms); the credit in the top-right, under the header. */
  protected readonly PHONE_CHROME =
    '[&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:top-[76px] [&_app-riviera-map>p]:bottom-auto [&_app-riviera-map>p]:text-[11px]';

  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly geolocation = inject(GeolocationGateway);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly wide = signal(false);
  protected readonly viewport = signal({ w: 390, h: 844 });
  protected readonly poster = computed(() => this.params().get('poster'));
  private readonly askedDetent = (this.params().get('sheet') as Detent | null) ?? 'half';
  /** The scroller's `scrollTop`, mirrored on every scroll event: the one number the sheet is. */
  private readonly scrolled = signal(0);
  protected readonly live = signal(this.params().get('live') === '1');
  protected readonly liveReady = signal(false);
  protected readonly pickerOpen = signal(false);
  protected readonly dayOpen = signal(false);
  protected readonly beachesOpen = signal(false);
  /** The rails and the preview row hide at peek: the head is the place row alone there. */
  protected readonly railsShown = computed(() => this.wide() || this.detent() !== 'peek');
  protected readonly beachChipLabel = computed(() => {
    const beach = this.focus().beach;
    if (beach !== '') return this.groups()[0]?.label ?? '';
    const n = this.beaches().length;
    return n === 1 ? 'One beach' : 'All beaches';
  });
  protected readonly beachChipCount = computed(() =>
    this.focus().beach !== '' ? this.focus().cards.length : this.beaches().length,
  );
  protected readonly selectedCard = computed(() => {
    const id = this.selected();
    return id === null ? null : (this.focus().cards.find((c) => String(c.id) === id) ?? null);
  });
  protected readonly selected = signal<string | null>(null);
  protected readonly hovered = signal<number | null>(null);
  protected readonly litPin = computed(() => {
    const hover = this.hovered();
    return this.selected() ?? (hover === null ? null : String(hover));
  });

  private readonly now = computed(() => parseClock(this.params().get('now')) ?? tiraneMinutes());
  private readonly today = todayBookingDate(new Date());
  private readonly isToday = computed(() => this.state().date === this.today);
  protected readonly days = computed(() => daysFrom(this.today, this.today));
  protected readonly dayWord = computed(() => {
    const date = this.state().date;
    if (date === this.today) return 'Today';
    if (date === this.days()[1]?.date) return 'Tomorrow';
    const day = this.days().find((d) => d.date === date);
    return day ? `${day.weekday} ${day.label}` : this.state().dateLabel;
  });

  /** A region, never the coast, on a phone; the desktop can frame the coast and opens on it. */
  protected readonly focus = computed<Focus>(() => {
    const s = this.state();
    if (s.beach !== '') {
      return { cards: s.cards, region: beachEntry(s.beach)?.region ?? '', beach: s.beach };
    }
    if (s.region !== '') return { cards: s.cards, region: s.region, beach: '' };
    const region =
      s.here !== null ? nearestRegion(s.here, s.cards) : this.wide() ? '' : PHONE_DEFAULT_REGION;
    if (region === '') return { cards: s.cards, region: '', beach: '' };
    return {
      cards: s.cards.filter((c) => beachEntry(c.beach)?.region === region),
      region,
      beach: '',
    };
  });
  /** The region's whole set, for the `All` chip's count while one beach is chosen. */
  protected readonly regionCards = computed(() => {
    const region = this.focus().region;
    return region === ''
      ? PROTOTYPE_VENUES
      : PROTOTYPE_VENUES.filter((c) => beachEntry(c.beach)?.region === region);
  });
  protected readonly beaches = computed(() => {
    const region = this.focus().region;
    return region === ''
      ? COAST.flatMap((r) => r.beaches)
      : (COAST.find((r) => r.code === region)?.beaches ?? []);
  });
  protected readonly pins = computed(() =>
    this.focus().cards.map((card) => ({ id: String(card.id), at: locationOf(card), card })),
  );
  protected readonly groups = computed<readonly BeachGroup[]>(() =>
    groupByBeach(this.focus().cards, this.state().here),
  );
  protected readonly duskIds = computed<ReadonlySet<string>>(() => {
    if (!this.isToday()) return new Set();
    const now = this.now();
    return new Set(
      this.focus()
        .cards.filter((c) => closedForTodayAt(c, now))
        .map((c) => String(c.id)),
    );
  });
  protected readonly selling = computed(() => this.focus().cards.length - this.duskIds().size);

  protected readonly title = computed(() => {
    const { region, beach } = this.focus();
    if (beach !== '') return this.groups()[0]?.label ?? '';
    if (this.state().here !== null && this.state().region === '') {
      return this.groups()[0]?.label ?? 'Near you';
    }
    return region === '' ? 'The whole coast' : regionLabel(region);
  });
  protected readonly subtitle = computed(() => {
    const { cards, region, beach } = this.focus();
    const n = `${cards.length} ${cards.length === 1 ? 'venue' : 'venues'}`;
    const still = this.isToday() ? ` · ${this.selling()} selling today` : '';
    const located = this.state().here !== null && this.state().region === '';
    const where = located
      ? `Near you · ${regionLabel(region)} · `
      : beach !== ''
        ? `${regionLabel(region)} · `
        : region === ''
          ? 'Velipojë to Ksamil · '
          : '';
    return `${where}${n}${still}`;
  });

  // ── the ground ──────────────────────────────────────────────────────────────────────────
  private readonly posterHandle = computed<PosterHandle | null>(() => {
    const camera = posterCamera(this.pins().map((p) => p.at));
    if (camera === null) return null;
    return new PosterHandle(camera, this.viewport().w, (view) => this.wake(view));
  });
  protected readonly posterSrc = computed(() =>
    posterUrl(posterKey(this.focus().region, this.focus().beach)),
  );
  private readonly liveHandle = computed(() => this.map()?.handle());
  /** The pins project through the live map once it is up, the poster's camera until then. */
  protected readonly handle = computed<MapHandle | undefined>(() =>
    this.wide() || this.liveReady() ? this.liveHandle() : (this.posterHandle() ?? undefined),
  );
  private readonly moved = signal(0);
  protected readonly hereDot = computed(() => {
    this.moved();
    const here = this.state().here;
    const handle = this.handle();
    if (here === null || handle === undefined) return null;
    return handle.project(here);
  });
  protected readonly nearMeTop = computed(() => Math.max(HEADER_H + 8, this.sheetTop() - 56));

  // ── the sheet ────────────────────────────────────────────────────────────────────────────
  /** Where the sheet's top rests, in viewport px, at each height. */
  protected readonly tops = computed(() => ({
    full: HEADER_H + FULL_SLIVER,
    half: POSTER_H,
    peek: this.viewport().h - TAB_BAR - HEAD_PEEK,
  }));
  /** The scroller's offset for a height: the spacer's height less where the sheet's top rests. */
  private offsetFor(detent: Detent): number {
    return this.tops().peek - this.tops()[detent];
  }
  protected readonly sheetTop = computed(() =>
    Math.max(this.tops().full, this.tops().peek - this.scrolled()),
  );
  /** The nearest rest: half way between two rests decides, and anything past full is full. */
  protected readonly detent = computed<Detent>(() => {
    const at = this.scrolled();
    const half = this.offsetFor('half');
    const full = this.offsetFor('full');
    return at < half / 2 ? 'peek' : at < (half + full) / 2 ? 'half' : 'full';
  });

  protected onScroll(): void {
    const scroller = this.scroller()?.nativeElement;
    if (scroller === undefined) return;
    this.scrolled.set(scroller.scrollTop);
    if (this.detent() === 'peek') this.wake(null);
  }

  /** Rest the sheet at a height; the container's own `scroll-behavior` decides whether it glides. */
  protected go(detent: Detent): void {
    this.scroller()?.nativeElement.scrollTo({ top: this.offsetFor(detent) });
    if (detent === 'peek') this.wake(null);
  }

  protected cycle(): void {
    const next: Record<Detent, Detent> = { half: 'full', full: 'peek', peek: 'half' };
    this.go(next[this.detent()]);
  }

  /** A pin press: the venue's row joins the head as the preview, and a lowered sheet rises to half. */
  protected choose(id: string): void {
    this.selected.set(id);
    if (this.detent() === 'peek') this.go('half');
  }

  /** A rail opens with its lit chip in view, wherever along the coast it sits. */
  private revealCurrentChip(): void {
    this.element.nativeElement
      .querySelector('[role="group"] [aria-current]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  protected openBeaches(): void {
    this.beachesOpen.set(true);
    this.dayOpen.set(false);
    setTimeout(() => this.revealCurrentChip());
  }

  protected pickBeach(code: string): void {
    this.filtered.emit(code === '' ? { beach: '', region: this.focus().region } : { beach: code });
    this.beachesOpen.set(false);
  }

  protected pickDay(date: string): void {
    this.filtered.emit({ date });
    this.dayOpen.set(false);
  }

  protected async locate(): Promise<void> {
    const outcome = await this.geolocation.locate();
    if (outcome.kind === 'located') {
      this.filtered.emit({ here: outcome.at, region: '', beach: '' });
    }
  }

  private pending: MapView | null = null;

  /**
   * Swap the live map in at the poster's camera, then honour the move that asked for it — aimed
   * at the window the sheet leaves, not at the viewport's centre under the sheet.
   */
  protected wake(view: MapView | null): void {
    if (view !== null) {
      const visible = this.tops()[this.detent() === 'full' ? 'half' : this.detent()] - HEADER_H;
      const shift = this.viewport().h / 2 - (HEADER_H + visible / 2);
      const perPixel = (360 / (512 * 2 ** view.zoom)) * Math.cos((view.center.lat * Math.PI) / 180);
      this.pending = {
        center: { lng: view.center.lng, lat: view.center.lat - shift * perPixel },
        zoom: view.zoom,
      };
    }
    this.live.set(true);
  }

  // ── the desktop pane ─────────────────────────────────────────────────────────────────────
  /**
   * The map takes the width its set needs — the pane's height over the set's own aspect
   * (`prototype-aspect.ts`) — between a 360 px column and 60 % of the window; the panel keeps
   * the rest.
   */
  protected readonly panelWidth = computed(() => {
    const { w, h } = this.viewport();
    const aspect = contentAspect(this.pins().map((p) => p.at)) ?? 1;
    const wanted = (h - 68 - 24 - PAD) / aspect + PAD;
    const map = Math.round(Math.max(360, Math.min(w * 0.6, wanted)));
    return Math.max(420, w - map - 24);
  });
  protected readonly cardsGrid = computed(() => this.wide() && this.panelWidth() >= 760);
  protected readonly gridCols = computed(() => {
    const w = this.panelWidth();
    return w >= 1400 ? 'grid-cols-4' : w >= 1000 ? 'grid-cols-3' : 'grid-cols-2';
  });

  protected kmLabel(km: number): string {
    return distanceLabel(km);
  }

  protected rowKm(card: VenueCard): string | null {
    const here = this.state().here;
    return here === null ? null : distanceLabel(distanceKm(here, locationOf(card)));
  }

  constructor() {
    afterRenderEffect(() => {
      this.viewport.set({ w: window.innerWidth, h: window.innerHeight });
      this.wide.set(window.innerWidth >= WIDE_PX);
    });
    let rested = false;
    afterRenderEffect(() => {
      const scroller = this.scroller()?.nativeElement;
      this.viewport();
      if (scroller === undefined || rested) return;
      rested = true;
      scroller.scrollTo({ top: this.offsetFor(this.askedDetent), behavior: 'instant' });
      this.scrolled.set(scroller.scrollTop);
      if (this.askedDetent === 'peek') this.wake(null);
    });
    let wired: MapHandle | undefined;
    afterRenderEffect(() => {
      const handle = this.liveHandle();
      const pane = this.pane()?.nativeElement;
      const pins = this.pins().map((p) => p.at);
      const detent = this.detent();
      const poster = this.poster();
      if (handle === undefined) return;
      if (poster !== null) {
        if (wired === handle) return;
        wired = handle;
        const camera = posterCamera(posterPins(poster));
        if (camera !== null) handle.setView(camera);
        handle.on('load', () => {
          setTimeout(
            () => ((window as unknown as { __rivPosterReady: boolean }).__rivPosterReady = true),
            1500,
          );
        });
        return;
      }
      if (pane === undefined) return;
      if (wired !== handle) {
        wired = handle;
        handle.onMove(() => this.moved.update((n) => n + 1));
        handle.on('load', () => this.liveReady.set(true));
        if (!this.wide()) {
          const camera = fitUnderHeader(pins, pane.clientWidth, this.tops().half);
          if (camera !== null) handle.setView(camera);
          if (this.pending !== null) {
            handle.easeTo(this.pending);
            this.pending = null;
            return;
          }
        }
      }
      const view = this.wide()
        ? fitPins(pins, pane.clientWidth, pane.clientHeight)
        : detent === 'full'
          ? null
          : fitUnderHeader(pins, pane.clientWidth, this.tops()[detent]);
      if (view !== null) handle.easeTo(view);
    });
    afterRenderEffect(() => {
      const dusk = this.duskIds();
      this.pins();
      this.handle();
      this.moved();
      for (const button of this.element.nativeElement.querySelectorAll<HTMLElement>('[data-pin]')) {
        const at = dusk.has(button.dataset['pin'] ?? '');
        for (const cls of DUSK_CLASSES) button.classList.toggle(cls, at);
      }
    });
  }
}

/** The pins of a poster key: a region's, or `beach-<code>`'s. */
function posterPins(key: string): LngLat[] {
  const cards = key.startsWith('beach-')
    ? PROTOTYPE_VENUES.filter((c) => c.beach === key.slice('beach-'.length))
    : PROTOTYPE_VENUES.filter((c) => beachEntry(c.beach)?.region === key);
  return cards.map(locationOf);
}

/**
 * Fit into the map visible between the header and `sheetTop`, then centre on that window: the
 * pane is the whole viewport, so the camera looks as far south of the pins as the pane's centre
 * sits below the window's, and the pins land in the window.
 */
function fitUnderHeader(pins: readonly LngLat[], width: number, sheetTop: number): MapView | null {
  const visible = sheetTop - HEADER_H;
  const view = fitPins(pins, width, visible);
  if (view === null) return null;
  const perPixel = (360 / (512 * 2 ** view.zoom)) * Math.cos((view.center.lat * Math.PI) / 180);
  const shift = window.innerHeight / 2 - (HEADER_H + visible / 2);
  return {
    center: { lng: view.center.lng, lat: view.center.lat - shift * perPixel },
    zoom: view.zoom,
  };
}

function tiraneMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tirane',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return parseClock(parts) ?? 0;
}
