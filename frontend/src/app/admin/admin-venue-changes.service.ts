import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { VenueChangeRefundsView } from './admin.model';

/** The platform-admin venue-caused refunds report; ADMIN-gated server-side. */
const ADMIN_VENUE_CHANGE_REFUNDS_API = `${environment.apiBaseUrl}/api/admin/venue-change-refunds`;

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
 * <p>ADMIN-gated by the backend (a non-admin operator gets 403). Returns aggregates only — never a
 * booking id or code (invariant #7).
 */
@Service()
export class AdminVenueChangesService {
  private readonly http = inject(HttpClient);

  /** Every venue with at least one venue-caused refund, by venue id. */
  report(): Promise<VenueChangeRefundsView> {
    return firstValueFrom(this.http.get<VenueChangeRefundsView>(ADMIN_VENUE_CHANGE_REFUNDS_API));
  }
}
