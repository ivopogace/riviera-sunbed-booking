import { Component, computed, DOCUMENT, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';

/**
 * The shared operator/admin shell header: rendered by the app shell on every route flagged
 * `data.operatorChrome` — the operator surfaces that are NOT the venue console (`/operator` landing,
 * venue onboarding, the password change, and the `/admin` console tabs). The console
 * (`/operator/:venueId`) keeps its own richer header (venue title, stats strip, tabs) and stays
 * fully chromeless via `data.operatorConsole`. Before this component those pages either wore the
 * TOURIST chrome (whose auth state is the customer session, so an admin was shown "Sign in /
 * Register" while signed in) or no chrome at all.
 *
 * <p>Mirrors the console header's links so operator navigation never dead-ends: brand back to
 * `/operator` (which resolves the venue), onboarding, Admin (admins only), password change,
 * sign-out. The `/admin` pages are reachable signed-out (they self-gate on the server's role
 * check), so a signed-out visitor gets the operator sign-in link instead of session controls.
 */
@Component({
  selector: 'app-operator-chrome',
  imports: [RouterLink],
  template: `
    <header
      class="sticky top-0 z-20 border-b border-(--riv-header-border) bg-(--riv-header-glass) backdrop-blur-[22px] backdrop-saturate-[1.7]"
      data-testid="opc-header"
    >
      <div
        class="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-3"
      >
        <a
          routerLink="/operator"
          class="text-[19px] leading-[1.15] font-bold tracking-[-0.01em] text-(--riv-ink) no-underline"
          data-testid="opc-brand"
          >Riviera <span class="font-medium text-(--riv-ink-soft)">Operator</span></a
        >

        @if (!operator.restoring()) {
          <nav class="flex flex-wrap items-center gap-3.5" aria-label="Operator">
            @if (operator.signedIn()) {
              <a
                class="text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
                routerLink="/operator"
                [queryParams]="{ create: '1' }"
                data-testid="opc-create-venue"
                >Create a venue</a
              >
              @if (operator.isAdmin()) {
                <a
                  class="text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
                  routerLink="/admin"
                  data-testid="opc-admin-link"
                  >Admin</a
                >
              }
              <a
                class="text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
                routerLink="/account/operator-password"
                data-testid="opc-change-password"
                >Change password</a
              >
              <span class="text-[13px] text-(--riv-ink-soft)" data-testid="opc-signed-in-as"
                >Signed in as <strong class="text-(--riv-ink)">{{ operator.username() }}</strong></span
              >
              <button
                type="button"
                class="cursor-pointer rounded-full border border-[rgba(12,42,51,0.14)] bg-white px-3.75 py-1.75 font-sans text-[13px] font-semibold text-(--riv-ink) shadow-[0_1px_2px_rgba(7,42,58,0.08)] transition-colors hover:bg-[#eef1f2] motion-reduce:transition-none"
                data-testid="opc-signout"
                (click)="onSignOut()"
              >
                Sign out
              </button>
            } @else {
              <a
                class="text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
                routerLink="/account/sign-in"
                [queryParams]="signInParams()"
                data-testid="opc-signin"
                >Sign in</a
              >
            }
          </nav>
        }
      </div>
    </header>
  `,
})
export class OperatorChrome {
  protected readonly operator = inject(OperatorAuth);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Sign-in carries the page as `returnUrl` — it outranks the venue-count landing rule (S9). */
  protected readonly signInParams = computed(() => ({
    audience: 'operator',
    returnUrl: this.currentUrl(),
  }));

  /** Sign out, then leave for the operator sign-in — the guarded operator routes would bounce anyway. */
  protected async onSignOut(): Promise<void> {
    // Park focus on the shell's <main> before the button unmounts (WCAG 2.4.3) — signOut() destroys it.
    this.document.querySelector<HTMLElement>('main')?.focus();
    await this.operator.signOut();
    await this.router.navigate(['/account/sign-in'], { queryParams: { audience: 'operator' } });
  }
}
