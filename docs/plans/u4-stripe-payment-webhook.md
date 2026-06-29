# U4 — Stripe payment: PaymentIntent + webhook-verified confirmation — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd` (installed), task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the U3 stub gateway with **real Stripe collection** behind the existing
`payment` ports. Creating a booking now creates a Stripe **PaymentIntent** (with an
idempotency key, amount in EUR minor units) and leaves the booking `AWAITING_PAYMENT`; the
booking is confirmed **only** from a **signature-verified** Stripe webhook
(`payment_intent.succeeded`), never the client redirect (invariant #8). Duplicate /
out-of-order webhooks are idempotent. Collect-only — **no Stripe Connect** (ADR-0002).

**Architecture:** This slice splits confirmation off the synchronous create transaction onto
the webhook, introducing the **first cross-module event** (`payment` → `booking`). Because a
direct call would cycle (`booking` already depends on `payment::api`; `payment` calling a
`booking` port back is a cycle, invariant #11), `payment` **publishes** a `PaymentConfirmed`
event and `booking` **listens**. U4 uses a **synchronous, in-transaction `@EventListener`**
(runs in the webhook's transaction); the **registry-backed async `@ApplicationModuleListener`
spine remains U5's** "first async seam." Reliability for U4 comes from **Stripe's webhook
re-delivery** (non-2xx ⇒ retry) + a **`stripe_webhook_event` dedup table** + the existing
**state-guarded transition** (`UPDATE … WHERE status = 'AWAITING_PAYMENT'`) — two idempotency
layers, no broker, no registry.

**Gateway coexistence:** `StubPaymentGateway` stays the **default** bean (dev/CI + the U3
synchronous flow stay green); `StripePaymentGateway` activates under the **`stripe`** Spring
profile. The stub returns `PaymentOutcome.Succeeded` (confirm-now); Stripe returns the new
`PaymentOutcome.Pending(clientSecret, paymentIntentId)` (leave `AWAITING_PAYMENT`, confirm on
webhook). The same internal confirm path serves both. The webhook controller and the
`booking` listener are **profile-independent** and fully exercised by integration tests that
POST **constructed, signed** events — **no live Stripe network call in CI**.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V7** creates `payment` and
`stripe_webhook_event`. No event-publication-registry table (sync listener; the registry is
U5).

**Source of intent:** `docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`
(§5 payments, collect-only) + GitHub issue **#8**. Builds on U3 (#6).

**Skills consulted:** `riviera-stripe-payments` (collect-only / no-Connect; PaymentIntent +
idempotency key derived from booking id; webhook-as-source-of-truth + signature verification;
dedupe on event id; money minor units; store Stripe ids not card data), `riviera-modulith`
(the `payment`→`booking` event seam: `PaymentConfirmed`/`PaymentCanceled` records in
`payment.api`, sync `@EventListener` in `booking.infrastructure.in`, id-based payload, no
cycle, `verify()` contract; `availability.api.release`; webhook controller in
`payment.infrastructure.in`), `riviera-java-conventions` (records for the event/DTO/`Pending`
types, sealed `PaymentOutcome`/`BookingOutcome` + exhaustive switch, package-private adapters,
`@Profile` bean, typed-outcome over exceptions, narrow catches around the Stripe SDK,
`StripeClient` injected as a mockable seam, no Lombok), `postgres` (`payment` +
`stripe_webhook_event` tables: BIGINT-identity PK, TEXT+CHECK status, `UNIQUE(payment_intent_id)`
+ `UNIQUE(booking_ref)`, dedup PK on `event_id`, FK-index discipline, no NUMERIC money),
`codebase-design` (kept the inbound/outbound `payment` port split from U3; `Pending` extends
the existing `PaymentOutcome` seam rather than a new port).

**Branch:** `claude/riviera-sdd-issue-8-szoljn` (current).

---

## Issue-intake grill outcome (drift vs #8, recorded before planning)

The Issue-intake grill gate (riviera-sdd) was run against current `main`. Findings:

1. **U3 confirms synchronously in one transaction; U4 must split confirmation onto the
   webhook** — so `POST /api/bookings` can **no longer always return `CONFIRMED`**. Under the
   `stripe` profile it returns **`202 AWAITING_PAYMENT` + a `clientSecret`**; confirmation
   arrives later via the webhook. The issue's ACs (all backend-shaped, `area:backend` label)
   don't spell this out — surfaced here.
2. **This is the first cross-module event seam.** The **U5/#9 plan claims it introduces "the
   first asynchronous seam" + the Event Publication Registry.** U4 needs a payment→booking
   seam *first*. Reconciled by making **U4's listener synchronous (no registry)**; U5 still
   legitimately introduces the **async** `@ApplicationModuleListener` + registry. The U5 plan
   also needs a one-line update: after U4 the **confirmation point moves** from
   `CreateBookingService` to the payment-event listener, so U5's "publish `BookingConfirmed`
   on confirm" hooks the listener, not the create service. → recorded in *Open questions*.
3. **The held→confirmed gap (invariant #2 exposure).** A set is claimed at create-time but the
   booking sits `AWAITING_PAYMENT` until the webhook. U4 releases the claim on
   `payment_intent.canceled`; **true abandonment** (closed tab, no terminating webhook) needs a
   time-based TTL sweep — **deferred to a follow-up** (it needs scheduling infrastructure). See
   *Open questions* and R-7.
4. **`payment_intent.payment_failed` is NOT terminal** in Stripe (the PI returns to
   `requires_payment_method`; the customer may retry). So U4 keys claim-release off
   **`payment_intent.canceled`** only; a `payment_failed` records the attempt without releasing.

## Decisions taken without the user (AskUserQuestion was unavailable — tool stream error)

Recorded prominently so they can be vetoed at plan-accept. All are the recommended options:

- **D-1 Scope = backend-only.** Build PaymentIntent + signature-verified webhook + confirmation
  event on the backend, proven by ITs. The Angular Stripe **Payment Element** UI (card entry,
  "processing → confirmed" UX consuming the `clientSecret`) is a **follow-up FE issue**. Matches
  the `area:backend` label.
- **D-2 Stub stays default; Stripe behind the `stripe` profile.** Dev/CI keep the synchronous
  confirm and U3 stays green; the webhook path is proven by ITs with a test webhook secret.
- **D-3 Release claim on `payment_intent.canceled`; defer the TTL expiry sweep** (new scheduled-
  job infra) to a follow-up.

## Acceptance criteria (testable)

Written at the application boundary (inner hexagon) where possible; Stripe/HTTP specifics are
asserted in adapter-level tests.

- [ ] **AC-1:** Given an Instant booking is created under the `stripe` profile, when the
  create transaction commits, then a Stripe **PaymentIntent** is created with **amount = the
  set price in EUR minor units** and an **idempotency key derived from the booking id**, the
  booking is `AWAITING_PAYMENT`, and the outcome carries the PI `clientSecret`. *Pinned by:*
  `StripePaymentGatewayTest.createsIntentWithIdempotencyKeyAndMinorUnits` (mocked
  `StripeClient`) + `CreateBookingStripeProfileIT.leavesAwaitingPaymentWithClientSecret`.
- [ ] **AC-2:** Given an `AWAITING_PAYMENT` booking with a recorded PaymentIntent, when a
  **signature-verified** `payment_intent.succeeded` webhook for it is received, then the
  booking becomes `CONFIRMED` (and a `PaymentConfirmed` was published). *Pinned by:*
  `StripeWebhookIT.verifiedSucceededConfirmsBooking`.
- [ ] **AC-3:** Given a webhook whose **signature is invalid/absent**, when posted, then `400`,
  the payment/booking state is unchanged, and no event is published — **a client redirect or
  unverified call never confirms** (invariant #8). *Pinned by:*
  `StripeWebhookIT.badSignatureRejectedNoConfirm`.
- [ ] **AC-4:** Given the **same** `payment_intent.succeeded` event is delivered **twice**
  (Stripe re-delivery), then exactly **one** confirmation occurs and the booking is `CONFIRMED`
  once (idempotent; deduped on Stripe event id + guarded transition). *Pinned by:*
  `StripeWebhookIT.duplicateDeliveryIsIdempotent`.
- [ ] **AC-5:** Given an **out-of-order** delivery (e.g. a stale `payment_intent.succeeded`
  arriving after the booking is already `CONFIRMED`, or an unrelated event type), then no
  double-confirm and no error to Stripe. *Pinned by:* `StripeWebhookIT.outOfOrderIsSafe`.
- [ ] **AC-6:** Given a `payment_intent.canceled` webhook for an `AWAITING_PAYMENT` booking,
  then the booking is `CANCELLED` **and** its `(set, date)` availability row is **released**
  (re-claimable). *Pinned by:* `StripeWebhookIT.canceledReleasesClaimAndCancelsBooking`.
- [ ] **AC-7:** **Collection-only — no Connect.** No Stripe `Account`/`Transfer`/
  `application_fee`/`on_behalf_of`/destination-charge usage anywhere. *Pinned by:*
  `NoStripeConnectArchitectureTest` (scans `payment` for Connect types/params).
- [ ] **AC-8:** **Default profile (stub) is unchanged** — `POST /api/bookings` still returns
  `201 CONFIRMED` synchronously and all U3 ACs still pass. *Pinned by:* the existing
  `BookingControllerIT` + `ConcurrentReservationIT` (green, default profile).
- [ ] **AC-9:** Stripe API key + webhook secret are read from **env/config** (`STRIPE_API_KEY`,
  `STRIPE_WEBHOOK_SECRET`); **no secret value is committed**. *Pinned by:*
  `secret_scan` CI + `StripeConfigTest` (binds from properties) + grep gate in review.
- [ ] **AC-10:** Money is integer minor units + ISO currency end-to-end across the Stripe
  boundary (conversion only at the SDK edge; no `double`/`float`/`BigDecimal`-as-currency).
  *Pinned by:* `StripePaymentGatewayTest` (asserts the `long` amount passed to the SDK).
- [ ] **AC-11:** `ApplicationModules.verify()` passes — the `payment`→`booking` collaboration
  is via the published event only; no new cycle; no import of another module's internals.
  *Pinned by:* `ModularityTests`.
- [ ] **AC-12:** No JPA/Hibernate/Lombok introduced; `payment` persistence is `JdbcClient` +
  SQL. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [ ] **AC-13:** Backend CI green (build + tests + CodeQL + Sonar + secret scan). *Pinned by:*
  the CI run on the PR.

## Non-goals

- **Angular Stripe Payment Element UI** (card entry, 3DS, "processing → confirmed" polling that
  consumes the `clientSecret`) — **follow-up FE issue** (D-1). U4 is backend + contract.
- **The registry-backed async `@ApplicationModuleListener` spine + `event_publication`
  migration** — **U5** (#9). U4's listener is synchronous/in-tx.
- **`BookingConfirmed` spine fan-out** (availability re-mark, payout accrual) — **U5**.
  Availability is already claimed at create-time; U4 does not publish `BookingConfirmed`.
- **TTL expiry sweep** for abandoned `AWAITING_PAYMENT` bookings (no terminating webhook) —
  **follow-up** (needs scheduling infra; D-3 / R-7).
- **Refunds / cancellation policy / weather exception** — U6/U10.
- **Request-to-Book** (authorize-and-capture) — later; U4 is the Instant-Book pay-now path.
- **Payout ledger / commission** — U5; **Apple/Google Pay, SEPA, saved cards** — later.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Booking confirmed from an **unverified** source (client redirect, spoofed webhook) | med | high | Confirm **only** via `Webhook.constructEvent(rawBody, sig, secret)`; bad/absent sig → 400, no state change, no event (invariant #8). `StripeWebhookIT.badSignatureRejectedNoConfirm` | claude | open |
| R-2 | **Duplicate** webhook delivery double-confirms (or, in U5, double-accrues) | high | high | `stripe_webhook_event(event_id PK)` `INSERT … ON CONFLICT DO NOTHING` (0 rows ⇒ already seen ⇒ skip) **and** the guarded transition `UPDATE … WHERE status='AWAITING_PAYMENT'` (idempotent). Two layers. AC-4 | claude | open |
| R-3 | **Network call inside the create transaction** (PI creation) holds the claim row lock / a pooled connection | med | med | PI creation is fast; a concurrent same-set booker blocks briefly then `409` (correct). v1 scale (5–15 venues) makes this safe. PI-fail ⇒ tx rollback ⇒ claim freed (clean). **Two-phase split** (commit then create-PI + compensating release) noted as a future optimization if load grows | claude | open |
| R-4 | **Held→confirmed gap** leaves a set claimed for an abandoned, never-paid booking (invariant #2) | med | med | `payment_intent.canceled` ⇒ release claim + cancel booking (AC-6). True abandonment (no webhook) ⇒ **TTL sweep follow-up** (D-3). Degrades safely: the set is held, never double-sold | claude | open |
| R-5 | **Stale `canceled`** releases a `(set,date)` row a *different* booking now holds | low | high | Release only deletes a `BOOKED_ONLINE` row; in v1 the canceling booking is the current holder (no same-day re-booking, prompt cancels). **U6's `held_by_booking_id`** will tighten release to the owning booking. Documented | claude | open |
| R-6 | **Money** mis-converted at the Stripe edge (cents vs euros, float) | low | high | `long` minor units passed straight to the SDK `amount`; currency `"eur"`; no `BigDecimal`. AC-10 | claude | open |
| R-7 | **`payment_failed` treated as terminal** ⇒ premature release; customer retry then orphaned | low | med | `payment_failed` is **not** terminal in Stripe; U4 records the attempt only and does **not** release. Release keys off `canceled` (AC-6) | claude | open |
| R-8 | **Secret leakage** (API key / webhook secret committed or logged) | low | high | Secrets from env (`STRIPE_*`); none in the repo; never log the raw body, signature, or key. CI `secret_scan`. AC-9 | claude | open |
| R-9 | A well-meaning change reaches for **Stripe Connect** (the textbook marketplace split) | med | high | ADR-0002 + `riviera-stripe-payments`: collect-only, manual BKT payout. `NoStripeConnectArchitectureTest` (AC-7) fails the build on Connect types | claude | open |
| R-10 | Webhook endpoint blocked by Spring Security (401) / CSRF (403), or body pre-parsed so signature breaks | high | high | `SecurityConfig`: `permitAll` + CSRF-ignore `POST /api/payments/stripe/webhook`; read the **raw** body (`@RequestBody byte[]`/`String`) for signature verification — never a parsed DTO | claude | open |

## Open questions / Assumptions

- **Assumption (D-1):** Backend-only; the Angular Payment Element is a follow-up FE issue. The
  `stripe`-profile `202 + clientSecret` contract is proven by ITs, not a live UI, in U4. —
  *Owner:* claude · *Confirm at plan-accept.*
- **Assumption (D-2):** Stub is the default gateway; Stripe is `@Profile("stripe")`. CI runs the
  default profile for U3 regression **and** a `stripe`-profile slice for the new ITs. — *Owner:*
  claude · *Confirm at plan-accept.*
- **Assumption (D-3):** Claim release fires on `payment_intent.canceled`; the time-based TTL
  sweep is a follow-up issue (opened in Phase 7). — *Owner:* claude · *Confirm at plan-accept.*
- **Assumption:** No DB foreign key from `payment.booking_ref` → `booking(id)` — the reference is
  **logical, by id** (invariant #11), keeping the `payment` table independent of `booking`'s.
  (The existing `booking`→`venue`/`customer` FKs are a pre-existing intra-schema choice; not
  propagated here.) — *Owner:* claude · *Resolves by:* Phase 0.
- **Assumption:** One PaymentIntent per booking (`UNIQUE(booking_ref)`); Instant-Book charges the
  single set price (one set = 2 loungers + umbrella, full day). No multi-set/fees in U4. —
  *Owner:* claude.
- **Open question (drift):** U5/#9 says it introduces the first async seam + registry; U4
  introduces a **sync** event seam first, and **moves the confirmation point** to the listener.
  Update the U5 plan/issue wording accordingly (sync→async upgrade; publish-on-confirm hooks the
  listener). — *Owner:* claude · *Resolves by:* a note appended to `docs/plans/u5-event-spine-payout-accrual.md` in Phase 7.

### Resolved
- **D-1 Scope = backend-only** — confirmed by user at plan-accept (AskUserQuestion). Angular
  Stripe Payment Element → follow-up FE issue.
- **D-2 Stub default; Stripe behind the `stripe` profile** — confirmed by user at plan-accept.
- **D-3 Release on `payment_intent.canceled`; defer the TTL sweep** — confirmed by user at
  plan-accept. (`payment_failed` is non-terminal → records the attempt, no release.)

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)` in scope:** the existing **claim**
  (unchanged) **+ a new `release`** (DELETE of the `BOOKED_ONLINE` row) on
  `payment_intent.canceled`. Both go through `availability.api.AvailabilityClaim` — the module
  stays the **sole writer** of the source of truth.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` (V4). Claim is still the
  atomic `INSERT … ON CONFLICT DO NOTHING`; release is a `DELETE … WHERE state='BOOKED_ONLINE'`.
- **Held→confirmed gap:** the claim is taken at create-time and **held while
  `AWAITING_PAYMENT`** (the row blocks all other parties — invariant #2 holds throughout). On
  success the booking flips to `CONFIRMED` (row stays); on `canceled` the row is released
  (re-claimable); on abandonment the row stays held until the TTL sweep (follow-up).
- **No double-confirm under redelivery:** the confirm transition is guarded
  (`WHERE status='AWAITING_PAYMENT'`) and the event is deduped on Stripe event id.
- **Pinning tests:** `StripeWebhookIT.duplicateDeliveryIsIdempotent`,
  `StripeWebhookIT.canceledReleasesClaimAndCancelsBooking`, and the unchanged
  `ConcurrentReservationIT` (default profile).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Why |
|---|---|---|---|
| M-1 | `payment` | existing | real Stripe adapter, webhook controller, payment persistence, publishes the confirmation/cancel events |
| M-2 | `booking` | existing | listens for the payment events; new `AwaitingPayment` outcome; idempotent confirm + cancel; switches the create flow on `Pending` |
| M-3 | `availability` | existing | adds `release(SetId, LocalDate)` to its write port (consumed by `booking`) |

**Cross-module named interfaces (`api/` ports & events)**

| # | Module.api | Port / type | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `PaymentConfirmed` (event record) | `BookingRef` (existing) + `String paymentIntentId` | `booking` (listener) |
| NI-2 | `payment.api` | `PaymentCanceled` (event record) | `BookingRef` | `booking` (listener) |
| NI-3 | `payment.api` | `PaymentOutcome.Pending` (new sealed case) | `String clientSecret, String paymentIntentId` | `booking` (create switch) |
| NI-4 | `availability.api` | `AvailabilityClaim#release(SetId, LocalDate)` (**new**) | — | `booking` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by |
|---|---|---|---|---|---|---|
| EV-1 | `PaymentConfirmed` | `payment` (webhook controller) | `{ BookingRef, String paymentIntentId }` | `booking` (`@EventListener`) | **sync, in webhook tx** | `StripeWebhookIT` |
| EV-2 | `PaymentCanceled` | `payment` (webhook controller) | `{ BookingRef }` | `booking` (`@EventListener`) | **sync, in webhook tx** | `StripeWebhookIT` |

> No cycle: the event types live in `payment.api`; `booking` already depends on `payment::api`
> (it calls `CheckoutPort`). `booking` listening to `payment.api.*` adds **no new edge**.
> `payment` gains **no** dependency on `booking`. (`availability::api` is already a `booking`
> dependency; `release` is one more method on an existing port.) `ModularityTests` proves it.

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only, **no Connect** (ADR-0002). Stripe SDK lives **only** in
  `payment.infrastructure.*`, behind the outbound `PaymentGateway`; `payment.api.CheckoutPort`
  is the inbound seam `booking` calls (both unchanged in shape; `PaymentOutcome` gains `Pending`).
- **PaymentIntent:** created by `StripePaymentGateway` (`@Profile("stripe")`) with
  `amount = set price minor units`, `currency = "eur"`, **idempotency key = `booking-{id}-pi`**,
  and **`metadata.bookingRef = {id}`**. Returns `Pending(clientSecret, paymentIntentId)`.
- **Confirmation = signature-verified webhook only** (invariant #8). The webhook controller
  verifies the signature, dedupes on event id, updates the `payment` row, and publishes
  `PaymentConfirmed`. The client redirect never confirms.
- **Idempotency:** Stripe idempotency key on PI creation; webhook dedup on event id; guarded,
  re-runnable state transitions. (Payout exactly-once is U5.)
- **Money:** integer minor units, EUR; converted only at the SDK edge.
- **Stored Stripe data:** `payment_intent_id` + status only — **never PAN/CVV** (Stripe Elements
  keeps us out of PCI scope).
- **Payout-ledger effect:** **none in U4** (accrual is U5). The webhook is the trigger U5 will
  build the `BookingConfirmed` publish onto.
- **Pinning tests:** `StripePaymentGatewayTest`, `StripeWebhookIT`, `NoStripeConnectArchitectureTest`.

## Angular — frontend surfaces touched

`N/A in U4 — backend-only (D-1).` The Stripe Payment Element integration (consuming the
`stripe`-profile `clientSecret`) is a **follow-up FE issue** opened in Phase 7. The default
(stub) profile keeps the existing U3 frontend working unchanged (AC-8).

## FE↔BE contract

- **`POST /api/bookings`** (existing):
  - **Default (stub) profile — unchanged:** `201` `{ code, status:"CONFIRMED", … }` (U3 shape).
  - **`stripe` profile (new):** `202 Accepted`
    `{ code, status:"AWAITING_PAYMENT", clientSecret, paymentIntentId, venueId, venueName,
    setId, rowLabel, positionNo, bookingDate, amount:{ minorUnits, currency } }`.
    The FE (follow-up) uses `clientSecret` with Stripe.js, then awaits webhook-driven
    confirmation. Rejections (`409`/`422`/`404`/`400`) unchanged.
- **`POST /api/payments/stripe/webhook`** (new): raw body + `Stripe-Signature` header; `200`
  on accepted/duplicate/ignored, `400` on bad signature. Public + CSRF-exempt; **not** browser-
  facing.
- **Money/date on the wire:** integer minor units + currency; `bookingDate` ISO `LocalDate`.

## Review gate outcome (SDD)

Ran the Review gate on `origin/main...HEAD`: `riviera-review-overlay` + `/code-review`
(3 parallel finder passes — backend correctness, riviera invariants, cleanup/altitude/contract),
1-vote recall-biased verify.

**No Blockers, no Majors.** All invariant gates PASS: RV-BE-1 availability (the held→confirmed
gap; `release` scoped to `BOOKED_ONLINE` + the `cancelAwaitingPayment` guard means a stale
`canceled` can't free a row a different booking re-took — proven by
`PaymentEventListenerIT.canceledAfterConfirmationDoesNotReleaseClaim`); RV-CT-3/RV-BE-7
webhook-as-truth (signature-verified only, two-layer idempotency: event-id dedup + guarded
transition); #5 money minor units (lowercase `eur` only at the Stripe edge); #1 JDBC-only;
#11 Modulith (payment→booking events-only, no cycle — `ModularityTests` green); #7 no
secret/code logging; ADR-0002 no Connect (`NoStripeConnectArchitectureTest`); #12 V7 constraints.
RV-PROC-1: *Skills consulted* covers the diff (postgres / riviera-modulith / riviera-java-conventions
/ riviera-stripe-payments / codebase-design).

Findings (all **Minor**, dispositioned — none blocks merge):
- **Network call inside the create `@Transactional`** holds the claim row lock for the Stripe PI-
  creation latency, and `StripeClient` uses long default timeouts (~80s read). This is risk **R-3**
  (acknowledged, v1-scale-acceptable; two-phase split is the noted future optimization). *Optional
  hardening:* set an explicit shorter `StripeClient` connect/read timeout to bound the lock-hold. →
  **deferred** (folds into the R-3 two-phase follow-up).
- `AwaitingPaymentView` duplicates `BookingConfirmationView`'s field mapping (one factory). → **deferred** (minor; flat wire shape kept deliberately for the FE follow-up).
- `JdbcBookings.confirm` vs `confirmFromPayment` share UPDATE shape but differ by design (strict throw vs idempotent boolean). → **acknowledged, no change** (the differing error semantics are intentional).
- `paymentIntentId()` `deserializeUnsafe` fallback is guarded by `instanceof PaymentIntent` → safe `200` no-op on an unexpected shape. → **not a defect**.
- `NoStripeConnectArchitectureTest` is a static-symbol scan (won't catch reflective Connect use). → **accepted** (defends against accidental, not adversarial, use).
- Out-of-order confirmed-then-stale-canceled is covered at the listener level (`PaymentEventListenerIT`); webhook-level dedup is event-id based. → **covered**.

**Follow-up issues opened** (D-1/D-3/R-3): **#50** Angular Stripe Payment Element (FE), **#51**
TTL expiry sweep for abandoned `AWAITING_PAYMENT` bookings, **#52** two-phase create (PI outside
the tx) + explicit `StripeClient` timeouts.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — V7 migration (`payment` + `stripe_webhook_event`) | ✅ | |
| 1 — Stripe dep + config/secrets; `PaymentOutcome.Pending`; gateway `initiate` | ✅ | |
| 2 — payment persistence (`Payments` port + `JdbcPayments` + `PaymentStatus`) | ✅ | |
| 3 — `StripePaymentGateway` (`@Profile stripe`): PI + idempotency + metadata | ✅ | |
| 4 — payment events + `StripeWebhookController` (verify, dedup, publish) | ✅ | (webhook SecurityConfig permit folded in here so the IT exercises the real filter chain) |
| 5 — booking: `AwaitingPayment` outcome, create switch, sync listener, confirm/cancel, `availability.release` | ✅ | (controller `202` mapping folded in here so the sealed switch stays exhaustive) |
| 6 — controller mapping (202 + clientSecret) + webhook security/raw-body | ✅ | (mapping + security landed in Phases 4–5; this phase adds the stripe-profile create IT) |
| 7 — verify + ModularityTests/JdbcOnly/Connect-scan + follow-ups + PR + review gate | ✅ | full suite green (both profiles); review gate run — no Blockers/Majors; PR + follow-up issues await user go-ahead |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Backend (`platform/src/main/java/ai/riviera/platform/`)**
- `payment/api/PaymentOutcome.java` — add `Pending(String clientSecret, String paymentIntentId)` to the sealed permits.
- `payment/api/PaymentConfirmed.java`, `payment/api/PaymentCanceled.java` — published event records (id-based).
- `payment/api/package-info.java` — javadoc: now also publishes the confirmation/cancel events.
- `payment/application/out/PaymentGateway.java` — rename `charge` → `initiate` (semantics: may return `Pending`); javadoc update.
- `payment/application/PaymentService.java` — delegate `pay` → `gateway.initiate`.
- `payment/application/out/Payments.java` — persistence port (`record`, `findBookingRefByIntent`, `markStatus`).
- `payment/application/out/NewPayment.java` — driven-port DTO.
- `payment/domain/PaymentStatus.java` — enum (mirrors the CHECK).
- `payment/infrastructure/out/StripePaymentGateway.java` — `@Component @Profile("stripe")`; injects `com.stripe.StripeClient`.
- `payment/infrastructure/out/StubPaymentGateway.java` — unchanged behavior (default bean; returns `Succeeded`).
- `payment/infrastructure/out/JdbcPayments.java` — JDBC adapter.
- `payment/infrastructure/in/StripeWebhookController.java` — `POST /api/payments/stripe/webhook`; verify + dedup + publish.
- `payment/infrastructure/in/StripeWebhookEvents.java` — dedup port + `JdbcStripeWebhookEvents` adapter (or fold into `Payments`).
- `payment/infrastructure/StripeConfig.java` — `@Configuration`; binds `STRIPE_API_KEY` → `StripeClient` bean (`@Profile("stripe")`) + webhook-secret property.
- `availability/api/AvailabilityClaim.java` — add `release(SetId, LocalDate)`.
- `availability/infrastructure/out/JdbcAvailabilityClaim.java` — implement `release` (DELETE).
- `booking/application/in/BookingOutcome.java` — add `AwaitingPayment(BookingConfirmation details, String clientSecret, String paymentIntentId)`.
- `booking/application/CreateBookingService.java` — switch on `Succeeded`/`Pending`/`Failed`.
- `booking/application/out/Bookings.java` — add `confirmFromPayment(long, Instant)` (idempotent) + `cancelAwaitingPayment(long) -> boolean`.
- `booking/infrastructure/out/JdbcBookings.java` — implement the two new methods.
- `booking/infrastructure/in/PaymentEventListener.java` — sync `@EventListener` for `PaymentConfirmed`/`PaymentCanceled`.
- `booking/infrastructure/in/BookingController.java` — map `AwaitingPayment` → `202` + `clientSecret`.
- `SecurityConfig.java` — permit + CSRF-ignore the webhook path.
- `resources/db/migration/V7__payment_and_webhook_events.sql`.
- `resources/application.properties` — `stripe.api-key=${STRIPE_API_KEY:}`, `stripe.webhook-secret=${STRIPE_WEBHOOK_SECRET:}`.
- Tests: `PaymentMigrationIT`, `StripePaymentGatewayTest`, `JdbcPaymentsIT`, `StripeWebhookIT`,
  `CreateBookingStripeProfileIT`, `NoStripeConnectArchitectureTest`, `StripeConfigTest`.

**Build:** add `implementation 'com.stripe:stripe-java:<pinned>'` to `platform/build.gradle`.

---

## Phase 0 — V7 migration (`payment` + `stripe_webhook_event`)

**Files:** `V7__payment_and_webhook_events.sql`; Test `payment/PaymentMigrationIT.java`.

- [ ] **Step 1: failing test** — `PaymentMigrationIT` (Testcontainers): `payment` and
  `stripe_webhook_event` exist; `payment` rejects a bogus `status`; `UNIQUE(payment_intent_id)`
  and `UNIQUE(booking_ref)` enforced; `stripe_webhook_event` rejects a duplicate `event_id`;
  `amount_minor >= 0` enforced.
- [ ] **Step 2: run** `./gradlew test --tests "*PaymentMigrationIT*"` → FAIL.
- [ ] **Step 3: migration**

```sql
-- V7 (issue #8): Stripe collection records + webhook idempotency. JDBC-only (#1).
-- Money is BIGINT minor units + ISO currency (#5); status is TEXT + CHECK (postgres skill).
-- payment.booking_ref is a LOGICAL reference to booking.id (by id, invariant #11 — no FK,
-- keeping the payment table independent of the booking module's schema).
CREATE TABLE payment (
    id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_ref       BIGINT      NOT NULL,                 -- booking id (logical, by id)
    payment_intent_id TEXT        NOT NULL,                 -- Stripe PaymentIntent id (store id, not card data)
    amount_minor      BIGINT      NOT NULL,                 -- minor units (#5)
    currency          TEXT        NOT NULL,                 -- ISO 4217 (EUR v1)
    status            TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_intent_uniq  UNIQUE (payment_intent_id),
    CONSTRAINT payment_booking_uniq UNIQUE (booking_ref),       -- one collection per booking (Instant)
    CONSTRAINT payment_status_check CHECK (status IN
        ('REQUIRES_PAYMENT','SUCCEEDED','FAILED','CANCELED')),
    CONSTRAINT payment_amount_check CHECK (amount_minor >= 0)
);
CREATE INDEX payment_booking_ref_idx ON payment (booking_ref);

-- Webhook idempotency (#8): dedupe on Stripe's event id. The PK IS the dedup key; an
-- INSERT ... ON CONFLICT DO NOTHING returning 0 rows means "already processed".
CREATE TABLE stripe_webhook_event (
    event_id    TEXT        PRIMARY KEY,
    event_type  TEXT        NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 4: run** → PASS.
- [ ] **Step 5: generalization audit** — n/a (first payment migration).
- [ ] **Step 6: commit** `[U4] V7 migration: payment + stripe_webhook_event (#8)` · **Step 7** status.

## Phase 1 — Stripe dependency + config/secrets; `PaymentOutcome.Pending`; gateway `initiate`

**Files:** `build.gradle`, `application.properties`, `payment/infrastructure/StripeConfig.java`,
`payment/api/PaymentOutcome.java`, `payment/application/out/PaymentGateway.java`,
`payment/application/PaymentService.java`, `StubPaymentGateway.java`; Tests `StripeConfigTest`,
update `PaymentServiceTest`/`StubPaymentGatewayTest`.

- [ ] **Step 1: failing tests** — `PaymentOutcome` permits `Pending`; `StripeConfigTest` binds
  `stripe.api-key`/`stripe.webhook-secret` from properties (no committed value); stub still
  returns `Succeeded` (regression).
- [ ] **Step 3: implement** — add the Stripe dep (pin a version); extend the sealed outcome:

```java
public sealed interface PaymentOutcome
        permits PaymentOutcome.Succeeded, PaymentOutcome.Pending, PaymentOutcome.Failed {
    record Succeeded(String reference) implements PaymentOutcome {}
    /** Collection initiated; awaits a signature-verified webhook (invariant #8). */
    record Pending(String clientSecret, String paymentIntentId) implements PaymentOutcome {}
    record Failed(String reason) implements PaymentOutcome {}
}
```
```properties
stripe.api-key=${STRIPE_API_KEY:}
stripe.webhook-secret=${STRIPE_WEBHOOK_SECRET:}
```
  `StripeConfig` (`@Profile("stripe")`) exposes a `StripeClient` bean from `stripe.api-key`; the
  webhook secret is read where the controller needs it. Rename `PaymentGateway.charge` →
  `initiate` (same signature; javadoc: may return `Pending`); stub maps to `Succeeded`.
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U4] Stripe dep + config; PaymentOutcome.Pending (#8)` · **Step 7**.

## Phase 2 — payment persistence

**Files:** `payment/domain/PaymentStatus.java`, `payment/application/out/{Payments,NewPayment}.java`,
`payment/infrastructure/out/JdbcPayments.java`; Test `JdbcPaymentsIT`.

- [ ] **Step 1: failing test** `JdbcPaymentsIT` — `record(NewPayment)` inserts
  `REQUIRES_PAYMENT`; `findBookingRefByIntent(piId)` returns the booking ref; `markStatus(piId,
  SUCCEEDED)` updates; duplicate `payment_intent_id`/`booking_ref` rejected.
- [ ] **Step 3: implement** — package-private `JdbcPayments` (`JdbcClient` + text-block SQL).
  `PaymentStatus { REQUIRES_PAYMENT, SUCCEEDED, FAILED, CANCELED }` in lockstep with the CHECK.
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U4] payment persistence: Payments port + JdbcPayments (#8)` · **Step 7**.

## Phase 3 — `StripePaymentGateway` (`@Profile("stripe")`)

**Files:** `payment/infrastructure/out/StripePaymentGateway.java`; Test `StripePaymentGatewayTest`.

- [ ] **Step 1: failing test** `StripePaymentGatewayTest` (mock `StripeClient`):
  `initiate(BookingRef(42), Money(4500,"EUR"))` calls PI-create with **amount 4500**,
  **currency "eur"**, **idempotency key `booking-42-pi`**, **metadata `bookingRef=42`**; maps the
  SDK result to `Pending(clientSecret, id)`; a Stripe exception → `Failed` (narrow catch).
- [ ] **Step 3: implement** — inject `StripeClient`; build `PaymentIntentCreateParams`
  (`automatic_payment_methods` enabled, **no** Connect params); record the `payment` row
  (`REQUIRES_PAYMENT`) via the `Payments` port; return `Pending`. Money: `long` → SDK `amount`
  directly.
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U4] StripePaymentGateway: PaymentIntent + idempotency (#8)` · **Step 7**.

## Phase 4 — payment events + `StripeWebhookController`

**Files:** `payment/api/{PaymentConfirmed,PaymentCanceled}.java` (+ `package-info` javadoc),
`payment/infrastructure/in/StripeWebhookController.java`, `StripeWebhookEvents` dedup port +
adapter; Test `StripeWebhookIT` (sig + dedup + publish).

- [ ] **Step 1: failing tests** `StripeWebhookIT` — construct a body + a **valid** signature
  with the test secret (`Webhook.constructEvent` accepts it): verified `payment_intent.succeeded`
  → `200`, payment `SUCCEEDED`, `PaymentConfirmed` published (`AssertablePublishedEvents` or a
  test listener); **bad/absent signature** → `400`, no state change, no event; **duplicate**
  event id → second call `200` no-op; **unknown event type** → `200` ignored;
  `payment_intent.canceled` → `PaymentCanceled` published, payment `CANCELED`.
- [ ] **Step 3: implement** — controller reads the **raw** body (`@RequestBody byte[]`) +
  `Stripe-Signature`; `Webhook.constructEvent(payload, sig, webhookSecret)` (bad → `400`);
  `stripe_webhook_event` `INSERT … ON CONFLICT DO NOTHING` (0 rows → return `200`); switch on
  event type → look up the booking ref by PI id via `Payments`, `markStatus`, and
  `publisher.publishEvent(new PaymentConfirmed(ref, piId))` / `PaymentCanceled(ref)`. Whole
  handler is `@Transactional`. Never log the raw body/sig/secret.
- [ ] **Step 4: run** → PASS. **Step 6** commit `[U4] Stripe webhook: verify + dedupe + publish confirmation (#8)` · **Step 7**.

## Phase 5 — booking side: outcome, create switch, listener, confirm/cancel, `availability.release`

**Files:** `booking/application/in/BookingOutcome.java`, `CreateBookingService.java`,
`booking/application/out/Bookings.java`, `booking/infrastructure/out/JdbcBookings.java`,
`booking/infrastructure/in/PaymentEventListener.java`, `availability/api/AvailabilityClaim.java`,
`availability/infrastructure/out/JdbcAvailabilityClaim.java`; Tests `CreateBookingServiceTest`
(Pending branch), `PaymentEventListenerIT`/`StripeWebhookIT` end-to-end, `AvailabilityReleaseIT`.

- [ ] **Step 1: failing tests** — create-with-`Pending` gateway → booking stays
  `AWAITING_PAYMENT`, outcome `AwaitingPayment` with `clientSecret` (no confirm, no exception);
  `confirmFromPayment` is idempotent (second call = 0-row no-op, no throw);
  `cancelAwaitingPayment` returns `true` once then `false`; `release` deletes the
  `BOOKED_ONLINE` row (re-claimable); end-to-end `PaymentConfirmed` → `CONFIRMED`,
  `PaymentCanceled` → `CANCELLED` + released.
- [ ] **Step 3: implement**
  - `BookingOutcome`: add `record AwaitingPayment(BookingConfirmation details, String clientSecret, String paymentIntentId)`.
  - `CreateBookingService`: `switch (checkout.pay(...))` → `Succeeded` ⇒ confirm now (stub path,
    unchanged); `Pending p` ⇒ return `AwaitingPayment` (booking stays `AWAITING_PAYMENT`);
    `Failed f` ⇒ throw `PaymentDeclinedException` (rolls back claim).
  - `Bookings.confirmFromPayment(id, at)` — idempotent (`WHERE status='AWAITING_PAYMENT'`; 0 rows
    ⇒ log-and-return, **not** throw — the redelivery-safe sibling of the strict `confirm`).
    `cancelAwaitingPayment(id) -> boolean` — `UPDATE … status='CANCELLED' WHERE
    status='AWAITING_PAYMENT'`; returns whether a row changed.
  - `PaymentEventListener` (`booking.infrastructure.in`, sync `@EventListener`): on
    `PaymentConfirmed` ⇒ `confirmFromPayment`; on `PaymentCanceled` ⇒ if `cancelAwaitingPayment`
    transitioned, `availability.release(setId, date)` (re-load set/date via the booking row).
  - `availability.api.AvailabilityClaim#release(SetId, LocalDate)` + `JdbcAvailabilityClaim`
    `DELETE FROM set_availability WHERE set_id=:s AND booking_date=:d AND state='BOOKED_ONLINE'`.
- [ ] **Step 4: run** unit + ITs → PASS. **Step 5: generalization audit** — search availability
  write paths (claim/release only); record. **Step 6** commit `[U4] booking: webhook-driven confirm/cancel + claim release (#8)` · **Step 7**.

## Phase 6 — controller mapping + webhook security

**Files:** `booking/infrastructure/in/BookingController.java`, `SecurityConfig.java`; Tests
`CreateBookingStripeProfileIT`, webhook-security assertion in `StripeWebhookIT`.

- [ ] **Step 1: failing tests** — under the `stripe` profile, `POST /api/bookings` → `202` with
  `clientSecret` + `status:"AWAITING_PAYMENT"` (AC-1); webhook reachable unauthenticated + not
  CSRF-blocked (AC-2 path); default profile still `201 CONFIRMED` (AC-8).
- [ ] **Step 3: implement** — extend the controller `switch` with
  `case BookingOutcome.AwaitingPayment a -> 202 + body(clientSecret, …)`. `SecurityConfig`:
  `permitAll` + `csrf.ignoringRequestMatchers` for `POST /api/payments/stripe/webhook`.
- [ ] **Step 4: run** → PASS; full `./gradlew test` (both profiles) green. **Step 6** commit `[U4] POST /api/bookings 202 + webhook security (#8)` · **Step 7**.

## Phase 7 — verify + arch gates + follow-ups + PR + review gate

- [ ] `NoStripeConnectArchitectureTest` (no `com.stripe.model.Account`/`Transfer`,
  `application_fee*`/`on_behalf_of`/`transfer_data` params) green (AC-7).
- [ ] Full backend `./gradlew test` incl. `ModularityTests` (AC-11) + `JdbcOnlyArchitectureTests`
  (AC-12) green, default **and** `stripe` profile.
- [ ] **Open follow-up issues** and link them: (a) **Angular Stripe Payment Element** FE slice
  (D-1); (b) **TTL expiry sweep** for abandoned `AWAITING_PAYMENT` bookings (D-3); (c) append the
  **U5 drift note** to `docs/plans/u5-event-spine-payout-accrual.md` (sync→async; confirm point
  moved to the listener).
- [ ] Confirm no secret committed (`secret_scan`); push; open PR into `main` referencing #8.
- [ ] **Review gate:** `/code-review origin/main...HEAD` + `riviera-review-overlay`
  (RV-CT-* payment/webhook blockers, RV-BE-1 availability release, RV-PROC-1 *Skills consulted*).
  Resolve/defer findings **through the loop** (each fix re-runs the routing gate + `tdd` + CI).
- [ ] Merge only when CI green + review findings resolved + ACs verified.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] AC-1..AC-12 backend — `./gradlew test` green (both profiles) at `<sha>`.
- [ ] AC-13 — CI green on the PR (build + tests + CodeQL + Sonar + secret scan).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] **No JPA / Lombok** introduced; `payment` persistence is `JdbcClient` + SQL; `JdbcOnlyArchitectureTests` green (#1).
- [ ] **Confirmation only via signature-verified webhook**; bad sig → 400, no state change (#8).
- [ ] **Idempotent** under duplicate/out-of-order delivery (event-id dedup + guarded transition) (#8).
- [ ] **No Stripe Connect** anywhere (`NoStripeConnectArchitectureTest`) (ADR-0002 / #8).
- [ ] **Availability** held while `AWAITING_PAYMENT`, released on `canceled`; `ConcurrentReservationIT` still green (#2).
- [ ] **Money** integer minor units, converted only at the SDK edge (#5).
- [ ] **Secrets** from env; none committed; raw body/sig/key never logged (#7-style discipline, AC-9).
- [ ] **Modulith** boundaries clean; `payment`→`booking` via the published event only; no cycle; `ModularityTests` green (#11).
- [ ] Flyway **V7** present; constraints tested (#12).
- [ ] Default (stub) profile + all U3 ACs still pass (AC-8).
- [ ] Execution-status table at HEAD matches reality; Open Questions resolved or deferred with an issue #.
