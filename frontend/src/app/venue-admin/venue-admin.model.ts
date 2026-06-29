import { BookingMode, MoneyView, Pool, Tier } from '../venue/venue.model';

/**
 * Typed views of the U7 venue write API (operator endpoints under `/api/venues`). Money travels as
 * integer minor units + ISO currency (invariant #5) reusing the U1 {@link MoneyView} shape exactly,
 * so a layout written here round-trips unchanged through the read API. No `any` anywhere.
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

/** `POST`/`PATCH` `/api/venues/{id}/sets...` body — place or re-place one set position. */
export interface SetPositionRequest {
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly tier: Tier;
  readonly pool: Pool;
  readonly price: MoneyView;
  readonly gridX: number;
  readonly gridY: number;
}

/** `201` response from a create/add — the new technical id. */
export interface CreatedId {
  readonly id: number;
}

/** The server error codes the editor maps to operator-facing messages. */
export type VenueAdminErrorCode =
  | 'CELL_TAKEN'
  | 'DUPLICATE_POSITION'
  | 'NO_SUCH_VENUE'
  | 'NO_SUCH_SET'
  | 'LAYOUT_CONFLICT'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';
