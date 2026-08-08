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
 * HTTP client for the admin console's venue-commission surface, against the two ADMIN-gated
 * endpoints it wraps. Stateless: the session cookie + CSRF header are added by
 * {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>Two consumers: the Commissions tab, which reads and writes, and the console home's
 * stat strip, which only calls {@link venues} for the venue count and the mean of their rates. The
 * strip deliberately reuses this client rather than adding a second one for the same endpoint.</p>
 *
 * <p><strong>One type and one parse for both calls.</strong> The write answers the same object shape
 * as one list element, which is what lets the caller splice the response into the list it already
 * holds rather than re-reading. Both paths go through {@link toVenueCommission}, so a spliced row and
 * a listed row cannot diverge in shape — and an added wire field is dropped here rather than leaking
 * into the page as an untyped extra.
 *
 * <p><strong>The write is a plain `put`, deliberately.</strong> `httpResource` models a reactive read;
 * the guide's own tip is to <em>"avoid using httpResource for mutations like POST or PUT. Instead,
 * prefer directly using the underlying HttpClient APIs"</em>
 * (angular.dev/guide/http/http-resource — <em>Using httpResource</em>).
 *
 * <p>Unlike the photo-moderation twin, this surface does not blur venue existence: an unknown id
 * answers `404 NO_SUCH_VENUE` and the caller reports it distinctly, because an admin correcting a
 * rate needs a mistyped or stale id to fail loudly.
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
   * Move one venue's rate, answering the venue as it now stands. The request carries basis points
   * only — never a percent — and no effective date: the schedule is forward-only and computed
   * server-side, so a caller cannot backdate a rate (invariant #9).
   *
   * <p>A non-blank `reason` rides the {@link AUDIT_REASON_HEADER} into the audit trail; header
   * values must be Latin-1, so anything outside it becomes a space rather than an aborted request.
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
 * Map a rate-write failure to a {@link CommissionWriteError}. Kept beside the calls, mirroring
 * `venueProfileErrorOf`, so the page never handles an `HttpErrorResponse` itself. `NO_SUCH_VENUE`
 * earns its own value because this endpoint deliberately does not blur venue existence: a stale or
 * mistyped id must read as "that venue is gone", not as the generic failure a retry would be
 * sensible against.
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
