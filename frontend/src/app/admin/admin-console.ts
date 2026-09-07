import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { currentUrl } from '../shared/current-url';
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
 * The admin console's page — the one persistent host for every `/admin/*` tab (Operators,
 * Commissions, Email, Refunds, Photos, Privacy, Audit), each a child route. Owns what every tab
 * used to repeat identically: the per-tab title and the self-gate on {@link OperatorAuth}
 * (loading / signed-out / forbidden — UX only, the backend `/api/admin/**` role gate does the
 * actual enforcing), both read once per navigation from the active child's `data.adminTab`
 * rather than duplicated per page. Its chrome — the section row with `Admin` current, the tab
 * rail (`admin-console-tabs.ts`), the footer and the porcelain pin — is the console shell's
 * (`console-shell.ts`), which the app shell wears for every route carrying `data.console`.
 *
 * <p><strong>Why a persistent host, not per-page duplication.</strong> Before this, every
 * `/admin/*` route was its own top-level page, so the gate and title were rebuilt on every tab
 * click. A host wrapping child routes is the venue console's own shape (`riviera-frontend`: "the
 * one nested child-route tree... follow that shape for further tabbed sub-apps").
 *
 * <p>The gate stays here as an `@if` chain, not a route guard: unlike {@code operatorSessionGuard}
 * (which redirects), a signed-out visitor is allowed to LAND on any `/admin/*` URL — just not
 * shown what is behind it. The active child's `<router-outlet>` renders only past that gate, and
 * the shell applies the same gate to the rail, so a signed-out visitor is never told which admin
 * surfaces exist.
 */
@Component({
  selector: 'app-admin-console',
  imports: [AdminForbidden, RouterLink, RouterOutlet],
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
        <router-outlet />
      }
    </section>
  `,
})
export class AdminConsole {
  protected readonly auth = inject(OperatorAuth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * The active child's `data.adminTab`, or {@link FALLBACK_TAB}. Keyed on
   * `Router.lastSuccessfulNavigation()`: the `route.snapshot` it walks is not a signal, and
   * reading it here is safe because the router assigns the new router state (on
   * `BeforeActivateRoutes`) before it activates the routes and sets `lastSuccessfulNavigation` on
   * the line before it emits `NavigationEnd`, so each completed navigation (a tab switch that
   * reuses this shell included) re-reads the same settled snapshot a `NavigationEnd` subscriber
   * would. The fallback until the first navigation has completed.
   */
  protected readonly tab = computed(() =>
    this.router.lastSuccessfulNavigation() === null ? FALLBACK_TAB : this.activeTabData(),
  );

  /** The page the visitor is on, from `Router.lastSuccessfulNavigation()` via the shared
   *  helper — it moves with each completed navigation and equals `router.url` once one has. */
  protected readonly currentUrl = currentUrl(this.router);

  private activeTabData(): AdminTabRouteData {
    return (
      (this.route.snapshot.firstChild?.data['adminTab'] as AdminTabRouteData | undefined) ??
      FALLBACK_TAB
    );
  }
}
