import { MoneyView } from '../venue/venue.model';

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
