import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Amenity, amenityLabel, distanceToWaterLabel, orderedAmenities } from '../../shared/amenities';
import { AmenityChip } from '../../shared/amenity-chip';
import { CardGlass } from '../../shared/card-glass';
import { FAILURE_DIRECTIVES } from '../../shared/failure-panel';
import { formatMoney } from '../../shared/money';
import { formatBookingDate } from '../../shared/booking-date-label';
import { PanelGlass } from '../../shared/panel-glass';
import { isRated, ratingScore } from '../../shared/rating';
import { RetryButton } from '../../shared/retry-button';
import { defaultBookingDate } from '../../shared/booking-date';
import { VenueSummary } from '../../shared/venue-views';
import { VenueService } from '../../venue/venue.service';

/**
 * A discovery card's ready-to-render view: every per-venue display value the
 * template needs, precomputed once from a {@link VenueSummary} by {@link Home.venuesView} rather
 * than re-derived per item on each change-detection tick. The pure `shared/` helpers stay
 * signal-free; this record is where their outputs are memoized off the `venues` signal.
 */
interface VenueCard {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly coverPhoto: VenueSummary['coverPhoto'];
  readonly modeLabel: string;
  readonly isRated: boolean;
  readonly rating: string;
  readonly reviewsCount: number;
  readonly water: string | null;
  readonly amenities: readonly { readonly code: Amenity; readonly label: string }[];
  readonly freePercent: number;
  /** The "from €X / set" price string, or `null` when the venue has no sets ("No sets yet"). */
  readonly priceLabel: string | null;
  readonly free: number;
  readonly total: number;
  /** The single accessible name carrying every card fact (nothing conveyed by layout alone). */
  readonly ariaLabel: string;
}

/**
 * Tourist venue discovery — the app's landing page (`/`).
 * Hero + one glass filter bar (beach/region/date with the live result count inside) + glass venue
 * cards (the cover photo when uploaded, else the gradient placeholder; mode chip, rating,
 * availability bar), each a link to the beach map at `/venues/:id`. The date drives the per-venue availability count (invariant #2). Money is
 * rendered from integer minor units (invariant #5); every card fact is conveyed as text, not
 * colour alone (WCAG AA). Loading, empty, and error states are distinct.
 */
@Component({
  selector: 'app-home',
  imports: [
    NgOptimizedImage,
    RouterLink,
    RetryButton,
    PanelGlass,
    CardGlass,
    AmenityChip,
    ...FAILURE_DIRECTIVES,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly venueService = inject(VenueService);

  /** The displayed (filtered) venues; `undefined` while a request is in flight (loading). */
  protected readonly venues = signal<VenueSummary[] | undefined>(undefined);
  protected readonly failed = signal(false);

  /** Current filter selection. Empty string = "all" (no constraint). */
  protected readonly beach = signal('');
  protected readonly region = signal('');
  /**
   * The earliest selectable booking date — tomorrow in Europe/Tirane. Backs the date input's `min`
   * and clamps a hand-typed date so past/today dates can't be presented as bookable (an
   * invariant #4 display guardrail; the server stays authoritative for the real cutoff).
   */
  protected readonly minDate = defaultBookingDate(new Date());
  /** The day availability is counted for (ISO YYYY-MM-DD); defaults to the earliest bookable date. */
  protected readonly selectedDate = signal(this.minDate);

  /** Distinct beaches/regions for the filter selects, captured once from the unfiltered catalogue. */
  protected readonly beaches = signal<readonly string[]>([]);
  protected readonly regions = signal<readonly string[]>([]);

  /** True only once a response has arrived and it is empty (distinct from the loading state). */
  protected readonly isEmpty = computed(() => {
    const list = this.venues();
    return list !== undefined && list.length === 0;
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

  /** Guards against an earlier slow response overwriting a newer one (last-writer-wins). */
  private lastRequest = '';

  /**
   * The fetch to repeat when Retry is pressed — the *failed* request, not a fixed one: an
   * initial-load failure retries `loadInitial` (which re-seeds the filter selects), whereas a
   * filter-change failure retries `reload` (which preserves the active beach/region filter).
   * Assigned by whichever load runs first; the constructor's `loadInitial()` sets it before any
   * Retry click is possible (definite assignment — no dead initial closure to leave uncovered).
   */
  private lastLoad!: () => void;

  constructor() {
    this.loadInitial();
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
      .listVenues({ beach: this.beach() || undefined, region: this.region() || undefined }, this.selectedDate())
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

  /** Retry the load that failed (the failure panel's "Try again" button). */
  protected onRetryDiscover(): void {
    this.lastLoad();
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
    const { free, total } = venue.availability;
    const freePercent = total === 0 ? 0 : Math.round((free / total) * 100);

    const price = priceLabel ? `, from ${priceLabel} per set` : '';
    const waterText = water ? `${water}. ` : '';
    const amenitiesText = amenities.length
      ? `Amenities: ${amenities.map((a) => a.label).join(', ')}. `
      : '';
    const ratingText = rated ? `rated ${rating} out of 5` : 'no reviews yet';
    const ariaLabel =
      `${venue.name}, ${venue.beach} · ${venue.region}, ${ratingText}${price}, `
      + `${free} of ${total} sets free on ${dateLabel}. `
      + `${waterText}${amenitiesText}`
      + `View beach map.`;

    return {
      id: venue.id,
      name: venue.name,
      beach: venue.beach,
      region: venue.region,
      coverPhoto: venue.coverPhoto,
      modeLabel: venue.bookingMode === 'INSTANT' ? 'Instant Book' : 'Request to Book',
      isRated: rated,
      rating,
      reviewsCount: venue.reviewsCount,
      water,
      amenities,
      freePercent,
      priceLabel,
      free,
      total,
      ariaLabel,
    };
  }
}
