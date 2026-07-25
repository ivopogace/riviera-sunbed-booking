# Session Revocation Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A live server-side session stops authenticating the moment the account behind it
loses the right to it — an operator suspended by a platform admin, or an operator credential
genuinely rotated — and a sign-out that fails to reach the server never leaves the next visitor
on a shared device silently signed in.

**Architecture:** Revocation is **edge-orchestrated**, not evented: the `operator` module owns the
account **state transition** and returns a typed outcome carrying the principal name; the platform
edge deletes that principal's sessions through Spring Session's principal index. This is the shape
already shipped for tourists (`CustomerSessionRevoker`, S8 #113) and the one `RESPONSIBILITIES.md`
mandates — `operator`'s Job is "the approval **state transitions**", while "the register/login/approval
**endpoints**" and all login machinery are explicitly the platform edge's (RV-BE-11). The single
duplicated revoker is generalized into one `PrincipalSessionRevoker` serving both principal types.

**Persistence:** JDBC only (invariant #1). **No migration** — V29's `operator_status_check` already
permits `SUSPENDED`; this slice only starts *writing* a value the schema has allowed since #115.
Sessions live in `SPRING_SESSION`/`SPRING_SESSION_ATTRIBUTES` (V20), read and deleted through Spring
Session's `FindByIndexNameSessionRepository`, never by hand-written SQL.

**Source of intent:** GitHub issue **#128** (filed off the #109 / S1 review gate). Related shipped
work: #109 (S1 session foundation), #115 (S6 self-registration → admin approval), #113 (S8 customer
recovery — the revoker precedent), #277 (S9 unified auth, which moved `signOut()` to the shared base).

**Skills consulted:** `riviera-sdlc` (routed the gate; the loop + re-entry rule) · `riviera-plan-doc`
(this doc's structure, the ACs-before-phase-0 rule) · `riviera-modulith` (kept revocation OUT of the
`operator` module and off the event spine; one purposeful port, so suspend/reinstate joins the existing
admin-lifecycle conversation rather than adding a fifth port) · `riviera-java-conventions` (sealed
outcome carrying the principal name instead of an exception; no magic status strings; package-private
edge component) · `riviera-frontend` (the revoker's FE mirror: session machinery stays in `core/`, the
admin surface stays in the `admin/` feature folder, no feature→feature import) · `frontend-design` +
`riviera-tailwind` (**deferred to Phase 3/4** — the two new UI surfaces) · `playwright-cli`
(**deferred to Phase 5** — e2e placement + authoring) · `riviera-local-debug` (**deferred to Phase 0**
— first `./gradlew` of the session) · `postgres` (**N/A — no migration**; recorded so review can see
it was considered and why it did not trigger).

**Branch:** `feature/session-revocation` — created before phase 0 (local branch; not a cloud session).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an ACTIVE operator with a live authenticated session, when a platform admin
  suspends that operator, then the operator's account status is `SUSPENDED` **and** every session
  indexed to that principal name is gone from the session store, so the next request on the old
  cookie is unauthenticated. *Pinned by:* `OperatorSuspensionRevocationIT.suspendingAnOperatorKillsItsLiveSession`

- [ ] **AC-2:** Given a suspended operator's now-revoked cookie, when it is replayed against a
  **non-venue-scoped** role-gated surface (`POST /api/venues`), then the response is `401`, not `201`
  — closing the exact hole #128 names (venue-scoped surfaces were already saved by the ACTIVE-only
  ownership lookup). *Pinned by:* `OperatorSuspensionRevocationIT.aRevokedCookieCannotCreateAVenue`

- [ ] **AC-3:** Given an operator account in a status other than `ACTIVE`, when an admin suspends it,
  then the outcome is `WrongStatus` and nothing is written; given no such operator, the outcome is
  `NoSuchOperator`. Neither case revokes any session. *Pinned by:* `OperatorLifecycleIT.suspendRejectsNonActiveAndUnknownOperators`

- [ ] **AC-4:** Given a SUSPENDED operator, when an admin reinstates it, then its status returns to
  `ACTIVE` and it can authenticate again; reinstating a non-SUSPENDED operator yields `WrongStatus`.
  *Pinned by:* `OperatorLifecycleIT.reinstateRestoresASuspendedOperator`

- [ ] **AC-5:** Given an admin authenticated as operator `X`, when `X` suspends **itself**, then the
  request is refused (`409 CANNOT_SUSPEND_SELF`) and `X`'s status and sessions are untouched — the
  platform cannot be locked out of its own admin surface. *Pinned by:* `AdminOperatorControllerTest.anAdminCannotSuspendItself`

- [ ] **AC-6:** Given the bootstrap operator has a stored credential and a live session, when the
  application starts with a **different** `RIVIERA_OPERATOR_PASSWORD`, then its sessions are revoked;
  when it starts with the **same** password (the ordinary redeploy), then its sessions survive.
  *Pinned by:* `OperatorCredentialInitializerTest.revokesSessionsOnlyWhenThePasswordActuallyChanged`

- [ ] **AC-7:** Given a signed-in principal, when `signOut()` receives a `401` from
  `POST /api/auth/logout`, then the result is `signed-out` (the server session is provably gone) and no
  warning is surfaced. *Pinned by:* `session-auth.spec.ts` › `treats a 401 logout as a completed sign-out`

- [ ] **AC-8:** Given a signed-in principal, when `POST /api/auth/logout` fails with a `403` (missing
  XSRF cookie), then the client re-bootstraps via `GET /api/auth/me` and retries the logout **once**;
  if the retry succeeds the result is `signed-out`. *Pinned by:* `session-auth.spec.ts` › `retries a 403 logout once after re-bootstrapping CSRF`

- [ ] **AC-9:** Given a sign-out whose retry also fails (network error / 5xx), then local state is
  cleared anyway **and** the result is `may-persist`, and the shell surfaces a dismissible warning
  offering a retry — the shared-tablet case. *Pinned by:* `session-auth.spec.ts` › `reports may-persist when the retry also fails` and `app.spec.ts` › `surfaces the sign-out warning with a retry action`

- [ ] **AC-10:** Given a platform admin on the admin surface, when it suspends an operator from the
  active-operators list, then the row moves out of the active list without a full page reload and the
  action is reflected on a reload (server-confirmed, not local-only). *Pinned by:* `admin-operators.spec.ts` › `suspends an active operator and reconciles the list`

- [ ] **AC-11:** Given the admin operators surface, when axe runs against it with both lists
  populated, then there are no serious violations and the suspend/reinstate controls are reachable
  and labelled. *Pinned by:* `admin-operators.a11y.spec.ts` and `frontend/e2e/admin-operators.e2e.ts`

## Non-goals

- **Suspending a *customer* account.** No customer suspend state exists (`CustomerAccountCredential`
  has no `active` flag by design); tourists get revocation via password reset + erasure only.
- **An audit trail of who suspended whom and when.** Worth having, but it is a schema change plus a
  new read surface — a separate slice. Recorded as OQ-2 → follow-up issue.
- **Idle/absolute session-timeout tuning.** Session TTL is orthogonal to revocation.
- **Notifying a suspended operator by email.** The mailer is still mocked (`SmtpMailer` deferred → #255).
- **Reworking `/api/admin/operators` (pending list) into a single all-status endpoint.** Additive
  `GET /api/admin/operators/active` instead — see the behavior-parity ledger.
- **Revoking on approve/reject.** A `PENDING` operator cannot authenticate, so it has no sessions to kill.
- **Rotating a non-bootstrap operator's password.** No self-service operator password change exists yet
  (`OperatorProvisioning.setPassword` is called only by the boot-time initializer). When one lands, it
  reuses `PrincipalSessionRevoker` — recorded as OQ-3.

## Behavior-parity ledger

> This slice **renames one published port** and **generalizes one edge component**; it retires no
> user-facing surface. Both rows are internal-structure changes with no behavior delta, listed here
> so review can verify that claim rather than re-derive it.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `operator.api.OperatorApprovals` — `pending()` / `approve()` / `reject()` | **preserved**, renamed → `OperatorLifecycle` | Same three methods, same signatures, same `ApprovalOutcome`, same impl class. Renamed because the port now also carries `suspend`/`reinstate`, and "Approvals" no longer names the conversation (`riviera-modulith`: name ports by purpose; one purposeful conversation beats a fifth port). Callers: `AdminOperatorController` only. |
| `CustomerSessionRevoker.revokeAll(principalName)` | **preserved**, renamed → `PrincipalSessionRevoker` | Identical body and semantics; both existing callers (`AccountRecoveryController` password-reset, `MyErasureController` erasure) keep calling it unchanged. Generalized rather than copied because a second near-identical edge class is a Sonar duplicated-block finding at the merge gate, and the class was never customer-specific — Spring Session's index is keyed by principal name for both principal types. |
| `GET /api/admin/operators` returns the PENDING list | **preserved, untouched** | New capability is additive (`GET /api/admin/operators/active`); the shipped endpoint's path, shape and semantics do not change, so the S6 FE approval flow cannot regress. |
| `SessionAuth.signOut(): Promise<void>` clears local state and swallows all errors | **changed** | Now `Promise<SignOutResult>`. Local state is still **always** cleared (a stuck signed-in UI is worse than a stale cookie), so every existing caller keeps working unchanged if it ignores the return value; the added information is the `may-persist` signal the shell now surfaces. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Admin locks the platform out of itself** by suspending the only admin account | med | high | Edge-level self-suspend guard → `409 CANNOT_SUSPEND_SELF` (AC-5); the guard compares the authenticated principal to the target, which is edge knowledge, not domain | Ivo | open |
| R-2 | **Principal-name collision across principal types** — an operator whose username is literally a customer's email would have both sets of sessions revoked together | low | low | Accepted: the failure direction is **over**-revocation (fail-safe — someone is signed out who needn't be), never under-revocation. Documented on `PrincipalSessionRevoker`; a principal-type-scoped index is a schema change with no security upside | Ivo | open |
| R-3 | **Revoke-on-rotate fires on every deploy**, signing the admin out each release, because `OperatorCredentialInitializer` re-stamps the same password every boot (bcrypt re-salts, so hash equality proves nothing) | high (if naive) | med | Compare the *raw* configured password against the *stored* hash with `PasswordEncoder.matches` — revoke only when it does NOT match and a prior hash existed (AC-6) | Ivo | open |
| R-4 | **Renaming the published `OperatorApprovals` port** breaks a consumer or a doc reference | low | low | Single consumer (`AdminOperatorController`); `ModularityTests` + compile catch any miss; `riviera-docs-freshness` at close-out catches `CLAUDE.md` / `RESPONSIBILITIES.md` / `riviera-modulith` prose | Ivo | open |
| R-5 | **Revocation runs outside the transaction that changed the status** — if the status write rolls back after sessions are deleted, sessions are lost for an account that is still ACTIVE | low | low | Edge orchestration ordering: the app service's `@Transactional` transition **commits first** and returns a typed outcome; the edge revokes only on the success variant. Failure direction is again over-revocation, never a suspended account with a live session | Ivo | open |
| R-6 | **New edge dependency breaks unrelated slice tests** — a new `@Component` at the edge must be stubbed for `@WebMvcTest` (`WebSliceStubs`) and can break `@ApplicationModuleTest`; this has bitten twice (#111 review, memory note) | high | med | Add the bean to `WebSliceStubs` in the same phase as the controller; run `*ModuleTest*` + the web-slice tests before pushing, and treat the full-suite-only failure class as a CI-gate expectation | Ivo | open |
| R-7 | **Sign-out retry loops or double-posts** — a retry after a 403 could hit an already-invalidated session and confuse the result | med | low | Retry is capped at exactly **one** attempt; a `401` on either attempt is treated as definitive success (the session is provably gone), not as a failure (AC-7) | Ivo | open |
| R-8 | Error-contract drift — new endpoints returning ad-hoc `{"error": …}` bodies | low | med | `ApiProblem` for every rejection (`CANNOT_SUSPEND_SELF`, `WRONG_STATUS`, `NO_SUCH_OPERATOR`); no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests`) — `riviera-java-conventions` §6b | Ivo | open |

## Open questions / Assumptions

- **Assumption:** Spring Session's `FindByIndexNameSessionRepository` indexes operator sessions under
  the operator **username** (the value `Authentication#getName()` returns for an operator principal),
  matching how the customer side indexes by email. — *Owner:* Ivo · *Resolves by:* Phase 1 (AC-1 fails
  loudly if wrong; it is asserted against a real Postgres session store, not a mock).
- **OQ-2:** Audit trail for lifecycle transitions (who/when/why). — *Owner:* Ivo · *Resolves by:*
  merge close-out → follow-up issue (explicit non-goal here).
- **OQ-3:** Self-service operator password change (which must revoke). — *Owner:* Ivo · *Resolves by:*
  merge close-out → follow-up issue (explicit non-goal here).

### Resolved

- **OQ-1 (suspend and venue ownership):** **No** — suspension leaves the `operator_venue` rows in
  place. Suspension is reversible and dropping ownership would make reinstate lossy; a suspended
  operator is already denied every venue-scoped surface because `idByActiveUsername` resolves
  ACTIVE-only, so keeping the rows costs no authorization. Documented on `OperatorLifecycle#suspend`.
  Resolved in Phase 0 (`<phase0>`).

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice writes only `operator.status` and deletes
`SPRING_SESSION` rows. It touches no `availability(set_id, booking_date)` row, no booking, no beach
map, and no pool assignment; no code path here can create or release a set hold. The one adjacent
effect is *negative authorization* — a suspended operator stops resolving to an `OperatorId`, so its
venue-scoped writes (including staff tap-to-mark) are denied rather than mis-applied, which
strengthens rather than weakens invariant #2.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | Owns operator account identity and its lifecycle **state transitions** (`RESPONSIBILITIES.md` Job line, extended by #115 to PENDING→ACTIVE/REJECTED). SUSPENDED is the same kind of fact, on the same aggregate. |
| M-2 | *(platform edge — not a module)* | existing | — | Session storage, principal-indexed revocation, the admin endpoints, the role gate and the self-suspend guard. All of it is login/session machinery, explicitly **Not-My-Job** for `operator` (RV-BE-11, pinned by `OperatorAuthPlacementTests`). |

No module gains a dependency; no `allowedDependencies` grant changes. The `operator` module still
imports no Spring Security type.

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorLifecycle` (renamed from `OperatorApprovals`) — adds `suspend(OperatorId)` / `reinstate(OperatorId)` alongside `pending()` / `approve()` / `reject()` | `PendingOperator`, `ApprovalOutcome`, `OperatorLifecycleOutcome`, `OperatorId` | platform edge (`AdminOperatorController`) |
| NI-2 | `operator.api` | `OperatorDirectory` (**unchanged**) — `operatorFor(username)` already returns empty for a non-ACTIVE account | `OperatorId` | `venue`, `booking`, `payout` |
| NI-3 | `operator.api` | `OperatorAccounts` (**unchanged**) — the edge reads the stored hash to detect a genuine rotation | `OperatorCredential` | platform edge |

**New published vocabulary**

| # | Type | Kind | Why `vocabulary/` |
|---|---|---|---|
| V-1 | `OperatorLifecycleOutcome` — sealed: `Changed(OperatorId, String username)` \| `WrongStatus` \| `NoSuchOperator` | sealed outcome | A published outcome type crossing the module seam belongs in `vocabulary/`, not `api/` (issue #95, `PublishedSurfacePlacementArchitectureTests`). It carries the **username** so the edge can revoke without a second round-trip — exactly the shipped `ResetPasswordOutcome.Reset(accountId, email)` shape. |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | **none** | — | — | — | — | — |

**Why no event.** Three reasons, in order of weight: (1) revocation must be **synchronous and
immediate** — an async listener leaves a window in which the suspended operator's cookie still works,
which is the whole bug; (2) the session store is **edge infrastructure, not a module**, so there is no
subscriber module for such an event, and inventing an edge listener would add asynchrony for nothing;
(3) invariant #11 bars **mutable business fields** in event payloads, so an `OperatorSuspended(OperatorId)`
event could not carry the username and its listener would need a second port call to resolve one.
The `api/`-port-plus-typed-outcome route is the synchronous "the caller must know the outcome to
proceed" case the modulith skill describes.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Transition ACTIVE → SUSPENDED and SUSPENDED → ACTIVE | `operator` | `operator` **Job**: owns operator accounts incl. their approval state and the approval **state transitions**. Not on any other module's Not-My-Job list; no other module models operator account state. |
| Report the suspended operator's **username** to the caller | `operator` | Same Job line — it owns account identity. The published `PendingOperator` record already carries `username` across this exact seam, so no new kind of data crosses it. |
| Delete the principal's server-side sessions | **platform edge** | `operator` **Not-My-Job**: "Encoding/verifying credentials + the register/login/approval endpoints … → the platform edge … never the login machinery" (RV-BE-11). A session is login machinery; `operator` must not import `org.springframework.session`. |
| Decide a credential rotation is genuine (`PasswordEncoder.matches`) | **platform edge** | `operator` stores an **opaque** hash and "never encodes or verifies it" (`OperatorAccountService` Javadoc, RV-BE-11). Comparison is crypto → edge. |
| Refuse an admin's self-suspend | **platform edge** | Requires knowing *who is calling*, which is authentication context — edge-only knowledge. Not invariant #13 (that is per-venue ownership); `/api/admin/**` is role-gated and venue-scope-exempt. |
| Gate the new endpoints to ADMIN | **platform edge** | `SecurityConfig`, mirroring the shipped approve/reject matchers. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no ledger row is written or reversed, no Stripe call is
made, and no refund decision is taken. Suspension does not touch a suspended operator's already-accrued
`payout_ledger_entry` rows — payouts owed for bookings already served remain owed (invariant #9's
exactly-once accrual is unaffected, since accrual keys on the booking, not on operator status).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/session-auth.ts` | existing | abstract base service | `signOut()` returns `SignOutResult`; one capped retry | — |
| FE-2 | `core/operator-auth.ts`, `core/customer-auth.ts` | existing | services | Propagate the new return value through their overrides | — |
| FE-3 | `app.ts` + `app.html` | existing | root shell component | New `signOutWarning` signal → dismissible warning banner with a Retry action | — |
| FE-4 | `operator/operator-console.ts`, `venue-admin/venue-editor.ts` | existing | components | Route their `signOut()` result into the same shell warning | — |
| FE-5 | `admin/admin-operators.service.ts` | existing | `@Service()` | Adds `active()`, `suspend(id)`, `reinstate(id)` | — |
| FE-6 | `admin/admin-operators.ts` (+ `.html`/styles) | existing | standalone component | Second signal-backed list (active operators); **server-confirmed reconcile after each action**, not local row removal | — |
| FE-7 | `admin/admin.model.ts` | existing | types | `ActiveOperatorView` mirroring the new response |

**Placement rationale (`riviera-frontend`):** session machinery stays in `core/` (the FE mirror of
RV-BE-11); the admin lists stay in the `admin/` feature folder; the warning banner lives in the root
shell because both principal types sign out from it — no feature→feature import is introduced.

**Design note:** FE-3's warning banner and FE-6's list + destructive action are the two genuinely
*new* visual surfaces. `frontend-design` and `riviera-tailwind` load at Phase 3/4 before either is
written — a destructive, irreversible-looking action (suspend) needs deliberate affordance and a
confirm step, and the warning must read as caution rather than error.

**Reconcile discipline (O6 #176 lesson):** every suspend/reinstate re-reads both lists from the server
rather than mutating the local array — the exact behavior the O6 slice dropped and had to restore.

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs,
Signal Forms if a confirm dialog needs one. No deviations planned.

## FE↔BE contract

- **New endpoints:**
  - `POST /api/admin/operators/{operatorId}/suspend` → `204`; `409 WRONG_STATUS`; `409 CANNOT_SUSPEND_SELF`; `404 NO_SUCH_OPERATOR`. ADMIN-gated.
  - `POST /api/admin/operators/{operatorId}/reinstate` → `204`; `409 WRONG_STATUS`; `404 NO_SUCH_OPERATOR`. ADMIN-gated.
  - `GET /api/admin/operators/active` → `200` `[{ id, username, contactEmail, admin }]`. ADMIN-gated. Additive; the pending list endpoint is untouched.
- **Changed client surface (FE-internal, not HTTP):** `SessionAuth.signOut()` now resolves to
  `'signed-out' | 'may-persist'`.
- **Client typing:** hand-written typed service + `admin.model.ts` interfaces, mirroring the shipped
  `PendingOperatorView`. No `as any`.
- **Errors:** RFC-7807 `ProblemDetail` with a stable `code`, built by `ApiProblem` (invariant: one
  contract, `riviera-java-conventions` §6b).
- **Money/date on the wire:** N/A — no amounts or booking dates cross this contract.

## Execution status

> **This section is the session-recovery anchor.** After a context compaction, in a fresh session, or
> whenever unsure where the work stands: re-read this section (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it records.

**Stage pointer:** `implement — phase 2`

**Next action:** Write the failing `OperatorCredentialInitializerTest` case (AC-6) — revoke only when
`encoder.matches(rawPassword, storedHash)` is false and a prior hash existed — then wire it.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `operator` lifecycle transitions (port rename + suspend/reinstate) | ✅ | `2c2eb93` |
| 1 — Edge: `PrincipalSessionRevoker` + admin suspend/reinstate endpoints + revocation | ✅ | `<phase1>` |
| 2 — Revoke on genuine credential rotation | ⏳ | |
| 3 — Active-operators read + admin FE suspend/reinstate | | |
| 4 — FE robust sign-out (retry + warning) | | |
| 5 — e2e + a11y coverage | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches
*before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

**Backend — `operator` module**
- `operator/api/OperatorLifecycle.java` — **renamed** from `OperatorApprovals.java`; adds `suspend`/`reinstate`
- `operator/vocabulary/OperatorLifecycleOutcome.java` — **new** sealed outcome carrying the username
- `operator/application/OperatorRegistrationService.java` — implements the two new transitions
- `operator/application/Operators.java` — **new** driven-port methods `suspend` / `reinstate` / `activeOperators`
- `operator/adapter/out/JdbcOperators.java` — the SQL for both transitions + the active list

**Backend — platform edge**
- `PrincipalSessionRevoker.java` — **renamed** from `CustomerSessionRevoker.java`, Javadoc generalized
- `AccountRecoveryController.java`, `MyErasureController.java` — call-site rename only
- `AdminOperatorController.java` — `suspend` / `reinstate` / `active` endpoints, self-suspend guard, revocation
- `OperatorCredentialInitializer.java` — genuine-rotation detection + revocation
- `SecurityConfig.java` — three new ADMIN-gated matchers

**Backend — tests**
- `operator/OperatorLifecycleIT.java` — **new** (AC-3, AC-4)
- `OperatorSuspensionRevocationIT.java` — **new** (AC-1, AC-2) — *the replacement for the request-time-suspension assertion `PerOperatorLoginIT` lost in the S1 migration*
- `AdminOperatorControllerTest.java` — **new** (AC-5)
- `OperatorCredentialInitializerTest.java` — extended (AC-6)
- `WebSliceStubs.java` — stub the renamed/new edge beans (R-6)

**Frontend**
- `core/session-auth.ts`, `core/operator-auth.ts`, `core/customer-auth.ts` — `SignOutResult`
- `app.ts` / `app.html` — the warning banner
- `operator/operator-console.ts`, `venue-admin/venue-editor.ts` — route the result
- `admin/admin-operators.service.ts`, `admin/admin-operators.ts`, `admin/admin.model.ts` — the active list + actions
- `core/session-auth.spec.ts`, `app.spec.ts`, `admin/admin-operators.spec.ts`, `admin/admin-operators.a11y.spec.ts`
- `frontend/e2e/admin-operators.e2e.ts` — **new**, CI-safe mocked suite

---

## Phase 0 — `operator` lifecycle transitions

**Files:** Rename `operator/api/OperatorApprovals.java` → `OperatorLifecycle.java` · Create
`operator/vocabulary/OperatorLifecycleOutcome.java` · Modify `operator/application/Operators.java`,
`OperatorRegistrationService.java`, `operator/adapter/out/JdbcOperators.java` · Test
`operator/OperatorLifecycleIT.java`

- [ ] **Step 1: Write the failing test** — `OperatorLifecycleIT` (Testcontainers, real Postgres):
      suspend an ACTIVE operator → `Changed` carrying its username, status is `SUSPENDED`;
      suspend a PENDING/SUSPENDED one → `WrongStatus`, nothing written; suspend an unknown id →
      `NoSuchOperator`; reinstate a SUSPENDED one → `Changed`, status `ACTIVE`; reinstate an ACTIVE
      one → `WrongStatus`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*OperatorLifecycleIT*"` → FAIL (does not compile: no such port method)
- [ ] **Step 3: Minimal implementation** — the sealed outcome, the two port methods, the two guarded
      `UPDATE … WHERE id = :id AND status = :expected` statements (the status guard is in the SQL, so
      the transition is atomic and needs no read-then-write race window), and the `activeOperators()` read.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*OperatorLifecycleIT*"` → PASS
- [ ] **Step 5: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*OperatorAuthPlacementTests*"` → PASS
- [ ] **Step 6: Generalization-audit pass** — search for other call sites of the renamed port and for
      any other place that writes `operator.status`.
- [ ] **Step 7: Commit** — `feat(#128): operator suspend/reinstate lifecycle transitions`
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Edge revocation + admin endpoints

**Files:** Rename `CustomerSessionRevoker.java` → `PrincipalSessionRevoker.java` · Modify
`AccountRecoveryController.java`, `MyErasureController.java`, `AdminOperatorController.java`,
`SecurityConfig.java`, `WebSliceStubs.java` · Test `OperatorSuspensionRevocationIT.java`,
`AdminOperatorControllerTest.java`

- [ ] **Step 1: Write the failing tests** — `OperatorSuspensionRevocationIT` (AC-1, AC-2): log in as an
      operator over the real session store, capture the cookie, suspend via the admin endpoint, then
      assert the cookie no longer authenticates **and** that `POST /api/venues` on it is `401`.
      `AdminOperatorControllerTest` (AC-5): self-suspend → `409 CANNOT_SUSPEND_SELF`, no service call.
- [ ] **Step 2: Run them, verify they fail** — `./gradlew test --tests "*OperatorSuspensionRevocationIT*" --tests "*AdminOperatorControllerTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — rename the revoker + generalize its Javadoc (R-2 note);
      add the three endpoints; guard self-suspend before calling the service; revoke **only** on the
      `Changed` variant, after the transactional transition returns (R-5); add the ADMIN matchers;
      register the bean in `WebSliceStubs` (R-6).
- [ ] **Step 4: Run them, verify they pass** → PASS
- [ ] **Step 5: Regression sweep** — `./gradlew test --tests "*Operator*" --tests "*Auth*" --tests "*Erasure*" --tests "*Recovery*"` (every caller of the renamed revoker)
- [ ] **Step 6: Generalization-audit pass** — any other surface that changes an account's right to a
      session without revoking? (customer erasure ✓ already revokes; customer reset ✓ already revokes;
      operator reject → no sessions possible; record the reasoning.)
- [ ] **Step 7: Commit** — `feat(#128): revoke live sessions when an operator is suspended`
- [ ] **Step 8: Update plan-doc execution status.**

---

## Phase 2 — Revoke on genuine credential rotation

**Files:** Modify `OperatorCredentialInitializer.java` · Test `OperatorCredentialInitializerTest.java`

- [ ] **Step 1: Write the failing test** (AC-6) — same password as the stored hash → `revokeAll` never
      called; different password → `revokeAll(username)` called once; no prior hash (first boot) →
      never called.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*OperatorCredentialInitializerTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — read the stored credential via `OperatorAccounts`, use
      `PasswordEncoder.matches(raw, storedHash)` to distinguish a genuine rotation from the ordinary
      re-stamp (R-3), then `setPassword` and revoke only on a genuine change.
- [ ] **Step 4: Run it, verify it passes** → PASS
- [ ] **Step 5: Generalization-audit pass** — record OQ-3 (self-service operator password change) as
      the one future call site that must reuse this.
- [ ] **Step 6: Commit** — `feat(#128): revoke sessions when the operator credential actually rotates`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Active-operators read + admin FE

> **Skill-routing gate re-runs here** (new area: user-facing FE). Load `frontend-design`,
> `riviera-tailwind`, `angular-developer` + the angular-cli MCP **before** writing the component.

**Files:** Modify `AdminOperatorController.java` (the `active` read), `admin/admin.model.ts`,
`admin/admin-operators.service.ts`, `admin/admin-operators.ts` (+ template/styles) · Test
`admin/admin-operators.spec.ts`, `admin/admin-operators.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-10, AC-11) — suspend reconciles **both** lists from the
      server; a failed suspend surfaces an error and leaves the list unchanged; axe is clean.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- admin-operators`
- [ ] **Step 3: Minimal implementation** — the `active()` read, the two actions, the confirm step for
      the destructive action, the reconcile-after-action discipline.
- [ ] **Step 4: Run them, verify they pass** → PASS
- [ ] **Step 5: Generalization-audit pass** — does any other admin/operator list mutate local state
      instead of reconciling? (the O6 #176 class of bug)
- [ ] **Step 6: Commit** — `feat(#128): admin suspend/reinstate surface`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — FE robust sign-out

**Files:** Modify `core/session-auth.ts`, `core/operator-auth.ts`, `core/customer-auth.ts`, `app.ts`,
`app.html`, `operator/operator-console.ts`, `venue-admin/venue-editor.ts` · Test
`core/session-auth.spec.ts`, `core/operator-auth.spec.ts`, `app.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-7, AC-8, AC-9) — the three logout outcomes and the
      shell's warning + retry.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- session-auth app`
- [ ] **Step 3: Minimal implementation** — `SignOutResult`; treat `401` as definitive success; on any
      other failure re-bootstrap via `/me` and retry **once** (R-7); always clear local state; surface
      the warning from the shell.
- [ ] **Step 4: Run them, verify they pass** → PASS
- [ ] **Step 5: Generalization-audit pass** — every `signOut()` call site routes its result somewhere
      (or deliberately ignores it, with a reason).
- [ ] **Step 6: Commit** — `feat(#128): surface a sign-out that may not have reached the server`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — e2e + a11y

> **Skill-routing gate re-runs here.** Load `playwright-cli` before authoring the spec; place it per
> `riviera-review-overlay` RV-FE-E2E (CI-safe mocked suite → `frontend/e2e/`).

**Files:** Create `frontend/e2e/admin-operators.e2e.ts` · Extend an existing auth e2e for the
sign-out-warning path

- [ ] **Step 1: Author the specs** against mocked routes (`page.route`), using the shared
      `expectNoSeriousAxeViolations` policy.
- [ ] **Step 2: Run** — `npm run test:e2e` (Windows: `npm run test:e2e:a11y` per the memory note) → PASS
- [ ] **Step 3: Commit** — `test(#128): e2e for admin suspend and sign-out failure`
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-25 | Phase 1 — revocation wired to its first caller | Any other surface that changes an account's right to its existing sessions without revoking them | `grep -rn "revokeAll" src/main/`, `grep -rn "setPassword\|resetPassword\|erase(" src/main/java/ai/riviera/platform/*.java` | 4 right-changing surfaces; 3 already revoked (customer reset, customer erasure, operator suspend). **1 gap: `MyAccountController.setPassword`** — the S8 authenticated password change left every other session of that account alive | **Fixed in this phase.** Same bug class as the issue's own "password rotation" clause, so in scope rather than creep. Added `revokeAllExcept(principal, keepSessionId)` and called it after the write: every *other* session dies, the caller's own survives (signing you out of the device doing the change is bad UX and is not what the OWASP guidance asks). Pinned by `SetPasswordIT.changingThePasswordRevokesEveryOtherSessionButKeepsTheCurrentOne` |
| 2026-07-25 | Phase 0 — new guarded-transition pattern | Any other writer of `operator.status`, and any consumer of the renamed port | `grep -rn "UPDATE operator SET status" src/main/`, `grep -rln "OperatorLifecycle" src/`, `grep -rn "OperatorStatus\." src/main/ \| grep -v adapter/out` | 2 writers (both the adapter's guarded transitions), 3 main + 3 test consumers, **0** status tokens outside the module | No further change — both writers already carry the `WHERE status = :expected` guard, so no unguarded transition exists to generalize. The rename swept `PayoutModuleTest` (`@MockitoBean`) and `WebSliceStubs` in the same commit, pre-empting the R-6 full-suite-only breakage. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2:** `./gradlew test --tests "*OperatorSuspensionRevocationIT*"` → PASS. Verified at `<sha>`.
- [ ] **AC-3 / AC-4:** `./gradlew test --tests "*OperatorLifecycleIT*"` → PASS. Verified at `<sha>`.
- [ ] **AC-5:** `./gradlew test --tests "*AdminOperatorControllerTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-6:** `./gradlew test --tests "*OperatorCredentialInitializerTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-7 / AC-8 / AC-9:** `npm test -- session-auth app` → PASS. Verified at `<sha>`.
- [ ] **AC-10 / AC-11:** `npm test -- admin-operators` + `npm run test:e2e` → PASS. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section justified N/A with reasoning (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no Spring
      Security or `org.springframework.session` type inside `operator` (`OperatorAuthPlacementTests`).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: no new time arithmetic introduced (invariant #6).
- [ ] Booking codes: not touched; nothing new logged (invariant #7).
- [ ] **No Flyway migration needed** — verified V29 already permits `SUSPENDED` (invariant #12).
- [ ] **Per-venue authorization (invariant #13)** unchanged: no new venue-scoped surface; the new
      endpoints are `/api/admin/**`, role-gated and venue-scope-exempt.
- [ ] **Frontend** standards met; no `as any` on the contract; reconcile-after-action honored.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
