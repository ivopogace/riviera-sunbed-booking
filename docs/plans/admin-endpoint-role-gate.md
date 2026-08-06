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
ready-for-review) · `riviera-docs-freshness` (**ran** over this slice's own diff range,
1 finding — `SecurityConfig`'s guard-naming Javadoc, patched in Phase 2) ·
`riviera-java-conventions` (records/constants over magic literals, §6c one-line inline
comments — the long rationale goes in Javadoc, and the `PROBE_*` role constants are sourced
from production rather than re-spelled) · `riviera-modulith` (placement: the root **test**
package, because the slice imports the package-private `SecurityConfig` / `WebSliceStubs` and
the two `UserDetailsService` role constants — no module structure changes, no port, no
`allowedDependencies` edit) · `riviera-local-debug` (scoped `gradle --no-daemon` runs with the
JDK-25 toolchain; the #127 unique-`X-Forwarded-For` rule, which this slice needs badly at ~66
probe requests in one class)

**Branch:** `claude/sdlc-528-wzuc8r` — the cloud session's designated remote branch stands in
for `feature/admin-endpoint-role-gate` (`riviera-sdlc` §Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the `/api/admin/**` endpoints the application actually maps — discovered
  from `RequestMappingHandlerMapping`, never a hand-maintained list — when each is requested by
  an authenticated **non-admin operator** principal (`ROLE_OPERATOR` only, exactly what
  `OperatorUserDetailsService` grants a `credential.admin() == false` account), then the
  security filter chain refuses it with **403** *before* `DispatcherServlet` dispatches.
  *Pinned by:* `AdminSurfaceRoleGateTest.plainOperatorReachesNoAdminEndpoint`
- [ ] **AC-2:** Given the same discovered set, when each endpoint is requested by an
  authenticated **customer** principal (`ROLE_CUSTOMER` — the D-2 second principal type, whose
  separate authentication manager is why operator-only coverage is not the whole property),
  then the chain refuses it with **403** before dispatch.
  *Pinned by:* `AdminSurfaceRoleGateTest.customerReachesNoAdminEndpoint`
- [ ] **AC-3 (omission case):** Given an `/api/admin/**` endpoint mapped with **no**
  `SecurityConfig` matcher at all — the actual #521-shaped failure, which arrives by omission
  rather than by an edit anyone reviews — when the guard runs, then it **fails naming that
  endpoint**. *Proven by:* a temporary fixture controller in Phase 1, evidence (the verbatim
  failure message) recorded in this doc, fixture removed before the PR.
- [ ] **AC-4 (downgrade case):** Given one admin matcher flipped back to
  `hasRole(OPERATOR_ROLE)` — literally the pre-#521 `/api/admin/payout-batches` state — when
  the guard runs, then it **fails naming that endpoint**. *Proven by:* a temporary
  `SecurityConfig` mutation in Phase 1, evidence recorded, mutation reverted.
- [ ] **AC-5 (non-vacuity):** Given the guard passes, then that pass is load-bearing: the
  discovered set is non-empty, contains a cross-module anchor set (so a `@WebMvcTest` that
  stopped registering module controllers cannot pass by discovering nothing), and an **ADMIN**
  principal *is* dispatched to every one of those same endpoints — which additionally catches
  a mis-typed role name (`hasRole("ADMINN")`) that denies admins and non-admins alike, a state
  both AC-1 and AC-2 would call green. *Pinned by:*
  `AdminSurfaceRoleGateTest.adminPrincipalReachesEveryAdminEndpoint` + the anchor assertion in
  `mappedAdminEndpoints`.
- [ ] **AC-6:** Given the slice is complete, then **no production behaviour changed** — the
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
| R-1 | **The guard passes vacuously** — the web slice registers no module controllers, so the discovered admin set is empty and every assertion is over nothing. This is the dominant failure mode for a discovery-based test. | med | high | Three independent anchors: non-empty assertion, a cross-module anchor set spanning root + `venue` + `notification` + `payout` + `booking`, and the ADMIN positive control that proves dispatch is reachable at all (AC-5). | Claude | open |
| R-2 | **A synthesized probe path 404s** (bad path-variable sample), so "not dispatched" is true for the wrong reason and the guard verifies nothing. | med | high | The status assertion is exact: a non-dispatched probe must carry **403**, never 401/404/405/429. A bad sample fails the guard loudly instead of passing it quietly — the same discriminator `EndpointRoleGateCoverageTest` uses. | Claude | open |
| R-3 | **Full-suite-only rate-limit failure (#127/#129).** This class fires ~66 probes; `RateLimitFilter` sits *ahead of* authorization in a **cached** context, so a shared client IP would turn a green scoped run into a CI wall of `429`s — and a `429` is exactly what R-2's status check would then report. | med | high | Every probe carries a unique `X-Forwarded-For` from `SessionLoginSupport.uniqueClientIp()`, which mints untrusted `198.18.x.y` (RFC 2544) — not an RFC1918 value the #129 trusted-proxy resolver would skip. Verified by the PR's CI run, not by the scoped run. | Claude | open |
| R-4 | **The probe principal drifts from the real one** — someone changes what `OperatorUserDetailsService` grants, and the guard keeps testing the old authority, going green against a principal that no longer exists. | low | med | The probe roles are **read from the production constants**, not re-spelled as literals; a change to either constant changes the probe in the same commit. | Claude | open |
| R-5 | **The ADMIN positive control is flaky** — a stub returning `null` or a `{}` body failing validation makes an endpoint answer 400/500. | med | low | The control asserts **dispatch** (`getHandler() != null`), not status. Handler selection precedes body binding, validation and every stub interaction, so a 400/500 still proves the point. | Claude | open |
| R-6 | **The guard is trusted without ever being seen red.** A green-only tripwire is indistinguishable from a tripwire that cannot fire — the issue calls this out for both cases. | med | high | Phase 1 mutates the tree twice (omission fixture, matcher downgrade), records the verbatim failure output in this doc, and reverts. Phase 2 does not start until both are recorded. | Claude | open |
| R-7 | **Boundary leak (invariant #11)** — a root-package test reaching into module internals to enumerate controllers. | low | med | Enumeration is via the framework's `RequestMappingHandlerMapping`; no module type is imported. `ModularityTests` + `PackageShapeArchitectureTests` re-run (AC-6). | Claude | open |

## Open questions / Assumptions

- **Assumption:** `@WebMvcTest` registers the admin controllers that live inside modules
  (`venue`/`notification`/`payout`/`booking` `adapter/in`), not only root-package ones —
  strongly implied by `WebSliceStubs` already stubbing their exact collaborators
  (`MailOutboxStatus`, `RefundOutboxStatus`, `MailDeliveryLookup`, `OperatorLifecycle`,
  `AccountErasure`, …). — *Owner:* Claude · *Resolves by:* Phase 0 Step 2, where the anchor
  assertion (R-1) turns the assumption into a machine-checked fact.
- **Assumption:** no `/api/admin/**` path sits in a `RateLimitFilter` budget, so the probes
  spend only the default per-IP budget. Unique IPs make this moot either way. — *Owner:*
  Claude · *Resolves by:* Phase 0 Step 4.

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

**Stage pointer:** `plan — authored, awaiting Phase 0`

**Next action:** Phase 0 Step 1 — write `AdminSurfaceRoleGateTest` and run it scoped
(`gradle --no-daemon --console=plain test --tests "*AdminSurfaceRoleGateTest*"`).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The guard (discover + probe both principal types) | | |
| 1 — Prove it fails: omission + downgrade mutations | | |
| 2 — Docs freshness + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/admin-endpoint-role-gate.md` — this plan doc.
- `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java` — **new**: the
  guard. Discovers `/api/admin/**` mappings, probes each with a plain operator, a customer and
  an admin principal, and carries the anchor + status assertions that make a pass load-bearing.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — **Javadoc only** (no
  behaviour change): name the new guard where the admin constants are declared, mirroring the
  existing `EndpointRoleGateCoverageTest` pointer on `BEACH_MAP_PATH`, so the next author
  adding an admin endpoint learns which test will fail and why.

---

## Phase 0 — The guard

**Files:** Create `platform/src/test/java/ai/riviera/platform/AdminSurfaceRoleGateTest.java`

- [ ] **Step 1: Write the failing test** — authored red-first against a guard that does not
  exist yet; the first run must fail to compile, then fail on the anchor assertion if the web
  slice does not register module controllers (Assumption 1).
- [ ] **Step 2: Run it, verify it fails** —
  `gradle --no-daemon --console=plain test --tests "*AdminSurfaceRoleGateTest*"`
- [ ] **Step 3: Minimal implementation** — the enumeration + probe helpers.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Machine-check the /api/admin/** ADMIN gate (#528)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Prove it fails (AC-3, AC-4)

**Files:** temporary mutations only — nothing from this phase reaches the PR.

- [ ] **Step 1 (omission, AC-3):** add a test-scoped fixture controller mapping a new
  `/api/admin/**` endpoint with **no** `SecurityConfig` matcher; run the guard; record the
  verbatim failure; delete the fixture.
- [ ] **Step 2 (downgrade, AC-4):** flip one admin matcher to `hasRole(OPERATOR_ROLE)`; run
  the guard; record the verbatim failure; revert.
- [ ] **Step 3:** paste both outputs into the *Mutation evidence* section below.
- [ ] **Step 4:** confirm `git status` is clean of both mutations before Phase 2.

## Phase 2 — Docs freshness + close-out

- [ ] **Step 1:** `SecurityConfig` Javadoc pointer to the new guard.
- [ ] **Step 2:** structural test set green (AC-6).
- [ ] **Step 3:** run both repo-hygiene guards
  (`node scripts/check-inline-comments.mjs --diff origin/main`,
  `node scripts/check-plan-file-structure.mjs --diff origin/main`).
- [ ] **Step 4:** finalize Execution status in this PR's own last commit, citing
  `merged via PR #NN`.

---

## Mutation evidence (Phase 1 output)

> Filled in Phase 1. A guard nobody has seen fail is a guard nobody should trust (R-6).

*(pending Phase 1)*

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle … --tests "*AdminSurfaceRoleGateTest*"` → PASS.
- [ ] **AC-2:** Same run → PASS.
- [ ] **AC-3:** Mutation evidence section records the omission failure.
- [ ] **AC-4:** Mutation evidence section records the downgrade failure.
- [ ] **AC-5:** Same run → PASS, anchors included.
- [ ] **AC-6:** Structural test set green; `SecurityConfig` diff is Javadoc-only.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A); no availability write path in scope (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event payloads (invariant #11).
- [ ] **Payment/payout** section filled (justified N/A) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A, unchanged.
- [ ] Timezone correct (invariant #6) — N/A, no time arithmetic.
- [ ] Booking codes unguessable (invariant #7) — N/A; no booking code is logged or probed.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented — N/A, backend-only.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
