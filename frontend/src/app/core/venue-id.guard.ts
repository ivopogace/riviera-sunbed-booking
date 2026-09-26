import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { idParam } from '../shared/parent-venue-id';

/** Where a malformed console link lands. `app.routes.ts` registers the page at this path. */
export const VENUE_NOT_FOUND_PATH = 'operator/venue-not-found';

/**
 * Gate on `/operator/:venueId`: a segment {@link idParam} rejects redirects to venue-not-found, so
 * no console component sees an unusable id (ADR-0023). Ordered BEFORE `operatorSessionGuard`: a
 * malformed link never works, so a signed-out visitor isn't sent to sign in for it.
 */
export const venueIdGuard: CanActivateFn = (route) => {
  // inject() first: the injection context is only alive synchronously inside the guard call.
  const router = inject(Router);

  return (
    idParam(route.paramMap, 'venueId') !== undefined || router.parseUrl(`/${VENUE_NOT_FOUND_PATH}`)
  );
};
