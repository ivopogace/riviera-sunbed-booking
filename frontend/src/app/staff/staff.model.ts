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
 * A set's state on the chosen day in the staff view. `FREE` → tap to mark a walk-in; `STAFF_MARKED`
 * → tap to release; `BOOKED_ONLINE` → locked (held by an online booking, staff cannot release it).
 */
export type StaffTileState = 'FREE' | 'STAFF_MARKED' | 'BOOKED_ONLINE';

/** Known mark failures (server `{ "error": CODE }` body), plus the auth/transport cases. */
export type StaffMarkError =
  | 'ALREADY_TAKEN'
  | 'NO_SUCH_SET'
  | 'DATE_IN_PAST'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/** Known release failures. `NOT_MARKED` means the set was free or online-held — a safe no-op. */
export type StaffReleaseError = 'NOT_MARKED' | 'UNAUTHORIZED' | 'UNKNOWN';
