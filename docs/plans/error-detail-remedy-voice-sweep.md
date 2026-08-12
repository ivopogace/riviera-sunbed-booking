# Error `detail` Remedy-Voice Sweep Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire every remedy-voiced RFC-7807 `detail` in the tree — the seven call sites #610
filed plus the three its phrase sweep could not see — and replace the "known exceptions are a lower
bound" caveat with an enumerated population, so absence from the list stops meaning *unexamined*.

**Architecture:** The population is enumerated by **mechanism, not phrase** — every server `detail`
literal (including the ones reached through a controller-local `problem(...)` helper and the one
hand-built in `RateLimitFilter`, both invisible to a `grep -A2 "ApiProblem\."`) intersected with the
21 client `code`→copy mappers. That enumeration is what turns 7 known call sites into 10. The one
significant wording decision is that **a code emitted from more than one call site gets one string,
shared and pinned identical** — because the defect #610 named is drift between hand-synced copies,
and three separate twins exist here (`MISSING_CURRENT_PASSWORD` across two controllers,
`REQUEST_NOT_PENDING` across two, and the two `STALE_WRITE` set-writes that share one `set_version`
token). Pinning the property, not the sentence, is what stops a future edit re-forking them.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query touched.

**Source of intent:** GitHub issue #644, itself deferred from #610 (PR #643) at the maintainer's
scope call.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the grill is what found
the three call sites beyond the filed seven, and caught that the issue's own "six strings" table
mis-attributes two `STALE_WRITE` details to *prices* and *layout* when both write one shared token) ·
`riviera-plan-doc` (this template — its Generalization-audit blockquote is why the population was
enumerated by mechanism rather than by grepping for strings resembling the seven, which is what
surfaced `RATE_LIMITED`) · `tdd` (red-green per phase: every new `$.detail` assertion fails against
the current prose before the controller changes) · `riviera-review-overlay` (review gate — <when it
ran>; RV-BE-10's seven-call-site grandfather carve-out is retired by this slice, since its whole
population is fixed) · `riviera-docs-freshness` (<**ran** over `<range>`, N findings — **or** `N/A —
<reason>`>) · `riviera-java-conventions` (§6b is the rule being applied; §6a named the shared
constants rather than repeating literals across call sites, and §6d kept the new constant javadoc to
contract-plus-pointer) · `riviera-local-debug` (scoped build/test recipe; the Testcontainers ITs in
phases 0 and 2 need the manual dockerd fallback or they skip silently).

> `riviera-modulith` was **not** loaded, and the same reasoning #610 recorded applies at larger
> scale: the diff creates no production class, moves none, and touches no published surface
> (`api`/`spi`/`events`/`vocabulary`). It rewrites string literals in four existing `adapter/in`
> controllers and four root-package edge classes, and adds two test classes. There is no placement
> decision for it to own. Flagged rather than silently skipped.
>
> `riviera-frontend` / `angular-developer` / `playwright-cli` are **not** due either, and that is a
> verified claim rather than an assumption: no client reads `detail` anywhere in `frontend/src`, and
> every mocked `detail` in `frontend/e2e/` is either `''` or a #607 sentinel chosen so the server
> would never send it. `git diff origin/main -- frontend/` must stay empty (AC-6).

**Branch:** `claude/sdlc-644-49iiu2` — the cloud session's designated remote branch, standing in for
`bugfix/error-detail-remedy-voice-sweep` per `riviera-sdlc` § *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue **profile** write carrying a stale `expectedVersion`, when the server
  answers `409 STALE_WRITE`, then `detail` names the profile token and states no remedy. *Pinned
  by:* `VenueAdminControllerIT.staleVersionPatchIs409` (the existing `$.code` test, extended).
- [ ] **AC-2:** Given a **set** write carrying a stale `expectedVersion` — a row reprice **or** a
  bulk layout replace, which share one `set_version` token (V23) — when the server answers `409
  STALE_WRITE`, then both arms carry the **same** `detail`, and it attributes the change to the
  venue's sets rather than to prices or layout specifically, because either write bumps the token.
  *Pinned by:* `VenueRepriceIT.staleRepriceIs409StaleWrite`,
  `BeachMapReplaceIT.staleReplaceIs409StaleWrite` — both asserting one shared constant.
- [ ] **AC-3:** Given a password change omitting the current password, when either the operator
  endpoint (`POST /api/auth/operator/password`) or the customer endpoint (`POST /api/me/password`)
  answers `400 MISSING_CURRENT_PASSWORD`, then the two `detail` strings are **equal to each other**
  — asserted as an equality between the two live responses, not as two independent literal matches,
  so a one-sided edit is a red build. *Pinned by:*
  `CurrentPasswordDetailTwinTest.bothPasswordEndpointsStateTheSameCondition`.
- [ ] **AC-4:** Given a request that has left `PENDING_REQUEST`, when either the guest withdraw
  (`BookingController`) or the venue accept/decline (`BookingRequestController`) answers `409
  REQUEST_NOT_PENDING`, then both carry the same `detail` and it is **true of every route out of
  pending** — decided, expired, *and withdrawn* — where today the accept-side string
  ("already been decided") is false of the withdrawn route the suite already provokes. *Pinned by:*
  `WithdrawRequestIT.aBookingThatLeftPendingIsAConflict`,
  `BookingRequestControllerTest.acceptOfAWithdrawnRequestStatesTheConditionNotADecision`.
- [ ] **AC-5:** Given each remaining swept call site, when it rejects, then `detail` states the
  condition and no remedy: `403 NOT_VENUE_OWNER` (`ApiErrorHandlerTest.notVenueOwnerIs403WithCode`),
  `409 CANNOT_SUSPEND_SELF` (`AdminOperatorControllerTest.selfSuspendIsRefusedBeforeAnyRevoke`),
  `502 PAYMENT_INIT_FAILED` (`BookingRequestControllerTest.paymentInitFailureStatesTheCondition` —
  the arm has **no** HTTP-level coverage today, only a service test on the outcome enum), and
  `429 RATE_LIMITED` (`RateLimitFilterTest`, whose literal `$.detail` assertion already exists).
- [ ] **AC-6:** No swept string survives anywhere in `platform/src`, and the client keeps its copy —
  `grep -rn "Reload the latest\|Enter your current password\.\|You cannot suspend the account\|You
  do not manage this venue\.\|please retry\|Retry later\." platform/src` returns nothing, while
  `git diff origin/main -- frontend/` is empty.
- [ ] **AC-7:** The enumerated population replaces the lower-bound caveat — `error-contract.md` no
  longer says the known exceptions are a floor, RV-BE-10 no longer grandfathers seven call sites
  (its whole population is fixed), and the three examined-but-unchanged strings are recorded with
  the reason, so a later reader can tell *judged clean* from *never looked at*. *Pinned by:*
  `grep -c "lower bound\|grandfathered" ` over both skill references returning 0.

## Non-goals

- **Group C — the three duplicates that are not remedy voice**, examined and deliberately left:
  `UNSUPPORTED_FORMAT` (whose server string is byte-identical to `venue-tab.ts:418` — the purest
  instance of the mechanism in the tree, yet a legitimate statement of what the server accepts),
  `BOOTSTRAP_CREDENTIAL_MANAGED` (trailing "…and cannot be changed here"), and
  `SET_NOT_BOOKABLE_ONLINE` (a prose transliteration of its own code — trap 1, pre-existing). These
  are recorded in the Generalization-audit log as *judged*, which is the point: the issue's
  complaint was that absence from a list read as clean.
- A machine check for `detail` voice. Declined by the maintainer at #610's plan stage — a
  banned-phrase list is brittle and a gate that fails correct strings is the wrong error direction.
  This slice is the reason that call holds up: two of its three new finds contain no banned phrase
  reachable by the sweep's grep at all.
- Any change to a `code`, an HTTP status, the `ProblemDetail` shape, or a guard's behavior.
- The client copy. It is the single source of rendered wording and stays untouched by design.
- `#609`'s question (should the panel know which action was attempted) — still wholly client-side.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice changes a wire field on ten call sites, so "no user-visible change" is a claim to
> verify, not to assert.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Every swept endpoint's status + `code` + `application/problem+json` shape | preserved | Untouched — only the `detail` string differs; each call site keeps its existing `$.code` assertion |
| `instance` redacted to `about:blank` (invariant #7) | preserved | Still built by the one `ApiProblem` factory; `RateLimitFilter`'s hand-built body keeps its literal `"type":"about:blank"` |
| `429` responses carry `Retry-After` | preserved | Untouched — and it is the reason the prose "Retry later." can go: the remedy is already on the wire machine-readably |
| Server `detail` phrased as operator/tourist copy | **dropped** | Deliberate — no client reads `detail` (verified across `frontend/src`), so it reached no user and nothing kept it in sync with the copy that did |
| Client-rendered copy for all ten codes | preserved | Not touched; it was always the only wording a user saw |
| Mocked e2e 409/403s carrying `detail` sentinels | preserved | Every mock sends `''` or a #607 sentinel the server would never send; none quotes a swept string, so `frontend/e2e/` needs no edit — re-verified as AC-6's second half |
| `"This request has already been decided."` on an accept after withdraw | **changed** | It was *false* on that route (a withdrawn request was decided by nobody) and the suite already provokes it via `acceptAfterWithdrawIsNotPending`; the shared replacement is true of all three routes out of pending |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A replacement is **untrue** at some arm — #610's trap 2, which bit inside that slice | high | med | Every multi-arm code gets one string checked against the broadest arm: the two `STALE_WRITE` set-writes share `set_version` (V23 says so explicitly), so neither may claim *prices* or *layout* changed; `REQUEST_NOT_PENDING` must survive the withdrawn route. Both pinned by asserting one shared constant at every arm (AC-2, AC-4) | claude | open |
| R-2 | A replacement shortens into a **restatement of its `code`** — trap 1 | med | low | Each string must add what the code cannot: which token went stale and that the request carried one; that a *request* field is absent; that the operator/venue relation failed. **Accepted with reason for `RATE_LIMITED` alone** — every truthful widening either leaks which of the four rate-limit dimensions fired (an anti-abuse leak) or is false at one of them, so `"Too many requests."` is the honest floor | claude | open |
| R-3 | Fixing one half of a twin and leaving the other — the exact defect the rule exists to stop, and how #643 found its own G-4 | med | med | Three twins exist, all enumerated up front. AC-3 asserts the two password responses **equal each other** rather than each matching a literal, so a one-sided edit fails even if both are individually plausible | claude | open |
| R-4 | The enumeration is itself a lower bound again, and the docs claim otherwise | med | med | The population is defined by mechanism and both halves enumerated by command, including the two blind spots that made #610's sweep short (helper indirection, the hand-built `RateLimitFilter` body). The doc records the command, not just the verdict; Group C is recorded as *judged*, not omitted | claude | open |
| R-5 | `PAYMENT_INIT_FAILED` has no HTTP-level test, so its arm is unpinned and a new test class is needed to reach it | high | low | Confirmed: only `RespondToRequestServiceTest` asserts the outcome enum. Phase 2 adds `BookingRequestControllerTest` as a `@WebMvcTest` slice with a stubbed port, matching `OperatorAccountControllerTest`'s house style rather than paying for a Testcontainers IT | claude | open |

## Open questions / Assumptions

*None open.*

### Resolved

- **Open question:** Does this slice fix only the seven filed call sites, or everything the
  enumeration confirms? → **Groups A+B, all ten**, per the maintainer's scope call at this slice's
  intake gate. Group C (three duplicates that are not remedy voice) stays out, recorded as judged.
- **Open question:** Is `RATE_LIMITED` in scope, given it is hand-built JSON pinned literally by a
  test and no client mapper renders it? → **Yes**, same call. It is the one call site that proves
  the enumeration had to be mechanism-based: no `ApiProblem` grep can reach it.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice rewrites string literals in driving adapters. It does
touch the *reporting* of two optimistic-concurrency losses (`STALE_WRITE` on `venue.version` and
`venue.set_version`), but not their detection: `JdbcVenues`' `SELECT … FOR UPDATE` on the venue row,
the conditional `UPDATE … WHERE id = :id AND version = :version`, and the token bumps are untouched,
as is every write path to `availability(set_id, booking_date)`. The `409` still fires on exactly the
same conditions and still answers the same `code`.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | `VenueAdminController` is its `adapter/in`; the three `STALE_WRITE` strings are that adapter's wire mapping |
| M-2 | `booking` | existing | `Booking` | `BookingController` / `BookingRequestController` are its `adapter/in`; the `REQUEST_NOT_PENDING` twin and `PAYMENT_INIT_FAILED` are their wire mapping |
| M-3 | (root package) | existing | none — the composition root | `ApiErrorHandler`, `RateLimitFilter`, `AdminOperatorController`, `OperatorAccountController`, `MyAccountController`. Login/session/admin machinery lives at the platform edge, never in a module (RV-BE-11) — so these strings are correctly outside every module already |

**Cross-module named interfaces (`api/` ports)** — N/A, none added or changed.

**Domain events (id-based payloads, invariant #11)** — N/A, none published or consumed.

### Module ownership (§4a)

No behavior added or moved: literals rewritten in `venue::adapter.in`, `booking::adapter.in` and
five root-package edge classes, plus two new test classes. No boundary change, no new capability to
place. The one thing worth stating, because it looks like a boundary question and is not: the
`MISSING_CURRENT_PASSWORD` twin lives in two root-package classes rather than in `customer` or
`operator` **by design** (RV-BE-11 — login/session machinery at the edge), so unifying its wording
is a wire-mapping change, not an argument for moving either controller into a module.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `PAYMENT_INIT_FAILED`'s `detail` is rewritten, but the arm that produces
it (`CheckoutPort.pay` failing to open the guest's pay window) and everything downstream of it are
untouched: no amount, refund, ledger entry or webhook path is in the diff.

## Angular — frontend surfaces touched

N/A — backend + docs only. The console's and tourist app's copy is the surface this slice
deliberately leaves as the single source of rendered wording; changing it would defeat the point.
Verified rather than assumed: `git diff origin/main -- frontend/` must be empty (AC-6).

## FE↔BE contract

- **New/changed endpoints:** none. Every swept endpoint keeps its method, path, status, body media
  type (`application/problem+json`) and `code`.
- **Changed field:** the `detail` string at ten call sites, listed in the File-structure section.
- **Client typing:** unchanged — `detail` is not in any client model. `operator-console.model.ts`
  and the auth services type the `code` unions, which is the fact that makes this safe.
- **Money/date on the wire:** N/A — no amounts in scope. One swept response
  (`WRONG_SERVICE_DATE`) carries a date, and it is **not** being changed.

## Execution status

**Stage pointer:** `implement — phase 1`

**Next action:** Run phase 1 step 1 — the edge quartet's `$.detail` assertions plus the new
`CurrentPasswordDetailTwinTest` — and confirm they fail against the current prose.

> **Testcontainers note for a resuming session.** Docker Hub's *unauthenticated* pull limit
> (`429 toomanyrequests`) blocks `postgres:17`, so the ITs **fail** rather than skip — the daemon is
> up, which is what `@EnabledIfDockerAvailable` tests. Fix without touching repo or CI config:
> `docker pull mirror.gcr.io/library/postgres:17 && docker tag mirror.gcr.io/library/postgres:17
> postgres:17`. Testcontainers' `DefaultPullPolicy` then finds it locally and never calls Hub.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The venue `STALE_WRITE` trio | ✅ red 3/3, green 61 tests 0 skipped | this commit |
| 1 — The edge quartet (twin, self-suspend, ownership, rate limit) | | |
| 2 — The booking pair | | |
| 3 — Retire the lower-bound caveat and the grandfather list | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *none yet* | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — the
  three `STALE_WRITE` details, becoming two named constants (profile token, shared set token)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — the
  withdraw leg's `REQUEST_NOT_PENDING` detail
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingRequestController.java` —
  the accept/decline `REQUEST_NOT_PENDING` twin and `PAYMENT_INIT_FAILED`
- `platform/src/main/java/ai/riviera/platform/ApiErrorHandler.java` — `NOT_VENUE_OWNER`
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — `RATE_LIMITED`, inside the
  hand-built `RATE_LIMITED_BODY` text block
- `platform/src/main/java/ai/riviera/platform/AdminOperatorController.java` — `CANNOT_SUSPEND_SELF`
- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — the
  `MISSING_CURRENT_PASSWORD` twin, operator half
- `platform/src/main/java/ai/riviera/platform/MyAccountController.java` — the same twin, customer half
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — `$.detail` on the
  stale profile update
- `platform/src/test/java/ai/riviera/platform/venue/VenueRepriceIT.java` — `$.detail` on the stale
  reprice, asserting the shared set-token constant
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — `$.detail` on the
  stale replace, asserting the same constant
- `platform/src/test/java/ai/riviera/platform/CurrentPasswordDetailTwinTest.java` — **new**; the
  twin guard, asserting the two password endpoints' details equal *each other*
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — `$.detail` on
  the operator omitted-current-password arms
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — `$.detail` on the customer arm
- `platform/src/test/java/ai/riviera/platform/AdminOperatorControllerTest.java` — `$.detail` on
  self-suspend
- `platform/src/test/java/ai/riviera/platform/ApiErrorHandlerTest.java` — `$.detail` on
  `NOT_VENUE_OWNER`
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — the existing literal
  `$.detail` assertion, updated
- `platform/src/test/java/ai/riviera/platform/booking/WithdrawRequestIT.java` — `$.detail` on the
  withdraw-side `REQUEST_NOT_PENDING`
- `platform/src/test/java/ai/riviera/platform/booking/BookingRequestControllerTest.java` — **new**;
  the accept-side twin plus the first HTTP-level coverage of `PAYMENT_INIT_FAILED`
- `.claude/skills/riviera-java-conventions/references/error-contract.md` — the known-exceptions
  paragraph replaced by the enumerated population and the Group-C judgements
- `.claude/skills/riviera-review-overlay/references/backend-conventions.md` — RV-BE-10's
  seven-call-site grandfather carve-out retired
- `docs/plans/error-detail-remedy-voice-sweep.md` — this plan

---

## Phase 0 — The venue `STALE_WRITE` trio

**Files:** Modify `VenueAdminController.java:145-146,221-222,236-237` · `VenueAdminControllerIT.java`
· `VenueRepriceIT.java` · `BeachMapReplaceIT.java`

- [x] **Step 1: Write the failing assertions** — one `$.detail` assertion per call site. The reprice
  and replace tests assert the **same** constant, which is what states the shared-token property.

- [x] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenueAdminControllerIT*"
  --tests "*VenueRepriceIT*" --tests "*BeachMapReplaceIT*"` → FAIL, actual is the old remedy prose.

- [x] **Step 3: Minimal implementation** — two constants in `VenueAdminController`: one for the
  profile token (`venue.version`, V22), one shared by both set-writes (`venue.set_version`, V23).

- [x] **Step 4: Run them, verify they pass** — same command → PASS.

- [x] **Step 5: Generalization-audit pass** — the population is already enumerated above; append the
  row recording the mechanism, both enumeration commands, and the Group-C judgements.

- [x] **Step 6: Commit** — `git commit -m "State the stale-write condition without the reload remedy (#644)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — The edge quartet

**Files:** Modify `ApiErrorHandler.java:68` · `RateLimitFilter.java:87` ·
`AdminOperatorController.java:142-143` · `OperatorAccountController.java:127-128` ·
`MyAccountController.java:90-91` · four test classes · Create `CurrentPasswordDetailTwinTest.java`

- [ ] **Step 1: Write the failing assertions** — including the twin guard, which asserts the two
  password endpoints' `detail` values are equal to **each other**, not to a literal.

- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*ApiErrorHandlerTest*" --tests
  "*RateLimitFilterTest*" --tests "*AdminOperatorControllerTest*" --tests
  "*OperatorAccountControllerTest*" --tests "*CurrentPasswordDetailTwinTest*" --tests
  "*SetPasswordIT*"` → FAIL.

- [ ] **Step 3: Minimal implementation** — rewrite the four strings; `RATE_LIMITED`'s lives inside
  the hand-built text block, so the JSON stays byte-valid.

- [ ] **Step 4: Run them, verify they pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git commit -m "Take the remedy out of the four platform-edge error details (#644)"`

- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

## Phase 2 — The booking pair

**Files:** Modify `BookingController.java:110-111` · `BookingRequestController.java:69-70,73-74` ·
`WithdrawRequestIT.java` · Create `BookingRequestControllerTest.java`

- [ ] **Step 1: Write the failing assertions** — the withdraw arm, the accept arm (same constant),
  and the first HTTP-level `PAYMENT_INIT_FAILED` assertion.

- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*WithdrawRequestIT*" --tests
  "*BookingRequestControllerTest*"` → FAIL.

- [ ] **Step 3: Minimal implementation** — one shared `REQUEST_NOT_PENDING` constant true of all
  three routes out of pending; drop "; please retry" from `PAYMENT_INIT_FAILED`.

- [ ] **Step 4: Run them, verify they pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git commit -m "Give REQUEST_NOT_PENDING one true detail and drop the retry remedy (#644)"`

- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

## Phase 3 — Retire the lower-bound caveat and the grandfather list

**Files:** Modify `references/error-contract.md` · `references/backend-conventions.md` · this plan

- [ ] **Step 1: `error-contract.md`** — replace the six-strings/seven-call-sites paragraph with the
  enumerated population: what the mechanism is, both commands, the ten fixed, the three judged.

- [ ] **Step 2: RV-BE-10** — retire the grandfather carve-out; its whole population is fixed, so
  leaving it would exempt strings that no longer exist and re-teach the reader they are sanctioned.

- [ ] **Step 3: Verify** — AC-6 and AC-7 greps.

- [ ] **Step 4: Commit** — `git commit -m "Replace the error-detail lower-bound caveat with the enumerated population (#644)"`

- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated; a row whose population is "the other X like
> this one" is the shape that misses things (Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-12 | Plan (intake grill) | **Mechanism: a server `detail` literal whose `code` a client also renders its own copy from.** Both halves enumerated by command, then judged pairwise. Two blind spots made #610's sweep short and are covered here: a `detail` reached through a controller-local `problem(...)`/`error(...)` helper (the literal sits in a `switch` arm, out of `grep -A2` range) and one built without `ApiProblem` at all | `grep -rn "ApiProblem\." platform/src/main --include=*.java` (51 refs / 18 files, unrolled through each controller's helper to ~55 literals) × `grep -rln "case '[A-Z_]\{4,\}'" frontend/src/app --include=*.ts` (21 mappers); plus `grep -rn '"detail"' platform/src/main` for bodies built by hand | 10 remedy-voiced call sites (7 filed + `PAYMENT_INIT_FAILED`, withdraw `REQUEST_NOT_PENDING`, `RATE_LIMITED`); 3 examined and judged clean | Fix all 10. **Judged, not omitted:** `UNSUPPORTED_FORMAT` (byte-identical to `venue-tab.ts:418` — the mechanism's purest instance, but a true statement of what the server accepts, so not remedy voice), `BOOTSTRAP_CREDENTIAL_MANAGED` (trailing consequence clause only), `SET_NOT_BOOKABLE_ONLINE` (trap-1 transliteration, pre-existing and not a remedy) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle test --tests "*VenueAdminControllerIT*"` → PASS. Red first at phase 0 step 2.
- [ ] **AC-2:** `gradle test --tests "*VenueRepriceIT*" --tests "*BeachMapReplaceIT*"` → PASS, both
  asserting the one shared constant.
- [ ] **AC-3:** `gradle test --tests "*CurrentPasswordDetailTwinTest*"` → PASS.
- [ ] **AC-4:** `gradle test --tests "*WithdrawRequestIT*" --tests "*BookingRequestControllerTest*"` → PASS.
- [ ] **AC-5:** `gradle test --tests "*ApiErrorHandlerTest*" --tests "*AdminOperatorControllerTest*"
  --tests "*RateLimitFilterTest*" --tests "*BookingRequestControllerTest*"` → PASS.
- [ ] **AC-6:** the swept-string grep over `platform/src` → no output; `git diff origin/main --
  frontend/` → empty.
- [ ] **AC-7:** `grep -c "lower bound\|grandfathered"` over both skill references → 0.

**Also run:** the structural net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`,
`*PackageShapeArchitectureTests*`, `*ErrorContractArchitectureTests*`) and all four repo hygiene
guards (inline comments, plan file-structure, focus posture, whole-scope Prettier).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
