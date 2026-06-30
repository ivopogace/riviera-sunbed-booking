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
 * Attaches the operator's Basic credentials to venue **write** requests (U7). The U1 read API is
 * public, so `GET` is never touched; non-venue API calls (bookings, payments) and any non-backend
 * URL are untouched too. When no operator is signed in, the request goes out unchanged and the
 * server answers `401` — the editor surfaces that as a sign-in prompt rather than the interceptor
 * inventing a credential.
 */
export const operatorAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method === 'GET' || !req.url.startsWith(VENUE_API_PREFIX)) {
    return next(req);
  }
  const header = inject(OperatorAuth).basicAuthHeader();
  if (!header) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: header } }));
};
