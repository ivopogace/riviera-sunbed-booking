# Session-revoke ordering on the three remaining surfaces Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a transient session-revoke failure impossible to pair with a committed state change on
the three sibling call sites #344 left alone — customer password reset, admin suspend, and self-service
erasure — so every reachable failure is one the caller's natural retry recovers from, without opening
the re-authentication window a naive reorder would create.

**Architecture:** **Bracket, don't reorder.** Each site gains a revoke of the principal's sessions
*before* the state change **and keeps the one it already had after it**. Revoke-first is the #344 fix
(a failed revoke now leaves nothing changed); keeping the trailing revoke closes the window that
revoke-first opens on its own — during it the old password / `ACTIVE` status is still valid, so a
session created there would otherwise outlive the change made to kill it. Two sites cannot name their
principal up front today, so each gains a **pure read** on the module port that owns the state:
`OperatorLifecycle#activeUsername` (id → username) and `CustomerAccountRecovery#emailForResetToken`
(a resolve-**without**-consume token read). All three sites stay platform-edge (RV-BE-11); no module
learns about sessions.

**Persistence:** JDBC only (invariant #1). **No migration.** Two new `SELECT`s against existing
tables on existing indexes — `operator` by primary key, `customer_account_token` by its
`customer_account_token_hash_uniq` unique index (V28). No table, column, constraint, or index changes;
latest migration on `main` is `V30`.

**Source of intent:** GitHub issue **#357** (the three deferrals from #344's generalization audit;
prior art + rationale in `docs/plans/password-change-atomicity-session-rotation.md`).

**Skills consulted:**
- `riviera-sdlc` — routed the gate; ran the issue-intake grill that produced D-1 (below) and confirmed
  the in-flight check: only Dependabot frontend PRs are open, no backend overlap, no Flyway number to claim.
- `riviera-plan-doc` — this document's structure.
- `riviera-modulith` — placement: the two new reads are **inbound** (`api/`, not `spi/` — the edge
  *calls* them, the module implements them), each added to the port that already holds that
  conversation rather than as a fifth narrow port; all three controllers stay in the root package,
  so no `allowedDependencies` grant changes and `ModularityTests` is a regression check.
- `riviera-java-conventions` — `Optional<T>` return on both query ports (never `null`), package-private
  adapter + text-block SQL with named params, §6c one-line-comment discipline (the bracket rationale
  lives in Javadoc, not inline blocks), §9 test-for-real (both module reads pinned by Testcontainers ITs,
  not mocks).
- `postgres` — checked before writing either `SELECT`: both are single-row point lookups on an existing
  index (`operator` PK; `customer_account_token_hash_uniq`), so the slice adds **no** index and no
  migration; the non-consuming read deliberately repeats `consume`'s exact predicate
  (`consumed_at IS NULL AND expires_at > NOW()`, DB clock) so the two cannot disagree.
- `tdd` + `riviera-review-overlay` — the always-on spine: red-first per phase, and the RV-BE/RV-STYLE/
  RV-PROC bank walked at the review gate.
- `riviera-stripe-payments` — **N/A**, no money, no Stripe, no ledger row in the diff.
- `riviera-frontend` / `angular-developer` / `playwright-cli` — **N/A**, backend-only: no path, status
  code, DTO, or error `code` changes, so nothing the SPA can observe.
- `riviera-local-debug` — scoped-test recipe for this session's Gradle runs.

**Branch:** `bugfix/session-revoke-ordering-remaining-surfaces` (local session — the literal
`<bugfix>/<short-slug>` branch, no cloud substitution).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a redeemable reset token for `alice@example.com`, when the reset is submitted, then
  that principal's sessions are revoked **before** the token is consumed and the password written.
  *Pinned by:* `AccountRecoveryControllerTest.revokesTheAccountsSessionsBeforeConsumingTheToken`
- [x] **AC-2:** Given the pre-write revoke fails, when the reset is submitted, then the token is **never
  consumed** and no password is written — the customer's retry with the same link still works.
  *Pinned by:* `AccountRecoveryControllerTest.aFailedRevokeNeverConsumesTheToken`
- [x] **AC-3:** Given a successful reset, when its effects have run, then the sessions are revoked
  **again after** the write, so a session created between the two effects does not survive the reset.
  *Pinned by:* `AccountRecoveryControllerTest.revokesAgainAfterTheResetSoAWindowSessionCannotSurvive`
- [x] **AC-4:** Given an unknown, expired, or already-consumed token, when the reset is submitted, then
  nothing is revoked and the response is the unchanged generic `400 INVALID_OR_EXPIRED_TOKEN`
  (non-enumeration, D-8).
  *Pinned by:* `AccountRecoveryControllerTest.anInvalidTokenRevokesNothingAndKeepsTheGenericRejection`
- [x] **AC-5:** Given a live reset token, when the new `emailForResetToken` read runs, then it returns the
  account's email and the token is **still redeemable afterwards** (the read consumes nothing); an
  expired, consumed, or wrong-purpose token reads empty — the same predicate `resetPassword` enforces.
  *Pinned by:* `CustomerAccountRecoveryIT.emailForResetTokenResolvesTheAccountWithoutConsumingTheToken`,
  `CustomerAccountRecoveryIT.emailForResetTokenIsEmptyForAnExpiredConsumedOrWrongPurposeToken`
- [x] **AC-6:** Given an ACTIVE operator, when an admin suspends it, then that principal's sessions are
  revoked **before** the status transition commits.
  *Pinned by:* `AdminOperatorControllerTest.revokesTheOperatorsSessionsBeforeTheSuspensionCommits`
- [x] **AC-7:** Given the pre-transition revoke fails, when an admin suspends, then the operator is
  **not suspended** — so the admin's retry both suspends and revokes, instead of drawing
  `409 WRONG_STATUS` over an account whose sessions are still live.
  *Pinned by:* `AdminOperatorControllerTest.aFailedRevokeNeverSuspends`
- [x] **AC-8:** Given a successful suspension, when its effects have run, then the sessions are revoked
  **again after** the transition (the existing revoke is kept, not moved).
  *Pinned by:* `AdminOperatorControllerTest.revokesAgainAfterTheSuspensionCommits`
- [x] **AC-9:** Given a target that is unknown or not ACTIVE, or the reinstate/approve/reject
  transitions, when they run, then **nothing is revoked** and every existing status/`code` response is
  unchanged.
  *Pinned by:* `AdminOperatorControllerTest.anUnknownOrNotActiveTargetRevokesNothing`,
  `AdminOperatorControllerTest.reinstateRevokesNothing`
- [x] **AC-10:** Given operators in each status, when `OperatorLifecycle#activeUsername` is called, then
  it answers the username for an ACTIVE one and empty for PENDING / REJECTED / SUSPENDED / unknown —
  the same ACTIVE-only rule the rest of the module resolves by.
  *Pinned by:* `OperatorLifecycleIT.activeUsernameResolvesOnlyAnActiveOperator`
- [x] **AC-11:** Given a signed-in customer erasing their own account, when the request runs, then the
  sessions are revoked before the scrub, again after it, and a failed first revoke leaves the account
  **unscrubbed**.
  *Pinned by:* `MeErasureControllerTest.revokesSessionsBeforeScrubbingTheAccount`,
  `MeErasureControllerTest.revokesAgainAfterTheScrub`,
  `MeErasureControllerTest.aFailedRevokeNeverScrubsTheAccount`
- [x] **AC-12:** Given an admin suspending **itself**, when the request runs, then it is refused
  `409 CANNOT_SUSPEND_SELF` before any read, revoke, or transition — the guard still short-circuits first.
  *Pinned by:* `AdminOperatorControllerTest.selfSuspendIsRefusedBeforeAnyRevoke`

## Non-goals

- **`OperatorCredentialInitializer` stays as it is.** Boot-time runner: no caller to mislead, no retry
  to reject, and no window (nobody can hold a session for a credential the deploy is still stamping).
  Named as out of scope by #357 itself.
- **The two #344 password-change sites are not re-opened.** They already revoke first. They are *not*
  given a trailing revoke here: theirs must spare the calling session, so a second revoke would have to
  dance with `SessionIdentity.rotate` and the pre-rotation keep-id (#344 R-1) — a real risk of deleting
  the caller's own session, for a window the same slice already accepted (#344 R-2). Recorded in the
  Generalization-audit log as a deliberate skip, not an oversight.
- **No `@Transactional` spanning a state change and its session deletes.** #344 D-1's rationale is
  unchanged and now applies to three more sites: the two effects belong to different owners, so the
  annotation would look atomic without being atomic.
- **No new endpoint, path, DTO, status code, error `code`, or rate-limit bucket** — and therefore no
  frontend change.
- **Issue #359 (a concurrent request writing the pre-rotation session id back) is not addressed here.**
  It is about `SessionIdentity.rotate`, which this slice does not touch.

## Behavior-parity ledger (retirement / replacement slices only)

The slice retires no surface, but it changes the observable behavior of three live endpoints — so the
ledger is filled rather than `N/A`, per #344's lesson (its "the calling session stays signed in —
preserved" row hid a real contract change and cost a red CI).

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `POST /api/auth/customer/reset-password` → `204` on success | preserved | unchanged status and empty body |
| `POST /api/auth/customer/reset-password` → `400 INVALID_OR_EXPIRED_TOKEN` for unknown/expired/used tokens, `400 INVALID_REQUEST` for a weak password | preserved | the password validation still runs first; the new pre-read reuses `consume`'s exact predicate, so a token it reads empty is a token `resetPassword` rejects — the response is byte-identical (AC-4) |
| A successful reset revokes every session of the account | preserved **and strengthened** | the same `revokeAll(email)` from the outcome still runs; a second one now precedes the write (AC-1/AC-3) |
| A **failed** revoke returned `500` with the token consumed and the password changed | **changed** | the pre-write revoke fails first, so the token stays redeemable and the retry works (AC-2). A failure in the *trailing* revoke still reports `500` with the change applied — see R-2 |
| `POST /api/admin/operators/{id}/suspend` → `204` / `409 WRONG_STATUS` / `404 NO_SUCH_OPERATOR` / `409 CANNOT_SUSPEND_SELF` | preserved | the self-suspend guard still runs before everything (AC-12); the new pre-read never changes an outcome, it only decides whether there is a principal to revoke early (AC-9) |
| Suspension revokes the operator's sessions | preserved **and strengthened** | the existing post-transition revoke is untouched; a pre-transition one is added (AC-6/AC-8) |
| Reinstate/approve/reject revoke nothing | preserved | the pre-read is called only on the suspend path (AC-9) |
| `POST /api/me/erasure` → always `204`, idempotent | preserved | no new failure path; the scrub is still the only outcome-bearing call |
| Erasure revokes every session of the principal | preserved **and strengthened** | same call, now bracketing the scrub (AC-11) |
| Erasure signs the **caller** out (its own session is deleted too) | preserved | `revokeAll` still passes no keep-id; the first revoke now deletes the caller's row mid-request, which the rest of the request does not depend on — the `SecurityContext` is already loaded, and Spring Session's `save` updates rather than re-inserts a deleted row (R-7) |
| A **failed** revoke returned `500` with the data already scrubbed | **changed** | the scrub is no longer reached (AC-11) |
| An admin/customer sees no new latency class | preserved | one extra indexed point-read per suspend/reset, one extra idempotent `DELETE` batch per call — all on rare, non-hot endpoints |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The pre-read is a TOCTOU**: between reading the principal and making the change, the token can be consumed by a concurrent redeemer, or the operator suspended by a second admin — so we revoke sessions for a change that then fails. | low | low | Accepted **by design**: the failure direction is *over*-revocation (someone is signed out who needn't have been), never under — the same direction `PrincipalSessionRevoker`'s Javadoc already accepts for its non-type-scoped index. In both racing cases the other actor's change wanted those sessions gone anyway. | claude | closed — accepted, and the review sharpened what it costs: for suspend this specifically retires #128's guarantee that a rolled-back transition never signs out a still-ACTIVE operator (F-2). The maintainer saw that case at the D-1 decision point; it is now stated on the method rather than only here |
| R-2 | **The trailing revoke can still fail after the state change** — `500` with the password reset / operator suspended / account scrubbed. No ordering removes this (it is #344 F-3's residual class); only a shared transaction could, and there is none to share. | low | med | Bounded and documented on each method: by then the *pre-existing* sessions are already revoked, so what survives is at most a session created inside the sub-millisecond window. Strictly smaller than today's harm (all sessions survive, permanently). | claude | closed — documented on all three methods; F-1/F-2 tightened the wording where it had drifted into over-claiming |
| R-3 | **Adding a method to a published `api/` port breaks every stub that implements it** — `WebSliceStubs`' anonymous `CustomerAccountRecovery` / `OperatorLifecycle` beans, and any test lambda. A missed one is a compile error at best, a full-suite-only context failure at worst (#122/#127 class). | high | med | Both ports are stubbed as anonymous classes (not lambdas) in exactly one place, `WebSliceStubs`; grep every `implements OperatorLifecycle` / `CustomerAccountRecovery` before compiling, and run the shared web slices (`WebCorsConfigTest`, `RateLimitFilterTest`, `MeSurfaceRoleGateTest`) plus `PayoutModuleTest` at the end of each phase. | claude | closed — it fired as predicted, and the compiler caught all of it: `WebSliceStubs` (both ports) plus the module's own `CustomerAccountServiceTest.FakeTokens` (the *internal* `CustomerAccountTokens` port, which the plan's file list had missed). The fake's `consume` now delegates to its new `accountFor`, so the two predicates cannot drift there either |
| R-4 | **Published-surface regression** — a new method on an `api/` port is a module-contract change that `ModularityTests` / `PublishedSurfacePlacementArchitectureTests` / `ResponsibilitiesArchitectureTests` police. | low | med | Both additions are plain query methods on existing ports returning existing types (`String`, `Optional`), no new class, no new package, no grant change. The structural net runs at the end of every phase. | claude | closed — the whole structural net is green (incl. `ModularityTests`, `PublishedSurfacePlacementArchitectureTests`, `ResponsibilitiesArchitectureTests`, both auth-placement tests) |
| R-5 | **Rate-limit bucket collision in a cached full-suite context** (#127 class): new MockMvc requests share the loopback per-IP budget and `429` only in a full-suite run. | med | high | Every new request in every new/extended web slice carries `SessionLoginSupport.uniqueClientIp()` via the `isolated(...)` helper, matching `OperatorAccountControllerTest`. | claude | closed — the reset path genuinely rides the recovery budget, so this was load-bearing; the full local suite **and** the PR's CI run both pass, which is the only place this class shows up |
| R-6 | Flyway version collision. | none | — | **No migration in this slice**; latest on `main` is `V30` and the only open PRs are Dependabot frontend bumps (checked at intake). | claude | closed — N/A |
| R-7 | **Erasure's revoke-first deletes the caller's own session mid-request**, and something later in the request needs it — or Spring Session re-creates the row on save, resurrecting a session the erasure was meant to kill. | low | med | Nothing after the revoke reads the session: `CurrentCustomer` resolves from the already-loaded `Authentication`, and the response is a bare `204`. `JdbcIndexedSessionRepository` *updates* an existing session on save (0 rows for a deleted one) and only inserts when the session is new, so no resurrection. Pinned end-to-end by the existing `AccountErasureIT` still passing. | claude | closed — `AccountErasureIT` + `MeErasureControllerTest` pass unchanged, and the review's CLAUDE.md lens re-derived the no-resurrection argument independently |
| R-8 | **The two new reads drift from the predicates they mirror** — e.g. a future change to token expiry or to the ACTIVE-only ownership rule updates `consume`/`idByActiveUsername` but not the new read, so the edge revokes the wrong principal or none. | low | med | Each read is written next to the method it mirrors, in the same adapter, with the same named-param constants and the same `NOW()`/status-token source; the module ITs (AC-5, AC-10) assert the predicates agree case by case rather than asserting the SQL. | claude | closed — the reset read is a byte-for-byte copy of `consume`'s predicate in the same adapter and the operator read mirrors `idByActiveUsername`; the module's `FakeTokens` was additionally made to *delegate* to its new read instead of duplicating the predicate, so the fake cannot drift either |
| R-9 | **Error-contract drift** — a new failure path returning a bare body instead of `ProblemDetail`. | low | med | No new error path is added; every new call is a query whose failure propagates to the single `ApiErrorHandler` (`riviera-java-conventions` §6b), and no `switch` arm changes. | claude | closed — `ErrorContractArchitectureTests` green; the review's CLAUDE.md lens confirmed no bespoke error shape was introduced |

## Open questions / Assumptions

_None open._

### Resolved

- **D-1 — Bracket the state change, don't reorder it. (Escalated to the maintainer at the intake grill;
  answered "bracket".)** The issue frames the fix as moving the revoke earlier. The grill found that a
  *pure* reorder introduces, at all three sites, a re-authentication window that does not exist today:
  during it the old password / `ACTIVE` status is still valid, so a login landing in the window creates
  a session the change never revokes — and for suspend there is no admin recovery path afterwards (a
  retry draws `409 WRONG_STATUS` and revokes nothing). Keeping the existing trailing revoke costs one
  idempotent `DELETE` on three rare endpoints and closes it. Diff-wise this is also the smaller change:
  nothing moves, one call is added.
- **D-2 — The suspend pre-read lands on `OperatorLifecycle`, not `OperatorDirectory`** as #357
  suggested. `OperatorDirectory`'s documented conversation is "which operator is this *username*?" for
  the ownership checks; the new read exists solely to serve the admin suspension flow, which is
  `OperatorLifecycle`'s conversation (it already holds `suspend`, `reinstate`, and the two admin work
  queues). It also keeps the edge honest: `AdminOperatorController` gains no second identity port, and
  `OperatorDirectory` stays the single-method functional interface six test fixtures implement as a
  lambda. Recorded as deliberate drift from the issue text.
- **D-3 — The reset uses a resolve-without-consume read, not an "honest partial-success response."**
  #357 offered both. A partial-success response tells the customer their password changed but their
  sessions may not have been revoked, which is neither actionable nor safe; the read makes the failure
  disappear instead of describing it. The read repeats `consume`'s exact predicate, so it can never
  report a principal for a token the write would reject.
- **D-4 — The bcrypt encode is hoisted above the pre-revoke** in `resetPassword`, exactly as #344 F-4
  did for the password-change sites: today it is an argument to `recovery.resetPassword(...)`, so left
  alone it would sit *inside* the revoke→write window at ~80ms and dominate it.
- **Assumption (confirmed at intake):** no in-flight overlap — the only open PRs are Dependabot
  frontend bumps (#332–#341), the previous sibling slice (#344 / PR #358) is merged and closed out at
  `2b1c8ef`, and #357 belongs to no epic checklist.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches session rows, one operator status read, and one
recovery-token read. No `availability(set_id, booking_date)` write path, no booking, no beach map, no
`(set, date)` uniqueness surface.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | It owns the account's lifecycle **state**; "what is this ACTIVE operator's username?" is a read of that state, and only it can answer it |
| M-2 | `customer` | existing | `CustomerAccount` | It owns the recovery tokens and the account email; the edge holds only the opaque digest, so only the module can map digest → account |
| M-3 | *(none — platform edge)* | — | — | All three changed controllers live in the root package `ai.riviera.platform`; session revocation and its ordering are edge machinery (RV-BE-11) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorLifecycle#activeUsername(OperatorId)` — **new method** on an existing port | `OperatorId` (`operator.vocabulary`), `Optional<String>` | the platform edge (`AdminOperatorController`) |
| NI-2 | `customer.api` | `CustomerAccountRecovery#emailForResetToken(String)` — **new method** on an existing port | `Optional<String>` | the platform edge (`AccountRecoveryController`, via `CustomerRecovery`) |

Both are **inbound** ports — the edge calls, the module implements — so they belong in `api/`, never
`spi/` (RV-BE-3b). Neither adds a class, a package, or an `allowedDependencies` grant: both consumers
already depend on the port they extend. `ModularityTests` and
`PublishedSurfacePlacementArchitectureTests` are regression checks here, not design constraints.

**Domain events (id-based payloads, invariant #11)**

`None added or changed.` The revoke stays synchronous and edge-orchestrated — the #128 decision,
re-affirmed by #344, unchanged here.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Order a session revoke around a state change (all three sites) | **none — platform edge** (`ai.riviera.platform`) | Sequencing effects owned by *different* owners is orchestration; `operator`'s Not-My-Job list gives "encoding/verifying credentials + the register/login/approval endpoints" to the edge, and `customer`'s gives it "all login machinery … session"; `PrincipalSessionRevoker`'s Javadoc states neither module may import `org.springframework.session` |
| Answer "what is the ACTIVE operator with this id called?" | `operator` | Job: "Own operator accounts — incl. their **admin-driven lifecycle state**"; the username *is* account identity, and the ACTIVE-only rule is the same one `idByActiveUsername` already applies. Not on any other module's list |
| Answer "which account does this still-redeemable reset token belong to?" | `customer` | Job: owns the account + (S8) the recovery tokens; the module already computes exactly this mapping inside `resetPassword` and returns the email in `ResetPasswordOutcome.Reset`. The edge keeps the raw token and the hashing (RV-BE-11) and never sees the table |
| Store the new password hash / flip the operator status / scrub the PII | `customer` / `operator` (unchanged) | Already theirs; no write path in this slice changes |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no Stripe call, no ledger row, no refund decision.

## Angular — frontend surfaces touched

`N/A — backend-only.` No path, status, DTO, or error `code` changes; nothing the SPA can observe. The
three flows' UI copy ("you have been signed out everywhere") becomes *more* true, not different.

## FE↔BE contract

`N/A — no contract change.` Same three endpoints, same request DTOs, same status codes and `code`
values, same non-enumerating reset rejection.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `DONE — all gates cleared, merged via PR #361`

**Next action:** None. Post-merge there is nothing left in the repo: #357 closes via the PR, it belongs
to no tracking epic, and no finding was deferred to a follow-up issue.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Erasure: bracket the scrub (no port change) | ✅ | `280b97a` |
| 1 — Suspend: `activeUsername` pre-read + bracket the transition | ✅ | `fdf474e` |
| 2 — Reset: resolve-without-consume pre-read + bracket the write | ✅ | `aa8e3ec` |
| 3 — Substrate + close-out | ✅ | `0b2274c` (docs-freshness patches), `2692d56` (review fixes) |

**Gate results.** CI green on the PR head (Backend build+test, Frontend lint+test+build, both CodeQL
analyses). The **full** backend suite was also run locally against a live Docker daemon, so no
`@EnabledIfDockerAvailable` IT skipped — the #344 lesson that "skips cleanly without Docker" can make a
local run *look* green while the assertions that exercise the change never execute.

**Review gate: ran in full** — `/code-review` (the subagent fan-out) over PR #361, five parallel
reviewers (CLAUDE.md/RV-BE bank · shallow bug scan · git-history context · prior-PR comments · code-comment
compliance) with `riviera-review-overlay` layered on, at **high** effort per `pr-gates.md` §1 (the slice
touches authorization). Three findings, all fixed below; the bug scan, the CLAUDE.md audit and the
prior-PR pass returned clean. Note for future slices: the two findings that mattered both came from the
*doc-accuracy* lens, which is now the third slice running (#344 F-1, F-3) where the defect was a Javadoc
claim the code contradicts rather than the code itself.

**Sonar gate: green, and the reported list is genuinely empty** — verified against the API, not the
check conclusion: `new_lines` 166 (so an analysis exists — the #318 false-clean read), `new_bugs` 0,
`new_vulnerabilities` 0, `new_code_smells` 0, `new_duplicated_blocks` 0, `new_duplicated_lines_density`
0.0%, `new_coverage` **100.0%** (bar: ≥80%).

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**`riviera-docs-freshness` run** (phase 3, range `main..HEAD`) — 4 findings, all patched in this PR:

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `CLAUDE.md:176-180` | "#128 … the module flips the status and returns the username, and the edge deletes that principal's `SPRING_SESSION` rows" — present-tense, revoke-after-only | the edge now also revokes *before* the transition, via `activeUsername` | patched (one sentence, covering all three sites) |
| `RESPONSIBILITIES.md:213` | `operator` "Answer **three** things for the rest of the system" | it now answers a fourth: *what is the ACTIVE operator with this id called?* | patched |
| `RESPONSIBILITIES.md:200-203` | the S8 `CustomerAccountRecovery` port's method list | gained the resolve-without-consume reset-token read | patched |
| `docs/runbooks/data-erasure.md:20` | "sessions … **revoked** (`CustomerSessionRevoker`)" | **stale since #128** — the class is `PrincipalSessionRevoker` — and now revoked on both sides of the scrub | patched (both halves) |

Checked and deliberately **not** patched: `ADR-0010:53` names `CustomerSessionRevoker` only as history
("generalized from … in #128"), which stays true; `docs/runbooks/operator-credential-provisioning.md`
describes the #344 password-change ordering, which this slice does not touch, and its "have an admin
suspend the account (which revokes every session)" line is still accurate.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (code-comment lens) | `MyErasureController`'s new Javadoc claimed revoking first "leaves **only** 'nothing happened' or 'signed out, nothing erased'". False as an enumeration: `PrincipalSessionRevoker` deletes session by session with no transaction, so a **partial** revoke is a third outcome. The consequence the sentence was reaching for (every state is retry-recoverable) does hold — it now says that instead. | fixed-in `2692d56` |
| F-2 | review (git-history lens) | `AdminOperatorController` carried #128's sentence "the residual failure direction is over-revocation, **never under**" into a paragraph that makes it false in *both* directions: a `suspend` refused after the pre-revoke signs out a still-ACTIVE operator (#128 guaranteed that could not happen), and a failed *trailing* revoke still leaves the window's sessions. The maintainer was shown the refused-suspend case at the D-1 decision point, so the trade stands; the Javadoc now states both costs and what they buy. | fixed-in `2692d56` |
| F-3 | review (git-history lens) | Plan-doc discipline: every checkbox in this doc was still `- [ ]` while the phase table read ✅ with real commits — the exact "doc doesn't match git reality" pattern #344's own findings register flagged twice (F-6, F-8), and this doc's copy of the self-review line that forbids it was itself unticked. | fixed-in this commit (ACs, phase steps, AC-verification, and self-review all ticked against reality) |
| F-4 | review (git-history lens, observation) | `emailForResetToken` runs on **every** reset POST, so a valid token now costs an extra indexed read plus a revoke round-trip that an invalid one skips — a wider valid-vs-invalid timing differential than before (the #111 review found a real timing oracle on a related surface). **Accepted, not changed:** the oracle there was *email enumeration*, where the attacker supplies a guessable identifier; here the input is a 128-bit random bearer token (invariant #7), so distinguishing "valid" from "invalid" requires already holding a valid one. Constant-timing it would mean issuing a dummy revoke, which is a real side effect for a fake principal. | closed — accepted with rationale |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/MyErasureController.java` — revoke before the scrub;
  Javadoc records the bracket.
- `platform/src/main/java/ai/riviera/platform/AdminOperatorController.java` — pre-read the ACTIVE
  username, revoke before the transition, keep the post-transition revoke.
- `platform/src/main/java/ai/riviera/platform/AccountRecoveryController.java` — hoist the encode,
  pre-read the token's account email, revoke before the consume+write, keep the post-write revoke.
- `platform/src/main/java/ai/riviera/platform/PrincipalSessionRevoker.java` — Javadoc only: state the
  bracket contract on `revokeAll`, where its callers read it (mirrors the #344 note on `revokeAllExcept`).
- `platform/src/main/java/ai/riviera/platform/CustomerRecovery.java` — pass-through for the new
  edge-side read (it owns the raw-token hashing).
- `platform/src/main/java/ai/riviera/platform/operator/api/OperatorLifecycle.java` — **new method**
  `activeUsername`.
- `platform/src/main/java/ai/riviera/platform/operator/application/OperatorRegistrationService.java` —
  implements it (`@Transactional(readOnly = true)`, like the other reads).
- `platform/src/main/java/ai/riviera/platform/operator/application/Operators.java` — internal port:
  `activeUsernameById`.
- `platform/src/main/java/ai/riviera/platform/operator/adapter/out/JdbcOperators.java` — its SQL.
- `platform/src/main/java/ai/riviera/platform/customer/api/CustomerAccountRecovery.java` — **new method**
  `emailForResetToken`.
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountService.java` —
  implements it (pure read, no `@Transactional` write).
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountTokens.java` —
  internal port: `accountFor` (the non-consuming twin of `consume`).
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcCustomerAccountTokens.java` — its SQL.
- `platform/src/test/java/ai/riviera/platform/MeErasureControllerTest.java` — AC-11.
- `platform/src/test/java/ai/riviera/platform/AdminOperatorControllerTest.java` — **new**; AC-6…AC-9, AC-12.
- `platform/src/test/java/ai/riviera/platform/AccountRecoveryControllerTest.java` — **new**; AC-1…AC-4.
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — the two stub ports gain the new methods.
- `platform/src/test/java/ai/riviera/platform/customer/application/CustomerAccountServiceTest.java` —
  `FakeTokens` gains `accountFor`, and its `consume` now delegates to it (found by the compiler, R-3).
- `platform/src/test/java/ai/riviera/platform/operator/OperatorLifecycleIT.java` — AC-10.
- `platform/src/test/java/ai/riviera/platform/customer/CustomerAccountRecoveryIT.java` — AC-5.
- `docs/plans/session-revoke-ordering-remaining-surfaces.md` — this doc.

---

## Phase 0 — Erasure: bracket the scrub

**Files:** Modify `MyErasureController.java:41-47`, `PrincipalSessionRevoker.java` (Javadoc) ·
Test `MeErasureControllerTest.java`

- [x] **Step 1: Write the failing tests** (AC-11)

```java
/** #357: the revoke must run BEFORE the scrub, so a failed revoke cannot leave data erased. */
@Test
void revokesSessionsBeforeScrubbingTheAccount() throws Exception {
    when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT));
    when(erasure.eraseAccount(ACCOUNT)).thenReturn(EraseOutcome.ERASED);

    mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf()))
            .andExpect(status().isNoContent());

    InOrder effects = inOrder(sessionRevoker, erasure);
    effects.verify(sessionRevoker).revokeAll(EMAIL);
    effects.verify(erasure).eraseAccount(ACCOUNT);
}

/** The second half of the bracket: a session created in the window must not outlive the erasure. */
@Test
void revokesAgainAfterTheScrub() throws Exception {
    when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT));
    when(erasure.eraseAccount(ACCOUNT)).thenReturn(EraseOutcome.ERASED);

    mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf()))
            .andExpect(status().isNoContent());

    InOrder effects = inOrder(sessionRevoker, erasure, sessionRevoker);
    effects.verify(sessionRevoker).revokeAll(EMAIL);
    effects.verify(erasure).eraseAccount(ACCOUNT);
    effects.verify(sessionRevoker).revokeAll(EMAIL);
}

@Test
void aFailedRevokeNeverScrubsTheAccount() {
    when(directory.accountFor(EMAIL)).thenReturn(Optional.of(ACCOUNT));
    doThrow(new DataAccessResourceFailureException("connection reset"))
            .when(sessionRevoker).revokeAll(anyString());

    assertThatThrownBy(() -> mvc.perform(post(ERASURE).with(user(EMAIL).roles("CUSTOMER")).with(csrf())))
            .hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

    verify(erasure, never()).eraseAccount(any());
}
```

- [x] **Step 2: Run it, verify it fails** — `gradle test --tests "*MeErasureControllerTest*"`
- [x] **Step 3: Minimal implementation**

```java
@PostMapping(ERASURE_PATH)
ResponseEntity<Void> eraseMyAccount(Authentication authentication) {
    CustomerAccountId accountId = currentCustomer.require(authentication);
    String principal = authentication.getName();
    sessionRevoker.revokeAll(principal);
    erasure.eraseAccount(accountId);
    // Again after the scrub: a login landing in the window above must not outlive the erasure.
    sessionRevoker.revokeAll(principal);
    return ResponseEntity.noContent().build();
}
```

- [x] **Step 4: Run it, verify it passes** — same command, then
  `gradle test --tests "*MeSurfaceRoleGateTest*" --tests "*AdminErasureControllerTest*"`
- [x] **Step 5: Generalization-audit pass** — `grep -rn "revokeAll\|revokeAllExcept" platform/src --include=*.java`;
  record the six sites and the per-site decision in the log below.
- [x] **Step 6: Commit** — `fix(#357): bracket the erasure scrub with the session revoke`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Suspend: the `activeUsername` pre-read

**Files:** Modify `OperatorLifecycle.java`, `OperatorRegistrationService.java`, `Operators.java`,
`JdbcOperators.java`, `AdminOperatorController.java`, `WebSliceStubs.java` ·
Create `AdminOperatorControllerTest.java` · Modify `OperatorLifecycleIT.java`

- [x] **Step 1: Write the failing tests** (AC-6…AC-10, AC-12) — the web slice mocks `OperatorLifecycle`
  + `PrincipalSessionRevoker` and drives `POST /api/admin/operators/{id}/suspend` as an ADMIN; the IT
  asserts `activeUsername` against real Postgres in each status.

```java
@Test
void revokesTheOperatorsSessionsBeforeTheSuspensionCommits() throws Exception {
    when(lifecycle.activeUsername(TARGET)).thenReturn(Optional.of(TARGET_USERNAME));
    when(lifecycle.suspend(TARGET)).thenReturn(new OperatorLifecycleOutcome.Changed(TARGET, TARGET_USERNAME));

    mvc.perform(isolated(post(SUSPEND)).with(user(ADMIN_USERNAME).roles("ADMIN")))
            .andExpect(status().isNoContent());

    InOrder effects = inOrder(sessionRevoker, lifecycle, sessionRevoker);
    effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
    effects.verify(lifecycle).suspend(TARGET);
    effects.verify(sessionRevoker).revokeAll(TARGET_USERNAME);
}

@Test
void aFailedRevokeNeverSuspends() {
    when(lifecycle.activeUsername(TARGET)).thenReturn(Optional.of(TARGET_USERNAME));
    doThrow(new DataAccessResourceFailureException("connection reset"))
            .when(sessionRevoker).revokeAll(anyString());

    assertThatThrownBy(() -> mvc.perform(isolated(post(SUSPEND)).with(user(ADMIN_USERNAME).roles("ADMIN"))))
            .hasRootCauseInstanceOf(DataAccessResourceFailureException.class);

    verify(lifecycle, never()).suspend(any());
}
```

- [x] **Step 2: Run them, verify they fail** — `gradle test --tests "*AdminOperatorControllerTest*"`
  (the IT needs Docker; without a daemon it skips cleanly and CI is the gate for AC-10)
- [x] **Step 3: Minimal implementation**

```java
// OperatorLifecycle (api) — the pre-read
Optional<String> activeUsername(OperatorId operatorId);

// JdbcOperators — a primary-key point lookup, ACTIVE-only like idByActiveUsername
@Override
public Optional<String> activeUsernameById(OperatorId operatorId) {
    return jdbc.sql("SELECT username FROM operator WHERE id = :id AND status = :active")
            .param(ID_PARAM, operatorId.value())
            .param(ACTIVE_PARAM, OperatorStatus.ACTIVE.name())
            .query(String.class)
            .optional();
}

// AdminOperatorController.suspend — revoke first; toResponse(..., true) still revokes after
lifecycle.activeUsername(target).ifPresent(sessionRevoker::revokeAll);
return toResponse(lifecycle.suspend(target), true);
```

- [x] **Step 4: Run, verify pass** — the two classes above, then the shared slices
  (`*WebCorsConfigTest*`, `*RateLimitFilterTest*`, `*PayoutModuleTest*`) for the R-3 stub break.
- [x] **Step 5: Generalization-audit pass** — no new pattern beyond phase 0's; note it.
- [x] **Step 6: Commit** — `fix(#357): revoke an operator's sessions before the suspension commits`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Reset: the resolve-without-consume pre-read

**Files:** Modify `CustomerAccountRecovery.java`, `CustomerAccountService.java`,
`CustomerAccountTokens.java`, `JdbcCustomerAccountTokens.java`, `CustomerRecovery.java`,
`AccountRecoveryController.java`, `WebSliceStubs.java` · Create `AccountRecoveryControllerTest.java` ·
Modify `CustomerAccountRecoveryIT.java`

- [x] **Step 1: Write the failing tests** (AC-1…AC-5)

```java
// AccountRecoveryControllerTest — the edge ordering
@Test
void revokesTheAccountsSessionsBeforeConsumingTheToken() throws Exception {
    when(recovery.emailForResetToken(RAW_TOKEN)).thenReturn(Optional.of(EMAIL));
    when(recovery.resetPassword(eq(RAW_TOKEN), anyString()))
            .thenReturn(new ResetPasswordOutcome.Reset(ACCOUNT, EMAIL));

    mvc.perform(isolated(post(RESET)).contentType(MediaType.APPLICATION_JSON).content(body(RAW_TOKEN, NEW_PASSWORD)))
            .andExpect(status().isNoContent());

    InOrder effects = inOrder(sessionRevoker, recovery, sessionRevoker);
    effects.verify(sessionRevoker).revokeAll(EMAIL);
    effects.verify(recovery).resetPassword(eq(RAW_TOKEN), anyString());
    effects.verify(sessionRevoker).revokeAll(EMAIL);
}

// CustomerAccountRecoveryIT — the read consumes nothing
@Test
void emailForResetTokenResolvesTheAccountWithoutConsumingTheToken() {
    recovery.issuePasswordResetToken(accountId, TOKEN_HASH, clock.instant().plus(Duration.ofHours(1)));

    assertEquals(Optional.of(EMAIL), recovery.emailForResetToken(TOKEN_HASH));
    assertEquals(Optional.of(EMAIL), recovery.emailForResetToken(TOKEN_HASH));
    assertInstanceOf(ResetPasswordOutcome.Reset.class, recovery.resetPassword(TOKEN_HASH, NEW_HASH));
}
```

- [x] **Step 2: Run them, verify they fail** — `gradle test --tests "*AccountRecoveryControllerTest*"`
  and `--tests "*CustomerAccountRecoveryIT*"`
- [x] **Step 3: Minimal implementation**

```java
// JdbcCustomerAccountTokens — consume's predicate, as a pure read (unique index on token_hash)
@Override
public Optional<CustomerAccountId> accountFor(TokenPurpose purpose, String tokenHash) {
    return jdbc.sql("""
            SELECT account_id FROM customer_account_token
            WHERE token_hash = :tokenHash AND purpose = :purpose
              AND consumed_at IS NULL AND expires_at > NOW()
            """)
            .param(TOKEN_HASH, tokenHash)
            .param(PURPOSE, purpose.name())
            .query(Long.class)
            .optional()
            .map(CustomerAccountId::new);
}

// AccountRecoveryController.resetPassword — encode hoisted (D-4), revoke bracketing the write
CustomerPasswords.validate(request.newPassword());
String newPasswordHash = passwordEncoder.encode(request.newPassword());
recovery.emailForResetToken(request.token()).ifPresent(sessionRevoker::revokeAll);
return switch (recovery.resetPassword(request.token(), newPasswordHash)) { … };
```

- [x] **Step 4: Run, verify pass** — the two classes, then `*PasswordResetIT*`, `*RecoveryRateLimitIT*`,
  `*EmailVerificationIT*` and the shared web slices.
- [x] **Step 5: Generalization-audit pass** — confirm the log's six-site table is still complete.
- [x] **Step 6: Commit** — `fix(#357): revoke a customer's sessions before the reset token is consumed`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 3 — Substrate + close-out

- [x] **Step 1:** Structural net + the full backend regression CI needs
      (`*ModularityTests*`, `*PackageShapeArchitectureTests*`, `*PublishedSurfacePlacementArchitectureTests*`,
      `*JdbcOnlyArchitectureTests*`, `*ErrorContractArchitectureTests*`, `*ResponsibilitiesArchitectureTests*`,
      `*OperatorAuthPlacementTests*`, `*CustomerAuthPlacementTests*`, `*DocumentationTests*`).
- [x] **Step 2:** `riviera-docs-freshness` over the diff — at minimum re-check the CLAUDE.md #128/#344
      paragraph (it describes the revoke as following the transition) and `RESPONSIBILITIES.md`'s
      `operator`/`customer` entries; patch what the diff contradicts, in this PR.
- [x] **Step 3:** Open the PR, run the Review gate, then the Sonar gate; finalize the Execution status
      citing `merged via PR #NN` before the merge.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-26 | Plan — inherited from #344's audit | every call site pairing a state change with a session revoke | `grep -rn "revokeAll\|revokeAllExcept" platform/src --include=*.java` | 6 | 3 fixed here (reset, suspend, erasure), 2 already fixed by #344 and deliberately **not** given a trailing revoke (their keep-id/rotation pairing makes it unsafe — see Non-goals), 1 skipped (`OperatorCredentialInitializer`, boot-time) |
| 2026-07-26 | Review round 1 — the F-1/F-2 Javadoc precision fixes (`2692d56`) | statements in the diff that enumerate what a failed revoke can leave behind, or claim a direction it cannot go | `grep -n "leaves only\|both recoverable\|retry recovers from\|never under\|every session that existed" platform/src/main/java/ai/riviera/platform/*.java` | 4 (2 mine, 2 shipped) | Fixed both of mine. The two "every session that existed when the request started is gone" lines are **correct** — each is scoped to a *trailing*-revoke failure, i.e. after a leading revoke that returned successfully (so its delete loop completed in full). `OperatorAccountController:92` (#344, untouched here) carries the same either-or simplification about a partial revoke; left alone deliberately — this PR's Non-goals bar re-opening the #344 sites, and the practical claim there ("the retry recovers") survives partial revocation |
| 2026-07-26 | Phase 0 — the erasure bracket (`280b97a`) | the same six sites, re-run against the new pattern (revoke **both** sides, not just earlier) | `grep -rn "revokeAll\|revokeAllExcept" platform/src/main --include=*.java` | 6 (erasure now 2 calls) | Unchanged from the plan row: phases 1–2 apply the same bracket to suspend + reset. The two `revokeAllExcept` sites keep a single call by design — a second one would have to re-derive the keep-id across `SessionIdentity.rotate` (#344 R-1), risking deletion of the caller's own session for a window #344 already accepted. `OperatorCredentialInitializer` still skipped: boot-time, no caller, no window (nobody holds a session for a credential the deploy is still stamping) |

---

## Acceptance-criteria verification (final)

Every command below is `./gradlew --console=plain test …` from `platform/`, run with a live Docker
daemon so **no `@EnabledIfDockerAvailable` IT skipped**.

- [x] **AC-1…AC-4:** `--tests "*AccountRecoveryControllerTest*"` → PASS (red first: the class did not
      compile until `emailForResetToken` existed).
- [x] **AC-5:** `--tests "*CustomerAccountRecoveryIT*"` → PASS against Testcontainers Postgres.
- [x] **AC-6…AC-9, AC-12:** `--tests "*AdminOperatorControllerTest*"` → PASS (red first: 10 compile
      errors for the missing `activeUsername`).
- [x] **AC-10:** `--tests "*OperatorLifecycleIT*"` → PASS against Testcontainers Postgres.
- [x] **AC-11:** `--tests "*MeErasureControllerTest*"` → PASS (red first: 4 failures — 3 new + the
      existing happy-path test, which now expects two revokes).
- [x] Regression: `*OperatorSuspensionRevocationIT*`, `*PasswordResetIT*`, `*RecoveryRateLimitIT*`,
      `*EmailVerificationIT*`, `*RecoveryMailerFailureIT*`, `*MeSurfaceRoleGateTest*`,
      `*AdminErasureControllerTest*`, `*CustomerAccountServiceTest*` → PASS.
- [x] Structural net (phase 3 step 1) → PASS.
- [x] **The whole backend suite** (`./gradlew test`, ~3.5 min, nothing skipped) → PASS, then the same
      on the PR's CI run.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section justified N/A (no availability write path in scope) — invariant #2.
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; two `api/` port methods added, no package/grant change;
      `ModularityTests` green (invariant #11).
- [x] **Payment/payout** N/A (invariants #5, #8, #9); refund policy untouched (#10).
- [x] Timezone untouched (invariant #6) — the token predicate stays on the DB clock.
- [x] Booking codes untouched (invariant #7); the raw reset token never leaves the edge and is never logged.
- [x] No schema change, so no Flyway migration required (invariant #12).
- [x] **Frontend** N/A — no observable contract change; justified above.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — `/code-review`, the subagent fan-out (five parallel reviewers at
      high effort, the risk class `pr-gates.md` §1 mandates for an authorization slice), *plus*
      `riviera-review-overlay` layered on. Not the degraded mode the last three slices had to use: the
      `code-review` plugin is enabled as of `662eb28`, and the maintainer authorized the subagents.
