import { afterNextRender, Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
  OperatorAuth,
  operatorPasswordChangeMessage,
} from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import {
  PASSWORD_POLICY_HINT,
  passwordPolicyMessage,
  passwordPolicyViolation,
} from '../shared/password-policy';

import { TouchTarget } from '../shared/touch-target';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[30px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[24px] font-bold tracking-[-0.02em] text-riv-card-ink',
  intro: 'm-0 mb-5 block text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  field: 'flex flex-col gap-1.5 mb-3.5',
  label: 'text-[11px] font-bold tracking-[0.08em] uppercase text-riv-card-ink-soft',
  input:
    'font-[inherit] text-[16px] text-riv-card-ink bg-riv-field-fill border border-riv-field-border rounded-[14px] px-[14px] py-3 placeholder:text-riv-card-ink-soft focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  hint: '-mt-1.5 text-[12px] text-riv-card-ink-soft',
  // Always mounted, so it keeps its resting margin while silent: an interpolation defeats `:empty`.
  notice: 'm-0 mb-5 block text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  submitError: 'mt-3 text-[13px] font-semibold text-riv-error-ink',
  submit:
    'mt-4.5 w-full p-[13px] rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
  alt: 'mt-4.5 text-center text-[13.5px] text-riv-card-ink-soft',
  altLink: 'inline-flex items-center font-bold text-riv-accent-ink',
} as const;

/**
 * The signed-in operator's password-change page — a separate page, not an audience toggle on the
 * customer's `set-password`: most of that account page (email verification, SSO, erasure) doesn't
 * apply to an operator, a business counterparty rather than a data subject. The shared parts
 * (`CardGlass`, the auth-card recipe, the password-policy constants) are reused. No signed-out
 * branch: `operatorSessionGuard` redirects first. Both fields are always required — operators have
 * no SSO, so no password-less account can set a first password here.
 */
@Component({
  selector: 'app-operator-password',
  imports: [FormField, RouterLink, CardGlass, BusyAction, TouchTarget],
  template: `
    <section
      class="flex min-h-[60vh] items-center justify-center px-5 py-8"
      aria-labelledby="oppw-title"
    >
      <div [class]="cls.card" appCardGlass>
        <h1 id="oppw-title" [class]="cls.title">Change your password</h1>
        <p [class]="cls.intro" data-testid="oppw-username">Signed in as {{ auth.username() }}.</p>

        <!-- Present but empty: a live region inserted together with its text is often not announced. -->
        <output [class]="cls.notice" tabindex="-1" data-testid="oppw-notice">
          {{ notice() }}
        </output>

        <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
          <label [class]="cls.field">
            <span [class]="cls.label">Current password</span>
            <input
              appTouchTarget
              [class]="cls.input"
              type="password"
              data-testid="oppw-current"
              [formField]="changeForm.currentPassword"
              autocomplete="current-password"
            />
          </label>

          <label [class]="cls.field">
            <span [class]="cls.label">New password</span>
            <input
              appTouchTarget
              [class]="cls.input"
              type="password"
              data-testid="oppw-new"
              [formField]="changeForm.newPassword"
              autocomplete="new-password"
              aria-describedby="oppw-new-hint"
            />
          </label>
          <p id="oppw-new-hint" [class]="cls.hint" data-testid="oppw-new-hint">
            {{ policyHint }} Changing it signs you out on every other device.
          </p>

          @if (error()) {
            <p [class]="cls.submitError" role="alert" tabindex="-1" data-testid="oppw-error">
              {{ error() }}
            </p>
          }

          <button
            appTouchTarget
            type="submit"
            [class]="cls.submit"
            data-testid="oppw-submit"
            [appBusy]="submitting()"
          >
            {{ submitting() ? 'Saving…' : 'Change password' }}
          </button>
        </form>

        <p [class]="cls.alt">
          <a
            appTouchTarget
            [class]="cls.altLink"
            routerLink="/operator"
            data-testid="oppw-to-console"
            >Back to your console</a
          >
        </p>
      </div>
    </section>
  `,
  // The shell paints .riv-bg behind this page (operator chrome); no self-painted background needed.
  host: { class: 'block min-h-full' },
})
export class OperatorPassword {
  protected readonly auth = inject(OperatorAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly cls = CLS;

  protected readonly policyHint = PASSWORD_POLICY_HINT;
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
    // Up front, not per-branch: the early returns below must not leave a stale notice on screen.
    this.notice.set(undefined);
    const { currentPassword, newPassword } = this.model();
    // Kept though the server now names this case too: an attempt still costs a rate-limit token.
    if (currentPassword.length === 0) {
      this.fail(OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE);
      return;
    }
    const violation = passwordPolicyViolation(newPassword, this.auth.username() ?? '');
    if (violation) {
      this.fail(passwordPolicyMessage(violation));
      return;
    }
    this.submitting.set(true);
    // Sent exactly as typed — a password may carry leading/trailing spaces, so trimming would make an
    // account with such a password unable to prove its current one.
    const result = await this.auth.changePassword(currentPassword, newPassword);
    this.submitting.set(false);
    // Held until the reply: clearing earlier unmounts a focused error, stranding focus on <body>.
    this.error.set(undefined);
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
   * Scroll to and focus the outcome — on a phone the notice above the form lands off-screen, so a
   * success reads as the form merely emptying. Two ordered lookups, error first: a selector list
   * resolves in document order and would return the notice even when the error just spoke.
   */
  private revealOutcome(): void {
    // afterNextRender, not queueMicrotask: it is bound to this component's injector, so a pending
    // callback cannot outlive the component and move focus somewhere else later.
    afterNextRender(
      {
        earlyRead: () =>
          this.hostRef.nativeElement.querySelector<HTMLElement>('[data-testid="oppw-error"]') ??
          this.hostRef.nativeElement.querySelector<HTMLElement>('[data-testid="oppw-notice"]'),
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
