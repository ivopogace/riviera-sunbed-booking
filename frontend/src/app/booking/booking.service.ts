import { HttpClient, HttpErrorResponse, httpResource, HttpResourceRef } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { problemCodeOf } from '../shared/api-error';
import { ChallengeRejection, challengeHeaders, challengeRejection } from '../shared/challenge';
import {
  AwaitingPayment,
  BookingConfirmation,
  BookingDetail,
  BookingErrorCode,
  Cancellation,
  CancellationTerms,
  CreateBookingRequest,
  CreateBookingResult,
  MyBookingSummary,
  PaymentHandoff,
  RequestedBooking,
  SubmitReviewRequest,
  Withdrawal,
} from './booking.model';

/**
 * Typed booking-API access plus the latest create/pay hand-off, which the confirmation, payment
 * and requested routes render after navigation. A create's `201` is `CONFIRMED`; a `202` is
 * `AWAITING_PAYMENT` (collect the card) or `PENDING_REQUEST` (the venue must accept). One source
 * signal holds the outcome, so at most one hand-off exists and an unpaid booking never renders as
 * "Paid" (#8). Every successful create remembers its code in {@link DeviceLocalBookings}: the
 * guest's only key to find it again (#7 — there is no guest list endpoint).
 */
@Service()
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly device = inject(DeviceLocalBookings);

  private readonly handoff = signal<LastHandoff | undefined>(undefined);

  /** The last confirmed booking (201 path), consumed by the confirmation route. */
  readonly lastConfirmation = computed(() => {
    const h = this.handoff();
    return h?.kind === 'confirmed' ? h.confirmation : undefined;
  });

  /** The last payment hand-off (202 `AWAITING_PAYMENT`, or "Pay now"), consumed by the payment route. */
  readonly lastAwaitingPayment = computed(() => {
    const h = this.handoff();
    return h?.kind === 'awaiting' ? h.awaiting : undefined;
  });

  /** The last pending request (202 `PENDING_REQUEST` path), consumed by the requested route. */
  readonly lastRequested = computed(() => {
    const h = this.handoff();
    return h?.kind === 'requested' ? h.requested : undefined;
  });

  private readonly prefetched = signal<BookingDetail | undefined>(undefined);

  /**
   * Pre-reserve terms for `setId` on `date`, as an `httpResource` that re-quotes when the pair
   * changes. A per-dialog factory, run in the caller's injection context; keep it on the HTTP
   * stack (not `resource()` + `fetch`) so `api-session` and its sibling interceptors apply.
   */
  cancellationTerms(
    params: () => { setId: number; date: string } | undefined,
  ): HttpResourceRef<CancellationTerms | undefined> {
    return httpResource<CancellationTerms>(() => {
      const p = params();
      return p
        ? `${environment.apiBaseUrl}/api/bookings/cancellation-terms?setId=${p.setId}&date=${p.date}`
        : undefined;
    });
  }

  /**
   * Reserve one set. `challenge` is the widget's solved proof-of-work payload, sent as the fence's
   * header when present (ADR-0016); the edge's three challenge codes come back through
   * {@link bookingErrorOf} as their own rejections so the checkout can restart the widget.
   */
  createBooking(
    request: CreateBookingRequest,
    termsAtCheckout?: CancellationTerms,
    challenge?: string,
  ): Observable<CreateBookingResult> {
    return this.http
      .post<BookingConfirmation | AwaitingPayment | RequestedBooking>(
        `${environment.apiBaseUrl}/api/bookings`,
        request,
        { observe: 'response', headers: challengeHeaders(challenge) },
      )
      .pipe(
        map((response): CreateBookingResult => {
          // Remember the code once, from whichever outcome — guarded against a missing body (the
          // branches below already treat `body` as nullable via `?.status`), so an empty 201/202
          // never throws here and turns a real booking into a false "failed".
          this.device.remember(response.body?.code);

          if (response.status === 202) {
            if (response.body?.status === 'PENDING_REQUEST') {
              const requested = response.body as RequestedBooking;
              this.handoff.set({ kind: 'requested', requested });
              return { kind: 'requested', requested };
            }
            // The checkout's quoted terms ride the hand-off so the pay page repeats them.
            const awaiting = {
              ...(response.body as AwaitingPayment),
              cancellationTerms: termsAtCheckout ?? null,
            };
            this.handoff.set({ kind: 'awaiting', awaiting });
            return { kind: 'awaiting', awaiting };
          }
          const confirmation = response.body as BookingConfirmation;
          this.handoff.set({ kind: 'confirmed', confirmation });
          return { kind: 'confirmed', confirmation };
        }),
      );
  }

  /**
   * Prime the payment route from a fetched booking ("Pay now" on an accepted request):
   * the booking-view rebuilds the hand-off from `GET /api/bookings/{code}`'s open-intent
   * credentials, then navigates to `/booking/pay` exactly as the 202 create path does.
   */
  beginPayment(handoff: PaymentHandoff): void {
    this.handoff.set({ kind: 'awaiting', awaiting: handoff });
  }

  clear(): void {
    this.handoff.set(undefined);
  }

  /**
   * Prime `/booking/{code}` with a detail the caller already fetched: a second `GET` per lookup
   * could 429 near the rate-limit ceiling and drop a valid code on the generic error. Mirrors
   * {@link beginPayment}.
   */
  primeDetail(detail: BookingDetail): void {
    this.prefetched.set(detail);
  }

  /**
   * Consume the primed detail for {@link BookingView}'s first load, only when it matches the route
   * code (never serve one booking's detail for another) and only once (a refresh re-fetches). A
   * mismatch leaves it primed and returns `undefined`, so the view fetches.
   */
  takePrefetched(code: string): BookingDetail | undefined {
    const detail = this.prefetched();
    if (detail?.code === code) {
      this.prefetched.set(undefined);
      return detail;
    }
    return undefined;
  }

  /** Fetch a booking and its server-computed cancellation terms by code (`GET /api/bookings/{code}`). */
  getByCode(code: string): Observable<BookingDetail> {
    return this.http.get<BookingDetail>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}`,
    );
  }

  /**
   * The signed-in customer's account-linked bookings (`GET /api/me/bookings`). Session-principal
   * scoped by the backend — the request carries no id, so it returns only the caller's own bookings
   * (never another customer's). The session cookie is attached by the api-session interceptor.
   */
  myBookings(): Observable<MyBookingSummary[]> {
    return this.http.get<MyBookingSummary[]>(`${environment.apiBaseUrl}/api/me/bookings`);
  }

  /**
   * Cancel a booking by code (`POST /api/bookings/{code}/cancel`). The refund is computed
   * server-side (invariant #10) — no body is sent.
   */
  cancel(code: string): Observable<Cancellation> {
    return this.http.post<Cancellation>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}/cancel`,
      {},
    );
  }

  /**
   * Withdraw a pending request by code (`POST /api/bookings/{code}/withdraw`). No body, and no
   * money involved — the venue has not accepted, so nothing was ever charged.
   */
  withdraw(code: string): Observable<Withdrawal> {
    return this.http.post<Withdrawal>(
      `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}/withdraw`,
      {},
    );
  }

  /**
   * Rate a delivered stay by code (`POST /api/bookings/{code}/review`). The `201` carries no body —
   * the new state lives on the booking, so the caller re-reads it rather than patching locally.
   * Eligibility is the server's call (invariant #7: the code is the whole authorization).
   */
  review(code: string, review: SubmitReviewRequest): Observable<void> {
    return this.http.post<void>(this.reviewUrl(code), review);
  }

  /** Rewrite the review already recorded against this stay (`PUT`); `204`, no body. */
  updateReview(code: string, review: SubmitReviewRequest): Observable<void> {
    return this.http.put<void>(this.reviewUrl(code), review);
  }

  /** Remove the review recorded against this stay (`DELETE`); `204`, no body. */
  deleteReview(code: string): Observable<void> {
    return this.http.delete<void>(this.reviewUrl(code));
  }

  private reviewUrl(code: string): string {
    return `${environment.apiBaseUrl}/api/bookings/${encodeURIComponent(code)}/review`;
  }
}

/** The latest create/pay hand-off — a discriminated union, so only one outcome can exist. */
type LastHandoff =
  | { kind: 'confirmed'; confirmation: BookingConfirmation }
  | { kind: 'awaiting'; awaiting: PaymentHandoff }
  | { kind: 'requested'; requested: RequestedBooking };

/**
 * Map an HTTP failure (RFC-7807 body) to a displayable booking error code, or to the proof-of-work
 * fence's rejection. Its three codes share `INVALID_REQUEST`'s `400`, so only `code` tells them
 * apart — conflating them answers a spent challenge with "check the form".
 */
export function bookingErrorOf(error: unknown): BookingErrorCode | ChallengeRejection {
  if (error instanceof HttpErrorResponse) {
    const code = problemCodeOf(error);
    const rejection = challengeRejection(code);
    if (rejection) {
      return rejection;
    }
    switch (code) {
      case 'SET_TAKEN':
      case 'SET_NOT_BOOKABLE_ONLINE':
      case 'BOOKING_CLOSED':
      case 'VENUE_CLOSED':
      case 'RANGE_NOT_OFFERED':
      case 'STAY_TOO_LONG':
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
