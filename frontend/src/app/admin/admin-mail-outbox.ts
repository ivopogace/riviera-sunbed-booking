import { Component, effect, inject } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { AdminMailDelivery } from './admin-mail-delivery';
import { AdminMailOutboxService } from './admin-mail-outbox.service';
import { OutboxLever } from './admin-outbox-lever';

import { TouchTarget } from '../shared/touch-target';

/**
 * The Email tab: how many confirmation mails the Event Publication Registry still owes, shown
 * before the press, and the lever that re-drives them without a deploy; press semantics (a refusal
 * is a `200` answer, not an error) live in {@link OutboxLever}. It counts publications, never
 * showing an address or arrival code (invariant #7). Never disable the button for a cooldown: the
 * remaining window is stale once rendered, so it goes busy only for its own round-trip. It also
 * hosts {@link AdminMailDelivery}, the same concern from the other end.
 */
@Component({
  selector: 'app-admin-mail-outbox',
  imports: [CardGlass, AdminMailDelivery, BusyAction, TouchTarget],
  template: `
    @if (lever.loading()) {
      <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-outbox-loading">Loading…</p>
    } @else if (lever.loadError()) {
      <p class="mt-4 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-outbox-error">
        Something went wrong loading the email outbox.
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
        data-testid="admin-outbox-card"
        aria-labelledby="admin-outbox-heading"
      >
        <h2 id="admin-outbox-heading" class="text-[16px] font-semibold text-riv-card-ink">
          Undelivered confirmation mail
        </h2>

        @if (lever.status(); as outbox) {
          @if (outbox.outstanding === 0) {
            <p class="mt-2 text-[15px] text-riv-card-ink" data-testid="admin-outbox-empty">
              Nothing outstanding — every confirmation mail has been handed over.
            </p>
          } @else {
            <p class="mt-2 text-[15px] text-riv-card-ink" data-testid="admin-outbox-outstanding">
              <strong>{{ outbox.outstanding }}</strong>
              {{ outbox.outstanding === 1 ? 'mail is' : 'mails are' }} still owed. Resubmitting
              hands them back for delivery; it never touches payouts or refunds.
            </p>
          }
        }

        <button
          appTouchTarget
          type="button"
          class="mt-4 inline-flex items-center rounded-full border border-riv-card-border bg-riv-console-inset/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-accent-ink shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-riv-console-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
          [appBusy]="lever.busy()"
          (click)="lever.resubmit()"
          data-testid="admin-outbox-resubmit"
        >
          {{ lever.busy() ? 'Resubmitting…' : 'Resubmit' }}
        </button>
      </div>

      <output
        class="mt-4 block min-h-[1.5rem] text-[15px] text-riv-ink-soft"
        aria-live="polite"
        data-testid="admin-outbox-notice"
      >
        {{ lever.notice() }}
      </output>

      <app-admin-mail-delivery />
    }
  `,
})
export class AdminMailOutbox {
  private readonly auth = inject(OperatorAuth);

  protected readonly lever = new OutboxLever(
    inject(AdminMailOutboxService),
    (resubmitted) => `Handed ${resubmitted} back for delivery.`,
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
