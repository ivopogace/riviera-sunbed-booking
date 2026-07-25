# Operator self-service password change Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A signed-in operator can change its own password from the app, proving the current
one, and every *other* live session of that operator is destroyed while the session doing the
change stays signed in.

**Architecture:** Entirely a **platform-edge** slice — no `operator`-module change, no new port,
no migration. The module already publishes the only conversation needed
(`OperatorProvisioning.setPassword(username, opaqueHash)`); the edge owns current-password
verification, encoding, rate-limiting and session revocation (`RESPONSIBILITIES.md` `operator`
Not-My-Job, RV-BE-11). The single most significant decision: the endpoint is
**`POST /api/auth/operator/password`**, *not* the `/api/me/operator/password` the issue proposed —
`/api/me/**` has been a method-agnostic `hasRole(CUSTOMER)` rule since #317 and `SecurityConfig`
explicitly forbids adding a non-customer endpoint under it.

**Persistence:** JDBC only (invariant #1). **No tables or migrations touched** — `operator.password_hash`
already exists and is written through the existing `JdbcOperators` adapter.

**Source of intent:** GitHub issue **#326** (deferred from #128, OQ-3 of `docs/plans/session-revocation.md`).

**Skills consulted:**
`riviera-sdlc` (routing gate + issue-intake grill — caught the `/api/me/**` collision before design);
`riviera-plan-doc` (this doc's shape, ACs at the inner hexagon);
`riviera-modulith` (settled *no new `api/` port* — `setPassword` is the same purposeful conversation as an
admin rotation, per the "small number of ports" rule; edge-only slice so no `allowedDependencies` change);
`riviera-java-conventions` (records for wire DTOs, package-private controller, typed outcome over exception,
§6b centralized error contract → `ApiProblem`);
`riviera-frontend` (placement: HTTP on `core/operator-auth.ts`, page in the `auth/` feature folder, route in
`app.routes.ts`; forbade a new feature folder);
`angular-developer` + angular-cli MCP (Signal Forms + v22 signal APIs on the reused card) — *to load at Phase 2*;
`playwright-cli` (CI-safe mocked e2e spec) — *to load at Phase 3*;
`riviera-local-debug` (scoped test commands) — *to load before the first `./gradlew`*.
`postgres` — **N/A, no schema change** (verified: `operator.password_hash` exists; latest migration on `main`
is `V30__customer_erasure_marker.sql`).

**Branch:** `feature/operator-self-service-password` — created off `main` at `f059bbf`, before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an ACTIVE non-bootstrap operator signed in on three devices, when it changes its
      password supplying the correct current password, then the stored credential is replaced and exactly
      the two *other* sessions are destroyed while the calling session survives.
      *Pinned by:* `OperatorAccountControllerTest.changesPasswordAndRevokesOnlyOtherSessions`
- [ ] **AC-2:** Given a signed-in operator, when it submits a **wrong** current password, then the response
      is `400 INVALID_CURRENT_PASSWORD`, the stored credential is unchanged, and **no** session is revoked.
      *Pinned by:* `OperatorAccountControllerTest.rejectsWrongCurrentPasswordWithoutRevoking`
- [ ] **AC-3:** Given a signed-in operator, when the new password violates the shared policy
      (`CustomerPasswords.validate` — <8 chars or >72 bytes), then the response is `400 INVALID_REQUEST`
      and the credential is unchanged.
      *Pinned by:* `OperatorAccountControllerTest.rejectsWeakNewPassword`
- [ ] **AC-4:** Given the **bootstrap admin** (the account named by `riviera.operator.username`) signed in,
      when it attempts a self-service change, then the response is `409 BOOTSTRAP_CREDENTIAL_MANAGED`, the
      credential is unchanged, and no session is revoked — its rotation path remains
      `RIVIERA_OPERATOR_PASSWORD` + restart.
      *Pinned by:* `OperatorAccountControllerTest.refusesBootstrapAdminSelfService`
- [ ] **AC-5:** Given a signed-in **customer**, when it calls the operator password endpoint, then the
      security filter rejects it with `403` **before** `DispatcherServlet` dispatches (never reaching the
      controller).
      *Pinned by:* `EndpointRoleGateCoverageTest` (existing tripwire) + `SecurityConfigTest.operatorPasswordIsOperatorOnly`
- [ ] **AC-6:** Given an anonymous caller, when it posts to the endpoint, then the response is
      `401 UNAUTHENTICATED`.
      *Pinned by:* `SecurityConfigTest.operatorPasswordRejectsAnonymous`
- [ ] **AC-7:** Given an operator that has changed its password, when it authenticates through the real
      `AuthenticationManager`, then the **new** password succeeds and the **old** one fails.
      *Pinned by:* `OperatorPasswordChangeIT.newCredentialAuthenticatesAndOldDoesNot`
- [ ] **AC-8:** Given a flood of password-change attempts from one IP, when the bucket is exhausted, then
      further attempts are `429` **and operator login from the same IP still succeeds** (separate budget —
      the #111 shared-bucket lockout must not recur).
      *Pinned by:* `RateLimitFilterTest.credentialChangeFloodDoesNotStarveOperatorLogin`
- [ ] **AC-9:** Given a signed-in operator on the change-password screen, when the change succeeds, then the
      UI confirms it and states that other devices have been signed out.
      *Pinned by:* `set-password.spec.ts` (operator audience) + `e2e/operator-password.e2e.ts`

## Non-goals

- **An audit trail** of who changed what, when → already tracked by **#325**.
- **Admin-initiated reset of another operator's password.** The ADMIN surface gets approve/reject/
  suspend/reinstate only; a compromised operator is suspended, not silently re-credentialed.
- **Operator password *reset* by email** (the "forgot password" flow). Operators have no *verified*
  email channel — `contactEmail` from #115 is unverified and the mailer is still mocked (#255).
  Out of scope; a separate slice once #255 lands.
- **Any change to the customer flow.** `/api/me/password` and its ACs are untouched.
- **Any change to `OperatorProvisioning`'s signature** — only its stale javadoc is corrected.
- **A new FE feature folder.** The surface reuses `auth/`.

## Behavior-parity ledger (retirement / replacement slices only)

**N/A — new behavior, replaces nothing.** No existing surface is retired: `OperatorProvisioning.setPassword`
keeps its only current caller (`OperatorCredentialInitializer`) and gains a second one.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Current-password check compares hash-vs-hash.** bcrypt re-salts, so `encode(input).equals(stored)` is *always* false — the check would reject every correct password (or, inverted, accept every wrong one). This exact defect shipped twice: #128 rotate-detection and S8 set-password. | med | high | Copy `MyAccountController:100-103` verbatim in shape: `passwordEncoder.matches(rawCurrent, credential.passwordHash())` — **raw vs stored hash**, never encode-then-compare. AC-2 fails loudly if inverted. | Claude | open |
| R-2 | **Endpoint placed under `/api/me/**`** (as the issue literally proposes) → every operator gets a flat 403 from the filter, and the CUSTOMER-only namespace rule silently becomes wrong. | high (if issue followed verbatim) | high | Resolved at plan time: path is `/api/auth/operator/password` with its own explicit `hasRole(OPERATOR)` matcher. AC-5/AC-6 pin it. | Claude | resolved-at-plan |
| R-3 | **Bootstrap admin's change silently reverts.** `OperatorCredentialInitializer` re-stamps `RIVIERA_OPERATOR_PASSWORD` on *every* boot and `isGenuineRotation` would see a mismatch → re-stamp + `revokeAll`, so the new password dies at the next Render deploy and the admin is signed out. | high | high | Guard on the configured bootstrap username → `409 BOOTSTRAP_CREDENTIAL_MANAGED` (AC-4). Keyed on `riviera.operator.username`, **not** on `OperatorCredential.admin` — a future second admin approved via `/api/admin/operators` is `admin=true` but is *not* env-managed and must keep self-service. | Claude | open |
| R-4 | **New endpoint falls through the role gate** — the #316/#317/#328 defect class. | low | high | `EndpointRoleGateCoverageTest` fails the build naming the endpoint unless it is explicitly gated; AC-5. | Claude | open |
| R-5 | **Shared rate-limit bucket starves operator login** — the #111 review finding, verbatim. | med | med | Its own per-IP `credentialChange` bucket in `RateLimitProperties`, mirroring how S8 added `recoveryBuckets`. Never the `login` bucket. AC-8 asserts login still succeeds under flood. | Claude | open |
| R-6 | **New controller breaks `@WebMvcTest` slices** (missing bean) and/or `@ApplicationModuleTest` (`PayoutModuleTest`) — a recurring full-suite-only failure that scoped local runs cannot see. | med | med | Add the bean to `WebSliceStubs` in the same commit; run the structural net + `PayoutModuleTest` before the PR; treat the first CI run as the real gate. | Claude | open |
| R-7 | **Error contract drift** — a hand-rolled `{"error": …}` body instead of the centralized `ProblemDetail`. | low | med | `ApiProblem.response(...)` for `INVALID_CURRENT_PASSWORD` + `BOOTSTRAP_CREDENTIAL_MANAGED`; `IllegalArgumentException` from `CustomerPasswords.validate` reaches the single `ApiErrorHandler` → `400 INVALID_REQUEST` (`riviera-java-conventions` §6b). | Claude | open |
| R-8 | **A suspended operator changes its password.** Suspension revokes sessions (#128), so there should be no live session to use — but a race (suspend mid-request) could slip through. | low | low | `OperatorCredential.active` is already on the published record; reject when `!active` with the same `409`-family response. Cheap defence-in-depth. | Claude | open |

## Open questions / Assumptions

- **Assumption:** Merging the operator audience into the existing `auth/set-password.ts` (rather than a
  second near-identical page) is the right call — it follows S9 #277 (five auth surfaces unified into one
  audience-aware card) and #128 (`PrincipalSessionRevoker` *generalized*, not copied, because "a second
  near-identical edge class is duplication the merge gate rejects"). *Owner:* Claude · *Resolves by:* Phase 2
  — revisit if the customer SSO-only branch makes the merged component harder to read than two components.
- **Assumption:** No FE surface is needed for the bootstrap admin's `409` beyond rendering the message —
  the admin is a maintainer who has the runbook. *Owner:* Claude · *Resolves by:* Phase 2.
- **Open question:** Should a successful change also send a "your password was changed" notification?
  Blocked on the real mailer (#255) and on operators having a verified address. *Owner:* Ivo ·
  *Resolves by:* deferred — raise as a follow-up issue at merge close-out if wanted.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice touches only the `operator` row's credential column and
`SPRING_SESSION`. No `availability(set_id, booking_date)` write path is reached, no booking is created,
read, or cancelled, and no beach-map or pool state changes. Invariants #2/#3/#4 are untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | *(none)* — **platform edge only** | existing | — | Credential verification/encoding, the HTTP surface, rate limiting and session invalidation are all on the `operator` module's **Not My Job** list; they live in the root `ai.riviera.platform` package (RV-BE-11). |
| M-2 | `operator` | existing, **unchanged code** | `Operator` | Stores the opaque hash via the already-published `OperatorProvisioning.setPassword`. Only a **javadoc correction** (see below) — no signature, no new type, no `allowedDependencies` change. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `operator.api` | `OperatorProvisioning#setPassword(String, String)` — **existing, reused** | — (String username + opaque hash) | platform edge (`OperatorCredentialInitializer`, **+ new** `OperatorAccountController`) |
| NI-2 | `operator.api` | `OperatorAccounts#findByUsername(String)` — **existing, reused** | `operator.vocabulary.OperatorCredential` | platform edge (`OperatorUserDetailsService`, `OperatorCredentialInitializer`, **+ new** `OperatorAccountController`) |

> **No new port.** `riviera-modulith`: *"A port is a purposeful conversation, not one-interface-per-use-case."*
> "Store this opaque hash for this username" is one conversation; whether the caller is a boot runner or a
> signed-in operator proving its current password is entirely an edge concern. Adding an
> `OperatorSelfService` port would be the fifth-narrow-port smell the skill warns about.

**Domain events (id-based payloads, invariant #11)**

**N/A — no event.** Consistent with #128's deliberate choice: session revocation is *synchronous and
edge-orchestrated*, not evented, because the caller must know it happened before responding.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Accept the HTTP request; parse/validate the DTO | platform **edge** | `operator` Not-My-Job: "the register/login/approval **endpoints** → the platform edge". |
| Verify the submitted current password against the stored hash | platform **edge** | `operator` Not-My-Job: "**Encoding/verifying credentials** … → the platform edge"; the module "store[s] an opaque credential hash" and never interprets it. |
| Encode the new password | platform **edge** | Same line; `OperatorProvisioning`'s own javadoc: "Both methods take an **already-encoded** credential hash … keeping all crypto/Spring-Security out of the `operator` module". |
| Persist the new hash | **`operator`** | `operator` Job: "Own operator accounts". Reached via the published `api/` port, id-free (username-keyed, as the existing port already is). |
| Destroy the operator's other sessions | platform **edge** | `operator` Not-My-Job, verbatim: "**Invalidating live sessions** when an account loses the right to them (suspension, **credential rotation**) → the platform edge (`PrincipalSessionRevoker`, #128) … I never import `org.springframework.session`". |
| Refuse the bootstrap admin | platform **edge** | The rule is about `RIVIERA_OPERATOR_PASSWORD` + `OperatorCredentialInitializer` — both edge-only concepts. The `operator` module has no notion of "env-managed". |
| Rate-limit the endpoint | platform **edge** | `RateLimitFilter` is app-level, explicitly "not a module". |

**Documentation debt this slice must clear:** `OperatorProvisioning`'s class javadoc currently states
*"There is deliberately **no** self-service HTTP endpoint: provisioning is not an operator-reachable surface
(maintainer decision, grill 2026-07-01)."* That is **already stale** — #115 shipped
`POST /api/auth/operator/register` — and this slice supersedes the rest for `setPassword`. Correct it in
Phase 0, citing #115 and #326, rather than leaving a comment that contradicts the code.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves; no Stripe call, no ledger entry, no refund.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/operator-auth.ts` | existing → **extended** | `@Service` singleton | signals | — |
| FE-2 | `auth/set-password.ts` (+ `.html`) | existing → **extended** (audience-aware) | standalone component | signals | Signal Forms |
| FE-3 | `auth/set-password.spec.ts` | existing → **extended** | Vitest/jsdom spec | — | — |
| FE-4 | `auth/set-password.a11y.spec.ts` | existing → **extended** | axe spec | — | — |
| FE-5 | `app.routes.ts` | existing → **modified** | route table | — | — |
| FE-6 | `operator/operator-console.html` | existing → **modified** | template | — | — |
| FE-7 | `e2e/operator-password.e2e.ts` | **new** | Playwright (CI-safe, mocked) | — | — |

**Placement rationale (`riviera-frontend`):** the HTTP call is stateful + session-aware → `core/operator-auth.ts`
(mirroring `core/customer-auth.ts`, which holds the customer's set-password call). The page is an *account page*,
which the skill assigns to the `auth/` feature folder. **No new feature folder.** The existing route
`/account/password` is reused and made audience-aware, matching `/account/sign-in`'s S9 shape; entry point is a
link in the operator-console header.

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs. The console
subtree keeps its pinned porcelain theme (`data-riv-theme` host binding) — no document-level theme write.

## FE↔BE contract

- **New endpoint:** `POST /api/auth/operator/password`
  - Request: `{ "currentPassword": string, "newPassword": string }`
  - `204 No Content` on success
  - `400 INVALID_REQUEST` — new password violates policy (or body malformed)
  - `400 INVALID_CURRENT_PASSWORD` — current password wrong
  - `409 BOOTSTRAP_CREDENTIAL_MANAGED` — the env-managed bootstrap admin
  - `401` anonymous · `403` non-operator principal or missing CSRF token · `429` bucket exhausted
  - All error bodies are RFC-7807 `ProblemDetail` via `ApiProblem` (§6b) — never a bespoke shape.
- **Client typing:** a hand-written typed method on `core/operator-auth.ts`; request/response types in the
  service file. No `as any` on the contract.
- **CSRF:** a state-changing POST under `/api/**` → the SPA must send `X-XSRF-TOKEN`. **Not** added to the
  CSRF ignore list.
- **Money/date on the wire:** none.

## Execution status

> **This section is the session-recovery anchor.** Long sessions get compacted
> (summarized) and lose fine-grained state; a fresh session starts with none.
> Everything a resuming session needs lives HERE, committed — never only in the
> conversation. After a context compaction, in a fresh session, or whenever unsure
> where the work stands: re-read this section (plus the current stage's
> `riviera-sdlc` reference file) before acting. Update it in the SAME commit window
> as the change it records — at every phase boundary AND every SDLC stage
> transition (plan → implement → CI → PR → review → sonar → merge).

**Stage pointer:** `plan — committed, awaiting phase 0`

**Next action:** Load `riviera-local-debug` and `riviera-java-conventions`, then start Phase 0 step 1 —
write `OperatorAccountControllerTest.changesPasswordAndRevokesOnlyOtherSessions` and watch it fail.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend endpoint + role gate | | |
| 1 — Rate-limit bucket | | |
| 2 — Frontend surface | | |
| 3 — e2e + a11y | | |
| 4 — Docs + javadoc correction | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *none yet* | — |

---

## File structure

**Backend (all in the root edge package `ai.riviera.platform`)**

- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — **new.** The endpoint;
  mirrors `MyAccountController`. Package-private `@RestController`.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — **modified.** Add
  `OPERATOR_PASSWORD_PATH` constant + `.requestMatchers(POST, OPERATOR_PASSWORD_PATH).hasRole(OPERATOR_ROLE)`
  above `anyRequest()`.
- `platform/src/main/java/ai/riviera/platform/RateLimitProperties.java` — **modified.** Add the
  `credentialChange` `Limit`.
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — **modified.** Add the path constant +
  `credentialChangeBuckets` map, mirroring `recoveryBuckets`.
- `platform/src/main/java/ai/riviera/platform/operator/api/OperatorProvisioning.java` — **modified,
  javadoc only.** Correct the stale "no self-service HTTP endpoint" claim.

**Backend tests**

- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — **new.** AC-1..AC-4.
- `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java` — **new.** AC-7 (Testcontainers,
  `@EnabledIfDockerAvailable`).
- `platform/src/test/java/ai/riviera/platform/SecurityConfigTest.java` — **modified.** AC-5, AC-6.
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — **modified.** AC-8.
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — **modified.** Bean for the new controller
  (R-6).
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — **verify only**; it should
  pass without edits once the matcher exists. If it names the endpoint, the matcher is missing — fix the
  matcher, never the list.

**Frontend**

- `frontend/src/app/core/operator-auth.ts` (+ `.spec.ts`) — **modified.** `changePassword(current, next)`.
- `frontend/src/app/auth/set-password.ts` / `.html` / `.spec.ts` / `.a11y.spec.ts` — **modified.**
  Audience-aware.
- `frontend/src/app/app.routes.ts` — **modified.** `/account/password` reachable by an operator session.
- `frontend/src/app/operator/operator-console.html` — **modified.** Header link.
- `frontend/e2e/operator-password.e2e.ts` — **new.** CI-safe mocked spec.

**Docs**

- `docs/plans/operator-self-service-password.md` — this file.
- `docs/runbooks/operator-credential-provisioning.md` — **modified.** Document that non-bootstrap operators
  now self-serve, and that the bootstrap admin deliberately cannot.

---

## Phase 0 — Backend endpoint + role gate

**Files:** Create `OperatorAccountController.java`, `OperatorAccountControllerTest.java` ·
Modify `SecurityConfig.java`, `SecurityConfigTest.java`, `WebSliceStubs.java`,
`operator/api/OperatorProvisioning.java`

- [ ] **Step 1: Write the failing tests** (AC-1..AC-6) — `OperatorAccountControllerTest` with
      `@WebMvcTest(OperatorAccountController.class)` + `@Import(SecurityConfig.class)`, mocking
      `OperatorAccounts`, `OperatorProvisioning`, `PrincipalSessionRevoker`, `RivieraOperatorProperties`.
      Assert on `verify(...)` for the revoker so AC-2's "no revocation" is provable, not assumed.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*OperatorAccountControllerTest*"`
      → FAIL (class does not exist).
- [ ] **Step 3: Minimal implementation** — the controller + the `SecurityConfig` matcher + the
      `WebSliceStubs` bean; correct the `OperatorProvisioning` javadoc.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS. Then the structural net:
      `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*"
      --tests "*PackageShapeArchitectureTests*" --tests "*OperatorAuthPlacementTests*"
      --tests "*EndpointRoleGateCoverageTest*"`.
- [ ] **Step 5: Generalization-audit pass** — search for every other place a raw password is compared to a
      stored hash (`git grep -n "passwordEncoder.matches\|encoder.matches"`), confirm each is raw-vs-hash
      (R-1). Append to the log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#326): operator self-service password change at the edge"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — Rate-limit bucket

**Files:** Modify `RateLimitProperties.java`, `RateLimitFilter.java`, `RateLimitFilterTest.java`,
`application.properties`

- [ ] **Step 1: Write the failing test** — AC-8, asserting the flood returns `429` **and** that
      `POST /api/auth/operator/login` from the same IP still passes.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*RateLimitFilterTest*"`.
- [ ] **Step 3: Minimal implementation** — `credentialChange` limit + its own bucket map.
- [ ] **Step 4: Run it, verify it passes** — same command.
- [ ] **Step 5: Generalization-audit pass** — confirm no *other* authenticated credential endpoint shares
      the `login` bucket.
- [ ] **Step 6: Commit** — `git commit -m "feat(#326): own rate-limit budget for credential change"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — Frontend surface

> **Load `angular-developer` + the angular-cli MCP before this phase** (routing gate re-fires on a new area).

**Files:** Modify `core/operator-auth.ts`, `auth/set-password.*`, `app.routes.ts`,
`operator/operator-console.html`

- [ ] **Step 1: Write the failing specs** — AC-9 in `set-password.spec.ts` (operator audience: success path,
      wrong-current-password, bootstrap `409`), plus `operator-auth.spec.ts` for the HTTP call.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- set-password operator-auth`.
- [ ] **Step 3: Minimal implementation** — audience-aware component + `changePassword` on the service.
- [ ] **Step 4: Run them, verify they pass**; then `npm run lint` + `npm run test:a11y`.
- [ ] **Step 5: Generalization-audit pass** — check no other operator surface hard-codes a customer-only
      auth assumption.
- [ ] **Step 6: Commit** — `git commit -m "feat(#326): operator audience on the change-password card"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — e2e + a11y

> **Load `playwright-cli` before this phase.**

**Files:** Create `frontend/e2e/operator-password.e2e.ts`

- [ ] **Step 1: Write the failing spec** — mocked-API flow: sign in as operator → change password →
      confirmation names the other-devices sign-out; plus `expectNoSeriousAxeViolations`.
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y`.
- [ ] **Step 3: Minimal implementation** — wire whatever the spec exposes as missing.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass** — n/a unless a bug was fixed; record the decision either way.
- [ ] **Step 6: Commit** — `git commit -m "test(#326): e2e + a11y for operator password change"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 4 — Docs + close-out prep

**Files:** Modify `docs/runbooks/operator-credential-provisioning.md`, `CLAUDE.md` (operator module row),
`RESPONSIBILITIES.md` if the Job/Not-My-Job wording needs the new caller

- [ ] **Step 1:** Document the self-service path and the deliberate bootstrap-admin exclusion.
- [ ] **Step 2:** Run `graphify update .` so the doc changes reach the graph (code is hook-covered).
- [ ] **Step 3: Commit** — `git commit -m "docs(#326): self-service credential rotation runbook"`
- [ ] **Step 4: Update plan-doc execution status → PR stage.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** `./gradlew test --tests "*OperatorAccountControllerTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-5, AC-6:** `./gradlew test --tests "*SecurityConfigTest*" --tests "*EndpointRoleGateCoverageTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-7:** `./gradlew test --tests "*OperatorPasswordChangeIT*"` → PASS (Docker present). Verified at `<sha>`.
- [ ] **AC-8:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-9:** `npm test -- set-password operator-auth` + `npm run test:e2e:a11y` → PASS. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified `N/A`); no availability write path reached (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — not reached by this slice.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new port (invariant #11).
- [ ] **Payment/payout** section filled (`N/A`) (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — not reached.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — not reached.
- [ ] Booking codes unguessable (invariant #7) — not reached; **but** the password is never logged.
- [ ] No Flyway migration needed and none added (invariant #12) — verified `operator.password_hash` exists.
- [ ] **Per-venue authorization (invariant #13):** not applicable — this is a *self*-scoped principal
      operation with no `venueId` in the path; the principal is resolved from the session, never from input
      (BOLA-safe by construction, like `/api/me/**`).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
