import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { DailyBookingItem, StaffMarkError, StaffReleaseError } from './staff.model';

/**
 * Typed access to the U8 staff endpoints: read a venue's confirmed bookings for a day, and
 * mark/release a `(set, date)` walk-in. Single responsibility — HTTP only; the operator Basic
 * credential is attached by the {@link import('../core/operator-auth.interceptor').operatorAuthInterceptor},
 * not here. `date` is an ISO `YYYY-MM-DD` string (invariant #6).
 */
@Service()
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** The venue's CONFIRMED bookings for `date`, each as `(setId, code)`. Operator-gated. */
  dailyBookings(venueId: number, date: string): Observable<DailyBookingItem[]> {
    return this.http.get<DailyBookingItem[]>(`${this.base}/api/venues/${venueId}/bookings`, {
      params: new HttpParams().set('date', date),
    });
  }

  /** Mark `(setId, date)` as a walk-in (`STAFF_MARKED`). 409 if already taken, 422 if past date. */
  mark(venueId: number, setId: number, date: string): Observable<unknown> {
    return this.http.post(
      `${this.base}/api/venues/${venueId}/sets/${setId}/availability`,
      { date },
    );
  }

  /** Release a staff mark on `(setId, date)`. 409 `NOT_MARKED` if nothing staff-marked. */
  release(venueId: number, setId: number, date: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/api/venues/${venueId}/sets/${setId}/availability`,
      { params: new HttpParams().set('date', date) },
    );
  }
}

/** Map an HTTP failure to a known {@link StaffMarkError} (`{ "error": CODE }` body, or 401). */
export function staffMarkErrorOf(error: unknown): StaffMarkError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = (error.error as { error?: string } | null)?.error;
    switch (code) {
      case 'ALREADY_TAKEN':
      case 'NO_SUCH_SET':
      case 'DATE_IN_PAST':
      case 'INVALID_REQUEST':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure to a known {@link StaffReleaseError}. */
export function staffReleaseErrorOf(error: unknown): StaffReleaseError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    if ((error.error as { error?: string } | null)?.error === 'NOT_MARKED') {
      return 'NOT_MARKED';
    }
  }
  return 'UNKNOWN';
}
