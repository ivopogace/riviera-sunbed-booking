import { afterNextRender, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { email, FormField, form, required, submit } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { SetView } from '../venue/venue.model';
import { BookingConfirmation, BookingErrorCode } from './booking.model';
import { BookingService, bookingErrorOf } from './booking.service';

/**
 * Modal guest-checkout form for booking one set (U3, issue #6). Signal Forms
 * (`@angular/forms/signals`) drive the email/name/phone/date fields; submission posts through
 * {@link BookingService}. Accessible modal: `role="dialog"` + `aria-modal`, a focus trap, ESC
 * and backdrop close, and focus returns to the triggering tile (handled by the parent on
 * `dismissed`). The set, amount and date are server-validated — the client form is UX only.
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
export class BookingDialog {
  readonly set = input.required<SetView>();

  readonly dismissed = output<void>();
  readonly booked = output<BookingConfirmation>();

  protected readonly titleId = 'booking-dialog-title';

  private readonly bookings = inject(BookingService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  private readonly errorCode = signal<BookingErrorCode | undefined>(undefined);

  protected readonly model = signal({
    fullName: '',
    email: '',
    phone: '',
    date: BookingDialog.defaultDate(),
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

  protected price(): string {
    const { minorUnits, currency } = this.set().price;
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
    }).format(minorUnits / 100);
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
        const confirmation = await firstValueFrom(
          this.bookings.createBooking({
            setId: this.set().id,
            bookingDate: m.date,
            contact: { email: m.email, fullName: m.fullName, phone: m.phone },
          }),
        );
        this.booked.emit(confirmation);
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
    const last = focusable[focusable.length - 1];
    const active = this.hostRef.nativeElement.ownerDocument.activeElement;
    if (backwards && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!backwards && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private static defaultDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 1); // default to tomorrow; server enforces the real cutoff
    // Format from local date parts (NOT toISOString, which is UTC and can roll the day back
    // for late-evening users in Europe/Tirane — invariant #6). The server is authoritative.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
