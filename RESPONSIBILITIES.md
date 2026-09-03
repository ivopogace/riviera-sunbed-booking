# System Responsibilities

The Job / Not-My-Job boundaries for each module in the `ai.riviera.platform`
modular monolith. This is the plain-English companion to `CLAUDE.md`: `CLAUDE.md`
holds the module table and the invariants in one sentence each; this file holds the
invariants' long form, the settled platform-edge rules, and — for each module — what
it owns and, more usefully, what it must **refuse to own**. When a boundary is ambiguous
in a plan or review, this is the tie-breaker. Present-tense contracts only: the history
behind a rule is on its issue, PR or ADR.

Modules: `venue`, `availability`, `booking`, `payment`, `payout`, `customer`,
`operator`, `notification`, and `review`. Cross-module collaboration is **events for
state changes, `api/` ports for queries** (invariant #11).

The **structural** subset of these boundaries is machine-enforced — see
[Machine-checked vs review-checked](#machine-checked-vs-review-checked) at the end
of this file for exactly which clauses the build verifies and which remain
review-only.

## Main Use Case — Book and manage one sunbed reservation (Instant Book)

1. A tourist browses venues and opens one; they see the beach map and which sets are
   free for a chosen date. The map and set layout come from **`venue`**; which of those
   sets are free on that date comes from **`availability`**.
2. The tourist picks a set + date and gives guest-checkout contact. **`customer`** owns
   that contact; **`booking`** opens a booking.
3. **`booking`** reserves the set: it asks **`availability`** to claim the `(set, date)`
   row **atomically** — so it can never be double-sold — and commits the booking as
   `AWAITING_PAYMENT`. The claim happens **before** any money moves.
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
   code) flips the booking `CONFIRMED → COMPLETED`, exactly once. Staff can also
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
mode (Instant / Request), venue photos, the sales-close setting, and the commission rate
over time. The standing rules:

- **The tourist catalogue reads are visibility-fenced.** All three `VenueCatalog` reads
  (list, map, availability calendar) consult `operator.api.VenueVisibility` inside the
  adapter, so a venue whose owning operator is not `ACTIVE` is absent from the list and 404
  on the map and calendar — indistinguishable from nonexistent. The public review list
  applies the same fence in `ListVenueReviewsService` before asking `review`.
  `SetBookingFacts` is deliberately **unfenced**: its consumers include sold-booking paths
  (cancel, view, mails, staff marks) that must keep answering for a hidden venue's sets;
  the reserve path applies the fence itself in `booking`. The anonymous content-hash photo
  read is unfenced.
- **Venue photos** (ADR-0008): per-slot upload/replace/delete, processing, `bytea` storage
  behind the module-internal `PhotoStorage` port, and the public content-hash serving read.
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
- **A layout write that a live claim depends on is refused.** The bulk replace deletes
  every set, so it asks the venue-wide question (`LAYOUT_IN_USE`); `editSet`/`removeSet`
  touch one set, so they ask the set-scoped one (`SET_IN_USE`) under `SELECT … FOR UPDATE`.
  The row-scoped display writes `repriceRow` and `renameRow` destroy nothing and ask no
  claim question.
  - *Availability arm:* every claim-probing write asks one question — is there a hold on
    these sets dated today or later — through `hasLiveHold`. A past hold freezes nothing;
    a past date is never claimable (reserve and staff mark both refuse it), so the range
    the probe ignores is one nothing can be written into.
  - *Booking arm:* `removeSet` and the replace refuse on a booking of **any status ever
    recorded** (the RESTRICT `booking.set_id` FK makes such a set undeletable, so refusing
    early turns a 500 into a 409); `editSet` refuses only on a non-terminal booking, and
    only when the command would repool or reposition the set — a price-or-tier-only edit
    is never refused. Consequence, by design: a venue with one ancient cancelled booking
    answers `LAYOUT_IN_USE` on delete/regenerate forever.
  - Which statuses are live is `booking`'s call (`BookingStatus#isTerminal`, reached through
    `BookingPresence#hasLiveBookings`); `venue` never enumerates booking statuses. Price,
    tier and the row's name stay editable on a claimed set: a booking's charge is
    snapshotted at reserve time, and `row_label` lives on `set_position` alone, so a guest
    already booked into a renamed row reads the new name live while the mail in their
    inbox keeps the old one.
  - A rename is refused only for `ROW_NAME_TAKEN` (another row already carries the label);
    renaming a row to its own label is a no-op. The bulk replace enforces the same
    one-label-one-physical-row rule within its batch (`ReplaceRejection.ROW_NAME_TAKEN`);
    the single-set `addSet`/`editSet` paths do not yet check it.
  - Because the pool is **mutable** layout data, `SetBookingFacts#poolForClaim` is a
    **locking** read (`FOR KEY SHARE`, the weakest lock that conflicts with the edit's
    `FOR UPDATE`). It must run in a transaction, never a read-only one; the unlocked
    `setBookingInfo` serves list and mail reads.
- **The commission rate over time, not just its current value.** `venue_commission_rate`
  is the effective-dated schedule behind `VenueRates#commissionBpsOn` — the rate that
  applied to bookings served on date D, for reporting reads — while `commissionBps` is
  the live rate every *decision* re-reads. `payout` keeps the arithmetic. The
  platform-admin rate write is ownership-free, on its own `VenueCommissionAdministration`
  port, and **forward-only by construction**: it pins the superseded rate, moves the live
  column, and schedules the new rate from the **current** service date (`Europe/Tirane`),
  so no past service date reprices and no ledger entry is touched (invariant #9). The
  owner's profile PATCH cannot write the rate — a venue does not set its own commission.
- **The per-venue sales-close setting** (`sales_close`, invariant #4): a fixed-vocabulary
  wall-clock time (`00:01`/`16:00`/`23:59`, `Europe/Tirane`) naming when a venue's online
  sales for a date close, on the date itself. `SetBookingFacts#setBookingInfo` carries it
  to `booking`'s reserve path (`BookingCutoff#salesCloseAt`). Owner-editable: a required
  field of the profile full-replace PATCH and optional on create (absent → 16:00), spoken
  on the write path as the `venue/domain/SalesClose` enum (the one Java mirror of the
  CHECK, so an off-vocabulary value is a `400` at the edge); the read model and the
  cross-module carriers keep `LocalTime`. The console's "close today's online sales now"
  is the same write — no per-day override. The list and map reads also *project* the
  open/closed verdict for the selected date as `salesOpen`, through my `spi` port
  `SalesWindow` (implemented by `booking`) with one request-scoped instant per read; the
  port returns the *verdict*, never a close instant — I store the time and display the
  answer, `booking` keeps the rule. The map read also projects the stored close value
  (`salesClose`, `HH:mm`) as a display-copy key; clients never compare it with a clock.
- **The tourist availability calendar**
  (`GET /api/venues/{venueId}/availability-calendar?from=&to=`; public, window-capped at
  the edge): I own the set total and therefore `free = total − taken` and the gap fill;
  `availability` answers the taken count per day through my `spi`
  (`SetAvailabilityLookup#takenCountsBetween`). It does not reuse the operator-only
  `/availability` segment. The counts are a snapshot, never a hold (invariant #2), and the
  read answers past days too — it reports availability, not bookability.
- **The public review list** (`GET /api/venues/{venueId}/reviews?cursor=`; public,
  keyset-paged newest first): I carry it, `review` decides it. My service fences on
  tourist visibility and passes the page `review.api.ListedReviews` answers straight
  through; which reviews are listed, their order and the page size are `review`'s
  contract. The endpoint lives here because the fence is my catalogue rule and `review` is
  a leaf that cannot consult `operator` (ADR-0015).
- **The signed-in operator's own-venues read model** (`GET /api/venues/mine`): I ask
  `operator::api` for the ownership set and join the names — naming venues is my job and
  `operator → venue` would cycle.
- **The owner's per-set daily availability read**
  (`GET /api/venues/{venueId}/availability?date=`; owner-asserted, 403-before-existence):
  I own the set list and the map composition; `availability` answers the per-`(set, date)`
  state tokens through my `spi` (`SetAvailabilityLookup#statesOn`). The public tourist map
  stays state-agnostic (`FREE`/`TAKEN`) — hold type never reaches the public surface.

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
exist. `venue` composes; I answer state.

**Not My Job:**
- The venue layout, which sets exist, or their positions → **`venue`**
- *Why* a set is taken — which booking, who paid → **`booking`**
- Deciding whether bookings are even open for a date (sales close) → **`booking`** owns
  that rule; I only hold state
- Pricing → **`venue`**; payment → **`payment`**

---

## `booking`
**Job:** Own bookings, booking codes, and the lifecycle. The standing rules:

- **Check-in** is the venue-scoped, service-date-only `CONFIRMED → COMPLETED` transition
  off the scanned or typed booking code — single-use by the row lock (a second scan reads
  "already checked in"), keyed on the code but authorized by venue ownership (invariants
  #13 and #7). It publishes **no** event: nothing accrues, nothing refunds, no mail.
- **The no-show sweep** marks every `CONFIRMED` booking dated before today
  (`Europe/Tirane`) `NO_SHOW` in **batches** (500 rows, at most 20 a run, each committing
  on its own, `FOR UPDATE` without `SKIP LOCKED`), so a run cut short resumes next tick.
  It writes **no availability row**: freeing a past claim would make it re-claimable
  (invariant #2). Arrivals and daily takings count `COMPLETED` **and `NO_SHOW`** beside
  `CONFIRMED`. The guest-cancel guard is `CONFIRMED`-only; the admin **weather refund**
  admits `NO_SHOW` on its own `cancelForWeather` transition, because the storm is known
  afterwards — the two share no port method.
- **`BookingCutoff` is the module-wide day-boundary authority** (`application/` root):
  `salesCloseAt` (the venue's setting per date — gates creation and caps a pending
  request's response deadline at `min(created + expiry-window, D at sales close)`;
  also answers the tourist browse through `venue.spi.SalesWindow`, display-only — the
  reserve path enforces independently), `freeCancellationEndsAt` (the evening-before
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
  cancel, check-in, sweeps) consults visibility.
- **The request lifecycle's three terminal legs** live on `RequestReleaseService`:
  decline, the expiry sweep, and the guest's **withdraw**. Withdraw is authorized by the
  booking **code** alone (the only request command with no ownership check) and guarded by
  status alone, not deadline — so on an overdue row the **row lock**, not the predicates,
  leaves exactly one transition and one release (`ConcurrentRequestTerminationIT`). It
  publishes **no** event: nothing accrued and nothing was collected, and a
  `refundMinor = 0` `BookingCancelled` would mail the guest a cancellation record for a
  request they retracted.
- **Notification-facts reads:** the arrival code + contact id
  (`BookingNotificationFacts#notificationInfo`), the wider `#confirmationFacts` an admin
  resend rebuilds a mail from, and `CustomerBookings` (which bookings one contact has,
  a separate consumer role). Neither publishes the lifecycle enum: both answer
  `everConfirmed` (from `confirmed_at`), which keeps `BookingStatus` internal.
- **The code-gated view reports an outstanding refund** — decided by me, not yet accepted
  by the gateway — asked lazily through `payment.api.RefundStatusLookup`, so the panel
  says "being processed" rather than "in transit" while the refund sits in the outbox.
- **The refund listener drains on my own bounded executor** (`riviera.booking.refund.*`,
  validated at boot), never Boot's shared `applicationTaskExecutor`, and runs **outside a
  transaction**: the refund path records its attempt before the gateway call, and a
  transaction would hide that write for exactly the window it covers (§`payment`). The
  listener makes blocking gateway round-trips (≈25s worst case per call, up to three per
  refund) and `WeatherRefundService` dispatches a whole venue-day in one transaction.
  Saturation **sheds** to `ObservabilityMetrics.REFUNDS_SHED` and the publication stays
  outstanding for the restart republish; the queue is sized so shedding is unreachable
  for any plausible burst. Structural: `RefundListenerExecutorArchitectureTest`, scoped to
  `booking` listeners reaching `payment::api`.
- **The ADMIN refund-outbox re-drive** (`GET`/`POST /api/admin/refund-outbox`) is scoped
  to the refund listener's **exact id** — never the `booking` package prefix, which would
  sweep `PaymentEventListener`'s payment→confirm spine (`RefundOutboxScopeIT`).
- **The withheld-mail flag on a confirmed booking's read model** is asked through
  `booking.spi.ConfirmationMailDelivery` by `CustomerId` — I never handle an address. The
  gate is two-part: the booking must be `CONFIRMED` **and** `payment.api.CollectionGuarantee`
  must say this deployment's gateway collects before confirming (the in-process stub does
  not, so the flag is inert there — otherwise it would be a free suppression oracle).

**Not My Job:**
- Owning the `(set, date)` availability state → **`availability`** (I *ask* it to claim)
- Talking to Stripe or moving money → **`payment`** (I call `payment.api.RefundPort` and
  never learn which gateway is behind it)
- Computing the payout or commission → **`payout`** (my `BookingConfirmed` *triggers*
  accrual)
- The venue map, pricing, or pool rules → **`venue`**
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
- **Adoption is narrow: exactly one live refund, for exactly the amount requested.**
  Anything else (several live refunds, a different amount — a manual dashboard refund) is
  `Failed("refund_mismatch")`: topping up a shortfall would be a refund **decision**, which
  is `booking`'s. `Failed` keeps the publication outstanding and lights
  `riviera.refunds.failed`, which never clears itself: a human settles it at the gateway.
- **Adoption is visible** — `riviera.refunds.adopted`: an earlier attempt moved the money
  and lost the response.
- The refund create **replays once on a connection timeout** with the same key (one shared
  helper with the PaymentIntent path).
- **A refund the gateway later reports as dead is un-recorded.** A `pending` refund stays
  adoptable (it is where a refund normally starts), so the fix acts on the gateway's later
  word: a signature-verified refund-lifecycle event, branched on the **refund's status**,
  clears `refunded_minor` and restores `SUCCEEDED`. All three event types are handled,
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
- **At-most-once is the port's contract, enforced.** `PaymentGatewayRefundContract`
  states it once against `PaymentGateway` on a fixture that never dedupes on the key, plus
  the opposite guard (a refund that returned nothing must **not** be adopted). A coverage
  rule makes it unskippable: every production `PaymentGateway` is either covered by a
  contract subclass or non-collecting (read from the `@Profile` that binds a gateway to
  its `CollectionGuarantee`), so a new gateway adapter (ADR-0009) arrives unclassified and
  fails the build.
- **The refund attempt is recorded before the gateway is asked** (`markRefundAttempted`),
  and every refund write is a guarded statement that reports whether it moved:
  - A verified failure arriving **before the refund id is written** (the create's timeout
    replay leaves tens of seconds between Stripe minting the refund and the row write) is
    matched by **PaymentIntent** instead of by an id that does not exist yet.
  - The attempt is the **discriminator** that makes by-intent matching safe: a refund
    issued by hand at the gateway is money the platform never promised, and with no
    attempt on record the by-intent arm moves nothing.
  - The recorded death **blocks the record that lost the race**: `markRefunded` refuses a
    refund id already reported dead (`Failed("refund_died_before_record")`), so the
    publication stays outstanding and a re-drive past the key window creates a fresh
    refund. A refund recorded and *then* dead is unchanged.
  - One incident may increment `riviera.refunds.failed` **twice** (the webhook counts the
    refund it killed, the recording call counts its refusal); the debt gauge still reads
    one booking. The counter measures observations, `riviera.refunds.owed` measures debts.
  - **`markRefunded` moves only a collected payment.** Unguarded, it and
    `markRefundFailed` could fabricate a collected payment out of a
    `REQUIRES_PAYMENT`/`FAILED`/`CANCELED` row. The guard is what makes the hard-coded
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
**Job:** Own the venue payout ledger (Σ booking amounts − commission) and the manual BKT
batch reporting. Accrue **idempotently** — a booking contributes exactly once; a refund
reverses it. The promise is **order-independent**: a refunded cancellation that finds no
`ACCRUAL` to mirror *defers* (the listener throws, so its publication stays outstanding
and `riviera.outbox.pending` shows it) rather than treating the absence as "nothing to
reverse".

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
  `BookingRequestDeclined` / `BookingRequestExpired` records — plain copy, no CTA. The
  withdraw leg mails nothing.
- The **operator-approval notice**, on the recovery vehicle (`kind="operator-approved"`):
  no bearer credential, but edge-orchestrated from an admin request rather than driven by
  a domain fact — which is why "recovery" in `MAIL_RECOVERY_*` names the *vehicle* and
  `kind` names the flow.
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
- The **booking-confirmation delivery log** (`booking_confirmation_mail_attempt`): one row
  per attempt, carrying what triggered it (`AUTOMATIC` / `ADMIN_RESEND`) and its outcome
  (sent / withheld-suppressed / transport-failed / abandoned), plus the ADMIN surface over
  it — a per-address lookup and a one-click **resend** (`/api/admin/mail-deliveries`). The
  log exists because the registry's `completion_date` records only that the listener
  *returned*, which it equally does for a suppression skip and an abandonment. The resend
  sends **synchronously through the chokepoint and publishes nothing**, so it re-drives no
  other `BookingConfirmed` consumer (`AdminMailDeliveryIT`).

**Not My Job:**
- Deciding **when** to send, minting/hashing recovery tokens, building the **tokenized**
  links → the **platform edge** (`CustomerRecovery`); for edge-triggered kinds I am handed
  fully-formed messages. The line: a *credential-material* link — one whose token I would
  have to mint, hash or time-bound — is the edge's; a link I merely *format* from a fact
  already in my hand is mine (`BookingLinks` composes `<base>/booking/<code>` from the code
  I read through `booking::api`; the code cannot ride the payload, invariant #7)
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

**The withheld-flag probe** (read before wiring the first writer of the suppression list). The
`emailWithheld` flag on the code-gated booking read makes a populated list an expensive suppression
oracle: an attacker books with a victim's address, pays, reads the flag, then cancels before the
invariant-#4 cutoff for a full refund. Three facts bound it. Nothing writes the table today
(reinstatement only lifts a row), so the probe returns zero bits until the bounce/complaint feed
lands — that feed is the residual's trigger. A dedicated rate-limit budget would not bind: the
attack's real limiter is one real gateway payment plus one claimed `(set, date)` per probe, and
any capacity that leaves the pay page's legitimate poll alone (ADR-0006) sits orders of magnitude
above that floor. And passing the flag only through the post-payment hand-off is no option under a
collecting gateway: the code-gated read *is* the hand-off, and the prober is the payer, so one read
is all a probe needs. The two-part gate (`CONFIRMED` **and** `payment.api.CollectionGuarantee`) is
what keeps the flag inert wherever the gateway does not collect before confirming.

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
  function — hidden, unknown stay, never checked in, window closed, already rated,
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

**Not My Job:**
- Writing `venue.rating_tenths` / `reviews_count` → **`venue`** (I compute and announce)
- Deciding a stay was delivered, or owning `completed_at` → **`booking`**
- Displaying a rating, ordering Discover by it, or the "New" treatment → **`venue`** and
  the frontend
- The guest's identity → **`customer`**. A review is attached to a *booking*, not a
  person; the display name is a label the author chose, handed to me on the write; the
  form's prefill suggestion is `booking`'s to derive
- Login, sessions, CSRF, rate-limit wiring, the ADMIN role gate and the admin audit record
  → the platform **edge**
- Deciding *whether* a review deserves a takedown → the **platform admin** (publish-first,
  report-and-remove; I offer no queue and no reporting)
- Deciding *that* a data subject's reviews are erased, or which bookings are theirs →
  **`customer`** and **`booking`**; I am handed booking refs and blank my own rows

## `shared` (not a bounded context)

The **Shared Kernel** (Evans, DDD ch. 14): `ApiProblem`, `CurrentOperator`,
`CurrentCustomer`, `InvalidApiRequestException`, `ObservabilityMetrics`, `ShutdownBudget`,
`MdcTaskDecorator`, `ResubmissionThrottle` + `ResubmissionOutcome`. An
`@ApplicationModule(type = OPEN)`: technical shared code, so it publishes no
`api`/`vocabulary` surface and consumers use its types directly.

**Job:** hold the handful of edge types that bounded contexts legitimately share, each
admitted on **ownership, never reuse** — the type lives here because no bounded context
can own it, not because several use it:

- the RFC-7807 error-contract factory (`ApiProblem`) and the **typed edge-validation
  signal** (`InvalidApiRequestException`, the one exception the advice maps to
  `400 INVALID_REQUEST`): the exception→status contract belongs to the composition-root
  advice no module may depend on, while module adapters are its throwers;
- the accessors that resolve an authenticated principal to a typed id;
- the **platform's metric names** (`ObservabilityMetrics`): a name is a `String` constant,
  compile-time-inlined, and the emission stays in the module that owns the thing measured
  (`payment` emits `REFUNDS_FAILED`, `booking` `REFUNDS_SHED`, `notification` the mail
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
- **Any business logic or module-owned state** → the owning bounded context. This package
  is not a home for "code used in more than one place"; a shared kernel earns its keep
  only while it stays tiny and stable, because a change here ripples through every context.
- **Depending on a module that depends back** → it may reach only `customer::api` and
  `operator::api`, the two modules that do not depend on it.
- **Being the composition root** → that stays the root package (`PlatformApplication`,
  `SecurityConfig`, the controllers). The root *depends on* modules while `shared` is
  *depended on by* them; putting both in one package is what closed
  `booking → root → booking`.

## Platform edge (settled)

The cross-module edge rules, restated here in one place because no single module owns them
(the per-module consequences sit in §`customer` and §`operator`): server-side sessions (Spring
Session JDBC) with **two principal types**; all login/session machinery lives at the edge,
never in modules; customer-account identity is separate from the guest row — no FK, no
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
self-hosted ALTCHA v2 challenge, entirely at the edge: `ChallengeController` (`GET /api/auth/challenge`,
`permitAll`, its own per-IP rate-limit budget, `no-store`, no session — the only cookie on it is the SPA's platform-wide `XSRF-TOKEN` bootstrap) issues a challenge signed with the
`RIVIERA_ALTCHA_HMAC_SECRET` secret and expiring `riviera.altcha.expiry` (10 minutes) after the injected
clock; `ChallengeVerificationFilter`, registered after `RateLimitFilter` and `CsrfFilter`, requires the
widget's solution in the `X-Altcha-Payload` header on each fenced `POST` (customer register today;
operator register, forgot-password and booking create in their own slices) and refuses with `400` and a
stable code — `CHALLENGE_REQUIRED` (absent), `CHALLENGE_INVALID` (unparseable, forged, wrong answer),
`CHALLENGE_EXPIRED` (past expiry, or already accepted once). Deliberately `400`, never `403`: the rate
limiter refunds a `403` on the budgets that guard authenticated work, and a refused solution must still
have cost its token. `ProofOfWorkChallenges` wraps the official `org.altcha:altcha` library (the expiry
check is the library's, by the server clock; the client clock never enters); a verified solution is
accepted only if `INSERT … ON CONFLICT DO NOTHING` claims its nonce in `challenge_registry` (V49) — the
one place the edge departs from the rate limiter's in-memory precedent, because a restart or a second
instance must not reopen a replay window. `ChallengeRegistrySweep` deletes rows whose expiry lies more
than `riviera.altcha.clock-skew` in the past, which is where instance clock skew is absorbed.
`riviera.altcha.enabled=false` is the kill switch: the fenced routes admit header-less requests and the
endpoint answers `204`, which the SPA reads to hide the widget. `riviera.altcha.cost` (5000) is a
measured default — Chromium under mobile emulation in the slice's prototype, scaled by per-core
throughput to an estimated 1–2 s on a mid-range phone; a real-device check is the pre-launch item. What
it is not: no ALTCHA hosted service is ever called, no module knows the challenge exists, and login is
not fenced (the per-identity throttle covers it).

## Invariants, long form

`CLAUDE.md` states each cross-cutting invariant in one sentence; this is the long form, with
the mechanism and the edge cases. The numbering is `CLAUDE.md`'s and never changes.

1. **No JPA/Hibernate — JDBC only.** `spring-boot-starter-data-jpa` never on the classpath;
   no `@Entity`/`EntityManager`. Spring Data JDBC aggregates and/or `JdbcTemplate` with
   explicit SQL.
2. **Availability is the single source of truth, per `(set, date)`.** Every channel — online
   booking and staff tap-to-mark — writes the same `availability(set_id, booking_date)` row;
   a set is held by at most one party per date. Enforced in the database (unique constraint)
   AND in the reservation transaction (`SELECT … FOR UPDATE` or an atomic `INSERT … ON
   CONFLICT DO NOTHING` claim). Never double-sell a set. The write happens synchronously at
   claim time via `availability`'s `AvailabilityClaim` port — `availability` has no event
   listener.
3. **Online and walk-in pools are separate.** Each set carries a pool flag; an online booking
   can only target an online-pool set.
4. **Sales close is venue-controlled, on the day itself.** A date D's online sales window
   runs until the venue's `sales_close` wall-clock time on D — a per-venue setting fixed at
   one of three values (`00:01` opts the venue out of same-day sales, `16:00` the default, or
   `23:59`), `Europe/Tirane`. A pending request's response deadline is capped at that same
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
   confirm a booking from a client-side redirect; reconcile from signature-verified
   webhooks; idempotency keys on charge/refund creation; collection-only, no Stripe Connect
   (`riviera-stripe-payments`).
9. **The payout ledger is auditable and idempotent.** A booking contributes to a venue's
   payout exactly once; refunds reverse it. Payout = Σ(booking amounts) − commission (rate
   stored per venue, effective-dated, forward-only). Payouts settle manually via BKT; the
   ledger is the record. Accrual/reversal is order-independent and idempotent.
10. **Cancellation/refund policy is enforced server-side.** Free cancellation until the #4
    cutoff → full refund; after → non-refundable (or partial); the window closes entirely at
    service-day open (00:00 `Europe/Tirane`) — a guest cancel is then refused, not refunded
    (ADR-0005 as amended). The weather exception is a manual admin-triggered full refund,
    deliberately outside that fence. Refund decisions are computed on the server.
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
sufficient.

**Machine-checked** (fails the build; all under
`platform/src/test/java/ai/riviera/platform/`):

| Clause of this file | Fitness function |
|---|---|
| `availability` is the **only writer** (and direct reader) of `set_availability` — invariant #2 | `ResponsibilitiesArchitectureTests` (sole-writer bytecode scan) |
| Only `payment` talks to Stripe — the SDK is unreachable elsewhere | `ResponsibilitiesArchitectureTests` (Stripe-reach rule) |
| Events carry technical ids/values, never foreign aggregates — invariant #11 Need-To-Know | `ResponsibilitiesArchitectureTests` (id-based-events rule) |
| `review` is the **only writer** (and direct reader) of the `review` table — #811 | `ResponsibilitiesArchitectureTests` (SQL-shaped review-table scan; the bare name would match the module's package string in every consumer) |
| Only `venue` names `rating_tenths` / `reviews_count` — "I store the aggregate; `review` computes it" (#811) | `ResponsibilitiesArchitectureTests` (rating-columns sole-writer scan) |
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
