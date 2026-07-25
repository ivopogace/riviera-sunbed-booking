import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  MIN_OPERATOR_PASSWORD_LENGTH,
  OPERATOR_PASSWORD_LENGTH_MESSAGE,
  OperatorAuth,
  operatorPasswordChangeMessage,
} from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';

/**
 * The signed-in operator's password-change page (#326). Deliberately a **separate** page from the
 * customer's `set-password`, not an audience toggle on it: that page is the customer *account* page and
 * only one of its five blocks concerns passwords — email verification, the SSO "leave blank" affordance
 * and right-to-erasure all fail to apply to an operator (an operator is a business counterparty with
 * payout records, not a data subject). Merging would have wrapped most of it in an audience conditional.
 * What is genuinely shared — `CardGlass`, `auth.scss`, the password-policy constants — is shared.
 *
 * <p>No signed-out branch: `operatorSessionGuard` (S9 #277) awaits the session restore and redirects
 * before this component renders, which is why the console's old per-page "checking your session" cards
 * were removed. Both fields are always required — operators have no SSO (that is #276), so there is no
 * password-less account that could set a first password here.
 */
@Component({
  selector: 'app-operator-password',
  imports: [FormField, RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="oppw-title">
      <div class="auth-card" appCardGlass>
        <h1 id="oppw-title" class="auth-title">Change your password</h1>
        <p class="auth-intro" data-testid="oppw-username">Signed in as {{ auth.username() }}.</p>

        @if (notice(); as msg) {
          <p class="auth-intro" role="status" data-testid="oppw-notice">{{ msg }}</p>
        }

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

          @if (error(); as msg) {
            <p class="auth-error" role="alert" data-testid="oppw-error">{{ msg }}</p>
          }

          <button
            type="submit"
            class="auth-submit"
            data-testid="oppw-submit"
            [disabled]="submitting()"
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
})
export class OperatorPassword {
  protected readonly auth = inject(OperatorAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly notice = signal<string | undefined>(undefined);

  protected readonly model = signal({ currentPassword: '', newPassword: '' });
  protected readonly changeForm = form(this.model);

  constructor() {
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const { currentPassword, newPassword } = this.model();
    if (newPassword.length < MIN_OPERATOR_PASSWORD_LENGTH) {
      this.error.set(OPERATOR_PASSWORD_LENGTH_MESSAGE);
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    this.notice.set(undefined);
    // Sent exactly as typed — a password may carry leading/trailing spaces, so trimming would make an
    // account with such a password unable to prove its current one (the S8 set-password review fix).
    const result = await this.auth.changePassword(currentPassword, newPassword);
    this.submitting.set(false);
    const message = operatorPasswordChangeMessage(result);
    if (result === 'changed') {
      this.notice.set(message);
      this.model.set({ currentPassword: '', newPassword: '' });
    } else {
      this.error.set(message);
    }
  }
}
