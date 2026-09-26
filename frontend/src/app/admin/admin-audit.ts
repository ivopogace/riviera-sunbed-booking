import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { AdminAuditService } from './admin-audit.service';
import { formatMoment } from './admin-moment';
import { AdminAuditEntryView } from './admin.model';

/**
 * The admin console's Audit tab — the ADR-0013 accountability record: who did what, to what, when
 * and (when offered) on what grounds, for every mutating `/api/admin/**` action past the gate.
 *
 * <p>A recent-actions view: newest first, no search, filter or paging. Failed attempts (4xx rows)
 * render like successes with their status (Rationale: RESPONSIBILITIES.md §audit). The
 * {@code AdminConsole} shell self-gates on {@link OperatorAuth} for UX; the backend enforces.
 */
@Component({
  selector: 'app-admin-audit',
  imports: [CardGlass],
  template: `
    @if (loading()) {
      <p class="mt-4 text-[15px] text-riv-ink-soft" data-testid="admin-audit-loading">Loading…</p>
    } @else if (loadError()) {
      <p class="mt-4 text-[15px] text-riv-error-ink" role="alert" data-testid="admin-audit-error">
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
          <!-- A phone scrolls the table sideways: a named section is a focusable region, so the keyboard can reach it too (WCAG 2.1.1). -->
          <section class="mt-3 overflow-x-auto" aria-labelledby="admin-audit-heading" tabindex="0">
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
          </section>
        }
      </div>
    }
  `,
})
export class AdminAudit {
  private readonly auth = inject(OperatorAuth);
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
   * Retry from the error banner. Success destroys the banner and its Retry button, so focus is
   * parked on the card that replaces it (WCAG 2.4.3); the initial automatic load never moves focus.
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

  protected readonly formatMoment = formatMoment;
}
