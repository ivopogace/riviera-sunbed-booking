# Password policy: 12–72 bytes + context blocklist (#904) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every surface that accepts a new password (tourist register, operator register, reset,
set-password, both change-password endpoints) rejects a password shorter than 12 characters or longer
than 72 bytes with `400 INVALID_REQUEST`, rejects one containing the account's email local part / the
operator username / `riviera` (case-insensitive) with `400 PASSWORD_CONTAINS_BLOCKED_TERM`, the SPA
says the rule before submit and names the failed rule after, and the bootstrap credential is held to
the same length floor at boot.

**Architecture:** The policy stays one stateless edge helper (`CustomerPasswords` renamed to
`PasswordPolicy`, root package) that every controller already calls before any write; it grows the
12/72 bounds, an account-name parameter and the `riviera` word, and throws a second root-package
exception (`BlockedPasswordException`) that the single `ApiErrorHandler` maps to the new code. The
context comes from what each controller already holds (request email / username, the session
principal, `emailForResetToken`), so no module changes: `customer` and `operator` keep receiving an
opaque hash (RV-BE-11). The frontend mirrors the rule in one pure `shared/password-policy.ts` that both
core auth services and all five password screens consume.

**Persistence:** JDBC only (invariant #1). No table or migration touched.

**Source of intent:** GitHub issue #904 (epic #903); decision D-8 in
`docs/architecture/auth-signin-register.md` (revised 2026-09-03).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
"existing length code" is `INVALID_REQUEST` via `InvalidApiRequestException`, that the reset flow can
name the account email before consuming the token via `emailForResetToken`, that three ITs boot the
bootstrap admin with the 8-char `admin-pw`, and that a 1–2-character username/local part needs a
floor on the blocklist token) · `riviera-plan-doc` (this template — forced the per-surface AC/seam
table and the fixture enumeration) · `tdd` (each phase red→green at the named seam, one behavior per
cycle) · `riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness`
(N/A until close-out — will run over `origin/main...HEAD` at step 5; the D-8 status line and
`RESPONSIBILITIES.md` § *Platform edge* are updated in this PR) · `riviera-java-conventions` (root
edge helper stays a static final class; the new exception is thrown only by edge code and mapped once
in the advice, §6b; named constants for the bounds; parameterized WARN that never logs the value) ·
`riviera-modulith` (edge placement check: nothing enters a module, no new `api/` port — the reset
context rides the existing `CustomerAccountRecovery.emailForResetToken`; structural net re-run) ·
`codebase-design` (the helper's interface: two `validate` overloads + one `hasPermittedLength`
predicate, the account-name derivation hidden inside; no verdict enum since every caller wants the
throw) · `riviera-frontend` (the policy mirror is a pure vocabulary module → `shared/password-policy.ts`;
`core/` services map codes → results; screens stay in `auth/`) · `angular-developer` + angular-cli
MCP (loaded at phase 3 — signals/`@if` idioms, the hint's `aria-describedby`, `role="alert"` errors) ·
`riviera-tailwind` (loaded at phase 3 — the hint keeps the existing `text-riv-card-ink-*` token classes;
no new styling) · `playwright-cli` (loaded at phase 4 — the mocked suite's fixtures and the mock
server's policy check).

**Branch:** `claude/sdlc-904-bcwy03` — the session's designated remote branch stands in for
`feature/password-policy-12` (cloud-session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (length, every surface):** Given any of the six surfaces, when the new password is 11
  characters or 73 UTF-8 bytes, then `400 INVALID_REQUEST` and nothing is written; a 12-character
  password with leading and trailing spaces is accepted verbatim (register, then sign in with the exact
  string). *Seam:* the HTTP edge (`POST /api/auth/customer/register`, `/api/auth/operator/register`,
  `/api/auth/customer/reset-password`, `/api/me/password`, `/api/auth/operator/password`) ·
  *Pinned by:* `PasswordPolicyTest` (bounds + spaces + bytes), `CustomerRegisterIT.rejectsPasswordOutsidePolicy`,
  `CustomerRegisterIT.acceptsATwelveCharacterPasswordWithSurroundingSpacesVerbatim`,
  `OperatorRegistrationIT.rejectsPasswordOutsidePolicy`, `AccountRecoveryControllerTest.aWeakPasswordIsRejectedBeforeAnyRevoke`,
  `SetPasswordIT.aWeakNewPasswordOutranksAnOmittedCurrentOne`, `OperatorAccountControllerTest.rejectsWeakNewPassword`
- [ ] **AC-2 (blocklist, every surface):** Given each surface, when the new password contains the
  account's email local part (tourist), the operator username (operator) or `riviera` in any case,
  then `400 PASSWORD_CONTAINS_BLOCKED_TERM` and nothing is written. *Seam:* the same five routes ·
  *Pinned by:* `PasswordPolicyTest.theAccountNameIsBlockedInAnyCase` + `theServiceNameIsBlockedInAnyCase`,
  `CustomerRegisterIT.rejectsAPasswordContainingTheEmailName`, `OperatorRegistrationIT.rejectsAPasswordContainingTheUsername`,
  `PasswordResetIT.rejectsAPasswordContainingTheAccountsEmailNameAndKeepsTheToken`, `SetPasswordIT.rejectsAPasswordContainingTheEmailName`,
  `OperatorPasswordChangeIT.aBlockedNewPasswordIsNamedDistinctlyFromAWrongCurrentOne`,
  `ApiErrorHandlerTest.aBlockedPasswordIs400WithItsOwnCode`
- [ ] **AC-3 (operator #345 semantics kept):** Given the operator change-password endpoint, when the
  current password is wrong → `INVALID_CURRENT_PASSWORD`; when it is right and the new one is 11
  characters → `INVALID_REQUEST`; when it is right and the new one contains the username →
  `PASSWORD_CONTAINS_BLOCKED_TERM`; the omission still outranks the policy. *Seam:*
  `POST /api/auth/operator/password` · *Pinned by:* `OperatorPasswordChangeIT.aWrongCurrentPasswordRotatesNothingAndRevokesNothing`
  (existing), `OperatorAccountControllerTest.rejectsWeakNewPassword`, `OperatorAccountControllerTest.anOmittedCurrentPasswordOutranksTheNewPasswordPolicy`
  (existing, fixtures moved), `OperatorPasswordChangeIT.aBlockedNewPasswordIsNamedDistinctlyFromAWrongCurrentOne`
- [ ] **AC-4 (no write, equalization intact):** Given a register with a rejected password, when it
  returns `400`, then no account row exists and no session cookie is set; the D-8 timing test still
  passes. *Seam:* `POST /api/auth/customer/register` + `CustomerAccountDirectory` · *Pinned by:*
  `CustomerRegisterIT.rejectsPasswordOutsidePolicy` (no row, no cookie), `CustomerRegisterIT.duplicateEmailResponseIsIdenticalButSessionless` (existing)
- [ ] **AC-5 (old floor still signs in):** Given an account provisioned through the store with an
  8-character password, when it signs in, then `200`. *Seam:* `POST /api/auth/customer/login` with the
  `CustomerAccountProvisioning.register(email, hash)` port; operators already pinned by `AuthSessionIT`
  (4-character `pw-a`) · *Pinned by:* `CustomerLoginIT.anAccountStoredUnderTheOldFloorStillSignsIn`
- [ ] **AC-6 (bootstrap floor):** Given `RIVIERA_OPERATOR_PASSWORD` of 11 characters (or > 72 bytes),
  when the app boots, then the initializer provisions nothing, encodes nothing, and logs one WARN that
  does not contain the value; a 12-character value is stamped. *Seam:* `OperatorCredentialInitializer.run`
  with the `OperatorProvisioning` port · *Pinned by:* `OperatorCredentialInitializerTest.aPasswordUnderTheFloorProvisionsNothingAndWarnsWithoutTheValue`,
  `OperatorCredentialInitializerTest.aSetPasswordProvisionsTheBootstrapOperatorWithAnEncodedHash`
- [ ] **AC-7 (dev default):** Given `application-dev.properties`, then its `riviera.operator.password`
  is exactly 12 characters and passes `PasswordPolicy.hasPermittedLength`. *Seam:* the properties
  file · *Pinned by:* `DevProfileBootstrapCredentialTest.theDevDefaultMeetsTheFloor`
- [ ] **AC-8 (frontend):** Given each password screen (auth page in both audiences, reset, set,
  operator change), then the hint says "at least 12 characters" before submit; a client-side short
  password shows the length message without a request; a server `INVALID_REQUEST` shows the length
  message and `PASSWORD_CONTAINS_BLOCKED_TERM` the blocklist message, both from `shared/password-policy.ts`.
  *Seam:* the rendered component DOM + the mocked `HttpClient` · *Pinned by:*
  `password-policy.spec.ts`, `customer-auth.spec.ts`, `operator-auth.spec.ts`, `auth-page.spec.ts`,
  `reset-password.spec.ts`, `set-password.spec.ts`, `operator-password.spec.ts`; e2e
  `customer-auth.e2e.ts`, `password-reset.e2e.ts`, `customer-password.e2e.ts`, `operator-password.e2e.ts`
- [ ] **AC-9 (docs):** `RESPONSIBILITIES.md` § *Platform edge*, the operator-credential runbook, the
  production-hardening env table and the D-8 status line describe the floor, the blocklist code and
  the bootstrap refusal. *Seam:* the docs · *Pinned by:* review (RV-PROC) + `riviera-docs-freshness` at close-out

## Non-goals

- No breached-password (HIBP) check, strength meter, sign-in re-check, forced reset or lockout (D-8).
- No change to the sign-in endpoints: the floor applies at set-time only.
- No Modulith module change: no new `api/` port, no policy inside `customer`/`operator`.
- Sign-in-only e2e fixtures (`pw`, `good-pw`, `admin-pw` used purely to sign a mocked operator in)
  stay — sign-in is not policy-checked. Only fixtures that register or set a password move.
- Sub-token matching of the email local part (`john.smith` → `john`, `smith`): the rule is the
  literal local part, as the issue states.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — no surface is retired; the same endpoints and screens gain a stricter rule and one new code.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A 1–2-character username or email local part would reject almost any password containing that letter pair | med | med | tokens shorter than `MIN_ACCOUNT_NAME_LENGTH` (3) are not checked; documented on the helper; `PasswordPolicyTest` pins it | agent | open |
| R-2 | The reset flow needs the account email before the write; reading it must not consume the token | low | high | reuse `CustomerRecovery.emailForResetToken` (already read-only, already called before the revoke); the invalid-token branch still answers `INVALID_OR_EXPIRED_TOKEN` | agent | open |
| R-3 | Three ITs boot the admin with `admin-pw` (8) and would lose their admin login once the initializer refuses short values | high | high | enumerate by mechanism (`grep -rhoE "riviera\.operator\.password=[^\",} ]+"`) and move every value under 12 | agent | open |
| R-4 | Fixture passwords that register/reset/set (`password123`, `plain-op-pw`, `revoke-pw`, `short`) fail the new floor | high | high | the Explore map in *File structure*; every touched IT + e2e spec listed; scoped runs per phase, CI for the full suite | agent | open |
| R-5 | New error code → contract: the FE must map it or fall to the generic error | med | med | `ApiErrorHandlerTest` pins the code + detail ("The password contains a blocked term."); both core services map it; RV-BE §6b: detail states the condition, not the remedy | agent | open |
| R-6 | The operator register has no timing equalizer by design; the policy check must stay before the single bcrypt | low | med | validate first in both registers (unchanged shape); the D-8 IT still passes | agent | open |
| R-7 | Full-suite-only failure: the shared context cache keys change when `@SpringBootTest(properties=…)` values change | low | low | keep the three `admin-pw` ITs on one new value so they still share a context | agent | open |

## Open questions / Assumptions

- **Assumption:** the account-name token floor is 3 characters (shorter local parts / usernames are
  not applied as a blocklist term; `riviera` and length always apply) — *Owner:* maintainer ·
  *Resolves by:* review ← confirm?
- **Assumption:** "the operator side gets its own constant" is satisfied by both sides sourcing the
  one `shared/password-policy.ts` — the operator service no longer re-exports anything from
  `core/customer-auth.ts` for the policy — *Owner:* maintainer · *Resolves by:* review ← confirm?
- **Assumption:** the bootstrap initializer applies the length rule only (not the blocklist), as the
  issue and D-8 say "the same floor" — *Owner:* maintainer · *Resolves by:* review ← confirm?
### Resolved

- **Assumption:** the dev default becomes `local-dev-pw` (12 characters) — resolved in the phase-2 commit, pinned by `DevProfileBootstrapCredentialTest`.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: no booking, map or `availability` write path is touched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| — | none | — | — | the policy is platform-edge login machinery (RV-BE-11); root-package classes only |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerAccountRecovery#emailForResetToken` (existing, unchanged) | `Optional<String>` | the edge (`CustomerRecovery` → `AccountRecoveryController`) |

**Domain events (id-based payloads, invariant #11)**

N/A — no event added or changed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| the password policy (bounds + blocklist) and its problem codes | platform edge (root) | `operator` Not-My-Job: "Encoding/verifying credentials + the register/login/… password-change endpoints → the platform edge"; `customer` likewise stores an opaque hash. No Spring Security type enters a module (`OperatorAuthPlacementTests`, `CustomerAuthPlacementTests`) |
| the bootstrap-credential floor | platform edge (`OperatorCredentialInitializer`) | already the edge runner that encodes and stamps; `OperatorProvisioning` keeps taking an encoded hash |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/password-policy.ts` | new | pure module (constants + `passwordPolicyViolation`) | none | — |
| FE-2 | `core/customer-auth.ts` | existing | `@Service` | signals | — |
| FE-3 | `core/operator-auth.ts` | existing | `@Service` | signals | — |
| FE-4 | `auth/auth-page.ts` | existing | standalone component | signals + Signal Forms | register hint + client check |
| FE-5 | `auth/reset-password.ts` | existing | standalone component | signals | hint + client check |
| FE-6 | `auth/set-password.ts` | existing | standalone component | signals | hint + client check |
| FE-7 | `auth/operator-password.ts` | existing | standalone component | signals | hint + client check |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
No deviation.

## FE↔BE contract

- **New/changed endpoints:** none added. The five password-accepting `POST`s gain one new error
  code: `400 PASSWORD_CONTAINS_BLOCKED_TERM` (`detail`: "The password contains a blocked term.").
  `400 INVALID_REQUEST` keeps meaning "outside the permitted length" (now 12–72 bytes).
- **Client typing:** hand-written typed services; the code is switched on in `core/customer-auth.ts`
  and `core/operator-auth.ts`, yielding the new result value `'blocked-password'`.
- **Money/date on the wire:** N/A.

## Execution status

**Stage pointer:** `implement (phase 4)`

**Next action:** phase 4 — run the touched mocked e2e specs (`customer-auth`, `unified-auth`, `customer-password`, `password-reset`, `operator-password`, `email-verification`) against Chromium, then phase 5.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — backend policy helper + new problem code | ✅ | phase-0 commit |
| 1 — the six endpoints wired with context + ITs + IT fixtures | ✅ | phase-1 commit |
| 2 — bootstrap initializer floor, dev default, backend docs | ✅ | phase-2 commit |
| 3 — frontend shared policy, core mappings, five screens + specs | ✅ | phase-3 commit |
| 4 — mocked e2e mocks/fixtures, real-backend check, D-8 status line | ⏳ | |
| 5 — merge `origin/main`, ready-for-review, gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (Repo hygiene, head `a8c8ada`) | `OperatorRejectionRevocationIT` touched but not listed in File structure | fixed in the phase-4 commit (`da5edb4`) |
| F-2 | CI (Frontend, head `da5edb4`) | `auth-page.a11y.spec.ts` still registered with an 11-character password, so the client-side floor blocked the submitted card; the new hint test queried a `data-testid` the hint did not carry | fixed — fixture moved to 12+, `data-testid="auth-hint"` added; full `npm test` green (2446) |

---

## File structure

**Backend — main**
- `platform/src/main/java/ai/riviera/platform/PasswordPolicy.java` — the shared edge rule (renamed from `CustomerPasswords.java`): 12–72 bytes, `riviera` + account-name blocklist, `hasPermittedLength`, `emailLocalPart`
- `platform/src/main/java/ai/riviera/platform/CustomerPasswords.java` — removed (renamed)
- `platform/src/main/java/ai/riviera/platform/BlockedPasswordException.java` — the blocklist violation, edge-only
- `platform/src/main/java/ai/riviera/platform/ApiErrorHandler.java` — maps it to `400 PASSWORD_CONTAINS_BLOCKED_TERM`
- `platform/src/main/java/ai/riviera/platform/AuthController.java` — both registers pass the account name
- `platform/src/main/java/ai/riviera/platform/AccountRecoveryController.java` — reset validates against the token's email
- `platform/src/main/java/ai/riviera/platform/MyAccountController.java` — set-password validates against the principal email
- `platform/src/main/java/ai/riviera/platform/OperatorAccountController.java` — change validates against the username
- `platform/src/main/java/ai/riviera/platform/OperatorCredentialInitializer.java` — refuses a value outside the length rule (WARN, no value)
- `platform/src/main/java/ai/riviera/platform/RivieraOperatorProperties.java` — Javadoc mentions the floor
- `platform/src/main/resources/application-dev.properties` — 12-character dev default
- `platform/src/main/resources/application.properties` — comment: a short value is refused like an empty one

**Backend — test**
- `platform/src/test/java/ai/riviera/platform/PasswordPolicyTest.java` — new unit test
- `platform/src/test/java/ai/riviera/platform/DevProfileBootstrapCredentialTest.java` — new (AC-7)
- `platform/src/test/java/ai/riviera/platform/ApiErrorHandlerTest.java` — the new code
- `platform/src/test/java/ai/riviera/platform/OperatorCredentialInitializerTest.java` — AC-6 + 12-char fixtures
- `platform/src/test/java/ai/riviera/platform/CustomerRegisterIT.java` — AC-1/2/4
- `platform/src/test/java/ai/riviera/platform/CustomerLoginIT.java` — AC-5 + fixture
- `platform/src/test/java/ai/riviera/platform/OperatorRegistrationIT.java` — AC-1/2
- `platform/src/test/java/ai/riviera/platform/PasswordResetIT.java` — AC-2 + fixtures
- `platform/src/test/java/ai/riviera/platform/SetPasswordIT.java` — AC-1/2
- `platform/src/test/java/ai/riviera/platform/OperatorPasswordChangeIT.java` — AC-3
- `platform/src/test/java/ai/riviera/platform/AccountRecoveryControllerTest.java` — AC-1 fixture
- `platform/src/test/java/ai/riviera/platform/OperatorAccountControllerTest.java` — AC-3 fixtures + Javadoc
- `platform/src/test/java/ai/riviera/platform/MyAccountControllerTest.java` — fixture check
- `platform/src/test/java/ai/riviera/platform/AdminAuditTrailIT.java` — `admin-pw` → 12+
- `platform/src/test/java/ai/riviera/platform/OperatorApprovalIT.java` — `admin-pw`, `pw`, `dave-pw` → 12+
- `platform/src/test/java/ai/riviera/platform/OperatorApprovalMailIT.java` — `admin-pw` → 12+
- `platform/src/test/java/ai/riviera/platform/AdminReviewTakedownIT.java` — `plain-op-pw` → 12+
- `platform/src/test/java/ai/riviera/platform/OperatorSuspensionRevocationIT.java` — `revoke-pw` → 12+
- `platform/src/test/java/ai/riviera/platform/OperatorRejectionRevocationIT.java` — its password contained its own username
- `platform/src/test/java/ai/riviera/platform/CustomerRoleSeparationIT.java` — `password123`, `op-password` → 12+
- `platform/src/test/java/ai/riviera/platform/EmailVerificationIT.java` — fixture
- `platform/src/test/java/ai/riviera/platform/LogoutThenLoginCsrfIT.java` — fixture
- `platform/src/test/java/ai/riviera/platform/RecoveryMailerFailureIT.java` — fixture
- `platform/src/test/java/ai/riviera/platform/RecoveryTokenNeverPersistedIT.java` — fixture
- `platform/src/test/java/ai/riviera/platform/SessionPersistenceIT.java` — fixture check (`pw-persist`)

**Frontend**
- `frontend/src/app/shared/password-policy.ts` — the policy mirror + messages + client check
- `frontend/src/app/shared/password-policy.spec.ts` — its spec
- `frontend/src/app/core/customer-auth.ts` — consumes the shared set; maps the new code
- `frontend/src/app/core/customer-auth.spec.ts`
- `frontend/src/app/core/operator-auth.ts` — drops the customer re-export; maps the new code
- `frontend/src/app/core/operator-auth.spec.ts`
- `frontend/src/app/auth/auth-page.ts` · `frontend/src/app/auth/auth-page.spec.ts` · `frontend/src/app/auth/auth-page.a11y.spec.ts` (register fixture → 12+)
- `frontend/src/app/auth/reset-password.ts` · `frontend/src/app/auth/reset-password.spec.ts`
- `frontend/src/app/auth/set-password.ts` · `frontend/src/app/auth/set-password.spec.ts`
- `frontend/src/app/auth/operator-password.ts` · `frontend/src/app/auth/operator-password.spec.ts`
- `frontend/e2e/support/auth-mocks.ts` — the mock server enforces 12–72 + the blocklist code
- `frontend/e2e/customer-auth.e2e.ts` · `frontend/e2e/unified-auth.e2e.ts` · `frontend/e2e/email-verification.e2e.ts` · `frontend/e2e/cta-border-token-skin.e2e.ts` — register fixtures → 12+
- `frontend/e2e/customer-password.e2e.ts` · `frontend/e2e/password-reset.e2e.ts` · `frontend/e2e/operator-password.e2e.ts` — the rule's copy + a blocklist render

**Docs**
- `docs/plans/password-policy-12.md` — this plan
- `docs/architecture/auth-signin-register.md` — the status line: the password half shipped with #904
- `RESPONSIBILITIES.md` — § *Platform edge* states the policy
- `docs/runbooks/operator-credential-provisioning.md` — the floor, the refusal, the new code
- `docs/deploy/production-hardening.md` — env-table row: a short value is refused like an empty one

---

## Phase 0 — backend policy helper + new problem code

**Files:** Create `PasswordPolicy.java`, `BlockedPasswordException.java`, `PasswordPolicyTest.java` ·
Modify `ApiErrorHandler.java`, `ApiErrorHandlerTest.java` · Delete `CustomerPasswords.java`

- [ ] **Step 1: Write the failing test** — `PasswordPolicyTest`: 11 chars → `InvalidApiRequestException`;
  12 chars pass; `"  ten-chars "` (12 with spaces) passes; 72 bytes of `ë`×36 pass, 73 bytes fail;
  `RivieraSummer2026` → `BlockedPasswordException`; `validate("Ana.Kola-2026!!", "ana.kola")` throws;
  `validate("xy-something-long", "xy")` passes (floor); `hasPermittedLength`; `emailLocalPart("Ana@Example.com") == "ana"`.
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests "*PasswordPolicyTest*"` → compile failure (no class)
- [ ] **Step 3: Minimal implementation** — rename + grow the helper; add the exception; map it in the advice.
- [ ] **Step 4: Run it, verify it passes** — the same command + `--tests "*ApiErrorHandlerTest*"`
- [ ] **Step 5: Generalization-audit pass** — population: every caller of the old class name (`grep -rn "CustomerPasswords" platform frontend docs`).
- [ ] **Step 6: Commit** — `Raise the password policy helper to 12–72 bytes with a context blocklist (#904)`
- [ ] **Step 7: Update plan-doc execution status**

## Phase 1 — the six endpoints wired with context + ITs + IT fixtures

- [ ] Red: the per-surface ITs/unit tests in AC-1..AC-5 (one behavior at a time).
- [ ] Green: pass the account name from each controller (register: normalized email local part /
  trimmed username; reset: `emailForResetToken`; set: `authentication.getName()`; operator change: username).
- [ ] Fixture sweep by mechanism: `grep -rhoE "riviera\.operator\.password=[^\",} ]+"` and the register/reset/set literals in the File structure.
- [ ] Scoped runs: each touched IT class one at a time; the structural net.
- [ ] Commit — `Enforce the 12-character password floor and blocklist on every password surface (#904)`

## Phase 2 — bootstrap initializer floor, dev default, backend docs

- [ ] Red: `OperatorCredentialInitializerTest.aPasswordUnderTheFloorProvisionsNothingAndWarnsWithoutTheValue`, `DevProfileBootstrapCredentialTest`.
- [ ] Green: the initializer's length guard; `local-dev-pw`; property comment; runbook; hardening table; `RESPONSIBILITIES.md`.
- [ ] Commit — `Hold the bootstrap credential to the password floor (#904)`

## Phase 3 — frontend shared policy, core mappings, five screens + specs

- [ ] Load `angular-developer` (+ `get_best_practices`), `riviera-tailwind`.
- [ ] Red: `password-policy.spec.ts`, the two core specs' new-code arms, the four screen specs (hint + both messages).
- [ ] Green: `shared/password-policy.ts`; services map `PASSWORD_CONTAINS_BLOCKED_TERM` → `'blocked-password'`; screens show the hint and run the shared client check.
- [ ] `npm run lint && npm run format:check && npm test`.
- [ ] Commit — `Show the 12-character password rule and name the failed rule on every password screen (#904)`

## Phase 4 — mocked e2e, real-backend check, D-8 status line

- [ ] Load `playwright-cli`. Mocks enforce 12–72 + the blocklist code; fixtures ≥ 12; a blocklist render in `customer-password.e2e.ts`.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts <touched specs>`.
- [ ] Real-backend: `OPERATOR_PASSWORD = 'e2e-operator-secret'` (19, no blocked term) — no change; recorded.
- [ ] Commit — `Move the mocked auth e2e to 12-character passwords (#904)`

## Phase 5 — merge `origin/main`, ready-for-review, gates

- [ ] Merge `origin/main` with full phase discipline; open/mark the PR ready; review gate; Sonar gate; close-out.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-03 | phase 1 (fixtures) | every test that boots the bootstrap admin, and every test that hits a password-accepting route | `grep -rhoE "riviera\.operator\.password=[^\",} ]+" platform/src/test` (9 distinct values, 3 under 12) · `grep -rlE "auth/(customer\|operator)/register\|reset-password\|/api/me/password\|/api/auth/operator/password" platform/src/test` (19 files) | `admin-pw` ×3; `password123` ×7, `plain-op-pw`, `revoke-pw`, `op-password`, `pw-persist`, `pw`, `dave-pw`; `reject-target-pw-1` (contained its username) | all moved to ≥ 12 characters not containing the account name; store-provisioned sign-in fixtures (`pw-a` in `AuthSessionIT`, `MyBookingsIT`) deliberately kept — they pin that the floor never applies at sign-in |
| 2026-09-03 | phase 0 (rename) | every reference to the old helper name, in code, tests, mocks and docs | `grep -rn "CustomerPasswords" platform frontend docs RESPONSIBILITIES.md CONTEXT.md .claude` | 4 controllers + `SetPasswordIT` Javadoc (Java); `operator-auth.ts:45`, `auth-mocks.ts:80` (TS comments) | Java sites renamed in phase 0; the two TS comments are rewritten in phases 3/4 where those files change anyway |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** scoped `gradle test --tests` runs per class + CI full suite. Verified at commit `<sha>`.
- [ ] **AC-8:** `npm test` + the touched mocked e2e specs. Verified at commit `<sha>`.
- [ ] **AC-9:** review + docs-freshness at close-out.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
