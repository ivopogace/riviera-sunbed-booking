import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { groupSetsByRow } from '../shared/availability-grid';
import { CardGlass } from '../shared/card-glass';
import { eurosToMinorUnits, formatMoney, minorUnitsToEuros } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { RepriceErrorCode } from './operator-console.model';
import { OperatorConsoleService, repriceErrorOf } from './operator-console.service';

/**
 * One editable pricing row. {@link priceEur} is the euros string bound to the input — empty when the
 * row's sets carry different prices ({@link mixed}), so a heterogeneous row is not misrepresented as
 * a single value. {@link currency} is the row's ISO currency, applied to the reprice.
 */
interface PriceRow {
  readonly label: string;
  readonly desc: string;
  readonly priceEur: string;
  readonly currency: string;
  readonly mixed: boolean;
}

/**
 * The O4 Pricing tab (issue #174, epic #141) — one full-day EUR price input per beach-map <strong>row</strong>,
 * applied to every set in that row, with a live "projected full-day take if every online set sells" figure.
 *
 * <p>Reads the current layout from the public venue map (like {@link import('./layout-editor').LayoutEditor})
 * and groups sets by row label. Committing a row's € input (on {@code change}) converts the euros to
 * <strong>integer minor units at the edge</strong> (invariant #5 — no float in state or on the wire) and
 * PUTs a non-destructive per-row reprice; the projection sums only ONLINE-pool sets. An empty/cleared
 * field is ignored (never a €0 reprice). The write is owner-asserted server-side (invariant #13); a
 * failure reverts only that row's optimistic price and shows operator-facing copy. Always porcelain
 * (inherited from the console shell); glass via {@link CardGlass}; money display via {@link formatMoney}.
 */
@Component({
  selector: 'app-pricing-tab',
  imports: [CardGlass],
  templateUrl: './pricing-tab.html',
})
export class PricingTab {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this tab manages, from the parent `/operator/:venueId` route (undefined if invalid). */
  protected readonly venueId: number | undefined;

  /** The venue's sets, from the U1 read; the source of the rows + the projected take. */
  private readonly sets = signal<readonly SetView[]>([]);
  /** True once the initial load settles (success or failure) — drives the empty state vs the rows. */
  protected readonly loaded = signal(false);
  /** True when the initial venue read failed — shows an error (not a false "no sets" empty state). */
  protected readonly loadError = signal(false);

  /** The last row saved and the last per-row error — sequential edits, per-row so a fail is scoped. */
  protected readonly savedRow = signal<string | null>(null);
  protected readonly errorRow = signal<{ label: string; code: RepriceErrorCode } | null>(null);

  /** One row per label (in read order), with its tier description and current price as a EUR string. */
  protected readonly rows = computed<PriceRow[]>(() =>
    groupSetsByRow(this.sets()).map(({ label, sets }) => {
      const uniform = sets.every((s) => s.price.minorUnits === sets[0].price.minorUnits);
      return {
        label,
        desc: `${sets.some((s) => s.tier === 'PREMIUM') ? 'Front row' : 'Standard'} · ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`,
        // Blank the input for a heterogeneous row so it isn't shown as one price; editing unifies it.
        priceEur: uniform ? minorUnitsToEuros(sets[0].price.minorUnits) : '',
        currency: sets[0].price.currency,
        mixed: !uniform,
      };
    }),
  );

  /** The projected full-day take: Σ prices of ONLY the online-pool sets, rendered from minor units. */
  protected readonly projected = computed(() => {
    const online = this.sets().filter((s) => s.pool === 'ONLINE');
    const minorUnits = online.reduce((sum, s) => sum + s.price.minorUnits, 0);
    return formatMoney({ minorUnits, currency: online[0]?.price.currency ?? 'EUR' });
  });

  constructor() {
    const id = parentVenueId(this.route);
    if (id !== undefined) {
      this.venueId = id;
      this.load(id);
    } else {
      this.loaded.set(true);
    }
  }

  /**
   * Commit a row's € input: convert to integer minor units and reprice the row, reverting THAT row
   * (not a concurrent edit) on failure. An empty or non-numeric field is ignored — the input is
   * restored to the row's shown price, never sent as a €0 reprice.
   */
  protected async onPriceChange(row: PriceRow, input: HTMLInputElement): Promise<void> {
    if (this.venueId === undefined) {
      return;
    }
    const minorUnits = eurosToMinorUnits(input.value);
    if (minorUnits === null) {
      input.value = row.priceEur; // a cleared/invalid field is not a €0 reprice — restore the shown value
      return;
    }
    const price: MoneyView = { minorUnits, currency: row.currency };
    const previous = this.rowPrice(row.label); // for a scoped revert — never a whole-sets snapshot
    this.applyRowPrice(row.label, price); // optimistic — the projection updates immediately
    this.savedRow.set(null);
    this.errorRow.set(null);
    try {
      await firstValueFrom(this.console.repriceRow(this.venueId, row.label, price));
      this.savedRow.set(row.label);
    } catch (error) {
      if (previous) {
        this.applyRowPrice(row.label, previous); // revert only this row, leaving concurrent edits intact
      }
      const code = repriceErrorOf(error);
      this.errorRow.set({ label: row.label, code });
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    }
  }

  /** The operator-facing message for a reprice failure code. */
  protected errorMessage(code: RepriceErrorCode): string {
    switch (code) {
      case 'NOT_VENUE_OWNER':
        return 'You do not manage this venue, so its prices can’t be changed.';
      case 'NO_SUCH_ROW':
        return 'This row no longer exists. Reload the tab and try again.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'INVALID_REQUEST':
        return 'That price is not valid. Enter an amount of €0 or more.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong saving the price. Please try again.';
    }
  }

  private load(venueId: number): void {
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        this.sets.set([...venue.sets]);
        this.loaded.set(true);
      },
      error: (error: unknown) => {
        // A transient read failure must NOT read as "no sets yet" (a dead-end) — show an error.
        this.loadError.set(true);
        this.loaded.set(true);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.operator.sessionLost();
        }
      },
    });
  }

  private applyRowPrice(label: string, price: MoneyView): void {
    this.sets.update((sets) => sets.map((s) => (s.rowLabel === label ? { ...s, price } : s)));
  }

  private rowPrice(label: string): MoneyView | undefined {
    return this.sets().find((s) => s.rowLabel === label)?.price;
  }
}
