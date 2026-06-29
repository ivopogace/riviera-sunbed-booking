import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { BookingDialog } from '../booking/booking-dialog';
import { MoneyView, SetView, VenueMapView } from './venue.model';
import { VenueService } from './venue.service';

interface MapRow {
  readonly label: string;
  readonly sets: readonly SetView[];
}

/**
 * Read-only visual beach map for one venue on one day (U1, issue #4). Renders the venue
 * header, an availability summary, and the positioned set grid coloured by tier and
 * availability. No booking flow — selection/payment is U3+. Money is rendered from integer
 * minor units; tile state is conveyed by an accessible name, not colour alone (WCAG AA).
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
    this.venues.getVenueMap(id).subscribe({
      next: (venue) => this.venue.set(venue),
      error: () => this.failed.set(true),
    });
  }

  /**
   * Render integer minor units as a currency string (display only — no float stored).
   * Pinned to a fixed Eurozone-English locale so output is deterministic across deploy
   * environments (a runtime-default locale would render "45 €" under de/fr).
   */
  protected money(amount: MoneyView): string {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: amount.currency,
      minimumFractionDigits: amount.minorUnits % 100 === 0 ? 0 : 2,
    }).format(amount.minorUnits / 100);
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

  protected onBooked(): void {
    this.selectedSet.set(undefined);
    // The confirmation screen reads BookingService.lastConfirmation() (set by the POST), so no
    // navigation state is needed.
    void this.router.navigate(['/booking/confirmation']);
  }
}
