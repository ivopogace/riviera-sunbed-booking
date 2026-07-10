import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import { MoneyView } from '../venue/venue.model';
import {
  BeachMapLayoutRequest,
  ConsoleDailyBooking,
  LayoutErrorCode,
  MarkErrorCode,
  PendingRequestItem,
  ReleaseErrorCode,
  RepriceErrorCode,
  RequestDecision,
  RequestErrorCode,
  TakingsView,
} from './operator-console.model';

/**
 * The operator console's own read/write surface (issue #170; #171 the stats strip; #175 the daily
 * view; #176 the Requests queue).
 *
 * <p>Single responsibility — HTTP only (no UI state; the badge count lives in
 * {@link import('./pending-requests-store').PendingRequestsStore}). The console is the successor to the
 * retired `StaffDaily` page: since O6 (#176) the full Request-to-Book client (`pendingRequests` /
 * `acceptRequest` / `declineRequest`) lives here, not in a separate `staff` feature — the one-way
 * frontend import rule forbids one feature folder depending on another. Every endpoint is
 * owner-asserted server-side (invariant #13); the session cookie + CSRF ride the `apiSessionInterceptor`.
 */
@Service()
export class OperatorConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** The venue's pending booking requests, sorted server-side by response deadline (issue #98). */
  pendingRequests(venueId: number): Observable<PendingRequestItem[]> {
    return this.http.get<PendingRequestItem[]>(
      `${this.base}/api/venues/${venueId}/booking-requests`,
    );
  }

  /** The count of pending booking requests for the venue — the Requests tab badge (issue #170). */
  pendingRequestCount(venueId: number): Observable<number> {
    return this.pendingRequests(venueId).pipe(map((requests) => requests.length));
  }

  /**
   * Accept a pending request (issue #98) → `AWAITING_PAYMENT` (the guest is asked to pay) or
   * `CONFIRMED` (stub payment profile). Accept only moves the guest into the pay window — the booking
   * is confirmed by the signature-verified Stripe webhook, never by this call (invariant #8).
   */
  acceptRequest(venueId: number, bookingId: number): Observable<RequestDecision> {
    return this.http.post<RequestDecision>(
      `${this.base}/api/venues/${venueId}/booking-requests/${bookingId}/accept`,
      {},
    );
  }

  /** Decline a pending request (issue #98) → `DECLINED`; the soft-held set is freed server-side. */
  declineRequest(venueId: number, bookingId: number): Observable<RequestDecision> {
    return this.http.post<RequestDecision>(
      `${this.base}/api/venues/${venueId}/booking-requests/${bookingId}/decline`,
      {},
    );
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

  /**
   * Replace the venue's whole beach-map layout in one write (O3, #172). Server-side it is owner-asserted
   * (invariant #13) and reject-unless-unclaimed (invariants #2/#3) — a `LAYOUT_IN_USE` failure means the
   * venue has bookings or holds and its layout is locked. `204` on success.
   */
  replaceLayout(venueId: number, request: BeachMapLayoutRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/api/venues/${venueId}/beach-map`, request);
  }

  /**
   * Reprice every set in one beach-map row (O4, #174). Non-destructive and owner-asserted server-side
   * (invariant #13); `price` is integer minor units + ISO currency (invariant #5). `204` on success.
   */
  repriceRow(venueId: number, rowLabel: string, price: MoneyView): Observable<void> {
    return this.http.put<void>(
      `${this.base}/api/venues/${venueId}/rows/${encodeURIComponent(rowLabel)}/price`,
      { price },
    );
  }

  /**
   * The venue's CONFIRMED online bookings for `date`, each as `(setId, code)` — the Daily view's
   * Arrivals list (O5, #175). Owner-asserted server-side (invariant #13); the code is display-only
   * (invariant #7) — shown for arrival verification, never logged.
   */
  dailyBookings(venueId: number, date: string): Observable<ConsoleDailyBooking[]> {
    return this.http.get<ConsoleDailyBooking[]>(`${this.base}/api/venues/${venueId}/bookings`, {
      params: new HttpParams().set('date', date),
    });
  }

  /**
   * Mark `(setId, date)` as a staff walk-in (`STAFF_MARKED`) — the second writer to the availability
   * source of truth (invariant #2), unchanged from the legacy staff view. Owner-asserted server-side
   * (invariant #13); `409 ALREADY_TAKEN` if the set is already held, `422 DATE_IN_PAST` past cutoff.
   */
  markSet(venueId: number, setId: number, date: string): Observable<void> {
    return this.http.post<void>(`${this.base}/api/venues/${venueId}/sets/${setId}/availability`, {
      date,
    });
  }

  /**
   * Release a staff mark on `(setId, date)`. Owner-asserted server-side (invariant #13); the server
   * deletes only a `STAFF_MARKED` row (an online-held set is never freed here), so a mis-tap is a
   * safe no-op (`409 NOT_MARKED`).
   */
  releaseSet(venueId: number, setId: number, date: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/venues/${venueId}/sets/${setId}/availability`, {
      params: new HttpParams().set('date', date),
    });
  }
}

/** Map an HTTP failure of a walk-in mark to a known {@link MarkErrorCode} (RFC-7807 `code`, #97; or 401). */
export function markErrorOf(error: unknown): MarkErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'ALREADY_TAKEN':
      case 'DATE_IN_PAST':
      case 'NO_SUCH_SET':
      case 'NO_SUCH_VENUE':
      case 'NOT_VENUE_OWNER':
      case 'INVALID_REQUEST':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of a staff release to a known {@link ReleaseErrorCode} (RFC-7807 `code`; or 401). */
export function releaseErrorOf(error: unknown): ReleaseErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'NOT_MARKED':
      case 'NOT_VENUE_OWNER':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of an accept/decline to a known {@link RequestErrorCode} (RFC-7807 `code`; or 401). */
export function requestErrorOf(error: unknown): RequestErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'NO_SUCH_REQUEST':
      case 'REQUEST_NOT_PENDING':
      case 'REQUEST_EXPIRED':
      case 'PAYMENT_INIT_FAILED':
      case 'NOT_VENUE_OWNER':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of the per-row reprice to a known {@link RepriceErrorCode} (RFC-7807 `code`). */
export function repriceErrorOf(error: unknown): RepriceErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'NOT_VENUE_OWNER':
      case 'NO_SUCH_ROW':
      case 'NO_SUCH_VENUE':
      case 'INVALID_REQUEST':
      case 'CONFLICT':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of the layout write to a known {@link LayoutErrorCode} (RFC-7807 `code`, issue #97). */
export function layoutErrorOf(error: unknown): LayoutErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'LAYOUT_IN_USE':
      case 'DUPLICATE_POSITION':
      case 'CELL_TAKEN':
      case 'EMPTY_LAYOUT':
      case 'LAYOUT_TOO_LARGE':
      case 'NO_SUCH_VENUE':
      case 'INVALID_REQUEST':
      case 'CONFLICT':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
