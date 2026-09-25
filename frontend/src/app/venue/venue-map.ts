import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { Amenity, amenityLabel, distanceToWaterLabel, orderedAmenities } from '../shared/amenities';
import { beachLabel, regionLabel } from '../shared/beaches';
import { AmenityChip } from '../shared/amenity-chip';
import { ClosedForSeasonChip } from '../shared/closed-for-season-chip';
import { SemanticChip } from '../shared/semantic-chip';
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { CardGlass } from '../shared/card-glass';
import { MapSkeletonGrid } from '../shared/map-skeleton-grid';
import { SkeletonBlock } from '../shared/skeleton-block';
import { LoadAnnouncer } from '../shared/load-announcer';
import { ClockIcon } from '../shared/clock-icon';
import { FAILURE_DIRECTIVES } from '../shared/failure-panel';
import { MAP_TILE_LEGEND, MAP_TILE_MEANING, MapTile, MapTileState, mapTileState } from './map-tile';
import { rowPriceLabel } from './row-price-label';
import { formatMoney, MoneyView } from '../shared/money';
import { focusMover } from '../shared/focus-after-render';
import { formatBookingDate, formatStay } from '../shared/booking-date-label';
import { PanelGlass } from '../shared/panel-glass';
import { PhotoGalleryGrid } from '../shared/photo-gallery-grid';
import { PhotoLightbox } from '../shared/photo-lightbox';
import { PhotoScrim } from '../shared/photo-scrim';
import { PhotoSlideshow } from '../shared/photo-slideshow';
import { CONTAIN_SIZES, slideshowPhotos } from '../shared/photo-url';
import { isRated, ratingScore, reviewsLabel } from '../shared/rating';
import { RetryButton } from '../shared/retry-button';
import {
  DateRange,
  daysBetween,
  defaultBookingDate,
  formatCivilDate,
  isIsoDate,
} from '../shared/booking-date';
import { routeIdParam } from '../shared/parent-venue-id';
import { spotLabel, tierSentenceLabel } from '../shared/set-label';
import { PhotoView, SetView, VenueMapView } from '../shared/venue-views';
import { AvailabilityCalendar, MAX_STAY_DAYS } from './availability-calendar';
import { PartlyFreeSheet } from './partly-free-sheet';
import { SetRun, freeDaysOf, longestRunAcross } from './stay-runs';
import { VenueReviews } from './venue-reviews';
import { VenueService } from './venue.service';

import { TouchTarget } from '../shared/touch-target';
import { StarIcon } from '../shared/star-icon';
import { AlertIcon } from '../shared/alert-icon';
import { UmbrellaIcon } from '../shared/umbrella-icon';
import { ArrowLeftIcon } from '../shared/arrow-left-icon';

/**
 * One rendered set on the map: the raw {@link SetView}, whether it is bookable
 * (invariant #3), and its accessible name (state carried by text, not colour — WCAG AA).
 */
interface TileView {
  readonly set: SetView;
  readonly bookable: boolean;
  /** How the tile looks and what it announces — the appearance, the markers and the legend
   *  swatches all resolve from this one value (a FREE walk-in set is `walkin`, #672). */
  readonly state: MapTileState;
  /** Accessible name for a non-interactive tile (`<li>`). */
  readonly name: string;
  /** Accessible name for the bookable button (adds the "Select to book" affordance). */
  readonly bookName: string;
  /** Free on some of the stay's days: tappable to see which, never bookable as it stands. */
  readonly partly: boolean;
  /** How many of the stay's days the set is free on — the badge a partly-free tile wears. */
  readonly freeDays: number;
  /** Accessible name for the partly-free button (adds the "see which days" affordance). */
  readonly partlyName: string;
}

/** One row of the map: the shared canvas's row contract plus this surface's tiles. */
interface MapRow extends BeachMapCanvasRow {
  readonly tiles: readonly TileView[];
}

/**
 * The venue header's ready-to-render view: every per-venue display value the header
 * needs, precomputed once from the {@link VenueMapView} by {@link VenueMap.venueView} rather than
 * re-derived from the template each change-detection tick. The pure `shared/` helpers stay
 * signal-free; this record memoizes their outputs off the `venue` signal. `bookingMode` is carried
 * raw for the booking dialog and the mode-aware map footer; `modeLabel` is its display string.
 */
interface VenueHeader {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  /** The banner slideshow's photo URLs in slot order; empty → the gradient placeholder. */
  readonly photos: readonly PhotoView[];
  /** The same slots sized for the lightbox's own box; falls back to {@link photos} when absent. */
  readonly lightboxPhotos: readonly PhotoView[];
  readonly bookingMode: VenueMapView['bookingMode'];
  readonly modeLabel: string;
  readonly isRated: boolean;
  readonly rating: string;
  /** The count with its noun already agreed — "1 review", "2 reviews" (shared/rating.ts). */
  readonly reviewsLabel: string;
  /** The "from €X / set" price string, or `null` when the venue has no sets. */
  readonly priceLabel: string | null;
  readonly water: string | null;
  readonly amenities: readonly { readonly code: Amenity; readonly label: string }[];
  /** The venue's sales-close value — the note's copy key only; `salesOpen` stays the verdict. */
  readonly salesClose: VenueMapView['salesClose'];
  /** True when the venue is closed for the season right now — the header chip and the notice. */
  readonly closedForSeason: boolean;
  /** The reopen day while closed with one set; else `null`. */
  readonly reopensOn: string | null;
}

/**
 * Read-only visual beach map for one venue on a chosen day. Renders the glass venue header
 * (with description + cutoff explainer), a per-date availability summary, and the positioned,
 * row-major set grid coloured by tier and availability. The map owns the selected date:
 * changing it re-fetches that date's availability and seeds the booking dialog's date, so
 * the two always agree. Reactive to in-place `:id`/`?date` route changes — the
 * router reuses the instance, so a change resets per-venue state and re-loads like a fresh
 * mount. Money is rendered from integer minor units; tile state is conveyed
 * by an accessible name, not colour alone (WCAG AA). The grid chrome — wash, rails, zone
 * layout, drag-pan with its click-vs-drag threshold — is the shared {@link BeachMapCanvas};
 * this component owns only the tourist vocabulary projected into it — the tile names and the
 * mode-aware footer, which states booking or request terms per the venue's own mode.
 *
 * Display parity only: availability truth stays server-side (invariant #2); only free
 * ONLINE-pool sets are bookable (invariant #3); the picker's `min` excludes today but the
 * server remains authoritative for the real cutoff (invariant #4).
 */
@Component({
  selector: 'app-venue-map',
  imports: [
    ClosedForSeasonChip,
    BookingDialog,
    VenueReviews,
    RetryButton,
    PanelGlass,
    PhotoGalleryGrid,
    PhotoLightbox,
    PhotoScrim,
    PhotoSlideshow,
    CardGlass,
    LoadAnnouncer,
    ClockIcon,
    AmenityChip,
    SemanticChip,
    TouchTarget,
    BeachMapCanvas,
    BeachMapRowDef,
    SkeletonBlock,
    MapSkeletonGrid,
    MapTile,
    AvailabilityCalendar,
    ...FAILURE_DIRECTIVES,
    StarIcon,
    AlertIcon,
    UmbrellaIcon,
    ArrowLeftIcon,
    PartlyFreeSheet,
    RouterLink,
  ],
  templateUrl: './venue-map.html',
  // --riv-tile (tile size + rail-cell heights) now lives on the shared canvas's host.
  host: {
    class: 'block text-riv-card-ink',
  },
})
export class VenueMap {
  /** The legend's rows, in tile-state order — labelled beside the colours they explain. */
  protected readonly legend = MAP_TILE_LEGEND;

  /** The band letterboxes, so it states the width its PAINTED photo needs — {@link CONTAIN_SIZES}. */
  protected readonly bandSizes = CONTAIN_SIZES.band;

  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly router = inject(Router);
  /** WCAG 2.4.3: a re-fetch failure tears down the map (which may hold focus) — move it (RV-FE-9). */
  private readonly moveFocus = focusMover();

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly failed = signal(false);
  /** 404: the venue does not exist or is not tourist-visible (#693) — no retry can succeed. */
  protected readonly notFound = signal(false);

  /**
   * In flight: no venue, no 404, no failure. Named here rather than derived in the template so the
   * announcer's phase is one reviewable expression (and cannot drift from the `@if` chain).
   */
  protected readonly loading = computed(
    () => !this.failed() && !this.notFound() && !this.venueView(),
  );

  /** Earliest bookable day — today, Europe/Tirane (sales close on the day itself).
   *  Re-derived from a fresh clock on every route reset — the instance outlives
   *  navigations, so a construction-time floor would go stale past Tirane midnight. */
  protected readonly minDate = signal(defaultBookingDate(new Date()));

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /**
   * The first day the map reflects (ISO YYYY-MM-DD). Seeded from {@link routeDates} on mount and on
   * every in-place route change that alters the venue or the carried `?date`/`?lastDate` params;
   * the date picker then writes it directly without touching the URL.
   */
  protected readonly selectedDate = signal(this.minDate());
  /** The last day the map reflects — the first day itself for a one-day map. */
  protected readonly selectedLastDate = signal(this.minDate());
  /** How many days the map is showing; a stay is more than one. */
  protected readonly dayCount = computed(() =>
    daysBetween(this.selectedDate(), this.selectedLastDate()),
  );
  protected readonly isStay = computed(() => this.dayCount() > 1);

  /** The venue id from the `:id` param (undefined if invalid) — reactive to in-place changes,
   *  which reuse this instance. */
  private readonly venueId = routeIdParam(this.route, 'id');
  /** Bumped per load dispatch and per route reset: an identity guard — a value check
   *  (id or date) passes again after an A→B→A round trip, so continuations compare this
   *  instead. */
  private epoch = 0;

  /** Whether the availability calendar is open over the header's date field. */
  protected readonly pickerOpen = signal(false);

  /** The set whose booking dialog is open, or undefined when closed. */
  protected readonly selectedSet = signal<SetView | undefined>(undefined);
  /** The partly-free set whose days are being shown, or undefined when the sheet is closed. */
  protected readonly partlySet = signal<SetView | undefined>(undefined);
  /** A set to open the dialog on once the map is re-read for a shortened stay. */
  private pendingSelectSetId: number | undefined;
  /** Id of the tile that opened the dialog, so focus can return to it on close. */
  private lastTriggerId: number | undefined;

  /** Index of the photo the lightbox opened on, or undefined when it's closed. */
  protected readonly lightboxIndex = signal<number | undefined>(undefined);
  /** The `data-testid` of whichever thumbnail opened the lightbox, so focus can return to it. */
  private lightboxTriggerTestId = 'photo-band-view';

  protected readonly freeCount = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  /** Sets free on some of the stay's days but not all — a one-day map never has any. */
  protected readonly partlyCount = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'PARTLY_FREE').length ?? 0,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

  /** A stay no single set covers, though the beach is not full: the page offers the longest run. */
  protected readonly noSetCovers = computed(
    () => this.isStay() && this.totalCount() > 0 && this.freeCount() === 0 && !this.salesClosed(),
  );
  /** The online set that can host the most of the stay on one spot, when nothing covers it all. */
  protected readonly longestRun = computed<SetRun | undefined>(() => {
    const venue = this.venue();
    return venue === undefined || !this.noSetCovers()
      ? undefined
      : longestRunAcross(venue.sets, this.selectedDate(), this.selectedLastDate());
  });

  /**
   * True when the server's verdict says online sales for the selected date have closed
   * (invariant #4 — display only; the reserve path enforces the real fence). Only an explicit
   * `false` closes, so older payloads without the field keep the bookable map.
   */
  protected readonly salesClosed = computed(() => this.venue()?.salesOpen === false);

  /** The reopen day as the notice states it ("Sat 15 May 2027"). */
  protected reopenLabel(isoDate: string): string {
    return formatCivilDate(isoDate);
  }

  /** Whether the selected date is today — keys the closed banner's copy. Reads a fresh clock
   *  per recompute (each date change), not the mount-time floor, so a tab held across Tirane
   *  midnight gets the today copy back on its next pick; a banner already on screen at the
   *  rollover keeps its copy until then (the documented minDate residual class). */
  protected readonly closedForToday = computed(
    () => this.selectedDate() === defaultBookingDate(new Date()),
  );

  /**
   * The header's render+a11y view, precomputed off `venue()`: the template reads these
   * ready-made fields instead of calling parameterized pure methods each CD tick. `undefined` while
   * the venue is loading/failed, mirroring `venue()` — so it also gates the loaded branch.
   */
  protected readonly venueView = computed<VenueHeader | undefined>(() => {
    const v = this.venue();
    if (v === undefined) {
      return undefined;
    }
    const photos = slideshowPhotos(v, 'banner');
    return {
      id: v.id,
      name: v.name,
      beach: beachLabel(v.beach),
      region: regionLabel(v.region),
      description: v.description,
      photos,
      // Absent only on an older payload or a double; the server resolves its own fallback.
      lightboxPhotos: v.lightboxPhotos?.length ? v.lightboxPhotos : photos,
      bookingMode: v.bookingMode,
      modeLabel: v.bookingMode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
      isRated: isRated(v),
      rating: ratingScore(v.ratingTenths),
      reviewsLabel: reviewsLabel(v.reviewsCount),
      priceLabel: v.fromPrice ? formatMoney(v.fromPrice) : null,
      water: distanceToWaterLabel(v.distanceToWaterM ?? null),
      amenities: orderedAmenities(v.amenities ?? []).map((code) => ({
        code,
        label: amenityLabel(code),
      })),
      salesClose: v.salesClose,
      closedForSeason: v.closedForSeason === true,
      reopensOn: v.closedForSeason === true ? (v.reopensOn ?? null) : null,
    };
  });

  /** Sets grouped into rows (read order preserved), each coded by its stored `rowLabel` — the
   *  one per-venue row identity (#724) — plus its rail-chip price label per
   *  {@link rowPriceLabel}. Zones still compare the RENDERED label (#689), so the richer label
   *  re-partitions them exactly where it should: a walk-in row priced like the online row above
   *  it now opens a zone of its own instead of vanishing into it (#702). */
  protected readonly rows = computed<readonly MapRow[]>(() => {
    const byRow = new Map<string, SetView[]>();
    for (const set of this.venue()?.sets ?? []) {
      const row = byRow.get(set.rowLabel) ?? [];
      row.push(set);
      byRow.set(set.rowLabel, row);
    }
    const entries = [...byRow.entries()];
    const labels = entries.map(([, sets]) => rowPriceLabel(sets));
    return entries.map(([label, sets], index) => ({
      code: label,
      priceLabel: labels[index],
      zoneStart: index === 0 || labels[index] !== labels[index - 1],
      tileCount: sets.length,
      tiles: sets.map((set) => this.toTile(set)),
    }));
  });

  constructor() {
    // In-place route changes only: skip runs matching the last route key (fresh mount loads below).
    let current = this.routeKey();
    effect(() => {
      const key = this.routeKey();
      if (key === current) {
        return;
      }
      current = key;
      untracked(() => this.resetForVenue(this.venueId()));
    });
    this.resetForVenue(this.venueId());
  }

  /** The raw route context — `:id` plus the raw `?date`/`?lastDate` params — whose change triggers a reset. */
  private routeKey(): string {
    const params = this.queryParams();
    return `${this.venueId()}|${params.get('date') ?? ''}|${params.get('lastDate') ?? ''}`;
  }

  /**
   * The route-carried days: a well-formed `?date` on/after `floor`, else `floor`; a well-formed
   * `?lastDate` on/after it within the stay ceiling, else the first day alone.
   */
  private routeDates(floor: string): DateRange {
    const rawFirst = this.queryParams().get('date');
    const first = rawFirst && isIsoDate(rawFirst) && rawFirst >= floor ? rawFirst : floor;
    const rawLast = this.queryParams().get('lastDate');
    const last =
      rawLast &&
      isIsoDate(rawLast) &&
      rawLast >= first &&
      daysBetween(first, rawLast) <= MAX_STAY_DAYS
        ? rawLast
        : first;
    return { first, last };
  }

  /** Drop every venue-scoped state — map, dialog, pan gesture, the map date — and load fresh,
   *  or fail fast on an invalid `:id` (no request for /venues/NaN). */
  private resetForVenue(id: number | undefined): void {
    this.epoch++;
    this.venue.set(undefined);
    this.selectedSet.set(undefined);
    // The reset takes any focus-trapped modal AND its trigger, so move focus deliberately (RV-FE-9).
    const modalWasOpen =
      this.pickerOpen() || this.lightboxIndex() !== undefined || this.partlySet() !== undefined;
    this.pickerOpen.set(false);
    this.lightboxIndex.set(undefined);
    this.partlySet.set(undefined);
    this.pendingSelectSetId = undefined;
    if (modalWasOpen) {
      this.moveFocus('map-loading');
    }
    this.lastTriggerId = undefined;
    const floor = defaultBookingDate(new Date());
    this.minDate.set(floor);
    const days = this.routeDates(floor);
    this.selectedDate.set(days.first);
    this.selectedLastDate.set(days.last);
    if (id === undefined) {
      this.failed.set(true);
      return;
    }
    this.load();
  }

  /** Build the render+a11y view of one set (invariant #3: only free ONLINE sets are bookable). */
  private toTile(set: SetView): TileView {
    const tier = tierSentenceLabel(set.tier);
    const state = mapTileState(set);
    // The sales gate (invariant #4): a closed date renders its grid, but nothing is selectable.
    const bookable = set.availability === 'FREE' && set.pool === 'ONLINE' && !this.salesClosed();
    const partly = state === 'partly' && !this.salesClosed();
    const freeDays = freeDaysOf(set, this.dayCount());
    const announced =
      state === 'partly'
        ? `${MAP_TILE_MEANING.partly.announced}, free ${freeDays} of ${this.dayCount()} days`
        : MAP_TILE_MEANING[state].announced;
    const name = `${spotLabel(set.rowLabel, set.positionNo)}, ${tier}, ${this.money(set.price)}, ${announced}`;
    return {
      set,
      bookable,
      state,
      name,
      bookName: `${name}. Select to book.`,
      partly,
      freeDays,
      partlyName: `${name}. Select to see which days.`,
    };
  }

  /** Fetch the map for the currently selected days. */
  private load(): void {
    const id = this.venueId();
    if (id === undefined) {
      return;
    }
    // A fresh attempt clears any prior failure so a recovered load renders the map.
    this.failed.set(false);
    this.notFound.set(false);
    // The per-dispatch generation: any later dispatch or reset supersedes this response.
    const epoch = ++this.epoch;
    this.venues.getVenueMap(id, this.selectedDate(), this.selectedLastDate()).subscribe({
      next: (venue) => {
        if (this.epoch === epoch) {
          this.venue.set(venue);
          this.openPendingSelection(venue);
        }
      },
      error: (error: unknown) => {
        if (this.epoch !== epoch) {
          return;
        }
        // A stale map under a new date header misleads — the panel must win over the old view.
        const toreDownMap = this.venue() !== undefined;
        this.venue.set(undefined);
        // The teardown takes the header, and with it the trigger — close without chasing it.
        this.pickerOpen.set(false);
        this.lightboxIndex.set(undefined);
        // 404 is a distinct state: the venue is gone or hidden (#693); retrying cannot succeed.
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notFound.set(true);
          if (toreDownMap) {
            this.moveFocus('map-not-found');
          }
        } else {
          this.failed.set(true);
          if (toreDownMap) {
            this.moveFocus('map-error');
          }
        }
      },
    });
  }

  /** Retry after a load failure: re-fetch the current date's map. */
  protected retry(): void {
    this.load();
  }

  /** Back to the discovery list. */
  protected async onBack(): Promise<void> {
    await this.router.navigate(['/']);
  }

  /**
   * After a shortened stay's map arrives: open the dialog on the set the offer was made for, if
   * it is still free for those days — the server decides (invariant #2); otherwise the tile keeps
   * focus and the new map speaks for itself.
   */
  private openPendingSelection(venue: VenueMapView): void {
    const id = this.pendingSelectSetId;
    if (id === undefined) {
      return;
    }
    this.pendingSelectSetId = undefined;
    const set = venue.sets.find((s) => s.id === id);
    if (set !== undefined && this.toTile(set).bookable) {
      this.select(set);
    } else {
      this.focusTile(id);
    }
  }

  /** Re-fetch availability for newly chosen days (closing any open dialog or sheet first). */
  protected onDatesChange(days: DateRange): void {
    if (days.first === this.selectedDate() && days.last === this.selectedLastDate()) {
      return;
    }
    this.selectedSet.set(undefined);
    this.partlySet.set(undefined);
    this.selectedDate.set(days.first);
    this.selectedLastDate.set(days.last);
    this.load();
  }

  /** One day: the range setter's one-day form. */
  protected onDateChange(value: string): void {
    if (value) {
      this.onDatesChange({ first: value, last: value });
    }
  }

  protected openPicker(): void {
    this.pickerOpen.set(true);
  }

  /**
   * Close the calendar and hand focus back to the trigger (modal a11y, RV-FE-9) — the calendar's
   * own contract: it dismisses, the opener restores. Via `focusMover`, whose `afterNextRender`
   * write phase lands after the DOM has caught up, so the trigger announces the date it is now
   * showing rather than the one it was showing when the click arrived.
   */
  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.moveFocus('map-date');
  }

  /**
   * Commit the calendar's chosen day. The date is written FIRST so the restore lands on a trigger
   * that already reads the new day — closing first announces the day the tourist just left.
   */
  protected onDateChosen(days: DateRange): void {
    this.onDatesChange(days);
    this.closePicker();
  }

  /** The selected days on the picker trigger ("Tue 30 Jun 2026", or the range with its day count). */
  protected triggerLabel(): string {
    return formatStay(this.selectedDate(), this.selectedLastDate(), { withYear: true });
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return formatBookingDate(this.selectedDate(), { withYear: true });
  }

  /** A run's days rendered for the no-cover offer ("Tue 30 Jun – Thu 2 Jul · 3 days"). */
  protected runLabel(best: SetRun): string {
    return formatStay(best.run.first, best.run.last);
  }

  /** The stay's days rendered for display ("Tue 30 Jun – Sat 4 Jul 2026 · 5 days"). */
  protected stayLabel(): string {
    return formatStay(this.selectedDate(), this.selectedLastDate(), { withYear: true });
  }

  /** Currency formatting for the template + accessible labels (shared helper, invariant #5). */
  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  /** Open the booking dialog (a pan-release click never reaches here — the canvas swallows it). */
  protected select(set: SetView): void {
    this.lastTriggerId = set.id;
    this.selectedSet.set(set);
  }

  /** Show which of the stay's days a partly-free set covers. */
  protected showDays(set: SetView): void {
    this.lastTriggerId = set.id;
    this.partlySet.set(set);
  }

  /** Close the sheet and hand focus back to the tile that opened it (modal a11y, RV-FE-9). */
  protected closeSheet(): void {
    this.partlySet.set(undefined);
    this.focusTile(this.lastTriggerId);
  }

  /**
   * Take the shorter stay a partly-free set (the sheet's, or the no-cover offer's) can host: re-read
   * the map for those days and, once it is here, open the dialog on that set.
   */
  protected shortenTo(set: SetView, days: DateRange): void {
    this.partlySet.set(undefined);
    this.pendingSelectSetId = set.id;
    this.lastTriggerId = set.id;
    this.onDatesChange(days);
  }

  private focusTile(setId: number | undefined): void {
    if (setId !== undefined) {
      queueMicrotask(() => {
        document.querySelector<HTMLElement>(`[data-set-id="${setId}"]`)?.focus();
      });
    }
  }

  /** Open the lightbox on `index`, remembering `triggerTestId` so closing returns focus there. */
  protected openLightbox(index: number, triggerTestId: string): void {
    this.lightboxTriggerTestId = triggerTestId;
    this.lightboxIndex.set(index);
  }

  /** Close the lightbox and hand focus back to the thumbnail that opened it (modal a11y, RV-FE-9). */
  protected closeLightbox(): void {
    this.lightboxIndex.set(undefined);
    this.moveFocus(this.lightboxTriggerTestId);
  }

  protected onDialogClose(): void {
    this.selectedSet.set(undefined);
    // Return focus to the tile that opened the dialog (modal a11y).
    this.focusTile(this.lastTriggerId);
  }

  protected async onBooked(): Promise<void> {
    this.selectedSet.set(undefined);
    // The confirmation screen reads BookingService.lastConfirmation() (set by the POST), so no
    // navigation state is needed.
    await this.router.navigate(['/booking/confirmation']);
  }

  protected async onAwaiting(): Promise<void> {
    this.selectedSet.set(undefined);
    // The payment page reads BookingService.lastAwaitingPayment() (set by the 202 POST) to mount
    // the Stripe Payment Element; confirmation follows the verified webhook (invariant #8).
    await this.router.navigate(['/booking/pay']);
  }

  protected async onRequested(): Promise<void> {
    this.selectedSet.set(undefined);
    // Nothing is charged until the venue accepts; the request-sent screen reads lastRequested().
    await this.router.navigate(['/booking/requested']);
  }
}
