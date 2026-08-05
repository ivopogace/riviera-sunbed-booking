import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CustomerAuth, MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE } from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';

/**
 * Password-reset page (S8 #113). Reached from the emailed link `/account/reset?token=…`; the token is
 * the bearer credential (invariant #7). The tourist sets a new password (confirmed) and, on success, the
 * backend rotates it and invalidates any existing sessions (AC-3), so they sign in fresh. A bad/expired
 * token or missing token is a clear dead-end that points back at requesting a new link.
 */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="reset-title">
      <div class="auth-card" appCardGlass>
        <h1 id="reset-title" class="auth-title">Set a new password</h1>

        @if (done()) {
          <p class="auth-intro" role="status" data-testid="reset-done">
            Your password has been updated. You can sign in with it now.
          </p>
          <p class="auth-alt">
            <a routerLink="/account/sign-in" data-testid="reset-to-signin">Sign in</a>
          </p>
        } @else if (!token) {
          <p class="auth-error" role="alert" data-testid="reset-no-token">
            This reset link is invalid or incomplete. Request a new one.
          </p>
          <p class="auth-alt">
            <a routerLink="/account/forgot" data-testid="reset-to-forgot">Request a reset link</a>
          </p>
        } @else {
          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label class="auth-field">
              <span class="auth-label">New password</span>
              <input
                type="password"
                data-testid="reset-password"
                [formField]="resetForm.newPassword"
                autocomplete="new-password"
                aria-describedby="reset-hint"
              />
            </label>
            <p id="reset-hint" class="auth-hint">8–72 characters.</p>

            <label class="auth-field">
              <span class="auth-label">Confirm new password</span>
              <input
                type="password"
                data-testid="reset-confirm"
                [formField]="resetForm.confirm"
                autocomplete="new-password"
              />
            </label>

            @if (error(); as msg) {
              <p class="auth-error" role="alert" data-testid="reset-error">{{ msg }}</p>
            }

            <button
              type="submit"
              class="auth-submit"
              data-testid="reset-submit"
              [disabled]="submitting()"
            >
              {{ submitting() ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        }
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class ResetPassword {
  private readonly auth = inject(CustomerAuth);
  private readonly route = inject(ActivatedRoute);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The reset token from the emailed link, read once (a page instance is one link). */
  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ newPassword: '', confirm: '' });
  protected readonly resetForm = form(this.model);

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
    const { newPassword, confirm } = this.model();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      this.error.set(PASSWORD_LENGTH_MESSAGE);
      return;
    }
    if (newPassword !== confirm) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.resetPassword(this.token, newPassword);
    this.submitting.set(false);
    switch (result) {
      case 'reset':
        this.done.set(true);
        break;
      case 'invalid-token':
        this.error.set('This reset link is invalid or has expired. Request a new one.');
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
}
