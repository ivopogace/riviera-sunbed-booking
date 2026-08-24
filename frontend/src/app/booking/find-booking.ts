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

import { BusyAction } from '../shared/busy-action';
import { trapFocusWithin } from '../shared/focus-trap';
import { normalizeCode } from '../shared/booking-code';
import { BookingService } from './booking.service';

import { TouchTarget } from '../shared/touch-target';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  panel:
    'relative w-full max-w-[390px] rounded-[30px] border border-(--riv-card-border) bg-[rgba(255,255,255,0.82)] px-6.5 pt-7 pb-6 text-(--riv-card-ink) shadow-[0_40px_90px_rgba(6,30,40,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[34px] backdrop-saturate-[1.8] [animation:riv-pop_0.26s_cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:[animation:none]',
  close:
    'absolute top-4 right-4 flex size-[30px] cursor-pointer items-center justify-center rounded-full border border-(--riv-card-border) bg-[rgba(255,255,255,0.5)] text-[14px] leading-none text-(--riv-card-ink-soft) motion-safe:[transition:background_0.15s_ease] hover:bg-[rgba(255,255,255,0.75)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)',
  title: 'm-0 mb-1.25 text-[23px] font-bold tracking-[-0.02em] text-(--riv-card-ink)',
  intro: 'm-0 mb-4.5 text-[13.5px] leading-[1.5] text-(--riv-card-ink-soft)',
  field: 'flex flex-col gap-1.5',
  label: 'text-[11px] font-bold tracking-[0.1em] uppercase text-(--riv-card-ink-soft)',
  input:
    'font-[inherit] text-[18px] font-bold tracking-[0.1em] uppercase text-(--riv-card-ink) bg-(--riv-field-fill) border border-(--riv-field-border) rounded-[14px] px-[15px] py-[13px] placeholder:font-semibold placeholder:text-(--riv-card-ink-soft) focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-(--riv-accent-ink)',
  error: 'mt-2.5 text-[13px] font-semibold text-[#a3160e]',
  submit:
    'mt-4 w-full p-[13px] rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
} as const;

/**
 * "Find a booking" glass modal (design
 * `riviera-sunbeds-liquid-glass-v3.dc.html` → *Find booking*). A guest on a device that doesn't
 * hold their booking (no device-local entry, no email link) types their booking **code** — the
 * unguessable bearer credential (invariant #7) — and is taken to the existing `/booking/:code`
 * detail view. The modal performs the lookup itself (`BookingService.getByCode`) so an unknown /
 * rate-limited / failed code renders **inline without navigating**, reusing the same
 * server-rate-limited endpoint — no new lookup oracle. The code is never logged and only ever
 * appears in a URL via the existing `/booking/:code` deep link.
 *
 * <p>Accessible modal cloned from {@link BookingDialog}: `role="dialog"` + `aria-modal`, an
 * accessible name from the heading, a focus trap, autofocus into the input, and ESC / backdrop /
 * close-button dismiss (emitting {@link close}; the app shell restores focus to the trigger).
 */
@Component({
  selector: 'app-find-booking',
  imports: [FormField, BusyAction, TouchTarget],
  host: {
    class:
      'fixed inset-0 z-60 flex items-center justify-center bg-[rgba(6,30,40,0.45)] p-5 backdrop-blur-[6px]',
    '(click)': 'requestClose()',
    '(keydown.escape)': 'requestClose()',
  },
  template: `
    <div
      [class]="cls.panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="find-title"
      aria-describedby="find-intro"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <button
        appTouchTarget
        type="button"
        [class]="cls.close"
        data-testid="find-close"
        aria-label="Close"
        (click)="requestClose()"
      >
        <span aria-hidden="true">✕</span>
      </button>

      <h2 id="find-title" [class]="cls.title">Find your booking</h2>
      <p id="find-intro" [class]="cls.intro">
        Booked on another device or by a friend? Enter your booking code to open it here. It looks
        like <strong class="text-(--riv-card-ink)">K4TQ7M9PX2</strong> and is on your confirmation
        email.
      </p>

      <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
        <label [class]="cls.field">
          <span [class]="cls.label">Booking code</span>
          <input
            appTouchTarget
            [class]="cls.input"
            type="text"
            data-testid="find-code"
            [formField]="codeForm.code"
            (input)="onCodeInput()"
            placeholder="K4TQ7M9PX2"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            aria-describedby="find-intro"
          />
        </label>

        @if (errorText(); as msg) {
          <p [class]="cls.error" role="alert" data-testid="find-error">{{ msg }}</p>
        }

        <button
          appTouchTarget
          type="submit"
          [class]="cls.submit"
          data-testid="find-submit"
          [appBusy]="submitting()"
        >
          {{ submitting() ? 'Opening…' : 'Open booking' }}
        </button>
      </form>
    </div>
  `,
})
export class FindBooking {
  /** Emitted on a user dismiss (ESC / backdrop / close button); the shell restores focus + hides. */
  readonly dismissed = output<void>();

  private readonly bookings = inject(BookingService);
  private readonly router = inject(Router);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly cls = CLS;
  /** Field state announced only after the first submit (design; keeps the idle modal quiet). */
  protected readonly submitAttempted = signal(false);
  protected readonly submitting = signal(false);
  /** Server-side lookup outcome copy (404 / 429 / transport) shown in the one alert region. */
  private readonly lookupError = signal<string | undefined>(undefined);

  protected readonly model = signal({ code: '' });
  protected readonly codeForm = form(this.model, (path) => {
    required(path.code, { message: 'Enter your booking code.' });
  });

  /** The code that will actually be looked up (what {@link normalizeCode} yields). Empty for a blank
   *  OR whitespace/dash-only entry — both must show the "enter a code" message. */
  private readonly normalizedCode = computed(() => normalizeCode(this.model().code));

  /** One alert region: a server lookup error wins; otherwise, after a submit, the "enter a code"
   *  message whenever the entry normalizes to empty (covers blank AND whitespace/dash-only). */
  protected readonly errorText = computed<string | undefined>(() => {
    if (this.lookupError()) {
      return this.lookupError();
    }
    return this.submitAttempted() && !this.normalizedCode()
      ? 'Enter your booking code.'
      : undefined;
  });

  constructor() {
    // Move focus into the code input when the modal opens (modal a11y).
    afterNextRender({
      earlyRead: () => this.hostRef.nativeElement.querySelector('input'),
      write: (first) => first?.focus(),
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return; // a lookup is already in flight — don't hit the rate-limited oracle twice (AC-7)
    }
    this.lookupError.set(undefined);
    this.submitAttempted.set(true);
    const code = this.normalizedCode();
    if (!code) {
      return; // blank or whitespace/dash-only → errorText shows "Enter your booking code."; no request
    }
    this.submitting.set(true);
    try {
      // Validate the code against the rate-limited lookup endpoint, THEN navigate to the existing /booking/:code deep link — so an unknown/rate-limited code stays inline here without navigating.
      const detail = await firstValueFrom(this.bookings.getByCode(code));
      // Prime the fetched detail so BookingView opens without a second GET.
      this.bookings.primeDetail(detail);
      const navigated = await this.router.navigate(['/booking', code]);
      if (!navigated) {
        // Same-URL (the guest is already on this booking) or a blocked nav produces no NavigationEnd, so the shell won't close the modal — close it here (the target is already shown) and stop the spinner, or the modal freezes on "Opening…"; also discard the prime the un-navigated view won't consume, so a later deep-link re-fetches.
        this.bookings.takePrefetched(code);
        this.submitting.set(false);
        this.dismissed.emit();
      }
      // navigated === true → the shell closes the modal on NavigationEnd (component destroyed).
    } catch (error: unknown) {
      // Lookup failure OR a rejected navigation (e.g. a lazy-chunk load error) — surface, don't freeze.
      this.lookupError.set(messageFor(error, code));
      this.submitting.set(false);
    }
  }

  /** Clear a stale server error as the guest edits the code. */
  protected onCodeInput(): void {
    this.lookupError.set(undefined);
  }

  protected requestClose(): void {
    this.dismissed.emit();
  }

  /** Keep keyboard focus inside the dialog (modal a11y) — shared trap, see {@link trapFocusWithin}. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }
}

/**
 * Map a lookup failure to displayable copy. `404` → not found (echoes the guest's own on-screen
 * input, not a log — invariant #7); `429` → the rate-limit retry copy (the `operator-auth`
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
