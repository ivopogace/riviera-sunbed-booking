import { Component, computed, effect, inject, signal } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { beachLabel } from '../shared/beaches';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import {
  commissionBpsToPercentInput,
  commissionPercentToBps,
  formatCommissionPercent,
} from '../shared/commission-rate';
import { FieldErrorFor } from '../shared/field-error-for';
import { focusMover } from '../shared/focus-after-render';
import { AdminCommissionsService, commissionWriteErrorOf } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

import { TouchTarget } from '../shared/touch-target';

/**
 * Admin Commissions tab: the only place a venue's rate changes after creation (the owner's PATCH
 * cannot). One card per venue at every width; a save splices the `PUT` answer into its row.
 * Percent in, integer bps out — the editor shows the bps it will store (invariant #5). Copy may
 * only promise that a past service date never re-prices: the live rate moves at once, reporting
 * follows from today (`Europe/Tirane`), ledger and takings may differ (RESPONSIBILITIES.md § venue).
 * The optional reason rides `X-Audit-Reason` into the edge's admin audit trail.
 */
@Component({
  selector: 'app-admin-commissions',
  imports: [CardGlass, BusyAction, TouchTarget, FieldErrorFor],
  template: `
    <p class="mt-5 max-w-[62ch] text-[15px] text-riv-ink-soft">
      The platform sets each venue's rate — the operator sees it, and cannot change it. A rate is
      stored as whole basis points, so 1500 bps is 15%.
    </p>

    @if (loading()) {
      <p class="mt-6 text-[15px] text-riv-ink-soft" data-testid="admin-commissions-loading">
        Loading…
      </p>
    } @else if (loadError()) {
      <p
        class="mt-6 text-[15px] text-riv-error-ink"
        role="alert"
        data-testid="admin-commissions-error"
      >
        Something went wrong loading the venue list.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          data-testid="admin-commissions-retry"
          (click)="retry()"
        >
          Retry
        </button>
      </p>
    } @else if (venues().length === 0) {
      <p
        class="mt-6 text-[15px] text-riv-ink-soft"
        data-testid="admin-commissions-empty"
        tabindex="-1"
      >
        No venues have been created yet.
      </p>
    } @else {
      <ul role="list" class="mt-6 grid gap-4" data-testid="admin-commissions-list" tabindex="-1">
        @for (venue of venues(); track venue.venueId) {
          <li
            appCardGlass
            class="rounded-[14px] p-4"
            [attr.data-testid]="'admin-commission-row-' + venue.venueId"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-[16px] font-semibold text-riv-card-ink">
                  {{ venue.name }}
                </h2>
                <p class="mt-0.5 text-[13.5px] text-riv-card-ink-soft">
                  {{ beachLabel(venue.beach) }} · paid out in {{ venue.payoutCurrency }}
                </p>
              </div>
              <p class="text-right">
                <span
                  class="block text-[18px] font-bold text-riv-card-ink"
                  [attr.data-testid]="'admin-commission-rate-' + venue.venueId"
                  >{{ percent(venue.commissionBps) }}</span
                >
                <span
                  class="block text-[12px] text-riv-card-ink-soft"
                  [attr.data-testid]="'admin-commission-bps-' + venue.venueId"
                  >{{ venue.commissionBps }} bps</span
                >
              </p>
            </div>

            @if (editingId() === venue.venueId) {
              <div
                class="mt-3 rounded-[12px] border border-riv-field-border p-3"
                [attr.data-testid]="'admin-commission-editor-' + venue.venueId"
              >
                <label
                  [attr.for]="'admin-commission-percent-' + venue.venueId"
                  class="block text-[13.5px] font-semibold text-riv-card-ink"
                  >New rate for {{ venue.name }} (%)</label
                >
                <input
                  appTouchTarget
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputmode="decimal"
                  [attr.id]="'admin-commission-percent-' + venue.venueId"
                  [attr.data-testid]="'admin-commission-percent-' + venue.venueId"
                  [value]="draftPercent()"
                  [disabled]="busy()"
                  (input)="onPercentTyped($event)"
                  class="mt-1 w-full max-w-[160px] rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[16px] text-riv-card-ink"
                  #percentInput
                />
                <p
                  class="mt-2 text-[13px] text-riv-card-ink-soft"
                  [attr.data-testid]="'admin-commission-preview-' + venue.venueId"
                >
                  @if (draftBps() === null) {
                    Enter a percentage between 0 and 100.
                  } @else {
                    Stores <strong class="text-riv-card-ink">{{ draftBps() }} bps</strong> — was
                    {{ venue.commissionBps }} bps ({{ percent(venue.commissionBps) }}).
                  }
                </p>

                @if (percentError()) {
                  <p
                    class="mt-2 text-[13.5px] font-semibold text-riv-error-ink"
                    role="alert"
                    [appFieldErrorFor]="percentInput"
                    [attr.data-testid]="'admin-commission-percent-error-' + venue.venueId"
                  >
                    {{ percentError() }}
                  </p>
                }

                <label
                  [attr.for]="'admin-commission-reason-' + venue.venueId"
                  class="mt-3 block text-[13.5px] font-semibold text-riv-card-ink"
                  >Reason (optional)</label
                >
                <input
                  appTouchTarget
                  type="text"
                  maxlength="500"
                  [attr.id]="'admin-commission-reason-' + venue.venueId"
                  [attr.data-testid]="'admin-commission-reason-' + venue.venueId"
                  [value]="reason()"
                  [disabled]="busy()"
                  (input)="onReasonTyped($event)"
                  placeholder="e.g. renegotiated for the 2026 season"
                  class="mt-1 w-full rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-3 py-2 text-[16px] text-riv-card-ink"
                />

                <p class="mt-3 text-[13px] text-riv-card-ink-soft">
                  Saving moves the live rate straight away, so this list shows the new number at
                  once. Reporting follows from today: each service date already past keeps the rate
                  it was sold under.
                </p>

                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    appTouchTarget
                    type="button"
                    [attr.data-testid]="'admin-commission-save-' + venue.venueId"
                    [attr.aria-label]="'Save rate for ' + venue.name"
                    [appBusy]="busy()"
                    (click)="saveRate(venue)"
                    class="rounded-[10px] border border-riv-field-border bg-riv-console-inset/70 px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                  >
                    Save rate
                  </button>
                  <button
                    appTouchTarget
                    type="button"
                    [attr.data-testid]="'admin-commission-cancel-' + venue.venueId"
                    [attr.aria-label]="'Cancel the rate change for ' + venue.name"
                    [appBusy]="busy()"
                    (click)="cancelEdit(venue)"
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
                      [attr.data-testid]="'admin-commission-error-' + venue.venueId"
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
                [attr.data-testid]="'admin-commission-edit-' + venue.venueId"
                [attr.aria-label]="'Edit rate for ' + venue.name"
                [appBusy]="busy()"
                (click)="startEdit(venue)"
                class="mt-3 rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                Edit rate
              </button>
            }
          </li>
        }
      </ul>
    }

    <output
      class="mt-4 block min-h-[1.5rem] text-[15px] text-riv-ink-soft"
      aria-live="polite"
      data-testid="admin-commissions-notice"
    >
      {{ notice() }}
    </output>

    <section
      appCardGlass
      class="mt-2 grid gap-5 rounded-[14px] p-5 sm:grid-cols-2"
      data-testid="admin-commissions-explainer"
      aria-labelledby="admin-commissions-explainer-heading"
    >
      <h2
        id="admin-commissions-explainer-heading"
        class="text-[16px] font-semibold text-riv-card-ink sm:col-span-2"
      >
        What a rate change does
      </h2>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">A change is forward-only</h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          A past service date never re-prices. Every payout-ledger entry keeps the commission it was
          accrued at, so statements already sent stay exactly as they were sent — there is no way to
          reprice history, by design.
        </p>
      </section>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">Reporting follows from today</h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          Today (Europe/Tirane) is the first service date the operator's takings report at the new
          rate — the same rate any booking confirmed after the change is charged commission at.
          Dates already past keep the rate that was in force when they were sold.
        </p>
      </section>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">
          The list updates immediately too
        </h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          The number here is the live rate — what the next booking's commission uses. Reporting
          follows it from today, so the list and today's takings move together; only days already
          past keep their own rate.
        </p>
      </section>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">What this does not promise</h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          An operator's takings figures are not a copy of the ledger. The ledger prices each booking
          when it accrues; the takings apply one rate to a whole service date. So a booking whose
          commission accrued before a change, for a service date from the change onward, sits in the
          ledger at the old rate while the takings for that date show the new one. The firm
          guarantee is the narrower one: a past service date never re-prices.
        </p>
      </section>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">Percent in, bps out</h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          The rate is stored as whole basis points so every split stays exact-integer arithmetic.
          The field takes a percent because that is how the deal is described; the exact integer
          that will be stored is shown beside it as you type.
        </p>
      </section>

      <section>
        <h3 class="text-[14px] font-semibold text-riv-card-ink">Why the operator can't set it</h3>
        <p class="mt-1 text-[13px] leading-relaxed text-riv-card-ink-soft">
          Commission is the commercial agreement between the platform and the venue, not a venue
          setting. The operator console shows the rate so there is no mystery about the split — it
          just doesn't offer a way to move it.
        </p>
      </section>
    </section>
  `,
})
export class AdminCommissions {
  /** The beach as the operator or admin reads it, off the catalogue mirror. */
  protected readonly beachLabel = beachLabel;
  private readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminCommissionsService);
  private readonly focusAfterRender = focusMover();

  protected readonly venues = signal<readonly VenueCommissionView[]>([]);
  /** The venue whose editor is open — at most one, so the draft signals below need no keying. */
  protected readonly editingId = signal<number | undefined>(undefined);
  protected readonly draftPercent = signal('');
  protected readonly reason = signal('');
  /** A verdict on the typed value: a field error (`[appFieldErrorFor]`, `aria-invalid`). A failed
   *  write goes to `saveError`, an alert-only banner, since nothing needs retyping. */
  protected readonly percentError = signal('');
  protected readonly saveError = signal('');
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');

  /** The exact integer a save would store, or `null` while the typed percent is not a usable rate. */
  protected readonly draftBps = computed(() => commissionPercentToBps(this.draftPercent()));

  private loaded = false;

  constructor() {
    // Load the venue list once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.loadVenues();
      }
    });
  }

  protected percent(bps: number): string {
    return formatCommissionPercent(bps);
  }

  /** Open the editor seeded with the current rate and focus its field: opening, dismissing and
   *  saving each destroy the activated control, so focus must be moved (WCAG 2.4.3). */
  protected startEdit(venue: VenueCommissionView): void {
    this.editingId.set(venue.venueId);
    this.draftPercent.set(commissionBpsToPercentInput(venue.commissionBps));
    this.reason.set('');
    this.percentError.set('');
    this.saveError.set('');
    this.notice.set('');
    this.focusAfterRender(`admin-commission-percent-${venue.venueId}`);
  }

  protected cancelEdit(venue: VenueCommissionView): void {
    this.closeEditor();
    this.focusAfterRender(`admin-commission-edit-${venue.venueId}`);
  }

  protected onPercentTyped(event: Event): void {
    this.draftPercent.set((event.target as HTMLInputElement).value);
    this.percentError.set('');
    this.saveError.set('');
  }

  protected onReasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /** Send the typed rate and splice the answer in. An invalid or unchanged rate never reaches the
   *  network (a no-op save would still supersede the schedule and audit a non-change). A failure
   *  keeps the editor open; `NO_SUCH_VENUE` reads as gone, not retryable. */
  protected async saveRate(venue: VenueCommissionView): Promise<void> {
    const commissionBps = this.draftBps();
    if (commissionBps === null) {
      this.percentError.set('Commission must be a percentage between 0% and 100%.');
      return;
    }
    if (commissionBps === venue.commissionBps) {
      this.percentError.set(`That is already this venue's rate (${venue.commissionBps} bps).`);
      return;
    }
    const grounds = this.reason().trim();
    this.busy.set(true);
    this.percentError.set('');
    this.saveError.set('');
    try {
      const updated = await (grounds === ''
        ? this.service.setCommission(venue.venueId, commissionBps)
        : this.service.setCommission(venue.venueId, commissionBps, grounds));
      this.venues.update((venues) =>
        venues.map((each) => (each.venueId === updated.venueId ? updated : each)),
      );
      this.closeEditor();
      this.notice.set(
        `${updated.name}: commission ${this.percent(venue.commissionBps)} → ${this.percent(updated.commissionBps)}. ` +
          'The live rate has moved; reporting follows from today.',
      );
      this.focusAfterRender(`admin-commission-edit-${venue.venueId}`);
    } catch (error) {
      this.saveError.set(messageFor(commissionWriteErrorOf(error)));
      // Redundant since the busy posture stopped blurring, but kept: the leg must still land.
      this.focusAfterRender(`admin-commission-save-${venue.venueId}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Re-read, then focus where the content landed — Retry unmounts itself (WCAG 2.4.3). The
   *  initial load must not route here: nothing was activated, so moving focus would steal it. */
  protected async retry(): Promise<void> {
    await this.loadVenues();
    this.focusAfterRender(this.retryLandingTestId());
  }

  private retryLandingTestId(): string {
    if (this.loadError()) {
      return 'admin-commissions-retry';
    }
    return this.venues().length === 0 ? 'admin-commissions-empty' : 'admin-commissions-list';
  }

  protected async loadVenues(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.venues.set(await this.service.venues());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private closeEditor(): void {
    this.editingId.set(undefined);
    this.draftPercent.set('');
    this.reason.set('');
    this.percentError.set('');
    this.saveError.set('');
  }
}

/** What the admin is told when a rate write is refused. */
function messageFor(error: ReturnType<typeof commissionWriteErrorOf>): string {
  switch (error) {
    case 'NO_SUCH_VENUE':
      return 'That venue no longer exists. Nothing was changed — reload the list.';
    case 'INVALID_REQUEST':
      return 'The platform rejected that rate. Nothing was changed.';
    default:
      return 'Could not change the rate. Nothing was changed.';
  }
}
