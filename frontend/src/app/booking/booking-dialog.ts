import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { email, FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { formatMoney } from '../shared/money';
import { SetView } from '../venue/venue.model';
import { AwaitingPayment, BookingConfirmation, BookingErrorCode } from './booking.model';
import { BookingService, bookingErrorOf } from './booking.service';

/**
 * Modal guest-checkout form for booking one set (U3, issue #6). Signal Forms
 * (`@angular/forms/signals`) drive the email/name/phone/date fields; submission posts through
 * {@link BookingService}. Accessible modal: `role="dialog"` + `aria-modal`, a focus trap, ESC
 * and backdrop close, and focus returns to the triggering tile (handled by the parent on
 * `dismissed`). The set, amount and date are server-validated — the client form is UX only.
 *
 * <p>The {@code date} input is the day the map is showing (issue #44): the form's date field is
 * seeded from it so the map and the dialog always agree, while staying editable (the server
 * remains authoritative for the cutoff).
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
      [attr.aria-labelledby]="titleId"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <h2 [id]="titleId" class="panel-title">Book this set</h2>
      <p class="panel-summary">
        {{ set().rowLabel }} · spot {{ set().positionNo }} — <strong>{{ price() }}</strong>
      </p>

      <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
        <label class="field">
          <span>Full name</span>
          <input type="text" autocomplete="name" [formField]="bookingForm.fullName" />
          @if (bookingForm.fullName().touched() && bookingForm.fullName().errors().length) {
            <span class="field-error">{{ bookingForm.fullName().errors()[0].message }}</span>
          }
        </label>

        <label class="field">
          <span>Email</span>
          <input type="email" autocomplete="email" [formField]="bookingForm.email" />
          @if (bookingForm.email().touched() && bookingForm.email().errors().length) {
            <span class="field-error">{{ bookingForm.email().errors()[0].message }}</span>
          }
        </label>

        <label class="field">
          <span>Phone</span>
          <input type="tel" autocomplete="tel" [formField]="bookingForm.phone" />
          @if (bookingForm.phone().touched() && bookingForm.phone().errors().length) {
            <span class="field-error">{{ bookingForm.phone().errors()[0].message }}</span>
          }
        </label>

        <label class="field">
          <span>Date</span>
          <input type="date" [formField]="bookingForm.date" />
          @if (bookingForm.date().touched() && bookingForm.date().errors().length) {
            <span class="field-error">{{ bookingForm.date().errors()[0].message }}</span>
          }
        </label>

        @if (errorMessage(); as msg) {
          <p class="form-error" role="alert">{{ msg }}</p>
        }

        <div class="actions">
          <button type="button" class="btn-secondary" (click)="requestClose()">Cancel</button>
          <button type="submit" class="btn-primary" [disabled]="bookingForm().invalid() || submitting()">
            {{ submitting() ? 'Booking…' : 'Confirm booking' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: './booking-dialog.scss',
})
export class BookingDialog implements OnInit {
  readonly set = input.required<SetView>();
  /** The day the map is showing (ISO YYYY-MM-DD); seeds the form's date so the two agree. */
  readonly date = input.required<string>();

  readonly dismissed = output<void>();
  /** Emitted on a `201 CONFIRMED` (stub/Instant profile) — the booking is already paid. */
  readonly booked = output<BookingConfirmation>();
  /**
   * Emitted on a `202 AWAITING_PAYMENT` (stripe profile) — the parent routes to the payment page
   * to collect the card; the booking is NOT confirmed until the verified webhook (invariant #8).
   */
  readonly awaiting = output<AwaitingPayment>();

  protected readonly titleId = 'booking-dialog-title';

  private readonly bookings = inject(BookingService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  private readonly errorCode = signal<BookingErrorCode | undefined>(undefined);

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
    required(path.date, { message: 'Pick a date' });
  });

  constructor() {
    // Move focus into the dialog when it opens (modal a11y).
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
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

  protected onSubmit(): void {
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
        if (result.kind === 'awaiting') {
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

  /** Keep keyboard focus inside the dialog (a focus trap, modal a11y). */
  protected trapFocus(event: Event, backwards: boolean): void {
    // Selector excludes disabled controls; we deliberately do NOT filter on offsetParent —
    // it is null for position:fixed subtrees (our backdrop) and unavailable under jsdom, which
    // would silently disable the trap. The dialog has no hidden focusables, so the selector is enough.
    const focusable = Array.from(
      this.hostRef.nativeElement.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!; // non-null: guarded by the length check above
    const active = this.hostRef.nativeElement.ownerDocument.activeElement;
    if (backwards && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!backwards && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
