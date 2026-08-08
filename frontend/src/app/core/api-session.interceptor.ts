import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../environments/environment';

/**
 * Our API's origin+path prefix, anchored (not a bare substring) so cookies/CSRF headers are only
 * ever attached to requests that really target our backend — the same anchoring rule the retired
 * Basic interceptor enforced for the credential header.
 */
const API_PREFIX = `${environment.apiBaseUrl}/api/`;
/** Methods CSRF protects — reads never need the token. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const XSRF_COOKIE = 'XSRF-TOKEN';
const XSRF_HEADER = 'X-XSRF-TOKEN';

/**
 * Session plumbing for every API call (design D-1 — replaces the Basic-auth
 * interceptor): `withCredentials` so the browser attaches the `HttpOnly` session cookie, and the
 * CSRF cookie-to-header echo (`XSRF-TOKEN` cookie → `X-XSRF-TOKEN` header) on mutating requests.
 * No `Authorization` header is ever set — the session cookie IS the credential.
 *
 * <p>Hand-rolled rather than Angular's `withXsrfConfiguration` because the built-in XSRF support
 * skips ABSOLUTE URLs entirely — and every call here goes through `environment.apiBaseUrl`, which
 * is absolute. Reading the cookie works cross-port on localhost (cookies are port-agnostic) and
 * same-site in deployed environments (design D-7).
 */
export const apiSessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX)) {
    return next(req);
  }
  let request = req.clone({ withCredentials: true });
  if (MUTATING_METHODS.has(req.method)) {
    const token = xsrfTokenFromCookie(inject(DOCUMENT).cookie);
    if (token !== undefined) {
      request = request.clone({ setHeaders: { [XSRF_HEADER]: token } });
    }
  }
  return next(request);
};

function xsrfTokenFromCookie(cookies: string): string | undefined {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${XSRF_COOKIE}=`));
  return entry ? decodeURIComponent(entry.substring(XSRF_COOKIE.length + 1)) : undefined;
}
