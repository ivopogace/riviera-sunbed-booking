import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { Amenity, amenityLabel, distanceToWaterLabel, orderedAmenities } from '../shared/amenities';
import { AmenityChip } from '../shared/amenity-chip';
import { SemanticChip } from '../shared/semantic-chip';
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { CardGlass } from '../shared/card-glass';
import { MAP_SKELETON_ROWS, MAP_SKELETON_TILES } from '../shared/map-skeleton';
import { SkeletonBlock } from '../shared/skeleton-block';
import { LoadAnnouncer } from '../shared/load-announcer';
import { CutoffNote } from '../shared/cutoff-note';
import { FAILURE_DIRECTIVES } from '../shared/failure-panel';
import { MAP_TILE_LEGEND, MAP_TILE_MEANING, MapTile, MapTileState, mapTileState } from './map-tile';
import { rowPriceLabel } from './row-price-label';
import { formatMoney, MoneyView } from '../shared/money';
import { focusMover } from '../shared/focus-after-render';
import { formatBookingDate } from '../shared/booking-date-label';
import { PanelGlass } from '../shared/panel-glass';
import { PhotoGalleryGrid } from '../shared/photo-gallery-grid';
import { PhotoLightbox } from '../shared/photo-lightbox';
import { PhotoSlideshow } from '../shared/photo-slideshow';
import { slideshowPhotos } from '../shared/photo-url';
import { isRated, ratingScore } from '../shared/rating';
import { RetryButton } from '../shared/retry-button';
import { defaultBookingDate, formatCivilDate, isIsoDate } from '../shared/booking-date';
import { routeIdParam } from '../shared/parent-venue-id';
import { spotLabel, tierSentenceLabel } from '../shared/set-label';
import { SetView, VenueMapView } from '../shared/venue-views';
import { AvailabilityCalendar } from './availability-calendar';
import { VenueService } from './venue.service';

import { TouchTarget } from '../shared/touch-target';

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
  readonly photos: readonly string[];
  readonly bookingMode: VenueMapView['bookingMode'];
  readonly modeLabel: string;
  readonly isRated: boolean;
  readonly rating: string;
  readonly reviewsCount: number;
  /** The "from €X / set" price string, or `null` when the venue has no sets. */
  readonly priceLabel: string | null;
  readonly water: string | null;
  readonly amenities: readonly { readonly code: Amenity; readonly label: string }[];
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
    BookingDialog,
    RetryButton,
    PanelGlass,
    PhotoGalleryGrid,
    PhotoLightbox,
    PhotoSlideshow,
    CardGlass,
    LoadAnnouncer,
    CutoffNote,
    AmenityChip,
    SemanticChip,
    TouchTarget,
    BeachMapCanvas,
    BeachMapRowDef,
    SkeletonBlock,
    MapTile,
    AvailabilityCalendar,
    ...FAILURE_DIRECTIVES,
  ],
  templateUrl: './venue-map.html',
  // --riv-tile (tile size + rail-cell heights) now lives on the shared canvas's host.
  host: {
    class: 'block text-(--riv-card-ink)',
  },
})
export class VenueMap {
  /** The legend's rows, in tile-state order — labelled beside the colours they explain. */
  protected readonly legend = MAP_TILE_LEGEND;

  /** The in-flight skeleton's grid, shared with every other beach-map surface (#744). */
  protected readonly skeletonTiles = MAP_SKELETON_TILES;
  protected readonly skeletonRows = MAP_SKELETON_ROWS;

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

  /** Earliest bookable day (tomorrow, Europe/Tirane): today is not offered (invariant #4, display).
   *  Re-derived from a fresh clock on every route reset — the instance outlives
   *  navigations, so a construction-time floor would go stale past Tirane midnight. */
  protected readonly minDate = signal(defaultBookingDate(new Date()));

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /**
   * The day the map reflects (ISO YYYY-MM-DD). Seeded from {@link routeDate} on mount and on every
   * in-place route change that alters the venue or the carried `?date` param; the date
   * picker then writes it directly without touching the URL.
   */
  protected readonly selectedDate = signal(this.minDate());

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
  /** Id of the tile that opened the dialog, so focus can return to it on close. */
  private lastTriggerId: number | undefined;

  /** Index of the photo the lightbox opened on, or undefined when it's closed. */
  protected readonly lightboxIndex = signal<number | undefined>(undefined);
  /** The `data-testid` of whichever thumbnail opened the lightbox, so focus can return to it. */
  private lightboxTriggerTestId = 'photo-band-view';

  protected readonly freeCount = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

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
    return {
      id: v.id,
      name: v.name,
      beach: v.beach,
      region: v.region,
      description: v.description,
      photos: slideshowPhotos(v, 'banner'),
      bookingMode: v.bookingMode,
      modeLabel: v.bookingMode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
      isRated: isRated(v),
      rating: ratingScore(v.ratingTenths),
      reviewsCount: v.reviewsCount,
      priceLabel: v.fromPrice ? formatMoney(v.fromPrice) : null,
      water: distanceToWaterLabel(v.distanceToWaterM ?? null),
      amenities: orderedAmenities(v.amenities ?? []).map((code) => ({
        code,
        label: amenityLabel(code),
      })),
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

  /** The raw route context — `:id` plus the raw `?date` param — whose change triggers a reset. */
  private routeKey(): string {
    return `${this.venueId()}|${this.queryParams().get('date') ?? ''}`;
  }

  /** The route-carried map date: a well-formed `?date` on/after `floor`, else `floor`. */
  private routeDate(floor: string): string {
    const raw = this.queryParams().get('date');
    return raw && isIsoDate(raw) && raw >= floor ? raw : floor;
  }

  /** Drop every venue-scoped state — map, dialog, pan gesture, the map date — and load fresh,
   *  or fail fast on an invalid `:id` (no request for /venues/NaN). */
  private resetForVenue(id: number | undefined): void {
    this.epoch++;
    this.venue.set(undefined);
    this.selectedSet.set(undefined);
    // The reset takes any focus-trapped modal AND its trigger, so move focus deliberately (RV-FE-9).
    const modalWasOpen = this.pickerOpen() || this.lightboxIndex() !== undefined;
    this.pickerOpen.set(false);
    this.lightboxIndex.set(undefined);
    if (modalWasOpen) {
      this.moveFocus('map-loading');
    }
    this.lastTriggerId = undefined;
    const floor = defaultBookingDate(new Date());
    this.minDate.set(floor);
    this.selectedDate.set(this.routeDate(floor));
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
    const bookable = set.availability === 'FREE' && set.pool === 'ONLINE';
    const announced = MAP_TILE_MEANING[state].announced;
    const name = `${spotLabel(set.rowLabel, set.positionNo)}, ${tier}, ${this.money(set.price)}, ${announced}`;
    return { set, bookable, state, name, bookName: `${name}. Select to book.` };
  }

  /** Fetch the map for the currently selected date. */
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
    this.venues.getVenueMap(id, this.selectedDate()).subscribe({
      next: (venue) => {
        if (this.epoch === epoch) {
          this.venue.set(venue);
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

  /** Re-fetch availability for a newly chosen date (closing any open dialog first). */
  protected onDateChange(value: string): void {
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedSet.set(undefined);
    this.selectedDate.set(value);
    this.load();
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
  protected onDateChosen(value: string): void {
    this.onDateChange(value);
    this.closePicker();
  }

  /** The selected date on the picker trigger (e.g. "Tue 30 Jun 2026"). */
  protected triggerLabel(): string {
    return formatCivilDate(this.selectedDate());
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return formatBookingDate(this.selectedDate(), { withYear: true });
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
    const trigger = this.lastTriggerId;
    if (trigger !== undefined) {
      queueMicrotask(() => {
        const el = document.querySelector<HTMLElement>(`[data-set-id="${trigger}"]`);
        el?.focus();
      });
    }
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
