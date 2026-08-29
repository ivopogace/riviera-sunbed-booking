# System Responsibilities

The Job / Not-My-Job boundaries for each module in the `ai.riviera.platform`
modular monolith. This is the plain-English companion to `CLAUDE.md`: `CLAUDE.md`
holds the invariants and the module table; this file says, for each module, what
it owns and — more usefully — what it must **refuse to own**. When a boundary is
ambiguous in a plan or review, this is the tie-breaker.

Modules: `venue`, `availability`, `booking`, `payment`, `payout`, `customer`,
`operator`, and `notification` (#382). Cross-module collaboration is **events for
state changes, `api/` ports for queries** (invariant #11).

The **structural** subset of these boundaries is machine-enforced — see
[Machine-checked vs review-checked](#machine-checked-vs-review-checked) at the end
of this file for exactly which clauses the build verifies and which remain
review-only.

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist browses venues and opens one; they see the beach map and which sets
   are free for a chosen date. The map and set layout come from **`venue`**; which
   of those sets are actually free on that date comes from **`availability`**.
2. The tourist picks a set + date and gives guest-checkout contact. **`customer`**
   owns that contact; **`booking`** opens a booking.
3. **`booking`** reserves the set: it asks **`availability`** to claim the
   `(set, date)` row **atomically** — so it can never be double-sold — and commits
   the booking as `AWAITING_PAYMENT`. The claim happens **before** any money moves.
4. **`booking`** hands off to **`payment`**, which creates a Stripe PaymentIntent.
   `booking` never touches Stripe itself.
5. Stripe confirms out-of-band. **`payment`** reconciles the result from the
   **signature-verified webhook** — never a client "success" redirect — and marks
   the payment settled.
6. **`booking`** confirms: it transitions to `CONFIRMED`, issues the unguessable
   booking code, and publishes `BookingConfirmed`.
7. On `BookingConfirmed`, **`payout`** accrues a ledger entry for the venue
   (idempotently). `availability` needs no listener — the set was already claimed
   atomically at step 3; confirmation changes nothing in its table. No listener
   reaches back into `booking`.
8. On arrival, venue staff check the guest in — scanning the booking's QR (or typing
   its code) flips the booking `CONFIRMED → COMPLETED`, exactly once. Staff can also
   tap-to-mark a walk-in, which **`availability`** records against the **walk-in**
   pool — a separate pool from online bookings.
9. If the tourist cancels, **`booking`** applies the cancellation policy, frees the
   set **synchronously** via `availability`'s `release` port (the existing
   booking → availability direction), and publishes `BookingCancelled` — on which
   **`payout`** reverses its ledger entry and `booking`'s own refund listener drives
   **`payment`**'s `RefundPort` with the amount `booking` decided. **`notification`** is the
   third subscriber (#374) and the only non-money one: it mails the tourist a record of the
   cancellation and that refund amount.

> **Variant — Request-to-Book** (per venue's booking mode; *shipped — issue #98*): between
> steps 2 and 3 the host accepts or declines (`booking` owns the request lifecycle, its
> expiry sweep, and — since #123 — the guest's own **withdraw**, the third terminal leg beside
> decline and expiry; ownership checked via `operator::api`, though the withdraw is authorized
> by the booking code alone, so it is venue-scope-free); on accept, `payment` issues a fresh
> PaymentIntent (payment-request-on-accept) rather than charging at request time, and from
> `AWAITING_PAYMENT` onward the Instant spine runs unchanged. Same ownership boundaries apply.

**Key design decisions:**

- **`availability` is the single source of truth for `(set, date)` and the only
  writer of that table.** A set is claimed atomically (`INSERT … ON CONFLICT`) at
  reservation time, *before* payment, so it can never be double-sold (invariant #2).
- **Online and walk-in are separate pools.** An online booking can only ever target
  an online-pool set; staff walk-ins draw from the walk-in pool (invariant #3).
- **`payment` trusts Stripe webhooks, never the client.** Payment state is
  reconciled from signature-verified webhooks with idempotency keys (invariant #8).
- **Decision vs. execution is split, twice.** `booking` owns the cancellation/refund
  *policy*; `payment` *executes* the refund. `venue` stores the commission *rate*;
  `payout` *does* the arithmetic. Neither executor re-decides.
- **Money is integer minor units in EUR, everywhere. No floats** (invariant #5).
- **Events carry technical ids** (`BookingId`, `SetId`, `VenueId`), never foreign
  aggregates or mutable business fields — the Need-To-Know boundary (invariant #11).
- **Every venue-scoped operation verifies the operator owns the venue** (403 on
  mismatch). The check is performed in the application service; the ownership mapping
  is owned by **`operator`** (invariant #13).

---

## `venue`
**Job:** Own venue profiles (incl. amenities + distance-to-water), the beach map /
layout, set positions, the online-vs-walk-in pool assignment for each set, pricing, the
booking mode (Instant / Request), venue photos, and the commission rate over time. The
standing rules:

- **The tourist catalogue reads are visibility-fenced** (#693): all three `VenueCatalog`
  reads (list + map + availability calendar) consult `operator.api.VenueVisibility` inside the
  adapter, so a venue whose owning operator is not `ACTIVE` is absent from the list and 404 on
  the map and the calendar — indistinguishable from nonexistent. `SetBookingFacts` is deliberately **unfenced**: its
  consumers include sold-booking paths (cancel, view, mails, staff marks) that must keep
  answering for a hidden venue's sets; the reserve path applies the fence itself in
  `booking`. The anonymous content-hash photo read stays unfenced (accepted, #693 intake).
- **Venue photos** (#142, ADR-0008): per-slot upload/replace/delete, processing, `bytea`
  storage behind the module-internal `PhotoStorage` port, and the public content-hash
  serving read.
- **Photo moderation is ownership-free by design** (#504 takedown + #511 read — the
  "remove" half of ADR-0013's report-and-remove stance). Both operations sit on their own
  `VenuePhotoModeration` port, named for the posture its methods share (reading a reported
  photo and removing it is one conversation, one actor, one authorization posture), so the
  ownership-asserting `VenuePhotos` contract stays uniformly `assertOwns`-first rather
  than per-method. The *authority* is not mine: the `ADMIN` role gate on
  `GET`/`DELETE /api/admin/venues/{venueId}/photos…` is the whole authorization
  (invariant #13 exempts `/api/admin/**`); the venue-scoped twin refuses a non-owner `403`
  before it looks at the slot — i.e. refuses exactly the case moderation exists for. Both
  ports run the same single cascading delete, and a takedown removes one **slot**, not one
  image: byte-identical variants in another slot keep serving; each published slot is its
  own takedown.
- **A layout write that a live claim depends on is refused** (#567/#599/#602). Scope
  follows what the write destroys: the bulk replace deletes every set, so it asks the
  venue-wide question (`LAYOUT_IN_USE`); `editSet`/`removeSet` touch one set, so they ask
  the set-scoped one (`SET_IN_USE`) under `SELECT … FOR UPDATE` on that row. The two
  **row-scoped display writes** — `repriceRow` and `renameRow` (#726) — destroy nothing, so
  they ask **no claim question at all** and stay available on a venue that has sold.
  - *Availability arm — symmetric, and the relief is total:* every **claim-probing** write
    (`editSet`, `removeSet`, the replace) asks the one question — is a hold on these sets
    dated today or later — through the single `hasLiveHold` predicate (`SetAvailabilityLookup` publishes no date-agnostic probe at
    all), so no write blocks on a hold that has been honoured: last season's walk-in mark
    freezes nothing.
  - *Booking arm — asymmetric, forced by the schema:* `removeSet` and the replace refuse
    on a booking of **any status ever recorded**; `editSet` only on a non-terminal one,
    and only when the command would repool or reposition the set — a price-or-tier-only
    edit is never refused, however live the claim. The RESTRICT `booking.set_id` FK forces
    the breadth: a set carrying any booking is physically undeletable, so refusing early
    turns a 500 into an honest 409 — while `set_availability`'s CASCADE simply removes a
    past hold with the day it describes. The replace's booking arm stays venue-wide
    (narrowing it would need the write to stop deleting booked sets — a redesign, #602's
    declined option 2). Consequence, **by design**: a venue with one ancient *cancelled*
    booking answers `LAYOUT_IN_USE` on delete/regenerate forever; only the edit is
    relieved of it.
  - The narrowed probes are race-safe not by breadth: a past date is never claimable — a
    booking reserve rejects it and the staff mark's `DATE_IN_PAST` refusal does too — so
    the range they stopped asking about is one nothing can be written into.
  - Which statuses are live is `booking`'s call (`BookingStatus#isTerminal`, reached
    through `BookingPresence#hasLiveBookings`); `venue` never enumerates booking statuses.
    Price, tier and the row's **name** stay editable on a claimed set — a booking's charge
    is snapshotted at reserve time (the same call `repriceRow` already makes), so a reprice
    can never alter it, and `row_label` lives on `set_position` alone, so nothing snapshots
    it either. Consequence of the rename, **accepted by design** (#726): a guest already
    booked into the row reads the new name live — in their booking view and in any resent
    confirmation — while the mail already in their inbox keeps the old one. A venue renaming
    a row is renaming the physical row, so the live read is the truthful one and the guest's
    row+position pair still addresses the same sunbeds.
  - A rename is refused only for a reason of its own: `ROW_NAME_TAKEN` when another row
    already carries the requested label. Broader than the `set_position_cell_uniq` backstop
    on purpose — two rows can share a label with no `(row_label, position_no)` pair
    colliding, which the database accepts, but the tourist map, the price rail and the
    pricing tab all group sets by label, so the two physical rows would silently read as
    one. Renaming a row to the label it already carries is a permitted no-op. The bulk
    replace enforces the same one-label-one-physical-row rule within its submitted batch
    (`ReplaceRejection.ROW_NAME_TAKEN`, #728) — gap-cell position numbering can otherwise
    keep every `(row_label, position_no)` pair unique while two grid rows share a label,
    which the single-set `addSet`/`editSet` paths do not yet check (surfaced on #728).
  - Because the pool is **mutable** layout data, `SetBookingFacts#poolForClaim` is a
    **locking** read — `FOR KEY SHARE`, the weakest lock that conflicts with the edit's
    `FOR UPDATE`, and the very lock the claim's own insert takes for its FK check. It is
    named for that contract: it must run in a transaction and never from a read-only one;
    the unlocked `setBookingInfo` stays unlocked precisely because it serves list and mail
    reads.
- **The commission rate over time, not just its current value** (A7 #348):
  `venue_commission_rate` (V39) is the effective-dated schedule behind
  `VenueRates#commissionBpsOn` — the rate that applied to bookings served on date D, for
  the reporting reads — while `commissionBps` stays the live rate every *decision*
  re-reads. That is still storing the rate, not computing with it: `payout` keeps the
  arithmetic. The platform-admin rate write is my **second** ownership-free surface, on
  its own `VenueCommissionAdministration` port (same reason as `VenuePhotoModeration`:
  `EditVenueProfile` stays uniformly `assertOwns`-first), and it is **forward-only by
  construction** — it pins the superseded rate back to an epoch floor, moves the live
  column, and schedules the new rate from the **current** service date (`Europe/Tirane`) —
  so no past service date reprices and no ledger entry is touched (invariant #9). The
  schedule started *tomorrow* until #798: that rested on invariant #4's retired
  evening-before close ("today's bookings have all accrued"), a premise #791's same-day
  sales broke — a mid-day change then had same-day bookings accruing at the new live rate
  while the takings strip reported the old scheduled rate until midnight. Starting today
  makes `commissionBpsOn(today)` track the live rate, so the two reads cannot disagree on
  the current date; bookings accrued *before* the change remain the documented
  per-booking-vs-per-day approximation. (V39's migration header still argues the retired
  tomorrow rule — it is an applied, checksum-immutable historical document; this paragraph
  supersedes it.) The asymmetry it preserves:
  the *owner's* profile PATCH still cannot write the rate at all (O8 #177) — a venue does
  not set its own commission.
- **The per-venue sales-close setting** (`sales_close`, V44, invariant #4): a fixed-vocabulary
  wall-clock time (`00:01`/`16:00`/`23:59`, `Europe/Tirane`) naming when a venue's online sales
  for a date close, on the date itself — the fact `SetBookingFacts#setBookingInfo` carries to
  `booking`'s reserve path (`BookingCutoff#salesCloseAt`) so it can gate creation without
  reaching into my tables. **Owner-editable since #794**: the choice is a required field of the
  profile full-replace PATCH and an optional one on create (absent → 16:00), spoken on the write
  path as the `venue/domain/SalesClose` enum — the single Java mirror of the V44 CHECK, so an
  off-vocabulary value is a §6b `400` at the edge and unrepresentable past it; the read model and
  the cross-module carriers keep `LocalTime` (the fence does time arithmetic; the three-ness is my
  write concern). The console's daily-view "close today's online sales now" is the same write —
  no per-day override, no second endpoint — leaving the commission rate above and the payout
  currency as the two owner-write-proof fields the PATCH still mirrors. Since #793 the two
  tourist catalogue reads
  (list + map) also *project* the open/closed verdict for the selected date as an additive
  `salesOpen` field, consulted through my **third** `spi` driven port — `SalesWindow`,
  implemented by `booking` beside `SetAvailabilityLookup` and `BookingPresence` — with one
  request-scoped instant per read, so verdicts within one response cannot disagree. The port
  returns the *verdict*, never a close instant: I store the time and display the answer;
  `booking` keeps the rule and its boundary semantics, so no second source of truth exists.
- **The tourist availability calendar** (`GET /api/venues/{venueId}/availability-calendar?from=&to=`,
  #760; public, window-capped at the edge): I own the set total and therefore
  `free = total − taken` and the gap fill for days nobody has touched; `availability` answers
  the taken count per day through my `spi` (`SetAvailabilityLookup#takenCountsBetween`). The
  path deliberately does not reuse the `/availability` segment below — that one is the
  operator-only per-set state read, and sharing it would either publish the hold split or
  operator-gate the tourist read. The counts are a snapshot, never a hold: the claim still
  decides (invariant #2), and the read answers past days too, because it reports availability,
  not bookability.
- **The signed-in operator's own-venues read model** (`GET /api/venues/mine`, S9 #277): I
  ask `operator::api` for the ownership set and join the names, because naming venues is
  my job and `operator → venue` would cycle.
- **The owner's per-set daily availability read**
  (`GET /api/venues/{venueId}/availability?date=`, #207; owner-asserted,
  403-before-existence): I own the set list and the map composition (the #44 split, one
  state-aware step deeper); `availability` answers the per-`(set, date)` state tokens
  through my `spi` (`SetAvailabilityLookup#statesOn`). The public tourist map stays
  state-agnostic (`FREE`/`TAKEN`) — hold type never reaches the public surface.

**Not My Job:**
- Knowing whether a specific set is free on a date → **`availability`** (I own the
  static layout; it owns the per-date state)
- Creating or tracking bookings → **`booking`**
- Collecting money, or knowing an amount was actually paid → **`payment`** (I set the
  price; `payment` charges it)
- The payout math or commission arithmetic → **`payout`** (I store the commission
  *rate* — since A7 #348 including which service dates each rate applied to; `payout` computes with it)
- Deciding *which* venues an operator owns, or authorizing them → **`operator`** (it owns the
  mapping and answers the question; since #277 I *render* that answer as named summaries, but the
  set itself is always its call)

---

## `availability`
**Job:** Own the single source-of-truth state per `(set, date)` — free / booked-online /
staff-marked. Be the **only writer** of that table. Claim a set atomically so it can
never be double-sold. Answer the read-side facts through `venue::spi`
(`SetAvailabilityLookup`): the state-agnostic taken-set overlay for the public map (#44);
since #207 the per-set **state tokens** (`statesOn`) behind the owner's daily availability
read; and since #760 the **taken count per day** over a window (`takenCountsBetween`) behind
the tourist date calendar — I answer how many are held, never how many exist, because the set
total is `venue`'s. Throughout: `venue` composes; I answer state.

**Not My Job:**
- The venue layout, which sets exist, or their positions → **`venue`** (I reference
  sets by id; I don't own them)
- *Why* a set is taken — which booking, who paid → **`booking`** (I record *that*
  `(set, date)` is claimed, not the booking behind it)
- Deciding whether bookings are even open for a date (the venue's sales close) →
  **`booking`** owns that rule; I only hold state
- Pricing → **`venue`**; payment → **`payment`**

---

## `booking`
**Job:** Own bookings, booking codes, and the lifecycle (confirmed / cancelled /
completed / no-show). Own the staff **check-in** (#583): the venue-scoped, service-date-only
guarded `CONFIRMED → COMPLETED` transition off the scanned or typed booking code — single-use by
the row lock (a second scan classifies against committed state as "already checked in"), keyed on
the code but authorized by venue ownership (both invariant #13 and #7 apply, unlike withdraw's
code-only leg); it publishes **no** event (the withdraw precedent: nothing accrues, nothing
refunds, no mail decided). Own the **no-show sweep** (#584), check-in's counterpart: a scheduled
guarded bulk `UPDATE` marking every `CONFIRMED` booking dated before today (`Europe/Tirane`)
`NO_SHOW`, in **batches** (500 rows, at most 20 batches a run) rather than the per-row loop the
abandoned-payment and request-expiry sweeps use — those loop because each row must also release its
`(set, date)` claim and publish an event, whereas a no-show does neither, so there is no second
write per row to isolate. Batched rather than one statement because it runs on the bounded scheduled
client: an all-or-nothing `UPDATE` over a backlog larger than the timeout rolls back whole and can
never make progress. Each batch commits on its own, so a run cut short by the timeout **or by the
per-run cap** keeps what it did and the next tick resumes — which means a booking can stay
`CONFIRMED` for an extra tick when the backlog exceeds 10 000 rows. `FOR UPDATE` without
`SKIP LOCKED`, because a skipped row would shorten the batch and the caller reads a short batch as
"drained". It writes **no availability row at all**, deliberately: the set was
sold and held for a date now past, so freeing that claim would rewrite history and make it
re-claimable (invariant #2). The arrivals list and daily takings count `COMPLETED` **and
`NO_SHOW`** alongside `CONFIRMED`, so neither a check-in nor the sweep shrinks the console's day.
The guest-cancel guard stays `CONFIRMED`-only (a delivered stay is never reclaimed); the **admin
weather refund does not** — it admits `NO_SHOW` on its own `cancelForWeather` transition, because
the storm is only known afterwards, by which time the sweep has marked exactly the guests who
stayed home. That split is why the two share no port method. Enforce the cancellation policy and
own all of the day's boundaries on `BookingCutoff` (#791, re-homed to the `application/` root
at #792 as the module-wide day-boundary authority): `salesCloseAt` — the venue's
own sales-close setting, per date, which gates whether a booking can be *created* at all and,
since #792, caps a pending request's **response deadline** (`min(created + expiry-window, D at
sales close)`, invariant #4); since #793 the same `isBookable` fence also answers the tourist
browse through `venue.spi.SalesWindow` (the `BookingCutoffSalesWindow` adapter) — same
authority, second consumer, display-only: the browse verdict never gates anything, the
reserve path keeps enforcing independently — `freeCancellationEndsAt`, the older evening-before boundary, now
cancellation-only — `serviceDayOpensAt`, midnight opening the stay, the cancellation window's
outer fence — and `serviceDayEndsAt`, the next midnight, the pay deadline's outer bound. The
*pay* path fences on **the pay deadline having passed** (#792, replacing the #576 day-open
family): an accepted `AWAITING_PAYMENT` booking's deadline is `min(accepted_at + pay-window,
end of service day)` — the same instant the payment-due mail promises — and a **never-accepted**
one's is the end of its service day, with its TTL (`AbandonedPaymentProperties`) the sweep's
earlier backstop, never a view fence. The abandoned sweep's `booking_date` arm reaps any
`AWAITING_PAYMENT` row whose service day has **ended** (`BookingCutoff.lastEndedServiceDay`;
the SQL re-derives the deadline as an accepted, pinned mirror of `RequestWindows#payDeadline` —
the mail ≡ sweep identity is `RequestWindowsTest`'s contract), and the code-gated view withholds
the `clientSecret` once the same deadline has passed (`ViewBookingService`, reading
`accepted_at`).
**The confirm path is deliberately not fenced** (pinned by
`JdbcBookingsTransitionIT.confirmSucceedsAfterThePayDeadlineHasPassed`). A guest already holding
a live `clientSecret` who pays past the deadline but before the next sweep run still confirms.
Refusing without refunding would strand the money on an `AWAITING_PAYMENT` booking the sweep can
never release (`NotCancellable` forever), and refunding cannot reuse `BookingCancelled`: a
never-confirmed booking has no `ACCRUAL`, so `payout`'s listener would defer that publication
permanently and hold `riviera.outbox.pending` non-zero. The residual is a sub-sweep-interval
race the guest opts into and is paid for with the full stay.
Quote **pre-reserve cancellation terms** and stamp the **window at birth** (#795, pure
disclosure — no policy change): `CancellationPolicy` — still the single home of the window
rule — answers the public tourist read `GET /api/bookings/cancellation-terms` behind the
`QuoteCancellationTerms` driving port (`terms`: window now, free-cancellation deadline,
late share), and classifies `windowAtBirth` from the booking's `created_at` via
`BookingCutoff.cancellationWindow`'s at-instant overload. Both publication sites stamp
`cancellationWindowAtBirth` + `lateCancelRefundBps` onto `BookingConfirmed` and
`BookingPaymentDue` — facts fixed at the moment, the `amountMinor` posture, so a later
cutoff edit can't rewrite a sent mail; a pre-#795 payload deserializes to a null window
and every consumer renders no disclosure for null, forever. The code-gated view reports
the same field, and the admin-resend facts re-derive it from the venue's *current* cutoff
(bounded, documented drift — the stamped event stays the record of what was first sent).
Orchestrate the reserve → pay → confirm flow across `availability` and `payment` — since
#693 refusing both reserve paths (Instant and Request) for a hidden venue's set before any
claim, via `operator.api.VenueVisibility`, answering `NO_SUCH_SET` so hidden reads as
nonexistent; no post-reserve leg (view, cancel, check-in, sweeps) consults visibility.
Own the request lifecycle's three terminal legs on `RequestReleaseService` — decline,
the expiry sweep, and the guest's own **withdraw** (#123): withdraw is authorized by the
booking **code** alone (the only request command with no ownership check) and guarded by
status alone — **not** deadline-guarded, matching decline — so on an overdue row its
`WHERE` and the sweep's both match and the **row lock**, not the predicates, is what
leaves exactly one transition and exactly one release (`ConcurrentRequestTerminationIT`);
it publishes **no** event, deliberately: nothing accrued and nothing collected
(payment-request-on-accept), and routing it through `CancelBookingService` would fan a
`refundMinor = 0` `BookingCancelled` out to three subscribers, one of which (#374) would
mail the guest a cancellation record for a request they retracted themselves.
Publish the **notification-facts** reads a mail needs: the arrival code + contact id
(`BookingNotificationFacts#notificationInfo`, #371) and, since **#380**, the wider
`#confirmationFacts` an admin resend rebuilds the mail from (it has no event payload to read), plus
`CustomerBookings` — which bookings one guest contact has, split off by consumer role (#94) because
"which bookings does this person have" is a different conversation from "tell the guest about this
booking". Neither publishes the lifecycle enum: both answer `everConfirmed` (read from
`confirmed_at`, so a booking cancelled *after* confirmation still reads as having had one), which is
what a consumer actually needs and keeps `BookingStatus` internal.
The code-gated view also tells a guest when a cancelled booking's refund is still
**outstanding** (#581): decided by me, not yet accepted by the gateway — asked lazily through
`payment.api.RefundStatusLookup`, the same lazy-consult shape as the credentials read, so the
panel can say "being processed" instead of claiming the money is in transit while the refund
sits in the outbox.

**Not My Job:**
- Owning the `(set, date)` availability state → **`availability`** (I *ask* it to
  claim; it owns the row and the atomic guarantee)
- Talking to Stripe or moving money → **`payment`** (I *ask* it to collect; I never
  hold a PaymentIntent or a webhook). Since #404 I do own the **bounded executor** my post-commit
  refund listener drains on — that is wiring for *my* driving adapter, not gateway knowledge: I still
  only call `payment.api.RefundPort` and never learn which gateway is behind it. `payment` must not
  host it; it does not know it is being called asynchronously, and must not have to. The listener
  makes blocking gateway round-trips (no SDK retries, so ≈25s worst case per call, pinned by
  `StripeConfigTest` — and since #569 a refund is up to three calls: the existence read, the create,
  and the create's same-key replay, so ≈75s per refund) and `WeatherRefundService` dispatches a whole venue-day of
  refunds in one transaction, so on Boot's shared `applicationTaskExecutor` a single admin action
  would starve the spine that pool also carries; the same swap **dropped** the `REQUIRES_NEW` the
  composite annotation supplied — it bought nothing (every write beneath it is a single guarded
  statement, so a rollback would have nothing to undo) while pinning one of ten Hikari connections
  across the call. Since #594 dropping it is load-bearing rather than merely cheaper: the refund path
  records its attempt *before* the gateway call, and a transaction would hide that write for exactly
  the window it exists to cover (`RESPONSIBILITIES.md` §`payment`). Saturation
  **sheds** to `ObservabilityMetrics.REFUNDS_SHED` and the publication stays outstanding for the
  restart republish, but the queue is sized (`riviera.booking.refund.*`, validated at boot) so
  shedding is unreachable for any plausible burst — unlike a shed mail, a shed refund is money owed
  under invariant #10, and a shed is the one loss mode that does not trigger its own recovery.
  **The arithmetic behind the three defaults**, so they can be checked rather than inherited, all
  derived from that ≈25s worst-case round-trip: **pool 4** is a head-of-line number, not a throughput
  one — a 60-booking venue-day against a degraded gateway drains in ~12.5 min at 2 threads (the mail
  pools' choice, sized for a handful of sends a day) and ~6 min at 4, while larger buys little, since
  the normal case is sub-second and each extra worker is one more concurrent request during exactly
  the incident where the gateway is already unhappy. **Queue 500** was ≈52 min of worst-case backlog
  (500 × 25s ÷ 4) when a refund was one gateway call; since #569 it is up to three (existence read,
  create, same-key replay), so the same 500 is **≈156 min** at the 75s ceiling — and the bound was
  re-derived and deliberately **left at 500**, because that ceiling needs the mixed degradation where
  reads answer but writes time out (a read that times out ends the refund at 25s, the old number), and
  because the alternative — shedding sooner — trades a lossless queue for more publications to
  re-drive at exactly the moment the gateway is unhealthy. Past that backlog the Event Publication
  Registry is the better queue anyway — the same reasoning #383 applied at ≈50 min.
  **Drain 5s** is deliberately far short of even one round-trip, for two reasons:
  the shutdown budget *stacks* rather than overlaps (§`shared`'s `ShutdownBudget` owns that sum), and
  abandoning a refund is cheap in a way abandoning a mail is not — the publication stays outstanding
  and the replay cannot move money twice however late it lands (§`payment`: the gateway is asked what
  it already holds), so the drain need only catch the sub-second common case and the pathological
  25s one is precisely what it is safe to give up on. Re-deriving these against a different gateway
  (ADR-0009) is then a config change, not a code change. The
  executor rule is structural: `RefundListenerExecutorArchitectureTest`, scoped to `booking`
  listeners reaching `payment::api`, so `PaymentEventListener` and `payout`'s DB-only listeners
  correctly stay on the shared pool. Since **#454** I
  also own the ADMIN **refund-outbox re-drive** (`GET`/`POST /api/admin/refund-outbox`) — the retry
  lever for what the registry still owes *my* refund listener, scoped to that listener's **exact id**
  (an allowlist of one, never the `booking` package prefix, which would sweep `PaymentEventListener`'s
  payment→confirm spine — `RefundOutboxScopeIT`). Naming which listener is "the refund" is my
  knowledge, not `notification`'s (its mail outbox is deliberately scoped to its own listeners) and
  not `payment`'s (it executes refunds; *when to re-ask* is the caller's call)
- Computing the payout or commission → **`payout`** (my `BookingConfirmed` event
  *triggers* accrual; I don't do the math)
- The venue map, pricing, or pool rules → **`venue`**
- Storing guest contact details → **`customer`**
- The **retention window** or the contact scrub → **`customer`** (#101 Slice 2). I answer only the
  *fact* "does this guest have a booking on/after date D", via `customer.spi.GuestBookingHistory`
  — I hold no retention policy and never write a `customer` row
- Authorizing which operator may view staff bookings → **`operator`**
- Deciding whether a confirmation email will be sent, or knowing any address → **`notification`**
  (suppression) and **`customer`** (the contact). Since #390 I *expose* the withheld fact on a
  confirmed booking's read model, but I only ask it through `booking.spi.ConfirmationMailDelivery`,
  by `CustomerId` — I never handle an address. The gate is mine, because the lifecycle is mine, and it
  is two-part: the booking must be `CONFIRMED` **and** `payment.api.CollectionGuarantee` must say this
  deployment's gateway really collects before confirming (the in-process stub does not, so the flag is
  inert there — otherwise it would be a free suppression oracle, D-8)

---

## `payment`
**Job:** Own Stripe collection — PaymentIntents, refunds, and webhook handling.
Reconcile payment state from **signature-verified Stripe webhooks** (never the
client). Collection only. Publish the read side of the refund conversation
(`payment.api.RefundStatusLookup`, #581): how far a booking's refund has travelled —
`NO_COLLECTION` / `OUTSTANDING` / `ACCEPTED` — answered from this module's own row, with
"no row" meaning the wired gateway never collected, never that a refund failed.

**Webhook reconciliation** (#568, #570). Stripe promises neither ordering nor a single
delivery, and the handler widens the window itself — a transient failure rolls the whole
transaction back, so the same event returns hours later. Two rules keep it faithful:

- **The payment record has a state machine, in the SQL.** `markStatus` is a guarded
  `UPDATE … WHERE status IN (REQUIRES_PAYMENT, FAILED)` — the *open* states, `FAILED`
  among them because a declined intent is retryable at Stripe (the same set
  `findPendingCredentials` calls payable). Everything else is terminal, so a late
  `payment_intent.payment_failed` cannot record collected money as failed or contradict a
  `REFUNDED` row carrying `refunded_minor > 0`. The guard is one statement, never a
  read-then-write, so two concurrent deliveries cannot both see "open". Spine consequence:
  `PaymentConfirmed`/`PaymentCanceled` are published **only when a row actually moved** —
  a late `canceled` on a collected payment must not ask `booking` to release a paid
  booking's claim (invariant #2); `booking`'s own guarded `AWAITING_PAYMENT` transitions
  stay as the second layer.
- **A verified event is never consumed unapplied.** For every handled type, a payload
  yielding no identified PaymentIntent or Refund raises `UnreadableWebhookEventException`
  (`503`) instead of logging a warning and answering `200`; the rollback un-does the
  event-id dedup insert, so Stripe re-delivers and the id is not locally blacklisted —
  otherwise a paid booking could sit in `AWAITING_PAYMENT` forever, holding its
  `(set, date)` claim, with the abandoned sweep skipping it by design. One helper reads
  the data object for every type, so the rule has one home. Types the handler does not
  act on, and events for intents this app never recorded, stay `200`: there is no fact to
  lose in the first, and re-delivery cannot help the second. (Parking raw events for
  replay was the rejected alternative — the un-blacklisted id already leaves a dashboard
  replay open.)
  - The advisory refund types are the one branch that fails **open** (#592):
    `refund.failed` reports nothing but failures, so an unreadable one is a lost failure
    and answers `503`; `refund.updated`/`charge.refund.updated` announce every transition
    for every refund on the account, and a permanent retry loop there would get Stripe to
    disable an endpoint that also carries the payment spine — losing an advisory
    duplicate is much the smaller harm (invariants #2/#8).

**Refund execution** (#569, #592, #594). The idempotency key (`booking-<id>-refund`) is a
**time-bounded** defence: Stripe prunes keys after roughly a day, and the vehicles that
replay this call are precisely the slow ones (the restart republish, which on Render can
be days away; the admin re-drive, pressed when someone notices `riviera.outbox.pending`
late). Stripe's refundable-amount ceiling catches the full-refund replay; two 50% refunds
fit inside the charge and both succeed. Hence the standing rules:

- **A refund is never created without first asking the gateway what it already holds.**
  The adapter lists the refunds on the booking's PaymentIntent and **adopts** one —
  records it and reports success — instead of creating a second; a `failed`/`canceled`
  refund returned no money, so it is not adoptable and a fresh attempt proceeds. This is
  invariant #8 applied to refunds, and why the check is not the cheaper read of our own
  `refunded_minor`: that column is written *after* a call returns, so it is silent about
  exactly the lost-response case being guarded. The read **fails closed**: an unreadable
  list is `Failed`, never "no refund exists", so the publication stays outstanding and
  retries.
- **Adoption is narrow: exactly one live refund, for exactly the amount requested** — the
  shape a lost response leaves; nothing else is. Anything else (several live refunds, or
  one for a different amount — a manual dashboard refund, say) is
  `Failed("refund_mismatch")`: topping up a shortfall would be a refund **decision**,
  which is `booking`'s, and reporting success would strand a guest still owed money.
  `Failed` keeps the publication outstanding and lights `riviera.refunds.failed` — "a
  refund the platform owes could not be issued" — which never clears itself: a human
  settles it at the gateway.
- **Adoption is visible, not silent** — `riviera.refunds.adopted`: an earlier attempt
  moved the money and lost the response; the money was always right, the record caught up.
- The refund create **replays once on a connection timeout** with the same key (one
  shared helper with the PaymentIntent path), so the common lost-response case resolves
  while the key still holds.
- **A refund the gateway later reports as dead is un-recorded** (#592), not left claiming
  the guest was paid. A `pending` refund stays adoptable — it is where a refund normally
  starts, and refusing it would create the second refund adoption prevents — so the fix
  acts on the gateway's later word: a signature-verified refund-lifecycle event, branched
  on the **refund's status**, clears `refunded_minor` and restores `SUCCEEDED` (which it
  still is: no money went back). All three event types are handled, because `canceled`
  has no failure-only event of its own. That one write makes every existing mechanism
  truthful: `RefundStatusLookup` answers `OUTSTANDING` again so the guest is told the
  refund is still owed, `riviera.refunds.failed` lights, and the existence read sees a
  dead refund rather than adopting the corpse. Invariant #8 applied to the refund
  lifecycle.
- **The un-record hands nobody a lever, deliberately.** The cancellation's publication
  completed when the refund was accepted (`completion-mode=archive` removed it), so the
  refund-outbox re-drive cannot reach it; a fresh attempt inside the ~24h key window
  replays the original response — the dead refund — which the adapter detects and refuses
  (`refund_key_replay`). Recovery is a human issuing the refund at the gateway, or a
  re-attempt once the key has expired. Nothing re-drives it automatically: an issuer
  rejection is not a transient error, and the card that refused the money often cannot
  receive it — the alert stands until a human settles it (same posture as
  `refund_mismatch`). The un-record is guarded on the recorded `refund_id`: a re-delivery
  moves nothing, a failure naming a refund we never issued moves nothing, and a stale
  failure cannot un-record the retry that worked.
- **At-most-once is the port's contract, enforced, not the collecting adapter's habit.**
  `PaymentGatewayRefundContract` states it once against `PaymentGateway` — replay a
  refund past the key window and exactly one moves, with the replay reporting the first —
  on a fixture that deliberately never dedupes on the key; a second case guards the
  opposite error: a refund that returned nothing must **not** be adopted, or at-most-once
  becomes at-most-zero. A coverage rule makes it unskippable: every production
  `PaymentGateway` is either covered by a contract subclass or non-collecting, and
  neither half is a maintained list (coverage is read from the subclasses' dependencies,
  the exemption from the `@Profile` that already binds a gateway to its
  `CollectionGuarantee`) — so ADR-0009's Paysera adapter arrives unclassified and fails
  the build, which is what a javadoc could not do.
- **The refund attempt is recorded before the gateway is asked** (`markRefundAttempted`,
  #594), and every refund write is a guarded statement that reports whether it moved:
  - A verified failure arriving **before the refund id is written** — a real window: the
    create's timeout replay puts tens of seconds between Stripe minting the refund and
    the row write — is matched by **PaymentIntent** instead of by an id that does not
    exist yet. Without the attempt record it matched nothing, answered `200`, committed
    the dedup row, and left the collection at `REFUNDED` permanently while the guest was
    told their money was on its way.
  - The attempt is also the **discriminator** that makes by-intent matching safe: a
    refund issued by hand at the gateway is money the platform never promised, whose
    failure must raise no money-path alert — and with no attempt on record, the by-intent
    arm moves nothing. The rejected alternative — deferring the event with a `503` —
    would 5xx-loop for the ~3 days Stripe retries, on a shared endpoint whose disabling
    would stop `payment_intent.succeeded` delivery and strand paid bookings in
    `AWAITING_PAYMENT` holding their claims (the invariant-#2/#8 failure the `503` exists
    to prevent).
  - The recorded death **blocks the record that lost the race**: `markRefunded` refuses a
    refund id already reported dead (`Failed("refund_died_before_record")`), so the
    publication stays outstanding — and this one case recovers on its own: a
    never-recorded refund still has its publication, and a re-drive past the key window
    creates a fresh refund. A refund recorded and *then* dead is unchanged: nothing
    re-drives it, an issuer rejection is not a transient error.
  - A shape that looks like a bug and is not: one incident increments
    `riviera.refunds.failed` **twice** — the webhook counts the refund it killed, and the
    recording call it beat counts its own refusal. Both are true observations; the debt
    gauge still reads one booking. It is the sharpest illustration of why the counter
    measures observations and `riviera.refunds.owed` measures debts.
  - **`markRefunded` moves only a collected payment.** Unguarded, it and
    `markRefundFailed` (which restores `SUCCEEDED` unconditionally) could fabricate a
    collected payment out of a `REQUIRES_PAYMENT`/`FAILED`/`CANCELED` row —
    `findPendingCredentials` would stop offering the client secret and `RefundProgress`
    would report `OUTSTANDING` for money never taken. Not reachable while the only refund
    path is cancelling a `CONFIRMED` booking; reachable the moment a second one exists.
    The guard makes the hard-coded `SUCCEEDED` restore sound **by construction rather
    than lucky**: if the only statuses a refund record can replace are the collected
    ones, `SUCCEEDED` is the only thing it can have replaced — why no "previous status"
    column was needed.
  - **An owed refund is enumerable, not just loggable.** The dead id moves to
    `failed_refund_id`, `refund_id` stops claiming a live refund, and `refund_failed_at`
    marks the debt over a **partial index** that is empty in the healthy case — the shape
    the runbook's remedy needs: the *list* of bookings owed money, which log lines cannot
    give once retention is shorter than the incident. `riviera.refunds.owed` gauges
    **distinct refunds owed** (where `riviera.refunds.failed` counts observations and
    re-increments on every resubmission of the same stuck refund); the flag means "owed
    **now**" — a retry that works clears it, while `failed_refund_id` keeps what died.
  - The attempt stamp carries two constraints whose tidy-up would look like an
    improvement. **Placement:** it is written from `RefundService#refund`, which must
    stay **outside a caller's transaction**, or the write is invisible for the whole
    window it exists to cover (`RefundAttemptVisibilityIT` reads it back on a second
    connection; `RefundBulkheadIT` pins the listener's absence of a transaction).
    **Lifetime:** the stamp records an *unresolved refund obligation at the gateway*, and
    every in-app resolution clears it — the recording write on success, and both failure
    marks. It deliberately **survives a `Failed` return** (clearing there was tried and
    reverted): `RefundResult.Failed` carries an untyped reason, so the service cannot
    tell a gateway-confirmed "nothing of ours is live" from the genuinely ambiguous
    branches — a bare `StripeException` after a *double* timeout in the replay helper may
    well have left a live refund at Stripe with no id on record, exactly the
    discriminator's case. In every `Failed` branch the platform still owes the refund.
  - The bounded residual: a booking settled **by hand at the gateway** never runs an
    in-app resolution, so its stamp stands, and a later failed refund on that collection
    would be recorded as ours. Clear it when settling by hand — the observability
    runbook's owed-refund section says so.

**Not My Job:**
- Deciding *whether* to refund or *how much* → **`booking`** owns the refund policy;
  I execute the refund it decided. Note the line this puts under adoption: when the gateway already
  holds a refund for a *different* amount than the one requested, I record what Stripe holds and warn
  — paying the difference would be a refund decision, which is not mine to make
- The booking lifecycle → **`booking`**
- The payout ledger or commission → **`payout`**
- Paying venues out / Stripe Connect → nobody uses Connect; **`payout`** records what's
  owed and payout is settled manually via BKT
- Setting or knowing the price → **`venue`** (I charge the amount I'm handed)
- Storing card numbers → **Stripe** (I hold PaymentIntent ids, not PANs)

---

## `payout`
**Job:** Own the venue payout ledger (Σ booking amounts − commission) and the manual
BKT batch reporting. Accrue **idempotently** — a booking contributes exactly once; a
refund reverses it. Since #428's audit that promise is **order-independent**: a refunded
cancellation that finds no `ACCRUAL` to mirror *defers* (the listener throws, so its event
publication stays outstanding and `riviera.outbox.pending` shows it) rather than treating
the absence as "nothing to reverse", which completed the publication and left the ledger
permanently overstating what the venue was owed.

**Not My Job:**
- Actually moving money to venues → settled **manually via BKT**; I only record what
  is owed
- Collecting money from tourists → **`payment`**
- Setting the commission rate, or recording which dates a past rate applied to → **`venue`**
  (I apply the rate it stores; since A7 #348 the console daily-takings read asks it for the rate that
  applied on the *service date* rather than the live one, so a rate change cannot re-split a day
  already reported — the accrual still reads the live rate at accrual time, which is what fixes each
  ledger entry permanently)
- The booking lifecycle or refund decisions → **`booking`** (I reverse a ledger entry
  when told; I don't decide the refund)
- The tourist's identity or contact → **not sent to me** (I work in venue-ids,
  booking-ids, and money — no Need-To-Know)

---

## `customer`
**Job:** Own tourist identity — the guest-checkout contact AND (S2 #111) the customer
**account** (email + opaque credential hash) that backs register / sign-in. The account is a
**separate identity** from the guest-contact row (no foreign key), so registration never
auto-claims a guest email's past bookings; back-linking guest bookings is a **permanent
non-goal** (design D-6, amended at S8). Also own **right-to-erasure** (#101): scrub-in-place
(tombstone) of the account + guest-contact PII and delete the transient SSO/token children,
retaining the booking/payment/payout records under the **statutory-retention exception**
(ADR-0010) — the edge authenticates the request and revokes sessions (RV-BE-11). Own the
**retention policy** too (#101 Slice 2): the configured **retention window**, the decision of
which guest contacts have no remaining **retention basis**, and the sweep that tombstones them.
Retention is the same PII-lifecycle concern over the same rows as erasure, so it lives here —
I ask `booking` for the recency *fact*, but the window and the scrub are mine.
Since #386 I also own the **canonical form of an email address** (`customer.vocabulary.Emails`) —
the platform's one definition, used by my own services, by the platform edge, and by
`notification`, where it is the input contract of the suppression key's HMAC. It lives here
because the canonical form of an address is identity vocabulary, and it could *not* live in the
`shared` kernel: `shared` depends on `customer::api`, so my calling into it would close a cycle.

**Not My Job:**
- Bookings → **`booking`**; payment → **`payment`**
- Knowing whether a guest still has a recent booking → **`booking`** (it owns the table; I
  declare `customer.spi.GuestBookingHistory` and it implements the fact — a dependency
  inversion, because a direct `customer → booking` call would cycle)
- Operator accounts or staff logins → **`operator`** (I am the *tourist*; `operator`
  is the *venue's* people)
- Marketing → out of scope
- Encoding/verifying credentials + all login machinery (`UserDetailsService`, session,
  the register/login endpoints) → the **platform edge** (RV-BE-11); I own the account
  identity and store an opaque credential hash, never the login machinery

**Shipped** (S2 #111, epic #108): customer accounts — register + sign-in via a server-side
session, non-enumerating (D-8). The module graduated **thin → full** (gained
`CustomerAccountService`); no Spring Security type lives inside it, pinned by
`CustomerAuthPlacementTests`. **S4 (#112)** added **SSO identity linkage** — the
`SsoAccountProvisioning` port resolves-or-creates the account behind an external
`(provider, subject)` (find-or-create by verified email, auto-link; V27 `customer_sso_identity`),
still storing only identity + an opaque (now nullable, for SSO-only accounts) hash; the OIDC
redirect/token-exchange machinery stays at the platform edge. **S8 (#113)** added the
`CustomerAccountRecovery` `api/` port — issue/redeem single-use hashed **email-verification** and
**password-reset** tokens (`customer_account_token`, V28), **set-password** (closing the S4 SSO-only
gap), and a verified read — plus `email_verified` on the account (V28; SSO sign-in marks it
provider-verified). **#357** added one more read to that port: *whose account does this still-redeemable
reset token unlock?*, resolved **without consuming** it, so the edge can revoke that principal's
sessions before the reset writes anything. Email verification is **soft/non-blocking** (v1). Still no Spring Security type
inside the module (`CustomerAuthPlacementTests` green); the token digest and
recovery/set-password endpoints stay at the platform edge (RV-BE-11); mail transport moved
into **`notification`** (#382), which the edge drives through `notification::api`.

---

## `operator`
**Job:** Own operator accounts — incl. their **admin-driven lifecycle state**
(`PENDING`→`ACTIVE`/`REJECTED` on approval #115; `ACTIVE`⇄`SUSPENDED` on suspend/reinstate
#128) and the `is_admin` platform-admin flag — and the **operator↔venue ownership mapping**,
now writable (creator-owns-on-create). Answer five things for the rest of the system: *does
this operator own this venue?*, *which operators are awaiting approval?*, *which accounts
exist for an admin to act on?* (invariant #13), — since #357 — *what is the operator with
this id called, if it is in the status the caller expects?* (`usernameInStatus`), so the edge
can revoke its sessions **before** a session-revoking transition (suspend, and since #694
reject) commits rather than only after, and — since #693 — *does this venue have an `ACTIVE`
owner?* (`VenueVisibility`, the one home of the platform rule *a venue is visible to
tourists iff its owning operator is ACTIVE*; a venue with no ownership row answers no,
fail-closed). `venue` fences its catalogue reads with it and `booking` its reserve path;
sold-booking paths never consult it. **Since #694 the single `ACTIVE` predicate is three
explicit sets, each at its owner:** the edge's may-authenticate set (`ACTIVE`+`PENDING` —
approval gates tourist visibility, not console access), ownership resolution's may-operate
set (`ACTIVE`+`PENDING`, `OperatorDirectory` — a `PENDING` operator owns and works what it
creates), and the tourist-visible set (`ACTIVE` only, `VenueVisibility` — deliberately NOT
widened). The published status token (`OperatorStatus`, promoted to `vocabulary/`) is what
lets each predicate live with its owner. A suspension **keeps** the operator's
`operator_venue` rows — it is reversible, and a suspended operator resolves to nothing
either way — but it does hide the operator's venues from tourists until reinstatement
(#693). `ApprovalOutcome.Rejected` carries the username for the same reason `Changed` does:
a `PENDING` operator can hold a live session, and the edge must revoke it.

Since #375 an approval also **reports the approved operator's stored contact email**, on
`ApprovalOutcome.Approved` — the same move `OperatorLifecycleOutcome.Changed` made for the username,
and for the same reason: the caller needs it to act, and a second read would open a window. The
address is returned by the `RETURNING` clause of the very `WHERE status = PENDING` `UPDATE` that
performs the transition, so the admin that loses a race for one registration receives no address and
cannot act twice. Reporting a stored account attribute is still this module's job; what is done with
it — composing and sending a mail — is emphatically not (below).

**Not My Job:**
- Tourist identity → **`customer`**
- The venue's own data — map, pricing, pools → **`venue`** (I own *who may act on* a
  venue, not the venue itself)
- *Performing* the authorization check at each endpoint → each venue-scoped module's
  **application service** performs it by asking me; I own the mapping and answer, I
  don't sit in everyone's request path
- Bookings, payment, payout → their own modules
- Encoding/verifying credentials + the register/login/approval **and self-service
  password-change** endpoints + the `ROLE_ADMIN` mapping → the **platform edge** (Spring
  Security `UserDetailsService`, `AuthController`, `AdminOperatorController`,
  `OperatorAccountController`); I own the account identity + ownership mapping + the
  lifecycle **state transitions**, and store an opaque credential hash + an opaque
  `is_admin` flag — never the login machinery or the role gate (RV-BE-11). Note the shape
  of #326: it added a whole user-facing feature **without touching this module** — the edge
  verifies the old password, encodes the new one, and calls the `setPassword` I already
  published. That is the boundary working, not a gap in it.
- **Invalidating live sessions** when an account loses the right to them (suspension,
  rejection #694, credential rotation, an operator changing its own password #326) → the **platform edge**
  (`PrincipalSessionRevoker`, #128). I report *that the transition happened* and *whose* it
  was; deleting `SPRING_SESSION` rows is session machinery and I never import
  `org.springframework.session`
- **Telling an approved operator that its venues are now live** (#375; copy reworded by #693) → the **platform edge**
  (`OperatorApprovalMail`) driving **`notification`**. Same split as the line above, and for the same
  reason: I report *that the approval happened* and *which address it registered with*; deciding to
  mail, building the sign-in link, and delivering it are not mine. I import no mail type

**Shipped** (#73 module + per-venue `assertOwns` → `403` in every venue-scoped
application service; #74 per-operator DB-backed credentials — no shared password; **#115
self-registration → admin approval → creator-owns-on-create**). Since #115 the owns-all
**bootstrap operator is retired** — ownership is strictly the explicit `operator_venue`
mapping (`POST /api/venues` writes the creator's row atomically with the insert); the
bootstrap `operator` is **demoted to the platform admin** (`is_admin`, unlocked by
`RIVIERA_OPERATOR_PASSWORD`) that approves self-registrations. **#326** added operator
self-service password change **entirely at the edge — zero change to this module**, and
deliberately excluded the bootstrap admin, whose credential is env-managed. Still no Spring
Security type inside the module (`OperatorAuthPlacementTests` green). See
`docs/runbooks/operator-credential-provisioning.md`.

---

## `notification`
**Job:** Own transactional-mail **delivery** (#382): the `Mailer` transports (recording
mock vs real SMTP, profile-swapped, the mock prod-guarded) and the two delivery vehicles
of ADR-0011 decision 5 — the Event Publication Registry listener for **ids-only**
payloads, the bounded in-memory dispatcher for **bearer-credential** ones. The suppression
list and the delivery log below are the module's two pieces of owned state.

**Executors and shutdown:**

- Each vehicle drains on **its own bounded executor** (#383) — never Boot's shared
  `applicationTaskExecutor`, which carries the payment→booking and booking→payout
  listeners, so a degraded relay could otherwise starve the money spine. The registry
  listener therefore spells out `@Async("registryMailExecutor")` +
  `@TransactionalEventListener` instead of `@ApplicationModuleListener`, and holds no
  transaction across the send — pinned by `MailListenerExecutorArchitectureTest`, whose
  non-vacuity guard names all five shipped listeners off one list so the check cannot
  quietly start asserting nothing.
- The registry pool's size and queue depth are `riviera.notification.registry-mail.*`
  properties (#408; defaults `2`/`200`, validated at boot **on both ends** — a
  non-positive `queue-capacity` would yield a `SynchronousQueue` that sheds nearly
  everything, an oversized one would restore the unbounded queue the bulkhead removed,
  and both would boot clean) — so #370 can retune against a real relay without a deploy.
- Both pools' shutdown drain window is **derived** from
  `riviera.notification.mail.socket-timeout-ms` (#410), which every
  `spring.mail.properties.mail.smtp.*` timeout also interpolates, so the relay budget and
  the drain cannot drift apart; the drain arithmetic lives in `shared`'s `ShutdownBudget`
  (#456). When the window expires both pools **give up rather than interrupt** — an
  interrupt cannot tell a send that already reached the relay from one that has not.
- Both pools carry the submitting request's MDC through the shared `MdcTaskDecorator`
  (#455; `WorkerContextArchitectureTest` pins that every self-configured pool carries
  it), composed onto the registry pool via `CompositeTaskDecorator` **beside** the shed
  policy that already owns its decorator slot — replacing it would silently strand the
  episode flag open.

**Loss accounting** (names in `shared`'s `ObservabilityMetrics`; no tag names the person
— invariant #7 keeps the address off every one):

- `MAIL_REGISTRY_SHED` (#408): a shed registry send, escalating one log line per
  saturation *episode*.
- `MAIL_RECOVERY_DROPPED` (#415): the dispatcher's mirror — **every** drop is logged, not
  one per episode, because this vehicle has no durable record to make repeated lines
  redundant. A rejection during **shutdown counts here** (`reason=shutdown`, so a
  redeploy cannot read as a degraded relay) where the registry excludes it as a
  non-event; `reason=abandoned` (#434) is the send accepted and still queued when the
  drain window expired — counted by draining the queue *after* the window is awaited,
  which makes it a loss rather than a guess; the send caught **running** is deliberately
  excluded, being the one that may already have reached the relay. Read the name as
  *never ran*, not *refused*.
- `MAIL_RECOVERY_FAILED` (#423): the send this vehicle *accepts* and then cannot deliver
  — the likelier loss, and the first mail counter to move in a relay outage. Tagged by
  `kind` and by `reason` (`transport` / `suppression-lookup`), because the one swallowing
  catch can lose a mail to the relay or to a broken suppression read, and an operator
  acts on the cause.
- Both recovery counters carry `kind` (#442 widened the seam to
  `dispatch(MailKind, Runnable)`, the drain path included, retiring ADR-0011 decision 5's
  "mitigated only in part" clause), off one shared `MailKind` enum so the two cannot
  drift into two spellings.
- **The registry vehicle deliberately has no failure twin:** its transport failure
  propagates, the publication stays outstanding, and `riviera.outbox.pending` already
  accounts for it. That argument holds only for failures that *throw* — a mail this
  module **abandons** for a missing fact completes the publication by design, so each
  abandoning flow has a counter of its own, flow-named where `MAIL_RECOVERY_*` is
  vehicle-named (why they are sibling series rather than `kind` tags):
  `MAIL_CONFIRMATION_ABANDONED` (#428) and `MAIL_CANCELLATION_ABANDONED` (#374), tagged
  `no-booking`/`no-set`/`no-contact` off one shared reason enum and escalated per loss to
  `ERROR` — none of the three facts is reachable through any application path, so they
  are zero in a healthy system and read as data-integrity faults, not relay ones;
  `MAIL_PAYMENT_DUE_ABANDONED` (#373), the only abandoned flow whose loss is
  **predictive** — the sweep releases the set at the mailed deadline, so the errand it
  opens expires; and `MAIL_REQUEST_DECLINED_ABANDONED` /
  `MAIL_REQUEST_EXPIRED_ABANDONED` (#124).

**Owned flows and surfaces:**

- The **registry-borne booking mails**, all assembled from `booking`/`venue`/`customer`
  published ports (ids only) by one module-internal resolver: the `BookingConfirmed`
  confirmation (#371) — since #795 carrying the booking's `cancellationWindowAtBirth` +
  `lateCancelRefundBps` off the event, **rendered, never decided**: CLOSED or LATE-at-0-bps
  gets the non-refundable line, LATE-with-share the partial one, FREE or null (a pre-#795
  registry payload, tolerated forever) nothing; the `BookingCancelled` cancellation/refund record (#374) — one
  listener covering every cancellation channel, tourist self-service and operator weather
  refund alike, because it subscribes to the fact rather than to either caller, and
  **rendering** the server-computed refund (invariant #10), never deciding it; the
  `BookingPaymentDue` notice (#373), carrying the same #795 birth-window disclosure on the
  same rules — the listener decides nothing about *whether*
  payment is owed: `booking` settles that by publishing the fact only on the accept
  branch where money is genuinely outstanding (a failed PaymentIntent reverts the booking
  to `PENDING_REQUEST`), which a status read here could not learn without racing the
  stub's synchronous confirm; and the `BookingRequestDeclined` / `BookingRequestExpired`
  records (#124) — plain-record copy, no CTA; the withdraw leg deliberately mails nothing
  (#123).
- The **operator-approval notice** (#375), on the recovery vehicle
  (`kind="operator-approved"`) beside the two recovery kinds: it carries no bearer
  credential, but it is edge-orchestrated from an admin request rather than driven by a
  domain fact — which is why "recovery" in `MAIL_RECOVERY_*` names the *vehicle* and the
  `kind` tag names the flow.
- The **email-suppression list** (V32; hashed/non-PII at rest since V33 — a `v1:`-tagged
  peppered-HMAC `email_key` plus the cleartext `domain`, never the address, deliberately
  surviving erasure per ADR-0012; the pepper is env-managed, fail-at-boot in prod). The
  defining invariant — **no send to a suppressed address** — is enforced at the one send
  chokepoint (`TransactionalMailService`) on both vehicles, with one deliberate carve-out
  (#386): on the recovery vehicle a *transient* failure of the lookup itself sends the
  mail rather than dropping it, because the list is empty until #372's feed lands and D-8
  makes a dropped reset indistinguishable from success to the user; the registry vehicle
  still propagates, so at-least-once retries against a healthy DB. The lookup's
  `queryTimeout` is scoped to its own adapter — never the global property, which would
  also bound `availability`'s `INSERT … ON CONFLICT` claim (invariant #2). V34's `domain`
  CHECK mirrors the Java writer exactly.
- **Reinstatement is a flag, never a deletion** (#391, V35 — the one sanctioned exception
  to never-deleted, and still not a `DELETE`): the ADMIN-gated
  `POST /api/admin/email-suppressions/reinstate` sets `reinstated_at` (`isSuppressed`
  reads `email_key = ? AND reinstated_at IS NULL`), keeping `first_suppressed_at` and the
  prior `reason` so a reinstate→re-bounce loop stays visible; a later bounce clears the
  flag through the ordinary upsert. A hard `DELETE` on this table remains a defect.
- The **mail-outbox re-drive** (#405): an ADMIN-gated `GET`/`POST /api/admin/mail-outbox`
  reports what the registry still owes this module and re-drives it on demand, so the
  retry horizon for a failed confirmation stops being "the next deploy"
  (`republish-outstanding-events-on-restart` fires once, at boot). It is **scoped by
  listener-id prefix to this module's own listeners, never by event type** —
  `BookingConfirmed` fans out to `payout`'s accrual too, so an event-type predicate would
  replay invariant-#9 ledger work from a button labelled "mail" (`MailOutboxScopeIT`
  leaves an accrual outstanding and proves it is untouched). Two framework facts it rests
  on (issue #405 states both the other way round, having read the **v1** JDBC
  repository): V8 ships the **v2** schema, so `markResubmitted` is a real claim
  (`… WHERE ID = ? AND STATUS != 'RESUBMITTED'`) that makes duplicate delivery a database
  guarantee rather than an application one; and `ResubmissionOptions` reaches only
  `FAILED` publications — never a **shed** send, which by construction never ran and so
  was never marked failed. The single-flight + cooldown is therefore a throttle on the
  *sweep*, not the duplicate guard: during a relay outage every send fails fast and the
  whole scope is eligible again in milliseconds.
- The published surface is exactly **`notification::api`**, two deliberately role-split
  ports. `MailSender`: fire-and-forget, never throws, runs off the caller's thread,
  suppression-enforced; its contract is that a send influences **neither the triggering
  response's status nor its latency** (D-8, #369), which the anonymous `forgot-password`
  flow depends on. `MailDeliverability` (#400): the synchronous read "would a mail to
  this address be withheld right now?" — safe only where the caller already owns the
  address; its sole consumer is the authenticated verification-resend asking about its
  own session principal, and the one surface that *does* reflect the answer cannot ride
  the port whose contract is not to. Both are consumed by the composition root alone;
  **no module depends on `notification`**. Since #390 the module also *implements* one
  port it does not own — `booking.spi.ConfirmationMailDelivery`, answering "would this
  customer's confirmation mail be withheld?" for a confirmed booking's read model — the
  inverted edge; the dependency is still `notification → booking`.
- The **booking-confirmation delivery log** (#380; V36
  `booking_confirmation_mail_attempt`): one row per attempt, carrying what triggered it
  (`AUTOMATIC` / `ADMIN_RESEND`) and what became of it (sent / withheld-suppressed /
  transport-failed / abandoned), plus the ADMIN surface over it — a per-address lookup
  and a one-click **resend** (`/api/admin/mail-deliveries`, controller in my
  `adapter/in`). The log exists because the registry cannot answer the question:
  `completion_date` records that the listener *returned*, which it equally does for a
  suppression skip and an abandonment, so a registry-derived view would report
  "dispatched" for the two losses support actually calls about —
  `booking.spi.ConfirmationMailDelivery` already stated the rule that a consumer needing
  the *historical* fact records it at send time. The resend sends **synchronously through
  the chokepoint and publishes nothing**, so it re-drives no other `BookingConfirmed`
  consumer (invariants #8/#9 untouched by construction, pinned by `AdminMailDeliveryIT`)
  and the admin gets the real outcome rather than "queued".

**Not My Job:**
- Deciding **when** to send, minting/hashing recovery tokens, building the **tokenized** links →
  the **platform edge** (`CustomerRecovery`, RV-BE-11); for the edge-triggered kinds I am handed
  fully-formed messages and own only delivery. **#373 drew the line that rule always implied:**
  a *credential-material* link — one whose token I would have to mint, hash or time-bound — is the
  edge's, and a link I merely *format* from a fact already in my hand is mine. The registry-borne
  booking mails have no edge flow to build one (they are raised by listeners inside the hexagon)
  and the arrival code cannot ride the payload (invariant #7, it would be persisted as text), so
  `BookingLinks` composes `<base>/booking/<code>` here from the code I already read through
  `booking::api` to render into the body
- The recovery-token lifecycle/store → **`customer`** (`CustomerAccountRecovery`)
- Resolving an email address to a guest contact → **`customer`** (`CustomerLookup#findByEmail`, #380);
  and *which bookings* a contact has → **`booking`** (`CustomerBookings`). The address reaches
  `customer::api` and stops there — my delivery log stores a booking id and nothing else, so ADR-0010
  erasure has no copy here to reach
- The booking/venue/customer **facts** a confirmation renders → their owners, read via
  `api/` ports at send time
- Persisting a bearer-credential payload → nobody's job, ever: recovery mails ride the
  in-memory dispatcher precisely so the raw token never lands in `event_publication`
  (ADR-0011 decision 5)
- The provider bounce/complaint **feed** into the suppression list → the follow-up
  `adapter/in` slice (needs #370 provider setup); this slice ships the table + internal
  write path, provider-agnostic

**Shipped** (#382): the module itself — the mail machinery moved off the platform root
(restoring "nothing depends on the root, the root is a pure composition root + auth edge",
pinned by `CompositionRootDisciplineTests`), V31 rewriting the registry `listener_id` for the
moved listener, and the V32 suppression list enforced on both vehicles.

## `shared` (not a bounded context)

The **Shared Kernel** (Evans, DDD ch. 14), extracted from the root package in #371 —
`ApiProblem`, `CurrentOperator`, `CurrentCustomer`, `InvalidApiRequestException`,
`ObservabilityMetrics`, `ShutdownBudget`,
`MdcTaskDecorator`, `ResubmissionThrottle` + `ResubmissionOutcome`. An
`@ApplicationModule(type = OPEN)`: technical shared code, so it publishes no
`api`/`vocabulary` surface and consumers use its types directly.

**Job:** hold the handful of edge types that bounded contexts legitimately share — the
RFC-7807 error-contract factory (#97) and the **typed edge-validation signal**
(`InvalidApiRequestException`, #118 — the one exception the advice maps to
`400 INVALID_REQUEST`, admitted on the same ownership ground as `ApiProblem`: the
exception→status contract belongs to the composition-root advice no module may depend on,
while module adapters are its throwers), the accessors that resolve an authenticated
principal to a typed id, the **platform's metric names** (`ObservabilityMetrics`: the
money-path trio from #100, plus the mail-loss counters — the registry-mail shed added by
#408, the recovery-mail drop by #415, the recovery-mail transport failure by #423, the abandoned
booking confirmation by #428, the abandoned cancellation record by #374, the abandoned
request-outcome records by #124 and the abandoned
payment-due notice by #373), the **platform's shutdown budget** (`ShutdownBudget`, #456 — the
SIGTERM grace and every draining pool's claim on it, summed by `ShutdownDrainArchitectureTest`, which
**discovers** draining pools from bytecode rather than from the context, since the context would miss
the `defaultCandidate = false` bulkheads and the non-bean recovery pool), the **one way a pooled worker inherits
its submitter's logging context** (`MdcTaskDecorator`, #455), and the **once-only guard behind an
admin outbox-resubmit lever** (`ResubmissionThrottle` + its `ResubmissionOutcome` vocabulary, #454 —
single-flight plus a construction-seeded cooldown, so a press cannot race the registry's boot
republication; each lever module keeps its own scope, window value and log noun). Nothing else.

> The metric-name clause is deliberately about *names*, not about observability. A name is a
> `String` constant, compile-time-inlined, with the emission staying in the module that owns
> the thing being measured — `payment` emits `REFUNDS_FAILED`, `booking` emits `REFUNDS_SHED`
> (#404's refund-pool shed), `notification` emits all eight of
> `MAIL_REGISTRY_SHED`, `MAIL_RECOVERY_DROPPED`, `MAIL_RECOVERY_FAILED`,
> `MAIL_CONFIRMATION_ABANDONED`, `MAIL_CANCELLATION_ABANDONED`,
> `MAIL_PAYMENT_DUE_ABANDONED`, `MAIL_REQUEST_DECLINED_ABANDONED` and
> `MAIL_REQUEST_EXPIRED_ABANDONED`, including the latter seven's
> `kind`/`reason` tag values, which are the emitter's vocabulary and stay with it. #408 widened the remit from "money-path metrics" to "metric names"
> explicitly rather than let a second convention grow, because the alternative — each module
> declaring its own — leaves the codebase with two answers to "where is a metric name written
> down" and no way to check one against the other. Note the names are admitted on a justification
> unique to them — **consistency of the naming convention**, not need: all the mail counters have a
> single reader today, so "more than one module needs it" would not have carried them. That is a
> narrower claim than the other entries make — hold new *metric-name* entries to it.
>
> **No admission here has ever rested on reuse, and the three newest say so explicitly.**
> `ShutdownBudget` (#456) because no bounded context owns how long the process has to close;
> `MdcTaskDecorator` (#455) because none owns how a pooled worker inherits the submitting request's
> logging context — the sharper case, since that mechanism's other half
> (`CorrelationIdFilter`) lives at the composition root no module may depend on, leaving a
> module-owned home structurally unavailable to the second consumer; and `ResubmissionThrottle` +
> `ResubmissionOutcome` (#454) because what the guard throttles — a sweep of the platform's one
> Event Publication Registry against the root-configured boot republication — is likewise nobody's
> context, and the second lever module (`booking`, after `notification`'s #405) recreated the
> decorator's structural bind. Three modules wanting a type is
> the trigger for asking the question; the answer is always ownership. (#455 overturned #410's
> placement of the decorator in `notification` — that decision's stated ground was "both users are
> inside this one module", which #404's refund pool falsified. #454's plan first made the same shape
> of call — "two small per-module sweep policies are the cheaper coupling" — and the merge bar's
> duplication gate falsified it before the PR even merged.)

**Not my job:**
- **Any business logic or module-owned state** → the owning bounded context. This package
  is not a home for "code used in more than one place"; a shared kernel earns its keep only
  while it stays tiny and stable, because a change here ripples through every context.
- **Depending on a module that depends back** → it may reach only `customer::api` and
  `operator::api`, the two modules that do not depend on it. Anything wider re-creates the
  cycle it exists to remove.
- **Being the composition root** → that stays the root package (`PlatformApplication`,
  `SecurityConfig`, the controllers). The whole point of the split is that the
  root *depends on* modules while `shared` is *depended on by* them; putting both in one
  package is what closed `booking → root → booking`. (The mailers, once the root's
  biggest tenant, moved on to the `notification` module in #382.)

## Machine-checked vs review-checked

The boundaries above split into a **structural** half the build enforces as fitness
functions, and a **semantic** half no import rule can see. **A green architecture-test
run must never be read as "boundaries fully enforced"** — the tests are necessary, not
sufficient.

**Machine-checked** (fails the build; all under
`platform/src/test/java/ai/riviera/platform/`):

| Clause of this file | Fitness function |
|---|---|
| `availability` is the **only writer** (and direct reader) of `set_availability` — invariant #2 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| Only `payment` talks to Stripe — the SDK is unreachable elsewhere | `ResponsibilitiesArchitectureTests` (Stripe-reach rule) |
| Events carry technical ids/values, never foreign aggregates — invariant #11 Need-To-Know | `ResponsibilitiesArchitectureTests` (id-based-events rule) |
| `payment` uses no Stripe **Connect** API (collect-only, ADR-0002) | `NoStripeConnectArchitectureTest` |
| No module reaches another's `application`/`domain`/`adapter` internals; `allowedDependencies` deny-lists hold | `ModularityTests` (`ApplicationModules.verify()`) |
| The ADR-0007 package shape; published-surface kinds (`api`/`spi`/`vocabulary`/`events`); the `VenueCatalog` role split | `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`, `VenueApiRoleSplitTests` |
| No JPA/Hibernate on the classpath — invariant #1 | `JdbcOnlyArchitectureTests` |
| No login machinery inside `operator` (RV-BE-11) | `OperatorAuthPlacementTests` |
| No login machinery inside `customer` (RV-BE-11) | `CustomerAuthPlacementTests` |
| Mail listeners name their own bounded executors, never Boot's shared `applicationTaskExecutor` (#383) | `MailListenerExecutorArchitectureTest` |
| `booking` listeners reaching `payment::api` run on the bounded refund pool, not the shared one (#404) | `RefundListenerExecutorArchitectureTest` |
| Every self-configured worker pool carries the shared MDC decorator (#455) | `WorkerContextArchitectureTest` |
| The draining pools' shutdown claims sum within the platform's SIGTERM grace (#456) | `ShutdownDrainArchitectureTest` |

Each rule is proven able to fail on every build, against deliberately-violating fixtures
(`ai.riviera.responsibilityfixture`, `ai.riviera.placementfixture`) — never by breaking
production code.

**Review-checked only** (the semantic half — needs **no illegal import**, so it cannot
be encoded; owned by the plan-time Module-ownership table, `riviera-plan-doc` §4a, and
review item RV-BE-11):

- A refund **policy** reimplemented inside `payment` (only `booking` decides
  whether/how much to refund; `payment` executes).
- Commission **math** inside `venue` (it stores the rate; only `payout` computes).
- A booking-lifecycle decision creeping into `availability` (it holds state, not the
  cutoff rule), or any other capability landing on a module's Not-My-Job list without
  crossing a package boundary.

Known scan limits (documented on the tests): the sole-writer rule keys on the contiguous
whole-word table name in compiled constant pools — SQL assembled by string concatenation
could evade it (the text-block-SQL idiom keeps names contiguous). The id-based-events rule
unwraps generics and arrays (a `List<Aggregate>` component is caught), but only for the
component's declared type.
