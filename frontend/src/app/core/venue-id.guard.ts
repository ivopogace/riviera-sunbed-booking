import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { idParam } from '../shared/parent-venue-id';

/** Where a malformed console link lands. `app.routes.ts` registers the page at this path. */
export const VENUE_NOT_FOUND_PATH = 'operator/venue-not-found';

/**
 * Gate on `/operator/:venueId`: the segment must be a positive integer, or the navigation is
 * redirected to the venue-not-found page — so no console component ever sees an id it cannot use.
 *
 * <p>It applies {@link idParam}, the same rule the console's own signals apply, at the only place
 * that can act on the answer: the route owns `:venueId` validity, not a component template
 * (ADR-0023).
 *
 * <p>Ordered BEFORE `operatorSessionGuard` on the route: the segment is malformed whoever is
 * asking, so a signed-out visitor is sent to sign in for the page rather than for a link that can
 * never work.
 *
 * <p>Returns a `UrlTree` rather than `false` + an imperative `navigate`, as
 * {@link operatorSessionGuard} also does, per the Angular router guide.
 */
export const venueIdGuard: CanActivateFn = (route) => {
  // inject() first: the injection context is only alive synchronously inside the guard call.
  const router = inject(Router);

  return (
    idParam(route.paramMap, 'venueId') !== undefined || router.parseUrl(`/${VENUE_NOT_FOUND_PATH}`)
  );
};
