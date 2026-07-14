# S2 — Customer Accounts (register + sign-in) Implementation Plan

> **For agentic workers:** implement this plan with `implement` + `tdd`, task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. This is slice **S2** of epic **#108**
> (auth), building on **S1 (#109)** — the Spring Security session foundation.

**Goal:** A tourist can register a `CUSTOMER` account (email + password), then sign
in/out through the S1 session mechanism, with the account identity + opaque credential
hash owned by the `customer` module and **all** login machinery at the platform edge —
guest checkout completely unchanged.

**Architecture:** The single most significant decision is **a separate account
identity** (`customer_account`, keyed by its own id, **no FK to the guest `customer`
row**): registration never auto-claims a guest email's past bookings, so the D-6
"verified-email gates linking past bookings" rule is honored *by construction* and the
S3 back-linking step remains deliberate. On the edge, a **second, explicitly-built
`customerAuthenticationManager`** (a `ProviderManager` over a `DaoAuthenticationProvider`
whose `UserDetailsService` is built inline, **not** as a bean) sits beside S1's
untouched operator manager — so a customer credential can never authenticate as an
operator, and S1's auto-wired operator path is undisturbed.

**Persistence:** JDBC only (invariant #1). New Flyway migration **`V25__customer_account.sql`**
(a new `customer_account` table). No change to the existing `customer` table.

**Source of intent:** GitHub issue **#111** (S2), epic **#108**; design doc
`docs/architecture/auth-signin-register.md` (D-1 sessions, D-2 two principal types,
D-6 linking rule, D-8 abuse hardening).

**Skills consulted:** `riviera-sdlc` (issue-intake grill + routing gate), `riviera-plan-doc`
(this template + Execution-status state store), `riviera-modulith` (the `customer` module
**graduates thin→full**; login machinery stays at the edge per RV-BE-11; two `AuthenticationManager`
beans not two `UserDetailsService` beans), `postgres` (`customer_account`: BIGINT identity PK,
TEXT+UNIQUE app-normalized email, `TIMESTAMPTZ`, **no FK to `customer`**, `INSERT … ON CONFLICT
DO NOTHING RETURNING` for the race-safe non-enumerating claim), `riviera-frontend` (new `auth/`
feature folder for the pages; session state in `core/`). Deferred to implement stage per area:
`riviera-java-conventions` (records/sealed outcome/package-private adapter idioms — phase 1–2),
`angular-developer` + angular-cli MCP (v22 Signal Forms + a11y — phase 3), `playwright-cli`
(mocked-a11y e2e authoring — phase 4).

**Branch:** `feature/customer-accounts` — created off `main` before phase 0. (Local session;
no cloud-branch substitution.)

---

## Acceptance criteria (testable)

> Phrased at the application boundary (inner hexagon) where possible; adapter-level
> HTTP assertions live in the named ITs.

- [ ] **AC-1 (registration stores only a hash):** Given no account exists for `alice@example.com`,
  when `CustomerAccountProvisioning.register("alice@example.com", <bcrypt-hash>)` is called, then a
  `customer_account` row exists whose `password_hash` is the bcrypt blob and **never** the plaintext,
  and the call returns `RegistrationOutcome.Registered(id)`. *Pinned by:*
  `CustomerAccountServiceTest.registerCreatesAccountAndReturnsRegistered` + `JdbcCustomerAccountsIT.insertStoresOnlyTheHash`.

- [ ] **AC-2 (duplicate email is a non-enumerating no-op):** Given `alice@example.com` already has an
  account, when `register(...)` is called again, then it returns `RegistrationOutcome.AlreadyRegistered`,
  **no second row** is written, and the existing hash is unchanged. *Pinned by:*
  `CustomerAccountServiceTest.registerExistingEmailReturnsAlreadyRegisteredAndDoesNotOverwrite`.

- [ ] **AC-3 (register endpoint: auto-sign-in on fresh, generic + sessionless on dup):** Given a fresh
  email, when `POST /api/auth/customer/register`, then the response is a generic success **and** a
  `SESSION` cookie carrying a `ROLE_CUSTOMER` context is established. Given an already-registered email,
  when the same call, then the HTTP status and body are **identical** to the fresh case but **no** session
  cookie is set. *Pinned by:* `CustomerRegisterIT.freshEmailRegistersAndSignsIn`,
  `CustomerRegisterIT.duplicateEmailResponseIsIdenticalButSessionless`.

- [ ] **AC-4 (sign-in / me / sign-out via session + CSRF, like the operator flow):** Given a registered
  customer, when `POST /api/auth/customer/login` with the correct password (CSRF token present), then a
  session is established and `GET /api/auth/me` returns `{username: "<email>", principalType: "CUSTOMER"}`;
  `POST /api/auth/logout` returns 204 and invalidates the server session. *Pinned by:*
  `CustomerLoginIT.loginEstablishesSessionAndMeReflectsCustomerType`, `CustomerLoginIT.logoutInvalidatesSession`.

- [ ] **AC-5 (role separation — a customer session grants no operator endpoint; namespaces are disjoint):**
  Given a signed-in customer session, when it calls an operator-only endpoint (e.g. `GET /api/venues/1/takings`),
  then `403`; and the bootstrap operator's credential submitted to `POST /api/auth/customer/login` yields
  `401` (and a customer credential submitted to `/api/auth/operator/login` yields `401`). *Pinned by:*
  `CustomerRoleSeparationIT.customerSessionCannotReachOperatorEndpoint`,
  `CustomerRoleSeparationIT.credentialsDoNotCrossPrincipalTypes`.

- [ ] **AC-6 (non-enumerating login errors):** Given an unknown email **or** a known email with a wrong
  password, when `POST /api/auth/customer/login`, then both return an identical generic
  `401 INVALID_CREDENTIALS` RFC-7807 body (no unknown-vs-wrong distinction, D-8). *Pinned by:*
  `CustomerLoginIT.unknownEmailAndWrongPasswordAreIndistinguishable`.

- [ ] **AC-7 (abuse hardening — rate limited):** Given more than the configured number of customer
  login/register attempts from one IP inside the window, when the next attempt arrives, then
  `429 RATE_LIMITED` with a `Retry-After` header. *Pinned by:*
  `RateLimitFilterTest.customerLoginAndRegisterConsumeTheLoginBudget`.

- [ ] **AC-8 (password policy enforced server-side):** Given a registration with a password shorter than
  8 characters (or longer than 72 bytes), when `POST /api/auth/customer/register`, then `400 INVALID_REQUEST`
  and no row is written. *Pinned by:* `CustomerRegisterIT.rejectsPasswordOutsidePolicy`.

- [ ] **AC-9 (module shape — identity/hash in `customer`, zero auth machinery):** Given the `customer`
  module, it contains the account identity + opaque hash and imports **no** `org.springframework.security..`
  type; the module verifies. *Pinned by:* `CustomerAuthPlacementTests.customerModuleDependsOnNoSpringSecurityType`,
  `ModularityTests.verifiesModularStructure`.

- [ ] **AC-10 (guest checkout unchanged):** Given a signed-out visitor, when they complete guest checkout,
  then the flow works exactly as before (no session or account required). *Pinned by:* the existing guest-booking
  ITs stay green — `CreateBookingInstantIT`, `ViewCancelBookingIT` (regression, no edits).

- [ ] **AC-11 (FE: register → signed in → reload → sign out; a11y):** In the mocked-a11y e2e suite, a
  tourist registers and lands signed-in (header shows "Signed in as …"), a reload preserves the session,
  and sign-out returns to the signed-out header; axe reports no serious violations on the register and
  sign-in pages. *Pinned by:* `frontend/e2e/customer-auth.e2e.ts` + the `*.a11y.spec.ts` unit specs.

- [ ] **AC-12 (substrate docs updated):** `RESPONSIBILITIES.md` (customer Job / Not-My-Job) and `CONTEXT.md`
  reflect customer accounts; the customer `package-info` javadoc reflects the full-module shape. *Verified at:*
  merge close-out step 5 (`riviera-docs-freshness`) + review.

## Non-goals

- **My-bookings / linking past guest bookings** — that is **S3 (#114)**, gated by S8's verified email
  (D-6). S2 ships **no** customer-scoped read; a customer session's only new capability is *being signed in*.
- **Email verification & password reset** — **S8 (#113)**. S2 accounts are usable immediately on registration.
- **SSO (Google/Apple)** — **S4 (#112)**.
- **Operator self-registration / approval** — **S6 (#115)**.
- **Account suspension / lockout / MFA** — out of the epic (design "explicit non-goals").
- **Unifying `OperatorAuth` and the new `CustomerAuth` into one session store / removing the second
  startup `/me` call** — deferred cleanup (see Open Questions); S2 keeps operator surfaces untouched to
  avoid regression.

## Behavior-parity ledger (retirement / replacement slices only)

**N/A — new behavior, retires no surface.** S2 is additive. Two S1 files are *modified* (not replaced):
`AuthController` (gains customer endpoints) and `SecurityConfig` (gains customer permits + a second
manager bean). The operator login/logout behavior must remain **byte-identical**; that parity risk is
tracked as **R-1** in the risk register and pinned by the existing `AuthSessionIT` staying green.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Refactoring the edge auth wiring regresses **operator** login (two `AuthenticationManager` beans → ambiguity, or the operator manager stops auto-wiring) | med | high | Keep S1's `operatorDetailsService` as the **only** `UserDetailsService` **bean** so `AuthenticationConfiguration` still builds the operator manager unchanged; the customer UDS is built **inline** inside the new `customerAuthenticationManager` bean. `AuthController` injects both managers `@Qualifier`-selected. Existing `AuthSessionIT` + operator ITs must stay green. | agent | open |
| R-2 | **Account enumeration** via the register endpoint | med | med | Duplicate email returns the identical status+body as a fresh one (AC-3); login returns one generic 401 for unknown-vs-wrong (AC-6); both paths behind the rate limiter (AC-7). Residual: session-cookie presence on register distinguishes fresh vs dup — **accepted** (maintainer decision 2026-07-13; low-sensitivity domain). | agent | open |
| R-3 | **Concurrent double-registration** of the same email races two INSERTs | low | med | `email TEXT NOT NULL UNIQUE` + `INSERT … ON CONFLICT (email) DO NOTHING RETURNING id`: at most one account per email; the loser gets zero rows back → `AlreadyRegistered`. Pinned by `JdbcCustomerAccountsIT.concurrentRegisterClaimsOnce`. | agent | open |
| R-4 | **D-6 violation** — a new account silently inheriting a guest's booking history | low | high | Design decision: `customer_account` has **no FK to `customer`** and registration does not touch the guest row; S2 ships no my-bookings read. Linking is a deliberate S3 step gated by S8 verification. | agent | open |
| R-5 | **CSRF blocks the very first register/login** if no `XSRF-TOKEN` cookie exists yet | low | med | The FE calls `GET /api/auth/me` on startup (both `CustomerAuth.restore()` and the shell), and Spring's `.spa()` loads the token eagerly, so the cookie is present before any submit — same as operator login today. Verified by the e2e (real browser, real interceptor). | agent | open |
| R-6 | **Flyway V25 collision** with a parallel slice | low | med | Verified **V25 free** on `main` (latest is V24) and unclaimed by any open PR (all 10 open PRs are Dependabot, none add a migration). If a parallel slice merges first, **this branch renumbers** (merges second). | agent | open |
| R-7 | **Error-contract drift** — new endpoints returning a bespoke `{"error": …}` body instead of the central `ProblemDetail` | low | med | Register/login reuse the S1 pattern: `AuthenticationException` → the single `ApiErrorHandler` → RFC-7807; malformed body → compact-ctor `IllegalArgumentException` → the one advice → `400 INVALID_REQUEST`. No per-controller error body (`riviera-java-conventions` §6b). | agent | open |

## Open questions / Assumptions

- **Assumption (password policy):** minimum **8** characters, maximum **72 bytes** (bcrypt's input limit
  — longer input is silently truncated, so we reject it rather than truncate), no composition rules
  (OWASP ASVS). Enforced server-side in the register endpoint. — *Owner:* agent · *Resolves by:* phase 2
  (maintainer may override; stated 2026-07-13).
- **Assumption (recorded drift from #111):** the issue says "a customer account row … **keyed by
  CustomerId**"; the chosen **separate-identity** design keys the account by its **own** id with no FK to
  `customer` (honors D-6 by construction). This drift is deliberate and maintainer-approved (2026-07-13);
  the issue text will be annotated at implementation. — *Owner:* agent · *Resolves by:* phase 1.
- **Assumption (FE session state):** S2 adds `core/customer-auth.ts` mirroring `OperatorAuth` (its own
  `restore()`/`/me`/`/logout`, filtering `/me` by `principalType === "CUSTOMER"`). Operator surfaces are
  left untouched. Consequence: on **operator** pages both services construct → **two** startup `GET /me`
  calls; on tourist pages only one (`OperatorAuth` is root-lazy and only constructs when an operator
  surface injects it). Accepted for S2; a shared `core/session` store is a deferred cleanup. — *Owner:*
  agent · *Resolves by:* phase 3 (RV-FE may opine at review).
- **Open question (rate-limit budget for register):** reuse the existing per-IP `login` budget for both
  customer login and register, or give register its own? **Default: reuse `login`** (simplest; register is
  as abusable as login). Revisit only if review flags it. — *Owner:* agent · *Resolves by:* phase 2.
- **Assumption (FE styling):** the auth pages are styled with the existing tourist **`riv-*` glass SCSS
  tokens** (`--riv-card-*`, `--riv-field-*`, `--riv-cta-grad`) via a shared `auth/auth.scss`, mirroring
  `find-booking` and every sibling tourist surface — NOT hand-rolled Tailwind. This keeps the pages
  visually coherent inside the glass shell; the SCSS→Tailwind migration is a separate, app-wide track.
  — *Owner:* agent · *Resolves by:* phase 3 (RV-FE may opine).

### Resolved

- **FE session state (phase 3):** shipped a separate `core/customer-auth.ts` mirroring `OperatorAuth`
  (its own `/me` restore, filtered to `principalType==='CUSTOMER'`). On operator pages both services
  construct → two startup `/me` calls; on tourist pages only one (`OperatorAuth` is root-lazy). Accepted;
  a shared `core/session` store remains a deferred cleanup. Resolved in `f3851e1`-successor (phase 3 commit).

## Availability & concurrency (invariant #2)

**N/A — S2 does not touch `booking`, `availability`, or the beach map.** The only concurrency concern is
concurrent registration of the same email, which is **not** an availability row; it is handled by the
`customer_account` UNIQUE(email) constraint + `INSERT … ON CONFLICT DO NOTHING` claim (see R-3, and the
Modulith section). Guest checkout — which *does* write availability — is unchanged (AC-10).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing — **graduates thin → full** | `CustomerAccount` (new account identity) + the existing guest `Customer`/`GuestContact` | Demand-side identity is the customer module's Job; D-2 grows it to own **account** identity + opaque credential hash. It gains an application service, so per `riviera-modulith` it moves from the thin template (`api`+`vocabulary`+`adapter/out`) to the full template (adds `application/`). |
| M-2 | platform edge (`ai.riviera.platform` root — **not** a module) | existing | — | All login machinery (RV-BE-11): the customer `UserDetailsService`, `customerAuthenticationManager`, the register/login endpoints, session establishment, rate-limit + security wiring. The root is unconstrained by `allowedDependencies` and already imports `operator.api`; it now also imports `customer.api` + `customer.vocabulary`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerAccounts#findByEmail(String) → Optional<CustomerAccountCredential>` | `customer.vocabulary.CustomerAccountCredential` | platform edge (`CustomerUserDetailsService`) |
| NI-2 | `customer.api` | `CustomerAccountProvisioning#register(String email, String passwordHash) → RegistrationOutcome` | `customer.vocabulary.RegistrationOutcome` (sealed: `Registered(CustomerAccountId)` \| `AlreadyRegistered`) | platform edge (`AuthController` register endpoint) |

> The edge encodes the password (`passwordEncoder` bean) **before** calling `register(...)`, exactly as
> the operator provisioning port takes an already-encoded hash — the `customer` module never touches Spring
> Security. The two ports are one purposeful conversation ("customer account credentials") split by
> direction of use (authenticate vs. provision), mirroring `OperatorAccounts` / `OperatorProvisioning`.

**Domain events (id-based payloads, invariant #11)**

**None.** S2 publishes no domain event (registration is a local write with no cross-module reaction —
`availability`/`payout`/`booking` do not react to an account being created). If S3 later needs a
"customer linked" fact, it introduces its own event then.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Store customer **account identity** (`customer_account`: id, email, hash) | `customer` | `customer` Job = demand-side identity. D-2 **supersedes** the current Not-My-Job line 166 ("tourist accounts / authentication → out of scope in v1"); this slice updates it. The module stores the **opaque** hash and produces a typed `RegistrationOutcome` — no encoding, no Spring Security type (RV-BE-11, `CustomerAuthPlacementTests`). |
| Encode/verify the password; `UserDetailsService`; register/login endpoints; session + CSRF + rate-limit wiring | platform edge (root) | Login machinery is a platform-edge concern (RV-BE-11), **not** a domain module. Mirrors where operator login machinery lives. |
| Guest-contact identity (`customer` table, `CustomerDirectory#findOrCreate`) | `customer` | **Unchanged.** Account identity is *separate* from guest-contact identity (no FK) — the D-6 boundary (R-4). |

**`allowedDependencies`:** `customer` stays `allowedDependencies = {}` (it depends on no other module).
No grant changes. The edge is not a module → no grant. `ModularityTests` must stay green after the
thin→full graduation.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no money moves in S2.** No Stripe, no ledger, no commission. (Guest checkout's payment flow is
untouched.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/customer-auth.ts` (`CustomerAuth`) | new | root `@Service()` | Signals (`principal`, `restoring`, `signedIn`, `email`); `restore()`→`GET /me` field-initializer | — |
| FE-2 | `auth/register.ts` (`account/register`) | new | standalone component | Signals | **Signal Forms** (email + password, min-length, WCAG AA) |
| FE-3 | `auth/sign-in.ts` (`account/sign-in`) | new | standalone component | Signals | **Signal Forms** (email + password) |
| FE-4 | `app.ts` shell header | modified | standalone component | injects `CustomerAuth`; `@if` on `signedIn` | — |
| FE-5 | `auth/auth.model.ts` | new | types | — | request/response DTOs |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs, Signal Forms,
`NgOptimizedImage` for any new image (none expected). Reuse the existing `apiSessionInterceptor`
(`withCredentials` + CSRF echo) — **no** new interceptor. Reuse the S1 generic-error helpers pattern
(`signInFailureMessage`, `SESSION_EXPIRED_MESSAGE`) shape for customer wording.

## FE↔BE contract

- **New endpoints (all under the S1 principal-typed scheme; `/me` + `/logout` reused as-is):**
  - `POST /api/auth/customer/register` — body `{ "email": string, "password": string }` → **201** generic
    success `{ "username": email, "principalType": "CUSTOMER" }` (fresh: + `SESSION` cookie; dup: identical
    body, no cookie). `400 INVALID_REQUEST` on policy violation; `429 RATE_LIMITED` when throttled.
  - `POST /api/auth/customer/login` — body `{ "email": string, "password": string }` → **200**
    `{ "username": email, "principalType": "CUSTOMER" }` + session; `401 INVALID_CREDENTIALS` generic; `429`.
  - `GET /api/auth/me` — **reused**, now returns `principalType` derived from authorities (`ROLE_CUSTOMER`
    → `"CUSTOMER"`, `ROLE_OPERATOR` → `"OPERATOR"`).
  - `POST /api/auth/logout` — **reused** (204).
- **Client typing:** hand-written typed service `CustomerAuth` + `auth.model.ts` (no `as any`). The login
  DTO field is `email` on the customer side (vs `username` on the operator side); the shared
  `PrincipalResponse` returns `username` (holding the email) — the FE maps it to `email`.
- **Money/date on the wire:** none in S2.

## Execution status

> **Session-recovery anchor.** Re-read this section (+ the current `riviera-sdlc` reference file) after
> any compaction or in a fresh session before acting. Update in the same commit window as the change.

**Stage pointer:** ✅ **MERGED — slice complete.** PR **#243** squash-merged into `main` as **`7fe4a54`**
(2026-07-14); #111 closed, epic **#108** S2 ticked, #111 annotated with the separate-identity drift.

**Gates (all passed):** CI green (backend + frontend + CodeQL) · high-effort review gate → 8 findings +
2 CI failures + 2 Sonar issues, **all resolved through the loop** (see the Findings register) · Sonar
quality gate green with **0 new issues** + **92.5%** new-code coverage + 0 duplicated blocks. Close-out
done: substrate docs (phase 5, merged in the PR) + the `CLAUDE.md` "Current state" narrative + this
final-state line (close-out micro-PR) + `graphify update`.

**Next action:** none — done. Epic follow-ups (not this slice): S3 my-bookings (#114), S4 SSO (#112),
S6 operator self-reg (#115), S8 email verify (#113).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Flyway V25 `customer_account` migration | ✅ | phases 0–1 commit `bd924a8` |
| 1 — `customer` module: account identity (ports, records, service, adapter, arch tests) | ✅ | phases 0–1 commit `bd924a8` |
| 2 — Platform edge: register + login + session + rate-limit + security | ✅ | phase 2 commit `f3851e1` |
| 3 — Frontend: `CustomerAuth` core service + `auth/` pages + header | ✅ | phase 3 commit `bcae580` |
| 4 — e2e (mocked-a11y): register → sign in → sign out | ✅ | phase 4 commit `824bc1f` |
| 5 — Docs + substrate freshness | ✅ | phase 5 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Verified (phase 5) — `riviera-docs-freshness` over `origin/main...HEAD`:** 5 present-tense facts
patched, 0 flagged. `RESPONSIBILITIES.md` (customer Job/Not-My-Job + the RV-BE-11 fitness-function row for
`CustomerAuthPlacementTests`), `CONTEXT.md` (customer-account glossary), `CLAUDE.md` (bounded-context table
row), `docs/architecture/auth-signin-register.md` (D-2 "S2 realized" note: separate identity + the #111
drift), and `riviera-modulith/SKILL.md` (its canonical thin-module example was `customer` — now "none
today; graduated to full in #111"). The V5 migration's "(No accounts/auth in v1.)" comment is left as a
historical record. Deferred to merge close-out: the `CLAUDE.md` "Current state" narrative + the #108
checklist tick, per the repo's "reflect X merge" convention.

**Verified (phase 4):** `customer-auth.e2e.ts` (2 tests: register → signed-in header → reload survives →
sign out; sign-in with a generic wrong-password failure + no navigation) green, and the **full mocked-a11y
suite 47/47** (the header change is regression-clean — `theme-shell` axe sweeps, the mobile-menu test,
`discovery-flow`/`my-bookings`/`find-a-booking` axe all still pass). Added `mockCustomerAuthApi` +
`CustomerAuthPage` Page Object. **AC-11 is now fully covered** (unit + a11y + e2e). (Ops note: a hung
`ng serve` orphan on :4200 blocked the first run and was stopped so Playwright could serve a fresh build.)

**Verified (phase 3):** `npm run lint` clean; the full Vitest suite **679 tests / 89 files green**
(`customer-auth.spec` 9, `sign-in.spec` 4, `register.spec` 5, `sign-in.a11y.spec` + `register.a11y.spec`
axe, updated `app.spec` +2 header tests); `npm run build` succeeds (only pre-existing SCSS-budget
warnings). Covers **AC-11** (unit + a11y half; the e2e half is phase 4). Two fixes made during the phase:
the `customer-auth.spec` register tests must `await` a tick between the `/register` flush and the
follow-up `/me` (else an unflushed request cascaded "TestBed already instantiated" across files), and the
`app.spec` route-flags list gained the two `account/*` born-glass routes.

**Verified (phases 0–1):** `CustomerAccountServiceTest`, `JdbcCustomerAccountsIT` (Testcontainers —
boots Flyway V25, proves the ON-CONFLICT race-safety + no-overwrite), `CustomerAuthPlacementTests`, and
the structural net (`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`,
`PublishedSurfacePlacementArchitectureTests`, `ResponsibilitiesArchitectureTests`). Covers **AC-1, AC-2, AC-9**.

**Verified (phase 2):** `CustomerRegisterIT` (fresh auto-sign-in; duplicate byte-identical + sessionless;
password policy 400), `CustomerLoginIT` (session + `/me`=CUSTOMER; logout; unknown-vs-wrong 401 identical),
`CustomerRoleSeparationIT` (customer session → operator endpoint 403; cross-namespace creds 401),
`RateLimitFilterTest.customerLoginAndRegisterConsumeTheLoginBudget`, and the **R-1 regression check**
(`AuthSessionIT` + `PerOperatorLoginIT` green — operator login unchanged by the `establishSession`
refactor + the second manager). `WebSliceStubs` gained `CustomerAccounts` + `CustomerAccountProvisioning`
stubs. Covers **AC-3, AC-4, AC-5, AC-6, AC-7, AC-8** (+ R-1, R-2). Not yet exercised: the CI full suite
(run at PR) — the #127 full-suite-only class is mitigated by unique `X-Forwarded-For` per login.

**Findings register** — one row per review/Sonar/CI finding; every fix re-enters at Implement.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| CI-BE | CI | `PayoutModuleTest` context fails to load — the edge now needs `CustomerAccounts`/`CustomerAccountProvisioning`, unmocked in that `@ApplicationModuleTest` | fixed — 2 `@MockitoBean`s added |
| CI-FE | CI | `home.spec` + `venue-map.spec` date flake: hardcoded `2026-07-15` equals today's (07-14) default "tomorrow" → no change event → no re-fetch (pre-existing, not this slice) | fixed — chosen date derived from `defaultBookingDate` so it always differs from the default |
| F1 | review (high) | `RateLimitFilter`: customer login+register shared the operator login's per-IP bucket → operator lockout from a shared IP | fixed — separate `customerAuthBuckets`; new `RateLimitFilterTest.customerAuthBudgetIsSeparateFromOperatorLogin` |
| F2 | review (high) | `/me` now polymorphic but `OperatorAuth` adopted any principal → a customer session drove the operator console | fixed — the shared `SessionAuth` base filters by `principalType`; new operator-auth F2 test + existing customer "ignores OPERATOR" test |
| F3 | review | `register()` inferred success from `signedIn()` → a signed-in customer registering a taken email was falsely told "registered" | fixed — only report `registered` on a signed-out→signed-in transition |
| F4 | review | a >72-byte password got the "at least 8 characters" message | fixed — "8–72 characters" wording (hint + messages) |
| F5 | review | register auto-sign-in (extra bcrypt) made a fresh email measurably slower → timing enumeration oracle (D-8) | fixed — constant-time: an equal bcrypt verify burned on the duplicate branch |
| F6 | review (cleanup) | register returned the raw email; `/me`/login return normalized → display changed after reload | fixed — normalize at the edge, echo the canonical email |
| F7 | review (cleanup) | `CustomerAuth` duplicated ~80 lines of `OperatorAuth` | fixed — extracted `core/session-auth.ts` `SessionAuth` base; both extend it |
| F8 | review (cleanup) | dead Signal-Form `required()` validators (never rendered) | fixed — dropped the unused schema; `form(model)` for binding only |
| — | review (refuted) | establishSession re-auth with raw email | not a defect — `CustomerUserDetailsService` re-normalizes (verified) |
| S-1 | sonar (BLOCKER, `secrets:S8215`) | the F5 `TIMING_EQUALIZER_HASH` bcrypt literal flagged as an exposed credential (`AuthController`) | fixed — the throwaway equalizer hash is now computed once at construction via `passwordEncoder.encode(...)`, no source literal |
| S-2 | sonar (MAJOR ×2, `java:S1168`) | `RateLimitFilter.authBucketsFor` returned `null` for a `Map` | fixed — returns `Optional<Map>` (empty-map semantics would be wrong; the caller must tell "not an auth request" from "auth request") |

---

## File structure

**Backend — `customer` module (graduates to full):**
- `platform/src/main/resources/db/migration/V25__customer_account.sql` — new table (create).
- `platform/src/main/java/ai/riviera/platform/customer/api/CustomerAccounts.java` — auth-load port (create).
- `platform/src/main/java/ai/riviera/platform/customer/api/CustomerAccountProvisioning.java` — provisioning port (create).
- `platform/src/main/java/ai/riviera/platform/customer/vocabulary/CustomerAccountId.java` — `record CustomerAccountId(long value)` (create).
- `platform/src/main/java/ai/riviera/platform/customer/vocabulary/CustomerAccountCredential.java` — `record CustomerAccountCredential(String email, String passwordHash)` (create).
- `platform/src/main/java/ai/riviera/platform/customer/vocabulary/RegistrationOutcome.java` — sealed interface + `Registered(CustomerAccountId)` / `AlreadyRegistered` (create).
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountService.java` — `@Service` implementing both api ports, delegating to the internal store (create).
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountStore.java` — internal driven port (create).
- `platform/src/main/java/ai/riviera/platform/customer/adapter/out/JdbcCustomerAccounts.java` — `@Repository`, `JdbcClient`, package-private (create).
- `platform/src/main/java/ai/riviera/platform/customer/package-info.java` — update javadoc thin→full; `allowedDependencies` unchanged (`{}`) (modify).

**Backend — platform edge (root package):**
- `platform/src/main/java/ai/riviera/platform/CustomerUserDetailsService.java` — `implements UserDetailsService`, loads `CustomerAccounts`, builds `User…roles("CUSTOMER")` (create).
- `platform/src/main/java/ai/riviera/platform/AuthController.java` — add `POST /api/auth/customer/register`, `POST /api/auth/customer/login`; derive `principalType` from authorities; add `CustomerLoginRequest`/`RegisterRequest` records (modify).
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — `customerAuthenticationManager` bean; `permitAll` for the two customer paths; new path constants (modify).
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — match customer login + register in `isLoginAttempt` (modify).

**Backend — tests:**
- `platform/src/test/java/ai/riviera/platform/customer/CustomerAccountServiceTest.java` (create).
- `platform/src/test/java/ai/riviera/platform/customer/JdbcCustomerAccountsIT.java` (create, Testcontainers).
- `platform/src/test/java/ai/riviera/platform/CustomerAuthPlacementTests.java` (create — ArchUnit, mirrors `OperatorAuthPlacementTests`).
- `platform/src/test/java/ai/riviera/platform/CustomerRegisterIT.java`, `CustomerLoginIT.java`, `CustomerRoleSeparationIT.java` (create).
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — extend (modify) or add a customer case.

**Frontend:**
- `frontend/src/app/core/customer-auth.ts` + `.spec.ts` (create).
- `frontend/src/app/auth/register.ts` (+ `.html`) + `.spec.ts` + `.a11y.spec.ts` (create).
- `frontend/src/app/auth/sign-in.ts` (+ `.html`) + `.spec.ts` + `.a11y.spec.ts` (create).
- `frontend/src/app/auth/auth.model.ts` (create).
- `frontend/src/app/app.routes.ts` — add `account/register` + `account/sign-in` lazy routes (modify).
- `frontend/src/app/app.ts` (+ `.html`) — header signed-in state (modify).
- `frontend/e2e/customer-auth.e2e.ts` (create).
- `frontend/e2e/support/auth-mocks.ts` — add `mockCustomerAuthApi` (modify).
- `frontend/e2e/support/pages/customer-sign-in.page.ts`, `customer-register.page.ts` (create).

**Docs (phase 5):**
- `RESPONSIBILITIES.md` (customer Job / Not-My-Job line 166), `CONTEXT.md` (customer account vocabulary),
  `CLAUDE.md` (bounded-context table: customer now owns account identity), the customer `package-info`
  javadoc, `docs/architecture/auth-signin-register.md` (record the separate-identity S2 decision), epic
  **#108** checklist tick at close-out, `graphify update .`.

---

## Phase 0 — Flyway `V25__customer_account.sql`

**Files:** Create `platform/src/main/resources/db/migration/V25__customer_account.sql` · Test via the existing Flyway/Testcontainers boot.

- [ ] **Step 1: Write the migration**

```sql
-- V25: Customer accounts (epic #108 / S2 #111). A SEPARATE account identity from the guest
-- `customer` contact row (no FK): registration must never auto-claim a guest email's booking
-- history — linking is a deliberate, S8-verified step (design D-6). Mirrors the operator identity
-- store (V16/V17) but the hash is NOT NULL (an account is created by registration, always with a hash).
CREATE TABLE customer_account (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customer_account_email_uniq UNIQUE (email)
);
```

> Email is app-normalized (lowercase + trim) before insert/lookup, matching `JdbcCustomerDirectory`;
> the UNIQUE constraint both prevents duplicate accounts and backs the `findByEmail` lookup index
> (invariant #12 — the constraint that enforces "one account per email" is created by this migration).
> No FK to `customer` (R-4). No status/verification column — S8 adds verification state.

- [ ] **Step 2: Verify it applies** — `./gradlew test --tests "*ModularityTests*"` boots Flyway against
  Testcontainers; confirm the migration applies cleanly and the app context loads (or a dedicated
  `FlywayMigrationIT` if present). → PASS (Docker required; skips cleanly without it).
- [ ] **Step 3: Commit** — `git commit -m "S2 #111: V25 customer_account table"`.
- [ ] **Step 4: Update Execution status** (phase 0 ✅) in the same commit window.

---

## Phase 1 — `customer` module: account identity

**Files:** Create the `api/`, `vocabulary/`, `application/`, `adapter/out/` classes above · Test `CustomerAccountServiceTest`, `JdbcCustomerAccountsIT`, `CustomerAuthPlacementTests`.

- [ ] **Step 1: Failing service test** (fake store):

```java
class CustomerAccountServiceTest {
  // A hand fake of CustomerAccountStore backed by a Map<String, CustomerAccountCredential>.
  @Test void registerCreatesAccountAndReturnsRegistered() {
    var store = new FakeCustomerAccountStore();
    var service = new CustomerAccountService(store);
    var outcome = service.register("Alice@Example.com ", "{bcrypt}$2a$hash");
    assertThat(outcome).isInstanceOf(RegistrationOutcome.Registered.class);
    assertThat(store.findByEmail("alice@example.com")).isPresent();   // normalized
    assertThat(store.findByEmail("alice@example.com").get().passwordHash()).isEqualTo("{bcrypt}$2a$hash");
  }
  @Test void registerExistingEmailReturnsAlreadyRegisteredAndDoesNotOverwrite() {
    var store = new FakeCustomerAccountStore();
    var service = new CustomerAccountService(store);
    service.register("alice@example.com", "{bcrypt}first");
    var again = service.register("alice@example.com", "{bcrypt}second");
    assertThat(again).isEqualTo(RegistrationOutcome.AlreadyRegistered.INSTANCE);
    assertThat(store.findByEmail("alice@example.com").get().passwordHash()).isEqualTo("{bcrypt}first");
  }
}
```

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*CustomerAccountServiceTest*"` → FAIL (classes absent).
- [ ] **Step 3: Minimal implementation** — the ports, records, sealed `RegistrationOutcome`, and the service:

```java
// customer/vocabulary/RegistrationOutcome.java
public sealed interface RegistrationOutcome permits RegistrationOutcome.Registered, RegistrationOutcome.AlreadyRegistered {
    record Registered(CustomerAccountId accountId) implements RegistrationOutcome {}
    enum AlreadyRegistered implements RegistrationOutcome { INSTANCE }  // singleton, no payload
}

// customer/api/CustomerAccounts.java  (auth-load port)
public interface CustomerAccounts { Optional<CustomerAccountCredential> findByEmail(String email); }

// customer/api/CustomerAccountProvisioning.java  (takes an ALREADY-ENCODED hash, like operator)
public interface CustomerAccountProvisioning { RegistrationOutcome register(String email, String passwordHash); }

// customer/application/CustomerAccountService.java  (package-private @Service)
@Service class CustomerAccountService implements CustomerAccounts, CustomerAccountProvisioning {
    private final CustomerAccountStore store;
    CustomerAccountService(CustomerAccountStore store) { this.store = store; }
    @Override public Optional<CustomerAccountCredential> findByEmail(String email) {
        return store.findByEmail(normalize(email));
    }
    @Override @Transactional public RegistrationOutcome register(String email, String passwordHash) {
        return store.insertIfAbsent(normalize(email), passwordHash);   // ON CONFLICT DO NOTHING
    }
    private static String normalize(String email) { return email.strip().toLowerCase(Locale.ROOT); }
}
// customer/application/CustomerAccountStore.java  (internal driven port)
interface CustomerAccountStore {
    Optional<CustomerAccountCredential> findByEmail(String normalizedEmail);
    RegistrationOutcome insertIfAbsent(String normalizedEmail, String passwordHash);
}
```

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*CustomerAccountServiceTest*"` → PASS.
- [ ] **Step 5: JDBC adapter + IT** — `JdbcCustomerAccounts implements CustomerAccountStore` with text-block SQL:

```java
@Repository class JdbcCustomerAccounts implements CustomerAccountStore {
  private final JdbcClient jdbc;
  JdbcCustomerAccounts(JdbcClient jdbc) { this.jdbc = jdbc; }
  @Override public RegistrationOutcome insertIfAbsent(String email, String passwordHash) {
    return jdbc.sql("""
        INSERT INTO customer_account (email, password_hash) VALUES (:email, :hash)
        ON CONFLICT (email) DO NOTHING RETURNING id""")
      .param("email", email).param("hash", passwordHash)
      .query(Long.class).optional()
      .<RegistrationOutcome>map(id -> new RegistrationOutcome.Registered(new CustomerAccountId(id)))
      .orElse(RegistrationOutcome.AlreadyRegistered.INSTANCE);
  }
  @Override public Optional<CustomerAccountCredential> findByEmail(String email) {
    return jdbc.sql("SELECT email, password_hash FROM customer_account WHERE email = :email")
      .param("email", email)
      .query((rs, n) -> new CustomerAccountCredential(rs.getString("email"), rs.getString("password_hash")))
      .optional();
  }
}
```
  IT (`JdbcCustomerAccountsIT`, Testcontainers): `insertStoresOnlyTheHash`, `findByEmailNormalizes`,
  `concurrentRegisterClaimsOnce` (two threads register the same email → exactly one `Registered`).

- [ ] **Step 6: Placement + modularity tests** — add `CustomerAuthPlacementTests` (mirror `OperatorAuthPlacementTests`):

```java
ArchRule rule = noClasses()
    .that().resideInAPackage(PRODUCTION_BASE + ".customer..")
    .should().dependOnClassesThat().resideInAnyPackage("org.springframework.security..")
    .because("authentication/login is a platform/edge concern (RV-BE-11); the customer module stores "
        + "an opaque credential hash but never encodes/verifies it.");
rule.check(PRODUCTION_CLASSES);
```
  Run `./gradlew test --tests "*CustomerAuthPlacementTests*" --tests "*ModularityTests*"` → PASS (the
  thin→full graduation still verifies; update `package-info` javadoc to describe the full shape).

- [ ] **Step 7: Generalization-audit pass** — search for other guest-email normalization sites; confirm the
  account normalization matches `JdbcCustomerDirectory`. Record in the log.
- [ ] **Step 8: Commit** (`S2 #111: customer account identity module`) + **Step 9:** update Execution status.

---

## Phase 2 — Platform edge: register + login + session

**Files:** Create `CustomerUserDetailsService` · Modify `SecurityConfig`, `AuthController`, `RateLimitFilter` · Test `CustomerRegisterIT`, `CustomerLoginIT`, `CustomerRoleSeparationIT`, `RateLimitFilterTest`.

- [ ] **Step 1: Failing ITs** — `CustomerRegisterIT` / `CustomerLoginIT` / `CustomerRoleSeparationIT`
  (mock-MVC or `@SpringBootTest`, mirroring `AuthSessionIT`): the AC-3..AC-8 scenarios. Run → FAIL (404, endpoints absent).

- [ ] **Step 2: Edge implementation.**
  - `CustomerUserDetailsService implements UserDetailsService`: load `CustomerAccounts.findByEmail(email)`
    → `User.withUsername(cred.email()).password(cred.passwordHash()).roles("CUSTOMER").build()`; unknown →
    `UsernameNotFoundException`.
  - `SecurityConfig`: add the second manager **without** disturbing S1's:

```java
private static final String CUSTOMER_LOGIN_PATH    = "/api/auth/customer/login";
private static final String CUSTOMER_REGISTER_PATH  = "/api/auth/customer/register";

@Bean AuthenticationManager customerAuthenticationManager(CustomerAccounts accounts, PasswordEncoder encoder) {
    var provider = new DaoAuthenticationProvider(new CustomerUserDetailsService(accounts));
    provider.setPasswordEncoder(encoder);
    return new ProviderManager(provider);   // separate manager; operator's auto-wired bean is untouched
}
// in authorizeHttpRequests, beside the operator LOGIN_PATH permit:
.requestMatchers(HttpMethod.POST, CUSTOMER_LOGIN_PATH, CUSTOMER_REGISTER_PATH).permitAll()
```

  - `AuthController`: inject both managers by qualifier; add the endpoints; derive `principalType` from authorities.

```java
AuthController(@Qualifier("authenticationManager") AuthenticationManager operatorManager,
               @Qualifier("customerAuthenticationManager") AuthenticationManager customerManager,
               SecurityContextRepository repo, PasswordEncoder encoder,
               CustomerAccountProvisioning customerAccounts) { ... }

@PostMapping("/api/auth/customer/register")
ResponseEntity<PrincipalResponse> register(@RequestBody RegisterRequest req, HttpServletRequest request,
                                           HttpServletResponse response) {
    validatePassword(req.password());                          // min 8, ≤72 bytes → IllegalArgumentException → 400
    var outcome = customerAccounts.register(req.email(), encoder.encode(req.password()));
    if (outcome instanceof RegistrationOutcome.Registered) {  // fresh → establish the CUSTOMER session
        establishSession(customerManager, req.email(), req.password(), request, response);
    }
    // fresh AND duplicate return the IDENTICAL body+status; only the fresh path set a SESSION cookie (R-2).
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(new PrincipalResponse(normalize(req.email()), CUSTOMER_PRINCIPAL_TYPE));
}

@PostMapping("/api/auth/customer/login")
PrincipalResponse customerLogin(@RequestBody CustomerLoginRequest login, HttpServletRequest request,
                                HttpServletResponse response) {
    var auth = establishSession(customerManager, login.email(), login.password(), request, response);
    return new PrincipalResponse(auth.getName(), CUSTOMER_PRINCIPAL_TYPE);
}
```
  `establishSession(...)` factors out S1's authenticate → `changeSessionId()` → save-context block (shared
  by operator + customer). `/me` maps authorities → `principalType` (`ROLE_CUSTOMER`→CUSTOMER, else OPERATOR).

  - `RateLimitFilter`: extend `isLoginAttempt` to also match `CUSTOMER_LOGIN_PATH` + `CUSTOMER_REGISTER_PATH`
    (reuse the `login` per-IP budget, per the resolved open question).

- [ ] **Step 3: Run the ITs** → PASS. Then broaden: `./gradlew test --tests "*Auth*IT*" --tests "*ModularityTests*"`
  (operator `AuthSessionIT` **must** stay green — R-1).
- [ ] **Step 4: Generalization-audit** — the `establishSession` extraction is the generalization (operator +
  customer share it); confirm operator login now routes through the shared helper with identical behavior.
- [ ] **Step 5: Commit** (`S2 #111: customer register + login at the platform edge`) + update Execution status.

---

## Phase 3 — Frontend: `CustomerAuth` + `auth/` pages + header

**Files:** Create `core/customer-auth.ts`, `auth/register.ts`, `auth/sign-in.ts`, `auth/auth.model.ts` + specs · Modify `app.routes.ts`, `app.ts`.
**Load at phase start:** `angular-developer` + angular-cli MCP (`get_best_practices`) for v22 Signal Forms + a11y.

- [ ] **Step 1: Unit specs first** — `customer-auth.spec.ts` (register/signIn/signOut/restore against an
  `HttpClient` mock; `/me` filtered by `principalType`), `register.spec.ts` / `sign-in.spec.ts` (form
  validation, generic error message), `*.a11y.spec.ts` (axe, labels, focus). Run → FAIL.
- [ ] **Step 2: Implement** `CustomerAuth` mirroring `OperatorAuth` (signals + `restore()` field-initializer,
  `SignInResult` union, generic-failure message helper); the two pages with Signal Forms (email + password,
  min-length 8, WCAG AA labels/errors); the header block in `app.ts` (`@if (customerAuth.signedIn())` →
  "Signed in as {{ email }}" + Sign out, `@else` → Sign in / Register links). Reuse `apiSessionInterceptor`.
- [ ] **Step 3: Routing** — add to `app.routes.ts` (flat, lazy, titled): `account/register` → `Register`,
  `account/sign-in` → `SignIn`. Literal segments; no `:param` clash.
- [ ] **Step 4: Run** `npm test` (scoped) + `npm run test:a11y` → PASS. `npm run lint`.
- [ ] **Step 5: Commit** (`S2 #111: customer auth pages + header state`) + update Execution status.

---

## Phase 4 — e2e (mocked-a11y suite)

**Files:** Create `frontend/e2e/customer-auth.e2e.ts`, `support/pages/customer-*.page.ts` · Modify `support/auth-mocks.ts`.
**Load at phase start:** `playwright-cli`; place in the **CI-safe mocked** suite (`frontend/e2e/*.e2e.ts`), per RV-FE-E2E.

- [ ] **Step 1:** Add `mockCustomerAuthApi(page, {...})` to `auth-mocks.ts` — stateful in-memory mock of
  `POST /api/auth/customer/register`, `POST /api/auth/customer/login`, `GET /api/auth/me`, `POST /api/auth/logout`,
  emitting RFC-7807 bodies and toggling a `signedIn` flag; mirror the existing `mockAuthApi`.
- [ ] **Step 2:** Page objects `customer-register.page.ts` + `customer-sign-in.page.ts` (mirror
  `operator-sign-in.page.ts`).
- [ ] **Step 3:** `customer-auth.e2e.ts` — `test('tourist registers, survives a reload, and signs out')`
  and a sign-in path; assert header "Signed in as …" and `expectNoSeriousAxeViolations` on both pages
  (await animations first).
- [ ] **Step 4: Run** `npm run test:e2e:a11y` (the CI-safe suite; per memory, this is the Windows-runnable one) → PASS.
- [ ] **Step 5: Commit** (`S2 #111: customer-auth e2e (mocked-a11y)`) + update Execution status.

---

## Phase 5 — Docs + epic close-out

- [ ] **Step 1:** `RESPONSIBILITIES.md` — rewrite the customer **Not-My-Job** line 166 ("tourist accounts /
  authentication out of scope") → customer now **owns account identity + opaque credential hash** (Job);
  **login machinery stays at the platform edge** (still Not-My-Job, RV-BE-11).
- [ ] **Step 2:** `CONTEXT.md` — add "customer account" vocabulary (account vs. guest-contact identity; the
  no-link-without-verification boundary).
- [ ] **Step 3:** `CLAUDE.md` bounded-context table — `customer` row gains "account identity + credential
  hash (#111)"; note the thin→full graduation.
- [ ] **Step 4:** `docs/architecture/auth-signin-register.md` — record the S2 **separate-identity** decision
  (refines D-2/D-6) and the recorded drift from #111's "keyed by CustomerId".
- [ ] **Step 5:** Update the customer `package-info.java` javadoc (already done in phase 1) is reflected;
  tick the epic **#108** S2 checkbox at merge close-out with the PR number; annotate issue **#111** with the
  separate-identity drift note.
- [ ] **Step 6:** `graphify update .` (doc changes are not covered by the code-only post-commit hook).
- [ ] **Step 7: Commit** (`S2 #111: substrate docs for customer accounts`) + final Execution status update.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-13 | Phase 2 (`establishSession` extraction) | login → session-establish blocks that should share one flow | Read `AuthController` (operator + customer + register) | 3 (operator login, customer login, register auto-sign-in) | Extracted one `establishSession(manager, …)` helper; all three call it. Operator behavior pinned unchanged by `AuthSessionIT` (R-1). |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1/2:** `./gradlew test --tests "*CustomerAccountServiceTest*" --tests "*JdbcCustomerAccountsIT*"` → PASS.
- [ ] **AC-3/4/6/8:** `./gradlew test --tests "*CustomerRegisterIT*" --tests "*CustomerLoginIT*"` → PASS.
- [ ] **AC-5:** `./gradlew test --tests "*CustomerRoleSeparationIT*"` → PASS.
- [ ] **AC-7:** `./gradlew test --tests "*RateLimitFilterTest*"` → PASS.
- [ ] **AC-9:** `./gradlew test --tests "*CustomerAuthPlacementTests*" --tests "*ModularityTests*"` → PASS.
- [ ] **AC-10:** operator + guest ITs (`AuthSessionIT`, `CreateBookingInstantIT`, `ViewCancelBookingIT`) stay green.
- [ ] **AC-11:** `npm run test:e2e:a11y` (customer-auth) + `npm run test:a11y` → PASS.
- [ ] **AC-12:** docs updated; `riviera-docs-freshness` clean at close-out.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — `JdbcClient` + text-block SQL only.
- [ ] **Availability** section justified N/A (S2 touches no availability/booking/map); guest checkout regression-tested (AC-10).
- [ ] Pool + cutoff rules unaffected (invariants #3, #4).
- [ ] **Modulith** section filled; `customer` graduates thin→full; no cross-module `application.*`/`adapter.*` imports; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** section N/A — no money in scope.
- [ ] Refund policy N/A.
- [ ] Timezone: `created_at TIMESTAMPTZ`, UTC stored (invariant #6).
- [ ] Booking codes unaffected (invariant #7); credential hash opaque, never logged.
- [ ] Flyway `V25` present; the UNIQUE(email) constraint that enforces "one account per email" is tested (invariant #12).
- [ ] **Frontend** standards met (standalone, signals, Signal Forms, a11y); no `as any` on the contract.
- [ ] Login machinery at the platform edge only; `customer` imports no Spring Security type (RV-BE-11, `CustomerAuthPlacementTests`).
- [ ] Register/login errors on the central `ProblemDetail` contract (§6b), non-enumerating (D-8).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty (or deferred with an issue #).
