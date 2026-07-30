import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminMailOutboxService } from './admin-mail-outbox.service';
import { MailOutboxStatusView, MailResubmissionResultView } from './admin.model';

/**
 * The admin console's Email tab (#405): what the Event Publication Registry still owes — confirmation
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
 * <p>Like `/admin`, the page self-gates on {@link OperatorAuth} for UX while the backend
 * `/api/admin/**` role gate does the enforcing. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-mail-outbox',
  imports: [RouterLink, CardGlass, AdminConsoleTabs],
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
          <a routerLink="/venue-admin" class="font-semibold underline">Sign in</a>
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />

        @if (loading()) {
          <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-outbox-loading">
            Loading…
          </p>
        } @else if (loadError()) {
          <p class="mt-4 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-outbox-error">
            Something went wrong loading the outbox.
            <button type="button" class="font-semibold underline" (click)="reload()">Retry</button>
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

            @if (status(); as outbox) {
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
              [disabled]="busy()"
              (click)="resubmit()"
              data-testid="admin-outbox-resubmit"
            >
              {{ busy() ? 'Resubmitting…' : 'Resubmit' }}
            </button>
          </div>

          <p
            class="mt-4 min-h-[1.5rem] text-[15px] text-(--riv-ink-soft)"
            role="status"
            aria-live="polite"
            data-testid="admin-outbox-notice"
          >
            {{ notice() }}
          </p>
        }
      }
    </section>
  `,
})
export class AdminMailOutbox {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminMailOutboxService);

  protected readonly status = signal<MailOutboxStatusView | undefined>(undefined);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');

  private loaded = false;

  constructor() {
    // Load once the admin session is confirmed (restore settled + ROLE_ADMIN present).
    effect(() => {
      if (!this.auth.restoring() && this.auth.isAdmin() && !this.loaded) {
        this.loaded = true;
        void this.load();
      }
    });
  }

  protected reload(): void {
    void this.load();
  }

  protected async resubmit(): Promise<void> {
    this.busy.set(true);
    this.notice.set('');
    try {
      const result = await this.service.resubmit();
      this.notice.set(this.describe(result));
      await this.reconcile();
    } catch {
      this.notice.set('Something went wrong — nothing was resubmitted.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Both refusals are ordinary answers; only a rejected request is an error. */
  private describe(result: MailResubmissionResultView): string {
    const wait = `Try again in ${result.cooldownRemainingSeconds}s.`;
    switch (result.outcome) {
      case 'RESUBMITTED':
        return result.resubmitted === 0
          ? 'Nothing was outstanding, so nothing was resubmitted.'
          : `Handed ${result.resubmitted} back for delivery.`;
      case 'ALREADY_RUNNING':
        return `Another resubmission is already running. ${wait}`;
      case 'COOLING_DOWN':
        return `A resubmission ran recently, so this one was skipped. ${wait}`;
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.refreshStatus();
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshStatus(): Promise<void> {
    this.status.set(await this.service.status());
  }

  /**
   * Re-read the count after an action. A failure here must not overwrite the outcome notice with an
   * error — the resubmission still happened — so it drops the count to "unknown" rather than showing
   * a number that is now wrong.
   */
  private async reconcile(): Promise<void> {
    try {
      await this.refreshStatus();
    } catch {
      this.status.set(undefined);
    }
  }
}
