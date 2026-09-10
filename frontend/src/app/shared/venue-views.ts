import { Amenity } from './amenities';
import { MoneyView } from './money';

/**
 * The venue read APIs' published view vocabulary — the frontend mirror of the backend's
 * `venue::vocabulary` surface, exactly as it travels the wire. No `any` anywhere. The venue
 * feature is this file's **editor of record**: it lives in `shared/` because
 * every feature, `pages/`, and `shared/` itself consume it, but changes ride venue API work.
 */

/**
 * One density candidate of a photo: its content-addressed serving URL and the intrinsic pixel
 * width of the bytes behind it. The pair is one `srcset` entry (`"<url> <width>w"`).
 */
export interface PhotoSourceView {
  readonly url: string;
  readonly width: number;
}

/**
 * A tourist-surfaced photo with every density the backend stored for it. `url` is the baseline
 * candidate — what `ngSrc` binds and what a client without `srcset` support fetches — and
 * `sources` lists every candidate ascending by width, always including `url`'s own.
 *
 * A photo uploaded before the retina tier existed has exactly one source and renders a
 * one-candidate `srcset`; it cannot be backfilled, since the full-res original is discarded at
 * upload. URLs are opaque and content-addressed: a replaced photo changes the URL, never the bytes
 * behind an old one.
 */
export interface PhotoView {
  readonly url: string;
  readonly sources: readonly PhotoSourceView[];
}

/**
 * The venue's tourist-surfaced cover photo: the Discover card's and the beach-map banner's
 * surfaces, each with its own density candidates. `null`/absent when the venue has no cover
 * photo — the gradient fallback renders instead.
 */
export interface CoverPhotoView {
  readonly card: PhotoView;
  readonly banner: PhotoView;
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

/**
 * Typed view of the venue read API (`GET /api/venues/{id}`). Mirrors the backend
 * `VenueMapView` exactly — money travels as integer minor units + currency (invariant #5),
 * the rating as tenths (no float on the wire).
 */
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
   * The venue's amenities in canonical catalogue order, or absent/empty when none. The
   * beach-map header renders the full row. Optional because test doubles and older payloads may omit
   * it; the real API always sends an array (possibly empty).
   */
  readonly amenities?: readonly Amenity[];
  /** Distance to the water in metres, or `null`/absent when not stated. */
  readonly distanceToWaterM?: number | null;
  readonly sets: readonly SetView[];
  /**
   * The layout's optimistic-concurrency stamp: the venue's `set_version`, echoed back by the
   * operator layout + pricing tabs on the next beach-map replace / per-row reprice so a stale write is
   * rejected `409 STALE_WRITE` instead of clobbering. Tourists ignore it. Optional because test doubles
   * and older payloads may omit it; the real API always sends it (a number ≥ 0).
   */
  readonly setVersion?: number;
  /** The cover photo's serving URLs, or `null`/absent — the banner then keeps its gradient. */
  readonly coverPhoto?: CoverPhotoView | null;
  /**
   * The beach-map banner's slideshow: one banner-sized serving URL per occupied photo slot in
   * slot order (cover, sunbeds, bar), possibly empty. Optional because test doubles and older
   * payloads may omit it; the band then falls back to `coverPhoto` alone.
   */
  readonly photos?: readonly PhotoView[];
  /**
   * Whether online sales for the selected date are open right now — the server's sales-window
   * verdict (invariant #4), display only; the reserve path enforces the real fence. Optional
   * because test doubles and older payloads may omit it; only an explicit `false` renders the
   * closed state.
   */
  readonly salesOpen?: boolean;
  /**
   * The venue's own sales-close setting — a display-copy key only: wording branches on the
   * value and never compares it with a clock; {@link salesOpen} stays the open/closed verdict.
   * Optional because test doubles and older payloads may omit it; absent renders no note.
   */
  readonly salesClose?: SalesCloseTime;
  /**
   * Whether the venue is closed for the season right now — the server's verdict, never a date the
   * client compares. The page stays browsable; `salesOpen` says whether the selected date sells
   * regardless (an opted-in date after the reopen day does). Optional because test doubles and
   * older payloads may omit it; only an explicit `true` renders the closed state.
   */
  readonly closedForSeason?: boolean;
  /** The reopen day (ISO `YYYY-MM-DD`, Europe/Tirane) while closed with one set; else `null`/absent. */
  readonly reopensOn?: string | null;
}

/**
 * The venue's on-day sales-close choice (invariant #4): exactly the three server-vocabulary
 * wall-clock tokens, `"HH:mm"` in Europe/Tirane. `00:01` opts the venue out of same-day online
 * sales, `16:00` is the default, `23:59` keeps today bookable all day. The wire keeps this shape
 * in both directions, so the FE never parses times.
 */
export type SalesCloseTime = '00:01' | '16:00' | '23:59';

/**
 * A venue's set availability on a chosen day, as a count (mirrors the backend
 * `AvailabilitySummary`): `free` of `total` sets are not yet taken for the date.
 */
export interface AvailabilitySummary {
  readonly free: number;
  readonly total: number;
}

/**
 * One day of a venue's availability calendar (`GET /api/venues/{id}/availability-calendar`,
 * mirrors the backend `DailyAvailabilityView`): the civil day as an ISO `YYYY-MM-DD` string in
 * `Europe/Tirane` (invariant #6), and how many of the venue's sets are free on it.
 *
 * <p>`total` spans **both** pools, so the pair is a "how busy is this day" signal and not a count
 * of online-bookable sets. It is a **snapshot, never a hold** — a day showing free capacity can be
 * full by the time a set is claimed, and only the claim decides (invariant #2).
 */
export interface DailyAvailability {
  readonly date: string;
  readonly free: number;
  readonly total: number;
  /**
   * Whether online sales for this day are open right now — the server's verdict (the on-day sales
   * close and a season closure together), display only; the picker refuses a `false` day. Optional
   * because test doubles and older payloads may omit it; absent keeps the day selectable.
   */
  readonly salesOpen?: boolean;
}

/**
 * Typed view of the discovery list API (`GET /api/venues`). Mirrors the backend
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
   * The venue's amenities in canonical catalogue order, or absent/empty when none. The
   * Discover card renders the first few. Optional because test doubles and older payloads may omit
   * it; the real API always sends an array (possibly empty).
   */
  readonly amenities?: readonly Amenity[];
  /** Distance to the water in metres, or `null`/absent when not stated. */
  readonly distanceToWaterM?: number | null;
  readonly availability: AvailabilitySummary;
  /** The cover photo's serving URLs, or `null`/absent — the card then keeps its gradient. */
  readonly coverPhoto?: CoverPhotoView | null;
  /**
   * The Discover card's slideshow: one card-sized serving URL per occupied photo slot in
   * slot order (cover, sunbeds, bar), possibly empty. Optional because test doubles and older
   * payloads may omit it; the card then falls back to `coverPhoto` alone.
   */
  readonly photos?: readonly PhotoView[];
  /**
   * Whether online sales for the selected date are open right now — the server's sales-window
   * verdict (invariant #4), display only; the reserve path enforces the real fence. Optional
   * because test doubles and older payloads may omit it; only an explicit `false` badges the card.
   */
  readonly salesOpen?: boolean;
  /**
   * Whether the venue is closed for the season right now — the server's verdict; the card wears the
   * "Closed for season" badge and the server has already sorted it after every open venue. Optional
   * because test doubles and older payloads may omit it; only an explicit `true` badges the card.
   */
  readonly closedForSeason?: boolean;
  /** The reopen day (ISO `YYYY-MM-DD`, Europe/Tirane) while closed with one set; else `null`/absent. */
  readonly reopensOn?: string | null;
}

/**
 * A photo slot key as the REST path and every `photos` map speak it — the FE mirror of the
 * backend `venue.vocabulary.PhotoSlot`. Lives here rather than in a feature because two features
 * speak it: the operator's own venue tab and the admin console's moderation surface, and a
 * feature-to-feature import is exactly the edge RV-FE-8 freezes.
 */
export type PhotoSlotKey = 'cover' | 'sunbeds' | 'bar';

/**
 * One listed review on the venue page (`GET /api/venues/{id}/reviews`). `stayedIn` is an ISO
 * year-month (`2026-07`) and never a day; `displayName` is `null` only for a row written before
 * display names were required, which the section attributes to "A guest" (an erased review is
 * nameless too, but carries no comment, so it is never listed).
 */
export interface VenueReviewEntry {
  readonly id: number;
  readonly stars: number;
  readonly displayName: string | null;
  readonly stayedIn: string;
  readonly comment: string;
}

/**
 * One page of a venue's listed reviews, newest first. `nextCursor` is passed back as the
 * `cursor` param for the next older page; `null` ends the list.
 */
export interface VenueReviewsPage {
  readonly reviews: readonly VenueReviewEntry[];
  readonly nextCursor: number | null;
}
