import { Amenity } from '../shared/amenities';

/**
 * Typed view of the U1 venue read API (`GET /api/venues/{id}`). Mirrors the backend
 * `VenueMapView` exactly — money travels as integer minor units + currency (invariant #5),
 * the rating as tenths (no float on the wire). No `any` anywhere.
 */
export interface MoneyView {
  readonly minorUnits: number;
  readonly currency: string;
}

/**
 * The venue's tourist-surfaced cover photo (#142): content-addressed, immutably-cached serving
 * URLs for the Discover card and the beach-map banner. Opaque strings fed to `NgOptimizedImage`;
 * `null`/absent when the venue has no cover photo — the gradient fallback renders instead.
 */
export interface CoverPhotoView {
  readonly card: string;
  readonly banner: string;
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
  /**
   * The venue's amenities in canonical catalogue order (T7, #140), or absent/empty when none. The
   * beach-map header renders the full row. Optional because test doubles and older payloads may omit
   * it; the real API always sends an array (possibly empty).
   */
  readonly amenities?: readonly Amenity[];
  /** Distance to the water in metres (T7, #140), or `null`/absent when not stated. */
  readonly distanceToWaterM?: number | null;
  readonly sets: readonly SetView[];
  /**
   * The layout's optimistic-concurrency stamp (#226): the venue's `set_version`, echoed back by the
   * operator layout + pricing tabs on the next beach-map replace / per-row reprice so a stale write is
   * rejected `409 STALE_WRITE` instead of clobbering. Tourists ignore it. Optional because test doubles
   * and older payloads may omit it; the real API always sends it (a number ≥ 0).
   */
  readonly setVersion?: number;
  /** The cover photo's serving URLs (#142), or `null`/absent — the banner then keeps its gradient. */
  readonly coverPhoto?: CoverPhotoView | null;
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
  /**
   * The venue's amenities in canonical catalogue order (T7, #140), or absent/empty when none. The
   * Discover card renders the first few. Optional because test doubles and older payloads may omit
   * it; the real API always sends an array (possibly empty).
   */
  readonly amenities?: readonly Amenity[];
  /** Distance to the water in metres (T7, #140), or `null`/absent when not stated. */
  readonly distanceToWaterM?: number | null;
  readonly availability: AvailabilitySummary;
  /** The cover photo's serving URLs (#142), or `null`/absent — the card then keeps its gradient. */
  readonly coverPhoto?: CoverPhotoView | null;
}
