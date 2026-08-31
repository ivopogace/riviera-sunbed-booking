import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import {
  CreatedId,
  CreateVenueRequest,
  VenueAdminErrorCode,
  VenueDefaults,
} from './venue-admin.model';

/**
 * Typed access to the venue **onboarding** API: the create-venue write (`POST /api/venues`) and
 * the platform-defaults read (`GET /api/venue-defaults`) the create form discloses. Single
 * responsibility: HTTP; the session cookie + CSRF are attached by the
 * {@link import('../core/api-session.interceptor').apiSessionInterceptor}, not here, and no state is
 * held. The per-set write + profile-edit calls moved to `OperatorConsoleService` when their editing
 * surfaces graduated to console tabs.
 */
@Service()
export class VenueAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  createVenue(request: CreateVenueRequest): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${this.base}/api/venues`, request);
  }

  /** The platform terms a new venue is stamped with — the create form's disclosure source. */
  venueDefaults(): Observable<VenueDefaults> {
    return this.http.get<VenueDefaults>(`${this.base}/api/venue-defaults`);
  }
}

/** Map an onboarding HTTP failure to a known {@link VenueAdminErrorCode} (RFC-7807 `code`). */
export function venueAdminErrorOf(error: unknown): VenueAdminErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'NO_SUCH_VENUE':
      case 'INVALID_REQUEST':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
