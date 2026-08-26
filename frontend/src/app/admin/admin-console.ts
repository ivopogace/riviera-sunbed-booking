import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { AdminConsoleTabs } from './admin-console-tabs';
import { AdminForbidden } from './admin-forbidden';

/**
 * Per-tab copy and test ids the shell renders around whichever child route is active, carried on
 * that child route's `data.adminTab` (`app.routes.ts`) so the shell needs no per-tab
 * special-casing of its own.
 */
export interface AdminTabRouteData {
  readonly title: string;
  readonly titleId: string;
  readonly maxWidthClass: string;
  readonly signInCopy: string;
  readonly restoringTestId: string;
  readonly signedOutTestId: string;
  readonly forbiddenTestId: string;
}

/** Used only if a route somehow activates this shell with no matching `data.adminTab` child. */
const FALLBACK_TAB: AdminTabRouteData = {
  title: 'Admin',
  titleId: 'admin-console-title',
  maxWidthClass: 'max-w-[860px]',
  signInCopy: 'Sign in as an admin to continue.',
  restoringTestId: 'admin-console-restoring',
  signedOutTestId: 'admin-console-signed-out',
  forbiddenTestId: 'admin-console-forbidden',
};

/**
 * The admin console shell — the one persistent host for every `/admin/*` tab (Operators,
 * Commissions, Email, Refunds, Photos, Privacy, Audit), each a child route. Owns what every tab
 * used to repeat identically: the self-gate on {@link OperatorAuth} (loading / signed-out /
 * forbidden — UX only, the backend `/api/admin/**` role gate does the actual enforcing) and
 * {@link AdminConsoleTabs}, both read once per navigation from the active child's
 * `data.adminTab` rather than duplicated per page.
 *
 * <p><strong>Why a shell, not per-page duplication.</strong> Before this, every `/admin/*` route
 * was its own top-level page, so the tab strip was destroyed and recreated on every tab click —
 * losing its scroll position and resetting it from scratch each time. A shell wrapping child
 * routes is the operator console's own shape (`riviera-frontend`: "the one nested child-route
 * tree... follow that shape for further tabbed sub-apps"), so the tab strip now stays mounted
 * across the whole console and behaves exactly like the operator console's.
 *
 * <p>The gate stays here as an `@if` chain, not a route guard: unlike {@code operatorSessionGuard}
 * (which redirects), a signed-out visitor is allowed to LAND on any `/admin/*` URL — just not
 * shown what is behind it. The tab strip and the active child's `<router-outlet>` render only
 * past that gate, so a signed-out visitor is never told which admin surfaces exist.
 */
@Component({
  selector: 'app-admin-console',
  imports: [AdminForbidden, RouterLink, RouterOutlet, AdminConsoleTabs],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section
      [class]="'mx-auto px-4 py-10 ' + tab().maxWidthClass"
      [attr.aria-labelledby]="tab().titleId"
    >
      <h1 [id]="tab().titleId" class="text-[24px] font-semibold text-riv-ink">{{ tab().title }}</h1>

      @if (auth.restoring()) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" [attr.data-testid]="tab().restoringTestId">
          Loading…
        </p>
      } @else if (!auth.signedIn()) {
        <p class="mt-4 text-[15px] text-riv-ink-soft" [attr.data-testid]="tab().signedOutTestId">
          {{ tab().signInCopy }}
          <a
            routerLink="/account/sign-in"
            [queryParams]="{ audience: 'operator', returnUrl: currentUrl() }"
            class="font-semibold underline"
            >Sign in</a
          >
        </p>
      } @else if (!auth.isAdmin()) {
        <p appAdminForbidden [testId]="tab().forbiddenTestId"></p>
      } @else {
        <app-admin-console-tabs label="Admin console sections" />
        <router-outlet />
      }
    </section>
  `,
})
export class AdminConsole {
  protected readonly auth = inject(OperatorAuth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tab = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.activeTabData()),
    ),
    { initialValue: this.activeTabData() },
  );

  protected readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private activeTabData(): AdminTabRouteData {
    return (
      (this.route.snapshot.firstChild?.data['adminTab'] as AdminTabRouteData | undefined) ??
      FALLBACK_TAB
    );
  }
}
