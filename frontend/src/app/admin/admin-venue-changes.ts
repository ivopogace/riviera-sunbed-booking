import { Component, computed, effect, inject, signal } from '@angular/core';
import { disabled, form, FormField, maxLength } from '@angular/forms/signals';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { FieldErrorFor } from '../shared/field-error-for';
import { focusMover } from '../shared/focus-after-render';
import { eurosToMinorUnits, formatMoney, minorUnitsToEuros } from '../shared/money';
import { TouchTarget } from '../shared/touch-target';
import { AdminVenueChangesService } from './admin-venue-changes.service';
import { AdminVenuesService } from './admin-venues.service';
import { VenueChangeFeeView, VenueChangeRefundRow } from './admin.model';

/** One rendered row: the venue named, and all three figures already formatted. */
interface ReportRow {
  readonly venueId: number;
  readonly venueName: string;
  readonly refundCount: number;
  readonly refundedStr: string;
  readonly feeStr: string;
}

/**
 * The ceiling a stored fee may reach, mirroring the backend's `VenueChangeFeeAmount.MAX_FEE_MINOR`
 * and the table's `platform_setting_amount_check` — keep the three in lockstep. The client check is a
 * convenience: the server validates independently and answers `400 INVALID_REQUEST`.
 */
const MAX_FEE_MINOR = 100_000;

/**
 * The admin console's Venue changes tab: the fee the platform charges a venue for a refund its own
 * layout change caused, and — per venue — how many bookings a remodel refunded, what those refunds
 * returned to guests, and what the venue paid in those fees. The lever and its consequences on one
 * page, which is why the fee is edited here rather than on a tab of its own.
 *
 * <p>The report is the epic's abuse guard — built from ledger rows the refund path always writes, so
 * a venue cannot be missing from it by omission, and a venue that keeps re-laying its beach to resell
 * the spots shows up as a number rather than as a complaint.
 *
 * <p><strong>The two amounts are never added.</strong> The refunded total is what guests got back;
 * the fee total is what the platform charged for it. They come from different ledger entry types and
 * sit in separate columns.
 *
 * <p><strong>A fee change is forward-only in effect.</strong> It applies to every refund charged
 * after it, and fees already charged keep the amount they were charged at — the copy says exactly
 * that, and it is the guarantee the backend actually makes. It deliberately does not promise that a
 * remodel previewed at the old fee will be charged at the old fee: the charge happens
 * asynchronously, so a change landing in between is charged at the new amount.
 *
 * <p><strong>Venue names come from the admin venue list, not the report endpoint.</strong> The payout
 * module holds no venue name — its published reads are role-split for tourists — so the report ships
 * venue ids and the console joins them, exactly as the moderation pickers do. A venue the list does
 * not name still renders, by id, rather than vanishing from an abuse report.
 *
 * <p>The change is armed in place before it is sent — the console's recurring confirm-in-place shape,
 * where the editor itself is the confirmation: it shows was-and-will-be, states when the change takes
 * effect, and collects optional grounds that ride `X-Audit-Reason` into the platform's admin audit
 * trail (recorded at the edge with no instrumentation here).
 *
 * <p>Like every admin tab, the surrounding {@code AdminConsole} shell self-gates on
 * {@link OperatorAuth} for UX while the backend `/api/admin/**` role gate does the enforcing; this
 * component only ever renders once both have passed.
 */
@Component({
  selector: 'app-admin-venue-changes',
  imports: [CardGlass, TouchTarget, BusyAction, FieldErrorFor, FormField],
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
    } @else {
      <section
        appCardGlass
        class="mt-6 rounded-[14px] p-5"
        data-testid="admin-venue-change-fee-card"
        aria-labelledby="admin-venue-change-fee-heading"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2
              id="admin-venue-change-fee-heading"
              class="text-[16px] font-semibold text-riv-card-ink"
            >
              Venue-change fee
            </h2>
            <p class="mt-2 max-w-[62ch] text-[13px] leading-[1.5] text-riv-card-ink-soft">
              What a venue pays when its own layout change refunds a guest. One flat amount for
              every venue, deducted from the venue's payout — never from the guest's refund.
            </p>
          </div>
          <p class="text-right">
            <span
              class="block text-[22px] font-bold text-riv-card-ink"
              data-testid="admin-venue-change-fee-amount"
              >{{ feeStr() }}</span
            >
            <span class="block text-[12px] text-riv-card-ink-soft">per refund</span>
          </p>
        </div>

        @if (editing()) {
          <div
            class="mt-4 rounded-[12px] border border-riv-field-border p-3"
            data-testid="admin-venue-change-fee-editor"
            tabindex="-1"
          >
            <label
              for="admin-venue-change-fee-input"
              class="block text-[13.5px] font-semibold text-riv-card-ink"
              >New fee (€)</label
            >
            <input
              appTouchTarget
              id="admin-venue-change-fee-input"
              type="number"
              step="0.01"
              inputmode="decimal"
              data-testid="admin-venue-change-fee-input"
              [formField]="feeForm.amountEur"
              class="mt-1 w-full max-w-[160px] rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[15px] text-riv-card-ink"
              #amountControl
            />

            <p
              class="mt-2 text-[13px] text-riv-card-ink-soft"
              data-testid="admin-venue-change-fee-preview"
            >
              @if (draftMinor() === null) {
                Enter the fee in euros, for example 5.
              } @else {
                Stores <strong class="text-riv-card-ink">{{ draftMinor() }}</strong> minor units —
                was {{ feeStr() }}.
              }
            </p>

            @if (amountError()) {
              <p
                class="mt-2 text-[13.5px] font-semibold text-riv-error-ink"
                role="alert"
                [appFieldErrorFor]="amountControl"
                data-testid="admin-venue-change-fee-input-error"
              >
                {{ amountError() }}
              </p>
            }

            <label
              for="admin-venue-change-fee-reason"
              class="mt-3 block text-[13.5px] font-semibold text-riv-card-ink"
              >Reason (optional)</label
            >
            <input
              appTouchTarget
              id="admin-venue-change-fee-reason"
              type="text"
              data-testid="admin-venue-change-fee-reason"
              [formField]="feeForm.reason"
              placeholder="e.g. raised for the 2027 season"
              class="mt-1 w-full rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[14px] text-riv-card-ink"
            />

            <p class="mt-3 text-[13px] leading-[1.5] text-riv-card-ink-soft">
              The new amount applies to every refund charged after it. Fees already charged keep the
              amount they were charged at — there is no way to reprice them, by design.
            </p>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                appTouchTarget
                type="button"
                data-testid="admin-venue-change-fee-save"
                [appBusy]="busy()"
                (click)="saveFee()"
                class="rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                Save fee
              </button>
              <button
                appTouchTarget
                type="button"
                data-testid="admin-venue-change-fee-cancel"
                [appBusy]="busy()"
                (click)="cancelEdit()"
                class="rounded-[10px] px-3 py-2 text-[14px] font-semibold text-riv-card-ink-soft aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                Cancel
              </button>
            </div>

            <div class="mt-2 min-h-[1.25rem]">
              @if (saveError()) {
                <p
                  class="text-[13.5px] font-semibold text-riv-error-ink"
                  role="alert"
                  data-testid="admin-venue-change-fee-error"
                >
                  {{ saveError() }}
                </p>
              }
            </div>
          </div>
        } @else {
          <button
            appTouchTarget
            type="button"
            data-testid="admin-venue-change-fee-edit"
            aria-label="Change the venue-change fee"
            class="mt-4 rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink"
            (click)="startEdit()"
          >
            Change fee
          </button>
        }
      </section>

      <p
        class="mt-3 min-h-[1.5rem] text-[15px] text-riv-ink-soft"
        role="status"
        aria-live="polite"
        data-testid="admin-venue-change-fee-notice"
      >
        {{ notice() }}
      </p>

      @if (rows().length === 0) {
        <div appCardGlass class="mt-3 rounded-[14px] p-5" data-testid="admin-venue-changes-empty">
          <h2 class="text-[16px] font-semibold text-riv-card-ink">No venue-caused refunds</h2>
          <p class="mt-2 text-[15px] leading-[1.5] text-riv-card-ink-soft">
            No remodel has refunded a guest yet. A venue appears here the moment one does.
          </p>
        </div>
      } @else {
        <div
          appCardGlass
          class="mt-3 rounded-[14px] p-5"
          data-testid="admin-venue-changes-card"
          aria-labelledby="admin-venue-changes-heading"
        >
          <h2 id="admin-venue-changes-heading" class="text-[16px] font-semibold text-riv-card-ink">
            Venue-caused refunds
          </h2>
          <p class="mt-2 text-[13px] leading-[1.5] text-riv-card-ink-soft">
            What each venue's own layout changes returned to guests, and the fee it paid for them.
            The two are separate: the fee is deducted from the venue's payout, not from the refund.
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
    }
  `,
})
export class AdminVenueChanges {
  private readonly auth = inject(OperatorAuth);
  private readonly report = inject(AdminVenueChangesService);
  private readonly venues = inject(AdminVenuesService);
  private readonly focusAfterRender = focusMover();

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly amountError = signal('');
  protected readonly saveError = signal('');
  protected readonly notice = signal('');

  private readonly fee = signal<VenueChangeFeeView>({ amountMinor: 0, currency: 'EUR' });
  private readonly totals = signal<readonly VenueChangeRefundRow[]>([]);
  private readonly venueNames = signal<ReadonlyMap<number, string>>(new Map());

  protected readonly model = signal({ amountEur: '', reason: '' });
  /**
   * Signal Forms over the draft — the two fields bind through it, and it owns their native validation
   * attributes, so the bound elements carry none of their own. The amount is a euros string validated
   * by parsing it on save through the one euros↔minor helper, the way the sibling money forms treat
   * their numeric fields; the server validates independently and its refusal has its own message.
   */
  protected readonly feeForm = form(this.model, (path) => {
    disabled(path.amountEur, { when: () => this.busy() });
    disabled(path.reason, { when: () => this.busy() });
    maxLength(path.reason, 500, { message: 'Keep the reason under 500 characters.' });
  });

  protected readonly feeStr = computed(() => formatMoney(this.feeMoney()));

  /** The typed amount in minor units, or `null` while it is not a usable number. */
  protected readonly draftMinor = computed(() => eurosToMinorUnits(this.model().amountEur));

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
      const [report, venues, fee] = await Promise.all([
        this.report.report(),
        this.venues.venues(),
        this.report.fee(),
      ]);
      this.totals.set(report.venues);
      this.venueNames.set(new Map(venues.map((venue) => [venue.id, venue.name])));
      this.fee.set(fee);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected startEdit(): void {
    this.model.set({ amountEur: minorUnitsToEuros(this.fee().amountMinor), reason: '' });
    this.amountError.set('');
    this.saveError.set('');
    this.notice.set('');
    this.editing.set(true);
    this.focusAfterRender('admin-venue-change-fee-editor');
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.amountError.set('');
    this.saveError.set('');
    this.focusAfterRender('admin-venue-change-fee-edit');
  }

  protected async saveFee(): Promise<void> {
    const minorUnits = this.validatedAmount();
    if (minorUnits === null) {
      return;
    }
    this.busy.set(true);
    this.saveError.set('');
    try {
      const stored = await this.report.setFee(minorUnits, this.model().reason.trim());
      this.fee.set(stored);
      this.editing.set(false);
      this.notice.set(`The venue-change fee is now ${formatMoney(this.feeMoney())} per refund.`);
      this.focusAfterRender('admin-venue-change-fee-notice');
    } catch {
      this.saveError.set('Something went wrong saving the fee. Nothing was changed.');
    } finally {
      this.busy.set(false);
    }
  }

  /** The amount to send, or `null` with the field error set. */
  private validatedAmount(): number | null {
    const typed = this.model().amountEur.trim();
    // The shared euros parser clamps a negative to 0, which here would read as "changes are free".
    if (typed.startsWith('-')) {
      this.amountError.set('A fee cannot be negative.');
      return null;
    }
    const minorUnits = eurosToMinorUnits(typed);
    if (minorUnits === null) {
      this.amountError.set('Enter the fee in euros, for example 5.');
      return null;
    }
    if (minorUnits > MAX_FEE_MINOR) {
      this.amountError.set(
        `The fee cannot exceed ${formatMoney({ minorUnits: MAX_FEE_MINOR, currency: this.fee().currency })}.`,
      );
      return null;
    }
    this.amountError.set('');
    return minorUnits;
  }

  private feeMoney(): { minorUnits: number; currency: string } {
    return { minorUnits: this.fee().amountMinor, currency: this.fee().currency };
  }
}
