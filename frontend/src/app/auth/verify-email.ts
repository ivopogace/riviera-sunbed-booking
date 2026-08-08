import { afterNextRender, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';

type VerifyState = 'verifying' | 'verified' | 'invalid' | 'error';

/**
 * Email-verification landing page. Reached from the emailed link `/account/verify?token=…`.
 * The verification itself is a POST the page issues on load — the emailed link is a plain GET to the SPA,
 * so an email scanner prefetching it (a GET, no JS) never consumes the single-use token. Verifying
 * is soft: it only flips the account's verified flag, so an unverified account was fully usable already.
 */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, CardGlass],
  template: `
    <section class="auth-wrap" aria-labelledby="verify-title">
      <div class="auth-card" appCardGlass>
        <h1 id="verify-title" class="auth-title">Verify your email</h1>

        @switch (state()) {
          @case ('verifying') {
            <p class="auth-intro" role="status" data-testid="verify-pending">Verifying your email…</p>
          }
          @case ('verified') {
            <p class="auth-intro" role="status" data-testid="verify-success">
              Your email is verified. Thanks!
            </p>
            <p class="auth-alt">
              <a routerLink="/" data-testid="verify-to-home">Continue</a>
            </p>
          }
          @case ('error') {
            <p class="auth-error" role="alert" data-testid="verify-error">
              Something went wrong verifying your email. Please try again.
            </p>
            <p class="auth-alt">
              <a routerLink="/account/sign-in" data-testid="verify-to-signin">Sign in</a>
            </p>
          }
          @default {
            <p class="auth-error" role="alert" data-testid="verify-failed">
              This verification link is invalid or has expired. Sign in and request a new one.
            </p>
            <p class="auth-alt">
              <a routerLink="/account/sign-in" data-testid="verify-to-signin">Sign in</a>
            </p>
          }
        }
      </div>
    </section>
  `,
  styleUrl: './auth.scss',
})
export class VerifyEmail {
  private readonly auth = inject(CustomerAuth);
  private readonly route = inject(ActivatedRoute);

  protected readonly state = signal<VerifyState>('verifying');

  constructor() {
    // No DOM access, so no render phase applies — this is POST-on-load, browser-only (scanner-safe).
    afterNextRender(() => void this.verify());
  }

  private async verify(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('invalid');
      return;
    }
    // Wait for the startup /me restore so the CSRF cookie is bootstrapped before this CSRF-protected POST —
    // otherwise a cold-browser load could race it to a 403 and show a valid token as invalid (review fix).
    await this.auth.whenReady();
    const result = await this.auth.verifyEmail(token);
    if (result === 'verified') {
      this.state.set('verified');
    } else if (result === 'invalid-token') {
      this.state.set('invalid');
    } else {
      this.state.set('error');
    }
  }
}
