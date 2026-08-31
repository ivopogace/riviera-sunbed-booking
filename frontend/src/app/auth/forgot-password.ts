import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
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
  error: 'mt-3 text-[13px] font-semibold text-riv-error-ink',
  submit:
    'mt-4.5 w-full p-[13px] rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
  alt: 'mt-4.5 text-center text-[13.5px] text-riv-card-ink-soft',
  altLink: 'inline-flex items-center font-bold text-riv-accent-ink',
} as const;

/**
 * "Forgot password" request page (design D-8). A tourist enters their email and we ask the
 * backend to send a reset link. The confirmation is deliberately uniform — it never reveals whether the
 * email has an account (non-enumeration) — so a successful request always shows the same "if an account
 * exists…" message. Signal Forms drives the one field; the server is the authority.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink, CardGlass, BusyAction, TouchTarget],
  template: `
    <section
      class="flex min-h-[60vh] items-center justify-center px-5 py-8"
      aria-labelledby="forgot-title"
    >
      <div [class]="cls.card" appCardGlass>
        <h1 id="forgot-title" [class]="cls.title">Reset your password</h1>

        @if (sent()) {
          <p [class]="cls.intro" role="status" data-testid="forgot-sent">
            If an account exists for that email, we've sent a link to set a new password. Check your
            inbox.
          </p>
          <p [class]="cls.alt">
            <a
              appTouchTarget
              [class]="cls.altLink"
              routerLink="/account/sign-in"
              data-testid="forgot-to-signin"
              >Back to sign in</a
            >
          </p>
        } @else {
          <p id="forgot-intro" [class]="cls.intro">
            Enter your email and we'll send you a link to set a new password.
          </p>

          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label [class]="cls.field">
              <span [class]="cls.label">Email</span>
              <input
                appTouchTarget
                [class]="cls.input"
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
              <p [class]="cls.error" role="alert" data-testid="forgot-error">{{ msg }}</p>
            }

            <button
              appTouchTarget
              type="submit"
              [class]="cls.submit"
              data-testid="forgot-submit"
              [appBusy]="submitting()"
            >
              {{ submitting() ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>

          <p [class]="cls.alt">
            Remembered it?
            <a
              appTouchTarget
              [class]="cls.altLink"
              routerLink="/account/sign-in"
              data-testid="forgot-to-signin"
              >Sign in</a
            >
          </p>
        }
      </div>
    </section>
  `,
})
export class ForgotPassword {
  private readonly auth = inject(CustomerAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly cls = CLS;
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
