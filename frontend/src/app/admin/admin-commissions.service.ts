import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import { VenueCommissionView } from './admin.model';

/** What went wrong on a rate write, as the console needs to tell it apart (RFC-7807 `code`). */
export type CommissionWriteError = 'NO_SUCH_VENUE' | 'INVALID_REQUEST' | 'UNKNOWN';

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/** The wire shape of `GET /api/admin/venues` — an object wrapping the array, so a page window can be added later. */
interface AdminVenueCommissionsResponse {
  readonly venues: readonly VenueCommissionView[];
}

/**
 * Stateless HTTP client for the ADMIN-gated venue-commission endpoints, used by the Commissions tab
 * and, for {@link venues} only, the console home's stat strip. Both calls parse through
 * {@link toVenueCommission}, so the write's answer splices into the held list without a re-read and
 * cannot diverge from a listed row. The write stays a plain `put`: Angular's guide reserves
 * `httpResource` for reads (angular.dev/guide/http/http-resource).
 */
@Service()
export class AdminCommissionsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Every venue with the rate the platform currently takes from it. */
  venues(): Promise<readonly VenueCommissionView[]> {
    return firstValueFrom(
      this.http
        .get<AdminVenueCommissionsResponse>(`${this.base}/api/admin/venues`)
        .pipe(map((response) => response.venues.map(toVenueCommission))),
    );
  }

  /**
   * Move one venue's rate, answering the venue as it now stands. Sends basis points, never a date:
   * the schedule is forward-only and server-computed (invariant #9). A non-blank `reason` rides
   * {@link AUDIT_REASON_HEADER}; non-Latin-1 characters become spaces, not an aborted request.
   */
  setCommission(
    venueId: number,
    commissionBps: number,
    reason?: string,
  ): Promise<VenueCommissionView> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http
        .put<VenueCommissionView>(
          `${this.base}/api/admin/venues/${venueId}/commission`,
          { commissionBps },
          { headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {} },
        )
        .pipe(map(toVenueCommission)),
    );
  }
}

/**
 * Map a rate-write failure to a {@link CommissionWriteError}, so the page never handles an
 * `HttpErrorResponse`. `NO_SUCH_VENUE` stays distinct: this endpoint does not blur venue existence,
 * so a stale or mistyped id reads as "that venue is gone", not as a failure worth retrying.
 */
export function commissionWriteErrorOf(error: unknown): CommissionWriteError {
  if (!(error instanceof HttpErrorResponse)) {
    return 'UNKNOWN';
  }
  const code = problemCodeOf(error);
  return code === 'NO_SUCH_VENUE' || code === 'INVALID_REQUEST' ? code : 'UNKNOWN';
}

/** The one parse — narrows a wire object to exactly the fields the page renders. */
function toVenueCommission(wire: VenueCommissionView): VenueCommissionView {
  return {
    venueId: wire.venueId,
    name: wire.name,
    beach: wire.beach,
    commissionBps: wire.commissionBps,
    payoutCurrency: wire.payoutCurrency,
  };
}
