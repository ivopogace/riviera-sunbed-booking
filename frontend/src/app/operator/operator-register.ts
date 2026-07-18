import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import {
  MIN_OPERATOR_PASSWORD_LENGTH,
  OPERATOR_PASSWORD_LENGTH_MESSAGE,
  OperatorAuth,
  operatorRegisterMessage,
} from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';

/**
 * Operator self-registration page (S6 #115, design D-5/D-8). A prospective venue operator requests an
 * account with a login username, password, and contact email. Unlike customer registration there is NO
 * auto-sign-in: the backend creates a PENDING account and the operator can sign in only after a platform
 * admin approves it — so on success this shows a "pending approval" notice rather than navigating.
 * Non-enumerating: a fresh and an already-taken username are indistinguishable (D-8). Porcelain-themed
 * to match the operator console. The password minimum is enforced client-side for a friendly message
 * AND server-side as the authority.
 */
@Component({
  selector: 'app-operator-register',
  imports: [FormField, RouterLink, CardGlass],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section
      class="mx-auto flex min-h-[70vh] max-w-[460px] flex-col justify-center px-4 py-10"
      aria-labelledby="op-register-title"
    >
      <div appCardGlass class="rounded-[20px] p-6 shadow-[0_12px_44px_rgba(12,42,51,0.14)]">
        <h1 id="op-register-title" class="text-[22px] font-semibold text-(--riv-card-ink)">
          Register as an operator
        </h1>

        @if (submitted()) {
          <div data-testid="op-register-pending">
            <p class="mt-3 text-[15px] text-(--riv-card-ink-soft)">
              Thanks — your registration has been received. Because operators manage real venues and
              payments, a platform admin reviews each request. You'll be able to sign in once your
              account is approved.
            </p>
            <p class="mt-4 text-[14px] text-(--riv-card-ink-faint)">
              <a routerLink="/venue-admin" class="font-semibold underline" data-testid="op-register-to-signin"
                >Go to operator sign-in</a
              >
            </p>
          </div>
        } @else {
          <p id="op-register-intro" class="mt-2 text-[15px] text-(--riv-card-ink-soft)">
            Registration is reviewed by a platform admin before your account is activated.
          </p>

          <form (submit)="onSubmit(); $event.preventDefault()" novalidate class="mt-4 flex flex-col gap-3">
            <label class="flex flex-col gap-1">
              <span class="text-[13px] font-medium text-(--riv-card-ink-soft)">Username</span>
              <input
                type="text"
                data-testid="op-register-username"
                [formField]="registerForm.username"
                autocomplete="username"
                autocapitalize="off"
                spellcheck="false"
                aria-describedby="op-register-intro"
                class="w-full rounded-[10px] border border-(--riv-field-border) bg-(--riv-field-fill) px-3 py-2 text-[15px] text-(--riv-card-ink) [transition:border-color_0.15s_ease] focus:border-(--riv-card-ink) focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[13px] font-medium text-(--riv-card-ink-soft)">Contact email</span>
              <input
                type="email"
                data-testid="op-register-email"
                [formField]="registerForm.contactEmail"
                autocomplete="email"
                autocapitalize="off"
                spellcheck="false"
                class="w-full rounded-[10px] border border-(--riv-field-border) bg-(--riv-field-fill) px-3 py-2 text-[15px] text-(--riv-card-ink) [transition:border-color_0.15s_ease] focus:border-(--riv-card-ink) focus:outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[13px] font-medium text-(--riv-card-ink-soft)">Password</span>
              <input
                type="password"
                data-testid="op-register-password"
                [formField]="registerForm.password"
                autocomplete="new-password"
                aria-describedby="op-register-hint"
                class="w-full rounded-[10px] border border-(--riv-field-border) bg-(--riv-field-fill) px-3 py-2 text-[15px] text-(--riv-card-ink) [transition:border-color_0.15s_ease] focus:border-(--riv-card-ink) focus:outline-none"
              />
            </label>
            <p id="op-register-hint" class="text-[13px] text-(--riv-card-ink-faint)">8–72 characters.</p>

            @if (error(); as msg) {
              <p class="text-[14px] font-medium text-[#b3261e]" role="alert" data-testid="op-register-error">
                {{ msg }}
              </p>
            }

            <button
              type="submit"
              data-testid="op-register-submit"
              [disabled]="submitting()"
              class="mt-1 w-full rounded-[10px] bg-(image:--riv-cta-grad) px-4 py-2.5 text-[15px] font-semibold text-white [transition:opacity_0.15s_ease] disabled:opacity-60"
            >
              {{ submitting() ? 'Submitting…' : 'Request account' }}
            </button>
          </form>

          <p class="mt-4 text-[14px] text-(--riv-card-ink-faint)">
            Already approved?
            <a routerLink="/venue-admin" class="font-semibold underline" data-testid="op-register-signin-link"
              >Sign in</a
            >
          </p>
        }
      </div>
    </section>
  `,
})
export class OperatorRegister {
  private readonly auth = inject(OperatorAuth);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly model = signal({ username: '', password: '', contactEmail: '' });
  // form() drives the two-way [formField] binding; validity is gated in onSubmit and shown via the one
  // `error` alert (the customer-register pattern), so no per-field validator schema here.
  protected readonly registerForm = form(this.model);

  constructor() {
    afterNextRender(() => this.hostRef.nativeElement.querySelector('input')?.focus());
  }

  protected async onSubmit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    const username = this.model().username.trim();
    const contactEmail = this.model().contactEmail.trim();
    const password = this.model().password;
    if (!username || !contactEmail || !password) {
      this.error.set('Enter a username, contact email, and password.');
      return;
    }
    if (password.length < MIN_OPERATOR_PASSWORD_LENGTH) {
      this.error.set(OPERATOR_PASSWORD_LENGTH_MESSAGE);
      return;
    }
    this.submitting.set(true);
    this.error.set(undefined);
    const result = await this.auth.register(username, password, contactEmail);
    this.submitting.set(false);
    if (result === 'submitted') {
      this.submitted.set(true);
    } else {
      this.error.set(operatorRegisterMessage(result));
    }
  }
}
