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
 * The persistent host for every `/admin/*` tab, each a child route (`riviera-frontend` § Routing).
 * Owns the tab title and the {@link OperatorAuth} self-gate, both read per navigation from the
 * active child's `data.adminTab`; the gate is UX only, the `/api/admin/**` role gate enforces. The
 * chrome (tab rail, footer, porcelain pin) is `console-shell.ts`'s. Keep the gate an `@if` chain,
 * not a redirecting guard: a signed-out visitor may land on any `/admin/*` URL, but the outlet (and
 * the shell's rail) render only past the gate, so they never learn which admin surfaces exist.
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
   * The active child's `data.adminTab`, or {@link FALLBACK_TAB} before the first navigation. Keyed
   * on `Router.lastSuccessfulNavigation()` since `route.snapshot` is no signal; the router settles
   * the snapshot before setting it, so each completed navigation (tab switches too) re-reads it.
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
