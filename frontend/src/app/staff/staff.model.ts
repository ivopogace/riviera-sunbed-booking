import { MoneyView } from '../venue/venue.model';

/**
 * Typed views for the U8 staff daily view (issue #10). Mirrors the backend operator endpoints
 * exactly. Booking codes are bearer credentials (invariant #7) — shown to staff for arrival
 * verification, never logged.
 */

/** One confirmed booking in the daily list: which set it holds and its arrival code. */
export interface DailyBookingItem {
  readonly setId: number;
  readonly code: string;
}

/**
 * One pending Request-to-Book entry in the operator queue (issue #98,
 * `GET /api/venues/{venueId}/booking-requests`). Deliberately carries NO booking code — the code
 * is the guest's bearer credential (invariant #7) and staff don't need it to decide.
 */
export interface PendingRequestItem {
  readonly bookingId: number;
  readonly setId: number;
  readonly bookingDate: string; // ISO YYYY-MM-DD
  readonly guestName: string;
  readonly amount: MoneyView;
  readonly requestedAt: string; // ISO-8601 UTC instant
  readonly requestExpiresAt: string; // ISO-8601 UTC instant
}

/** The outcome of an accept/decline: `AWAITING_PAYMENT` or `CONFIRMED` (accept), `DECLINED`. */
export interface RequestDecision {
  readonly bookingId: number;
  readonly status: string;
}

/**
 * A set's state on the chosen day in the staff view. `FREE` → tap to mark a walk-in; `STAFF_MARKED`
 * → tap to release; `BOOKED_ONLINE` → locked (held by an online booking, staff cannot release it).
 */
export type StaffTileState = 'FREE' | 'STAFF_MARKED' | 'BOOKED_ONLINE';

/** Known mark failures (the RFC-7807 `code` extension, issue #97), plus the auth/transport cases. */
export type StaffMarkError =
  | 'ALREADY_TAKEN'
  | 'NO_SUCH_SET'
  | 'DATE_IN_PAST'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/** Known release failures. `NOT_MARKED` means the set was free or online-held — a safe no-op. */
export type StaffReleaseError = 'NOT_MARKED' | 'UNAUTHORIZED' | 'UNKNOWN';

/** Known accept/decline failures (the RFC-7807 `code` extension), plus the auth/transport cases. */
export type StaffRequestError =
  | 'NO_SUCH_REQUEST'
  | 'REQUEST_NOT_PENDING'
  | 'REQUEST_EXPIRED'
  | 'PAYMENT_INIT_FAILED'
  | 'NOT_VENUE_OWNER'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';
