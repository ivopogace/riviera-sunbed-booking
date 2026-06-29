import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { OperatorAuth } from './operator-auth';

/** The venue write API path prefix; reads under it are public, writes require the operator. */
const VENUE_API_PATH = '/api/venues';

/**
 * Attaches the operator's Basic credentials to venue **write** requests (U7). The U1 read API is
 * public, so `GET` is never touched; non-venue API calls (bookings, payments) are untouched too.
 * When no operator is signed in, the request goes out unchanged and the server answers `401` — the
 * editor surfaces that as a sign-in prompt rather than the interceptor inventing a credential.
 */
export const operatorAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method === 'GET' || !req.url.includes(VENUE_API_PATH)) {
    return next(req);
  }
  const header = inject(OperatorAuth).basicAuthHeader();
  if (!header) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: header } }));
};
