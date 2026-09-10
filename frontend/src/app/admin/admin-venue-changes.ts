import { Component, computed, effect, inject, signal } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { TouchTarget } from '../shared/touch-target';
import { AdminVenueChangesService } from './admin-venue-changes.service';
import { AdminVenuesService } from './admin-venues.service';
import { VenueChangeRefundRow } from './admin.model';

/** One rendered row: the venue named, and all three figures already formatted. */
interface ReportRow {
  readonly venueId: number;
  readonly venueName: string;
  readonly refundCount: number;
  readonly refundedStr: string;
  readonly feeStr: string;
}

/**
 * The admin console's Venue changes tab: per venue, how many bookings a remodel refunded, what those
 * refunds returned to guests, and what the venue paid in venue-change fees. The epic's abuse guard —
 * built from ledger rows the refund path always writes, so a venue cannot be missing from it by
 * omission, and a venue that keeps re-laying its beach to resell the spots shows up as a number
 * rather than as a complaint.
 *
 * <p><strong>The two amounts are never added.</strong> The refunded total is what guests got back;
 * the fee total is what the platform charged for it. They come from different ledger entry types and
 * sit in separate columns.
 *
 * <p><strong>Venue names come from the admin venue list, not this endpoint.</strong> The payout
 * module holds no venue name — its published reads are role-split for tourists — so the report ships
 * venue ids and the console joins them, exactly as the moderation pickers do. A venue the list does
 * not name still renders, by id, rather than vanishing from an abuse report.
 *
 * <p>Like every admin tab, the surrounding {@code AdminConsole} shell self-gates on
 * {@link OperatorAuth} for UX while the backend `/api/admin/**` role gate does the enforcing; this
 * component only ever renders once both have passed.
 */
@Component({
  selector: 'app-admin-venue-changes',
  imports: [CardGlass, TouchTarget],
  template: `
    @if (loading()) {
      <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-venue-changes-loading">
        Loading…
      </p>
    } @else if (loadError()) {
      <p
        class="mt-4 text-[15px] text-riv-error-ink"
        role="alert"
        data-testid="admin-venue-changes-error"
      >
        Something went wrong loading venue-caused refunds.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          (click)="load()"
        >
          Retry
        </button>
      </p>
    } @else if (rows().length === 0) {
      <div appCardGlass class="mt-6 rounded-[14px] p-5" data-testid="admin-venue-changes-empty">
        <h2 class="text-[16px] font-semibold text-riv-card-ink">No venue-caused refunds</h2>
        <p class="mt-2 text-[15px] leading-[1.5] text-riv-card-ink-soft">
          No remodel has refunded a guest yet. A venue appears here the moment one does.
        </p>
      </div>
    } @else {
      <div
        appCardGlass
        class="mt-6 rounded-[14px] p-5"
        data-testid="admin-venue-changes-card"
        aria-labelledby="admin-venue-changes-heading"
      >
        <h2 id="admin-venue-changes-heading" class="text-[16px] font-semibold text-riv-card-ink">
          Venue-caused refunds
        </h2>
        <p class="mt-2 text-[13px] leading-[1.5] text-riv-card-ink-soft">
          What each venue's own layout changes returned to guests, and the fee it paid for them. The
          two are separate: the fee is deducted from the venue's payout, not from the refund.
        </p>

        <section
          class="mt-4 overflow-x-auto rounded-[14px] border border-riv-card-border"
          aria-label="Venue-caused refunds by venue"
          tabindex="0"
        >
          <table class="w-full border-collapse text-[13px]">
            <caption class="sr-only">
              Venue-caused refunds and fees, by venue
            </caption>
            <thead>
              <tr
                class="bg-riv-console-tint/5 text-[10.5px] uppercase tracking-[0.06em] text-riv-card-ink-soft"
              >
                <th scope="col" class="px-3.5 py-2.5 text-left font-bold">Venue</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Refunds</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Returned to guests</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Fees paid</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.venueId) {
                <tr class="border-t border-riv-card-border" data-testid="venue-change-row">
                  <td class="px-3.5 py-3 font-semibold text-riv-card-ink">{{ row.venueName }}</td>
                  <td class="whitespace-nowrap px-3.5 py-3 text-right text-riv-card-ink">
                    {{ row.refundCount }}
                  </td>
                  <td class="whitespace-nowrap px-3.5 py-3 text-right text-riv-card-ink-soft">
                    {{ row.refundedStr }}
                  </td>
                  <td
                    class="whitespace-nowrap px-3.5 py-3 text-right font-bold text-riv-console-negative-ink"
                    data-testid="venue-change-fee"
                  >
                    {{ row.feeStr }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <button
          type="button"
          appTouchTarget
          class="mt-4 rounded-full border border-riv-console-tint/15 bg-riv-console-tint/5 px-3.5 py-1.5 text-[13px] font-semibold text-riv-accent-ink"
          data-testid="admin-venue-changes-refresh"
          (click)="load()"
        >
          Refresh
        </button>
      </div>
    }
  `,
})
export class AdminVenueChanges {
  private readonly auth = inject(OperatorAuth);
  private readonly report = inject(AdminVenueChangesService);
  private readonly venues = inject(AdminVenuesService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  private readonly totals = signal<readonly VenueChangeRefundRow[]>([]);
  private readonly venueNames = signal<ReadonlyMap<number, string>>(new Map());

  protected readonly rows = computed<readonly ReportRow[]>(() => {
    const names = this.venueNames();
    return this.totals().map((total) => ({
      venueId: total.venueId,
      venueName: names.get(total.venueId) ?? `Venue #${total.venueId}`,
      refundCount: total.refundCount,
      refundedStr: formatMoney({ minorUnits: total.refundedMinor, currency: total.currency }),
      feeStr: formatMoney({ minorUnits: total.feeMinor, currency: total.currency }),
    }));
  });

  private loaded = false;

  constructor() {
    // Load once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.load();
      }
    });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [report, venues] = await Promise.all([this.report.report(), this.venues.venues()]);
      this.totals.set(report.venues);
      this.venueNames.set(new Map(venues.map((venue) => [venue.id, venue.name])));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
