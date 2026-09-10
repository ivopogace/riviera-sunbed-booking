import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { VenueChangeFeeView, VenueChangeRefundsView } from './admin.model';

/** The platform-admin venue-caused refunds report; ADMIN-gated server-side. */
const ADMIN_VENUE_CHANGE_REFUNDS_API = `${environment.apiBaseUrl}/api/admin/venue-change-refunds`;

/** The platform-wide venue-change fee, read and written by the same tab; ADMIN-gated server-side. */
const ADMIN_VENUE_CHANGE_FEE_API = `${environment.apiBaseUrl}/api/admin/venue-change-fee`;

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/**
 * HTTP client for the venue-caused refunds report — per venue, how many bookings a remodel refunded,
 * what they returned and what the venue paid in fees. Stateless: the session cookie + CSRF header are
 * added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>A plain `HttpClient.get` rather than `httpResource`: every sibling admin tab loads this way once
 * the session is confirmed, and `httpResource` fetches eagerly and throws on `value()` in the error
 * state (angular.dev/guide/http/http-resource), which is the opposite of the gated, error-carded
 * shape the admin shell wants.
 *
 * <p>ADMIN-gated by the backend (a non-admin operator gets 403). The report returns aggregates only
 * — never a booking id or code (invariant #7).
 *
 * <p>The fee write is a plain `put` for the same reason the read is a plain `get`: `httpResource`
 * models a reactive read, and the guide's own tip is to <em>"avoid using httpResource for mutations
 * like POST or PUT"</em> (angular.dev/guide/http/http-resource — <em>Using httpResource</em>). It
 * answers the fee as it now stands, so the caller splices the response instead of re-reading.
 */
@Service()
export class AdminVenueChangesService {
  private readonly http = inject(HttpClient);

  /** Every venue with at least one venue-caused refund, by venue id. */
  report(): Promise<VenueChangeRefundsView> {
    return firstValueFrom(this.http.get<VenueChangeRefundsView>(ADMIN_VENUE_CHANGE_REFUNDS_API));
  }

  /** The fee in force now. */
  fee(): Promise<VenueChangeFeeView> {
    return firstValueFrom(this.http.get<VenueChangeFeeView>(ADMIN_VENUE_CHANGE_FEE_API));
  }

  /**
   * Put a new fee in force, answering the fee as it now stands. It applies to every refund charged
   * after it; fees already charged keep the amount they were charged at.
   *
   * <p>A non-blank `reason` rides the {@link AUDIT_REASON_HEADER} into the audit trail; header values
   * must be Latin-1, so anything outside it becomes a space rather than an aborted request.
   */
  setFee(amountMinor: number, reason?: string): Promise<VenueChangeFeeView> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http.put<VenueChangeFeeView>(
        ADMIN_VENUE_CHANGE_FEE_API,
        { amountMinor },
        { headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {} },
      ),
    );
  }
}
