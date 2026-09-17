import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
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
import { AmenityChip } from '../../shared/amenity-chip';
import { CardGlass } from '../../shared/card-glass';
import { FAILURE_DIRECTIVES } from '../../shared/failure-panel';
import { FieldGlass } from '../../shared/field-glass';
import { LoadAnnouncer } from '../../shared/load-announcer';
import { focusMover } from '../../shared/focus-after-render';
import { formatMoney } from '../../shared/money';
import { formatBookingDate } from '../../shared/booking-date-label';
import { PanelGlass } from '../../shared/panel-glass';
import { PhotoScrim } from '../../shared/photo-scrim';
import { PhotoSlideshow } from '../../shared/photo-slideshow';
import { PhotoStepButton } from '../../shared/photo-step-button';
import { slideshowPhotos } from '../../shared/photo-url';
import { isRated, ratingScore, reviewsLabel } from '../../shared/rating';
import { RetryButton } from '../../shared/retry-button';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from '../../shared/riviera-map';
import { ClosedForSeasonChip } from '../../shared/closed-for-season-chip';
import { SalesClosedChip } from '../../shared/sales-closed-chip';
import { SemanticChip } from '../../shared/semantic-chip';
import { SetsFree } from '../../shared/sets-free';
import { defaultBookingDate, formatDayMonth, isIsoDate } from '../../shared/booking-date';
import { TouchTarget } from '../../shared/touch-target';
import { VenueSummary } from '../../shared/venue-views';
import { VenueService } from '../../venue/venue.service';
import { VenuePin } from './pin-crowding';
import { VenueCard } from './venue-card';
import { VenuePinLayer } from './venue-pin-layer';
import { VenuePreviewCard } from './venue-preview-card';

/**
 * Tailwind's `lg` breakpoint — the twin of the `lg:` utilities in `home.html` that lay the map
 * beside the list. Both must move together.
 */
const WIDE_VIEWPORT = '(min-width: 1024px)';

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
 */
@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    RetryButton,
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
    '(keydown.escape)': 'closePreview()',
  },
  templateUrl: './home.html',
})
export class Home {
  private readonly venueService = inject(VenueService);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly map = viewChild(RivieraMap);
  private readonly pinLayer = viewChild(VenuePinLayer);

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

  /** Distinct beaches/regions for the filter selects, captured once from the unfiltered catalogue. */
  protected readonly beaches = signal<readonly string[]>([]);
  protected readonly regions = signal<readonly string[]>([]);

  /** Which panel the switch shows below `lg`; irrelevant from `lg` up, where both show. */
  protected readonly view = signal<'list' | 'map'>('list');
  /** True from Tailwind's `lg` up, followed live so a rotated tablet re-lays out. */
  protected readonly wide = signal(false);
  protected readonly listShown = computed(() => this.wide() || this.view() === 'list');
  protected readonly mapOpen = computed(() => this.wide() || this.view() === 'map');
  /** The venue request has answered or failed: the list is drawn, so the map may load. */
  protected readonly listSettled = computed(() => this.venues() !== undefined || this.failed());
  /** The map chunk's one-way trigger: an open map, after the list settled. */
  protected readonly mapDefer = computed(() => this.mapOpen() && this.listSettled());

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
    this.shownCards().flatMap((card) =>
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
    this.loadInitial();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
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

  protected onPinSelected(id: string): void {
    this.selectedVenue.set(id);
    this.focusAfterRender('venue-preview');
    this.revealCard(id);
  }

  /**
   * A place on the map was pressed and it is one beach: the list narrows to it, so the cards
   * beside the map — the List tab on a phone — are the venues the camera went to.
   */
  protected onBeachNarrowed(beach: string): void {
    if (beach !== this.beach()) {
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

  /** Bring the selected venue's card into view, where the list is on screen beside the map. */
  private revealCard(id: string): void {
    afterNextRender(
      {
        write: () => {
          const card = this.host.nativeElement.querySelector<HTMLElement>(
            `[data-venue-pin="${id}"]`,
          );
          card?.scrollIntoView?.({ block: 'nearest' });
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
        // Explicit locale comparator: sorts accented place names (e.g. "Dhërmi") correctly and
        // avoids the default coerce-to-string sort (Sonar S2871).
        const byLocale = (a: string, b: string): number => a.localeCompare(b);
        this.beaches.set([...new Set(list.map((v) => v.beach))].sort(byLocale));
        this.regions.set([...new Set(list.map((v) => v.region))].sort(byLocale));
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
    this.reload();
  }

  protected onRegionChange(event: Event): void {
    this.region.set((event.target as HTMLSelectElement).value);
    this.reload();
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
      `${venue.name}, ${venue.beach} · ${venue.region}, ${ratingText}${price}, ` +
      `${free} of ${total} sets free on ${dateLabel}${closedText}. ` +
      `${waterText}${amenitiesText}` +
      `View beach map.`;

    return {
      id: venue.id,
      name: venue.name,
      beach: venue.beach,
      region: venue.region,
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
