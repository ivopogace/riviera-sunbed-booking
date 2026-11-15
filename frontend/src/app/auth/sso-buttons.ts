import { Component, inject, input } from '@angular/core';

import { CustomerAuth, SsoProviderId } from '../core/customer-auth';
import { OperatorAuth } from '../core/operator-auth';

import { TouchTarget } from '../shared/touch-target';

/**
 * Shared "Continue with Google / Continue with Apple" affordance for both audiences of the auth card, so the
 * buttons never drift and a provider is a one-row change. Starting SSO is a full-page navigation to the
 * audience's own authorize endpoint ({@link CustomerAuth.startSso} or {@link OperatorAuth.startSso}); an
 * operator signs in only with an identity it linked from the console (#276). The buttons are secondary, on
 * the AA-proven field tokens; keyed by `data-testid` for the e2e.
 */
@Component({
  imports: [TouchTarget],
  selector: 'app-sso-buttons',
  template: `
    <div class="mt-5 mb-3.5 flex items-center gap-3 text-[12px] text-riv-card-ink-soft">
      <span class="h-px flex-1 bg-riv-field-border"></span>
      <span i18n="Divider between the sign-in form and the provider buttons">or</span>
      <span class="h-px flex-1 bg-riv-field-border"></span>
    </div>

    <div
      class="flex flex-col gap-2.5"
      role="group"
      aria-label="Continue with a provider"
      i18n-aria-label
    >
      @for (provider of providers; track provider.id) {
        <button
          appTouchTarget
          type="button"
          [attr.data-testid]="provider.testId"
          class="w-full cursor-pointer rounded-[14px] border border-riv-field-border bg-riv-field-fill px-3 py-3 text-[14px] font-semibold text-riv-card-ink transition hover:brightness-[0.97] motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink"
          (click)="continueWith(provider.id)"
        >
          {{ provider.label }}
        </button>
      }
    </div>
  `,
})
export class SsoButtons {
  /** Which audience the host card is showing; picks the authorize endpoint, never a shared one. */
  readonly audience = input<'tourist' | 'operator'>('tourist');

  private readonly customerAuth = inject(CustomerAuth);
  private readonly operatorAuth = inject(OperatorAuth);

  protected readonly providers: readonly { id: SsoProviderId; label: string; testId: string }[] = [
    { id: 'google', label: $localize`Continue with Google`, testId: 'sso-google' },
    { id: 'apple', label: $localize`Continue with Apple`, testId: 'sso-apple' },
  ];

  protected continueWith(provider: SsoProviderId): void {
    if (this.audience() === 'operator') {
      this.operatorAuth.startSso(provider);
    } else {
      this.customerAuth.startSso(provider);
    }
  }
}
