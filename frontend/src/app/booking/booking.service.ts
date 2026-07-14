import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { problemCodeOf } from '../shared/api-error';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingDetail,
  BookingErrorCode,
  Cancellation,
  CreateBookingRequest,
  CreateBookingResult,
  MyBookingSummary,
  PaymentHandoff,
  RequestedBooking,
} from './booking.model';

/**
 * Creates bookings against the booking API (`POST /api/bookings`) and holds the most recent
 * hand-off so the confirmation / payment routes can render after navigation. Single
 * responsibility: typed access to the booking write API + the last-result hand-off.
 *
 * <p>The create call discriminates on the HTTP status and body: `201` → the booking is already
 * `CONFIRMED` (stub/Instant profile); `202` with `AWAITING_PAYMENT` → the card must be collected
 * via Stripe (stripe profile); `202` with `PENDING_REQUEST` → a REQUEST-mode venue must accept
 * first (issue #98). The outcomes are kept in separate hand-off signals so the confirmation
 * screen never renders an unpaid booking as "Paid" (invariant #8).
 *
 * <p>Every successful create — confirmed, awaiting-payment, or requested — remembers its booking
 * code in {@link DeviceLocalBookings} so the guest's device-local "My bookings" list (#139) can
 * find it later by code (invariant #7: the code is the only key; there is no guest list endpoint).
 */
@Service()
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly device = inject(DeviceLocalBookings);

  private readonly confirmation = signal<BookingConfirmation | undefined>(undefined);
  /** The last confirmed booking (201 path), consumed by the confirmation route. */
  readonly lastConfirmation = this.confirmation.asReadonly();

  private readonly awaiting = signal<PaymentHandoff | undefined>(undefined);
  /** The last payment hand-off (202 `AWAITING_PAYMENT`, or "Pay now"), consumed by the payment route. */
  readonly lastAwaitingPayment = this.awaiting.asReadonly();

  private readonly requested = signal<RequestedBooking | undefined>(undefined);
  /** The last pending request (202 `PENDING_REQUEST` path), consumed by the requested route. */
  readonly lastRequested = this.requested.asReadonly();

  createBooking(request: CreateBookingRequest): Observable<CreateBookingResult> {
    return this.http
      .post<BookingConfirmation | AwaitingPayment | RequestedBooking>(
        `${environment.apiBaseUrl}/api/bookings`,
        request,
        { observe: 'response' },
      )
      .pipe(
        map((response): CreateBookingResult => {
          // Remember the code once, from whichever outcome — guarded against a missing body (the
          // branches below already treat `body` as nullable via `?.status`), so an empty 201/202
          // never throws here and turns a real booking into a false "failed" (#139 review).
          this.device.remember(response.body?.code);

          if (response.status === 202) {
            if (response.body?.status === 'PENDING_REQUEST') {
              const requested = response.body as RequestedBooking;
              this.requested.set(requested);
              this.confirmation.set(undefined);
              this.awaiting.set(undefined);
              return { kind: 'requested', requested };
            }
            const awaiting = response.body as AwaitingPayment;
            this.awaiting.set(awaiting);
            this.confirmation.set(undefined);
            this.requested.set(undefined);
            return { kind: 'awaiting', awaiting };
          }
          const confirmation = response.body as BookingConfirmation;
          this.confirmation.set(confirmation);
          this.awaiting.set(undefined);
          this.requested.set(undefined);
          return { kind: 'confirmed', confirmation };
        }),
      );
  }

  /**
   * Prime the payment route from a fetched booking (issue #98 "Pay now" on an accepted request):
   * the booking-view rebuilds the hand-off from `GET /api/bookings/{code}`'s open-intent
   * credentials, then navigates to `/booking/pay` exactly as the 202 create path does.
   */
  beginPayment(handoff: PaymentHandoff): void {
    this.awaiting.set(handoff);
    this.confirmation.set(undefined);
    this.requested.set(undefined);
  }

  clear(): void {
    this.confirmation.set(undefined);
    this.awaiting.set(undefined);
    this.requested.set(undefined);
  }

  /** Fetch a booking and its server-computed cancellation terms by code (U6, `GET /api/bookings/{code}`). */
  getByCode(code: string): Observable<BookingDetail> {
    return this.http.get<BookingDetail>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}`,
    );
  }

  /**
   * The signed-in customer's account-linked bookings (S3, `GET /api/me/bookings`). Session-principal
   * scoped by the backend — the request carries no id, so it returns only the caller's own bookings
   * (never another customer's). The session cookie is attached by the api-session interceptor.
   */
  myBookings(): Observable<MyBookingSummary[]> {
    return this.http.get<MyBookingSummary[]>(`${environment.apiBaseUrl}/api/me/bookings`);
  }

  /**
   * Cancel a booking by code (U6, `POST /api/bookings/{code}/cancel`). The refund is computed
   * server-side (invariant #10) — no body is sent.
   */
  cancel(code: string): Observable<Cancellation> {
    return this.http.post<Cancellation>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}/cancel`,
      {},
    );
  }
}

/** Map an HTTP failure (RFC-7807 body, issue #97) to a stable, displayable booking error code. */
export function bookingErrorOf(error: unknown): BookingErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = problemCodeOf(error);
    switch (code) {
      case 'SET_TAKEN':
      case 'SET_NOT_BOOKABLE_ONLINE':
      case 'BOOKING_CLOSED':
      case 'NO_SUCH_SET':
        return code;
      case 'INVALID_REQUEST':
        return 'INVALID_REQUEST';
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
