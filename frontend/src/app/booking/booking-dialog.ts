import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { email, FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { formatBookingDate } from '../shared/booking-date-label';
import { trapFocusWithin } from '../shared/focus-trap';
import { formatMoney } from '../shared/money';
import { touristTierLabel } from '../shared/set-label';
import { BookingMode, SetView } from '../shared/venue-views';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingErrorCode,
  RequestedBooking,
} from './booking.model';
import { BookingService, bookingErrorOf } from './booking.service';

/** What a set includes — the product's fixed unit (CLAUDE.md: 2 loungers + umbrella, full day). */
const SET_INCLUDES = '2 loungers + umbrella · full day';

/**
 * Two-step guest-checkout modal for booking one set.
 * Step 1 **Details** collects contact info (Signal Forms) with the date shown read-only — the map
 * owns the date now; step 2 **Review** shows the summary + total and the mode-specific
 * note, then submits through {@link BookingService}. Restyle only: the three shipped booking flows are
 * unchanged — a `201` emits {@link booked}, a `202 AWAITING_PAYMENT` emits {@link awaiting} (the
 * booking is NOT confirmed until the verified webhook, invariant #8), a `202 PENDING_REQUEST` emits
 * {@link requested}. Accessible modal: `role="dialog"` + `aria-modal`, a focus trap, ESC / backdrop
 * / close-button dismiss, and focus returns to the triggering tile (handled by the parent).
 */
@Component({
  selector: 'app-booking-dialog',
  imports: [FormField],
  host: {
    class: 'booking-backdrop',
    '(click)': 'requestClose()',
    '(keydown.escape)': 'requestClose()',
  },
  template: `
    <div
      class="booking-panel"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="'booking-dialog-venue booking-dialog-title'"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <header class="dialog-head">
        <button
          type="button"
          class="dialog-close"
          data-testid="dialog-close"
          aria-label="Close"
          (click)="requestClose()"
        >
          <span aria-hidden="true">✕</span>
        </button>
        <span id="booking-dialog-venue" class="dialog-venue">{{ venueName() }}</span>
        <h2 id="booking-dialog-title" class="dialog-title">{{ set().rowLabel }}</h2>
        <p class="dialog-meta">Spot {{ set().positionNo }} · {{ tierLabel() }}</p>
        <p class="dialog-includes">{{ includes }}</p>

        <ol class="steps" aria-label="Booking steps">
          @for (s of steps(); track s.n) {
            <li
              class="step"
              [class.active]="s.active"
              [attr.data-testid]="'step-' + s.n"
              [attr.aria-current]="s.active ? 'step' : null"
            >
              <span class="step-num" aria-hidden="true">{{ s.n }}</span>
              <span class="step-label">{{ s.label }}</span>
            </li>
          }
        </ol>
      </header>

      <form (submit)="onPrimary(); $event.preventDefault()" novalidate>
        <div class="dialog-body">
          @if (step() === 1) {
            <div class="ro-row">
              <span class="ro-key">Date</span>
              <strong class="ro-val" data-testid="dialog-date">{{ dateLabel() }}</strong>
            </div>
            <div class="ro-row">
              <span class="ro-key">Price</span>
              <strong class="ro-val accent" data-testid="dialog-price">{{ price() }}</strong>
            </div>

            <div class="fields">
              <label class="field">
                <span class="field-label">Full name</span>
                <input type="text" autocomplete="name" [formField]="bookingForm.fullName" />
                @if (submitAttempted() && bookingForm.fullName().errors().length) {
                  <span class="field-error" role="alert">{{ bookingForm.fullName().errors()[0].message }}</span>
                }
              </label>
              <label class="field">
                <span class="field-label">Email</span>
                <input type="email" autocomplete="email" [formField]="bookingForm.email" />
                @if (submitAttempted() && bookingForm.email().errors().length) {
                  <span class="field-error" role="alert">{{ bookingForm.email().errors()[0].message }}</span>
                }
              </label>
              <label class="field">
                <span class="field-label">Phone</span>
                <input type="tel" autocomplete="tel" [formField]="bookingForm.phone" />
                @if (submitAttempted() && bookingForm.phone().errors().length) {
                  <span class="field-error" role="alert">{{ bookingForm.phone().errors()[0].message }}</span>
                }
              </label>
            </div>
            <p class="fine">We only use these to send your booking code and reach you about this booking.</p>
          }

          @if (step() === 2) {
            <dl class="review">
              <div class="sum-row"><dt>Venue</dt><dd>{{ venueName() }}</dd></div>
              <div class="sum-row"><dt>Set</dt><dd>{{ set().rowLabel }} · spot {{ set().positionNo }}</dd></div>
              <div class="sum-row"><dt>Date</dt><dd>{{ dateLabel() }}</dd></div>
              <div class="sum-row"><dt>Guest</dt><dd>{{ model().fullName }}</dd></div>
              <div class="sum-row total"><dt>Total</dt><dd data-testid="review-total">{{ price() }}</dd></div>
            </dl>

            @if (isRequest()) {
              <p class="mode-note request">
                <strong>Request to Book.</strong> This venue reviews each request before payment. We’ll
                send your request now — <strong>you won’t be charged yet</strong>. If the venue accepts,
                you’ll get a link to pay {{ price() }} and lock in the set.
              </p>
            } @else {
              <p class="mode-note instant">
                <strong>Instant Book.</strong> Next you’ll pay securely to confirm this set right away.
                Free cancellation until the evening before — your booking code arrives on-screen and by
                email.
              </p>
            }

            <!-- New tab (not routerLink) so the modal's checkout state survives reading the document. -->
            <p class="fine" data-testid="legal-agreement">
              By continuing you agree to our
              <a class="underline" data-testid="legal-terms-link" href="/legal/terms" target="_blank" rel="noopener">Terms of Service</a>
              and acknowledge our
              <a class="underline" data-testid="legal-privacy-link" href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
            </p>
          }
        </div>

        @if (errorMessage(); as msg) {
          <p class="form-error" role="alert" data-testid="dialog-error">{{ msg }}</p>
        }

        <div class="dialog-actions">
          @if (step() === 2) {
            <button type="button" class="btn-back" data-testid="dialog-back" (click)="back()">Back</button>
          }
          <button
            type="submit"
            class="btn-primary"
            data-testid="dialog-primary"
            [disabled]="submitting()"
          >
            {{ submitting() ? busyLabel() : primaryLabel() }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: './booking-dialog.scss',
})
export class BookingDialog implements OnInit {
  readonly set = input.required<SetView>();
  /** The day the map is showing (ISO YYYY-MM-DD); seeds the POST body and the read-only date row. */
  readonly date = input.required<string>();
  /** The venue's booking mode: `REQUEST` swaps the CTA/copy to Request-to-Book. */
  readonly mode = input<BookingMode>('INSTANT');
  /** The venue name, shown in the gradient header (SetView carries none). */
  readonly venueName = input<string>('');

  readonly dismissed = output<void>();
  /** Emitted on a `201 CONFIRMED` (stub/Instant profile) — the booking is already paid. */
  readonly booked = output<BookingConfirmation>();
  /**
   * Emitted on a `202 AWAITING_PAYMENT` (stripe profile) — the parent routes to the payment page
   * to collect the card; the booking is NOT confirmed until the verified webhook (invariant #8).
   */
  readonly awaiting = output<AwaitingPayment>();
  /**
   * Emitted on a `202 PENDING_REQUEST` (REQUEST-mode venue) — nothing is charged; the
   * parent routes to the request-sent screen and the venue must accept before any payment.
   */
  readonly requested = output<RequestedBooking>();

  protected readonly includes = SET_INCLUDES;

  private readonly bookings = inject(BookingService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** 1 = Details, 2 = Review. */
  protected readonly step = signal<1 | 2>(1);
  /** Field errors are announced only after the first Continue (design; invariant-free UX). */
  protected readonly submitAttempted = signal(false);
  protected readonly submitting = signal(false);
  private readonly errorCode = signal<BookingErrorCode | undefined>(undefined);

  protected readonly isRequest = computed(() => this.mode() === 'REQUEST');
  protected readonly tierLabel = computed(() => touristTierLabel(this.set().tier));
  protected readonly dateLabel = computed(() => formatBookingDate(this.date()));
  protected readonly primaryLabel = computed(() => {
    if (this.step() === 1) {
      return 'Continue';
    }
    return this.isRequest() ? 'Send request' : 'Continue to payment';
  });
  protected readonly busyLabel = computed(() => (this.isRequest() ? 'Sending request…' : 'Processing…'));
  protected readonly steps = computed(() => [
    { n: 1, label: 'Details', active: this.step() === 1 },
    { n: 2, label: 'Review', active: this.step() === 2 },
  ]);

  protected readonly model = signal({
    fullName: '',
    email: '',
    phone: '',
    date: '',
  });

  protected readonly bookingForm = form(this.model, (path) => {
    required(path.fullName, { message: 'Your name is required' });
    required(path.email, { message: 'Email is required' });
    email(path.email, { message: 'Enter a valid email address' });
    required(path.phone, { message: 'Phone is required' });
  });

  constructor() {
    // Move focus into the dialog when it opens (modal a11y).
    afterNextRender({
      earlyRead: () => this.hostRef.nativeElement.querySelector('input'),
      write: (first) => first?.focus(),
    });
  }

  ngOnInit(): void {
    // Seed the date field from the map's selected date (available once inputs are set).
    this.model.update((m) => ({ ...m, date: this.date() }));
  }

  protected price(): string {
    return formatMoney(this.set().price);
  }

  protected requestClose(): void {
    this.dismissed.emit();
  }

  /** The one primary action; branches on the step (advance on Details, submit on Review). */
  protected onPrimary(): void {
    if (this.step() === 1) {
      this.continueToReview();
      return;
    }
    this.onSubmit();
  }

  private continueToReview(): void {
    if (this.bookingForm().invalid()) {
      this.submitAttempted.set(true);
      return;
    }
    this.submitAttempted.set(false);
    this.errorCode.set(undefined);
    this.step.set(2);
    this.focusPrimary();
  }

  protected back(): void {
    this.step.set(1);
    this.focusPrimary();
  }

  /** Keep focus inside the panel across step changes (the primary button is always present) so the
   *  focus trap can never be escaped onto the shell behind the modal. */
  private focusPrimary(): void {
    this.hostRef.nativeElement
      .querySelector<HTMLElement>('[data-testid="dialog-primary"]')
      ?.focus();
  }

  private onSubmit(): void {
    this.errorCode.set(undefined);
    submit(this.bookingForm, async () => {
      const m = this.model();
      this.submitting.set(true);
      try {
        const result = await firstValueFrom(
          this.bookings.createBooking({
            setId: this.set().id,
            bookingDate: m.date,
            contact: { email: m.email, fullName: m.fullName, phone: m.phone },
          }),
        );
        if (result.kind === 'requested') {
          this.requested.emit(result.requested);
        } else if (result.kind === 'awaiting') {
          this.awaiting.emit(result.awaiting);
        } else {
          this.booked.emit(result.confirmation);
        }
      } catch (error) {
        this.errorCode.set(bookingErrorOf(error));
      } finally {
        this.submitting.set(false);
      }
    });
  }

  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case 'SET_TAKEN':
        return 'Sorry — someone just booked this set. Please pick another.';
      case 'SET_NOT_BOOKABLE_ONLINE':
        return 'This set is not available to book online.';
      case 'BOOKING_CLOSED':
        return 'Booking has closed for that date. Try a later day.';
      case 'NO_SUCH_SET':
        return 'That set could not be found.';
      case 'INVALID_REQUEST':
        return 'Please check the form and try again.';
      case 'UNKNOWN':
        return 'Something went wrong. Please try again.';
      default:
        return undefined;
    }
  }

  /** Keep keyboard focus inside the dialog (modal a11y) — shared trap, see {@link trapFocusWithin}. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }
}
