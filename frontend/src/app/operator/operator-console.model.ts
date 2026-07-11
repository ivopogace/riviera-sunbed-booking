import { Amenity } from '../shared/amenities';
import { BookingMode, MoneyView, Pool, Tier } from '../venue/venue.model';

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

/**
 * The bulk beach-map replace body (`PUT /api/venues/{id}/beach-map`, O3, #172): the whole desired grid.
 * {@link expectedVersion} is the required optimistic-concurrency token (#226) — the `setVersion` the tab
 * loaded from the map read; the server rejects a write whose token no longer matches with `409
 * STALE_WRITE` (and a missing token with `400`), so a stale layout tab can't clobber the map.
 */
export interface BeachMapLayoutRequest {
  readonly sets: readonly LayoutCellRequest[];
  readonly expectedVersion: number;
}

/**
 * A known per-row reprice failure (O4, #174), mapped from the RFC-7807 `code` (issue #97) for
 * operator-facing copy. `NO_SUCH_ROW`/`NO_SUCH_VENUE` are the 404s; `NOT_VENUE_OWNER` the 403
 * (invariant #13); `INVALID_REQUEST` the 400 edge rejection (§6b); `STALE_WRITE` the 409
 * optimistic-concurrency loss (#226) — the layout/prices moved on since the tab loaded, so the tab
 * reverts the row and offers a Reload; `UNAUTHORIZED` the expired session.
 */
export type RepriceErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_ROW'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'STALE_WRITE'
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

/** The kind of payout-ledger entry (O7 #173; mirrors backend `EntryType`): a confirmed booking accrues,
 *  a refund reverses. */
export type PayoutEntryType = 'ACCRUAL' | 'REVERSAL';

/** Why a reversal happened (O7 #173; mirrors backend `RefundReason`); `null` on an ACCRUAL. */
export type RefundReasonCode = 'WEATHER' | 'POLICY' | 'CONFLICT';

/**
 * One row of the per-venue payout ledger (`GET /api/venues/{id}/payout-ledger`, O7 #173, invariant #9).
 * Mirrors the backend `PayoutLedgerView.Entry`: money in integer minor units (invariant #5), `reason`
 * `null` on an ACCRUAL, `createdAt` a UTC instant (invariant #6), `runningNetMinor` the balance after
 * this entry. Carries only {@link bookingId} — **NO booking code, NO guest identity**: the `payout`
 * module holds no tourist identity (need-to-know, invariant #11), and the code is a bearer credential
 * (invariant #7); the console renders a non-credential `#<bookingId>` reference.
 */
export interface PayoutLedgerEntryView {
  readonly type: PayoutEntryType;
  readonly bookingId: number;
  readonly grossMinor: number;
  readonly commissionMinor: number;
  readonly netMinor: number;
  readonly currency: string;
  readonly reason: RefundReasonCode | null;
  readonly createdAt: string; // ISO-8601 UTC instant
  readonly runningNetMinor: number;
}

/**
 * A venue's payout ledger (`GET /api/venues/{id}/payout-ledger`, O7 #173, invariant #9). {@link
 * netOwedMinor} is the **server-authoritative** net owed (Σ ACCRUAL.net − Σ REVERSAL.net) in integer
 * minor units — the console **renders** it, never recomputes it (invariants #5/#9). Entries are
 * oldest-first, each carrying its running net owed.
 */
export interface PayoutLedgerView {
  readonly venueId: number;
  readonly currency: string;
  readonly netOwedMinor: number;
  readonly entries: readonly PayoutLedgerEntryView[];
}

/**
 * The outcome of an admin weather refund (`POST /api/venues/{id}/weather-refund?date=`, O7 #173,
 * invariant #10). Mirrors the backend `WeatherRefundView`: how many CONFIRMED bookings were cancelled +
 * fully refunded for the venue+date and the total in integer minor units (invariant #5). A {@link
 * refundedCount} of 0 is a valid **no-op** (no confirmed bookings that day), not an error.
 */
export interface WeatherRefundResult {
  readonly refundedCount: number;
  readonly totalRefundedMinor: number;
  readonly currency: string;
}

/**
 * A known Payouts-tab failure (O7 #173), mapped from the RFC-7807 `code` (issue #97) for operator copy.
 * One type for both the ledger read and the weather refund — their meaningful surface is identical:
 * `NOT_VENUE_OWNER` = the 403 cross-venue denial (invariant #13); `UNAUTHORIZED` = the expired session.
 */
export type PayoutErrorCode = 'NOT_VENUE_OWNER' | 'UNAUTHORIZED' | 'UNKNOWN';

/**
 * One rendered payout-ledger row (O7 #173) — a **presentational** view model: all money already
 * formatted from integer minor units (invariant #5), a reversal carrying a negative net + a reason
 * label. Shared by the ledger table and the statement modal ({@link PayoutStatement}) so the one row
 * shape doesn't drift between them. `ref` is the non-credential `#<bookingId>` reference (#7/#11).
 */
export interface LedgerRow {
  readonly bookingId: number;
  readonly ref: string;
  readonly dateLabel: string;
  readonly isReversal: boolean;
  readonly reasonLabel: string | null;
  readonly grossStr: string;
  readonly commissionStr: string;
  readonly netStr: string;
  /** The net cell's colour class — teal for an accrual, refund-red for a reversal. */
  readonly netClass: string;
}

/**
 * One pending Request-to-Book entry in the operator queue (issue #98,
 * `GET /api/venues/{venueId}/booking-requests`). Deliberately carries **NO booking code** — a pending
 * request isn't confirmed/paid yet and the code is the guest's unguessable bearer credential
 * (invariant #7), shown to staff only at arrival (in the Daily-view arrivals list), never at request
 * time. Moved here from the retired `staff` feature — the console is `StaffDaily`'s successor (O6 #176).
 */
export interface PendingRequestItem {
  readonly bookingId: number;
  readonly setId: number;
  readonly bookingDate: string; // ISO YYYY-MM-DD (Europe/Tirane civil day, invariant #6)
  readonly guestName: string;
  readonly amount: MoneyView;
  readonly requestedAt: string; // ISO-8601 UTC instant
  readonly requestExpiresAt: string; // ISO-8601 UTC instant (the response deadline)
}

/** The outcome of an accept/decline (issue #98): `AWAITING_PAYMENT` or `CONFIRMED` (accept), `DECLINED`. */
export interface RequestDecision {
  readonly bookingId: number;
  readonly status: string;
}

/**
 * A known accept/decline failure (O6 #176), mapped from the RFC-7807 `code` (issue #97) for
 * operator-facing copy. `REQUEST_EXPIRED` = the sweep won the race (the dismissible expired-race card);
 * `REQUEST_NOT_PENDING` = already handled; `NO_SUCH_REQUEST` = the 404; `PAYMENT_INIT_FAILED` = accept
 * couldn't open the guest's pay window; `NOT_VENUE_OWNER` = the 403 (invariant #13); `UNAUTHORIZED` =
 * the expired session.
 */
export type RequestErrorCode =
  | 'NO_SUCH_REQUEST'
  | 'REQUEST_NOT_PENDING'
  | 'REQUEST_EXPIRED'
  | 'PAYMENT_INIT_FAILED'
  | 'NOT_VENUE_OWNER'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

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

/**
 * A known layout-write failure, mapped from the RFC-7807 `code` (issue #97) for operator-facing copy.
 * `STALE_WRITE` = the 409 optimistic-concurrency loss (#226) — the layout was changed elsewhere since
 * the tab loaded it, so the editor keeps the operator's edits and offers a Reload (never a clobber).
 */
export type LayoutErrorCode =
  | 'LAYOUT_IN_USE'
  | 'DUPLICATE_POSITION'
  | 'CELL_TAKEN'
  | 'EMPTY_LAYOUT'
  | 'LAYOUT_TOO_LARGE'
  | 'NO_SUCH_VENUE'
  | 'STALE_WRITE'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'UNKNOWN';

/**
 * The operator's own view of a venue's admin profile (`GET /api/venues/{id}/profile`, O8 #177).
 * Mirrors the backend `VenueProfileResponse`: the editable core plus the two read-only display
 * fields — {@link commissionBps} (the platform's cut, invariant #9; the form shows it as a %) and
 * {@link payoutCurrency} (standing provisional). {@link bookingCutoff} is `"HH:mm"` (Europe/Tirane,
 * invariant #4/#6). NOT the public tourist `VenueMapView` — this carries commission, so its endpoint
 * is operator-gated (never the anonymous read).
 */
export interface VenueProfileView {
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly bookingMode: BookingMode;
  readonly bookingCutoff: string;
  readonly commissionBps: number;
  readonly payoutCurrency: string;
  readonly amenities: readonly Amenity[];
  readonly distanceToWaterM: number | null;
  /** The row's optimistic-concurrency token (#224); echoed back as {@link VenueProfileUpdate.expectedVersion}. */
  readonly version: number;
  /** Every photo slot's presence + preview URL (#142) — always all three keys, occupied or not. */
  readonly photos: Readonly<Record<PhotoSlotKey, SlotPhotoView>>;
}

/** A photo slot key as the REST path + the profile's `photos` map speak it (#142). */
export type PhotoSlotKey = 'cover' | 'sunbeds' | 'bar';

/**
 * One slot on the owner profile (#142): the PREVIEW variant's content-addressed serving URL, or
 * `null` when the slot is empty — emptiness IS the null URL (review F-11, no derivable boolean).
 */
export interface SlotPhotoView {
  readonly previewUrl: string | null;
}

/**
 * The widened venue-profile write body (`PATCH /api/venues/{id}`, O8 #177). Replaces the whole
 * editable profile — the form re-sends every field. **Commission + payout currency are read-only and
 * deliberately absent**: the write can never touch the platform's cut (invariant #9). A `null`
 * distance clears it; an unknown amenity code is rejected 400 server-side (existing contract).
 * {@link expectedVersion} is the optimistic-concurrency token loaded with the profile (#224): the
 * server rejects a write whose version no longer matches with `409 STALE_WRITE`, so a stale tab
 * can't clobber `bookingMode`/`bookingCutoff`.
 */
export interface VenueProfileUpdate {
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly bookingMode: BookingMode;
  readonly bookingCutoff: string;
  readonly amenities: readonly Amenity[];
  readonly distanceToWaterM: number | null;
  readonly expectedVersion: number;
}

/**
 * A known venue-details save/load failure (O8 #177), mapped from the RFC-7807 `code` (#97) for
 * operator-facing copy. `NOT_VENUE_OWNER` = the 403 cross-venue denial (invariant #13);
 * `NO_SUCH_VENUE` = the 404; `INVALID_REQUEST` = the 400 edge rejection (§6b); `STALE_WRITE` = the
 * 409 optimistic-concurrency loss — the venue was changed elsewhere since the tab loaded it (#224),
 * so the tab keeps the operator's edits and offers a Reload; `UNAUTHORIZED` = the expired session.
 */
export type VenueProfileErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'STALE_WRITE'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';
