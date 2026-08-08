import { BookingMode } from '../shared/venue-views';

/**
 * Typed views of the venue **onboarding** write API (`POST /api/venues`). Money travels as integer
 * minor units + ISO currency (invariant #5). The per-set write + profile-edit types moved to the
 * operator console when their editing surfaces graduated to console tabs (see
 * `operator/operator-console.model.ts`). No `any` anywhere.
 */

/** `POST /api/venues` body — create a venue. Rating/reviews are server-defaulted to zero. */
export interface CreateVenueRequest {
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly bookingMode: BookingMode;
  readonly commissionBps: number;
  readonly payoutCurrency: string;
  /** Evening-before cutoff, `HH:mm` Europe/Tirane (invariant #4/#6). */
  readonly bookingCutoff: string;
}

/** `201` response from a create — the new technical id. */
export interface CreatedId {
  readonly id: number;
}

/** The server error codes onboarding maps to operator-facing messages (RFC-7807 `code`). */
export type VenueAdminErrorCode =
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';
