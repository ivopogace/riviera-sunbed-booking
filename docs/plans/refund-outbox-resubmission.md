# Admin re-drive lever for outstanding refund publications Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A platform admin can re-drive the cancellation refunds the Event Publication
Registry still owes — from an ADMIN endpoint, without waiting for a deploy — and that
lever can only ever reach `BookingRefundListener`, never `PaymentEventListener`,
`payout`'s reversal, or `notification`'s cancellation mail.

**Architecture:** #405's shape (`Outbox` driven port over the registry, single-flight +
cooldown resubmission service, ADMIN controller in the module), transplanted into
`booking` — with the one deliberate difference the issue's decision comment records:
**scope by the refund listener's exact listener id, an allowlist of one, never a package
prefix.** `notification`'s prefix is safe because every listener there is a mail
listener; `booking` also hosts `PaymentEventListener` (payment → confirm, invariant #8),
so `ai.riviera.platform.booking.` would hand an admin button the payment-confirmation
spine. Losing #405's "future listeners covered automatically" property is a feature for
money: a second money-moving listener must be added to the scope deliberately, with
review.

**Persistence:** JDBC only (invariant #1). **No migration** — the slice reads and
re-drives the framework-owned `event_publication` table through Modulith's own API and
adds no table, column or constraint. No Flyway number is claimed.

**Source of intent:** GitHub issue **#454** (decision recorded in its decision comment,
2026-07-31) — deferred explicitly from #404 (PR #453, `docs/plans/refund-listener-bulkhead.md`
Non-goals); #405 is the pattern and the trap registry.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the decision comment against today's code; found the stale `PaymentSucceeded` string in
`MailOutboxScopeTest`, fixed here as an in-scope drive-by) · `riviera-plan-doc` (this
template — forced the AC-2 fixture shape and the two-level id pinning into testable ACs) ·
`tdd` (each phase red → green, scoped test runs) · `riviera-review-overlay` (review gate —
runs at PR-ready) · `riviera-docs-freshness` (runs at close-out over `origin/main...HEAD`;
the runbook's three restart-only claims for refunds are already known targets) ·
`riviera-modulith` (placement: ports + service in `application/refund/`, registry adapter
in `adapter/out`, admin controller in `adapter/in` per the #391/#405 precedent; no new
published surface, no new grant; fix round: the `shared` kernel admission bar for the
throttle) · `codebase-design` (fix round — the throttle as one deep module: two methods
hiding the lock, window arithmetic, stamp-before-sweep order and boot seeding; a real seam
with two consumers) · `domain-modeling` (fix round — names stay in the platform's
resubmission/sweep/cooldown vocabulary; no ADR, reversible + precedented) ·
`riviera-java-conventions` (sealed typed outcome over
exceptions, package-private adapters, compact-constructor property validation, one-line
comments) · `riviera-stripe-payments` (the idempotency-key claim that makes replay safe:
`booking-<id>-refund` derived from `BookingId` + operation, so a re-drive returns the
original refund) · `riviera-local-debug` (cloud Gradle recipe: system `gradle` + JDK-25
toolchain, scoped tests only — loaded before the first build of the session). **Not
loaded, deliberately:** `postgres` (no migration, no SQL authored), frontend skills (no
frontend surface — see Non-goals).

**Branch:** `claude/sdlc-454-k98t4r` — the cloud session's designated remote branch,
standing in for `feature/refund-outbox-resubmission` per the `riviera-sdlc` remote-session
addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given outstanding publications targeted at the refund listener, when the
  resubmission port is invoked, then every one of them is handed back to the registry for
  delivery and the outcome reports how many. *Pinned by:*
  `RefundResubmissionServiceTest.resubmitsEveryOutstandingRefundPublication`
- [x] **AC-2 (the issue's revised AC, verbatim in intent):** Given one outstanding
  refund publication (`BookingCancelled` → `BookingRefundListener`) **and** one
  outstanding `PaymentConfirmed` publication (→ `PaymentEventListener`) **and** the same
  `BookingCancelled`'s outstanding payout-reversal and cancellation-mail publications,
  when the scoped re-drive runs, then only the refund publication is re-driven — the
  refund gateway is called again for that booking, the `PaymentConfirmed` publication
  stays outstanding, no payout ledger reversal appears, and no cancellation mail is sent.
  The test **ends with an unscoped control** that must re-drive the rows the scoped
  predicate skipped (#405's R-9: the framework silently skips a malformed row exactly as
  it skips an out-of-scope one). *Pinned by:*
  `RefundOutboxScopeIT.resubmitsTheRefundWithoutTouchingAnyOtherListener`
- [x] **AC-3:** The scope constant is pinned **two levels** (#405's R-6) through one
  shared fixture, `BookingListenerIds.REFUND`, derived from the class literals
  (compile-safe against a rename): a unit test pins the production constant against the
  fixture, and the existing `RefundBulkheadIT.keepsTheListenerIdUnchanged` — rewired from
  its own private hand-typed copy to the same fixture — pins the fixture against what the
  running registry writes. *Pinned by:*
  `RefundOutboxScopeTest.pinsTheConstantAgainstTheListenersRealId` +
  `RefundBulkheadIT.keepsTheListenerIdUnchanged`
- [x] **AC-4:** Given a resubmission has just run, when a second invocation arrives
  concurrently **or** inside the cooldown window, then it sweeps nothing and reports
  `ALREADY_RUNNING` / `COOLING_DOWN` rather than a success that moved nothing. *Pinned
  by:* `RefundResubmissionServiceTest.refusesAConcurrentInvocation` +
  `.refusesASecondInvocationInsideTheCooldown`
- [x] **AC-5:** Given the service has just been constructed (a deploy has just fired the
  restart republication), when an admin invokes resubmission immediately, then it is
  refused as `COOLING_DOWN` — the boot republish counts as sweep zero (#405's R-3).
  *Pinned by:*
  `RefundResubmissionServiceTest.startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish`
- [x] **AC-6:** Given an anonymous caller on either refund-outbox endpoint, then `401`;
  given an authenticated non-admin (`OPERATOR` or `CUSTOMER`), then `403` — before any
  resubmission happens. *Pinned by:*
  `AdminRefundOutboxControllerTest.operatorAndCustomerSessionsAreForbiddenOnBothEndpoints`
  + `.anonymousIsUnauthorizedOnBothEndpoints`
- [x] **AC-7:** Given any resubmission, when it logs or responds, then it carries counts
  and an outcome token only — no booking id list, no booking code (invariant #7; the
  serialized payloads in `event_publication` are exactly where booking ids live). *Pinned
  by:* `RefundResubmissionServiceTest.logsACountAndNoBookingIdentifier` + the response
  records' shape in `AdminRefundOutboxControllerTest`
- [x] **AC-8:** Given a refund publication the registry has already completed (archived
  under `completion-mode=archive`), when the lever is pressed, then no second gateway
  call results. *Pinned by:* `RefundOutboxScopeIT.leavesCompletedPublicationsAlone`
- [x] **AC-9:** Given a cooldown property outside its bounds (non-positive, sub-floor, or
  oversized), when the context binds it, then boot fails with a message naming the
  failure mode; the shipped default binds. *Pinned by:*
  `RefundResubmissionPropertiesTest`
- [x] **AC-10 (the issue's AC-1 + AC-4):** The decision (lever now, scheduler deferred
  with a stated trigger, restart-only rejected — including the persistently-failing
  gateway answer) lands in the substrate with this slice, and the retry horizon is
  restated **wherever the old one was**: `docs/runbooks/observability.md`'s refund rows
  (the `riviera_refunds_shed_total` row's "re-delivers at the next start" and the §"no
  admin resubmission endpoint for refunds" paragraph). *Verified by:* the
  `riviera-docs-freshness` sweep at close-out — a docs AC, no test class.

## Non-goals

- **A scheduled/automatic retry with backoff.** Deferred in the issue's decision comment
  with a stated trigger (real `riviera.refunds.failed` incidents on the `stripe` profile
  whose press history shows the transient share). The lever is its substrate either way.
- **A frontend admin-console surface.** The decision comment enumerates backend
  components only, the issue's ACs are backend-only, and the admin-console design canvas
  has no Refunds tab to implement. The endpoint mirrors `/api/admin/mail-outbox`, so a
  console tab can follow as its own slice if wanted.
- **Per-publication listing or per-row resubmission.** The serialized payloads carry
  booking ids (invariant #7); whole-scope counts only, same as #405.
- **Any change to who decides a refund, its amount, or the gateway call.** The listener,
  `RefundPort`, and the bulkhead (#404) are untouched; this slice only adds a way to
  re-invoke what already exists.
- **Touching `payout`'s deferred reversal (#428).** Its publication stays outstanding on
  its own listener; the exact-id scope structurally cannot reach it, and AC-2 proves it.
- **Widening `notification`'s mail outbox** to cover refunds — each lever stays scoped to
  its own module's listeners. ~~Or generalizing the two resubmission services into
  `shared`~~ — **reversed in the fix round (F-3)**: the Sonar merge bar's duplication gate
  (7.0% > 3%) falsified "two per-module copies are the cheaper coupling", exactly the
  #410 → #455 pattern (a per-module decision falsified by the second consumer). The
  *mechanism* — `ResubmissionThrottle` + `ResubmissionOutcome` — moved to the `shared`
  kernel on the admission bar's own terms (ownership: the sweep it throttles races the
  registry's root-configured boot republication, which no context owns); the scope, the
  window value, and the log noun stay per-module.

## Behavior-parity ledger

`N/A — new behavior, replaces nothing.` (The redeploy-as-lever it displaces is an
operational practice, not a surface; the runbook rows that describe it are AC-10.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The lever replays money-path work beyond the refund — `PaymentEventListener` (invariant #8), `payout`'s reversal (#9), the cancellation mail | **certain if scoped by package prefix or event type** | high | Exact listener-id allowlist of one; AC-2's fixture holds an outstanding `PaymentConfirmed` *because* a `BookingCancelled`-only fixture never exercises `PaymentEventListener` and would pass green with the scope wrong | this slice | closed — `RefundOutboxScopeIT.resubmitsTheRefundWithoutTouchingAnyOtherListener`, with the unscoped control |
| R-2 | The scope constant silently stops matching (rename/move → a no-op lever; the V31/#382 failure mode one level up) | med | high | Two-level pinning (AC-3): constant ↔ class-derived id (compile-safe), id ↔ what the live registry writes (`RefundBulkheadIT` rewired to the shared fixture) | this slice | closed — `RefundOutboxScopeTest` + `RefundBulkheadIT`, both green |
| R-3 | A re-drive double-refunds | low | critical | The gateway call is idempotency-keyed `booking-<id>-refund` derived from `BookingId` + operation (`riviera-stripe-payments`; ADR-0009 keeps this under Paysera), so a replay returns the original refund; additionally the v2 registry's `markResubmitted` claim skips a publication whose previous resubmission is in flight | existing design | closed — restated in `RefundOutbox`'s javadoc + the runbook; the lever adds no risk beyond the restart republish that already exists |
| R-4 | `ResubmissionOptions` looks like the intended scoping API but reaches only `FAILED` rows — a **shed** refund sits at `PUBLISHED` and would be silently skipped by the very lever #454 names it as a target of | **certain if used** | high | The `Predicate` overload (`processIncompletePublications`), same as `RegistryMailOutbox`; the adapter javadoc records the trap | this slice | closed — the `Predicate` overload ships; AC-2's shed case is covered by reading *incomplete* |
| R-5 | A press seconds after a deploy races the restart republication and reports success while moving nothing | med | low | Cooldown seeded at construction (AC-5, #405's R-3) | this slice | closed — `startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish` |
| R-6 | Full-suite-only failure: the new controller port breaks every `@WebMvcTest` that doesn't stub it (#405's F-1, verbatim) | **high if unstubbed** | med | An inert `RefundResubmission` joins `WebSliceStubs` in the same phase as the controller, not after CI finds it | this slice | closed — landed in phase 2; `AdminMailOutboxControllerTest` re-run green alongside |
| R-7 | The cooldown is shared bean state; ITs going through it make the **full suite only** go red (`riviera-local-debug` failure class) | med | med | `RefundOutboxScopeIT` drives `RefundOutbox` directly, below the cooldown; the policy is tested against a controllable `Clock`; IT assertions key to this test's own booking ids, deltas not absolutes | this slice | closed in design; residual full-suite verification is the push's CI run |
| R-8 | A permanently-failing refund (the issue's AC-1 case) is made worse | n/a | — | It cannot be: the lever is human-pressed, bounded by cooldown, and a re-driven failure just leaves the publication outstanding again — the same durable state, with `riviera.refunds.failed` still counting. The persistent case (e.g. insufficient Stripe balance) is fixed by a human topping up **then** pressing — which is the sequencing argument for building the button first | issue decision | closed — recorded in the issue's decision comment + AC-10 lands it in the substrate |

## Open questions / Assumptions

*(none open)*

### Resolved

- **`spring-modulith-events-core` was already on the compile classpath** (added
  project-wide by #405) — phase 0 compiled with no build change (`fa4876d`).
- **The cooldown bounds and default (60s, floor 5s, ceiling 24min) transferred from mail
  unchanged** — both levers throttle a sweep against a gateway/relay that fails fast in
  an outage; env-tunable via `RIVIERA_REFUND_RESUBMIT_COOLDOWN_MS` (`74dedde`).

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No code path in this slice reads or writes
`availability(set_id, booking_date)`. The `(set, date)` release for a cancellation
happens synchronously inside the cancel transaction, before `BookingCancelled` is even
published; re-driving the refund listener re-invokes only `payment.api.RefundPort`. The
adjacent guarantee: the exact-id scope structurally excludes `PaymentEventListener`,
whose `PaymentCanceled` branch *does* release availability — AC-2's fixture proves the
lever cannot reach it.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | The refund listener is `booking`'s own driving adapter; re-driving it is the same job. The scope — "exactly this module's refund listener" — is knowledge only this module has |
| M-2 | `shared` | existing (kernel) | (none) | Fix round F-3: `ResubmissionThrottle` + `ResubmissionOutcome` — the once-only guard both levers share, admitted on ownership (the sweep races the root-configured boot republication) |
| M-3 | `notification` | existing | (none) | Fix round F-3: its `MailResubmissionService` now delegates to the kernel throttle; its per-module outcome type is deleted; scope, window and log noun unchanged |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | none added | — | — | — |

`RefundOutbox` (driven, implemented by `adapter/out` over the registry) and
`RefundResubmission` (driving, called by the module's own admin controller) both stay
**internal to `booking.application.refund`** — the #391/#405 argument verbatim: hosting
the controller at the root would force a new published surface for a single same-module
consumer. No new `allowedDependencies` grant: everything added talks to the Modulith
framework and to types the module already imports.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none added or changed | — | — | — | — | — |

The slice **re-delivers** existing events to one existing listener; it publishes nothing
new and changes no payload or listener signature, so no `event_type`/`listener_id` Flyway
rewrite is due.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide *which* outstanding publications are "the refund" | `booking` | The listener is `booking`'s own adapter; naming it is this module's knowledge. Not `notification`'s (its outbox is deliberately scoped to its own listeners) and not `payment`'s (`payment` executes refunds; *when to re-ask* the executor is the caller's call, and the caller is `booking`'s listener) |
| Re-drive outstanding refund publications; count them | `booking` | Same job as owning the listener. `RESPONSIBILITIES.md`'s `booking` Job already carries the refund drive (#404); the re-drive is its retry lever |
| Once-only policy (single-flight + cooldown) | `shared` (mechanism) + per-module window/scope | Revised in fix round F-3: the guard's semantics race the registry's root-owned boot republication — nobody's context — while each module keeps its window value, scope and log noun; not rate limiting (edge) and not auth (RV-BE-11) |
| ADMIN-gate the two endpoints | root (`SecurityConfig`) | Authorization machinery lives at the platform edge (RV-BE-11); the matchers join the existing `/api/admin/**` ADMIN block |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch —
  untouched. No new money computation anywhere in this slice.
- **Why replay is safe (the load-bearing claim):** the refund is server-initiated with
  idempotency key `booking-<id>-refund` derived from `BookingId` + operation, so a
  re-driven publication re-issues the same key and the gateway returns the original
  refund rather than moving money twice. ADR-0009 keeps that property under Paysera.
- **Invariant #8:** `PaymentEventListener` (webhook-driven confirm) is exactly what the
  exact-id scope exists to keep out of reach — AC-2's `PaymentConfirmed` fixture row is
  the proof.
- **Invariant #9:** the payout reversal (including a #428-deferred one waiting for its
  accrual) stays outstanding on its own listener; the scoped re-drive must not complete
  or claim it — asserted in AC-2.
- **Invariant #10:** the refund decision and amount are computed upstream and carried in
  the `BookingCancelled` payload; the lever re-delivers the *same* publication, deciding
  nothing. The retry horizon it shortens is #10's enforcement horizon.
- **Pinning tests:** `RefundOutboxScopeIT` (AC-2, AC-8), the existing
  `RefundBulkheadIT` retry/idempotency coverage (unchanged), `RefundOutboxScopeTest`.

## Angular — frontend surfaces touched

`N/A — backend-only.` See Non-goals for the deliberate no-console-tab decision.

## FE↔BE contract

- **New endpoints** (both ADMIN-gated, both `200` with a typed outcome, no request body):
  - `GET /api/admin/refund-outbox` → `{ "outstanding": 2, "cooldownRemainingSeconds": 0 }`
  - `POST /api/admin/refund-outbox/resubmit` → `{ "outcome": "RESUBMITTED", "resubmitted": 2, "cooldownRemainingSeconds": 60 }`
    - `outcome` ∈ `RESUBMITTED` | `ALREADY_RUNNING` | `COOLING_DOWN`; `resubmitted` is `0`
      for both refusals; seconds round **up** (the #405 `seconds()` carry rule).
- **Client typing:** no frontend consumer in this slice; the shape deliberately mirrors
  `/api/admin/mail-outbox` so a future tab reuses the pattern.
- **Money/date on the wire:** `N/A` — counts and seconds only; never a booking id or code
  (invariant #7).

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh
> session, re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `implement done — PR ready-for-review; review gate + Sonar gate next`

**Next action:** Merge latest `origin/main`, mark PR #459 ready for review, run the
review gate (`/code-review` per the invocation ladder) and the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Scope + outbox port + registry adapter (+ id-pinning rewire, stale-string drive-by) | ✅ | `fa4876d` |
| 1 — Resubmission service: single-flight, cooldown, typed outcome, properties | ✅ | `74dedde` |
| 2 — ADMIN endpoints + security matchers + `WebSliceStubs` | ✅ | `9b15969` |
| 3 — Money-path scoping IT (AC-2, AC-8) | ✅ | `801f3c0` |
| 4 — Substrate docs + close-out | ✅ | `6abbdee` |
| 5 — Review + Sonar fix round: kernel `ResubmissionThrottle` extraction | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | `/code-review` agent 1 (RV-PROC-1, Major) | `codebase-design` and `domain-modeling` missing from *Skills consulted* despite the slice designing three new seams — the #447 recurring omission | fixed — both loaded for the fix round (which genuinely needed them: the throttle extraction is a seam-design decision), line updated |
| F-2 | `/code-review` agent 1 (Minor) | Execution-status phase table carried stale duplicate blank rows for phases 2/3 — ambiguous state store | fixed — table rebuilt with real shas |
| F-3 | Sonar gate (Quality Gate FAILED: 7.0% duplication on new code, ≤3% required; 2 duplicated blocks: `RefundResubmissionOutcome` ≅ `MailResubmissionOutcome`, `RefundResubmissionService` ≅ `MailResubmissionService`) | The deliberate mail-mirror duplicated the once-only policy verbatim | fixed — mechanism extracted to `shared.ResubmissionThrottle` + `shared.ResubmissionOutcome` (kernel admission on ownership, precedent #455/#456); both services now delegate; both per-module outcome types deleted; Non-goal revised with reasoning |
| F-4 | `/code-review` agent 5 (cosmetic, below bar) | `WebSliceStubs` imports out of package order | fixed — `394e485` |

---

## File structure

**Backend** (`platform/src/main/java/ai/riviera/platform/booking/`)

- `application/refund/RefundOutbox.java` — internal driven port: `int countOutstanding()`, `int resubmitOutstanding()`.
- `application/refund/RefundResubmission.java` — internal driving port the admin adapter calls: `status()`, `resubmit()`.
- `application/refund/RefundResubmissionOutcome.java` — sealed outcome: `Resubmitted`, `AlreadyRunning`, `CoolingDown` (+ `code()`, `retryAfter()`, `resubmitted()`).
- `application/refund/RefundOutboxStatus.java` — record `(int outstanding, Duration cooldownRemaining)`.
- `application/refund/RefundResubmissionWindow.java` — the cooldown as a plain application value; positive by construction.
- `application/refund/RefundResubmissionService.java` — single-flight + cooldown, seeded at construction; package-private `@Service`.
- `adapter/out/RegistryRefundOutbox.java` — implements `RefundOutbox` over `EventPublicationRegistry` + `IncompleteEventPublications`, scoped by **exact listener id**; hosts the `REFUND_LISTENER_ID` constant.
- `adapter/in/AdminRefundOutboxController.java` — `GET`/`POST` under `/api/admin/refund-outbox`; the #405 `seconds()` round-up.
- `adapter/in/RefundResubmissionProperties.java` — bound + boot-validated `riviera.booking.refund-resubmission.cooldown-ms`.
- `adapter/in/RefundResubmissionConfig.java` — binds the properties, maps to `RefundResubmissionWindow`.
- `platform/src/main/resources/application.properties` — `riviera.booking.refund-resubmission.cooldown-ms=${RIVIERA_REFUND_RESUBMIT_COOLDOWN_MS:60000}`.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — two ADMIN matchers.

**Backend tests** (`platform/src/test/java/ai/riviera/platform/`)

- `booking/adapter/in/BookingListenerIds.java` — public test fixture; `REFUND` / `PAYMENT_CONFIRMED` / `PAYMENT_CANCELED` ids derived from the class literals (the compile-safe anchor both pinning levels share).
- `booking/adapter/out/RefundOutboxScopeTest.java` — AC-3 level 1 (constant ↔ `BookingListenerIds.REFUND`) + exclusion of `PaymentEventListener` (both real signatures), both payout listeners, the cancellation-mail listener, and an unattributable publication (fail-closed).
- `booking/application/refund/RefundResubmissionServiceTest.java` — AC-1, AC-4, AC-5, AC-7 against a fake `RefundOutbox` + fixed `Clock`.
- `AdminRefundOutboxControllerTest.java` — the three outcomes' wire shapes + AC-6; root test package (the `WebSliceStubs` + `SecurityConfig` argument, #405 verbatim).
- `booking/adapter/in/RefundResubmissionPropertiesTest.java` — AC-9.
- `booking/RefundOutboxScopeIT.java` — AC-2 + AC-8 (Testcontainers; the reopen-archived-row fixture from `MailOutboxScopeIT`, adapted).
- `booking/RefundBulkheadIT.java` — **modify:** `REFUND_LISTENER_ID` private constant replaced by `BookingListenerIds.REFUND` (AC-3 level 2).
- `WebSliceStubs.java` — **modify:** inert `RefundResubmission` (R-6).
- `notification/adapter/out/MailOutboxScopeTest.java` — **modify (drive-by):** `PAYMENT_LISTENER_ID` names the nonexistent `PaymentSucceeded`; corrected to the real `PaymentConfirmed` signature so the exclusion test tests the id that exists.

**Docs**

- `RESPONSIBILITIES.md` — the `booking` Job line gains the admin re-drive.
- `CLAUDE.md` — the `booking` module-table row gains one short clause (endpoint + exact-id scope; detail stays in `RESPONSIBILITIES.md` and the adapter javadoc — the #405 F-7 lesson).
- `docs/runbooks/observability.md` — the refund retry-horizon claims (AC-10).
- `docs/plans/refund-outbox-resubmission.md` — this doc, kept live.

---

## Phase 0 — Scope + outbox port + registry adapter

**Files:** Create `booking/application/refund/RefundOutbox.java`,
`booking/adapter/out/RegistryRefundOutbox.java`, `booking/adapter/out/RefundOutboxScopeTest.java`
· Modify `booking/RefundBulkheadIT.java`, `notification/adapter/out/MailOutboxScopeTest.java`

- [x] **Step 1: Write the failing test** — first a public test fixture
  `booking/adapter/in/BookingListenerIds.java` whose ids are **derived from the class
  literals** (`BookingRefundListener.class.getName() + ".on(" +
  BookingCancelled.class.getName() + ")"` — it lives in `adapter/in` because the listeners
  are package-private there; deriving beats the mail fixture's hand-typed strings, being
  compile-safe against a rename). Then `RefundOutboxScopeTest`: the production constant
  equals `BookingListenerIds.REFUND`; the scope matches a publication carrying it;
  rejects `PaymentEventListener.on(PaymentConfirmed)`, `.on(PaymentCanceled)`, both
  payout listener ids, the cancellation-mail listener id, a same-package near-miss, and
  an untargeted publication (fail-closed).
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*RefundOutboxScope*"` → FAIL (9 compile errors, `RegistryRefundOutbox` absent).
- [x] **Step 3: Minimal implementation** — `RefundOutbox` port; `RegistryRefundOutbox`
  with `REFUND_LISTENER_ID` + exact-equality predicate over `TargetEventPublication`,
  counting via `findIncompletePublications`, re-driving via
  `resubmitIncompletePublications(Predicate)` (never `ResubmissionOptions` — R-4).
- [x] **Step 4: Run it, verify it passes** — same command + `--tests "*MailOutboxScopeTest*"` → PASS;
  `RefundBulkheadIT.REFUND_LISTENER_ID` rewired to `BookingListenerIds.REFUND`; the
  `MailOutboxScopeTest` stale string fixed; structural net PASS.
- [x] **Step 5: Generalization-audit pass** — see log.
- [x] **Step 6: Commit** — `feat(#454): scope a refund outbox to the refund listener's exact id`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Resubmission service: single-flight, cooldown, typed outcome

**Files:** Create `RefundResubmission.java`, `RefundResubmissionOutcome.java`,
`RefundOutboxStatus.java`, `RefundResubmissionWindow.java`, `RefundResubmissionService.java`,
`RefundResubmissionProperties.java`, `RefundResubmissionConfig.java`,
`RefundResubmissionServiceTest.java`, `RefundResubmissionPropertiesTest.java`
· Modify `application.properties`

- [x] **Steps 1–4:** red (30 compile errors, tests written first) → implement (the
  `MailResubmissionService` shape: `tryLock` + cooldown seeded at construction; property
  record with floor/ceiling + env placeholder) → green,
  `--tests "*RefundResubmission*"` → PASS.
- [x] **Step 5: Generalization-audit pass** — the shape was audited at phase 0 (see log);
  no new pattern introduced beyond the deliberate mirror.
- [x] **Step 6: Commit** — `feat(#454): guard refund resubmission with single-flight and a cooldown`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — ADMIN endpoints + security matchers + WebSliceStubs

**Files:** Create `AdminRefundOutboxController.java`, `AdminRefundOutboxControllerTest.java`
· Modify `SecurityConfig.java`, `WebSliceStubs.java`

- [x] **Steps 1–4:** red → implement → green (AC-6 + wire shapes + the seconds round-up),
  `--tests "*AdminRefundOutbox*" --tests "*AdminMailOutbox*"` → PASS; the `WebSliceStubs`
  stub landed **in this phase** (R-6 closed pre-CI); structural net + `ErrorContractArchitectureTests` PASS.
- [x] **Step 5:** Generalization-audit over the `/api/admin/**` matcher block — every
  admin surface gates GET/POST per-path with `hasRole(ADMIN_ROLE)`; the two new matchers
  match the shape exactly; no other admin controller lacks a `WebSliceStubs` entry.
- [x] **Step 6: Commit** — `feat(#454): expose the ADMIN refund-outbox status and resubmit endpoints`
- [x] **Step 7: Update plan-doc execution status.** *(The draft PR opened at the plan
  commit — PR #459.)*

## Phase 3 — Money-path scoping IT

**Files:** Create `booking/RefundOutboxScopeIT.java`

- [x] **Steps 1–4:** AC-2 + AC-8 against real Postgres, PASS first run. Fixture as
  planned, with one refinement found while writing: the payout reversal needs no
  reopened row at all — a refunded cancellation with **no accrual** defers by the
  production path itself (#428 throws), so the fixture seeds no accrual, and the
  unscoped control seeds it just-in-time so the reversal can complete and prove the row
  was live (the ledger `REVERSAL` appearing only at control time is the strongest form
  of "the scoped press never touched payout"). The `PaymentConfirmed` and
  cancellation-mail rows are reopened archived rows (the `MailOutboxScopeIT` rule: the
  registry's own rows, never hand-built).
- [x] **Steps 5–7:** audit (fixture patterns match the two sibling ITs; no new
  generalizable pattern), commit
  (`test(#454): prove the refund re-drive cannot reach any other listener`), status.

## Phase 4 — Substrate docs + close-out

**Files:** Modify `RESPONSIBILITIES.md`, `CLAUDE.md`, `docs/runbooks/observability.md`, this doc

- [x] **Steps 1–4:** AC-10 — the runbook's refund retry-horizon claims name the lever
  (the shed-row clause and the §"the lever" paragraph, which also lands the
  persistently-failing-gateway answer from the decision comment);
  `RESPONSIBILITIES.md` booking Not-My-Job gains the #454 ownership statement;
  `CLAUDE.md` booking row gains one clause; the refund-bulkhead comment in
  `application.properties` no longer says restart-only.
- [x] **Steps 5–7:** `riviera-docs-freshness` ran over `origin/main...HEAD` — 4 stale
  restart-only claims found and patched (all listed above); the counting sweep (second
  admin outbox lever, second cooldown) found no stale uniqueness claims; the #428
  reversal's "until the next restart's republish" (`observability.md:45`) was verified
  **still true** — the new lever deliberately cannot reach it. Committed; execution
  status finalized in this PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-31 | Phase 0 — hand-typed listener-id strings in tests | Other `listener_id` string literals that could go stale like `MailOutboxScopeTest`'s `PaymentSucceeded` | `grep -rn "Listener.on(" platform/src/test` | `BookingMailFixtures` (3 ids), `MailOutboxScopeTest` (4 ids incl. the stale one — fixed), `RefundBulkheadIT` (rewired) | The notification-side ids stay hand-typed: their listeners are package-private in `notification.adapter.in`, and each is already level-2 pinned by `RegistryMailBulkheadIT` against the live registry, so a class-derived fixture there is a `notification` refactor out of this slice's scope. The two ids in `RefundOutboxScopeTest` for `payout` remain strings for the same reason (no public fixture; exclusion-only role) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1, AC-4, AC-5, AC-7, AC-9:** `gradle --no-daemon --console=plain test --tests "*RefundResubmission*"` → PASS.
- [x] **AC-2, AC-8:** `--tests "*RefundOutboxScopeIT*"` (Docker) → PASS.
- [x] **AC-3:** `--tests "*RefundOutboxScopeTest*" --tests "*RefundBulkheadIT*"` → PASS.
- [x] **AC-6:** `--tests "*AdminRefundOutbox*"` → PASS.
- [x] **AC-10:** docs-freshness sweep run; runbook claims updated.
- [ ] **Structural net:** `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section justified N/A with reasoning.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new grant (invariant #11).
- [x] **Payment/payout** filled — replay-safety stated, AC-2 proves the scope (invariants #8, #9).
- [x] Refund policy untouched; retry horizon restated (invariant #10).
- [x] Timezone: the cooldown reads the injected `Clock`, UTC `Instant` only (invariant #6).
- [x] No booking code or id list in any log line or response (invariant #7).
- [x] No Flyway migration needed; verified no schema change (invariant #12).
- [x] **Frontend** N/A upheld.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1.
