# PENDING Operators Get the Full Console Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A freshly-registered (`PENDING`) operator signs in (auto-signed-in straight from
registration), uses every operator-console surface including creating a venue it owns, while
`SUSPENDED`/`REJECTED` stay locked out and the #693 tourist-visibility fence stays ACTIVE-only.

**Architecture:** The single `ACTIVE` predicate is split into three explicit sets, each at its
owner: a **may-authenticate** set `{ACTIVE, PENDING}` at the platform edge (login policy,
RV-BE-11), a **may-operate** set `{ACTIVE, PENDING}` inside `operator`'s ownership resolution
(`OperatorDirectory`), and the untouched **tourist-visible** set `{ACTIVE}` (`VenueVisibility`,
#693). To express the sets, `OperatorStatus` is promoted from `operator/domain` to
`operator/vocabulary` (superseding `OperatorAccount`'s "must not cross the seam" note — the edge
now genuinely needs the token for login policy and the wire principal). Because PENDING can now
hold sessions, **reject** gets the same session-revocation bracket suspend has (#357).

**Persistence:** JDBC only (invariant #1). No schema change — `operator.status` (V29 CHECK) and
`operator_venue` already carry everything; only SQL predicates change. No Flyway migration.

**Source of intent:** issue #694 (parent epic #573, scope A; blocker #693 merged via PR #696).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced the
reject-revocation hole and the third gate `OperatorAccountController` ACCOUNT_NOT_ACTIVE) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger on the register flow and
the may-authenticate/may-operate/tourist-visible three-set split into ACs) · `tdd` (each phase
red-green on ITs before wiring) · `riviera-review-overlay` (review gate — at ready-for-review) ·
`riviera-docs-freshness` (ran over the slice at close-out — see Execution status) ·
`riviera-modulith` (OperatorStatus belongs in `vocabulary/` once published; ports stay in `api/`;
no new module dependency) · `riviera-java-conventions` (records, typed outcomes —
`Rejected(username)` mirrors `Changed`; EnumSet constants over magic strings; §6b error contract
unchanged) · `codebase-design` (one status field on `OperatorCredential` replacing the `active`
boolean — callers derive, one fact one home; no new port where a parameter widens an existing
one) · `domain-modeling` (CONTEXT.md glossary rows for the three sets; no ADR — the decision is
the epic's, reversible, recorded in #573) · `riviera-frontend` (banner lives in `operator/`,
auth flow stays in `auth/` + `core/`; no new cross-feature import) · `angular-developer` +
angular-cli MCP (v22 signal APIs for the banner + auto-sign-in flow) · `riviera-tailwind`
(banner styled with tokens, no new .scss) · `playwright-cli` (mocked-suite e2e rewrite of the
registration flow).

**Branch:** `claude/sdlc-694-8f5esm` (cloud session — the designated remote branch stands in
for `feature/pending-operator-console` per the riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `PENDING` operator with a credential, when it authenticates at the
  operator login, then a session is established. *Pinned by:*
  `PerOperatorLoginIT.aPendingOperatorCanLogIn`
- [ ] **AC-2:** Given a `SUSPENDED` operator and a `REJECTED` operator, when each attempts to
  authenticate, then both are refused with the one generic 401. *Pinned by:*
  `PerOperatorLoginIT.aSuspendedOperatorCannotLogIn` (existing) +
  `PerOperatorLoginIT.aRejectedOperatorCannotLogIn` (new)
- [ ] **AC-3:** Given a fresh username and a duplicate username, when each registers, then both
  receive the byte-identical session-less `202 {"status":"PENDING"}` (D-8). *Pinned by:*
  `OperatorRegistrationIT.duplicateRegistrationIsIndistinguishable` (existing, must stay green)
- [ ] **AC-4:** Given a `PENDING` operator, when it creates a venue, then the ownership mapping
  resolves for it: the venue lists under `GET /api/venues/mine` and every console read/write on
  that venue passes the invariant-#13 check. *Pinned by:*
  `PendingOperatorConsoleIT.aPendingOperatorCreatesAndWorksItsOwnVenue`
- [ ] **AC-5:** Given a `SUSPENDED` or `REJECTED` operator, when ownership is resolved
  (`OperatorDirectory.operatorFor`), then it resolves to empty. *Pinned by:*
  `OperatorOwnershipIT.operatorForRejectsUnknownSuspendedAndRejectedUsernames`
- [ ] **AC-6:** Given a `PENDING` operator with a live session, when an admin rejects it, then
  the session is revoked (bracketed, #357 shape). *Pinned by:*
  `OperatorRejectionRevocationIT.rejectingAPendingOperatorKillsItsLiveSession`
- [ ] **AC-7:** Given a session established while `PENDING` and the operator approved later,
  when an admin suspends it, then that session is revoked (#128 regression). *Pinned by:*
  `OperatorRejectionRevocationIT.aSessionEstablishedWhilePendingIsRevokedBySuspensionAfterApproval`
- [ ] **AC-8:** Given a venue created by a `PENDING` operator, when tourists list/read venues or
  try to book its sets, then the venue is absent/404/refused until approval flips it live
  (#693 fence exercised end-to-end). *Pinned by:*
  `PendingOperatorConsoleIT.aPendingOperatorsVenueStaysHiddenFromTouristsUntilApproval`
- [ ] **AC-9:** Given a signed-in operator, when the edge serves `/api/auth/me` or the login
  response, then the principal carries `operatorStatus` (`PENDING`/`ACTIVE`; null for
  customers). *Pinned by:* `AuthSessionIT.operatorPrincipalCarriesItsLifecycleStatus`
- [ ] **AC-10:** Given a successful registration `202`, when the frontend receives it, then it
  auto-signs-in with the just-entered credentials and lands in the operator console; a
  duplicate-username registration surfaces as a normal failed sign-in. *Pinned by:*
  `auth-page.spec.ts` ("auto-signs in after operator registration", "shows the sign-in error
  when the auto-sign-in is refused")
- [ ] **AC-11:** Given a `PENDING` principal in the console, when the operator home or a venue
  console renders, then a pending-approval notice is shown (and absent for `ACTIVE`). *Pinned
  by:* `operator-home.spec.ts` + `pending-approval-banner.spec.ts` (+ a11y spec)
- [ ] **AC-12:** `ModularityTests`, `JdbcOnlyArchitectureTests`,
  `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests` stay green.
  *Pinned by:* the structural net itself.

## Non-goals

- No change to the #693 fence predicate (`VenueVisibility` stays ACTIVE-only) or to
  sold-booking paths.
- No change to registration's backend contract (the `202` body, timing posture, or
  session-lessness — D-8).
- No change to commission handling (#692 shipped it), payout math, or any money path.
- No admin-console change beyond the reject revocation: the accounts list still shows only
  ACTIVE/SUSPENDED (PENDING lives in the approval queue), and suspend still targets ACTIVE only.
- No approval-mail rewording (done in #693) and no new mail on rejection.
- No native-app or SSO work; the operator login remains username/password.

## Behavior-parity ledger (retirement / replacement slices only)

The register flow's post-`202` behavior is replaced (the "submitted for approval" terminal card
retires); operator sign-in gains a case. Backend registration is untouched.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `202` → `submittedForApproval` card (`auth-pending` testId) with back-to-sign-in button | changed | replaced by auto-sign-in with the just-entered credentials → navigate via the existing `operatorLandingRoute` helper; the card remains only as the fallback if the auto-sign-in errors for a non-credential reason |
| Form fields cleared after `202` | preserved | cleared after the auto-sign-in attempt is issued (credentials read into locals first) |
| Duplicate username → same `202` → same card (indistinguishable) | changed | same `202`, then the auto-sign-in fails (wrong password for the existing account) → the normal failed-sign-in error; no new oracle — sign-in was already publicly attemptable (settled at intake, #694) |
| Register validation errors (password policy, missing fields) rendered on the card | preserved | untouched — validation happens before the `202` path |
| PENDING operator manually signing in later → generic 401 | changed | signs in successfully (AC-1); the "cannot sign in until approved" copy in the e2e/mocks retires |
| Approved operator sign-in → console landing | preserved | untouched path (`operatorLandingRoute`) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Widening ownership resolution accidentally widens the #693 tourist fence (both live in `JdbcOperators`) | low | high | fence SQL (`hasActiveOwner`/`venuesWithActiveOwner`) untouched; `OperatorVenueVisibilityIT` + `VenueCatalogVisibilityIT` must stay green in the same phase | session | open |
| R-2 | A REJECTED operator keeps console access through a session established while PENDING | med | high | reject gets the #357 revocation bracket; `OperatorRejectionRevocationIT` (AC-6) | session | open |
| R-3 | D-8 regression: register becomes distinguishable (timing/body/session) | low | high | zero backend change to `/register`; auto-sign-in is frontend-only; existing `duplicateRegistrationIsIndistinguishable` pins it | session | open |
| R-4 | `OperatorCredential` shape change (`active` → `status`) ripples through edge + fixtures unevenly, leaving a caller deriving the old ACTIVE-only meaning | med | med | change the record field in one commit; compiler-driven sweep of every `active()` caller; grep recorded in the generalization log | session | open |
| R-5 | Invariant #13 (BOLA): a PENDING operator must reach only *its own* venue | low | high | `assertOwns` path unchanged — only the username→id resolution set widens; `CrossVenueDenialIT` + `OperatorOwnershipIT` stay green | session | open |
| R-6 | Per-status behavior hiding elsewhere behind `active()`/`ACTIVE` literals (a fourth gate the grill missed) | med | med | generalization audit: enumerate every `OperatorStatus.ACTIVE`/`active()` consumer by mechanism (grep command in the log), judge each | session | open |
| R-7 | Mocked e2e suite drifts from the new flow (register spec asserts the retired pending card) | high | low | rewrite `operator-registration.e2e.ts` in the same slice (phase 6) | session | open |
| R-8 | New wire field `operatorStatus` breaks the FE `AuthPrincipal` restore path or customer flows | low | med | field optional/nullable on both sides; customer paths never read it; unit specs on the mirror | session | open |

## Open questions / Assumptions

### Resolved

- **Pending banner + placement:** maintainer approved (2026-08-17, AskUserQuestion in-session)
  the banner on the operator home **and** the console shell, with `operator-console.scss`'s
  migrate-on-touch **deferred** to follow-up issue #698 per the `riviera-tailwind` deferral rule.
- **`OperatorStatus` promoted to `vocabulary/`** superseding `OperatorAccount`'s "must not cross
  the seam" note (rationale sentence updated, wire boolean kept) — shipped in phase 1 (`a0d977b`).
- **Password change joins the login set** (a signed-in PENDING operator can rotate its own
  credential) — shipped in phase 2 (`4229861`, `allowsAPendingAccountToChangeItsPassword`).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path to `availability(set_id, booking_date)` is
touched: the slice changes who may authenticate/resolve ownership, not what a session does to
sets. The booking reserve path is touched only by regression assertions (the #693 fence check
already in place). `PendingOperatorConsoleIT` exercises console *reads* of availability
surfaces, no new writers.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `operator` | existing | `Operator` | owns account lifecycle state + the ownership mapping + the resolution answers (`RESPONSIBILITIES.md` §`operator` Job) |
| M-2 | platform edge (root, not a module) | existing | — | owns login policy (the may-authenticate set), the wire principal, and session revocation (RV-BE-11) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorAccounts#findByUsername` — unchanged signature, `OperatorCredential` gains `status` (drops `active`) | `OperatorCredential`, `OperatorStatus` (promoted to `operator.vocabulary`) | edge (`OperatorUserDetailsService`, `AuthController`) |
| NI-2 | `operator.api` | `OperatorDirectory#operatorFor` — unchanged signature, resolution set widens to `{ACTIVE, PENDING}` | `OperatorId` | edge (`CurrentOperator`) |
| NI-3 | `operator.api` | `OperatorLifecycle` — `activeUsername(OperatorId)` generalizes to `usernameInStatus(OperatorId, OperatorStatus)` so the reject bracket can pre-read a PENDING username | `OperatorStatus`, `ApprovalOutcome.Rejected` gains `username` | edge (`AdminOperatorController`) |
| NI-4 | `operator.api` | `VenueVisibility` — **untouched** (the #693 fence stays ACTIVE-only) | `VenueRef` | `venue`, `booking` |

**Domain events (id-based payloads, invariant #11)**

None touched — the slice publishes no events and changes no listener. (The five-event inventory
is unchanged.)

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The may-authenticate set `{ACTIVE, PENDING}` | platform edge (`OperatorUserDetailsService`) | edge Job: login machinery (RV-BE-11); `operator` Not-My-Job: "never the login machinery" — the module reports status, the edge decides who signs in |
| The may-operate resolution set `{ACTIVE, PENDING}` (`operatorFor`) | `operator` | `operator` Job: "does this operator own this venue?" — the resolution answer is the module's; no other module claims it |
| Tourist-visible set `{ACTIVE}` (`VenueVisibility`) | `operator` (unchanged) | #693's one home of the visibility rule; deliberately NOT widened |
| Publishing the status token (`OperatorStatus` → `vocabulary/`) | `operator` | typed enum published in the vocabulary surface per invariant #11/#95; the transitions stay module-internal |
| Reject/suspend session revocation bracket | platform edge (`AdminOperatorController` + `PrincipalSessionRevoker`) | `operator` Not-My-Job: "invalidating live sessions → the platform edge"; module reports the transition + username |
| `operatorStatus` on the wire principal | platform edge (`AuthController`) | edge owns the wire principal shape; module supplies the fact via `OperatorAccounts` |
| Pending-approval banner | frontend `operator/` feature (+ `core/` auth state) | FE mirror of the console; auth state is `core/`'s (riviera-frontend taxonomy) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The payouts console tab is only exercised as a read by
`PendingOperatorConsoleIT`; no money moves, no rate, no ledger change.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/auth-page.ts` | existing | standalone component | signals; auto-sign-in continuation after register | existing template-driven model signal |
| FE-2 | `core/session-auth.ts` + `core/operator-auth.ts` | existing | services | `AuthPrincipal` gains `operatorStatus?`; exposed as a computed signal | — |
| FE-3 | `operator/pending-approval-banner.ts` | new | standalone component | `input()` status / computed from auth state | — |
| FE-4 | `operator/operator-home.ts` + the console shell | existing | standalone components | render FE-3 when status is `PENDING` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. Banner styled with Tailwind on the `--riv-*` tokens (porcelain console theme); no new
`.scss`.

## FE↔BE contract

- **Changed endpoint shapes:** `POST /api/auth/operator/login` and `GET /api/auth/me` —
  `PrincipalResponse` gains `operatorStatus: "PENDING" | "ACTIVE" | null` (null for customer
  principals; SUSPENDED/REJECTED cannot hold sessions so never appear). No path, status code,
  or error-contract change (§6b untouched).
- **Client typing:** hand-written `AuthPrincipal` interface in `core/session-auth.ts` gains the
  optional field; no `as any`.
- **Money/date on the wire:** N/A — none in scope.

## Execution status

**Stage pointer:** implement (phase 7)

**Next action:** phase 7 — docs close-out (RESPONSIBILITIES §operator, CONTEXT.md) + gates

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | 7947475 (PR #697 draft) |
| 1 — status published + may-authenticate set at the edge | ✅ | (this commit) |
| 2 — ownership resolves for the may-operate set; console end-to-end | ✅ | (this commit) |
| 3 — reject revocation bracket + #128 regressions | ✅ | (this commit) |
| 4 — `operatorStatus` on the wire principal | ✅ | (this commit) |
| 5 — FE auto-sign-in + pending banner | ✅ | (this commit) |
| 6 — mocked e2e rewrite | ✅ | (this commit) |
| 7 — docs close-out (RESPONSIBILITIES/CONTEXT/Javadoc) + gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (hygiene, run 32068244247) | plan doc's File structure omitted three phase-1 test paths | fixed-in-`1787746` |
| F-2 | CI (backend, run 32068351427) | `OperatorApprovalIT.approveEnablesLogin` still pinned the retired PENDING-cannot-log-in contract — scoped runs missed it; swept the test tree for sibling assertions (none) | fixed-in-`4229861` |
| F-3 | CI (frontend, run 32070791451) | phase-5 push went out with the OLD mocked e2e specs (4 failures: registration, unified-auth register, both suspension specs' seed) — the rewrite was already planned as phase 6; sequencing miss, not a new defect | fixed-in-phase-6 commit |

---

## File structure

- `docs/plans/pending-operator-console.md` — this plan
- `platform/src/main/java/ai/riviera/platform/operator/domain/OperatorStatus.java` — deleted (promoted)
- `platform/src/main/java/ai/riviera/platform/operator/vocabulary/OperatorStatus.java` — the promoted published status enum
- `platform/src/main/java/ai/riviera/platform/operator/vocabulary/OperatorCredential.java` — `active` boolean → `OperatorStatus status`
- `platform/src/main/java/ai/riviera/platform/operator/vocabulary/ApprovalOutcome.java` — `Rejected` gains `username`
- `platform/src/main/java/ai/riviera/platform/operator/vocabulary/OperatorAccount.java` — Javadoc rationale update only
- `platform/src/main/java/ai/riviera/platform/operator/api/OperatorAccounts.java` — Javadoc (status-bearing credential)
- `platform/src/main/java/ai/riviera/platform/operator/api/OperatorDirectory.java` — Javadoc (may-operate set)
- `platform/src/main/java/ai/riviera/platform/operator/api/OperatorLifecycle.java` — `activeUsername` → `usernameInStatus`
- `platform/src/main/java/ai/riviera/platform/operator/application/OperatorService.java` — resolution via the may-operate set
- `platform/src/main/java/ai/riviera/platform/operator/application/OperatorRegistrationService.java` — `usernameInStatus` replaces `activeUsername`
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — lifecycle stub follows the port signature
- `platform/src/main/java/ai/riviera/platform/operator/application/Operators.java` — repository port updates
- `platform/src/main/java/ai/riviera/platform/operator/adapter/out/JdbcOperators.java` — SQL predicate changes + `RETURNING username` on reject
- `platform/src/main/java/ai/riviera/platform/OperatorUserDetailsService.java` — the may-authenticate set
- `platform/src/main/java/ai/riviera/platform/AuthController.java` — `operatorStatus` on `PrincipalResponse`
- `platform/src/main/java/ai/riviera/platform/AdminOperatorController.java` — reject revocation bracket
- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — password change joins the may-operate set
- `platform/src/main/java/ai/riviera/platform/shared/CurrentOperator.java` — Javadoc + denial message follow the may-operate set
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — create-comment wording (any resolvable operator may create)
- `platform/src/test/java/ai/riviera/platform/OperatorApprovalIT.java` — approve test repurposed: login works on both sides of approval
- `platform/src/test/java/ai/riviera/platform/PerOperatorLoginIT.java` — AC-1/AC-2
- `platform/src/test/java/ai/riviera/platform/OperatorRegistrationIT.java` — post-#694 meaning of registered-then-sign-in
- `platform/src/test/java/ai/riviera/platform/PendingOperatorConsoleIT.java` — new: AC-4/AC-8 end-to-end
- `platform/src/test/java/ai/riviera/platform/OperatorRejectionRevocationIT.java` — new: AC-6/AC-7
- `platform/src/test/java/ai/riviera/platform/OperatorSuspensionRevocationIT.java` — regression additions if any assertions shift
- `platform/src/test/java/ai/riviera/platform/AuthSessionIT.java` — AC-9
- `platform/src/test/java/ai/riviera/platform/CustomerLoginIT.java` — customer principal carries no `operatorStatus`
- `platform/src/test/java/ai/riviera/platform/AdminOperatorControllerTest.java` — reject-path unit updates
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — credential-shape updates (status-bearing record)
- `platform/src/test/java/ai/riviera/platform/OperatorCredentialInitializerTest.java` — credential-shape updates (status-bearing record)
- `platform/src/test/java/ai/riviera/platform/operator/OperatorAccountProvisioningIT.java` — status-token asserts replace the `active` flag
- `platform/src/test/java/ai/riviera/platform/operator/OperatorOwnershipIT.java` — AC-5
- `platform/src/test/java/ai/riviera/platform/operator/OperatorLifecycleIT.java` — `usernameInStatus` coverage
- `platform/src/test/java/ai/riviera/platform/operator/**` — any fixture touched by the credential shape
- `platform/src/test/java/ai/riviera/platform/OwnershipFixtures.java` — status-bearing fixtures
- `frontend/src/app/core/session-auth.ts` — `AuthPrincipal.operatorStatus?`
- `frontend/src/app/core/operator-auth.ts` — status signal + register/sign-in continuation support
- `frontend/src/app/core/operator-auth.spec.ts` — mirror specs
- `frontend/src/app/auth/auth-page.ts` — auto-sign-in after register
- `frontend/src/app/auth/auth-page.spec.ts` — AC-10
- `frontend/src/app/auth/auth-page.a11y.spec.ts` — flow a11y updates
- `frontend/src/app/operator/pending-approval-banner.ts` — new banner component
- `frontend/src/app/operator/pending-approval-banner.spec.ts` — AC-11
- `frontend/src/app/operator/pending-approval-banner.a11y.spec.ts` — banner a11y
- `frontend/src/app/operator/operator-home.ts` — renders the banner
- `frontend/src/app/operator/operator-console.ts` — imports the banner (SCSS migration deferred → #698)
- `frontend/src/app/operator/operator-console.html` — hosts the banner above the tab outlet
- `frontend/src/app/auth/auth-page.a11y.spec.ts` — fallback-card flow update
- `frontend/e2e/operator-registration.e2e.ts` — flow rewrite (AC-10 e2e)
- `frontend/e2e/unified-auth.e2e.ts` — register test now lands under the pending notice
- `frontend/e2e/admin-operator-suspension.e2e.ts` — seed updated (register auto-signs-in)
- `frontend/e2e/support/auth-mocks.ts` — may-authenticate set + `operatorStatus` + reject revocation in the lifecycle mock
- `RESPONSIBILITIES.md` — §`operator` (the three-set statement; reject bracket; #693 mail-copy line)
- `CONTEXT.md` — glossary: operator approval (console access vs tourist visibility)
- `docs/adr/ADR-0013-photo-moderation-trusted-operators.md` — amendment: the human gate moved to the visibility fence
- `docs/architecture/auth-signin-register.md` — D-5 updated to the #694 contract

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/pending-operator-console.md`

- [ ] **Step 1:** Commit this plan doc; push `claude/sdlc-694-8f5esm`; open the draft PR
  referencing #694 (CI fires on `pull_request` only).
- [ ] **Step 2:** Update Execution status (phase 0 ✅, stage pointer → implement phase 1).

## Phase 1 — Status published + may-authenticate set at the edge

**Files:** Move `OperatorStatus` → `vocabulary/` · Modify `OperatorCredential`,
`JdbcOperators.credentialByUsername`, `OperatorUserDetailsService`, `OperatorAccounts` ·
Test `PerOperatorLoginIT`, `OperatorRegistrationIT`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void aPendingOperatorCanLogIn() {
    registerOperator("pending-op", "s3cr3t-Passw0rd");   // stays PENDING, no approval
    assertEquals(HttpStatus.OK, loginAsOperator("pending-op", "s3cr3t-Passw0rd").getStatusCode());
}

@Test
void aRejectedOperatorCannotLogIn() {
    long id = registerOperator("rejected-op", "s3cr3t-Passw0rd");
    rejectAsAdmin(id);
    assertEquals(HttpStatus.UNAUTHORIZED, loginAsOperator("rejected-op", "s3cr3t-Passw0rd").getStatusCode());
}
```

- [ ] **Step 2:** `./gradlew test --tests "*PerOperatorLoginIT*"` → FAIL (pending login 401).
- [ ] **Step 3: Minimal implementation** — promote `OperatorStatus` to `vocabulary/`;
  `OperatorCredential(username, passwordHash, admin, OperatorStatus status)`;
  `credentialByUsername` selects the raw status token;
  `OperatorUserDetailsService`:

```java
private static final Set<OperatorStatus> MAY_AUTHENTICATE = EnumSet.of(OperatorStatus.ACTIVE, OperatorStatus.PENDING);
...
.disabled(!MAY_AUTHENTICATE.contains(credential.status()))
```

  Update `OperatorRegistrationIT.registersPendingAndCannotLogInUntilApproved` to the new
  contract (registered → CAN sign in; console access still fenced until phase 2).
- [ ] **Step 4:** `./gradlew test --tests "*PerOperatorLoginIT*" --tests "*OperatorRegistrationIT*"`
  → PASS; then the structural net (`ModularityTests`, `PackageShape*`, `PublishedSurface*`).
- [ ] **Step 5: Generalization audit** — population: every consumer of
  `OperatorCredential.active()` and every `OperatorStatus.ACTIVE` literal; enumerate with
  `grep -rn "\.active()\|OperatorStatus.ACTIVE" platform/src/main` (+ compiler errors from the
  record change); judge each (edge login, ownership resolution, fence, lifecycle transitions,
  admin lists). Append to the log.
- [ ] **Step 6: Commit** — `Publish OperatorStatus and let PENDING authenticate (#694)`
- [ ] **Step 7:** Update Execution status.

## Phase 2 — Ownership resolves for the may-operate set; console end-to-end

**Files:** Modify `JdbcOperators` (`idByActiveUsername` → operable set), `OperatorDirectory` +
`OperatorService` + `Operators` docs/signatures, `OperatorAccountController` · Test
`OperatorOwnershipIT`, new `PendingOperatorConsoleIT`

- [ ] **Step 1: Write the failing tests** — `OperatorOwnershipIT`:

```java
@Test
void operatorForResolvesAPendingUsername() { ... assertTrue(directory.operatorFor(pendingUsername).isPresent()); }

@Test
void operatorForRejectsUnknownSuspendedAndRejectedUsernames() { ... }   // widen the existing test
```

  `PendingOperatorConsoleIT` (register → sign in → `POST /api/venues` → `GET /api/venues/mine`
  → beach-map edit → bookings/availability/payout tab reads all 2xx; then tourist
  list omits the venue, detail 404s, reserve refused; admin approves; tourist list shows it).
- [ ] **Step 2:** Run both → FAIL (403 / empty resolution).
- [ ] **Step 3: Minimal implementation** — one SQL predicate:

```sql
SELECT id FROM operator WHERE username = :username AND status IN (:operable)
```

  bound to `{ACTIVE, PENDING}` named as the may-operate set in `JdbcOperators`;
  `OperatorAccountController`'s ACCOUNT_NOT_ACTIVE check widens to the same set.
- [ ] **Step 4:** Both test classes + `OperatorVenueVisibilityIT` + `VenueCatalogVisibilityIT` +
  `CrossVenueDenialIT` (R-1/R-5) → PASS.
- [ ] **Step 5: Generalization audit** — population: every SQL predicate on `operator.status`
  in `JdbcOperators` (`grep -n "status" JdbcOperators.java`); judge each against the three-set
  split; record which stayed ACTIVE-only and why.
- [ ] **Step 6: Commit** — `Resolve ownership for the may-operate set (#694)`
- [ ] **Step 7:** Update Execution status.

## Phase 3 — Reject revocation bracket + #128 regressions

**Files:** Modify `OperatorLifecycle` (`usernameInStatus`), `OperatorService`, `Operators`,
`JdbcOperators` (`RETURNING username` on reject), `ApprovalOutcome.Rejected(username)`,
`AdminOperatorController` · Test new `OperatorRejectionRevocationIT`,
`AdminOperatorControllerTest`, `OperatorLifecycleIT`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void rejectingAPendingOperatorKillsItsLiveSession() {
    registerOperator("doomed-op", PW);
    var cookie = loginAsOperator("doomed-op", PW);      // PENDING session (phase 1)
    rejectAsAdmin(idOf("doomed-op"));
    assertEquals(HttpStatus.UNAUTHORIZED, meWith(cookie).getStatusCode());
}

@Test
void aSessionEstablishedWhilePendingIsRevokedBySuspensionAfterApproval() { ... }
```

- [ ] **Step 2:** Run → FAIL (cookie still authenticates after reject).
- [ ] **Step 3: Minimal implementation** — `usernameInStatus(target, PENDING)` pre-revoke +
  `Rejected(username)` post-revoke in the reject endpoint, mirroring the #357 suspend bracket;
  suspend switches to `usernameInStatus(target, ACTIVE)` (same semantics, one port method).
- [ ] **Step 4:** `OperatorRejectionRevocationIT` + `OperatorSuspensionRevocationIT` +
  `OperatorLifecycleIT` + `AdminOperatorControllerTest` → PASS.
- [ ] **Step 5: Generalization audit** — population: every lifecycle transition endpoint that
  removes the right to a session (enumerate `AdminOperatorController` POST mappings + the
  customer-side erasure path); judge whether each revokes. (Approve/reinstate deliberately
  don't.)
- [ ] **Step 6: Commit** — `Revoke sessions when rejecting a PENDING operator (#694)`
- [ ] **Step 7:** Update Execution status.

## Phase 4 — `operatorStatus` on the wire principal

**Files:** Modify `AuthController` (`PrincipalResponse` + lookups) · Test `AuthSessionIT`

- [ ] **Step 1: failing test** — login + `/me` as a PENDING operator → `operatorStatus:"PENDING"`;
  as approved → `"ACTIVE"`; as customer → null/absent.
- [ ] **Step 2:** Run `--tests "*AuthSessionIT*"` → FAIL.
- [ ] **Step 3:** `PrincipalResponse` gains `operatorStatus`; populated for operator principals
  from `OperatorAccounts.findByUsername` at login/me; null for customers.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Generalization audit — population: every `PrincipalResponse` construction site
  (`grep -n "new PrincipalResponse" AuthController.java`); all sites carry the field.
- [ ] **Step 6: Commit** — `Carry the operator lifecycle status on the wire principal (#694)`
- [ ] **Step 7:** Update Execution status.

## Phase 5 — FE auto-sign-in + pending banner

**Files:** Modify `core/session-auth.ts`, `core/operator-auth.ts`, `auth/auth-page.ts` · Create
`operator/pending-approval-banner.ts` (+ specs) · Modify `operator/operator-home.ts`, console
shell · Test the listed specs

- [ ] **Step 1: failing specs** — auth-page: register success → `signIn` called with the same
  credentials → navigation to the operator landing; refused auto-sign-in → the normal sign-in
  error state. Banner: renders for `operatorStatus === 'PENDING'`, absent for `ACTIVE`; axe
  clean.
- [ ] **Step 2:** `npm test` (scoped: `npm test -- auth-page` etc.) → FAIL.
- [ ] **Step 3:** implement (signal APIs; Tailwind tokens; no new .scss; banner copy explains
  "venues aren't visible to tourists until approval").
- [ ] **Step 4:** scoped Vitest + `npm run test:a11y` → PASS; `npm run lint` +
  `npm run format:check`.
- [ ] **Step 5:** Generalization audit — population: every consumer of `AuthPrincipal`
  (`grep -rn "AuthPrincipal" frontend/src`); judge each for the optional field.
- [ ] **Step 6: Commit** — `Auto-sign-in after registration and show the pending notice (#694)`
- [ ] **Step 7:** Update Execution status.

## Phase 6 — Mocked e2e rewrite

**Files:** Modify `frontend/e2e/operator-registration.e2e.ts` (+ any sibling asserting the
retired card)

- [ ] **Step 1:** rewrite per `playwright-cli` best practice: register (mock `202`) →
  auto-sign-in (mock login 200 + `/me` with `operatorStatus:"PENDING"`) → console renders with
  pending banner (axe via `expectNoSeriousAxeViolations`); duplicate-username path → sign-in
  error visible.
- [ ] **Step 2:** `npm run test:e2e:a11y` → PASS.
- [ ] **Step 3: Commit** — `Rewrite the registration e2e for the auto-sign-in flow (#694)`
- [ ] **Step 4:** Update Execution status.

## Phase 7 — Docs close-out + gates

**Files:** Modify `RESPONSIBILITIES.md` §`operator`, `CONTEXT.md`, `OperatorAccount` Javadoc
(if not already in phase 1) · this plan doc

- [ ] **Step 1:** update `RESPONSIBILITIES.md` §`operator` ("ownership resolves ACTIVE-only" →
  the three-set statement; the reject bracket), `CONTEXT.md` glossary (the three sets, the
  auto-sign-in flow note under operator approval).
- [ ] **Step 2:** `node scripts/check-plan-file-structure.mjs --diff origin/main` (plan doc
  staged) + the other hygiene guards.
- [ ] **Step 3:** merge latest `origin/main`, full-suite CI green, mark PR ready for review →
  Review gate (`/code-review` + `riviera-review-overlay`) → Sonar gate (issue list, not just
  pass/fail) → findings re-enter at Implement → merge close-out (`references/pr-gates.md` §3:
  tick epic #573, close #694, `riviera-docs-freshness` over the merge range).
- [ ] **Step 4:** finalize Execution status (`merged via PR #NN`), empty Open Questions.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-17 | phase 1 (`OperatorCredential` shape change) | every reader of `OperatorCredential.active()` or the `OperatorStatus` type, enumerated by grep + the compiler after the field change | `grep -rn "\.active()\|OperatorStatus" platform/src` | `OperatorUserDetailsService` (login gate → may-authenticate set), `OperatorAccountController` (password-change gate → kept ACTIVE-only, widens in phase 2), `JdbcOperators` (mapper + SQL predicates → SQL swept in phase 2's audit), `OperatorAccountProvisioningIT`, `OperatorCredentialInitializerTest`, `OperatorAccountControllerTest`, `OperatorLifecycleIT` (mechanical updates) | fixed all; no reader left deriving the old ACTIVE-only boolean |
| 2026-08-17 | phase 2 (may-operate resolution) | every SQL predicate on `operator.status` in the adapter + every edge status comparison | `grep -n "status" platform/src/main/java/ai/riviera/platform/operator/adapter/out/JdbcOperators.java` + phase-1's repo grep | widened: `idByOperableUsername`, `OperatorAccountController` (login set). Deliberately kept: `hasActiveOwner`/`venuesWithActiveOwner` (#693 fence, ACTIVE-only), `accounts()` (admin list of decided accounts), `pendingOperators()` (approval queue), `activeUsernameById` (suspend pre-revoke; reject bracket lands in phase 3), guarded lifecycle transitions | each site judged against the three-set split; none left implicitly coupled |
| 2026-08-17 | phase 3 (reject revocation) | every lifecycle transition endpoint that removes the right to a session | `grep -n "PostMapping" AdminOperatorController.java` → approve/reject/suspend/reinstate | reject (now bracketed), suspend (already bracketed), approve + reinstate (deliberately no revoke — rights are kept/restored); customer-side erasure revocation is separate edge machinery, untouched | reject bracketed; no other transition removes session rights un-revoked |
| 2026-08-17 | phase 5 (`AuthPrincipal` gains `operatorStatus`) | every consumer of `AuthPrincipal` / the auth-state signals | `grep -rn "AuthPrincipal" frontend/src` | `session-auth.ts` (interface + base), `operator-auth.ts` (new `pendingApproval`), `customer-auth.ts` (untouched — field optional, customer paths never read it), specs/fakes (compile-driven) | optional field; no consumer breaks; banner is the one new reader |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..9, 12:** `./gradlew test --tests "*PerOperatorLoginIT*" --tests "*OperatorRegistrationIT*" --tests "*PendingOperatorConsoleIT*" --tests "*OperatorRejectionRevocationIT*" --tests "*OperatorSuspensionRevocationIT*" --tests "*OperatorOwnershipIT*" --tests "*OperatorLifecycleIT*" --tests "*AuthSessionIT*" --tests "*ModularityTests*" --tests "*ArchitectureTests*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-10, 11:** `npm test` + `npm run test:a11y` + `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** N/A holds (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone: no new time logic (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no migration (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register closed; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** (`merged via PR #NN`).
- [ ] **The review gate ran in full** — invocation ladder + `riviera-review-overlay`.
