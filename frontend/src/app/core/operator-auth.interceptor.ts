import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../environments/environment';
import { OperatorAuth } from './operator-auth';

/**
 * The venue write API prefix, anchored to OUR API origin. Anchoring (not a bare substring) keeps
 * the operator credential from ever being attached to an unrelated URL that merely contains
 * "/api/venues" — credentials must only travel to our backend.
 */
const VENUE_API_PREFIX = `${environment.apiBaseUrl}/api/venues`;

/**
 * Attaches the operator's Basic credentials to operator-only venue API calls: every venue **write**
 * (U7 onboarding/editing, U8 mark/release) and the one operator **read**, the U8 staff
 * daily-bookings list (booking codes are secrets, invariant #7). The public U1 reads (the venue
 * list/map `GET`s) are never touched, nor are non-venue API calls (payments) or any non-backend
 * URL. When no operator is signed in, the request goes out unchanged and the server answers `401` —
 * the surface surfaces that as a sign-in prompt rather than the interceptor inventing a credential.
 */
export const operatorAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(VENUE_API_PREFIX)) {
    return next(req);
  }
  // A public read is a GET that is NOT the staff daily-bookings list. Writes (POST/PATCH/DELETE)
  // and the `/bookings` GET are operator-gated and get the credential.
  const isPublicRead = req.method === 'GET' && !req.url.endsWith('/bookings');
  if (isPublicRead) {
    return next(req);
  }
  const header = inject(OperatorAuth).basicAuthHeader();
  if (!header) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: header } }));
};
