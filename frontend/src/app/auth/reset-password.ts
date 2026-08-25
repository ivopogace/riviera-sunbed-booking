import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CustomerAuth, MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_MESSAGE } from '../core/customer-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';

import { TouchTarget } from '../shared/touch-target';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  card: 'w-full max-w-[400px] rounded-[26px] px-[26px] pt-[30px] pb-6 shadow-[0_30px_70px_rgba(6,30,40,0.28),inset_0_1px_0_rgba(255,255,255,0.7)]',
  title: 'm-0 mb-1.5 text-[24px] font-bold tracking-[-0.02em] text-(--riv-card-ink)',
  intro: 'm-0 mb-5 text-[13.5px] leading-[1.5] text-(--riv-card-ink-soft)',
  field: 'flex flex-col gap-1.5 mb-3.5',
  label: 'text-[11px] font-bold tracking-[0.08em] uppercase text-(--riv-card-ink-soft)',
  input:
    'font-[inherit] text-[16px] text-(--riv-card-ink) bg-(--riv-field-fill) border border-(--riv-field-border) rounded-[14px] px-[14px] py-3 placeholder:text-(--riv-card-ink-soft) focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-(--riv-accent-ink)',
  hint: '-mt-1.5 text-[12px] text-(--riv-card-ink-soft)',
  error: 'mt-3 text-[13px] font-semibold text-(--riv-error-ink)',
  submit:
    'mt-4.5 w-full p-[13px] rounded-2xl border border-[rgba(255,255,255,0.4)] bg-(image:--riv-cta-grad) text-white font-[inherit] font-bold text-[15px] cursor-pointer shadow-[0_10px_26px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] motion-safe:[transition:filter_0.15s_ease] motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-70 hover:enabled:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white',
  alt: 'mt-4.5 text-center text-[13.5px] text-(--riv-card-ink-soft)',
  altLink: 'inline-flex items-center font-bold text-(--riv-accent-ink)',
} as const;

/**
 * Password-reset page. Reached from the emailed link `/account/reset?token=…`; the token is
 * the bearer credential (invariant #7). The tourist sets a new password (confirmed) and, on success, the
 * backend rotates it and invalidates any existing sessions, so they sign in fresh. A bad/expired
 * token or missing token is a clear dead-end that points back at requesting a new link.
 */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, RouterLink, CardGlass, BusyAction, TouchTarget],
  template: `
    <section
      class="flex min-h-[60vh] items-center justify-center px-5 py-8"
      aria-labelledby="reset-title"
    >
      <div [class]="cls.card" appCardGlass>
        <h1 id="reset-title" [class]="cls.title">Set a new password</h1>

        @if (done()) {
          <p [class]="cls.intro" role="status" data-testid="reset-done">
            Your password has been updated. You can sign in with it now.
          </p>
          <p [class]="cls.alt">
            <a
              appTouchTarget
              [class]="cls.altLink"
              routerLink="/account/sign-in"
              data-testid="reset-to-signin"
              >Sign in</a
            >
          </p>
        } @else if (!token) {
          <p [class]="cls.error" role="alert" data-testid="reset-no-token">
            This reset link is invalid or incomplete. Request a new one.
          </p>
          <p [class]="cls.alt">
            <a
              appTouchTarget
              [class]="cls.altLink"
              routerLink="/account/forgot"
              data-testid="reset-to-forgot"
              >Request a reset link</a
            >
          </p>
        } @else {
          <form (submit)="onSubmit(); $event.preventDefault()" novalidate>
            <label [class]="cls.field">
              <span [class]="cls.label">New password</span>
              <input
                appTouchTarget
                [class]="cls.input"
                type="password"
                data-testid="reset-password"
                [formField]="resetForm.newPassword"
                autocomplete="new-password"
                aria-describedby="reset-hint"
              />
            </label>
            <p id="reset-hint" [class]="cls.hint">8–72 characters.</p>

            <label [class]="cls.field">
              <span [class]="cls.label">Confirm new password</span>
              <input
                appTouchTarget
                [class]="cls.input"
                type="password"
                data-testid="reset-confirm"
                [formField]="resetForm.confirm"
                autocomplete="new-password"
              />
            </label>

            @if (error(); as msg) {
              <p [class]="cls.error" role="alert" data-testid="reset-error">{{ msg }}</p>
            }

            <button
              appTouchTarget
              type="submit"
              [class]="cls.submit"
              data-testid="reset-submit"
              [appBusy]="submitting()"
            >
              {{ submitting() ? 'Updating…' : 'Update password' }}
            </button>
          </form>
        }
      </div>
    </section>
  `,
})
export class ResetPassword {
  private readonly auth = inject(CustomerAuth);
  private readonly route = inject(ActivatedRoute);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly cls = CLS;
  /** The reset token from the emailed link, read once (a page instance is one link). */
  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ newPassword: '', confirm: '' });
  protected readonly resetForm = form(this.model);

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
    const { newPassword, confirm } = this.model();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      this.error.set(PASSWORD_LENGTH_MESSAGE);
      return;
    }
    if (newPassword !== confirm) {
      this.error.set('The passwords do not match.');
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.resetPassword(this.token, newPassword);
    this.submitting.set(false);
    switch (result) {
      case 'reset':
        this.done.set(true);
        break;
      case 'invalid-token':
        this.error.set('This reset link is invalid or has expired. Request a new one.');
        break;
      case 'invalid-password':
        this.error.set(PASSWORD_LENGTH_MESSAGE);
        break;
      case 'rate-limited':
        this.error.set('Too many attempts. Please wait a minute and try again.');
        break;
      case 'error':
        this.error.set('Something went wrong. Please try again.');
        break;
    }
  }
}
