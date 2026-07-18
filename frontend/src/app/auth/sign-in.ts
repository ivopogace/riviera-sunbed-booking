import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { CustomerAuth, customerSignInMessage } from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';
import { SsoButtons } from './sso-buttons';

/**
 * Customer sign-in page (epic #108 / S2 #111, design D-1/D-8). A tourist enters email + password; on
 * success the backend establishes the session cookie (via {@link CustomerAuth}) and we land on the
 * home discover page. A failed sign-in shows one generic message (the backend never says why — D-8).
 * Guest checkout is unaffected: an account is optional. Signal Forms drives the two fields; the server
 * is the authority on credentials, so the client only gates on non-empty (no brittle format checks).
 */
@Component({
  selector: 'app-sign-in',
  imports: [FormField, RouterLink, CardGlass, SsoButtons],
  template: `
    <section class="auth-wrap" aria-labelledby="signin-title">
      <div class="auth-card" appCardGlass>
        <h1 id="signin-title" class="auth-title">Sign in</h1>
        <p id="signin-intro" class="auth-intro">
          Sign in to keep your bookings together across devices. Booking as a guest still works without
          an account.
        </p>

        <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
          <label class="auth-field">
            <span class="auth-label">Email</span>
            <input
              type="email"
              data-testid="signin-email"
              [formField]="signInForm.email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              aria-describedby="signin-intro"
            />
          </label>

          <label class="auth-field">
            <span class="auth-label">Password</span>
            <input
              type="password"
              data-testid="signin-password"
              [formField]="signInForm.password"
              autocomplete="current-password"
            />
          </label>

          @if (error(); as msg) {
            <p class="auth-error" role="alert" data-testid="signin-error">{{ msg }}</p>
          }

          <button
            type="submit"
            class="auth-submit"
            data-testid="signin-submit"
            [disabled]="submitting()"
          >
            {{ submitting() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <app-sso-buttons />

        <p class="auth-alt">
          <a routerLink="/account/forgot" data-testid="signin-to-forgot">Forgot your password?</a>
        </p>
        <p class="auth-alt">
          New here?
          <a routerLink="/account/register" data-testid="signin-to-register">Create an account</a>
        </p>
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class SignIn {
  private readonly auth = inject(CustomerAuth);
  private readonly router = inject(Router);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ email: '', password: '' });
  // form() drives the two-way [formField] binding; validity is gated in onSubmit + shown via the one
  // `error` alert (the find-booking pattern), so no per-field validator schema here.
  protected readonly signInForm = form(this.model);

  constructor() {
    // Move focus into the first field on load (form a11y).
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const email = this.model().email.trim();
    const password = this.model().password;
    if (!email || !password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.signIn(email, password);
    this.submitting.set(false);
    if (result === 'signed-in') {
      await this.router.navigate(['/']);
    } else {
      this.error.set(customerSignInMessage(result));
    }
  }
}
