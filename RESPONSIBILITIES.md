# System Responsibilities

The Job / Not-My-Job boundary of each `ai.riviera.platform` module — what it owns and, more
usefully, what it must **refuse to own** — plus the invariants' long form and the settled
platform-edge rules (`CLAUDE.md` holds the module table and the one-line invariants). When a
boundary is ambiguous in a plan or review, this file is the tie-breaker. Present-tense contracts
only (a rule's history is on its ADR, issue or PR); one rule per bullet, each bullet or paragraph
≤ 8 lines (`riviera-java-conventions` §6d, gated in CI). Only the **structural** subset is
machine-enforced: see [Machine-checked vs review-checked](#machine-checked-vs-review-checked).

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist opens a venue and sees its beach map (**`venue`**) with each set free, **partly free**
   or taken (**`availability`**) for one day or for each day of a stay (≤ `StaySpan#MAX_DAYS`; at a
   Request-to-Book venue the same span is one request, answered whole).
2. They pick a set and days and give guest-checkout contact (**`customer`** owns it); **`booking`**
   opens one booking for the whole stay.
3. **`booking`** has **`availability`** claim one `(set, date)` row per day **atomically** — a
   losing day gives back those already won — then commits the booking `AWAITING_PAYMENT` with its
   booking code, all **before** any money moves.
4. **`payment`** creates the Stripe PaymentIntent (`booking` never touches Stripe) and reconciles
   the result from the **signature-verified webhook**, never a client "success" redirect.
5. **`booking`** transitions to `CONFIRMED` and publishes `BookingConfirmed`: **`payout`** accrues
   the venue's ledger entry (idempotently), **`notification`** mails the confirmation, and
   `availability` needs no listener — step 3 claimed the set.
6. On arrival, staff scan the booking's QR (or type its code), stamping today's service day
   attended, once per day; the stay's last day resolves it `COMPLETED`. A staff tap-to-mark
   walk-in is **`availability`**'s pool-agnostic `STAFF_MARKED` row on the same `(set, date)`.
7. On a guest cancel, **`booking`** applies the policy, frees every day **synchronously** via
   `availability`'s `release`, and publishes `BookingCancelled`: **`payout`** reverses its entry,
   `booking`'s own refund listener drives **`payment`**'s `RefundPort` with the amount `booking`
   decided, and **`notification`** mails the record with that amount.

> **Variant — Request-to-Book** (per the venue's booking mode): step 3 commits the booking as
> `PENDING_REQUEST`, uncharged and **unclaimed** (ADR-0025), until the host accepts or declines
> (ownership via `operator::api`); `booking` owns that lifecycle, its expiry sweep and the guest's
> **withdraw** (authorized by the booking code alone). The accept claims every day, declines the
> overlapping requests, and `payment` issues the PaymentIntent; the Instant spine runs on from step 4.

**Decision vs. execution is split, three times.** `booking` owns the cancellation/refund
*policy*, `payment` *executes* the refund; `venue` stores the commission *rate*, `payout` *does*
the arithmetic; `review` computes the rating, `venue` stores it. No executor re-decides.

---

## `venue`
**Job:** Own venue profiles (amenities, distance-to-water, map pin), the beach map (sets, positions,
each set's online-vs-walk-in pool), pricing, the booking mode (Instant / Request), photos, the sales
close, the maximum stay, the season closure, and the commission rate over time. The standing rules:

- **The tourist catalogue reads are visibility-fenced; `SetBookingFacts` is not.** All three
  `VenueCatalog` reads (list, map, availability calendar) consult `operator.api.VenueVisibility` in
  the adapter, so a venue whose operator is not `ACTIVE` is indistinguishable from nonexistent.
  `SetBookingFacts` stays **unfenced** and is the one port that answers for a **retired set**
  (ADR-0019): cancel, the booking view, the mails and the staff lookup must keep resolving a hidden
  venue's sets and a spot that left the map. The reserve path fences visibility itself in `booking`;
  the retired-set fences are `poolForClaim` for both claim paths and the `ForReserve` reads for both
  booking modes (a request claims nothing, ADR-0025). Photo serving is visibility-fenced too.
- **Venue photos** (ADR-0008): per-slot upload/replace/delete, processing, `bytea` storage behind
  the module-internal `PhotoStorage` port, the content-hash serving read — `404` (bytes and `304`)
  for a hidden venue except to its owner or an admin, served `private` (ADR-0013). **Each tourist
  surface reads its own slideshow list** — one photo per occupied slot in `PhotoSlot` order, `CARD`
  preferred for the list read's `photos`, `BANNER` for the map read's `photos`, `LIGHTBOX` for
  `lightboxPhotos` — so one list's widest candidate never reaches another. Trap: the slot order is
  the iteration order of the `EnumMap` `JdbcVenueCatalog` builds per venue; any other map loses it.
- **Photo moderation is ownership-free by design** (ADR-0013), on its own `VenuePhotoModeration`
  port so `VenuePhotos` stays uniformly `assertOwns`-first; the `ADMIN` role gate is the whole
  authorization. A takedown removes one **slot**, not one image — a byte-identical copy in another
  slot keeps serving; an unknown venue reads as an empty slot.
- **I store the rating aggregate; `review` computes it.** `rating_tenths` / `reviews_count` are my
  columns and I am their **only** writer, but I own neither the arithmetic nor the policy. On
  `review.events.ReviewsChanged` I re-read the whole answer (`review.api.VenueRatingSummary`) and
  overwrite — a **full recompute**, never an increment, so at-least-once redelivery converges; only
  the venue id is taken off the event. Recomputes of one venue serialize on its row lock
  (`VenueRatings#lockForRecompute`), taken in the transaction before the totals are read — else a
  listener holding stale totals can commit last and pin the venue to an older score.
- **One adapter, `JdbcVenues`, serves `Venues`, `CommissionRateStore` and `VenueRatings`**, as all
  three write the one `venue` row. The ports split by the caller's conversation — an owner editing
  their venue, the platform setting a commercial term or storing `review`'s rating — not by table.
- **A layout write is refused only when a live claim depends on it.** Only a position move or a
  removal asks the claim question, under `FOR UPDATE` on the active set rows: `editSet`/`removeSet`
  for their one set (`SET_IN_USE`), the bulk save for every set it removes or renumbers
  (`SETS_IN_USE`, naming each). **Price, tier and pool are never refused, on any set** — single-set
  edit, batch apply and bulk save alike (a booking's charge is snapshotted at reserve); the
  row-scoped `repriceRow` and `renameRow` destroy nothing and ask no claim question either.
- **The pool is a sales-channel attribute, not a physical one**, and invariant #3 is reserve-time:
  a set switched to walk-in stops new online reserves for every date, its booked dates stay claimed
  (a staff mark on one is still refused), and the staff daily view still lists the online booking.
- **"Live" is one predicate, `LiveClaims`, for every write guard and the owner's read.** A set is
  pinned by a hold dated today or later (`Europe/Tirane`) or a booking `booking` says can still be
  honoured (`BookingPresence#hasLiveBookings`); `venue` never enumerates booking statuses. A past
  hold freezes nothing: a past date is never claimable, so the probe's blind range is one nothing
  can be written into. A finished booking refuses nothing but decides how the set leaves: **any
  booking → retired, never deleted** (`retired_at`, ADR-0019), because the `booking.set_id` FK pins
  its row for every booking, mail and payout line naming it; no booking → deleted.
- **Retired sets — the exclude and exempt lists, machine-held.** Excluded: the tourist list and its
  counts, the map, the availability calendar, the operator's daily view, every layout lock and
  conflict probe, both claim paths and the reserve on both booking modes (`NO_SUCH_SET`) — each
  reads `active_set_position`; every update and delete says `retired_at IS NULL`, so a retired set's
  label and price stay frozen and its slot and cell free for a new set. The reserve reads lock the
  set through the view as `poolForClaim` does (a single-set retire takes no venue lock). Exempt, by
  constant name in `JdbcSetBookingFacts`: `setBookingInfo(s)` (cancel, booking view, mails, staff
  lookup) and the reserve's venue lock; `RetiredSetExclusionArchitectureTests` holds the rest.
- **The bulk save (`PUT …/beach-map`) is a diff keyed by grid cell, never a delete-all.** The body
  carries no set ids, so a set that changes cell is a removal plus an insert — the removal question
  is the move question. Only removed sets and kept ones whose position number changes are probed,
  through `LiveClaims#locksOn`, so a refusal names exactly the sets the editor already pins. A
  refused save writes nothing and spends no token; a successful one advances it once, an unchanged
  layout included. Write order is load-bearing — removals, every kept set leaving its slot parked
  (`Venues#parkRowLabels`), updates, inserts — so the non-deferrable uniqueness index never sees two
  sets in one slot mid-save (swaps, shifted renumbers, relabel chains).
- **Row names.** A rename is refused only for `ROW_NAME_TAKEN` (another row carries the label); a
  rename to its own label is a no-op that spends no token. The bulk save enforces one label per
  physical row within its batch; the single-set `addSet` and `editSet` do not check it. A row's name
  stays editable on a claimed set (the rename, the bulk save): `row_label` lives on `set_position`
  alone, so a booked guest reads the new name live while the mail in their inbox keeps the old one.
- **The remodel preview and commit are the bulk save's diff, without and with a gate.**
  `BeachMapRemodel#preview` takes no row lock (so it never queues a claim's FK lock) and writes
  nothing: a snapshot the save re-decides. `#commit` runs the one `LayoutWriter` and, between the
  set locks and the probe, asks the caller's `RemodelGate`; `booking` re-seats guests inside my
  transaction, the `Proceed` verdict's **kept sets** stay exactly as stored and unprobed, and any
  refusal rolls layout and moves back together. What a booking becomes is `booking`'s
  (`RemodelClaims`); the spots it ranks are mine to render (`SetBookingFacts#activeSetsOf`,
  `#freeOnlineSetsOn`: the active map minus the day's availability rows).
- **`SetBookingFacts#poolForClaim` is a locking read, because the pool is mutable.** `FOR KEY
  SHARE` is the weakest lock that conflicts with the set-writes' `FOR UPDATE`, so a claim racing a
  pool flip decides against the committed pool, whichever commits first. Trap: it must run in a
  read-write transaction, never a read-only one; the unlocked `setBookingInfo` serves list and mail.
  The reserve's `setBookingInfoForReserve` and the request accept's `lockVenueForClaim` take the venue row
  `FOR SHARE` (`KEY SHARE` would not conflict with a non-key `UPDATE venue`), venue before set as the
  set-writes lock, so venue writers (closure, profile, commission, rating, layout token) queue behind
  in-flight reserves and accepts (#1304, #1305); the reserve then takes its sets `FOR KEY SHARE` (#1284).
- **The batch apply (`applyToSets`) is one transaction on the `set_version` token.** Lock order:
  the venue row (`lockAndReadSetVersion`), then the named set rows `FOR UPDATE` — the order every
  set-write takes, so none deadlocks another. A stale token (`STALE_WRITE`) or a set id not on the
  venue (`NO_SUCH_SET`) refuses the whole batch before any write — the latter because `removeSet`
  does not bump the token, and "N sets updated" must never overstate. Success advances it once.
- **The pool vocabulary is stated once**, in `venue.vocabulary.Pool` (ADR-0018 §3): no production
  class, this module included, holds an `"ONLINE"` / `"WALK_IN"` literal
  (`PoolTokenArchitectureTest`), so both invariant #3 checks compare the published type; the wire
  keeps the tokens, parsed once in `PoolToken`.
- **A set price is EUR minor units of at least €0.50** (Stripe's EUR minimum charge;
  `venue.vocabulary.SetPrice`, twinned by V76's currency and V77's floor CHECKs; #1294). EUR is the
  v1 collection currency (invariant #5, long form).
  Every price write (single set, batch apply, row reprice, bulk save, the remodel's `LayoutCell`)
  refuses anything else with `400`, so a venue never holds two currencies: the itinerary price and a
  stay's charge read one. The venue's **payout** currency is a different field, any ISO-4217 code.
- **The commission rate over time, not just its current value.** `venue_commission_rate` is the
  effective-dated schedule behind `VenueRates#commissionBpsOn` (reports on a served date), while
  `commissionBps` is the live rate every *decision* re-reads; `payout` keeps the arithmetic. The
  admin write (`VenueCommissionAdministration`, ownership-free) is **forward-only**: the live rate
  moves at once, no past service date reprices, no ledger entry is touched (invariant #9). The
  owner's profile PATCH cannot write the rate — a venue does not set its own commission.
- **A commission change schedules from today, never tomorrow** (the current service date,
  `Europe/Tirane`). Today still sells until sales close (invariant #4), so today's new accruals
  carry the new live rate; a later start would leave today's takings (`commissionBpsOn`) reporting a
  rate those accruals do not carry. Unlike photo moderation, the admin rate write answers an unknown
  venue `404 NO_SUCH_VENUE`: the admin's venue list is complete, and a stale id must fail loudly.
- **The per-venue sales-close setting** (`sales_close`, invariant #4): `00:01`/`16:00`/`23:59`
  (`Europe/Tirane`) on the date itself, owner-editable on the profile PATCH (absent on create →
  16:00); the console's "close today's online sales now" is the same write, no per-day override.
  `SetBookingInfo` carries it to `booking`'s reserve path. Reads project `salesOpen` (on-day close
  and season closure together) through my `spi` `SalesWindow`, implemented by `booking`, with one
  request-scoped instant per read: the port returns the verdict, never a close instant. The map's
  `salesClose` (`HH:mm`) is a display-copy key; clients never compare it with a clock.
- **The per-venue maximum stay** (`max_stay_days`, design D10; owner-editable): `NULL` is any
  length, else `>= 1`; the platform sets no maximum of its own. I store the number;
  `SetBookingInfo#maxStayDays` carries it to `booking`, whose verdict refuses a longer span
  (`STAY_TOO_LONG`) before any claim; the tourist map carries it as the calendar's last-day ceiling.
- **The season closure** (`closed_at`, `reopen_on`, `advance_sales`; glossary *Closed for season*)
  has its own owner-asserted endpoint (`CloseForSeason`), never the profile full-replace: a state
  change rides no version token, and the close answers what guests are still owed
  (`LiveBookingCounts`, via my `spi` `BookingPresence#liveBookingsFrom`). A reopen day not after
  today is `REOPEN_DATE_PASSED`. Closing touches no booking, hold, request or walk-in mark. It
  serializes with the reserve and the request accept on the venue row: `SetBookingFacts#setBookingInfoForReserve`
  and `#lockVenueForClaim` take it `FOR SHARE` first, so the close waits and counts the booking, or the reserve
  is refused (#1304).
- **A venue closed for season stays visible; I store the closure, `booking` keeps the rule**
  (`BookingCutoff`, via `SalesWindow`). The list and map project `closedForSeason` / `reopensOn`
  beside `salesOpen` (the list sorts closed venues last) and the calendar carries `salesOpen` per
  day — one projection, never a second flag the client ANDs. Nothing sweeps: the stored closure
  outlives its reopen day until the operator closes again or reopens.
- **The tourist availability calendar** (`…/availability-calendar`; public, window-capped at the
  edge): I own the set total, hence `free = total − taken` and the gap fill; `availability` answers
  the taken count per day (`SetAvailabilityLookup#takenCountsBetween`), and the map read's optional
  `lastDate` answers each set for a stay off `takenDaysBetween`. `StaySpan#MAX_DAYS` is a technical
  ceiling, never a venue's stay cap. The counts are a snapshot, never a hold (invariant #2), and
  cover past days — availability, not bookability; each day's `salesOpen` is display only.
- **The public review list** (`…/reviews`): I carry it, `review` decides it. My service fences on
  tourist visibility and passes `review.api.ListedReviews`' page straight through; it lives here as
  the fence is my catalogue rule and `review` is a leaf that cannot consult `operator` (ADR-0015).
- **Venue location is mine, and optional.** The `latitude`/`longitude` pin is placed by the
  operator by hand (ADR-0022) — no geocoder, no PostGIS, no spatial index (invariant #1).
  Validation is **range-only** plus whole-or-absent (`venue_location_check`, mirrored by
  `VenueLocation`; a `400` at the edge, the CHECK the race-safe backstop); no bounding-box
  geo-fence — a wrong pin is the operator's to move. **A null location means "not on the riviera
  map, still in the list"**, never an error or a hidden venue. It has no resource of its own: the
  owner's profile `PATCH` is a full replace, so a body with no location unpins the venue.
- **The signed-in operator's own-venues read** (`GET /api/venues/mine`): I ask `operator::api` for
  the ownership set and name the venues — naming is my job, and `operator → venue` would cycle. It
  is `MyVenuesController`, not a `VenueAdminController` mapping: every mapping there asserts
  ownership of a path `venueId`, while this one *is* the ownership question. The literal `/mine`
  outranks `/{venueId}` in Spring's pattern comparator, so it is never read as an id.
- **The owner's per-set daily availability read** (`…/availability?date=`; owner-asserted, 403
  before existence): `availability` answers the state tokens (`SetAvailabilityLookup#statesOn`);
  I compose. The public map stays state-agnostic — hold type never reaches a public surface.
- **The owner's beach-map read** (`…/beach-map`; owner-asserted, 403 before existence; the layout
  editor's seed): the tourist map, fence included, plus a sparse `locks` list — per pinned set, the
  span its live bookings hold (`BookingPresence#nearestLiveBookings`: earliest first day to latest
  last day) and the nearest hold — by the same `LiveClaims` predicate the write guards ask. A lock
  means *cannot move or remove*, never *cannot repaint*: the editor still edits a locked set's
  price, tier and pool. Which sets a venue's guests hold never reaches the public map.

**Not My Job:**
- Knowing whether a specific set is free on a date → **`availability`**
- Creating or tracking bookings → **`booking`**
- Collecting money, or knowing an amount was paid → **`payment`** (I set the price)
- The payout math or commission arithmetic → **`payout`** (I store the rate schedule)
- Deciding *which* venues an operator owns → **`operator`** (I name them; the set is its call)
- Deciding what a rating *is*, or which reviews are listed → **`review`** (I hold the numbers)

---

## `availability`
**Job:** Own the single source-of-truth state per `(set, date)` — free / booked-online /
staff-marked — as that table's **only writer**, claiming atomically so a set is never double-sold
(invariant #2). I answer state through `venue::spi` (`SetAvailabilityLookup`) and `venue` composes:
how many sets are held, never how many exist; hold type only to owner-asserted reads. The taken
days per set are also `api.SetAvailabilityFacts`, the `itinerary` read model's read, spi-free. A remodel
move is my ordinary writes in `venue`'s commit transaction — every day claimed on the new set before
any is released on the old, never a swap of my own — so a racing reserve wins or loses as usual.

- **Staff tap-to-mark** (`POST`/`DELETE /api/venues/{venueId}/sets/{setId}/availability`) is my
  other write path: `StaffAvailabilityService` asserts the operator owns the path venue first
  (invariant #13 — why I depend on `operator::api`), refuses a past `Europe/Tirane` date
  (`DATE_IN_PAST` → `422`), then marks with the claim's `ON CONFLICT DO NOTHING`; release deletes
  only a `STAFF_MARKED` row. The SQL sits behind the module's own out port `application.StaffMarks`
  (adapter `JdbcStaffMarks`), joining the service's transaction; no `application/` class names JDBC
  (`JdbcOnlyArchitectureTests`).

**Not My Job:**
- The venue layout, which sets exist, their positions or prices → **`venue`**
- *Why* a set is taken (which booking, who paid) and whether a date still sells → **`booking`**
- Collecting payment → **`payment`**

---

## `booking`
**Job:** Own bookings, booking codes, and the lifecycle. The standing rules:

- **A booking is a span: `booking_date` the first service day, `last_date` the last, inclusive.**
  An insert naming no last day is one-day (trigger `booking_last_date_on_insert`);
  `booking_span_check` (Java twin `domain/ServiceDays`) refuses a last day before the first. "Who is
  booked on D" selects by overlap; "still owed from D on" and the retention basis read `last_date`.
- **Every terminal transition of a claim releases every day of the span**, and a remodel move claims
  every day on the candidate before freeing the old set; only the guarded `UPDATE … RETURNING`'s
  winner releases. `set_availability` has no link to a booking, so a day a leg forgets is
  unrecoverable and a day a leg releases without holding is someone else's (invariant #2);
  `SpanReleaseIT` re-claims the span after each leg. A pending request is no claim: decline, expiry,
  withdraw and the remodel decline release nothing (`RequestHoldsNothingIT`, ADR-0025).
- **A reserve fences before any claim, on both booking modes:** a hidden venue's set
  (`operator.api.VenueVisibility`) is `NO_SUCH_SET`, and no later leg consults visibility; a season
  closure that does not admit every day is `VENUE_CLOSED` (the venue is deliberately visible); the
  sales close is judged on the first day (invariant #4); a span over the venue's maximum stay is
  `STAY_TOO_LONG`. A stitched plan judges every stretch's set over the whole stay. The fence facts are
  read through `SetBookingFacts#setBookingInfo(s)ForReserve`, under the venue row lock (#1304), and a
  retired set reads as absent there, so it is `NO_SUCH_SET` on both modes (#1284).
- **Then it claims every day, all or nothing:** a day that loses gives back every day won, then
  answers `SET_TAKEN` (`ConcurrentRangeReservationIT`). One PaymentIntent for per-day price × days
  (invariant #5); the cancellation window and refund are the first day's, on what remains of the
  amount once any refunded day is off it (invariant #10, ADR-0026, ADR-0027). The staff daily list and daily takings count `CONFIRMED`, `COMPLETED` and
  `NO_SHOW` (a resolved stay still happened, its money kept). The daily list names the guest's
  whole span (a stitched stay's, not the stretch's) and the day's own `booking_day` attendance;
  takings count each covering booking's **day share** (`DayShare`: the amount split over its days,
  remainder on the first), so a fortnight's money lands on the days it serves (design D4).
- **The reserve commits before any payment call** (no row lock spans the gateway round-trip), and
  that does not weaken invariant #2: the guard is `UNIQUE (set_id, booking_date)` plus the atomic
  `INSERT … ON CONFLICT DO NOTHING` claim, which holds however long the lock is held.
- **A stitched stay is a group of bookings under one `stay` row (ADR-0024, design D6); I am its sole
  writer.** One booking per stretch; the stay's code is the guest's one credential (invariant #7) and
  a stretch's row code (`<stayCode>-<n>`) is never shown and resolves nothing (`JdbcBookings.CODE_MATCH`):
  view, cancel, check-in, staff list, mail facts and review eligibility (once no stretch is live)
  answer the stay's code. The reserve (`CreateStay`, `POST /api/stays`) validates the plan's shape,
  judges every stretch by the shared `ReserveFences`, claims every day of every stretch all or nothing
  (`ConcurrentStayReservationIT`) and collects once with one share per stretch; a stay cancels whole, each
  stretch quoted on the stay's first day (#10) and reversed once (#9), bar the next bullet's exception.
- **A guest cancel of a stay sets aside the stretches a remodel already ended, and a confirmed stretch with
  nothing left** (ADR-0024 §4 as amended, #1290; ADR-0026 §7, #1381): `LiveRemainder` keeps the live rest, judged
  on the first live day — what a same-set booking of the dates the guest still holds would be quoted — and the
  view and the stay cancellation mail read the same split (#10). The predicates are the receipt's outcome lines
  (`RemodelReceipts#endedByRemodel`, both endings being `VENUE_CHANGE`) and `BookingRecord#everyDayRefunded`; a
  stretch ended any other way (a weather cancel, a concurrent writer) still refuses the stay whole. A stay with
  nothing live refuses: `NothingLeft` while a set-aside stretch still stands confirmed, else as cancelled.
- **A stay is confirmed once: the confirm that leaves no stretch unconfirmed publishes `StayConfirmed`.**
  The webhook confirms each stretch in its own transaction, so `ConfirmBookingService` row-locks the
  `stay` before counting unconfirmed stretches: exactly one confirm sees the stay complete. The payload
  is the stay id plus the first stretch's birth window (the day a stay is judged on); each stretch's
  `BookingConfirmed` names its `stayId`, null for a lone booking and every older payload. No stay
  confirms part-way: one PaymentIntent collects every share and the sweep voids it before releasing.
- **A guest's stay cancel publishes `StayCancelled` once, after each live stretch's `BookingCancelled`.**
  Each such event names the stay in `cancelledWithStay`, so its refund and reversal stay per
  stretch while its mail is left to the stay; the stay event carries the summed refund and
  `VENUE_CHANGE` only if every live stretch took a free exit, else `POLICY`. A remodel release that ends
  every live stretch stamps and publishes the same way (refund 0, `VENUE_CHANGE`, #1292). Every other
  `BookingCancelled` (a remodel leg ending one stretch of a stay that goes on, a lone booking, an
  older payload) leaves the stamp null.
- **Attendance is per service day; I am the sole writer and reader of `booking_day`**
  (`ResponsibilitiesArchitectureTests`' `booking_day` sole-writer scan — other modules ask my
  ports). The schema writes the rows when a booking becomes `CONFIRMED` (trigger
  `booking_day_on_confirm`), so no confirm statement or fixture can forget them; a day is attended
  or missed, never both (CHECK).
- **`booking.status` stays the contract state machine.** `COMPLETED` / `NO_SHOW` are stay outcomes,
  written once when the last day resolves (`COMPLETED` if any day was attended) by one statement
  shared by check-in and the sweep (`JdbcBookings.RESOLVE_STAY_SQL`). `completed_at`, the review
  window's input, is when the stay resolved; a `NO_SHOW` stamps nothing (the day is the fact).
- **Check-in** stamps **today's** (`Europe/Tirane`) service-day row off the code, authorized by
  venue ownership (invariants #13, #7), single-use per day by the row lock and guard; on the last
  day it resolves the stay too. It publishes **no** event: nothing accrues, refunds or mails.
- **The no-show sweep** marks the past unresolved days of `CONFIRMED` stays missed, then resolves
  every stay whose last day has passed, in batches that each commit alone. It writes **no
  availability row**: freeing a past claim would make it re-claimable (invariant #2).
- **The move-reminder sweep announces each of a stitched stay's moves once, the evening before**
  (design D13; from `booking.move-reminder.send-from`, `Europe/Tirane`, until that day ends): it stamps
  the arriving stretch's `move_reminder_at` under a guarded `UPDATE` and publishes `StayMoveDue` in
  that transaction, only while that stretch and the live one it follows on another set both stand and the
  guest holds the move day (`JdbcBookings.HOLDS_DAY_SQL`: its `booking_day` neither refunded nor released,
  #1381) — in the sweep's read, the stamp and the mail's facts, so a day refunded in between announces nothing.
  A move whose day has already begun is never announced late, so the mail's "tomorrow" stays true.
- **Lock order: the booking row, then its service-day rows** — check-in and both sweep statements —
  so a scan, a cancel and the sweep serialize on the stay. The sweep never uses `SKIP LOCKED`: a
  short batch reads as drained, so a skipped contended row would be stranded. A whole-booking cancel
  that can follow a day refund (guest, stay, a remodel's refund leg) and a remodel move lock in a statement
  of their own, then read: a day refund writes only `booking_day`, so a guard or read that waited on the
  lock would see the refunded and released days as of before (#1281). The venue's lone one-day cancel has
  no day to race.
- **Several bookings lock in `(booking_date, id)` order:** the sweep batches, a remodel commit (one at a time
  under the venue lock) and the weather refund, which locks every refundable booking covering the day in one statement
  before it reads them (#1305). So none of the three deadlocks another.
- **A confirmed booking with every day refunded is *nothing left* for the guest too** (ADR-0026 §7, #1381): the
  cancel answers `NothingLeft` (`409 NOTHING_LEFT`) before any quote or write — no transition, no release, no
  `BookingCancelled`, so no mail — and the view says `cancellable = false`, `nothingLeft = true`, so the page reads
  "Refunded" and promises no check-in. The rule is the remodel's (`EVERY_DAY_REFUNDED_SQL`, read as
  `everyDayRefunded` on `BookingRecord`, `LiveClaim` and `LockedRemainder`), never a zero remainder: a €0-share
  day the guest still holds is not nothing left. The outcome still resolves `NO_SHOW` and the review stays blocked.
- **The guest cancel admits `CONFIRMED` only; the venue's refund (`cancelByVenue`, `VENUE_REFUND`) also `NO_SHOW`** (the storm is
  known afterwards): separate port methods and `BookingTransition` rows, so the asymmetry cannot be
  tidied away. The guest guard's readers (the view's `cancellable`, the cancel's `NotCancellable`)
  read `CANCEL_BY_GUEST`, never restate it; `{NO_SHOW, COMPLETED} → WindowClosed` only picks copy.
- **The weather refund refunds a stay's day and keeps the stay (ADR-0026).** Over every booking that
  happened and covers the date (`BookingStatus#stormDayRefundable`): a checked-in day is named on the
  outcome (ids, never codes — #7), never refunded; a lone one-day booking is cancelled and refunded in
  full as before; any other row (a stay, or any stretch of one, one-day stretches included) has the day's
  own rate (`DayShare`) stamped on its `booking_day` and `BookingDayRefunded` published, nothing released.
  A refunded day is neither attended nor missed: check-in answers `DayRefunded` (`DayReleased` once the
  venue freed it), the sweep, the outcome and takings skip it; a later cancellation is quoted over
  `BookingRecord#remainingMinor` (#10). `BookingDayRefundListener` refunds it (`RegistryRefundOutbox`).
- **The venue day refund refunds one guest's one day and releases it (ADR-0027).** `RefundVenueDay` asserts
  ownership first (#13), resolves the booking by code within the venue (a stay's code names the stretch
  covering the date; a foreign code is `NotFound`) and takes the weather refund's leg with reason `VENUE`: a
  stay's day stamped with `refund_reason`, `released_at` and the actor (no foreign key), its claim freed
  unless the day is past (before today in `Europe/Tirane`, the sweep's past); a lone one-day booking
  cancelled whole under `BookingTransition.VENUE_REFUND`. `BookingDayRefunded` carries the reason and the
  released fact; the daily view and check-in (`DayReleased`) branch on the stamp, never the reason.
- **The admin's venue day refund is the same use case behind a second gate (ADR-0027 decision 1).**
  `RefundVenueDay#refundDayAsAdmin` takes the booking **id** and asserts no ownership — the edge's ADMIN
  role gate and audit are the whole authorization — and records the admin as the actor; the venue is the
  row's. `GuestDayRefundLookup` is how the admin finds the id: the guest's bookings by canonical email
  (`customer::api`, never stored here), each with venue name (`venue::api`), span, status and per-day
  state, never a code (#7); an unknown address and a known one with no bookings answer alike. The two
  endpoints sit under `/api/admin/bookings` (`AdminDayRefundController`), the date in the path so the audit
  row names the day (`AdminDayRefundControllerIT`).
- **A released row is another guest's or nobody's (#2):** every leg that frees a live booking's span (the
  guest cancel, the weather cancel, the remodel refund and move) walks `ServiceDays.held` — the span less
  `Bookings#findReleasedDays` — so a resold day survives the first guest's cancellation (`VenueDayRefundServiceIT`).
- **The retention probe (`JdbcGuestBookingHistory`) is bounded too** (§`customer`): bounding only
  `customer`'s read would let the retention sweep (sole caller) wedge on a lock stalling my sweeps.
- **The lifecycle is stated once, in `domain/BookingTransition`, and enforced by `JdbcBookings`'
  guarded SQL** (`JdbcBookingTransitionTableIT`). Read it before adding a transition or a guard.
- **`BookingCutoff` is the module-wide day-boundary authority.** Through `venue.spi.SalesWindow` it
  also answers the tourist browse, display-only — the reserve enforces independently, asking the
  season-closure and sales-close arms one at a time to name the refusal (`VENUE_CLOSED`, then
  `BOOKING_CLOSED`). `freeCancellationEndsAt` is cancellation-only.
- **Windows:** a request must be answered by `min(created + expiry-window, D's sales close)` (D =
  the stay's first day); the pay deadline is `min(accepted_at + pay-window, end of service day)`, or
  the day's end if never accepted (the TTL, `AbandonedPaymentProperties`, is only the sweep's
  earlier backstop, never a view fence). The payment-due mail promises it, the abandoned sweep's SQL
  mirrors it (`RequestWindows#payDeadline`, `RequestWindowsTest`); the view hides the `clientSecret`
  past it.
- **The confirm path is deliberately not fenced**
  (`JdbcBookingsTransitionIT.confirmSucceedsAfterThePayDeadlineHasPassed`): a payment landing past
  the deadline still confirms. Refusing without refunding strands the money on a booking no sweep
  releases; refunding cannot reuse `BookingCancelled` (no `ACCRUAL`: `payout` would defer forever).
  The residual is a sub-sweep-interval race the guest opts into and pays for in full.
- **Payment events apply idempotently, as the second layer:** `payment`'s `stripe_webhook_event`
  dedup misses the registry's re-deliveries to `PaymentEventListener`, so my guarded
  `AWAITING_PAYMENT` transitions make a replay move no row, release nothing and publish nothing.
- **Cancellation terms are stamped at birth.** `CancellationPolicy` is the single home of the window
  rule; `cancellationWindowAtBirth` + `lateCancelRefundBps` ride `BookingConfirmed` and
  `BookingPaymentDue` so a later cutoff edit cannot rewrite a sent mail (null: no disclosure). The
  view and admin-resend facts re-derive from the *current* cutoff — bounded, documented drift.
- **The accept is the claim (ADR-0025):** `RequestClaimService` claims every day of the request, runs the
  guarded `PENDING_REQUEST → AWAITING_PAYMENT` and declines overlapping pending rivals on the set
  (`ANOTHER_GUEST`) in one transaction committed before the payment call. A day it cannot claim declines the
  request (`SET_UNAVAILABLE`); a failed payment set-up reverts it to pending, freeing the claim it held
  (a remodel may have moved it), and a stay it cannot restore whole is declined (#1302). The accept locks its venue
  row (`SetBookingFacts#lockVenueForClaim`), then availability, then booking rows, as the reserve and layout writes
  (#1305; revert, remodel: booking first); two overlapping accepts leave one winner (`ConcurrentOverlappingAcceptIT`).
  The queue names each request's competing requests; a request for a day already taken is `SET_TAKEN`.
- **A stay request is answered whole (#1267):** at a Request-to-Book venue a stitched plan is a
  `stay` of `PENDING_REQUEST` stretches under one deadline. Every leg (accept, decline, expiry,
  withdraw by the stay's code, a remodel's decline, a rival's decline) moves every stretch or none,
  keyed by `stay_id`; the lone-request SQL skips a stretch (`stay_id IS NULL`), so none is answered
  alone. The accept claims every stretch in ascending day order and collects once; a rival stay
  declines whole. Its facts are `StayRequestDeclined` / `StayRequestExpired` / `StayPaymentDue`; its
  stretches publish no per-booking request fact (`StayRequestAcceptIT`, `ConcurrentStayAcceptIT`).
- **Request termination** (decline, expiry, withdraw) lives on `RequestTerminationService`. **Withdraw**
  is authorized by the code alone (the only request command with no ownership check) and guarded by
  status, not deadline, so on an overdue row the row lock leaves one transition
  (`ConcurrentRequestTerminationIT`). It publishes **no** event: a `refundMinor = 0`
  `BookingCancelled` would mail a cancellation for a retracted request. `BookingRequestDeclined`
  carries its `DeclineReason` and is published inside the deciding transaction; `BookingPaymentDue`
  cannot be.
- **My read ports keep `BookingStatus` internal**: `BookingNotificationFacts#confirmationFacts` and
  `CustomerBookings` answer `everConfirmed` (from `confirmed_at`). `CustomerBookings` caps at a
  contact's 20 newest booked dates (unbounded is a support-surface hazard), each naming a set, not a
  venue: the view resolves names through `venue.api.SetBookingFacts`, needing no new venue port.
- **The code-gated view reports a refund I decided that the gateway has not yet accepted**, asked
  lazily through `payment.api.RefundStatusLookup`, so the panel says "being processed" while it
  sits in the outbox, never "in transit".
- **No cancellation refunds inside its own transaction** — a failed commit after Stripe accepted
  would split money from state, and the round-trip would hold the booking row lock. It carries the
  refund on `BookingCancelled` (a day's on `BookingDayRefunded`); only `BookingRefundListener` and
  `BookingDayRefundListener` call `payment.api.RefundPort`, after
  commit and outside any transaction (never `REQUIRES_NEW`): the refund path records its attempt
  before the gateway call, and a transaction would hide that write (§`payment`).
- **Gateway-reaching listeners drain on my bounded executor** (`riviera.booking.refund.*`), never
  Boot's shared `applicationTaskExecutor`, which carries the confirm and payout spine
  (`RefundListenerExecutorArchitectureTest`). Sized for up to three blocking gateway calls per
  refund (each bounded by `stripe.connect-timeout` + `stripe.read-timeout`) and a weather refund's
  venue-day burst; saturation **sheds**
  to `ObservabilityMetrics.REFUNDS_SHED` (never thrown or run on the caller), and the publication
  stays outstanding for the restart republish.
- **The payment → booking listeners retry themselves; the refund-bulkhead ones never do.**
  `BookingSpineRetry` re-drives a `FAILED` confirm on `PaymentConfirmed` or release on
  `PaymentCanceled` (both guarded transitions, #2/#8);
  staleness (`spring.modulith.events.staleness.*`) turns a stuck one `FAILED` first. A refund,
  day refund or intent void waits for the admin lever or a restart.
- **The ADMIN refund-outbox re-drive uses an exact-id allowlist** (`BookingRefundListener`,
  `BookingDayRefundListener`, `RemodelReleasePaymentListener`), never the `booking` package prefix, which would also replay
  `PaymentEventListener`'s payment→confirm spine. It refuses for a cooldown window
  (`RefundResubmissionWindow`), not just during a press: money is safe either way, but in an outage
  every press would re-ask the gateway for every refund.
- **The withheld-mail flag is a suppression oracle unless gated** (the `202` create hands out the
  code before the card is collected): `ViewBookingService#mayDiscloseMailStatus` asks
  `booking.spi.ConfirmationMailDelivery` (by `CustomerId`; I never see an address) only for a
  `CONFIRMED` booking when `payment.api.CollectionGuarantee` says the gateway collects before
  confirming — never a profile string.
- **Remodel classification** (`RemodelClaims#classify`, ADR-0020) decides each live booking on the
  disturbed sets in `(service date, id)` order: zone (`RemodelZones`), nothing left, then a move
  candidate (`MoveRanking`; a taken one leaves the pool on every day of the span), then status —
  `CONFIRMED` refunds, `AWAITING_PAYMENT` releases; a frozen claim, or a move-only one without a
  candidate, blocks. A `PENDING_REQUEST` is no claim: it declines (`SET_UNAVAILABLE`) whatever the zone, never
  moves, releases nothing (ADR-0025). Outcome kinds only, never a status or code (invariant #7);
  advisory and unlocked, so the commit re-derives it.
- **A released stretch takes its stay's other unpaid stretches with it** (#1292): one intent collects
  for the stay (ADR-0024 decision 3), so its void ends them all, and the picture says so. Every other
  `AWAITING_PAYMENT` stretch of the stay joins the classification as a release — whatever its set, zone
  or candidate; it takes no candidate — and the free sets are re-allocated until no new stay joins. The
  preview shows them, the token covers them, the commit settles each as a release; a `CONFIRMED`
  stretch of the stay is never touched.
- **The remodel commit** (`RemodelClaims#commit`) runs in `venue`'s commit transaction behind its
  `RemodelGate`: it re-classifies under the lock; the `PreviewToken` must **cover** the fresh
  picture (an unpreviewed claim or kind is `Stale`), and refunds need the operator's matching
  `RefundConfirmation` count and a reason (else `Unconfirmed`) — either writes nothing. Each claim
  settles through its status's guarded transition; refunds, reversals and mails drain off events.
- **The commit's legs:** a **move** claims the new rows, releases the old, stamps `moved_at`,
  publishes `BookingMoved`; a **refund** is `cancelConfirmed` for the whole amount as
  `VENUE_CHANGE`; a **release** is the unpaid `AWAITING_PAYMENT → CANCELLED`, whose
  `refundMinor = 0` mails the guest, moving no money (a stay every live stretch of which is released
  here stamps each `BookingCancelled` with the stay and publishes one `StayCancelled`, refund 0, so the
  guest gets one mail, #1292); a **decline** the venue-scoped one. A `Blocked` claim is **kept** (a
  `remodel_receipt_kept` line with its `BlockReason`; `venue` leaves the set as stored), yet a claim
  that can move off that set still moves. No undo: another remodel reverses a move.
- **A confirmed claim with no unrefunded day is *nothing left*** (#1300, ADR-0026 §8): in any unfrozen
  zone, decided before the move search, so it takes no candidate. Its leg is the refund leg's: under the row
  lock (`Bookings#lockRemainder`) it finds every day refunded, cancels at 0 as `VENUE_CHANGE`, frees the
  days it still holds and writes a `NOTHING_LEFT` line (amount and fee 0, V75); it publishes no
  `BookingCancelled`, so no mail, ledger entry or void follows. A move or refund whose last day was
  refunded before that lock settles the same way, and the commit answers it as settled. Keyed on no unrefunded
  day, never on a zero remainder; the typed refund count leaves it out.
- **The receipt is mine** (`remodel_receipt(_move/_outcome/_kept)`): label snapshots, distance,
  amounts, reasons, so mails and views name the spot after its set retires.
  `BookingPresence#hasBookings` counts a move's from- and to-sets, so a left set retires rather than
  deletes; ended and kept lines need no FK (their booking keeps its `set_id`). The receipts read is
  my own inbound adapter, not `remodel`'s. Only `BookingNotificationFacts#endedByRemodel` (outcome
  lines) tells a venue-caused cancellation from a free exit, both being `VENUE_CHANGE`.
- **A remodel-released booking's intent is voided after commit, never inside it:** the abandoned
  sweep reads only `AWAITING_PAYMENT`, so nothing else reaches it. `RemodelReleasePaymentListener`
  acts only on a `VENUE_CHANGE` cancel with a `RELEASE` receipt line (`RemodelReceipts#releasedByRemodel`),
  never on a zero refund: a moved guest's free exit can be a zero `VENUE_CHANGE` refund of a paid booking
  (#1291), while a remodel ends a paid one with nothing left without any `BookingCancelled` (#1300). One void per released stretch of a stay; the port answers an already-voided intent
  `Canceled`. It throws on a transient failure. An intent that had collected cannot be undone: it
  counts to `ObservabilityMetrics.REMODEL_RELEASE_COLLECTED` and is refunded by hand, never retried.
- **A moved booking's free exit is a refund-tier override, never a window change:** until
  `BookingCutoff#freeExitEndsAt`, `CancellationPolicy#quote` refunds in full as `VENUE_CHANGE`
  (lifting `LATE`; in `FREE` only the reason changes, so mails and the admin's venue-caused list
  know why). `CLOSED` is never reopened: the guest may already be consuming the stay. A stay's
  stretch is judged on the day its stay's cancel is (the first day, or the first live day once a remodel
  ended earlier stretches), so its exit ends by that day's opening: the view, the cancel and the move
  mail read one capped deadline, and a stretch moved once that day has opened has none.

**Not My Job:**
- Owning the `(set, date)` availability state → **`availability`** (I *ask* it to claim)
- Talking to Stripe or moving money → **`payment`** (via `payment.api.RefundPort`; I never learn
  which gateway is behind it)
- Computing the payout or commission → **`payout`** (my `BookingConfirmed` *triggers* accrual)
- The beach map, pricing, or pool rules → **`venue`**
- Guest contact details, the **retention window** and the contact scrub → **`customer`**. I answer
  only the *fact* "does this guest have a booking on/after D" (`customer.spi.GuestBookingHistory`)
  and perform one *act*, `customer.spi.ReviewErasure`: resolve the erased subject's ids to booking
  ids for `review.api.ReviewTombstones` — I decide nothing about who is erased
- **Review policy** → **`review`** (ADR-0015). I answer only "did this stay complete, and when" via
  `review.spi.CompletedStays` (a `CompletedStay`'s presence **is** the fact, never `BookingStatus`).
  My code-gated read carries the panel `review.api.ReviewEligibility` decides, and my own name
  suggestion via `customer.api.CustomerLookup`, so `review` never learns the guest's identity
- Authorizing which operator may view staff bookings → **`operator`**
- Deciding whether a mail will be sent, or knowing any address → **`notification`**, **`customer`**

---

## `payment`
**Job:** Own Stripe collection — PaymentIntents, refunds, and webhook handling — reconciling
payment state only from **signature-verified Stripe webhooks** (never the client). Collection
only. Publish `payment.api.RefundStatusLookup` (`NO_COLLECTION` / `OUTSTANDING` / `ACCEPTED`) from
my own row; "no row" means the wired gateway never collected, never that a refund failed.

**`CollectionGuarantee` is its own role port, never a `CheckoutPort`/`PaymentGateway` method.**
It answers what `CONFIRMED` attests to here, a property of the wired gateway that no checkout step
or `initiate`/`refund` caller needs; on `PaymentGateway`, which test fakes implement (one as a
`@FunctionalInterface`), it would be the wide-port smell. The answers sit beside their gateways
under the same profiles (`ProfiledCollectionGuarantee`); the coverage test below fails a gap.

**One PaymentIntent may collect for several bookings** (a stay, design D6/D8): `CheckoutPort.pay`
takes the shares, one intent for their sum keyed on the first booking; `payment` holds the intent,
`payment_booking` each booking's share, `payment_refund` each refund of a share by **scope** — the whole
share (`BOOKING`, key `booking-<id>-refund`) or one day (`DAY`, key `booking-<id>-day-<date>-refund`,
ADR-0026), one per scope — the share's `refunded_minor` their running sum. A refund write moves its row,
re-sums the share and derives the intent's status in one statement; a verified `succeeded`/`canceled`
publishes **once per booking**. `RefundStatusLookup` reads the whole-share refund only. A Stripe refund
is tagged `bookingRef` and, for a day, `serviceDate`, so adoption after a lost response is per scope.

`CancelPaymentPort.cancel(booking)` voids the intent behind the booking, so an unpaid group is
cancelled all-or-nothing, never one booking of it (`booking`'s remodel release ends every unpaid
stretch of the stay with the one it disturbed, #1292).

- **The payment state machine is one guarded SQL statement**, because Stripe promises neither
  ordering nor single delivery. `markStatus` moves only the open states (`REQUIRES_PAYMENT`, the
  retryable `FAILED` — what `findPendingCredentials` calls payable); the rest are terminal, so a
  late `payment_failed` cannot overwrite collected money. Never read-then-write: two deliveries
  must not both see "open". `PaymentConfirmed`/`PaymentCanceled` publish **only when a row moved**
  — a late `canceled` must not release a paid booking's claim (invariant #2); `booking`'s guarded
  `AWAITING_PAYMENT` transitions are the second layer.
- **A verified event is never consumed unapplied.** A handled type whose payload yields no
  PaymentIntent or Refund throws `UnreadableWebhookEventException` (`503`); the rollback undoes the
  event-id dedup, so Stripe re-delivers — else a paid booking holds its claim in `AWAITING_PAYMENT`
  forever (the abandoned sweep skips it by design). Unhandled types, unknown intents: `200`.
- **The advisory refund types fail open.** `refund.failed` reports only failures, so an unreadable
  one is `503`; `refund.updated`/`charge.refund.updated` fire for every refund on the account, and
  a retry loop there would get Stripe to disable the endpoint that also carries the payment spine.
- **A refund is never created without first asking the gateway what it holds**: the key
  `booking-<id>-refund` is pruned after about a day, and the replays (restart republish, admin
  re-drive) are slow. A live refund found is **adopted** (`riviera.refunds.adopted`: an earlier
  attempt lost its response), a `failed`/`canceled` one never. Not our `refunded_minor`: written
  after the call returns, it misses a lost response. An unreadable list **fails closed** (`Failed`).
- **Adoption is narrow: exactly one live refund, for exactly the amount requested.** Every refund
  I create names its booking (`StripeRefundTag`). For a single-booking intent's whole share every live refund
  is a candidate; on a shared intent or for a day only this booking's tagged refunds are, and an **untagged
  live refund is `refund_mismatch`**: guessing would strand one guest and refund the other twice, and a day
  can't own a refund whose failure matches the whole share (#1310). Several
  candidates or another amount is `refund_mismatch` too: topping up is a refund **decision**
  (`booking`'s). `Failed` keeps the publication outstanding and lights `riviera.refunds.failed`,
  which never clears itself: a human settles it at the gateway.
- **At-most-once per refund scope is the gateway contract**: `PaymentGatewayRefundContract` pins it
  (its fixture never dedupes on the key); `PaymentGatewayContractCoverageArchitectureTest` fails the
  build on a collecting adapter (ADR-0009) with no contract subclass, or a gateway whose profile
  has no `CollectionGuarantee`. It is structural too: `payment_refund_uniq` (one row per share,
  scope and day) and the scope's key (`booking-<id>-refund`, `booking-<id>-day-<date>-refund`); a
  second refund of one scope relaxes both.
- **A refund later reported dead is un-recorded, and nothing re-drives it.** A `pending` refund
  stays adoptable, so a verified refund event (the refund event types `StripeWebhookController`
  handles; `canceled` has no failure-only one), branched on the refund's status, clears the share,
  re-derives the intent and lights `riviera.refunds.failed`. Guarded on the recorded `refund_id`: a
  re-delivery, a stranger's refund or a stale failure after a successful retry moves nothing. No
  lever, deliberately (an issuer rejection is not transient): the publication completed on
  acceptance, and a re-attempt inside the key window is refused as `refund_key_replay`. A human
  refunds at the gateway, or retries once the key has expired.
- **The attempt is recorded before the gateway is asked** (`markRefundAttempted`), from
  `RefundService#refund`, which must stay **outside a caller's transaction** — one would hide the
  write for exactly the window it covers (`RefundAttemptVisibilityIT`; `RefundBulkheadIT` pins the
  listener's lack of one). Every in-app resolution clears the stamp, but it **survives a `Failed`
  return**: the untyped reason cannot tell "nothing of ours is live" from a double timeout that may
  have left a live refund with no id on record. A booking settled by hand at the gateway keeps its
  stamp — clear it when settling.
- **A failure that beats the refund id to the row is matched by booking.** The create's one
  timeout replay leaves a gap before the id is written, so the webhook takes the booking the tag
  names, or an untagged refund's only booking on its intent (on a shared intent: nothing moves).
  The attempt stamp is the discriminator: with none on record, a refund issued by hand at the
  gateway — money the platform never promised — moves nothing. For a booking-named refund both
  matches run under the intent's lock, so a failure landing mid-record waits for the id (#1298).
- **`markRefunded` and `markRefundFailed` lock the intent's `payment` row first, in a statement of
  their own**: the write derives the status from its siblings' shares, which a lock wait inside
  the statement would leave read on a stale snapshot, so a stay's parallel refunds would end
  half-refunded (#1298).
- **Every refund write is a guarded statement that reports whether it moved.** `markRefunded` and
  `markRefundFailed` move only a collected payment — unguarded, they could fabricate one from a
  `REQUIRES_PAYMENT`/`FAILED`/`CANCELED` row, and the derived `SUCCEEDED` restore relies on it.
  `markRefunded` also refuses a refund id already reported dead (`refund_died_before_record`), so
  the publication stays outstanding for a re-drive past the key window; that one incident counts
  **twice** on `riviera.refunds.failed` but once on `riviera.refunds.owed` (observations vs debts).
- **An owed refund is enumerable.** The dead id moves to the refund row's `failed_refund_id`,
  `refund_id` stops claiming a live refund, and `failed_at` marks the debt over a partial index
  (`payment_refund_owed_idx`) empty when healthy. By hand: `docs/runbooks/observability.md`.

**Not My Job:**
- The booking lifecycle, and deciding *whether* or *how much* to refund → **`booking`**; I execute
  its decision, and refuse (`refund_mismatch`) rather than top up a gateway refund of another amount
- The payout ledger, commission, or paying venues → **`payout`** (manual BKT; no Stripe Connect)
- Setting or knowing the price → **`venue`** (I charge the amount I'm handed)
- Storing card numbers → **Stripe** (I hold PaymentIntent ids, not PANs)

---

## `payout`
**Job:** Own the venue payout ledger (Σ booking amounts − commission − fees) and the manual BKT
batch reporting. Accrue **idempotently** — a booking contributes once; a refund reverses it — and
**order-independently**: a refunded cancellation with no `ACCRUAL` to mirror *defers* (the listener
throws; `riviera.outbox.pending` shows it), never reading the absence as "nothing to reverse".

**Direction lives in the entry type, never in the amount** (invariant #9): amounts are non-negative
(`payout_amounts_check`) and only an `ACCRUAL` adds, so a type added later deducts. Every ledger sum is
written that way and pinned by a test carrying a `FEE` row. A **`DAY_REVERSAL`** reverses one day's share
of a stay that goes on (`BookingDayRefunded`, stamped with the event's reason, `WEATHER` or `VENUE`, never a
fee — ADR-0026, ADR-0027), once per `(booking, day)` (`UNIQUE NULLS NOT DISTINCT (booking_id, entry_type,
service_date)`); every reversal reads what earlier ones took (`Reversed`, under the accrual's lock) and the
exhausting one returns the commission still held, so a booking reversed in parts nets zero. A **`FEE`** is
charged when a `VENUE_CHANGE` refund is reversed; a release or decline collected nothing and nothing left returns nothing, so none is (ADR-0021).

**I own `platform_setting` — its sole writer and reader — and the venue-change fee it holds.** Both
readers (the cancelled-booking listener; `booking.spi.VenueChangeFeeRate`, which the remodel preview
quotes — an inversion, since `booking → payout` would cycle) call `VenueChangeFeeSetting#current()`
**per call**, never a held bean; `riviera.payout.venue-change-fee-minor` is only seed and fallback.
Posted `FEE` rows are never repriced. One window is **accepted, not closed**: a change between a
remodel commit and its `BookingCancelled` draining charges an amount the receipt did not quote, and
a dated schedule cannot help (the event carries no instant). Why: ADR-0021 §7 and its amendment.

**The console's daily takings approximate the ledger, by construction.** `DailyTakingsService`
splits a date's gross at `VenueRates#commissionBpsOn`, while each ledger entry fixed its commission
at accrual from the live rate; the read guarantees only that a past date's figure never changes
(invariant #9). A rate change schedules from the current service date (§`venue`).

**Batch generation runs one at a time per period** (`PayoutBatches#lockPeriod`, a transaction-scoped advisory lock
keyed by the period, taken before any read): the first run for a period has no row to lock, and two unserialized
runs could write an older ledger total over a newer one (#1309). `mark` does not take it: its `UPDATE` guards on the
status **and the total the admin reviewed** (required for `REPORTED`), so a refresh between the read and the click
answers `409 TOTAL_CHANGED` instead of freezing a figure nobody saw (#1320). A mark blocked on a refresh's row lock
re-checks that predicate against the committed total under READ COMMITTED.

**The BKT batch endpoints and the venue-caused refunds report are `ADMIN`-only:** nothing on them
belongs to one venue, so invariant #13 has no owner to check (it exempts `/api/admin/**`) and the
`SecurityConfig` role is the whole authorization — under `OPERATOR`, any approved operator could
read competitors' figures and settle their batches. The report reads the ledger's own rows.

**Not My Job:**
- Actually moving money to venues → settled **manually via BKT**; I record what is owed
- Collecting money from tourists → **`payment`**
- Setting the commission rate or its dated schedule → **`venue`** (I apply what it stores)
- The booking lifecycle or refund decisions → **`booking`**
- The tourist's identity or contact → **not sent to me** (venue ids, booking ids, money)

---

## `customer`
**Job:** Own tourist identity — the guest-checkout contact AND the customer **account** (email +
opaque credential hash) behind register / sign-in. The two are **never linked** (no foreign key), so
registration never auto-claims a guest email's past bookings; back-linking them is a **permanent
non-goal** (design D-2, D-6). Own **right-to-erasure**: tombstone account + guest-contact PII in
place, delete the transient SSO/token children, retain booking/payment/payout rows under the
**statutory-retention exception** (ADR-0010); `auth` authenticates and holds both erasure
endpoints, which revoke the subject's sessions around my scrub (§`auth`). I hold no controller.

Own the **retention policy** — the **retention window**, which guest contacts have no **retention
basis** left, and the sweep that tombstones them; `booking` supplies only the recency *fact*. Both
erasure flows reach a subject's **review** (the one PII row outside my tables) through
`customer.spi.ReviewErasure`, in the same transaction: I decide *that* it is tombstoned and hand on
the ids my scrubs return; `booking` resolves them, `review` blanks its rows. I never see booking ids.

Own the **canonical form of an email address** (`customer.vocabulary.Emails`), the platform's one
definition, used by my services, `auth` and `notification` (the input contract of the
suppression key's HMAC). It stays here: a module's published value is its own, never `shared`'s.

I answer *which account is this signed-in customer?* (`CustomerAccountDirectory`;
`NotSignedInCustomerException` → `403`). The caller reads the session and says whether the principal
holds the customer role, so an operator session named like a customer's email never resolves; I see
no Spring Security type.

Email verification is **soft**: it gates no sign-in or booking. `CustomerAccountRecovery` names a
reset token's account **without consuming** it, so `auth` revokes that principal's sessions first.
`CustomerAccounts#liveCredential` answers `auth`'s password login, SSO sign-in and per-request session check:
the live account by email or id, SSO-only included (null hash), never an erased one; `auth` owns the stamp.

**An SSO first sign-in that links onto an account whose email is unverified clears its password** (#1295), one
guarded statement in the claim's transaction, before it marks the email verified: the provider proved the email, the
password's holder never did, so a pre-registered account cannot capture the email's owner. `auth`'s stamp then refuses
the holder's live sessions on their next request and password login finds no credential; no revoke brackets it, since
the port names no outcome to key one on (#1295). A verified email's account links and keeps its password; gating the
link on the provider's `email_verified` claim is the real adapters' job.

**A write of an account's children locks its live row first** (`CustomerAccountStore#lockLiveAccount`, `FOR NO
KEY UPDATE` so the child insert's key check passes), in a statement of its own, the order erasure takes them: token
issue and redemption, and an SSO first sign-in's identity link (#1305, #1307). One-statement account writes
(password change and reset, verification, the unverified-password clear) carry an `erased_at IS NULL` guard instead.
A missing row is erased: an issue stores and mails nothing, a redemption redeems nothing, a sign-in re-resolves
to a fresh account and takes over an identity left on an erased one. Two issues serialize, so one reset link is
live, and a reset retires the rest; a first sign-in that loses its subject deletes the account it created.

**Only the retention sweep's reads carry a query timeout** (its candidate read, `booking`'s
`GuestBookingHistory` probe, once per page of the walk): a timeout rolls back the run's one transaction,
so it costs one tick. My scrubs and `booking`'s `ReviewErasure` reads stay on the shared, unbounded client — inside the erasure's one
transaction, on the request path too, a timeout fails the whole erasure, and a slow one beats that.

**Not My Job:**
- Bookings → **`booking`**; payment → **`payment`**; operator accounts → **`operator`**; marketing
  → out of scope
- Whether a guest still has a recent booking, and resolving an erased subject to bookings →
  **`booking`**; blanking a review → **`review`**. Both through `customer.spi` ports `booking`
  implements — an inversion, because a direct `customer → booking` call would cycle
- Encoding/verifying credentials and all login machinery (`UserDetailsService`, sessions, the auth
  endpoints, the OIDC exchange, mail transport) → **`auth`** and **`notification`**
  (RV-BE-11); I store the identity and an opaque hash, and no Spring Security, Spring Session or
  mail (Spring Mail, Jakarta Mail, Angus Mail) type lives in the module (`CustomerAuthPlacementTests`)

---

## `operator`
**Job:** Own operator accounts — the admin-driven lifecycle (`PENDING`→`ACTIVE`/`REJECTED`,
`ACTIVE`⇄`SUSPENDED`) with its admin work queues, and the `is_admin` flag (set on the seeded
bootstrap `operator`, which owns only the venues backfilled to it, the Miramar seed:
`docs/runbooks/operator-credential-provisioning.md`) — and the operator↔venue ownership mapping
(creator-owns-on-create, in the venue insert's transaction). I answer *does this operator own this
venue?* (invariant #13), *its username, if in the expected status* (`usernameInStatus`: the edge
revokes sessions **before** a revoking transition commits, in `auth`) and *does this venue have an `ACTIVE`
owner?* (`VenueVisibility`).

I answer *which operator is this principal name?* (`OperatorDirectory`; `NoOperableOperatorException`
→ `403` when it owns nothing). The controllers hand me the name, never a Spring Security type.

**The `ACTIVE` predicate is three explicit sets, each at its owner:** `auth`'s may-authenticate
set (`AuthRoles.OPERATOR_MAY_AUTHENTICATE`) and `OperatorDirectory`'s may-operate set are `ACTIVE`+`PENDING` (approval gates tourist
visibility, not console access); the tourist-visible set is `ACTIVE` only, deliberately, and
`VenueVisibility` is its one home: no ownership row answers no (fail-closed); it fences `venue`'s
catalogue reads and photo serving, and `booking`'s reserve, never a sold-booking path. A suspension **keeps** the
`operator_venue` rows (reversible) but hides the venues until reinstatement.

**Each transition is a status-guarded `UPDATE … RETURNING`, so only the winner gets the facts:**
`Approved` the contact email, `Rejected` and `Changed` the username (a `PENDING` operator can hold a
live session to revoke). An admin that loses a race receives no address and cannot act twice.

**The admin surface always keeps an `ACTIVE` admin** (#1311). A suspend locks every admin row, plus actor and
target, `FOR NO KEY UPDATE` in id order in a statement of its own, then refuses one that would leave no other active
admin (`LastActiveAdmin`, 409 `LAST_ACTIVE_ADMIN`) and one by an actor no longer an active admin by then
(`ActorNotActiveAdmin`, 403): two admins suspending each other leave one. `auth` asks `suspendRefusal` before it
revokes, so only a race signs out a target whose suspend is refused. A later path that removes an admin (a demote, a
delete) takes the same lock and keeps the rule.

**Not My Job:**
- Tourist identity → **`customer`**; venue data → **`venue`**; bookings, payment, payout → theirs
- *Performing* the ownership check → each venue-scoped **application service**, by asking me
- Login machinery (credential encoding/verifying, the auth, approval and password-change endpoints,
  the `ROLE_ADMIN` mapping), **invalidating live sessions** on suspension, rejection, credential
  rotation or password change (`PrincipalSessionRevoker`), and the "venues are live" mail
  (`OperatorApprovalMail` → `notification`) → **`auth`**. I store an opaque hash and
  `is_admin` flag and report *that* and *whose* a transition happened; no Spring Security, Spring
  Session or mail (Spring Mail, Jakarta Mail, Angus Mail) type lives in the module
  (`OperatorAuthPlacementTests`)

---

## `notification`
**Job:** Own transactional-mail **delivery**: the `Mailer` transports (recording mock vs real
SMTP, profile-swapped; the mock and its e2e outbox read, `MockMailOutboxController`, never under
`prod`) and ADR-0011's two delivery vehicles — the Event Publication Registry listener for
**ids-only** payloads, the bounded in-memory dispatcher for **bearer-credential** ones. Owned
state: the suppression list and the delivery log.

**Executors and shutdown:**

- **Each vehicle drains on its own bounded executor, never Boot's shared
  `applicationTaskExecutor`** (the payment→booking and booking→payout spine, which a degraded relay
  must not starve). A registry listener spells `@Async("registryMailExecutor")` +
  `@TransactionalEventListener`, never `@ApplicationModuleListener`, with no transaction across the
  send (`MailListenerExecutorArchitectureTest`; a new listener joins its named list).
- **Every invalid registry-pool bound boots clean** (lazy queue and threads fail later, at
  runtime), so `RegistryMailProperties` checks both ends of `riviera.notification.registry-mail.*`.
- **At shutdown both pools give up rather than interrupt**: an interrupt cannot tell a send that
  reached the relay from one that has not. The drain window derives from
  `riviera.notification.mail.socket-timeout-ms` (`MailTransportBudget`; its claim is summed in
  `shared`'s `ShutdownBudget`), which every SMTP timeout also interpolates. Both pools carry the submitter's MDC (`MdcTaskDecorator`).

**Loss accounting** (names in `ObservabilityMetrics`; guide: `docs/runbooks/observability.md`; no
tag names the person, invariant #7):

- **The vehicles lose mail differently.** A shed registry send is deferred, not lost
  (`MAIL_REGISTRY_SHED`). On the best-effort recovery vehicle, `MAIL_RECOVERY_DROPPED` counts a
  send that **never ran** (`saturated` / `shutdown` / `abandoned`; not one caught *running* at
  shutdown, which may have reached the relay) and `MAIL_RECOVERY_FAILED` one accepted but not
  delivered (`transport` / `suppression-lookup` / `token-issuance`), both tagged `kind` off one `MailKind`. "Recovery"
  names the *vehicle*, which also carries the `operator-approved` notice (ADR-0011 decision 5).
- **The registry vehicle has no failure twin:** a thrown failure stays outstanding
  (`riviera.outbox.pending`), but a mail **abandoned** for a missing fact completes its publication,
  so each abandoning flow gets its own `MAIL_*_ABANDONED` counter (`ERROR` per loss; nonzero is a
  data-integrity fault). Payment-due's is **predictive**: the sweep frees the set at the deadline.
- **The abandon tag names the first missing fact.** `BookingMailFactsService` reads `booking`,
  `venue`, then `customer` and stops at the first gap, so the tag points at one module; the last
  would blame `customer` whenever `booking` was at fault. It is an `application` service, never a
  `notification.api` port: one implementation and no outside caller make a port a hypothetical seam.

**Owned flows and surfaces:**

- The **registry-borne booking mails** — confirmation, cancellation (one listener for every channel), a
  refunded day (`BookingDayRefunded`, under a stretch's stay code, abandoned under
  `riviera.mail.day-refund.abandoned`; copy by the event's reason and released mark, never why — ADR-0027
  §9), payment-due, request declined / expired (plain record, no call-to-action; the guest's own withdraw
  mails nothing) and moved — carry ids, never the code, and **decide nothing**: the birth window and refund
  (invariant #10) are rendered (CLOSED the non-refundable line, LATE the past-free-cancellation line, FREE
  or `null` nothing), and `booking` publishes payment-due only where money is owed. The move mail carries
  the unchanged arrival code (a stretch's is its stay's), the guest's reference.
- **The payment-due mail carries the deadline and the request-time amount, and names no spot**:
  the guest already has the spot on screen; the mail exists for the deadline.
- The **email-suppression list**, hashed and surviving erasure (ADR-0012). **No send to a
  suppressed address**, at the one chokepoint (`TransactionalMailService`), bar one carve-out
  (ADR-0011 decision 7): on the recovery vehicle a *transient* lookup failure sends (a dropped reset
  reads as success); the registry vehicle propagates and retries. The lookup's `queryTimeout` is
  adapter-scoped, never global, which would bound `availability`'s claim too (invariant #2).
- **Reinstatement is a flag (`reinstated_at`), never a deletion** (ADR-0012); a hard `DELETE` on
  this table is a defect. The reinstate `POST` answers what the row was (`ReinstateOutcome`: reason
  and timestamps, never the address or `domain`); nothing answers "is this address suppressed?" — a
  standing lookup would be a new oracle for what `emailWithheld` is gated never to answer.
- The **mail-outbox re-drive** (`AdminMailOutboxController`) is **scoped by listener-id prefix to
  this module's listeners, never by event type**: `BookingConfirmed` also feeds `payout`'s accrual,
  so an event-type predicate would replay invariant-#9 ledger work from a "mail" button
  (`MailOutboxScopeIT`). Duplicate delivery is barred by the registry's `markResubmitted` claim;
  the shared throttle paces the *sweep*, not the duplicate guard.
- **Both outbox levers (this and `booking`'s `AdminRefundOutboxController`) live in their module's
  `adapter/in`**, never at the composition root, which would need a published `api` port for one
  same-module consumer. Each answers a `200` with counts and a typed token, never a publication:
  serialized events carry booking ids (invariant #7).
- **The published surface is exactly `notification::api`, two role-split ports consumed by `auth`
  alone — no domain module depends on `notification`.** `MailSender` is fire-and-forget
  and moves **neither the triggering response's status nor its latency** (the anonymous
  `forgot-password` flow relies on it). The reset link arrives deferred and is resolved inside the
  send task, after the suppression check, so its token is issued off the request thread too. `MailDeliverability` ("withheld now?") is safe only where
  the caller owns the address; its sole consumer is the authenticated verification-resend. I also
  *implement* `booking.spi.ConfirmationMailDelivery`; the dependency stays `notification → booking`.
- **A stitched stay gets one confirmation mail, on `StayConfirmed`**: the stay's code, span, every
  stop's days and spot, and the total. A stretch's `BookingConfirmed` mails nothing (one without a
  `stayId`, an older payload, mails as a lone booking's). The delivery log keeps its per-booking grain:
  the stay mail's attempt is logged on every stretch it covers, and a resend on any stretch resends
  the stay's mail, refused unless every stretch confirmed.
- **A stay the guest cancels, or a remodel releases whole, gets one cancellation mail, on
  `StayCancelled`**: the lone booking's cancellation copy under the stay's code, with the summed refund
  and the span and first stop of `BookingNotificationFacts#stayCancellationFacts` (the guest cancel's live
  remainder, the whole stay when nothing is live), and a rebook link only when a remodel ended one of those
  stretches (`#endedByRemodel`; a free exit is the same `VENUE_CHANGE` with none). A
  stretch's stamped `BookingCancelled` mails nothing; an unstamped one (a remodel ending one stretch
  of a stay that goes on, an older payload) mails that stretch under the stay's code, with a rebook
  link when a remodel ended it.
- **A stay request gets one mail per outcome (#1267)**: `StayRequestDeclined` and `StayRequestExpired`
  send the request record, `StayPaymentDue` the payment-due mail with the stay's total, each under the
  stay's code and whole span and naming no spot, through the lone flows' listeners and abandon counters.
- **A stitched stay's move gets one reminder, on `StayMoveDue`**: the stay's code, tomorrow's date,
  today's and tomorrow's spots as the live map labels them, the distance `booking` measured, and the
  code-gated link; "instead of today's A1" only while `StayMoveFacts#fromDayHeld` (a refunded day is not
  today's spot, #1381). No delivery-log row (that log is the confirmation's); a move the listener finds
  no longer standing is abandoned under `riviera.mail.move-reminder.abandoned`, the one abandon
  tag that can mean a race rather than a data fault (`docs/runbooks/observability.md`).
- The **booking-confirmation delivery log** (`booking_confirmation_mail_attempt`) and its ADMIN
  lookup and **resend** exist because the registry's `completion_date` records only that the
  listener *returned*, as on a suppression skip or an abandonment. The resend is **synchronous
  through the chokepoint and publishes nothing**: no other `BookingConfirmed` consumer re-runs.
- **A venue-caused cancellation carries a way back; nothing else does.** A remodel-ended booking
  gets `RebookLinks`' link (the venue's map for that day, or the day's discovery list when
  `SetBookingFacts#sellsOnlineOn` says no), which also picks the copy. `VENUE_CHANGE` alone cannot
  mark it — a guest taking a move's free exit has it too — so the listener asks
  `BookingNotificationFacts#endedByRemodel`. A remodel-declined request keeps its plain copy.
- **Every booking mail links the code-gated view, `<base>/booking/<code>`, never `/booking/pay`**:
  the view works cold from an inbox ("Pay now" on an open intent; an expired booking, not a 404),
  while `/booking/pay` resumes in-memory hand-off state and dead-ends. `BookingLinks` builds it
  here because registry listeners have no request in hand.
- **The link origin is `auth`'s variable under my own key**: `RIVIERA_RECOVERY_LINK_BASE_URL`
  binds `riviera.notification.booking-link.base-url` (one deployed origin; a second variable could
  only drift), never a `riviera.recovery.*` key, which is `auth`'s namespace.

**Not My Job:**
- Deciding **when** to send, minting/hashing recovery tokens, building **tokenized** links → the
  **`auth`** (`CustomerRecovery`), which hands me fully-formed messages. The line: a link
  whose token I would mint, hash or time-bound is `auth`'s; one I *format* from a fact in hand is
  mine (`BookingLinks`, from a code read through `booking::api`, never the payload — invariant #7)
- The recovery-token lifecycle/store → **`customer`** (`CustomerAccountRecovery`)
- Resolving an address to a guest contact → **`customer`** (`CustomerLookup#findByEmail`); *which
  bookings* a contact has → **`booking`** (`CustomerBookings`). My delivery log stores a booking id
  and nothing else, so erasure has no copy here to reach
- The booking/venue/customer **facts** a mail renders → their owners, via `api/` ports at send time
- Persisting a bearer-credential payload → nobody, ever: recovery mails ride the in-memory
  dispatcher so a raw token never lands in `event_publication`
- The bounce/complaint **feed** into the suppression list → unbuilt; nothing writes the list yet

**The withheld-flag probe** (read before wiring the suppression list's first writer). A populated
list makes `emailWithheld` a paid suppression oracle: book with a victim's address, pay, read the
flag, cancel before the evening-before cutoff for a full refund. Three facts bound it: nothing
writes the table yet (reinstatement only lifts a row), so zero bits until the bounce or complaint
feed, the residual's trigger; no rate-limit budget binds, a probe's real limiter (a payment, a
claimed `(set, date)`) being far below any capacity sparing the pay poll (ADR-0006); and the flag
can't ride only the post-payment hand-off: the code-gated read *is* it, the prober the payer.
`CONFIRMED` **and** `payment.api.CollectionGuarantee` keep it inert unless collected first.

## `review`
**Job:** Own a tourist's verdict on a delivered stay — the review (stars, comment, display name; one
per booking), who may leave, change or remove it and until when, and the score arithmetic:

- **I am a leaf** (ADR-0015): `allowedDependencies = { "shared" }`. Facts arrive by inversion
  (`spi.CompletedStays`, implemented by `booking`; `events.ReviewsChanged` out to `venue`), and my
  typed ids (`VenueRef`, `BookingRef`) are my own: calling `booking::api`, hearing its events or
  borrowing its or `venue`'s ids closes `venue → review → booking → venue`. Eligibility is a pull at
  view/submit time.
- **Ports split by consumer role** (ADR-0015): `VenueRatingSummary`, `ListedReviews`,
  `ReviewEligibility`, `ReviewTombstones`. Submit/edit/delete is the internal `ReviewLifecycle`,
  called only by my REST adapter. No other module's SQL names the `review` table (machine-checked).
- **One review per booking is the database's answer** (the invariant-#2 discipline):
  `UNIQUE (booking_id)` plus `INSERT … ON CONFLICT DO NOTHING`, row count as outcome; a lost race is
  `AlreadyReviewed`. Edit and delete go by `booking_id` on rows-affected and touch only a visible row, so an
  edit racing a delete is `NoSuchReview` and one racing a takedown is `Hidden` (#1308). A delete frees the slot
  while the window is open.
- **The mean is integer and half-up, taken in the domain** (`AggregateRating`), never SQL or `double`.
- **A tombstone is erasure's mark, and it keeps the star** (ADR-0010): `ReviewTombstones` blanks
  name and comment — a scrub, never a delete — so the slot stays taken, the aggregate is unchanged
  and **no `ReviewsChanged` is announced**. The star is not the subject's to take back: nameless, the
  review identifies nobody, and the score is the venue's, earned by a delivered stay. Not a freeze:
  the booking code still authorizes its author inside the window.
- **A takedown is a reversible soft flag, and it is mine** (report-and-remove, ADR-0013):
  `review.hidden_at`, flipped by the internal `ReviewModeration` port (only caller:
  `AdminReviewController`) in one conditional `UPDATE`; a repeat is `AlreadyApplied` and only a real
  flip publishes `ReviewsChanged`. Ownership-free (invariant #13's admin exemption): it must reach
  venues the public list refuses — a suspended owner's.
- **The visibility predicate (`hidden_at IS NULL`) lives in the public reads and the author's writes**:
  `JdbcReviews`' `totalsFor` and `newestListedBefore`, and `update` and `delete`, which skip a hidden row. The
  author's read-back and the admin list see a hidden row on purpose. A listed review is also commented: a star-only one counts, never shows as an empty row.
- **The fence order is stated once, in `domain/ReviewGate`**, which lifecycle and panel both consult.
  A hidden review is frozen for its author: `HIDDEN` precedes the window, and edit, delete and
  resubmit get `409 REVIEW_HIDDEN` with the slot kept taken — a delete would free it and a resubmit
  claim a fresh visible row. Un-hide hands the window rights back.
- **The booking code is the whole authorization** (invariant #7): the resource is the guest's
  booking, the use case mine, so `ReviewController` joins the `permitAll` `/api/bookings/{code}`
  family (and its per-code rate-limit budget) without touching `BookingController`. The code is
  never logged and never reaches an error body (no body carries `instance`, §`web`).
- **An over-long review text is refused, never truncated** — half a sentence stored silently is
  worse than a no. `SubmitReviewRequest` strips, then holds both texts to `ReviewText`'s bounds
  (`400 INVALID_REQUEST`); V46's CHECKs are backstops.

**Not My Job:**
- Storing, showing or ordering by the rating (`venue.rating_tenths` / `reviews_count`), "New", who
  may *see* a venue's list → **`venue`** and the frontend (I compute and announce)
- Deciding a stay was delivered, or owning `completed_at` → **`booking`**
- The guest's identity → **`customer`**: a review hangs on a *booking*, not a person; the display
  name is the author's label, its prefill suggestion `booking`'s to derive
- Login and sessions → **`auth`**; CSRF, rate-limit wiring, the ADMIN gate → the **edge**; a takedown's audit record
  → **`audit`**, via the edge's fence
- Judging a review for takedown → the **platform admin** (publish-first; no queue, no reporting)
- *That* a subject's reviews are erased, or which bookings are theirs → **`customer`** and
  **`booking`**; I blank my rows for the booking refs I am handed

## `itinerary`

The **stay read model** (design D7/D11, improvement plan B4): a closed full module with no table
and no published surface, granted `venue::api`, `venue::vocabulary`, `availability::api` and
`shared` — never `venue::spi`, which stays `availability`'s alone. It reads each venue's online
sets and maximum stay in batch (`venue.api.SetBookingFacts#stayFactsOf`), the taken days per set
(`availability.api.SetAvailabilityFacts#takenDaysBetween`), and `domain.StayFit` turns the grid
into one verdict per venue.

- **Its `adapter/in` serves `GET /api/venues`**, composing `VenueCatalog`'s visibility-fenced list
  with a `stay` verdict when `lastDate` names a range; the one-day shape is unchanged.
  `VenueApiRoleSplitTests` admits it as `VenueCatalog`'s second consumer: the composed browse read
  is what B4 moves here.

**Job:** say, for a span, which venues can host a stay — one online set free for every day within
the venue's maximum stay (`SAME_SET`, with how many sets), a stitched plan within the move budget
(`FITS_WITH_MOVES`, with how many) — and why not (`CANNOT_HOST`, with the longest run and the
maximum). Every venue gets the same budget; at a Request-to-Book one the plan goes as one request,
answered whole (#1267). For one venue, the plan itself
(`GET /api/venues/{id}/itinerary`, priced by `PlanItinerary`): `domain.ItinerarySearch`, a shortest
path over `(day, set)`, fewest moves then shortest, anchored on a tapped set when named, under
`riviera.itinerary.max-switches` (D13: three). A snapshot, never a hold (#2).

**Not my job:** which sets exist, their pools and prices → **`venue`**; the `(set, date)` rows →
**`availability`**; whether a date still sells → **`booking`**; visibility → `VenueCatalog` fences
the list before I am asked, and `SetBookingFacts` answers only for the ids that list returned.

## `remodel`

The **remodel composition** (ADR-0020, placed by ADR-0028): a closed full module with no table and
no published surface, shaped like `itinerary`. `venue` may not depend on `booking`, so the beach-map
remodel preview and commit compose the two here, granted `venue::api`, `venue::vocabulary`,
`venue::spi` (it supplies `RemodelGate`), `booking::api`, `booking::vocabulary`, `operator::api`,
`operator::vocabulary` and `shared`.

- **The composition:** `RemodelPreviewController` and `RemodelCommitController` compose
  `venue.api.BeachMapRemodel` with `booking.api.RemodelClaims`. `RemodelCommitService` supplies the
  `venue.spi.RemodelGate` `BeachMapRemodel#commit` asks under its locks, where `RemodelClaims#commit`
  settles every claim, so layout, moves, availability rows and receipt are one transaction, and no
  Stripe call is inside.
- **Each remodel port asserts venue ownership itself** (invariant #13); I resolve the principal
  (`operator.api.OperatorDirectory`) and map outcomes. Diff, zone, candidate, status split, token and
  free exit stay in `venue` and `booking`: a rule growing here is the signal it belongs in one.
- **Remodel answers:** `200` with the receipt; `409 STALE_PREVIEW`, `REMODEL_REFUSED` or
  `REFUND_NOT_CONFIRMED`, each with the fresh picture and its token in `preview`, so the operator
  re-decides on what is true now; or the save's own `SETS_IN_USE`, `STALE_WRITE` and shape errors.

**Job:** `POST /api/venues/{id}/beach-map/preview` and `/commit`: assemble the groups, the sets
to keep and the preview token from `venue`'s disturbed sets and `booking`'s classified claims; carry
the commit's gate into `booking`'s settlement.

**Not my job:** the layout diff and write → **`venue`**; what a booking becomes, the token, the
settlement and the receipt (and its read, `GET /api/venues/{id}/remodels`) → **`booking`**; the fee
rate → **`payout`**, reached only through `booking`.

## `shared` (not a bounded context)

The **Shared Kernel** (Evans, DDD ch. 14), a closed module registered in `@Modulithic(sharedModules)`:
Modulith allows it to every module and loads it in every module test; it is flat, its base package
its API, with no `api`/`vocabulary` surface. The name is used for Evans' *discipline* (keep it
small, change it only by consultation), not his definition — his kernel is a subset of the domain
model; this one holds edge types (ADR-0017).

**Job:** hold the few edge types modules share, each admitted on **ownership, never reuse** — here
because no module can own it, not because several use it. Nothing else: three modules wanting a type
is the trigger for asking the question, and the answer is always ownership.

- `ApiProblem` and `InvalidApiRequestException` (`web`'s advice owns exception→status; module
  adapters throw): module adapters need them, and in `web` they would close
  `web → auth → notification → booking → web`.
- `ShutdownBudget`: pools in several modules drain one after another, so their claims on the
  SIGTERM grace add and only the platform owns the sum. `ShutdownDrainArchitectureTest` finds them
  from bytecode: the context misses `defaultCandidate = false` and non-bean pools.
- `ResubmissionThrottle` + `ResubmissionOutcome`, an admin outbox-resubmit lever's once-only guard
  (single-flight, a cooldown from construction so a press cannot race the boot republication); each
  lever module keeps its own scope, window and log noun.
- `FailedPublicationRetry`, the scheduled re-drive of `FAILED` publications whose redelivery is a
  no-op (#1340). Admitted on ownership: `booking`, `payout` and `venue` each own their exact-id
  allowlist, but the bounds (`riviera.events.spine-retry.*`) are one platform budget on Boot's
  shared task executor, which no single module owns. It filters per row, never by `ResubmissionOptions`, which reads a batch of
  all failed rows before filtering and would starve one module behind another's backlog. Refund and
  mail listeners are never on it: they re-ask the gateway or re-send a mail (admin levers).

**Not my job:**
- **Any business logic or module-owned state** → its owner: a change here ripples everywhere.
- **Depending on any module** → `allowedDependencies = {}`. Principal → typed id is
  `operator::api.OperatorDirectory` and `customer::api.CustomerAccountDirectory`, each throwing its
  own `403` vocabulary exception.
- **Being the HTTP boundary** (`SecurityConfig`, the chain's filters, the advice) → **`web`**, which
  depends on modules; merged with `shared`, it would let every module reach the chain and close cycles
  through `auth`. The root package holds only the application and its configuration (ADR-0028).

## `challenge` (not a bounded context)

The **proof-of-work challenge** mechanism (ADR-0016, ADR-0017): a closed non-context module, the
full template minus `domain/`, no dependencies. Only writer and reader of `challenge_registry`
(machine-checked); publishes only `api.ProofOfWorkChallenges` and `vocabulary.ChallengeVerdict`.

**Job:** issue signed ALTCHA v2 challenges, verify a solution, accept each exactly once, sweep
expired rows, serve the challenge endpoint. **Single use is a database claim, never memory**
(`INSERT … ON CONFLICT DO NOTHING` on `challenge_registry`): a restart or a second instance must
not reopen a replay window. Expiry is checked on the server clock; the sweep keeps a row
`riviera.altcha.clock-skew` past its expiry, which is where instance clock skew is absorbed.

**Not my job:** which routes are fenced, the filter and its ordering, the problem bodies →
**`web`** (§ *Platform edge*); rate limiting (`RateLimitFilter`, `web`).

## `audit` (not a bounded context)

The **admin audit trail** (ADR-0013): a closed non-context module (ADR-0017 decision 6), the thin
template plus a driving adapter — no one module could own it, as the audited controllers span
modules. Only writer and reader of `admin_audit_record` (machine-checked); publishes
`api.AdminAuditLog` and `vocabulary.AdminAuditEntry`, nothing else (`web` reaches `api` alone).
**I know no domain type and depend on no module but the registered `shared`** (`allowedDependencies =
{}`): a mechanism that knew a domain type would be a domain module in disguise.

**Job:** append one row per mutating `/api/admin/**` action that reached past the security gate —
the actor a username snapshot, deliberately no FK — and serve the Audit tab's newest-first read.
Append-only: no updates, no deletes. **An application-level `4xx` leaves a row** (a failed
destructive attempt is signal), an upstream `401`/`403` does not, a throw is recorded as its `500`.
**A lost row never fails the action it records** (the fence logs it at ERROR): the append runs
*after* the action and cannot undo it, and on the action's own database a loss takes a mid-request
failure.

**Not my job:** which requests are audited and when in the chain, the `X-Audit-Reason` header and
its sanitizer, the ADMIN role gate → **`web`**'s fence (§ *Platform edge*); judging *whether* an
admin action was justified; retention (a named non-goal — rows are kept indefinitely).

## `monitoring` (not a bounded context)

**Platform observability** (ADR-0028 Decision 5): a closed non-context module, `allowedDependencies =
{}`, owning no table. Internals in `adapter/in`; publishes only `vocabulary` (`ObservabilityMetrics`,
`MdcTaskDecorator`), granted to `booking` and `notification`, where a reference survives compilation
(the metric names inline, so `payment` needs none).

**Job:**
- **The correlation id, both halves.** `CorrelationIdFilter` stamps each request (registered by
  `ObservabilityConfig` as a servlet filter outside the security chain, so not `web`'s);
  `MdcTaskDecorator` carries the submitter's MDC onto a pooled worker. Each pool builds the decorator
  with `new`, never as a bean: Boot applies a `TaskDecorator` bean to its own `applicationTaskExecutor`
  and scheduler, which stay undecorated (`SharedTaskExecutorUndecoratedIT`).
- **The metric names** (`ObservabilityMetrics`). Emission and tags stay with the module that owns the
  thing measured; this module owns the names, the outbox-backlog gauge and the alerts on them.
- **The money-path alert check shares the sweeps' single-instance posture.** `MoneyPathAlertCheck`
  is lockless `@Scheduled`: each extra instance fires the outbox-backlog alert again. It is on
  `ScheduledWorkArchitectureTest`'s job list, so `docs/deploy/production-hardening.md`'s scale-out
  precondition (ShedLock on every job on that list) covers it.
- **The scheduled-query bound** (`ScheduledQueryTimeout`, 1–300 s), checked at boot. Module adapters
  read the raw property, so the check runs in full contexts only (production, every `@SpringBootTest`);
  the committed value is unit-tested by `ScheduledQueryTimeoutBoundsTest`.

**Not my job:** emitting a module's counters or choosing their tags → the module owning the thing
measured; the meaning of a crossed threshold and the response → `docs/runbooks/observability.md`.

## `auth` (not a bounded context)

**Sign-in and sessions** (ADR-0028 Decision 2): a closed non-context module, an adapter layer rather
than a mechanism, owning no table. Depends on `customer` and `operator` (`api` + `vocabulary`),
`notification::api` and `shared`; publishes `api.SessionRevocation`, `api.SessionCredentials` (the
per-request check the chain's filter calls) and `vocabulary` (`AuthRoles`, `BlockedPasswordException`).

**Job:** turn a credential into a server-side session and keep it honest: both `UserDetailsService`s
and their `AuthenticationManager`s, session establishment and rotation, the credential stamp, session
revocation, SSO, the password policy, account recovery, the login, register, `/me` and self-service
password endpoints, and the admin-lifecycle and both erasure endpoints that revoke sessions in the same
request (a domain module calling `auth` would cycle). `customer` and `operator` supply identity and an
opaque hash through their `api`; no Spring Security, Spring Session or mail type enters them
(`*AuthPlacementTests`).

- **Password policy (D-8)** — one rule, `PasswordPolicy`, wherever a password is *chosen*
  (never at sign-in), checked before any write — on register, ahead of the timing-equalized
  branches; modules get only the encoded hash, never the rule. Length → `400 INVALID_REQUEST`, a
  blocked term → `400 PASSWORD_CONTAINS_BLOCKED_TERM`, distinct so the client can name the rule.
- **A password reset revokes the account's sessions before and after its write** (not atomic:
  `customer`'s transaction, Spring Session's deletes). Revoking only after would let a failed revoke
  answer `500` with the token spent and the attacker's session alive, so `auth` names the account
  first (`CustomerAccountRecovery#emailForResetToken`, consuming nothing) and revokes; the second
  revoke ends sessions saved in between, and a login saved later fails its stamp check (next bullet).
  Encode above the first revoke, or bcrypt widens the gap.
- **Both erasure paths revoke before and after `customer`'s scrub** (ADR-0010; not atomic, as above).
  Self-service names the principal from its session. The admin path names it by the canonical form of
  the submitted email (`customer.vocabulary.Emails`), which every customer principal carries, so no
  `SPRING_SESSION` row keeps the erased email, and a repeat request ends a session an earlier one missed
  (#1334). An operator named like that email is signed out too, the revoker's accepted over-revocation.
- **Every session carries a credential stamp, checked on each request (#1306).** Its `SessionPrincipal`
  holds a SHA-256 of the account (a customer's id, an operator's name) and the hash it was opened against.
  `api.SessionCredentials` re-reads the account; the chain's `SessionCredentialFilter` ends the session when
  the stamp, an operator's may-authenticate status or its admin flag no longer matches. `SessionAuthentication`
  is the only session writer (`SessionWriterArchitectureTests`). A customer's self-service change writes only
  over the hash it verified, so a reset landing first wins; either self-service change re-stamps the session it
  keeps. Residual: a request already past the filter completes. Cost: one indexed read per authenticated request.
- **The bootstrap credential is stamped by `auth`'s runner, and only that one.**
  `OperatorCredentialInitializer` (full context only; a `@WebMvcTest` slice does not scan it)
  touches only the bootstrap admin; every other operator self-registers (`OperatorRegistration`,
  `PENDING` until approved) and sets its own password via `OperatorProvisioning#setPassword`.

**Not my job:** the filter chain, route policy and its problem bodies → **`web`**
(§ *Platform edge*); account state, the hash and the lifecycle transitions → **`customer`** /
**`operator`**; mail transport and suppression → **`notification`**.

## `web` (not a bounded context)

**The HTTP boundary** (ADR-0028 Decision 3): a closed non-context module, an adapter layer rather than
a mechanism, owning no table and publishing nothing. Not a shared module: no module calls it, and a
module test is better without the chain than with every collaborator mocked. Everything sits in
`adapter/in`. Depends on the surfaces its imports prove: `auth` (`api` + `vocabulary`), `challenge`
(`api` + `vocabulary`), `audit::api`, `customer::vocabulary`, `operator::vocabulary` and `shared`;
Spring Security beans arrive by framework type, which is no module dependency.

**Job:** the fence every request crosses before a controller (§ *Platform edge*):
- `SecurityConfig`: both chains, the route policy (role gates), CSRF, the session cookie and the
  `SecurityContextRepository`. Credentials and the authentication managers are `auth`'s.
- The chain's filters, in order: `RateLimitFilter` (+ `RateLimitProperties`, `TokenBucket`,
  `ClientIpResolver`), `RequestBodyCapFilter`, `ChallengeVerificationFilter` (calls `challenge::api`),
  `SessionCredentialFilter` (calls `auth::api`), `AdminAuditFilter` + `AdminAuditReasons` (calls
  `audit::api`); `CachedBodyRequest` replays a body an edge filter read within its cap.
- The chain's problem bodies (`SecurityProblemResponses`), `RequestPaths`, CORS (`WebCorsConfig`).
- **No problem body carries `instance`** (`ProblemInstanceConfig`): Spring fills a null one with the
  request URI, on `/api/bookings/{code}` the bearer credential (#7), so the interceptor clears it after
  that fill; the hand-built bodies omit it. RFC 9457 makes every member optional.
- **A `413` aborts the connection, never drains the body** (`OversizedBodyConfig`, Tomcat's
  `swallowAbortedUploads=false`): a drain would hold a request thread, up to `max-swallow-size`, at the
  client's pace. App-wide, so an oversized multipart upload is aborted too; a client still sending may
  see a reset instead of the `413` body. So the console refuses a photo past the 25 MiB cap before
  sending it (`MAX_PHOTO_UPLOAD_BYTES`): its "too large" copy never needs the `413`, which stays the
  backstop: the photo flow never relies on a browser reading a mid-upload `413` (#1409).
- **`ApiErrorHandler`, the one `@RestControllerAdvice`** (`ErrorContractArchitectureTests`): every
  exception→status mapping, module vocabulary exceptions included.
- **`/error` answers the same contract** (`ProblemErrorController`, replacing Boot's `BasicErrorController`): a
  filter-thrown exception, a `sendError` (the firewall's `400`) or an exception no handler maps ends on the
  container's error dispatch, whose default body echoes the request URI as `path`, the bearer credential on
  `/api/bookings/{code}` and the SPA's `/booking/{code}` (#7). Every path, the SPA's included, gets the problem
  body with the status kept and the code `ApiErrorHandler` gives that status: no `path`, `instance`,
  `timestamp` or exception message, and no whitelabel HTML (`ErrorDispatchProblemIT`). A non-standard
  `4xx`/`5xx` is kept too, its code `ERROR` (`ProblemErrorControllerTest`). It is the one `ErrorController`
  the role-gate probe skips (`EndpointRoleGateCoverageTest`).
- **Tomcat's own pre-servlet rejections keep Tomcat's minimal HTML** (a raw `{` in the request target): they
  never reach `/error`, and the problem shape there would take a custom `ErrorReportValve`, a container-level
  customization one contract on every response does not buy (#1464). Boot hides the report, so the page
  carries no URI and never echoes a booking code (`ErrorDispatchProblemIT`).

**Not my job:** sessions, credentials and login → **`auth`**; what a fence's mechanism does (a
challenge's single use, an audit row's storage) → **`challenge`**, **`audit`**; per-venue
authorization (#13) → the application services; the correlation-id filter → **`monitoring`**; the SPA
and `/map/**` resources → the root's configuration.

## Platform edge (settled)

The edge rules no domain module owns (per-module consequences: §`auth`, §`customer`, §`operator`):
server-side sessions (Spring Session JDBC) with **two principal types**; all login/session machinery
in `auth`, never in a domain module; customer-account identity separate from the guest row — no FK, no
back-linking of past guest bookings, ever; auth endpoints non-enumerating + constant-time, on their
own rate-limit buckets; mocked externals (SSO IdPs, mailer) profile-guarded out of prod; session
revocation orchestrated by `auth` and synchronous, bracketing the state change; every request re-checks the
session's credential stamp.

**Where the edge's types may appear (RV-BE-11):** no Spring Security, Spring Session or mail (Spring
Mail, Jakarta Mail, Angus Mail) type in `availability`, `booking`, `payment`, `payout`, `review`,
`itinerary`, `remodel`, `venue`, `notification`, `challenge`, `audit`, `monitoring` or `shared` outside
the module's `adapter.in`, where a controller reads the signed-in principal; `notification` sends mail,
so only security and session are checked there. `customer` and `operator` are checked whole,
`adapter.in` included; `auth` and `web` are the edge (`*AuthPlacementTests`).

**Abuse and accountability split into fence and mechanism** (ADR-0017): the **fence** — filters and
their order, route policy, filter-chain problem bodies, neutralizing client input such as
`X-Audit-Reason` — is **`web`**'s (ADR-0028); a **mechanism** it calls through a port (a table, a
job, a library) is a non-context module. So `ChallengeVerificationFilter` and `AdminAuditFilter` (every
mutating `/api/admin/**` action, §`audit`) live in `web`; `challenge` and `audit` own what they call.

- **Proof-of-work challenge (ADR-0016)** — customer and operator register, forgot-password, and
  booking and stay create (`POST /api/stays`) need a solved, self-hosted ALTCHA challenge (single
  use: §`challenge`). No ALTCHA hosted service is ever called; no domain module knows the challenge
  exists.
  `riviera.altcha.enabled=false` is the kill switch (the endpoint's `204` hides the widget).
- **Challenge refusals are `400`, never `403`, after `RateLimitFilter` and `CsrfFilter`:** the
  limiter refunds a `403` on budgets guarding authenticated work, and a refused solution must still
  cost its token. Cheap checks first, so a `429` wins; the registry claim, the fence's one write,
  is the last step before the controller.
- **Request bodies are capped before CSRF and the challenge claim (#1414):** `RequestBodyCapFilter`, right
  after `RateLimitFilter`, refuses a `POST`/`PUT`/`PATCH` body under `/api/**` past its cap with `413
  PAYLOAD_TOO_LARGE`: unread when the declared length is over, read to cap + 1 and replayed when chunked.
  Each cap fits its routes' largest legitimate request (OWASP REST Security Cheat Sheet): 64 KiB; 256 KiB
  for the beach-map layout save, remodel preview and commit (a full `MAX_SETS` layout is ~223 KB); 1 MiB
  for the Stripe webhook. The photo upload keeps Spring's multipart limits. A login body is read once, by the
  throttle's 8 KiB rule below (the 64 KiB cap when the limiter is off). A slow body under its cap: #1439.
- **Not fenced, deliberately:** login (the per-identity throttle covers it) and token redemption
  (a reset or verification token is already a bearer credential). The throttle reads every login
  body itself, to an 8 KiB cap whatever `Content-Length` says, and answers a larger one `413`
  before the controller; it decodes the identity in the charset the controller binds with, so
  neither size, framing nor encoding lets a login skip the per-identity budget (#1288). Forgot-password stays
  non-enumerating (D-8): a refusal precedes the account lookup, identical for every address.
- **Forgot-password is constant-time by doing the same work on both branches (#1336):** the request
  thread makes the one account read and answers `204`; a known address only enqueues the send, whose
  task mints and stores the reset token (under a transaction timeout, as one drainer serves every
  recovery mail), then mails it. So an earlier link stays redeemable until that task runs. A token
  never issued (saturated pool, erasure, failure) is a lost mail the user re-requests, never a
  response difference.
- **Booking and stay create are fenced for every caller**, guest or signed-in — no auth-state
  branch, since a script holding the online pool costs the same either way. A refusal precedes any
  availability claim, booking row or PaymentIntent (invariant #2 untouched). The SPA solves on the
  checkout's Review step, not Details, for Details' fold budget (`booking-challenge.e2e.ts`).
- **The admin venue day refund is authorized and recorded here, not in `booking` (ADR-0027 decision
  1):** `POST /api/admin/bookings/lookup` (the address in a body, never a URL) and `POST
  /api/admin/bookings/*/days/*/refund` are ADMIN-gated matchers, discovered by `AdminSurfaceRoleGateTest`,
  and every call leaves an `AdminAuditFilter` row with the optional `X-Audit-Reason`; the path carries a
  booking id and a date, never a code (#7). The service asserts no ownership on this path — an admin acts
  on any venue — so the gate here is the only one.
- **Riviera map resources (ADR-0022)** — the **riviera map** (not a venue's **beach map**) is drawn
  from resources the root's `MapResourcesConfig` serves anonymously under `/map/**`, owned by no
  module. **No third-party map host, tile CDN, glyph host or geocoder is ever contacted from a
  tourist's browser** (`MapStyleSelfHostedTest`, `discover-map.e2e.ts`'s off-origin guard). The
  files sit in `riviera.map.dir`, never on the classpath: the archive is read by HTTP `Range`, and a
  deflated jar entry cannot seek. **Map posters** ship under `/posters/**`, so a phone's first paint
  makes no `/map/**` request. Size budgets: `MapArchiveBudgetTest`, `map-poster-set.spec.ts`.
## Frontend (the SPA, not a module)

The SPA rules whose TSDoc points here; structure is `riviera-frontend`'s, styling `riviera-tailwind`'s.

- **Tourist menus stay above every Discover layer** (sheet `z-40`; popovers in the header's `z-20`
  context, over `desk-frame`'s `z-[1]`): Discover's edge-to-edge map withholds the footer, so the
  menus' Privacy and Terms rows (`shared/legal-menu-rows.ts`) are the only way there, and a covered
  control looks live while every click times out. Page modals outrank the menu on purpose (coast
  picker backdrop `z-[30]`, booking dialog `z-60`): a modal is dismissed before the chrome is used.
- **The legal rows open a new tab, so they neither close their menu nor take `routerLinkActive`**:
  routing away from `booking/pay` would unmount a mounted Payment Element; the opener never
  navigates, so the menu stays where the guest left it; and a page read in another tab is not this
  tab's current page (as `shared/legal-footer.ts` and `booking/legal-consent.ts` also hold).
- **Venue photo tiles letterbox, never crop** (`shared/photo-gallery-grid.ts`): the lightbox and the
  single-photo band keep a tall portrait whole, so a cropped tile would disagree with both. The bars
  take the photo's edge colour from its blurred copy, the gradient beneath stays the pre-paint
  fallback, and `sizes` follow the painted photo (`CONTAIN_SIZES`).
- **Sign-out clears local state whether or not the server confirms**: a UI stuck signed in is worse
  than a stale cookie. An unconfirmed one records a `SignOutNotice` the shell shows — on a shared
  device the next visitor would otherwise be silently restored into the session.
- **A write fired on page load awaits `whenReady()`**: `.spa()` issues `XSRF-TOKEN` on the first API
  response, on a cold browser the startup `GET /api/auth/me`, so an unwaited write races it to `403`.
- **The XSRF echo is hand-rolled** (`core/api-session.interceptor.ts`): `withXsrfConfiguration` skips
  absolute URLs, and dev calls the absolute `http://localhost:8080` cross-origin (`dev` CORS
  allowlist, no proxy). `document.cookie` still yields the token — a cookie is scoped to its host,
  never its port, and `:4200`/`:8080` are one site to `SameSite=Lax`.
- **The desktop panel's venue row is flat** (`pages/home/venue-row.ts`), no card edge or shadow:
  page, panel and card as three nested rounded surfaces read as a template. Its selected row names the
  booking mode only as the exception (`Request to Book`); if request-mode ever dominates, invert it.
- **`operator/remodel-preview-panel.ts` is a sibling of `shared/confirm-panel.ts`, not a variant**:
  it owns lists (moves, refunds, releases, nothing left, staff holds, blocked claims, and the sets that stay) and
  refund fields; the confirm panel is a
  warning, a toned button and Cancel with no projected content. Both wear the amber warn skin.
- **The withheld-email notice is one component, in `booking/`** (both its surfaces are booking's;
  `shared/` takes what two features need). Never the same markup twice: the copy is the product
  decision, and two copies drift — one quietly promising a mail never sent — while both tests pass.
- **The coast picker's ribbon is a picture** (`pages/home/coast-picker.ts`): `aria-hidden`, no
  pointer; the coast index beside it is the accessible structure.
- **A geolocated position never leaves the device** (`shared/geolocation.ts`). The operator's pin
  placer publishes a location the operator commits by hand: venue business data, not this position.
- **A typed commission rate parses strictly** (`shared/commission-rate.ts`): keeping a typo's
  readable prefix (`'15abc'` as 15) is the wrong direction on what the platform charges. Rounding to
  whole basis points is never unseen: the editor renders the integer the wire carries (invariant #5).
- **Focus is moved after a confirm-before-destroy** (`shared/focus-after-render.ts`): the surface
  destroys the element just activated, stranding focus on `<body>` (WCAG 2.4.3), and the target
  rarely exists yet at decision time — hence lookup in `earlyRead`, `focus()` in `write`. A swap the
  server drives (the pay page's poll and re-check) passes `onlyIfLost`: focus moves only if it was
  already on `<body>` or the render took its holder, so a control the swap keeps is never robbed.
- **A lazy chunk that fails to load is answered with one full reload, then a card**
  (`core/chunk-load-recovery.ts`, the eager `pages/page-load-failed`): a browser memoises a failed
  module fetch, so an in-app retry of the same `import()` fails without refetching, and the router
  keeps its own URL in `history.state` whenever the address bar shows another (`browserUrl`), which
  a load landing on the same entry keeps — so the reload path redirects with `skipLocationChange`
  and `core/page-reload.ts` clears the entry's state before navigating. Any other navigation error
  stays loud: a guard or resolver that throws is a bug, not a page to retry.
- **The venue console lands on the Daily view** (`VENUE_CONSOLE_LANDING_TAB`), what a trading venue
  opens every day; set-up tabs are destinations. A freshly created venue is the exception:
  `operator/venue-create-card.ts` sends it to `beach-map`, as it has no map to run a day on yet.
- **Admin tabs load with plain `HttpClient`, never `httpResource`**: a tab's first read fires from an
  `effect` once the session is confirmed (restore settled, `ROLE_ADMIN` present) and it owns its
  loading line, error card and Retry; `httpResource` fetches eagerly and throws on `value()` in error.
  `admin/moderation-venue-picker.ts` gates the same way; action-only tabs read nothing on open.

## Invariants, long form

The mechanism and edge cases behind `CLAUDE.md`'s one-line invariants; its numbering never changes.

1. **No JPA/Hibernate — JDBC only.** No `spring-boot-starter-data-jpa`, no `@Entity`; adapters are
   hand-written `JdbcClient` SQL, and no production class names `org.springframework.data`
   (`JdbcOnlyArchitectureTests`).
   The Spring Data JDBC starter is on the classpath, but nothing has earned its aggregate mapping:
   only a cluster of rows loaded, mutated and saved together by one writer would, with the why stated.
2. **Availability is the single source of truth, per `(set, date)`.** Every channel (online claim,
   staff tap-to-mark) writes the one `set_availability(set_id, booking_date)` row, and
   `UNIQUE (set_id, booking_date)` plus an atomic `INSERT … ON CONFLICT DO NOTHING` claim (or
   `SELECT … FOR UPDATE`) hold a set for at most one party per date — never double-sell. The online
   claim is synchronous, through the `AvailabilityClaim` port; `availability` has no event listener.
3. **Online and walk-in pools are separate.** A *new* online booking may claim only an
   online-pool set, checked by `booking`'s fast path and `availability`'s locked claim-time read,
   both against `venue.vocabulary.Pool`. A reserve-time rule only: a pool is mutable layout, so
   switching a booked set to walk-in stops new online reserves, keeps every booked `(set, date)`
   claimed, and no layout write is refused for the pool alone (§`venue`).
4. **Sales close is venue-controlled, on the day itself.** Online sales for date D run until the
   venue's `sales_close` on D, `Europe/Tirane`: `00:01` (no same-day sales), `16:00` (default) or
   `23:59`. A venue **closed for season** sells nothing until its reopen day starts or the operator
   reopens it, except dates from the reopen day on under the advance-sales opt-in; both arms are
   `booking`'s `BookingCutoff`, and the venue stays visible (§`venue`). A pending request's
   response deadline is `min(created + expiry-window, D at sales close)`.

   **The pay deadline** is `min(accepted_at + pay-window, end of D)` for an accepted
   `AWAITING_PAYMENT` booking, and D's end (00:00 `Europe/Tirane` on D+1) for a never-accepted one,
   with the sweep's TTL as its earlier backstop. Past it the abandoned sweep expires the booking and
   the code-gated view issues no payment credentials. The confirm path is deliberately **not**
   fenced — a payment in flight still confirms; read §`booking` before treating it as a bug.
5. **Money is integer minor units, never floating point**, with an explicit ISO currency code;
   commission/payout arithmetic is exact-integer, with the rounding rule written down at every
   division. v1 collection currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** A booking date is a `LocalDate` in
   `Europe/Tirane`; never rely on the JVM default zone.
7. **Booking codes are unguessable bearer credentials.** ≥ 8 random base32 chars, never
   sequential, treated like a secret in logs.
8. **Stripe webhooks are the source of truth for payment state — not the client.** Never confirm a
   booking from a client redirect; reconcile only from signature-verified webhooks (§`payment`).
9. **The payout ledger is auditable and idempotent.** Every entry is order-independent and
   idempotent on `UNIQUE NULLS NOT DISTINCT (booking_id, entry_type, service_date)`: a booking accrues
   once, a refund reverses it, a stay's washed-out day reverses that day once (`DAY_REVERSAL`,
   ADR-0026), and a refund the venue's own change caused also charges it a `FEE`. Payout = Σ bookings −
   commission (per-venue rate, effective-dated, forward-only) − fees. **Direction is the entry
   type**: amounts are non-negative magnitudes, only `ACCRUAL` adds and every other type deducts
   (the safe default for a type added later); a `FEE` has no gross or commission and is the one
   type the net CHECK exempts (ADR-0021). Payouts settle manually via BKT; the ledger is the record.
10. **Cancellation/refund policy is enforced server-side** (ADR-0005 as amended), never from a
    caller's figure. Full refund until the venue's evening-before `booking_cutoff` (default `18:00`
    `Europe/Tirane`, owner-editable; not #4's sales close), then the venue's late share (none or
    partial); from service-day open (00:00 `Europe/Tirane`) a guest cancel is refused, not refunded.
    Outside the tiers, deliberately: the venue's own refunds — the **weather exception** (a one-day booking
    in full, a stay's day at its share, ADR-0026) and the **venue day refund** (the same for one guest, the
    day released unless past, ADR-0027) — and a **moved booking's free exit**, in full under `VENUE_CHANGE`
    until `BookingCutoff#freeExitEndsAt` whatever `LATE` would answer; capped at service-day open, it never reopens `CLOSED` (§`booking`, ADR-0020).
11. **Spring Modulith boundaries are hexagonal and id-based** (ADR-0007). Cross-module access is an
    `api/` port or a domain event carrying technical ids (no business fields), never another
    module's `application.*`/`adapter.*`/`domain.*`. A full module is `{api?, spi?, vocabulary?,
    events?, application, domain, adapter/in, adapter/out}`, a thin one `{api, vocabulary?,
    adapter/out}`; no `application/in|out`, no `infrastructure/*`. Surfaces by kind: `api/` ports,
    `vocabulary/` ids/values/outcomes, `events/` records, `spi/` a cross-module *driven* port
    granted only to its implementer. Locked by `PackageShapeArchitectureTests` and
    `PublishedSurfacePlacementArchitectureTests`; details: `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations only, no hand-run DDL; every
    constraint enforcing an invariant (especially #2) is created and tested by a migration.
13. **Venue-scoped operations verify the actor owns the venue** — object-level, not role-level
    (OWASP API #1, BOLA): the `OPERATOR` role is necessary, never sufficient. Every operator-gated
    `/api/venues/{venueId}/**` operation checks via `operator`'s `api/` port that the operator owns
    the path `venueId` (`403` on mismatch) in the **application service**, so no driving adapter can
    bypass it; the public tourist `GET`s there check none. `/api/admin/**` is role-gated and exempt.
    Reviewed as RV-BE-9.

## Machine-checked vs review-checked

The build enforces the **structural** half of these boundaries as fitness functions; the
**semantic** half needs no illegal import, so no rule sees it. **A green architecture-test run must
never be read as "boundaries fully enforced"** — the tests are necessary, not sufficient. Which of
them form the *structural net* is `riviera-modulith` § *The structural net*'s call, not this file's.

**Machine-checked** (fails the build; under `platform/src/test/java/ai/riviera/platform/`):

| Clause of this file | Fitness function |
|---|---|
| `availability` is the only writer (and direct reader) of `set_availability` — invariant #2 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| Only `payment` can reach the Stripe SDK | `ResponsibilitiesArchitectureTests` (Stripe-reach rule) |
| Events carry technical ids/values, never foreign aggregates — invariant #11 | `ResponsibilitiesArchitectureTests` (id-based-events rule) |
| `review` is the only writer (and direct reader) of the `review` table | `ResponsibilitiesArchitectureTests` (SQL-shaped scan: the bare name is in every consumer's package string) |
| Only `venue` names `rating_tenths` / `reviews_count` — `review` computes, `venue` stores | `ResponsibilitiesArchitectureTests` (rating-columns scan) |
| `challenge` is the only writer (and direct reader) of `challenge_registry` — ADR-0017 | `ResponsibilitiesArchitectureTests` (sole-writer scan) |
| `audit` is the only writer (and direct reader) of `admin_audit_record` — ADR-0017 | `ResponsibilitiesArchitectureTests` (sole-writer scan) |
| `payout` is the only writer (and direct reader) of `platform_setting` — ADR-0021 | `ResponsibilitiesArchitectureTests` (sole-writer scan) |
| `booking` is the only writer (and direct reader) of `booking_day` | `ResponsibilitiesArchitectureTests` (sole-writer scan) |
| `booking` is the only writer (and direct reader) of `stay` — ADR-0024 | `ResponsibilitiesArchitectureTests` (SQL-shaped scan: the bare word is in prose and in `max_stay_days`) |
| Every table in `CLAUDE.md`'s "Sole writer of" column, plus `challenge_registry` and `admin_audit_record`, is written only by its owner: `venue`, `set_position`, `venue_amenity`, `venue_photo`, `venue_photo_variant`, `venue_commission_rate`, `set_availability`, `booking`, `stay`, `booking_day`, `remodel_receipt`, `remodel_receipt_move`, `remodel_receipt_outcome`, `remodel_receipt_kept`, `payment`, `payment_booking`, `payment_refund`, `stripe_webhook_event`, `payout_ledger_entry`, `payout_batch`, `platform_setting`, `customer`, `customer_account`, `customer_sso_identity`, `customer_account_token`, `operator`, `operator_venue`, `review`, `email_suppression`, `booking_confirmation_mail_attempt` | `ResponsibilitiesArchitectureTests` (table-ownership map: a SQL-shaped `INSERT INTO`/`UPDATE … SET`/`DELETE FROM`/`MERGE INTO`/`TRUNCATE` per `CONSTANT_String`; the map must cover every table the migrations leave (create, drop and rename walked in Flyway version order) bar the framework tables, and every owner must write its tables) |
| No class inside a module depends on a type directly in `ai.riviera.platform` — ADR-0017 | `CompositionRootDisciplineTests` (module→root rule; `allowedDependencies` cannot see it) |
| The root reaches no module: it holds only the application and its configuration (ADR-0028 Decision 1) | `CompositionRootDisciplineTests` (root→module rule) |
| `payment` uses no Stripe **Connect** API (collect-only, ADR-0002) | `NoStripeConnectArchitectureTest` |
| No module reaches another's `application`/`domain`/`adapter`; `allowedDependencies` hold | `ModularityTests` (`ApplicationModules.verify()`) |
| Every declared `allowedDependencies` grant is used: some class of the module depends on that module or named interface in bytecode (Modulith's dependency model plus the functional-interface type each `LambdaMetafactory` `invokedynamic` produces, so `remodel`'s lambda passed as `venue.spi.RemodelGate` counts while a type met only in a called member's descriptor, such as a `null` argument, does not; `web`'s `switch` over a returned `ChallengeVerdict` Modulith sees itself) | `UnusedAllowedDependencyTests` (fixture `ai.riviera.grantfixture`) |
| The ADR-0007 package shape; published-surface kinds; the `VenueCatalog` role split | `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` |
| Only a module registered in `@Modulithic(sharedModules)` has types directly in its module root, and `shared` is the only module registered there (ADR-0007, amended 2026-10-02 by PR #1351) | `PackageShapeArchitectureTests` (module-root rule; shared-registration rule) |
| Every top-level `api`/`spi`/`vocabulary`/`events` package carries `@NamedInterface` of its own simple name | `PackageShapeArchitectureTests` (named-interface declaration rule) |
| Every module declares `allowedDependencies`; none is left at the allow-all default | `PackageShapeArchitectureTests` (declared-grants rule; whether each grant is used is not checked here) |
| No JPA/Hibernate on the classpath — invariant #1 | `JdbcOnlyArchitectureTests` (classpath probes; the Hibernate auto-configuration name is Boot 4's and pinned to the running Boot major) |
| No class in any `application/` package names `org.springframework.jdbc`, `java.sql` or `javax.sql`: SQL sits in `adapter/out` behind a port (ADR-0007) | `JdbcOnlyArchitectureTests` (application-JDBC rule) |
| No production class names `org.springframework.data`: adapters are hand-written `JdbcClient` SQL, never a Spring Data repository or aggregate mapping (ADR-0001) | `JdbcOnlyArchitectureTests` (Spring Data rule; fixture `ai.riviera.springdatafixture`) |
| A `domain/` class names only the JDK and published ids, values and rules (ADR-0018 §4) | `DomainPurityArchitectureTests` |
| The booking transition table and the guarded `UPDATE`s admit the same statuses (ADR-0018 §1) | `JdbcBookingTransitionTableIT` (every transition × every status; Docker-gated, so it fails the build only where Docker runs — CI) |
| The view's `cancellable` and the guest cancel's refusal agree with `CANCEL_BY_GUEST`, status by status (ADR-0018 §1) | `ViewBookingServiceTest.onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen`, `CancelBookingServiceTest` (against the literal `BookingTransitionTest` pins) |
| No Spring Security, Spring Session or mail (Spring Mail, Jakarta Mail, Angus Mail) type inside `operator`; OIDC/OAuth2 client types fall under Spring Security (RV-BE-11) | `OperatorAuthPlacementTests` |
| No Spring Security, Spring Session or mail (Spring Mail, Jakarta Mail, Angus Mail) type inside `customer`; OIDC/OAuth2 client types fall under Spring Security (RV-BE-11) | `CustomerAuthPlacementTests` |
| No Spring Security, Spring Session or mail type outside `adapter.in` in `availability`, `booking`, `payment`, `payout`, `review`, `itinerary`, `remodel`, `venue`, `notification` (security and session only: it sends mail), `challenge`, `audit`, `monitoring`, `shared`; every module is classified as so checked, whole-module checked (`customer`, `operator`) or edge (`auth`, `web`) (RV-BE-11) | `DomainModuleAuthPlacementTests` |
| Mail listeners name their own bounded executors, never Boot's shared `applicationTaskExecutor` | `MailListenerExecutorArchitectureTest` |
| `booking` listeners reaching `payment::api` run on the bounded refund pool | `RefundListenerExecutorArchitectureTest` |
| Every self-configured worker pool carries `monitoring`'s MDC decorator | `WorkerContextArchitectureTest` |
| Boot's shared `applicationTaskExecutor` carries no `TaskDecorator`, and no bean would install one | `SharedTaskExecutorUndecoratedIT` |
| The draining pools' shutdown claims sum within the SIGTERM grace | `ShutdownDrainArchitectureTest` |
| Pool tokens live only in `venue.vocabulary.Pool`: no other production class holds an `"ONLINE"` / `"WALK_IN"` literal (invariant #3's operand is the published type) | `PoolTokenArchitectureTest` (`CONSTANT_String` scan, so `Pool.ONLINE` passes) |
| A retired set is absent from every read but `SetBookingFacts#setBookingInfo(s)`: production SQL naming `set_position` reads `active_set_position` or says `retired_at IS NULL`, an `INSERT INTO` and the facts adapter's two bare constants exempt by name excepted (ADR-0019, §`venue`) | `RetiredSetExclusionArchitectureTests` (per-statement `CONSTANT_String` scan with a per-statement exemption keyed on the field's `ConstantValue`; the structural net's one member admitted by decision) |

Most rules also prove on every build that they can fail, against deliberately-violating fixtures
(`ai.riviera.responsibilityfixture`, `ai.riviera.placementfixture`, `ai.riviera.retirefixture` and
siblings) — never by breaking production code.

**Review-checked only** (the plan's Modulith section, `riviera-plan-doc`; RV-BE-11):

- A refund **policy** inside `payment` (`booking` decides whether and how much; `payment` executes).
- Commission **math** inside `venue` (it stores the rate; only `payout` computes).
- Review **policy** (eligibility, window, rounding) leaking into `venue`, the twin of the
  commission split: only the SQL half is machine-checked above (ADR-0015).
- A booking-lifecycle decision in `availability` (it holds state, not the cutoff rule), or any
  capability landing on a module's Not-My-Job list without crossing a package boundary.

Known scan limits (on the tests): a sole-writer scan needs the whole-word table name contiguous in
the constant pool, so SQL concatenated across it evades the scan (text-block SQL keeps it whole);
the id-based-events rule unwraps generics and arrays but reads only a component's declared type; the schema walk reads DDL in a `DO $$` body as if it ran, and refuses, naming the migration and the statement, a `TEMP`/`UNLOGGED` table, a schema other than `public`, a quoted name that is not plain lower case (#1447), an unquoted name holding a non-ASCII character (PostgreSQL's folding there depends on encoding and locale), a `U&"…"` name and `ALTER TABLE … SET SCHEMA` (#1461), so none shifts the table set silently. Documented, not modelled, with no parsing added (#1512): `SELECT … INTO new_table` creates a table the walk does not see, because in PL/pgSQL `SELECT … INTO variable` has the same shape and only the surrounding context tells them apart, so review catches it (write `CREATE TABLE … AS SELECT`); and DDL whose table name runs straight into a `$$` closer (`DROP TABLE t$$`) fails loudly but falsely, since PostgreSQL reads `$` as part of an unquoted name: the walk keys the table as `t$$`, so the ownership test reports `t$$` unowned and `t` stale, cured by a space before the `$$`.
