import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminMailDelivery } from './admin-mail-delivery';
import { AdminMailOutboxService } from './admin-mail-outbox.service';
import { OutboxLever } from './admin-outbox-lever';

/**
 * The admin console's Email tab: what the Event Publication Registry still owes — confirmation
 * mails whose send failed — and the lever that re-drives them without waiting for a deploy.
 *
 * <p><strong>The count is shown before the button is pressed</strong>, which is why the slice added a
 * status read the issue did not ask for: a lever with no number is one an admin presses hopefully. It
 * is a count of publications, never of recipients — this surface cannot show an address or an arrival
 * code, because the endpoint does not return them (invariant #7).
 *
 * <p><strong>A refusal is reported as a refusal, not as a failure.</strong> The backend answers
 * {@code 200} for all three outcomes, so `COOLING_DOWN` and `ALREADY_RUNNING` land here as ordinary
 * results — "nothing was swept, try again in N seconds" — rather than as the error banner a rejected
 * promise would produce. Conflating the two would teach an admin to distrust a working button.
 *
 * <p>The button is not disabled while cooling down: the remaining window is a server fact that goes
 * stale the moment it is rendered, and a button disabled by a stale number is indistinguishable from
 * a broken one. It disables only for the round-trip it is actually making.
 *
 * <p>Those press semantics are shared with the Refunds tab and live in {@link OutboxLever};
 * this component keeps the auth self-gate, the template, and the mail-specific copy.
 *
 * <p>The page also carries a second card, {@link AdminMailDelivery}: the outbox above answers
 * "what does the registry still owe us", that one answers "what happened to this tourist's mail" —
 * the same concern from opposite ends, which is why it is a card here rather than a tab of its own.
 *
 * <p>Like `/admin`, the page self-gates on {@link OperatorAuth} for UX while the backend
 * `/api/admin/**` role gate does the enforcing. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-mail-outbox',
  imports: [RouterLink, CardGlass, AdminConsoleTabs, AdminMailDelivery],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[720px] px-4 py-10" aria-labelledby="admin-outbox-title">
      <h1 id="admin-outbox-title" class="text-[24px] font-semibold text-(--riv-ink)">Email</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-restoring">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-signed-out">
          Sign in as an admin to review undelivered mail.
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: '/admin/email' }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />

        @if (lever.loading()) {
          <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-loading">
            Loading…
          </p>
        } @else if (lever.loadError()) {
          <p class="mt-4 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-outbox-error">
            Something went wrong loading the outbox.
            <button type="button" class="font-semibold underline" (click)="lever.load()">
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
            <h2 id="admin-outbox-heading" class="text-[16px] font-semibold text-(--riv-card-ink)">
              Undelivered confirmation mail
            </h2>

            @if (lever.status(); as outbox) {
              @if (outbox.outstanding === 0) {
                <p
                  class="mt-2 text-[15px] text-(--riv-card-ink)"
                  data-testid="admin-outbox-empty"
                >
                  Nothing outstanding — every confirmation mail has been handed over.
                </p>
              } @else {
                <p
                  class="mt-2 text-[15px] text-(--riv-card-ink)"
                  data-testid="admin-outbox-outstanding"
                >
                  <strong>{{ outbox.outstanding }}</strong>
                  {{ outbox.outstanding === 1 ? 'mail is' : 'mails are' }} still owed. Resubmitting
                  hands them back for delivery; it never touches payouts or refunds.
                </p>
              }
            }

            <button
              type="button"
              class="mt-4 inline-flex items-center rounded-full border border-white/95 bg-white/85 px-[18px] py-[9px] text-[13.5px] font-semibold text-[#0a4f5e] shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff] [transition:background_0.15s_ease] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="lever.busy()"
              (click)="lever.resubmit()"
              data-testid="admin-outbox-resubmit"
            >
              {{ lever.busy() ? 'Resubmitting…' : 'Resubmit' }}
            </button>
          </div>

          <p
            class="mt-4 min-h-[1.5rem] text-[15px] text-(--riv-ink-soft)"
            role="status"
            aria-live="polite"
            data-testid="admin-outbox-notice"
          >
            {{ lever.notice() }}
          </p>

          <app-admin-mail-delivery />
        }
      }
    </section>
  `,
})
export class AdminMailOutbox {
  protected readonly auth = inject(OperatorAuth);

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
