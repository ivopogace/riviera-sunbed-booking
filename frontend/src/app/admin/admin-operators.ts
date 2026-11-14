import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmWithReason } from '../shared/confirm-with-reason';
import { focusMover } from '../shared/focus-after-render';
import { formatDeadline } from '../shared/deadline';
import { AdminConsoleStats } from './admin-console-stats';
import { AdminOperatorsService } from './admin-operators.service';
import { OperatorAccountView, PendingOperatorView } from './admin.model';

import { TouchTarget } from '../shared/touch-target';
import { PrimaryCta } from '../shared/primary-cta';

/**
 * The admin operator surface: the approval queue and the account list with suspend/reinstate.
 * Every action re-fetches both lists (never a local-only row removal), so a concurrently decided
 * or vanished row settles to the server's truth. Suspend confirms inline, in place (no modal to
 * focus-trap), collecting optional `X-Audit-Reason` grounds; suspended accounts stay listed with
 * Reinstate. The admin's own row offers no Suspend; the server's `409 CANNOT_SUSPEND_SELF` rules. An
 * active row's Reset link shows a one-time link in place, never stored, for the admin to hand over (#1737).
 */
@Component({
  selector: 'app-admin-operators',
  imports: [PrimaryCta, CardGlass, AdminConsoleStats, ConfirmWithReason, BusyAction, TouchTarget],
  template: `
    <output
      class="mt-4 block text-[15px] text-riv-ink-soft"
      aria-live="polite"
      tabindex="-1"
      data-testid="admin-ops-notice"
    >
      {{ notice() }}
    </output>
    <app-admin-console-stats
      [pendingCount]="pendingCount()"
      [activeCount]="activeCount()"
      [suspendedCount]="suspendedCount()"
    />

    @if (loading()) {
      <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-ops-loading" i18n>
        Loading…
      </p>
    } @else if (loadError()) {
      <p class="mt-4 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-ops-error">
        <ng-container i18n>Something went wrong loading operators.</ng-container>
        <button
          type="button"
          data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
          class="font-semibold underline"
          (click)="reload()"
          i18n
        >
          Retry
        </button>
      </p>
    } @else {
      <h2 class="mt-8 text-[18px] font-semibold text-riv-ink" id="admin-pending-title" i18n>
        Awaiting approval
      </h2>

      @if (pending().length === 0) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-ops-empty" i18n>
          No operators are awaiting approval.
        </p>
      } @else {
        <ul
          class="mt-5 flex flex-col gap-3"
          aria-labelledby="admin-pending-title"
          data-testid="admin-ops-list"
        >
          @for (op of pending(); track op.id) {
            <li
              appCardGlass
              class="flex flex-wrap items-center justify-between gap-3 rounded-[14px] p-4"
              data-testid="admin-op-row"
            >
              <div class="min-w-0">
                <p class="truncate text-[16px] font-semibold text-riv-card-ink">
                  {{ op.username }}
                </p>
                <p class="truncate text-[14px] text-riv-card-ink-soft">
                  {{ op.contactEmail }}
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  appPrimaryCta
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-approve-' + op.id"
                  [appBusy]="actingId() !== undefined"
                  (click)="approve(op.id)"
                  class="rounded-[10px] px-4 py-2 text-[14px] font-semibold aria-disabled:opacity-60"
                  i18n
                >
                  Approve
                </button>
                <button
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-reject-' + op.id"
                  [appBusy]="actingId() !== undefined"
                  (click)="reject(op.id)"
                  class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:opacity-60"
                  i18n
                >
                  Reject
                </button>
              </div>
            </li>
          }
        </ul>
      }

      <h2 class="mt-10 text-[18px] font-semibold text-riv-ink" id="admin-accounts-title" i18n>
        Operator accounts
      </h2>
      <p class="mt-1 text-[14px] text-riv-ink-soft" i18n>
        Suspending an operator signs it out on every device and blocks it from signing in again.
        Reinstating restores access, but not the old sessions.
      </p>

      @if (accounts().length === 0) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-accounts-empty" i18n>
          No operator accounts yet.
        </p>
      } @else {
        <ul
          class="mt-5 flex flex-col gap-3"
          aria-labelledby="admin-accounts-title"
          data-testid="admin-accounts-list"
        >
          @for (op of accounts(); track op.id) {
            <li
              appCardGlass
              class="flex flex-wrap items-center justify-between gap-3 rounded-[14px] p-4"
              data-testid="admin-account-row"
            >
              <div class="min-w-0">
                <p class="truncate text-[16px] font-semibold text-riv-card-ink">
                  {{ op.username }}
                  @if (op.admin) {
                    <span
                      class="ml-2 rounded-[6px] border border-riv-field-border px-1.5 py-0.5 text-[12px] font-medium text-riv-card-ink-soft"
                      i18n="operator role|Badge marking an operator account as a platform admin"
                      >Admin</span
                    >
                  }
                  @if (op.suspended) {
                    <span
                      class="ml-2 rounded-[6px] border border-riv-error-ink px-1.5 py-0.5 text-[12px] font-medium text-riv-error-ink"
                      [attr.data-testid]="'admin-suspended-badge-' + op.id"
                      i18n="operator status|Badge on a suspended operator account"
                      >Suspended</span
                    >
                  }
                </p>
                <p class="truncate text-[14px] text-riv-card-ink-soft">
                  {{ op.contactEmail ?? '—' }}
                </p>
              </div>

              @if (isSelf(op)) {
                <p
                  class="text-[14px] text-riv-card-ink-soft"
                  [attr.data-testid]="'admin-self-' + op.id"
                  i18n
                >
                  This is you
                </p>
              } @else if (op.suspended) {
                <button
                  appTouchTarget
                  type="button"
                  [attr.data-testid]="'admin-reinstate-' + op.id"
                  [appBusy]="actingId() !== undefined"
                  (click)="reinstate(op.id)"
                  class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:opacity-60"
                  i18n
                >
                  Reinstate
                </button>
              } @else if (confirmingId() === op.id) {
                <app-confirm-with-reason
                  label="Confirm suspension"
                  i18n-label
                  [prompt]="suspendPrompt(op.username)"
                  [promptTestId]="'admin-suspend-prompt-' + op.id"
                  [reasonId]="'admin-suspend-reason-' + op.id"
                  reasonPlaceholder="e.g. repeated guest reports — sets not honored"
                  i18n-reasonPlaceholder
                  confirmLabel="Suspend"
                  i18n-confirmLabel="suspend operator|Confirms suspending an operator account"
                  cancelLabel="Cancel"
                  i18n-cancelLabel
                  [panelTestId]="'admin-suspend-panel-' + op.id"
                  [confirmTestId]="'admin-suspend-confirm-' + op.id"
                  [cancelTestId]="'admin-suspend-cancel-' + op.id"
                  [busy]="actingId() !== undefined"
                  [(reason)]="suspendReason"
                  (confirmed)="suspend(op.id)"
                  (cancelled)="cancelSuspend(op.id)"
                />
              } @else {
                <div class="flex gap-2">
                  <button
                    appTouchTarget
                    type="button"
                    [attr.data-testid]="'admin-reset-link-' + op.id"
                    [appBusy]="actingId() !== undefined"
                    (click)="issueResetLink(op.id)"
                    class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:opacity-60"
                    i18n
                  >
                    Reset link
                  </button>
                  <button
                    appTouchTarget
                    type="button"
                    [attr.data-testid]="'admin-suspend-' + op.id"
                    [appBusy]="actingId() !== undefined"
                    (click)="askToSuspend(op.id)"
                    class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink aria-disabled:opacity-60"
                    i18n="suspend operator|Opens the confirmation to suspend an operator account"
                  >
                    Suspend
                  </button>
                </div>
              }
              @if (issuedLink(); as link) {
                @if (link.id === op.id) {
                  <div
                    class="basis-full rounded-[10px] border border-riv-field-border p-3"
                    [attr.data-testid]="'admin-reset-panel-' + op.id"
                  >
                    <label class="flex flex-col gap-1.5">
                      <span class="text-[14px] font-semibold text-riv-card-ink" i18n
                        >One-time reset link for
                        {{
                          op.username // i18n(ph="username")
                        }}</span
                      >
                      <input
                        appTouchTarget
                        readonly
                        type="text"
                        [value]="link.url"
                        [attr.data-testid]="'admin-reset-url-' + op.id"
                        (focus)="selectAll($event)"
                        class="w-full rounded-[10px] border border-riv-field-border bg-riv-field-fill px-3 py-2 font-mono text-[14px] text-riv-card-ink"
                      />
                    </label>
                    <p
                      class="mt-1.5 text-[14px] text-riv-card-ink-soft"
                      [attr.data-testid]="'admin-reset-expiry-' + op.id"
                      i18n
                    >
                      It works once, until
                      {{
                        link.expires // i18n(ph="expires")
                      }}
                      (Tirana time). Nothing is emailed: hand it over yourself. Issuing another link
                      cancels this one.
                    </p>
                    <div class="mt-2 flex gap-2">
                      <button
                        appTouchTarget
                        type="button"
                        [attr.data-testid]="'admin-reset-copy-' + op.id"
                        (click)="copyResetLink()"
                        class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink"
                        i18n
                      >
                        Copy link
                      </button>
                      <button
                        appTouchTarget
                        type="button"
                        [attr.data-testid]="'admin-reset-done-' + op.id"
                        (click)="dismissResetLink(op.id)"
                        class="rounded-[10px] border border-riv-field-border px-4 py-2 text-[14px] font-semibold text-riv-card-ink"
                        i18n
                      >
                        Done
                      </button>
                    </div>
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class AdminOperators {
  private readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminOperatorsService);
  private readonly document = inject(DOCUMENT);
  private readonly focusAfterRender = focusMover();

  protected readonly pending = signal<PendingOperatorView[]>([]);
  protected readonly accounts = signal<OperatorAccountView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  /** The id currently being acted on, so the row's buttons disable during the round-trip. */
  protected readonly actingId = signal<number | undefined>(undefined);
  /** The row awaiting a second click to confirm suspension — inline, so the action stays in place. */
  protected readonly confirmingId = signal<number | undefined>(undefined);
  /** The armed confirmation's optional grounds; cleared on arm, dismiss, and confirm. */
  protected readonly suspendReason = signal('');
  /** The one reset link on screen, built on this console's origin; held in memory only, never stored. */
  protected readonly issuedLink = signal<{ id: number; url: string; expires: string } | undefined>(
    undefined,
  );
  /** What the last settled decision did — announced, and the spot focus lands on. */
  protected readonly notice = signal('');
  /**
   * Whether the lists above came from a read that actually succeeded. They start empty and are left
   * untouched on failure, so without this the stat strip would render a confident `0` for a queue it
   * has simply not read yet — and an empty queue is a real, common state.
   */
  private readonly countsKnown = signal(false);

  /** The three operator counts the stat strip renders; `undefined` means "not known", never 0. */
  protected readonly pendingCount = computed(() =>
    this.countsKnown() ? this.pending().length : undefined,
  );
  protected readonly activeCount = computed(() =>
    this.countsKnown() ? this.accounts().filter((op) => !op.suspended).length : undefined,
  );
  protected readonly suspendedCount = computed(() =>
    this.countsKnown() ? this.accounts().filter((op) => op.suspended).length : undefined,
  );

  private loaded = false;

  constructor() {
    // Load the queue once the admin session is confirmed (restore settled + ROLE_ADMIN present).
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

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [pending, accounts] = await Promise.all([
        this.service.pending(),
        this.service.accounts(),
      ]);
      this.pending.set(pending);
      this.accounts.set(accounts);
      this.countsKnown.set(true);
    } catch {
      this.loadError.set(true);
      this.countsKnown.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  /** The signed-in admin's own row — the server refuses a self-suspend, so don't offer one. */
  protected isSelf(op: OperatorAccountView): boolean {
    return op.username === this.auth.principalName();
  }

  protected async approve(id: number): Promise<void> {
    await this.act(
      id,
      () => this.service.approve(id),
      (who) => $localize`Approved ${who}:operator:.`,
    );
  }

  protected async reject(id: number): Promise<void> {
    await this.act(
      id,
      () => this.service.reject(id),
      (who) => $localize`Rejected ${who}:operator:.`,
    );
  }

  /**
   * Arm the confirmation. Arming and dismissing each destroy the pressed control, so focus moves
   * (WCAG 2.4.3): into the panel via {@link ConfirmWithReason}, back to Suspend on dismiss, and to
   * the notice via {@link act} once any row action settles.
   */
  protected askToSuspend(id: number): void {
    this.confirmingId.set(id);
    this.suspendReason.set('');
  }

  protected cancelSuspend(id: number): void {
    this.confirmingId.set(undefined);
    this.suspendReason.set('');
    this.focusAfterRender(`admin-suspend-${id}`);
  }

  protected async suspend(id: number): Promise<void> {
    // Typed grounds ride the suspension into the audit trail; no grounds → the 1-arg call.
    const grounds = this.suspendReason().trim();
    this.suspendReason.set('');
    await this.act(
      id,
      () => (grounds === '' ? this.service.suspend(id) : this.service.suspend(id, grounds)),
      (who) => $localize`Suspended ${who}:operator:.`,
    );
  }

  /**
   * Issue a reset link and show it in the row, focusing it for the copy. A refusal reconciles the lists like
   * any action; the env-managed bootstrap admin gets its own answer, since retrying cannot help.
   */
  protected async issueResetLink(id: number): Promise<void> {
    if (this.actingId() !== undefined) {
      return;
    }
    const who = this.nameOf(id);
    this.actingId.set(id);
    this.confirmingId.set(undefined);
    this.issuedLink.set(undefined);
    this.notice.set('');
    try {
      const { token, expiresAt } = await this.service.issueResetLink(id);
      const origin = this.document.location.origin;
      const url = `${origin}/account/operator-reset?token=${encodeURIComponent(token)}`;
      this.issuedLink.set({ id, url, expires: formatDeadline(expiresAt) });
      this.notice.set($localize`Reset link ready for ${who}:operator:.`);
      this.focusAfterRender(`admin-reset-url-${id}`);
    } catch (error) {
      if (problemCode(error) === 'BOOTSTRAP_CREDENTIAL_MANAGED') {
        this.notice.set(
          $localize`The password of ${who}:operator: is set by the deployment environment, not here.`,
        );
      } else {
        await this.load();
        this.notice.set(NOT_THROUGH);
      }
      this.focusAfterRender('admin-ops-notice');
    } finally {
      this.actingId.set(undefined);
    }
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  protected async copyResetLink(): Promise<void> {
    const link = this.issuedLink();
    if (link === undefined) {
      return;
    }
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(link.url);
      this.notice.set($localize`Link copied.`);
    } catch {
      this.notice.set($localize`Could not copy. Select the link and copy it yourself.`);
    }
  }

  /** Dismissing destroys the focused Done button, so focus returns to the row's Reset link. */
  protected dismissResetLink(id: number): void {
    this.issuedLink.set(undefined);
    this.focusAfterRender(`admin-reset-link-${id}`);
  }

  protected async reinstate(id: number): Promise<void> {
    await this.act(
      id,
      () => this.service.reinstate(id),
      (who) => $localize`Reinstated ${who}:operator:.`,
    );
  }

  /**
   * Run one decision at a time, reconcile both lists from the server, then focus the notice, since
   * the reconcile destroys whatever held focus (why the notice: RV-FE-9, `riviera-review-overlay`).
   * The name is read **before** the action, because the reconcile removes its row.
   */
  private async act(
    id: number,
    action: () => Promise<void>,
    outcome: (who: string) => string,
  ): Promise<void> {
    if (this.actingId() !== undefined) {
      return;
    }
    const who = this.nameOf(id);
    this.actingId.set(id);
    this.confirmingId.set(undefined);
    this.issuedLink.set(undefined);
    this.notice.set('');
    let settled = false;
    try {
      await action();
      settled = true;
    } catch {
      // A 409 (already decided) / 404 (gone) resolves itself on the reload below; a transport error
      // surfaces as the load error. Either way, re-fetch the authoritative queue.
    } finally {
      this.actingId.set(undefined);
      await this.load();
      // Never "nothing changed": a 409 means it was already decided, so the reconciled list may move.
      this.notice.set(settled ? outcome(who) : NOT_THROUGH);
      this.focusAfterRender('admin-ops-notice');
    }
  }

  protected suspendPrompt(username: string): string {
    return $localize`Suspend ${username}:operator:?`;
  }

  private nameOf(id: number): string {
    const row =
      this.pending().find((op) => op.id === id) ?? this.accounts().find((op) => op.id === id);
    return row?.username ?? $localize`the operator`;
  }
}

const NOT_THROUGH = $localize`That didn't go through. The list below is up to date.`;

/** The stable `code` on an RFC-7807 error body. */
function problemCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse
    ? (error.error as { code?: string } | null)?.code
    : undefined;
}
