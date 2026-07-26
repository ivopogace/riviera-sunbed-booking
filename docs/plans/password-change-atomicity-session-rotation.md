# Password-change atomicity + surviving-session rotation Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a self-service password change fail in the safe direction (never "the hash rotated
but you were told it didn't"), and make the surviving session's cookie value die with the old
credential, so an exfiltrated cookie no longer outlives the change that was made to kill it.

**Architecture:** Two edge-only changes to the two self-service password endpoints
(`OperatorAccountController`, `MyAccountController`). **(1) Ordering, not a transaction** — revoke
the principal's other sessions *before* the credential write, so the only reachable failure state is
over-revocation (a convenience cost) instead of a silent, permanent under-revocation paired with a
misleading error. **(2) Rotate the surviving session id** after a successful write via
`HttpServletRequest#changeSessionId()`, so the cookie value that made the change is retired too.
Both live at the platform edge (RV-BE-11); neither the `operator` nor the `customer` module changes.

**Persistence:** JDBC only (invariant #1). **No migration** — `SPRING_SESSION` (V20) and the
`operator` / `customer_account` credential rows are read/written through existing ports and the
Spring Session repository. No table, column, or constraint changes.

**Source of intent:** GitHub issue **#344** (two deferrals from the #342 / issue #326 review gate).

**Skills consulted:**
- `riviera-sdlc` — routed the gate; recorded the cloud-session branch substitution below.
- `riviera-java-conventions` — §6c one-line-comment rule (the *why* prose moved into Javadoc rather
  than inline blocks), §6 "catch the narrowest type, never swallow" (killed an early best-effort
  `catch (Exception)` around the revoke), §9 test-for-real (the rotation is pinned by a
  Testcontainers IT against real `SPRING_SESSION` rows, not a mock).
- `riviera-modulith` — confirmed the placement: all three touched classes are root-package edge
  machinery, no module package / `api/` port / event / `allowedDependencies` change, so
  `ModularityTests` is a regression check here rather than a design constraint.
- `riviera-plan-doc` — this document's structure.
- `riviera-local-debug` — scoped-test recipe for the session's Gradle runs.
- `postgres` — **N/A**, no migration and no new SQL in the diff (the session deletes go through
  Spring Session's repository, the credential writes through existing module ports).
- `riviera-frontend` / `angular-developer` / `playwright-cli` — **N/A**, no frontend change: the
  `SESSION` cookie is HttpOnly and is rewritten by `SessionRepositoryFilter` on the same response,
  and CSRF is `CookieCsrfTokenRepository`-backed (`SecurityConfig`), so the `XSRF-TOKEN` is not
  session-bound and survives the rotation untouched.

**Branch:** `claude/sdlc-344-vm1s38` — the cloud-session designated remote branch, standing in for
`bugfix/password-change-atomicity-session-rotation` per `riviera-sdlc` §Remote/cloud session addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an operator signed in on two devices, when it changes its password from device
  A, then every *other* session of that principal is gone, device A is still authenticated, **and
  the session id device A presented before the change no longer authenticates** — the response
  carries a new `SESSION` cookie that does.
  *Pinned by:* `OperatorPasswordChangeIT.theSurvivingSessionIsRotatedSoTheOldCookieValueDies`
- [ ] **AC-2:** Given a customer signed in on two devices, when it changes its password from device
  A, then the same holds — others revoked, A still authenticated under a **new** session id, old
  cookie value dead.
  *Pinned by:* `SetPasswordIT.theSurvivingSessionIsRotatedSoTheOldCookieValueDies`
- [ ] **AC-3:** Given the credential write fails (the module port throws), when an operator changes
  its password, then **no credential was rotated** — the current password still authenticates, so
  the operator's natural retry succeeds rather than returning `INVALID_CURRENT_PASSWORD`.
  *Pinned by:* `OperatorAccountControllerTest.aFailedCredentialWriteLeavesTheCurrentPasswordUsable`
- [ ] **AC-4:** Given the session revoke fails, when an operator changes its password, then the
  credential write is **never attempted** (same retry-succeeds property, from the other side).
  *Pinned by:* `OperatorAccountControllerTest.aFailedRevokeNeverRotatesTheCredential`
- [ ] **AC-5:** Given a customer whose credential write fails, when it changes its password, then
  the revoke has already run and the credential is unchanged.
  *Pinned by:* `MyAccountControllerTest.aFailedCredentialWriteLeavesTheCurrentPasswordUsable`
- [ ] **AC-6:** Given a *rejected* change (wrong current password, bootstrap admin, inactive
  account), when it is submitted, then nothing is revoked, nothing is written, **and the caller's
  session id is unchanged** — the rotation is a success-path effect only.
  *Pinned by:* `OperatorAccountControllerTest.aRejectedChangeRotatesNothingIncludingTheSessionId`
- [ ] **AC-7:** Given a request authenticated without a server-side session (the `.with(user(…))`
  harness path, and any future non-session principal), when the password change succeeds, then it
  still returns `204` — rotation is skipped, not an error.
  *Pinned by:* `MyAccountControllerTest.aSessionlessRequestStillSucceedsWithoutRotating`

## Non-goals

- **`AccountRecoveryController.resetPassword` (token-redeem reset) is out of scope.** It has the
  same non-atomic shape, but the revoke-first fix is *not available* to it: the principal's email is
  only known from the `ResetPasswordOutcome.Reset` payload, i.e. after the token has already been
  redeemed and the password written. Fixing it needs a different mechanism (a resolve-without-consume
  read, or an honest partial-success response), which is a separate design call. → follow-up issue.
- **`AdminOperatorController.suspend` and `MyErasureController` are out of scope.** Both call
  `revokeAll` after a state change, so they share the ordering question, but neither has the
  misleading-retry harm this issue is about: suspension's retry is idempotent, and erasure's is
  terminal. Noted in the generalization audit rather than changed.
- **No `@Transactional` spanning the credential write and the session delete.** See D-1 below.
- **No FE change.** The success copy ("Any other devices signed in as you have been signed out")
  stays accurate and becomes *more* true; no new state crosses the wire.
- **No new endpoint, DTO, error code, or rate-limit bucket.**

## Behavior-parity ledger (retirement / replacement slices only)

The slice does not retire a surface, but it *changes* the observable behavior of two live endpoints,
so the ledger is filled rather than `N/A` — this is exactly the "no behavior change" claim the
template says must be verified row by row.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `204` on a successful change | preserved | unchanged status and empty body |
| `400 INVALID_CURRENT_PASSWORD` / `400 INVALID_REQUEST` / `409 BOOTSTRAP_CREDENTIAL_MANAGED` / `409 ACCOUNT_NOT_ACTIVE` | preserved | all guards run before any write, in the same order |
| A rejected change writes nothing and revokes nothing | preserved | guards still precede both effects; AC-6 additionally pins that the session id is untouched |
| Other sessions of the principal are deleted | preserved | same `revokeAllExcept`, only **earlier** in the method |
| The calling session stays signed in | preserved | still spared by `keepSessionId`; AC-1/AC-2 keep asserting it |
| The calling session keeps its **id** | **changed** | now rotated on success (issue #344 part 2). The client is unaffected: `SessionRepositoryFilter` writes the new `SESSION` cookie on the same response, and CSRF is cookie-backed, not session-backed |
| A revoke failure surfaced as `500` **after** the hash had rotated | **changed** | the revoke now precedes the write, so a `500` means the password genuinely did not change |
| SSO-only customer sets a first password with no current-password check | preserved | the F-1 branch in `MyAccountController` is untouched |
| Session-less (`.with(user(…))`) callers succeed | preserved | rotation is null-guarded (AC-7) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Rotating before revoking would delete the caller's own session.** During the request the `SPRING_SESSION` row still carries the *old* id (the filter only persists the new one at commit), so `revokeAllExcept(user, newId)` would find the old id, not match the keep-id, and delete the row — signing the caller out and silently discarding the later `UPDATE … WHERE PRIMARY_ID`. | high if written naively | high | Order is fixed and commented: revoke with the **pre-rotation** id, rotate last. AC-1/AC-2 assert the calling session still works *after* the change, which fails loudly if this is ever reordered. | claude | open |
| R-2 | **Revoke-first opens a sub-millisecond race**: someone who already holds the old password could sign in between the revoke and the write, and that new session survives. | very low | med | Accepted, and strictly smaller than the defect it replaces (a transport blip today leaves the other device alive *permanently* while telling the operator nothing happened). Documented on the method. Anyone in that window already has the password; the change is what stops them from repeating it. | claude | open |
| R-3 | **`changeSessionId()` on a request with no session throws `IllegalStateException`** — `SetPasswordIT` drives the SSO-only case with `.with(user(email))` and no `SESSION` cookie. | high | med | Rotation is guarded by the existing `getSession(false) != null` check, reusing the same helper that computes the keep-id. AC-7 pins it. | claude | open |
| R-4 | **The rotation is asserted through a mock and proves nothing** — a `@WebMvcTest` can only see that `changeSessionId()` was called, not that the old `SPRING_SESSION` row value is dead. | med | high | The AC-1/AC-2 pins are **Testcontainers ITs** driving the real `SessionRepositoryFilter` + real `SPRING_SESSION`: assert the pre-change cookie now `401`s and the response's new cookie `200`s (`riviera-java-conventions` §9). | claude | open |
| R-5 | **Rate-limit bucket collision in the cached full-suite context** (#127 class): new IT methods hitting the change endpoint share the loopback per-IP budget and `429` only in a full-suite run. | med | high | Every new IT request carries `SessionLoginSupport.uniqueClientIp()`, matching the existing methods in both IT classes. | claude | open |
| R-6 | Error-contract drift — a new failure path returning a bare body instead of `ProblemDetail`. | low | med | No new error path is added; a thrown port failure keeps flowing to the single `ApiErrorHandler` (`riviera-java-conventions` §6b). | claude | open |
| R-7 | Flyway version collision. | none | — | **No migration in this slice**; latest on `main` is `V30`, and the only open PRs are Dependabot frontend bumps (checked at intake), so nothing to renumber. | claude | closed — N/A |

## Open questions / Assumptions

- **Assumption:** rotating the session id is transparent to the SPA, because `SessionRepositoryFilter`
  emits the new `SESSION` cookie on the same response and the CSRF token lives in a separate
  `XSRF-TOKEN` cookie (`CookieCsrfTokenRepository.withHttpOnlyFalse()` in `SecurityConfig`), not in
  the session. — *Owner:* claude · *Resolves by:* phase 1 (the AC-1/AC-2 ITs assert the new cookie
  authenticates; a subsequent CSRF-protected call in the same IT would fail if the token were
  session-bound).
- **Open question:** should `AccountRecoveryController.resetPassword` get an equivalent guarantee?
  — *Owner:* claude · *Resolves by:* phase 2 (file the follow-up issue and link it here; explicitly
  a Non-goal for this slice).

### Resolved

- **D-1 — Fix the atomicity by ordering, not by `@Transactional`.** Resolved at plan time.
  A transaction spanning both effects is the obvious-looking fix and is rejected for two reasons.
  (a) *It would not be honest.* The credential write already runs inside the `operator` /
  `customer` module service's own transaction; wrapping the controller would push the edge's
  transaction boundary into module internals, which RV-BE-11's edge/module split rejects — and the
  session deletes go through Spring Session's own repository, whose unit of work the edge does not
  own. An annotation that *looks* atomic without being atomic is worse than no annotation.
  (b) *Ordering is correct regardless of any transaction boundary*, which is the property actually
  wanted here. Revoke-then-write leaves exactly two reachable failure states — "nothing happened"
  and "other sessions signed out, password unchanged" — and in **both** the operator's natural
  retry with their current password succeeds. The reported harm (retry rejected as
  `INVALID_CURRENT_PASSWORD` because the hash silently rotated) becomes unreachable. The cost is
  R-2, accepted above.
- **D-2 — Rotate the surviving session id via `HttpServletRequest#changeSessionId()`**, after a
  successful write and after the revoke (R-1). This is what the issue asks for and what lets the
  runbook and the FE's "any other devices … have been signed out" notice mean what a reader
  naturally takes them to mean. The `docs/runbooks/operator-credential-provisioning.md` caveat
  added by #342 (lines 75–80) is rewritten in phase 2 rather than left contradicting the code.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches only credential storage and server-side
session rows; no `availability(set_id, booking_date)` write path, no booking, no beach map, and no
`(set, date)` uniqueness surface is in scope.

## Spring Modulith — modules, interfaces, events

**Modules touched: none.** All three changed classes (`OperatorAccountController`,
`MyAccountController`, `PrincipalSessionRevoker`) live in the root package `ai.riviera.platform`,
which is not a module — session and credential-verification machinery is deliberately platform-edge
(RV-BE-11, `OperatorAuthPlacementTests`). No `api/`/`spi/`/`events/`/`vocabulary/` type is added,
moved, or renamed; no `allowedDependencies` grant changes; no Event Publication Registry rewrite.
`ModularityTests` is run as a regression check only.

**Cross-module named interfaces (`api/` ports):** none added. The existing calls
(`OperatorProvisioning#setPassword`, `CustomerAccountRecovery#setPassword`, `OperatorAccounts`,
`CustomerAccounts`) are unchanged in signature, semantics, and call count — only in **order**
relative to the session revoke.

**Domain events:** none. The revoke stays synchronous and edge-orchestrated, deliberately not an
event — the #128 decision, unchanged here.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Order the session revoke before the credential write | **none — platform edge** (`ai.riviera.platform`) | Sequencing two effects that belong to *different* owners (Spring Session rows and a module's credential row) is orchestration, and orchestration of login/session machinery is the edge's job per RV-BE-11. `operator`'s Not-My-Job list explicitly rejects encoding, verifying, or invalidating sessions; `customer`'s likewise. |
| Rotate the calling session's id on a successful change | **none — platform edge** | `PrincipalSessionRevoker`'s Javadoc already states neither `customer` nor `operator` may import `org.springframework.session`. Session identity lifecycle is servlet-container/Spring-Session concern, i.e. edge. |
| Store the new password hash | `operator` / `customer` (unchanged) | Already theirs; the modules keep storing an **opaque** hash and are not touched by this slice. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves, no Stripe call, no ledger row.

## Angular — frontend surfaces touched

`N/A — backend-only.` See *Skills consulted* for why the rotation needs no client change.

## FE↔BE contract

`N/A — no contract change.` Same paths, same request DTOs, same status codes, same error `code`
values. The only wire-visible difference is a `Set-Cookie: SESSION=…` on the success response, which
the browser applies automatically and which the SPA never reads (HttpOnly).

## Execution status

> **This section is the session-recovery anchor.** After a context compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` reference file) before acting.

**Stage pointer:** `implement (phase 1)`

**Next action:** Phase 1 — apply the same ordering + rotation to `MyAccountController`, add
`MyAccountControllerTest`, and add the real-session rotation ITs to both IT classes.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Ordering + rotation, operator side (red → green) | ✅ | see phase-0 commit |
| 1 — Same for the customer side + the two rotation ITs | ⏳ | |
| 2 — Runbook correction + follow-up issue for the deferred siblings | | |

**Local verification note:** Docker is absent in this cloud session, so every
`@EnabledIfDockerAvailable` IT (AC-1, AC-2) **skips locally** — the PR's CI run is the gate for
those two. The `@WebMvcTest` classes (AC-3…AC-7) run locally and are green.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — reorder the two
  effects; rotate the surviving session on success.
- `platform/src/main/java/ai/riviera/platform/MyAccountController.java` — the identical twin change.
- `platform/src/main/java/ai/riviera/platform/PrincipalSessionRevoker.java` — Javadoc only: record the
  revoke-before-write ordering contract next to the `keepSessionId` contract it constrains.
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — AC-3, AC-4, AC-6.
- `platform/src/test/java/ai/riviera/platform/MyAccountControllerTest.java` — **new**; AC-5, AC-7.
  The customer twin has no `@WebMvcTest` today (only ITs), which is why its half of #344 had no
  cheap pin.
- `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java` — AC-1.
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — AC-2.
- `docs/runbooks/operator-credential-provisioning.md` — replace the #342 "rotating the surviving
  session id would close this — tracked as a follow-up" caveat with what the code now does.
- `docs/plans/password-change-atomicity-session-rotation.md` — this doc.

---

## Phase 0 — Operator side: revoke-before-write + rotate the survivor

**Files:** Modify `OperatorAccountController.java:105-125` · Test `OperatorAccountControllerTest.java`

- [ ] **Step 1: Write the failing tests** (AC-3, AC-4, AC-6) — a `provisioning.setPassword` stub that
  throws proves the revoke already ran; a `sessionRevoker` stub that throws proves the write never
  did; a rejected change proves the session id is untouched.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*OperatorAccountControllerTest*"`
- [ ] **Step 3: Minimal implementation** — swap the two statements, add the guarded
  `httpRequest.changeSessionId()` after the write.
- [ ] **Step 4: Run it, verify it passes** — same command.
- [ ] **Step 5: Generalization-audit pass** — search every `revokeAll`/`revokeAllExcept` call site.
- [ ] **Step 6: Commit** — `fix(#344): revoke before the credential write and rotate the surviving session`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Customer twin + the real-session rotation proof

**Files:** Modify `MyAccountController.java:81-90` · Create `MyAccountControllerTest.java` ·
Modify `OperatorPasswordChangeIT.java`, `SetPasswordIT.java`

- [ ] **Step 1: Write the failing tests** (AC-1, AC-2, AC-5, AC-7).
- [ ] **Step 2: Run them, verify they fail** — the ITs need Docker; if absent they skip cleanly
  (`@EnabledIfDockerAvailable`) and CI is the real gate for AC-1/AC-2.
- [ ] **Step 3: Apply the same two changes to `MyAccountController`.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit + execution status.**

## Phase 2 — Substrate: runbook correction + the deferred sibling

- [ ] **Step 1:** Rewrite `operator-credential-provisioning.md` lines 75–80 — the caveat now
  describes rotation as shipped, and keeps the honest remainder (a change still cannot evict a
  *device* you no longer control beyond the cookie value; admin suspension remains the blunt tool).
- [ ] **Step 2:** File the follow-up issue for `AccountRecoveryController.resetPassword` and link it
  from the Open-questions entry and the Non-goals list.
- [ ] **Step 3:** Commit + execution status.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-26 | Phase 0 — the revoke/write ordering fix | every call site that pairs a state change with a session revoke | `grep -rn "revokeAll\|revokeAllExcept" platform/src --include=*.java` | 6 (2 password-change, reset, admin-suspend, erasure, boot-time initializer) | **Fix 2, defer 3, skip 1** — see the analysis below. |

**Phase-0 audit detail.** The ordering defect generalizes only where the principal is knowable
*before* the state change; that split decided the actions:

| Site | Principal known upfront? | Harm on a failed revoke | Action |
|---|---|---|---|
| `OperatorAccountController.changePassword` | yes (`authentication.getName()`) | retry rejected as `INVALID_CURRENT_PASSWORD`; other device stays live | **fixed, phase 0** |
| `MyAccountController.setPassword` | yes | identical | **fixed, phase 1** |
| `AccountRecoveryController.resetPassword` | **no** — the email arrives in `ResetPasswordOutcome.Reset`, i.e. only after the token is consumed and the password written | retry rejected as `INVALID_OR_EXPIRED_TOKEN` while the password *did* change | deferred → follow-up issue; revoke-first is structurally unavailable, so it needs a different mechanism |
| `AdminOperatorController.suspend` | **no** — the username arrives in `OperatorLifecycleOutcome.Changed` | worse than a bad message: the admin's retry gets `409 WRONG_STATUS` and the suspended operator's sessions stay alive | deferred → same follow-up issue (a `OperatorDirectory` pre-read would make revoke-first possible) |
| `MyErasureController.erase` | yes | data scrubbed, sessions alive, caller told it failed | deferred → same follow-up issue; a one-line reorder, but erasure is outside this issue's stated scope and widening the diff silently is worse than naming it |
| `OperatorCredentialInitializer` | yes | none — boot-time runner, no caller to mislead, no retry | skip |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `gradle test --tests "*OperatorPasswordChangeIT*"` → PASS (Docker required).
- [ ] **AC-2:** `gradle test --tests "*SetPasswordIT*"` → PASS (Docker required).
- [ ] **AC-3/AC-4/AC-6:** `gradle test --tests "*OperatorAccountControllerTest*"` → PASS.
- [ ] **AC-5/AC-7:** `gradle test --tests "*MyAccountControllerTest*"` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A (no availability write path in scope) — invariant #2.
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no module package changed; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change, so no Flyway migration required (invariant #12).
- [ ] **Frontend** N/A — no client change needed; justified above.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`.
