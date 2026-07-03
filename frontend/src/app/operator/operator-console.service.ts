import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * The operator console's own read surface (issue #170). O1 needs only the Requests-tab badge count.
 *
 * <p>This deliberately parallels {@link import('../staff/staff.service').StaffService}'s
 * `pendingRequests` rather than importing it: the one-way frontend import rule forbids one feature
 * folder (`operator/`) depending on another (`staff/`). The console is the successor to `StaffDaily`
 * — when O6 retires `StaffDaily`, the full Requests feature lands here and this becomes its single
 * home. The endpoint is owner-asserted server-side (invariant #13); the session cookie + CSRF ride
 * the `apiSessionInterceptor`.
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
}
