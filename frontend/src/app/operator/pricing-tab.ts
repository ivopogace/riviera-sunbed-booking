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
import { ConsoleVenueMap } from './console-venue-map';
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
  private readonly venueMap = inject(ConsoleVenueMap);
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

  /** True while a reprice PUT is in flight. The single shared `set_version` token cannot admit two
   *  concurrent reprices (the second would false-conflict), so a save serializes edits: the row inputs
   *  are disabled while it runs, and a `change` that still slips through is ignored (review finding). */
  protected readonly saving = signal(false);
  /** The last row saved and the last per-row error — sequential edits, per-row so a fail is scoped. */
  protected readonly savedRow = signal<string | null>(null);
  protected readonly errorRow = signal<{ label: string; code: RepriceErrorCode } | null>(null);
  /** The optimistic-concurrency token loaded with the map (#226 `setVersion`), echoed back on each
   *  reprice and advanced on success; a `409 STALE_WRITE` sets {@link staleConflict}. */
  protected readonly loadedSetVersion = signal<number | null>(null);
  /** True after a reprice lost the optimistic-concurrency race (409 STALE_WRITE) — a venue-level
   *  conflict (the whole `set_version` moved), so it drives a recover-and-reload banner, not the
   *  per-row inline error. Cleared by {@link reloadAfterStale}. */
  protected readonly staleConflict = signal(false);

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
    if (this.saving()) {
      // A reprice is already in flight; the shared set_version token would false-conflict a second
      // concurrent write, so serialize — ignore this edit and restore the shown value. The row inputs are
      // disabled during a save, so this guard is the defensive backstop for a change that slips through.
      input.value = row.priceEur;
      return;
    }
    const minorUnits = eurosToMinorUnits(input.value);
    if (minorUnits === null) {
      input.value = row.priceEur; // a cleared/invalid field is not a €0 reprice — restore the shown value
      return;
    }
    const expectedVersion = this.loadedSetVersion();
    if (expectedVersion === null) {
      // Defensive (#226): rows only render after a successful load seeds the token, so the only null case
      // is a failed read (which shows the load-error state instead). Never reprice without the token.
      input.value = row.priceEur;
      return;
    }
    const price: MoneyView = { minorUnits, currency: row.currency };
    const previous = this.rowPrice(row.label); // for a scoped revert — never a whole-sets snapshot
    this.applyRowPrice(row.label, price); // optimistic — the projection updates immediately
    this.savedRow.set(null);
    this.errorRow.set(null);
    this.staleConflict.set(false);
    this.saving.set(true); // synchronous, before the await — disables the inputs so no overlap starts
    try {
      await firstValueFrom(this.console.repriceRow(this.venueId, row.label, price, expectedVersion));
      this.savedRow.set(row.label);
      // The conditional write bumped set_version by one (#226); advance our token so a following
      // sequential row edit isn't spuriously rejected as a stale write.
      this.loadedSetVersion.set(expectedVersion + 1);
      // This row's price just changed server-side, so the console's shared snapshot is stale (#486).
      this.venueMap.reset();
    } catch (error) {
      if (previous) {
        this.applyRowPrice(row.label, previous); // revert only this row, leaving concurrent edits intact
      }
      const code = repriceErrorOf(error);
      if (code === 'STALE_WRITE') {
        // A venue-level conflict, not a per-row failure — the recover-and-reload banner owns it.
        this.staleConflict.set(true);
      } else {
        this.errorRow.set({ label: row.label, code });
      }
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.saving.set(false);
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

  /**
   * Recover from a `409 STALE_WRITE` (#226): re-load the venue map — re-seeding every row's price and the
   * `setVersion` token — and clear the conflict banner. The optimistic value already reverted when the
   * reprice failed, so this simply pulls the current server prices for the operator to re-apply.
   */
  protected reloadAfterStale(): void {
    const venueId = this.venueId;
    if (venueId === undefined) {
      return;
    }
    this.staleConflict.set(false);
    this.errorRow.set(null);
    this.savedRow.set(null);
    this.venueMap.reset(); // the snapshot holds the setVersion that lost the race — never re-seed from it
    this.load(venueId);
  }

  private load(venueId: number): void {
    this.venueMap.load(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        this.sets.set([...venue.sets]);
        this.loadedSetVersion.set(venue.setVersion ?? null); // #226: the token for the next reprice
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
