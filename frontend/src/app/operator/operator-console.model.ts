import { Amenity } from '../shared/amenities';
import { BookingStatus } from '../shared/booking-status';
import { HeldSetState } from '../shared/availability-grid';
import { MoneyView } from '../shared/money';
import { BookingMode, PhotoSlotKey, Pool, Tier } from '../shared/venue-views';

/**
 * The operator console's "online takings today" read (`GET /api/venues/{id}/takings`). Money is integer
 * minor units + currency (invariant #5) — the FE renders it, never computes it; commission stays
 * server-side. {@link commissionBps} drives the "after {pct} commission" label.
 */
export interface TakingsView {
  readonly gross: MoneyView;
  readonly net: MoneyView;
  readonly commissionBps: number;
  readonly date: string;
}

/**
 * One set of a beach-map layout write: tier + pool tokens, integer minor-unit price (invariant #5), and
 * 1-based grid coordinates. Reuses the shared {@link Tier}/{@link Pool}/{@link MoneyView} read-contract
 * types so a written layout round-trips unchanged through the public map read.
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
 * The bulk beach-map replace body (`PUT /api/venues/{id}/beach-map`): the whole desired grid.
 * {@link expectedVersion} is the required optimistic-concurrency token — the `setVersion` the tab loaded
 * from the map read. The server rejects a write whose token no longer matches with `409 STALE_WRITE`,
 * and a missing token with `400`, so a stale layout tab cannot clobber the map.
 */
export interface BeachMapLayoutRequest {
  readonly sets: readonly LayoutCellRequest[];
  readonly expectedVersion: number;
}

/**
 * A known per-row reprice failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `NOT_VENUE_OWNER` is the cross-venue 403 (invariant #13); `STALE_WRITE` the 409 — the layout and
 * prices moved on since the tab loaded, so the tab reverts the row and offers a Reload.
 */
export type RepriceErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_ROW'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'STALE_WRITE'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/**
 * One booking in the Daily view's arrivals list (`GET /api/venues/{id}/bookings?date`) — which set
 * it holds, its arrival code, and its `status`: `CONFIRMED` (expected), `COMPLETED` (scanned in) or
 * `NO_SHOW` (the service day passed unscanned), so a past day still lists who was booked. The code
 * is a bearer credential (invariant #7): shown for arrival verification, never logged.
 */
export interface ConsoleDailyBooking {
  readonly setId: number;
  readonly code: string;
  readonly status: BookingStatus;
}

/** Successful check-in: which set the guest holds and the service date (never echoes the code). */
export interface CheckInResultView {
  readonly setId: number;
  readonly bookingDate: string;
}

/** The check-in POST's RFC-7807 `code` values the Daily view explains, plus the transport buckets. */
export type CheckInErrorCode =
  | 'ALREADY_CHECKED_IN'
  | 'WRONG_SERVICE_DATE'
  | 'BOOKING_NOT_FOUND'
  | 'NOT_VENUE_OWNER'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/**
 * One held set on the owner's daily availability read (`GET /api/venues/{id}/availability?date`) — the
 * authoritative `set_availability` state token for the day. Sparse: a free set is absent from the
 * response. `BOOKED_ONLINE` covers ANY online hold, paid or not, which is exactly what lets the console
 * stop mislabeling an unpaid hold as a walk-in.
 */
export interface SetDayState {
  readonly setId: number;
  readonly state: HeldSetState;
}

/** The kind of payout-ledger entry: a confirmed booking accrues, a refund reverses. */
export type PayoutEntryType = 'ACCRUAL' | 'REVERSAL';

/** Why a reversal happened; `null` on an ACCRUAL. */
export type RefundReasonCode = 'WEATHER' | 'POLICY' | 'CONFLICT';

/**
 * One row of the per-venue payout ledger (`GET /api/venues/{id}/payout-ledger`, invariant #9). Money is
 * integer minor units (invariant #5), `createdAt` a UTC instant (invariant #6), and `runningNetMinor`
 * the balance after this entry. Carries only {@link bookingId} — **no booking code, no guest identity**:
 * the `payout` module holds no tourist identity (invariant #11) and the code is a bearer credential
 * (invariant #7), so the console renders a non-credential `#<bookingId>` reference.
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
 * A venue's payout ledger (invariant #9). {@link netOwedMinor} is the **server-authoritative** net owed
 * (Σ ACCRUAL.net − Σ REVERSAL.net) in integer minor units — the console **renders** it, never recomputes
 * it (invariants #5/#9). Entries are oldest-first, each carrying its running net owed.
 */
export interface PayoutLedgerView {
  readonly venueId: number;
  readonly currency: string;
  readonly netOwedMinor: number;
  readonly entries: readonly PayoutLedgerEntryView[];
}

/**
 * The outcome of an admin weather refund (`POST /api/venues/{id}/weather-refund?date=`, invariant #10):
 * how many CONFIRMED bookings were cancelled + fully refunded for the venue and date, and the total in
 * integer minor units (invariant #5). A {@link refundedCount} of 0 is a valid **no-op**, not an error.
 */
export interface WeatherRefundResult {
  readonly refundedCount: number;
  readonly totalRefundedMinor: number;
  readonly currency: string;
}

/**
 * A known Payouts-tab failure, mapped from the RFC-7807 `code` for operator copy. One type for both the
 * ledger read and the weather refund — their meaningful surface is identical: `NOT_VENUE_OWNER` is the
 * cross-venue 403 (invariant #13), `UNAUTHORIZED` the expired session.
 */
export type PayoutErrorCode = 'NOT_VENUE_OWNER' | 'UNAUTHORIZED' | 'UNKNOWN';

/**
 * One rendered payout-ledger row — a **presentational** view model: all money already formatted from
 * integer minor units (invariant #5), a reversal carrying a negative net plus a reason label. Shared by
 * the ledger table and the statement modal ({@link PayoutStatement}) so the one row shape cannot drift
 * between them. `ref` is the non-credential `#<bookingId>` reference (invariants #7/#11).
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
 * One pending Request-to-Book entry in the operator queue
 * (`GET /api/venues/{venueId}/booking-requests`). Deliberately carries **no booking code** — a pending
 * request is not confirmed or paid yet, and the code is the guest's unguessable bearer credential
 * (invariant #7), shown to staff only at arrival in the Daily-view arrivals list.
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

/** The outcome of an accept/decline: `AWAITING_PAYMENT` or `CONFIRMED` (accept), `DECLINED`. */
export interface RequestDecision {
  readonly bookingId: number;
  readonly status: string;
}

/**
 * A known accept/decline failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `REQUEST_EXPIRED` means the sweep won the race (the dismissible expired-race card);
 * `PAYMENT_INIT_FAILED` that accept could not open the guest's pay window; `NOT_VENUE_OWNER` is the
 * cross-venue 403 (invariant #13).
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
 * A known staff walk-in **mark** failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `ALREADY_TAKEN` is the 409 — the set was just taken by the other channel; `DATE_IN_PAST` the 422
 * cutoff (invariant #4); `NOT_VENUE_OWNER` the cross-venue 403 (invariant #13).
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
 * A known staff **release** failure. `NOT_MARKED` means the set was free or online-held — a safe no-op,
 * since the server only deletes a `STAFF_MARKED` row.
 */
export type ReleaseErrorCode = 'NOT_MARKED' | 'NOT_VENUE_OWNER' | 'UNAUTHORIZED' | 'UNKNOWN';

/**
 * A known layout-write failure, mapped from the RFC-7807 `code` for operator-facing copy. `STALE_WRITE`
 * is the 409 optimistic-concurrency loss — the layout was changed elsewhere since the tab loaded it, so
 * the editor keeps the operator's edits and offers a Reload, never a clobber.
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
 * The operator's own view of a venue's admin profile (`GET /api/venues/{id}/profile`): the editable core
 * plus the two read-only display fields, {@link commissionBps} (the platform's cut, invariant #9; the
 * form shows it as a %) and {@link payoutCurrency}. {@link bookingCutoff} is `"HH:mm"` in Europe/Tirane
 * (invariants #4/#6). Not the public tourist map view — this carries commission, so its endpoint is
 * operator-gated rather than the anonymous read.
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
  /** The row's optimistic-concurrency token; echoed back as {@link VenueProfileUpdate.expectedVersion}. */
  readonly version: number;
  /** Every photo slot's presence + preview URL — always all three keys, occupied or not. */
  readonly photos: Readonly<Record<PhotoSlotKey, SlotPhotoView>>;
}

/**
 * One slot on the owner profile: the PREVIEW variant's content-addressed serving URL, or `null` when the
 * slot is empty — emptiness IS the null URL, with no derivable boolean beside it.
 */
export interface SlotPhotoView {
  readonly previewUrl: string | null;
}

/**
 * The venue-profile write body (`PATCH /api/venues/{id}`). Replaces the whole editable profile — the
 * form re-sends every field. **Commission and payout currency are read-only and deliberately absent**:
 * the write can never touch the platform's cut (invariant #9). A `null` distance clears it; an unknown
 * amenity code is rejected `400` server-side. {@link expectedVersion} is the optimistic-concurrency
 * token loaded with the profile, so a stale tab meets `409 STALE_WRITE` rather than clobbering
 * `bookingMode`/`bookingCutoff`.
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
 * A known venue-details save/load failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `NOT_VENUE_OWNER` is the cross-venue 403 (invariant #13); `STALE_WRITE` the 409 — the venue was
 * changed elsewhere since the tab loaded it, so the tab keeps the operator's edits and offers a Reload.
 */
export type VenueProfileErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'STALE_WRITE'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';
