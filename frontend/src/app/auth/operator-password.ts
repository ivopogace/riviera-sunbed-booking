import { afterNextRender, Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  MAX_OPERATOR_PASSWORD_BYTES,
  MIN_OPERATOR_PASSWORD_LENGTH,
  OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
  OPERATOR_PASSWORD_LENGTH_MESSAGE,
  OPERATOR_PASSWORD_TOO_LONG_MESSAGE,
  OperatorAuth,
  operatorPasswordByteLength,
  operatorPasswordChangeMessage,
} from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';

/**
 * The signed-in operator's password-change page. Deliberately a **separate** page from the
 * customer's `set-password`, not an audience toggle on it: that page is the customer *account* page and
 * only one of its five blocks concerns passwords — email verification, the SSO "leave blank" affordance
 * and right-to-erasure all fail to apply to an operator (an operator is a business counterparty with
 * payout records, not a data subject). Merging would have wrapped most of it in an audience conditional.
 * What is genuinely shared — `CardGlass`, `auth.scss`, the password-policy constants — is shared.
 *
 * <p>No signed-out branch: `operatorSessionGuard` awaits the session restore and redirects
 * before this component renders. Both fields are always required — operators have no SSO, so there is no
 * password-less account that could set a first password here.
 */
@Component({
  selector: 'app-operator-password',
  imports: [FormField, RouterLink, CardGlass, BusyAction],
  template: `
    <section class="auth-wrap" aria-labelledby="oppw-title">
      <div class="auth-card" appCardGlass>
        <h1 id="oppw-title" class="auth-title">Change your password</h1>
        <p class="auth-intro" data-testid="oppw-username">Signed in as {{ auth.username() }}.</p>

        <!-- Present but empty: a live region inserted together with its text is often not announced. -->
        <p class="auth-intro auth-live" role="status" tabindex="-1" data-testid="oppw-notice">
          {{ notice() }}
        </p>

        <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
          <label class="auth-field">
            <span class="auth-label">Current password</span>
            <input
              type="password"
              data-testid="oppw-current"
              [formField]="changeForm.currentPassword"
              autocomplete="current-password"
            />
          </label>

          <label class="auth-field">
            <span class="auth-label">New password</span>
            <input
              type="password"
              data-testid="oppw-new"
              [formField]="changeForm.newPassword"
              autocomplete="new-password"
              aria-describedby="oppw-new-hint"
            />
          </label>
          <p id="oppw-new-hint" class="auth-hint">
            8–72 characters. Changing it signs you out on every other device.
          </p>

          <p class="auth-error auth-live" role="alert" tabindex="-1" data-testid="oppw-error">
            {{ error() }}
          </p>

          <button
            type="submit"
            class="auth-submit"
            data-testid="oppw-submit"
            [appBusy]="submitting()"
          >
            {{ submitting() ? 'Saving…' : 'Change password' }}
          </button>
        </form>

        <p class="auth-alt">
          <a routerLink="/operator" data-testid="oppw-to-console">Back to your console</a>
        </p>
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
  // The shell paints .riv-bg behind this page (operator chrome); no self-painted background needed.
  styles: `
    :host {
      display: block;
      min-height: 100%;
    }
    .auth-live:empty {
      margin: 0;
    }
  `,
})
export class OperatorPassword {
  protected readonly auth = inject(OperatorAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly notice = signal<string | undefined>(undefined);

  protected readonly model = signal({ currentPassword: '', newPassword: '' });
  protected readonly changeForm = form(this.model);

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
    // Cleared up front, not per-branch: an early return used to leave the previous success notice on
    // screen beside a fresh error, so the operator saw "your password has been changed" next to a failure.
    this.error.set(undefined);
    this.notice.set(undefined);
    const { currentPassword, newPassword } = this.model();
    // Kept though the server now names this case too: an attempt still costs a rate-limit token.
    if (currentPassword.length === 0) {
      this.fail(OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE);
      return;
    }
    if (newPassword.length < MIN_OPERATOR_PASSWORD_LENGTH) {
      this.fail(OPERATOR_PASSWORD_LENGTH_MESSAGE);
      return;
    }
    // Bytes, not characters — the server's cap is bcrypt's 72-byte input limit, so an accented or
    // emoji-bearing passphrase can be well under 72 characters and still be rejected.
    if (operatorPasswordByteLength(newPassword) > MAX_OPERATOR_PASSWORD_BYTES) {
      this.fail(OPERATOR_PASSWORD_TOO_LONG_MESSAGE);
      return;
    }
    this.submitting.set(true);
    // Sent exactly as typed — a password may carry leading/trailing spaces, so trimming would make an
    // account with such a password unable to prove its current one.
    const result = await this.auth.changePassword(currentPassword, newPassword);
    this.submitting.set(false);
    const message = operatorPasswordChangeMessage(result);
    if (result === 'session-lost') {
      this.auth.sessionLost();
    }
    if (result === 'changed') {
      this.notice.set(message);
      this.model.set({ currentPassword: '', newPassword: '' });
      this.revealOutcome();
    } else {
      this.fail(message);
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.revealOutcome();
  }

  /**
   * Bring the outcome into view and focus it. The notice renders above the form while the error renders
   * below it, so on a phone a success message lands off-screen and is indistinguishable from the form
   * merely emptying itself — the one thing this page exists to communicate, silently missed.
   */
  private revealOutcome(): void {
    // afterNextRender, not queueMicrotask: it is bound to this component's injector, so a pending
    // callback cannot outlive the component and move focus somewhere else later.
    afterNextRender(
      {
        earlyRead: () =>
          this.hostRef.nativeElement.querySelector<HTMLElement>(
            '[data-testid="oppw-notice"]:not(:empty), [data-testid="oppw-error"]:not(:empty)',
          ),
        write: (outcome) => {
          // Optional-called: jsdom implements neither, and neither is worth failing a submit over.
          outcome?.scrollIntoView?.({ block: 'nearest' });
          outcome?.focus?.({ preventScroll: true });
        },
      },
      { injector: this.injector },
    );
  }
}
