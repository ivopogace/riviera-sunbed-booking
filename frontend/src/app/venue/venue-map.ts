import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

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
  imports: [],
  templateUrl: './venue-map.html',
  styleUrl: './venue-map.scss',
})
export class VenueMap {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);

  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  protected readonly failed = signal(false);

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
}
