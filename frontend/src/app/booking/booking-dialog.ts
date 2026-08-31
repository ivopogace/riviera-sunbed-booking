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
import { LegalConsent } from './legal-consent';
import { email, FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { todayBookingDate } from '../shared/booking-date';
import { formatBookingDate } from '../shared/booking-date-label';
import { FieldErrorFor } from '../shared/field-error-for';
import { FieldGlass } from '../shared/field-glass';
import { trapFocusWithin } from '../shared/focus-trap';
import { formatMoney } from '../shared/money';
import { touristTierLabel } from '../shared/set-label';
import { BusyAction } from '../shared/busy-action';
import { BookingMode, SetView } from '../shared/venue-views';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingErrorCode,
  RequestedBooking,
} from './booking.model';
import { BookingService, bookingErrorOf } from './booking.service';
import { CancellationTermsNote } from './cancellation-terms-note';

import { TouchTarget } from '../shared/touch-target';

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
  imports: [
    LegalConsent,
    FormField,
    BusyAction,
    FieldErrorFor,
    FieldGlass,
    TouchTarget,
    CancellationTermsNote,
  ],
  host: {
    // The fixed, scrim-backed backdrop must paint ABOVE the sticky glass header (z-60) — the app shell relies on this.
    class:
      'booking-backdrop fixed inset-0 z-60 flex items-center justify-center bg-[rgba(6,30,40,0.45)] p-5 backdrop-blur-[6px]',
    '(click)': 'requestClose()',
    '(keydown.escape)': 'requestClose()',
  },
  template: `
    <div
      class="booking-panel flex max-h-[calc(100vh-40px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] border border-riv-card-border bg-riv-dialog-glass text-riv-card-ink shadow-[0_40px_90px_rgba(6,30,40,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[34px] backdrop-saturate-[1.8] [animation:riv-pop_0.26s_cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:[animation:none]"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="'booking-dialog-venue booking-dialog-title'"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <!-- AA-safe dark-teal gradient header, SOLID white inks (deviation from the design's frosted whites, on purpose). -->
      <header
        class="dialog-head relative shrink-0 bg-[linear-gradient(160deg,#0c7288,#0a5f74)] px-6 pt-[18px] pb-[15px] text-white"
      >
        <!-- bg #31798a = solid composite of the frosted white-0.16 chip over the teal header (white 4.96:1; static-analysis safe). -->
        <button
          appTouchTarget
          type="button"
          class="dialog-close absolute top-[14px] right-[14px] flex size-[30px] cursor-pointer items-center justify-center rounded-full border border-[rgba(255,255,255,0.4)] bg-[#31798a] text-[15px] leading-none text-white motion-safe:[transition:filter_0.15s_ease] hover:brightness-[1.12] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
          data-testid="dialog-close"
          aria-label="Close"
          (click)="requestClose()"
        >
          <span aria-hidden="true">✕</span>
        </button>
        <span
          id="booking-dialog-venue"
          class="dialog-venue block text-[12px] tracking-[0.1em] uppercase text-white"
          >{{ venueName() }}</span
        >
        <h2
          id="booking-dialog-title"
          class="dialog-title mt-[5px] text-[23px] leading-[1.1] font-bold tracking-[-0.02em] text-white"
        >
          {{ set().rowLabel }}
        </h2>
        <p class="dialog-meta mt-[5px] text-[13px] text-white">
          Spot {{ set().positionNo }} · {{ tierLabel() }}
        </p>
        <p class="dialog-includes mt-[7px] text-[12.5px] text-white">{{ includes }}</p>

        <ol class="steps mt-[14px] flex items-center gap-2" aria-label="Booking steps">
          @for (s of steps(); track s.n) {
            <!-- Solid white on the teal header — AA; the connector line is the ::after rule. -->
            <li
              class="step flex min-w-0 flex-1 items-center gap-[7px] text-[12px] font-semibold whitespace-nowrap text-white [&:not(:last-child)]:after:h-px [&:not(:last-child)]:after:min-w-2 [&:not(:last-child)]:after:flex-1 [&:not(:last-child)]:after:bg-[rgba(255,255,255,0.32)]"
              [class.active]="s.active"
              [attr.data-testid]="'step-' + s.n"
              [attr.aria-current]="s.active ? 'step' : null"
            >
              <!-- Decorative number (aria-hidden) — the label carries the meaning, so the circle tints are 1.4.11-exempt. Inactive #2c7789 = the AA-safe muted teal (white 5.1:1; static-analysis safe). -->
              <span
                class="step-num flex size-[22px] shrink-0 items-center justify-center rounded-[50%] text-[12px] font-bold"
                [class]="s.active ? 'bg-white text-[#0a5f74]' : 'bg-[#2c7789] text-white'"
                aria-hidden="true"
                >{{ s.n }}</span
              >
              <span class="step-label">{{ s.label }}</span>
            </li>
          }
        </ol>
      </header>

      <form (submit)="onPrimary(); $event.preventDefault()" novalidate>
        <div class="dialog-body min-h-0 flex-1 overflow-y-auto px-6 pt-[15px] pb-2">
          @if (step() === 1) {
            <div
              class="ro-row flex items-center justify-between border-b border-b-riv-card-track py-[9px] text-[14.5px] first:pt-0"
            >
              <span class="ro-key text-riv-card-ink-soft">Date</span>
              <strong class="ro-val text-riv-card-ink" data-testid="dialog-date">{{
                dateLabel()
              }}</strong>
            </div>
            <div
              class="ro-row flex items-center justify-between border-b border-b-riv-card-track py-[9px] text-[14.5px] first:pt-0"
            >
              <span class="ro-key text-riv-card-ink-soft">Price</span>
              <strong
                class="ro-val accent text-[16px] text-riv-accent-ink"
                data-testid="dialog-price"
                >{{ price() }}</strong
              >
            </div>

            <div class="fields mt-3 flex flex-col gap-2.5">
              <label class="field flex flex-col gap-1.5">
                <span
                  class="field-label text-[11px] font-bold tracking-[0.1em] uppercase text-riv-card-ink-soft"
                  >Full name</span
                >
                <input
                  appTouchTarget
                  appFieldGlass
                  class="rounded-[14px] px-[13px] py-[11px] text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
                  type="text"
                  autocomplete="name"
                  [formField]="bookingForm.fullName"
                  #fullNameControl
                />
                @if (submitAttempted() && bookingForm.fullName().errors().length) {
                  <!-- Dark brick red — AA on the light panel over the worst gradient stop. -->
                  <span
                    [appFieldErrorFor]="fullNameControl"
                    class="field-error text-[12px] font-semibold text-riv-error-ink"
                    role="alert"
                    >{{ bookingForm.fullName().errors()[0].message }}</span
                  >
                }
              </label>
              <label class="field flex flex-col gap-1.5">
                <span
                  class="field-label text-[11px] font-bold tracking-[0.1em] uppercase text-riv-card-ink-soft"
                  >Email</span
                >
                <input
                  appTouchTarget
                  appFieldGlass
                  class="rounded-[14px] px-[13px] py-[11px] text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
                  type="email"
                  autocomplete="email"
                  [formField]="bookingForm.email"
                  #emailControl
                />
                @if (submitAttempted() && bookingForm.email().errors().length) {
                  <span
                    [appFieldErrorFor]="emailControl"
                    class="field-error text-[12px] font-semibold text-riv-error-ink"
                    role="alert"
                    >{{ bookingForm.email().errors()[0].message }}</span
                  >
                }
              </label>
              <label class="field flex flex-col gap-1.5">
                <span
                  class="field-label text-[11px] font-bold tracking-[0.1em] uppercase text-riv-card-ink-soft"
                  >Phone</span
                >
                <input
                  appTouchTarget
                  appFieldGlass
                  class="rounded-[14px] px-[13px] py-[11px] text-[15px] focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
                  type="tel"
                  autocomplete="tel"
                  [formField]="bookingForm.phone"
                  #phoneControl
                />
                @if (submitAttempted() && bookingForm.phone().errors().length) {
                  <span
                    [appFieldErrorFor]="phoneControl"
                    class="field-error text-[12px] font-semibold text-riv-error-ink"
                    role="alert"
                    >{{ bookingForm.phone().errors()[0].message }}</span
                  >
                }
              </label>
            </div>
            <p class="fine mt-2.5 mb-1 text-[12.5px] leading-[1.45] text-riv-card-ink-soft">
              We only use these to send your booking code and reach you about this booking.
            </p>
          }

          @if (step() === 2) {
            <dl class="review">
              <div
                class="sum-row flex items-center justify-between gap-3 border-b border-b-riv-card-track py-[11px] text-[14.5px] first:pt-0"
              >
                <dt class="text-riv-card-ink-soft">Venue</dt>
                <dd class="text-right font-bold text-riv-card-ink">{{ venueName() }}</dd>
              </div>
              <div
                class="sum-row flex items-center justify-between gap-3 border-b border-b-riv-card-track py-[11px] text-[14.5px] first:pt-0"
              >
                <dt class="text-riv-card-ink-soft">Set</dt>
                <dd class="text-right font-bold text-riv-card-ink">
                  {{ set().rowLabel }} · spot {{ set().positionNo }}
                </dd>
              </div>
              <div
                class="sum-row flex items-center justify-between gap-3 border-b border-b-riv-card-track py-[11px] text-[14.5px] first:pt-0"
              >
                <dt class="text-riv-card-ink-soft">Date</dt>
                <dd class="text-right font-bold text-riv-card-ink">{{ dateLabel() }}</dd>
              </div>
              <div
                class="sum-row flex items-center justify-between gap-3 border-b border-b-riv-card-track py-[11px] text-[14.5px] first:pt-0"
              >
                <dt class="text-riv-card-ink-soft">Guest</dt>
                <dd class="text-right font-bold text-riv-card-ink">{{ model().fullName }}</dd>
              </div>
              <div
                class="sum-row total flex items-center justify-between gap-3 pt-[14px] pb-[11px] text-[14.5px]"
              >
                <dt class="text-[15px] text-riv-card-ink-soft">Total</dt>
                <dd
                  class="text-right text-[26px] font-bold tracking-[-0.02em] text-riv-accent-ink"
                  data-testid="review-total"
                >
                  {{ price() }}
                </dd>
              </div>
            </dl>

            @if (isRequest()) {
              <p
                class="mode-note request mt-[14px] mb-1 block rounded-2xl border border-[rgba(240,170,46,0.38)] bg-[rgba(240,170,46,0.12)] px-[15px] py-[13px] text-[12.8px] leading-[1.5] text-riv-card-ink-soft"
              >
                <strong class="text-riv-card-ink">Request to Book.</strong> This venue reviews each
                request before payment. We’ll send your request now —
                <strong class="text-riv-card-ink">you won’t be charged yet</strong>. If the venue
                accepts, you’ll get a link to pay {{ price() }} and lock in the set.
              </p>
            } @else {
              <p
                class="mode-note instant mt-[14px] mb-1 block rounded-2xl border border-riv-accent-border bg-riv-accent-fill px-[15px] py-[13px] text-[12.8px] leading-[1.5] text-riv-card-ink-soft"
              >
                <strong class="text-riv-card-ink">Instant Book.</strong> Next you’ll pay securely to
                confirm this set right away — your booking code arrives on-screen and by email.
              </p>
            }

            <!-- Polite live region: the server-quoted terms may resolve after the step renders (R-6). -->
            <div role="status" data-testid="terms-region">
              @if (terms.hasValue()) {
                <p
                  appCancellationTermsNote
                  [terms]="terms.value()!"
                  class="mt-2 mb-1 block rounded-2xl border border-riv-card-track bg-riv-wash-fill px-[15px] py-[11px] text-[12.5px] text-riv-card-ink-soft"
                ></p>
              }
            </div>

            <!-- New tab (not routerLink) so the modal's checkout state survives reading the document. -->
            <p
              appLegalConsent
              lead="By continuing"
              class="fine mt-2.5 mb-1 text-[12.5px] leading-[1.45] text-riv-card-ink-soft"
            ></p>
          }
        </div>

        @if (errorMessage(); as msg) {
          <!-- Solid #f6e8e7 = composite of the translucent red tint over the panel; brick red clears AA (~6.6:1) on it. -->
          <p
            class="form-error mx-6 rounded-xl bg-[#f6e8e7] px-[13px] py-2.5 text-[13px] font-semibold text-[#a3160e]"
            role="alert"
            data-testid="dialog-error"
          >
            {{ msg }}
          </p>
        }

        <div
          class="dialog-actions flex shrink-0 gap-2.5 border-t border-t-riv-card-track px-6 pt-[14px] pb-4"
        >
          @if (step() === 2) {
            <button
              appTouchTarget
              type="button"
              class="btn-back shrink-0 cursor-pointer rounded-2xl border-[1.5px] border-riv-card-border bg-riv-wash-fill px-5 py-[14px] text-[15px] font-semibold text-riv-back-ink backdrop-blur-[8px] motion-safe:[transition:background_0.15s_ease,border-color_0.15s_ease,box-shadow_0.15s_ease] hover:border-riv-wash-hover-border hover:bg-riv-wash-hover hover:shadow-[0_6px_16px_rgba(6,30,40,0.14)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
              data-testid="dialog-back"
              (click)="back()"
            >
              Back
            </button>
          }
          <button
            appTouchTarget
            type="submit"
            class="btn-primary flex-1 cursor-pointer rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) p-[14px] text-[15px] font-bold text-white shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-70"
            data-testid="dialog-primary"
            [appBusy]="submitting()"
          >
            {{ submitting() ? busyLabel() : primaryLabel() }}
          </button>
        </div>
      </form>
    </div>
  `,
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

  /**
   * This booking's server-quoted cancellation terms (#795). While loading or failed the template
   * renders no cancellation claim at all — never a false "free cancellation".
   */
  protected readonly terms = this.bookings.cancellationTerms(() => ({
    setId: this.set().id,
    date: this.date(),
  }));

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
  protected readonly busyLabel = computed(() =>
    this.isRequest() ? 'Sending request…' : 'Processing…',
  );
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
    void submit(this.bookingForm, async () => {
      const m = this.model();
      this.submitting.set(true);
      try {
        const result = await firstValueFrom(
          this.bookings.createBooking(
            {
              setId: this.set().id,
              bookingDate: m.date,
              contact: { email: m.email, fullName: m.fullName, phone: m.phone },
            },
            this.terms.hasValue() ? this.terms.value() : undefined,
          ),
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
        return this.date() === todayBookingDate(new Date())
          ? 'Online sales for today have closed at this venue. Try another venue or tomorrow.'
          : 'Booking has closed for that date. Try a later day.';
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
