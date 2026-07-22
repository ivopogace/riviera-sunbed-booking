import { Component, inject, input } from '@angular/core';

import { CustomerAuth } from '../core/customer-auth';
import { SsoProviderId } from '../core/sso-redirect';

/**
 * Shared "Continue with Google / Continue with Apple" affordance (S4 #112) for the sign-in and register
 * cards — one place so the SSO buttons never drift between the two pages, and adding a provider is a
 * one-row change. Starting SSO is a full-page navigation to the backend authorize endpoint (via
 * {@link CustomerAuth.startSso}); the buttons are secondary — they reuse the AA-proven field tokens
 * (`--riv-field-*`, `--riv-card-ink`), so they read as alternatives to the primary CTA. Tailwind v4 (the
 * styling go-forward); the buttons are keyed by `data-testid` for the e2e.
 */
@Component({
  selector: 'app-sso-buttons',
  template: `
    @if (audience() === 'tourist') {
      <div class="mt-5 mb-3.5 flex items-center gap-3 text-[12px] text-(--riv-card-ink-soft)">
        <span class="h-px flex-1 bg-(--riv-field-border)"></span>
        <span>or</span>
        <span class="h-px flex-1 bg-(--riv-field-border)"></span>
      </div>

      <div class="flex flex-col gap-2.5" role="group" aria-label="Continue with a provider">
        @for (provider of providers; track provider.id) {
        <button
          type="button"
          [attr.data-testid]="provider.testId"
          class="w-full cursor-pointer rounded-[14px] border border-(--riv-field-border) bg-(--riv-field-fill) px-3 py-3 text-[14px] font-semibold text-(--riv-card-ink) transition hover:brightness-[0.97] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-[color:var(--riv-accent-ink)]"
          (click)="continueWith(provider.id)"
          >
            {{ provider.label }}
          </button>
        }
      </div>
    }
  `,
})
export class SsoButtons {
  /**
   * Which audience the host card is showing. SSO is **tourist-only** today: the operator IdP flows
   * are #276, and the real Google/Apple adapters are S5 (#116). Rendering nothing (rather than
   * disabled buttons) for `operator` keeps the card honest; #276 lights this up additively.
   */
  readonly audience = input<'tourist' | 'operator'>('tourist');

  private readonly auth = inject(CustomerAuth);

  protected readonly providers: readonly { id: SsoProviderId; label: string; testId: string }[] = [
    { id: 'google', label: 'Continue with Google', testId: 'sso-google' },
    { id: 'apple', label: 'Continue with Apple', testId: 'sso-apple' },
  ];

  protected continueWith(provider: SsoProviderId): void {
    this.auth.startSso(provider);
  }
}
