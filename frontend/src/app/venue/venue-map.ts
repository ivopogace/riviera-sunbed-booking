import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { Amenity, amenityLabel, distanceToWaterLabel, orderedAmenities } from '../shared/amenities';
import { AmenityChip } from '../shared/amenity-chip';
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { CardGlass } from '../shared/card-glass';
import { FAILURE_DIRECTIVES } from '../shared/failure-panel';
import { formatMoney, MoneyView } from '../shared/money';
import { formatBookingDate } from '../shared/booking-date-label';
import { PanelGlass } from '../shared/panel-glass';
import { PhotoSlideshow } from '../shared/photo-slideshow';
import { slideshowPhotos } from '../shared/photo-url';
import { isRated, ratingScore } from '../shared/rating';
import { RetryButton } from '../shared/retry-button';
import { defaultBookingDate, isIsoDate } from '../shared/booking-date';
import { routeIdParam } from '../shared/parent-venue-id';
import { tierSentenceLabel } from '../shared/set-label';
import { SetView, VenueMapView } from '../shared/venue-views';
import { VenueService } from './venue.service';

import { TouchTarget } from '../shared/touch-target';

/**
 * One rendered set on the map: the raw {@link SetView} plus its precomputed seat code
 * (`A1`, `B7`), whether it is bookable (invariant #3), and its accessible name (state
 * carried by text, not colour — WCAG AA).
 */
interface MapTile {
  readonly set: SetView;
  readonly seat: string;
  readonly bookable: boolean;
  /** True for a FREE walk-in-pool set: rendered distinctly and named "walk-in only" (#672). */
  readonly walkInOnly: boolean;
  /** Accessible name for a non-interactive tile (`<li>`). */
  readonly name: string;
  /** Accessible name for the bookable button (adds the "Select to book" affordance). */
  readonly bookName: string;
}

/** One row of the map: the shared canvas's row contract plus this surface's tiles. */
interface MapRow extends BeachMapCanvasRow {
  readonly tiles: readonly MapTile[];
}

/**
 * The venue header's ready-to-render view: every per-venue display value the header
 * needs, precomputed once from the {@link VenueMapView} by {@link VenueMap.venueView} rather than
 * re-derived from the template each change-detection tick. The pure `shared/` helpers stay
 * signal-free; this record memoizes their outputs off the `venue` signal. `bookingMode` is carried
 * raw for the booking dialog; `modeLabel` is its display string.
 */
interface VenueHeader {
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
 * Derive a row's compact display code from its **insertion index** — `0→A … 25→Z, 26→AA,
 * 27→AB …` (bijective base-26, spreadsheet-column style). The map assigns these over the
 * rows in the order the API returns them (ordered `grid_y, grid_x`), so two-letter codes
 * stay in insertion order (`…Z, AA`) and are never lexicographically sorted (which would
 * wrongly place `AA` before `B`). Pure, so it is unit-tested directly.
 */
export function rowCode(index: number): string {
  let n = index;
  let code = '';
  do {
    code = String.fromCodePoint(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return code;
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
 * this component owns only the tourist tile vocabulary (tap-to-book) projected into it.
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
    PhotoSlideshow,
    CardGlass,
    AmenityChip,
    TouchTarget,
    BeachMapCanvas,
    BeachMapRowDef,
    ...FAILURE_DIRECTIVES,
  ],
  templateUrl: './venue-map.html',
  // --riv-tile (tile size + rail-cell heights) now lives on the shared canvas's host.
  host: {
    class: 'block text-(--riv-card-ink)',
  },
})
export class VenueMap {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly router = inject(Router);

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly failed = signal(false);

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

  /** The set whose booking dialog is open, or undefined when closed. */
  protected readonly selectedSet = signal<SetView | undefined>(undefined);
  /** Id of the tile that opened the dialog, so focus can return to it on close. */
  private lastTriggerId: number | undefined;

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

  /** Sets grouped into rows (read order preserved), each with a derived code + per-row price. */
  protected readonly rows = computed<readonly MapRow[]>(() => {
    const byRow = new Map<string, SetView[]>();
    for (const set of this.venue()?.sets ?? []) {
      const row = byRow.get(set.rowLabel) ?? [];
      row.push(set);
      byRow.set(set.rowLabel, row);
    }
    const entries = [...byRow.entries()];
    return entries.map(([label, sets], index) => {
      const code = rowCode(index);
      const price = sets[0].price;
      const prev = index > 0 ? entries[index - 1][1][0].price : undefined;
      return {
        code,
        priceLabel: formatMoney(price),
        zoneStart: prev?.minorUnits !== price.minorUnits || prev?.currency !== price.currency,
        tileCount: sets.length,
        tiles: sets.map((set) => this.toTile(set, code, label)),
      };
    });
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
  private toTile(set: SetView, code: string, descriptiveLabel: string): MapTile {
    const tier = tierSentenceLabel(set.tier);
    const walkInOnly = set.availability === 'FREE' && set.pool === 'WALK_IN';
    let state = 'available';
    if (set.availability === 'TAKEN') {
      state = 'taken';
    } else if (walkInOnly) {
      state = 'walk-in only — book at the venue';
    }
    const seat = `${code}${set.positionNo}`;
    const bookable = set.availability === 'FREE' && set.pool === 'ONLINE';
    const name = `Set ${seat}, ${descriptiveLabel}, ${tier}, ${this.money(set.price)}, ${state}`;
    return { set, seat, bookable, walkInOnly, name, bookName: `${name}. Select to book.` };
  }

  /** Fetch the map for the currently selected date. */
  private load(): void {
    const id = this.venueId();
    if (id === undefined) {
      return;
    }
    // A fresh attempt clears any prior failure so a recovered load renders the map.
    this.failed.set(false);
    // The per-dispatch generation: any later dispatch or reset supersedes this response.
    const epoch = ++this.epoch;
    this.venues.getVenueMap(id, this.selectedDate()).subscribe({
      next: (venue) => {
        if (this.epoch === epoch) {
          this.venue.set(venue);
        }
      },
      error: () => {
        if (this.epoch === epoch) {
          this.failed.set(true);
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
  protected onDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedSet.set(undefined);
    this.selectedDate.set(value);
    this.load();
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
