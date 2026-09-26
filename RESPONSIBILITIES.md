# System Responsibilities

The Job / Not-My-Job boundary of each `ai.riviera.platform` module — what it owns and, more
usefully, what it must **refuse to own** — plus the invariants' long form and the settled
platform-edge rules (`CLAUDE.md` holds the module table and the one-line invariants). When a
boundary is ambiguous in a plan or review, this file is the tie-breaker. Present-tense contracts
only (a rule's history is on its ADR, issue or PR); one rule per bullet, each bullet or paragraph
≤ 8 lines (`riviera-java-conventions` §6d, gated in CI). Only the **structural** subset is
machine-enforced: see [Machine-checked vs review-checked](#machine-checked-vs-review-checked).

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist opens a venue and sees its beach map (**`venue`**) with each set free, **partly
   free** or taken (**`availability`**) for one day or for each day of a stay (≤ 62 days, Instant
   venues only).
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

> **Variant — Request-to-Book** (per the venue's booking mode): step 3 commits the claimed booking
> as `PENDING_REQUEST`, uncharged, until the host accepts or declines (ownership via
> `operator::api`); `booking` owns that lifecycle, its expiry sweep and the guest's **withdraw**
> (authorized by the booking code alone). On accept, `payment` issues the PaymentIntent and the
> Instant spine runs on, unchanged, from step 4.

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
  `poolForClaim` is the retired-set fence for both claim paths. Photo serving by hash is unfenced.
- **Venue photos** (ADR-0008): per-slot upload/replace/delete, processing, `bytea` storage behind
  the module-internal `PhotoStorage` port, the public content-hash serving read. **Each tourist
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
  conflict probe, and both claim paths (online reserve and staff mark answer `NO_SUCH_SET`) — each
  reads the `active_set_position` view, and every set write names the marker, so a retired set's
  label and price stay frozen at what its guests were told. Exempt:
  `SetBookingFacts#setBookingInfo(s)` alone (cancel, booking view, mails, staff booking lookup), as
  a later move mail must name the old spot. Its slot and cell are free for a new set (partial unique
  indexes). `RetiredSetExclusionArchitectureTests` enforces all of it (§ *Machine-checked*).
- **The bulk save (`PUT …/beach-map`) is a diff keyed by grid cell, never a delete-all.** The body
  carries no set ids, so a set that changes cell is a removal plus an insert — the removal question
  is the move question. Only removed sets and kept ones whose position number changes are probed,
  through `LiveClaims#locksOn`, so a refusal names exactly the sets the editor already pins. A
  refused save writes nothing and spends no token; a successful one advances it once, an unchanged
  layout included. Write order is load-bearing — removals, parked labels (`Venues#parkRowLabels`),
  updates, inserts — so the layout-uniqueness index never sees two sets in one slot mid-save.
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
- **The batch apply (`applyToSets`) is one transaction on the `set_version` token.** Lock order:
  the venue row (`lockAndReadSetVersion`), then the named set rows `FOR UPDATE` — the order every
  set-write takes, so none deadlocks another. A stale token (`STALE_WRITE`) or a set id not on the
  venue (`NO_SUCH_SET`) refuses the whole batch before any write — the latter because `removeSet`
  does not bump the token, and "N sets updated" must never overstate. Success advances it once.
- **The pool vocabulary is stated once**, in `venue.vocabulary.Pool` (ADR-0018 §3): no production
  class, this module included, holds an `"ONLINE"` / `"WALK_IN"` literal
  (`PoolTokenArchitectureTest`), so both invariant #3 checks compare the published type; the wire
  keeps the tokens, parsed once in `PoolToken`.
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
  today is `REOPEN_DATE_PASSED`. Closing touches no booking, hold, request or walk-in mark.
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
  nearest live booking and hold — by the same `LiveClaims` predicate the write guards ask. A lock
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
how many sets are held, never how many exist; hold type only to owner-asserted reads. A remodel
move is my ordinary writes in `venue`'s commit transaction — every day claimed on the new set before
any is released on the old, never a swap of my own — so a racing reserve wins or loses as usual.

**Not My Job:**
- The venue layout, which sets exist, their positions or prices → **`venue`**
- *Why* a set is taken (which booking, who paid) and whether a date still sells → **`booking`**
- Collecting payment → **`payment`**

---

## `booking`
**Job:** Own bookings, booking codes, and the lifecycle. The standing rules:

- **A booking is a span of service days: `booking_date` is the first, `last_date` the last,
  inclusive.** Every existing row is a one-day booking (`last_date = booking_date`, V61), and so is
  every insert that names no last day (trigger `booking_last_date_on_insert` — the one home of that
  default, so a fixture or a hand insert stays one-day without saying so); `booking_span_check`
  refuses a last day before the first, and `domain/ServiceDays` is its Java twin. **Every terminal
  transition releases every day of the span** — the guest cancel, the four remodel legs, the three
  request-termination legs, the abandoned-payment release the sweep and the canceled webhook share —
  and the remodel move claims every day on the candidate before freeing every day on the old set.
  Each guarded `UPDATE … RETURNING` yields the span with the set, and the winner walks it through
  `availability`'s one-day `release`; `set_availability` carries no link to a booking, so a day a leg
  forgot would be unrecoverable (invariant #2). `SpanReleaseIT` re-claims the whole span after each
  leg. Reads that ask "who is booked on D" select by overlap (the staff daily list, the weather
  refund); "still owed from D on" and the retention basis read `last_date`; daily takings still
  land a stay's whole price on its first day, by decision, until the per-day share exists
  (`docs/architecture/multi-day-stays.md` D4). **A reserve claims every day of the stay, all or
  nothing:** `CreateBookingCommand` carries a last day (a `StaySpan`, at most 62 days); the season
  closure must admit every day, the sales close is judged on the first (invariant #4); a
  Request-to-Book venue refuses a stay of several days (`RANGE_NOT_OFFERED`) until it can answer
  one request whole; a venue with a maximum stay refuses a longer span (`STAY_TOO_LONG`, read off
  `SetBookingInfo#maxStayDays`, judged before any claim); then the reserve transaction claims one
  `(set, date)` row per day through
  `availability`'s one-day `claim`, and a day that loses gives back every day already won before
  the `SET_TAKEN` answer, so a lost range holds nothing (`ConcurrentRangeReservationIT`). The
  amount is the per-day price × the days, one PaymentIntent (invariant #5); the cancellation
  window and the refund are the first day's on the whole amount, one decision (invariant #10);
  `BookingConfirmed`, `BookingCancelled` and `BookingMoved` carry `lastDate` so the mails name the
  days.
- **The reserve commits before any payment call, and that does not weaken invariant #2.**
  `ReserveSetService` claims, inserts the `AWAITING_PAYMENT` booking and commits; only then does
  `CreateBookingService` call `CheckoutPort#pay`, so no row lock is held across the gateway
  round-trip. The double-booking guard is `UNIQUE (set_id, booking_date)` plus the atomic
  `INSERT … ON CONFLICT DO NOTHING` claim, which holds however long or short the lock is held.
- **Attendance is a per-day record, and I am the sole writer of `booking_day`.** One row per
  service day of a stay, written by the schema the moment a `booking` row becomes `CONFIRMED`
  (trigger `booking_day_on_confirm`, V60; V61 widened it to every day from `booking_date` to
  `last_date` — the one home of "written when the booking confirms", so no confirm statement and
  no fixture can forget them). A service day is unresolved, attended (`attended_at`) or
  missed (`missed_at`), never both (CHECK). `booking.status` stays the contract state machine;
  `COMPLETED` / `NO_SHOW` are **stay outcomes** written once, when the last service day resolves:
  `COMPLETED` if any service day was attended, else `NO_SHOW`. `completed_at` is the instant the
  stay resolved `COMPLETED` — the review window's input — and a `NO_SHOW` stamps nothing on
  `booking` (V41's stance: the service day is the fact, the sweep's clock is not). The outcome
  rule is one SQL statement shared by check-in and the sweep (`JdbcBookings.RESOLVE_STAY_SQL`).
  The fitness function is `ResponsibilitiesArchitectureTests` rule 9.
- **Check-in** is the venue-scoped stamp on **today's** service-day row (`attended_at`, today in
  `Europe/Tirane`) off the scanned or typed booking code — single-use per service day by the row
  lock and the `attended_at IS NULL AND missed_at IS NULL` guard (a second scan on the same day
  reads "already checked in"; a `CONFIRMED` stay whose service day today is attended answers the
  same as a `COMPLETED` one), keyed on the code but authorized by venue ownership (invariants #13
  and #7). When no later service day remains it resolves the stay in the same transaction. It
  publishes **no** event: nothing accrues, nothing refunds, no mail.
- **The no-show sweep** drains two backlogs, each in batches on the bounded client (500 rows, at
  most 20 batches a run between them, each statement committing on its own, `FOR UPDATE` without
  `SKIP LOCKED`, each backlog ending on its own short batch), so a run cut short resumes next
  tick: it marks every service day before today (`Europe/Tirane`) that a `CONFIRMED` booking
  neither attended nor missed as missed, then resolves every `CONFIRMED` booking whose last
  service day has passed (oldest first, its stragglers marked in the same statement). Both
  statements, like the check-in, lock the **booking row first** and its service-day rows after, so
  a scan, a cancel and the sweep serialize on the stay and none can stamp a service day of a stay
  another has just ended. The count it reports is bookings resolved. It writes **no availability
  row**: freeing a past claim would make it re-claimable (invariant #2). Arrivals and daily
  takings count `COMPLETED` **and `NO_SHOW`** beside `CONFIRMED`. The guest-cancel guard is
  `CONFIRMED`-only; the admin **weather refund** admits `NO_SHOW` on its own `cancelForWeather`
  transition, because the storm is known afterwards — the two share no port method, and each takes
  its admitted statuses from its own row in `BookingTransition`, so that asymmetry cannot be
  tidied away. The weather refund selects every booking whose span covers the date and refunds
  the one-day ones in full as ever; a booking spanning several days is **never cancelled or
  refunded there** — a partial refund of a live booking is what one reversal per booking
  (invariant #9) cannot express — and is **named on the outcome** (count plus booking ids, never
  codes, invariant #7) so the operator settles it by hand; the day's share is #1210's. The guest guard's two advisory readers — the code-gated view's `cancellable` and
  the cancel service's `NotCancellable` refusal — read the same `CANCEL_BY_GUEST` row rather than
  restating it (`ViewBookingServiceTest` and `CancelBookingServiceTest` hold each answer, status
  by status, to the literal `BookingTransitionTest` holds the row to); the `{NO_SHOW, COMPLETED} →
  WindowClosed` split ahead of the refusal chooses the copy for a spent day, not who may cancel.
- **The retention probe reads `booking` on a bounded client.** `customer.spi.GuestBookingHistory`
  (`JdbcGuestBookingHistory`) is the retention sweep's second entry read: the sweep asks `customer`
  for candidates, then asks me which still have a retention basis, both before it writes anything.
  Bounding only the first would let the sweep wedge on the second, because a lock on `booking` that
  stalls my own sweeps stalls this read too. The sweep is its only caller, so the adapter's only
  client is bounded, by its own scoped timeout, never the global one (invariant #2).
- **The lifecycle is stated once and enforced in SQL.** `domain/BookingTransition` is the
  transition table — which statuses each of the eleven transitions may act on, what it writes,
  and `successorsOf(status)` for "what may follow this?". It generates no SQL: the guarded
  `UPDATE … WHERE status = … RETURNING` statements in `JdbcBookings` stay the enforcing
  statement, and `JdbcBookingTransitionTableIT` drives every transition against every status to
  hold the two together. Read the table before adding a transition or widening a guard.
- **`BookingCutoff` is the module-wide day-boundary authority** (`application/` root):
  `salesCloseAt` (the venue's setting per date — gates creation and caps a pending
  request's response deadline at `min(created + expiry-window, D at sales close)`;
  also answers the tourist browse through `venue.spi.SalesWindow`, display-only — the
  reserve path enforces independently), `closedForSeason` / `admitsDate` (the season closure's
  arm of the same fence: a closure holds until its reopen day opens in `Europe/Tirane` or the
  operator reopens, and admits a date on or after that day only with the advance-sales opt-in;
  the four-argument `isBookable` composes both arms for the catalogue verdict, while the reserve
  path asks them one at a time to name which refused — `VENUE_CLOSED`, then `BOOKING_CLOSED`),
  `freeCancellationEndsAt` (the evening-before
  boundary, cancellation-only), `serviceDayOpensAt` (midnight, the cancellation window's
  outer fence) and `serviceDayEndsAt` (the next midnight, the pay deadline's outer bound).
- **The pay path fences on the pay deadline having passed.** An accepted
  `AWAITING_PAYMENT` booking's deadline is `min(accepted_at + pay-window, end of service
  day)` — the instant the payment-due mail promises; a never-accepted one's is the end of
  its service day, with the TTL (`AbandonedPaymentProperties`) the sweep's earlier
  backstop, never a view fence. The abandoned sweep's `booking_date` arm reaps any
  `AWAITING_PAYMENT` row whose service day has ended (the SQL is a pinned mirror of
  `RequestWindows#payDeadline`; mail ≡ sweep is `RequestWindowsTest`'s contract), and the
  code-gated view withholds the `clientSecret` past the same deadline.
- **The confirm path is deliberately not fenced** (pinned by
  `JdbcBookingsTransitionIT.confirmSucceedsAfterThePayDeadlineHasPassed`). A guest holding
  a live `clientSecret` who pays past the deadline but before the next sweep still
  confirms. Refusing without refunding would strand the money on a booking the sweep can
  never release; refunding cannot reuse `BookingCancelled` (a never-confirmed booking has
  no `ACCRUAL`, so `payout`'s listener would defer forever). The residual is a
  sub-sweep-interval race the guest opts into and pays for with the full stay.
- **Verified payment events apply idempotently, as the second layer.** `PaymentEventListener`
  applies `PaymentConfirmed` / `PaymentCanceled` after the webhook commits, and the registry
  re-delivers an outstanding publication, so delivery is at-least-once. `payment`'s
  `stripe_webhook_event` event-id dedup is the first idempotency layer and sees only Stripe's
  re-deliveries; my guarded `AWAITING_PAYMENT` transitions are the second, so a replay moves no row,
  releases no claim twice and publishes nothing.
- **Pre-reserve cancellation terms and the window at birth.** `CancellationPolicy` — the
  single home of the window rule — answers the public read
  `GET /api/bookings/cancellation-terms` (`QuoteCancellationTerms`) and classifies
  `windowAtBirth` from `created_at`. Both publication sites stamp
  `cancellationWindowAtBirth` + `lateCancelRefundBps` onto `BookingConfirmed` and
  `BookingPaymentDue` — facts fixed at the moment, so a later cutoff edit cannot rewrite
  a sent mail; a null window (older payloads) renders no disclosure. The code-gated view
  and the admin-resend facts re-derive the field from the venue's *current* cutoff on each
  read (bounded, documented drift; the stamped events stay the record).
- **The reserve paths refuse a hidden venue's set** before any claim, via
  `operator.api.VenueVisibility`, answering `NO_SUCH_SET`. No post-reserve leg (view,
  cancel, check-in, sweeps) consults visibility. They refuse a date the venue's season closure
  does not admit with `VENUE_CLOSED` — its own code, because the venue is deliberately visible —
  before any claim, on both booking modes; the closure rides `SetBookingInfo`.
- **The request lifecycle's three terminal legs** live on `RequestReleaseService`:
  decline, the expiry sweep, and the guest's **withdraw**. Withdraw is authorized by the
  booking **code** alone (the only request command with no ownership check) and guarded by
  status alone, not deadline — so on an overdue row the **row lock**, not the predicates,
  leaves exactly one transition and one release (`ConcurrentRequestTerminationIT`). It
  publishes **no** event: nothing accrued and nothing was collected, and a
  `refundMinor = 0` `BookingCancelled` would mail the guest a cancellation record for a
  request they retracted.
- **`BookingRequestDeclined` is published inside the transaction that settles the decline** —
  `RequestReleaseService#decline` and the remodel commit's decline leg alike — so its Event
  Publication Registry row commits atomically with the transition. `BookingPaymentDue` cannot be:
  the accept branch's outcome is decided only after its transaction, by the gateway's answer.
- **Notification-facts reads:** the arrival code + contact id
  (`BookingNotificationFacts#notificationInfo`), the wider `#confirmationFacts` an admin
  resend rebuilds a mail from, and `CustomerBookings` (which bookings one contact has,
  a separate consumer role). Neither publishes the lifecycle enum: both answer
  `everConfirmed` (from `confirmed_at`), which keeps `BookingStatus` internal.
- **`CustomerBookings` answers a contact's 20 newest booked dates, each row naming a set.** An
  unbounded read on a support surface is a hazard, and newest-first is what makes the cap safe. A
  set id rather than a venue id, because the view resolves the name through
  `venue.api.SetBookingFacts` — the read the confirmation mail itself uses — so no new venue-side
  port is needed for a name.
- **The code-gated view reports an outstanding refund** — decided by me, not yet accepted
  by the gateway — asked lazily through `payment.api.RefundStatusLookup`, so the panel
  says "being processed" rather than "in transit" while the refund sits in the outbox.
- **No cancellation refunds inside its own transaction.** The transaction decides the refund and
  carries it on `BookingCancelled` (`refundMinor`); `BookingRefundListener` alone calls
  `payment.api.RefundPort`, after commit. A refund issued inside would split money from state
  whenever the commit failed after Stripe had accepted it, and its gateway round-trip would hold
  the booking row lock the guarded transition took for the length of the call.
- **The refund listener drains on my own bounded executor** (`riviera.booking.refund.*`,
  validated at boot), never Boot's shared `applicationTaskExecutor`, and runs **outside a
  transaction**: the refund path records its attempt before the gateway call, and a
  transaction would hide that write for exactly the window it covers (§`payment`). The
  listener makes blocking gateway round-trips (≈25s worst case per call, up to three per
  refund) and `WeatherRefundService` dispatches a whole venue-day in one transaction.
  Saturation **sheds** to `ObservabilityMetrics.REFUNDS_SHED` and the publication stays
  outstanding for the restart republish; the queue is sized so shedding is unreachable
  for any plausible burst. Structural: `RefundListenerExecutorArchitectureTest`, scoped to
  `booking` listeners reaching `payment::api` — today the refund listener and
  `RemodelReleasePaymentListener`, which voids the uncollected intent of a booking a remodel
  released, so `REFUNDS_SHED` counts both kinds of shed gateway call.
- **A remodel-released booking that had in fact collected** is the one loss that void cannot
  undo: the guest paid for a booking that no longer exists, so it counts to
  `ObservabilityMetrics.REMODEL_RELEASE_COLLECTED` and is settled by hand. Nothing retries it —
  there is no uncollected intent left to void.
- **The ADMIN refund-outbox re-drive** (`GET`/`POST /api/admin/refund-outbox`) is scoped to an
  **exact-id allowlist** — the two listeners on the refund bulkhead — never the `booking` package
  prefix, which would sweep `PaymentEventListener`'s payment→confirm spine (`RefundOutboxScopeIT`
  for what it leaves alone, `RefundOutboxScopeTest` for the ids).
- **The refund re-drive refuses for a cooldown window, not just while a press runs**
  (`RefundResubmissionWindow`). A mutex answers only the truly simultaneous press. Money is safe
  either way — the gateway call is keyed `booking-<id>-refund` and the registry's
  `markResubmitted` claim skips an in-flight publication — but the gateway is not: in an outage
  each re-driven refund fails fast and is outstanding again, so without the window every press
  re-asks the gateway for every refund and reports a success that settled nothing.
- **The withheld-mail flag on a confirmed booking's read model** is asked through
  `booking.spi.ConfirmationMailDelivery` by `CustomerId` — I never handle an address. The
  gate is two-part: the booking must be `CONFIRMED` **and** `payment.api.CollectionGuarantee`
  must say this deployment's gateway collects before confirming (the in-process stub does
  not, so the flag is inert there — otherwise it would be a free suppression oracle).
- **The mail-status gate short-circuits before the port is asked.** The `202` create hands the
  booking code out before the card is collected, so answering `emailWithheld` for an unsettled
  booking would make the code-gated view a suppression oracle for any address a checkout can be
  started with. `ViewBookingService#mayDiscloseMailStatus` asks `payment.api.CollectionGuarantee`,
  never a profile string, so the gate stays a checkable property of the payment model and still
  holds when a third gateway is wired.
- **The remodel classification is keyed on the claim, then split by status.** `RemodelClaims#classify`
  (published for the platform edge, ADR-0020) asserts venue ownership, reads every booking a guest
  may still turn up on across the sets a layout save would remove or renumber, and decides each in
  `(service date, id)` order through two named rule holders (ADR-0018): `RemodelZones`
  (`application/remodel`, clock-backed — the zone is the duration to
  `BookingCutoff#serviceDayOpensAt` against the `riviera.booking.remodel.freeze-window` (24h) and
  `refund-notice-floor` (96h) bounds, both inclusive on the nearer side; sales close plays no role)
  and `MoveRanking` (`domain/`, pure — free on every day of the claim's span, online pool, same or
  better tier; same row, then closest position, then closest row). A frozen claim blocks; a claim
  with a candidate moves, and that candidate leaves the pool on every day of the span it took; a
  move-only claim with none blocks; beyond the floor `CONFIRMED` refunds, `AWAITING_PAYMENT`
  releases, `PENDING_REQUEST` declines. The answer carries outcome kinds, set references and
  amounts — never a status and never a code (invariant #7). Advisory: read-only and unlocked, so the
  commit re-derives it.
- **The remodel commit settles every claim: moved, ended, or kept where it is.**
  `RemodelClaims#commit` (published, ADR-0020) runs inside `venue`'s commit transaction as its
  `RemodelGate`: it re-classifies the disturbed sets under the lock, checks the operator's
  `PreviewToken` still **covers** the fresh picture — the token is a sorted set of per-pair digests
  over `(booking id, outcome kind)`, so a fresh picture that is a strict subset of the previewed one
  still matches, and a claim or an outcome the preview never showed is `Stale` — and then, in
  `(service date, id)` order, applies each claim through the guarded transition its status already
  has: a **move** claims the new `(set, date)` through `availability`, releases the old, stamps
  `booking.moved_at` and publishes `BookingMoved`; a **refund** runs `cancelConfirmed` with the
  booking's whole amount and reason `VENUE_CHANGE`; a **release** runs the `AWAITING_PAYMENT →
  CANCELLED` transition the payment-canceled webhook and the TTL sweep share; a **decline** runs the
  venue-scoped `PENDING_REQUEST → DECLINED` one. Each ending frees its `(set, date)` and publishes the
  fact the platform already reacts to — `BookingCancelled` for the first two, `BookingRequestDeclined`
  for the third — so the refund, the payout reversal and the mails drain after commit and nothing here
  talks to Stripe. A released claim's `BookingCancelled` carries `refundMinor = 0`, which is what
  mails the guest without moving money: no refund is issued and no reversal is posted for a booking
  that never collected. A `Blocked` claim is **kept**: nothing of it changes — no row, no status, no
  event — it gets a `remodel_receipt_kept` line with its `BlockReason`, and the edge hands its set to
  `venue` as a kept set so the layout leaves it as stored. A claim that can move off a kept set still
  moves as previewed: the operator painted that set away, and the preview showed the move.
- **A commit that refunds guests is a deliberate second act.** It carries a `RefundConfirmation` — how
  many refunds the operator read off the preview and why they are remodelling — and a count that does
  not match the picture re-derived under the lock, or a blank reason, is `Unconfirmed` with the number
  owed and writes nothing. Both land on the receipt beside the money.
- **The receipt is mine.** `remodel_receipt` / `remodel_receipt_move` / `remodel_receipt_outcome` /
  `remodel_receipt_kept` snapshot the old and new labels, the distance, one line per ended claim with
  its amount, one line per kept claim with its reason, plus the operator's reason, so the moved
  mail, the guest's view and the console still name the spot the guest was told after that set is
  retired. `BookingPresence#hasBookings` counts a receipt's from- and
  to-sets so a set a moved booking left retires rather than deletes; an ended claim needs no such arm,
  because its booking keeps that `set_id` — which is why the outcome row records the set id without a
  foreign key. `BookingNotificationFacts#endedByRemodel` reads the outcome lines alone — a kept
  booking was not ended — and is the only thing that
  tells a venue-caused cancellation from the guest's own free exit, since both are `VENUE_CHANGE`. The
  receipts read (`ViewRemodelReceipts`, `GET /api/venues/{venueId}/remodels[/{receiptId}]`,
  owner-asserted) is my own inbound adapter, not the root's. No undo: a move is reversed by another
  remodel.
- **A remodel-released booking's PaymentIntent is voided after the commit, never inside it.** The
  release cancels an unpaid booking without moving money, but its intent stays collectable and the
  abandoned-payment sweep only ever reads `AWAITING_PAYMENT` rows, so nothing would reach it again.
  `RemodelReleasePaymentListener` runs on the refund bulkhead off `BookingCancelled`, keyed on the one
  shape only a release has — `VENUE_CHANGE` returning nothing — and calls `payment.api.CancelPaymentPort`.
  A transient gateway failure throws so the publication is retried; a payment that already succeeded
  is logged for a manual refund, because nothing there can be undone automatically.
- **The intent void acts on the release shape alone.** Every other `BookingCancelled` — the guest
  cancel, the weather refund, the remodel refund, a moved guest's free exit — ends a booking that
  collected, so `RemodelReleasePaymentListener` could only get `NotCancellable` back for it; acting
  on those would put a gateway round-trip on every guest cancellation for nothing.
- **A moved booking's free exit is a refund-tier override, never a window change.** The exit runs
  until `min(service day opens, max(12:00 Europe/Tirane the day before, moved_at + 24h))`
  (`BookingCutoff#freeExitEndsAt`); `CancellationPolicy#quote` reads it and, while it is open, answers
  the full amount with reason `VENUE_CHANGE` — in `LATE` that lifts the tier, in `FREE` only the reason
  changes, so the mail and the admin's venue-caused list still know why — and `CLOSED` is never
  reopened: the guest can already be consuming the stay. The reason lands on the
  booking and rides `BookingCancelled` into the ledger reversal and the cancellation mail. The
  code-gated view carries the move (`BookingDetail#move`: old spot, distance, `movedAt`, the exit
  deadline while open); `BookingNotificationFacts#moveFacts` hands the mail the same, from the receipt.

**Not My Job:**
- Owning the `(set, date)` availability state → **`availability`** (I *ask* it to claim)
- Talking to Stripe or moving money → **`payment`** (I call `payment.api.RefundPort` and
  never learn which gateway is behind it)
- Computing the payout or commission → **`payout`** (my `BookingConfirmed` *triggers*
  accrual)
- The beach map, pricing, or pool rules → **`venue`**
- Storing guest contact details → **`customer`**
- The **retention window** or the contact scrub → **`customer`**. I answer only the *fact*
  "does this guest have a booking on/after date D" via `customer.spi.GuestBookingHistory`.
  Its twin, `customer.spi.ReviewErasure`, is the one *act* I perform for `customer`:
  resolve the erased subject's guest / account ids to booking ids from my own table and
  hand them to `review.api.ReviewTombstones` — I decide nothing about who is erased
- **Review policy** — eligibility, the window, one-per-booking, the aggregate math →
  **`review`** (ADR-0015). I answer only "was this stay checked in, and when" via
  `review.spi.CompletedStays` (the presence of a `CompletedStay` **is** the completed
  fact; I never expose `BookingStatus`). The **review panel** on my code-gated read is
  mine to *carry* but not to *decide*: the verdict comes from `review.api.ReviewEligibility`.
  The display-name suggestion beside it is mine — the first name off the contact I resolve
  through `customer.api.CustomerLookup`, so `review` never learns the guest's identity
- Authorizing which operator may view staff bookings → **`operator`**
- Deciding whether a mail will be sent, or knowing any address → **`notification`** and
  **`customer`**

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

**One PaymentIntent may collect for several bookings** (a stay, design D6/D8): `payment` holds
the intent, `payment_booking` each booking's share and refund state. Refund reads and writes key on
the booking's row, the same statement deriving the intent's status from its shares; a verified
`succeeded`/`canceled` publishes **once per booking**. `RefundStatusLookup` reads the booking's own
share — a sibling's refund leaves the intent `PARTIALLY_REFUNDED` while this one is `OUTSTANDING`.

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
  I create names its booking (`StripeRefundTag`). On a single-booking intent every live refund is a
  candidate; on a shared one only this booking's tagged refunds are, and an **untagged live refund
  is `refund_mismatch`** — guessing would strand one guest and refund the other twice. Several
  candidates or another amount is `refund_mismatch` too: topping up is a refund **decision**
  (`booking`'s). `Failed` keeps the publication outstanding and lights `riviera.refunds.failed`,
  which never clears itself: a human settles it at the gateway.
- **At-most-once per booking is the gateway contract**: `PaymentGatewayRefundContract` pins it (its
  fixture never dedupes on the key); `PaymentGatewayContractCoverageArchitectureTest` fails the
  build on a collecting adapter (ADR-0009) with no contract subclass, or a gateway whose profile
  has no `CollectionGuarantee`.
- **A refund later reported dead is un-recorded, and nothing re-drives it.** A `pending` refund
  stays adoptable, so a verified refund event (all three types — `canceled` has no failure-only
  one), branched on the refund's status, clears the share, re-derives the intent and lights
  `riviera.refunds.failed`. Guarded on the recorded `refund_id`: a re-delivery, a stranger's
  refund or a stale failure after a successful retry moves nothing. No lever, deliberately (an issuer rejection is not transient): the
  publication completed on acceptance, and a re-attempt inside the key window is refused as
  `refund_key_replay`. A human refunds at the gateway, or retries once the key has expired.
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
  gateway — money the platform never promised — moves nothing.
- **Every refund write is a guarded statement that reports whether it moved.** `markRefunded` and
  `markRefundFailed` move only a collected payment — unguarded, they could fabricate one from a
  `REQUIRES_PAYMENT`/`FAILED`/`CANCELED` row, and the derived `SUCCEEDED` restore relies on it.
  `markRefunded` also refuses a refund id already reported dead (`refund_died_before_record`), so
  the publication stays outstanding for a re-drive past the key window; that one incident counts
  **twice** on `riviera.refunds.failed` but once on `riviera.refunds.owed` (observations vs debts).
- **An owed refund is enumerable.** The dead id moves to `failed_refund_id`, `refund_id` stops
  claiming a live refund, and `refund_failed_at` marks the debt over a partial index empty when
  healthy. Enumerating and settling by hand: `docs/runbooks/observability.md`.

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

**Direction lives in the entry type, never in the amount** (invariant #9): amounts are
non-negative (`payout_amounts_check`) and only an `ACCRUAL` adds, so a type added later deducts.
Every ledger sum is written that way and pinned by a test carrying a `FEE` row. A **`FEE`** is
charged when a `VENUE_CHANGE` refund is reversed (a remodel's forced refund, or a moved guest's free
exit); a release or decline collected nothing, so nothing is reversed or charged (ADR-0021).

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
**Job:** Own tourist identity — the guest-checkout contact AND the customer **account**
(email + opaque credential hash) that backs register / sign-in. The account is a
**separate identity** from the guest-contact row (no foreign key), so registration never
auto-claims a guest email's past bookings; back-linking guest bookings is a **permanent
non-goal**. Own **right-to-erasure**: scrub-in-place (tombstone) of the account +
guest-contact PII and delete the transient SSO/token children, retaining the
booking/payment/payout records under the **statutory-retention exception** (ADR-0010) —
the edge authenticates the request and revokes sessions. Own the **retention policy**: the
configured **retention window**, the decision of which guest contacts have no remaining
**retention basis**, and the sweep that tombstones them — I ask `booking` for the recency
*fact*, but the window and the scrub are mine. Both flows also reach the one PII-bearing
row outside my tables — the **review** a subject wrote — through
`customer.spi.ReviewErasure`, inside the same transaction: I decide *that* a subject's
reviews are tombstoned and hand on the guest / account ids my by-email scrubs return;
`booking` (which implements the port) resolves those to bookings and `review` blanks its
own rows. I never learn a booking id. I also own the **canonical form of an email
address** (`customer.vocabulary.Emails`) — the platform's one definition, used by my own
services, the platform edge, and `notification` (the input contract of the suppression
key's HMAC). It cannot live in `shared`: `shared` depends on `customer::api`.

The published `api/` ports: `SsoAccountProvisioning` resolves-or-creates the account
behind an external `(provider, subject)` (find-or-create by verified email, auto-link;
SSO-only accounts carry a null hash); `CustomerAccountRecovery` issues and redeems
single-use hashed **email-verification** and **password-reset** tokens
(`customer_account_token`), sets a password, reports the verified state, and answers
*whose account does this still-redeemable reset token unlock?* **without consuming** it,
so the edge can revoke that principal's sessions before the reset writes. Email
verification is **soft/non-blocking**: it gates no sign-in or booking. No Spring Security
type lives inside the module (`CustomerAuthPlacementTests`).

**Only the retention sweep's entry reads carry a query timeout.** Its candidate read and `booking`'s
`GuestBookingHistory` probe run before anything is written, so a timeout there costs one tick. My
scrubs, and `booking`'s `ReviewErasure` reads, stay on the shared, unbounded client: they run inside
the erasure's one transaction, on the request path as well as the sweep's, where a timeout would
fail the whole erasure (the transaction never commits half of one), and a slow erasure beats a
failed one.

**Not My Job:**
- Bookings → **`booking`**; payment → **`payment`**
- Knowing whether a guest still has a recent booking → **`booking`** (I declare
  `customer.spi.GuestBookingHistory` and it implements the fact — an inversion, because a
  direct `customer → booking` call would cycle)
- Resolving an erased subject to their bookings → **`booking`**; blanking a review's name
  and comment → **`review`** (the same inversion via `customer.spi.ReviewErasure`)
- Operator accounts or staff logins → **`operator`**
- Marketing → out of scope
- Encoding/verifying credentials + all login machinery (`UserDetailsService`, session, the
  register/login/recovery endpoints, the OIDC redirect/token exchange, mail transport) →
  the **platform edge** and **`notification`**; I own the identity and an opaque hash

---

## `operator`
**Job:** Own operator accounts — their **admin-driven lifecycle state**
(`PENDING`→`ACTIVE`/`REJECTED` on approval; `ACTIVE`⇄`SUSPENDED` on suspend/reinstate) and
the `is_admin` platform-admin flag — and the **operator↔venue ownership mapping**
(creator-owns-on-create: `POST /api/venues` writes the creator's row atomically with the
insert). Answer for the rest of the system: *does this operator own this venue?*, *which
operators are awaiting approval?*, *which accounts exist for an admin to act on?*
(invariant #13), *what is the operator with this id called, if it is in the status the
caller expects?* (`usernameInStatus`, so the edge can revoke its sessions **before** a
session-revoking transition commits), and *does this venue have an `ACTIVE` owner?*
(`VenueVisibility` — the one home of the rule *a venue is visible to tourists iff its
owning operator is ACTIVE*; a venue with no ownership row answers no, fail-closed).
`venue` fences its catalogue reads with it and `booking` its reserve path; sold-booking
paths never consult it.

**The `ACTIVE` predicate is three explicit sets, each at its owner:** the edge's
may-authenticate set (`ACTIVE`+`PENDING` — approval gates tourist visibility, not console
access), ownership resolution's may-operate set (`ACTIVE`+`PENDING`, `OperatorDirectory` —
a `PENDING` operator owns and works what it creates), and the tourist-visible set
(`ACTIVE` only, `VenueVisibility`, deliberately not widened). `OperatorStatus` in
`vocabulary/` is what lets each predicate live with its owner. A suspension **keeps** the
operator's `operator_venue` rows (it is reversible) but hides the operator's venues from
tourists until reinstatement. `ApprovalOutcome.Rejected` and `Changed` carry the username
because a `PENDING` operator can hold a live session the edge must revoke; `Approved`
carries the stored contact email, returned by the `RETURNING` clause of the very
`WHERE status = PENDING` `UPDATE` that performs the transition, so an admin that loses a
race receives no address and cannot act twice.

The seeded bootstrap `operator` account is the platform admin (`is_admin`, unlocked by
`RIVIERA_OPERATOR_PASSWORD`); it owns no venues. See
`docs/runbooks/operator-credential-provisioning.md`.

**Not My Job:**
- Tourist identity → **`customer`**
- The venue's own data — map, pricing, pools → **`venue`** (I own *who may act on* a venue)
- *Performing* the authorization check at each endpoint → each venue-scoped module's
  **application service** performs it by asking me
- Bookings, payment, payout → their own modules
- Encoding/verifying credentials + the register/login/approval and self-service
  password-change endpoints + the `ROLE_ADMIN` mapping → the **platform edge**
  (`UserDetailsService`, `AuthController`, `AdminOperatorController`,
  `OperatorAccountController`); I store an opaque credential hash and an opaque `is_admin`
  flag, never the login machinery or the role gate. No Spring Security type lives inside
  the module (`OperatorAuthPlacementTests`)
- **Invalidating live sessions** when an account loses the right to them (suspension,
  rejection, credential rotation, a self-service password change) → the **platform edge**
  (`PrincipalSessionRevoker`). I report *that* the transition happened and *whose* it was;
  I never import `org.springframework.session`
- **Telling an approved operator that its venues are now live** → the **platform edge**
  (`OperatorApprovalMail`) driving **`notification`**. I import no mail type

---

## `notification`
**Job:** Own transactional-mail **delivery**: the `Mailer` transports (recording mock vs
real SMTP, profile-swapped, the mock prod-guarded) and the two delivery vehicles of
ADR-0011 — the Event Publication Registry listener for **ids-only** payloads, the bounded
in-memory dispatcher for **bearer-credential** ones. The suppression list and the delivery
log are the module's two pieces of owned state.

**Executors and shutdown:**

- Each vehicle drains on **its own bounded executor** — never Boot's shared
  `applicationTaskExecutor`, which carries the payment→booking and booking→payout
  listeners, so a degraded relay cannot starve the money spine. The registry listener
  spells out `@Async("registryMailExecutor")` + `@TransactionalEventListener` instead of
  `@ApplicationModuleListener`, and holds no transaction across the send — pinned by
  `MailListenerExecutorArchitectureTest`, whose non-vacuity guard names every shipped
  listener off one list.
- The registry pool's size and queue depth are `riviera.notification.registry-mail.*`
  properties (defaults `2`/`200`, validated at boot on both ends).
- **Every invalid registry-pool bound boots clean, so both are checked at both ends.** Spring's
  `ThreadPoolTaskExecutor` makes a `SynchronousQueue` of any capacity `<= 0` (`0` reads as
  "unbounded" and means "capacity zero") and a lazily allocated `LinkedBlockingQueue` of any
  positive one, so an absurd capacity restores the unbounded queue this bulkhead removes. Core
  threads are lazy too: an oversized pool fails later, as `OutOfMemoryError: unable to create
  native thread` on the commit thread the shed handler keeps exceptions off. The ceilings in
  `RegistryMailProperties` bound the typo, not the operator.
- Both pools' shutdown drain window is **derived** from
  `riviera.notification.mail.socket-timeout-ms`, which every
  `spring.mail.properties.mail.smtp.*` timeout also interpolates; the arithmetic lives in
  `shared`'s `ShutdownBudget`. When the window expires both pools **give up rather than
  interrupt** — an interrupt cannot tell a send that reached the relay from one that has
  not.
- Both pools carry the submitting request's MDC through the shared `MdcTaskDecorator`
  (`WorkerContextArchitectureTest`), composed onto the registry pool via
  `CompositeTaskDecorator` **beside** the shed policy that owns its decorator slot.

**Loss accounting** (names in `shared`'s `ObservabilityMetrics`; no tag names the person —
invariant #7):

- `MAIL_REGISTRY_SHED`: a shed registry send, one log line per saturation *episode*.
- `MAIL_RECOVERY_DROPPED`: the dispatcher's mirror — **every** drop is logged, because this
  vehicle has no durable record. A rejection during shutdown counts here
  (`reason=shutdown`); `reason=abandoned` is a send accepted and still queued when the
  drain window expired; the send caught **running** is excluded, being the one that may
  have reached the relay. Read the name as *never ran*, not *refused*.
- `MAIL_RECOVERY_FAILED`: the send this vehicle *accepts* and then cannot deliver — the
  first mail counter to move in a relay outage. Tagged by `kind` and by `reason`
  (`transport` / `suppression-lookup`).
- Both recovery counters carry `kind` off one shared `MailKind` enum.
- **The registry vehicle has no failure twin:** its transport failure propagates, the
  publication stays outstanding, and `riviera.outbox.pending` accounts for it. That holds
  only for failures that *throw* — a mail this module **abandons** for a missing fact
  completes the publication by design, so each abandoning flow has its own flow-named
  counter: `MAIL_CONFIRMATION_ABANDONED` and `MAIL_CANCELLATION_ABANDONED` (tagged
  `no-booking`/`no-set`/`no-contact`, escalated per loss to `ERROR` — zero in a healthy
  system, a data-integrity fault when not), `MAIL_PAYMENT_DUE_ABANDONED` (the only
  **predictive** loss — the sweep releases the set at the mailed deadline), and
  `MAIL_REQUEST_DECLINED_ABANDONED` / `MAIL_REQUEST_EXPIRED_ABANDONED`.
- **The abandon tag names the first missing fact.** `BookingMailFactsService` reads `booking`,
  then `venue`, then `customer` and stops at the first that answers nothing, because the tag is
  what points an operator at one module: reporting the last instead would read as a `customer`
  fault whenever `booking` was at fault. The contact read also needs the booking's customer id.

**Owned flows and surfaces:**

- The **registry-borne booking mails**, all assembled from `booking`/`venue`/`customer`
  published ports (ids only) by one module-internal resolver: the `BookingConfirmed`
  confirmation — carrying the booking's `cancellationWindowAtBirth` + `lateCancelRefundBps`
  off the event, **rendered, never decided** (CLOSED gets the non-refundable last-minute
  line, LATE the past-free-cancellation line, FREE or null nothing); the `BookingCancelled`
  cancellation/refund record — one listener covering every cancellation channel, rendering
  the server-computed refund (invariant #10); the `BookingPaymentDue` notice, on the same
  birth-window rules — `booking` publishes the fact only on the accept branch where money
  is genuinely outstanding, so the listener decides nothing; and the
  `BookingRequestDeclined` / `BookingRequestExpired` records — plain copy, no CTA; and the
  `BookingMoved` "your spot changed" record — the new spot, the spot the guest was told before,
  the distance and the free-exit deadline, all read through
  `booking.api.BookingNotificationFacts#moveFacts` (answered from the commit receipt, so a
  retired from-set still has its label), the code resolved inside this module (invariant #7),
  abandoned under `MAIL_MOVE_ABANDONED` with the shared `reason` vocabulary. The withdraw leg
  mails nothing.
- **The move mail carries the arrival code** (`BookingMovedMail`), unchanged by the move: it is
  the reference a guest with several bookings knows the booking by. Mailed, never logged
  (invariant #7).
- **The payment-due mail carries the deadline and the amount, and names no spot.** The amount is
  the one fixed when the request was made; the accept never changes it. The guest chose the spot
  and already has it on screen and in the booking, and the one thing this mail is for is the
  deadline.
- The **operator-approval notice**, on the recovery vehicle (`kind="operator-approved"`):
  no bearer credential, but edge-orchestrated from an admin request rather than driven by
  a domain fact — which is why "recovery" in `MAIL_RECOVERY_*` names the *vehicle* and
  `kind` names the flow.
- The **mock outbox read** — `GET /api/mock-mail/booking-mails?to=` in `adapter/in`, present only
  where the recording `MockMailer` is (`!mailer & !smtp4dev`, so never under `prod`), operator-gated,
  answering the booking kinds as facts a guest reads on the page anyway — never a code, never a
  link, never a recovery kind. It exists for the local real-backend e2e run and resolves its mailer
  lazily, so a test that swaps the `Mailer` bean still loads the web layer.
- The **email-suppression list**, hashed/non-PII at rest (a `v1:`-tagged peppered-HMAC
  `email_key` plus the cleartext `domain`, never the address; the pepper is env-managed,
  fail-at-boot in prod), deliberately surviving erasure (ADR-0012). The defining invariant
  — **no send to a suppressed address** — is enforced at the one send chokepoint
  (`TransactionalMailService`) on both vehicles, with one carve-out: on the recovery
  vehicle a *transient* failure of the lookup itself sends the mail rather than dropping
  it (a dropped reset is indistinguishable from success to the user); the registry vehicle
  propagates and retries. The lookup's `queryTimeout` is scoped to its own adapter — never
  the global property, which would also bound `availability`'s claim (invariant #2). The
  `domain` CHECK mirrors the Java writer exactly.
- **Reinstatement is a flag, never a deletion**: the ADMIN-gated
  `POST /api/admin/email-suppressions/reinstate` sets `reinstated_at` (`isSuppressed`
  reads `email_key = ? AND reinstated_at IS NULL`), keeping `first_suppressed_at` and the
  prior `reason`; a later bounce clears the flag through the ordinary upsert. A hard
  `DELETE` on this table is a defect.
- **A reinstate answers what the row was; nothing answers "is this address suppressed?".** Each
  populated `ReinstateOutcome` carries the row's reason and timestamps, never the address or its
  `domain`, so the one `POST` also answers the ops question "suppressed for what, since when?". A
  standing lookup endpoint would be a new authenticated oracle for the suppression state — the
  question the `emailWithheld` flag is gated never to answer before a collected payment.
- The **mail-outbox re-drive**: ADMIN-gated `GET`/`POST /api/admin/mail-outbox` reports
  what the registry still owes this module and re-drives it on demand. It is **scoped by
  listener-id prefix to this module's own listeners, never by event type** —
  `BookingConfirmed` fans out to `payout`'s accrual too, so an event-type predicate would
  replay invariant-#9 ledger work from a button labelled "mail" (`MailOutboxScopeIT`).
  The registry's v2 schema makes `markResubmitted` a real claim
  (`… WHERE ID = ? AND STATUS != 'RESUBMITTED'`), so duplicate delivery is a database
  guarantee; `ResubmissionOptions` reaches only `FAILED` publications, never a **shed**
  send (which never ran). The single-flight + cooldown throttles the *sweep*, not the
  duplicate guard.
- **Both outbox levers are module adapters that answer counts, never publications.**
  `AdminMailOutboxController` and `booking`'s `AdminRefundOutboxController` each live in their
  module's `adapter/in`, never at the composition root, which would need a new published `api` port
  for one same-module consumer. Every outcome is a `200` with a typed token; anything thrown becomes
  RFC 7807 through the single `ApiErrorHandler`, never a per-controller `@ExceptionHandler`
  (`ErrorContractArchitectureTests`). A per-publication listing is a non-goal, because the
  serialized events are where booking ids live: the bodies carry counts and an outcome token, never
  an address, a code or a payload (invariant #7).
- The published surface is exactly **`notification::api`**, two role-split ports.
  `MailSender`: fire-and-forget, never throws, runs off the caller's thread,
  suppression-enforced; a send influences **neither the triggering response's status nor
  its latency**, which the anonymous `forgot-password` flow depends on.
  `MailDeliverability`: the synchronous read "would a mail to this address be withheld
  right now?" — safe only where the caller already owns the address (its sole consumer is
  the authenticated verification-resend). Both are consumed by the composition root alone;
  **no module depends on `notification`**. The module also *implements* one port it does
  not own — `booking.spi.ConfirmationMailDelivery` — the inverted edge; the dependency is
  still `notification → booking`.
- **`BookingMailFactsService` is an `application` service, never a `notification.api` port.** It
  has one implementation and no caller outside this module, so a published port would be a
  hypothetical seam.
- The **booking-confirmation delivery log** (`booking_confirmation_mail_attempt`): one row
  per attempt, carrying what triggered it (`AUTOMATIC` / `ADMIN_RESEND`) and its outcome
  (sent / withheld-suppressed / transport-failed / abandoned), plus the ADMIN surface over
  it — a per-address lookup and a one-click **resend** (`/api/admin/mail-deliveries`). The
  log exists because the registry's `completion_date` records only that the listener
  *returned*, which it equally does for a suppression skip and an abandonment. The resend
  sends **synchronously through the chokepoint and publishes nothing**, so it re-drives no
  other `BookingConfirmed` consumer (`AdminMailDeliveryIT`).

- **A venue-caused cancellation carries a way back; nothing else does.** A booking a remodel
  ended is mailed the venue's own map for the same day, or — when `venue`'s per-date sales
  projection says that venue cannot sell it, closed for season or past its sales close — the
  discovery list for that day (`RebookLinks`, `VenueCatalog#availabilityBetween`; an absent
  answer degrades the same way a closed one does). The reason alone cannot mark such a
  cancellation, because a guest who takes the free exit a move earned them is `VENUE_CHANGE`
  too, so the listener asks `BookingNotificationFacts#endedByRemodel`. The link is also what
  tells the two apart in the copy: with it, the venue had no free spot left and a released
  claim says nothing was charged; without it, the guest cancelled and the shipped free-exit
  wording stands. A remodel-declined request keeps `RequestDeclinedMail` unchanged — no
  call-to-action, by the 2026-08-01 product decision.
- **Every booking mail links the code-gated view, `<base>/booking/<code>`, never `/booking/pay`.**
  The view works cold from an inbox: for an `AWAITING_PAYMENT` booking with an open intent it
  offers "Pay now" and hands on to the pay screen, and past the deadline it shows the expired
  booking rather than a 404, while `/booking/pay` resumes in-memory hand-off state and dead-ends
  from an inbox. `BookingLinks` builds the link in this module because the edge cannot: registry
  listeners raise these mails inside the hexagon, with no request in hand.
- **The link origin reads the edge's variable under my own key.** `BookingLinkConfig` binds
  `riviera.notification.booking-link.base-url` to `RIVIERA_RECOVERY_LINK_BASE_URL`: there is one
  deployed origin (the backend serves the SPA same-origin), so a second variable could only ever be
  set to the same value or, eventually, to a wrong one. The key is never `riviera.recovery.*`, which
  belongs to the edge's recovery flows: reaching into another context's namespace is the coupling a
  module-owned properties type exists to avoid.

**Not My Job:**
- Deciding **when** to send, minting/hashing recovery tokens, building the **tokenized**
  links → the **platform edge** (`CustomerRecovery`); for edge-triggered kinds I am handed
  fully-formed messages. The line: a *credential-material* link — one whose token I would
  have to mint, hash or time-bound — is the edge's; a link I merely *format* from a fact
  already in my hand is mine (`BookingLinks` composes `<base>/booking/<code>` from the code
  I read through `booking::api`; the code cannot ride the payload, invariant #7). Its two
  **rebook** links carry no credential at all: `<base>/venues/<id>?date=…` and
  `<base>/?date=…`
- The recovery-token lifecycle/store → **`customer`** (`CustomerAccountRecovery`)
- Resolving an email address to a guest contact → **`customer`**
  (`CustomerLookup#findByEmail`); *which bookings* a contact has → **`booking`**
  (`CustomerBookings`). My delivery log stores a booking id and nothing else, so erasure
  has no copy here to reach
- The booking/venue/customer **facts** a mail renders → their owners, read via `api/`
  ports at send time
- Persisting a bearer-credential payload → nobody's job, ever: recovery mails ride the
  in-memory dispatcher precisely so the raw token never lands in `event_publication`
- The provider bounce/complaint **feed** into the suppression list → a follow-up slice
  (needs provider setup); today nothing writes the list

**The withheld-flag probe** (read before wiring the suppression list's first writer). The
`emailWithheld` flag makes a populated list a paid suppression oracle: book with a victim's address,
pay, read the flag, cancel before the evening-before cutoff for a full refund. Three facts bound it:
nothing writes the table yet (reinstatement only lifts a row), so zero bits until the bounce or
complaint feed, the residual's trigger; no rate-limit budget binds, a probe's real limiter (a
payment, a claimed `(set, date)`) being far below any capacity sparing the pay poll (ADR-0006); and
the flag can't ride only the post-payment hand-off: the code-gated read *is* it, the prober the
payer. `CONFIRMED` **and** `payment.api.CollectionGuarantee` keep it inert unless collected first.

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
  `AlreadyReviewed`. Edit and delete go by `booking_id` on rows-affected, so an edit racing a delete
  is `NoSuchReview`. A delete frees the slot while the window is open.
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
- **The visibility predicate (`hidden_at IS NULL`) lives in exactly two statements**, `JdbcReviews`'
  `totalsFor` and `newestListedBefore`; the author's read-back and the admin list see a hidden row on
  purpose. A listed review is also commented: a star-only one counts, never shows as an empty row.
- **The fence order is stated once, in `domain/ReviewGate`**, which lifecycle and panel both consult.
  A hidden review is frozen for its author: `HIDDEN` precedes the window, and edit, delete and
  resubmit get `409 REVIEW_HIDDEN` with the slot kept taken — a delete would free it and a resubmit
  claim a fresh visible row. Un-hide hands the window rights back.
- **The booking code is the whole authorization** (invariant #7): the resource is the guest's
  booking, the use case mine, so `ReviewController` joins the `permitAll` `/api/bookings/{code}`
  family (and its per-code rate-limit budget) without touching `BookingController`. The code is
  never logged and never reaches an error body (`instance` is the constant `/api/bookings`).
- **An over-long review text is refused, never truncated** — half a sentence stored silently is
  worse than a no. `SubmitReviewRequest` strips, then holds both texts to `ReviewText`'s bounds
  (`400 INVALID_REQUEST`); V46's CHECKs are backstops.

**Not My Job:**
- Storing, showing or ordering by the rating (`venue.rating_tenths` / `reviews_count`), "New", who
  may *see* a venue's list → **`venue`** and the frontend (I compute and announce)
- Deciding a stay was delivered, or owning `completed_at` → **`booking`**
- The guest's identity → **`customer`**: a review hangs on a *booking*, not a person; the display
  name is the author's label, its prefill suggestion `booking`'s to derive
- Login, sessions, CSRF, rate-limit wiring, the ADMIN gate → the **edge**; a takedown's audit record
  → **`audit`**, via the edge's fence
- Judging a review for takedown → the **platform admin** (publish-first; no queue, no reporting)
- *That* a subject's reviews are erased, or which bookings are theirs → **`customer`** and
  **`booking`**; I blank my rows for the booking refs I am handed

## `shared` (not a bounded context)

The **Shared Kernel** (Evans, DDD ch. 14), an `OPEN` module with no `api`/`vocabulary` surface. The
name is used for Evans' *discipline* (keep it small, change it only by consultation), not his
definition — his kernel is a subset of the domain model; this one holds edge types (ADR-0017).

**Job:** hold the few edge types modules share, each admitted on **ownership, never reuse** — here
because no module can own it, not because several use it. Nothing else: three modules wanting a type
is the trigger for asking the question, and the answer is always ownership.

- `ApiProblem` and `InvalidApiRequestException` (the root advice owns exception→status; module
  adapters throw), `CurrentOperator` and `CurrentCustomer` (principal → typed id): module adapters
  need them, and no module may depend on the root.
- `ObservabilityMetrics`, the metric names; emission and tags stay with the module owning the thing
  measured. Admitted only for **naming consistency**, a narrower ground — hold new entries to it.
- `ShutdownBudget`: pools in several modules drain one after another, so their claims on the
  SIGTERM grace add and only the platform owns the sum. `ShutdownDrainArchitectureTest` finds them
  from bytecode: the context misses `defaultCandidate = false` and non-bean pools.
- `MdcTaskDecorator`, the one way a pooled worker inherits its submitter's logging context: its
  other half, `CorrelationIdFilter`, sits at the root, so no module can own it.
- `ResubmissionThrottle` + `ResubmissionOutcome`, an admin outbox-resubmit lever's once-only guard
  (single-flight, a cooldown from construction so a press cannot race the boot republication); each
  lever module keeps its own scope, window and log noun.

**Not my job:**
- **Any business logic or module-owned state** → its owner: a change here ripples everywhere.
- **Depending on a module that depends back** → only `customer` and `operator` (`api`/`vocabulary`).
- **Being the composition root** (`PlatformApplication`, `SecurityConfig`, the controllers) → the
  root package, which depends on modules; merged with `shared`, it closes `booking → root → booking`.

## `challenge` (not a bounded context)

The **proof-of-work challenge** mechanism (ADR-0016, ADR-0017): a closed non-context module, the
full template minus `domain/`, no dependencies. Only writer and reader of `challenge_registry`
(machine-checked); publishes only `api.ProofOfWorkChallenges` and `vocabulary.ChallengeVerdict`.

**Job:** issue signed ALTCHA v2 challenges, verify a solution, accept each exactly once, sweep
expired rows, serve the challenge endpoint. **Single use is a database claim, never memory**
(`INSERT … ON CONFLICT DO NOTHING` on `challenge_registry`): a restart or a second instance must
not reopen a replay window. Expiry is checked on the server clock; the sweep keeps a row
`riviera.altcha.clock-skew` past its expiry, which is where instance clock skew is absorbed.

**Not my job:** which routes are fenced, the filter and its ordering, the problem bodies — the
root's edge (§ *Platform edge*); rate limiting (`RateLimitFilter`, root).

## `audit` (not a bounded context)

The **admin audit trail** (ADR-0013): a closed non-context module (ADR-0017 decision 6), the thin
template plus a driving adapter — no one module could own it, as the audited controllers span
modules and the root. Only writer and reader of `admin_audit_record` (machine-checked); publishes
`api.AdminAuditLog` and `vocabulary.AdminAuditEntry`, nothing else (the root reaches `api` alone).
**I know no domain type and depend on nothing, not even `shared`** (`allowedDependencies = {}`): a
mechanism that knew one would be a domain module in disguise.

**Job:** append one row per mutating `/api/admin/**` action that reached past the security gate —
the actor a username snapshot, deliberately no FK — and serve the Audit tab's newest-first read.
Append-only: no updates, no deletes. **An application-level `4xx` leaves a row** (a failed
destructive attempt is signal), an upstream `401`/`403` does not, a throw is recorded as its `500`.
**A lost row never fails the action it records** (the fence logs it at ERROR): the append runs
*after* the action and cannot undo it, and on the action's own database a loss takes a mid-request
failure.

**Not my job:** which requests are audited and when in the chain, the `X-Audit-Reason` header and
its sanitizer, the ADMIN role gate — the root's fence (§ *Platform edge*); judging *whether* an
admin action was justified; retention (a named non-goal — rows are kept indefinitely).

## Platform edge (settled)

The edge rules no module owns (per-module consequences: §`customer`, §`operator`): server-side
sessions (Spring Session JDBC) with **two principal types**; all login/session machinery at the
edge, never in modules; customer-account identity separate from the guest row — no FK, no
back-linking of past guest bookings, ever; auth endpoints non-enumerating + constant-time, on their
own rate-limit buckets; mocked externals (SSO IdPs, mailer) profile-guarded out of prod; session
revocation edge-orchestrated and synchronous, bracketing the state change.

**Abuse and accountability split into fence and mechanism** (ADR-0017): the **fence** — filters and
their order, route policy, filter-chain problem bodies, neutralizing client input such as
`X-Audit-Reason` — is the edge's; a **mechanism** it calls through a port (a table, a job, a
library) is a non-context module. So `ChallengeVerificationFilter` and `AdminAuditFilter` (every
mutating `/api/admin/**` action, §`audit`) stay here; `challenge` and `audit` own what they call.

- **Password policy (D-8)** — one edge rule, `PasswordPolicy`, wherever a password is *chosen*
  (never at sign-in), checked before any write — on register, ahead of the timing-equalized
  branches; modules get only the encoded hash, never the rule. Length → `400 INVALID_REQUEST`, a
  blocked term → `400 PASSWORD_CONTAINS_BLOCKED_TERM`, distinct so the client can name the rule.
- **Proof-of-work challenge (ADR-0016)** — customer and operator register, forgot-password and
  booking create need a solved, self-hosted ALTCHA challenge (single use: §`challenge`). No ALTCHA
  hosted service is ever called; no domain module knows the challenge exists.
  `riviera.altcha.enabled=false` is the kill switch (the endpoint's `204` hides the widget).
- **Challenge refusals are `400`, never `403`, after `RateLimitFilter` and `CsrfFilter`:** the
  limiter refunds a `403` on budgets guarding authenticated work, and a refused solution must still
  cost its token. Cheap checks first, so a `429` wins; the registry claim, the fence's one write,
  is the last step before the controller.
- **Not fenced, deliberately:** login (the per-identity throttle covers it) and token redemption
  (a reset or verification token is already a bearer credential). Forgot-password stays
  non-enumerating (D-8): a refusal precedes the account lookup, identical for every address.
- **Booking create is fenced for every caller**, guest or signed-in — no auth-state branch, since a
  script holding the online pool costs the same either way. A refusal precedes any availability
  claim, booking row or PaymentIntent (invariant #2 untouched). The SPA solves on the checkout's
  Review step, not Details, for Details' fold budget (`booking-challenge.e2e.ts`).
- **Remodel orchestration (ADR-0020)** — the one domain composition the root holds, since `venue`
  may not depend on `booking`: `RemodelPreviewController` and `RemodelCommitController` compose
  `venue.api.BeachMapRemodel` with `booking.api.RemodelClaims` (`CompositionRootDisciplineTests`
  grants exactly their `api` + `vocabulary`). `RemodelCommitService` supplies the `RemodelGate`
  `BeachMapRemodel#commit` asks under its locks, where `RemodelClaims#commit` settles every claim,
  so layout, moves, availability rows and receipt are one transaction, and no Stripe call is inside.
- **Each remodel port asserts venue ownership itself** (invariant #13); the edge resolves the
  principal and maps outcomes. Diff, zone, candidate, status split, token and free exit stay in
  their modules: a rule growing at the root is the signal it belongs in one.
- **Remodel answers:** `200` with the receipt; `409 STALE_PREVIEW`, `REMODEL_REFUSED` or
  `REFUND_NOT_CONFIRMED`, each with the fresh picture and its token in `preview`, so the operator
  re-decides on what is true now; or the save's own `SETS_IN_USE`, `STALE_WRITE` and shape errors.
- **Riviera map resources (ADR-0022)** — the **riviera map** (not a venue's **beach map**) is drawn
  from resources the root's `MapResourcesConfig` serves anonymously under `/map/**`, owned by no
  module. **No third-party map host, tile CDN, glyph host or geocoder is ever contacted from a
  tourist's browser** (`MapStyleSelfHostedTest`, `discover-map.e2e.ts`'s off-origin guard). The
  files sit in `riviera.map.dir`, never on the classpath: the archive is read by HTTP `Range`, and a
  deflated jar entry cannot seek. **Map posters** ship under `/posters/**`, so a phone's first paint
  makes no `/map/**` request. Size budgets: `MapArchiveBudgetTest`, `map-poster-set.spec.ts`.
- **A password reset revokes the account's sessions before and after its write** (not atomic:
  `customer`'s transaction, Spring Session's deletes). Revoking only after would let a failed revoke
  answer `500` with the token spent and the attacker's session alive, so the edge names the account
  first (`CustomerAccountRecovery#emailForResetToken`, consuming nothing) and revokes; the second
  revoke closes the old password's window. Encode above the first revoke, or bcrypt widens the gap.
- **The money-path alert check shares the sweeps' single-instance posture.** `MoneyPathAlertCheck`
  is lockless `@Scheduled`: each extra instance fires the outbox-backlog alert again. It takes
  ShedLock with the sweeps at scale-out — `docs/deploy/production-hardening.md`'s preconditions name
  only the two lockless sweeps, so it joins that list then.
- **The bootstrap credential is stamped by an edge runner, and only that one.**
  `OperatorCredentialInitializer` (full context only; a `@WebMvcTest` slice does not scan it)
  touches only the bootstrap admin; every other operator self-registers (`OperatorRegistration`,
  `PENDING` until approved) and sets its own password via `OperatorProvisioning#setPassword`.

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
  it owns lists (five claim groups, the sets that stay) and refund fields; the confirm panel is a
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
  rarely exists yet at decision time — hence lookup in `earlyRead`, `focus()` in `write`.
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
   hand-written `JdbcClient` SQL, with no `org.springframework.data.*` import in `src/main/java`.
   The Spring Data JDBC starter is on the classpath, but nothing has earned its aggregate mapping
   (`riviera-java-conventions` §1a): reaching for it is a review conversation, not a preference.
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
   idempotent on `UNIQUE (booking_id, entry_type)`: a booking accrues once, a refund reverses it,
   and a refund the venue's own change caused also charges it a `FEE`. Payout = Σ bookings −
   commission (per-venue rate, effective-dated, forward-only) − fees. **Direction is the entry
   type**: amounts are non-negative magnitudes, only `ACCRUAL` adds and every other type deducts
   (the safe default for a type added later); a `FEE` has no gross or commission and is the one
   type the net CHECK exempts (ADR-0021). Payouts settle manually via BKT; the ledger is the record.
10. **Cancellation/refund policy is enforced server-side** (ADR-0005 as amended), never from a
    caller's figure. Full refund until the venue's evening-before `booking_cutoff` (default `18:00`
    `Europe/Tirane`, owner-editable; not #4's sales close), then the venue's late share (none or
    partial); from service-day open (00:00 `Europe/Tirane`) a guest cancel is refused, not
    refunded. Outside the tiers, deliberately: the **weather exception** (manual, admin-triggered,
    full) and a **moved booking's free exit** — in full under `VENUE_CHANGE` until
    `BookingCutoff#freeExitEndsAt`, whatever `LATE` would answer; it never reopens `CLOSED`, as
    that deadline is capped at service-day open (§`booking`, ADR-0020).
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
    (OWASP API #1, BOLA): the `OPERATOR` role is necessary, never sufficient. Every
    `/api/venues/{venueId}/**` operation checks via `operator`'s `api/` port that the operator owns
    the path `venueId` (`403` on mismatch) in the **application service**, so no driving adapter can
    bypass it. `/api/admin/**` is role-gated and exempt. Reviewed as RV-BE-9.

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
| No class inside a module depends on a type directly in `ai.riviera.platform` — ADR-0017 | `CompositionRootDisciplineTests` (module→root rule; `allowedDependencies` cannot see it) |
| The root touches only the module surfaces it is granted — never `payment`, `payout`, `availability` or `review` (ADR-0017, ADR-0020) | `CompositionRootDisciplineTests` (root→module allowlist) |
| `payment` uses no Stripe **Connect** API (collect-only, ADR-0002) | `NoStripeConnectArchitectureTest` |
| No module reaches another's `application`/`domain`/`adapter`; `allowedDependencies` hold | `ModularityTests` (`ApplicationModules.verify()`) |
| The ADR-0007 package shape; published-surface kinds; the `VenueCatalog` role split | `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` |
| No JPA/Hibernate on the classpath — invariant #1 | `JdbcOnlyArchitectureTests` |
| A `domain/` class names only the JDK and published ids, values and rules (ADR-0018 §4) | `DomainPurityArchitectureTests` |
| The booking transition table and the guarded `UPDATE`s admit the same statuses (ADR-0018 §1) | `JdbcBookingTransitionTableIT` (every transition × every status) |
| The view's `cancellable` and the guest cancel's refusal agree with `CANCEL_BY_GUEST`, status by status (ADR-0018 §1) | `ViewBookingServiceTest.onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen`, `CancelBookingServiceTest` (against the literal `BookingTransitionTest` pins) |
| No login machinery inside `operator` (RV-BE-11) | `OperatorAuthPlacementTests` |
| No login machinery inside `customer` (RV-BE-11) | `CustomerAuthPlacementTests` |
| Mail listeners name their own bounded executors, never Boot's shared `applicationTaskExecutor` | `MailListenerExecutorArchitectureTest` |
| `booking` listeners reaching `payment::api` run on the bounded refund pool | `RefundListenerExecutorArchitectureTest` |
| Every self-configured worker pool carries the shared MDC decorator | `WorkerContextArchitectureTest` |
| The draining pools' shutdown claims sum within the SIGTERM grace | `ShutdownDrainArchitectureTest` |
| Pool tokens live only in `venue.vocabulary.Pool`: no other production class holds an `"ONLINE"` / `"WALK_IN"` literal (invariant #3's operand is the published type) | `PoolTokenArchitectureTest` (`CONSTANT_String` scan, so `Pool.ONLINE` passes) |
| A retired set is absent from every read but `SetBookingFacts`: production SQL naming `set_position` reads `active_set_position` or names `retired_at`, an `INSERT INTO` excepted (ADR-0019, §`venue`) | `RetiredSetExclusionArchitectureTests` (per-statement `CONSTANT_String` scan; the structural net's one member admitted by decision) |

Most rules also prove on every build that they can fail, against deliberately-violating fixtures
(`ai.riviera.responsibilityfixture`, `ai.riviera.placementfixture`, `ai.riviera.retirefixture` and
siblings) — never by breaking production code.

**Review-checked only** (plan-time Module-ownership table, `riviera-plan-doc` §4a; RV-BE-11):

- A refund **policy** inside `payment` (`booking` decides whether and how much; `payment` executes).
- Commission **math** inside `venue` (it stores the rate; only `payout` computes).
- Review **policy** (eligibility, window, rounding) leaking into `venue`, the twin of the
  commission split: only the SQL half is machine-checked above (ADR-0015).
- A booking-lifecycle decision in `availability` (it holds state, not the cutoff rule), or any
  capability landing on a module's Not-My-Job list without crossing a package boundary.

Known scan limits (on the tests): a sole-writer scan needs the whole-word table name contiguous in
the constant pool, so SQL concatenated across it evades the scan (text-block SQL keeps it whole);
the id-based-events rule unwraps generics and arrays but reads only a component's declared type.
