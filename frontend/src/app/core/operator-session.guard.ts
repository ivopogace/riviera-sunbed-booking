import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { OperatorAuth } from './operator-auth';

/**
 * Gate for every operator surface (S9 #277): `/operator`, `/operator/:venueId/**` and
 * `/venue-admin`. A signed-in operator passes; anyone else is redirected to the unified auth page
 * with the operator audience preselected and a `returnUrl` back to where they were headed.
 *
 * It **awaits `whenReady()` before deciding** — the whole reason this is async. The session restore
 * (`GET /api/auth/me`) is in flight on every fresh page load, and `signedIn()` reads `false` until it
 * lands; deciding early would bounce a signed-in operator to sign-in on every reload (S9 R-1, AC-8).
 * This replaces the per-page "Checking your session…" cards the console and venue editor used to
 * render for the same reason.
 *
 * Returns a `UrlTree` rather than `false` + an imperative `navigate`, per the Angular router guide.
 */
export const operatorSessionGuard: CanActivateFn = async (_route, state) => {
  // inject() must run before the first await — the injection context is synchronous.
  const auth = inject(OperatorAuth);
  const router = inject(Router);

  await auth.whenReady();

  return (
    auth.signedIn() ||
    router.createUrlTree(['/account/sign-in'], {
      queryParams: { audience: 'operator', returnUrl: state.url },
    })
  );
};
