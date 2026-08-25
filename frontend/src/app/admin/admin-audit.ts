import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';

import { AdminForbidden } from './admin-forbidden';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditEntryView } from './admin.model';

/**
 * The admin console's Audit tab — the accountability record ADR-0013 requires: who did what,
 * to what, when, and (when offered) on what grounds, for every mutating `/api/admin/**` action that
 * reached past the security gate. Until this surface the trail was API/DB-readable only.
 *
 * <p><strong>A recent-actions view, deliberately.</strong> The backend serves the latest window,
 * newest first; there is no search, filter or paging at Phase 1 — an investigation needing more
 * queries the table. Failed attempts (4xx rows) render like successes with their status, because a
 * refused destructive attempt is exactly the kind of row an audit reader is looking for.
 *
 * <p>Like every admin tab, the page self-gates on {@link OperatorAuth} for UX while the backend
 * `/api/admin/**` role gate does the enforcing. Porcelain-themed to match the operator console.
 */
@Component({
  selector: 'app-admin-audit',
  imports: [AdminForbidden, RouterLink, CardGlass, AdminConsoleTabs],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section class="mx-auto max-w-[860px] px-4 py-10" aria-labelledby="admin-audit-title">
      <h1 id="admin-audit-title" class="text-[24px] font-semibold text-riv-ink">Audit</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-audit-restoring">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-audit-signed-out">
          Sign in as an admin to review recorded admin actions.
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: '/admin/audit' }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p appAdminForbidden testId="admin-audit-forbidden"></p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />

        @if (loading()) {
          <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-audit-loading">
            Loading…
          </p>
        } @else if (loadError()) {
          <p class="mt-4 text-[15px] text-[#b3261e]" role="alert" data-testid="admin-audit-error">
            Something went wrong loading the audit trail.
            <button
              type="button"
              data-touch-exempt="control inside a sentence (WCAG 2.5.5 inline exception)"
              class="font-semibold underline"
              data-testid="admin-audit-retry"
              (click)="retry()"
            >
              Retry
            </button>
          </p>
        } @else {
          <div
            appCardGlass
            class="mt-6 rounded-[14px] p-5"
            data-testid="admin-audit-card"
            aria-labelledby="admin-audit-heading"
            tabindex="-1"
          >
            <h2 id="admin-audit-heading" class="text-[16px] font-semibold text-riv-card-ink">
              Latest admin actions
            </h2>

            @if (entries().length === 0) {
              <p class="mt-2 text-[15px] text-riv-card-ink" data-testid="admin-audit-empty">
                No admin actions have been recorded yet.
              </p>
            } @else {
              <div class="mt-3 overflow-x-auto">
                <table
                  class="w-full text-left text-[14px] text-riv-card-ink"
                  aria-labelledby="admin-audit-heading"
                  data-testid="admin-audit-table"
                >
                  <thead>
                    <tr class="text-[13px] text-riv-card-ink-soft">
                      <th scope="col" class="py-1.5 pr-4 font-semibold">When</th>
                      <th scope="col" class="py-1.5 pr-4 font-semibold">Who</th>
                      <th scope="col" class="py-1.5 pr-4 font-semibold">Action</th>
                      <th scope="col" class="py-1.5 pr-4 font-semibold">Result</th>
                      <th scope="col" class="py-1.5 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of entries(); track entry.id) {
                      <tr
                        class="border-t border-riv-field-border align-top"
                        [attr.data-testid]="'admin-audit-row-' + entry.id"
                      >
                        <td class="py-2 pr-4 whitespace-nowrap">
                          {{ formatMoment(entry.occurredAt) }}
                        </td>
                        <td class="py-2 pr-4">{{ entry.actor }}</td>
                        <td class="py-2 pr-4 font-mono text-[13px]">
                          {{ entry.method }} {{ entry.path }}
                        </td>
                        <td class="py-2 pr-4">{{ entry.status }}</td>
                        <td class="py-2 max-w-[36ch]">{{ entry.reason ?? '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      }
    </section>
  `,
})
export class AdminAudit {
  protected readonly auth = inject(OperatorAuth);
  private readonly service = inject(AdminAuditService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly entries = signal<readonly AdminAuditEntryView[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);

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

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.entries.set(await this.service.latest());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Retry from the error banner. A successful retry destroys the banner — and the Retry button the
   * user just activated — so focus is parked on the card that replaces it (WCAG 2.4.3, the recurring
   * stranded-focus class, same cure as the Photos tab's confirmation swaps). The
   * initial automatic load never moves focus: only a user-initiated retry does.
   */
  protected async retry(): Promise<void> {
    await this.load();
    if (!this.loadError()) {
      afterNextRender(
        {
          earlyRead: () =>
            this.hostRef.nativeElement.querySelector<HTMLElement>(
              '[data-testid="admin-audit-card"]',
            ),
          write: (card) => card?.focus(),
        },
        { injector: this.injector },
      );
    }
  }

  /** An ISO instant as the moment an admin reads it — Europe/Tirane, the platform's civil zone. */
  protected formatMoment(isoInstant: string): string {
    return new Date(isoInstant).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Tirane',
    });
  }
}
