import { Amenity } from '../shared/amenities';
import { BookingStatus } from '../shared/booking-status';
import { HeldSetState } from '../shared/availability-grid';
import { MoneyView } from '../shared/money';
import { BookingMode, PhotoSlotKey, Pool, Tier, VenueMapView } from '../shared/venue-views';

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
 * The body of a per-set beach-map write (`POST /api/venues/{id}/sets`,
 * `PATCH /api/venues/{id}/sets/{setId}`). The **whole** set position — the server rejects a partial
 * PATCH body `400`, which keeps a set's fields mutually consistent for the layout-uniqueness checks.
 * Structurally the bulk write's per-cell shape ({@link LayoutCellRequest}) and deliberately its own
 * name: these three carry **no** `expectedVersion`, because they do not participate in the
 * `set_version` optimistic-concurrency token the bulk replace and the row reprice share.
 */
export interface SetWriteRequest {
  readonly rowLabel: string;
  readonly positionNo: number;
  readonly tier: Tier;
  readonly pool: Pool;
  readonly price: MoneyView;
  readonly gridX: number;
  readonly gridY: number;
}

/**
 * The body of the set batch apply (`PATCH /api/venues/{id}/sets`): the swept set ids plus ONLY the
 * fields the operator touched — an absent field leaves each set's own value alone, server-side. At
 * least one of `tier`/`pool`/`price` must be present (the server answers `400` otherwise).
 * {@link expectedVersion} is the same `setVersion` token the bulk replace and the row reprice guard:
 * a stale one refuses the whole batch `409 STALE_WRITE`.
 */
export interface SetBatchRequest {
  readonly setIds: readonly number[];
  readonly tier?: Tier;
  readonly pool?: Pool;
  readonly price?: MoneyView;
  readonly expectedVersion: number;
}

/** What the set batch apply answers: how many sets the one transaction changed. */
export interface SetBatchResult {
  readonly updated: number;
}

/**
 * A known set batch apply failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `NO_SUCH_SET` means a swept id is not on the venue (removed from another tab — per-set writes do
 * not bump `setVersion`), and the whole batch was refused so the count is never a lie;
 * `STALE_WRITE` is the venue-level 409 the editor's reload banner owns. There is no claim guard:
 * price, tier and pool are never refused on any set.
 */
export type SetBatchErrorCode =
  | 'STALE_WRITE'
  | 'NO_SUCH_SET'
  | 'NO_SUCH_VENUE'
  | 'NOT_VENUE_OWNER'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

/** What `POST /api/venues/{id}/sets` answers: the new set's id, for an immediate re-select. */
export interface CreatedSet {
  readonly id: number;
}

/**
 * A known per-set write failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `SET_IN_USE` is the server's claim guard — a reposition or a removal of a set carrying a live hold
 * or a non-terminal booking; price, tier and pool are never refused, and a finished booking refuses
 * nothing (the removal retires the set instead of deleting it). It is the **ordinary** answer on a
 * trading venue rather than a fault. The owner's beach-map read ({@link OperatorBeachMap}) names the
 * same sets in advance, so the editor disables a move or a removal before it is tried; the server's
 * answer still decides, because a claim can land between the read and the write.
 */
export type SetWriteErrorCode =
  | 'SET_IN_USE'
  | 'CELL_TAKEN'
  | 'DUPLICATE_POSITION'
  | 'NO_SUCH_SET'
  | 'NO_SUCH_VENUE'
  | 'NOT_VENUE_OWNER'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

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
 * A known per-row rename failure, mapped from the RFC-7807 `code` for operator-facing copy.
 * `ROW_NAME_TAKEN` is the rename path's 409 — another row already carries the requested label, which
 * would merge the two wherever sets are grouped by label (the bulk replace answers the same code for
 * a label split within its batch); `STALE_WRITE` is the venue-level 409 the editor's reload banner
 * owns, not a per-row error.
 */
export type RowNameErrorCode =
  | 'NOT_VENUE_OWNER'
  | 'NO_SUCH_ROW'
  | 'NO_SUCH_VENUE'
  | 'INVALID_REQUEST'
  | 'ROW_NAME_TAKEN'
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

/**
 * Why one set on the owner's beach map cannot be moved or removed right now, from
 * `GET /api/venues/{id}/beach-map`: `bookedOn` is the earliest service day a guest is still coming on
 * (a booking that can still be honoured), `heldOn` the earliest hold dated today or later — each an ISO
 * `YYYY-MM-DD` (invariant #6) or `null` when that arm does not hold, never both null (a booked set
 * usually carries both). The set's price, tier and pool stay editable; the lock means "cannot move or
 * remove" only.
 */
export interface SetLock {
  readonly setId: number;
  readonly bookedOn: string | null;
  readonly heldOn: string | null;
}

/**
 * The owner's beach-map read: the venue map in the public read's exact shape, and the sparse `locks`
 * list beside it — one entry per set a live claim pins, ordered by set id, nothing for a free set.
 * Owner-asserted server-side (invariant #13): which sets guests hold never reaches the public map.
 */
export interface OperatorBeachMap {
  readonly map: VenueMapView;
  readonly locks: readonly SetLock[];
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

/** The three-value on-day close: the one definition lives with the tourist mirror in `shared/`. */
export type { SalesCloseTime } from '../shared/venue-views';
import type { SalesCloseTime } from '../shared/venue-views';

/**
 * The operator's own view of a venue's admin profile (`GET /api/venues/{id}/profile`): the editable core
 * plus the two read-only display fields, {@link commissionBps} (the platform's cut, invariant #9; the
 * form shows it as a %) and {@link payoutCurrency}. {@link bookingCutoff} is `"HH:mm"` in Europe/Tirane
 * (invariants #4/#6); {@link salesClose} is the three-value on-day close. Not the public tourist map
 * view — this carries commission, so its endpoint is operator-gated rather than the anonymous read.
 */
export interface VenueProfileView {
  readonly name: string;
  readonly beach: string;
  readonly region: string;
  readonly description: string;
  readonly bookingMode: BookingMode;
  readonly bookingCutoff: string;
  readonly salesClose: SalesCloseTime;
  readonly commissionBps: number;
  readonly payoutCurrency: string;
  readonly amenities: readonly Amenity[];
  readonly distanceToWaterM: number | null;
  /** The row's optimistic-concurrency token; echoed back as {@link VenueProfileUpdate.expectedVersion}. */
  readonly version: number;
  /** Every photo slot's presence + preview URL — always all three keys, occupied or not. */
  readonly photos: Readonly<Record<PhotoSlotKey, SlotPhotoView>>;
  /**
   * The venue's closed-for-season state. Read-only here — written through
   * {@link OperatorConsoleService.closeForSeason} / `reopenForSeason`, never the profile PATCH.
   * Optional because test doubles and older payloads may omit it; absent reads open.
   */
  readonly seasonClosure?: SeasonClosureView;
}

/**
 * The season-closure block of the owner profile: `closed` is the server's verdict at read time (a
 * closure whose reopen day has arrived reads open), `reopenOn` (ISO `YYYY-MM-DD`, Europe/Tirane) and
 * `advanceSales` the stored values. The tab keys on `closed` and never compares a date with a clock.
 */
export interface SeasonClosureView {
  readonly closed: boolean;
  readonly reopenOn: string | null;
  readonly advanceSales: boolean;
}

/**
 * `PUT /api/venues/{id}/season-closure` body: close with an optional reopen day and the
 * advance-sales opt-in (default off — a beach re-laid in spring must not collect winter bookings).
 * The opt-in without a reopen day is rejected `400` server-side, so the tab never sends that pair.
 */
export interface SeasonClosureRequest {
  readonly reopenOn: string | null;
  readonly advanceSales: boolean;
}

/** The close response: the closure now in force and what guests are still owed from today. */
export interface SeasonClosureResult extends SeasonClosureView {
  readonly closedForSeason: boolean;
  readonly futureBookings: number;
  readonly pendingRequests: number;
}

/** A close/reopen failure: the profile codes plus a reopen day the server refuses as not after today. */
export type SeasonClosureErrorCode = VenueProfileErrorCode | 'REOPEN_DATE_PASSED';

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
  readonly salesClose: SalesCloseTime;
  readonly amenities: readonly Amenity[];
  readonly distanceToWaterM: number | null;
  readonly expectedVersion: number;
}

/**
 * The full-replace {@link VenueProfileUpdate} that would re-save `view` unchanged: every editable
 * field mapped faithfully (photos are not profile-write fields; `expectedVersion` echoes the view's
 * `version`). The venue tab's save and the daily view's close-sales write both build on it, so the
 * profile→write mapping cannot drift between the two surfaces.
 */
export function toProfileUpdate(view: VenueProfileView): VenueProfileUpdate {
  return {
    name: view.name,
    beach: view.beach,
    region: view.region,
    description: view.description,
    bookingMode: view.bookingMode,
    bookingCutoff: view.bookingCutoff,
    salesClose: view.salesClose,
    amenities: view.amenities,
    distanceToWaterM: view.distanceToWaterM,
    expectedVersion: view.version,
  };
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
