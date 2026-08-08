# Service-day pay fence Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An `AWAITING_PAYMENT` booking stops being payable once its service day has begun in
`Europe/Tirane` — the pay deadline is capped at that instant, the abandoned sweep expires on the
capped deadline so the set returns to the pool at 00:00, and the code-gated view issues no payment
credentials past it.

**Architecture:** The single significant decision is that **the service-day opening becomes a
first-class, published instant on `BookingCutoff`** rather than a second date computation somewhere
in the pay path. `BookingCutoff` is already the one class that reasons about civil days in
`Europe/Tirane`; #566 taught it `serviceDayOpensAt` as a private cancellation boundary. This slice
promotes it and adds the two projections the pay path needs — `serviceDayHasOpened(bookingDate)` for
the per-booking read and `lastOpenedServiceDay(now)` for the set-based sweep predicate — so invariant
#4's one rule now does four jobs from one place. The pay deadline stays where the mailed promise
already lives (`RequestWindows#payDeadline`), which now takes the cap as its second argument, so the
`#373` mail and the sweep cannot promise different moments.

**Persistence:** JDBC only (invariant #1). **No tables and no migration touched.** The sweep gains a
third `OR` disjunct on `booking.booking_date`; `postgres` was consulted on whether it needs a partial
index of its own and the answer is **no** — see the *Availability & concurrency* section for the
argument.

**Source of intent:** GitHub issue #576.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught four things the
issue does not say: that its own "reuse the existing refund path" suggestion is blocked by #428's
deliberate `BookingCancelledPayoutListener` throw, that a bare refuse-to-confirm is *worse* than the
status quo, that the instant-book example is not actually the same defect, and that the strongest
harm is the venue's — a set held unsellable into the service day) · `riviera-plan-doc` (this
template — its Availability section is what forced the index question to be answered rather than
assumed, and the Non-goals section is what pins the accepted residual) · `tdd` (each phase is
red-green: the boundary arithmetic, the capped deadline and the sweep predicate are unit-pinned
before any wiring) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (`due at close-out over origin/main..HEAD` — invariant #4's "one rule, two
jobs" line in `CLAUDE.md` and `RESPONSIBILITIES.md` §`booking` both state the cutoff's jobs and this
slice adds one) · `riviera-modulith` (confirmed the whole change stays inside `booking`: no new
published surface, no new event, no `allowedDependencies` edit — and that `BookingCutoff` staying a
module-internal-but-`public` `application.cancel` component is the established cross-slice seam, not
a `vocabulary/` candidate, since no sibling module consumes it) · `riviera-java-conventions`
(`lastOpenedServiceDay(Instant)` takes the caller's single clock reading rather than reading the
clock a second time, §6a-adjacent: one reading, one decision; and the new `Bookings` port parameter
is a typed `LocalDate`, not a stringly date) · `postgres` (**declined** a third partial index —
the existing `WHERE status = 'AWAITING_PAYMENT'` partial predicate already bounds the scan to the
in-flight set, so a new index would add write amplification for a scan that is bounded by
construction) · `riviera-stripe-payments` (confirmed the fence belongs on the *decision* to issue
credentials in `booking`, never in `payment`, which only executes — and that the sweep's existing
`CancelPaymentPort` leg is the authoritative closer, so no new gateway call is introduced) ·
`riviera-frontend` (the new panel stays inside the `booking/` feature folder; the `payWindowClosed`
flag rides the existing `BookingDetail` model in `booking/booking.model.ts`, not `shared/`, because
it is booking-view vocabulary with one consumer) · `angular-developer` + angular-cli MCP
(`get_best_practices` — native `@if`/`@else if` control flow in the existing `@switch` branch, no
new signal needed since the flag is a field on the already-loaded `BookingDetail`) ·
`playwright-cli` (the e2e case is a `page.route` mock returning a `payWindowClosed` booking, placed
in the CI-safe mocked suite beside the other Request-to-Book cases).

**Branch:** `claude/sdlc-576-fvnxi1` — the cloud session's designated remote branch stands in for
`bugfix/service-day-pay-fence` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an accepted request for `bookingDate`, when the guest's pay deadline is
      computed, then it is `min(acceptedAt + payWindow, midnight Europe/Tirane on bookingDate)` —
      the cap binds only when the raw window would outrun the service day.
      *Pinned by:* `RequestWindowsTest.payDeadlineIsCappedAtTheServiceDayOpening`
- [ ] **AC-2:** Given a venue accepts a request the evening before at 17:30 with the default 12h
      pay window, when `BookingPaymentDue` is announced, then its `payBy` is midnight
      `Europe/Tirane` on the booking date, not 05:30 that morning.
      *Pinned by:* `RespondToRequestServiceTest.announcesAPayDeadlineCappedAtTheServiceDay`
- [ ] **AC-3:** Given an `AWAITING_PAYMENT` booking whose `booking_date` service day has opened,
      when the abandoned sweep runs, then the booking is a candidate **regardless of its raw
      window**, its PaymentIntent is cancelled and its `(set, date)` availability claim is released
      (invariant #2). *Pinned by:*
      `AbandonedBookingSweepIT.expiresAnAwaitingPaymentBookingOnceItsServiceDayHasOpened`
- [ ] **AC-4:** Given "now" is at or after midnight `Europe/Tirane` opening the booking date, when
      the code-gated booking view is assembled for an `AWAITING_PAYMENT` booking, then
      `payment.api.PaymentCredentialsLookup` is **not consulted** (no `clientSecret` is issued) and
      `payWindowClosed` is `true`.
      *Pinned by:* `ViewBookingServiceTest.withholdsPaymentCredentialsOnceTheServiceDayHasOpened`
- [ ] **AC-5:** Given the same booking, when `GET /api/bookings/{code}` is served, then the response
      carries `payment: null` and `payWindowClosed: true`.
      *Pinned by:* `BookingViewIT.reportsPayWindowClosedForAnOpenServiceDay`
- [ ] **AC-6:** Given a booking whose service day has **not** opened, when the view is assembled and
      the sweep runs, then behaviour is byte-for-byte as before — credentials are issued,
      `payWindowClosed` is `false`, and the sweep binds only the created/accepted arms.
      *Pinned by:* `ViewBookingServiceTest.stillIssuesCredentialsBeforeTheServiceDayOpens` +
      `AbandonedBookingSweepServiceTest.bindsTheServiceDayArmToTheTiraneCivilDate`
- [ ] **AC-7:** Given a booking detail with `payWindowClosed: true`, when the guest opens the
      booking view, then an explicit closed-window panel is shown and **no** "Pay now" button is
      rendered. *Pinned by:* `booking-view.spec.ts` →
      `shows the closed pay-window panel instead of Pay now` and
      `request-to-book.e2e.ts` → `an accepted request whose service day has opened cannot be paid`

## Non-goals

- **Fencing the confirm path.** A `payment_intent.succeeded` webhook for a booking whose service
  day has opened still confirms, exactly as today. Decided by the user at the grill gate; the
  reasoning and the accepted exposure are R-1.
- **Any new refund path.** No `AWAITING_PAYMENT → CANCELLED (refunded)` transition, no new
  `RefundReason` token, no `BookingCancelled` for a never-confirmed booking (which #428's payout
  listener would park in the outbox permanently).
- **Relaxing the #566 post-service-day cancellation fence.** The issue is explicit that the fence is
  not the defect; this slice fixes the upstream hole it exposed.
- **Changing `booking.request.pay-window`, its `MIN_WINDOW`/`MAX_PAY_WINDOW` bounds, or the sweep
  cadence.** The cap is arithmetic at the use site, exactly as `expiryWindow`'s cutoff cap is.
- **The instant-book create path.** `ReserveSetService` already refuses a same-day booking via
  `BookingCutoff#isBookable`; nothing there changes.

## Behavior-parity ledger (retirement / replacement slices only)

`N/A — no surface is retired or replaced.` Every change is additive (a new cap on an existing
deadline, a third disjunct on an existing query, a new response field, a new `@else` branch). The
one behaviour that *changes* rather than being added is the pay deadline itself, and AC-1/AC-2 pin
both sides of it.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The accepted residual.** A guest already holding a live `clientSecret` pays between midnight and the next sweep run (≤5 min: `sweep-interval=PT5M`). The payment succeeds, the sweep's `cancel` returns `NotCancellable`, and the verified webhook confirms a booking for a day ~minutes old — which the #566 fence then reports as uncancellable. | low | low | Accepted by explicit decision at the grill gate. Layer 3 means no *new* checkout can start past midnight, so the exposure needs a page already open across the boundary; the guest actively chooses to pay and receives the full stay. Closing it requires a refund path that #428 blocks (see Non-goals). | plan | **accepted — by decision** |
| R-2 | The third `OR` disjunct degrades the sweep's query plan into a `booking`-wide seq scan. | low | med | No new index (see *Availability & concurrency*): all three disjuncts share the `status = 'AWAITING_PAYMENT'` partial predicate, so Postgres can drive the whole `WHERE` from any one of the existing partial indexes and filter — and that index covers only the in-flight set, which the sweep itself keeps small (15 min instant TTL, ≤72 h accepted). | phase 2 | open |
| R-3 | Timezone arithmetic (invariants #4/#6) — an off-by-one civil date, or the JVM default zone leaking in. | med | high | All three new methods live on `BookingCutoff`, which already pins `ZoneId.of("Europe/Tirane")` and takes an injected UTC `Clock`. `lastOpenedServiceDay` takes the caller's **single** clock reading rather than reading again, so the sweep's `now` and its date can never straddle midnight differently. Unit-pinned from both sides of midnight. | phase 0 | open |
| R-4 | A late-cutoff venue silently shrinks the guest's pay window — a 23:00 cutoff accepted at 22:55 gives 65 minutes, not 12 hours. | med | low | Correct under invariant #4 and not a defect, but it is a real behaviour change: the `#373` mail states the deadline, and because `payDeadline` is the *same* expression the sweep enforces, the mailed moment stays truthful. Recorded so review does not read it as an oversight. | phase 1 | open |
| R-5 | Adding `payWindowClosed` to the `GET /api/bookings/{code}` body breaks the FE contract or an existing IT's strict body assertion. | low | low | Additive field, `false` for every pre-existing case; FE model updated in the same slice; `BookingCreationViewsContractTest` and `BookingViewIT` re-run. Error contract untouched (no new endpoint, no new `ProblemDetail` code). | phase 3 | open |
| R-6 | The `ServiceDayBackdate` fixture is documented for a **confirmed** booking that is "deliberately never released"; the new sweep IT backdates an `AWAITING_PAYMENT` booking that *is* released. | low | low | Its `clearResidueAt` already makes it re-run safe, and a released row is strictly easier than a retained one. Its Javadoc gets one sentence widening it to the pay fence rather than a second copy of the helper. | phase 2 | open |
| R-8 | **New full-suite coupling.** The service-day arm makes any past-dated `AWAITING_PAYMENT` row anywhere in the shared Testcontainers DB a sweep candidate, so `AbandonedBookingSweepIT`'s exact-count assertions could be broken by another test class's fixture. | low | med | Audited at phase 2 (see the generalization log): all 20 ITs that create `AWAITING_PAYMENT` rows date them in the future or go through the cutoff-guarded create path. `AbandonedBookingSweepIT` isolates the one opened date it writes. This is precisely the failure class only CI's full suite can show (`riviera-local-debug`), so the PR's CI run is the verification. | phase 2 | open — CI-verified |
| R-7 | Flyway version contention. | n/a | n/a | **No migration in this slice.** V39 is the highest on `main`; no open PR claims V40 (only Dependabot PRs are open). If a parallel slice later needs one, nothing here collides. | plan | **closed — no migration** |

## Open questions / Assumptions

- **Assumption:** the abandoned sweep runs on its configured cadence in production
  (`booking.awaiting-payment.sweep-interval=PT5M`, `initial-delay=PT1M`, single-instance posture per
  `docs/deploy/production-hardening.md`). R-1's ≤5-minute exposure is stated against that. —
  *Owner:* plan · *Resolves by:* phase 2 (the IT drives the sweep directly, so the bound is a
  deployment property, not a code one).

### Resolved

- **Open question:** how far should the fence go — do we also refuse the confirm and refund a late
  payment? → **Resolved at the grill gate by the user: layers 1–3 only, residual accepted (R-1).**
  The confirm path is untouched; see Non-goals.
- **Open question:** what does the guest see when credentials are withheld? → **Resolved at the
  grill gate by the user: an explicit closed-window panel** (AC-7), not a silent fall-through to the
  pay page's existing `missing` state.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged in count — online booking claim,
  staff tap-to-mark, cancellation release, admin weather refund, Request-to-Book pending hold, and
  the three request-termination releases (decline / expiry / withdraw). This slice changes **which
  bookings reach one existing release path**: `ReleaseAbandonedBooking`, driven by
  `AbandonedBookingSweepService`, now also receives bookings selected by the service-day arm. It
  adds no new writer and no new SQL statement against the table.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` on `set_availability`.
- **Concurrency strategy:** unchanged — the release is the existing guarded transition inside
  `ReleaseAbandonedBooking`, so a booking selected by the new arm and simultaneously released by the
  `payment_intent.canceled` webhook is a 0-row no-op on the loser, never a double release. The new
  arm only *widens the candidate read*; every candidate still passes through the same guard.
- **Pool rule (invariant #3):** untouched — no booking is created here, only released.
- **Cutoff rule (invariant #4):** this slice is the point. The evening-before cutoff already caps the
  *accept* deadline (`request_expires_at ≤ closesAt`); it now also caps the *pay* deadline at the
  service-day opening — `min(acceptedAt + payWindow, bookingDate.atStartOfDay(Europe/Tirane))`.
  Because no accept can happen after `closesAt` and no instant booking can be created for today, the
  service-day arm can only ever select genuinely stale rows, never an in-flight one.
- **Index decision (`postgres`):** **no new index.** The query becomes

  ```sql
  WHERE status = :awaiting
    AND (booking_date <= :serviceDayOpen
      OR (accepted_at IS NULL  AND created_at  < :createdBefore)
      OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
  ```

  All three existing partial indexes (`booking_awaiting_created_idx` V13,
  `booking_awaiting_accepted_idx` V19) carry the identical partial predicate
  `WHERE status = 'AWAITING_PAYMENT'`, so the planner may satisfy the whole statement by scanning any
  one of them in full and applying the remaining quals as a filter — a scan bounded by the in-flight
  set, which the sweep exists to keep small (15-minute instant TTL, ≤72 h accepted window). A third
  partial index on `(booking_date)` would add write amplification on every `AWAITING_PAYMENT` insert
  and status transition to accelerate a scan that is already bounded by construction. Revisit only if
  the in-flight set is ever observed to be large, which would itself be the bug.
- **Pinning test:** `AbandonedBookingSweepIT.expiresAnAwaitingPaymentBookingOnceItsServiceDayHasOpened`
  — proves the released `(set, date)` row is gone and the set is re-bookable.
  `ConcurrentReservationIT` and `ConcurrentRequestTerminationIT` are unchanged and re-run as
  regression.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | The whole slice. The cutoff rule, the booking lifecycle, the abandoned sweep and the code-gated view all live here; `RESPONSIBILITIES.md` §`booking` Job: *"Enforce the cancellation policy and the same-day cutoff."* |

No other module's code changes. `payment` is *called less* (the credential lookup is skipped past the
boundary) but its ports, contracts and adapters are untouched.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `PaymentCredentialsLookup#pendingCredentials` | `PaymentCredentials` | `booking` — **existing**, now called conditionally rather than for every `AWAITING_PAYMENT` booking. No signature change. |
| NI-2 | `payment.api` | `CancelPaymentPort#cancel` | `PaymentCancellation` | `booking` — **existing**, now reached for a wider candidate set. No signature change. |

**No new published surface**: no new `api/`, `vocabulary/`, `events/` or `spi/` type, and no
`allowedDependencies` edit. `BookingCutoff` stays a module-internal-but-`public`
`application.cancel` component — the established cross-slice seam within `booking` (`reserve`,
`cancel`, `view`, `refund` and `request` all consult it), deliberately not a published type, since no
sibling module reasons about the service day.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingPaymentDue` | `booking` | unchanged — `{ bookingId, venueId, setId, bookingDate, payBy, amountMinor, currency }` | `notification` | async `AFTER_COMMIT` (registry) | `RespondToRequestServiceTest.announcesAPayDeadlineCappedAtTheServiceDay`, `PaymentDueAnnouncerIT` |

**No new event and no payload shape change** — only the *value* of `payBy` changes, which is exactly
the point: the mailed promise and the swept deadline stay one decision.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide the instant at which a service day opens, and project it per-booking and per-civil-date | `booking` | `booking` Job: *"Enforce … the same-day cutoff."* It is the same instant #566 already made `booking`'s for the cancellation fence; no other module's Job mentions civil days. Not on any Not-My-Job list. |
| Cap the guest's pay deadline at that instant | `booking` | Same Job line. Explicitly **not** `payment`, whose Not-My-Job is the mirror of `booking`'s *"Talking to Stripe or moving money → `payment` (I ask it to collect)"* — deciding *when* collection is still permitted is the lifecycle decision, and `payment` only executes (`riviera-stripe-payments`: eligibility is computed server-side in `booking`). |
| Refuse to issue payment credentials past that instant | `booking` | The `view` slice already owns every disclosure gate on this read model (the D-8 `emailWithheld` short-circuit is the precedent: `booking` owns the gate because the lifecycle is `booking`'s). `payment` still owns the credentials themselves and is simply not asked. |
| Widen the abandoned sweep's candidate set | `booking` | The sweep is `booking`'s (`application/refund`); it consumes `availability` and `payment` only through their published ports, unchanged. |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. Unchanged.
- **Confirmation trigger:** signature-verified webhook, unchanged and deliberately untouched
  (Non-goals / R-1). No client-side signal gains authority here.
- **Idempotency:** unchanged. The sweep's `CancelPaymentPort` leg and `ReleaseAbandonedBooking`'s
  guarded transition are already idempotent, and the wider candidate set changes neither. A booking
  selected by both the accepted arm and the new service-day arm is selected **once** — the disjuncts
  are `OR`ed inside one row predicate, not unioned.
- **Money:** untouched. No amount is computed, rounded or moved by this slice.
- **Payout-ledger effect:** **none.** No `BookingConfirmed` and no `BookingCancelled` is published on
  any new path, so no accrual or reversal is created — which is precisely why the confirm-side fence
  was declined: a `BookingCancelled` with `refundMinor > 0` for a never-confirmed booking would hit
  `BookingCancelledPayoutListener`'s deliberate `deferReversal` throw and park that publication in
  `event_publication` forever, holding `riviera.outbox.pending` non-zero.
- **Refund policy applied:** none — a swept booking was never collected, so there is nothing to
  refund (the sweep voids an uncollected PaymentIntent; no money moves).
- **Pinning tests:** `AbandonedBookingSweepIT`, `AbandonedBookingSweepServiceTest`,
  `PaymentEventListenerIT` (regression: the confirm path is unchanged), `RequestAcceptPayIT`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | existing | standalone component | the flag is a field on the already-loaded `BookingDetail` signal — no new signal, no new request | none |
| FE-2 | `booking/booking.model.ts` | existing | interface | adds `readonly payWindowClosed: boolean` | — |

**Standards:** native `@if` / `@else if` control flow inside the existing
`@switch (b.status) { @case ('AWAITING_PAYMENT') … }` branch; no `ngClass`/`ngStyle`; Tailwind via
the component-local `CLS` recipe map, reusing the existing banner shell so no new token is
introduced (`riviera-tailwind`: the bases stay single-sourced). The panel is a `<section>` with an
`aria-labelledby` heading, matching its three sibling banners, and carries a `data-testid` for the
e2e. No new route, no new service call.

## FE↔BE contract

- **New/changed endpoints:** none. `GET /api/bookings/{code}` gains one additive response field,
  `payWindowClosed: boolean` — `true` only when the booking's service day has opened in
  `Europe/Tirane`, `false` in every pre-existing case. `payment` remains `null` whenever
  `payWindowClosed` is `true`.
- **Client typing:** hand-written typed service — the field is added to the `BookingDetail`
  interface in `booking/booking.model.ts`. No `as any`.
- **Money/date on the wire:** unchanged — amounts stay integer minor units + currency, the booking
  date stays an ISO `LocalDate` string. The new field is a plain boolean precisely so the client
  never does civil-date arithmetic (invariant #6: the server owns the zone and the clock).

## Execution status

**Stage pointer:** `implement (phase 5 — docs freshness + close-out)`

**Next action:** Phase 5 — run `riviera-docs-freshness` over `origin/main..HEAD`, then mark the PR
ready for review and run the Review + Sonar gates.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The service-day boundary on `BookingCutoff` | ✅ | `379064d` |
| 1 — Cap the pay deadline (`RequestWindows` + the accept) | ✅ | `19de5c9` |
| 2 — The sweep enforces the capped deadline | ✅ | `1a48270` |
| 3 — Withhold credentials + `payWindowClosed` on the wire | ✅ | `4cfb763` |
| 4 — The guest-facing closed-window panel + e2e | ✅ | next commit |
| 5 — Docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/issue-576-service-day-pay-fence.md` — this plan
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/BookingCutoff.java` — promote `serviceDayOpensAt` to `public`; add `serviceDayHasOpened(LocalDate)` and `lastOpenedServiceDay(Instant)`
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestWindows.java` — `payDeadline` takes the service-day cap and returns the `min`
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RespondToRequestService.java` — inject `BookingCutoff`; pass the cap when announcing `BookingPaymentDue`
- `platform/src/main/java/ai/riviera/platform/booking/application/Bookings.java` — `findExpirableAwaitingPayment` gains the `serviceDayOnOrBefore` parameter
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — the third `OR` disjunct
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/AbandonedBookingSweepService.java` — inject `BookingCutoff`; bind the service-day arm off the sweep's single `now`
- `platform/src/main/java/ai/riviera/platform/booking/application/refund/ExpireAbandonedBookings.java` — Javadoc: the accepted arm's deadline is the capped one
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — gate `pendingCredentials` on the service day; compute `payWindowClosed`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — the new field
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — the new wire field
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RequestProperties.java` — Javadoc: `payWindow` is now capped at the use site too
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/BookingCutoffTest.java` — the boundary from both sides
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RequestWindowsTest.java` — the cap and the uncapped case
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RespondToRequestServiceTest.java` — the announced `payBy`
- `platform/src/test/java/ai/riviera/platform/booking/application/refund/AbandonedBookingSweepServiceTest.java` — the bound service-day argument
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — the no-interaction case and the regression
- `platform/src/test/java/ai/riviera/platform/booking/AbandonedBookingSweepIT.java` — the real-DB release
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — the wire shape
- `platform/src/test/java/ai/riviera/platform/booking/ServiceDayBackdate.java` — Javadoc widened past "confirmed"
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — the in-test `Bookings` fake's new parameter
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingsTransitionIT.java` — the JDBC-level three-arm proof: the new date bound selects on its own and does not over-select
- `platform/src/test/java/ai/riviera/platform/ScheduledQueryTimeoutIT.java` — the sweep read's bounded-query assertion, whose call gains the third argument
- `frontend/src/app/booking/booking.model.ts` — `payWindowClosed`
- `frontend/src/app/booking/booking-view.ts` — the closed-window panel
- `frontend/src/app/booking/booking-view.spec.ts` — AC-7 unit half
- `frontend/src/app/booking/booking.service.spec.ts|../find-booking.spec.ts|../my-bookings.spec.ts|../booking-pay.spec.ts` — the `BookingDetail` fixtures the new required field forces (the three `BookingConfirmation` fixtures are a different type and stay untouched)
- `frontend/e2e/request-to-book.e2e.ts` — AC-7 e2e half
- **No contrast spec change.** The panel reuses the `expired` banner recipe, whose fill/eyebrow/body/strong are already pinned by `booking-view.contrast.spec.ts`'s `BANNERS` table — which is the payoff of reusing a base rather than minting a token pair.
- `CLAUDE.md` — invariant #4's job list (close-out, `riviera-docs-freshness`)
- `RESPONSIBILITIES.md` — §`booking` (close-out, `riviera-docs-freshness`)

---

## Phase 0 — The service-day boundary on `BookingCutoff`

**Files:** Modify `booking/application/cancel/BookingCutoff.java` · Test
`booking/application/cancel/BookingCutoffTest.java`

- [ ] **Step 1: Write the failing test**

```java
	@Test
	void serviceDayHasOpenedOnlyFromMidnightInTirane() {
		LocalDate date = LocalDate.of(2026, 7, 1);
		// 2026-06-30T21:59:59Z is 23:59:59 in Tirane (CEST) — one second before the day opens.
		assertFalse(cutoffAt("2026-06-30T21:59:59Z").serviceDayHasOpened(date));
		assertTrue(cutoffAt("2026-06-30T22:00:00Z").serviceDayHasOpened(date));
	}

	@Test
	void lastOpenedServiceDayIsTheTiraneCivilDate() {
		BookingCutoff cutoff = cutoffAt("2026-06-30T22:00:00Z");
		assertEquals(LocalDate.of(2026, 7, 1), cutoff.lastOpenedServiceDay(Instant.parse("2026-06-30T22:00:00Z")),
				"a UTC instant after 22:00 is already the next civil day in Tirane");
	}

	@Test
	void serviceDayOpensAtMidnightInTirane() {
		assertEquals(Instant.parse("2026-06-30T22:00:00Z"),
				cutoffAt("2026-06-01T00:00:00Z").serviceDayOpensAt(LocalDate.of(2026, 7, 1)));
	}
```

> `cutoffAt(String)` is a one-line helper building a `BookingCutoff` on a fixed UTC `Clock`; match
> whatever `BookingCutoffTest` already uses for its `cancellationWindow*` cases rather than adding a
> second idiom.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*BookingCutoffTest*"` → FAIL,
      `serviceDayOpensAt` has private access / cannot find symbol `serviceDayHasOpened`

- [ ] **Step 3: Minimal implementation**

```java
	/** The instant the stay becomes consumable — midnight in {@code Europe/Tirane} (invariant #6). */
	public Instant serviceDayOpensAt(LocalDate bookingDate) {
		return bookingDate.atStartOfDay(TIRANE).toInstant();
	}

	/** Whether {@code bookingDate}'s stay is already underway — the pay window's closing bound. */
	public boolean serviceDayHasOpened(LocalDate bookingDate) {
		return !clock.instant().isBefore(serviceDayOpensAt(bookingDate));
	}

	/**
	 * The latest booking date whose service day has already begun at {@code now}. Takes the caller's
	 * reading rather than the clock, so a set-based sweep bounds its rows against the same instant it
	 * bounds its other arms with.
	 */
	public LocalDate lastOpenedServiceDay(Instant now) {
		return LocalDate.ofInstant(now, TIRANE);
	}
```

> Also switch the file's remaining fully-qualified `java.time.Instant` uses to the import the new
> signatures need — the class currently spells `java.time.Instant` inline.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*BookingCutoffTest*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — search `grep -rn "atStartOfDay\|Europe/Tirane" platform/src/main --include=*.java`
      → confirm no second civil-day computation exists outside `BookingCutoff`; record the result.

- [ ] **Step 6: Commit** — `git commit -m "Publish the service-day opening on BookingCutoff (#576)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window. **Open the draft PR
      now**, so CI fires on this and every later push (`riviera-sdlc` rule 3).

---

## Phase 1 — Cap the pay deadline

**Files:** Modify `booking/application/request/RequestWindows.java`,
`booking/application/request/RespondToRequestService.java`,
`booking/adapter/in/RequestProperties.java` (Javadoc) · Test
`booking/application/request/RequestWindowsTest.java`,
`booking/application/request/RespondToRequestServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
	@Test
	void payDeadlineIsCappedAtTheServiceDayOpening() {
		Instant acceptedAt = Instant.parse("2026-06-30T15:30:00Z");
		Instant serviceDayOpensAt = Instant.parse("2026-06-30T22:00:00Z");
		assertEquals(serviceDayOpensAt, WINDOWS.payDeadline(acceptedAt, serviceDayOpensAt),
				"a 12h window from 17:30 Tirane would run to 05:30 on the service day — invariant #4 caps it");
	}

	@Test
	void payDeadlineKeepsTheRawWindowWhenItEndsFirst() {
		Instant acceptedAt = Instant.parse("2026-06-20T09:00:00Z");
		Instant serviceDayOpensAt = Instant.parse("2026-06-30T22:00:00Z");
		assertEquals(acceptedAt.plus(PAY_WINDOW), WINDOWS.payDeadline(acceptedAt, serviceDayOpensAt),
				"a request accepted days ahead is bounded by the window, not the service day");
	}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*RequestWindowsTest*"` → FAIL,
      `payDeadline(Instant, Instant)` cannot be applied

- [ ] **Step 3: Minimal implementation**

```java
	public Instant payDeadline(Instant acceptedAt, Instant serviceDayOpensAt) {
		Instant raw = acceptedAt.plus(payWindow);
		return raw.isBefore(serviceDayOpensAt) ? raw : serviceDayOpensAt;
	}
```

  and at the accept, inject `BookingCutoff` into `RespondToRequestService` and pass the cap:

```java
		paymentDue.announce(new BookingPaymentDue(new BookingId(accepted.bookingId()),
				accepted.venueId(), accepted.setId(), accepted.bookingDate(),
				windows.payDeadline(accepted.acceptedAt(),
						cutoff.serviceDayOpensAt(accepted.bookingDate())),
				accepted.amountMinor(), accepted.currency()));
```

> Update `RequestWindows`' Javadoc: `payDeadline` and `acceptedBefore` are exact inverses **of the
> raw window**, and the service-day cap is the second, disjoint bound the sweep binds separately —
> the old "cannot drift" sentence is now only half true and must say which half.
> `RequestProperties`' "`payWindow` has no such cap" line becomes "capped at the service-day opening
> at the use site, exactly as `expiryWindow` is capped at the cutoff".

- [ ] **Step 4: Run it, verify it passes** —
      `./gradlew test --tests "*RequestWindowsTest*" --tests "*RespondToRequestServiceTest*" --tests "*RequestPropertiesTest*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — search
      `grep -rn "payDeadline\|payWindow" platform/src --include=*.java` → confirm every reader of the
      deadline now goes through the capped expression; record the sites.

- [ ] **Step 6: Commit** — `git commit -m "Cap the guest pay deadline at the service-day opening (#576)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The sweep enforces the capped deadline

**Files:** Modify `booking/application/Bookings.java`, `booking/adapter/out/JdbcBookings.java`,
`booking/application/refund/AbandonedBookingSweepService.java`,
`booking/application/refund/ExpireAbandonedBookings.java` (Javadoc) · Test
`booking/application/refund/AbandonedBookingSweepServiceTest.java`,
`booking/AbandonedBookingSweepIT.java`,
`booking/application/reserve/CreateBookingServiceTest.java` (fake signature)

- [ ] **Step 1: Write the failing test** (unit — the bound argument; IT — the real release)

```java
	@Test
	void bindsTheServiceDayArmToTheTiraneCivilDate() {
		Bookings bookings = mock(Bookings.class);
		when(bookings.findExpirableAwaitingPayment(any(), any(), any())).thenReturn(List.of());
		new AbandonedBookingSweepService(bookings, booking -> new PaymentCancellation.Canceled(),
				recordingRelease, CLOCK, new BookingCutoff(CLOCK)).sweep(TTL, WINDOWS);

		// CLOCK is 2026-11-01T09:00Z — 10:00 in Tirane, so every booking dated 2026-11-01 or
		// earlier is already underway.
		verify(bookings).findExpirableAwaitingPayment(any(), any(), eq(LocalDate.of(2026, 11, 1)));
	}
```

```java
	@Test
	void expiresAnAwaitingPaymentBookingOnceItsServiceDayHasOpened() {
		String code = anAwaitingPaymentBookingForTomorrow();
		// Freshly created, so neither the created_at nor the accepted_at arm can select it.
		new ServiceDayBackdate(jdbc).moveToPast(code, LocalDate.now(TIRANE).minusDays(1));

		assertEquals(1, sweep.sweep(Duration.ofHours(24), WINDOWS));

		assertEquals("CANCELLED", statusOf(code));
		assertEquals(0, availabilityRowsFor(code), "the set must be back in the pool (invariant #2)");
	}
```

> Reuse `AbandonedBookingSweepIT`'s existing fixtures for `anAwaitingPaymentBookingForTomorrow`,
> `statusOf` and the availability count rather than adding new ones; the TTL is deliberately 24h so
> only the service-day arm can select the row.

- [ ] **Step 2: Run it, verify it fails** —
      `./gradlew test --tests "*AbandonedBookingSweepServiceTest*"` → FAIL, `findExpirableAwaitingPayment`
      takes two arguments

- [ ] **Step 3: Minimal implementation**

```java
	List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore,
			LocalDate serviceDayOnOrBefore);
```

```java
		return sweepJdbc.sql("""
				SELECT id
				FROM booking
				WHERE status = :awaiting
				  AND (booking_date <= :serviceDayOnOrBefore
				    OR (accepted_at IS NULL AND created_at < :createdBefore)
				    OR (accepted_at IS NOT NULL AND accepted_at < :acceptedBefore))
				ORDER BY id
				""")
```

```java
	@Override
	public int sweep(Duration ttl, RequestWindows windows) {
		Instant now = clock.instant();
		List<BookingId> stale = bookings.findExpirableAwaitingPayment(now.minus(ttl),
				windows.acceptedBefore(now), cutoff.lastOpenedServiceDay(now));
```

> The SQL comment above the query names the third clock: *a service day already underway expires
> regardless of either window (invariant #4)*. One line, per `riviera-java-conventions` §6c.

- [ ] **Step 4: Run it, verify it passes** —
      `./gradlew test --tests "*AbandonedBookingSweepServiceTest*" --tests "*AbandonedBookingSweepIT*" --tests "*CreateBookingServiceTest*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — search
      `grep -rn "AWAITING_PAYMENT" platform/src/main --include=*.java` → decide for each site whether
      the service-day bound applies (expected: the sweep and the view only; the create path is already
      cutoff-guarded, the confirm path is out of scope by decision). Record the decision per site.

- [ ] **Step 6: Commit** — `git commit -m "Expire awaiting-payment bookings once their service day opens (#576)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Withhold credentials + `payWindowClosed` on the wire

**Files:** Modify `booking/application/view/ViewBookingService.java`,
`booking/application/view/BookingDetail.java`, `booking/adapter/in/BookingDetailView.java` · Test
`booking/application/view/ViewBookingServiceTest.java`, `booking/BookingViewIT.java`

- [ ] **Step 1: Write the failing test**

```java
	@Test
	void withholdsPaymentCredentialsOnceTheServiceDayHasOpened() {
		BookingRecord awaiting = awaitingPaymentOn(TODAY_IN_TIRANE);

		BookingDetail detail = serviceAt("2026-07-01T08:00:00Z").byCode(CODE).orElseThrow();

		assertNull(detail.payment(), "no clientSecret for a day already underway (invariant #4)");
		assertTrue(detail.payWindowClosed());
		verifyNoInteractions(checkout);
	}

	@Test
	void stillIssuesCredentialsBeforeTheServiceDayOpens() {
		BookingDetail detail = serviceAt("2026-06-30T12:00:00Z").byCode(CODE).orElseThrow();

		assertNotNull(detail.payment());
		assertFalse(detail.payWindowClosed());
	}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*ViewBookingServiceTest*"` →
      FAIL, cannot find symbol `payWindowClosed`

- [ ] **Step 3: Minimal implementation**

```java
		boolean payWindowClosed = cutoff.serviceDayHasOpened(b.bookingDate());
		// A clientSecret past the service-day opening buys a stay already underway (invariant #4).
		PaymentCredentials payment = b.status() == BookingStatus.AWAITING_PAYMENT && !payWindowClosed
				? checkout.pendingCredentials(new BookingRef(b.id())).orElse(null)
				: null;
```

  plus the new component field on `BookingDetail` / `BookingDetailView` and its Javadoc line.

> `verifyNoInteractions(checkout)` is the assertion that matters: like the D-8 `emailWithheld` gate
> beside it, this is a **short-circuit, not a filter on the answer** — the port must not be consulted.

- [ ] **Step 4: Run it, verify it passes** —
      `./gradlew test --tests "*ViewBookingServiceTest*" --tests "*BookingViewIT*" --tests "*BookingCreationViewsContractTest*"` → PASS

- [ ] **Step 5: Generalization-audit pass** — search
      `grep -rn "pendingCredentials" platform/src/main --include=*.java` → confirm `ViewBookingService`
      is the only issuer (the create path returns credentials from the reserve, which `isBookable`
      already fences). Record the result.

- [ ] **Step 6: Commit** — `git commit -m "Withhold payment credentials once the service day has opened (#576)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — The guest-facing closed-window panel

**Files:** Modify `frontend/src/app/booking/booking.model.ts`,
`frontend/src/app/booking/booking-view.ts` · Test `frontend/src/app/booking/booking-view.spec.ts`,
`frontend/src/app/booking/booking-view.contrast.spec.ts`,
`frontend/e2e/request-to-book.e2e.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('shows the closed pay-window panel instead of Pay now', async () => {
    renderDetail({ status: 'AWAITING_PAYMENT', payment: null, payWindowClosed: true });

    expect(screen.queryByTestId('pay-now')).toBeNull();
    expect(screen.getByTestId('pay-window-closed').textContent).toContain('can no longer be paid');
  });
```

> Match `booking-view.spec.ts`'s existing render/query idiom rather than importing a new one; the
> file already builds `BookingDetail` fixtures for the `PENDING_REQUEST` and `AWAITING_PAYMENT`
> panels.

- [ ] **Step 2: Run it, verify it fails** — `npm test -- booking-view` → FAIL, no
      `pay-window-closed` element

- [ ] **Step 3: Minimal implementation** — the `@else if` arm inside the existing
      `@case ('AWAITING_PAYMENT')`:

```html
            } @else if (b.payWindowClosed) {
              <section
                [class]="cls.bannerClosed"
                data-testid="pay-window-closed"
                aria-labelledby="request-state-title"
              >
                <h2 id="request-state-title" class="{{ cls.eyebrow }} {{ cls.eyebrowClosed }}">
                  Payment window closed
                </h2>
                <p [class]="cls.bannerBody">
                  Bookings for {{ b.bookingDate | date: 'longDate' }} closed before the day began, so
                  this booking can no longer be paid. You haven’t been charged, and the spot has been
                  released.
                </p>
              </section>
            }
```

> Reuse an existing banner variant from the `CLS` map if one already reads as "terminal, no charge"
> (the `DECLINED`/`EXPIRED` panels are the closest siblings) rather than minting a new token pair —
> `riviera-tailwind`: the shared *bases* stay single-sourced.

- [ ] **Step 4: Run it, verify it passes** — `npm test -- booking-view` then
      `npm run test:a11y` → PASS

- [ ] **Step 5: Add the e2e half** — in `frontend/e2e/request-to-book.e2e.ts`, a `page.route`
      returning `{ status: 'AWAITING_PAYMENT', payment: null, payWindowClosed: true }`, asserting the
      panel is visible, `pay-now` is absent, and `expectNoSeriousAxeViolations` passes. Run
      `npm run test:e2e:a11y -- request-to-book`.

- [ ] **Step 6: Commit** — `git commit -m "Tell the guest when the pay window has closed (#576)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — Docs freshness + close-out

**Files:** Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, this plan doc

- [ ] **Step 1: Run `riviera-docs-freshness`** over `origin/main..HEAD`. Expected findings, to be
      confirmed rather than assumed:
      - `CLAUDE.md` invariant #4 — *"one rule, two jobs"* is now three (booking closes, cancellation
        cutoff, **and** the pay window's closing bound sits at the service-day opening it already
        governs via invariant #10's amendment).
      - `RESPONSIBILITIES.md` §`booking` — the Job line's *"same-day cutoff"* now covers the pay
        deadline; R-1's accepted residual belongs here, not in Javadoc (`riviera-java-conventions`
        §6d: rationale lives in `RESPONSIBILITIES.md`, Javadoc carries the contract).
      - The counting sweep: `BookingCutoff` now has **four** jobs, and any doc saying "two" or
        "three" is stale outside the diff.
- [ ] **Step 2: Run the file-structure guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
- [ ] **Step 3: Run the inline-comment guard** — `node scripts/check-inline-comments.mjs --diff origin/main`
- [ ] **Step 4: Mark the PR ready for review**, then run the Review gate and the Sonar gate per
      `riviera-sdlc` `references/pr-gates.md`.
- [ ] **Step 5: Finalize this Execution status in the PR's own last commit**, citing
      `merged via PR #NN` — never a merge SHA.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-08 | phase 2 | other holders of past-dated `AWAITING_PAYMENT` rows, which the new arm turns into sweep candidates in the shared Testcontainers DB | `grep -rln "AWAITING_PAYMENT" platform/src/test/java --include=*IT.java` then the `booking_date` each writes | 20 ITs; every one dates its `AWAITING_PAYMENT` rows in the future (2027/2028) or creates them through the cutoff-guarded create path | **no change needed, but the coupling is new and worth naming** (R-8): before this arm a foreign row could only become a candidate by ageing past a TTL, which test rows never do; now a past `booking_date` alone suffices. `AbandonedBookingSweepIT`'s own isolation gains the one opened date it writes, and the exact-count assertions still hold. |
| 2026-08-08 | phase 1 | every reader of the pay deadline, so none keeps the uncapped expression | `grep -rn "payDeadline\|payWindow" platform/src --include=*.java` | `RespondToRequestService` (the mail), `AbandonedBookingSweepService` via `acceptedBefore` (the sweep), `RequestProperties` (validation prose) | **all three reconciled.** The mail now passes the cap; the sweep's raw-window arm is unchanged by design and gains the service-day arm in phase 2; `RequestProperties`' "no such cap" sentence was the line issue #576 itself quoted and is rewritten. |
| 2026-08-08 | phase 0 | a second civil-day computation that should share the new boundary | `grep -rn "atStartOfDay\|Europe/Tirane" platform/src/main --include=*.java` | 6 modules declare their own `TIRANE` constant (`customer`, `notification`, `venue`, `payout`, `availability`, and `booking`'s `StaffBookingController`) | **skip, deliberately.** Each is a different question about civil days (a retention cutoff, a mail render zone, an ISO week key, a staff "today" default), none is the service-day boundary, and a cross-module zone constant would need a `shared` admission that rests on ownership, not reuse. Inside `booking`'s pay/cancel path `BookingCutoff` remains the only site. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*RequestWindowsTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `./gradlew test --tests "*RespondToRequestServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `./gradlew test --tests "*AbandonedBookingSweepIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `./gradlew test --tests "*ViewBookingServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `./gradlew test --tests "*BookingViewIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `./gradlew test --tests "*ViewBookingServiceTest*" --tests "*AbandonedBookingSweepServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `npm test -- booking-view` and `npm run test:e2e:a11y -- request-to-book` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; the widened candidate set still passes the one guarded release (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new published surface (invariant #11).
- [ ] **Payment/payout** section filled; webhooks remain the source of truth; no money moves (invariants #5, #8, #9).
- [ ] Refund policy untouched and still server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for every civil-day read, one clock reading per decision (invariant #6).
- [ ] Booking codes unguessable and never logged (invariant #7).
- [ ] No schema change, so no Flyway migration — and the plan says so explicitly (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc` `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
