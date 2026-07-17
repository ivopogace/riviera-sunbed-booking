import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { CustomerAuth, customerRegisterMessage } from '../core/customer-auth';
import { SsoProviderId } from '../core/sso-redirect';
import { CardGlass } from '../shared/card-glass';

/** Client-side minimum, mirrored on the server (bcrypt-capped there). Named, not a magic literal. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Customer registration page (epic #108 / S2 #111, design D-1/D-8). A tourist creates an account with
 * email + password and is signed in on success. An already-registered email is reported neutrally
 * (the backend returns an identical response with no session — {@link CustomerAuth} resolves it to
 * `exists`), pointing the user at sign-in. Guest checkout is unaffected. The password minimum is
 * enforced client-side for a friendly message AND server-side as the authority.
 */
@Component({
  selector: 'app-register',
  imports: [FormField, RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="register-title">
      <div class="auth-card" appCardGlass>
        <h1 id="register-title" class="auth-title">Create your account</h1>
        <p id="register-intro" class="auth-intro">
          An account keeps your bookings together across devices. Guest checkout still works without
          one.
        </p>

        <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
          <label class="auth-field">
            <span class="auth-label">Email</span>
            <input
              type="email"
              data-testid="register-email"
              [formField]="registerForm.email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              aria-describedby="register-intro"
            />
          </label>

          <label class="auth-field">
            <span class="auth-label">Password</span>
            <input
              type="password"
              data-testid="register-password"
              [formField]="registerForm.password"
              autocomplete="new-password"
              aria-describedby="register-hint"
            />
          </label>
          <p id="register-hint" class="auth-hint">8–72 characters.</p>

          @if (error(); as msg) {
            <p class="auth-error" role="alert" data-testid="register-error">{{ msg }}</p>
          }

          <button
            type="submit"
            class="auth-submit"
            data-testid="register-submit"
            [disabled]="submitting()"
          >
            {{ submitting() ? 'Creating…' : 'Create account' }}
          </button>
        </form>

        <div class="auth-divider"><span>or</span></div>

        <div class="auth-sso" role="group" aria-label="Continue with a provider">
          <button
            type="button"
            class="auth-sso-btn"
            data-testid="sso-google"
            (click)="continueWith('google')"
          >
            Continue with Google
          </button>
          <button
            type="button"
            class="auth-sso-btn"
            data-testid="sso-apple"
            (click)="continueWith('apple')"
          >
            Continue with Apple
          </button>
        </div>

        <p class="auth-alt">
          Already have an account?
          <a routerLink="/account/sign-in" data-testid="register-to-signin">Sign in</a>
        </p>
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class Register {
  private readonly auth = inject(CustomerAuth);
  private readonly router = inject(Router);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ email: '', password: '' });
  // form() drives the two-way [formField] binding; validity is gated in onSubmit + shown via the one
  // `error` alert (the find-booking pattern), so no per-field validator schema here.
  protected readonly registerForm = form(this.model);

  constructor() {
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
  }

  /** Start SSO sign-in/registration (S4 #112) — a full-page navigation to the backend authorize endpoint. */
  protected continueWith(provider: SsoProviderId): void {
    this.auth.startSso(provider);
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
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.error.set('Choose a password of 8–72 characters.');
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.register(email, password);
    this.submitting.set(false);
    if (result === 'registered') {
      await this.router.navigate(['/']);
    } else {
      this.error.set(customerRegisterMessage(result));
    }
  }
}
