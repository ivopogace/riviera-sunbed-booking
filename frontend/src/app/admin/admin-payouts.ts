import { Component, computed, effect, inject, signal } from '@angular/core';
import { disabled, form, FormField, pattern, required } from '@angular/forms/signals';

import { OperatorAuth } from '../core/operator-auth';
import { isoWeekKey, todayBookingDate } from '../shared/booking-date';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { FieldErrorFor } from '../shared/field-error-for';
import { focusMover } from '../shared/focus-after-render';
import { LoadAnnouncer } from '../shared/load-announcer';
import { formatMoney } from '../shared/money';
import { TouchTarget } from '../shared/touch-target';
import { AdminPayoutsService, payoutMarkErrorOf } from './admin-payouts.service';
import { AdminVenuesService } from './admin-venues.service';
import { PayoutBatchStatus, PayoutBatchView } from './admin.model';

/** One rendered batch: the venue named and the total already formatted. */
interface BatchRow {
  readonly id: number;
  readonly venueName: string;
  readonly totalMinor: number;
  readonly totalStr: string;
  readonly status: PayoutBatchStatus;
}

/** The status as the table reads it. */
const STATUS_LABEL: Readonly<Record<PayoutBatchStatus, string>> = {
  DRAFT: 'Draft',
  REPORTED: 'Reported',
  SETTLED: 'Settled',
};

/**
 * The Payouts tab: an ISO week's per-venue BKT payout batches, generated from the ledger. A `DRAFT`
 * follows the ledger until the admin reports it at the total on screen; a refresh that moved it
 * in between is refused (`TOTAL_CHANGED`) and the tab re-reads the week (#1320). Names are joined
 * from the admin venue list (payout holds none); a venue the list does not name renders by id.
 */
@Component({
  selector: 'app-admin-payouts',
  imports: [CardGlass, TouchTarget, BusyAction, FieldErrorFor, FormField, LoadAnnouncer],
  template: `
    <section
      appCardGlass
      class="mt-6 rounded-[14px] p-5"
      data-testid="admin-payouts-period-card"
      aria-labelledby="admin-payouts-period-heading"
    >
      <h2 id="admin-payouts-period-heading" class="text-[16px] font-semibold text-riv-card-ink">
        Settlement week
      </h2>
      <p class="mt-2 max-w-[62ch] text-[13px] leading-[1.5] text-riv-card-ink-soft">
        One batch per venue with ledger activity that week. Generating refreshes every draft from
        the ledger; a reported or settled batch keeps the total it was reported at.
      </p>
      <label
        for="admin-payouts-period"
        class="mt-4 block text-[13.5px] font-semibold text-riv-card-ink"
        >ISO week</label
      >
      <input
        appTouchTarget
        id="admin-payouts-period"
        type="week"
        data-testid="admin-payouts-period"
        [formField]="periodForm.period"
        class="mt-1 w-full max-w-[220px] rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[16px] text-riv-card-ink"
        #periodControl
      />
      @if (periodError()) {
        <p
          class="mt-2 text-[13.5px] font-semibold text-riv-error-ink"
          role="alert"
          [appFieldErrorFor]="periodControl"
          data-testid="admin-payouts-period-error"
        >
          {{ periodError() }}
        </p>
      }
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          appTouchTarget
          type="button"
          data-testid="admin-payouts-show"
          [appBusy]="busy() || loading()"
          (click)="show()"
          class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          Show week
        </button>
        <button
          appTouchTarget
          type="button"
          data-testid="admin-payouts-generate"
          [appBusy]="busy() || loading()"
          (click)="generate()"
          class="rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          Generate from ledger
        </button>
      </div>
    </section>

    <output
      class="mt-3 block min-h-[1.5rem] text-[15px] text-riv-ink-soft"
      aria-live="polite"
      data-testid="admin-payouts-notice"
    >
      {{ notice() }}
    </output>

    <app-load-announcer
      [loading]="loading()"
      [ready]="!loading() && !loadError()"
      loadingLabel="Loading payout batches…"
      readyLabel="Payout batches loaded."
    />

    @if (loading()) {
      <p
        class="mt-3 text-[15px] text-riv-ink-soft"
        aria-hidden="true"
        data-testid="admin-payouts-loading"
      >
        Loading…
      </p>
    } @else if (loadError()) {
      <p class="mt-3 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-payouts-error">
        Something went wrong loading payout batches.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          data-testid="admin-payouts-retry"
          (click)="retry()"
        >
          Retry
        </button>
      </p>
    } @else if (rows().length === 0) {
      <div appCardGlass class="mt-3 rounded-[14px] p-5" data-testid="admin-payouts-empty">
        <h2 class="text-[16px] font-semibold text-riv-card-ink">No batches for {{ shown() }}</h2>
        <p class="mt-2 text-[15px] leading-[1.5] text-riv-card-ink-soft">
          Generate the week to build one batch per venue from its ledger.
        </p>
      </div>
    } @else {
      <div
        appCardGlass
        class="mt-3 rounded-[14px] p-5"
        data-testid="admin-payouts-card"
        aria-labelledby="admin-payouts-heading"
      >
        <h2 id="admin-payouts-heading" class="text-[16px] font-semibold text-riv-card-ink">
          Batches for {{ shown() }}
        </h2>
        <p class="mt-2 text-[13px] leading-[1.5] text-riv-card-ink-soft">
          Reporting freezes the total shown. Pay it via BKT, then mark the batch settled.
        </p>

        <section
          class="relative mt-4 overflow-x-auto rounded-[14px] border border-riv-card-border"
          aria-label="Payout batches by venue"
          tabindex="0"
        >
          <table class="w-full border-collapse text-[13px]">
            <caption class="sr-only">
              Payout batches for
              {{
                shown()
              }}, by venue
            </caption>
            <thead>
              <tr
                class="bg-riv-console-tint/5 text-[10.5px] uppercase tracking-[0.06em] text-riv-card-ink-soft"
              >
                <th scope="col" class="px-3.5 py-2.5 text-left font-bold">Venue</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Net owed</th>
                <th scope="col" class="px-3.5 py-2.5 text-left font-bold">Status</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">
                  <span class="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr class="border-t border-riv-card-border" data-testid="payout-batch-row">
                  <td class="px-3.5 py-3 font-semibold text-riv-card-ink">{{ row.venueName }}</td>
                  <td
                    class="whitespace-nowrap px-3.5 py-3 text-right font-bold text-riv-card-ink"
                    data-testid="payout-batch-total"
                  >
                    {{ row.totalStr }}
                  </td>
                  <td class="px-3.5 py-3 text-riv-card-ink-soft" data-testid="payout-batch-status">
                    {{ statusLabel[row.status] }}
                  </td>
                  <td class="whitespace-nowrap px-3.5 py-2 text-right">
                    @switch (row.status) {
                      @case ('DRAFT') {
                        <button
                          appTouchTarget
                          type="button"
                          [attr.data-testid]="'payout-batch-report-' + row.id"
                          [appBusy]="busy()"
                          (click)="report(row)"
                          class="rounded-[10px] border border-riv-field-border px-3 py-1.5 text-[13px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                        >
                          Report at {{ row.totalStr }}
                          <span class="sr-only">for {{ row.venueName }}</span>
                        </button>
                      }
                      @case ('REPORTED') {
                        <button
                          appTouchTarget
                          type="button"
                          [attr.data-testid]="'payout-batch-settle-' + row.id"
                          [appBusy]="busy()"
                          (click)="settle(row)"
                          class="rounded-[10px] border border-riv-field-border px-3 py-1.5 text-[13px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                        >
                          Mark settled
                          <span class="sr-only">for {{ row.venueName }}</span>
                        </button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      </div>
    }
  `,
})
export class AdminPayouts {
  private readonly auth = inject(OperatorAuth);
  private readonly payouts = inject(AdminPayoutsService);
  private readonly venues = inject(AdminVenuesService);
  private readonly focusAfterRender = focusMover();

  protected readonly statusLabel = STATUS_LABEL;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly periodError = signal('');

  /** The week the table shows, which the field may have moved away from. */
  protected readonly shown = signal(isoWeekKey(todayBookingDate(new Date())));

  protected readonly model = signal({ period: this.shown() });
  protected readonly periodForm = form(this.model, (path) => {
    disabled(path.period, { when: () => this.busy() });
    required(path.period);
    pattern(path.period, /^\d{4}-W\d{2}$/);
  });

  private readonly batches = signal<readonly PayoutBatchView[]>([]);
  private readonly venueNames = signal<ReadonlyMap<number, string>>(new Map());

  protected readonly rows = computed<readonly BatchRow[]>(() => {
    const names = this.venueNames();
    return this.batches().map((batch) => toRow(batch, names));
  });

  private loaded = false;

  constructor() {
    // Load once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.read(this.shown());
      }
    });
  }

  /** Read the week in the field; one read or write at a time, so no older answer lands last. */
  protected async show(): Promise<void> {
    const period = this.validatedPeriod();
    if (period !== null && !this.busy() && !this.loading()) {
      this.notice.set('');
      await this.read(period);
    }
  }

  /** Re-read the week shown, then focus what replaced the Retry button. */
  protected async retry(): Promise<void> {
    if (this.loading()) {
      return;
    }
    await this.read(this.shown());
    this.focusAfterRender(
      this.loadError() ? 'admin-payouts-error' : 'admin-payouts-card',
      'admin-payouts-empty',
    );
  }

  /** Generate or refresh the week in the field, answering every batch it now has. */
  protected async generate(): Promise<void> {
    const period = this.validatedPeriod();
    if (period === null || this.busy() || this.loading()) {
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      const generated = await this.payouts.generate(period);
      this.batches.set(generated);
      this.shown.set(period);
      this.loadError.set(false);
      this.notice.set(
        `Generated ${generated.length} ${generated.length === 1 ? 'batch' : 'batches'} for ${period}.`,
      );
    } catch {
      this.notice.set(`Something went wrong generating ${period}. Nothing was changed.`);
    } finally {
      this.busy.set(false);
    }
    this.focusAfterRender('admin-payouts-notice');
  }

  /** Freeze a draft at the total on screen; a refresh since then is refused and the week re-read. */
  protected async report(row: BatchRow): Promise<void> {
    await this.mark(
      row,
      () => this.payouts.markReported(row.id, row.totalMinor),
      (marked) => `${row.venueName} is reported at ${formatBatchTotal(marked)}.`,
    );
  }

  protected async settle(row: BatchRow): Promise<void> {
    await this.mark(
      row,
      () => this.payouts.markSettled(row.id),
      () => `${row.venueName} is settled.`,
    );
  }

  private async mark(
    row: BatchRow,
    write: () => Promise<PayoutBatchView>,
    done: (marked: PayoutBatchView) => string,
  ): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      const marked = await write();
      this.batches.update((all) => all.map((batch) => (batch.id === marked.id ? marked : batch)));
      this.notice.set(done(marked));
    } catch (error) {
      this.notice.set(await this.refusalOf(row, error));
    } finally {
      this.busy.set(false);
    }
    this.focusAfterRender('admin-payouts-notice');
  }

  /** Re-read the week the refusal is about and say what the admin now sees. */
  private async refusalOf(row: BatchRow, error: unknown): Promise<string> {
    const reason = payoutMarkErrorOf(error);
    if (reason === 'UNKNOWN') {
      return `Something went wrong updating ${row.venueName}. Nothing was changed.`;
    }
    try {
      this.batches.set(await this.payouts.forPeriod(this.shown()));
    } catch {
      this.loadError.set(true);
      return `${row.venueName} was not updated, and the week could not be re-read.`;
    }
    const current = this.batches().find((batch) => batch.id === row.id);
    if (reason === 'TOTAL_CHANGED' && current?.status === 'DRAFT') {
      return (
        `${row.venueName} now nets ${formatBatchTotal(current)}, not ${row.totalStr}: the ledger ` +
        `moved since this week was loaded. Nothing was reported; review the new total.`
      );
    }
    if (!current) {
      return `${row.venueName}'s batch is gone. Nothing was changed.`;
    }
    return `${row.venueName} is already ${STATUS_LABEL[current.status].toLowerCase()}. Nothing was changed.`;
  }

  /** The names are best-effort: without them a batch still renders, by venue id. */
  private async read(period: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [batches, venues] = await Promise.all([
        this.payouts.forPeriod(period),
        this.venueNames().size === 0 ? this.venues.venues().catch(() => null) : null,
      ]);
      this.batches.set(batches);
      this.shown.set(period);
      if (venues) {
        this.venueNames.set(new Map(venues.map((venue) => [venue.id, venue.name])));
      }
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The week to send, or `null` with the field error set. */
  private validatedPeriod(): string | null {
    if (this.periodForm.period().invalid()) {
      this.periodError.set('Choose a week, for example 2026-W25.');
      return null;
    }
    this.periodError.set('');
    return this.model().period;
  }
}

function toRow(batch: PayoutBatchView, names: ReadonlyMap<number, string>): BatchRow {
  return {
    id: batch.id,
    venueName: names.get(batch.venueId) ?? `Venue #${batch.venueId}`,
    totalMinor: batch.totalNetMinor,
    totalStr: formatBatchTotal(batch),
    status: batch.status,
  };
}

function formatBatchTotal(batch: PayoutBatchView): string {
  return formatMoney({ minorUnits: batch.totalNetMinor, currency: batch.currency });
}
