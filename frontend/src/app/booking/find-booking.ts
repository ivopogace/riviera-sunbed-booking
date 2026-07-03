import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { BookingService } from './booking.service';

/**
 * Real booking codes are 10-char Crockford base32 (`SecureRandomBookingCodeGenerator`) — no
 * prefix, no dash. Normalize a typed code before lookup: trim, uppercase (the stored form), and
 * strip stray spaces/dashes a guest may paste. Deliberately NO strict format regex — a brittle
 * client check risks rejecting a valid code; the server 404 is the authority on unknown/malformed.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * "Find a booking" glass modal (issue #148, epic #133; design
 * `riviera-sunbeds-liquid-glass-v3.dc.html` → *Find booking*). A guest on a device that doesn't
 * hold their booking (no device-local entry, no email link) types their booking **code** — the
 * unguessable bearer credential (invariant #7) — and is taken to the existing T5 `/booking/:code`
 * detail view. The modal performs the lookup itself (`BookingService.getByCode`) so an unknown /
 * rate-limited / failed code renders **inline without navigating** (issue AC), reusing the same
 * server-rate-limited endpoint (#56) — no new lookup oracle. The code is never logged and only ever
 * appears in a URL via the existing `/booking/:code` deep link.
 *
 * <p>Accessible modal cloned from {@link BookingDialog}: `role="dialog"` + `aria-modal`, an
 * accessible name from the heading, a focus trap, autofocus into the input, and ESC / backdrop /
 * close-button dismiss (emitting {@link close}; the app shell restores focus to the trigger).
 */
@Component({
  selector: 'app-find-booking',
  imports: [FormField],
  host: {
    class: 'find-backdrop',
    '(click)': 'requestClose()',
    '(keydown.escape)': 'requestClose()',
  },
  template: `
    <div
      class="find-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="find-title"
      aria-describedby="find-intro"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <button
        type="button"
        class="find-close"
        data-testid="find-close"
        aria-label="Close"
        (click)="requestClose()"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <h2 id="find-title" class="find-title">Find your booking</h2>
      <p id="find-intro" class="find-intro">
        Booked on another device or by a friend? Enter your booking code to open it here. It looks
        like <strong>K4TQ7M9PX2</strong> and is on your confirmation email.
      </p>

      <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
        <label class="find-field">
          <span class="find-label">Booking code</span>
          <input
            type="text"
            data-testid="find-code"
            [formField]="codeForm.code"
            placeholder="K4TQ7M9PX2"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            aria-describedby="find-intro"
          />
        </label>

        @if (errorText(); as msg) {
          <p class="find-error" role="alert" data-testid="find-error">{{ msg }}</p>
        }

        <button
          type="submit"
          class="find-submit"
          data-testid="find-submit"
          [disabled]="submitting()"
        >
          {{ submitting() ? 'Opening…' : 'Open booking' }}
        </button>
      </form>
    </div>
  `,
  styleUrl: './find-booking.scss',
})
export class FindBooking {
  /** Emitted on a user dismiss (ESC / backdrop / close button); the shell restores focus + hides. */
  readonly dismissed = output<void>();

  private readonly bookings = inject(BookingService);
  private readonly router = inject(Router);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Field state announced only after the first submit (design; keeps the idle modal quiet). */
  protected readonly submitAttempted = signal(false);
  protected readonly submitting = signal(false);
  /** Server-side lookup outcome copy (404 / 429 / transport) shown in the one alert region. */
  private readonly lookupError = signal<string | undefined>(undefined);

  protected readonly model = signal({ code: '' });
  protected readonly codeForm = form(this.model, (path) => {
    required(path.code, { message: 'Enter your booking code.' });
  });

  /** One alert region: a server lookup error wins; otherwise the required message after a submit. */
  protected readonly errorText = computed<string | undefined>(() => {
    if (this.lookupError()) {
      return this.lookupError();
    }
    const errors = this.codeForm.code().errors();
    return this.submitAttempted() && errors.length ? errors[0].message : undefined;
  });

  constructor() {
    // Move focus into the code input when the modal opens (modal a11y).
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return; // a lookup is already in flight — don't hit the rate-limited oracle twice (AC-7)
    }
    this.lookupError.set(undefined);
    this.submitAttempted.set(true);
    if (this.codeForm().invalid()) {
      return; // empty → the required message renders; no request
    }
    const code = normalizeCode(this.model().code);
    if (!code) {
      return; // whitespace-only collapsed to empty — defensive, no lookup
    }
    this.submitting.set(true);
    try {
      // Validate the code against the (rate-limited, #56) lookup endpoint, THEN navigate to the
      // existing /booking/:code deep link — so an unknown/rate-limited code stays inline here
      // without navigating. `submitting` stays true through the nav (the shell closes the modal on
      // NavigationEnd); the destination page takes focus.
      await firstValueFrom(this.bookings.getByCode(code));
      await this.router.navigate(['/booking', code]);
    } catch (error: unknown) {
      this.lookupError.set(messageFor(error, code));
      this.submitting.set(false);
    }
  }

  protected requestClose(): void {
    this.dismissed.emit();
  }

  /** Keep keyboard focus inside the dialog (a focus trap, modal a11y) — the booking-dialog pattern. */
  protected trapFocus(event: Event, backwards: boolean): void {
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

/**
 * Map a lookup failure to displayable copy. `404` → not found (echoes the guest's own on-screen
 * input, not a log — invariant #7); `429` → the #56 rate-limit retry copy (the `operator-auth`
 * `status === 429` precedent); anything else (transport / 5xx) → a generic retry.
 */
function messageFor(error: unknown, code: string): string {
  const status =
    typeof error === 'object' && error !== null ? (error as { status?: number }).status : undefined;
  if (status === 404) {
    return `No booking found for ${code}. Check the code and try again.`;
  }
  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return 'Something went wrong. Please try again.';
}
