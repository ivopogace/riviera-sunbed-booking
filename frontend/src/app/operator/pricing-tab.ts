import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { RepriceErrorCode } from './operator-console.model';
import { OperatorConsoleService, repriceErrorOf } from './operator-console.service';

/** One editable pricing row: its label, tier description, and the current price as a EUR input string. */
interface PriceRow {
  readonly label: string;
  readonly desc: string;
  readonly priceEur: string;
  readonly currency: string;
}

/**
 * The O4 Pricing tab (issue #174, epic #141) — one full-day EUR price input per beach-map <strong>row</strong>,
 * applied to every set in that row, with a live "projected full-day take if every online set sells" figure.
 *
 * <p>Reads the current layout from the public venue map (like {@link import('./layout-editor').LayoutEditor})
 * and groups sets by row label. Committing a row's € input (on {@code change}) converts the euros to
 * <strong>integer minor units at the edge</strong> (invariant #5 — no float in state or on the wire) and
 * PUTs a non-destructive per-row reprice; the projection sums only ONLINE-pool sets. The write is
 * owner-asserted server-side (invariant #13); a failure reverts the optimistic local price and shows
 * operator-facing copy. Always porcelain (inherited from the console shell); glass via {@link CardGlass};
 * money display via {@link formatMoney}.
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

  /** The row currently being saved, the last row saved, and the last per-row error — sequential edits. */
  protected readonly savingRow = signal<string | null>(null);
  protected readonly savedRow = signal<string | null>(null);
  protected readonly errorRow = signal<{ label: string; code: RepriceErrorCode } | null>(null);

  /** One row per label (in read order), with its tier description and current price as a EUR string. */
  protected readonly rows = computed<PriceRow[]>(() => {
    const byLabel = new Map<string, SetView[]>();
    for (const set of this.sets()) {
      const group = byLabel.get(set.rowLabel);
      if (group) {
        group.push(set);
      } else {
        byLabel.set(set.rowLabel, [set]);
      }
    }
    return Array.from(byLabel, ([label, group]) => ({
      label,
      desc: `${group.some((s) => s.tier === 'PREMIUM') ? 'Front row' : 'Standard'} · ${group.length} ${group.length === 1 ? 'set' : 'sets'}`,
      priceEur: eurString(group[0].price.minorUnits),
      currency: group[0].price.currency,
    }));
  });

  /** The projected full-day take: Σ prices of ONLY the online-pool sets, rendered from minor units. */
  protected readonly projected = computed(() => {
    const online = this.sets().filter((s) => s.pool === 'ONLINE');
    const minorUnits = online.reduce((sum, s) => sum + s.price.minorUnits, 0);
    return formatMoney({ minorUnits, currency: online[0]?.price.currency ?? 'EUR' });
  });

  constructor() {
    const id = Number(this.route.parent?.snapshot.paramMap.get('venueId'));
    if (Number.isInteger(id) && id > 0) {
      this.venueId = id;
      this.load(id);
    } else {
      this.loaded.set(true);
    }
  }

  /** Commit a row's € input: convert to integer minor units, reprice the row, revert on failure. */
  protected async onPriceChange(label: string, raw: string): Promise<void> {
    if (this.venueId === undefined) {
      return;
    }
    const price: MoneyView = { minorUnits: toMinorUnits(raw), currency: this.currencyOf(label) };
    const before = this.sets();
    this.applyRowPrice(label, price); // optimistic — the projection updates immediately
    this.savingRow.set(label);
    this.savedRow.set(null);
    this.errorRow.set(null);
    try {
      await firstValueFrom(this.console.repriceRow(this.venueId, label, price));
      this.savingRow.set(null);
      this.savedRow.set(label);
    } catch (error) {
      this.sets.set(before); // revert so the shown price + projection match what is persisted
      this.savingRow.set(null);
      const code = repriceErrorOf(error);
      this.errorRow.set({ label, code });
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
      error: () => this.loaded.set(true),
    });
  }

  private applyRowPrice(label: string, price: MoneyView): void {
    this.sets.update((sets) => sets.map((s) => (s.rowLabel === label ? { ...s, price } : s)));
  }

  private currencyOf(label: string): string {
    return this.sets().find((s) => s.rowLabel === label)?.price.currency ?? 'EUR';
  }
}

/** Integer minor units (cents) from a euros input string — the money conversion at the edge (invariant #5). */
function toMinorUnits(raw: string): number {
  const euros = Number.parseFloat(raw);
  return Number.isFinite(euros) ? Math.max(0, Math.round(euros * 100)) : 0;
}

/** Integer minor units as a plain euros string for the number input (3500 → "35", 4250 → "42.5"). */
function eurString(minorUnits: number): string {
  return (minorUnits / 100).toString();
}
