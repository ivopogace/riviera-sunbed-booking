import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  CURRENT_PASSWORD_REQUIRED_MESSAGE,
  CustomerAuth,
  MIN_PASSWORD_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';

/**
 * The signed-in customer's account page (S8 #113): set or change a password, and see/resend email
 * verification. This closes the S4 F-1 gap — an account created via Google/Apple SSO (no local password)
 * sets its first password here (leaving the current-password field blank), while an account that already
 * has one must supply the correct current password. The verification nudge + resend live here too, so the
 * whole self-service account surface is one page rather than an app-wide banner.
 */
@Component({
  selector: 'app-set-password',
  imports: [FormField, RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="setpw-title">
      <div class="auth-card" appCardGlass>
        <h1 id="setpw-title" class="auth-title">Your account</h1>

        @if (erased()) {
          <p class="auth-intro" role="status" data-testid="erase-done">
            Your account and personal data have been erased, and you have been signed out. Any booking
            records are kept only as long as the law requires, with your personal details removed.
          </p>
        } @else if (auth.restoring()) {
          <p class="auth-intro" role="status">Loading…</p>
        } @else if (!auth.signedIn()) {
          <p class="auth-intro" data-testid="setpw-signed-out">Sign in to manage your account.</p>
          <p class="auth-alt">
            <a routerLink="/account/sign-in" data-testid="setpw-to-signin">Sign in</a>
          </p>
        } @else {
          <p class="auth-intro" data-testid="setpw-email">Signed in as {{ auth.email() }}.</p>

          @if (auth.emailVerified() === false) {
            <p class="auth-hint" data-testid="setpw-unverified">
              Your email isn't verified yet.
              <button
                type="button"
                class="border-0 bg-transparent p-0 underline [cursor:pointer] [font:inherit] text-[inherit] disabled:opacity-60"
                data-testid="setpw-resend"
                (click)="resend()"
                [disabled]="resending()"
              >
                Resend verification email
              </button>
            </p>
          } @else if (auth.emailVerified() === true) {
            <p class="auth-hint" data-testid="setpw-verified">Your email is verified.</p>
          }

          @if (notice(); as msg) {
            <p class="auth-intro" role="status" data-testid="setpw-notice">{{ msg }}</p>
          }

          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label class="auth-field">
              <span class="auth-label">Current password</span>
              <input
                type="password"
                data-testid="setpw-current"
                [formField]="setForm.currentPassword"
                autocomplete="current-password"
                aria-describedby="setpw-current-hint"
              />
            </label>
            <p id="setpw-current-hint" class="auth-hint">
              Leave blank if you signed in with Google or Apple and haven't set a password yet.
            </p>

            <label class="auth-field">
              <span class="auth-label">New password</span>
              <input
                type="password"
                data-testid="setpw-new"
                [formField]="setForm.newPassword"
                autocomplete="new-password"
                aria-describedby="setpw-new-hint"
              />
            </label>
            <p id="setpw-new-hint" class="auth-hint">8–72 characters.</p>

            @if (error(); as msg) {
              <p class="auth-error" role="alert" data-testid="setpw-error">{{ msg }}</p>
            }

            <button
              type="submit"
              class="auth-submit"
              data-testid="setpw-submit"
              [disabled]="submitting()"
            >
              {{ submitting() ? 'Saving…' : 'Save password' }}
            </button>
          </form>

          <section
            class="mt-7 border-t border-[color:var(--riv-field-border)] pt-5"
            aria-labelledby="erase-title"
          >
            <h2 id="erase-title" class="m-0 mb-1 text-[15px] font-bold text-[color:var(--riv-card-ink)]">
              Delete your account
            </h2>
            <p class="auth-hint">
              Permanently erase your account and personal details. Booking records are kept only as long
              as the law requires, with your personal data removed. This cannot be undone.
            </p>

            @if (confirming()) {
              <p class="auth-error" role="alert" data-testid="erase-warning">
                Erase your account and personal data? This cannot be undone.
              </p>
              <button
                type="button"
                class="auth-submit"
                data-testid="erase-confirm"
                [disabled]="erasing()"
                (click)="erase()"
              >
                {{ erasing() ? 'Erasing…' : 'Yes, erase everything' }}
              </button>
              <button
                type="button"
                class="mt-3 w-full border-0 bg-transparent p-0 underline [cursor:pointer] [font:inherit] text-[color:var(--riv-card-ink-soft)] disabled:opacity-60"
                data-testid="erase-cancel"
                [disabled]="erasing()"
                (click)="confirming.set(false)"
              >
                Cancel
              </button>
            } @else {
              <button
                type="button"
                class="mt-2 w-full rounded-[16px] border border-[color:var(--riv-field-border)] bg-transparent px-[13px] py-[13px] text-[15px] font-bold text-[color:var(--riv-card-ink)] [cursor:pointer] [transition:background_0.15s_ease] hover:bg-[color:var(--riv-field-fill)]"
                data-testid="erase-account"
                (click)="confirming.set(true)"
              >
                Erase my account &amp; data
              </button>
            }

            @if (eraseError(); as msg) {
              <p class="auth-error" role="alert" data-testid="erase-error">{{ msg }}</p>
            }
          </section>
        }
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class SetPassword {
  protected readonly auth = inject(CustomerAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly resending = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly notice = signal<string | undefined>(undefined);

  /** Right-to-erasure UI state (#101 [D5]): the two-step confirm, the in-flight flag, and the done screen. */
  protected readonly confirming = signal(false);
  protected readonly erasing = signal(false);
  protected readonly erased = signal(false);
  protected readonly eraseError = signal<string | undefined>(undefined);

  protected readonly model = signal({ newPassword: '', currentPassword: '' });
  protected readonly setForm = form(this.model);

  constructor() {
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
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
    } else {
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
    this.notice.set(
      result === 'sent'
        ? 'Verification email sent. Check your inbox.'
        : 'Could not send the email. Please try again.',
    );
  }
}
