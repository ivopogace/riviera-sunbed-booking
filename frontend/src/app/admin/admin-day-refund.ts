import { Component, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';

import { formatCivilDate } from '../shared/booking-date';
import { metaFor } from '../shared/booking-status';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmWithReason } from '../shared/confirm-with-reason';
import { focusMover } from '../shared/focus-after-render';
import { formatMoney } from '../shared/money';
import { StatusChip } from '../shared/status-chip';
import { TouchTarget } from '../shared/touch-target';
import { AdminDayRefundService, adminDayRefundErrorOf } from './admin-day-refund.service';
import {
  AdminDayRefundErrorCode,
  AdminDayRefundResultView,
  GuestBookingDayView,
  GuestBookingView,
} from './admin.model';

/** The day a confirmation is open for: one booking, one date, at a time. */
interface DayChoice {
  readonly bookingId: number;
  readonly date: string;
}

/**
 * The Refunds tab's venue day refund (ADR-0027 decision 1): an admin looks a guest's bookings up by the
 * address they booked with, picks an open day and confirms with optional grounds, which ride
 * `X-Audit-Reason` into the audit trail. The server picks the leg and the amount (#10); the card never
 * shows an arrival code (#7). Every refusal is an answer; only a rejected request is an error.
 */
@Component({
  selector: 'app-admin-day-refund',
  imports: [FormField, CardGlass, BusyAction, ConfirmWithReason, StatusChip, TouchTarget],
  template: `
    <div
      appCardGlass
      class="mt-6 rounded-[14px] p-5"
      data-testid="admin-day-refund-card"
      aria-labelledby="admin-day-refund-heading"
    >
      <h2 id="admin-day-refund-heading" class="text-[16px] font-semibold text-riv-card-ink">
        Refund a guest's day
      </h2>
      <p id="admin-day-refund-intro" class="mt-2 text-[15px] text-riv-card-ink">
        Look up a tourist's bookings by the email address they booked with, and refund one day of a
        stay for the venue's own reason. The day's own rate is refunded; a day still ahead is freed
        for the venue to sell again.
      </p>

      <form
        class="mt-4 flex flex-wrap items-end gap-3"
        (submit)="onLookup(); $event.preventDefault()"
        novalidate
      >
        <label class="flex flex-col gap-1">
          <span class="text-[13.5px] font-semibold text-riv-card-ink">Email address</span>
          <input
            appTouchTarget
            type="email"
            data-testid="admin-day-refund-email"
            [formField]="lookupForm.email"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-describedby="admin-day-refund-intro"
            class="w-[280px] max-w-full rounded-[10px] border border-riv-card-border bg-riv-console-inset/85 px-3 py-2 text-[16px] text-riv-accent-ink [transition:border-color_0.15s_ease] focus-visible:border-riv-accent-ink"
          />
        </label>
        <button
          appTouchTarget
          type="submit"
          class="inline-flex items-center rounded-full border border-riv-card-border bg-riv-console-inset/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-accent-ink shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-riv-console-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          [appBusy]="searching()"
          data-testid="admin-day-refund-lookup"
        >
          {{ searching() ? 'Looking up…' : 'Look up' }}
        </button>
      </form>

      @if (lookupError()) {
        <p
          class="mt-3 text-[15px] text-riv-error-ink"
          role="alert"
          data-testid="admin-day-refund-error"
        >
          Something went wrong looking that up.
        </p>
      }

      @if (searched() && bookings().length === 0) {
        <p class="mt-4 text-[15px] text-riv-card-ink" data-testid="admin-day-refund-empty">
          No bookings for that address.
        </p>
      }

      @if (bookings().length > 0) {
        <ul class="mt-4 flex flex-col gap-3" data-testid="admin-day-refund-results">
          @for (booking of bookings(); track booking.bookingId) {
            <li
              class="rounded-[12px] border border-riv-card-border bg-riv-console-inset/55 p-4"
              [attr.data-testid]="'admin-day-refund-booking-' + booking.bookingId"
              tabindex="-1"
            >
              <p
                class="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-riv-card-ink"
              >
                <span>{{ booking.venueName }} · {{ spanLabel(booking) }}</span>
                <span [appStatusChip]="statusChip(booking)">{{ statusLabel(booking) }}</span>
              </p>

              @if (!booking.refundable) {
                <p
                  class="mt-2 text-[14px] text-riv-card-ink"
                  [attr.data-testid]="'admin-day-refund-not-refundable-' + booking.bookingId"
                >
                  This booking never happened, so there is no day to refund.
                </p>
              } @else {
                <ul class="mt-2 flex flex-col gap-2">
                  @for (day of booking.days; track day.date) {
                    <li class="flex flex-wrap items-center gap-3 text-[14px] text-riv-card-ink">
                      <span>{{ formatDate(day.date) }}</span>
                      @if (day.state === 'OPEN') {
                        <button
                          appTouchTarget
                          type="button"
                          class="inline-flex items-center rounded-full border border-riv-card-border bg-riv-console-inset/85 px-[14px] py-[7px] text-[13px] font-semibold text-riv-accent-ink [transition:background_0.15s_ease] hover:bg-riv-console-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                          [appBusy]="refunding()"
                          (click)="askToRefund(booking, day)"
                          [attr.data-testid]="
                            'admin-day-refund-open-' + booking.bookingId + '-' + day.date
                          "
                        >
                          Refund this day
                        </button>
                      } @else {
                        <span
                          class="text-riv-card-ink-soft"
                          [attr.data-testid]="
                            'admin-day-refund-state-' + booking.bookingId + '-' + day.date
                          "
                          >{{ dayStateLabel(day) }}</span
                        >
                      }
                    </li>
                  }
                </ul>
              }

              @if (confirming()?.bookingId === booking.bookingId) {
                <app-confirm-with-reason
                  class="mt-3"
                  label="Confirm refunding this day"
                  [prompt]="refundPrompt(booking, confirming()!.date)"
                  [promptTestId]="'admin-day-refund-confirm-prompt-' + booking.bookingId"
                  [reasonId]="'admin-day-refund-reason-' + booking.bookingId"
                  reasonPlaceholder="e.g. pool closed for repair — guest complained"
                  confirmLabel="Refund the day"
                  cancelLabel="Keep it"
                  [panelTestId]="'admin-day-refund-confirm-panel-' + booking.bookingId"
                  [confirmTestId]="'admin-day-refund-confirm-' + booking.bookingId"
                  [cancelTestId]="'admin-day-refund-cancel-' + booking.bookingId"
                  [busy]="refunding()"
                  [(reason)]="reason"
                  (confirmed)="refund()"
                  (cancelled)="keepIt()"
                />
              }
            </li>
          }
        </ul>
      }

      <output
        class="mt-4 block min-h-[1.5rem] text-[15px] text-riv-card-ink"
        aria-live="polite"
        data-testid="admin-day-refund-notice"
        tabindex="-1"
      >
        {{ notice() }}
      </output>
    </div>
  `,
})
export class AdminDayRefund {
  private readonly service = inject(AdminDayRefundService);
  private readonly focusAfterRender = focusMover();

  protected readonly model = signal({ email: '' });
  protected readonly lookupForm = form(this.model);

  /** The address the visible results belong to — not the live field, which the admin may already be retyping. */
  private readonly searchedEmail = signal('');

  protected readonly bookings = signal<readonly GuestBookingView[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly lookupError = signal(false);
  protected readonly confirming = signal<DayChoice | undefined>(undefined);
  protected readonly reason = signal('');
  protected readonly refunding = signal(false);
  protected readonly notice = signal('');

  protected async onLookup(): Promise<void> {
    const email = this.model().email.trim();
    if (!email || this.searching()) {
      return;
    }
    this.searching.set(true);
    this.lookupError.set(false);
    this.confirming.set(undefined);
    this.notice.set('');
    try {
      this.bookings.set((await this.service.lookup(email)).bookings);
      this.searchedEmail.set(email);
      this.searched.set(true);
    } catch {
      this.bookings.set([]);
      this.searched.set(false);
      this.lookupError.set(true);
    } finally {
      this.searching.set(false);
    }
  }

  /**
   * Open the confirmation under the booking. Each open/close destroys the control just activated, so
   * focus moves with it (WCAG 2.4.3): {@link ConfirmWithReason} focuses itself, Keep returns to the
   * day's button, a settled refund parks on the notice.
   */
  protected askToRefund(booking: GuestBookingView, day: GuestBookingDayView): void {
    this.notice.set('');
    this.reason.set('');
    this.confirming.set({ bookingId: booking.bookingId, date: day.date });
  }

  protected keepIt(): void {
    const choice = this.confirming();
    this.confirming.set(undefined);
    this.reason.set('');
    if (choice !== undefined) {
      this.focusAfterRender(
        `admin-day-refund-open-${choice.bookingId}-${choice.date}`,
        `admin-day-refund-booking-${choice.bookingId}`,
      );
    }
  }

  /** Send the refund with the confirmation locked in flight, then re-read the searched address so the day's state reconciles. */
  protected async refund(): Promise<void> {
    const choice = this.confirming();
    if (choice === undefined || this.refunding()) {
      return;
    }
    this.refunding.set(true);
    const grounds = this.reason().trim();
    try {
      const result = await this.service.refund(choice.bookingId, choice.date, grounds || undefined);
      this.notice.set(successNotice(result, formatCivilDate(result.serviceDate)));
    } catch (error: unknown) {
      this.notice.set(failureNotice(adminDayRefundErrorOf(error)));
    } finally {
      this.refunding.set(false);
      this.confirming.set(undefined);
      this.reason.set('');
      this.focusAfterRender('admin-day-refund-notice');
    }
    await this.refresh();
  }

  /** Re-read keyed on the *searched* address, never the live field; a failure drops the list but keeps the notice. */
  private async refresh(): Promise<void> {
    try {
      this.bookings.set((await this.service.lookup(this.searchedEmail())).bookings);
    } catch {
      this.bookings.set([]);
      this.searched.set(false);
    }
  }

  protected refundPrompt(booking: GuestBookingView, date: string): string {
    return `Refund ${formatCivilDate(date)} of the stay at ${booking.venueName}? The day's own rate goes back to the guest, a day still ahead is freed for the venue to sell again, and a one-day booking is cancelled whole. This cannot be undone.`;
  }

  protected spanLabel(booking: GuestBookingView): string {
    return booking.firstDate === booking.lastDate
      ? formatCivilDate(booking.firstDate)
      : `${formatCivilDate(booking.firstDate)} – ${formatCivilDate(booking.lastDate)}`;
  }

  protected statusLabel(booking: GuestBookingView): string {
    return metaFor(booking.status).label;
  }

  protected statusChip(booking: GuestBookingView): string {
    return metaFor(booking.status).chip;
  }

  protected formatDate(isoDate: string): string {
    return formatCivilDate(isoDate);
  }

  protected dayStateLabel(day: GuestBookingDayView): string {
    switch (day.state) {
      case 'ATTENDED':
        return 'Checked in';
      case 'REFUNDED':
        return 'Refunded, set still held';
      case 'RELEASED':
        return 'Refunded and released';
      case 'OPEN':
        return 'Open';
    }
  }
}

/** The admin-facing notice for a day refund the server carried out (money in minor units, #5). */
function successNotice(result: AdminDayRefundResultView, dateLabel: string): string {
  const amount = formatMoney({ minorUnits: result.refundMinor, currency: result.currency });
  if (result.kind === 'BOOKING_CANCELLED') {
    return `Booking cancelled and ${amount} refunded in full — the set is free again on ${dateLabel}.`;
  }
  return result.released
    ? `${dateLabel} refunded (${amount}) — the set is free again that day; the stay goes on.`
    : `${dateLabel} refunded (${amount}); the stay goes on.`;
}

/** Map a day-refund failure to its admin-facing notice. */
function failureNotice(reason: AdminDayRefundErrorCode): string {
  switch (reason) {
    case 'DAY_ATTENDED':
      return 'The guest checked in that day — an attended day is not refunded.';
    case 'DAY_ALREADY_REFUNDED':
      return 'That day was already refunded.';
    case 'BOOKING_NOT_FOUND':
      return 'That booking did not happen, or no longer covers this day.';
    case 'UNAUTHORIZED':
      return 'Your session expired — sign in again.';
    case 'UNKNOWN':
      return 'Could not refund the day. Nothing was refunded — try again.';
  }
}
