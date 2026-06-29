import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingDetail,
  BookingErrorCode,
  Cancellation,
  CreateBookingRequest,
  CreateBookingResult,
} from './booking.model';

/**
 * Creates bookings against the booking API (`POST /api/bookings`) and holds the most recent
 * hand-off so the confirmation / payment routes can render after navigation. Single
 * responsibility: typed access to the booking write API + the last-result hand-off.
 *
 * <p>The create call discriminates on the HTTP status: `201` → the booking is already
 * `CONFIRMED` (stub/Instant profile); `202` → it is `AWAITING_PAYMENT` and the card must be
 * collected via Stripe (stripe profile). The two outcomes are kept in separate hand-off signals
 * so the confirmation screen never renders an awaiting-payment booking as "Paid" (invariant #8).
 */
@Service()
export class BookingService {
  private readonly http = inject(HttpClient);

  private readonly confirmation = signal<BookingConfirmation | undefined>(undefined);
  /** The last confirmed booking (201 path), consumed by the confirmation route. */
  readonly lastConfirmation = this.confirmation.asReadonly();

  private readonly awaiting = signal<AwaitingPayment | undefined>(undefined);
  /** The last awaiting-payment booking (202 path), consumed by the payment route. */
  readonly lastAwaitingPayment = this.awaiting.asReadonly();

  createBooking(request: CreateBookingRequest): Observable<CreateBookingResult> {
    return this.http
      .post<BookingConfirmation | AwaitingPayment>(
        `${environment.apiBaseUrl}/api/bookings`,
        request,
        { observe: 'response' },
      )
      .pipe(
        map((response): CreateBookingResult => {
          if (response.status === 202) {
            const awaiting = response.body as AwaitingPayment;
            this.awaiting.set(awaiting);
            this.confirmation.set(undefined);
            return { kind: 'awaiting', awaiting };
          }
          const confirmation = response.body as BookingConfirmation;
          this.confirmation.set(confirmation);
          this.awaiting.set(undefined);
          return { kind: 'confirmed', confirmation };
        }),
      );
  }

  clear(): void {
    this.confirmation.set(undefined);
    this.awaiting.set(undefined);
  }

  /** Fetch a booking and its server-computed cancellation terms by code (U6, `GET /api/bookings/{code}`). */
  getByCode(code: string): Observable<BookingDetail> {
    return this.http.get<BookingDetail>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}`,
    );
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

/** Map an HTTP failure to a stable, displayable booking error code. */
export function bookingErrorOf(error: unknown): BookingErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { error?: string } | null)?.error;
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
