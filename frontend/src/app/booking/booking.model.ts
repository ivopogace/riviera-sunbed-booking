import { MoneyView } from '../venue/venue.model';

/**
 * Typed view of the U3 booking API (`POST /api/bookings`). Mirrors the backend
 * `CreateBookingRequest` / `BookingConfirmationView` exactly — money travels as integer minor
 * units + currency (invariant #5); the booking date as an ISO `LocalDate` string. No `any`.
 */
export interface BookingContact {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string;
}

export interface CreateBookingRequest {
  readonly setId: number;
  readonly bookingDate: string; // ISO YYYY-MM-DD
  readonly contact: BookingContact;
}

export interface BookingConfirmation {
  readonly code: string;
  readonly status: string;
  readonly venueId: number;
  readonly venueName: string;
  readonly setId: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
}

/**
 * Typed view of the U6 booking-view API (`GET /api/bookings/{code}`). Mirrors the backend
 * `BookingDetailView`: money as integer minor units + currency (invariant #5), date as ISO
 * `LocalDate`. The cancellation terms are computed server-side (invariant #10) — the client only
 * displays them. `refundedAmount` is set only once the booking is `CANCELLED`.
 */
export interface BookingDetail {
  readonly code: string;
  readonly status: string;
  readonly venueId: number;
  readonly venueName: string;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly bookingDate: string;
  readonly amount: MoneyView;
  readonly cancellable: boolean;
  readonly beforeCutoff: boolean;
  readonly refundIfCancelledNow: MoneyView;
  readonly refundedAmount: MoneyView | null;
}

/** The refund tier returned with a cancellation (mirrors the backend `CancelOutcome.Tier`). */
export type RefundTier = 'FULL' | 'PARTIAL' | 'NONE';

/**
 * Typed view of the cancel response (`POST /api/bookings/{code}/cancel`). Mirrors the backend
 * `CancellationView`: the new status, the server-computed refund, and the tier for the copy.
 */
export interface Cancellation {
  readonly code: string;
  readonly status: string;
  readonly refund: MoneyView;
  readonly tier: RefundTier;
}

/** Server rejection codes mapped from the HTTP error body, plus a transport fallback. */
export type BookingErrorCode =
  | 'SET_TAKEN'
  | 'SET_NOT_BOOKABLE_ONLINE'
  | 'BOOKING_CLOSED'
  | 'NO_SUCH_SET'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';
