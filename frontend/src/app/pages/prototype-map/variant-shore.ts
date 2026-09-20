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
 *   <li><b>The sheet's head is one row</b> — where, which beach, when — 78 px at every height
 *       (Airbnb's collapsed header is ~80), so the day is never out of sight (invariant #4) and the
 *       first row lands 40 px higher than round 6's two-row head put it.
 *   <li><b>The row is the preview</b>: a pin press raises the sheet to half and scrolls the venue's
 *       own row to the top of the list, lit. No copy in the head, no second card over the map.
 *   <li><b>Sun rules</b> from the glare research: dark ink on light glass, no text under 12.5 px,
 *       nothing thinner than semibold on the map, 44 px pins with room around them.
 * </ul>
 *
 * <p>From `lg` up the sheet becomes the left panel and the ground the right pane — the map takes
 * the width its set needs, never under 40 % of the window, and the list keeps the rest, one venue
 * a row; under ~560 px of pane the pins become dots with their pills in a label gutter. The
 * desktop opens on a region as the phone does (round 8: the whole coast is an index no pane can
 * frame) and the coast picker is its chooser (round 9: a coast-line strip over the panel was
 * tried and cut). Desktop is the same page with the sheet pinned open beside the map, not a
 * second design.
 *
 * <p>The phone sheet is two scrollers, not one. The OUTER is a CSS scroll-snap container from the
 * full line down: a transparent spacer holding the peek and half rest points as zero-height snap
 * targets, then the sheet itself, exactly the snapport's height, snapping at full — so a flick
 * stops at full instead of running 700 px into the list (round 7 measured round 6's single
 * scroller doing exactly that). The INNER is the list, a scroller at full and `overflow: clip`
 * below it (a hidden overflow is still a scroll container, and Chrome latches the touch to it and
 * drops the gesture — measured); at its top a pull latches to the outer and lowers the sheet, the
 * browser's own scroll latching, no arithmetic. Touches on the spacer fall through to the map.
 *
 * <p>URL: `?variant=Q` · `&sheet=peek|half|full` · `&live=1` (the live map from the first paint,
 * for the cost row) · `&here=lng,lat` · `&region=` · `&beach=` · `&now=16:30` ·
 * `&head=subtitle` (the beach in the subtitle instead of a chip) · `&pane=free` (the desktop
 * pane's height follows the set too) · `&poster=<key>` (the driver's poster-rendering mode: the
 * bare fitted map at 440 × 380).
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  linkedSignal,
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
import {
  crowdCentre,
  crowdPins,
  HANG_PX,
  lowestFromPrice,
  PIN_HEIGHT_PX,
  PinCrowd,
  placeName,
  separationZoom,
} from '../home/pin-crowding';
import { VenuePinLayer } from '../home/venue-pin-layer';
import { VenueCard } from '../home/venue-card';
import { contentAspect } from './prototype-aspect';
import { fitPins } from './prototype-camera';
import { applyHeaderTreatment, headerTreatment } from './prototype-header';
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
  BEACH_MAX_ZOOM,
  FOOT,
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
/** Nearer than this to the nearest beach, the tourist is on it and it is the title. */
const ON_BEACH_KM = 3;
/** `shared/riviera-map.ts`'s own words for a position outside its fence; verbatim, so the two agree. */
const OFF_MAP_NOTE = 'You don’t seem to be on the Albanian riviera — the map hasn’t moved.';
/** Tailwind's `lg`. */
const WIDE_PX = 1024;
/** Two row columns in the sheet from here: 600 px of sheet is two rows inside round 7's 300–400. */
const TWO_COLUMN_PX = 600;
/** The shipped phone tab bar's height while it is on screen; it hides at `sm` and is measured. */
const TAB_BAR = 61;
/** The sheet's head: the grabber and the one-row strip — 78, against Airbnb's ~80 collapsed header. */
const HEAD = 78;
/** At full the map keeps a sliver under the header — Google Maps' rule; the sliver is the way back. */
const FULL_SLIVER = 44;
/** Chrome the fit keeps clear of, on the live map. */
const PAD = 76;
/** Under this pane width a place pill lands on the zoom column; the pins become dots and a gutter. */
const PILLS_FROM_PX = 560;
/**
 * The desktop label gutter: the coast picker's ribbon logic inside the pane, down its RIGHT edge —
 * at 360 px the fence pins the camera to zoom 7 with the coast at x 78–200, and no inset can move
 * it (measured: a left gutter put the labels on the dots). The rows start under the zoom column
 * and end above Near me.
 */
const GUTTER_W = 172;
const GUTTER_ROW = 46;
const GUTTER_TOP = 118;
const GUTTER_BOTTOM = 64;
/**
 * A dusk pin keeps its ink and loses its colour: desaturated, on the fixed hover fill, its price
 * struck. Round 6 faded the whole button to 45 %, which put `Borsh · from €15` under 2:1 on the
 * map in every theme; and it reached the crowd members, whose `opacity-0` it overrode by
 * stylesheet order — the "member discs" round 6 blamed on the crowd rule.
 */
const DUSK_CLASSES = ['saturate-0', 'bg-riv-solid-btn-hover!', '[&_.font-extrabold]:line-through'];
/**
 * The merged-crowd DEMONSTRATION: what the pin layer would draw if `crowdPins` tested a pin
 * against its crowd's running mean rather than its first member. The compact disc that collided
 * disappears and the pill it collided with wears the union's name and count through `attr()`.
 */
const MERGED_HIDE = 'invisible';
/**
 * The repaint has to let the pill GROW (round 8: `Dhërmi & Drymades` ran 34 px out of a 111 px
 * pill and under its count disc). So the old face is zeroed rather than made transparent, and the
 * new one is an ordinary inline `::after` that the flex row measures — not an `absolute` overlay.
 */
const MERGED_FACE = 'text-[0px]! after:content-[attr(data-merged)] after:whitespace-nowrap';
const MERGED_NAME =
  MERGED_FACE +
  ' after:text-[12.5px] after:leading-[14px] after:font-semibold after:text-riv-solid-btn-ink';
const MERGED_FROM =
  MERGED_FACE +
  ' after:text-[11px] after:leading-[13px] after:font-extrabold after:text-riv-solid-btn-ink';
const MERGED_COUNT =
  MERGED_FACE +
  ' after:text-[12.5px] after:leading-none after:font-bold after:text-riv-solid-btn-fill';
/** A compact disc rescued by the vertical anchor, and how far it hangs off its point: a 10 px gap (12 left `3 beaches` on the dot at Dhërmi by 1 px). */
const HUNG_FACE = 'flex flex-col whitespace-nowrap text-left';
const HUNG_PX = 32;

type Detent = 'peek' | 'half' | 'full';

interface Focus {
  readonly cards: readonly VenueCard[];
  readonly region: string;
  readonly beach: string;
}

/** One gutter row: a crowd's pill in the gutter and its dot on the map, tied by a leader. */
interface GutterRow {
  readonly crowd: PinCrowd;
  readonly key: string;
  readonly name: string;
  readonly from: string | null;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  /** The row's centre in the gutter, pushed clear of its neighbours. */
  readonly rowY: number;
  readonly loneId: string | null;
}

/** A rail entering: from a little above and transparent; leaving: back the same way, held until it ends. */
const RAIL =
  'flex gap-1.5 overflow-x-auto px-3 pt-1 pb-2 scrollbar-none starting:-translate-y-1 starting:opacity-0 ' +
  'motion-safe:[transition:opacity_0.18s_ease,translate_0.18s_ease]';
const RAIL_LEAVE = 'opacity-0 -translate-y-1';

const CHIP =
  'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-[13px] text-[14px] font-semibold ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'aria-[current]:border-riv-accent-ink aria-[current]:bg-riv-accent-ink aria-[current]:text-riv-on-accent-ink ' +
  'border-riv-field-border bg-riv-field-fill text-riv-card-ink';
const COUNT =
  'inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold ' +
  'bg-riv-accent-ink text-riv-on-accent-ink group-aria-[current]:bg-riv-on-accent-ink group-aria-[current]:text-riv-accent-ink';
const MAP_BUTTON =
  'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-full border-2 px-[14px] text-[14px] font-bold ' +
  'shadow-[0_6px_18px_rgba(7,42,58,0.3)]';
/** The gutter's row: the place pill's skin without its count disc, so a two-beach name fits 150 px. */
const GUTTER_PILL =
  'pointer-events-auto absolute right-2 flex h-11 items-center rounded-[14px] border-2 ' +
  'border-riv-solid-btn-border bg-riv-solid-btn-fill px-2 text-left text-riv-solid-btn-ink ' +
  'shadow-[0_6px_18px_rgba(7,42,58,0.35)] -translate-y-1/2 hover:bg-riv-solid-btn-hover ' +
  'aria-[current]:border-riv-solid-btn-fill aria-[current]:bg-riv-solid-btn-ink aria-[current]:text-riv-solid-btn-fill';

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
    <!-- ── The head: one row — where, which beach, when. The phone sheet's and the desktop panel's. ── -->
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
          @if (here() !== null) {
            <span class="text-[19px] leading-none text-riv-accent-ink" aria-hidden="true">◎</span>
          }
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
        @if (!subtitleHead()) {
          <!-- The region's beaches gathered into one chip: lit when one is chosen; press for the rail. -->
          <button
            type="button"
            appTouchTarget
            data-ctl="beaches"
            [class]="CHIP + ' group px-[11px]'"
            [attr.aria-current]="focus().beach !== '' ? 'true' : null"
            [attr.aria-expanded]="beachesOpen()"
            [attr.aria-label]="beachChipLabel()"
            (click)="beachesOpen() ? beachesOpen.set(false) : openBeaches()"
          >
            <span aria-hidden="true">⛱</span>
            @if (chipSpelled()) {
              {{ focus().beach !== '' ? (groups()[0]?.label ?? '') : 'All beaches' }}
            }
            <span [class]="COUNT">{{ beachChipCount() }}</span>
            @if (chipSpelled()) {
              <span class="text-[11px] opacity-70" aria-hidden="true">▾</span>
            }
          </button>
        }
        <button
          type="button"
          appTouchTarget
          data-ctl="day"
          class="inline-flex shrink-0 items-center gap-1 rounded-full border border-riv-field-border bg-riv-field-fill px-3 text-[14px] font-semibold text-riv-card-ink"
          [attr.aria-expanded]="dayOpen()"
          (click)="toggleDay()"
        >
          {{ dayWord() }}
          <span class="text-[11px] text-riv-card-ink-faint" aria-hidden="true">▾</span>
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
        } @else if (nearMeNote(); as note) {
          <!-- The answer to Near me when it is not a position: the shipped map's own words, in the rail's slot, off the map. -->
          <div
            [class]="RAIL + ' items-center'"
            [animate.leave]="RAIL_LEAVE"
            data-ctl="near-me-note"
          >
            <p role="alert" class="min-w-0 flex-1 text-[13px] leading-[1.4] text-riv-ink-soft">
              {{ note }}
            </p>
            <button
              type="button"
              appTouchTarget
              aria-label="Dismiss message"
              class="inline-flex shrink-0 items-center justify-center rounded-full text-[19px] leading-none text-riv-ink-soft"
              (click)="noteDismissed.set(true)"
            >
              <span aria-hidden="true">×</span>
            </button>
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
        }
      }
    </ng-template>

    <!-- ── The list: the beach as the unit, the row as the preview. ── -->
    <ng-template #list>
      <div [class]="'grid ' + gridCols()">
        @for (group of groups(); track group.code) {
          <h2
            class="col-span-full mt-3 mb-1.5 flex items-baseline gap-2 px-1 text-[13px] text-riv-ink-soft first:mt-1"
            [class.mb-0]="cardsGrid()"
            [class]="
              (wide() ? 'mt-5 mb-0 border-b border-riv-header-border pb-1.5 first:mt-2 ' : '') +
              (stickyGroups() ? 'sticky top-0 z-[1] bg-riv-tabbar-glass backdrop-blur-[22px]' : '')
            "
          >
            <!-- On the desktop the beach is a running head over its list entries, not a card-sized title. -->
            <span
              [class]="
                wide()
                  ? 'text-[13px] font-semibold tracking-[0.01em] text-riv-ink-soft'
                  : 'text-[16px] font-bold tracking-[-0.01em] text-riv-ink'
              "
              >{{ group.label }}</span
            >
            @if (group.km !== null) {
              <span class="font-semibold text-riv-accent-ink">{{ kmLabel(group.km) }}</span>
            }
            <!-- The count where the group cannot be seen whole: always on the sheet, on the panel only once the heads stick. -->
            @if (!wide() || stickyGroups()) {
              <span class="ml-auto shrink-0"
                >{{ group.cards.length }} {{ group.cards.length === 1 ? 'venue' : 'venues' }}</span
              >
            }
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
                [class]="flatRows() ? 'border-b border-riv-header-border' : 'mb-2'"
                [card]="card"
                [date]="state().date"
                [selected]="selected() === '' + card.id"
                [dusk]="duskIds().has('' + card.id)"
                [chips]="wide() && selected() === '' + card.id"
                [km]="rowKm(card)"
                [flat]="flatRows()"
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
      @if (!wide() && !liveReady() && posterCovers()) {
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
          [class]="wide() ? '' : PHONE_CHROME + ' ' + creditSide()"
          [class.opacity-0]="!wide() && !liveReady()"
          [style.--foot.px]="wide() ? null : footBottom()"
        >
          <app-riviera-map class="size-full" [nearMe]="false" (mapClick)="selected.set(null)" />
        </div>
      }
      @if (dotsMode()) {
        <!-- Dots and a label gutter: the pills would land on the zoom column at this width. -->
        <div class="pointer-events-none absolute inset-0 z-[4]" data-gutter>
          <svg class="absolute inset-0 size-full" aria-hidden="true">
            @for (row of gutter(); track row.key) {
              <path
                class="fill-none stroke-riv-solid-btn-ink/45"
                stroke-width="1.5"
                [attr.d]="leader(row)"
              />
            }
          </svg>
          @for (row of gutter(); track row.key) {
            <span
              class="absolute block size-3 -translate-1/2 rounded-full border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_2px_6px_rgba(7,42,58,0.45)]"
              [class.scale-150]="litPin() === row.loneId"
              [style.left.px]="row.x"
              [style.top.px]="row.y"
              aria-hidden="true"
            ></span>
            <button
              type="button"
              appTouchTarget
              [class]="GUTTER_PILL"
              [style.top.px]="row.rowY"
              [style.width.px]="GUTTER_W - 8"
              [attr.aria-current]="row.loneId !== null && litPin() === row.loneId ? 'true' : null"
              [attr.aria-label]="gutterLabel(row)"
              (click)="pressGutter(row)"
              (mouseenter)="hovered.set(row.loneId === null ? null : +row.loneId)"
              (mouseleave)="hovered.set(null)"
            >
              <span class="flex min-w-0 flex-col whitespace-nowrap" aria-hidden="true">
                <span class="truncate text-[12.5px] leading-[14px] font-semibold">{{
                  row.name
                }}</span>
                <span class="text-[11px] leading-[13px] font-extrabold tabular-nums">
                  @if (row.from; as from) {
                    from {{ from }}
                  }
                  @if (row.count > 1) {
                    <span class="font-semibold opacity-80">· {{ row.count }} venues</span>
                  }
                </span>
              </span>
            </button>
          }
        </div>
      } @else {
        <app-venue-pin-layer
          class="rounded-none!"
          [pins]="pins()"
          [map]="handle()"
          [selected]="litPin()"
          [maxZoom]="maxZoom"
          (chosen)="choose($event)"
          (narrowed)="filtered.emit({ beach: $event })"
        />
      }
      <!-- The tourist's own dot paints over the pins (z-[5] to the layer's 4), as Google's blue dot does: the pass keeps pills off it, and where none can move this is the fallback. -->
      @if (hereDot(); as dot) {
        <span
          class="pointer-events-none absolute z-[5] block size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-riv-solid-btn-fill bg-riv-solid-btn-ink shadow-[0_0_0_6px_rgba(10,79,94,0.18),0_4px_12px_rgba(7,42,58,0.35)]"
          role="img"
          aria-label="You are here"
          data-here-dot
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
          class="absolute z-[8]"
          [class.left-3]="wide() || nearMeLeft()"
          [class.right-3]="!wide() && !nearMeLeft()"
          [class]="
            MAP_BUTTON +
            ' ' +
            (here() !== null
              ? 'border-riv-solid-btn-fill bg-riv-solid-btn-ink text-riv-solid-btn-fill'
              : 'border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink')
          "
          [style.bottom.px]="wide() ? 12 : footBottom()"
          [attr.aria-pressed]="here() !== null"
          (click)="locate()"
        >
          <span aria-hidden="true">◎</span>
          {{ here() !== null ? 'You are here' : 'Near me' }}
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
      <div class="flex h-[calc(100dvh-73px)] gap-3" [class]="frameEdge()">
        <aside
          appPanelGlass
          class="flex shrink-0 flex-col overflow-hidden rounded-[22px] shadow-[0_10px_32px_rgba(7,42,58,0.16)]"
          [class]="panelEdge()"
          [style.width.px]="panelWidth()"
        >
          <div class="relative shrink-0 border-b border-riv-header-border pt-3 pb-2">
            <ng-container *ngTemplateOutlet="head" />
            @if (pickerOpen()) {
              <app-prototype-coast-picker
                [region]="state().region"
                [beach]="state().beach"
                [located]="here() !== null"
                (picked)="filtered.emit($event)"
                (nearMe)="locate()"
                (closed)="pickerOpen.set(false)"
              />
            }
          </div>
          <div #body data-body class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
            <ng-container *ngTemplateOutlet="list" />
          </div>
        </aside>
        <div
          #pane
          class="relative min-w-0 flex-1 overflow-hidden bg-riv-solid-btn-fill"
          [class]="paneEdge()"
          [class.self-start]="paneHeight() !== null"
          [style.height.px]="paneHeight()"
        >
          <ng-container *ngTemplateOutlet="ground" />
        </div>
      </div>
    } @else {
      <!-- ── Phone: the ground under the glass header, the sheet over it, the tab bar under all. ── -->
      <div
        #pane
        class="fixed inset-0 z-[1] overflow-hidden bg-riv-solid-btn-fill"
        [style.background]="paneTone()"
      >
        <ng-container *ngTemplateOutlet="ground" />
      </div>

      <!-- The outer scroller: snap points at peek, half and full; the sheet is exactly one snapport tall. -->
      <div
        #scroller
        class="pointer-events-none fixed inset-x-0 z-[10] overflow-y-auto overscroll-contain scrollbar-none motion-safe:scroll-smooth snap-y snap-mandatory"
        [style.top.px]="tops().full"
        [style.bottom.px]="tabBar()"
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
          class="pointer-events-auto flex snap-start snap-always flex-col rounded-t-[26px] shadow-[0_-12px_40px_rgba(7,42,58,0.28)]"
          [style.height.px]="sheetHeight()"
          role="region"
          aria-label="Venues"
        >
          <div
            class="shrink-0 rounded-t-[26px] bg-riv-tabbar-glass pb-3 backdrop-blur-[22px]"
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
          <!-- The inner scroller: the list, scrollable at full only; at its top a pull lowers the sheet. -->
          <div
            #body
            data-body
            class="min-h-0 flex-1 px-3 pb-[68px] scrollbar-none"
            [class]="
              (detent() === 'full' ? 'overflow-y-auto' : 'overflow-clip') +
              (seam() === 'opaque' ? ' bg-riv-tabbar-glass' : '')
            "
          >
            <div [style.translate]="detent() === 'full' ? null : '0 ' + -listShift() + 'px'">
              <ng-container *ngTemplateOutlet="list" />
            </div>
          </div>
        </div>
      </div>

      @if (detent() === 'full') {
        <div
          class="pointer-events-none fixed inset-x-0 z-[11] flex justify-center"
          [style.bottom.px]="tabBar() + 12"
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
          [located]="here() !== null"
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
  protected readonly GUTTER_PILL = GUTTER_PILL;
  protected readonly GUTTER_W = GUTTER_W;
  /**
   * The shipped tab bar is `sm:hidden`, and the sheet runs to `lg` — so from 640 to 1023 px the
   * bar is not there. Measured, never assumed: 61 on a phone, 0 on a tablet (round 11).
   */
  protected readonly tabBar = signal(TAB_BAR);
  protected readonly POSTER_W = POSTER_W;
  protected readonly POSTER_H = POSTER_H;
  protected readonly maxZoom = RIVIERA_MAP_OPTIONS.maxZoom;
  /** No zoom column below `lg` (a pinch zooms); the credit in the top-right, under the header. */
  protected readonly PHONE_CHROME =
    '[&_app-riviera-map>div.top-3]:hidden [&_app-riviera-map>p]:bottom-(--foot) [&_app-riviera-map>p]:max-w-[200px] [&_app-riviera-map>p]:text-[11px]';
  /** The credit's side of the foot: the one no lone pin sits under. */
  protected readonly creditSide = computed(() =>
    this.nearMeLeft() ? '' : '[&_app-riviera-map>p]:left-3 [&_app-riviera-map>p]:right-auto',
  );

  private readonly map = viewChild(RivieraMap);
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly geolocation = inject(GeolocationGateway);
  protected readonly params = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: true,
  });

  protected readonly wide = signal(false);
  protected readonly viewport = signal({ w: 390, h: 844 });
  protected readonly poster = computed(() => this.params().get('poster'));
  /** `?head=subtitle`: the beach named in the subtitle instead of a chip in the row. */
  protected readonly subtitleHead = computed(() => this.params().get('head') === 'subtitle');
  /** `?pane=free`: the desktop pane's height follows the set as its width does. */
  private readonly freePane = computed(() => this.params().get('pane') === 'free');
  /**
   * `?edge=`: what the map's own edges do on the desktop. `round` is the maintainer's call and the
   * default — a 12 px gutter on all four sides and all four corners at 22 px, so the map and the
   * panel are two matching surfaces. `half` is what rounds 8–12 had (gutter left, top and bottom,
   * flush right, so only the left corners are rounded); `bleed` sends the pane to the right, top
   * and bottom edges. Round 13 shot all three at 1440 and 1920.
   */
  protected readonly paneEdgeMode = computed(() => this.params().get('edge') ?? 'round');
  protected readonly frameEdge = computed(() => {
    const mode = this.paneEdgeMode();
    return mode === 'round' ? 'p-3' : mode === 'bleed' ? 'pl-3' : 'p-3 pr-0';
  });
  /** Bleeding the pane takes the frame's padding away, so the panel keeps its own inset. */
  protected readonly panelEdge = computed(() => (this.paneEdgeMode() === 'bleed' ? 'my-3' : ''));
  protected readonly paneEdge = computed(() =>
    this.paneEdgeMode() === 'round' ? 'rounded-[22px]' : 'rounded-l-[22px]',
  );
  /** `?hdr=`: the page-scoped header treatment (`shell` = the shipped header, untouched). */
  private readonly header = headerTreatment(this.params().get('hdr'));
  /**
   * `?seam=`: round 7's fault 7 — at full the poster's lower edge shows through the glass, because
   * the ground under the sheet is a 380 px still over a flat fill. `glass` is the fault;
   * `opaque` gives the sheet's body the head's own near-opaque token, so the sheet is one
   * material; `tone` leaves the glass and paints the pane in the poster's own bottom-edge colour.
   */
  protected readonly seam = computed(() => this.params().get('seam') ?? 'tone');
  /** The poster's bottom edge, sampled once per poster: what `seam=tone` fills the pane with. */
  private readonly tone = signal<string | null>(null);
  protected readonly paneTone = computed(() =>
    this.seam() === 'tone' && !this.wide() ? this.tone() : null,
  );
  private readonly askedDetent = (this.params().get('sheet') as Detent | null) ?? 'half';
  /** The scroller's `scrollTop`, mirrored on every scroll event: the one number the sheet is. */
  private readonly scrolled = signal(0);
  /**
   * How far the list is pulled up inside the sheet below full: a translate, because a clipped box
   * has no scroll position; at full it becomes the list's real `scrollTop`, and coming back down
   * the `scrollTop` becomes the translate again, so the rows never jump.
   */
  protected readonly listShift = signal(0);
  protected readonly live = signal(this.params().get('live') === '1');
  protected readonly liveReady = signal(false);
  protected readonly pickerOpen = signal(false);
  protected readonly dayOpen = signal(false);
  protected readonly beachesOpen = signal(false);
  /** The rails hide at peek: the head is the one row there. */
  protected readonly railsShown = computed(() => this.wide() || this.detent() !== 'peek');
  protected readonly beachChipLabel = computed(() => {
    const beach = this.focus().beach;
    if (beach !== '') return `${this.groups()[0]?.label ?? ''}: change the beach`;
    return `All ${this.beaches().length} beaches: choose one`;
  });
  /** The chip spells its beach out where the panel has room for it and the subtitle (480 px). */
  protected readonly chipSpelled = computed(() =>
    this.wide() ? this.panelWidth() >= 480 : this.viewport().w >= TWO_COLUMN_PX,
  );
  protected readonly beachChipCount = computed(() =>
    this.focus().beach !== '' ? this.focus().cards.length : this.beaches().length,
  );
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

  /**
   * Where the tourist is, when that is somewhere on the riviera. Outside the shipped map's own
   * fence (`RIVIERA_MAP_OPTIONS.maxBounds`, the rule `shared/riviera-map.ts` already applies to
   * its Near me) a position is not a place to open on: located from Rome, round 13's page
   * collapsed the coast to `Velipojë · 571 km`, one venue, the dot 56,000 px off the map.
   */
  protected readonly here = computed<LngLat | null>(() => {
    const here = this.state().here;
    return here !== null && withinFence(here) ? here : null;
  });
  private readonly offMap = computed(() => this.state().here !== null && this.here() === null);
  /** Dismissed until the next position: the source is the position, the value resets with it. */
  protected readonly noteDismissed = linkedSignal({
    source: () => this.state().here,
    computation: () => false,
  });
  /** The shipped map's own words for a position off the riviera, in the head's rail slot. */
  protected readonly nearMeNote = computed(() =>
    this.offMap() && !this.noteDismissed() ? OFF_MAP_NOTE : null,
  );
  /** The frame includes the tourist: the fit is to the pins AND the dot, so `27 km` is on the map. */
  private readonly fitTargets = computed<readonly LngLat[]>(() => {
    const here = this.here();
    const pins = this.pins().map((p) => p.at);
    return here === null ? pins : [...pins, here];
  });

  /** A region, never the coast, on every screen: the tourist's own when located, Himarë otherwise. */
  protected readonly focus = computed<Focus>(() => {
    const s = this.state();
    if (s.beach !== '') {
      return { cards: s.cards, region: beachEntry(s.beach)?.region ?? '', beach: s.beach };
    }
    if (s.region !== '') return { cards: s.cards, region: s.region, beach: '' };
    const here = this.here();
    const region = here !== null ? nearestRegion(here, s.cards) : PHONE_DEFAULT_REGION;
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
    groupByBeach(this.focus().cards, this.here()),
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
  /**
   * Past ~15 venues a region's list is several screens and the beach titles scroll away (round 8
   * measured 5.4 screens for 30). From there each title sticks to the top of its scroller.
   */
  /** `?rows=flat`: the phone's cards as the desktop's flat list, for round 11's comparison. */
  protected readonly flatRows = computed(() => this.wide() || this.params().get('rows') === 'flat');
  protected readonly stickyGroups = computed(() => this.focus().cards.length > 15);

  protected readonly title = computed(() => {
    const { region, beach } = this.focus();
    if (beach !== '') return this.groups()[0]?.label ?? '';
    if (this.here() !== null && this.state().region === '') {
      // On the beach (within 3 km) the beach is the place; further off, the region is (Tirana → Durrës).
      const nearest = this.groups()[0];
      if (nearest !== undefined && nearest.km !== null && nearest.km < ON_BEACH_KM)
        return nearest.label;
      return region === '' ? 'Near you' : regionLabel(region);
    }
    return region === '' ? 'The whole coast' : regionLabel(region);
  });
  /**
   * One sentence that fits 176 px beside two chips: `8 of 11 selling today` (invariant #4 as the
   * head's light), or the count on another day. The place is the title, the located state is
   * the accent glyph, so neither is repeated here; the desktop's whole coast can afford its span.
   */
  protected readonly subtitle = computed(() => {
    const { cards, region, beach } = this.focus();
    const n = cards.length;
    const fact = this.isToday()
      ? `${this.selling()} of ${n} selling today`
      : `${n} ${n === 1 ? 'venue' : 'venues'}`;
    const beachesWord = this.subtitleHead()
      ? beach !== ''
        ? `${regionLabel(region)} · `
        : `${this.beaches().length === 1 ? 'One beach' : 'All beaches'} · `
      : '';
    const span = region === '' && beach === '' ? 'Velipojë to Ksamil · ' : '';
    return `${span}${beachesWord}${fact}`;
  });

  // ── the ground ──────────────────────────────────────────────────────────────────────────
  /**
   * `?cap=15`: one beach fitted at 15 instead of the fit's own 14 (round 8 asked for it; round 11
   * shot it with `live=1`, since the still posters are cut at the default ceiling).
   */
  protected readonly fitCeiling = computed(() =>
    this.params().get('cap') === '15' && this.focus().beach !== '' ? BEACH_MAX_ZOOM : undefined,
  );
  private readonly posterHandle = computed<PosterHandle | null>(() => {
    const camera = posterCamera(
      this.pins().map((p) => p.at),
      this.fitCeiling(),
    );
    if (camera === null) return null;
    return new PosterHandle(camera, this.viewport().w, (view) => this.wake(view));
  });
  /**
   * The poster is one 440 px still — it covers a phone and nothing wider, so above that the
   * ground is the live map from the first paint (round 11: the tablet band showed the solid
   * pane either side of it). Shipped, the renderer would cut a poster per width bucket too.
   */
  protected readonly posterCovers = computed(() => this.viewport().w <= POSTER_W);
  /**
   * A poster is rendered for the pins alone, so it can carry the located state only while the
   * dot lands inside the map it shows; from Tirana (27 km inland of Golem) the live map opens on
   * the frame that holds both.
   */
  private readonly posterFramesHere = computed(() => {
    const here = this.here();
    const handle = this.posterHandle();
    if (here === null || handle === null) return true;
    const at = handle.project(here);
    return at.x >= 0 && at.x <= this.viewport().w && at.y >= HEADER_H && at.y <= POSTER_H;
  });
  protected readonly posterSrc = computed(() =>
    posterUrl(posterKey(this.focus().region, this.focus().beach)),
  );
  private readonly liveHandle = computed(() => this.map()?.handle());
  /** The pins project through the live map once it is up, the poster's camera until then. */
  protected readonly handle = computed<MapHandle | undefined>(() =>
    this.wide() || this.liveReady() || !this.posterCovers()
      ? this.liveHandle()
      : (this.posterHandle() ?? undefined),
  );
  private readonly moved = signal(0);
  protected readonly hereDot = computed(() => {
    this.moved();
    const here = this.here();
    const handle = this.handle();
    if (here === null || handle === undefined) return null;
    return handle.project(here);
  });
  /**
   * All the phone's map chrome on ONE row at the map's foot, as Google Maps keeps its own: the
   * credit wrapped to 200 px on one side (the shipped pill is built to wrap), Near me on the
   * other. Round 13 had the credit top-right under the header, where the live fit left `€21`
   * under it from Tirana; a second row at the foot boxed `Borsh` in between the two (measured:
   * every spot failed, the pill stayed under Near me). The pair swaps sides together when a lone
   * pin sits under either.
   */
  protected readonly footBottom = computed(() =>
    Math.min(this.viewport().h - HEADER_H - 8 - 44, this.viewport().h - this.sheetTop() + 12),
  );
  /** Near me on the phone's left and the credit on its right, while a lone pin sits under the usual spots. */
  protected readonly nearMeLeft = signal(false);

  // ── the dots and the gutter (desktop, a narrow pane) ─────────────────────────────────────
  protected readonly dotsMode = computed(() => this.wide() && this.mapWidth() < PILLS_FROM_PX);
  /** The pin layer's own crowds, projected through the live map, laid out as gutter rows. */
  protected readonly gutter = computed<readonly GutterRow[]>(() => {
    this.moved();
    const handle = this.handle();
    if (!this.dotsMode() || handle === undefined) return [];
    const crowds = crowdPins(this.pins(), (at) => handle.project(at));
    const rows = crowds
      .map((crowd) => {
        const beaches = [...new Set(crowd.members.map((m) => m.pin.card.beach))];
        const lone = crowd.members.length === 1 ? crowd.members[0].pin : null;
        return {
          crowd,
          key: crowd.key,
          name: lone ? lone.card.name : placeName(beaches.map((b) => beachEntry(b)?.label ?? b)),
          from: lowestFromPrice(crowd.members.map((m) => m.pin.card)),
          count: crowd.members.length,
          x: crowd.x,
          y: crowd.y,
          rowY: crowd.y,
          loneId: lone ? lone.id : null,
        };
      })
      .sort((a, b) => a.y - b.y);
    const height = this.pane()?.nativeElement.clientHeight ?? 0;
    // Push rows apart down the gutter, then pull the chain back up if it ran off the bottom.
    let last = -Infinity;
    const placed = rows.map((row) => {
      const rowY = Math.max(row.rowY, last + GUTTER_ROW, GUTTER_TOP + GUTTER_ROW / 2);
      last = rowY;
      return { ...row, rowY };
    });
    if (height === 0) return placed;
    let next = height - GUTTER_BOTTOM - GUTTER_ROW / 2 + GUTTER_ROW;
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const rowY = Math.min(placed[i].rowY, next - GUTTER_ROW);
      placed[i] = { ...placed[i], rowY };
      next = rowY;
    }
    return placed;
  });

  protected leader(row: GutterRow): string {
    const width = this.pane()?.nativeElement.clientWidth ?? 0;
    const from = width - GUTTER_W;
    return `M ${from} ${row.rowY} H ${from - 10} L ${row.x + 8} ${row.y}`;
  }

  protected gutterLabel(row: GutterRow): string {
    if (row.loneId !== null) return `${row.name}${row.from ? `, from ${row.from}` : ''}`;
    return `${row.count} venues at ${row.name}${row.from ? `, from ${row.from}` : ''}; press to zoom to them`;
  }

  protected pressGutter(row: GutterRow): void {
    const handle = this.handle();
    if (row.loneId !== null) {
      this.choose(row.loneId);
      return;
    }
    if (handle === undefined) return;
    const pane = this.pane()?.nativeElement;
    const box = pane ? { width: pane.clientWidth, height: pane.clientHeight } : null;
    handle.easeTo({
      center: crowdCentre(row.crowd),
      zoom: separationZoom(row.crowd, handle.view().zoom, this.maxZoom, box),
    });
    const beaches = new Set(row.crowd.members.map((m) => m.pin.card.beach));
    if (beaches.size === 1) this.filtered.emit({ beach: [...beaches][0] });
  }

  // ── the sheet ────────────────────────────────────────────────────────────────────────────
  /** Where the sheet's top rests, in viewport px, at each height. */
  protected readonly tops = computed(() => ({
    full: HEADER_H + FULL_SLIVER,
    half: POSTER_H,
    peek: this.viewport().h - this.tabBar() - HEAD,
  }));
  /** The sheet is exactly the snapport: nothing to fling past full into. */
  protected readonly sheetHeight = computed(
    () => this.viewport().h - this.tabBar() - this.tops().full,
  );
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
    const wasFull = this.detent() === 'full';
    this.scrolled.set(scroller.scrollTop);
    if (wasFull && this.detent() !== 'full') {
      this.listShift.set(this.body()?.nativeElement.scrollTop ?? 0);
    }
    if (this.detent() === 'peek') this.wake(null);
  }

  /** Rest the sheet at a height; the container's own `scroll-behavior` decides whether it glides. */
  protected go(detent: Detent): void {
    this.scroller()?.nativeElement.scrollTo({ top: this.offsetFor(detent) });
    if (detent === 'peek') this.wake(null);
  }

  /** The grabber's tap cycles half and full only; peek is a drag's, never a tap's. */
  protected cycle(): void {
    this.go(this.detent() === 'half' ? 'full' : 'half');
  }

  /** A pin press: the venue's row becomes the preview (lit, scrolled to the top), and a lowered sheet rises to half. */
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

  /** At peek there is no rail to open into: the press raises the sheet to half first (round 14). */
  protected openBeaches(): void {
    this.beachesOpen.set(true);
    this.dayOpen.set(false);
    if (!this.wide() && this.detent() === 'peek') this.go('half');
    setTimeout(() => this.revealCurrentChip());
  }

  protected toggleDay(): void {
    this.dayOpen.set(!this.dayOpen());
    this.beachesOpen.set(false);
    if (!this.wide() && this.detent() === 'peek') this.go('half');
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
      // The answer lives in the head's rail slot, which peek does not show.
      if (!withinFence(outcome.at) && !this.wide() && this.detent() === 'peek') this.go('half');
    }
  }

  private pending: MapView | null = null;
  private watcher: MutationObserver | undefined;
  private chrome: MutationObserver | undefined;

  /** The pin demonstrations over the rendered buttons; their own mutations are discarded, not watched. */
  private repaintPins(): void {
    const host = this.element.nativeElement;
    const layer = host.querySelector('app-venue-pin-layer');
    const pills = [
      ...host.querySelectorAll<HTMLElement>('[data-pin][data-testid="map-place-pill"]'),
    ];
    unplacePills(pills);
    mergeCollidingPills(pills);
    if (layer !== null) {
      const box = layer.getBoundingClientRect();
      placePills(pills, host, box, this.window(box), noGo(host));
      if (!this.wide()) this.nearMeLeft.set(footSwapped(host, this.nearMeLeft()));
    }
    this.watcher?.takeRecords();
  }

  /**
   * Where a pill may sit: on the phone, the map the header and the sheet leave (a pill under the
   * glass of either is a smudge); on the desktop, the layer's own box. At full nothing re-fits and
   * the pills are under the sheet anyway, so the box stays the layer's.
   */
  private window(box: DOMRect): DOMRect {
    if (this.wide() || this.detent() === 'full') return box;
    const top = Math.max(box.top, HEADER_H);
    const bottom = Math.min(box.bottom, this.tops()[this.detent()]);
    return new DOMRect(box.left, top, box.width, bottom - top);
  }

  /**
   * Swap the live map in at the poster's camera, then honour the move that asked for it — aimed
   * at the window the sheet leaves, not at the viewport's centre under the sheet.
   */
  protected wake(view: MapView | null): void {
    if (view !== null) {
      const visible =
        this.tops()[this.detent() === 'full' ? 'half' : this.detent()] - FOOT - HEADER_H;
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
   * Round 10: the ROW is the unit with a natural width (a 72 px photo, a name, a price, one line
   * of facts: 480–540 px), so the panel is clamped to it — 38 % of the window between 420 and
   * 540 — and the map takes everything else. Rounds 7–9 sized the pane from the set's aspect,
   * which stretched a four-venue region's rows to 814 px beside a 576 px bay.
   */
  private readonly aspect = computed(() => contentAspect(this.pins().map((p) => p.at)) ?? 1);
  private readonly columnHeight = computed(() => this.viewport().h - HEADER_H - 24);
  protected readonly panelWidth = computed(() =>
    Math.round(Math.max(420, Math.min(540, this.viewport().w * 0.38))),
  );
  private readonly mapWidth = computed(() => this.viewport().w - this.panelWidth() - 24);
  /**
   * `?pane=free`: when the 60 % cap decides the width, the height follows the set instead of the
   * column — a wide set gets a shorter pane, and the pins fill it in both axes.
   */
  protected readonly paneHeight = computed(() => {
    if (!this.freePane()) return null;
    const wanted = Math.round((this.mapWidth() - PAD) * this.aspect() + PAD);
    return wanted < this.columnHeight() ? wanted : null;
  });
  /**
   * Cards from 900 px, not round 6's 760: at 816 (a 1200 window) two card columns show two venues
   * where two row columns show four, and the panel's job beside a map is scanning.
   */
  protected readonly cardsGrid = computed(() => this.wide() && this.panelWidth() >= 900);
  /** Cards: two, three, four columns as the panel widens; rows: always one venue a row (round 9). */
  protected readonly gridCols = computed(() => {
    const w = this.panelWidth();
    if (this.cardsGrid()) {
      return 'gap-3 ' + (w >= 1400 ? 'grid-cols-4' : w >= 1000 ? 'grid-cols-3' : 'grid-cols-2');
    }
    // A tablet's sheet is the window wide: two row columns, not one 742 px row (round 7's 300–400).
    if (!this.wide() && this.viewport().w >= TWO_COLUMN_PX) return 'grid-cols-2 gap-x-2';
    return 'grid-cols-1';
  });

  protected kmLabel(km: number): string {
    return distanceLabel(km);
  }

  protected rowKm(card: VenueCard): string | null {
    const here = this.here();
    return here === null ? null : distanceLabel(distanceKm(here, locationOf(card)));
  }

  constructor() {
    afterRenderEffect(() => {
      this.viewport.set({ w: window.innerWidth, h: window.innerHeight });
      this.wide.set(window.innerWidth >= WIDE_PX);
      const bar = this.document.querySelector('.riv-tab-bar');
      this.tabBar.set(bar === null ? 0 : Math.round(bar.getBoundingClientRect().height));
      if (!this.posterCovers() || !this.posterFramesHere()) this.live.set(true);
    });
    // Rest again when the measured geometry moves the target: a tablet is a whole tab bar taller.
    let restedAt = -1;
    afterRenderEffect(() => {
      const scroller = this.scroller()?.nativeElement;
      const want = this.offsetFor(this.askedDetent);
      if (scroller === undefined || want === restedAt) return;
      restedAt = want;
      const rest = () => {
        scroller.scrollTo({ top: want, behavior: 'instant' });
        this.scrolled.set(scroller.scrollTop);
      };
      rest();
      // The measured sheet reaches the DOM next pass, so this rest clamps and snaps to the end.
      if (scroller.scrollTop !== want) requestAnimationFrame(rest);
      if (this.askedDetent === 'peek') this.wake(null);
    });
    // The preview: the chosen row goes to the list's top (phone) or the panel's middle (desktop).
    afterRenderEffect(() => {
      const id = this.selected();
      const body = this.body()?.nativeElement;
      this.groups();
      if (id === null || body === undefined) return;
      const row = body.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`);
      if (row === null) return;
      const box = body.getBoundingClientRect();
      const at = row.getBoundingClientRect();
      const lead = this.wide() ? (box.height - at.height) / 2 : 8;
      if (this.wide() || this.detent() === 'full') {
        body.scrollTo({ top: body.scrollTop + at.top - box.top - lead });
      } else {
        // Clamped as a scroller would be: a short list is not lifted into blank glass.
        const room = this.viewport().h - this.tabBar() - box.top;
        const max = Math.max(0, (body.firstElementChild as HTMLElement).offsetHeight - room);
        this.listShift.update((shift) =>
          Math.min(max, Math.max(0, shift + at.top - box.top - lead)),
        );
      }
    });
    // Arriving at full, the translate becomes the real scroll position, in the same frame.
    afterRenderEffect(() => {
      const body = this.body()?.nativeElement;
      if (body === undefined || this.detent() !== 'full') return;
      body.scrollTop = this.listShift();
    });
    let wired: MapHandle | undefined;
    afterRenderEffect(() => {
      const handle = this.liveHandle();
      const pane = this.pane()?.nativeElement;
      const pins = this.fitTargets();
      const detent = this.detent();
      const poster = this.poster();
      this.paneHeight();
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
          const camera = fitUnderHeader(
            pins,
            pane.clientWidth,
            this.tops().half,
            this.fitCeiling(),
          );
          if (camera !== null) handle.setView(camera);
          if (this.pending !== null) {
            handle.easeTo(this.pending);
            this.pending = null;
            return;
          }
        }
      }
      const view = this.wide()
        ? fitPins(pins, pane.clientWidth, pane.clientHeight, 0, 0, undefined, this.fitCeiling())
        : detent === 'full'
          ? null
          : fitUnderHeader(pins, pane.clientWidth, this.tops()[detent], this.fitCeiling());
      if (view !== null) handle.easeTo(view);
    });
    afterRenderEffect(() => {
      const dusk = this.duskIds();
      this.pins();
      this.handle();
      this.moved();
      this.detent();
      this.hereDot();
      duskPins(this.element.nativeElement, dusk);
      this.repaintPins();
    });
    // `seam=tone`: the poster's own bottom edge, averaged, so the pane below it is the same ground.
    afterRenderEffect(() => {
      const src = this.posterSrc();
      if (this.seam() !== 'tone' || this.wide()) return;
      const image = new Image();
      image.src = src;
      void image.decode().then(() => this.tone.set(bottomEdgeColour(image)));
    });
    // The header is the shell's, so the treatment is applied to it and re-applied when the menu opens.
    afterRenderEffect(() => {
      this.wide();
      applyHeaderTreatment(this.document, this.header);
    });
    // The layer re-groups on its own resize tick, which no map move announces; watch its DOM.
    afterNextRender(() => {
      let frame = 0;
      this.watcher = new MutationObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.repaintPins());
      });
      this.watcher.observe(this.element.nativeElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label'],
      });
      const chrome = this.document.querySelector('header.riv-header');
      if (chrome !== null) {
        // The menu's popover renders inside the header, so the treatment follows it there.
        this.chrome = new MutationObserver(() => {
          applyHeaderTreatment(this.document, this.header);
          this.chrome?.takeRecords();
        });
        this.chrome.observe(chrome, { childList: true, subtree: true });
      }
    });
  }
}

/** The poster's bottom strip averaged to one colour — the ground the pane goes on carrying. */
function bottomEdgeColour(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const strip = Math.max(1, Math.round(image.naturalHeight * 0.04));
  context.drawImage(image, 0, image.naturalHeight - strip, image.naturalWidth, strip, 0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Dusk on the rendered pins, per CROWD rather than per face member (round 7's fault 6: the classes
 * followed the pill's first member, so `3 beaches` greyed at 16:30 while four of its six still
 * sold). A crowd is the buttons sharing one point — the layer puts every member at the crowd's own
 * `left`/`top` — so the DOM names the membership without re-running `crowdPins`. The invisible
 * member discs never take the classes: their `opacity-0` loses to them by stylesheet order.
 */
function duskPins(host: HTMLElement, dusk: ReadonlySet<string>): void {
  const crowds = new Map<string, HTMLElement[]>();
  for (const button of host.querySelectorAll<HTMLElement>('[data-pin]')) {
    const key = `${button.style.left}|${button.style.top}`;
    const members = crowds.get(key) ?? [];
    members.push(button);
    crowds.set(key, members);
  }
  for (const members of crowds.values()) {
    const closed = members.every((member) => dusk.has(member.dataset['pin'] ?? ''));
    for (const member of members) {
      if (member.dataset['testid'] === 'map-crowd-member') continue;
      for (const cls of DUSK_CLASSES) member.classList.toggle(cls, closed);
    }
  }
}

/**
 * The merged-crowd rule, demonstrated on the rendered pills (see `MERGED_FACE`): a compact disc
 * whose 44 px box lands on a neighbouring pill is hidden, and that pill shows the union — the
 * first and last beach in coast order, the lower from-price, the summed count. The shipped
 * `placeName` would say `3 beaches`; the span reads better with its ends named.
 */
function mergeCollidingPills(pills: readonly HTMLElement[]): void {
  const box = (el: HTMLElement) => el.getBoundingClientRect();
  const hits = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const facts = (el: HTMLElement) => {
    const label = el.getAttribute('aria-label') ?? '';
    const beaches = (/venues at (.+?)(?:,|;)/.exec(label)?.[1] ?? '')
      .split(/ & |, /)
      .filter((b) => b !== '');
    const count = Number(/^(\d+) venues/.exec(label)?.[1] ?? 0);
    const from = Number(/from €(\d+)/.exec(label)?.[1] ?? Infinity);
    return { beaches, count, from };
  };
  for (const pill of pills) {
    pill.classList.remove(MERGED_HIDE);
    for (const span of pill.querySelectorAll<HTMLElement>('[data-merged]')) {
      span.classList.remove(
        ...MERGED_NAME.split(' '),
        ...MERGED_FROM.split(' '),
        ...MERGED_COUNT.split(' '),
      );
      delete span.dataset['merged'];
    }
  }
  const compact = pills.filter((p) => p.clientWidth <= 44);
  for (const disc of compact) {
    const host = pills.find((p) => p !== disc && p.clientWidth > 44 && hits(box(disc), box(p)));
    if (host === undefined) continue;
    disc.classList.add(MERGED_HIDE);
    const a = facts(host);
    const b = facts(disc);
    const beaches = [...a.beaches, ...b.beaches];
    const name =
      beaches.length > 2 ? `${beaches[0]} – ${beaches[beaches.length - 1]}` : beaches.join(' & ');
    const from = Math.min(a.from, b.from);
    const [text, count] = host.querySelectorAll<HTMLElement>(':scope > span');
    const [title, subtitle] = text.querySelectorAll<HTMLElement>('span');
    title.dataset['merged'] = name;
    title.classList.add(...MERGED_NAME.split(' '));
    if (subtitle !== undefined && Number.isFinite(from)) {
      subtitle.dataset['merged'] = `from €${from}`;
      subtitle.classList.add(...MERGED_FROM.split(' '));
    }
    count.dataset['merged'] = String(a.count + b.count);
    count.classList.add(...MERGED_COUNT.split(' '));
  }
}

/**
 * The pills PLACED again over the rendered DOM, with a vertical anchor the shipped layout does not
 * have. `layoutPills` tries centred, then hung right, then hung left, and collapses to a bare count
 * when none fits — which at `?dense=30` and 1440 left a nameless `6` that collides with nothing
 * (round 8). This pass adds ABOVE and BELOW (and the four diagonals), gives a collapsed disc its
 * face back, and re-places a pill the merge repaint has grown — the one thing the class
 * demonstration cannot do by widening alone, since the layer sized it before the repaint.
 *
 * <p>Lone pins are never moved, exactly as the shipped rule has it; a pill that finds nowhere keeps
 * its disc.
 */
function placePills(
  pills: readonly HTMLElement[],
  host: HTMLElement,
  layer: DOMRect,
  box: DOMRect,
  avoid: readonly DOMRect[],
): void {
  const taken = [
    ...avoid,
    ...[...host.querySelectorAll<HTMLElement>('[data-testid="map-venue-pin"]')].map((pin) =>
      pin.getBoundingClientRect(),
    ),
  ];
  for (const pill of pills) {
    if (pill.classList.contains(MERGED_HIDE)) continue;
    const gaveFace = pill.clientWidth <= PIN_HEIGHT_PX && giveFaceBack(pill);
    let spot = findSpot(pill, layer, box, taken);
    if (spot === null && gaveFace) {
      stripFace(pill);
      spot = findSpot(pill, layer, box, taken);
    }
    // Nowhere fits: the layer's own placement stands (round 13 recentred it, off the box's edge).
    if (spot !== null) {
      pill.dataset['layerTranslate'] ??= pill.style.translate;
      pill.style.translate = `calc(-50% + ${Math.round(spot.dx)}px) calc(-50% + ${spot.dy}px)`;
      pill.dataset['placed'] = pill.style.translate;
    }
    taken.push(pill.getBoundingClientRect());
  }
}

/**
 * The chrome a pill must never sit under (round 11's fault 8: `Near me` on `Borsh` in every
 * phone shot), and the tourist's own dot, which the `3 beaches` pill hid at Dhërmi — the layer's
 * box has to exclude the page's chrome, and shipped it takes these as an input.
 */
const NO_GO =
  '[data-ctl="near-me"], [data-testid="map-attribution"], ' +
  '[data-testid="map-zoom-in"], [data-testid="map-zoom-out"]';
/** The dot's ring is its own margin; a pill may come this close to it. */
const DOT_MARGIN = 2;

function noGo(host: HTMLElement): DOMRect[] {
  const rects = [...host.querySelectorAll<HTMLElement>(NO_GO)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0);
  const dot = host.querySelector<HTMLElement>('[data-here-dot]')?.getBoundingClientRect();
  if (dot !== undefined && dot.width > 0) {
    rects.push(
      new DOMRect(
        dot.left - DOT_MARGIN,
        dot.top - DOT_MARGIN,
        dot.width + 2 * DOT_MARGIN,
        dot.height + 2 * DOT_MARGIN,
      ),
    );
  }
  return rects;
}

/** Centred, hung the two shipped ways, then above and below and the four diagonals. */
function findSpot(
  pill: HTMLElement,
  layer: DOMRect,
  box: DOMRect,
  taken: readonly DOMRect[],
): Spot | null {
  const width = pill.getBoundingClientRect().width;
  const point = pointOf(pill, layer);
  const hang = width / 2 - HANG_PX;
  const spots: Spot[] = [
    { dx: 0, dy: 0 },
    { dx: hang, dy: 0 },
    { dx: -hang, dy: 0 },
    { dx: 0, dy: HUNG_PX },
    { dx: 0, dy: -HUNG_PX },
    { dx: hang, dy: HUNG_PX },
    { dx: -hang, dy: HUNG_PX },
    { dx: hang, dy: -HUNG_PX },
    { dx: -hang, dy: -HUNG_PX },
  ];
  return (
    spots.find(({ dx, dy }) => {
      const rect = {
        left: point.x + dx - width / 2,
        right: point.x + dx + width / 2,
        top: point.y + dy - PIN_HEIGHT_PX / 2,
        bottom: point.y + dy + PIN_HEIGHT_PX / 2,
      };
      const inBox =
        rect.left >= box.left &&
        rect.top >= box.top &&
        rect.right <= box.right &&
        rect.bottom <= box.bottom;
      return inBox && !taken.some((other) => overlaps(rect, other));
    }) ?? null
  );
}

interface Spot {
  readonly dx: number;
  readonly dy: number;
}

/** The crowd's own point in the viewport: the layer writes it as the button's `left`/`top`. */
function pointOf(pill: HTMLElement, box: DOMRect): { x: number; y: number } {
  return {
    x: box.left + Number.parseFloat(pill.style.left),
    y: box.top + Number.parseFloat(pill.style.top),
  };
}

/** A collapsed disc gets its name and from-price back, read off the label the layer wrote. */
function giveFaceBack(pill: HTMLElement): boolean {
  const label = pill.getAttribute('aria-label') ?? '';
  const name = /venues at (.+?)(?:,|;)/.exec(label)?.[1];
  if (name === undefined) return false;
  const from = /from (\u20ac\d+)/.exec(label)?.[1] ?? null;
  const face = pill.ownerDocument.createElement('span');
  face.dataset['hungFace'] = '';
  face.className = HUNG_FACE;
  face.setAttribute('aria-hidden', 'true');
  face.innerHTML =
    `<span class="text-[12.5px] leading-[14px] font-semibold">${name}</span> ` +
    (from === null
      ? ''
      : `<span class="text-[11px] leading-[13px] font-extrabold tabular-nums">from ${from}</span>`);
  pill.prepend(face);
  pill.classList.remove('pl-[6px]');
  pill.classList.add('pl-[13px]');
  return true;
}

function stripFace(pill: HTMLElement): void {
  pill.querySelector('[data-hung-face]')?.remove();
  pill.classList.remove('pl-[13px]');
  pill.classList.add('pl-[6px]');
}

/**
 * Put every pill back the way the layer drew it, so the pass can run again from scratch. The
 * layer's own translate is kept from the first placement; when the layer has written since (its
 * value is not the pass's), that newer value is the layer's and is kept instead.
 */
function unplacePills(pills: readonly HTMLElement[]): void {
  for (const pill of pills) {
    if (pill.querySelector('[data-hung-face]') !== null) stripFace(pill);
    const placed = pill.dataset['placed'];
    if (placed === undefined) continue;
    delete pill.dataset['placed'];
    if (pill.style.translate === placed) {
      pill.style.translate = pill.dataset['layerTranslate'] ?? '';
    }
    delete pill.dataset['layerTranslate'];
  }
}

/**
 * A lone pin is never moved (the shipped rule), so when one sits under the foot's chrome it is
 * the chrome that moves: Near me and the credit swap sides, unless a lone pin waits under the
 * swapped spots too. Decided from the rendered boxes, so it cannot oscillate — lone pins hold
 * still.
 */
function footSwapped(host: HTMLElement, swapped: boolean): boolean {
  const pieces = [
    ...host.querySelectorAll<HTMLElement>('[data-ctl="near-me"], [data-testid="map-attribution"]'),
  ];
  const pane = pieces[0]?.offsetParent;
  if (pane === undefined || pane === null) return swapped;
  const frame = pane.getBoundingClientRect();
  const lone = [...host.querySelectorAll<HTMLElement>('[data-testid="map-venue-pin"]')].map((pin) =>
    pin.getBoundingClientRect(),
  );
  const under = (rect: DOMRect) => lone.some((pin) => overlaps(rect, pin));
  const rects = pieces.map((piece) => piece.getBoundingClientRect());
  const mirrored = rects.map(
    (at) => new DOMRect(frame.left + frame.right - at.right, at.top, at.width, at.height),
  );
  return rects.some(under) && !mirrored.some(under) ? !swapped : swapped;
}

function overlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: DOMRect,
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The pins of a poster key: a region's, or `beach-<code>`'s. */
function posterPins(key: string): LngLat[] {
  const cards = key.startsWith('beach-')
    ? PROTOTYPE_VENUES.filter((c) => c.beach === key.slice('beach-'.length))
    : PROTOTYPE_VENUES.filter((c) => beachEntry(c.beach)?.region === key);
  return cards.map(locationOf);
}

/**
 * Fit into the map visible between the header and the foot row above `sheetTop`, then centre on
 * that window: the pane is the whole viewport, so the camera looks as far south of the pins as the
 * pane's centre sits below the window's, and the pins land in the window.
 */
function fitUnderHeader(
  pins: readonly LngLat[],
  width: number,
  sheetTop: number,
  ceiling?: number,
): MapView | null {
  const visible = sheetTop - FOOT - HEADER_H;
  const view = fitPins(pins, width, visible, 0, 0, undefined, ceiling);
  if (view === null) return null;
  const perPixel = (360 / (512 * 2 ** view.zoom)) * Math.cos((view.center.lat * Math.PI) / 180);
  const shift = window.innerHeight / 2 - (HEADER_H + visible / 2);
  return {
    center: { lng: view.center.lng, lat: view.center.lat - shift * perPixel },
    zoom: view.zoom,
  };
}

/** The shipped map's rule, unexported there: inside the ADR-0022 fence or not a place to open on. */
function withinFence(at: LngLat): boolean {
  const [southWest, northEast] = RIVIERA_MAP_OPTIONS.maxBounds;
  return (
    at.lng >= southWest.lng &&
    at.lng <= northEast.lng &&
    at.lat >= southWest.lat &&
    at.lat <= northEast.lat
  );
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
