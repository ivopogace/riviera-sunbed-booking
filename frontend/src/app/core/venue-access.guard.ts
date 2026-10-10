import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { problemCodeOf } from '../shared/api-error';
import { idParam } from '../shared/parent-venue-id';
import { ConsoleVenueMap } from './console-venue-map';
import { OperatorAuth } from './operator-auth';
import { VENUE_NOT_FOUND_PATH } from './venue-id.guard';

/** The owner's read's definite answers about this venue: ownership is asserted first (invariant #13), so an unknown id is the 403 too. */
const VENUE_REFUSED_CODES = new Set(['NOT_VENUE_OWNER', 'NO_SUCH_VENUE']);

/**
 * Gate on `/operator/:venueId`, after `venueIdGuard` and `operatorSessionGuard`: the owner's beach-map read decides
 * the venue — `403 NOT_VENUE_OWNER` / `404 NO_SUCH_VENUE` land on the same page as a malformed id, anything else
 * activates (#1526); nothing is read for a malformed id or a signed-out visitor. Rationale: RESPONSIBILITIES.md §Frontend.
 */
export const venueAccessGuard: CanActivateFn = async (route) => {
  // inject() first: the injection context is only alive synchronously inside the guard call.
  const auth = inject(OperatorAuth);
  const router = inject(Router);
  const venueMap = inject(ConsoleVenueMap);

  const venueId = idParam(route.paramMap, 'venueId');
  if (venueId === undefined) {
    return true;
  }
  await auth.whenReady();
  if (!auth.signedIn()) {
    return true;
  }
  try {
    await firstValueFrom(venueMap.load(venueId));
    return true;
  } catch (error: unknown) {
    return venueRefused(error) ? router.parseUrl(`/${VENUE_NOT_FOUND_PATH}`) : true;
  }
};

function venueRefused(error: unknown): boolean {
  return error instanceof HttpErrorResponse && VENUE_REFUSED_CODES.has(problemCodeOf(error) ?? '');
}
