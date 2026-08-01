# Guest Notification on Request Decline + Expiry — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A guest whose Request-to-Book is declined by the venue, or whose request window
closes with no venue decision, receives a transactional email recording that outcome —
so they stop waiting on a request that went nowhere (issue #124, the last two legs of the
#98 in-app-only decision; the accept leg shipped as #373).

**Architecture:** Two new id-only domain events, `BookingRequestDeclined` and
`BookingRequestExpired`, published from **inside `RequestReleaseService`'s transactional
decline/expire legs** — unlike #373's `PaymentDueAnnouncer` (where the outcome is decided
*after* the accept transaction by `CheckoutPort.pay`), the decline/expire outcome is
settled by the guarded `UPDATE … RETURNING` inside the leg itself, so the registry
publication row commits atomically with the transition (no at-most-once window).
`notification` subscribes with two registry-vehicle listeners on the mail bulkhead,
reusing the existing three-port facts resolver, the suppression chokepoint, and the
`BookingLinks` send-time link build. The withdraw leg (#123) deliberately publishes
nothing — stated in code where a future reader would "complete the set".

**Persistence:** JDBC only (invariant #1). **No schema change** — no new tables, no
Flyway migration (V37 is latest and stays latest). The Event Publication Registry's
existing tables carry the two new event types as data.

**Source of intent:** GitHub issue #124 (rewritten 2026-07-31 against `main`; grilled
2026-08-01 at the issue-intake gate — all remaining claims verified against
`ac65a8f`). Product decision (AskUserQuestion, 2026-08-01): mail copy is a **plain
record only** — outcome + nothing-held/nothing-charged + the code-gated
`/booking/<code>` status link; **no CTA**.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
no in-flight collisions, #123 closed, no migration needed; caught that the publication
site can be *stronger* than the issue's #373 analogy) · `riviera-plan-doc` (this
template — forced the parity ledger N/A reasoning and the availability section on a
"mail-only" slice) · `tdd` (each phase red-green on the named pinning test) ·
`riviera-review-overlay` (review gate — runs at PR ready-for-review) ·
`riviera-docs-freshness` (due at close-out: the counting sweep — this slice makes the
**4th and 5th** registry listeners where CLAUDE.md, `notification/package-info.java`,
and the observability runbook say "three") · `riviera-modulith` (events land in
`booking.events` named interface; grants already cover `notification` ←
`booking::events`; registry mechanics + the event-rename Flyway caveat) ·
`riviera-java-conventions` (records for events/mail values, package-private listeners,
sealed-switch on `BookingMailFacts`, one-line comments) · `codebase-design` (no new
seams — publish at the existing `RequestReleaseService` legs, extend the existing
resolver/chokepoint conversations rather than adding ports) · `domain-modeling`
(event names checked against `CONTEXT.md`: decline = the venue's no, expire = nobody's
answer, distinct from withdraw only in who acted) · `riviera-local-debug` (to load
before the session's first `./gradlew`).

**Branch:** `claude/sdlc-124-staleness-check-w8rx2q` — the cloud session's designated
remote branch, standing in for `feature/request-decline-expiry-mails` per the
`riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `PENDING_REQUEST` booking, when the venue declines it, then the
      request transitions, its `(set, date)` hold is released, and exactly one
      `BookingRequestDeclined` (ids + bookingDate only) is published in the same
      transaction. *Pinned by:* `RequestTerminationEventPublicationIT.declinePublishesTheDeclineFact`
- [ ] **AC-2:** Given a `PENDING_REQUEST` past its `request_expires_at`, when the expiry
      sweep runs, then exactly one `BookingRequestExpired` is published for it; given
      nothing to expire, a sweep publishes nothing. *Pinned by:*
      `RequestTerminationEventPublicationIT.expiryPublishesTheExpiryFact` / `.cleanSweepPublishesNothing`
- [ ] **AC-3:** Given a `PENDING_REQUEST`, when the guest withdraws it (#123), then **no**
      event is published — guest-initiated, no notice. *Pinned by:*
      `RequestTerminationEventPublicationIT.withdrawPublishesNothing`
- [ ] **AC-4:** Given a resolvable booking/set/contact, when `BookingRequestDeclined`
      (resp. `BookingRequestExpired`) is delivered, then the guest is mailed a plain
      record — outcome, venue name, booking date, nothing-held/nothing-charged, and the
      status link built at send time from the code read through `booking::api` (never
      from the payload). *Pinned by:* `RequestDeclinedMailListenerTest.mailsTheDeclineRecord` /
      `RequestExpiredMailListenerTest.mailsTheExpiryRecord`
- [ ] **AC-5:** Given a suppressed address, when either event is delivered, then no mail
      is sent, the method returns normally, and the publication completes (no retry
      loop). *Pinned by:* `TransactionalMailServiceTest` (new cases for both send methods)
- [ ] **AC-6:** Given a missing booking, set, or contact, when either listener runs, then
      it abandons under **its own** counter name (`riviera.mail.request-declined.abandoned`
      / `riviera.mail.request-expired.abandoned`, tagged by `MissingBookingFact`), logs
      `ERROR` with ids only, and returns normally so the publication completes. *Pinned
      by:* the two listener tests' abandonment cases
- [ ] **AC-7:** `MailListenerExecutorArchitectureTest`'s shipped-listener list is
      extended to five and both new listeners carry `@Async("registryMailExecutor")` +
      `@TransactionalEventListener`; `ModularityTests`,
      `PublishedSurfacePlacementArchitectureTests`, `PackageShapeArchitectureTests` green.

## Non-goals

- Operator-side new-request notification (unchanged from #124).
- SMS / WhatsApp (unchanged from #124).
- Any CTA in the mail copy (product decision 2026-08-01: plain record only).
- A delivery-attempt log for these mails — the V36 log is confirmation-specific (#380);
  these two flows get the standard registry + abandonment-counter observability.
- Any frontend change — `booking/:code` already renders `DECLINED`/`EXPIRED`.
- Back-filling notices for rows already terminal before this ships (events are
  published at transition time only).

## Behavior-parity ledger

N/A — new behavior, replaces nothing. (The in-app status view is untouched, not
replaced; the mails are additive.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Publishing inside the release legs lengthens the decline/expire transaction by a registry `INSERT` | low | low | Same shape as `CancelBookingService` (publishes `BookingCancelled` in-transaction); no external call is held; `ConcurrentRequestTerminationIT` still pins the row-lock argument | session | open |
| R-2 | A large expiry sweep bursts publications onto the registry mail pool | low | low | Per-row transactions already isolate; saturation sheds to `MAIL_REGISTRY_SHED` and the publication survives for restart republish — the designed loss mode (#408) | session | open |
| R-3 | Substrate docs count "three registry listeners" (CLAUDE.md module table, `notification/package-info.java`, observability runbook, `MailListenerExecutorArchitectureTest` javadoc) — this slice makes five | certain | med | Phase 2 runs `riviera-docs-freshness` over the slice range and patches every counted statement | session | open |
| R-4 | Event names are permanent once published (a later rename needs a V18-style `event_type` rewrite in live + archive tables) | low | med | Names settled against `CONTEXT.md` at plan time: `BookingRequestDeclined` / `BookingRequestExpired` | session | open |
| R-5 | The listener-list extension (AC-7) is forgotten and the architecture test's non-vacuity guard goes silently incomplete | low | med | AC-7 is its own criterion; the same-PR rule is stated in #124 and re-checked at review | session | open |

## Open questions / Assumptions

- **Assumption:** the cloud session's Docker daemon is available for the Testcontainers
  ITs (they skip cleanly if not, and CI owns the proof either way). — *Owner:* session ·
  *Resolves by:* Phase 0 test run

### Resolved

- **Mail copy CTA?** → Plain record only (AskUserQuestion, 2026-08-01, pre-plan).
- **Publication site?** → Inside `RequestReleaseService`'s transactional legs — the
  outcome is settled there by the guarded `UPDATE … RETURNING`, unlike the accept branch
  (#373) where `CheckoutPort.pay` decides after commit. Settled at the intake grill.

## Availability & concurrency (invariant #2)

This slice **adds no write path** to `availability(set_id, booking_date)` and changes no
claim/release semantics. What it touches is the *same transactions* that already release:

- **Write paths in scope (unchanged):** the decline and expire legs of
  `RequestReleaseService` — each a guarded `UPDATE … RETURNING` transition +
  `availability.release`, committing together. The new event publish joins each leg's
  existing transaction *after* the release call; a lost race (0-row transition) publishes
  nothing, so **at most one terminal leg publishes, decided by the same row lock** that
  already makes the legs exclusive.
- **Uniqueness guarantee (unchanged):** the `availability(set_id, booking_date)` unique
  constraint; release semantics untouched.
- **Concurrency strategy (unchanged):** row lock via the guarded `UPDATE` — the
  decline/withdraw/expire exclusivity argument on `RequestReleaseService` is unchanged
  and still pinned by `ConcurrentRequestTerminationIT`; the events inherit it (a booking
  gets at most one terminal fact).
- **Pool rule (invariant #3) / Cutoff rule (invariant #4):** untouched — no new booking
  or claim path.
- **Pinning tests:** `ConcurrentRequestTerminationIT` (existing, unchanged) +
  `RequestTerminationEventPublicationIT` (new — the publish rides the winning leg only).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | Owns the request lifecycle and its terminal transitions; the facts to announce are its state changes |
| M-2 | `notification` | existing | (none) | Owns transactional-mail delivery for domain facts (#382) |
| M-3 | `shared` | existing | (none) | `ObservabilityMetrics` gains the two counter names (constants only — no logic, admission unchanged) |

**Cross-module named interfaces (`api/` ports)** — none added or changed. The listeners
reuse `booking::api` (code read via the existing facts resolver), `customer::api`,
`venue::api` through `BookingMailFactsService`; `notification`'s
`allowedDependencies` already lists everything needed — **no grant change**.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingRequestDeclined` | `booking` (`RequestReleaseService.decline`, in-transaction) | `{ bookingId, setId, bookingDate }` | `notification` only | async registry (`@Async("registryMailExecutor")` + `@TransactionalEventListener`) | `RequestTerminationEventPublicationIT` |
| EV-2 | `BookingRequestExpired` | `booking` (`RequestReleaseService.expire`, in-transaction) | `{ bookingId, setId, bookingDate }` | `notification` only | async registry (same) | `RequestTerminationEventPublicationIT` |

Payloads deliberately omit `venueId` (no payout/money subscriber; the venue name is
re-read through the resolver) and carry `bookingDate` because
`BookingMailFacts.Resolved` does not (the #373 precedent). No booking code in any
payload — the registry persists cleartext (invariant #7).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Deciding *that* a decline/expiry fact exists + publishing it | `booking` | `booking` Job: owns the request lifecycle incl. decline/expiry legs; **not** `notification` (its job is delivery, not deciding — the #373 "warranted is decided upstream" rule) |
| Rendering + delivering the two mails, suppression, abandonment counters | `notification` | `notification` Job: transactional-mail delivery on both vehicles; **not** `booking` (mail transport is on nobody else's Job list) |
| The two counter *names* | `shared` (`ObservabilityMetrics`) | Where every `MAIL_*` name lives; constants only, no logic — Shared-Kernel admission rule respected |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. A pending request has no PaymentIntent **on record**
(payment-request-on-accept), so neither leg touches money; neither event fans out to
`payout` or `payment`. (This is also why these events deliberately do not reuse
`BookingCancelled`, which carries refund/reversal semantics to three subscribers.)

## Angular — frontend surfaces touched

N/A — backend-only. `booking/:code` already renders the `DECLINED`/`EXPIRED` states.

## FE↔BE contract

N/A — no contract change (no endpoint added or modified).

## Execution status

**Stage pointer:** `implement (phase 0)`

**Next action:** Load `riviera-local-debug`, then Phase 0 step 1 (failing
`RequestTerminationEventPublicationIT`).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — booking: two events + in-leg publication | ⏳ | |
| 1 — notification: two listeners, mails, counters, arch-test list | | |
| 2 — docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/events/BookingRequestDeclined.java` — new event record
- `platform/src/main/java/ai/riviera/platform/booking/events/BookingRequestExpired.java` — new event record
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RequestReleaseService.java` — publish in decline/expire legs; withdraw no-notice comment
- `platform/src/test/java/ai/riviera/platform/booking/.../RequestTerminationEventPublicationIT.java` — new (AC-1..3)
- `platform/src/main/java/ai/riviera/platform/notification/application/RequestDeclinedMail.java` / `RequestExpiredMail.java` — new mail-value records
- `platform/src/main/java/ai/riviera/platform/notification/application/Mailer.java` + `adapter/out` transports (`MockMailer`, `SmtpMailer`) — two new send methods + templates
- `platform/src/main/java/ai/riviera/platform/notification/application/TransactionalMailService.java` — `sendRequestDeclined` / `sendRequestExpired` (registry posture: suppression check, transport failure propagates)
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RequestDeclinedMailListener.java` / `RequestExpiredMailListener.java` — new listeners
- `platform/src/main/java/ai/riviera/platform/shared/ObservabilityMetrics.java` — `MAIL_REQUEST_DECLINED_ABANDONED`, `MAIL_REQUEST_EXPIRED_ABANDONED`
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/MailListenerExecutorArchitectureTest.java` — listener list 3 → 5
- notification listener + mail-service tests mirroring the #373/#374 siblings
- Phase 2: `CLAUDE.md`, `RESPONSIBILITIES.md`, `notification/package-info.java`, `docs/runbooks/observability.md` — the "three listeners" counting sweep

---

## Phase 0 — booking: the two facts, published where they are settled

**Files:** Create both event records + `RequestTerminationEventPublicationIT` · Modify `RequestReleaseService`

- [ ] **Step 1: Write the failing test** — `RequestTerminationEventPublicationIT`
      (Testcontainers; model on the existing request ITs + `PaymentDueAnnouncerIT`'s
      publication assertions): decline publishes exactly one `BookingRequestDeclined`
      with the row's ids/date; expire publishes exactly one `BookingRequestExpired`;
      a clean sweep and a withdraw publish nothing.
- [ ] **Step 2: Run it, verify it fails** — scoped `--tests "*RequestTerminationEventPublicationIT*"`
- [ ] **Step 3: Minimal implementation** — the two records in `booking.events` (Javadoc:
      why no venueId, why no code, why not `BookingCancelled`); inject
      `ApplicationEventPublisher` into `RequestReleaseService`; publish on the success
      branch of each leg after `availability.release`; withdraw-leg comment: publishes
      nothing, deliberately (#123/#124 — guest-initiated, nothing to record).
- [ ] **Step 4: Run it, verify it passes**, then the structural net
      (`*ModularityTests*`, `*PackageShapeArchitectureTests*`,
      `*PublishedSurfacePlacementArchitectureTests*`) + the request-package tests.
- [ ] **Step 5: Generalization audit** — N/A expected (no bug fixed; pattern follows `CancelBookingService`).
- [ ] **Step 6: Commit** `Publish decline/expiry facts from the request release legs (#124)`; push; **open the draft PR**.
- [ ] **Step 7: Update Execution status** in the same commit window.

## Phase 1 — notification: two registry listeners, plain-record mails, own counters

**Files:** per File structure above; tests mirror `RequestPaymentDueMailListener`'s.

- [ ] **Step 1: Failing tests** — the two listener tests (resolved → mail with
      send-time link; each missing fact → own counter + `ERROR` + normal return) +
      `TransactionalMailServiceTest` suppression cases + the arch-test list extension.
- [ ] **Step 2: Verify red** (scoped).
- [ ] **Step 3: Minimal implementation** — mail records; `Mailer` + both transports;
      `TransactionalMailService` methods (registry posture — suppression skip returns
      normally, transport failure propagates for the registry retry); the two listeners
      (`@Async(MAIL_EXECUTOR)` + `@TransactionalEventListener`, sealed-switch on
      `BookingMailFacts`); the two `ObservabilityMetrics` names (per-loss `ERROR`,
      never summed — the #428 sibling argument, quoted briefly in Javadoc).
- [ ] **Step 4: Verify green** (scoped: notification package + the arch tests).
- [ ] **Step 5: Generalization audit** — check both listeners against every clause the
      #373 sibling carries (MDC decorator via pool, no code in logs, invariant #7).
- [ ] **Step 6: Commit** `Mail the guest a record of request decline and expiry (#124)`; push.
- [ ] **Step 7: Update Execution status.**

## Phase 2 — docs freshness + close-out

- [ ] Run `riviera-docs-freshness` over the slice range; patch the counted statements
      (R-3 list) + `RESPONSIBILITIES.md` if listener enumerations appear there.
- [ ] Merge latest `origin/main`; mark PR ready for review; run the PR gates
      (`references/pr-gates.md`): review gate, Sonar gate, merge close-out.
- [ ] Finalize Execution status (`merged via PR #NN`), tick ACs, close risks.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..3:** scoped `RequestTerminationEventPublicationIT` run → green. Verified at commit `<sha>`.
- [ ] **AC-4..6:** scoped notification test run → green. Verified at commit `<sha>`.
- [ ] **AC-7:** structural net run → green. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; concurrency argument stated (invariant #2).
- [ ] Pool + cutoff rules honored — untouched (invariants #3, #4).
- [ ] **Modulith** section filled; event payloads id-based; no cross-module internals imported (invariant #11).
- [ ] **Payment/payout** N/A justified (no money moves).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: `bookingDate` is the stored `LocalDate`; no new time arithmetic (invariant #6).
- [ ] Booking codes never in payloads or logs (invariant #7).
- [ ] No Flyway migration needed; none shipped (invariant #12).
- [ ] Frontend N/A.
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register closed out; Open Questions empty or deferred with issue #.
- [ ] Close-out written in THIS PR (`merged via PR #NN`).
- [ ] The review gate ran in full (invocation ladder + `riviera-review-overlay`).
