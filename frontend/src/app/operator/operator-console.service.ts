import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import { apiPhotoUrl } from '../shared/photo-url';
import { MoneyView } from '../shared/money';
import {
  BeachMapLayoutRequest,
  CheckInErrorCode,
  CheckInResultView,
  ConsoleDailyBooking,
  LayoutErrorCode,
  MarkErrorCode,
  PayoutErrorCode,
  PayoutLedgerView,
  PendingRequestItem,
  ReleaseErrorCode,
  RepriceErrorCode,
  RequestDecision,
  RequestErrorCode,
  SetDayState,
  SlotPhotoView,
  TakingsView,
  VenueProfileErrorCode,
  VenueProfileUpdate,
  VenueProfileView,
  WeatherRefundResult,
} from './operator-console.model';

/**
 * The operator console's own read/write surface — the stats strip, the daily view, and the
 * Requests queue all read and write through here.
 *
 * <p>Single responsibility — HTTP only (no UI state; the badge count lives in
 * {@link import('./pending-requests-store').PendingRequestsStore}). The console is the successor to the
 * retired `StaffDaily` page: the full Request-to-Book client (`pendingRequests` /
 * `acceptRequest` / `declineRequest`) lives here, not in a separate `staff` feature — the one-way
 * frontend import rule forbids one feature folder depending on another. Every endpoint is
 * owner-asserted server-side (invariant #13); the session cookie + CSRF ride the `apiSessionInterceptor`.
 */
@Service()
export class OperatorConsoleService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** The venue's pending booking requests, sorted server-side by response deadline. */
  pendingRequests(venueId: number): Observable<PendingRequestItem[]> {
    return this.http.get<PendingRequestItem[]>(
      `${this.base}/api/venues/${venueId}/booking-requests`,
    );
  }

  /** The count of pending booking requests for the venue — the Requests tab badge. */
  pendingRequestCount(venueId: number): Observable<number> {
    return this.pendingRequests(venueId).pipe(map((requests) => requests.length));
  }

  /**
   * Accept a pending request → `AWAITING_PAYMENT` (the guest is asked to pay) or
   * `CONFIRMED` (stub payment profile). Accept only moves the guest into the pay window — the booking
   * is confirmed by the signature-verified Stripe webhook, never by this call (invariant #8).
   */
  acceptRequest(venueId: number, bookingId: number): Observable<RequestDecision> {
    return this.http.post<RequestDecision>(
      `${this.base}/api/venues/${venueId}/booking-requests/${bookingId}/accept`,
      {},
    );
  }

  /** Decline a pending request → `DECLINED`; the soft-held set is freed server-side. */
  declineRequest(venueId: number, bookingId: number): Observable<RequestDecision> {
    return this.http.post<RequestDecision>(
      `${this.base}/api/venues/${venueId}/booking-requests/${bookingId}/decline`,
      {},
    );
  }

  /** The count of confirmed online bookings for the venue on `date` — the "Booked online" tile. */
  dailyBookingCount(venueId: number, date: string): Observable<number> {
    return this.http
      .get<readonly unknown[]>(`${this.base}/api/venues/${venueId}/bookings`, {
        params: new HttpParams().set('date', date),
      })
      .pipe(map((bookings) => bookings.length));
  }

  /**
   * The venue's held sets for `date` with their authoritative state tokens —
   * `BOOKED_ONLINE` (any online hold, paid or not) vs `STAFF_MARKED`; a free set is absent.
   * Owner-asserted server-side (invariant #13). The Daily view's tile classification and the
   * strip's Walk-ins tile read this instead of deriving from `taken − confirmed bookings`.
   */
  dailyAvailability(venueId: number, date: string): Observable<SetDayState[]> {
    return this.http.get<SetDayState[]>(`${this.base}/api/venues/${venueId}/availability`, {
      params: new HttpParams().set('date', date),
    });
  }

  /**
   * The venue's online takings for `date` — gross + net-after-commission (server-computed, invariant
   * #9). The "Online takings today" tile; an indicative per-service-date figure, not the ledger.
   */
  dailyTakings(venueId: number, date: string): Observable<TakingsView> {
    return this.http.get<TakingsView>(`${this.base}/api/venues/${venueId}/takings`, {
      params: new HttpParams().set('date', date),
    });
  }

  /**
   * Replace the venue's whole beach-map layout in one write. Server-side it is owner-asserted
   * (invariant #13) and reject-unless-unclaimed (invariants #2/#3) — a `LAYOUT_IN_USE` failure means the
   * venue has bookings or holds and its layout is locked. `204` on success.
   */
  replaceLayout(venueId: number, request: BeachMapLayoutRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/api/venues/${venueId}/beach-map`, request);
  }

  /**
   * Reprice every set in one beach-map row. Non-destructive and owner-asserted server-side
   * (invariant #13); `price` is integer minor units + ISO currency (invariant #5). `expectedVersion` is
   * the required optimistic-concurrency token (`setVersion`) the tab loaded — a stale token is
   * rejected `409 STALE_WRITE`, a missing one `400`. `204` on success.
   */
  repriceRow(
    venueId: number,
    rowLabel: string,
    price: MoneyView,
    expectedVersion: number,
  ): Observable<void> {
    return this.http.put<void>(
      `${this.base}/api/venues/${venueId}/rows/${encodeURIComponent(rowLabel)}/price`,
      { price, expectedVersion },
    );
  }

  /**
   * Check a guest in by scanned or typed booking code: the guarded `CONFIRMED -> COMPLETED`
   * transition, single-use and service-date-only server-side. The code rides the URL path (the
   * platform's standing code-in-path contract) and never appears in an error body or a log.
   */
  checkIn(venueId: number, code: string): Observable<CheckInResultView> {
    return this.http.post<CheckInResultView>(
      `${this.base}/api/venues/${venueId}/bookings/${encodeURIComponent(code)}/check-in`,
      null,
    );
  }

  /**
   * The venue's settled bookings for `date` — confirmed, checked-in and no-show alike — each as
   * `(setId, code, status)`, the Daily view's Arrivals list. Owner-asserted server-side (invariant #13); the code is
   * display-only (invariant #7) — shown for arrival verification, never logged.
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

  /**
   * The venue's payout ledger — accruals + reversals with the server-authoritative net owed
   * (`netOwedMinor`, invariant #9). Owner-asserted server-side (invariant #13); money is integer minor
   * units (invariant #5) rendered by the tab, never computed; carries no booking code / guest identity
   * (invariants #7/#11).
   */
  payoutLedger(venueId: number): Observable<PayoutLedgerView> {
    return this.http.get<PayoutLedgerView>(`${this.base}/api/venues/${venueId}/payout-ledger`);
  }

  /**
   * Issue a **full weather refund** for every CONFIRMED booking on `venueId`+`date` (invariant
   * #10) — admin-triggered, whole-day, regardless of the cutoff. The server decides + executes the
   * refund (via the Stripe webhook path, invariant #8) and posts the payout reversal (invariant
   * #9); this only triggers it. `date` is a required query param (no implicit "today").
   * Owner-asserted (invariant #13);
   * idempotent server-side (a re-run refunds nothing already cancelled).
   */
  weatherRefund(venueId: number, date: string): Observable<WeatherRefundResult> {
    return this.http.post<WeatherRefundResult>(
      `${this.base}/api/venues/${venueId}/weather-refund`,
      null,
      { params: new HttpParams().set('date', date) },
    );
  }

  /**
   * The owner's venue admin profile — the editable core + the read-only commission +
   * payout currency the Venue tab pre-fills. Operator-gated + owner-asserted server-side (invariant
   * #13); the endpoint sits ABOVE the public venue GET so commission never leaks to the tourist read.
   */
  venueProfile(venueId: number): Observable<VenueProfileView> {
    return this.http.get<VenueProfileView>(`${this.base}/api/venues/${venueId}/profile`).pipe(
      // Preview paths resolve against the API origin (no-op same-origin prod).
      map((profile) => ({
        ...profile,
        photos: {
          cover: resolveSlotPhoto(profile.photos.cover),
          sunbeds: resolveSlotPhoto(profile.photos.sunbeds),
          bar: resolveSlotPhoto(profile.photos.bar),
        },
      })),
    );
  }

  /**
   * Save the venue's editable profile — REPLACES it (the form re-sends every field).
   * Owner-asserted server-side (invariant #13); commission + payout currency are read-only and never
   * sent (invariant #9). `204` on success; an unknown amenity code / bad field is `400` (§6b).
   */
  updateVenueProfile(venueId: number, request: VenueProfileUpdate): Observable<void> {
    return this.http.patch<void>(`${this.base}/api/venues/${venueId}`, request);
  }
}

/** {@link apiPhotoUrl} over one slot's preview; an empty slot (`null` URL) passes through. */
function resolveSlotPhoto(slot: SlotPhotoView): SlotPhotoView {
  return { previewUrl: slot.previewUrl === null ? null : apiPhotoUrl(slot.previewUrl) };
}

/** Map a venue-details load/save failure to a known {@link VenueProfileErrorCode} (RFC-7807 `code`; or 401). */
export function venueProfileErrorOf(error: unknown): VenueProfileErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'NOT_VENUE_OWNER':
      case 'NO_SUCH_VENUE':
      case 'INVALID_REQUEST':
      case 'STALE_WRITE':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/**
 * Map a Payouts-tab failure — a ledger read or a weather refund — to a known {@link PayoutErrorCode}
 * (RFC-7807 `code`; or 401). One mapper for both: 403 `NOT_VENUE_OWNER` (invariant #13) and 401 are
 * the only outcomes the tab distinguishes; everything else is generic operator copy.
 */
export function payoutErrorOf(error: unknown): PayoutErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    if (problemCodeOf(error) === 'NOT_VENUE_OWNER') {
      return 'NOT_VENUE_OWNER';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of a walk-in mark to a known {@link MarkErrorCode} (RFC-7807 `code`; or 401). */
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
      case 'STALE_WRITE':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of the layout write to a known {@link LayoutErrorCode} (RFC-7807 `code`). */
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
      case 'STALE_WRITE':
      case 'INVALID_REQUEST':
      case 'CONFLICT':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** Map an HTTP failure of a check-in to a known {@link CheckInErrorCode} (RFC-7807 `code`; or 401). */
export function checkInErrorOf(error: unknown): CheckInErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'ALREADY_CHECKED_IN':
      case 'WRONG_SERVICE_DATE':
      case 'BOOKING_NOT_FOUND':
      case 'NOT_VENUE_OWNER':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

/** The `bookingDate` extension a WRONG_SERVICE_DATE problem carries, for the operator's message. */
export function checkInWrongDateOf(error: unknown): string | undefined {
  if (error instanceof HttpErrorResponse && typeof error.error === 'object' && error.error !== null) {
    const date = (error.error as { bookingDate?: unknown }).bookingDate;
    return typeof date === 'string' ? date : undefined;
  }
  return undefined;
}
