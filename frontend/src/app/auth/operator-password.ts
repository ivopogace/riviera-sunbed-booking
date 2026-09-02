import { afterNextRender, Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  MAX_OPERATOR_PASSWORD_BYTES,
  MIN_OPERATOR_PASSWORD_LENGTH,
  OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
  OPERATOR_PASSWORD_LENGTH_MESSAGE,
  OPERATOR_PASSWORD_TOO_LONG_MESSAGE,
  OperatorAuth,
  operatorPasswordByteLength,
  operatorPasswordChangeMessage,
} from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';

import { TouchTarget } from '../shared/touch-target';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[30px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[24px] font-bold tracking-[-0.02em] text-riv-card-ink',
  intro: 'm-0 mb-5 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  field: 'flex flex-col gap-1.5 mb-3.5',
  label: 'text-[11px] font-bold tracking-[0.08em] uppercase text-riv-card-ink-soft',
  input:
    'font-[inherit] text-[16px] text-riv-card-ink bg-riv-field-fill border border-riv-field-border rounded-[14px] px-[14px] py-3 placeholder:text-riv-card-ink-soft focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  hint: '-mt-1.5 text-[12px] text-riv-card-ink-soft',
  // Always mounted, so it keeps its resting margin while silent: an interpolation defeats `:empty`.
  notice: 'm-0 mb-5 text-[13.5px] leading-[1.5] text-riv-card-ink-soft',
  submitError: 'mt-3 text-[13px] font-semibold text-riv-error-ink',
  submit:
    'mt-4.5 w-full p-[13px] rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
  alt: 'mt-4.5 text-center text-[13.5px] text-riv-card-ink-soft',
  altLink: 'inline-flex items-center font-bold text-riv-accent-ink',
} as const;

/**
 * The signed-in operator's password-change page. Deliberately a **separate** page from the
 * customer's `set-password`, not an audience toggle on it: that page is the customer *account* page and
 * only one of its five blocks concerns passwords — email verification, the SSO "leave blank" affordance
 * and right-to-erasure all fail to apply to an operator (an operator is a business counterparty with
 * payout records, not a data subject). Merging would have wrapped most of it in an audience conditional.
 * What is genuinely shared — `CardGlass`, the auth-card Tailwind recipe, the password-policy
 * constants — is shared.
 *
 * <p>No signed-out branch: `operatorSessionGuard` awaits the session restore and redirects
 * before this component renders. Both fields are always required — operators have no SSO, so there is no
 * password-less account that could set a first password here.
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
        <p [class]="cls.notice" role="status" tabindex="-1" data-testid="oppw-notice">
          {{ notice() }}
        </p>

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
          <p id="oppw-new-hint" [class]="cls.hint">
            8–72 characters. Changing it signs you out on every other device.
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
    // Cleared up front, not per-branch: an early return used to leave the previous success notice on
    // screen beside a fresh error, so the operator saw "your password has been changed" next to a failure.
    this.error.set(undefined);
    this.notice.set(undefined);
    const { currentPassword, newPassword } = this.model();
    // Kept though the server now names this case too: an attempt still costs a rate-limit token.
    if (currentPassword.length === 0) {
      this.fail(OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE);
      return;
    }
    if (newPassword.length < MIN_OPERATOR_PASSWORD_LENGTH) {
      this.fail(OPERATOR_PASSWORD_LENGTH_MESSAGE);
      return;
    }
    // Bytes, not characters — the server's cap is bcrypt's 72-byte input limit, so an accented or
    // emoji-bearing passphrase can be well under 72 characters and still be rejected.
    if (operatorPasswordByteLength(newPassword) > MAX_OPERATOR_PASSWORD_BYTES) {
      this.fail(OPERATOR_PASSWORD_TOO_LONG_MESSAGE);
      return;
    }
    this.submitting.set(true);
    // Sent exactly as typed — a password may carry leading/trailing spaces, so trimming would make an
    // account with such a password unable to prove its current one.
    const result = await this.auth.changePassword(currentPassword, newPassword);
    this.submitting.set(false);
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
   * Bring the outcome into view and focus it. The notice renders above the form while the error renders
   * below it, so on a phone a success message lands off-screen and is indistinguishable from the form
   * merely emptying itself — the one thing this page exists to communicate, silently missed.
   *
   * <p>Two ordered lookups, not one selector list: `querySelector` resolves a list in **document
   * order**, not list order, so a list returns the notice — which sits above the form — even when the
   * error is what just spoke. Neither arm needs an emptiness guard, and `:empty` could not provide
   * one: this runs only from `fail()` or the success branch, so the region it finds has just been
   * given its message, and an interpolation always leaves a text node.
   * Rationale: #828.
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
