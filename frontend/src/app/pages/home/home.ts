import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatMoney } from '../../shared/money';
import { defaultBookingDate, parseIsoDate } from '../../venue/booking-date';
import { MoneyView, VenueSummary } from '../../venue/venue.model';
import { VenueService } from '../../venue/venue.service';

/**
 * Tourist venue discovery — the app's landing page (`/`, issue #61, design §4.1 steps 1–2). Lists
 * venues as cards (name, beach·region, rating, "from" price, that day's free/total availability),
 * each linking to the beach map at `/venues/:id`. A beach + region filter and a date control narrow
 * the list; the date drives the per-venue availability count (invariant #2). Money is rendered from
 * integer minor units (invariant #5); every card fact is conveyed as text, not colour alone (WCAG
 * AA). Loading, empty, and error states are distinct.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
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
  /** The day availability is counted for (ISO YYYY-MM-DD); defaults to tomorrow in Europe/Tirane. */
  protected readonly selectedDate = signal(defaultBookingDate(new Date()));

  /** Distinct beaches/regions for the filter selects, captured once from the unfiltered catalogue. */
  protected readonly beaches = signal<readonly string[]>([]);
  protected readonly regions = signal<readonly string[]>([]);

  /** True only once a response has arrived and it is empty (distinct from the loading state). */
  protected readonly isEmpty = computed(() => {
    const list = this.venues();
    return list !== undefined && list.length === 0;
  });

  /** Guards against an earlier slow response overwriting a newer one (last-writer-wins). */
  private lastRequest = '';

  constructor() {
    this.loadInitial();
  }

  /** First load: no filters. Seeds the filter selects from the full catalogue and shows all venues. */
  private loadInitial(): void {
    const token = this.beginRequest();
    this.venueService.listVenues({}, this.selectedDate()).subscribe({
      next: (list) => {
        if (this.lastRequest !== token) {
          return;
        }
        this.beaches.set([...new Set(list.map((v) => v.beach))].sort());
        this.regions.set([...new Set(list.map((v) => v.region))].sort());
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
    const value = (event.target as HTMLInputElement).value;
    if (!value || value === this.selectedDate()) {
      return;
    }
    this.selectedDate.set(value);
    this.reload();
  }

  /** Currency formatting for the template + accessible labels (shared helper, invariant #5). */
  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  protected rating(venue: VenueSummary): string {
    return (venue.ratingTenths / 10).toFixed(1);
  }

  protected bookingModeLabel(mode: VenueSummary['bookingMode']): string {
    return mode === 'INSTANT' ? 'Instant Book' : 'Request to Book';
  }

  /** The selected date rendered for display (e.g. "Tue 30 Jun 2026"). */
  protected dateLabel(): string {
    return new Intl.DateTimeFormat('en-IE', {
      // parseIsoDate anchors the civil day at midnight UTC, so format in UTC too — otherwise a
      // viewer west of UTC sees the previous day (invariant #6: never rely on the default zone).
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parseIsoDate(this.selectedDate()));
  }

  /** A single accessible name carrying every card fact, so nothing is conveyed by layout alone. */
  protected cardLabel(venue: VenueSummary): string {
    const price = venue.fromPrice ? `, from ${this.money(venue.fromPrice)} per set` : '';
    return `${venue.name}, ${venue.beach} · ${venue.region}, rated ${this.rating(venue)} out of 5${price}, `
      + `${venue.availability.free} of ${venue.availability.total} sets free on ${this.dateLabel()}. `
      + `View beach map.`;
  }
}
