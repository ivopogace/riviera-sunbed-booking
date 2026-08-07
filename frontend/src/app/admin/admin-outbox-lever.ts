import { signal } from '@angular/core';

import { OutboxStatusView, ResubmissionResultView } from './admin.model';

/**
 * The client side of an admin outbox lever — a status read and a resubmit that resolves for every
 * typed outcome, refusals included. Implemented by {@link AdminMailOutboxService} and
 * {@link AdminRefundOutboxService}.
 */
export interface AdminOutboxPort {
  status(): Promise<OutboxStatusView>;
  resubmit(): Promise<ResubmissionResultView>;
}

/**
 * The shared state machine behind both admin outbox tabs (Email and Refunds) — the frontend
 * mirror of the backend's `shared.ResubmissionThrottle`: the two levers
 * deliberately share one wire shape and one behaviour, so the behaviour lives once instead of being
 * mirrored into a duplicated block.
 *
 * <p>What it owns: the status/loading/loadError/busy/notice signals and the press semantics — a
 * refusal is an ordinary answer (`COOLING_DOWN` and `ALREADY_RUNNING` are `200`s the admin acts
 * on), only a rejected request is an error, and the post-press reconcile drops the count to
 * "unknown" rather than overwrite the outcome with an error banner. What stays in each component:
 * the auth self-gate, the template, and the tab-specific copy — the success phrase is the one line
 * that differs between the tabs, so it is a constructor argument.
 *
 * <p>A plain class, not a service: each tab constructs one over its own port, and `signal()` needs
 * no injection context.
 */
export class OutboxLever {
  readonly status = signal<OutboxStatusView | undefined>(undefined);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly busy = signal(false);
  readonly notice = signal('');

  constructor(
    private readonly port: AdminOutboxPort,
    private readonly describeSuccess: (resubmitted: number) => string,
  ) {}

  async load(): Promise<void> {
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

  async resubmit(): Promise<void> {
    this.busy.set(true);
    this.notice.set('');
    try {
      const result = await this.port.resubmit();
      this.notice.set(this.describe(result));
      await this.reconcile();
    } catch {
      this.notice.set('Something went wrong — nothing was resubmitted.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Both refusals are ordinary answers; only a rejected request is an error. */
  private describe(result: ResubmissionResultView): string {
    const wait = `Try again in ${result.cooldownRemainingSeconds}s.`;
    switch (result.outcome) {
      case 'RESUBMITTED':
        return result.resubmitted === 0
          ? 'Nothing was outstanding, so nothing was resubmitted.'
          : this.describeSuccess(result.resubmitted);
      case 'ALREADY_RUNNING':
        return `Another resubmission is already running. ${wait}`;
      case 'COOLING_DOWN':
        return `A resubmission ran recently, so this one was skipped. ${wait}`;
    }
  }

  private async refreshStatus(): Promise<void> {
    this.status.set(await this.port.status());
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
