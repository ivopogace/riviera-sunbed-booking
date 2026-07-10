import { MoneyView, Pool, Tier } from '../venue/venue.model';

/**
 * The operator console's "online takings today" read (`GET /api/venues/{id}/takings`, #171). Mirrors
 * the backend `TakingsResponse`: {@link gross} and {@link net} as integer minor units + currency
 * (invariant #5) — the FE renders them, never computes them; commission stays server-side. The
 * {@link commissionBps} drives the "after {pct} commission" label; {@link date} is the service date.
 */
export interface TakingsView {
  readonly gross: MoneyView;
  readonly net: MoneyView;
  readonly commissionBps: number;
  readonly date: string;
}

/**
 * One set of a beach-map layout write (O3, #172) — mirrors the backend `SetPositionRequest`: tier +
 * pool tokens, integer minor-unit price (invariant #5), and 1-based grid coordinates. Reuses the
 * shared {@link Tier}/{@link Pool}/{@link MoneyView} read-contract types so a written layout
 * round-trips unchanged through the U1 read API.
 */
export interface LayoutCellRequest {
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly tier: Tier;
  readonly pool: Pool;
  readonly price: MoneyView;
  readonly gridX: number;
  readonly gridY: number;
}

/** The bulk beach-map replace body (`PUT /api/venues/{id}/beach-map`, O3, #172): the whole desired grid. */
export interface BeachMapLayoutRequest {
  readonly sets: readonly LayoutCellRequest[];
}

/**
 * A known per-row reprice failure (O4, #174), mapped from the RFC-7807 `code` (issue #97) for
 * operator-facing copy. `NO_SUCH_ROW`/`NO_SUCH_VENUE` are the 404s; `NOT_VENUE_OWNER` the 403
 * (invariant #13); `INVALID_REQUEST` the 400 edge rejection (§6b); `UNAUTHORIZED` the expired session.
 */
export type RepriceErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_ROW'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'UNKNOWN';

/**
 * One confirmed booking in the Daily view's arrivals list (`GET /api/venues/{id}/bookings?date`,
 * O5 #175) — which set it holds and its arrival code. Mirrors the backend row (and the legacy
 * `StaffService` `DailyBookingItem`); the console owns this read now that it is `StaffDaily`'s
 * successor. The code is a bearer credential (invariant #7) — shown for arrival verification at the
 * beach, never logged.
 */
export interface ConsoleDailyBooking {
  readonly setId: number;
  readonly code: string;
}

/**
 * A known staff walk-in **mark** failure (O5 #175), mapped from the RFC-7807 `code` (issue #97) for
 * operator-facing copy. `ALREADY_TAKEN` = the 409 (the set was just taken by the other channel);
 * `DATE_IN_PAST` = the 422 cutoff (invariant #4); `NO_SUCH_SET`/`NO_SUCH_VENUE` = the 404s;
 * `NOT_VENUE_OWNER` = the 403 (invariant #13); `UNAUTHORIZED` = the expired session.
 */
export type MarkErrorCode =
  | 'ALREADY_TAKEN'
  | 'DATE_IN_PAST'
  | 'NO_SUCH_SET'
  | 'NO_SUCH_VENUE'
  | 'NOT_VENUE_OWNER'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/**
 * A known staff **release** failure. `NOT_MARKED` = the set was free or online-held (a safe no-op —
 * the server only deletes a `STAFF_MARKED` row); `NOT_VENUE_OWNER` = the 403 (invariant #13).
 */
export type ReleaseErrorCode = 'NOT_MARKED' | 'NOT_VENUE_OWNER' | 'UNAUTHORIZED' | 'UNKNOWN';

/** A known layout-write failure, mapped from the RFC-7807 `code` (issue #97) for operator-facing copy. */
export type LayoutErrorCode =
  | 'LAYOUT_IN_USE'
  | 'DUPLICATE_POSITION'
  | 'CELL_TAKEN'
  | 'EMPTY_LAYOUT'
  | 'LAYOUT_TOO_LARGE'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'UNKNOWN';
