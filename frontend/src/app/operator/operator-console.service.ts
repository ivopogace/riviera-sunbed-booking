import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { TakingsView } from './operator-console.model';

/**
 * The operator console's own read surface (issue #170; #171 adds the stats strip's reads).
 *
 * <p>This deliberately parallels {@link import('../staff/staff.service').StaffService}'s
 * `pendingRequests`/`dailyBookings` rather than importing them: the one-way frontend import rule
 * forbids one feature folder (`operator/`) depending on another (`staff/`). The console is the
 * successor to `StaffDaily` — when O6 retires `StaffDaily`, the full Requests feature lands here and
 * this becomes its single home. Every endpoint is owner-asserted server-side (invariant #13); the
 * session cookie + CSRF ride the `apiSessionInterceptor`.
 */
@Service()
export class OperatorConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** The count of pending booking requests for the venue — the Requests tab badge. */
  pendingRequestCount(venueId: number): Observable<number> {
    return this.http
      .get<readonly unknown[]>(`${this.base}/api/venues/${venueId}/booking-requests`)
      .pipe(map((requests) => requests.length));
  }

  /** The count of confirmed online bookings for the venue on `date` — the "Booked online" tile (#171). */
  dailyBookingCount(venueId: number, date: string): Observable<number> {
    return this.http
      .get<readonly unknown[]>(`${this.base}/api/venues/${venueId}/bookings`, {
        params: new HttpParams().set('date', date),
      })
      .pipe(map((bookings) => bookings.length));
  }

  /**
   * The venue's online takings for `date` — gross + net-after-commission (server-computed, invariant
   * #9). The "Online takings today" tile (#171); an indicative per-service-date figure, not the ledger.
   */
  dailyTakings(venueId: number, date: string): Observable<TakingsView> {
    return this.http.get<TakingsView>(`${this.base}/api/venues/${venueId}/takings`, {
      params: new HttpParams().set('date', date),
    });
  }
}
