import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminOperatorsService } from './admin-operators.service';
import { PendingOperatorView } from './admin.model';

/**
 * The platform-admin surface for approving operator self-registrations (S6 #115, design D-5). Lists the
 * PENDING operators and approves/rejects each; a decision <strong>reconciles the queue from the
 * server</strong> (re-fetch, never a local-only card removal) so a concurrently-decided or already-gone
 * row simply disappears. Self-gates on {@link OperatorAuth}: it renders the queue only for a signed-in
 * ADMIN — the backend `/api/admin/**` role gate is the real authority (a non-admin gets 403); this is
 * UX. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-operators',
  imports: [RouterLink, CardGlass],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[720px] px-4 py-10" aria-labelledby="admin-ops-title">
      <h1 id="admin-ops-title" class="text-[24px] font-semibold text-(--riv-ink)">
        Operator registrations
      </h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-restoring">Loading…</p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-signed-out">
          Sign in as an admin to review pending registrations.
          <a routerLink="/venue-admin" class="font-semibold underline">Sign in</a>
        </p>
      } @else if (!auth.isAdmin()) {
        <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-forbidden">
          You don't have access to this page.
        </p>
      } @else {
        @if (loading()) {
          <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-loading">Loading…</p>
        } @else if (loadError()) {
          <p class="mt-4 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-ops-error">
            Something went wrong loading registrations.
            <button type="button" class="font-semibold underline" (click)="reload()">Retry</button>
          </p>
        } @else if (pending().length === 0) {
          <p class="mt-4 text-[15px] text-(--riv-ink-soft)" data-testid="admin-ops-empty">
            No operators are awaiting approval.
          </p>
        } @else {
          <ul class="mt-5 flex flex-col gap-3" data-testid="admin-ops-list">
            @for (op of pending(); track op.id) {
              <li
                appCardGlass
                class="flex flex-wrap items-center justify-between gap-3 rounded-[14px] p-4"
                data-testid="admin-op-row"
              >
                <div class="min-w-0">
                  <p class="truncate text-[16px] font-semibold text-(--riv-card-ink)">{{ op.username }}</p>
                  <p class="truncate text-[14px] text-(--riv-card-ink-soft)">{{ op.contactEmail }}</p>
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
      }
    </section>
  `,
})
export class AdminOperators {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminOperatorsService);

  protected readonly pending = signal<PendingOperatorView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  /** The id currently being approved/rejected, so the row's buttons disable during the round-trip. */
  protected readonly actingId = signal<number | undefined>(undefined);

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
      this.pending.set(await this.service.pending());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async approve(id: number): Promise<void> {
    await this.act(id, () => this.service.approve(id));
  }

  protected async reject(id: number): Promise<void> {
    await this.act(id, () => this.service.reject(id));
  }

  /** Run a decision, then RECONCILE the queue from the server (never a local-only card removal). */
  private async act(id: number, action: () => Promise<void>): Promise<void> {
    if (this.actingId() !== undefined) {
      return;
    }
    this.actingId.set(id);
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
}
