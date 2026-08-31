import { BookingMode } from '../shared/venue-views';

/**
 * Typed views of the venue **onboarding** write API (`POST /api/venues`). Money travels as integer
 * minor units + ISO currency (invariant #5). The per-set write + profile-edit types moved to the
 * operator console when their editing surfaces graduated to console tabs (see
 * `operator/operator-console.model.ts`). No `any` anywhere.
 */

/**
 * `POST /api/venues` body — create a venue. Rating/reviews are server-defaulted to zero, and
 * there is deliberately no commission field: the platform stamps its default rate server-side
 * (a body carrying one is rejected `400`).
 */
export interface CreateVenueRequest {
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly bookingMode: BookingMode;
  readonly payoutCurrency: string;
  /** Evening-before cutoff, `HH:mm` Europe/Tirane (invariant #4/#6). */
  readonly bookingCutoff: string;
}

/** `GET /api/venue-defaults` — the platform terms the create path stamps (bps, invariant #5). */
export interface VenueDefaults {
  readonly commissionBps: number;
}

/** `201` response from a create — the new technical id. */
export interface CreatedId {
  readonly id: number;
}

/** The server error codes onboarding maps to operator-facing messages (RFC-7807 `code`). */
export type VenueAdminErrorCode = 'NO_SUCH_VENUE' | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'UNKNOWN';
