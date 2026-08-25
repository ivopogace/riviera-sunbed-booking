import { afterNextRender, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { CardGlass } from '../shared/card-glass';

import { TouchTarget } from '../shared/touch-target';

type VerifyState = 'verifying' | 'verified' | 'invalid' | 'error';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[30px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[24px] font-bold tracking-[-0.02em] text-riv-card-ink',
  intro: 'm-0 mb-5 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  error: 'mt-3 text-[13px] font-semibold text-riv-error-ink',
  alt: 'mt-4.5 text-center text-[13.5px] text-riv-card-ink-soft',
  altLink: 'inline-flex items-center font-bold text-riv-accent-ink',
} as const;

/**
 * Email-verification landing page. Reached from the emailed link `/account/verify?token=…`.
 * The verification itself is a POST the page issues on load — the emailed link is a plain GET to the SPA,
 * so an email scanner prefetching it (a GET, no JS) never consumes the single-use token. Verifying
 * is soft: it only flips the account's verified flag, so an unverified account was fully usable already.
 */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, CardGlass, TouchTarget],
  template: `
    <section
      class="flex min-h-[60vh] items-center justify-center px-5 py-8"
      aria-labelledby="verify-title"
    >
      <div [class]="cls.card" appCardGlass>
        <h1 id="verify-title" [class]="cls.title">Verify your email</h1>

        @switch (state()) {
          @case ('verifying') {
            <p [class]="cls.intro" role="status" data-testid="verify-pending">
              Verifying your email…
            </p>
          }
          @case ('verified') {
            <p [class]="cls.intro" role="status" data-testid="verify-success">
              Your email is verified. Thanks!
            </p>
            <p [class]="cls.alt">
              <a appTouchTarget [class]="cls.altLink" routerLink="/" data-testid="verify-to-home"
                >Continue</a
              >
            </p>
          }
          @case ('error') {
            <p [class]="cls.error" role="alert" data-testid="verify-error">
              Something went wrong verifying your email. Please try again.
            </p>
            <p [class]="cls.alt">
              <a
                appTouchTarget
                [class]="cls.altLink"
                routerLink="/account/sign-in"
                data-testid="verify-to-signin"
                >Sign in</a
              >
            </p>
          }
          @default {
            <p [class]="cls.error" role="alert" data-testid="verify-failed">
              This verification link is invalid or has expired. Sign in and request a new one.
            </p>
            <p [class]="cls.alt">
              <a
                appTouchTarget
                [class]="cls.altLink"
                routerLink="/account/sign-in"
                data-testid="verify-to-signin"
                >Sign in</a
              >
            </p>
          }
        }
      </div>
    </section>
  `,
})
export class VerifyEmail {
  private readonly auth = inject(CustomerAuth);
  private readonly route = inject(ActivatedRoute);

  protected readonly cls = CLS;
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
