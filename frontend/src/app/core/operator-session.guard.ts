import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { OperatorAuth } from './operator-auth';

/**
 * Gate for every operator surface: a signed-in operator passes, anyone else goes to sign-in with
 * the operator audience and a `returnUrl`. Awaits `whenReady()` first — `signedIn()` reads `false`
 * until the `GET /api/auth/me` restore lands, so deciding early bounces operators on every reload.
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
