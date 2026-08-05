# A4 — Tighten `/api/admin/payout-batches` from `ROLE_OPERATOR` to `ROLE_ADMIN` Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plain (non-admin) operator can no longer read every venue's payout figures or
mutate any venue's batch settlement state — `GET`/`POST /api/admin/payout-batches` and
`PATCH /api/admin/payout-batches/{id}` answer `403` to `ROLE_OPERATOR` and `200`/`404` only
to `ROLE_ADMIN` — and every stated fact in the tree that called this surface operator-gated
is corrected.

**Architecture:** One matcher line in `SecurityConfig` moves from `hasRole(OPERATOR)` to
`hasRole(ADMIN)`. The significant decision is **not** the line — it is *where the proof
lives*. The controller has no venue scoping and never will (invariant #13 exempts
`/api/admin/**`; an admin does not *own* a payout run), so the role gate is the entire
authorization, and it must be pinned by a session that genuinely lacks `ROLE_ADMIN`. The
repo's bootstrap `operator` account is the platform admin (`is_admin`, V29), so **no
existing test in either candidate class can produce that proof** — §"The test trap",
below, records the experiment that established this.

**Persistence:** JDBC only (invariant #1). **No migration** — no schema touched.

**Source of intent:** epic [#348](https://github.com/ivopogace/riviera-sunbed-booking/issues/348)
slice **A4** (+ its [2026-08-05 staleness audit](https://github.com/ivopogace/riviera-sunbed-booking/issues/348#issuecomment-5191131810),
which promoted A4 from cleanup to a live cross-tenant exposure). Anticipated by
`docs/design/riviera-admin-console.dc.html` header decision 3.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the epic's own A4 test prescription rests on a false premise about `CrossVenueDenialIT`'s
actor; see Open questions → Resolved) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what surfaced the stale CSRF claim in the controller
Javadoc) · `tdd` (the plain-operator `403` legs are written red first; the matcher flip is
what turns them green) · `riviera-review-overlay` (review gate — RV-BE-9 is directly on
point) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, 6 findings — 4
patched in-tree, 2 deliberately left as historical records; §Docs-freshness report) ·
`riviera-modulith` (confirmed **no structural change**: `SecurityConfig`/`AdminAuditFilter`
are composition-root edge classes and stay there per RV-BE-11; the controller stays in
`payout/adapter/in`; no port, event, or `allowedDependencies` change) ·
`riviera-java-conventions` (§6c one-line-comment rule — the long *why* on each test moved
into Javadoc rather than inline blocks; `assertEquals`-free MockMvc style kept) ·
`riviera-local-debug` (cloud Gradle recipe + scoped ITs; flagged the per-username login
budget as the full-suite-only failure class this slice must not feed — R-3) ·
`riviera-stripe-payments` — `N/A — no money moves; the payout ledger's arithmetic,
accrual, and reversal are untouched. Only who may read the report changes.` ·
`postgres` — `N/A — no migration, no SQL.` · `riviera-frontend` / `angular-developer` /
`playwright-cli` — `N/A — no frontend caller exists (verified, AC-6).`

**Branch:** `claude/payout-batches-admin-role-7nbl4j` — the cloud session's **designated
remote branch stands in for `feature/a4-payout-batches-admin-role`** (`riviera-sdlc`
§Remote/cloud session addendum). Branched off `origin/main` at `dd99948`.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an authenticated operator that is **not** a platform admin, when it
  calls `GET /api/admin/payout-batches?period=`, then the platform edge refuses it with
  `403` before the request reaches `PayoutReport#forPeriod` — no other venue's gross /
  commission / net is disclosed. *Pinned by:*
  `AdminPayoutSecurityIT.plainOperatorIsRefusedTheBatchReport`
- [ ] **AC-2:** Given the same non-admin operator, when it calls
  `PATCH /api/admin/payout-batches/{id}` with a legal target status, then it is refused
  `403` before `PayoutReport#mark` runs — no venue's settlement state is advanced.
  *Pinned by:* `AdminPayoutSecurityIT.plainOperatorIsRefusedTheBatchStatusPatch`
- [ ] **AC-3:** Given the same non-admin operator, when it calls
  `POST /api/admin/payout-batches?period=` (batch generation), then it is refused `403`.
  *Pinned by:* `AdminPayoutSecurityIT.plainOperatorIsRefusedBatchGeneration`
- [ ] **AC-4:** Given a platform admin, when it calls the batch report for a period,
  then it still succeeds (`200`) — the tightening denies the operator, it does not break
  the admin. *Pinned by:* `AdminPayoutSecurityIT.adminReadsTheBatchReport`
- [ ] **AC-5:** Given a platform admin that owns none of the venues in the report, when it
  reads the report and patches a batch id, then neither call is refused on **ownership**
  grounds (`200`; `404 NO_SUCH_BATCH` for an absent id — a handler answer, not a gate
  answer) — invariant #13's `/api/admin/**` exemption still holds after the tightening.
  *Pinned by:* `CrossVenueDenialIT.adminPayoutBatchesAreRoleGatedNotOwnershipChecked`
- [ ] **AC-6:** Given the whole repo, when `frontend/src` and `frontend/e2e` are searched
  for a caller of `/api/admin/payout-batches`, then there is none — so the tightening
  strands no UI. *Pinned by:* the AC-verification grep (no test; there is no code to test).
- [ ] **AC-7:** Given the backend after the change, when the structural net runs
  (`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`), then
  it is green — the slice introduces no module-boundary or package-shape drift.
  *Pinned by:* those three classes.

## Non-goals

- **Adding venue scoping to the payout-batch endpoints.** They are platform-wide by
  design (a period's batches across all venues); invariant #13 exempts `/api/admin/**`,
  and ADR-0009's payout model has no per-operator settlement view. A5 may add one; A4
  does not.
- **An admin UI for payout batches.** That is A6, blocked on A5, blocked on #284.
- **Any change to payout arithmetic, the `DRAFT→REPORTED→SETTLED` lifecycle, or the
  `PeriodKey` shape.** A5 owns all three (epic scope note "Payouts — deliberately ahead of
  the code").
- **An architecture test asserting every `/api/admin/**` matcher is `ADMIN`-gated.**
  Tempting — after this slice the property is finally true — but it needs a matcher-
  enumeration seam `SecurityConfig` does not expose, and inventing one is a bigger change
  than the slice it would guard. Recorded in Open questions as a deliberate deferral.
- **Rewriting historical plan docs** that state the old gate (`s6-operator-self-registration.md`,
  `u9-payout-ledger-bkt-report-weather-refund.md`, `operator-per-venue-auth.md`,
  `admin-audit-trail.md`) — `riviera-docs-freshness` §Scope discipline: historical plans
  are records, not living docs.

## Behavior-parity ledger

> This slice **narrows** an existing surface rather than replacing it, so the ledger is
> read in the tightening direction: which of the endpoints' behaviors survive the role
> change unchanged, and which are deliberately removed.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `GET ?period=` returns every venue's gross/commission/net for the period | **preserved for `ROLE_ADMIN`**, **dropped for `ROLE_OPERATOR`** | The response body, `PeriodKey` parsing and `PayoutBatchView` shape are untouched; only the matcher's role changes. Dropping the operator's access *is* the slice. |
| `POST ?period=` generates/refreshes `DRAFT` batches | same | same |
| `PATCH /{id}` advances `DRAFT→REPORTED→SETTLED` | same | same |
| Unauthenticated call → `401` from the auth entry point (not a CSRF `403`) | preserved | The matcher change swaps the required authority; the entry point ahead of it is untouched. The existing 401 assertions stay valid — only their *names* were wrong (`…RequiresOperator`). |
| Malformed `period` → `400 INVALID_REQUEST` | preserved | `InvalidApiRequestException.parsing` in the controller is unchanged; the pinning test just needs an admin session to reach it. |
| Illegal transition → `409 ILLEGAL_TRANSITION`; absent id → `404 NO_SUCH_BATCH` | preserved | `AdminPayoutBatchControllerTest` is standalone MockMvc with a stubbed `PayoutReport` and **no security chain**, so it is unaffected by the matcher; re-run as a regression guard. |
| Mutating calls are recorded by `AdminAuditFilter` with the acting principal | preserved, **and simplified** | The filter is path-prefix driven, not role driven. What changes is its *documented* actor: the namespace no longer admits an OPERATOR anywhere, so the Javadoc carve-out is deleted rather than reworded. |
| Controller Javadoc: "the POST/PATCH are token-less and CSRF-exempt like the other operator writes" | **dropped — it was already false** | `SecurityConfig`'s `csrf().ignoringRequestMatchers(...)` lists only `/api/bookings`, `/api/bookings/*/cancel`, `/api/bookings/*/withdraw` and the Stripe webhook. The payout POST/PATCH have always required a CSRF token (which is why every existing test passes `.with(csrf())`). Corrected in the same Javadoc rewrite. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The tests stay green without proving anything.** The bootstrap `operator` account is the platform admin (V29 `UPDATE operator SET is_admin = TRUE`), so its session carries `ROLE_ADMIN` *and* `ROLE_OPERATOR`; every existing assertion on this surface rides that session and is invariant under the change. | **high** (confirmed) | high — ships an unproven security fix | Verified empirically before writing a line (§"The test trap"). Proof re-based onto a genuinely non-admin operator provisioned through the real `OperatorProvisioning`, the `AdminPhotoModerationIT`/`AdminPhotoTakedownIT` precedent. | agent | open |
| R-2 | A caller outside `frontend/` (a script, a runbook, a deploy check) breaks on the new `403`. | low | med | AC-6 greps `frontend/src` + `frontend/e2e`; the wider tree grep in the docs sweep found only prose, no client. The only human caller is a platform admin with `curl`, who keeps access. | agent | open |
| R-3 | **Full-suite-only failure: the per-username login budget.** `riviera.ratelimit.username.capacity=15 / PT15M` is keyed on the submitted username in the *cached* Spring context, and 15 IT classes share the `test-operator-pw` context (`riviera-local-debug` §"full-suite-only failure class", #127). Adding logins can only be verified by CI. | med | med | The new plain operator gets its **own** username (`payout-plain-op`) → its own bucket. And `AdminPayoutSecurityIT`'s admin login moves from `@BeforeEach` (one per test) to on-demand per test, which **reduces** the shared `operator` bucket's pressure rather than adding to it. Verified by the PR's CI run, not locally. | agent | open |
| R-4 | The new `PATCH` leg in `CrossVenueDenialIT` writes an `admin_audit_record` row (it is a mutating `/api/admin/**` action past the gate) and pollutes a sibling IT. | low | low | `AdminAuditTrailIT` truncates `admin_audit_record` in its own `@BeforeEach`; no other test asserts on a global row count. | agent | open |
| R-5 | `CrossVenueDenialIT` mocks `CurrentOperator`; dropping the `actingAs(...)` stub from the payout test could NPE if some filter resolves the operator eagerly. | low | low | The payout-batch path performs no ownership check, so `CurrentOperator` is never consulted — confirmed by running the class scoped. | agent | open |

## Open questions / Assumptions

- **Assumption:** the platform admin is the only intended human operator of the BKT
  settlement flow, so denying every non-admin operator strands no legitimate workflow.
  Grounded in epic #348's framing ("any approved operator can read every other venue's
  payout figures … OWASP API #1") and ADR-0009's phase-1 model (a human at the platform
  sends the bank file). — *Owner:* agent · *Resolves by:* phase 1.
- **Deferred (not open):** a machine-checked "every `/api/admin/**` matcher is
  `ADMIN`-gated" test. Deliberately out of scope (see Non-goals); the property becomes
  true with this slice, so the guard is worth cutting as a follow-up issue if the admin
  namespace keeps growing. — *Owner:* maintainer · *Resolves by:* a follow-up issue, if
  wanted.

### Resolved

- **Open question (resolved at plan time, before any edit):** *Can
  `CrossVenueDenialIT.adminPayoutBatchesIsNotOwnershipChecked` be inverted to expect `403`,
  as epic #348's A4 prescription assumes?* — **No.** See §"The test trap" for the
  experiment and the resulting test placement.

## The test trap (verified, not assumed)

The epic's A4 note warns that `AdminPayoutSecurityIT` logs in as the bootstrap `operator`,
which V29 demoted to the platform admin, so its assertions would survive the tightening
without proving anything — and prescribes moving the real proof to `CrossVenueDenialIT`,
"which already has a genuinely non-admin operator: `operatorA` via `insertOperator("op-a")`".

**Experiment.** Before writing any test, the matcher was flipped to `hasRole(ADMIN_ROLE)`
in a throwaway working copy and two scoped runs were made:

```
gradle --no-daemon --console=plain test \
  --tests "*CrossVenueDenialIT.adminPayoutBatchesIsNotOwnershipChecked" \
  --tests "*AdminPayoutSecurityIT*"
→ BUILD SUCCESSFUL
```

**Result — both halves of the trap confirmed, one of them wider than the epic knew:**

1. As warned, **all six** `AdminPayoutSecurityIT` tests stay green under the tightened
   matcher. `operatorReadsTheBatchReport` and `malformedPeriodIsBadRequest` ride the
   admin session; the two `…RequiresOperator` tests only assert the unauthenticated
   `401`, which no role change can move.
2. **The same trap applies to `CrossVenueDenialIT`, so the prescription cannot be
   followed as written.** `operatorA` is a bare `INSERT INTO operator (username, status)`
   row with **no `password_hash`** — it can never log in (`OperatorUserDetailsService`
   filters a null hash to `UsernameNotFoundException`). It is an *ownership* identity, not
   a session identity: `actingAs(operatorA)` only stubs the mocked `CurrentOperator` seam,
   while every request in that class rides the one real login as the bootstrap admin. So
   `adminPayoutBatchesIsNotOwnershipChecked` returns **`200` after the change too** — it
   cannot be "inverted to `403`".

**Resulting placement**, which keeps the epic's intent (the proof must come from a
genuinely non-admin operator) while putting each assertion in the class whose subject it
is:

- **The role-gate proof → `AdminPayoutSecurityIT`** (AC-1/2/3), the security IT for these
  exact endpoints. It grows a real plain operator provisioned through
  `OperatorProvisioning` + `PasswordEncoder` with a session of its own — the established
  pattern from `AdminPhotoModerationIT` and `AdminPhotoTakedownIT`, which added it for
  *this same reason*, spelled out in their Javadoc ("the bootstrap `operator` account is
  the platform admin … its session can never demonstrate the `403`").
- **The ownership-exemption assertion stays in `CrossVenueDenialIT`** (AC-5) and stays
  under its *Exemptions* header — but is corrected to say what it actually tests. After
  the tightening it is a **stronger** statement of invariant #13's admin exemption than
  before: pre-change it showed a plain-role holder reaching another venue's money (the
  hole); post-change it shows the *platform admin* doing so, which is the exemption
  working as designed. The misleading `actingAs(operatorA)` framing is dropped, the
  `PATCH` leg the class never covered is added, and a pointer to `AdminPayoutSecurityIT`
  records where the plain-operator refusal now lives.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No `availability(set_id, booking_date)` row is read
or written on any path this slice touches: the payout-batch endpoints read the
`payout_ledger_entry`/`payout_batch` tables through `PayoutReport`, and the change is an
authorization matcher ahead of them. No booking, no beach map, no claim/release.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(none — root/edge only)* | existing | — | The authorization change is in `SecurityConfig`, a composition-root class. Login/session/role machinery lives at the platform edge, never in a module (RV-BE-11, `OperatorAuthPlacementTests`). |
| M-2 | `payout` | existing | `PayoutBatch` | Javadoc-only: `AdminPayoutBatchController` (its `adapter/in`) documents its own gate, and that sentence is now false. No behavior, port, or dependency change. |

**Cross-module named interfaces (`api/` ports)**

`N/A — no port added, removed, or changed.` The controller keeps depending on
`payout.application.PayoutReport` exactly as before; no `allowedDependencies` grant moves.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published, consumed, moved, or renamed.` No Flyway `event_type` rewrite is
implied.

### Module ownership (§4a)

All-in-the-edge, no boundary change. The one capability that moves is *who may invoke the
payout-batch admin surface*, and role gating is an **edge** concern by RV-BE-11 — it is on
`operator`'s Not-My-Job list ("never the login machinery or the role gate",
`RESPONSIBILITIES.md` §`operator`), and on `payout`'s too (its Job is the ledger and batch
reporting, not authorization). `payout` keeps owning *what* the endpoints answer;
`SecurityConfig` keeps owning *who* reaches them. No capability lands on two modules and
none lands on a Not-My-Job list.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves.` The slice changes only the authorization matcher in front of a
read + a status transition. Explicitly unchanged: payout arithmetic
(Σ bookings − commission, invariant #9), integer minor units + EUR (invariant #5), the
exactly-once accrual/reversal pair, every Stripe path (invariant #8), and refund policy
(invariant #10). `PayoutReport`, `PayoutBatch`, `BatchStatus` and `PeriodKey` are not
touched. `riviera-stripe-payments` was consulted and confirms the collect-only,
no-Connect, manual-BKT model is untouched.

## Angular — frontend surfaces touched

`N/A — backend-only.` Verified, not assumed: `grep -rn "payout-batches\|payoutBatch"
frontend/src frontend/e2e` → no matches (AC-6). Epic #348 records the same result on
2026-08-05; this slice re-confirms it at implementation time. Nothing to migrate, so no
`playwright-cli` e2e coverage is due.

## FE↔BE contract

`N/A — no contract change.` Paths, request params, request bodies and response DTOs are
byte-for-byte identical. The only observable difference is the status a non-admin
authenticated caller receives: `200`/`404`/`409` → `403`. There is no client to update.

## Docs-freshness report

> `riviera-docs-freshness` run over `origin/main...HEAD`. The **counting sweep** (step 2b)
> is the interesting half here: this slice takes the number of `OPERATOR`-gated paths in
> the `/api/admin/**` namespace from **1 to 0**, so every sentence phrased as "the one
> exception" or "almost always the admin" is falsified — and by construction those
> sentences live in files the diff would not otherwise touch.

| # | Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|---|
| D-1 | `SecurityConfig.java:133` | "The **operator-only** weekly BKT payout-batch report (U9)" | the new matcher | patched |
| D-2 | `SecurityConfig.java:370-372` | "operator-only across all methods (generate/list/transition)" | the new matcher | patched |
| D-3 | `SecurityConfig.java:139-142` | `ADMIN_OPERATORS_PATH`'s Javadoc: "the same `/api/admin/**` exemption as the payout batches, **but gated to the stricter ADMIN role**" — the contrast is the fact, and it is gone | the new matcher | patched |
| D-4 | `AdminPayoutBatchController.java:29-31` | "**Operator-gated** … `SecurityConfig` matches `/api/admin/payout-batches` to role `OPERATOR`; the POST/PATCH are token-less and **CSRF-exempt**" | the new matcher — **and**, for the second clause, `SecurityConfig`'s `ignoringRequestMatchers` list, which has never included this path (a pre-existing error found by the parity ledger) | patched |
| D-5 | `AdminAuditFilter.java:35-37` | "the actor is … **almost always** the platform ADMIN, but `/api/admin/payout-batches` is OPERATOR-gated, and those presses are deliberately recorded too" — the namespace's one carve-out | the new matcher; the namespace is now uniformly ADMIN-gated | patched — carve-out **deleted**, not reworded |
| D-6 | `docs/design/riviera-admin-console.dc.html:54,64` | endpoint map labels the surface `ROLE_OPERATOR`; header decision 3 reads "is gated to ROLE_OPERATOR **today**, not ROLE_ADMIN. Putting settlement on an admin-only page **implies tightening that matcher**" | this slice *is* that tightening | patched — label corrected; decision 3 marked **done by A4** rather than deleted, since the epic body calls the header's decision list binding |

**Checked and deliberately left unchanged** (all still true, or historical records):

- `CLAUDE.md` — invariant #13's "Platform-wide admin surfaces (`/api/admin/**`) are
  role-gated and exempt" stays true (a stricter role is still a role); the module table's
  `payout` row makes no gate claim.
- `CONTEXT.md` — the *Payout batch* glossary entry is about the domain object, not its gate.
- `RESPONSIBILITIES.md` — §`payout` states no role; §`operator` already says the role gate
  is not its job.
- `docs/adr/ADR-0009` — states no role for this surface (the role sentence lives in the
  design canvas's decision list, D-6, not the ADR).
- `docs/architecture/improvement-plan.md:63` — "Platform-wide admin
  (`/api/admin/payout-batches`) stays role-gated" is still true, and is a historical record
  of the shipped A1 design.
- `docs/plans/{operator-per-venue-auth,s6-operator-self-registration,u9-payout-ledger-bkt-report-weather-refund,admin-audit-trail}.md`
  — historical plan docs, records not living docs (`riviera-docs-freshness` §Scope
  discipline). `admin-audit-trail.md`'s R-5 row ("`/api/admin/payout-batches` is
  OPERATOR-gated … accepted") is the closest call: its premise is now gone, but it records
  what #507 accepted *at the time*, and its mitigation pointed at the filter Javadoc — which
  D-5 patches. Left as-is on purpose.
- `.claude/skills/riviera-*` — no skill cites this endpoint's role.

## Execution status

**Stage pointer:** `implement — phase 0 red, entering phase 1`

**Next action:** Phase 1 — flip the matcher to `hasRole(ADMIN_ROLE)` and correct the three
Javadoc sites (D-1/D-3 `SecurityConfig`, D-4 controller, D-5 `AdminAuditFilter`).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Red: the plain-operator refusal | ⏳ red pinned | |
| 1 — Green: the matcher + the Javadoc that described it | | |
| 2 — The ownership-exemption assertion + docs sweep | | |

**Phase 0 red evidence** (`gradle test --tests "*AdminPayoutSecurityIT*"`, 9 tests, 3
failed — the six pre-existing tests pass unchanged, confirming R-1 once more):

```
plainOperatorIsRefusedTheBatchReport      FAILED  Status expected:<403> but was:<200>
plainOperatorIsRefusedBatchGeneration     FAILED  Status expected:<403> but was:<200>
plainOperatorIsRefusedTheBatchStatusPatch FAILED  Status expected:<403> but was:<404>
```

The `404` on the PATCH leg is the sharpest statement of the hole: pre-change the request
passed the gate and reached `PayoutReport#mark`, which answered `NO_SUCH_BATCH` for id 1 —
i.e. the only thing standing between a plain operator and another venue's settlement state
was whether that batch happened to exist.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — the matcher (`:372`)
  and the three stale comments around it (D-1, D-2, D-3).
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/AdminPayoutBatchController.java`
  — class Javadoc (D-4).
- `platform/src/main/java/ai/riviera/platform/AdminAuditFilter.java` — class Javadoc,
  the OPERATOR carve-out paragraph (D-5).
- `platform/src/test/java/ai/riviera/platform/payout/AdminPayoutSecurityIT.java` — gains
  the plain-operator fixture and AC-1/2/3; renames the four misnamed tests.
- `platform/src/test/java/ai/riviera/platform/CrossVenueDenialIT.java` — AC-5: the
  exemption assertion, corrected and extended with the `PATCH` leg.
- `docs/design/riviera-admin-console.dc.html` — the endpoint map + header decision 3 (D-6).
- `docs/plans/a4-payout-batches-admin-role.md` — this plan.

---

## Phase 0 — Red: the plain-operator refusal

**Files:** Modify `platform/src/test/java/ai/riviera/platform/payout/AdminPayoutSecurityIT.java`

- [ ] **Step 1: Write the failing tests** — provision a genuinely non-admin operator
  (`OperatorProvisioning` + `PasswordEncoder`, the `AdminPhotoModerationIT` pattern), give
  it a session of its own, and assert `403` on the GET, the POST and the PATCH. Rename the
  four tests whose names claim the wrong role, and make the admin session on-demand rather
  than `@BeforeEach` (R-3).

- [ ] **Step 2: Run it, verify it fails** —
  `gradle --no-daemon --console=plain test --tests "*AdminPayoutSecurityIT*"` → the three
  new tests FAIL, each expecting `403` and receiving the pre-change success status
  (`200` for the GET/POST, `404 NO_SUCH_BATCH` for the PATCH).

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Commit the red phase** —
  `git commit -m "Pin the plain-operator refusal on the payout-batch admin surface (#348)"`,
  labelled as a deliberate red-TDD push in the PR (the `riviera-sdlc` CI-gate exemption).

- [ ] **Step 4: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Green: the matcher, and the Javadoc that described it

**Files:** Modify `SecurityConfig.java:133,139-142,369-372` · `AdminPayoutBatchController.java:24-34` · `AdminAuditFilter.java:35-37`

- [ ] **Step 1: Flip the matcher**

```java
// The weekly BKT payout-batch report (U9) — ADMIN-only across all methods
// (generate/list/transition). Tightened from OPERATOR by #348 A4: the surface is
// platform-wide with no venue scoping, so an OPERATOR gate let any approved operator read
// every venue's payout figures and mark any venue's batch settled (OWASP API #1).
.requestMatchers(PAYOUT_BATCHES_PATH, PAYOUT_BATCH_ITEM_PATH).hasRole(ADMIN_ROLE)
```

- [ ] **Step 2: Correct the three Javadoc sites** — D-1/D-3 on the `SecurityConfig`
  constants, D-4 on the controller (including the false CSRF-exempt clause), D-5 on
  `AdminAuditFilter` (delete the carve-out; the namespace is now uniformly ADMIN-gated).

- [ ] **Step 3: Run it, verify it passes** —
  `gradle --no-daemon --console=plain test --tests "*AdminPayoutSecurityIT*"` → PASS.

> Scope (end-of-phase regression): broaden to the touched module's package.

- [ ] **Step 4: Generalization-audit pass** — the pattern is "a stated role that the code
  no longer has". Search the tree for every assertion of this endpoint's gate; decide
  patch-vs-leave per `riviera-docs-freshness` scope discipline. Record in the log below.

- [ ] **Step 5: Commit** —
  `git commit -m "Gate /api/admin/payout-batches to ROLE_ADMIN (#348)"`

- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The ownership exemption, and the docs sweep

**Files:** Modify `CrossVenueDenialIT.java:~425-432` · `docs/design/riviera-admin-console.dc.html:54,64`

- [ ] **Step 1: Correct and extend the exemption assertion** — rename
  `adminPayoutBatchesIsNotOwnershipChecked` →
  `adminPayoutBatchesAreRoleGatedNotOwnershipChecked`, drop the misleading
  `actingAs(operatorA)` framing (the session is and always was the bootstrap admin's), add
  the `PATCH` leg, and point at `AdminPayoutSecurityIT` for the plain-operator refusal.

- [ ] **Step 2: Patch the design canvas** (D-6) — the endpoint map's role label, and
  header decision 3 marked done by A4 rather than deleted.

- [ ] **Step 3: Run the scoped set + the structural net** —

```bash
gradle --no-daemon --console=plain test \
  --tests "*AdminPayoutSecurityIT*" --tests "*CrossVenueDenialIT*" \
  --tests "*AdminPayoutBatchControllerTest*" --tests "*AdminAuditTrailIT*" \
  --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" \
  --tests "*PackageShapeArchitectureTests*"
```

- [ ] **Step 4: Commit** —
  `git commit -m "Re-base the payout-batch exemption test on the admin actor + docs sweep (#348)"`

- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/2/3:** Run `gradle test --tests "*AdminPayoutSecurityIT*"` → `plainOperatorIsRefusedTheBatchReport`, `plainOperatorIsRefusedTheBatchStatusPatch`, `plainOperatorIsRefusedBatchGeneration` pass.
- [ ] **AC-4:** same run → `adminReadsTheBatchReport` passes.
- [ ] **AC-5:** Run `gradle test --tests "*CrossVenueDenialIT*"` → `adminPayoutBatchesAreRoleGatedNotOwnershipChecked` passes.
- [ ] **AC-6:** Run `grep -rn "payout-batches\|payoutBatch" frontend/src frontend/e2e` → no matches.
- [ ] **AC-7:** Run the structural net → green.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (`N/A` justified); no availability path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module imports added; no event payload changed (invariant #11).
- [ ] **Payment/payout** section filled (`N/A` justified); ledger arithmetic and exactly-once accrual untouched (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — untouched.
- [ ] No schema change, so no Flyway migration is due (invariant #12).
- [ ] **Frontend** — no surface touched; the no-caller claim is verified, not assumed (AC-6).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with a reason).
- [ ] **Close-out written in THIS PR** — final plan state committed here citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder *plus* `riviera-review-overlay`.
