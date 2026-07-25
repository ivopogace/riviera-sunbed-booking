# Explicit CUSTOMER matcher for the whole `/api/me/**` surface — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Role-gate every `/api/me/**` endpoint to `ROLE_CUSTOMER` **at the security filter
layer**, so `POST /api/me/password` and `POST /api/me/verify-email/request` stop falling through
to `.anyRequest().authenticated()` — and pin the gate with a test that fails if the matcher is
removed.

**Architecture:** One **method-agnostic** matcher — `.requestMatchers("/api/me/**").hasRole(CUSTOMER)`
— replaces the two method-scoped rules (`GET /api/me/**` and `POST /api/me/erasure`). The single
significant decision is *method-agnostic over method-scoped*: `/api/me/**` is by definition the
session customer's own resources, and the method-scoped shape is precisely the defect — it has
already let a POST fall through twice (#316 patched erasure only; #317 is the rest). A namespace
rule fails **closed** for any future verb instead of silently falling through.

**Persistence:** JDBC only (invariant #1). **No migration** — no schema change whatsoever; latest
Flyway on `main` stays **V30** (`V30__customer_erasure_marker.sql`).

**Source of intent:** GitHub issue **#317** (surfaced by the PR #316 review gate as a pre-existing gap).

**Skills consulted:**
- `riviera-sdlc` — pipeline routing; issue-intake grill gate before planning.
- `riviera-plan-doc` — this doc's structure; slim per SDLC rule 6.
- `riviera-modulith` — confirmed `SecurityConfig` and the new slice test stay in the **root**
  package (edge, not a module); no module surface, no `allowedDependencies`, no `spi`/`api` change.
- `riviera-java-conventions` — named constant over a repeated literal (§6a), one-line-or-none
  inline comments with the long rationale in Javadoc (§6c), JUnit 5 + existing assertion style (§9).
- `riviera-local-debug` — scoped `--tests` runs on this local machine (`./gradlew` works; Docker
  present so ITs really run); CI owns the full suite.
- `riviera-review-overlay` — loaded at the review gate (RV-BE-9/RV-BE-11 + RV-PROC-1), **high
  effort, no exceptions**, because the diff touches authorization.
- `postgres` — **not loaded, correctly**: no migration, no SQL, no schema in scope.
- `angular-developer` / `riviera-frontend` / `playwright-cli` — **not loaded, correctly**:
  backend-only, no observable client behavior change.

**Branch:** `feature/me-customer-matcher` (created before phase 0)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an authenticated **operator** session, when it `POST`s `/api/me/password`,
      then the request is rejected `403` **without the application ever being invoked** — MVC never
      dispatches a handler and no account collaborator is touched.
      *Pinned by:* `MeSurfaceRoleGateTest.operatorPostToSetPasswordIsRejectedBeforeTheController`
- [ ] **AC-2:** Given an authenticated **operator** session, when it `POST`s
      `/api/me/verify-email/request`, then the request is rejected `403` before MVC dispatch, and no
      verification mail is issued.
      *Pinned by:* `MeSurfaceRoleGateTest.operatorPostToRequestVerificationIsRejectedBeforeTheController`
- [ ] **AC-3 (the discriminating one):** The rejection in AC-1/AC-2 is attributable to the **filter
      layer**, not to `CurrentCustomer.require`. Both layers emit a byte-identical
      `403 ACCESS_DENIED` RFC-7807 body (verified: `SecurityProblemResponses.ACCESS_DENIED_BODY`
      vs `ApiErrorHandler.onAccessDenied` — same `code`, same `detail`), so **status and body prove
      nothing**. The test's discriminator is `MvcResult#getHandler()`: `null` ⇒ the security chain
      short-circuited before `DispatcherServlet`; non-`null` ⇒ the controller was reached. A
      **positive control** in the same class asserts a genuine CUSTOMER request *does* resolve a
      handler, so the assertion is proven to vary.
      *Pinned by:* the two tests above + `MeSurfaceRoleGateTest.customerRequestDoesReachTheController`
      *Red-first requirement:* both operator tests **must fail against unmodified `main`**. If either
      passes before the `SecurityConfig` change, the test is wrong and must be fixed — not the code.
- [ ] **AC-4:** Given a genuine **CUSTOMER** session, when it calls any `/api/me/**` endpoint, then
      behavior is byte-for-byte unchanged (`204` on set-password / verification-request, `200` on
      `GET /api/me/bookings`, `204` on erasure).
      *Pinned by:* `MeSurfaceRoleGateTest.customerRequestDoesReachTheController` + the unchanged
      `MeErasureControllerTest`, `SetPasswordIT`, `MyBookingsIT`, `AccountRecoveryIT`.
- [ ] **AC-5:** Collapsing the two old rules loses no coverage: erasure (`POST /api/me/erasure`) and
      my-bookings (`GET /api/me/bookings`) remain CUSTOMER-gated at the filter after the rewrite.
      *Pinned by:* the unchanged `MeErasureControllerTest.operatorSessionIsForbiddenAndNothingIsErased`
      + `MyBookingsIT.operatorSessionIsForbidden`.

## Non-goals

- **No change to `CurrentCustomer`.** Its controller-side `403` stays exactly as is — it is the
  defence-in-depth second layer, and removing it is the opposite of this slice's intent.
- **No change to `/api/auth/me`.** Different prefix, deliberately principal-agnostic (both operator
  and customer sessions read it); the `/api/me/**` matcher does not and must not match it.
- **No new endpoints, no DTO change, no error-contract change** — the `403 ACCESS_DENIED` body is
  already what both layers emit.
- **No frontend change.** A customer session sees identical responses; the SPA is untouched.
- **No rate-limit change.** `/api/me/verify-email/request` keeps its existing recovery bucket
  (`RateLimitFilter:123`).

## Behavior-parity ledger

> The slice *replaces* two existing `SecurityConfig` rules, so the ledger applies to them.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `GET /api/me/**` → `hasRole(CUSTOMER)` (anonymous 401, operator 403) | **preserved** | subsumed by the method-agnostic `/api/me/**` rule; `MyBookingsIT` unchanged and still green |
| `POST /api/me/erasure` → `hasRole(CUSTOMER)` (#316) | **preserved** | subsumed by the same rule; `MeErasureControllerTest` unchanged and still green (AC-5) |
| `POST /api/me/password` → *unmatched*, fell through to `anyRequest().authenticated()` | **changed (intended)** | now `403` at the filter for a non-customer principal instead of reaching the controller and being `403`d by `CurrentCustomer` (AC-1) |
| `POST /api/me/verify-email/request` → *unmatched*, same fall-through | **changed (intended)** | same as above (AC-2) |
| Undefined verbs under `/api/me/**` (e.g. `DELETE /api/me/bookings`) → authenticated operator got `405` | **changed (intended)** | now `403` for a non-customer. Strictly safer and stops the surface advertising which verbs exist; no customer-visible change (a CUSTOMER still gets `405`). |
| `403` response body / `code` on any of the above | **preserved** | both layers already emit the identical `ACCESS_DENIED` RFC-7807 body — this is exactly why AC-3 needs a structural discriminator |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **The test passes without the fix** — `CurrentCustomer.require` already 403s an operator, so a status-only assertion pins nothing and ships a green-but-vacuous test | high | high | AC-3's `MvcResult#getHandler()` discriminator + a positive control; **red-first is a mandatory gate** — run the new tests against unmodified `SecurityConfig` and require FAIL before touching it | Ivo | open |
| R-2 | The blanket rule is only correct while every `/api/me/**` endpoint is customer-facing | low | high | Enumeration re-verified at implementation time from source, not from the issue: `git grep` over every `@*Mapping` in `platform/src/main/java` yields exactly four mappings, all customer-facing (table below). Documented in the `ME_PATHS` Javadoc so the next endpoint author sees the constraint | Ivo | open |
| R-3 | A method-agnostic rule accidentally captures a sibling path (`/api/auth/me`, or a future `/api/members`) | low | med | `/api/me/**` is prefix-anchored on a literal segment; `/api/auth/me` has a different prefix and is unmatched. Non-goal states it explicitly; `AuthSessionIT` (unchanged) covers `/api/auth/me` for both principal types | Ivo | open |
| R-4 | New `@WebMvcTest` slice fails to stand up because a controller gained a constructor dep (recurring trap in this repo — #128 added two to `MyAccountController`) | med | low | Verified `WebSliceStubs` already registers `PrincipalSessionRevoker` (`:408`), `CustomerRecovery` (`:373`), `CustomerAccounts` (`:198`), `CurrentCustomer` (`:285`); `HttpServletRequest` is container-provided. `PasswordEncoder` comes from the imported `SecurityConfig`. **No new stub bean expected** — confirmed by running the slice, not assumed | Ivo | open |
| R-5 | Ordering regression: the new rule sits below a broader earlier rule and never matches | low | high | `/api/me/**` shares no prefix with any earlier matcher (`/api/venues/**`, `/api/admin/**`, `/api/auth/**`, `/api/bookings/**`); it stays immediately above `.anyRequest().authenticated()` where the rules it replaces were | Ivo | open |
| R-6 | Shared-state/full-suite-only failure (the `riviera-local-debug` blind spot) | low | med | The change adds no filter, scheduler, cache, or stateful bean — it edits one matcher list. No new rate-limit surface. Verified by the PR's CI run before merge regardless | Ivo | open |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Open question — matcher shape:** blanket `POST /api/me/**` (the issue's suggested shape) vs a
  **method-agnostic** `/api/me/**`? → **Resolved 2026-07-25 by the maintainer** (`AskUserQuestion`
  at plan time): method-agnostic, collapsing **both** the `GET /api/me/**` rule and the #316
  `POST /api/me/erasure` rule into one. Rationale: the namespace is customer-only by definition, and
  the method-scoped shape is the recurring defect — a namespace rule fails closed for future verbs.
  This is a deliberate, recorded widening beyond the issue's stated shape; the issue's own
  instruction was to "decide explicitly … and record the reasoning either way."
- **Open question — is the blanket rule still safe?** (the issue's caveat) → **Resolved**: the
  `/api/me/**` surface was re-enumerated from source on 2026-07-25 and is entirely customer-facing:

  | Path | Method | Controller | Module |
  |---|---|---|---|
  | `/api/me/bookings` | GET | `MyBookingsController` | `booking` (`adapter/in`) |
  | `/api/me/password` | POST | `MyAccountController` | root (edge) |
  | `/api/me/verify-email/request` | POST | `MyAccountController` | root (edge) |
  | `/api/me/erasure` | POST | `MyErasureController` | root (edge) |

- **Open question — can the response body distinguish the two `403` layers?** → **Resolved: no.**
  `SecurityProblemResponses` (filter) and `ApiErrorHandler.onAccessDenied` (controller) both emit
  `403` + `"code":"ACCESS_DENIED"` + `"detail":"Access denied."` — deliberately uniform. Hence AC-3's
  structural discriminator.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` No write path to `availability(set_id, booking_date)` is
touched; no booking, beach-map, or set state is read or written. The slice edits one authorization
matcher list and adds one test class.

## Spring Modulith — modules, interfaces, events

**Modules touched:** *none.* `SecurityConfig` lives in the **root package**
(`ai.riviera.platform`), which `riviera-modulith` states explicitly is *not* a module — app-wide
config and the login/authorization machinery stay at the platform edge (RV-BE-11). The new test
lands in the **root test package** for the same reason `MeErasureControllerTest` does: the slice
imports the package-private edge config (`SecurityConfig`, `WebCorsConfig`, `WebSliceStubs`).

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | *(none)* | — | — | edge-only change; no module package is created, moved, or modified |

**Cross-module named interfaces (`api/` ports):** `N/A — no port added, changed, or consumed.`

**Domain events:** `N/A — no event published or subscribed.`

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Filter-layer role gate for `/api/me/**` | **root package (platform edge)**, not a module | RV-BE-11 / `riviera-modulith`: "keep `@SpringBootApplication` and app-wide config (`SecurityConfig`, …) in the root package only; the root is not a module." Reading the Spring Security context and gating by role is edge machinery — `customer`'s **Not My Job** list explicitly rejects a login/authorization subsystem, and `operator`'s ownership mapping (invariant #13) is object-level and unrelated to this role-level gate. No module claims it. |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is read, computed, moved, or refunded.

## Angular — frontend surfaces touched

`N/A — backend-only.` A CUSTOMER session's responses are unchanged (AC-4), so no SPA code, no e2e
spec, and no `playwright-cli` work is implied. An operator session hitting a `/api/me` endpoint is
not a flow the SPA has ever performed.

## FE↔BE contract

`N/A — no contract change.` No endpoint added or removed; no DTO altered; the `403` body for a
non-customer principal is byte-identical to what it already was.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current stage's `riviera-sdlc` reference file) before acting.

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** Write `MeSurfaceRoleGateTest` and run it against **unmodified** `SecurityConfig` —
it MUST fail (R-1 / AC-3 red-first gate) before the matcher is touched.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — red: the filter-origin test | | |
| 1 — green: the method-agnostic matcher | | |
| 2 — PR + gates (CI → review → Sonar) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — replace the two method-scoped
  `/api/me` rules with one method-agnostic `ME_PATHS` rule; retire the now-subsumed
  `ME_ERASURE_PATH` constant.
- `platform/src/test/java/ai/riviera/platform/MeSurfaceRoleGateTest.java` — **new**: the
  filter-origin proof for the whole `/api/me/**` surface.
- `platform/src/main/java/ai/riviera/platform/MyAccountController.java` — Javadoc only: its "so
  `SecurityConfig` already gates them" claim is currently *false* for these two POSTs; it becomes
  true and the wording is corrected to say which rule does it.
- `platform/src/main/java/ai/riviera/platform/MyErasureController.java` — Javadoc only: it cites
  "the GET-only `/api/me/**` matcher does not cover it", which the rewrite makes stale.
- `platform/src/test/java/ai/riviera/platform/MeErasureControllerTest.java` — Javadoc only: same
  stale sentence about the dedicated erasure matcher.

---

## Phase 0 — Red: prove the gap with a test that fails today

**Files:** Create `platform/src/test/java/ai/riviera/platform/MeSurfaceRoleGateTest.java`

- [ ] **Step 1: Write the failing test** — three tests: operator→set-password, operator→verify-email
      request, and the CUSTOMER positive control. Discriminator is `MvcResult#getHandler()`.
- [ ] **Step 2: Run it against unmodified `SecurityConfig`, verify it FAILS** —
      `./gradlew test --tests "*MeSurfaceRoleGateTest*"` → the two operator tests fail (the request
      reaches `MyAccountController`, so a handler IS resolved). **A green run here means the test is
      wrong; fix the test, not the config.**

> Scope: one test class. Not the full suite.

- [ ] **Step 3: Commit the red test** — labelled red-TDD, so the CI-gate rule's red exemption applies.

## Phase 1 — Green: the method-agnostic matcher

**Files:** Modify `SecurityConfig.java` (constants block + `authorizeHttpRequests`), plus the three
stale-Javadoc corrections listed in *File structure*.

- [ ] **Step 1: Replace `ME_ERASURE_PATH` with `ME_PATHS = "/api/me/**"`** and collapse the two
      matcher lines into `.requestMatchers(ME_PATHS).hasRole(CUSTOMER_ROLE)`, kept immediately above
      `.anyRequest().authenticated()`.
- [ ] **Step 2: Run the new test, verify it PASSES** —
      `./gradlew test --tests "*MeSurfaceRoleGateTest*"` → PASS.
- [ ] **Step 3: Regression — the whole `/api/me` + security surface** —
      `./gradlew test --tests "*MeErasureControllerTest*" --tests "*MyBookingsIT*" --tests
      "*SetPasswordIT*" --tests "*AuthSessionIT*" --tests "*SecurityFilterChain*"` → PASS (Docker is
      available locally, so the ITs really run — they are not expected to skip).
- [ ] **Step 4: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests
      "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — the fixed pattern is *"a method-scoped `requestMatchers`
      leaves sibling verbs on the same path unmatched."* Search every matcher in `SecurityConfig` for
      the same shape and decide per site. Record in the log below.
- [ ] **Step 6: Commit** — `git commit -m "fix(#317): role-gate the whole /api/me surface to CUSTOMER"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — PR + gates

- [ ] Merge latest `origin/main`; open the PR into `main`.
- [ ] CI green.
- [ ] **Review gate at HIGH effort, no exceptions** (`references/pr-gates.md` §1 — the diff touches
      authorization, and that rule keys off what the diff touches, not diff size), with
      `riviera-review-overlay` loaded.
- [ ] Sonar gate: quality gate green **and** the reported new-issue + duplication list pulled from
      the API and cleared (green ≠ empty).
- [ ] Merge close-out checklist (`references/pr-gates.md` §3), incl. `riviera-docs-freshness`.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*MeSurfaceRoleGateTest*"` → PASS, and the same test FAILED
      at phase 0 against unmodified `SecurityConfig` (red-first evidence recorded in the phase table).
- [ ] **AC-2:** same run, second test method.
- [ ] **AC-3:** the two operator tests failed pre-fix and pass post-fix; the positive control asserts
      a non-`null` handler for a CUSTOMER request in the same class.
- [ ] **AC-4:** `MeErasureControllerTest`, `SetPasswordIT`, `MyBookingsIT`, `AuthSessionIT` all green,
      unmodified except for stale Javadoc.
- [ ] **AC-5:** `MeErasureControllerTest.operatorSessionIsForbiddenAndNothingIsErased` +
      `MyBookingsIT.operatorSessionIsForbidden` green after the rules were collapsed.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — no persistence code in the diff at all.
- [ ] **Availability** section justified N/A (invariant #2 untouched).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; edge-only, no module package touched (invariant #11).
- [ ] **Payment/payout** N/A (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] **No Flyway migration** — and none wanted; wanting one would mean the slice grew (invariant #12).
- [ ] **Frontend** N/A — no observable client change.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
