import { Component, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';

import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { AdminMailDeliveryService } from './admin-mail-delivery.service';
import { MailAttemptView, MailDeliveryBookingView, MailResendResultView } from './admin.model';

import { TouchTarget } from '../shared/touch-target';

/**
 * The Email tab's per-booking card: what happened to a tourist's booking-confirmation mail, and a
 * resend. Looked up by the booking's email address, never by arrival code: the code is a bearer
 * credential (invariant #7), never rendered, and the endpoint does not return it. Every resend
 * outcome, a suppressed withhold included, is reported as an answer; only a rejected request is an
 * error. An empty history tells "never confirmed, none was due" from "confirmed, nothing recorded"
 * (a booking older than the delivery log).
 */
@Component({
  selector: 'app-admin-mail-delivery',
  imports: [FormField, CardGlass, BusyAction, TouchTarget],
  template: `
    <div
      appCardGlass
      class="mt-6 rounded-[14px] p-5"
      data-testid="admin-delivery-card"
      aria-labelledby="admin-delivery-heading"
    >
      <h2 id="admin-delivery-heading" class="text-[16px] font-semibold text-riv-card-ink">
        Booking confirmation delivery
      </h2>
      <p id="admin-delivery-intro" class="mt-2 text-[15px] text-riv-card-ink">
        Look up a tourist's bookings by the email address they booked with, and resend a
        confirmation that never arrived.
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
            data-testid="admin-delivery-email"
            [formField]="lookupForm.email"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-describedby="admin-delivery-intro"
            class="w-[280px] max-w-full rounded-[10px] border border-riv-card-border bg-riv-console-inset/85 px-3 py-2 text-[16px] text-riv-accent-ink [transition:border-color_0.15s_ease] focus-visible:border-riv-accent-ink"
          />
        </label>
        <button
          appTouchTarget
          type="submit"
          class="inline-flex items-center rounded-full border border-riv-card-border bg-riv-console-inset/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-accent-ink shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-riv-console-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          [appBusy]="searching()"
          data-testid="admin-delivery-lookup"
        >
          {{ searching() ? 'Looking up…' : 'Look up' }}
        </button>
      </form>

      @if (lookupError()) {
        <p
          class="mt-3 text-[15px] text-riv-error-ink"
          role="alert"
          data-testid="admin-delivery-error"
        >
          Something went wrong looking that up.
        </p>
      }

      @if (searched() && bookings().length === 0) {
        <p class="mt-4 text-[15px] text-riv-card-ink" data-testid="admin-delivery-empty">
          No bookings for that address.
        </p>
      }

      @if (bookings().length > 0) {
        <ul class="mt-4 flex flex-col gap-3" data-testid="admin-delivery-results">
          @for (booking of bookings(); track booking.bookingId) {
            <li
              class="rounded-[12px] border border-riv-card-border bg-riv-console-inset/55 p-4"
              data-testid="admin-delivery-booking"
            >
              <p class="text-[15px] font-semibold text-riv-card-ink">
                {{ booking.venueName }} · {{ formatDate(booking.bookingDate) }}
              </p>

              @if (booking.attempts.length > 0) {
                <ul class="mt-2 flex flex-col gap-1" data-testid="admin-delivery-attempts">
                  @for (attempt of booking.attempts; track $index) {
                    <li class="text-[14px] text-riv-card-ink">
                      {{ describeSource(attempt) }} · {{ describeOutcome(attempt) }} ·
                      {{ formatMoment(attempt.attemptedAt) }}
                    </li>
                  }
                </ul>
              } @else if (booking.everConfirmed) {
                <p
                  class="mt-2 text-[14px] text-riv-card-ink"
                  data-testid="admin-delivery-no-record"
                >
                  No delivery recorded for this booking.
                </p>
              } @else {
                <p class="mt-2 text-[14px] text-riv-card-ink" data-testid="admin-delivery-not-due">
                  Never confirmed, so no confirmation email was due.
                </p>
              }

              <button
                appTouchTarget
                type="button"
                class="mt-3 inline-flex items-center rounded-full border border-riv-card-border bg-riv-console-inset/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-accent-ink shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-riv-console-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                [appBusy]="resending() !== undefined"
                (click)="onResend(booking.bookingId)"
                [attr.data-testid]="'admin-delivery-resend-' + booking.bookingId"
              >
                {{ resending() === booking.bookingId ? 'Resending…' : 'Resend confirmation' }}
              </button>
            </li>
          }
        </ul>
      }

      <output
        class="mt-4 block min-h-[1.5rem] text-[15px] text-riv-card-ink"
        aria-live="polite"
        data-testid="admin-delivery-notice"
      >
        {{ notice() }}
      </output>
    </div>
  `,
})
export class AdminMailDelivery {
  private readonly service = inject(AdminMailDeliveryService);

  protected readonly model = signal({ email: '' });
  protected readonly lookupForm = form(this.model);

  /** The address the visible results belong to — not the live field, which the admin may already be retyping. */
  private readonly searchedEmail = signal('');

  protected readonly bookings = signal<readonly MailDeliveryBookingView[]>([]);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly lookupError = signal(false);
  protected readonly resending = signal<number | undefined>(undefined);
  protected readonly notice = signal('');

  protected async onLookup(): Promise<void> {
    const email = this.model().email.trim();
    if (!email || this.searching()) {
      return;
    }
    this.searching.set(true);
    this.lookupError.set(false);
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

  protected async onResend(bookingId: number): Promise<void> {
    this.resending.set(bookingId);
    this.notice.set('');
    try {
      this.notice.set(this.describeResend(await this.service.resend(bookingId)));
      await this.refresh();
    } catch {
      this.notice.set('Something went wrong — nothing was resent.');
    } finally {
      this.resending.set(undefined);
    }
  }

  /** Every refusal is an ordinary answer; only a rejected request is an error. */
  private describeResend(result: MailResendResultView): string {
    switch (result.outcome) {
      case 'SENT':
        return 'Confirmation sent again.';
      case 'WITHHELD_SUPPRESSED':
        return 'Withheld — the address is on the suppression list, which is likely why the first one never arrived.';
      case 'TRANSPORT_FAILED':
        return 'The send failed. Nothing is retried automatically — try again.';
      case 'NO_SUCH_BOOKING':
        return 'That booking no longer exists.';
      case 'NOT_CONFIRMED':
        return 'This booking was never confirmed, so there is no confirmation to send.';
      case 'MISSING_FACTS':
        return 'The booking is missing details the email needs; this will not succeed on a retry.';
    }
  }

  /**
   * Re-read after a resend, keyed on the *searched* address, never the live field the admin may be
   * retyping, so the results just acted on are not swapped for someone else's. A failure drops the
   * list but keeps the outcome notice: the resend still happened.
   */
  private async refresh(): Promise<void> {
    try {
      this.bookings.set((await this.service.lookup(this.searchedEmail())).bookings);
    } catch {
      this.bookings.set([]);
      this.searched.set(false);
    }
  }

  protected formatDate(isoDate: string): string {
    return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/Tirane',
    });
  }

  protected formatMoment(isoInstant: string): string {
    return new Date(isoInstant).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Tirane',
    });
  }

  protected describeSource(attempt: MailAttemptView): string {
    return attempt.source === 'ADMIN_RESEND' ? 'Resent by admin' : 'Sent automatically';
  }

  protected describeOutcome(attempt: MailAttemptView): string {
    switch (attempt.outcome) {
      case 'SENT':
        return 'delivered to the mail server';
      case 'WITHHELD_SUPPRESSED':
        return 'withheld (address suppressed)';
      case 'TRANSPORT_FAILED':
        return 'failed to send';
      case 'ABANDONED_MISSING_FACTS':
        return 'abandoned (booking details missing)';
    }
  }
}
