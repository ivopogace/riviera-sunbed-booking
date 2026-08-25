import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CustomerAuth,
  MIN_PASSWORD_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from '../core/customer-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { LoadAnnouncer } from '../shared/load-announcer';
import { focusMover } from '../shared/focus-after-render';

import { TouchTarget } from '../shared/touch-target';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[30px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[24px] font-bold tracking-[-0.02em] text-riv-card-ink',
  intro: 'm-0 mb-5 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  field: 'flex flex-col gap-1.5 mb-3.5',
  label: 'text-[11px] font-bold tracking-[0.08em] uppercase text-riv-card-ink-soft',
  input:
    'font-[inherit] text-[16px] text-riv-card-ink bg-riv-field-fill border border-riv-field-border rounded-[14px] px-[14px] py-3 placeholder:text-riv-card-ink-soft focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  hint: '-mt-1.5 text-[12px] text-riv-card-ink-soft',
  error: 'mt-3 text-[13px] font-semibold text-riv-error-ink',
  submit:
    'mt-4.5 w-full p-[13px] rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
  alt: 'mt-4.5 text-center text-[13.5px] text-riv-card-ink-soft',
  altLink: 'inline-flex items-center font-bold text-riv-accent-ink',
} as const;

const RESEND_NOTICES = {
  sent: 'Verification email sent. Check your inbox.',
  withheld:
    "We couldn't send it — we're not able to email this address at the moment. Your account still works as normal; your email just stays unverified.",
  error: 'Could not send the email. Please try again.',
} as const;

/**
 * The signed-in customer's account page: set or change a password, and see/resend email
 * verification. An account created via Google/Apple SSO (no local password)
 * sets its first password here (leaving the current-password field blank), while an account that already
 * has one must supply the correct current password. The verification nudge + resend live here too, so the
 * whole self-service account surface is one page rather than an app-wide banner.
 *
 * The resend has three outcomes, not two (`RESEND_NOTICES`). `withheld` means the request
 * succeeded but the address is on the do-not-email list, so no message will ever leave — claiming
 * "sent" there is the lie this outcome exists to avoid. Two constraints shape that wording, both
 * of them "don't replace one false statement with another":
 *
 * 1. **Reason-neutral.** The response carries no suppression reason, and only one of the three
 *    (`HARD_BOUNCE`) is a delivery failure — copy blaming bounces would lie to a customer who marked
 *    our mail as spam (`COMPLAINT`) or was suppressed by an ops decision (`MANUAL`).
 * 2. **No action the product cannot honour.** The customer cannot lift a suppression themselves
 *    (reinstatement is ADMIN-gated) and the app ships no contact surface, so "get in touch" would point
 *    at nothing. It says what is true instead: verification here is soft/non-blocking, so nothing the
 *    customer came to do is blocked.
 */
@Component({
  selector: 'app-set-password',
  imports: [FormField, RouterLink, CardGlass, LoadAnnouncer, BusyAction, TouchTarget],
  template: `
    <section
      class="flex min-h-[60vh] items-center justify-center px-5 py-8"
      aria-labelledby="setpw-title"
    >
      <div [class]="cls.card" appCardGlass>
        <h1 id="setpw-title" [class]="cls.title">Your account</h1>

        <!-- Above the @if on purpose: a live region must outlive the branch it describes (#741). -->
        <app-load-announcer
          [loading]="auth.restoring()"
          [ready]="!erased() && !auth.restoring() && auth.signedIn()"
          loadingLabel="Loading…"
          readyLabel="Account loaded."
        />

        @if (erased()) {
          <p [class]="cls.intro" role="status" tabindex="-1" data-testid="erase-done">
            Your account and personal data have been erased, and you have been signed out. Any
            booking records are kept only as long as the law requires, with your personal details
            removed.
          </p>
        } @else if (auth.restoring()) {
          <!-- Visible copy only; the announcer above owns the announcement (#741). -->
          <p [class]="cls.intro" aria-hidden="true" data-testid="setpw-loading">Loading…</p>
        } @else if (!auth.signedIn() && auth.restoreFailed()) {
          <!-- A failed restore is not "signed out" — needed its own branch, not an attribute (#745). -->
          <p [class]="cls.error" role="alert" data-testid="setpw-restore-failed">
            We couldn't check whether you're signed in. Refresh the page and try again.
          </p>
        } @else if (!auth.signedIn()) {
          <p [class]="cls.intro" data-testid="setpw-signed-out">Sign in to manage your account.</p>
          <p [class]="cls.alt">
            <a
              appTouchTarget
              [class]="cls.altLink"
              routerLink="/account/sign-in"
              data-testid="setpw-to-signin"
              >Sign in</a
            >
          </p>
        } @else {
          <p [class]="cls.intro" data-testid="setpw-email">Signed in as {{ auth.email() }}.</p>

          @if (auth.emailVerified() === false) {
            <p [class]="cls.hint" data-testid="setpw-unverified">
              Your email isn't verified yet.
              <button
                appTouchTarget
                type="button"
                class="border-0 bg-transparent p-0 underline [cursor:pointer] [font:inherit] text-[inherit] aria-disabled:opacity-60"
                data-testid="setpw-resend"
                (click)="resend()"
                [appBusy]="resending()"
              >
                Resend verification email
              </button>
            </p>
          } @else if (auth.emailVerified() === true) {
            <p [class]="cls.hint" data-testid="setpw-verified">Your email is verified.</p>
          }

          @if (notice(); as msg) {
            <p [class]="cls.intro" role="status" data-testid="setpw-notice">{{ msg }}</p>
          }

          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label [class]="cls.field">
              <span [class]="cls.label">Current password</span>
              <input
                appTouchTarget
                [class]="cls.input"
                type="password"
                data-testid="setpw-current"
                [formField]="setForm.currentPassword"
                autocomplete="current-password"
                aria-describedby="setpw-current-hint"
              />
            </label>
            <p id="setpw-current-hint" [class]="cls.hint">
              Leave blank if you signed in with Google or Apple and haven't set a password yet.
            </p>

            <label [class]="cls.field">
              <span [class]="cls.label">New password</span>
              <input
                appTouchTarget
                [class]="cls.input"
                type="password"
                data-testid="setpw-new"
                [formField]="setForm.newPassword"
                autocomplete="new-password"
                aria-describedby="setpw-new-hint"
              />
            </label>
            <p id="setpw-new-hint" [class]="cls.hint">8–72 characters.</p>

            @if (error(); as msg) {
              <p [class]="cls.error" role="alert" data-testid="setpw-error">{{ msg }}</p>
            }

            <button
              appTouchTarget
              type="submit"
              [class]="cls.submit"
              data-testid="setpw-submit"
              [appBusy]="submitting()"
            >
              {{ submitting() ? 'Saving…' : 'Save password' }}
            </button>
          </form>

          <section class="mt-7 border-t border-riv-field-border pt-5" aria-labelledby="erase-title">
            <h2 id="erase-title" class="m-0 mb-1 text-[15px] font-bold text-riv-card-ink">
              Delete your account
            </h2>
            <p [class]="cls.hint">
              Permanently erase your account and personal details. Booking records are kept only as
              long as the law requires, with your personal data removed. This cannot be undone.
            </p>

            @if (confirming()) {
              <p [class]="cls.error" role="alert" data-testid="erase-warning">
                Erase your account and personal data? This cannot be undone.
              </p>
              <button
                appTouchTarget
                type="button"
                [class]="cls.submit"
                data-testid="erase-confirm"
                [appBusy]="erasing()"
                (click)="erase()"
              >
                {{ erasing() ? 'Erasing…' : 'Yes, erase everything' }}
              </button>
              <button
                appTouchTarget
                type="button"
                class="mt-3 w-full border-0 bg-transparent p-0 underline [cursor:pointer] [font:inherit] text-riv-card-ink-soft aria-disabled:opacity-60"
                data-testid="erase-cancel"
                [appBusy]="erasing()"
                (click)="keepAccount()"
              >
                Cancel
              </button>
            } @else {
              <button
                appTouchTarget
                type="button"
                class="mt-2 w-full rounded-[16px] border border-riv-field-border bg-transparent px-[13px] py-[13px] text-[15px] font-bold text-riv-card-ink [cursor:pointer] [transition:background_0.15s_ease] hover:bg-riv-field-fill"
                data-testid="erase-account"
                (click)="askToErase()"
              >
                Erase my account &amp; data
              </button>
            }

            @if (eraseError(); as msg) {
              <p [class]="cls.error" role="alert" data-testid="erase-error">{{ msg }}</p>
            }
          </section>
        }
      </div>
    </section>
  `,
})
export class SetPassword {
  protected readonly auth = inject(CustomerAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusAfterRender = focusMover();

  protected readonly cls = CLS;
  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly notice = signal<string | undefined>(undefined);

  /** Right-to-erasure UI state: the two-step confirm, the in-flight flag, and the done screen. */
  protected readonly confirming = signal(false);
  protected readonly erasing = signal(false);
  protected readonly erased = signal(false);
  protected readonly eraseError = signal<string | undefined>(undefined);

  protected readonly model = signal({ newPassword: '', currentPassword: '' });
  protected readonly setForm = form(this.model);

  constructor() {
    afterNextRender({
      earlyRead: () => this.hostRef.nativeElement.querySelector('input'),
      write: (first) => first?.focus(),
    });
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const { newPassword, currentPassword } = this.model();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      this.error.set(PASSWORD_LENGTH_MESSAGE);
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    this.notice.set(undefined);
    // Send the current password exactly as typed — passwords may contain leading/trailing spaces, so
    // trimming would make an account with such a password unable to verify its current one (review fix).
    // Only an empty field means "no current password" (an SSO-only account setting its first).
    const result = await this.auth.setPassword(newPassword, currentPassword || undefined);
    this.submitting.set(false);
    switch (result) {
      case 'set':
        this.notice.set('Your password has been saved.');
        this.model.set({ newPassword: '', currentPassword: '' });
        break;
      case 'missing-current':
        this.error.set(CURRENT_PASSWORD_REQUIRED_MESSAGE);
        break;
      case 'invalid-current':
        this.error.set('The current password is incorrect.');
        break;
      case 'invalid-password':
        this.error.set(PASSWORD_LENGTH_MESSAGE);
        break;
      case 'rate-limited':
        this.error.set('Too many attempts. Please wait a minute and try again.');
        break;
      case 'error':
        this.error.set('Something went wrong. Please try again.');
        break;
    }
  }

  /**
   * Arm the erase confirmation, or back out of it, moving focus with the surface. Each transition
   * destroys the element that was just activated, which strands keyboard/AT focus on `<body>` unless
   * it is moved deliberately (WCAG 2.4.3). A completed erasure has no trigger left to return to, so
   * focus parks on the terminal notice that replaces the whole panel.
   */
  protected askToErase(): void {
    this.confirming.set(true);
    this.focusAfterRender('erase-confirm');
  }

  protected keepAccount(): void {
    this.confirming.set(false);
    this.focusAfterRender('erase-account');
  }

  protected async erase(): Promise<void> {
    if (this.erasing()) {
      return;
    }
    this.erasing.set(true);
    this.eraseError.set(undefined);
    const result = await this.auth.eraseAccount();
    this.erasing.set(false);
    if (result === 'erased') {
      this.confirming.set(false);
      this.erased.set(true);
      this.focusAfterRender('erase-done');
    } else {
      // The failure leaves the prompt armed and focus already on it, so nothing is moved here.
      this.eraseError.set('Something went wrong. Please try again.');
    }
  }

  protected async resend(): Promise<void> {
    if (this.resending()) {
      return;
    }
    this.resending.set(true);
    const result = await this.auth.requestVerification();
    this.resending.set(false);
    this.notice.set(RESEND_NOTICES[result]);
  }
}
