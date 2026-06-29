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

/** Server rejection codes mapped from the HTTP error body, plus a transport fallback. */
export type BookingErrorCode =
  | 'SET_TAKEN'
  | 'SET_NOT_BOOKABLE_ONLINE'
  | 'BOOKING_CLOSED'
  | 'NO_SUCH_SET'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';
