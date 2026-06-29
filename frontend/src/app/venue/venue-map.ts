import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { formatMoney } from '../shared/money';
import { defaultBookingDate, parseIsoDate } from './booking-date';
import { MoneyView, SetView, VenueMapView } from './venue.model';
import { VenueService } from './venue.service';

interface MapRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

/**
 * Read-only visual beach map for one venue on a chosen day (U1, issue #4; date-aware since
 * issue #44). Renders the venue header, a per-date availability summary, a date control, and the
 * positioned set grid coloured by tier and availability. The map owns the selected date: changing
 * it re-fetches that date's availability and seeds the booking dialog's date, so the two always
 * agree. Money is rendered from integer minor units; tile state is conveyed by an accessible
 * name, not colour alone (WCAG AA).
 */
@Component({
  selector: 'app-venue-map',
  imports: [BookingDialog],
  templateUrl: './venue-map.html',
  styleUrl: './venue-map.scss',
})
export class VenueMap {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly router = inject(Router);

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly failed = signal(false);

  /** The day the map reflects (ISO YYYY-MM-DD); defaults to tomorrow in Europe/Tirane. */
  protected readonly selectedDate = signal(defaultBookingDate(new Date()));

  private readonly venueId: number | undefined;

  /** The set whose booking dialog is open, or undefined when closed. */
  protected readonly selectedSet = signal<SetView | undefined>(undefined);
  /** Id of the tile that opened the dialog, so focus can return to it on close. */
  private lastTriggerId: number | undefined;

  protected readonly freeCount = computed(
    () => this.venue()?.sets.filter((s) => s.availability === 'FREE').length ?? 0,
  );
  protected readonly totalCount = computed(() => this.venue()?.sets.length ?? 0);

  /** Sets grouped into rows (read order preserved) for the grid. */
  protected readonly rows = computed<readonly MapRow[]>(() => {
    const byRow = new Map<string, SetView[]>();
    for (const set of this.venue()?.sets ?? []) {
      const row = byRow.get(set.rowLabel) ?? [];
      row.push(set);
      byRow.set(set.rowLabel, row);
    }
    return [...byRow].map(([label, sets]) => ({ label, sets }));
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id)) {
      // Non-numeric path (e.g. /venues/abc) — fail fast instead of requesting /venues/NaN.
      this.failed.set(true);
      return;
    }
    this.venueId = id;
    this.load();
  }

  /** Fetch the map for the currently selected date. */
  private load(): void {
    if (this.venueId === undefined) {
      return;
    }
    // Capture the requested date so a slower earlier response can't overwrite a newer one
    // (last-writer-wins across rapid date switches) — apply only if it's still the chosen date.
    const requested = this.selectedDate();
    this.venues.getVenueMap(this.venueId, requested).subscribe({
      next: (venue) => {
        if (this.selectedDate() === requested) {
          this.venue.set(venue);
        }
      },
      error: () => {
        if (this.selectedDate() === requested) {
          this.failed.set(true);
        }
      },
    });
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
    return new Intl.DateTimeFormat('en-IE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parseIsoDate(this.selectedDate()));
  }

  /** Currency formatting for the template + accessible labels (shared helper, invariant #5). */
  protected money(amount: MoneyView): string {
    return formatMoney(amount);
  }

  protected rating(venue: VenueMapView): string {
    return (venue.ratingTenths / 10).toFixed(1);
  }

  protected bookingModeLabel(mode: VenueMapView['bookingMode']): string {
    return mode === 'INSTANT' ? 'Instant Book' : 'Request to Book';
  }

  /** Accessible name so tile state is not conveyed by colour alone (WCAG AA, AC-8). */
  protected setLabel(set: SetView): string {
    const tier = set.tier === 'PREMIUM' ? 'front row' : 'standard';
    const state = set.availability === 'TAKEN' ? 'taken' : 'available';
    return `Set ${set.rowLabel} ${set.positionNo}, ${tier}, ${this.money(set.price)}, ${state}`;
  }

  /** A set is bookable online iff it is free and in the online pool (invariant #3). */
  protected isBookable(set: SetView): boolean {
    return set.availability === 'FREE' && set.pool === 'ONLINE';
  }

  /** Accessible name for the booking button. */
  protected bookLabel(set: SetView): string {
    return `${this.setLabel(set)}. Select to book.`;
  }

  /** aria-label for the tile itself — only when non-interactive (the button carries it otherwise). */
  protected tileAriaLabel(set: SetView): string | null {
    return this.isBookable(set) ? null : this.setLabel(set);
  }

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
}
