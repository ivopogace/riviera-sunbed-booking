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
