import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  CreatedId,
  CreateVenueRequest,
  SetPositionRequest,
  VenueAdminErrorCode,
} from './venue-admin.model';

/**
 * Typed access to the U7 venue write API (operator endpoints). Single responsibility: HTTP for the
 * create-venue + per-set CRUD calls; the Basic credentials are attached by the
 * {@link import('../core/operator-auth.interceptor').operatorAuthInterceptor}, not here, and no
 * state is held. The editor owns workflow state and round-trips the result through the read API.
 */
@Service()
export class VenueAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  createVenue(request: CreateVenueRequest): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${this.base}/api/venues`, request);
  }

  addSet(venueId: number, request: SetPositionRequest): Observable<CreatedId> {
    return this.http.post<CreatedId>(`${this.base}/api/venues/${venueId}/sets`, request);
  }

  updateSet(venueId: number, setId: number, request: SetPositionRequest): Observable<void> {
    return this.http.patch<void>(`${this.base}/api/venues/${venueId}/sets/${setId}`, request);
  }

  removeSet(venueId: number, setId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/venues/${venueId}/sets/${setId}`);
  }
}

/** Map an HTTP failure to a known {@link VenueAdminErrorCode} (server `{ "error": CODE }` body). */
export function venueAdminErrorOf(error: unknown): VenueAdminErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = (error.error as { error?: string } | null)?.error;
    switch (code) {
      case 'CELL_TAKEN':
      case 'DUPLICATE_POSITION':
      case 'NO_SUCH_VENUE':
      case 'NO_SUCH_SET':
      case 'LAYOUT_CONFLICT':
      case 'INVALID_REQUEST':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
