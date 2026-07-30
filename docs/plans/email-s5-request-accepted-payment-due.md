# Email S5 — Request-accepted "payment due" mail Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a venue accepts a Request-mode booking and the guest genuinely still owes
money, mail the guest that payment is due, by when (the pay-window deadline the abandoned
sweep actually enforces, reasoned in `Europe/Tirane`), how much, and a link to the
code-gated page where they can pay — exactly once per accept, idempotent under registry
republication, and never on a decline.

**Architecture:** The single significant decision is **where the event is published**.
`booking` gains a third published event, `BookingPaymentDue`, raised **only on the branch
where the accept actually leaves money outstanding** — after `CheckoutPort.pay(...)`
returns `Pending` — in its own small transaction (`PaymentDueAnnouncer`) so the Event
Publication Registry has a commit to persist the publication on. It deliberately does
**not** ride the accept transaction: that transaction commits *before* the payment outcome
is known, and the two non-`Pending` outcomes (the in-process stub's synchronous
`Succeeded`, and `Failed`/throw which **reverts the booking to `PENDING_REQUEST`**) would
each produce a "pay by X" mail for a booking that owes nothing or cannot be paid at all.
The mail itself is the third registry-borne booking mail, assembled by the same
`BookingMailFactsService` three-port resolver as #371/#374 and sent through the same
chokepoint on the same bulkhead.

**Persistence:** JDBC only (invariant #1). **No schema change and no Flyway migration** —
the only SQL touched is the `RETURNING` list of the existing guarded
`PENDING_REQUEST → AWAITING_PAYMENT` `UPDATE` in `JdbcBookings.acceptPendingRequest`,
widened to yield the facts the event payload needs atomically with the transition. A
brand-new listener class needs no `event_publication` rewrite (V31's rewrite existed
because a listener *moved*); the new listener is in scope for #405's admin re-drive the
day it lands, because `RegistryMailOutbox` scopes by the
`ai.riviera.platform.notification.` listener-id **prefix**, not a per-listener list.

**Source of intent:** GitHub issue **#373** (`[Email S5]`), sub-issue of epic **#367**
(story 14); ADR-0011 decision 5 (payload picks the vehicle).

**Skills consulted:**
- `riviera-sdlc` — drove the loop; issue-intake grill gate before this doc.
- `riviera-plan-doc` — this template; ACs written at the inner hexagon.
- `riviera-modulith` — event vs `api/` port choice; put the new record in
  `booking/events/` (published surface split by kind, #95) and kept the payload ids-only;
  confirmed `notification`'s existing `booking::events` grant already covers the new
  event, so **no `allowedDependencies` widening** is needed.
- `riviera-java-conventions` — record event payload, package-private listener + adapters,
  typed outcome over exception for the missing-fact path, `@Transactional` on the one
  write-less publish method, one-line-or-no inline comments (§6c), no code in any log line
  (invariant #7).
- `riviera-stripe-payments` — confirmed the Request-to-Book money timing
  (payment-request-on-accept, pay window from `accepted_at`, **not** auth-and-capture);
  this is what settled that the event must be raised after the `Pending` outcome.
- `postgres` — the only SQL change is a widened `RETURNING` on an existing guarded
  `UPDATE`; no new column, index or constraint is warranted, and reading the transition's
  own output beats a second `SELECT` that could race.
- `codebase-design` — applied the deletion test to `PaymentDueAnnouncer` (it earns its
  keep: it is the only place that owns "publish this durably, outside the accept
  transaction") and declined a second resolver seam in `notification` — the existing
  `BookingMailFactsService` already answers the three-port question verbatim.

**Branch:** `claude/sdlc-373-obf7dk` — the cloud session's designated remote branch stands
in for `feature/email-s5-payment-due` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `PENDING_REQUEST` booking whose venue accepts it, when
      `CheckoutPort.pay(...)` returns `Pending` (payment genuinely outstanding), then
      exactly one `BookingPaymentDue` is published carrying `{bookingId, venueId, setId,
      bookingDate, payBy, amountMinor, currency}` and no booking code.
      *Pinned by:* `RespondToRequestServiceTest.publishesPaymentDueWhenCollectionIsPending`
- [ ] **AC-2:** Given the same accept, when the in-process stub returns `Succeeded` (the
      booking is confirmed synchronously, nothing is owed), then **no**
      `BookingPaymentDue` is published — only `BookingConfirmed`.
      *Pinned by:* `RespondToRequestServiceTest.publishesNoPaymentDueWhenCollectionSucceedsInline`
- [ ] **AC-3:** Given an accept whose PaymentIntent creation fails or throws (the booking
      is reverted to `PENDING_REQUEST`), then no `BookingPaymentDue` is published.
      *Pinned by:* `RespondToRequestServiceTest.publishesNoPaymentDueWhenPaymentInitFails`
- [ ] **AC-4:** Given a `PENDING_REQUEST` booking, when the venue **declines** it, then no
      mail of any kind is recorded.
      *Pinned by:* `RequestPaymentDueMailIT.declineMailsNothing`
- [ ] **AC-5:** Given a published `BookingPaymentDue`, when the listener runs, then exactly
      one payment-due email is recorded to the booking's contact address carrying the
      booking code, venue name, booking date, amount, the `payBy` deadline and a pay link
      of the form `<base>/booking/<code>`.
      *Pinned by:* `RequestPaymentDueMailIT.mailsThePaymentDeadlineAndPayLink`
- [ ] **AC-6:** Given the deadline in the mail, then it equals the instant at which the
      abandoned sweep's accepted arm begins expiring that booking — i.e.
      `accepted_at + booking.request.pay-window`, both sides reading the same
      `RequestWindows` bean (one source of truth; the sweep can only be *late*, never
      early). Made structural rather than merely tested: `payDeadline(acceptedAt)` and
      `acceptedBefore(now)` are exact inverses off one field, and the sweep now takes the
      whole record instead of a bare `Duration`.
      *Pinned by:* `RequestWindowsTest.theMailedDeadlineIsExactlyTheSweepsCutoff`
- [ ] **AC-7:** Given the same `BookingPaymentDue` delivered twice (registry
      republication), when the listener runs both times, then the send is attempted per
      delivery with no dedupe table — the accepted at-least-once contract — and a
      transport failure **propagates** so the publication stays outstanding.
      *Pinned by:* `RequestPaymentDueMailIT.transportFailureLeavesThePublicationOutstanding`
- [ ] **AC-8:** Given the listener, then it is annotated
      `@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)` + `@TransactionalEventListener`
      (`AFTER_COMMIT`), and the arch rule's non-vacuity guard names **all three** shipped
      listeners rather than two.
      *Pinned by:* `MailListenerExecutorArchitectureTest.theRuleExaminesEveryProductionListener`
- [ ] **AC-9:** Given a suppressed contact address, when the listener runs, then no send
      reaches the transport and the publication completes normally (no permanent retry loop).
      *Pinned by:* `RequestPaymentDueMailIT.suppressedAddressIsSkippedAndCompletes`
- [ ] **AC-10:** Given a `BookingPaymentDue` whose booking / set / contact cannot be
      resolved, when the listener runs, then it returns normally, increments
      `riviera.mail.payment-due.abandoned` tagged `no-booking`/`no-set`/`no-contact`, and
      logs an `ERROR` carrying ids only — never the booking code.
      *Pinned by:* `RequestPaymentDueMailIT.abandonsAndCountsAMissingFact`
- [ ] **AC-12:** Given a publish that fails (the `event_publication` insert or its commit),
      when an accept has already transitioned and issued its PaymentIntent, then the accept
      still answers `Accepted(AWAITING_PAYMENT)` and the lost mail is logged with the booking id.
      *Pinned by:* `RespondToRequestServiceTest.aFailedAnnouncementLeavesTheAcceptAccepted`
- [ ] **AC-11:** Given `ApplicationModules.verify()`, then the new event and listener
      introduce no boundary violation and no new module grant.
      *Pinned by:* `ModularityTests.verifiesModularStructure`

## Non-goals

- **A decline mail.** #373 says declines send nothing; the tourist sees the decline in-app.
  (Epic #367 has no decline story.)
- **A reminder / second nudge** before the deadline. One mail per accept.
- **Changing the pay window, its cap, or the sweep.** The mail *reports* the deadline the
  sweep already enforces; it does not move it. In particular the deliberate absence of an
  invariant-#4 cutoff cap on `pay-window` (`RequestProperties`) is left exactly as shipped.
- **A frontend change.** `/booking/:code` already renders "Pay now" for `AWAITING_PAYMENT`
  with open-intent credentials (`booking-view.ts`); the mail links at it, nothing new is needed.
- **A second origin knob.** The pay link's base URL reuses the deployed
  `RIVIERA_RECOVERY_LINK_BASE_URL` value (#375's precedent), so activation needs no new env var.
- **HTML mail / templating.** Plain text, English-only (ADR-0011 v1).

## Behavior-parity ledger

`N/A — new behavior, replaces nothing.` No surface is retired: the accept flow, the
abandoned sweep, and the existing two booking mails are untouched in behavior.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The mail's deadline drifts from the sweep's real cutoff (two copies of the window) | med | high — a guest who trusts the mail loses the slot | Both read the **same** `RequestWindows` bean; the deadline is `accepted_at + payWindow` where `accepted_at` is the value the transition itself `RETURNING`s, never a second clock read. AC-6 pins the equality | agent | open |
| R-2 | A "pay by X" mail sent for a booking that owes nothing (stub `Succeeded`) or was reverted (`Failed`/throw) | **high if published in the accept transaction** | high — actively misleading; the stub is the default-profile deployment | Publish **after** the payment outcome, on the `Pending` branch only (`PaymentDueAnnouncer`). AC-2/AC-3 pin both negatives | agent | open |
| R-3 | The booking code (a bearer credential, invariant #7) leaks into `event_publication` | med | high — the registry serializes payloads as text and retains them under archive completion | The payload is ids-only; the code (and therefore the pay link) is resolved **at send time** via `BookingNotificationFacts`, exactly as #371 argued. No log line carries either | agent | open |
| R-4 | A mail failure affects the accept / the availability hold (invariant #2) | low | high | The listener is `AFTER_COMMIT` on the mail bulkhead (#383); both the accept transition and the claim are long committed. Never `@Transactional` across the send | agent | open |
| R-5 | Crash between the accept commit and the publish commit loses the mail (at-most-once gap this design accepts) | low | med — one guest not mailed; booking still visible in-app and to the operator | Accepted and documented. The window is the same one that already exists between the accept commit and the payment-row insert; closing it would need the event in the accept transaction, which R-2 forbids. Guest can still reach the booking by code; the sweep still protects the set | agent | open |
| R-6 | A registry-vehicle send that throws parks a permanently-failing publication | low | med | Only *transport* failures propagate; a missing fact and a suppressed address both return **normally** (AC-9/AC-10), the #371/#374 rule | agent | open |
| R-7 | A new bounded executor is added, pushing the combined shutdown drain past the SIGTERM grace | none | — | No new pool: the listener rides the existing `registryMailExecutor`. `MailTransportProperties.DRAINING_POOLS` stays `2` | agent | open |
| R-8 | Flyway version collision with a parallel slice | none | — | No migration in this slice. (Next free number is **V36**; the ten open PRs are all Dependabot frontend bumps — no backend diff, no migration.) | agent | closed — no migration |
| R-10 | A failed publish turns a successful accept into a 500, and the operator's retry then answers `NOT_PENDING` | low | med | The announce is caught at the call site and logged `WARN` with the booking id; the accept's own answer is unchanged. Deliberately no counter — the failure mode is "the database is unavailable", which every other subsystem already reports, and no publication row exists for the #405 re-drive to find. AC-12 pins it | agent | open |
| R-9 | The mailed link points at `localhost:4200` in production | low | med | The base URL reuses the already-deployed `RIVIERA_RECOVERY_LINK_BASE_URL`, validated at boot (absolute URI, non-blank) like its siblings | agent | open |

## Open questions / Assumptions

- **Assumption:** "the acceptance-expiry deadline" in #373 means the **pay-window** arm of
  the abandoned-payment sweep (`accepted_at < now − pay-window`, `JdbcBookings.findExpirableAwaitingPayment`),
  **not** the request-expiry sweep (`request_expires_at`, which is already past by the time
  an accept succeeds). The issue's own wording — "an unnoticed acceptance expires the slot"
  and "don't lose the slot to the acceptance-expiry sweep" — only fits the former.
  *Owner:* agent · *Resolves by:* phase 0 (AC-6 makes it explicit).
- **Assumption:** the correct pay destination is `<base>/booking/<code>` — the code-gated
  view — and **not** `/booking/pay`, which resumes from in-memory hand-off state set by the
  view and is a dead end when entered cold. *Owner:* agent · *Resolves by:* phase 1
  (verified in `booking-view.ts`: `AWAITING_PAYMENT` + `b.payment` renders "Pay now" and
  navigates on to `/booking/pay`).
- **Drift recorded against the issue:** AC-1 of #373 reads "accepting a pending request
  produces exactly one email". As written that is **false under the default profile**,
  where the in-process stub collects synchronously and the accept produces a *confirmation*
  mail instead — the same asymmetry `payment.api.CollectionGuarantee` exists to name (#390).
  The AC holds where payment is genuinely outstanding; this plan's AC-1/AC-2 state both
  halves. To be reflected back onto the issue at plan close.

## Availability & concurrency (invariant #2)

The slice adds **no write path** to `availability(set_id, booking_date)` and changes none.

- **Write paths in scope:** none. The accept transition (`PENDING_REQUEST → AWAITING_PAYMENT`)
  does not touch the availability row — the set was already claimed at request time and stays
  claimed; release happens only on decline/expiry/cancel, all untouched here.
- **Uniqueness guarantee:** unchanged — `UNIQUE(set_id, booking_date)` plus the guarded
  claim; nothing in this slice inserts, updates or deletes that row.
- **Concurrency strategy:** the one concurrent interaction is the existing accept-vs-expiry
  race, guarded by the `request_expires_at > now` predicate on the transition `UPDATE`
  (`RequestExpiryVsAcceptRaceIT`). Widening its `RETURNING` list cannot weaken that guard:
  `RETURNING` reports the row the `UPDATE` matched, so the new fields are read under the same
  atomic statement — strictly safer than the second `SELECT` the alternative would need.
- **Pool rule (invariant #3):** unchanged — enforced at claim time, before this slice's window.
- **Cutoff rule (invariant #4):** unchanged. Note (deliberately not fixed here): the accept
  deadline is capped at the evening-before cutoff, the **pay** window is not, so a late accept
  can leave a deadline after the cutoff. The mail states the sweep's true deadline; changing
  the cap is out of scope (Non-goals).
- **Pinning test:** `RequestExpiryVsAcceptRaceIT` (unchanged, must stay green) —
  proves an accept and the expiry sweep cannot both act on one request.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the request lifecycle and therefore the fact "this booking's payment is now due, by T". The deadline is a function of `accepted_at` (its column) and the pay window (its config) |
| M-2 | `notification` | existing | (none) | Owns transactional-mail delivery, both vehicles, and the suppression invariant |

**Cross-module named interfaces (`api/` ports)**

No new port. The listener reuses the three already granted to `notification`:

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.api` | `BookingNotificationFacts#notificationInfo(BookingId)` | `BookingNotificationInfo` | `notification` (existing grant) |
| NI-2 | `venue.api` | `SetBookingFacts#setBookingInfo(SetId)` | `SetBookingInfo` | `notification` (existing grant) |
| NI-3 | `customer.api` | `CustomerLookup#findById(CustomerId)` | `GuestContact` | `notification` (existing grant) |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingPaymentDue` | `booking` (`PaymentDueAnnouncer`, on the `Pending` branch only) | `{bookingId, venueId, setId, bookingDate, payBy, amountMinor, currency}` — **no booking code** | `notification` only | async `AFTER_COMMIT` on `registryMailExecutor` | `RespondToRequestServiceTest`, `RequestPaymentDueMailIT` |

`allowedDependencies`: **unchanged on both modules.** `notification` already grants
`booking::events`; `booking` needs nothing new (it publishes).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide *when* payment is due and compute the deadline | `booking` | `booking` **Job**: "own bookings … and the lifecycle"; the accept transition and `accepted_at` are its columns, the pay window its config. Not `payment` — its **Not-My-Job** is "the booking lifecycle → `booking`"; not `notification`, whose job is delivery only |
| Decide *whether* a payment-due mail is warranted at all (the `Pending`-only rule) | `booking` | Same lifecycle **Job**. The decision is expressed as *not publishing the fact*, not as a filter in the mail module — `notification`'s **Not-My-Job** is deciding when to send |
| Resolve the address, apply suppression, render and deliver the mail | `notification` | `notification` **Job**: "own transactional-mail delivery … the suppression list". `booking`'s **Not-My-Job**: "deciding whether a confirmation email will be sent, or knowing any address → `notification`/`customer`" |
| Build the pay link from the booking code | `notification` | Presentation of a fact it already holds at send time. RV-BE-11 keeps *credential-material* machinery (token minting/hashing) at the edge; this mints nothing — it formats a code the module already reads through `BookingNotificationFacts`, exactly as it already renders that code into the confirmation body |
| Account for a payment-due mail that will never be sent | `notification` | Same owner as the loss; a sixth `*_ABANDONED` name, never summed with the other five |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; unchanged by this slice.
- **Confirmation trigger:** unchanged — the signature-verified webhook (invariant #8). This
  mail is emphatically **not** a confirmation; it says money is still owed. It is raised
  from the `Pending` outcome, which is precisely "the webhook has not spoken yet".
- **Idempotency:** no new money operation. The mail's at-least-once contract is the Event
  Publication Registry's, as #371/#374 (no dedupe table — one written in this transaction
  would share the identical crash window).
- **Money:** `amountMinor` + ISO `currency` ride the payload as immutable facts of the
  accept, read from the transition's `RETURNING` (invariant #5). The mail renders them via
  `SmtpMailer.formatAmount`, which derives the exponent from the ISO currency; **no
  arithmetic is performed anywhere in this slice**.
- **Payout-ledger effect:** none — no accrual or reversal is triggered by `BookingPaymentDue`;
  `payout` does not subscribe.
- **Refund policy applied:** N/A — nothing is refunded here.
- **Pinning tests:** `RequestAcceptPayIT` (existing, must stay green — proves the
  accept→pay→confirm spine is unchanged), `RespondToRequestServiceTest` (AC-1..3).

## Angular — frontend surfaces touched

`N/A — backend-only.` The mailed link targets `/booking/:code`, an existing route that
already renders the "Pay now" affordance for `AWAITING_PAYMENT` with open-intent
credentials. No component, route or style changes; the mocked Playwright suite is untouched
and stays hermetic.

## FE↔BE contract

`N/A — no contract change.` No endpoint, request DTO or response body is added or altered.

## Execution status

**Stage pointer:** `implement — phase 2`

**Next action:** Phase 2 — add `RequestPaymentDueMailListener`, the
`MAIL_PAYMENT_DUE_ABANDONED` counter, the arch-rule non-vacuity guard rename, and
`RequestPaymentDueMailIT`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `booking`: the event, the widened accept facts, the `Pending`-only publish | ✅ | `<phase-0>` |
| 1 — `notification`: the mail kind, the transport, the pay link | ✅ | `<phase-1>` |
| 2 — the listener, its abandoned-counter, the arch-rule guard, the ITs | ⏳ | |
| 3 — substrate docs + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for
what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**`booking`**
- `booking/events/BookingPaymentDue.java` — **new**; the published, ids-only fact.
- `booking/application/request/AcceptedRequest.java` — **modify**; carries `venueId`,
  `setId`, `bookingDate`, `acceptedAt` alongside the amount facts.
- `booking/application/request/PaymentDueAnnouncer.java` — **new**; package-private
  `@Transactional` seam that gives the registry a commit to persist the publication on.
- `booking/application/request/RespondToRequestService.java` — **modify**; inject
  `RequestWindows` + the announcer, publish on the `Pending` branch only.
- `booking/adapter/out/JdbcBookings.java` — **modify**; widen the accept `RETURNING` list
  and its row mapper.
- `booking/application/request/RequestWindows.java` — **modify**; `payDeadline` /
  `acceptedBefore`, the two halves of the one-source-of-truth deadline.
- `booking/application/refund/ExpireAbandonedBookings.java` + `AbandonedBookingSweepService.java`
  + `adapter/in/AbandonedBookingScheduler.java` — **modify**; the sweep takes `RequestWindows`
  rather than a bare `Duration`, so its cutoff and the mailed deadline share one definition.

**`notification`**
- `notification/application/PaymentDueMail.java` — **new**; the structured message.
- `notification/application/BookingLinks.java` — **new**; application-layer value that
  builds `<base>/booking/<code>`.
- `notification/adapter/in/BookingLinkProperties.java` — **new**; `@ConfigurationProperties`
  binding, boot-validated, mapped to `BookingLinks` by a small `@Configuration`.
- `notification/application/Mailer.java` — **modify**; `sendPaymentDue(...)`.
- `notification/application/TransactionalMailService.java` — **modify**; the registry-vehicle
  send (suppression check, transport failure propagates).
- `notification/adapter/out/MockMailer.java`, `SentEmail.java`, `SmtpMailer.java` — **modify**;
  the new kind, its recorded slot, its plain-text body.
- `notification/adapter/in/RequestPaymentDueMailListener.java` — **new**; the third registry listener.

**`shared`**
- `shared/ObservabilityMetrics.java` — **modify**; `MAIL_PAYMENT_DUE_ABANDONED`.

**Config / docs**
- `platform/src/main/resources/application.properties` — **modify**; the link base URL,
  defaulted from `RIVIERA_RECOVERY_LINK_BASE_URL`.
- `CLAUDE.md`, `RESPONSIBILITIES.md`, `docs/runbooks/observability.md` — **modify** (phase 3).

**Tests**
- `booking/application/request/RespondToRequestServiceTest.java` — **modify** (AC-1..3).
- `booking/application/request/RequestWindowsTest.java` — **new** (AC-6).
- `notification/RequestPaymentDueMailIT.java` — **new** (AC-4, 5, 7, 9, 10).
- `notification/adapter/in/MailListenerExecutorArchitectureTest.java` — **modify** (AC-8).

---

## Phase 0 — `booking`: the event, the widened accept facts, the `Pending`-only publish

**Files:** Create `booking/events/BookingPaymentDue.java`,
`booking/application/request/PaymentDueAnnouncer.java` · Modify `AcceptedRequest.java`,
`RespondToRequestService.java`, `JdbcBookings.java` (accept `RETURNING` + mapper) · Test
`RespondToRequestServiceTest.java`, `PaymentDueDeadlineTest.java`

- [ ] **Step 1: Write the failing tests** — the three publication branches (AC-1/2/3) and
      the deadline equality (AC-6), against the existing `RespondToRequestServiceTest` fakes.
- [ ] **Step 2: Run them, verify they fail** —
      `gradle test --tests "*RespondToRequestServiceTest*" --tests "*PaymentDueDeadlineTest*"`
      → FAIL (no `BookingPaymentDue` type).
- [ ] **Step 3: Minimal implementation** — the event record, the widened `RETURNING` +
      `AcceptedRequest`, `PaymentDueAnnouncer`, and the `Pending`-branch publish computing
      `payBy = acceptedAt.plus(windows.payWindow())`.
- [ ] **Step 4: Run them, verify they pass**, then broaden to the module:
      `gradle test --tests "*booking*"`.
- [ ] **Step 5: Generalization-audit pass** — search for other places that re-derive the pay
      deadline; record the result.
- [ ] **Step 6: Commit** — `feat(#373): publish BookingPaymentDue when an accept leaves payment outstanding`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.
- [ ] **Step 8: Push and open the draft PR** (CI fires on `pull_request` only — rule 3).

## Phase 1 — `notification`: the mail kind, the transport, the pay link

**Files:** Create `PaymentDueMail.java`, `BookingLinks.java`, `BookingLinkProperties.java`
(+ its config) · Modify `Mailer.java`, `TransactionalMailService.java`, `MockMailer.java`,
`SentEmail.java`, `SmtpMailer.java`, `application.properties`

- [ ] **Step 1: Write the failing tests** — `BookingLinks` builds `<base>/booking/<code>`
      and rejects a blank/relative base at construction; `SmtpMailerIT` asserts the rendered
      body carries the deadline in `Europe/Tirane`, the amount, and the link, and no
      tracking markup.
- [ ] **Step 2: Run them, verify they fail.**
- [ ] **Step 3: Minimal implementation** — the record, the port method, the two transports,
      the chokepoint send (registry-vehicle posture: suppression skip returns normally, a
      transport failure propagates).
- [ ] **Step 4: Run them, verify they pass**, then `gradle test --tests "*notification*"`.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `feat(#373): add the payment-due mail kind and its pay link`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — the listener, its counter, the arch-rule guard, the ITs

**Files:** Create `RequestPaymentDueMailListener.java`, `RequestPaymentDueMailIT.java` ·
Modify `ObservabilityMetrics.java`, `MailListenerExecutorArchitectureTest.java`

- [ ] **Step 1: Write the failing tests** — `RequestPaymentDueMailIT` (AC-4, 5, 7, 9, 10)
      and the arch rule's non-vacuity guard renamed to examine **every** production listener.
- [ ] **Step 2: Run them, verify they fail.**
- [ ] **Step 3: Minimal implementation** — the listener on the mail bulkhead + the sixth
      abandoned counter.
- [ ] **Step 4: Run them, verify they pass**, then the structural net:
      `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
      --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacement*"
      --tests "*MailListenerExecutorArchitectureTest*" --tests "*MailOutboxScope*"`.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `feat(#373): mail the accepted request's payment deadline`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — substrate docs + close-out

**Files:** Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, `docs/runbooks/observability.md`,
this plan doc

- [ ] **Step 1:** Record the third registry-borne booking mail and the sixth abandoned
      counter in the module table / responsibilities / runbook (the counting rule: never summed).
- [ ] **Step 2:** Mark the PR ready for review; run the Review gate, then the Sonar gate.
- [ ] **Step 3:** Finalize Execution status **in this PR's last commit**, citing
      `merged via PR #NN` (never a merge SHA).
- [ ] **Step 4:** Merge close-out — tick epic #367's checklist for story 14, close #373,
      run `riviera-docs-freshness`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..3:** `gradle test --tests "*RespondToRequestServiceTest*"` → PASS.
- [ ] **AC-4, 5, 7, 9, 10:** `gradle test --tests "*RequestPaymentDueMailIT*"` → PASS.
- [ ] **AC-6:** `gradle test --tests "*RequestWindowsTest*"` → PASS.
- [ ] **AC-8:** `gradle test --tests "*MailListenerExecutorArchitectureTest*"` → PASS.
- [ ] **AC-11:** `gradle test --tests "*ModularityTests*"` → PASS.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; no new write path, race guard unweakened (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payload ids-based (invariant #11).
- [ ] **Payment/payout** section filled; webhook still the source of truth; money in minor units; no ledger effect (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: `payBy` stored/carried as UTC `Instant`, rendered in `Europe/Tirane` (invariant #6).
- [ ] Booking code never on the event payload nor in any log line (invariant #7).
- [ ] No Flyway migration needed, and that is stated (invariant #12).
- [ ] **Frontend** N/A justified; mocked e2e suite untouched.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
