import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminConsoleStats } from './admin-console-stats';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminOperatorsService } from './admin-operators.service';
import { OperatorAccountView, PendingOperatorView } from './admin.model';

/**
 * The platform-admin operator surface: the approval queue (S6 #115, design D-5) and the account list
 * with suspend/reinstate (#128). Every action <strong>reconciles both lists from the server</strong>
 * (re-fetch, never a local-only row removal) so a concurrently-decided or already-gone row simply
 * settles to the truth.
 *
 * <p>Suspension is destructive and easy to misclick, so it takes a deliberate second step: the row's
 * Suspend button becomes an inline `Suspend <username>?` confirmation in place — no modal, so nothing
 * to focus-trap and no context switch away from the row being acted on. Since #519 the confirmation
 * also collects optional grounds, which ride the `X-Audit-Reason` header into the platform's admin
 * audit trail (#507). Suspended accounts stay in the list (badged) with a Reinstate action, so
 * suspension is never a one-way door.
 *
 * <p>The signed-in admin's own row offers no Suspend at all: the server refuses a self-suspend with
 * {@code 409 CANNOT_SUSPEND_SELF} and that refusal is the real authority — this just avoids offering
 * an action that cannot succeed. Likewise the whole page self-gates on {@link OperatorAuth} for UX
 * while the backend `/api/admin/**` role gate does the actual enforcing. Porcelain-themed to match the
 * operator console.
 */
@Component({
  selector: 'app-admin-operators',
  imports: [RouterLink, CardGlass, AdminConsoleTabs, AdminConsoleStats],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[720px] px-4 py-10" aria-labelledby="admin-ops-title">
      <h1 id="admin-ops-title" class="text-[24px] font-semibold text-(--riv-ink)">Operators</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-restoring">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-signed-out">
          Sign in as an admin to review pending registrations.
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: '/admin' }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />
        <app-admin-console-stats
          [pendingCount]="pendingCount()"
          [activeCount]="activeCount()"
          [suspendedCount]="suspendedCount()"
        />

        @if (loading()) {
          <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-loading">
            Loading…
          </p>
        } @else if (loadError()) {
          <p class="mt-4 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-ops-error">
            Something went wrong loading operators.
            <button type="button" class="font-semibold underline" (click)="reload()">Retry</button>
          </p>
        } @else {
          <h2 class="mt-8 text-[18px] font-semibold text-(--riv-ink)" id="admin-pending-title">
            Awaiting approval
          </h2>

          @if (pending().length === 0) {
            <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-empty">
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
                    <p class="truncate text-[16px] font-semibold text-(--riv-card-ink)">
                      {{ op.username }}
                    </p>
                    <p class="truncate text-[14px] text-(--riv-card-ink-soft)">
                      {{ op.contactEmail }}
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      [attr.data-testid]="'admin-approve-' + op.id"
                      [disabled]="actingId() !== undefined"
                      (click)="approve(op.id)"
                      class="rounded-[10px] bg-(image:--riv-cta-grad) px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      [attr.data-testid]="'admin-reject-' + op.id"
                      [disabled]="actingId() !== undefined"
                      (click)="reject(op.id)"
                      class="rounded-[10px] border border-(--riv-field-border) px-4 py-2 text-[14px] font-semibold text-(--riv-card-ink) disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              }
            </ul>
          }

          <h2 class="mt-10 text-[18px] font-semibold text-(--riv-ink)" id="admin-accounts-title">
            Operator accounts
          </h2>
          <p class="mt-1 text-[14px] text-(--riv-ink-soft)">
            Suspending an operator signs it out on every device and blocks it from signing in again.
            Reinstating restores access, but not the old sessions.
          </p>

          @if (accounts().length === 0) {
            <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-accounts-empty">
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
                    <p class="truncate text-[16px] font-semibold text-(--riv-card-ink)">
                      {{ op.username }}
                      @if (op.admin) {
                        <span
                          class="ml-2 rounded-[6px] border border-(--riv-field-border) px-1.5 py-0.5 text-[12px] font-medium text-(--riv-card-ink-soft)"
                          >Admin</span
                        >
                      }
                      @if (op.suspended) {
                        <span
                          class="ml-2 rounded-[6px] border border-[#b3261e] px-1.5 py-0.5 text-[12px] font-medium text-[#b3261e]"
                          [attr.data-testid]="'admin-suspended-badge-' + op.id"
                          >Suspended</span
                        >
                      }
                    </p>
                    <p class="truncate text-[14px] text-(--riv-card-ink-soft)">
                      {{ op.contactEmail ?? '—' }}
                    </p>
                  </div>

                  @if (isSelf(op)) {
                    <p
                      class="text-[14px] text-(--riv-card-ink-soft)"
                      [attr.data-testid]="'admin-self-' + op.id"
                    >
                      This is you
                    </p>
                  } @else if (op.suspended) {
                    <button
                      type="button"
                      [attr.data-testid]="'admin-reinstate-' + op.id"
                      [disabled]="actingId() !== undefined"
                      (click)="reinstate(op.id)"
                      class="rounded-[10px] border border-(--riv-field-border) px-4 py-2 text-[14px] font-semibold text-(--riv-card-ink) disabled:opacity-60"
                    >
                      Reinstate
                    </button>
                  } @else if (confirmingId() === op.id) {
                    <div class="w-full">
                      <p class="text-[14px] text-(--riv-card-ink)">Suspend {{ op.username }}?</p>
                      <label
                        [attr.for]="'admin-suspend-reason-' + op.id"
                        class="mt-2 block text-[13.5px] font-semibold text-(--riv-card-ink)"
                        >Reason (optional)</label
                      >
                      <input
                        type="text"
                        maxlength="500"
                        [attr.id]="'admin-suspend-reason-' + op.id"
                        [attr.data-testid]="'admin-suspend-reason-' + op.id"
                        [value]="suspendReason()"
                        (input)="onSuspendReasonTyped($event)"
                        placeholder="e.g. repeated guest reports — sets not honored"
                        class="mt-1 w-full rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[14px] text-(--riv-card-ink)"
                      />
                      <div class="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          [attr.data-testid]="'admin-suspend-confirm-' + op.id"
                          [disabled]="actingId() !== undefined"
                          (click)="suspend(op.id)"
                          class="rounded-[10px] border border-[#b3261e] px-4 py-2 text-[14px] font-semibold text-[#b3261e] disabled:opacity-60"
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          [attr.data-testid]="'admin-suspend-cancel-' + op.id"
                          (click)="cancelSuspend(op.id)"
                          class="rounded-[10px] px-3 py-2 text-[14px] font-semibold text-(--riv-card-ink-soft)"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  } @else {
                    <button
                      type="button"
                      [attr.data-testid]="'admin-suspend-' + op.id"
                      [disabled]="actingId() !== undefined"
                      (click)="askToSuspend(op.id)"
                      class="rounded-[10px] border border-(--riv-field-border) px-4 py-2 text-[14px] font-semibold text-(--riv-card-ink) disabled:opacity-60"
                    >
                      Suspend
                    </button>
                  }
                </li>
              }
            </ul>
          }
        }
      }
    </section>
  `,
})
export class AdminOperators {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminOperatorsService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly pending = signal<PendingOperatorView[]>([]);
  protected readonly accounts = signal<OperatorAccountView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  /** The id currently being acted on, so the row's buttons disable during the round-trip. */
  protected readonly actingId = signal<number | undefined>(undefined);
  /** The row awaiting a second click to confirm suspension — inline, so the action stays in place. */
  protected readonly confirmingId = signal<number | undefined>(undefined);
  /** The armed confirmation's optional grounds (#519); cleared on arm, dismiss, and confirm. */
  protected readonly suspendReason = signal('');
  /**
   * Whether the lists above came from a read that actually succeeded. The lists start empty and are
   * emptied again on failure, so without this the stat strip would render a confident `0` for a
   * queue it has simply not read yet — and an empty queue is a real, common state (A9, #348).
   */
  private readonly countsKnown = signal(false);

  /** The three operator counts the A9 stat strip renders; `undefined` means "not known", never 0. */
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
    await this.act(id, () => this.service.approve(id));
  }

  protected async reject(id: number): Promise<void> {
    await this.act(id, () => this.service.reject(id));
  }

  /**
   * Arm the confirmation and put focus on it. Arming and dismissing each destroy the element that
   * was just activated, which strands keyboard/AT focus on `<body>` unless it is moved deliberately
   * (WCAG 2.4.3 — the recurring #148/#351/#462 class, handled as in #505). Only these two
   * transitions are covered here: #505's third — parking focus once the action settles — spans all
   * four row actions on this page and is deferred with that class (#519 plan, Non-goals).
   */
  protected askToSuspend(id: number): void {
    this.confirmingId.set(id);
    this.suspendReason.set('');
    this.focusAfterRender(`admin-suspend-confirm-${id}`);
  }

  protected cancelSuspend(id: number): void {
    this.confirmingId.set(undefined);
    this.suspendReason.set('');
    this.focusAfterRender(`admin-suspend-${id}`);
  }

  protected onSuspendReasonTyped(event: Event): void {
    this.suspendReason.set((event.target as HTMLInputElement).value);
  }

  protected async suspend(id: number): Promise<void> {
    // #519: typed grounds ride the suspension into the audit trail; no grounds → the 1-arg call.
    const grounds = this.suspendReason().trim();
    this.suspendReason.set('');
    await this.act(id, () =>
      grounds === '' ? this.service.suspend(id) : this.service.suspend(id, grounds),
    );
  }

  protected async reinstate(id: number): Promise<void> {
    await this.act(id, () => this.service.reinstate(id));
  }

  /** Run a decision, then RECONCILE the queue from the server (never a local-only card removal). */
  private async act(id: number, action: () => Promise<void>): Promise<void> {
    if (this.actingId() !== undefined) {
      return;
    }
    this.actingId.set(id);
    this.confirmingId.set(undefined);
    try {
      await action();
    } catch {
      // A 409 (already decided) / 404 (gone) resolves itself on the reload below; a transport error
      // surfaces as the load error. Either way, re-fetch the authoritative queue.
    } finally {
      this.actingId.set(undefined);
      await this.load();
    }
  }

  /** Move focus to a test-id'd element once the swap it belongs to has actually rendered. */
  private focusAfterRender(testId: string): void {
    afterNextRender(
      {
        earlyRead: () =>
          this.hostRef.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`),
        write: (target) => target?.focus(),
      },
      { injector: this.injector },
    );
  }
}
