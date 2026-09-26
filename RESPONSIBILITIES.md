# System Responsibilities

The Job / Not-My-Job boundaries for each module in the `ai.riviera.platform`
modular monolith. This is the plain-English companion to `CLAUDE.md`: `CLAUDE.md`
holds the module table and the invariants in one sentence each; this file holds the
invariants' long form, the settled platform-edge rules, and — for each module — what
it owns and, more usefully, what it must **refuse to own**. When a boundary is ambiguous
in a plan or review, this is the tie-breaker. Present-tense contracts only: the history
behind a rule is on its issue, PR or ADR, and each bullet or paragraph keeps to 8 lines
(`riviera-java-conventions` §6d; gated in CI, one rule per bullet).

Modules: `venue`, `availability`, `booking`, `payment`, `payout`, `customer`,
`operator`, `notification`, and `review`. Cross-module collaboration is **events for
state changes, `api/` ports for queries** (invariant #11).

The **structural** subset of these boundaries is machine-enforced — see
[Machine-checked vs review-checked](#machine-checked-vs-review-checked) at the end
of this file for exactly which clauses the build verifies and which remain
review-only.

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist browses venues and opens one; they see the beach map and which sets are
   free for a chosen day, or for every day of a stay (a first and a last day, at most 62 days,
   Instant venues only): free throughout, **partly free** (with the days it covers), or taken.
   The map and set layout come from **`venue`**; which of those sets are free on which days
   comes from **`availability`**.
2. The tourist picks a set + the days and gives guest-checkout contact. **`customer`** owns
   that contact; **`booking`** opens one booking for the whole stay.
3. **`booking`** reserves the set: it asks **`availability`** to claim one `(set, date)`
   row per day of the stay **atomically** — so it can never be double-sold — giving back
   the days already won when a day loses, and commits the booking as `AWAITING_PAYMENT`.
   The claim happens **before** any money moves.
4. **`booking`** hands off to **`payment`**, which creates a Stripe PaymentIntent.
   `booking` never touches Stripe itself.
5. Stripe confirms out-of-band. **`payment`** reconciles the result from the
   **signature-verified webhook** — never a client "success" redirect — and marks the
   payment settled.
6. **`booking`** confirms: it transitions to `CONFIRMED`, issues the unguessable booking
   code, and publishes `BookingConfirmed`.
7. On `BookingConfirmed`, **`payout`** accrues a ledger entry for the venue
   (idempotently) and **`notification`** mails the confirmation. `availability` needs no
   listener — the set was claimed at step 3. No listener reaches back into `booking`.
8. On arrival, venue staff check the guest in — scanning the booking's QR (or typing its
   code) stamps today's service day as attended, exactly once per service day; on the stay's last
   service day that resolves the booking `COMPLETED`. Staff can also
   tap-to-mark a walk-in, which **`availability`** records against the **walk-in** pool.
9. If the tourist cancels, **`booking`** applies the cancellation policy, frees the set
   **synchronously** via `availability`'s `release` port, and publishes
   `BookingCancelled` — on which **`payout`** reverses its ledger entry, `booking`'s own
   refund listener drives **`payment`**'s `RefundPort` with the amount `booking` decided,
   and **`notification`** mails the cancellation record with that refund amount.

> **Variant — Request-to-Book** (per venue's booking mode): between steps 2 and 3 the
> host accepts or declines (`booking` owns the request lifecycle, its expiry sweep, and
> the guest's own **withdraw**; ownership checked via `operator::api`, though withdraw is
> authorized by the booking code alone). On accept, `payment` issues a fresh PaymentIntent
> (payment-request-on-accept), and from `AWAITING_PAYMENT` onward the Instant spine runs
> unchanged.

**Key design decisions:**

- **`availability` is the single source of truth for `(set, date)` and the only writer of
  that table.** A set is claimed atomically (`INSERT … ON CONFLICT`) at reservation time,
  *before* payment (invariant #2).
- **Online and walk-in are separate pools** (invariant #3).
- **`payment` trusts Stripe webhooks, never the client** (invariant #8).
- **Decision vs. execution is split, three times.** `booking` owns the cancellation/refund
  *policy*; `payment` *executes* the refund. `venue` stores the commission *rate*; `payout`
  *does* the arithmetic. `review` computes the rating; `venue` stores it. No executor
  re-decides.
- **Money is integer minor units in EUR, everywhere. No floats** (invariant #5).
- **Events carry technical ids** (`BookingId`, `SetId`, `VenueId`), never foreign
  aggregates or mutable business fields (invariant #11).
- **Every venue-scoped operation verifies the operator owns the venue** (403 on mismatch),
  in the application service, via the mapping **`operator`** owns (invariant #13).

---

## `venue`
**Job:** Own venue profiles (incl. amenities + distance-to-water), the beach map / layout,
set positions, the online-vs-walk-in pool assignment for each set, pricing, the booking
mode (Instant / Request), venue photos, the sales-close setting, the maximum stay length, and
the commission rate over time. The standing rules:

- **The tourist catalogue reads are visibility-fenced.** All three `VenueCatalog` reads
  (list, map, availability calendar) consult `operator.api.VenueVisibility` inside the
  adapter, so a venue whose owning operator is not `ACTIVE` is absent from the list and 404
  on the map and calendar — indistinguishable from nonexistent. The public review list
  applies the same fence in `ListVenueReviewsService` before asking `review`.
  `SetBookingFacts` is deliberately **unfenced**, and the one port that still answers for a
  **retired set** (ADR-0019): its consumers include sold-booking paths (cancel, view, mails, the
  staff booking lookup) that must keep answering for a hidden venue's sets and for a spot that has
  left the map; the reserve path applies the visibility fence itself in `booking`, and
  `poolForClaim` — a locking read on the active map — is the retired-set fence for both claim
  paths. The anonymous content-hash photo read is unfenced.
- **Venue photos** (ADR-0008): per-slot upload/replace/delete, processing, `bytea` storage
  behind the module-internal `PhotoStorage` port, and the public content-hash serving read.
- **Each tourist photo surface reads its own slideshow list.** A slideshow is one photo per
  occupied slot, in `PhotoSlot` order (cover, sunbeds, bar), taking each slot's first stored surface
  from a per-list preference: `CARD` first for the Discover card (the list read's `photos`),
  `BANNER` for the beach-map band (the map read's `photos`), `LIGHTBOX` for the modal viewer
  (`lightboxPhotos`). A chosen surface brings only its own densities, so one list's widest
  candidate never reaches another. The slot order is the `EnumMap`'s iteration order:
  `JdbcVenueCatalog` builds each venue's slot map as an `EnumMap`, and any other map loses it.
- **Photo moderation is ownership-free by design** (ADR-0013). Read and takedown sit on
  their own `VenuePhotoModeration` port so the ownership-asserting `VenuePhotos` contract
  stays uniformly `assertOwns`-first. The `ADMIN` role gate on
  `GET`/`DELETE /api/admin/venues/{venueId}/photos…` is the whole authorization
  (invariant #13 exempts `/api/admin/**`). Both ports run the same single cascading delete;
  a takedown removes one **slot**, not one image — byte-identical variants in another slot
  keep serving.
- **I store the rating aggregate; `review` computes it.** `rating_tenths` /
  `reviews_count` are my columns and I am their **only** writer, but I own neither the
  arithmetic nor the policy. On `review.events.ReviewsChanged` my listener re-reads the
  whole answer through `review.api.VenueRatingSummary` and overwrites — a **full
  recompute**, never an increment, so at-least-once redelivery converges. Nothing but the
  venue id is taken off the event.
- **Recomputes of one venue serialize on its row lock** (`VenueRatings#lockForRecompute`). A
  recompute reads `review`'s totals, then writes my row, and a full re-read is order-independent
  only when the two do not interleave: without the lock, a listener that read stale totals can
  commit after one that read fresh ones and pin the venue to the older score until some later
  review fires another event. So the lock is taken inside the transaction (outside one it is
  released at once, so the adapter throws) and before the totals are read.
- **One adapter, `JdbcVenues`, serves `Venues`, `CommissionRateStore` and `VenueRatings`**, because
  all three write columns of the one `venue` row. The ports split by the conversation their callers
  are having — an owner editing their venue, the platform setting a commercial term — not by table;
  the stored rating aggregate is a third such conversation, the platform's on `review`'s behalf.
- **A layout write that a live claim depends on is refused — and only that write.** Every
  layout write asks the set-scoped question under `SELECT … FOR UPDATE` on the active map:
  `editSet`/`removeSet` of the one set they touch (`SET_IN_USE`), the bulk save of exactly the
  sets it removes (`SETS_IN_USE`, naming every one). **Price, tier and pool are never refused, on
  any set** — on the single-set edit, on the batch apply (`PATCH /api/venues/{venueId}/sets`) and
  on the bulk save alike; **only a position move or a removal asks the claim question.** The
  row-scoped display writes `repriceRow` and `renameRow` destroy nothing and ask no claim question
  either.
- **The bulk save is a diff keyed by grid cell, never a delete-all.** `PUT /api/venues/{venueId}/beach-map`
  takes the venue row (`lockAndReadSetVersion`, `STALE_WRITE` on a mismatch), then every active set
  row `FOR UPDATE` with its placement, and diffs the submitted layout against them: a kept cell is
  updated in place under its own id (row label, position, tier, pool, price), a new cell is inserted,
  an absent cell's set is removed — retired when it carries any booking, deleted otherwise
  (ADR-0019). Only the sets a guest could be stranded on are probed — the removed ones and the kept
  ones whose position number changes, the per-set reposition's twin — through `LiveClaims#locksOn`,
  the owner's read's own predicate, so a refusal names exactly the sets the editor already pins; a
  refused save writes nothing and leaves the token untouched. Removals are written before the
  in-place updates and the inserts, so a freed slot is open before another set takes it, and a kept
  set whose new row label and position another kept set still holds (a swap or rotation of row
  names) has its label parked on a transient value first (`Venues#parkRowLabels`), so the
  layout-uniqueness index never sees two sets in one slot mid-save. The body carries no set ids, so
  a set that changes cell reaches the save as a removal plus an insert — the removal question is the
  move question. The token advances once on every successful save, an unchanged layout included.
  - *Why the pool joins price and tier:* the pool is a sales-channel attribute, not a physical one.
    Invariant #3 is a **reserve-time** rule — it decides whether a *new* online booking may claim
    a set (`booking`'s fast path, `availability`'s locked claim-time read) and says nothing about a
    booking that already exists. Staff walk-in marks are pool-agnostic, and every booked
    `(set, date)` is protected by its own availability row whatever the pool says. So a set
    switched to walk-in stops selling online from now on, its already-booked dates stay claimed
    (a new online reserve is refused for any date; a staff mark on a booked date is still refused),
    and the staff daily view lists the online booking on the now-walk-in set. Repricing a booked
    set was always allowed; the pool follows the same rule (epic #1027, revision 3).
  - *Availability arm:* every claim-probing write asks one question — is there a hold on
    these sets dated today or later — through `LiveClaims` (`hasLiveHold` for the per-set writes,
    `locksOn` for the bulk save and the owner's read). A past hold freezes nothing;
    a past date is never claimable (reserve and staff mark both refuse it), so the range
    the probe ignores is one nothing can be written into.
  - *One predicate, two callers:* the `LiveClaims` holder owns both arms (the Tirane cutoff and
    the delegation to `booking` for what "live" means), and the owner's beach-map read asks it
    per set with the nearest dates. So the lock the editor shows before a click is, set by set,
    the lock `SET_IN_USE` would enforce after one; the two cannot drift because there is one.
  - *Booking arm:* `editSet` and `removeSet` refuse only on a **non-terminal** booking — the edit
    only when the command would reposition the set, the remove on every call. A finished booking
    refuses nothing; it decides how the set leaves the map: **a set that carries any booking is
    retired, never deleted** (`retired_at` stamped with the service clock, ADR-0019), because the
    RESTRICT `booking.set_id` FK pins its row for every booking, mail and payout line that names
    it; a set with no booking is deleted. The bulk save applies the same rule to every set it
    removes. The "forever" lock is gone: last season's cancelled booking no longer freezes a spot.
  - *Retired sets — the exclude and exempt lists, machine-held:* a retired set is absent from
    the tourist list and its counts, the map, the availability calendar, the operator's daily
    view, every layout lock and conflict probe, and both claim paths (the online reserve and
    the staff walk-in mark answer `NO_SUCH_SET`); every such read selects from the
    `active_set_position` view, every set write names the marker, so a retired set is never
    re-labelled, repriced, re-pooled, moved or deleted — its label and price are frozen at what
    its guests were told. The one read that still answers for it is `SetBookingFacts#setBookingInfo(s)`
    — cancel, the booking view, the mails and the staff booking lookup — because the later move
    mail must name the old spot. Its row/position and grid cell are free for a new set: the
    layout-uniqueness indexes are partial over active rows. `RetiredSetExclusionArchitectureTests`
    holds every production statement to this (§ *Machine-checked*).
  - Which statuses are live is `booking`'s call (`BookingStatus#canStillBeHonoured`, reached through
    `BookingPresence#hasLiveBookings`); `venue` never enumerates booking statuses. Price,
    tier and the row's name stay editable on a claimed set: a booking's charge is
    snapshotted at reserve time, and `row_label` lives on `set_position` alone, so a guest
    already booked into a renamed row reads the new name live while the mail in their
    inbox keeps the old one.
  - *The remodel preview is the diff without the lock:* `BeachMapRemodel#preview` (published, the
    `api` port the platform edge composes, ADR-0020) asserts ownership, checks the token
    unlocked, runs the same cell-keyed diff over the unlocked active map and answers the removed and
    renumbered sets with their staff walk-in holds from today on
    (`SetAvailabilityLookup#walkInHoldsFrom` through `LiveClaims`). It writes nothing and takes no
    row lock — read-only, so it never queues a claim's FK lock — which is why its answer is a
    snapshot the save re-decides; the layout-shape rejections stay the save's, the preview refuses
    only `NO_SUCH_VENUE` and `STALE_WRITE`. What a booking on a disturbed set becomes is `booking`'s
    (`RemodelClaims`); the edge assembles the two answers. The candidate spots `booking` ranks are
    mine to render, as the tourist map is: `SetBookingFacts#activeSetsOf` and `#freeOnlineSetsOn`
    read the active map (with the published `Tier` mirror of `set_position_tier_check`) and subtract
    the day's availability rows.
  - *The remodel commit is the save with a gate in it:* `BeachMapRemodel#commit` runs the one bulk
    write (`LayoutWriter`, the same code the plain save runs) under the venue-wide set lock and,
    between the locks and the live-claim probe, hands the disturbed sets to the caller's
    `venue.api.RemodelGate`. The gate answers a `GateVerdict`: `Proceed` names the **kept sets** —
    the disturbed sets the caller could not settle around — and the write leaves each exactly as
    stored (a removed one stays, a renumbered one keeps its row, number, tier, pool and price) and
    skips it in the probe; every other disturbed set the caller has re-seated inside my transaction
    (`booking` joins it), so the probe finds no live claim and the layout writes. A submitted set
    that wants a kept set's `(row, position)` is `KeptSetsDisplaced` (`LayoutDiff#displaced`): the
    operator must keep that set themselves. A declining gate, a displaced kept set, a probe that
    still refuses, or a shape rejection marks the transaction rollback-only — the layout and the
    moves land together or not at all, whichever refused. The plain save is the same writer with a
    gate that always proceeds keeping nothing, so the probe alone decides.
  - A rename is refused only for `ROW_NAME_TAKEN` (another row already carries the label);
    renaming a row to its own label is a no-op. The bulk save enforces the same
    one-label-one-physical-row rule within its batch (`LayoutRejection.ROW_NAME_TAKEN`);
    the single-set `addSet`/`editSet` paths do not yet check it.
  - Because the pool is **mutable** layout data, `SetBookingFacts#poolForClaim` is a
    **locking** read (`FOR KEY SHARE`, the weakest lock that conflicts with the set-writes'
    `FOR UPDATE`). It must run in a transaction, never a read-only one; the unlocked
    `setBookingInfo` serves list and mail reads. The set-writes' `FOR UPDATE` is what makes a
    claim racing a pool flip decide against the committed pool: whichever commits first, the
    other sees it.
- **The batch apply is one transaction on the `set_version` token.** `applyToSets` takes the
  venue row (`lockAndReadSetVersion`) and then the named set rows `FOR UPDATE` — the order every
  set-write takes, so it cannot deadlock the bulk save or the reprice — writes the touched columns
  with one `COALESCE` `UPDATE`, and advances the token once, on success only. A stale token refuses
  the whole batch (`STALE_WRITE`); a set id not on the venue refuses it too (`NO_SUCH_SET`), before
  any write, because the per-set `removeSet` does not bump the token and "N sets updated" must
  never overstate. The response reports the count.
- **The pool vocabulary is stated once.** `venue.vocabulary.Pool` is the one Java statement of
  the `set_position_pool_check` tokens (ADR-0018 §3); every published set fact (`SetBookingInfo`,
  `SetView`, `SetBookingFacts#poolForClaim`) carries it, and no production class — this module
  included — holds an `"ONLINE"` / `"WALK_IN"` literal of its own, so both invariant #3 checks
  (`booking`'s unlocked fast path, `availability`'s locked claim-time check) compare against the
  published type. The wire keeps the tokens (the enum serialises by name) and the edge parses
  them once, in `PoolToken`.
- **The commission rate over time, not just its current value.** `venue_commission_rate`
  is the effective-dated schedule behind `VenueRates#commissionBpsOn` — the rate that
  applied to bookings served on date D, for reporting reads — while `commissionBps` is
  the live rate every *decision* re-reads. `payout` keeps the arithmetic. The
  platform-admin rate write is ownership-free, on its own `VenueCommissionAdministration`
  port, and **forward-only by construction**: it pins the superseded rate, moves the live
  column, and schedules the new rate from the **current** service date (`Europe/Tirane`),
  so no past service date reprices and no ledger entry is touched (invariant #9). The
  owner's profile PATCH cannot write the rate — a venue does not set its own commission.
- **A commission change schedules from today, never tomorrow.** Today still sells until the
  venue's sales close (invariant #4), so a booking confirmed after the change accrues at the new
  live rate (`commissionBps`, the read behind every accrual); a schedule starting later would leave
  today's takings (`commissionBpsOn`, the read behind the console's per-day split) reporting a rate
  today's new accruals do not carry.
- **The admin commission write does not blur a venue's existence.** Photo moderation answers an
  unknown venue exactly as an empty slot; `PUT /api/admin/venues/{venueId}/commission` answers
  `404 NO_SUCH_VENUE`, because its caller is the platform admin, whose venue list there is complete
  (tourist-hidden venues included), and an admin correcting a rate needs a mistyped or stale id to
  fail loudly.
- **The per-venue sales-close setting** (`sales_close`, invariant #4): a fixed-vocabulary
  wall-clock time (`00:01`/`16:00`/`23:59`, `Europe/Tirane`) naming when a venue's online
  sales for a date close, on the date itself. `SetBookingFacts#setBookingInfo` carries it
  to `booking`'s reserve path (`BookingCutoff#salesCloseAt`). Owner-editable: a required
  field of the profile full-replace PATCH and optional on create (absent → 16:00), spoken
  on the write path as the `venue/domain/SalesClose` enum (the one Java mirror of the
  CHECK, so an off-vocabulary value is a `400` at the edge); the read model and the
  cross-module carriers keep `LocalTime`. The console's "close today's online sales now"
  is the same write — no per-day override. The list and map reads also *project* the
  open/closed verdict for the selected date as `salesOpen` — the on-day close and the season
  closure together — through my `spi` port
  `SalesWindow` (implemented by `booking`) with one request-scoped instant per read; the
  port returns the *verdict*, never a close instant — I store the time and display the
  answer, `booking` keeps the rule. The map read also projects the stored close value
  (`salesClose`, `HH:mm`) as a display-copy key; clients never compare it with a clock.
- **The per-venue maximum stay** (`max_stay_days`, nullable, `venue_max_stay_days_check`
  `>= 1`; design D10): the longest stay the venue takes, in days; `NULL` is any length this
  season, and the platform sets no maximum of its own. Owner-editable through the profile
  full-replace PATCH (`maxStayDays`, absent or null lifts it; `0` is a `400` at the edge, the
  Java twin of the CHECK in `VenueFieldValidation`). `SetBookingInfo#maxStayDays` carries it to
  `booking`'s reserve path, which refuses a longer span (`STAY_TOO_LONG`) before any claim; the
  tourist map view carries it as the calendar's last-day ceiling and the rule the page states.
  Whether a stay fits is `booking`'s verdict; I store the number.
- **The season closure** (`closed_at`, `reopen_on`, `advance_sales`; glossary *Closed for
  season*): owner-asserted on its own state-transition endpoint
  (`PUT`/`DELETE /api/venues/{venueId}/season-closure`, the `CloseForSeason` port), never the
  profile full-replace — a state change rides no version token, and the close answers what guests
  are still owed (`LiveBookingCounts`, through my `spi` `BookingPresence#liveBookingsFrom`;
  `booking` decides which statuses count). A reopen day not after today in `Europe/Tirane` is
  refused (`REOPEN_DATE_PASSED`); the opt-in needs a reopen day (`venue_season_closure_check`,
  mirrored by `venue.vocabulary.SeasonClosure`). I store the facts and hand them out — on
  `SetBookingInfo` to the reserve path and into my catalogue rows — and `booking` keeps the rule:
  whether a closure is still in effect and which dates it admits is `BookingCutoff`'s, reached
  through `SalesWindow#closedForSeason` and the widened `#isOpen`. The list and map project
  `closedForSeason` and `reopensOn` beside `salesOpen`, the list sorts closed venues after open
  ones, and the calendar carries `salesOpen` per day — one projection, never a second flag the
  client ANDs. Reads compare dates; nothing sweeps, and the stored closure stays on the row past
  its reopen day until the operator closes again or reopens. Closing touches no booking, hold,
  request, daily view or walk-in mark; the owner profile carries the stored closure beside the
  read-time verdict.
- **The tourist availability calendar**
  (`GET /api/venues/{venueId}/availability-calendar?from=&to=`; public, window-capped at
  the edge): I own the set total and therefore `free = total − taken` and the gap fill;
  `availability` answers the taken count per day through my `spi`
  (`SetAvailabilityLookup#takenCountsBetween`). It does not reuse the operator-only
  `/availability` segment. The map read takes the same optional `lastDate` and answers each set
  for the stay — `FREE` on every day, `TAKEN` on every day, else `PARTLY_FREE` with its
  `freeDays` and `takenDates` — off `takenDaysBetween`; a stay is bounded by
  `venue.vocabulary.StaySpan#MAX_DAYS` (62, the calendar's window), a technical ceiling, not a
  venue's stay cap, which is that venue's own setting. The counts are a snapshot, never a hold (invariant #2), and the
  read answers past days too — it reports availability, not bookability. Each day also carries
  the `salesOpen` verdict, the same projection as the list and map, display only.
- **The public review list** (`GET /api/venues/{venueId}/reviews?cursor=`; public,
  keyset-paged newest first): I carry it, `review` decides it. My service fences on
  tourist visibility and passes the page `review.api.ListedReviews` answers straight
  through; which reviews are listed, their order and the page size are `review`'s
  contract. The endpoint lives here because the fence is my catalogue rule and `review` is
  a leaf that cannot consult `operator` (ADR-0015).
- **Venue location is mine, and it is optional.** The `latitude`/`longitude` pair on my row is a
  venue's pin on the riviera map, placed by its operator by hand — no geocoder, no address, no
  PostGIS and no spatial index (ADR-0022's epic; invariant #1). Validation is **range-only**
  (−90…90 / −180…180) plus whole-or-absent, enforced by `venue_location_check` (V58) and mirrored
  by `venue.vocabulary.VenueLocation`, whose constructor also normalises both coordinates to the
  six decimals the columns store — so the pin a write echoes is the pin a later read returns. No
  bounding-box geo-fence: an operator may place a venue anywhere, and a wrong pin is their own to
  move. **A null location means "not on the riviera map, still in the list"** — the contract the
  tourist map relies on to omit a venue client-side, which is what lets the feature ship without a
  backfill; it is never an error state and never hides a venue. Location rides the surfaces that
  already exist rather than a resource of its own: the tourist list and map reads carry it under
  their unchanged visibility fence, and the operator profile `PATCH` sets and clears it under the
  profile `version` token, ownership asserted first (invariant #13, `403` on mismatch). Because
  that `PATCH` is a full replace, a body with no location unpins the venue — the same rule the
  amenity set and the distance already follow. A half-present pair or an out-of-range coordinate is
  a `400` at the edge, so the CHECK stays the race-safe backstop rather than the first guard.
- **The signed-in operator's own-venues read model** (`GET /api/venues/mine`): I ask
  `operator::api` for the ownership set and join the names — naming venues is my job and
  `operator → venue` would cycle. It is `MyVenuesController`, not a `VenueAdminController` mapping,
  because it is not venue-scoped: every mapping there takes a path `venueId` whose ownership is
  asserted, whereas this one *is* the ownership question. The literal `/mine` outranks
  `VenueReadController`'s `/{venueId}` in Spring's pattern comparator, so it is never read as an id.
- **The owner's per-set daily availability read**
  (`GET /api/venues/{venueId}/availability?date=`; owner-asserted, 403-before-existence):
  I own the set list and the map composition; `availability` answers the per-`(set, date)`
  state tokens through my `spi` (`SetAvailabilityLookup#statesOn`). The public tourist map
  stays state-agnostic (`FREE`/`PARTLY_FREE`/`TAKEN`) — hold type never reaches the public surface.
- **The owner's beach-map read** (`GET /api/venues/{venueId}/beach-map`; owner-asserted,
  403-before-existence; the layout editor's seed): the map exactly as the tourist read composes
  it — fence included, so a hidden venue reads the same on both — plus a sparse `locks` list, one
  entry per set a live claim pins, nothing for a free set. Each entry carries the earliest
  service day a guest is still coming on and the earliest hold dated today or later, answered
  through my `spi` (`BookingPresence#nearestLiveBookings`, `SetAvailabilityLookup#nearestClaimsFrom`)
  by the same `LiveClaims` predicate the write guards ask. The lock means *cannot move or
  remove*, never *cannot repaint*: the editor still changes a locked set's price, tier and pool,
  refuses to gap or move it with the reason, and disables Move and Remove on it before any
  request; which sets a venue's guests hold never reaches the public map.

**Not My Job:**
- Knowing whether a specific set is free on a date → **`availability`**
- Creating or tracking bookings → **`booking`**
- Collecting money, or knowing an amount was paid → **`payment`** (I set the price)
- The payout math or commission arithmetic → **`payout`** (I store the rate and which
  service dates each rate applied to)
- Deciding *which* venues an operator owns → **`operator`** (I render that answer as named
  summaries; the set is its call)
- Deciding what a venue's rating *is*, or which reviews are listed → **`review`** (I hold
  the resulting numbers and pass the page through)

---

## `availability`
**Job:** Own the single source-of-truth state per `(set, date)` — free / booked-online /
staff-marked. Be the **only writer** of that table. Claim a set atomically so it can never
be double-sold. Answer the read-side facts through `venue::spi` (`SetAvailabilityLookup`):
the state-agnostic taken-set overlay for the public map, the per-set **state tokens**
(`statesOn`) behind the owner's daily read, and the **taken count per day** over a window
(`takenCountsBetween`) behind the tourist calendar — how many are held, never how many
exist — and the **taken days per set** over a window (`takenDaysBetween`) behind the tourist
map for a stay. `venue` composes; I answer state. A remodel move is my ordinary writes inside
`venue`'s commit transaction — every day of the span claimed on the new set before any day is
released on the old, never a swap of my own — so a reserve racing the move loses or wins the row
exactly as it would against any other claim (invariant #2).

**Not My Job:**
- The venue layout, which sets exist, or their positions → **`venue`**
- *Why* a set is taken — which booking, who paid → **`booking`**
- Deciding whether bookings are even open for a date (sales close) → **`booking`** owns
  that rule; I only hold state
- Pricing → **`venue`**; payment → **`payment`**

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
**Job:** Own Stripe collection — PaymentIntents, refunds, and webhook handling. Reconcile
payment state from **signature-verified Stripe webhooks** (never the client). Collection
only. Publish the read side of the refund conversation (`payment.api.RefundStatusLookup`):
`NO_COLLECTION` / `OUTSTANDING` / `ACCEPTED`, answered from this module's own row, with
"no row" meaning the wired gateway never collected, never that a refund failed.

**`CollectionGuarantee` is its own role port, never a `CheckoutPort` method.** Its caller collects
nothing: it asks what `CONFIRMED` attests to in this deployment, a property of the wired gateway
rather than a step of checkout. The answers live beside the gateways they describe, bound to the
same profiles (`ProfiledCollectionGuarantee`), and `PaymentGatewayContractCoverageArchitectureTest`
fails a gateway whose profile has no answer, so a new gateway cannot arrive unclassified. Nor is
it a `PaymentGateway` method: test fakes implement that port (one as a `@FunctionalInterface`), and
a deployment property no caller of `initiate`/`refund` needs would widen it — the wide-port smell.

**One PaymentIntent may collect for several bookings.** A stay is a group of bookings paid
once (design D6/D8), so `payment` holds the intent — id, secret, total, currency, lifecycle
status — and `payment_booking` holds one row per booking it collects for: that booking's
share and its refund state. Every refund read and write is keyed on the booking's row; the
intent's `REFUNDED` / `PARTIALLY_REFUNDED` / `SUCCEEDED` is derived from what its shares hold
refunded, in the same statement as the share write. A verified `succeeded` or `canceled`
publishes its event **once per booking** on the intent, so `booking`'s listeners are
unchanged. `RefundStatusLookup` answers from the booking's own share: a sibling's refund
moves the intent to `PARTIALLY_REFUNDED` while this booking is still `OUTSTANDING`.

**Webhook reconciliation.** Stripe promises neither ordering nor single delivery, and a
transient failure rolls the whole transaction back so the same event returns later. Two
rules keep it faithful:

- **The payment record has a state machine, in the SQL.** `markStatus` is a guarded
  `UPDATE … WHERE status IN (REQUIRES_PAYMENT, FAILED)` — the *open* states (`FAILED` is
  retryable at Stripe; the same set `findPendingCredentials` calls payable). Everything
  else is terminal, so a late `payment_failed` cannot record collected money as failed or
  contradict a `REFUNDED` row. One statement, never read-then-write, so two concurrent
  deliveries cannot both see "open". `PaymentConfirmed`/`PaymentCanceled` are published
  **only when a row actually moved** — a late `canceled` on a collected payment must not
  ask `booking` to release a paid booking's claim (invariant #2); `booking`'s own guarded
  `AWAITING_PAYMENT` transitions are the second layer.
- **A verified event is never consumed unapplied.** For every handled type, a payload
  yielding no identified PaymentIntent or Refund raises `UnreadableWebhookEventException`
  (`503`) instead of answering `200`; the rollback undoes the event-id dedup insert, so
  Stripe re-delivers — otherwise a paid booking could sit in `AWAITING_PAYMENT` forever,
  holding its claim, with the abandoned sweep skipping it by design. Types the handler
  does not act on, and events for intents this app never recorded, stay `200`.
  - The advisory refund types are the one branch that fails **open**: `refund.failed`
    reports only failures, so an unreadable one answers `503`; `refund.updated` /
    `charge.refund.updated` announce every transition for every refund on the account, and
    a retry loop there would get Stripe to disable an endpoint that also carries the
    payment spine — losing an advisory duplicate is the smaller harm.

**Refund execution.** The idempotency key (`booking-<id>-refund`) is a **time-bounded**
defence: Stripe prunes keys after roughly a day, and the vehicles that replay this call
are the slow ones (the restart republish, the admin re-drive). Hence:

- **A refund is never created without first asking the gateway what it already holds.**
  The adapter lists the refunds on the booking's PaymentIntent and **adopts** one —
  records it and reports success — instead of creating a second; a `failed`/`canceled`
  refund returned no money and is not adoptable. The check is not the cheaper read of our
  own `refunded_minor`: that column is written *after* a call returns, so it is silent
  about the lost-response case. The read **fails closed**: an unreadable list is `Failed`,
  never "no refund exists", so the publication stays outstanding and retries.
- **Every refund this platform creates names its booking** in Stripe metadata
  (`bookingRef`, `StripeRefundTag`). On a shared intent that tag is the only thing that
  tells two bookings' refunds apart — their shares are routinely the same price — and it
  is the only copy that survives a lost response, so the adapter reads it back when listing
  and the webhook reads it when a failure names a refund never recorded.
- **Adoption is narrow: exactly one live refund, for exactly the amount requested.**
  On an intent collecting for one booking, every live refund is a candidate (so an untagged
  manual refund of the right amount is still adopted); on a shared intent only the refunds
  tagged with this booking are, and an **untagged live refund is `refund_mismatch`** — it
  could as well be a sibling's, and guessing would strand one guest while refunding the
  other twice. Anything else (several candidates, a different amount — a manual dashboard
  refund) is `Failed("refund_mismatch")` likewise: topping up a shortfall would be a refund
  **decision**, which is `booking`'s. `Failed` keeps the publication outstanding and lights
  `riviera.refunds.failed`, which never clears itself: a human settles it at the gateway.
- **Adoption is visible** — `riviera.refunds.adopted`: an earlier attempt moved the money
  and lost the response.
- The refund create **replays once on a connection timeout** with the same key (one shared
  helper with the PaymentIntent path).
- **A refund the gateway later reports as dead is un-recorded.** A `pending` refund stays
  adoptable (it is where a refund normally starts), so the fix acts on the gateway's later
  word: a signature-verified refund-lifecycle event, branched on the **refund's status**,
  clears the booking's `refunded_minor` and re-derives the intent's status (`SUCCEEDED`
  when no share is left refunded). All three event types are handled,
  because `canceled` has no failure-only event. `RefundStatusLookup` then answers
  `OUTSTANDING` again, `riviera.refunds.failed` lights, and the existence read sees a
  dead refund rather than adopting it.
- **The un-record hands nobody a lever, deliberately.** The cancellation's publication
  completed when the refund was accepted, so the re-drive cannot reach it; a fresh attempt
  inside the key window replays the dead refund, which the adapter detects and refuses
  (`refund_key_replay`). Recovery is a human issuing the refund at the gateway, or a
  re-attempt once the key has expired — an issuer rejection is not a transient error. The
  un-record is guarded on the recorded `refund_id`: a re-delivery, a failure naming a
  refund we never issued, or a stale failure after a successful retry moves nothing.
- **At-most-once is the port's contract, enforced — per booking.** `PaymentGatewayRefundContract`
  states it once against `PaymentGateway` on a fixture that never dedupes on the key, plus
  the opposite guard (a refund that returned nothing must **not** be adopted) and the
  shared-intent case (two bookings of the same share on one collection are two refunds,
  each replayable to its own). A coverage
  rule makes it unskippable: every production `PaymentGateway` is either covered by a
  contract subclass or non-collecting (read from the `@Profile` that binds a gateway to
  its `CollectionGuarantee`), so a new gateway adapter (ADR-0009) arrives unclassified and
  fails the build.
- **The refund attempt is recorded before the gateway is asked** (`markRefundAttempted`),
  and every refund write is a guarded statement that reports whether it moved:
  - A verified failure arriving **before the refund id is written** (the create's timeout
    replay leaves tens of seconds between Stripe minting the refund and the row write) is
    matched by **booking** instead of by an id that does not exist yet: the booking the
    refund's tag names, or, for an untagged refund, the only booking its PaymentIntent
    collects for. An untagged failure on a shared intent is nobody's to pin on a guest and
    moves nothing.
  - The attempt is the **discriminator** that makes by-booking matching safe: a refund
    issued by hand at the gateway is money the platform never promised, and with no
    attempt on record the by-booking arm moves nothing.
  - The recorded death **blocks the record that lost the race**: `markRefunded` refuses a
    refund id already reported dead (`Failed("refund_died_before_record")`), so the
    publication stays outstanding and a re-drive past the key window creates a fresh
    refund. A refund recorded and *then* dead is unchanged.
  - One incident may increment `riviera.refunds.failed` **twice** (the webhook counts the
    refund it killed, the recording call counts its refusal); the debt gauge still reads
    one booking. The counter measures observations, `riviera.refunds.owed` measures debts.
  - **`markRefunded` moves only a collected payment.** Unguarded, it and
    `markRefundFailed` could fabricate a collected payment out of a
    `REQUIRES_PAYMENT`/`FAILED`/`CANCELED` row. The guard is what makes the derived
    `SUCCEEDED` restore sound by construction.
  - **An owed refund is enumerable.** The dead id moves to `failed_refund_id`, `refund_id`
    stops claiming a live refund, and `refund_failed_at` marks the debt over a **partial
    index** that is empty in the healthy case — the list the runbook's remedy needs.
    `riviera.refunds.owed` gauges **distinct refunds owed** (`riviera.refunds.failed`
    re-increments on every resubmission of the same stuck refund).
  - The attempt stamp is written from `RefundService#refund`, which must stay **outside a
    caller's transaction** (`RefundAttemptVisibilityIT` reads it back on a second
    connection; `RefundBulkheadIT` pins the listener's absence of a transaction). It
    records an *unresolved obligation at the gateway*; every in-app resolution clears it
    (the recording write on success, both failure marks). It deliberately **survives a
    `Failed` return**: `RefundResult.Failed` carries an untyped reason, so the service
    cannot tell a gateway-confirmed "nothing of ours is live" from a double timeout that
    may have left a live refund at Stripe with no id on record.
  - Bounded residual: a booking settled **by hand at the gateway** never runs an in-app
    resolution, so its stamp stands. Clear it when settling by hand — the observability
    runbook's owed-refund section says so.

**Not My Job:**
- Deciding *whether* to refund or *how much* → **`booking`**; I execute the refund it
  decided. When the gateway already holds a refund for a *different* amount, I record what
  Stripe holds and warn — paying the difference would be a refund decision
- The booking lifecycle → **`booking`**
- The payout ledger or commission → **`payout`**
- Paying venues out / Stripe Connect → nobody uses Connect; **`payout`** records what is
  owed and payout is settled manually via BKT
- Setting or knowing the price → **`venue`** (I charge the amount I'm handed)
- Storing card numbers → **Stripe** (I hold PaymentIntent ids, not PANs)

---

## `payout`
**Job:** Own the venue payout ledger (Σ booking amounts − commission − fees) and the manual
BKT batch reporting. Accrue **idempotently** — a booking contributes exactly once; a refund
reverses it. The promise is **order-independent**: a refunded cancellation that finds no
`ACCRUAL` to mirror *defers* (the listener throws, so its publication stays outstanding
and `riviera.outbox.pending` shows it) rather than treating the absence as "nothing to
reverse".

**Direction lives in the entry type, never in the amount.** Every amount is stored as a
non-negative magnitude (`payout_amounts_check`), so a payout reads
`Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net`: only an `ACCRUAL` adds, and a type added later
deducts by default rather than silently paying the venue for it. Every ledger sum in the tree —
the period sum behind the BKT batch, the per-venue ledger fold, the console statement's
display-only totals and the admin venue-caused report — is written that way and pinned by a
test carrying a `FEE` row. A **`FEE`** is charged when a refund the venue's own change caused is
reversed (`reason == VENUE_CHANGE`, which covers both the remodel refunding a booking it could
not move and a moved guest taking the free exit that move earned them); it has no gross and no
commission, so it is the one entry type `payout_net_check` exempts. The amount is flat and
platform-wide, and it reaches the remodel preview through `booking.spi.VenueChangeFeeRate` — an
inversion, because a `booking → payout` call would cycle. A release or a decline collected nothing,
so nothing is reversed and nothing is charged. Rationale and rejected alternatives: ADR-0021.

**I own the platform's own settings, and today there is exactly one.** `platform_setting` holds the
venue-change fee, and I am its sole writer: I own the ledger the fee is posted to, so I decide the
amount. Both readers — the cancelled-booking listener and the `booking.spi` rate the remodel preview
quotes — go through `VenueChangeFeeSetting#current()` **per call**, never a held bean, so an admin's
change applies to every fee charged after it. `riviera.payout.venue-change-fee-minor` stays the seed
the row is created with and the fallback a missing row falls back to; it is not a second source of
truth. The admin read and write live at `/api/admin/venue-change-fee`, role-gated, and audited by
the edge fence like every other mutating admin action.

**A change is forward-only in effect, and one window is accepted rather than closed.** Posted `FEE`
rows are never repriced — the ledger is append-only and nothing in the settings path touches it. But
the charge is asynchronous, so a change landing between a remodel commit and its `BookingCancelled`
draining charges an amount the commit receipt did not quote. An effective-dated schedule cannot close
that on its own: `BookingCancelled` carries no instant to resolve a rate against, so the listener
would still read "as of now". Closing it would mean widening a registry-persisted event payload, which
the fee does not justify. Accepted and documented: ADR-0021 §7 and its amendment.

**The console's daily takings approximate the ledger, by construction.** `DailyTakingsService`
splits a service date's gross at the one rate `venue` scheduled for that date
(`VenueRates#commissionBpsOn`), while each ledger entry fixed its commission per booking, at
accrual, from the live rate. The two agree closely but not exactly; what the read guarantees is
that a past date's figure never changes (invariant #9). A rate change schedules from the current
service date (§`venue`), so today's figure follows the live rate today's new accruals apply.

**The BKT batch endpoints are `ADMIN`-only because nothing on them belongs to one venue.** The `GET`
reports every venue's gross, commission and net for the period and the `PATCH` addresses a batch by
id, so there is no venue to assert ownership of: invariant #13 exempts `/api/admin/**`, as an admin
does not own a payout run. That exemption is exactly why the role must be the strict one: under
`OPERATOR`, any approved operator in this multi-tenant marketplace could read competitors' payout
figures and mark their batches settled.

**The venue-caused refunds report maintains itself, and is `ADMIN`-only.** It is read from the
ledger rows the refund path always writes (the `VENUE_CHANGE` reversals and their `FEE`s), so
resale abuse is visible without anyone keeping a list. It belongs to no venue, so invariant #13
has nothing to check; the strict role in `SecurityConfig` is the whole authorization, and it is what
keeps one operator from reading a competitor's refund record.

**Not My Job:**
- Actually moving money to venues → settled **manually via BKT**; I record what is owed
- Collecting money from tourists → **`payment`**
- Setting the commission rate, or recording which dates a past rate applied to →
  **`venue`** (I apply the rate it stores; the console daily-takings read asks it for the
  rate that applied on the *service date*; the accrual reads the live rate at accrual
  time, which fixes each ledger entry permanently)
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
**Job:** Own everything about a tourist's verdict on a delivered stay — the review record
(stars, comment and display name; one per booking), who may leave one, change one or
remove one and until when, and the arithmetic that turns a venue's reviews into a score.
The standing rules:

- **I am a leaf** (ADR-0015): `allowedDependencies = { "shared" }`. The two facts I need
  arrive by **inversion** — `review.spi.CompletedStays` (implemented by `booking`) tells me
  a stay was checked in and when, and `review.events.ReviewsChanged` carries "your
  aggregate moved" outward for `venue`. Calling `booking::api` or listening to a booking
  event would close the cycle `venue → review → booking → venue`. Eligibility is therefore
  a **pull** at view/submit time.
- **I publish my own typed ids** (`VenueRef`, `BookingRef`) rather than borrowing
  `venue`'s or `booking`'s, which keeps the grant list at `shared` alone.
- **One review per booking is the database's answer.** `UNIQUE (booking_id)` plus an
  atomic `INSERT … ON CONFLICT DO NOTHING` whose row count *is* the outcome (the
  invariant-#2 discipline). A lost race is ordinary flow (`AlreadyReviewed`). Edit and
  delete address the row by `booking_id` and report rows-affected, so an edit racing a
  delete resolves as `NoSuchReview`. A delete frees the slot, so a stay whose window is
  still open becomes reviewable again.
- **The fence order is stated once, as domain policy.** `domain/ReviewGate` is a pure
  function — unknown stay, never checked in, hidden, window closed, already rated,
  eligible — and both the lifecycle service and the panel read consult it.
- **The mean is integer and its rounding is written down where the division happens**
  (`AggregateRating`): `(10 × Σstars + count / 2) / count`, half-up, zero reviews
  short-circuiting to `0/0`. No `double` anywhere; the mean is taken in the domain, not SQL.
- **My four `api` ports are split by consumer role:** `VenueRatingSummary` (`venue`'s
  aggregate), `ListedReviews` (`venue`'s public page), `ReviewEligibility` (`booking`'s
  question about one stay, answered as the sealed `ReviewPanel`, which splits a *frozen*
  review from a window nobody wrote in), and `ReviewTombstones` (`booking`'s one command).
  The lifecycle (submit, edit, delete) is one **internal** `application` port,
  `ReviewLifecycle`, whose only caller is my own REST adapter.
- **A review tombstone is erasure's mark, and it keeps the star** (ADR-0010).
  `ReviewTombstones.tombstone(bookings)` is one conditional `UPDATE` by `booking_id` —
  `display_name` and `comment` to `NULL`, nothing else — whose rows-affected count is the
  answer. A scrub, never a delete: the slot stays taken and `stars` / `hidden_at` / the
  timestamps stay put, so the aggregate is unchanged and **no `ReviewsChanged` is
  announced**. A tombstoned review leaves the public list on the star-only rule and keeps
  counting; the admin list and the author's read-back see it nameless (the frontend's
  "A guest" fallback). It is not frozen for its author: the booking code stays the
  authorization and the window the window.
- **The star stays because it is not the subject's to take back.** Stripped of its display name
  and comment a review identifies nobody, and the score it gave is the venue's, earned by a
  delivered stay; erasure (`customer.spi.ReviewErasure`) blanks the texts and leaves the aggregate
  standing.
- **A takedown is a reversible soft flag, and it is mine.** `review.hidden_at` (`NULL` =
  visible) is the moderation state ADR-0013 needs; the platform admin's `ReviewModeration`
  port — internal, its only caller my own `AdminReviewController` under `/api/admin/**` —
  hides and un-hides by review id and lists every review of a venue, hidden and star-only
  rows included, on the same `ReviewCursor` keyset page. Both verbs are one conditional
  `UPDATE … RETURNING venue_id`; a repeat is `AlreadyApplied` and publishes nothing, a real
  flip publishes `ReviewsChanged`. The port is ownership-free (invariant #13's admin
  exemption; the role gate in `SecurityConfig`, the audit row in `AdminAuditFilter`) and
  must reach venues the public list refuses — a suspended owner's.
- **The visibility predicate lives in exactly two statements**, `totalsFor` and
  `newestListedBefore` in `JdbcReviews` (`hidden_at IS NULL`): the aggregate and the public
  list. The author's read-back (`findFor`) and the admin list see a hidden row on purpose.
- **A hidden review is frozen for its author.** `ReviewGate` answers `HIDDEN` *before* the
  window; the panel is `ReviewPanel.Hidden(review)`; edit, delete and resubmit are refused
  (`409 REVIEW_HIDDEN`; the slot stays taken — a delete would free the slot and a resubmit
  would claim a fresh visible row). Un-hide hands the author their window rights back.
- **A listed review is a visible review that carries a comment**, and the list is a keyset
  page: newest first by review id, ten per page (the port's contract), `ReviewCursor`
  naming "older than this review" and `ReviewCursor.FIRST_PAGE` no bound. A star-only
  review counts in the aggregate and never appears as an empty row. The stay is recorded as
  `stay_date` (carried in through `CompletedStay` at claim time) and leaves the store as a
  `YearMonth`: no published type carries the day. Who may *see* the list is the caller's
  fence, never mine.
- **The booking code is the whole authorization** (invariant #7). All three verbs on
  `/api/bookings/{code}/review` are `permitAll` and share one per-code rate-limit budget
  with the view / cancel / withdraw legs. The code is never logged and never reaches an
  error body: `instance` is pinned to the constant `/api/bookings`.
- **My endpoints sit under `/api/bookings/{code}`, not a review path of their own.** The
  resource is the guest's booking — its code is the credential (invariant #7) — while the use
  case is mine, so `ReviewController` joins the code-gated family without touching
  `BookingController`.
- **An over-long review text is refused, never truncated.** `SubmitReviewRequest` strips both
  texts, then holds them to `ReviewText`'s bounds (comment 1000, display name 60, in code points)
  and answers `400 INVALID_REQUEST` over either; V46's CHECKs are backstops. Silently storing
  half a sentence is worse than saying no.

**Not My Job:**
- Writing `venue.rating_tenths` / `reviews_count` → **`venue`** (I compute and announce)
- Deciding a stay was delivered, or owning `completed_at` → **`booking`**
- Displaying a rating, ordering Discover by it, or the "New" treatment → **`venue`** and
  the frontend
- The guest's identity → **`customer`**. A review is attached to a *booking*, not a
  person; the display name is a label the author chose, handed to me on the write; the
  form's prefill suggestion is `booking`'s to derive
- Login, sessions, CSRF, rate-limit wiring and the ADMIN role gate → the platform **edge**;
  the admin audit *record* of a takedown → the **`audit`** module, which the edge's fence calls
- Deciding *whether* a review deserves a takedown → the **platform admin** (publish-first,
  report-and-remove; I offer no queue and no reporting)
- Deciding *that* a data subject's reviews are erased, or which bookings are theirs →
  **`customer`** and **`booking`**; I am handed booking refs and blank my own rows

## `shared` (not a bounded context)

The **Shared Kernel** (Evans, DDD ch. 14): `ApiProblem`, `CurrentOperator`,
`CurrentCustomer`, `InvalidApiRequestException`, `ObservabilityMetrics`, `ShutdownBudget`,
`MdcTaskDecorator`, `ResubmissionThrottle` + `ResubmissionOutcome`. An
`@ApplicationModule(type = OPEN)`: technical shared code, so it publishes no
`api`/`vocabulary` surface and consumers use its types directly. The name is used for Evans'
*discipline* (keep it small, change it only by consultation), not his definition — his kernel is a
subset of the domain model; this one holds edge types (ADR-0017).

**Job:** hold the handful of edge types the domain modules legitimately share, each
admitted on **ownership, never reuse** — the type lives here because no module
can own it, not because several use it:

- the RFC-7807 error-contract factory (`ApiProblem`) and the **typed edge-validation
  signal** (`InvalidApiRequestException`, the one exception the advice maps to
  `400 INVALID_REQUEST`): the exception→status contract belongs to the composition-root
  advice no module may depend on, while module adapters are its throwers;
- the accessors that resolve an authenticated principal to a typed id;
- the **platform's metric names** (`ObservabilityMetrics`): a name is a `String` constant,
  compile-time-inlined, and the emission stays in the module that owns the thing measured
  (`payment` emits `REFUNDS_FAILED`, `booking` `REFUNDS_SHED` and
  `REMODEL_RELEASE_COLLECTED`, `notification` the mail
  counters, with their `kind`/`reason` tag values). Admitted for **consistency of the
  naming convention**, a narrower ground than the other entries — hold new metric-name
  entries to it;
- the **platform's shutdown budget** (`ShutdownBudget`): the SIGTERM grace and every
  draining pool's claim on it, summed by `ShutdownDrainArchitectureTest`, which
  **discovers** draining pools from bytecode rather than the context (the context would
  miss `defaultCandidate = false` bulkheads and the non-bean recovery pool);
- the **one way a pooled worker inherits its submitter's logging context**
  (`MdcTaskDecorator`) — its other half, `CorrelationIdFilter`, lives at the composition
  root, so a module-owned home is structurally unavailable;
- the **once-only guard behind an admin outbox-resubmit lever** (`ResubmissionThrottle` +
  `ResubmissionOutcome`): single-flight plus a construction-seeded cooldown, so a press
  cannot race the registry's boot republication; each lever module keeps its own scope,
  window value and log noun.

Nothing else. Three modules wanting a type is the trigger for asking the question; the
answer is always ownership.

**Not my job:**
- **Any business logic or module-owned state** → the module that owns it. This package
  is not a home for "code used in more than one place"; a shared kernel earns its keep
  only while it stays tiny and stable, because a change here ripples through every module.
- **Depending on a module that depends back** → it may reach only `customer::api` and
  `operator::api`, the two modules that do not depend on it.
- **Being the composition root** → that stays the root package (`PlatformApplication`,
  `SecurityConfig`, the controllers). The root *depends on* modules while `shared` is
  *depended on by* them; putting both in one package is what closed
  `booking → root → booking`.

## `challenge` (not a bounded context)

The **proof-of-work challenge** mechanism (ADR-0016, ADR-0017): a closed non-context module with the
full template minus `domain/` and no dependencies — Evans' *Cohesive Mechanism*, a separate
lightweight framework behind an intention-revealing interface.

**Job:** issue signed ALTCHA v2 challenges, verify a widget's solution, accept each solution exactly
once via the `challenge_registry` claim (`INSERT … ON CONFLICT DO NOTHING`), sweep expired rows,
expose the challenge endpoint.

**Not my job:** deciding which routes are fenced, the filter and its ordering, the problem bodies —
the root's edge (§ *Platform edge*); rate limiting (`RateLimitFilter`, root).

Only writer of `challenge_registry` (machine-checked). Publishes `api.ProofOfWorkChallenges` and
`vocabulary.ChallengeVerdict`, nothing else.

## `audit` (not a bounded context)

The **admin audit trail** (ADR-0013, ADR-0017): a closed non-context module with the thin template
plus a driving adapter, and no dependencies — Evans' *Cohesive Mechanism*, a separate lightweight
framework behind an intention-revealing interface. The audited namespace's controllers are spread
across modules and the root, so no one module can own the record over the whole namespace.

**Job:** append one row per mutating `/api/admin/**` action that reached past the security gate —
actor (a username snapshot, deliberately no FK), method, path, outcome status, UTC instant, and the
grounds the caller hands me; serve the newest-first read the console's Audit tab renders. Append-only:
no updates, no deletes.

**The trail records what a principal did past the gate, never who knocked.** The fence sits after
`AuthorizationFilter`, so an anonymous `401`, a CSRF `403` and a wrong-role `403` are refused
upstream and leave no row. An application-level `4xx` does leave one, because a failed destructive
attempt is signal; an exception unwinding past the handler advice is recorded as the `500` it
becomes.

**Not my job:** which requests are audited and when in the chain, the `X-Audit-Reason` header and its
sanitizer, the ADMIN role gate — all the root's fence (§ *Platform edge*); deciding *whether* an admin
action was justified, and retention (a named non-goal — I keep rows indefinitely).

Only writer (and reader) of `admin_audit_record` (machine-checked). Publishes `api.AdminAuditLog` and
`vocabulary.AdminAuditEntry`, nothing else; the root reaches `api` alone, because the fence appends
primitives.

**I know no domain type and depend on nothing, not even `shared`** (`allowedDependencies = {}`): a
mechanism that knew a domain type would be a domain module in disguise.

**A lost row never fails the action it records** (logged at ERROR instead) — the accepted Phase-1
risk behind the fence's broad `catch`: the append happens *after* the action, so it cannot un-do
what it failed to record, and since the audited actions are themselves writes on this database, an
audit-lost-while-action-succeeded window needs a mid-request DB failure.

## Platform edge (settled)

The cross-module edge rules, restated here in one place because no single module owns them
(the per-module consequences sit in §`customer` and §`operator`): server-side sessions (Spring
Session JDBC) with **two principal types**; all login/session machinery lives at the edge,
never in modules; abuse and accountability machinery split the same way — the **fence** (filter,
route policy, filter-chain problem bodies) is the edge's, a **mechanism** the edge calls through a
port (a table, a job, a library) is a non-context module (ADR-0017), which is why
`ChallengeVerificationFilter` and `AdminAuditFilter` stay here while `challenge` and `audit` own
what they call; customer-account identity is separate from the guest row — no FK, no
back-linking of past guest bookings, ever; auth endpoints are non-enumerating + constant-time
on their own rate-limit buckets; mocked externals (SSO IdPs, mailer) are profile-guarded out
of prod; session revocation is edge-orchestrated and synchronous, bracketing the state change.

**Password policy (D-8)** — one edge rule (`PasswordPolicy`, root package) for every surface that
accepts a new password (register on both sides, reset, set, both self-service changes), enforced
before any write and inside the timing-equalized register branch: 12 characters to 72 bytes (bcrypt's
input cap), leading/trailing spaces significant, no composition rules → `400 INVALID_REQUEST`
otherwise; a password containing the account's email local part (tourist), the operator username, or
`riviera` — case-insensitively — → `400 PASSWORD_CONTAINS_BLOCKED_TERM`, a distinct code so the client
can name the rule. An account name under 3 characters is not applied as a blocked term. The floor
applies where a password is *chosen*, never at sign-in. The bootstrap credential
(`RIVIERA_OPERATOR_PASSWORD`) is held to the same length rule at boot: a value outside it is not stamped
and is logged at WARN without the value, the same outcome as an empty one. Modules receive an
already-encoded hash and never see the rule.

**Proof-of-work challenge (ADR-0016)** — the public writes that cost money or inventory are fenced by a
self-hosted ALTCHA v2 challenge, the **fence** at the edge and the **mechanism** in the non-context
module `challenge` (ADR-0017): the module's `ChallengeController` (`GET /api/auth/challenge`,
`permitAll`, its own per-IP rate-limit budget, `no-store`, no session — the only cookie on it is the SPA's platform-wide `XSRF-TOKEN` bootstrap) issues a challenge signed with the
`RIVIERA_ALTCHA_HMAC_SECRET` secret and expiring `riviera.altcha.expiry` (10 minutes) after the injected
clock; `ChallengeVerificationFilter`, registered after `RateLimitFilter` and `CsrfFilter`, requires the
widget's solution in the `X-Altcha-Payload` header on each fenced `POST` — the four routes
`/api/auth/customer/register`, `/api/auth/operator/register`, `/api/auth/customer/forgot-password`
and `/api/bookings` — and refuses with `400` and a
stable code — `CHALLENGE_REQUIRED` (absent), `CHALLENGE_INVALID` (unparseable, forged, wrong answer),
`CHALLENGE_EXPIRED` (past expiry, or already accepted once). Deliberately `400`, never `403`: the rate
limiter refunds a `403` on the budgets that guard authenticated work, and a refused solution must still
have cost its token. The module's `ProofOfWorkChallenges` port wraps the official `org.altcha:altcha`
library (the expiry check is the library's, by the server clock; the client clock never enters); a
verified solution is accepted only if `INSERT … ON CONFLICT DO NOTHING` claims its nonce in the
module's `challenge_registry` (V49) — the one place this departs from the rate limiter's in-memory
precedent, because a restart or a second instance must not reopen a replay window. The module's
`ChallengeRegistrySweep` deletes rows whose expiry lies more than `riviera.altcha.clock-skew` in the
past, which is where instance clock skew is absorbed.
`riviera.altcha.enabled=false` is the kill switch: the fenced routes admit header-less requests and the
endpoint answers `204`, which the SPA reads to hide the widget. `riviera.altcha.cost` (5000) is a
measured default — Chromium under mobile emulation in the slice's prototype, scaled by per-core
throughput to an estimated 1–2 s on a mid-range phone; a real-device check is the pre-launch item. What
it is not: no ALTCHA hosted service is ever called, no domain module knows the challenge
exists — the root reaches only `challenge::api` and `::vocabulary` — and login is not fenced (the
per-identity throttle covers it), nor are the token-redemption routes (a reset or verification token
is already a bearer credential). Fencing forgot-password does not weaken its non-enumerating answer
(D-8): the filter runs ahead of the controller, so a refusal is decided before the account lookup and
is byte-identical whichever account state the address is in, with no mail sent either way. That `400`
is also outside the recovery budget's access-denied refund, so a refused submission still costs its
rate-limit token. Booking create is fenced for **every** caller, guest or signed-in customer — the
verifier has no auth-state branch, because a script holding a venue's online pool for the pay window
costs the same either way; running ahead of the controller is also what keeps invariant #2 untouched
there, since a refusal returns from the filter and no availability claim, booking row or
PaymentIntent is ever attempted. The SPA hosts the widget on the checkout's **Review** step rather
than its Details step: on Details it took the dialog past its above-the-fold budget at a 700 px
laptop viewport, and on Review the solve still starts a step early, because advancing focuses the
primary button inside the widget's form and the widget starts solving when its form already holds
focus.

**The fence runs after `RateLimitFilter` and `CsrfFilter`, and claims last.** The cheap checks go
first, so a `429` wins when a request would fail both and a refused solution has already spent its
rate-limit token; the registry claim, the fence's one write, is the last step before the controller.

**Remodel orchestration (ADR-0020)** — the one domain composition the root holds. A layout remodel
needs `venue` (what a save removes or renumbers, and the staff holds on it) and `booking` (what each
live booking on those sets becomes) in one answer, and `venue` may not depend on `booking` (the
cycle through `venue.spi.BookingPresence`), so `RemodelPreviewController`
(`POST /api/venues/{venueId}/beach-map/preview`, operator-gated) composes `venue.api.BeachMapRemodel`
with `booking.api.RemodelClaims` and assembles the five wire groups — move, refund, release/decline,
staff hold, block — plus `keep`, the blocking and held sets by id, and `previewToken`, the digest of
the picture the operator saw. `RemodelCommitController` (`POST /api/venues/{venueId}/beach-map/commit`,
operator-gated; the save body, `previewToken` and the operator's `refundCount`/`refundReason`)
composes the same two ports the other way round: `RemodelCommitService` is the `venue.api.RemodelGate`
`BeachMapRemodel#commit` calls between its locks and its probe, and inside it `RemodelClaims#commit`
settles every claim and the gate answers `venue` the kept claims' sets — so the layout write, the
moves, the availability rows, the status transitions and the receipt commit or roll back as one, and
nothing that talks to Stripe is inside. Its answers:
`200` with the receipt (id, committed-at, the moves, the refunds, the releases and declines, the kept
claims with their reason, the refund reason and the total returned); `409 STALE_PREVIEW`,
`409 REMODEL_REFUSED` (the layout gives a kept set's row and position to another set) or `409
REFUND_NOT_CONFIRMED` — the last also naming the count owed — each carrying the fresh picture and its
token in a `preview` extension, so the operator re-decides on what is true now; the save's own
`SETS_IN_USE`, `STALE_WRITE` and shape rejections. `CompositionRootDisciplineTests` grants the root exactly those two modules'
`api` + `vocabulary`, nothing else of the spine. The edge resolves the principal and maps outcomes;
**each module port asserts venue ownership itself** (invariant #13), and every rule — the diff, the
zone, the candidate, the status split, the token, the free exit — stays in its module: a rule growing
at the root is the signal it belongs in one. The receipts read is `booking`'s own adapter.

**Riviera map resources (ADR-0022)** — the geographic discovery map (the **riviera map**, as distinct
from a venue's **beach map**) is drawn in the browser by MapLibre GL from four resources the platform
hosts itself: the style, the PMTiles tile archive, the glyph ranges and the sprites, all served
anonymously under `/map/**` by the root's `MapResourcesConfig` — an app-wide static-resource concern
like the SPA shell, owned by no module. They live in a directory next to the jar (`riviera.map.dir`,
`platform/map/` in the repo, `/app/map/` on the image), never on the classpath: the archive is read by
HTTP `Range` and a deflated jar entry cannot seek, so a classpath copy would inflate up to the offset
on every tile request. Every URL the style names is a `/map/…` path; no third-party map host, tile
CDN, glyph host or geocoder is ever contacted from a tourist's browser — the DSGVO property the ADR
records — and the shipped style is held to it by `MapStyleSelfHostedTest`, the real-engine e2e
network guard being its second lock. The archive is a build-time artifact of
`scripts/build-riviera-map.sh` from an OSM-derived source; regeneration is the runbook
`docs/runbooks/riviera-map-tiles.md`, not automation. It is committed, not fetched at build, under
the size trigger ADR-0022 decision 7 sets for revisiting that storage, held by `MapArchiveBudgetTest`.
The **map posters** — the stills the venue sheet opens on — are rendered from the same directory by
`frontend/scripts/render-map-posters.mjs` and shipped as SPA static assets under `/posters/**`, so a
phone's first paint makes no `/map/**` request; they are regenerated with the extract by the same
runbook, and `map-poster-set.spec.ts` holds the set complete under its budget.

**A password reset revokes the account's sessions before and after its write.** The two cannot be
atomic: the password write is `customer`'s transaction, the session deletes are Spring Session's.
Revoking only after would let a transient revoke failure answer `500` with the token already spent:
the emailed link then reads "invalid or expired" and the attacker's session stays alive. So the edge
names the account first through `CustomerAccountRecovery#emailForResetToken`, which consumes
nothing, and revokes; revoking again after the write closes the window in which the old password
still signs in. The bcrypt encode runs above the first revoke, or its ~80 ms would dominate that
window.

**The money-path alert check shares the sweeps' single-instance posture.** `MoneyPathAlertCheck` is
a lockless `@Scheduled` job, so a second instance would run its own copy and the outbox-backlog
alert, read from the shared database, would fire once per instance. It takes ShedLock (or an
equivalent) with the sweeps when the platform scales out: `docs/deploy/production-hardening.md`'s
scale-out preconditions name only the two lockless sweeps (`AbandonedBookingScheduler`,
`RequestSweepScheduler`), so this job joins that list then.

**The bootstrap credential is stamped by an edge runner, and only that one.**
`OperatorCredentialInitializer` is an `ApplicationRunner` at the edge, not domain logic: it runs
only in the full application context (a `@WebMvcTest` slice does not component-scan it) and touches
only the bootstrap admin. Every other operator self-registers through
`operator.api.OperatorRegistration` (`PENDING` until an admin approves) and changes its own password
through `OperatorProvisioning#setPassword`; none is provisioned here.

## Frontend (the SPA, not a module)

The Angular SPA's standing rules and their reasons, for the choices whose TSDoc points here. Folder
and import structure stay with the `riviera-frontend` skill and styling with `riviera-tailwind`;
this section holds only the reasons a later edit could otherwise undo.

- **Tourist menus stay above every Discover layer.** Discover's riviera map paints to every edge
  and the route withholds the footer, so the menus' Privacy and Terms rows
  (`shared/legal-menu-rows.ts`) are the only way to those pages there. The phone sheet is `z-40`;
  the header's popovers sit in its `z-20` stacking context, above `desk-frame`'s `z-[1]`. Under a
  covering layer a control reads as visible, enabled and stable while every click on it times out.
  Page modals outrank the menu on purpose — the coast picker's backdrop is `z-[30]`, a booking
  dialog `z-60` — because a modal is dismissed before the chrome is used.
- **The legal rows open a new tab, so they neither close their menu nor take `routerLinkActive`.**
  Routing away from `booking/pay` would unmount a mounted Payment Element. A `target="_blank"` link
  never navigates the opener, so there is no focus to move and the menu is where the guest left it
  on return; and a document read in another tab is not this tab's current page, the position
  `shared/legal-footer.ts` and `booking/legal-consent.ts` take on the same two routes.
- **Venue photo tiles letterbox, never crop.** A tall portrait cover stays whole in the lightbox and
  the single-photo band, so a cropped gallery tile (`shared/photo-gallery-grid.ts`) would disagree
  with both. Behind the `object-contain` photo sits a blurred, scaled copy of it as a plain CSS
  background, so the letterbox bars take the photo's own edge colour; the photo gradient under both
  stays the pre-paint and no-photo fallback.
- **The gallery lead takes the 1100px breakout, and its `sizes` follow the painted photo.** From
  1280px it spans the same 1100px breakout as the venue header and the beach map, never the page's
  780px shell, and only once a venue has two photos or more. Because the tiles letterbox, `sizes`
  come from `CONTAIN_SIZES`. The side tiles are lazy, so Chromium resolves their `auto` prefix
  against the tile box and the authored value reaches only engines without `auto`; the eager hero's
  reaches every engine.
- **Sign-out clears local state whether or not the server confirms.** A UI stuck signed in is worse
  than a stale cookie, so `SessionAuth#signOut` always drops the principal and reports whether the
  server session is provably gone. An unconfirmed one records a `SignOutNotice` the shell shows,
  because on a shared device the next visitor would otherwise be silently restored into it.
- **A write fired on page load awaits `whenReady()` first.** `.spa()` issues the `XSRF-TOKEN`
  cookie on the first API response, which on a cold browser is the startup `GET /api/auth/me`. The
  verify-email landing posts its token on load; without the wait it races that restore to a `403`
  and shows a valid token as invalid.
- **The XSRF echo is hand-rolled** (`core/api-session.interceptor.ts`). Angular's
  `withXsrfConfiguration` skips absolute URLs, and dev's `apiBaseUrl` is the absolute
  `http://localhost:8080`: the `:4200` dev server calls the backend cross-origin, through the `dev`
  profile's CORS allowlist and no proxy. `document.cookie` still yields `XSRF-TOKEN` there, because
  a cookie is scoped to its host, never its port, and `:4200` and `:8080` are one site to
  `SameSite=Lax`. Deployed, the backend serves the SPA same-origin (ADR-0004), so the cookie is
  first-party outright.
- **The desktop panel's venue row is flat.** No card edge and no shadow: page, panel and card as
  three nested rounded surfaces read as a template (`pages/home/venue-row.ts`).
- **The selected row names the booking mode only when it is the exception.** `Request to Book` is
  the fact a tourist needs and `Instant Book` on most rows is noise; if most venues ever
  become request-mode the rule inverts, because what gets named is the exception, never one value.
- **`operator/remodel-preview-panel.ts` is a sibling of `shared/confirm-panel.ts`, not a variant.**
  It owns lists (five groups of claims and the sets that stay on the map) and its refund fields,
  where the confirm panel is a warning, a toned button and Cancel with no projected content. Both
  wear the same amber warn skin.
- **The withheld-email notice is one component, in `booking/`.** Both surfaces that show it
  (`booking-confirmation`, `booking-pay`'s done panel) are booking's, and `riviera-frontend`
  promotes to `shared/` only when two features need a thing. It is one component, never the same
  markup twice, because the copy is the product decision: two copies drift, one surface quietly
  promising a mail that was never sent, while both duplicated tests stay green.
- **The coast picker's ribbon is a picture.** It is `aria-hidden` and takes no pointer; the coast
  index beside it is the accessible structure (`pages/home/coast-picker.ts`).
- **A geolocated position never leaves the device** (`shared/geolocation.ts`): it reaches the map's
  camera and Discover's list order and distance captions, never a request, a URL, storage or a log.
  What a consumer then does with the camera is its own: the operator's pin placer publishes a venue
  location the operator commits by hand, which is the venue's business data, not this position.
- **A typed commission rate parses strictly** (`shared/commission-rate.ts`): `'15abc'` is rejected,
  not read as 15. A rate is a commercial term, and silently keeping the readable prefix of a typo is
  the wrong direction on a field that sets what the platform charges. Rounding to whole basis points
  may happen, never unseen: the editor renders the integer, the wire carries only it (invariant #5).
- **Focus is moved deliberately after a confirm-before-destroy** (`shared/focus-after-render.ts`).
  Such a surface destroys the element just activated, stranding focus on `<body>` (WCAG 2.4.3). The
  target rarely exists yet when the transition is decided, so the lookup runs in `earlyRead` and the
  `focus()` in `write`.
- **The venue console lands on the Daily view** (`VENUE_CONSOLE_LANDING_TAB`). It is what a
  trading venue opens every day; the set-up tabs are deliberate destinations, reached from the rail
  or deep-linked. A freshly created venue is the one exception: `operator/venue-create-card.ts`
  sends it straight to `beach-map`, since it has no map to run a day on yet.
- **The admin tabs load with a plain `HttpClient` call, never `httpResource`.** A tab fires its
  first read from an `effect` once the session is confirmed (restore settled, `ROLE_ADMIN` present)
  and owns its loading line, error card and Retry. `httpResource` fetches eagerly and throws on
  `value()` in its error state, the opposite of that gated, error-carded shape. The moderation tabs
  gate the venue list the same way (`admin/moderation-venue-picker.ts`); the action-only tabs read
  nothing on open.

## Invariants, long form

`CLAUDE.md` states each cross-cutting invariant in one sentence; this is the long form, with
the mechanism and the edge cases. The numbering is `CLAUDE.md`'s and never changes.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` never on the classpath;
   no `@Entity`/`EntityManager`. Every driven adapter is hand-written `JdbcClient` SQL: the
   tree holds no `CrudRepository`, no `@Table`, no `@Id`, and no `org.springframework.data.*`
   import in `src/main/java`. The Spring Data JDBC starter is on the classpath and aggregate
   mapping remains available for a cluster of rows that is genuinely one consistency unit
   (`riviera-java-conventions` §1a), but nothing has earned it yet — reaching for it departs
   from the tree's one uniform choice and is a review conversation, not a preference.
2. **Availability is the single source of truth, per `(set, date)`.** Every channel — online
   booking and staff tap-to-mark — writes the same `availability(set_id, booking_date)` row;
   a set is held by at most one party per date. Enforced in the database (unique constraint)
   AND in the reservation transaction (`SELECT … FOR UPDATE` or an atomic `INSERT … ON
   CONFLICT DO NOTHING` claim). Never double-sell a set. The write happens synchronously at
   claim time via `availability`'s `AvailabilityClaim` port — `availability` has no event
   listener.
3. **Online and walk-in pools are separate.** Each set carries a pool flag; an online booking
   can only target an online-pool set. **A reserve-time rule:** it decides whether a *new* online
   booking may claim a set — checked by `booking`'s fast path and by `availability`'s locked
   claim-time read, both against `venue.vocabulary.Pool` — and says nothing about a booking that
   already exists. A set's pool is mutable layout data: switching a booked set to walk-in stops new
   online reserves for every date and leaves every booked `(set, date)` claimed by its own
   availability row, so no layout write is ever refused for the pool alone (§`venue`).
4. **Sales close is venue-controlled, on the day itself.** A date D's online sales window
   runs until the venue's `sales_close` wall-clock time on D — a per-venue setting fixed at
   one of three values (`00:01` opts the venue out of same-day sales, `16:00` the default, or
   `23:59`), `Europe/Tirane`. A venue **closed for season** shuts every date until its reopen day
   starts in `Europe/Tirane` or the operator reopens by hand; with the advance-sales opt-in, dates
   on or after the reopen day sell while it is still shut. Both arms are `booking`'s
   `BookingCutoff`; the venue stays visible (§`venue`). A pending request's response deadline is capped at that same
   close (`min(created + expiry-window, D at sales close)`). Cancellation keeps its own,
   separate evening-before boundary (default 18:00 `Europe/Tirane`, configurable). The pay
   path fences on **the pay deadline having passed**: an accepted `AWAITING_PAYMENT`
   booking's deadline is `min(accepted_at + pay-window, end of service day D)` (never past
   D's end, 00:00 `Europe/Tirane` of D+1), a never-accepted one's is D's end with the sweep's
   TTL as the earlier backstop; the abandoned sweep expires a booking once its deadline has
   passed, and the code-gated view issues no payment credentials past it. The confirm path is
   deliberately NOT fenced — a payment in flight at the deadline still confirms; read
   §`booking` before treating a late confirm as a bug.
5. **Money is integer minor units, never floating point.** `long`/`int` cents with an
   explicit ISO currency code; exact-integer commission/payout arithmetic; rounding rules
   written down at any division. v1 collection currency is **EUR**.
6. **Time: store UTC `Instant`, reason in `Europe/Tirane`.** A "booking date" is a
   `LocalDate` in `Europe/Tirane`. Never rely on the JVM default timezone.
7. **Booking codes are unguessable bearer credentials.** ≥ 8 random base32 chars, never
   sequential, treated like a secret in logs.
8. **Stripe webhooks are the source of truth for payment state — not the client.** Never
   confirm a booking from a client-side redirect; reconcile payment state only from
   signature-verified webhooks (§`payment`). Idempotency keys on charge and refund creation, and
   collect-only with no Stripe Connect, are separate rules (ADR-0002, `riviera-stripe-payments`),
   not this invariant.
9. **The payout ledger is auditable and idempotent.** A booking contributes to a venue's
   payout exactly once; refunds reverse it; a refund the venue's own change caused also charges
   it a fee. Payout = Σ(booking amounts) − commission (rate stored per venue, effective-dated,
   forward-only) − fees. **Direction lives in the entry type**: every amount is a non-negative
   magnitude, so only an `ACCRUAL` adds and every other type deducts — the safe default for a
   type added later. A `FEE` has no gross and no commission and is the one type the net CHECK
   exempts (ADR-0021). Payouts settle manually via BKT; the ledger is the record. Every entry is
   order-independent and idempotent, keyed on `UNIQUE (booking_id, entry_type)`.
10. **Cancellation/refund policy is enforced server-side.** Free cancellation until the venue's
    evening-before cutoff (not #4's sales close) → full refund; after → none or partial; closes at
    service-day open (00:00 `Europe/Tirane`) — a guest cancel is then refused, not refunded
    (ADR-0005 as amended). Two refunds sit outside the tier, both deliberately. The weather
    exception is a manual admin-triggered full refund. A **moved booking's free exit** returns the
    full amount under reason `VENUE_CHANGE` until `BookingCutoff#freeExitEndsAt` — whatever the
    `LATE` tier would answer — and never reopens `CLOSED`, because that deadline is itself capped
    at service-day open (§`booking`, ADR-0020). Refund decisions are computed on the server.
11. **Spring Modulith boundaries are hexagonal and id-based.** The ADR-0007 graduated shape:
    a full module is `{api?, spi?, vocabulary?, events?, application, domain, adapter/in,
    adapter/out}`; a thin module is `{api, vocabulary?, adapter/out}`. No `application/in|out`
    split, no `infrastructure/*`. Published surface split by kind: `api/` ports only,
    `vocabulary/` typed ids/values/outcomes, `events/` domain-event records; a cross-module
    *driven* port lives in `spi/`, granted only to its implementing module. Cross-module
    access is via another module's `api/` port or a domain event — never its
    `application.*`/`adapter.*`/`domain.*`. Event payloads carry technical ids, not business
    fields. Machine-locked by `PackageShapeArchitectureTests` +
    `PublishedSurfacePlacementArchitectureTests`; details: ADR-0007 + `riviera-modulith`.
12. **Schema changes go through Flyway.** Versioned forward migrations only; no hand-run
    DDL. Every constraint enforcing an invariant (especially #2) is created and tested by a
    migration.
13. **Venue-scoped operations verify the actor owns the venue.** Object-level, not
    role-level (OWASP API #1 BOLA): the `OPERATOR` role is necessary, never sufficient.
    Every `/api/venues/{venueId}/**` operation verifies the authenticated operator owns the
    path `venueId` and rejects a mismatch with `403` — in the **application service**, so no
    driving adapter can bypass it; ownership is consulted via `operator`'s `api/` port.
    Platform-wide `/api/admin/**` surfaces are role-gated and exempt. Reviewed as RV-BE-9.

## Machine-checked vs review-checked

The boundaries above split into a **structural** half the build enforces as fitness
functions, and a **semantic** half no import rule can see. **A green architecture-test
run must never be read as "boundaries fully enforced"** — the tests are necessary, not
sufficient. Which of them form the *structural net* — the subset run after any structure change
— is decided by the membership rule in `riviera-modulith` § *The structural net* (the command
itself is `CLAUDE.md` § *Commands*), not here.

**Machine-checked** (fails the build; all under
`platform/src/test/java/ai/riviera/platform/`):

| Clause of this file | Fitness function |
|---|---|
| `availability` is the **only writer** (and direct reader) of `set_availability` — invariant #2 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| Only `payment` talks to Stripe — the SDK is unreachable elsewhere | `ResponsibilitiesArchitectureTests` (Stripe-reach rule) |
| Events carry technical ids/values, never foreign aggregates — invariant #11 Need-To-Know | `ResponsibilitiesArchitectureTests` (id-based-events rule) |
| `review` is the **only writer** (and direct reader) of the `review` table — #811 | `ResponsibilitiesArchitectureTests` (SQL-shaped review-table scan; the bare name would match the module's package string in every consumer) |
| Only `venue` names `rating_tenths` / `reviews_count` — "I store the aggregate; `review` computes it" (#811) | `ResponsibilitiesArchitectureTests` (rating-columns sole-writer scan) |
| `challenge` is the **only writer** (and direct reader) of `challenge_registry` — ADR-0017 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| `audit` is the **only writer** (and direct reader) of `admin_audit_record` — ADR-0017 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| `payout` is the **only writer** (and direct reader) of `platform_setting` — ADR-0021 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| No class inside a module depends on a type sitting directly in `ai.riviera.platform` — ADR-0017 | `CompositionRootDisciplineTests` (module→root reach rule; Modulith's `allowedDependencies` cannot see it) |
| `payment` uses no Stripe **Connect** API (collect-only, ADR-0002) | `NoStripeConnectArchitectureTest` |
| No module reaches another's `application`/`domain`/`adapter` internals; `allowedDependencies` deny-lists hold | `ModularityTests` (`ApplicationModules.verify()`) |
| The ADR-0007 package shape; published-surface kinds (`api`/`spi`/`vocabulary`/`events`); the `VenueCatalog` role split | `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` |
| No JPA/Hibernate on the classpath — invariant #1 | `JdbcOnlyArchitectureTests` |
| A `domain/` class names only the JDK and published ids, values and rules — no Spring, JDBC, Stripe, adapter or port (ADR-0018 §4) | `DomainPurityArchitectureTests` (fixture-proven negatives) |
| The booking transition table and the guarded `UPDATE`s admit the same statuses (ADR-0018 §1) | `JdbcBookingTransitionTableIT` (every transition against every status) |
| The booking view's `cancellable` and the guest cancel's refusal answer as `CANCEL_BY_GUEST` does, status by status (ADR-0018 §1) | `ViewBookingServiceTest.onlyAConfirmedBookingIsCancellableWhileTheWindowIsOpen`, `CancelBookingServiceTest` (every status against the literal `BookingTransitionTest` holds the row to) |
| No login machinery inside `operator` (RV-BE-11) | `OperatorAuthPlacementTests` |
| No login machinery inside `customer` (RV-BE-11) | `CustomerAuthPlacementTests` |
| Mail listeners name their own bounded executors, never Boot's shared `applicationTaskExecutor` (#383) | `MailListenerExecutorArchitectureTest` |
| `booking` listeners reaching `payment::api` run on the bounded refund pool, not the shared one (#404) | `RefundListenerExecutorArchitectureTest` |
| Every self-configured worker pool carries the shared MDC decorator (#455) | `WorkerContextArchitectureTest` |
| The draining pools' shutdown claims sum within the platform's SIGTERM grace (#456) | `ShutdownDrainArchitectureTest` |
| The pool tokens are stated once, in `venue.vocabulary.Pool` — no other production class holds an `"ONLINE"` / `"WALK_IN"` literal (invariant #3's operand is the published type) | `PoolTokenArchitectureTest` (`CONSTANT_String` scan, so a `Pool.ONLINE` reference passes; fixture-proven negative) |
| A retired set is absent from every read but `SetBookingFacts` — every production SQL string naming `set_position` selects from `active_set_position` or names `retired_at`, an `INSERT INTO` and the facts adapter excepted (ADR-0019, §`venue`'s exclude/exempt lists) | `RetiredSetExclusionArchitectureTests` (per-statement `CONSTANT_String` scan; the one structural-net member admitted by decision; fixture-proven negative under `ai.riviera.retirefixture`) |

Each rule is proven able to fail on every build, against deliberately-violating fixtures
(`ai.riviera.responsibilityfixture`, `ai.riviera.placementfixture`, `ai.riviera.retirefixture`) —
never by breaking production code.

**Review-checked only** (the semantic half — needs **no illegal import**, so it cannot
be encoded; owned by the plan-time Module-ownership table, `riviera-plan-doc` §4a, and
review item RV-BE-11):

- A refund **policy** reimplemented inside `payment` (only `booking` decides
  whether/how much to refund; `payment` executes).
- Commission **math** inside `venue` (it stores the rate; only `payout` computes).
- Review **policy** (eligibility, the window, the rounding rule) leaking into `venue` —
  the twin of the commission split. The *SQL* half of this boundary graduated to
  machine-checked above (a second writer of the rating columns, or outside SQL against
  the `review` table, now fails the build); the *policy* half still needs no illegal
  import and stays review-checked (ADR-0015).
- A booking-lifecycle decision creeping into `availability` (it holds state, not the
  cutoff rule), or any other capability landing on a module's Not-My-Job list without
  crossing a package boundary.

Known scan limits (documented on the tests): the sole-writer rule keys on the contiguous
whole-word table name in compiled constant pools — SQL assembled by string concatenation
could evade it (the text-block-SQL idiom keeps names contiguous). The id-based-events rule
unwraps generics and arrays (a `List<Aggregate>` component is caught), but only for the
component's declared type.
