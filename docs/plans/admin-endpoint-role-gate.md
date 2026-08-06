# Machine-check that every `/api/admin/**` endpoint is ADMIN-gated — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make *"every `/api/admin/**` endpoint is gated to `ROLE_ADMIN`"* a build failure
rather than a review read — by **discovering** the admin endpoints the application really
maps and requiring each to refuse both non-admin principal types.

**Architecture:** The single significant decision is **a `@WebMvcTest` slice, not a
Testcontainers IT**. The property under test is a `SecurityConfig` *matcher* property, and
the web slice drives the real filter chain against it. An IT would carry
`@EnabledIfDockerAvailable`, so the guard would **silently skip** wherever Docker is absent —
a tripwire that skips is not a tripwire. The slice also sidesteps the trap the issue names
(the bootstrap `operator` IS the platform admin, `CrossVenueDenialIT.operatorA` has no
`password_hash`) because it mints principals directly instead of provisioning sessions.
Fidelity is not traded away for that: the probe authorities are taken from the **production
role constants** — `OperatorUserDetailsService.OPERATOR_ROLE` / `.ADMIN_ROLE` and
`CustomerUserDetailsService.CUSTOMER_ROLE` — which are precisely what
`loadUserByUsername` grants a non-admin operator, a platform admin and a customer, so the
probe principal is authority-identical to a real session rather than a hand-guessed twin.
The one structural consequence: the request-synthesis machinery both sweeps need is extracted to
`EndpointProbes`, so the new guard adds a second *caller* rather than a second *copy*.

**Persistence:** JDBC only (invariant #1). N/A — no table, no query, no migration; this slice
adds one test class and one Javadoc sentence.

**Source of intent:** GitHub issue #528.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's *"nothing pins it"* premise is **partially stale**: `EndpointRoleGateCoverageTest`
already covers the omission case generically, which re-aimed this slice at the genuinely
unpinned **role-specific** half and at the D-2 second principal type) · `riviera-plan-doc`
(this template — forced the Behavior-parity ledger, which is what surfaced that the new guard
must not silently duplicate the existing one, and the Module-ownership row) · `tdd` (each
probe written red-first; the two mutation proofs in Phase 1 are the red half that a
green-only guard can never demonstrate) · `riviera-review-overlay` (review gate — run at
ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD`,
2 findings, both patched — see *Docs-freshness run* below) ·
`riviera-java-conventions` (records/constants over magic literals, §6c one-line inline
comments — the long rationale goes in Javadoc, and the `PROBE_*` role constants are sourced
from production rather than re-spelled) · `riviera-modulith` (placement: the root **test**
package, because the slice imports the package-private `SecurityConfig` / `WebSliceStubs` and
the two `UserDetailsService` role constants — no module structure changes, no port, no
`allowedDependencies` edit) · `riviera-local-debug` (scoped `gradle --no-daemon` runs with the
JDK-25 toolchain; the #127 unique-`X-Forwarded-For` rule, which this slice needs badly at ~66
probe requests in one class) · `codebase-design` (added at the review gate, F-1 — its
"can I reduce the number of methods?" question shrank `EndpointProbes`' interface from four
package-private methods to **one**, `probe`; `verbOf`/`patternOf`/`concretePath` had no caller
outside the class and are now private, so the seam offers leverage without inviting a third
caller to assemble its own probe from the parts)

**Branch:** `claude/sdlc-528-wzuc8r` — the cloud session's designated remote branch stands in
for `feature/admin-endpoint-role-gate` (`riviera-sdlc` §Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the `/api/admin/**` endpoints the application actually maps — discovered
  from `RequestMappingHandlerMapping`, never a hand-maintained list — when each is requested by
  an authenticated **non-admin operator** principal (`ROLE_OPERATOR` only, exactly what
  `OperatorUserDetailsService` grants a `credential.admin() == false` account), then the
  security filter chain refuses it with **403** *before* `DispatcherServlet` dispatches.
  *Pinned by:* `AdminSurfaceRoleGateTest.plainOperatorReachesNoAdminEndpoint`
- [x] **AC-2:** Given the same discovered set, when each endpoint is requested by an
  authenticated **customer** principal (`ROLE_CUSTOMER` — the D-2 second principal type, whose
  separate authentication manager is why operator-only coverage is not the whole property),
  then the chain refuses it with **403** before dispatch.
  *Pinned by:* `AdminSurfaceRoleGateTest.customerReachesNoAdminEndpoint`
- [x] **AC-3 (omission case):** Given an `/api/admin/**` endpoint mapped with **no**
  `SecurityConfig` matcher at all — the actual #521-shaped failure, which arrives by omission
  rather than by an edit anyone reviews — when the guard runs, then it **fails naming that
  endpoint**. *Proven by:* a temporary fixture controller in Phase 1, evidence (the verbatim
  failure message) recorded in this doc, fixture removed before the PR.
- [x] **AC-4 (downgrade case):** Given one admin matcher flipped back to
  `hasRole(OPERATOR_ROLE)` — literally the pre-#521 `/api/admin/payout-batches` state — when
  the guard runs, then it **fails naming that endpoint**. *Proven by:* a temporary
  `SecurityConfig` mutation in Phase 1, evidence recorded, mutation reverted.
- [x] **AC-5 (non-vacuity):** Given the guard passes, then that pass is load-bearing: the
  discovered set is non-empty, contains a cross-module anchor set (so a `@WebMvcTest` that
  stopped registering module controllers cannot pass by discovering nothing), and an **ADMIN**
  principal *is* dispatched to every one of those same endpoints — which additionally catches
  a mis-typed role name (`hasRole("ADMINN")`) that denies admins and non-admins alike, a state
  both AC-1 and AC-2 would call green. *Pinned by:*
  `AdminSurfaceRoleGateTest.adminPrincipalReachesEveryAdminEndpoint` + the anchor assertion in
  `mappedAdminEndpoints`.
- [x] **AC-6:** Given the slice is complete, then **no production behaviour changed** — the
  only `platform/src/main` edit is Javadoc — and the structural test set
  (`ModularityTests`, `PackageShapeArchitectureTests`,
  `PublishedSurfacePlacementArchitectureTests`) stays green.
  *Pinned by:* those three classes + a `git diff` review of `SecurityConfig`.

## Non-goals

- **Widening the guard past `/api/admin/**`.** The whole-surface fall-through property is
  `EndpointRoleGateCoverageTest`'s job and it already holds; this slice adds the role-specific
  half for one namespace, and deliberately does not merge the two classes (see the ledger).
- **Asserting the converse** — that no *non*-admin path is accidentally ADMIN-gated. Nothing
  in the issue asks for it and it has no known failure history.
- **Moving, renaming, adding or re-roling any matcher, controller or path** (issue AC-5).
- **Anonymous / unauthenticated coverage.** An anonymous caller gets `401` from the
  entry point; that is a different property, already covered where it matters.
- **Actuator endpoints.** `WebMvcEndpointHandlerMapping` entries are not `@WebMvcTest`-loaded
  and keep their own exposure lockdown (#75) — the same scope line `EndpointRoleGateCoverageTest`
  draws.
- **Fixing the pre-existing duplicated `ai.riviera.platform.shared.ResubmissionOutcome` imports
  in `WebSliceStubs.java`** — real, unrelated, and out of this slice's scope; raised separately.

## Behavior-parity ledger (retirement / replacement slices only)

> This slice retires nothing, but it lands **beside** an existing guard whose scope it partly
> overlaps — so the ledger is repurposed to prove the overlap is deliberate and that the older
> guard keeps every behavior it has today. Getting this wrong in the other direction (folding
> the new assertions into `EndpointRoleGateCoverageTest`) would have coupled a whole-surface
> guard to one namespace's role policy.

| `EndpointRoleGateCoverageTest` behavior | Verdict | How it stands after this slice |
|---|---|---|
| Enumerates **every** mapped endpoint, all namespaces | preserved | Untouched. The new class filters to `/api/admin/`; the old one keeps the whole surface. |
| Probes with `PROBE_ROLE = "NOBODY"` — a role granted nowhere | preserved | Untouched, and deliberately **not** reused: a role nobody holds cannot distinguish `hasRole(ADMIN)` from `hasRole(OPERATOR)`, which is the exact blindness #528 exists to close. |
| Pins *that a gate exists*, never *which role it names* | preserved | Still its stated contract (`docs/plans/a4-payout-batches-admin-role.md`). The new class owns the role-naming half; neither grows the other's job. |
| Catches the omission case for any namespace | preserved | Still true. The new class re-catches it **within `/api/admin/**`** with a failure message that names the admin property — belt and braces on the highest-value namespace, not a replacement. |
| `DECLARED_REACHABLE` allow-list with a per-line reason | preserved | Untouched. The new class needs **no** allow-list: every `/api/admin/**` endpoint is ADMIN-gated with no exceptions, and if that ever stops being true, adding an exception should be hard. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The guard passes vacuously** — the web slice registers no module controllers, so the discovered admin set is empty and every assertion is over nothing. This is the dominant failure mode for a discovery-based test. | med | high | Three independent anchors: non-empty assertion, a cross-module anchor set spanning root + `venue` + `notification` + `payout` + `booking`, and the ADMIN positive control that proves dispatch is reachable at all (AC-5). | Claude | **closed** — all three anchors green; the AC-3 mutation independently proved the sweep sees a newly-mapped endpoint with no edit to the test. |
| R-2 | **A synthesized probe path 404s** (bad path-variable sample), so "not dispatched" is true for the wrong reason and the guard verifies nothing. | med | high | The status assertion is exact: a non-dispatched probe must carry **403**, never 401/404/405/429. A bad sample fails the guard loudly instead of passing it quietly — the same discriminator `EndpointRoleGateCoverageTest` uses. | Claude | **closed** — the exact-403 rule held for all 22 endpoints under both principals; no probe answered 404/405. |
| R-3 | **Full-suite-only rate-limit failure (#127/#129).** This class fires ~66 probes; `RateLimitFilter` sits *ahead of* authorization in a **cached** context, so a shared client IP would turn a green scoped run into a CI wall of `429`s — and a `429` is exactly what R-2's status check would then report. | med | high | Every probe carries a unique `X-Forwarded-For` from `SessionLoginSupport.uniqueClientIp()`, which mints untrusted `198.18.x.y` (RFC 2544) — not an RFC1918 value the #129 trusted-proxy resolver would skip. Verified by the PR's CI run, not by the scoped run. | Claude | **closed locally, CI-confirmed at the PR** — every probe takes `uniqueClientIp()`; scoped green is not proof, so the PR's CI run is the verification (riviera-sdlc CI-gate rule). |
| R-4 | **The probe principal drifts from the real one** — someone changes what `OperatorUserDetailsService` grants, and the guard keeps testing the old authority, going green against a principal that no longer exists. | low | med | The probe roles are **read from the production constants**, not re-spelled as literals; a change to either constant changes the probe in the same commit. | Claude | **closed** — probe roles read from `OperatorUserDetailsService.OPERATOR_ROLE`/`.ADMIN_ROLE` and `CustomerUserDetailsService.CUSTOMER_ROLE`; no role literal is spelled in the test. |
| R-5 | **The ADMIN positive control is flaky** — a stub returning `null` or a `{}` body failing validation makes an endpoint answer 400/500. | med | low | The control asserts **dispatch** (`getHandler() != null`), not status. Handler selection precedes body binding, validation and every stub interaction, so a 400/500 still proves the point. | Claude | **closed, and it fired** — sharper than predicted: `PATCH /api/admin/payout-batches/*` does not answer 400, it *throws* (`BatchStatus.valueOf(null)`), so `perform` never returns a result. Handled by treating a thrown dispatch as admission, which is sound one-directionally — Spring Security refuses by *writing* 401/403, never by throwing. |
| R-6 | **The guard is trusted without ever being seen red.** A green-only tripwire is indistinguishable from a tripwire that cannot fire — the issue calls this out for both cases. | med | high | Phase 1 mutates the tree twice (omission fixture, matcher downgrade), records the verbatim failure output in this doc, and reverts. Phase 2 does not start until both are recorded. | Claude | **closed** — both mutations recorded verbatim in *Mutation evidence*; tree confirmed clean before Phase 2. |
| R-7 | **Boundary leak (invariant #11)** — a root-package test reaching into module internals to enumerate controllers. | low | med | Enumeration is via the framework's `RequestMappingHandlerMapping`; no module type is imported. `ModularityTests` + `PackageShapeArchitectureTests` re-run (AC-6). | Claude | **closed** — structural set green; the test imports no module type. |

## Open questions / Assumptions

### Resolved

- **Assumption:** `@WebMvcTest` registers the admin controllers that live inside modules
  (`venue`/`notification`/`payout`/`booking` `adapter/in`), not only root-package ones —
  strongly implied by `WebSliceStubs` already stubbing their exact collaborators
  (`MailOutboxStatus`, `RefundOutboxStatus`, `MailDeliveryLookup`, `OperatorLifecycle`,
  `AccountErasure`, …). — *Owner:* Claude · *Resolves by:* Phase 0 Step 2, where the anchor
  assertion (R-1) turns the assumption into a machine-checked fact. — **Resolved:** true. All five cross-module anchors
  were discovered; 22 admin endpoints across 10 controllers in root + 4 modules were swept.
- **Assumption:** no `/api/admin/**` path sits in a `RateLimitFilter` budget, so the probes
  spend only the default per-IP budget. Unique IPs make this moot either way. — *Owner:*
  Claude · *Resolves by:* Phase 0 Step 4. — **Resolved:** true; no probe answered 429, and unique
  IPs make the question moot regardless.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds a test and one Javadoc sentence; it writes
no `availability(set_id, booking_date)` row, touches no booking path, and changes no runtime
code.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(none — the application root)* | existing | n/a | Login/session/authorization machinery lives at the **platform edge, never in a module** (RV-BE-11). `SecurityConfig` is root-package app-wide config, so its guard is a root-package test — the same placement as `EndpointRoleGateCoverageTest`, `MeSurfaceRoleGateTest` and `VenueWriteRoleGateTest`. |

**Cross-module named interfaces (`api/` ports)**

N/A — no port added, changed or consumed. The test imports no module type.

**Domain events (id-based payloads, invariant #11)**

N/A — no event published, consumed or moved; no `event_type` rewrite.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| "Assert every mapped `/api/admin/**` endpoint refuses both non-admin principal types" | application root (no module) | The asserted property belongs to `SecurityConfig`, which is root-package app-wide config by `riviera-modulith`'s explicit rule ("keep `@SpringBootApplication` and app-wide config (`SecurityConfig`, …) in the root package only"). No module's **Job** covers role gating: `operator` owns accounts + the ownership *mapping*, and its Not-My-Job is exactly the login/session subsystem (RV-BE-11). Nothing lands on another module's Not-My-Job list, and no two modules claim it. |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; no charge, refund, commission or ledger path is
read or written. `POST /api/admin/payout-batches` and `PATCH /api/admin/payout-batches/{id}`
are *probed* as endpoints, but only ever to assert the filter chain refuses a non-admin — the
probes never reach a handler, and the ADMIN positive control reaches a `WebSliceStubs` stub,
never a real ledger.

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, status code or error body moves.

## Execution status

**Stage pointer:** `merge close-out — all three gates run and green; merged via PR #541`

**Next action:** None pending in-repo. Post-merge remainder is GitHub-only (no commit): confirm
issue #528 closed by the PR's `Closes #528`. This slice belongs to no tracking epic, so there is
no epic checklist to tick (close-out step 2 is N/A).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The guard (discover + probe both principal types) | ✅ | `39adb6a` |
| 1 — Prove it fails: omission + downgrade mutations | ✅ | evidence-only, no code shipped (see *Mutation evidence*) |
| 2 — Docs freshness + close-out | ✅ | `39adb6a` (Javadoc) · `f7db4dc` (docs-freshness patches) |
| 3 — Review-gate fix round | ✅ | `157226e` (F-1) · `8cc99e6` (SHA citation) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review gate (`/code-review` agent #4, prior-PR recurrence) | **RV-PROC-1** — *Skills consulted* omitted `codebase-design` although the slice makes a seam decision (share vs duplicate → `EndpointProbes`). The recurring #447/#459/#516 omission. Note the review split on it: the overlay agent read the routing table literally (no module/port/adapter in the diff → row does not fire) and passed the item. Both readings have merit, and loading the skill settled it **in favour of the finding** — it produced a real code change, which is the whole argument for the gate. | **fixed in `157226e`** — loaded `codebase-design`, re-vetted the seam, made `verbOf`/`patternOf`/`concretePath` private (interface 4 → 1 method), documented why, updated the *Skills consulted* line. |
| F-2 | CI (CodeQL) | Both CodeQL runs on the branch concluded `failure` with their `Analyze` jobs **cancelled** after ~15 min — never leaving `queued`, so they never ran (the workflow's own cap is `timeout-minutes: 20`). Not a base-branch failure: CodeQL is green on `main` across the six most recent runs, including this PR's base `108f958`. Not plausibly caused by the diff either — `build-mode: none` extracts source, and the diff is one test class, one test helper and Javadoc. | **closed — infrastructure, not the diff.** The re-run of `31122752766` completed **success** with no code change, confirming queue starvation rather than a finding. Recorded here rather than silently re-run, because "a scan that was cancelled" and "a scan that passed" are not the same evidence. |

---

## File structure

- `docs/plans/admin-endpoint-role-gate.md` — this plan doc.
- `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java` — **new**: the
  guard. Discovers `/api/admin/**` mappings, probes each with a plain operator, a customer and
  an admin principal, and carries the anchor + status assertions that make a pass load-bearing.
- `platform/src/test/java/ai/riviera/platform/EndpointProbes.java` — **new**: the request-synthesis
  machinery (path-variable samples, `csrf()`, the unique `X-Forwarded-For`), extracted so the two
  endpoint-sweep guards share one definition instead of two copies that can drift. Not merely a
  duplication fix: getting this synthesis wrong is R-2, and one home means it is verified once.
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — **modified**:
  now consumes `EndpointProbes` (its private `probe`/`concretePath` and their constants moved
  there verbatim), and its Javadoc gains the *role-agnostic by design* paragraph naming the new
  guard as the owner of the role-specific half. **No assertion, allow-list entry or probe
  principal changed** — the sole reason to touch a shipped tripwire.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — **Javadoc only** (no
  behaviour change): name the new guard on the `ADMIN_ROLE` constant, mirroring the existing
  `EndpointRoleGateCoverageTest` pointer on `BEACH_MAP_PATH`, so the next author adding an admin
  endpoint learns which test will fail and why.
- `.claude/skills/riviera-review-overlay/references/backend-conventions.md` — **docs-freshness
  finding** (step 3): RV-BE-9 named a pinning test for the venue-scoped half of invariant #13 and
  none for the `/api/admin/**` half, because none existed. Now cites `AdminSurfaceRoleGateTest`.

---

## Phase 0 — The guard

**Files:** Create `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java`

- [x] **Step 1: Write the failing test** — authored red-first against a guard that does not
  exist yet; the first run must fail to compile, then fail on the anchor assertion if the web
  slice does not register module controllers (Assumption 1).
- [x] **Step 2: Run it, verify it fails** —
  `gradle --no-daemon --console=plain test --tests "*AdminSurfaceRoleGateTest*"`
- [x] **Step 3: Minimal implementation** — the enumeration + probe helpers.
- [x] **Step 4: Run it, verify it passes** — same command → PASS.
- [x] **Step 5: Generalization-audit pass.**
- [x] **Step 6: Commit** — `git commit -m "Machine-check the /api/admin/** ADMIN gate (#528)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Prove it fails (AC-3, AC-4)

**Files:** temporary mutations only — nothing from this phase reaches the PR.

- [x] **Step 1 (omission, AC-3):** add a test-scoped fixture controller mapping a new
  `/api/admin/**` endpoint with **no** `SecurityConfig` matcher; run the guard; record the
  verbatim failure; delete the fixture.
- [x] **Step 2 (downgrade, AC-4):** flip one admin matcher to `hasRole(OPERATOR_ROLE)`; run
  the guard; record the verbatim failure; revert.
- [x] **Step 3:** paste both outputs into the *Mutation evidence* section below.
- [x] **Step 4:** confirm `git status` is clean of both mutations before Phase 2.

## Phase 2 — Docs freshness + close-out

- [x] **Step 1:** `SecurityConfig` Javadoc pointer to the new guard.
- [x] **Step 2:** structural test set green (AC-6).
- [x] **Step 3:** run both repo-hygiene guards
  (`node scripts/check-inline-comments.mjs --diff origin/main`,
  `node scripts/check-plan-file-structure.mjs --diff origin/main`).
- [x] **Step 4:** finalize Execution status in this PR's own last commit, citing
  `merged via PR #NN`.

---

## Mutation evidence (Phase 1 output)

> A guard nobody has seen fail is a guard nobody should trust (R-6). Both mutations were applied
> to a working tree, run, recorded verbatim, and reverted; `git status` was confirmed clean of
> both before Phase 2 began.

**AC-4 — the downgrade case.** `GET /api/admin/audit` flipped from `hasRole(ADMIN_ROLE)` to
`hasRole(OPERATOR_ROLE)` — literally the pre-#521 `/api/admin/payout-batches` state:

```
AdminSurfaceRoleGateTest > plainOperatorReachesNoAdminEndpoint() FAILED
java.lang.AssertionError: [every mapped /api/admin/** endpoint must be gated to ROLE_ADMIN and
refuse a plain operator; gate a new one with an explicit requestMatchers(...).hasRole(ADMIN_ROLE)
rule in SecurityConfig]
Expecting empty but was: ["GET /api/admin/audit reached
  ai.riviera.platform.AdminAuditController#audit(Integer) — it is not gated to ROLE_ADMIN,
  so a plain operator passes the filter chain"]
```

`customerReachesNoAdminEndpoint` stayed green, correctly — a customer holds no `OPERATOR`
authority, so only the operator probe can see this particular downgrade. That asymmetry is
precisely why AC-2 exists as its own sweep rather than as a second assertion in the first.

**AC-3 — the omission case.** A temporary `UngatedAdminFixture` mapping
`GET /api/admin/forgotten-surface`, with no `SecurityConfig` matcher at all:

```
AdminSurfaceRoleGateTest > plainOperatorReachesNoAdminEndpoint() FAILED
AdminSurfaceRoleGateTest > customerReachesNoAdminEndpoint()      FAILED
Expecting empty but was: ["GET /api/admin/forgotten-surface reached
  ai.riviera.platform.UngatedAdminFixture#forgotten() — it is not gated to ROLE_ADMIN,
  so a signed-in customer passes the filter chain"]
```

Both principal types caught it, and neither needed an edit to this test to know the endpoint
existed — which is the discovery property (issue approach 2) doing exactly the job a
hand-maintained list structurally cannot.

---

## Gate results (PR #541)

| Gate | Outcome |
|---|---|
| CI | Green — backend, frontend, repo hygiene (both diff-scoped guards). **R-3 closed here and only here:** the ~66 probes survived the cached-context full-suite run with no `429`, which a scoped run cannot demonstrate. |
| CodeQL | Green on re-run (F-2 — the first two attempts were queue starvation, never executed). |
| Review | Ran at high effort, 6 dimensions. 1 finding (F-1), fixed in `157226e`. |
| Sonar | Green **and its reported list verified empty via the API**, not inferred from the badge: `measures` populated (`new_lines` 15) and the `SonarCloud Code Analysis` check `success`, which together rule out the false-clean read where an unanalyzed PR returns the same `total: 0` as a genuinely clean one. `new_code_smells` 0, `new_duplicated_blocks` 0. |

## Docs-freshness run (`origin/main..HEAD`)

> Merge close-out step 5, run pre-merge as the cheapest moment.

- **2a — rename/removal grep:** nothing renamed or removed by this slice. `EndpointProbes`
  is new; `EndpointRoleGateCoverageTest` keeps its name, assertions and allow-list. Grepping
  the substrate set for `EndpointRoleGateCoverageTest` returns **zero** hits outside historical
  plan docs (`a4-payout-batches-admin-role.md`, `operator-self-service-password.md`), which are
  records, not living docs (§Scope discipline) — left as-is.
- **2b — counting sweep:** this slice adds the **second** endpoint-sweep guard, so any sentence
  saying "the guard" of that kind would now be false. Swept `platform/src`, `CLAUDE.md`,
  `RESPONSIBILITIES.md`, `docs/adr`, `docs/agents`, `.claude/skills` for
  `the/both/only two|three` narrowed to guard/gate/role/admin/tripwire vocabulary. **Zero
  findings** — no doc counts the role-gate guards. (The one self-referential hit is this
  slice's own new Javadoc, "the two ways the property breaks", which is accurate.)
- **3 — reverse direction:** two findings, both **patched**:

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `SecurityConfig.java:70` | `ADMIN_ROLE` documented only as gating "the `/api/admin/operators/**` approval surface" — true when written, but the role has gated the whole namespace uniformly since #348 A4, and nothing told the next author a test now enforces it | this slice + #348 A4 | **patched** — the constant's Javadoc now states the uniformity and names the guard + both failure modes it catches |
| `riviera-review-overlay/references/backend-conventions.md:273` (RV-BE-9) | "Platform-wide `/api/admin/**` is role-gated and exempt" — still true, but the item cites `CrossVenueDenialIT` as the pin for the venue-scoped half and named no pin for the admin half, leaving a reviewer to check that gate by hand | this slice | **patched** — cites `AdminSurfaceRoleGateTest`, mirroring the existing citation pattern |

- **Re-sweep after the fix round** (the skill's own step 2b warning): re-ran both greps after
  patching. No new hits; neither patch introduces a count or an identifier the other docs name.
- **Graph refresh:** N/A — `graphify-out/` is absent in this cloud clone (gitignored,
  regenerable), so there is nothing to update.

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-06 | Phase 0 — the shared-probe extraction | Other tests hand-rolling endpoint-probe synthesis that would drift from `EndpointProbes` | `grep -rn "PATH_VARIABLE_SAMPLES\|concretePath" platform/src/test` | 2 (both now the shared helper's own definition) | **Fixed all** — `EndpointRoleGateCoverageTest` moved onto the helper rather than the new guard copying it. `MeSurfaceRoleGateTest`/`VenueWriteRoleGateTest` drive *named* endpoints, not sweeps, so they need no synthesis and were deliberately left alone. |
| 2026-08-06 | Phase 1 — R-5's sharper form (a handler that throws, not 400s) | Whether the same "dispatched" discriminator is used elsewhere and would break the same way | `grep -rn "getHandler()" platform/src/test` | 3 (`EndpointRoleGateCoverageTest`, `MeSurfaceRoleGateTest`, this guard) | **Skipped for the other two, deliberately** — both assert `getHandler()` is **null** (a *rejection*), which no thrown handler exception can fake; only the positive-control direction is exposed to it, and only this guard has one. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `gradle … --tests "*AdminSurfaceRoleGateTest*"` → PASS.
- [x] **AC-2:** Same run → PASS.
- [x] **AC-3:** Mutation evidence section records the omission failure.
- [x] **AC-4:** Mutation evidence section records the downgrade failure.
- [x] **AC-5:** Same run → PASS, anchors included.
- [x] **AC-6:** Structural test set green; `SecurityConfig` diff is Javadoc-only.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (justified N/A); no availability write path in scope (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event payloads (invariant #11).
- [x] **Payment/payout** section filled (justified N/A) (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10) — N/A, unchanged.
- [x] Timezone correct (invariant #6) — N/A, no time arithmetic.
- [x] Booking codes unguessable (invariant #7) — N/A; no booking code is logged or probed.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented — N/A, backend-only.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — citing `merged via PR #541`, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — `/code-review`'s agent fan-out (5 dimensions) *plus* a
      sixth agent walking `riviera-review-overlay`'s backend bank, at **high effort** (the slice
      touches authorization). 1 finding (F-1), fixed and re-verified; outcome posted on PR #541.
