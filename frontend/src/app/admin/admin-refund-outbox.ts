import { Component, effect, inject } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { AdminRefundOutboxService } from './admin-refund-outbox.service';
import { OutboxLever } from './admin-outbox-lever';

import { TouchTarget } from '../shared/touch-target';

/**
 * The admin console's Refunds tab: what the Event Publication Registry still owes the
 * cancellation-refund listener — refunds whose gateway call failed or was shed — and the lever
 * that re-drives them without waiting for a deploy. Until this tab, the money path's retry lever was
 * the one admin lever without a button (a cookie-jar `curl`, mid-incident, from a runbook).
 *
 * <p>The press semantics are the Email tab's, shared through {@link OutboxLever}: the count is shown
 * before the button is pressed, a refusal (`COOLING_DOWN` / `ALREADY_RUNNING`) is reported as a
 * refusal with the retry window rather than as a failure, and the button disables only for its own
 * round-trip. What this surface deliberately cannot show (invariant #7): a booking id, a
 * booking code, or any per-publication detail — the endpoint returns counts, an outcome token and
 * seconds, nothing else, and the client invents no columns for more.
 *
 * <p>Like every admin tab, the surrounding {@code AdminConsole} shell self-gates on
 * {@link OperatorAuth} for UX while the backend `/api/admin/**` role gate does the enforcing; this
 * component only ever renders once both have passed.
 */
@Component({
  selector: 'app-admin-refund-outbox',
  imports: [CardGlass, BusyAction, TouchTarget],
  template: `
    @if (lever.loading()) {
      <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-refunds-loading">Loading…</p>
    } @else if (lever.loadError()) {
      <p class="mt-4 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-refunds-error">
        Something went wrong loading the refund outbox.
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          (click)="lever.load()"
        >
          Retry
        </button>
      </p>
    } @else {
      <div
        appCardGlass
        class="mt-6 rounded-[14px] p-5"
        data-testid="admin-refunds-card"
        aria-labelledby="admin-refunds-heading"
      >
        <h2 id="admin-refunds-heading" class="text-[16px] font-semibold text-riv-card-ink">
          Refunds still owed
        </h2>

        @if (lever.status(); as outbox) {
          @if (outbox.outstanding === 0) {
            <p class="mt-2 text-[15px] text-riv-card-ink" data-testid="admin-refunds-empty">
              Nothing outstanding — no refund is waiting to be retried.
            </p>
          } @else {
            <p class="mt-2 text-[15px] text-riv-card-ink" data-testid="admin-refunds-outstanding">
              <strong>{{ outbox.outstanding }}</strong>
              {{ outbox.outstanding === 1 ? 'refund is' : 'refunds are' }} still owed. Resubmitting
              hands them back to be retried; it never touches confirmations or payouts.
            </p>
          }
        }

        <button
          appTouchTarget
          type="button"
          class="mt-4 inline-flex items-center rounded-full border border-white/95 bg-white/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-accent-ink shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-white aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          [appBusy]="lever.busy()"
          (click)="lever.resubmit()"
          data-testid="admin-refunds-resubmit"
        >
          {{ lever.busy() ? 'Resubmitting…' : 'Resubmit' }}
        </button>
      </div>

      <p
        class="mt-4 min-h-[1.5rem] text-[15px] text-riv-ink-soft"
        role="status"
        aria-live="polite"
        data-testid="admin-refunds-notice"
      >
        {{ lever.notice() }}
      </p>
    }
  `,
})
export class AdminRefundOutbox {
  private readonly auth = inject(OperatorAuth);

  protected readonly lever = new OutboxLever(
    inject(AdminRefundOutboxService),
    (resubmitted) => `Handed ${resubmitted} back to be retried.`,
  );

  private loaded = false;

  constructor() {
    // Load once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.lever.load();
      }
    });
  }
}
