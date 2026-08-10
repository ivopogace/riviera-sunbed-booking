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
**Job:** Own venue profiles (incl. amenities + distance-to-water), venue photos (#142: per-slot
upload/replace/delete, processing, `bytea` storage behind the module-internal `PhotoStorage`
port, and the public content-hash serving read — ADR-0008) **including platform-admin photo
moderation** (#504's takedown, the "remove" half of #230's report-and-remove stance, plus #511's
read): I own it because I own photos, but these are my only photo operations with **no ownership
check** — a second port, `VenuePhotoModeration`, deliberately kept apart from the ownership-asserting
`VenuePhotos` so that port's "asserts `assertOwns` first" contract stays uniform rather than becoming
per-method. The port is named for the **posture** every one of its methods shares, which is why the
read joined it rather than minting a third port: reading a reported photo and removing it is one
conversation, one actor, one authorization posture. The
*authority* is not mine: the `ADMIN` role gate on `GET /api/admin/venues/{venueId}/photos` and
`DELETE /api/admin/venues/{venueId}/photos/{slot}` is the whole authorization (invariant #13 exempts `/api/admin/**`), which is the point — the
venue-scoped twin refuses a non-owner `403` before it looks at the slot, i.e. refuses exactly the
case moderation exists for. Both ports run the same single cascading delete, and takedown removes
one **slot**, not one image (byte-identical variants in another slot keep serving; each published
slot is its own takedown). Also own the beach map / layout, set
positions, the online-vs-walk-in pool assignment for each set, pricing, and the booking mode
(Instant / Request). Since A7 (#348) I also own the commission rate **over time**, not just its current
value: `venue_commission_rate` (V39) is the effective-dated schedule behind `VenueRates#commissionBpsOn`,
which answers "what rate applied to bookings served on date D" for the reporting reads, while
`commissionBps` stays the live rate every *decision* re-reads. That is still storing the rate, not
computing with it — `payout` keeps the arithmetic. It comes with the platform-admin rate write (my
**second** ownership-free surface, on its own `VenueCommissionAdministration` port for the same reason
`VenuePhotoModeration` is separate: `EditVenueProfile`'s "asserts `assertOwns` first" contract stays
uniform), and the write is forward-only by construction — it pins the superseded rate back to an epoch
floor, moves the live column, and schedules the new rate from tomorrow (`Europe/Tirane`), so no past
service date reprices and no ledger entry is touched (invariant #9). Note the asymmetry it preserves:
the *owner's* profile PATCH still cannot write the rate at all (O8 #177) — a venue does not set its own
commission. Since S9 (#277) also **assemble the signed-in operator's own-venues read model**
(`GET /api/venues/mine`): I ask `operator::api` for the ownership set and join the names, because
naming venues is my job and `operator → venue` would cycle. Since #207 also **compose the owner's
per-set daily availability read** (`GET /api/venues/{venueId}/availability?date=`, owner-asserted,
403-before-existence): I own the set list and the map composition (the #44 split, one state-aware
step deeper), while `availability` answers the per-`(set, date)` state tokens through my `spi`
(`SetAvailabilityLookup#statesOn`); the public tourist map stays state-agnostic (`FREE`/`TAKEN`) —
hold type never reaches the public surface.

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
(`SetAvailabilityLookup`): the state-agnostic taken-set overlay for the public map (#44)
and, since #207, the per-set **state tokens** (`statesOn`) behind the owner's daily
availability read — `venue` composes; I answer state.

**Not My Job:**
- The venue layout, which sets exist, or their positions → **`venue`** (I reference
  sets by id; I don't own them)
- *Why* a set is taken — which booking, who paid → **`booking`** (I record *that*
  `(set, date)` is claimed, not the booking behind it)
- Deciding whether bookings are even open for a date (the same-day cutoff) →
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
stayed home. That split is why the two share no port method. Enforce the cancellation policy and the same-day cutoff — **both of the
day's boundaries**, since `BookingCutoff` owns the service day's opening as well as the
evening-before close. That second boundary fences the *pay* path as well as the cancel path
(#576): the guest's deadline is `min(accepted_at + pay-window, service-day open)`, the
abandoned sweep carries a third, disjoint `booking_date` arm so a set stops being held
unsellable into its own service day, and the code-gated view withholds the `clientSecret`
past it. **The confirm path is deliberately not fenced.** A guest already holding a live
`clientSecret` who pays between midnight and the next sweep run still confirms. Refusing
without refunding would strand the money on an `AWAITING_PAYMENT` booking the sweep can never
release (`NotCancellable` forever), and refunding cannot reuse `BookingCancelled`: a
never-confirmed booking has no `ACCRUAL`, so `payout`'s listener would defer that publication
permanently and hold `riviera.outbox.pending` non-zero. The residual is a sub-sweep-interval
race the guest opts into and is paid for with the full stay.
Orchestrate the reserve → pay → confirm flow across `availability` and `payment`.
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
  composite annotation supplied — it bought nothing (the one write is a single statement, after a
  successful refund) while pinning one of ten Hikari connections across the call. Saturation
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

**Two rules make that reconciliation faithful under Stripe's delivery guarantees** (#568, #570).
Stripe promises neither ordering nor a single delivery, and the handler widens the window itself
(a transient failure rolls the whole transaction back, so the same event returns hours later):

- **The payment record has a state machine, in the SQL.** `markStatus` is a guarded
  `UPDATE … WHERE status IN (REQUIRES_PAYMENT, FAILED)` — the *open* states, `FAILED` among them
  because a declined intent is retryable at Stripe (the same set `findPendingCredentials` calls
  payable). Everything else is terminal, so a late `payment_intent.payment_failed` can no longer
  record collected money as failed, or contradict a `REFUNDED` row carrying `refunded_minor > 0`.
  The guard is one statement, never a read-then-write, so two concurrent deliveries cannot both
  see "open". Its consequence for the spine: `PaymentConfirmed`/`PaymentCanceled` are published
  **only when a row actually moved** — a late `canceled` on a collected payment must not ask
  `booking` to release the claim of a paid booking (invariant #2). `booking`'s own guarded
  `AWAITING_PAYMENT` transitions stay as the second layer; they were the only one.
- **A verified event is never consumed unapplied.** For every handled type — the three
  `payment_intent` ones and the refund-lifecycle ones (#592) — a payload that yields no identified
  PaymentIntent or Refund raises `UnreadableWebhookEventException` (`503`) instead of logging a
  warning and answering `200`. One helper reads the data object for all of them, so the rule has one
  home rather than one per branch. The rollback un-does the event-id dedup insert, so Stripe
  re-delivers and the id is not locally blacklisted — otherwise a paid booking could sit in
  `AWAITING_PAYMENT` forever, holding its `(set, date)` claim, with the abandoned sweep skipping it
  by design ("the confirm webhook wins" — a webhook that had already been consumed). Types the
  handler does not act on, and events for intents this app never recorded, stay `200`: there is no
  fact to lose in the first, and re-delivery cannot help the second. Parking raw events for replay
  was the rejected alternative — a table plus an admin re-drive surface, and the id staying
  un-blacklisted already leaves a dashboard replay open.

**One more rule governs refund *execution*, and it is not the idempotency key** (#569). The key
(`booking-<id>-refund`) is a **time-bounded** defence: Stripe prunes keys after roughly a day, so a
replay beyond that window is a brand-new request with the same parameters — and the vehicles that
replay this call are precisely the slow ones (the restart republish, which on Render can be days
away, and the admin re-drive, pressed exactly when someone notices `riviera.outbox.pending` late).
Stripe's refundable-amount ceiling catches the *full*-refund case, so what got through was the
partial one: two 50% refunds fit inside the charge and both succeed.

- **A refund is never created without first asking the gateway what it already holds.** The adapter
  lists the refunds on the booking's PaymentIntent and **adopts** one — records it and reports
  success — instead of creating a second. A `failed`/`canceled` refund returned no money, so it is
  not adoptable and a fresh attempt proceeds. This is invariant #8 applied to refunds, and it is why
  the check is not the cheaper read of our own `refunded_minor`: that column is written *after* a
  call returns, so it is silent about exactly the lost-response case being guarded — a partial refund
  that posted but whose response was lost leaves it at 0. The read **fails closed**: an unreadable
  list is `Failed`, never "no refund exists", so the publication stays outstanding and retries.
- **Adoption is narrow on purpose: exactly one live refund, for exactly the amount requested.** That
  is the shape a lost response leaves; nothing else is. Anything else — several live refunds, or one
  for a different amount (a manual dashboard refund, say) — is `Failed("refund_mismatch")`, because
  both alternatives are worse. Topping up a shortfall would be a refund **decision**, which is
  `booking`'s; reporting success would complete the event publication and strand a guest still owed
  money with only a log line behind it. `Failed` keeps the publication outstanding and lights
  `riviera.refunds.failed`, whose meaning — "a refund the platform owes could not be issued" — is
  exactly right. It will not clear itself: a human settles it at the gateway.
- **Adoption is visible, not silent** — `riviera.refunds.adopted`. An increment means an earlier
  attempt moved the money and lost the response; the money was always right, the record just caught up.
- The refund create also **replays once on a connection timeout** with the same key, the twin of the
  PaymentIntent path (one shared helper, so the rule has one home), so the common lost-response case
  resolves while the key still holds.
**Those rules left two residuals, and #592 closed both.**

- **A refund the gateway later reports as dead is un-recorded, not left claiming the guest was
  paid.** A `pending` refund stays adoptable — it is where a refund normally starts, and refusing to
  count it would create the second refund the rule above exists to prevent — so the fix is not to
  read `pending` differently but to act on the gateway's later word. A signature-verified
  refund-lifecycle event, branched on the **refund's status**, clears `refunded_minor` and puts the
  collection back to `SUCCEEDED`, which it still is: no money went back. All three types are handled,
  because `canceled` has no failure-only event of its own — Stripe announces it solely on the
  every-transition types. The event **type** decides one thing only, and it is the unreadable-payload
  policy: `refund.failed` reports nothing but failures, so an unreadable one is a lost failure and
  answers `503` to force re-delivery; `refund.updated`/`charge.refund.updated` announce every
  transition for every refund on the account, so an unreadable one is fail-**open** — a permanent
  retry loop there would get Stripe to disable an endpoint that also carries the payment spine, and
  losing an advisory duplicate is much the smaller harm (invariants #2/#8).

  That one write makes every existing mechanism
  truthful — `RefundStatusLookup` answers `OUTSTANDING` again so the guest is told the refund is
  still owed, `riviera.refunds.failed` lights the money-path signal, and the existence read above now
  sees a dead refund rather than adopting the corpse. It is invariant #8 applied to the refund
  lifecycle: reconcile from the webhook, not from the request-time answer.

  **What it does not do is hand anyone a lever.** The cancellation's publication completed when the
  refund was accepted, and `completion-mode=archive` removed it, so `POST /api/admin/refund-outbox`
  neither counts nor re-drives it — that lever only reaches refunds that never succeeded. And a fresh
  attempt inside the ~24h idempotency-key window does not create anything: the key is stable per
  booking, so Stripe replays the original response — the dead refund — which the adapter now detects
  and refuses (`refund_key_replay`) rather than recording a corpse as a live refund. So recovery is a
  human issuing the refund at the gateway, or re-attempting once the key has expired. The un-record's
  job is to make the state honest and loud, not to self-heal. **Nothing re-drives it automatically, deliberately** — an issuer rejection is not a
  transient error, and the card that refused the money often cannot receive it, so an auto-retry would
  repeat a call expected to fail again. Same posture as `refund_mismatch`: the alert stands until a
  human settles it. The un-record is itself guarded on the recorded `refund_id`, so a re-delivery
  moves nothing, a failure naming a refund we never issued (a manual dashboard one) moves nothing, and
  a stale failure cannot un-record the retry that worked. (#594 added a second, narrower arm beside
  that guard, for the refund this app has begun but not yet written down — see below; what keeps a
  manual dashboard refund out is then the refund *attempt* record, not the absence of a match.)
- **At-most-once is now the port's contract, enforced, not the collecting adapter's habit.**
  `PaymentGatewayRefundContract` states it once against `PaymentGateway` — replay a refund past the
  key window and exactly one must move, with the replay reporting the first — on a fixture that
  deliberately never dedupes on the key, since that is the condition being simulated. A second case
  guards the opposite error: a refund that returned nothing must **not** be adopted, or at-most-once
  becomes at-most-zero. A coverage rule makes it unskippable — every production `PaymentGateway` is
  either covered by a contract subclass or non-collecting, and neither half is a maintained list:
  coverage is read from the subclasses' dependencies, the exemption from the `@Profile` that already
  binds a gateway to its `CollectionGuarantee`. So ADR-0009's Paysera adapter arrives unclassified and
  fails the build, which is what a javadoc could not do. The stub needed no state to participate — it
  is exempt because it collects nothing, and the guarantee that says so already existed.

**#592 in turn left three residuals, and #594 closed all three with one change: the refund record
gained a trace, and every refund write became a guarded statement that reports whether it moved.**

- **A refund failure can no longer be lost to the window before its own record.** The old guard
  matched on the recorded `refund_id`, and a refund id is written down *after* the gateway already
  knows about the refund — so a verified failure arriving inside that window matched nothing,
  answered `200`, committed the dedup row, and left the collection at `REFUNDED` **permanently**
  while the guest was told their money was on its way. The window is not instantaneous: the create's
  timeout replay puts tens of seconds between Stripe minting the refund and the row being written.
  The fix is to **record the attempt before asking the gateway** (`markRefundAttempted`), so a
  failure arriving mid-call can be matched by **PaymentIntent** instead of by a refund id that does
  not exist yet.

  That attempt is also the **discriminator**, and it is why matching by PaymentIntent is safe. The
  other thing a dead-refund event on our collection can be is a refund someone issued by hand at the
  gateway — money the platform never promised, whose failure must raise no money-path alert. Without
  an attempt on record, the by-intent arm moves nothing. This is the discrimination the rejected
  alternative could not make: **deferring the event with a `503` would 5xx-loop for the ~3 days
  Stripe retries on exactly that branch**, and the endpoint is shared, so Stripe disabling it would
  stop `payment_intent.succeeded` delivery and strand paid bookings in `AWAITING_PAYMENT` holding
  their `(set, date)` claim — the invariant-#2/#8 failure the `503` exists to prevent.

  The recorded death then **blocks the record that lost the race**: `markRefunded` refuses a refund
  id already reported dead, answers `Failed("refund_died_before_record")`, and the event publication
  stays outstanding. So this one case *does* recover on its own — not because the posture on failed
  refunds changed, but because a refund that was never recorded still has its publication, and a
  re-drive past the key window creates a fresh refund. A refund that was recorded and *then* died is
  unchanged: nothing re-drives it, an issuer rejection is not a transient error.

  One consequence is worth stating because it looks like a bug: this is the shape that increments
  `riviera.refunds.failed` **twice** for one incident — the webhook counts the refund it killed, and
  the recording call it beat counts its own refusal. Both are true observations, and the gauge still
  reads one booking. It is the sharpest illustration of why the counter measures observations and
  `riviera.refunds.owed` measures debts.
- **`markRefunded` moves only a collected payment**, so a refund can no longer assert a collection
  that never succeeded. It was unguarded, and `markRefundFailed` writes `status = SUCCEEDED`
  unconditionally, so the pair could fabricate a collected payment out of a `REQUIRES_PAYMENT`,
  `FAILED` or `CANCELED` row — `findPendingCredentials` would stop offering the client secret and
  `RefundProgress` would report `OUTSTANDING` for money never taken. Not reachable while the only
  refund path is cancelling a `CONFIRMED` booking; reachable the moment a second one exists. The
  guard is what makes the hard-coded `SUCCEEDED` restore **sound by construction rather than lucky**:
  if the only statuses a refund record can replace are the collected ones, `SUCCEEDED` is the only
  thing it can have replaced. That is why no "previous status" column was needed.
- **An owed refund is enumerable, not just loggable.** The un-record used to leave a row
  byte-identical to one whose refund was never attempted, save a stale `refund_id` with no flag
  saying it died — the wrong shape for the remedy the runbook prescribes, which needs the *list* of
  bookings owed money and cannot get it from log lines once retention is shorter than the incident.
  The dead id now moves to `failed_refund_id`, `refund_id` stops claiming a live refund, and
  `refund_failed_at` marks the debt, over a **partial index** that is empty in the healthy case.
  `riviera.refunds.owed` gauges it: **distinct refunds owed**, where `riviera.refunds.failed` counts
  observations and re-increments on every resubmission of the same stuck refund. The flag means
  "owed **now**" — a retry that works clears it, while `failed_refund_id` keeps what died.

  The attempt stamp carries one **placement** constraint worth stating, because the tidy-up that
  breaks it looks like an improvement: it is written from `RefundService#refund`, which must stay
  **outside a caller's transaction**, or the write stays invisible for the whole window it exists to
  cover. `RefundAttemptVisibilityIT` reads it back on a second connection and goes red if a
  transaction is ever wrapped round that method.

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
now writable (creator-owns-on-create). Answer four things for the rest of the system: *does
this operator own this venue?*, *which operators are awaiting approval?*, *which accounts
exist for an admin to act on?* (invariant #13), and — since #357 — *what is the ACTIVE
operator with this id called?*, so the edge can revoke its sessions **before** a suspension
commits rather than only after. A suspension **keeps** the operator's
`operator_venue` rows — it is reversible, and ownership resolves ACTIVE-only anyway.

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
  credential rotation, an operator changing its own password #326) → the **platform edge**
  (`PrincipalSessionRevoker`, #128). I report *that the transition happened* and *whose* it
  was; deleting `SPRING_SESSION` rows is session machinery and I never import
  `org.springframework.session`
- **Telling an approved operator that it can now sign in** (#375) → the **platform edge**
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
**Job:** Own transactional-mail **delivery** (#382): the `Mailer` transports (recording mock
vs real SMTP, profile-swapped, mock prod-guarded), the two delivery vehicles — the Event
Publication Registry listener for ids-only payloads and the bounded in-memory dispatcher for
bearer-credential payloads (ADR-0011 decision 5), **each draining on its own bounded executor**
(#383) so a degraded relay can never occupy the shared `applicationTaskExecutor` that carries the
payment→booking and booking→payout listeners; the registry listener therefore spells out
`@Async("registryMailExecutor")` + `@TransactionalEventListener` instead of
`@ApplicationModuleListener`, and holds no transaction across the send — a rule pinned by
`MailListenerExecutorArchitectureTest`, whose non-vacuity guard names all five shipped listeners off
one list so the check cannot quietly start asserting nothing; that pool's size and queue
depth are `riviera.notification.registry-mail.*` properties since #408 (defaults `2`/`200`, validated
at boot **on both ends** — a non-positive `queue-capacity` would yield a `SynchronousQueue` that
sheds nearly everything, an oversized one would restore the very unbounded queue the bulkhead
removed, and both would boot clean — so #370 can retune them against a real relay without a deploy) — and since #410 both pools'
shutdown drain window is **derived** from a third such property,
`riviera.notification.mail.socket-timeout-ms`, which is also what every
`spring.mail.properties.mail.smtp.*` timeout interpolates, so the relay budget and the drain cannot
drift apart the way a flat 5s and a 10s socket timeout did; since #456 the drain arithmetic lives in
`shared`'s `ShutdownBudget` (the discovery-and-sum rule: §`shared`); when that window expires both pools give
up rather than interrupting, since an interrupt cannot tell a send that already reached the relay from
one that has not. Both also carry the submitting request's MDC onto their workers through one shared
`MdcTaskDecorator` (#410), composed onto the registry pool via `CompositeTaskDecorator` beside the
shed policy that already owns its decorator slot (replacing it would silently strand the episode
flag open) — a class that **#455 moved to `shared`**, because #404's refund pool needed the
same mechanism and invariant #11 forbids `booking` importing this module's `application` package; the
decorator is no longer this module's to own, and `WorkerContextArchitectureTest` now pins that every
self-configured pool carries it. Each shed send increments
`ObservabilityMetrics.MAIL_REGISTRY_SHED` while escalating one log line per saturation *episode*;
the recovery dispatcher's mirror-image accounting is `MAIL_RECOVERY_DROPPED` (#415), and it is a
mirror rather than a copy — **every** drop is logged, not one per episode, because a throttle trades
repeated lines for the durable record that makes them redundant and this vehicle has none, and a
rejection during **shutdown is counted here** (a real loss, tagged `reason=shutdown` so a redeploy
cannot read as a degraded relay) where the registry excludes it as a non-event. A redeploy loses mail
on both sides of `execute()`, so since #434 the tag has a third value, `abandoned` — the send accepted
and still queued when the drain window expired — counted by draining the queue *after* the window is
awaited, which is what makes the number a loss rather than a guess; the send caught **running** is
deliberately excluded, being the one that may already have reached the relay. Read the name as **never
ran**, not *refused*. #423 had extended that accounting with `MAIL_RECOVERY_FAILED` — the send this vehicle *accepts* and then cannot deliver,
which is the likelier loss and the first of the mail counters to move in a relay outage. It is
tagged by `kind` and by `reason` (`transport` / `suppression-lookup`) because the one swallowing catch
can lose a mail to the relay or to a suppression read broken past #386's transient fail-open, and an
operator acts on the cause, not the consequence. **Since #442 the drop counter carries `kind` too**, on
all three of its reasons: the dimension had been missing not because a drop is less attributable than a
failure but because `MailDispatcher.dispatch(Runnable)` never told the pool what it was carrying, so a
lost approval notice read the same as a lost password reset. Widening that seam to
`dispatch(MailKind, Runnable)` closed it — the drain path included, which needed the kind to travel
into the queue — and made ADR-0011 decision 5's "mitigated only in part" clause false. The vocabulary
is one enum (`MailKind`) shared by both counters, so the two cannot drift into two spellings of a kind;
neither names the *person*, invariant #7 keeping the address off the tag. **The registry vehicle deliberately has no twin:**
its transport failure propagates, so the publication stays outstanding and `riviera.outbox.pending`
already accounts for it — an argument that holds only for failures that *throw*, which is why a
confirmation this module **abandons** for a missing booking/set/contact (completing the publication,
by design) gets the fourth name of its own, `MAIL_CONFIRMATION_ABANDONED` (#428), tagged
`no-booking`/`no-set`/`no-contact` for the three modules it implicates and escalated per loss to
`ERROR` — none of the three facts is reachable through any application path, so it is zero in a
healthy system and reads as a data-integrity fault rather than a relay one; #374's cancellation
listener abandons the same three ways and gets the **fifth** name, `MAIL_CANCELLATION_ABANDONED`,
a sibling series rather than a `kind` tag, because #442 could tag `MAIL_RECOVERY_*` only where the
name states the *vehicle* and these two state the *flow* — the shared part is the `reason`
vocabulary, read off one enum so the two cannot drift into two spellings —
the **registry-borne booking mails**, all assembled from `booking`/`venue`/`customer` published
ports (ids only) by one module-internal resolver: the `BookingConfirmed` confirmation mail; since
#374, the `BookingCancelled` cancellation/refund record — one listener covering every cancellation
channel, tourist self-service and operator weather refund alike, because it subscribes to the fact
rather than to either caller, and **rendering** the server-computed refund (invariant #10) rather
than deciding it; since #373 the `BookingPaymentDue` notice an accepted Request-mode booking's
guest gets, whose counter `MAIL_PAYMENT_DUE_ABANDONED` is the
only abandoned flow whose loss is **predictive** — the sweep releases the set at the mailed
deadline, so the errand it opens expires; and since #124 the `BookingRequestDeclined` /
`BookingRequestExpired` records — plain-record copy, no CTA, published from inside
`RequestReleaseService`'s winning decline/expire legs (the withdraw leg deliberately mails
nothing, #123), each abandoning under its own sibling counter
(`MAIL_REQUEST_DECLINED_ABANDONED` / `MAIL_REQUEST_EXPIRED_ABANDONED`). That listener also decides nothing about *whether* payment
is owed: `booking` settles that by publishing the fact only on the accept branch where money is
genuinely outstanding (a failed PaymentIntent reverts the booking to `PENDING_REQUEST`), which a
status read here could not do without racing the stub's synchronous
confirm — and the module's
first owned state (the second is #380's delivery log, below): the **email-suppression list** (V32; **hashed/non-PII at rest since V33** —
a `v1:`-tagged peppered-HMAC `email_key` plus the cleartext `domain`, never the address,
deliberately surviving erasure per ADR-0012; the pepper is env-managed, fail-at-boot in prod),
with the defining invariant **no send to a suppressed address**, enforced at the one send chokepoint
(`TransactionalMailService`) on both vehicles — with **one deliberate carve-out** (#386): on the
recovery vehicle a *transient* failure of the lookup itself sends the mail rather than dropping it,
because the list is empty until #372's feed lands and D-8 makes a dropped reset indistinguishable
from success to the user. The registry vehicle still propagates, so at-least-once retries against a
healthy DB. The lookup is bounded by a `queryTimeout` scoped to its own adapter — never the global
property, which would also bound `availability`'s `INSERT … ON CONFLICT` claim, whose loser waits on the winner's index tuple lock (invariant #2). V34 tightened
the `domain` CHECK to mirror the Java writer exactly. **V35/#391 added the one sanctioned
exception to never-deleted — and it is still not a deletion:** an ADMIN-gated
`POST /api/admin/email-suppressions/reinstate` sets a `reinstated_at` flag on the row (so
`isSuppressed` reads `email_key = ? AND reinstated_at IS NULL`), keeping `first_suppressed_at`
and the prior `reason` so a reinstate→re-bounce loop stays visible; a later bounce clears the flag
through the ordinary upsert. A hard `DELETE` on this table remains a defect. **#405 gave the registry vehicle an operational
trigger:** an ADMIN-gated `GET`/`POST /api/admin/mail-outbox` reports what the Event Publication
Registry still owes this module and re-drives it on demand, so the retry horizon for a failed
confirmation stops being "the next deploy" (`republish-outstanding-events-on-restart` fires once, at
boot). It is **scoped by listener-id prefix to this module's own listeners**, never by event type —
`BookingConfirmed` fans out to `payout`'s accrual too, so an event-type predicate would replay
invariant-#9 ledger work from a button labelled "mail" (`MailOutboxScopeIT` leaves an accrual
outstanding and proves it is untouched). Two framework facts the trigger rests on, both of which
issue #405 states the other way round because it read the **v1** JDBC repository: V8 ships the **v2**
schema, so `markResubmitted` is a real claim (`… WHERE ID = ? AND STATUS != 'RESUBMITTED'`) that makes
duplicate delivery a database guarantee rather than an application one, and `ResubmissionOptions`
reaches only `FAILED` publications — never a **shed** send, which by construction never ran and so was
never marked failed. The application-side single-flight + cooldown is therefore a throttle on the
*sweep*, not the duplicate guard: during a relay outage every send fails fast and the whole scope is
eligible again in milliseconds. Publishes exactly one
named interface, `notification::api`, holding **two role-split ports**:
the fire-and-forget `MailSender` (never throws, runs off the caller's thread,
suppression-enforced — and since #375 carrying the **operator-approval notice**
(`kind="operator-approved"`) alongside the two recovery kinds, which is why "recovery" in `MAIL_RECOVERY_*` names the *vehicle* and the `kind` tag
names the flow: the notice carries no bearer credential, but it is edge-orchestrated from an admin
request rather than driven by a domain fact, and ADR-0011 decision 5 reads both) and, since #400,
the synchronous read `MailDeliverability`
("would a mail to this address be withheld right now?"). They are deliberately separate
conversations — `MailSender`'s contract is that a send influences neither the triggering
response's status nor its latency (D-8, #369), which the anonymous `forgot-password` flow
depends on, so the one surface that *does* reflect the answer cannot ride it.
`MailDeliverability` is safe only where the caller already owns the address: its sole consumer is
the authenticated verification-resend, which asks about its own session principal. Both are
consumed by the composition root alone; **no module depends on `notification`**. Since #390 it also *implements* one port it does not own —
`booking.spi.ConfirmationMailDelivery`, answering "would this customer's confirmation mail be
withheld?" so a confirmed booking's read model can tell the guest to save their code. That is the
inverted direction and preserves the rule: the dependency edge is still `notification → booking`.
Since **#380** I also own the **booking-confirmation delivery log** (V36
`booking_confirmation_mail_attempt`) — one row per attempt, carrying what triggered it
(`AUTOMATIC` / `ADMIN_RESEND`) and what became of it (sent / withheld-suppressed / transport-failed /
abandoned) — plus the ADMIN surface over it: a per-address lookup and a one-click **resend**
(`/api/admin/mail-deliveries`, controller in my `adapter/in`, the #391/#405 precedent). The log
exists because the Event Publication Registry cannot answer the question: `completion_date` records
that the listener *returned*, which it equally does for a suppression skip and for a confirmation
abandoned for missing facts, so a registry-derived view would report "dispatched" for the two losses
support actually calls about. `booking.spi.ConfirmationMailDelivery` already stated the rule — a
consumer needing the *historical* fact records it at send time. The resend sends **synchronously
through the chokepoint and publishes nothing**, so it re-drives no other `BookingConfirmed`
consumer (invariants #8/#9 are untouched by construction, pinned by `AdminMailDeliveryIT`), and the
admin gets the real outcome rather than "queued".

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
