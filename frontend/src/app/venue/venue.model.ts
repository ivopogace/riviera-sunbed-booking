/**
 * Typed view of the U1 venue read API (`GET /api/venues/{id}`). Mirrors the backend
 * `VenueMapView` exactly — money travels as integer minor units + currency (invariant #5),
 * the rating as tenths (no float on the wire). No `any` anywhere.
 */
export interface MoneyView {
  readonly minorUnits: number;
  readonly currency: string;
}

export type Tier = 'PREMIUM' | 'STANDARD';
export type Pool = 'ONLINE' | 'WALK_IN';
export type SeatAvailability = 'FREE' | 'TAKEN';
export type BookingMode = 'INSTANT' | 'REQUEST';

export interface SetView {
  readonly id: number;
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly tier: Tier;
  readonly pool: Pool;
  readonly price: MoneyView;
  readonly gridX: number;
  readonly gridY: number;
  readonly availability: SeatAvailability;
}

export interface VenueMapView {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly ratingTenths: number;
  readonly reviewsCount: number;
  readonly bookingMode: BookingMode;
  readonly fromPrice: MoneyView | null;
  readonly sets: readonly SetView[];
}

/**
 * A venue's set availability on a chosen day, as a count (mirrors the backend
 * `AvailabilitySummary`): `free` of `total` sets are not yet taken for the date.
 */
export interface AvailabilitySummary {
  readonly free: number;
  readonly total: number;
}

/**
 * Typed view of the discovery list API (`GET /api/venues`, issue #61). Mirrors the backend
 * `VenueSummaryView` exactly — money as integer minor units + currency (invariant #5), rating as
 * tenths (no float on the wire). `fromPrice` is `null` for a venue with no sets.
 */
export interface VenueSummary {
  readonly id: number;
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly ratingTenths: number;
  readonly reviewsCount: number;
  readonly bookingMode: BookingMode;
  readonly fromPrice: MoneyView | null;
  readonly availability: AvailabilitySummary;
}
