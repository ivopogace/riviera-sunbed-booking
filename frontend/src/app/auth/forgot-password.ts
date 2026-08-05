import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';

/**
 * "Forgot password" request page (S8 #113, design D-8). A tourist enters their email and we ask the
 * backend to send a reset link. The confirmation is deliberately uniform — it never reveals whether the
 * email has an account (non-enumeration) — so a successful request always shows the same "if an account
 * exists…" message. Signal Forms drives the one field; the server is the authority.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="forgot-title">
      <div class="auth-card" appCardGlass>
        <h1 id="forgot-title" class="auth-title">Reset your password</h1>

        @if (sent()) {
          <p class="auth-intro" role="status" data-testid="forgot-sent">
            If an account exists for that email, we've sent a link to set a new password. Check your inbox.
          </p>
          <p class="auth-alt">
            <a routerLink="/account/sign-in" data-testid="forgot-to-signin">Back to sign in</a>
          </p>
        } @else {
          <p id="forgot-intro" class="auth-intro">
            Enter your email and we'll send you a link to set a new password.
          </p>

          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label class="auth-field">
              <span class="auth-label">Email</span>
              <input
                type="email"
                data-testid="forgot-email"
                [formField]="forgotForm.email"
                autocomplete="email"
                autocapitalize="off"
                spellcheck="false"
                aria-describedby="forgot-intro"
              />
            </label>

            @if (error(); as msg) {
              <p class="auth-error" role="alert" data-testid="forgot-error">{{ msg }}</p>
            }

            <button
              type="submit"
              class="auth-submit"
              data-testid="forgot-submit"
              [disabled]="submitting()"
            >
              {{ submitting() ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>

          <p class="auth-alt">
            Remembered it?
            <a routerLink="/account/sign-in" data-testid="forgot-to-signin">Sign in</a>
          </p>
        }
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class ForgotPassword {
  private readonly auth = inject(CustomerAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ email: '' });
  protected readonly forgotForm = form(this.model);

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
    const email = this.model().email.trim();
    if (!email) {
      this.error.set('Enter your email.');
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.forgotPassword(email);
    this.submitting.set(false);
    if (result === 'sent') {
      this.sent.set(true);
    } else if (result === 'rate-limited') {
      this.error.set('Too many attempts. Please wait a minute and try again.');
    } else {
      this.error.set('Something went wrong. Please try again.');
    }
  }
}
