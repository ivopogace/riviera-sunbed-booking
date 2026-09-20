import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';

import { amenityLabel, distanceToWaterLabel, orderedAmenities } from '../../shared/amenities';
import {
  BeachEntry,
  RegionEntry,
  beachEntry,
  beachLabel,
  presentBeaches,
  presentRegions,
  regionEntry,
  regionLabel,
} from '../../shared/beaches';
import { AmenityChip } from '../../shared/amenity-chip';
import { BusyAction } from '../../shared/busy-action';
import { CardGlass } from '../../shared/card-glass';
import { FAILURE_DIRECTIVES } from '../../shared/failure-panel';
import { FieldGlass } from '../../shared/field-glass';
import { LoadAnnouncer } from '../../shared/load-announcer';
import { focusMover } from '../../shared/focus-after-render';
import { GeolocationGateway, GeolocationOutcome } from '../../shared/geolocation';
import { LngLat } from '../../shared/map-engine';
import { formatMoney } from '../../shared/money';
import { formatBookingDate } from '../../shared/booking-date-label';
import { PanelGlass } from '../../shared/panel-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { PhotoStepButton } from '../../shared/photo-step-button';
import { slideshowPhotos } from '../../shared/photo-url';
import { isRated, ratingScore, reviewsLabel } from '../../shared/rating';
import { RetryButton } from '../../shared/retry-button';
import {
  NEAR_ME_MESSAGES,
  NearMeProblem,
  RivieraMap,
  withinBounds,
} from '../../shared/riviera-map';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map-options';
import { ClosedForSeasonChip } from '../../shared/closed-for-season-chip';
import { SalesClosedChip } from '../../shared/sales-closed-chip';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { defaultBookingDate, formatDayMonth, isIsoDate } from '../../shared/booking-date';
import { TouchTarget } from '../../shared/touch-target';
import { VenueSummary } from '../../shared/venue-views';
import { VenueService } from '../../venue/venue.service';
import { fitInWindow } from './camera-fit';
import { CoastPicker, coastIndex, PickedPlace } from './coast-picker';
import { BeachOption, DiscoverHead } from './discover-head';
import { DiscoverSheet } from './discover-sheet';
import { VenuePin } from './pin-crowding';
import {
  distanceLabel,
  groupByBeach,
  nearestRegion,
  placeTitle,
  rowDistance,
} from './place-groups';
import { FOOT_ROW_PX } from './sheet-geometry';
import { VenueCard } from './venue-card';
import { VenuePinLayer } from './venue-pin-layer';
import { VenuePreviewCard } from './venue-preview-card';

/**
 * Tailwind's `lg` breakpoint — the twin of the `lg:` utilities in `home.html` that lay the map
 * beside the list. Both must move together.
 */
const WIDE_VIEWPORT = '(min-width: 1024px)';

/** `?map=sheet` puts the riviera map under the list as a sheet below `lg`; off, nothing moves. */
const SHEET_FLAG = 'sheet';
/** The region the sheet opens on when the tourist is not placed: the coast's middle stretch. */
const DEFAULT_REGION = 'HIMARE';
/** From this much sheet width the rows are two columns and the beach chip spells itself out. */
const TWO_COLUMN_PX = 600;
/** The Near me button's foot row keeps this much clear of the header at peek. */
const NEAR_ME_TOP_CLEARANCE_PX = 8 + 44;

/** The sheet's query: the region and beach the list is narrowed to, and their cards. */
interface Focus {
  readonly cards: readonly VenueCard[];
  readonly region: string;
  readonly beach: string;
}

/** The closed-state clause of a card's accessible name; the season badge outranks today's sales close. */
function closedStateText(
  closedForSeason: boolean,
  reopensOn: string | null,
  salesClosed: boolean,
): string {
  if (closedForSeason) {
    const reopens = reopensOn ? `, reopens ${formatDayMonth(reopensOn)}` : '';
    return `, closed for season${reopens}`;
  }
  return salesClosed ? ', online sales for today have closed' : '';
}

/**
 * Tourist venue discovery — the app's landing page (`/`).
 * Hero + one glass filter bar (beach/region/date with the live result count inside) + glass venue
 * cards (a crossfading slideshow of the venue's uploaded photos when any exist — stepped by
 * controls layered OUTSIDE the card link, never nested in it — else the gradient placeholder;
 * mode chip, rating, availability bar), each a link to the beach map at `/venues/:id`. The date
 * drives the per-venue availability count (invariant #2). Money is rendered from integer minor
 * units (invariant #5); every card fact is conveyed as text, not colour alone (WCAG AA). Loading
 * (a pulsing skeleton grid), empty, and error states are distinct.
 *
 * <p>Beside the list sits the **riviera map** (ADR-0022): below `lg` a List/Map switch shows one
 * panel at a time, from `lg` up both show side by side. The map component is a deferred chunk that
 * loads only once the venue request has settled, so the list is never slower for it; once loaded
 * it stays mounted and the switch only hides it. The list remains the fully accessible path.
 *
 * <p>The venue pins over the map are the page's own overlay (`VenuePinLayer`), fed the very cards
 * the list renders. Pins that bury each other form a place pill: pressing it goes there, and when
 * the place is one beach the Beach filter follows, with a crumb on the map as the way back.
 *
 * <p>Behind `?map=sheet`, below `lg`, the page is the **riviera map sheet**: the map is the
 * ground under the glass header, the cards are a sheet over it with three resting heights
 * (`DiscoverSheet`), the head is one row carrying the query (`DiscoverHead`), the row is the pin's
 * preview, and Near me has three arms decided by the map's own fence rule. Sheet mode keeps the
 * one whole-coast request per date and narrows to a region client-side, so the chips and the
 * coast picker can count every beach. The flag off, the page is the one described above.
 */
@Component({
  selector: 'app-home',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RetryButton,
    BusyAction,
    DiscoverSheet,
    DiscoverHead,
    CoastPicker,
    PanelGlass,
    PhotoScrim,
    PhotoSlideshow,
    PhotoStepButton,
    CardGlass,
    AmenityChip,
    ClosedForSeasonChip,
    SalesClosedChip,
    SemanticChip,
    SetsFree,
    FieldGlass,
    LoadAnnouncer,
    TouchTarget,
    RivieraMap,
    VenuePinLayer,
    VenuePreviewCard,
    ...FAILURE_DIRECTIVES,
  ],
  host: {
    class: 'block text-riv-card-ink',
    // On the page host, not the map panel: a preview is closable wherever Escape is pressed,
    '(keydown.escape)': 'onEscape()',
  },
  templateUrl: './home.html',
})
export class Home {
  private readonly venueService = inject(VenueService);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly geolocation = inject(GeolocationGateway);
  private readonly map = viewChild(RivieraMap);
  private readonly pinLayer = viewChild(VenuePinLayer);
  private readonly sheet = viewChild(DiscoverSheet);
  private readonly head = viewChild(DiscoverHead);

  /** The displayed (filtered) venues; `undefined` while a request is in flight (loading). */
  protected readonly venues = signal<VenueSummary[] | undefined>(undefined);
  protected readonly failed = signal(false);

  /**
   * In flight: no response yet and no failure. Named here rather than derived in the template so
   * the announcer's phase is one reviewable expression (and cannot drift from the `@if` chain).
   */
  protected readonly loading = computed(() => !this.failed() && this.venues() === undefined);

  /** Current filter selection. Empty string = "all" (no constraint). */
  protected readonly beach = signal('');
  protected readonly region = signal('');
  /**
   * The earliest selectable booking date — today in Europe/Tirane. Backs the date input's
   * `min` and clamps a hand-typed date so a past date can't be presented as bookable (an
   * invariant #4 display guardrail; the server stays authoritative for the real cutoff).
   *
   * <p>Computed once at construction, not re-derived per interaction (unlike `venue-map`'s
   * per-route-reset floor): a page left open across Tirane midnight can still offer yesterday
   * client-side until the next navigation. Accepted residual — the server refuses `BOOKING_CLOSED`
   * regardless.
   */
  protected readonly minDate = defaultBookingDate(new Date());
  /**
   * The day availability is counted for (ISO YYYY-MM-DD). Seeded from the route's `?date` — where
   * the rebook link a venue-caused cancellation mails lands — clamped to the earliest bookable day,
   * and defaulting to it. A later navigation that only changes that param reuses this component, so
   * the constructor's subscription keeps the date and the counts in step rather than leaving a new
   * label over an old list.
   */
  protected readonly selectedDate = signal(this.minDate);

  /** The catalogue beaches/regions with a venue, for the filter selects, captured once from the unfiltered list. */
  protected readonly beaches = signal<readonly BeachEntry[]>([]);
  protected readonly regions = signal<readonly RegionEntry[]>([]);
  /** The narrowed beach as the tourist reads it, for the crumb on the map. */
  protected readonly narrowedLabel = computed(() => beachLabel(this.beach()));

  /** Which panel the switch shows below `lg`; irrelevant from `lg` up, where both show. */
  protected readonly view = signal<'list' | 'map'>('list');
  /** True from Tailwind's `lg` up, followed live so a rotated tablet re-lays out. */
  protected readonly wide = signal(false);
  protected readonly listShown = computed(() => this.wide() || this.view() === 'list');
  protected readonly mapOpen = computed(() => this.wide() || this.view() === 'map');
  /** The venue request has answered or failed: the list is drawn, so the map may load. */
  protected readonly listSettled = computed(() => this.venues() !== undefined || this.failed());
  /** The map chunk's one-way trigger: an open map (the ground, in sheet mode), after the list settled. */
  protected readonly mapDefer = computed(
    () => (this.sheetMode() || this.mapOpen()) && this.listSettled(),
  );

  /** The route carries `?map=sheet`; the layout follows it only below `lg`. */
  private readonly mapFlag = signal(false);
  protected readonly sheetMode = computed(() => this.mapFlag() && !this.wide());

  /** The skeleton grid renders this many placeholder cards while a request is in flight. */
  protected readonly skeletons = [0, 1, 2, 3, 4, 5] as const;

  /** True only once a response has arrived and it is empty (distinct from the loading state). */
  protected readonly isEmpty = computed(() => {
    return this.venues()?.length === 0;
  });

  /**
   * The discovery cards, precomputed off `venues()` + the selected date: the template
   * iterates these ready-made fields instead of calling parameterized pure methods per item per CD
   * tick. `undefined` while a request is in flight, mirroring `venues()`.
   */
  protected readonly venuesView = computed<readonly VenueCard[] | undefined>(() => {
    const list = this.venues();
    if (list === undefined) {
      return undefined;
    }
    const dateLabel = this.dateLabel();
    return list.map((venue) => this.toCard(venue, dateLabel));
  });

  /**
   * The cards the map draws and the preview reads: the list's own while it has one, else the last
   * it had. A reload empties `venuesView` for its skeletons; if the map followed, every pin button
   * would be destroyed under whatever focus it held and an open card would close for the request's
   * duration — the very moment a place pill has just narrowed the list. So the map keeps the last
   * list until the next one lands (the first load still draws nothing), and a filter or date
   * change closes the preview iff its venue leaves the result set.
   */
  private readonly shownCards = linkedSignal<
    readonly VenueCard[] | undefined,
    readonly VenueCard[]
  >({
    source: this.venuesView,
    computation: (cards, previous) => cards ?? previous?.value ?? [],
  });

  /**
   * The map's pins, derived from the very cards the list renders — one per card with a venue
   * location, in list order. The map therefore issues no query of its own: a beach, region or
   * date change re-feeds these from the one list response it was going to fetch anyway, and the
   * two surfaces cannot disagree. A pin's id is its venue's id as a string.
   */
  protected readonly pins = computed<readonly VenuePin[]>(() =>
    (this.sheetMode() ? this.focus().cards : this.shownCards()).flatMap((card) =>
      card.location
        ? [
            {
              id: String(card.id),
              at: { lng: card.location.longitude, lat: card.location.latitude },
              card,
            },
          ]
        : [],
    ),
  );

  /** The live engine handle the pin layer projects through; `undefined` until the map has booted. */
  protected readonly mapHandle = computed(() => this.map()?.handle());
  /** The map's zoom ceiling, which decides when a crowd is one the camera cannot separate. */
  protected readonly mapMaxZoom = RIVIERA_MAP_OPTIONS.maxZoom;

  /**
   * The pin whose preview is open, or `null`. Linked to the pin set so a venue that leaves the
   * result set takes its preview with it.
   */
  protected readonly selectedVenue = linkedSignal<readonly VenuePin[], string | null>({
    source: this.pins,
    computation: (pins, previous) => {
      const open = previous?.value ?? null;
      return open !== null && pins.some((pin) => pin.id === open) ? open : null;
    },
  });

  /** The card behind the open preview — the same record the list is rendering for that venue. */
  protected readonly selectedCard = computed<VenueCard | null>(() => {
    const open = this.selectedVenue();
    if (open === null) {
      return null;
    }
    return this.shownCards().find((card) => String(card.id) === open) ?? null;
  });

  /**
   * The open venue's place in a crowd the camera cannot separate, from the layer that draws it,
   * for the preview's stepper; `null` for a venue on its own, so the card draws no stepper.
   */
  protected readonly crowdStack = computed(() => this.pinLayer()?.stack() ?? null);

  // ── the sheet's query (sheet mode only) ─────────────────────────────────────────────────
  /** A region picked on the coast picker, `''` for the derived one (the tourist's, else Himarë). */
  protected readonly focusRegion = signal('');
  /** A beach picked on the rail, the picker or a crowd press; `''` for the whole region. */
  protected readonly focusBeach = signal('');
  /**
   * Where the tourist is, when that is somewhere on the riviera: a position outside the map's
   * fence is refused (the `off-map` arm), so this is never a place the page cannot open on. The
   * position reaches the camera, the sort and the captions and nothing else.
   */
  protected readonly here = signal<LngLat | null>(null);
  private readonly nearMeProblem = signal<NearMeProblem | null>(null);
  protected readonly locating = signal(false);
  /** Asked once: a browser does not grow the API mid-session. */
  protected readonly nearMeShown = this.geolocation.supported();
  /** Dismissed until the next answer: the source is the problem, the value resets with it. */
  private readonly noteDismissed = linkedSignal({
    source: this.nearMeProblem,
    computation: () => false,
  });
  /** The map's own words for a Near me that is not a position, in the head's rail slot. */
  protected readonly note = computed(() => {
    const problem = this.nearMeProblem();
    return problem === null || this.noteDismissed() ? null : NEAR_ME_MESSAGES[problem];
  });
  protected readonly pickerOpen = signal(false);
  protected readonly detent = computed(() => this.sheet()?.detent() ?? 'half');
  /** The rails hide at peek: the head is the one row there. */
  protected readonly railsShown = computed(() => this.detent() !== 'peek');
  /** The tablet band: two row columns and the beach chip spelled out. */
  protected readonly wideSheet = computed(
    () => (this.sheet()?.chrome().viewportW ?? 0) >= TWO_COLUMN_PX,
  );
  /**
   * The foot row's height above the map's bottom edge: 12 px over the sheet's top, following a
   * drag, and never up into the header at peek. Near me sits on it at the right, the credit at
   * the left — all the phone's map chrome on one row.
   */
  protected readonly footBottom = computed(() => {
    const sheet = this.sheet();
    if (sheet === undefined) {
      return 0;
    }
    const { viewportH, header } = sheet.chrome();
    return Math.min(
      viewportH - header - NEAR_ME_TOP_CLEARANCE_PX,
      viewportH - sheet.sheetTop() + 12,
    );
  });

  /** A region, never the coast: the chosen beach or region, else the tourist's, else Himarë. */
  protected readonly focus = computed<Focus>(() => {
    const cards = this.shownCards();
    const beach = this.focusBeach();
    if (beach !== '') {
      return {
        cards: cards.filter((card) => card.beach === beach),
        region: beachEntry(beach)?.region ?? '',
        beach,
      };
    }
    const here = this.here();
    const region =
      this.focusRegion() ||
      (here === null ? '' : nearestRegion(here, cards)) ||
      defaultRegion(cards);
    if (region === '') {
      return { cards, region: '', beach: '' };
    }
    return {
      cards: cards.filter((card) => beachEntry(card.beach)?.region === region),
      region,
      beach: '',
    };
  });
  /** The whole region's cards, for the beach chip's counts while one beach is chosen. */
  private readonly regionCards = computed(() => {
    const region = this.focus().region;
    return region === ''
      ? this.shownCards()
      : this.shownCards().filter((card) => beachEntry(card.beach)?.region === region);
  });
  protected readonly groups = computed(() => groupByBeach(this.focus().cards, this.here()));
  protected readonly title = computed(() =>
    placeTitle({
      region: this.focus().region,
      beach: this.focus().beach,
      here: this.here(),
      groups: this.groups(),
    }),
  );
  private readonly isToday = computed(() => this.selectedDate() === this.minDate);
  /**
   * The selling line: `8 of 11 selling today` (invariant #4 as the head's light, from the
   * server's per-date verdict), or the count on another day.
   */
  protected readonly subtitle = computed(() => {
    const cards = this.focus().cards;
    const n = cards.length;
    if (!this.isToday()) {
      return `${n} ${n === 1 ? 'venue' : 'venues'}`;
    }
    const selling = cards.filter((card) => !card.salesClosed).length;
    return `${selling} of ${n} selling today`;
  });
  /** The region's beaches with a venue, in coast order, each with its count. */
  protected readonly beachOptions = computed<readonly BeachOption[]>(() =>
    presentBeaches(this.regionCards().map((card) => card.beach)).map((entry) => ({
      code: entry.code,
      label: entry.label,
      count: this.regionCards().filter((card) => card.beach === entry.code).length,
    })),
  );
  protected readonly pickerRegions = computed(() => coastIndex(this.shownCards()));
  /** Each card's distance caption while located, by venue id. */
  protected readonly rowKms = computed<ReadonlyMap<number, string>>(() => {
    const here = this.here();
    return new Map(
      this.focus()
        .cards.map((card) => [card.id, rowDistance(card, here)] as const)
        .filter((entry): entry is readonly [number, string] => entry[1] !== null),
    );
  });
  /** The frame includes the tourist: the fit is to the pins AND the dot, so `27 km` is on the map. */
  private readonly fitTargets = computed<readonly LngLat[]>(() => {
    const here = this.here();
    const pins = this.pins().map((pin) => pin.at);
    return here === null ? pins : [...pins, here];
  });
  /** Bumped on every camera move, so the dot re-projects. */
  private readonly moved = signal(0);
  /** The tourist's own dot over the pins, projected through the live map. */
  protected readonly hereDot = computed(() => {
    this.moved();
    const here = this.here();
    const handle = this.mapHandle();
    return here === null || handle === undefined ? null : handle.project(here);
  });

  /** Guards against an earlier slow response overwriting a newer one (last-writer-wins). */
  private lastRequest = '';

  private readonly focusAfterRender = focusMover();

  /**
   * The fetch to repeat when Retry is pressed — the *failed* request, not a fixed one: an
   * initial-load failure retries `loadInitial` (which re-seeds the filter selects), whereas a
   * filter-change failure retries `reload` (which preserves the active beach/region filter).
   * Assigned by whichever load runs first; the constructor's `loadInitial()` sets it before any
   * Retry click is possible (definite assignment — no dead initial closure to leave uncovered).
   */
  private lastLoad!: () => void;

  constructor() {
    this.rescueFocusFromClosingPreview();
    this.followViewport();
    this.selectedDate.set(this.routeDate(this.route.snapshot.queryParamMap));
    this.mapFlag.set(this.route.snapshot.queryParamMap.get('map') === SHEET_FLAG);
    this.followSheet();
    this.loadInitial();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.mapFlag.set(params.get('map') === SHEET_FLAG);
      const date = this.routeDate(params);
      if (date !== this.selectedDate()) {
        this.selectedDate.set(date);
        this.reload();
      }
    });
  }

  // Guarded: jsdom has no matchMedia — then the page stays in its narrow, switched layout.
  private followViewport(): void {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }
    const query = globalThis.matchMedia(WIDE_VIEWPORT);
    this.wide.set(query.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      this.wide.set(event.matches);
      if (!event.matches) {
        this.rescueFocusFromHiddenPanel();
      }
    };
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  /**
   * The preview can also close without anyone closing it: the selected venue leaves the result
   * set — a route-carried date change, a venue that stopped selling — and the linked selection
   * drops with it. Focus inside the card would strand on `<body>` (WCAG 2.4.3), so it lands on
   * the count block, the same place the narrowing rescue uses.
   *
   * <p>A user-driven close needs nothing here: {@link closePreview} moves focus to the pin
   * before this runs, so the card it finds is not the one holding focus.
   */
  private rescueFocusFromClosingPreview(): void {
    effect(() => {
      // Read before the view is patched, so a card about to be removed is still mounted.
      if (this.selectedCard() === null && this.previewHoldsFocus()) {
        this.focusAfterRender('results');
      }
    });
  }

  private previewHoldsFocus(): boolean {
    const preview = this.host.nativeElement.querySelector('[data-testid="venue-preview"]');
    return preview?.contains(this.document.activeElement) ?? false;
  }

  /** Narrowing hides the panel the switch is not showing; focus stranded in it lands on the count block (WCAG 2.4.3). */
  private rescueFocusFromHiddenPanel(): void {
    const hidden = this.view() === 'list' ? 'map-panel' : 'list-panel';
    if (this.document.activeElement?.closest(`[data-testid="${hidden}"]`)) {
      this.focusAfterRender('results');
    }
  }

  /**
   * The camera is derived from the pane and the result set, never `RIVIERA_MAP_OPTIONS`' fixed
   * zoom: the pins (and the dot, when located) are fitted into the window between the header and
   * the foot row above the sheet's rest, capped at 14 so the sea stays in frame. Nothing re-fits
   * at full, where the map is a sliver.
   */
  private followSheet(): void {
    // The dot re-projects on every camera move; its own effect, so a re-fit never drops the subscription.
    effect((onCleanup) => {
      const handle = this.mapHandle();
      if (handle !== undefined) {
        onCleanup(handle.onMove(() => this.moved.update((n) => n + 1)));
      }
    });
    afterRenderEffect(() => {
      if (!this.sheetMode()) {
        return;
      }
      const handle = this.mapHandle();
      const sheet = this.sheet();
      const targets = this.fitTargets();
      const detent = this.detent();
      if (handle === undefined || sheet === undefined) {
        return;
      }
      if (detent === 'full') {
        return;
      }
      const { viewportW, viewportH, header } = sheet.chrome();
      const view = fitInWindow(
        targets,
        { width: viewportW, height: viewportH },
        header,
        sheet.tops()[detent] - FOOT_ROW_PX,
      );
      if (view !== null) {
        handle.easeTo(view);
      }
    });
  }

  /**
   * Near me, the page's own in sheet mode. Three arms, decided by the map's fence rule: off the
   * fence nothing moves and the map's words stand in the head; inside it the tourist is placed,
   * the region becomes theirs and the fit includes the dot; on a beach the beach is the title.
   * A browser's refusal shows its own words. The position is used here and never sent or stored.
   */
  protected async locate(): Promise<void> {
    if (this.locating()) {
      return;
    }
    this.locating.set(true);
    this.nearMeProblem.set(null);
    try {
      this.placeAt(await this.geolocation.locate());
    } finally {
      this.locating.set(false);
    }
  }

  private placeAt(outcome: GeolocationOutcome): void {
    if (outcome.kind !== 'located') {
      this.nearMeProblem.set(outcome.kind);
    } else if (!withinBounds(outcome.at, RIVIERA_MAP_OPTIONS.maxBounds)) {
      this.nearMeProblem.set('off-map');
    } else {
      this.here.set(outcome.at);
      this.focusRegion.set('');
      this.focusBeach.set('');
    }
    // The answer lives in the head's rail slot, which peek does not show.
    if (this.nearMeProblem() !== null) {
      this.raiseFromPeek();
    }
  }

  protected async locateFromPicker(): Promise<void> {
    this.closePicker();
    await this.locate();
  }

  protected dismissNote(): void {
    this.noteDismissed.set(true);
    this.focusAfterRender('head-day');
  }

  /** A rail opened while the sheet was at peek: the sheet rises so the rail has room. */
  protected onRailOpened(): void {
    this.raiseFromPeek();
  }

  private raiseFromPeek(): void {
    if (this.detent() === 'peek') {
      this.sheet()?.go('half');
    }
  }

  protected onBeachPicked(code: string): void {
    this.focusBeach.set(code);
  }

  protected onDayPicked(date: string): void {
    if (date === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(date);
    this.reload();
  }

  protected openPicker(): void {
    this.head()?.closeRails();
    this.pickerOpen.set(true);
  }

  protected onPlacePicked({ region, beach }: PickedPlace): void {
    this.focusRegion.set(region);
    this.focusBeach.set(beach);
    this.closePicker();
  }

  /** The picker takes its own focus down with it, so focus returns to the place that opened it. */
  protected closePicker(): void {
    if (!this.pickerOpen()) {
      return;
    }
    this.pickerOpen.set(false);
    this.focusAfterRender('head-place');
  }

  protected onEscape(): void {
    this.closePreview();
    if (this.sheetMode()) {
      this.head()?.closeRails();
      this.closePicker();
    }
  }

  protected kmLabel(km: number): string {
    return distanceLabel(km);
  }

  /**
   * Open a venue's preview: from a pin (or a pill's press-again), which moves focus into the
   * dialog, or from the open preview's own stepper, which leaves focus where it is — the dialog
   * stays mounted across a step, so the pressed chevron keeps it. In sheet mode the row is the
   * preview: it lights and goes to the list's top, and a sheet at peek rises to half.
   */
  protected onPinSelected(id: string): void {
    this.selectedVenue.set(id);
    if (this.sheetMode()) {
      this.raiseFromPeek();
    } else if (!this.previewHoldsFocus()) {
      this.focusAfterRender('venue-preview');
    }
    this.revealCard(id);
  }

  /**
   * A place on the map was pressed and it is one beach: the list narrows to it, so the cards
   * beside the map — the List tab on a phone — are the venues the camera went to. On the sheet
   * the narrowing is the head's beach, client-side, with no request.
   */
  protected onBeachNarrowed(beach: string): void {
    if (this.sheetMode()) {
      this.focusBeach.set(beach);
    } else if (beach !== this.beach()) {
      this.beach.set(beach);
      this.reload();
    }
  }

  /**
   * The map's own way back from a beach the list is narrowed to. The crumb takes itself down, so
   * focus moves to the control beside it (WCAG 2.4.3): Near me, or Zoom in where no near-me is
   * offered.
   */
  protected showAllBeaches(): void {
    this.beach.set('');
    this.followFilter();
    this.reload();
    this.focusAfterRender('map-near-me', 'map-zoom-in');
  }

  /**
   * Close the preview and hand focus back to the pin that opened it (WCAG 2.4.3) — the pin is
   * where the interaction started, and on Escape it is the only place focus can sensibly land.
   */
  protected closePreview(): void {
    const open = this.selectedVenue();
    if (open === null) {
      return;
    }
    this.selectedVenue.set(null);
    this.pinLayer()?.focusPin(open);
  }

  /** Bring the selected venue's card into view: to the sheet's top, or beside the map. */
  private revealCard(id: string): void {
    afterNextRender(
      {
        write: () => {
          const card = this.host.nativeElement.querySelector<HTMLElement>(
            `[data-venue-pin="${id}"]`,
          );
          if (card === null) {
            return;
          }
          const sheet = this.sheet();
          if (sheet !== undefined) {
            sheet.reveal(card);
          } else {
            card.scrollIntoView?.({ block: 'nearest' });
          }
        },
      },
      { injector: this.injector },
    );
  }

  protected isSelected(card: VenueCard): boolean {
    return this.selectedVenue() === String(card.id);
  }

  protected showList(): void {
    this.view.set('list');
  }

  protected showMap(): void {
    this.view.set('map');
  }

  /** The route-carried day: a well-formed `?date` on or after the floor, else the floor itself. */
  private routeDate(params: ParamMap): string {
    const raw = params.get('date') ?? '';
    return isIsoDate(raw) && raw >= this.minDate ? raw : this.minDate;
  }

  /** First load: no filters. Seeds the filter selects from the full catalogue and shows all venues. */
  private loadInitial(): void {
    this.lastLoad = () => this.loadInitial();
    const token = this.beginRequest();
    this.venueService.listVenues({}, this.selectedDate()).subscribe({
      next: (list) => {
        if (this.lastRequest !== token) {
          return;
        }
        const codes = list.map((v) => v.beach);
        this.beaches.set(presentBeaches(codes));
        this.regions.set(presentRegions(codes));
        this.venues.set(list);
      },
      error: () => {
        if (this.lastRequest === token) {
          this.failed.set(true);
        }
      },
    });
  }

  /** Re-fetch the list for the current filter + date. */
  private reload(): void {
    this.lastLoad = () => this.reload();
    const token = this.beginRequest();
    this.venueService
      .listVenues(
        { beach: this.beach() || undefined, region: this.region() || undefined },
        this.selectedDate(),
      )
      .subscribe({
        next: (list) => {
          if (this.lastRequest === token) {
            this.venues.set(list);
          }
        },
        error: () => {
          if (this.lastRequest === token) {
            this.failed.set(true);
          }
        },
      });
  }

  /** Reset to the loading state and mint a token for this request. */
  private beginRequest(): string {
    this.venues.set(undefined);
    this.failed.set(false);
    const token = `${this.beach()}|${this.region()}|${this.selectedDate()}`;
    this.lastRequest = token;
    return token;
  }

  protected onBeachChange(event: Event): void {
    this.beach.set((event.target as HTMLSelectElement).value);
    this.followFilter();
    this.reload();
  }

  protected onRegionChange(event: Event): void {
    this.region.set((event.target as HTMLSelectElement).value);
    this.followFilter();
    this.reload();
  }

  /**
   * The map goes where the filter points: the chosen beach at town scale, else the chosen region,
   * else the whole riviera. The catalogue's recorded views are the only geography involved (ADR-0022).
   */
  private followFilter(): void {
    const view =
      beachEntry(this.beach())?.view ??
      regionEntry(this.region())?.view ??
      RIVIERA_MAP_OPTIONS.view;
    this.map()?.handle()?.easeTo(view);
  }

  protected onDateChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.value) {
      return;
    }
    // Clamp a hand-typed past/today date up to the earliest day — typing bypasses the picker `min`.
    const value = input.value < this.minDate ? this.minDate : input.value;
    input.value = value; // reflect any clamp back into the field, even when the model is unchanged
    if (value === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(value);
    this.reload();
  }

  /**
   * Retry the load that failed (the failure panel's "Try again" button). Retry destroys the panel
   * holding the pressed button (WCAG 2.4.3), so focus moves to the count block — which survives
   * every list state, outliving the loading → grid/error transitions too.
   */
  protected onRetryDiscover(): void {
    this.lastLoad();
    this.focusAfterRender('results');
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return formatBookingDate(this.selectedDate(), { withYear: true });
  }

  /**
   * Derive one card's render+a11y view from a summary. All logic is the pure `shared/`
   * helpers, called here — never from the template. `dateLabel` is passed in so it is read once per
   * `venuesView` evaluation, not re-read per card.
   */
  private toCard(venue: VenueSummary, dateLabel: string): VenueCard {
    const rated = isRated(venue);
    const rating = ratingScore(venue.ratingTenths);
    const water = distanceToWaterLabel(venue.distanceToWaterM ?? null);
    const amenities = orderedAmenities(venue.amenities ?? [])
      .slice(0, 3)
      .map((code) => ({ code, label: amenityLabel(code) }));
    const priceLabel = venue.fromPrice ? formatMoney(venue.fromPrice) : null;
    const photos = slideshowPhotos(venue, 'card');
    const { free, total } = venue.availability;
    const freePercent = total === 0 ? 0 : Math.round((free / total) * 100);

    // Only an explicit false is "closed" — an older payload without the verdict stays unbadged.
    const salesClosed = venue.salesOpen === false;
    const closedForSeason = venue.closedForSeason === true;
    const reopensOn = closedForSeason ? (venue.reopensOn ?? null) : null;

    const price = priceLabel ? `, from ${priceLabel} per set` : '';
    const waterText = water ? `${water}. ` : '';
    const amenitiesText = amenities.length
      ? `Amenities: ${amenities.map((a) => a.label).join(', ')}. `
      : '';
    const ratingText = rated ? `rated ${rating} out of 5` : 'no reviews yet';
    // The card body is aria-hidden, so the closed state must ride the accessible name too.
    const closedText = closedStateText(closedForSeason, reopensOn, salesClosed);
    const ariaLabel =
      `${venue.name}, ${beachLabel(venue.beach)} · ${regionLabel(venue.region)}, ${ratingText}${price}, ` +
      `${free} of ${total} sets free on ${dateLabel}${closedText}. ` +
      `${waterText}${amenitiesText}` +
      `View beach map.`;

    return {
      id: venue.id,
      name: venue.name,
      beach: venue.beach,
      beachLabel: beachLabel(venue.beach),
      regionLabel: regionLabel(venue.region),
      photos,
      modeLabel: venue.bookingMode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
      isRated: rated,
      rating,
      reviewsLabel: reviewsLabel(venue.reviewsCount),
      water,
      amenities,
      freePercent,
      priceLabel,
      fromPrice: venue.fromPrice ?? null,
      free,
      total,
      salesClosed,
      closedForSeason,
      reopensOn,
      location: venue.location ?? null,
      ariaLabel,
    };
  }
}

/** Himarë when it has a venue, else the northernmost region that has one, else nothing (the coast). */
function defaultRegion(cards: readonly VenueCard[]): string {
  const present = presentRegions(cards.map((card) => card.beach));
  return present.some((region) => region.code === DEFAULT_REGION)
    ? DEFAULT_REGION
    : (present[0]?.code ?? '');
}
