import { Component, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';

import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { AdminMailDeliveryService } from './admin-mail-delivery.service';
import { MailAttemptView, MailDeliveryBookingView, MailResendResultView } from './admin.model';

/**
 * The admin console's per-booking mail-delivery card: what happened to a tourist's
 * booking-confirmation mail, and the button that sends it again.
 *
 * <p><strong>Searched by email address, not by arrival code.</strong> Anyone who can quote their code
 * can also quote the address they booked with; the reverse is false, and the address is what the mail
 * was sent to. The code itself is never rendered — it is the tourist's bearer credential (invariant #7)
 * and the endpoint does not return it.
 *
 * <p><strong>Every outcome is reported as an outcome</strong>, not as an error banner. A withheld send
 * (the address is suppressed) is the most useful answer this card gives — it is usually the reason the
 * original never arrived — and "never confirmed" tells the admin no mail was ever due. Only a rejected
 * request is an error.
 *
 * <p><strong>An empty history is not a blank.</strong> For a booking that was never confirmed the card
 * says no confirmation was due; for a confirmed one it says nothing was recorded — which is the honest
 * answer for a booking that predates the log.
 *
 * <p>Sits on the Email tab beside the outbox card rather than in a tab of its own: same concern,
 * and the two answer the support question from opposite ends — what is still owed, versus what happened
 * to one person's mail. Porcelain theme comes from the page host.
 */
@Component({
  selector: 'app-admin-mail-delivery',
  imports: [FormField, CardGlass, BusyAction],
  template: `
    <div
      appCardGlass
      class="mt-6 rounded-[14px] p-5"
      data-testid="admin-delivery-card"
      aria-labelledby="admin-delivery-heading"
    >
      <h2 id="admin-delivery-heading" class="text-[16px] font-semibold text-(--riv-card-ink)">
        Booking confirmation delivery
      </h2>
      <p id="admin-delivery-intro" class="mt-2 text-[15px] text-(--riv-card-ink)">
        Look up a tourist's bookings by the email address they booked with, and resend a confirmation
        that never arrived.
      </p>

      <form
        class="mt-4 flex flex-wrap items-end gap-3"
        (submit)="onLookup(); $event.preventDefault()"
        novalidate
      >
        <label class="flex flex-col gap-1">
          <span class="text-[13.5px] font-semibold text-(--riv-card-ink)">Email address</span>
          <input
            type="email"
            data-testid="admin-delivery-email"
            [formField]="lookupForm.email"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-describedby="admin-delivery-intro"
            class="w-[280px] max-w-full rounded-[10px] border border-white/70 bg-white/85 px-3 py-2 text-[14px] text-[#0a4f5e] [transition:border-color_0.15s_ease] focus-visible:border-[#0a4f5e]"
          />
        </label>
        <button
          type="submit"
          class="inline-flex items-center rounded-full border border-white/95 bg-white/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-[#0a4f5e] shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-white aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          [appBusy]="searching()"
          data-testid="admin-delivery-lookup"
        >
          {{ searching() ? 'Looking up…' : 'Look up' }}
        </button>
      </form>

      @if (lookupError()) {
        <p
          class="mt-3 text-[15px] text-[#b3261e]"
          role="alert"
          data-testid="admin-delivery-error"
        >
          Something went wrong looking that up.
        </p>
      }

      @if (searched() && bookings().length === 0) {
        <p class="mt-4 text-[15px] text-(--riv-card-ink)" data-testid="admin-delivery-empty">
          No bookings for that address.
        </p>
      }

      @if (bookings().length > 0) {
        <ul class="mt-4 flex flex-col gap-3" data-testid="admin-delivery-results">
          @for (booking of bookings(); track booking.bookingId) {
            <li
              class="rounded-[12px] border border-white/70 bg-white/55 p-4"
              data-testid="admin-delivery-booking"
            >
              <p class="text-[15px] font-semibold text-(--riv-card-ink)">
                {{ booking.venueName }} · {{ formatDate(booking.bookingDate) }}
              </p>

              @if (booking.attempts.length > 0) {
                <ul class="mt-2 flex flex-col gap-1" data-testid="admin-delivery-attempts">
                  @for (attempt of booking.attempts; track $index) {
                    <li class="text-[14px] text-(--riv-card-ink)">
                      {{ describeSource(attempt) }} · {{ describeOutcome(attempt) }} ·
                      {{ formatMoment(attempt.attemptedAt) }}
                    </li>
                  }
                </ul>
              } @else if (booking.everConfirmed) {
                <p class="mt-2 text-[14px] text-(--riv-card-ink)" data-testid="admin-delivery-no-record">
                  No delivery recorded for this booking.
                </p>
              } @else {
                <p class="mt-2 text-[14px] text-(--riv-card-ink)" data-testid="admin-delivery-not-due">
                  Never confirmed, so no confirmation email was due.
                </p>
              }

              <button
                type="button"
                class="mt-3 inline-flex items-center rounded-full border border-white/95 bg-white/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-[#0a4f5e] shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-white aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
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

      <p
        class="mt-4 min-h-[1.5rem] text-[15px] text-(--riv-card-ink)"
        role="status"
        aria-live="polite"
        data-testid="admin-delivery-notice"
      >
        {{ notice() }}
      </p>
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
   * Re-read after a resend so the new attempt appears. Keyed on the address that was *searched*, never
   * on the live field: an admin who has started typing the next address must not have the results they
   * just acted on replaced by someone else's, under a notice saying their mail was sent.
   *
   * A failure here must not overwrite the outcome notice — the resend still happened — so it drops the
   * list rather than showing one that is now wrong.
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
