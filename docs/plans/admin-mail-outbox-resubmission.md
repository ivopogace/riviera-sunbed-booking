# Admin-triggered resubmission of outstanding mail publications Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A platform admin can retry the confirmation mails the Event Publication Registry
still owes — from the admin console, without waiting for a deploy — and that button can only
ever move mail, never a payout accrual or a Stripe refund.

**Architecture:** The registry already holds the durable "owed" record and Spring Modulith
already exposes the resubmission mechanism (`IncompleteEventPublications`), so this slice is a
**scoped, guarded trigger**, not new delivery code. The single most significant decision:
**scope by the owning module's listener-id prefix, not by event type** — `BookingConfirmed` is
consumed by the mail listener *and* by `BookingConfirmedPayoutListener`, so an event-type
predicate would resubmit invariant-#9 accruals from a button labelled "mail". The second:
duplicate mail is **already** prevented by the registry one layer down (G-2, corrected during
implementation), so the service-level **single-flight + cooldown** is a throttle on the *sweep* —
it stops a press during a relay outage from re-attempting every outstanding send, and stops a
press that achieved nothing from reporting success. The cooldown clock starts at boot, so the
deploy's own republication counts as sweep zero.

**Persistence:** JDBC only (invariant #1). **No migration** — this slice reads and re-drives
the framework-owned `event_publication` table through Modulith's own API and adds no table,
column or constraint. Next free Flyway version stays `V36`.

**Source of intent:** GitHub issue **#405** (parent epic #367); admin-console design canvas
`docs/design/riviera-admin-console.dc.html`.

**Skills consulted:** `riviera-sdlc` (loop + routing gate), `riviera-local-debug` (cloud Gradle
recipe: system `gradle` + JDK-25 toolchain, scoped tests only), `riviera-plan-doc` (this doc),
`riviera-modulith` (placement: driving port + service in `application/`, registry access as a
driven port implemented in `adapter/out`, admin controller in `adapter/in` per the #391
precedent — *not* at the composition root), `riviera-java-conventions` (sealed typed outcome
over exceptions, package-private adapter, boot-validated property record instead of `@Validated`,
one-line-or-no inline comments), `riviera-frontend` (the Email tab is a file in the existing
`admin/` feature folder; the tab strip is a sibling component there, not a `shared/` promotion —
only one feature uses it), `riviera-tailwind` (utilities on the components themselves — the tab
pills and the card are used once each, so neither earns a shared directive; `text-[13.5px]` over a
named size), `angular-developer` + **angular-cli MCP** (`list_projects` →
Angular 22 + Vitest; `get_best_practices` → no explicit `standalone`/`OnPush`, `input()`/`output()`,
`@Service`, native control flow, AXE/WCAG-AA as a hard requirement), `playwright-cli` (mocked
CI-safe spec authoring), `riviera-review-overlay` (the review gate — findings F-2..F-8),
`riviera-docs-freshness` (the close-out sweep over `origin/main...HEAD`; it caught the stale
restart-is-the-only-recovery claims in `docs/runbooks/observability.md` that nothing else would have). **Not loaded, deliberately:** `postgres` (no migration, no SQL authored —
see Persistence), `riviera-stripe-payments` (no money moves; the slice's whole point is that it
*cannot* touch the money path).

**Branch:** `claude/admin-dashboard-extension-q6dlci` — the cloud session's designated remote
branch, standing in for `feature/admin-mail-outbox-resubmission` per the `riviera-sdlc`
remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given outstanding booking-confirmation publications, when an ADMIN invokes the
  resubmission port, then every one of them is handed back to the registry for delivery and the
  outcome reports how many. *Pinned by:* `MailResubmissionServiceTest.resubmitsEveryOutstandingMailPublication`
- [x] **AC-2:** Given one outstanding mail publication **and** one outstanding payout-accrual
  publication **and** one outstanding refund publication, when the resubmission port is invoked,
  then only the mail publication is resubmitted — the other two stay outstanding and no ledger
  entry and no Stripe call results. *Pinned by:* `MailOutboxScopeIT.resubmitsMailWithoutTouchingTheMoneyPath`
- [x] **AC-3:** Given a resubmission has just run, when a second invocation arrives concurrently
  **or** inside the cooldown window, then it sweeps nothing and reports `ALREADY_RUNNING` /
  `COOLING_DOWN` rather than a success that moved nothing. (The *mail-delivered-once* half of this
  is the registry's own per-publication claim — see G-2.)
  *Pinned by:* `MailResubmissionServiceTest.refusesAConcurrentInvocation` +
  `MailResubmissionServiceTest.refusesASecondInvocationInsideTheCooldown`
- [x] **AC-4:** Given the service has just started with `republish-outstanding-events-on-restart=true`,
  when an admin invokes resubmission immediately, then it is refused as `COOLING_DOWN` — the boot
  republication counts as the first resubmission.
  *Pinned by:* `MailResubmissionServiceTest.startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish`
- [x] **AC-5:** Given a publication that is already complete, when resubmission runs, then it is not
  redelivered (the existing `BookingConfirmationMailIT` guarantee is untouched — completed rows are
  archived out of `event_publication` under `completion-mode=archive`).
  *Pinned by:* `MailOutboxScopeIT.leavesCompletedPublicationsAlone`
- [x] **AC-6:** Given an anonymous caller, when it calls either mail-outbox endpoint, then `401`;
  given an authenticated non-admin (`OPERATOR` or `CUSTOMER`), then `403` — before any
  resubmission happens, so a denied caller cannot consume the cooldown either.
  *Pinned by:* `AdminMailOutboxControllerTest.operatorAndCustomerSessionsAreForbiddenOnBothEndpoints` +
  `.anonymousIsUnauthorizedOnBothEndpoints`
- [x] **AC-7:** Given any resubmission, when it logs, then the line carries a count and no email
  address and no arrival code (invariant #7).
  *Pinned by:* `MailResubmissionServiceTest.logsACountAndNoBearerCredential`
- [x] **AC-8:** Given a signed-in admin on the console's Email tab, when the outbox is non-empty and
  they press Resubmit, then the count is shown, the result is announced, and a refused (cooling-down)
  attempt is reported as such rather than as a failure.
  *Pinned by:* `admin-mail-outbox.spec.ts` + `admin-mail-outbox.e2e.ts`
- [x] **AC-9:** Given a non-admin (or signed-out) visitor on `/admin/email`, when the page renders,
  then it offers no Resubmit control — matching the existing `/admin` self-gate, with the backend
  role gate as the real authority. *Pinned by:* `admin-mail-outbox.spec.ts`
- [x] **AC-10:** Given the Email tab renders in either state, when axe runs, then there are no
  serious violations and the tab strip exposes the current tab to assistive tech.
  *Pinned by:* `admin-mail-outbox.a11y.spec.ts` + `admin-mail-outbox.e2e.ts`

## Non-goals

- **The other four tabs of the admin-console design canvas.** Commissions and Payouts have **no
  backend at all** (the canvas says so itself, and names the endpoints that would have to be
  invented); Approvals/Operators and Privacy already ship or are out of this issue's scope. This
  slice adds the console's **tab chrome** plus the one tab #405 is about.
- **#380's resend** — a mail whose publication is already *complete* ("we recorded delivery, the
  inbox is empty"). That needs a freshly composed send; this slice only re-drives *incomplete*
  publications. Different mechanism, different issue.
- **A scheduled/automatic retry.** #405 asks for an operational trigger. A sweep would need
  #372's bounce feed first, or a permanently-failing address is retried forever.
- **Exposing the Modulith actuator endpoint.** Deliberately closed since #75; this slice does not
  reopen it.
- **A per-IP rate-limit budget** on the two endpoints — see grill G-4 / Open questions.
- **Resubmitting a *specific* publication by id.** Whole-scope only; a per-row surface would need
  a listing endpoint that exposes registry payloads (booking ids, and via #405's own lens, arrival
  codes) to the console.

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `/admin` renders the approval queue + account list with no tab chrome | **changed** | The page keeps every behavior and gains the design canvas's tab strip above its heading; `/admin` stays the Operators tab's URL, so every existing deep link, spec and the `admin-operator-suspension.e2e.ts` flow are unaffected |
| `/admin` self-gates on `OperatorAuth` (restoring / signed-out / non-admin states) | **preserved** | The new tab reuses the identical three-state gate; the tab strip renders only inside the admin-authorized branch, so a signed-out visitor is not told which admin tabs exist |

*(Nothing is retired by this slice — the ledger exists because it touches an existing page.)*

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A "mail" button resubmits a payout accrual (invariant #9) or a Stripe refund (invariant #8) | **high if scoped by event type** | high | Scope by the *listener-id prefix of the owning module*, never by event type | plan | closed — `MailOutboxScopeIT.resubmitsMailWithoutTouchingTheMoneyPath`, with an unscoped control proving the row was live |
| R-2 | ~~Two clicks deliver the mail twice~~ **retired by G-2**: the v2 registry claims each publication before invoking it, so a still-draining send is skipped in the database. Replaced by: a press during a relay outage re-attempts every outstanding send, and reports success while moving nothing | med | med (relay load + a misleading answer) | Single-flight `tryLock` + cooldown, re-justified as a sweep throttle; AC-3 | plan | closed — corrected in the phase-3 commit |
| R-3 | A press seconds after a deploy repeats the restart republication's sweep | med | low | The cooldown clock is seeded at service construction | plan | closed — `MailResubmissionServiceTest.startsCoolingDownAtBootSoAClickCannotRaceTheRestartRepublish` |
| R-4 | `ResubmissionOptions` looks like the 2.1 way to scope, but its query only reaches `FAILED` publications — a **shed** send (#383) never runs, is never marked failed, and would be silently skipped by the very lever meant to clear it (G-3, revised) | **certain if used** | high (a button that reports success and leaves shed mail owed) | Use the `Predicate` overload, which routes to `processIncompletePublications`; the adapter javadoc records why | plan | closed — the `Predicate` overload ships; the adapter javadoc records both traps |
| R-5 | Adding `spring-modulith-events-core` to the compile classpath drags framework internals into a module | low | low | Already on the **runtime** classpath via `spring-modulith-starter-jdbc`; only `adapter/out` imports it; BOM-versioned | plan | closed — one adapter, `ModularityTests` green |
| R-6 | The scoping prefix is a string constant that silently stops matching if the listener package moves (the V31/#382 failure mode, one level up) | med | high (a silent no-op) | A unit test pins the constant against the confirmation listener's real id, which `RegistryMailBulkheadIT` in turn pins against what the running registry writes | plan | closed — `MailOutboxScopeTest` |
| R-9 | A test fixture that hand-builds a registry row passes for the wrong reason — the framework skips a malformed row exactly as it skips an out-of-scope one | **realised** | med (a false green on the money-path guarantee) | `MailOutboxScopeIT` reopens the registry's *own* archived row and ends with an unscoped control that must re-drive it; two drafts failed this control before the fixture was right | plan | closed — the control is now part of the test |
| R-7 | The new endpoints are a shared-state bean reached by ITs; a cooldown that leaks across tests makes the **full suite only** go red (the `riviera-local-debug` failure class) | med | med | `MailOutboxScopeIT` drives `MailOutbox` directly, below the cooldown; the policy is tested against a controllable clock | plan | closed — but the *sibling* failure class did fire, as F-1 |
| R-8 | Error contract drift on the two new endpoints | low | low | Both are `200` with a typed outcome (#391 precedent); no request body to validate; no hand-rolled error body | plan | closed — `AdminMailOutboxControllerTest` |

## Open questions / Assumptions

*(Both assumptions below were carried out as stated; they moved to Resolved in phase 5.)*

### Resolved

- **The status read shipped** (phase 2). `GET /api/admin/mail-outbox` reports the same scoped count the
  resubmission computes, so the two cannot disagree about what "outstanding" means, and the console's
  lever is never a blind one. Beyond #405's ACs, deliberately.
- **"Extend the admin dashboard" was read as tab chrome + the one tab this issue is about** (phase 4).
  The canvas's Commissions and Payouts tabs have no backend — the canvas documents this itself — so
  building them would have meant inventing endpoints in a mail-retry slice.

### Resolved (issue-intake grill, #405 against today's `main`)

- **G-1 — "on its own rate-limit budget" mis-describes its own precedent.** The issue points at
  #391 (`POST /api/admin/email-suppressions/reinstate`) as the pattern to follow "on its own
  rate-limit budget". It has none: `RateLimitFilter` matches an explicit path list and **no
  `/api/admin/**` path is in it**. → See G-4 for the decision.
- **G-2 — the issue is wrong about this deployment, found while making the AC-2 IT go green
  (correction landed after phase 3).** The finding is true of `JdbcEventPublicationRepository` — the
  **v1** repository. V8 ships the **v2** schema and `spring.modulith.events.jdbc.use-legacy-structure`
  defaults to `false`, so the bean is `JdbcEventPublicationRepositoryV2`, where `markResubmitted` is a
  real claim: `UPDATE … SET STATUS = 'RESUBMITTED' … WHERE ID = ? AND STATUS != 'RESUBMITTED'`, whose
  row count `processPublications` honours. Duplicate mail is therefore prevented **durably, in the
  database, across instances** — stronger than any in-process lock. `markProcessing`/`markFailed` are
  implemented too, so the `status` column *is* written (contra the issue's finding 3). The
  service-level guard is retained on its own merits and re-justified: it throttles the **sweep**, not
  the send → R-2 restated. *Cost of the correction: the first two drafts of `MailOutboxScopeIT`
  hand-built an outstanding row with `status` NULL, which `STATUS != 'RESUBMITTED'` never matches
  (NULL comparison), so the framework silently skipped it and the control never fired.*
- **G-3 — the issue's advice is still wrong, but for a different and more interesting reason**
  (revised with G-2). `ResubmissionOptions` is not a no-op here: v2 implements both
  `countByStatus` and `findFailedPublications`. It is *incomplete* — its query is
  `STATUS = 'FAILED' OR (STATUS IS NULL AND COMPLETION_DATE IS NULL)`, which reaches a send whose
  listener **threw**, but not one the bulkhead **shed**: a rejected send never runs, so nothing marks
  it failed and it sits at `PUBLISHED` with its publication outstanding — precisely the durability
  #383/#407 relies on, and precisely what this lever exists to clear. Its `maxInFlight` gate is a
  second trap, counting `RESUBMITTED` rows a never-completing send leaves behind. Use
  `resubmitIncompletePublications(Predicate)`, which reads *incomplete* and covers both → R-4.
- **G-4 — the public `EventPublication` cannot express the scope the ACs require.** It exposes
  `getEvent()`, dates, status and attempts — **no target identifier**. Scoping by event type is
  therefore the only thing the api-jar alone can do, and it is exactly wrong (R-1): `BookingConfirmed`
  fans out to the mail listener *and* the payout accrual. The instances the predicate actually
  receives are `TargetEventPublication` (`spring-modulith-events-core`), which carries
  `getTargetIdentifier()`. → the adapter pattern-matches on that type and compares the listener id;
  `spring-modulith-events-core` joins the compile classpath (R-5), version from the existing BOM.
- **G-5 — no in-flight collision.** The only open PRs are ten Dependabot frontend bumps; no session
  branch touches `SecurityConfig`, the `notification` module, or `frontend/src/app/admin/`. This
  slice adds **no migration**, so the Flyway-number contention that produced the #122/#127 case
  history cannot apply.
- **G-6 — module ownership checks out.** `RESPONSIBILITIES.md` gives `notification` the Job of
  transactional-mail delivery including "both delivery vehicles"; re-driving the registry vehicle is
  that Job. No other module's **Not My Job** list claims it, and the composition root is explicitly
  *not* where it goes (`CompositionRootDisciplineTests` keeps module listeners off the root, and the
  #391 controller precedent puts the admin adapter in the module).
- **G-7 — the sibling slice's close-out is clean.** #434 (the most recent epic-#367 slice) merged
  as `d2f3732` with its plan doc final and its issue closed; nothing to back-fill.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No code path in this slice reads or writes
`availability(set_id, booking_date)`. The concurrency this slice *does* introduce is about
duplicate **mail**, not double-sold sets, and is covered by R-2/R-3 and AC-3/AC-4. The one
adjacent guarantee worth stating: the resubmission scope structurally excludes the
`BookingConfirmed`/`BookingCancelled` listeners that carry ledger and refund work, so no
re-drive can replay a money-path side effect (R-1).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state, no aggregate) | It owns the registry delivery vehicle; re-driving it is the same Job. The scope is defined as "this module's listeners", which is knowledge only this module has |

No new module, no new `allowedDependencies` grant: everything the slice adds talks to the
Modulith framework and to types the module already imports. `shared` is already granted (for
`ApiProblem`, #391).

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | none added | — | — | — |

The driving port (`MailResubmission`) and the driven port (`MailOutbox`) both stay **internal to
`notification.application`**: the controller is same-module (`adapter/in`), and the outbox port is
implemented by the module's own `adapter/out`. Publishing either would be a hypothetical seam and
would give the module a third published surface where it deliberately keeps two (the #391
argument, unchanged).

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none added or changed | — | — | — | — | — |

The slice **re-delivers** an existing event (`booking.events.BookingConfirmed`) to an existing
listener; it publishes nothing new and changes no payload, so no `event_type`/`listener_id`
Flyway rewrite is due (the V18/V31 rule does not fire).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide *which* outstanding publications are "mail" | `notification` | Its Job is the two delivery vehicles; the registry vehicle's listener set is its own. No other module can name it without importing `notification.adapter.in` |
| Re-drive outstanding mail publications; count them | `notification` | Same Job line ("Event Publication Registry listener for ids-only payloads"). Not on any other module's Not-My-Job list |
| Once-only policy (single-flight + cooldown) | `notification` | Delivery-duplication policy for its own vehicle. It is *not* rate limiting (that is the edge's `RateLimitFilter`), and it is *not* an auth concern (RV-BE-11) |
| ADMIN-gate the two endpoints | root (`SecurityConfig`) | Login/authorization machinery lives at the platform edge, never in a module (RV-BE-11); the matchers join the existing `/api/admin/**` ADMIN block |
| Render the console's Email tab | `frontend/src/app/admin/` | Existing admin feature folder (`riviera-frontend` taxonomy) |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope, and keeping it that way is the slice's central constraint.` No money
moves, no amount is computed, no Stripe call is made. The relevant invariants appear here only as
things the scope must **not** reach: `BookingConfirmedPayoutListener` / `BookingCancelledPayoutListener`
(invariant #9, exactly-once accrual) and `BookingRefundListener` → `payment`'s `RefundPort`
(invariant #8). AC-2 is the proof, and it is written as "one of each left outstanding", not as a
predicate unit test alone, precisely because the failure mode is a real re-drive.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-console-tabs.ts` | new | standalone component | `input()` for the active tab id; no internal state | — |
| FE-2 | `admin/admin-mail-outbox.ts` | new | standalone component | signals (`status`, `loading`, `busy`, `notice`, `loadError`) | — (a single action button, no form) |
| FE-3 | `admin/admin-mail-outbox.service.ts` | new | `@Service()` HTTP client | promise-returning, stateless (the `AdminOperatorsService` shape) | — |
| FE-4 | `admin/admin.model.ts` | modify | types | — | — |
| FE-5 | `admin/admin-operators.ts` | modify | standalone component | unchanged behavior; renders FE-1 above its heading | — |
| FE-6 | `app.routes.ts` | modify | routing | new lazy `admin/email` route with a `title` | — |
| FE-7 | `app.spec.ts` | modify | routing test | the new route joins `RESTYLED_PATHS` — a porcelain surface, born un-legacied, like `/admin` | — |

**Standards:** standalone components (no explicit `standalone`/`OnPush` — both are the v22
default), `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs, `@Service` for the singleton
service, Tailwind v4 utility classes with `--riv-*` tokens under the porcelain host theme (the
`admin-operators` shape), and AXE/WCAG-AA as a hard gate (FE-1 marks the current tab with
`aria-current="page"`; the result banner is a live region so a resubmission outcome is announced).

## FE↔BE contract

- **New endpoints** (both ADMIN-gated, both `200` with a typed outcome — no error body of their own):
  - `GET /api/admin/mail-outbox` → `{ "outstanding": 3, "cooldownRemainingSeconds": 0 }`
  - `POST /api/admin/mail-outbox/resubmit` → `{ "outcome": "RESUBMITTED", "resubmitted": 3, "cooldownRemainingSeconds": 60 }`
    - `outcome` ∈ `RESUBMITTED` | `ALREADY_RUNNING` | `COOLING_DOWN`; `resubmitted` is `0` for the
      latter two; `cooldownRemainingSeconds` is how long until another attempt is accepted.
- **Client typing:** hand-written typed service + `admin.model.ts` interfaces mirroring the
  controller records, exactly as `AdminOperatorsService`/`admin.model.ts` already do. No `as any`.
- **Money/date on the wire:** `N/A` — this contract carries neither.
- **No response ever carries an address, a booking code, or a registry payload** (invariant #7):
  counts and an outcome token only.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `review gate RUN (findings fixed) — Sonar gate PASSED — ready to merge`

**Next action:** Await the human's merge decision. Every gate has run; nothing is outstanding.

**Review gate (RUN):** `/code-review`'s five-agent fan-out over `origin/main...HEAD`, with
`riviera-review-overlay` layered into the CLAUDE.md-adherence agent. Six findings were raised and
independently confidence-scored; one cleared the 80 bar (F-6, scored 100) and the rest scored 25-75,
but every one that was *verified real* was fixed anyway — the bar governs what gets reported, not what
is worth correcting. Agents 3 and 5 verified the Spring Modulith claims line-by-line against the
library sources and found no contradiction. See F-4..F-9 in the register.

**Sonar gate (passed, checked — not merely the badge):** 0 new issues, 0 accepted issues,
0 security hotspots, 0.0% duplication on new code, 94.3% coverage on new code — above the
project's stricter-than-default 80% bar.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Scope + outbox port + registry adapter | ✅ | `dd0f72a` |
| 1 — Resubmission service: single-flight, cooldown, typed outcome | ✅ | `1515f8e` |
| 2 — ADMIN endpoints + security matchers | ✅ | (this commit) |
| 3 — Money-path scoping IT (+ the G-2/G-3 correction) | ✅ | (this commit) |
| 4 — Admin console: tab strip + Email tab | ✅ | (this commit) |
| 5 — Mocked e2e + substrate docs + close-out | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (backend, run on `c4e3bd7`) | 113 tests failed: `@WebMvcTest` loads **every** controller, so the new `AdminMailOutboxController` broke every web-slice test that did not stub its port. A scoped local run could not show it — the only class with a `@MockitoBean` for that port was the new one | fixed — `WebSliceStubs` gained an inert `MailResubmission`, the file that exists for exactly this |
| F-2 | Review overlay (RV-STYLE-1) | Two multi-line inline comments introduced by the diff — the new route entry and the new `SecurityConfig` matcher block. Both matched their neighbours, which is why they were written that way; the rule is explicit that consistency is not its goal | fixed — each cut to one line; the full reasoning already lives in the component/controller javadoc |
| F-3 | Review overlay (RV-PROC-1) | `riviera-tailwind` was loaded before styling the tab strip and the outbox card, but never recorded in *Skills consulted* | fixed — line updated with what it changed |
| F-4 | `/code-review` agent 2 (scored 75) | `AdminMailOutboxController.seconds()` used `plusMillis(999)` as a ceiling, which cannot carry a sub-millisecond remainder — and the remainder comes from `Duration.between` on a nanosecond clock, so it under-reported by a second roughly 1 call in 1000, contradicting its own javadoc | fixed — carry is `plusNanos(999_999_999)`; pinned by `roundsUpARemainderThatIsNotAWholeMillisecond` + `leavesAWholeNumberOfSecondsAlone` |
| F-5 | `/code-review` agents 1 + 4 (scored 25) | *Skills consulted* omitted `riviera-review-overlay` and `riviera-docs-freshness`. Scored below the bar on the letter of RV-PROC-1, but the second omission was true rather than clerical — the skill had not been run | fixed properly: the sweep was **run**, found 3 stale runbook claims (F-8), and both skills are now listed |
| F-6 | `/code-review` agent 1 (scored 100) | The plan's *File structure* and Phase 5 file lists omitted `CLAUDE.md`, which the diff modifies | fixed — both lists completed |
| F-7 | `/code-review` agent 4 (scored 75) | The `CLAUDE.md` `notification` row grew by 224 words against that file's own "keep this file short and stable" rule (line 8); the row was already 1,229 words vs 132 for the next-longest | fixed — cut to 55 words (the endpoint + the scoping rule + a pointer); the detail already lives in `RESPONSIBILITIES.md` and the adapter javadoc |
| F-8 | `riviera-docs-freshness` (`origin/main...HEAD`) | `docs/runbooks/observability.md` told an on-call operator, in three places, that an outstanding publication is recovered only by a restart — false the moment this lever ships, and the runbook is exactly where someone would look during the incident it exists for | fixed — all three now name the lever |
| F-9 | `riviera-docs-freshness` (out of range — **flagged, not fixed**) | `docs/runbooks/observability.md:60` still says the shed-durability case is "not yet covered by a test — #407", but #407 shipped in `649cb73`. Pre-existing drift from that slice's own close-out, not caused by this diff | flagged — outside this slice's range; worth a one-line follow-up |
| — | `/code-review` agent 3 | Observed that `AlreadyRunning` reports the full cooldown while its javadoc says the concurrent case "resolves in milliseconds" | no action — agent 5 verified against the code and test that the javadoc describes lock contention, not the reported duration, and the reported value is correct (the winner has already stamped the cooldown) |

---

## File structure

**Backend** (`platform/src/main/java/ai/riviera/platform/notification/`)

- `application/MailOutbox.java` — internal driven port: `int countOutstanding()`, `int resubmitOutstanding()`.
- `application/MailResubmission.java` — internal driving port the admin adapter calls.
- `application/MailResubmissionOutcome.java` — sealed outcome: `Resubmitted`, `AlreadyRunning`, `CoolingDown`.
- `application/MailOutboxStatus.java` — record `(int outstanding, Duration cooldownRemaining)`.
- `application/MailResubmissionWindow.java` — the cooldown as a plain application value (the `MailTransportBudget` pattern).
- `application/MailResubmissionService.java` — the single-flight + cooldown policy; package-private `@Service`.
- `adapter/out/RegistryMailOutbox.java` — implements `MailOutbox` over `EventPublicationRegistry` + `IncompleteEventPublications`, scoped by listener-id prefix.
- `adapter/in/AdminMailOutboxController.java` — `GET`/`POST` under `/api/admin/mail-outbox`.
- `adapter/in/MailResubmissionProperties.java` — bound + boot-validated `riviera.notification.mail-resubmission.*`.
- `adapter/in/MailResubmissionConfig.java` — binds the properties, maps them to `MailResubmissionWindow`.
- `platform/build.gradle` — add `spring-modulith-events-core` (BOM-versioned) to `implementation`.
- `platform/src/main/resources/application.properties` — the cooldown property + its `RIVIERA_*` placeholder.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — two ADMIN matchers.

**Backend tests** (`platform/src/test/java/ai/riviera/platform/`)

- `notification/MailOutboxScopeTest.java` — the prefix constant matches the live listener FQCN (R-6); money-path listener ids do not match.
- `notification/MailResubmissionServiceTest.java` — AC-1, AC-3, AC-4, AC-7 against a fake `MailOutbox` + fixed `Clock`.
- `AdminMailOutboxControllerTest.java` — the three outcomes' wire shapes **and** AC-6. In the root
  test package, like every other admin-surface test, because `WebSliceStubs` is package-private there
  and the subject is the surface *through* `SecurityConfig`. A separate Testcontainers security IT was
  planned and dropped: this docker-free `@WebMvcTest` already runs the real filter chain, so the IT
  would have re-proven the same matchers more slowly.
- `notification/adapter/out/MailOutboxScopeIT.java` — AC-2, AC-5 (Testcontainers).
- `notification/adapter/in/MailResubmissionPropertiesTest.java` — the bound validation + the env placeholder.

**Frontend** (`frontend/src/app/admin/`)

- `admin-console-tabs.ts` (+ `.spec.ts`) — the design canvas's tab strip, as **routed** tabs.
- `admin-mail-outbox.ts` (+ `.spec.ts`, `.a11y.spec.ts`) — the Email tab.
- `admin-mail-outbox.service.ts` (+ `.spec.ts`) — the HTTP client.
- `admin.model.ts` — `MailOutboxStatusView`, `MailResubmissionResultView`.
- `admin-operators.ts` — render the tab strip.
- `../app.routes.ts` — the `admin/email` route.
- `frontend/e2e/admin-mail-outbox.e2e.ts` — CI-safe mocked spec (AC-8, AC-10).

**Docs**

- `RESPONSIBILITIES.md` — the `notification` Job line gains the admin re-drive.
- `CLAUDE.md` — the `notification` module-table row gains the endpoint + the scoping rule (kept short
  deliberately; the detail lives in `RESPONSIBILITIES.md` and the adapter javadoc).
- `docs/runbooks/observability.md` — three present-tense claims that a restart is the *only* recovery
  for an outstanding publication; found by the `riviera-docs-freshness` sweep, not by hand.
- `docs/plans/admin-mail-outbox-resubmission.md` — this doc, kept live.

---

## Phase 0 — Scope + outbox port + registry adapter

**Files:** Create `notification/application/MailOutbox.java`, `notification/adapter/out/RegistryMailOutbox.java`, `notification/MailOutboxScopeTest.java` · Modify `platform/build.gradle`

- [x] **Step 1: Write the failing test** — `MailOutboxScopeTest`: the scope matches the live
  `BookingConfirmationMailListener`'s listener id (derived from the class, not typed twice) and
  rejects the payout/refund listener ids.
- [x] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*MailOutboxScopeTest*"`
- [x] **Step 3: Minimal implementation** — the prefix constant + the `TargetEventPublication`
  pattern-match predicate; `RegistryMailOutbox` counting via `EventPublicationRegistry#findIncompletePublications`
  and re-driving via `IncompleteEventPublications#resubmitIncompletePublications(Predicate)` (never the
  `ResubmissionOptions` overload — R-4).
- [x] **Step 4: Run it, verify it passes** — same command.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `feat(#405): scope the mail outbox to the notification module's listeners`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Resubmission service: single-flight, cooldown, typed outcome

**Files:** Create `MailResubmission.java`, `MailResubmissionOutcome.java`, `MailOutboxStatus.java`, `MailResubmissionWindow.java`, `MailResubmissionService.java`, `MailResubmissionProperties.java`, `MailResubmissionConfig.java`, `MailResubmissionServiceTest.java`, `MailResubmissionPropertiesTest.java` · Modify `application.properties`

- [x] **Step 1: Write the failing tests** — AC-1, AC-3, AC-4, AC-7 against a fake `MailOutbox` and a
  controllable `Clock`.
- [x] **Step 2–4:** red → implement (`tryLock` + cooldown seeded at construction) → green,
  `--tests "*MailResubmission*"`.
- [x] **Step 5: Generalization-audit pass** — check the other boot-validated property records for the
  same bound shape.
- [x] **Step 6: Commit** — `feat(#405): guard mail resubmission with single-flight and a cooldown`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — ADMIN endpoints + security matchers

**Files:** Create `AdminMailOutboxController.java`, `AdminMailOutboxControllerTest.java`, `AdminMailOutboxSecurityIT.java` · Modify `SecurityConfig.java`

- [x] **Step 1–4:** red → implement → green (AC-6 + the wire shapes),
  `--tests "*AdminMailOutbox*"`.
- [x] **Step 5:** Generalization-audit pass over the `/api/admin/**` matcher block.
- [x] **Step 6: Commit** — `feat(#405): expose the ADMIN mail-outbox status and resubmit endpoints`
- [x] **Step 7: Update plan-doc execution status.** *(Open the draft PR here at the latest — CI only
  fires on `pull_request`, so nothing has been built by CI before this point.)*

## Phase 3 — Money-path scoping IT

**Files:** Create `MailOutboxScopeIT.java`

- [x] **Step 1–4:** AC-2 + AC-5 against real Postgres — leave one mail, one payout-accrual and one
  refund publication outstanding, resubmit, assert only the mail moved and the ledger is untouched.
- [x] **Step 5–7:** audit, commit (`test(#405): prove the mail re-drive cannot touch the money path`), status.

## Phase 4 — Admin console: tab strip + Email tab

**Files:** Create `admin-console-tabs.ts`(+spec), `admin-mail-outbox.ts`(+spec, +a11y spec), `admin-mail-outbox.service.ts`(+spec) · Modify `admin.model.ts`, `admin-operators.ts`, `app.routes.ts`

- [x] **Step 1–4:** red → implement → green — `npm test` scoped to the admin specs, then `npm run lint`.
- [x] **Step 5–7:** audit, commit (`feat(#405): add the admin console Email tab`), status.

## Phase 5 — Mocked e2e + substrate docs + close-out

**Files:** Create `frontend/e2e/admin-mail-outbox.e2e.ts` · Modify `CLAUDE.md`, `RESPONSIBILITIES.md`, `docs/runbooks/observability.md`, this doc

- [x] **Step 1–4:** the CI-safe mocked spec (AC-8, AC-10) via `npm run test:e2e:a11y`.
- [x] **Step 5–7:** audit, commit, finalize the execution status **in this PR** (stage pointer DONE,
  every phase row ✅, risks closed, `merged via PR #NN`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-30 | Phase 1 — new boot-validated property record | Other `@ConfigurationProperties` records with range guards | `grep -rn "@ConfigurationProperties" platform/src/main/java` | `RegistryMailProperties`, `MailTransportProperties`, `RateLimitProperties`, `AbandonedPaymentProperties`, `CustomerRetentionProperties` | Matched the shape exactly (compact-constructor guard + both bounds + the message that names the failure mode). No change needed elsewhere |
| 2026-07-30 | Phase 2 — new controller in a `@WebMvcTest`-loaded package | Other admin controllers' ports in the web-slice stub set | `grep -n "@Bean" platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` | 47 stubs, one per controller port | **This was the miss (F-1).** Every `@WebMvcTest` loads every controller, so the new port needed a stub. Fixed in phase 3; the audit is recorded here because running it *at* phase 2 would have caught it before CI did |
| 2026-07-30 | Phase 3 — the v1-vs-v2 repository correction | Everywhere the slice asserted "the framework has no guard" | `grep -rn "duplicate guard\|finding 2\|finding 3" platform/src/main platform/src/test docs/plans` | 7 sites (4 javadocs, 1 property comment, 1 test javadoc, the plan doc) | All rewritten in one pass. The code was right; only its stated reasons came from the v1 class |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-7:** `gradle --no-daemon --console=plain test --tests "*MailOutbox*" --tests "*MailResubmission*" --tests "*AdminMailOutbox*"` → PASS.
- [x] **AC-8..AC-10:** `npm test` (admin specs) + `npm run test:e2e:a11y` → PASS.
- [x] **Structural net:** `--tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section justified N/A with reasoning.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new grant needed (invariant #11).
- [x] **Payment/payout** N/A justified — and AC-2 proves the scope cannot reach them (invariants #8, #9).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone: the cooldown reads the injected `Clock`, UTC `Instant` only (invariant #6).
- [x] No booking code or address in any log line or response (invariant #7).
- [x] No Flyway migration needed; verified no schema change (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract; axe clean.
- [x] Execution status at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] **Close-out written in THIS PR** — this section is final; the slice merges via **PR #438**.
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1. *(Due now that
      the PR is ready for review; left unticked until it has actually run.)*
