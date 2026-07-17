# S8 — Email verification + password reset via a mocked mailer — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task, red-green-refactor.
> The **Execution status** section is the session-recovery anchor — re-read it (plus the current
> `riviera-sdlc` reference file) after any compaction or in a fresh session before acting.

**Goal:** Ship customer email-verification and self-service password-reset end-to-end against a
**mocked mailer** (real SMTP deferred, same stub shape as SSO/payment): registration issues a
verification link that marks the account's email verified; "forgot password" issues a reset link
that sets a new password and invalidates all existing sessions; and an SSO-only (password-less)
account gains a password via an authenticated set-password screen **or** the reset flow — closing
the S4 **F-1** gap. Tokens are bearer credentials (invariant #7): unguessable, single-use,
expiring, stored **hashed**. Both request endpoints are rate-limited and **non-enumerating**.

**Architecture:** The one load-bearing decision is the **edge/module split**, mirroring S4 exactly.
**Mailer machinery lives at the platform edge** (`ai.riviera.platform` root, not a module — RV-BE-11):
a `Mailer` port with a default **mock** adapter (`@Profile("!mailer")`) that records/logs the tokenized
link, a **real `SmtpMailer`** that throws `UnsupportedOperationException` (`@Profile("mailer")`), and a
`MockMailerProdGuard` (`@Profile("prod & !mailer")`) that aborts boot — the `MockSsoGateway` /
`GoogleSsoGateway` / `MockSsoProdGuard` triad, copied. **The account-tied token store lives in the
`customer` module** behind one new **`customer::api` port `CustomerAccountRecovery`** (the edge *calls*
it → `api/`, never `spi/` — the S4 `SsoAccountProvisioning` precedent). The module stores an **opaque
SHA-256 digest** of each token and owns the **atomic single-use/expiry claim in SQL** — the digest and
the bcrypt password-encode both stay at the **edge** (credential-material transformation is edge work,
exactly like the existing password flow), keeping the module free of any crypto and any
`org.springframework.security` type (`CustomerAuthPlacementTests`).

**Persistence:** JDBC only (invariant #1). New **V28** migration (`V27` is highest on `main` → `V28`
free): add `email_verified` (+ `email_verified_at`) to `customer_account` with an `EXISTS`-backfill for
SSO-linked accounts (provider-verified, D-6); new `customer_account_token` table (`purpose` TEXT+CHECK,
`token_hash` UNIQUE, FK-indexed `account_id`, nullable `consumed_at`, `expires_at`). No other schema
change. All access via `JdbcClient` + text-block SQL.

**Source of intent:** Issue **#113** (epic **#108**, S8). Design: `docs/architecture/auth-signin-register.md`
(D-6, D-8) — **D-6 is amended by this slice** (maintainer decision 2026-07-17: guest-mode bookings are
**never** back-linked; email verification ships for email-ownership confirmation + reset trust + spam
reduction, gating nothing functional in v1). Prior slices built on: S2 #111 (`customer_account`, edge
auth machinery, `PasswordEncoder`, `customerAuthenticationManager`, `RateLimitFilter` customer buckets,
`SessionAuthentication`), S3 #114 (`CustomerAccountDirectory`, `CurrentCustomer`, `/api/me/*`, `booking.account_id`),
S4 #112 (mock/real/`@Profile`-guard triad, `password_hash` relaxed nullable, `customer_sso_identity`).

**Skills consulted:**
- `riviera-sdlc` (issue-intake grill gate — re-validated ACs against today's code: **no** `email_verified`
  column / token table / session-registry exist yet (all greenfield; V25 reserves the column in a comment);
  `password_hash` is nullable (V27) so reset/verify must handle SSO-only accounts; rate-limit buckets are
  per-dimension per-IP (don't reuse `customerAuthBuckets` — the S2 operator-lockout fix); customer
  login/register are CSRF-protected. **Back-linking killed by maintainer** → D-6 amended, not deferred).
- `riviera-modulith` (placement — `Mailer` + endpoints + session-registry stay at the **edge** (root package),
  not a module; the token store is one `customer::api` port `CustomerAccountRecovery` (inbound: edge calls it →
  `api/`, not `spi/`); `allowedDependencies` unchanged (`customer` still depends on nothing); new sealed
  outcomes → `vocabulary/`).
- `postgres` (V28 shape — `email_verified BOOLEAN NOT NULL DEFAULT false`; `EXISTS`-backfill; token table
  `purpose TEXT CHECK`, `token_hash TEXT UNIQUE` for the O(1) single-use claim, FK `account_id` indexed,
  `TIMESTAMPTZ` throughout, no native enum, no cascade).
- `riviera-java-conventions` (records for DTOs/ids; **sealed outcome** types (`VerifyEmailOutcome`,
  `ResetPasswordOutcome`) over exceptions; `JdbcClient` + text-block SQL; package-private adapters;
  `Optional` from query ports; named constants for `purpose`/policy literals; RFC-7807 `ApiProblem`/`ApiErrorHandler`
  for 4xx; never log the raw token — invariant #7/§10).
- `codebase-design` (the token store is a **deep module** — the `CustomerAccountRecovery` port hides
  hashing-format, expiry, and single-use mechanics behind `verifyEmail(tokenHash)` / `resetPassword(tokenHash,newHash)`).
- `domain-modeling` (new ubiquitous-language terms — *email-verification token*, *password-reset token*,
  *verified email*, *account recovery* — folded into `CONTEXT.md` at close-out).
- *To load at their phases (routing gate):* `riviera-local-debug` (before first build), `riviera-frontend`
  + `angular-developer` + angular-cli MCP + `riviera-tailwind` + `playwright-cli` (Phase 4), `riviera-review-overlay`
  (review gate), `riviera-docs-freshness` (merge close-out).

**Branch:** `feature/s8-email-verification-password-reset` (this session's branch stands in for
`feature/<slug>`; created off `main` before Phase 0).

---

## Acceptance criteria (testable)

> Written at the application boundary (inner hexagon) where possible; adapter-level assertions
> (HTTP status, session cookie, Angular screen) live in adapter/e2e tests.

- [ ] **AC-1 (verify token issue+redeem, inner hexagon):** Given a `customer_account`, when
  `CustomerAccountRecovery.issueEmailVerificationToken(accountId, tokenHash, expiresAt)` then
  `verifyEmail(tokenHash)` is called, then it returns `Verified(accountId)` and the account's
  `email_verified` is `true`; a **second** `verifyEmail` with the same `tokenHash` returns
  `InvalidOrExpired` (single-use); a token past `expires_at` returns `InvalidOrExpired`.
  *Pinned by:* `CustomerAccountRecoveryIT.verifyEmail_firstRedeemsMarksVerified_secondAndExpiredFail`.
- [ ] **AC-2 (reset token issue+redeem, inner hexagon):** Given an issued reset token, when
  `resetPassword(tokenHash, newPasswordHash)` is called, then it returns `Reset(accountId)`, the
  account's `password_hash` equals `newPasswordHash`, and a second/expired redemption returns
  `InvalidOrExpired`. *Pinned by:* `CustomerAccountRecoveryIT.resetPassword_setsHashOnce_secondAndExpiredFail`.
- [ ] **AC-3 (reset invalidates sessions + old password dies, adapter/edge):** Given a signed-in
  customer with an active `SESSION`, when they complete `POST /api/auth/customer/reset-password`
  with a valid token + new password, then every session for that principal is deleted (the old
  cookie is unauthenticated on the next request) and the old password yields `401` at
  `/api/auth/customer/login` while the new password yields `200`. *Pinned by:*
  `PasswordResetIT.resetInvalidatesSessionsAndRotatesPassword`.
- [ ] **AC-4 (non-enumerating + rate-limited requests, adapter/edge):** `POST /api/auth/customer/forgot-password`
  returns the **same** status+body for a known email, an unknown email, and an SSO-only email (D-8);
  the forgot-password / reset / verify endpoints return `429` past the per-IP limit from their **own**
  bucket map (not `customerAuthBuckets`). *Pinned by:* `ForgotPasswordEnumerationIT.identicalResponseRegardlessOfAccountState`
  + `RecoveryRateLimitIT.recoveryEndpointsAreRateLimitedPerIp`.
- [ ] **AC-5 (F-1: SSO-only account gains a password — authenticated set-password):** Given an SSO-only
  account (`password_hash` NULL), when the signed-in customer calls `POST /api/me/password` with a new
  password (no current password required, since none exists), then `password_hash` is set and the account
  can subsequently `POST /api/auth/customer/login` with the new password (`200`). Given an account that
  **already** has a password, the same endpoint **requires** the correct current password (`400`/`401`
  without it). *Pinned by:* `SetPasswordIT.ssoOnlyAccountSetsFirstPassword_existingRequiresCurrent`.
- [ ] **AC-6 (F-1 via reset, non-enumerating):** Given an SSO-only account, `forgot-password` for its
  email issues a reset token (identical neutral response) that `reset-password` uses to set the account's
  first password; it can then password-login. *Pinned by:* `PasswordResetIT.ssoOnlyAccountCanSetPasswordViaReset`.
- [ ] **AC-7 (registration issues verification; soft/non-blocking):** Registering (`POST /api/auth/customer/register`)
  still returns the account **signed-in** (S2 behavior byte-for-byte) **and** issues a verification token via
  the `Mailer` port; the account is immediately usable (can book) while `email_verified` is `false`.
  *Pinned by:* `RegisterIssuesVerificationIT.registerSignsInAndSendsVerification` (+ S2 `CustomerRegisterIT` stays green).
- [ ] **AC-8 (SSO accounts are verified; migration backfill):** A `resolveOrCreate` SSO sign-in creates/keeps
  the account with `email_verified = true` (provider-verified, D-6); V28 backfills existing SSO-linked
  accounts to `email_verified = true`. *Pinned by:* `SsoAccountVerifiedIT.ssoResolveMarksVerified` +
  `V28MigrationIT.backfillsSsoLinkedAccounts`.
- [ ] **AC-9 (verified state on `me`, adapter/edge):** `GET /api/auth/me` for a CUSTOMER principal includes
  `emailVerified`; it flips `false → true` after a successful verify. *Pinned by:* `AuthMeVerifiedFlagIT.meReflectsVerifiedState`.
- [ ] **AC-10 (mailer profile triad):** With the default (mock) profile the `Mailer` bean is the recording
  `MockMailer`; with `mailer` active (no impl) `SmtpMailer` throws `UnsupportedOperationException`; with
  `prod` active and `mailer` **not** active the context **fails to start** (`MockMailerProdGuard`); booting
  `prod,mailer` succeeds. *Pinned by:* `RealMailerTest.smtpThrowsUnsupported` + `MockMailerProdGuardTest.prodWithoutMailerAbortsContext`.
- [ ] **AC-11 (module purity / boundaries):** No mail machinery and no `org.springframework.security` type
  lands inside the `customer` module; the token store is reached only via `customer::api`;
  `ModularityTests` + `CustomerAuthPlacementTests` + `PublishedSurfacePlacementArchitectureTests` stay green.
  *Pinned by:* those existing tests (must stay green).
- [ ] **AC-12 (e2e, mocked suite):** The verify-email journey and the password-reset journey pass in the
  CI-safe mocked a11y suite. *Pinned by:* `frontend/e2e/email-verification.e2e.ts` + `frontend/e2e/password-reset.e2e.ts`.

## Non-goals

- **Back-linking / claiming past guest-mode bookings to an account — NEVER** (maintainer decision
  2026-07-17; amends design D-6). Email verification gates **nothing functional** in v1; the
  `email_verified` flag is informational (a "please verify" nudge + a future trust signal). This slice
  does **not** touch `booking`, `booking.account_id`, or my-bookings.
- **Real SMTP / email provider** — deferred exactly like the S5 SSO credentials; `SmtpMailer` throws
  `UnsupportedOperationException`; tracked as a ready-for-human follow-up.
- **Blocking verification** — unverified accounts sign in and book normally (soft, per the answered grill).
- **Account lockout / MFA / "someone tried to register your email" notices / email-change flow** — out of scope.
- **Operator-side verification/reset** — the epic's operator work is S6 (#115); this slice is customer-only.
- **Any change to guest checkout, the booking-code flow, or availability.**

## Behavior-parity ledger (retirement / replacement slices only)

Mostly **new behavior**. The one **modified existing surface** is `POST /api/auth/customer/register`
(S2) and `GET /api/auth/me` (S1/S3) — additive, no retirement:

| Old-surface behavior | Verdict | How the new surface does it |
|---|---|---|
| `register` → account created + **auto-signed-in** + neutral `AlreadyRegistered` response (D-8) | **preserved** | unchanged; a verification-token issue + `Mailer` call is **appended** only on `Registered(accountId)` (never on `AlreadyRegistered` → no enumeration leak) |
| `register` constant-time equalizer on `AlreadyRegistered` | **preserved** | the appended mail send happens only on the `Registered` branch; the neutral branch's timing profile is unchanged (send is post-branch, see R-6) |
| `GET /api/auth/me` → `PrincipalResponse(username, principalType)` | **changed (additive)** | gains a nullable `emailVerified` (populated for CUSTOMER via `CurrentCustomer` → `isEmailVerified`; `null` for operator) — the FE ignores unknown/absent fields, so no client break |
| `findByEmail` filters `password_hash IS NOT NULL` (S4) | **preserved** | untouched; the authenticated set-password path uses it to detect "no existing password" (SSO-only → set freely) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Token guessable / not treated as a secret** (invariant #7) | low | high | Raw token = 32 bytes from `SecureRandom`, base64url; only the **SHA-256 digest** is stored (`token_hash`); the raw token is never logged nor persisted (the mock mailer's dev-only link log is `@Profile("!mailer")` + prod-guarded). Single-use + expiry enforced in one atomic `UPDATE … RETURNING`. | Ivo | open |
| R-2 | **Wrong hash choice breaks lookup** — bcrypt salts randomly, can't be queried by hash | low | high | Tokens use a **deterministic SHA-256** digest (not the bcrypt `PasswordEncoder`) precisely so the consume path can `WHERE token_hash = ?`; bcrypt stays for **passwords** only. Stated in the migration comment + `TokenHasher`. | Ivo | open |
| R-3 | **Account enumeration** via forgot-password / verify timing or status | med | high | Identical status+body for known/unknown/SSO-only email (AC-4); the issue+send happens on a uniform path; per-IP rate-limit. Verify/reset invalid-vs-expired-vs-used are indistinguishable (`InvalidOrExpired`). | Ivo | open |
| R-4 | **Reset does not invalidate other sessions** (attacker session survives) | med | high | On reset success the edge deletes **all** sessions for the principal via `FindByIndexNameSessionRepository.findByPrincipalName(email)` → `deleteById` (Spring Session JDBC, keyed on the existing `SPRING_SESSION_IX3` `PRINCIPAL_NAME` index). Pinned by AC-3. | Ivo | open |
| R-5 | **Account-takeover via register-time UPSERT** for SSO-only accounts | low | high | **Explicitly not done** (the F-1 anti-pattern): the register path keeps `ON CONFLICT (email) DO NOTHING`; a password is only ever set via an **authenticated** set-password (own SSO session, provider-verified email) or a **token-proven** reset — never by an unauthenticated register for a taken email. | Ivo | open |
| R-6 | **Verification email as a mutating GET** consumed by email scanners/prefetchers | med | med | The email link points at an **SPA route** (`/account/verify?token=…`, a GET that mutates nothing); verification is a subsequent **`POST /api/auth/customer/verify-email`** the page issues — scanners GET the shell, never run the XHR. CSRF-protected like every SPA POST. | Ivo | open |
| R-7 | **New edge beans break slice/module tests** — a new controller/`Mailer`/`CustomerAccountRecovery` bean breaks `@WebMvcTest` (`WebSliceStubs`) and `@ApplicationModuleTest` partial contexts (case history: S2 #111 / S4 #112 `PayoutModuleTest`) | med | med | After adding the edge controller + ports, run `*ModularityTests*` + the web-slice + module tests; add inert stubs to `WebSliceStubs` (`Mailer`, `CustomerAccountRecovery`, the session repo) and `@MockitoBean` to any `@ApplicationModuleTest` whose context now needs them. Full-suite-only failures surface in CI — check the push's run. | Ivo | open |
| R-8 | **Rate-limit bucket starvation** — reusing `customerAuthBuckets` lets reset spam lock out login | low | med | S8 endpoints get their **own** per-IP `recoveryBuckets` map (the S2 operator-lockout fix pattern), not `customerAuthBuckets`. | Ivo | open |
| R-9 | **Flyway V28 collision** with a parallel slice | low | high | `V27` is highest on `main`; all 10 open PRs are Dependabot frontend bumps (none touch migrations). `V28` claimed. If a parallel migration merges first, **this branch renumbers** (merges second). | Ivo | open |
| R-10 | **Error-contract drift** — recovery endpoints return ad-hoc `{"error":…}` bodies | low | med | 4xx via the centralized `ApiProblem`/`ApiErrorHandler` (RFC-7807, stable `code` — e.g. `INVALID_OR_EXPIRED_TOKEN`, `WEAK_PASSWORD`, `INVALID_CURRENT_PASSWORD`); no per-controller `@ExceptionHandler` (`ErrorContractArchitectureTests`). `detail` never leaks the token or account existence. | Ivo | open |

## Open questions / Assumptions

- **Assumption (resolved by maintainer 2026-07-17):** Guest-mode bookings are **never** back-linked;
  email verification gates nothing functional (soft). **Action:** amend design D-6 in this slice's plan commit.
- **Assumption:** verification-token TTL **24h**, reset-token TTL **1h** (shorter = more sensitive), both
  as config properties (`riviera.recovery.*`, mirroring `RateLimitProperties`). — *Owner:* Ivo · *Resolves by:* Phase 0.
- **Assumption:** the email link base URL is a config property `riviera.mail.link-base-url` (default
  `http://localhost:4200` for dev; the deployed origin for demo). Only cosmetic until the real mailer ships
  (mock records the link; e2e mocks the API). — *Owner:* Ivo · *Resolves by:* Phase 2.
- **Assumption:** mailer profile is `mailer` (activates the real adapter, mirrors `sso`/`stripe`); the mock is
  the default `!mailer`; `prod` without `mailer` is the misconfig the guard catches. No `application-prod.properties`
  added here. — *Owner:* Ivo · *Resolves by:* Phase 1.
- **Assumption:** issuing a new token of a given purpose **invalidates** the account's prior unconsumed tokens
  of that purpose (only the latest link works). — *Owner:* Ivo · *Resolves by:* Phase 0.

### Resolved

- Back-linking scope, F-1 closure shape, verification enforcement — resolved via `AskUserQuestion`
  (2026-07-17): **no back-linking ever** (amends D-6); **both** authenticated set-password **and** reset-token
  flow close F-1; verification is **soft/non-blocking**.

## Availability & concurrency (invariant #2)

**N/A — does not affect `availability`.** S8 touches identity/credential state only (`customer_account`,
new `customer_account_token`); it never writes `availability(set_id, booking_date)` and does not change the
booking/beach-map flow or the same-day cutoff. The soft-verification decision **preserves** the guest and
signed-in booking paths byte-for-byte (AC-7). The only concurrency concern is **token single-use under
concurrent redemption**, handled by a race-safe atomic claim — `UPDATE customer_account_token SET consumed_at = NOW()
WHERE token_hash = :hash AND purpose = :purpose AND consumed_at IS NULL AND expires_at > NOW() RETURNING account_id`
(at most one concurrent redeemer gets the row) — **not** the availability invariant.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing (full) | `CustomerAccount` (row-mapped) | Owns the customer **account identity** + the opaque credential store (D-2). Verification state and account-tied recovery tokens are account identity/credential lifecycle — the module's Job; **not** login machinery. |
| M-2 | *(platform edge — not a module)* `ai.riviera.platform` | existing root | — | Mailer machinery, the recovery endpoints, token hashing/generation, password encoding, and **session invalidation** are login/edge machinery (RV-BE-11), like `SecurityConfig`/`AuthController`/`SsoGateway`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `CustomerAccountRecovery` — `issueEmailVerificationToken(CustomerAccountId, String tokenHash, Instant expiresAt)`, `issuePasswordResetToken(CustomerAccountId, String tokenHash, Instant expiresAt)`, `VerifyEmailOutcome verifyEmail(String tokenHash)`, `ResetPasswordOutcome resetPassword(String tokenHash, String newPasswordHash)`, `void setPassword(CustomerAccountId, String newPasswordHash)`, `boolean isEmailVerified(CustomerAccountId)` | `customer.vocabulary.{CustomerAccountId, VerifyEmailOutcome, ResetPasswordOutcome}` | platform edge (`AccountRecoveryController`, `AuthController`) |

- **One purposeful port** (Cockburn) — the "account verification & password recovery" conversation. It joins
  the four existing account ports (`CustomerAccounts`, `CustomerAccountProvisioning`, `CustomerAccountDirectory`,
  `SsoAccountProvisioning`); each is a distinct conversation, none widened. If review finds it too wide, the
  read (`isEmailVerified`) splits out first.
- **New vocabulary:** `customer.vocabulary.VerifyEmailOutcome` (sealed `Verified(CustomerAccountId)` |
  `InvalidOrExpired`) + `ResetPasswordOutcome` (sealed `Reset(CustomerAccountId)` | `InvalidOrExpired`). The
  token `purpose` enum stays **internal** to the module (a `CHECK`-mirrored constant in the adapter) — the port
  is purpose-specific, so no public purpose type.
- **`allowedDependencies`:** unchanged — `customer` still depends on nothing; the edge is ungated.
- **No new `spi/`** — nothing is dependency-inverted: the edge (outside the module system) *calls* the
  `customer::api` port; that is the default inbound direction. `SsoAccountProvisioning` (S4) sets the precedent.
- **Edge types (root package, not a module surface):** `Mailer` (port), `MockMailer`, `SmtpMailer`,
  `MockMailerProdGuard`, `SentEmail` (mock record), `AccountRecoveryController`, `TokenHasher`, `RecoveryTokens`
  (raw-token generator), `CustomerSessionRevoker`, `CustomerPasswordPolicy` (extracted from `AuthController`).

**Domain events (id-based payloads, invariant #11)**

N/A — no new domain event. Verification/reset are request/response account-state changes, not spine facts
announced to other modules. (A future "email verified" analytics event is out of scope.)

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Persist account-tied recovery tokens (opaque digest); atomic single-use/expiry claim; mark verified; set password hash | `customer` | `customer` **Job:** owns "the customer account (email + opaque credential hash) … account identity". Verification state + recovery tokens are account/credential lifecycle. **Not** on any other module's Not-My-Job list. The module stores opaque hashes and runs SQL — **no** crypto, **no** Spring Security type (`CustomerAuthPlacementTests`). |
| Generate + **hash** the token; **encode** the password; build/send the email; establish/**invalidate** sessions | platform edge | RV-BE-11: credential-material transformation + all login/session machinery stays at the edge, never inside a domain module (mirrors "the edge encodes/verifies credentials; the module stores an opaque hash"). |
| Rate-limit + non-enumerate the recovery endpoints | platform edge (`RateLimitFilter`) | Edge concern (#56); the filter matches by URL path, importing nothing from any module. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** S8 is identity/credential only; no charge, refund, commission, or payout.
The profile-gated adapter pattern is borrowed from payment/SSO as a **structural** precedent; no money moves.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/forgot-password.ts` | new | standalone component | Signals (submitting/done) | Signal Forms (email) |
| FE-2 | `auth/reset-password.ts` | new | standalone component | Signals; reads `token` query param; async submit w/ loading/success/invalid states | Signal Forms (new pw + confirm) |
| FE-3 | `auth/verify-email.ts` | new | standalone component | Signals; reads `token` query param; **POSTs on load** (R-6) → verified/expired states; "resend" for signed-in | — |
| FE-4 | `auth/set-password.ts` | new | standalone component (authenticated) | Signals | Signal Forms (new pw; current pw shown only when the account has one) |
| FE-5 | `auth/verify-email-nudge.ts` | new | small standalone banner | reads `CustomerAuth.emailVerified` signal | — |
| FE-6 | `core/customer-auth.ts` | modify | `@Service` extends `SessionAuth` | adds `emailVerified` (from `me`) | adds `forgotPassword`/`resetPassword`/`verifyEmail`/`requestVerification`/`setPassword` |
| FE-7 | `core/session-auth.ts` | modify | abstract base | `AuthPrincipal` gains optional `emailVerified` | — |
| FE-8 | `auth/sign-in.ts` | modify | standalone component | — | adds a "Forgot password?" link |
| FE-9 | `app.routes.ts` | modify | routing | — | flat lazy routes `account/forgot`, `account/reset`, `account/verify`, `account/password` |

**Standards:** standalone, `inject()`, `@if`/`@for`, signal APIs; no `as any`. **Consult the angular-cli MCP**
(`search_documentation`, `get_best_practices`) for the reset/verify **async-with-query-param** reactive pattern
(the token-driven submit with loading/success/error states) — Ivo's standing ask for complex FE reactive logic.
Reuse `sso-buttons.ts`/`SessionAuth` idioms; styling per `riviera-tailwind` (no new SCSS).

## FE↔BE contract

- **New endpoints (all under the existing `/api/auth` + `/api/me` edge, JSON):**
  - `POST /api/auth/customer/forgot-password` — body `{ email }` → **`204`** always (non-enumerating). Public. Rate-limited.
  - `POST /api/auth/customer/reset-password` — body `{ token, newPassword }` → `204` on success; `400` `INVALID_OR_EXPIRED_TOKEN` / `WEAK_PASSWORD`. Public. Rate-limited. On success: sessions revoked.
  - `POST /api/auth/customer/verify-email` — body `{ token }` → `204` on success; `400` `INVALID_OR_EXPIRED_TOKEN`. Public. Rate-limited.
  - `POST /api/me/verify-email/request` — no body → `204`. **CUSTOMER** (resend to own email). Rate-limited.
  - `POST /api/me/password` — body `{ newPassword, currentPassword? }` → `204`; `400` `WEAK_PASSWORD` / `401` `INVALID_CURRENT_PASSWORD`. **CUSTOMER**.
  - `GET /api/auth/me` — response gains `emailVerified: boolean | null`.
- **Auth/CSRF posture:** the three public recovery POSTs are `permitAll` in `SecurityConfig`; the two `/api/me/*`
  are covered by the existing `/api/me/** → hasRole("CUSTOMER")`. **All** are CSRF-protected (the FE `apiSessionInterceptor`
  attaches `X-XSRF-TOKEN` from the bootstrapped cookie) — **no** CSRF-ignore entries added.
- **Client typing:** hand-written typed methods on `CustomerAuth` (no `as any`); reuse the existing `AUTH_API` base +
  `apiSessionInterceptor` (`withCredentials`, CSRF). Password min length 8 mirrored client-side (server is authoritative).
- **Money/date on the wire:** N/A. Token is an opaque URL-safe string; TTLs are server-side only.

## Execution status

> Session-recovery anchor. Re-read after any compaction / fresh session before acting. Update in the
> same commit window as the change it records, at every phase boundary and SDLC stage transition.

**Stage pointer:** `DONE` — **merged to `main` as `bcd33a7`** (squash, PR #254); close-out complete.

**Next action:** None — slice shipped. Deferred follow-ups tracked: real SMTP + off-thread send (#255),
`verifiedStatus` 1-query (#256). Epic #108 checklist ticked (S8 + caught S7's missed tick). Substrate docs
(CLAUDE.md / RESPONSIBILITIES / CONTEXT + design D-6 amendment) folded into the PR; `graphify update` run.

**Gates:** CI green (Backend + Frontend + CodeQL). Review gate — high-effort workflow `/code-review` (9 findings,
0 refuted): 5 fixed (F-R1 set-password trim, F-R2 best-effort mailer, F-R3 verify CSRF race, F-R4 verify error
state, F-R5 shared password constants), 2 deferred (F-R6→#255 timing, F-R7→#256 2-query). Sonar gate green —
**new-code coverage 89.9%** (≥80), 0 smells/bugs/vulns, 0 duplicated blocks, issue list empty (fixed S6213
`MockMailer.record`→`capture`; the scan job failed transiently once at 28s, re-ran clean). Two full-suite-only
test fixes (R-7): `PayoutModuleTest` `@MockitoBean CustomerAccountRecovery`, scoped `SsoCallbackIT.identityRows`.

**Verified so far:** Phase 0 — `CustomerAccountRecoveryIT` (3) + `CustomerAccountServiceTest` (10) + structural net.
Phase 1 — `RealMailerTest`/`MockMailerProdGuardTest`/`RecoveryTokensTest`/`MockMailerTest` (7). Phase 2 —
`EmailVerificationIT` (2) + `PasswordResetIT` (3, incl. AC-3 session-revoke) + `SetPasswordIT` (2) +
`RecoveryRateLimitIT` (1); existing auth ITs (`CustomerRegisterIT`/`CustomerLoginIT`/`AuthSessionIT`/`SsoCallbackIT`)
regression-green after the FK-CASCADE fix. Phase 3 — `SsoAccountVerifiedIT` (3) + SSO/structural regression. All
green locally; full suite = CI. (`RecoveryTokens` folded the planned `TokenHasher`; `CustomerRecovery` +
`MyAccountController` replaced the planned single controller to respect the 7-param limit.)

| Phase | Status | Commits |
|-------|--------|---------|
| Plan — plan doc + D-6 amendment | ✅ | `1b537ce` |
| 0 — V28 + `customer` `CustomerAccountRecovery` (issue/redeem/set/verified) | ✅ | `306a79d` |
| 1 — Edge `Mailer` port + mock/real adapters + prod guard + `RecoveryTokens` | ✅ | `8d85280` |
| 2 — recovery endpoints + set-password + session revoke + rate-limit + `me.emailVerified` + register issues verify | ✅ | `6eb9ad4` |
| 3 — SSO=verified wiring + V28 backfill test | ✅ | `6eb9ad4` |
| 4 — Frontend screens + nudge + mocked e2e | ✅ | `d983162` |
| Review fixes | | |
| Close-out — docs + epic tick | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate / Sonar-gate / red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches first).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-CI-1 | CI-class (local full suite) | `PayoutModuleTest` (`@ApplicationModuleTest`) failed context load — the edge `CustomerRecovery` needs `customer::api CustomerAccountRecovery`, absent in module isolation (the R-7 / S4 F-CI trap). | fixed — `@MockitoBean CustomerAccountRecovery` (S4 pattern) |
| F-CI-2 | CI-class (local full suite) | `SsoCallbackIT.identityRows("GOOGLE")` is a **global** count polluted by my new tests' GOOGLE SSO identities (full-suite-only; pre-existing fragility). | fixed — scoped the count to the mock flow's `%.tourist@example.com` canned identities |
| F-R1 | review (CONFIRMED) | `set-password` trims `currentPassword` → an account whose password has surrounding whitespace can never change it. | fixed — send `currentPassword` untrimmed (empty → undefined); commit `<rev>` |
| F-R2 | review (PLAUSIBLE) | register + forgot-password 500 when the (real) mailer throws — register regresses to 500; forgot becomes a 500-vs-204 enumeration oracle. | fixed — `CustomerRecovery.sendQuietly` makes the mail send best-effort (token already stored); pinned by `RecoveryMailerFailureIT` |
| F-R3 | review (PLAUSIBLE) | `verify-email` auto-POSTs on load and can race the CSRF-cookie bootstrap → 403 shows a valid token as invalid. | fixed — `await this.auth.whenReady()` (the `/me` restore that bootstraps the XSRF cookie) before the verify POST |
| F-R4 | review (CONFIRMED) | `verify-email` `'error'` and `'invalid'` render identically (a transport error reads as "invalid link"). | fixed — distinct `@case ('error')` "try again" message |
| F-R5 | review (CONFIRMED) | `MIN_PASSWORD_LENGTH` + the "8–72" message copy-pasted across auth components. | fixed — exported `MIN_PASSWORD_LENGTH` + `PASSWORD_LENGTH_MESSAGE` from `core/customer-auth`, reused |
| F-R6 | review (PLAUSIBLE) | register/forgot **timing** oracle — the known/registered branch does token+DB+send the other doesn't. | **deferred → #255**: negligible with the fast mock (bcrypt dominates register); the real *synchronous* SMTP send is what widens it, so the async-send fix belongs with the real adapter (noted in `CustomerRecovery.sendQuietly`). |
| F-R7 | review (CONFIRMED, cleanup) | `verifiedStatus` runs two DB queries on every `/me`/login. | **deferred → #256**: minor perf on a non-hot endpoint; a 1-query fix needs new `customer::api` surface (parallels S3's N+1 → #246). |

---

## File structure

**Backend — `customer` module (`platform/src/main/java/ai/riviera/platform/customer/`)**
- `api/CustomerAccountRecovery.java` — new `api/` port (NI-1).
- `vocabulary/VerifyEmailOutcome.java`, `vocabulary/ResetPasswordOutcome.java` — new sealed outcomes.
- `application/CustomerAccountService.java` — implement `CustomerAccountRecovery` (compose in `@Transactional`); SSO `resolveOrCreate` marks verified.
- `application/CustomerAccountStore.java` — extend: `markEmailVerified`, `updatePasswordHash`, `isEmailVerified`.
- `application/CustomerAccountTokens.java` — new internal port: `issue(accountId, purpose, tokenHash, expiresAt)` (invalidates prior unconsumed of that purpose), `consume(purpose, tokenHash) → Optional<CustomerAccountId>` (atomic).
- `adapter/out/JdbcCustomerAccounts.java` — implement the new `CustomerAccountStore` methods; SSO insert sets `email_verified = true`.
- `adapter/out/JdbcCustomerAccountTokens.java` — new adapter implementing `CustomerAccountTokens` (text-block SQL, atomic claim).

**Backend — Flyway (`platform/src/main/resources/db/migration/`)**
- `V28__customer_email_verification_and_recovery_tokens.sql` — `email_verified`/`email_verified_at` + `EXISTS` backfill; `customer_account_token` table.

**Backend — platform edge (`platform/src/main/java/ai/riviera/platform/`)**
- `Mailer.java` — port: `sendEmailVerification(String toEmail, URI link)`, `sendPasswordReset(String toEmail, URI link)`.
- `MockMailer.java` — `@Component @Profile("!mailer")`; records `SentEmail`s (in-memory, test-inspectable) + logs the link (dev only).
- `SmtpMailer.java` — `@Component @Profile("mailer")`; both methods throw `UnsupportedOperationException`.
- `MockMailerProdGuard.java` — `@Component @Profile("prod & !mailer")`; constructor throws (aborts boot).
- `SentEmail.java` — record `(String toEmail, EmailKind kind, URI link)`.
- `TokenHasher.java` — `String sha256Hex(String rawToken)`; `RecoveryTokens.java` — `String generate()` (`SecureRandom`, base64url).
- `CustomerSessionRevoker.java` — wraps `FindByIndexNameSessionRepository`; `revokeAll(String principalName)`.
- `CustomerPasswordPolicy.java` — extracted length/bytes validation (reused by `AuthController` + `AccountRecoveryController`).
- `AccountRecoveryController.java` — `@RestController`; the 5 new endpoints; uses `CustomerAccountRecovery`, `Mailer`, `PasswordEncoder`, `TokenHasher`, `RecoveryTokens`, `CustomerSessionRevoker`, `CurrentCustomer`, `CustomerPasswordPolicy`, link-base-url config.
- `AuthController.java` — modify: on `Registered(accountId)` issue a verification token + `mailer.sendEmailVerification`; `me` adds `emailVerified`; delegate validation to `CustomerPasswordPolicy`.
- `PrincipalResponse.java` — add `Boolean emailVerified`.
- `SecurityConfig.java` — permit the three public recovery POSTs; `RateLimitFilter` gains a `recoveryBuckets` per-IP map for the recovery paths.
- `RecoveryProperties.java` — `@ConfigurationProperties("riviera.recovery")` (verify/reset TTLs); mail link-base-url property.
- `WebSliceStubs.java` — add inert `Mailer`, `CustomerAccountRecovery`, session-repo beans.

**Frontend (`frontend/src/`)** and **e2e (`frontend/e2e/`)** — per the Angular table above; e2e:
`email-verification.e2e.ts`, `password-reset.e2e.ts` + `mockCustomerRecoveryApi` in `e2e/support/auth-mocks.ts` + page objects.

**Tests (backend)** — `CustomerAccountRecoveryIT` (AC-1,2), `PasswordResetIT` (AC-3,6), `ForgotPasswordEnumerationIT`
+ `RecoveryRateLimitIT` (AC-4), `SetPasswordIT` (AC-5), `RegisterIssuesVerificationIT` (AC-7), `SsoAccountVerifiedIT`
+ `V28MigrationIT` (AC-8), `AuthMeVerifiedFlagIT` (AC-9), `RealMailerTest` + `MockMailerProdGuardTest` (AC-10),
`ModularityTests`/`CustomerAuthPlacementTests`/`PublishedSurfacePlacementArchitectureTests` (AC-11, existing).

---

## Phase 0 — V28 migration + `customer` `CustomerAccountRecovery` (issue / redeem / set / verified)

**Files:** Create `V28__…​.sql`, `CustomerAccountRecovery.java`, `VerifyEmailOutcome.java`,
`ResetPasswordOutcome.java`, `CustomerAccountTokens.java`, `JdbcCustomerAccountTokens.java`,
`CustomerAccountRecoveryIT` · Modify `CustomerAccountService`, `CustomerAccountStore`, `JdbcCustomerAccounts`
· Test `CustomerAccountServiceTest`.

**Skills to load first (routing gate):** `riviera-local-debug` (first build), `riviera-java-conventions`,
`postgres`, `riviera-modulith` (all already loaded at plan time — re-confirm before editing).

**V28 migration (design):**
```sql
-- Email-verification state (informational in v1 — gates nothing functional; no guest back-linking,
-- maintainer decision 2026-07-17). SSO-linked accounts are provider-verified (design D-6) → backfill true.
ALTER TABLE customer_account ADD COLUMN email_verified    BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE customer_account ADD COLUMN email_verified_at  TIMESTAMPTZ;

UPDATE customer_account ca
   SET email_verified = true, email_verified_at = NOW()
 WHERE EXISTS (SELECT 1 FROM customer_sso_identity si WHERE si.account_id = ca.id);

-- Account recovery tokens (bearer credentials, invariant #7): stored as an opaque deterministic
-- SHA-256 digest (NOT bcrypt — must be queryable by hash), single-use, expiring.
CREATE TABLE customer_account_token (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id   BIGINT      NOT NULL REFERENCES customer_account (id),
    purpose      TEXT        NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
    token_hash   TEXT        NOT NULL,          -- SHA-256 hex of the raw token; the raw token is never stored
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,                   -- NULL until single-use redemption
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_account_token_hash_uniq UNIQUE (token_hash)
);
CREATE INDEX customer_account_token_account_id_idx ON customer_account_token (account_id);
```

**Atomic redemption (the one concurrency point):**
```sql
UPDATE customer_account_token
   SET consumed_at = NOW()
 WHERE token_hash = :hash AND purpose = :purpose AND consumed_at IS NULL AND expires_at > NOW()
 RETURNING account_id
```
→ present ⇒ `Verified/Reset(accountId)`; absent ⇒ `InvalidOrExpired` (invalid, expired, and already-used are
indistinguishable — non-enumeration). `verifyEmail`/`resetPassword` run the claim + the account write in one
`@Transactional` service method (the module owns both tables).

**Issue** invalidates prior unconsumed tokens of that purpose, then inserts:
```sql
UPDATE customer_account_token SET consumed_at = NOW()
 WHERE account_id = :accountId AND purpose = :purpose AND consumed_at IS NULL;
INSERT INTO customer_account_token (account_id, purpose, token_hash, expires_at)
 VALUES (:accountId, :purpose, :hash, :expiresAt);
```

- TDD: `CustomerAccountRecoveryIT` (Testcontainers/JDBC) — AC-1 (verify issue→redeem→second/expired fail),
  AC-2 (reset issue→redeem→second/expired fail), issue-invalidates-prior. `CustomerAccountServiceTest` —
  `setPassword` writes hash; `isEmailVerified` read; SSO `resolveOrCreate` marks verified (AC-8 inner).
- End-of-phase regression: `./gradlew test --tests "*Customer*" --tests "*ModularityTests*"` (scoped).

## Phase 1 — Edge `Mailer` port, mock + throwing real adapter, prod guard, token hashing

**Files:** `Mailer`, `MockMailer`, `SmtpMailer`, `MockMailerProdGuard`, `SentEmail`, `TokenHasher`,
`RecoveryTokens`, `RecoveryProperties` + `RealMailerTest`, `MockMailerProdGuardTest`, `TokenHasherTest`.

**Skills to load first:** `riviera-java-conventions`, `riviera-modulith` (edge placement).

- Profiles: `MockMailer` = `@Profile("!mailer")`; `SmtpMailer` = `@Profile("mailer")` (throws UOE);
  `MockMailerProdGuard` = `@Profile("prod & !mailer")` (constructor throws — copy `MockSsoProdGuard`).
- `MockMailer` records `SentEmail(toEmail, kind, link)` (in-memory, `sent()`/`lastTo(email)` for tests) and
  logs the link at INFO (dev convenience the issue asks for; mock-only + prod-guarded).
- `TokenHasher.sha256Hex(raw)` deterministic; `RecoveryTokens.generate()` = 32 `SecureRandom` bytes → base64url.
  Never log the raw token (invariant #7 / §10).
- TDD: `RealMailerTest` (both methods throw UOE — AC-10); `MockMailerProdGuardTest` via `ApplicationContextRunner`
  (prod w/o mailer fails; `prod,mailer` boots — AC-10); `TokenHasherTest` (stable digest, differs per token).

## Phase 2 — `AccountRecoveryController` + register-issues-verify + session revoke + rate-limit + `me.emailVerified`

**Files:** `AccountRecoveryController`, `CustomerSessionRevoker`, `CustomerPasswordPolicy`; modify `AuthController`,
`PrincipalResponse`, `SecurityConfig`, `RateLimitFilter`, `WebSliceStubs` + `PasswordResetIT`,
`ForgotPasswordEnumerationIT`, `RecoveryRateLimitIT`, `SetPasswordIT`, `RegisterIssuesVerificationIT`,
`AuthMeVerifiedFlagIT`.

**Skills to load first:** `riviera-java-conventions`, `riviera-modulith`.

- **forgot-password:** normalize email; `accountFor(email)` → if present issue reset token + `mailer.sendPasswordReset`;
  **always** return `204` (uniform path/timing, D-8). Rate-limited (own bucket).
- **reset-password:** validate password policy; `resetPassword(hasher.sha256Hex(token), encoder.encode(newPw))` →
  on `Reset(accountId)` resolve principal email + `sessionRevoker.revokeAll(email)`, `204`; on `InvalidOrExpired`
  → `400 INVALID_OR_EXPIRED_TOKEN` (via `ApiProblem`).
- **verify-email:** `verifyEmail(hasher.sha256Hex(token))` → `204` / `400`.
- **`/api/me/verify-email/request`** (CUSTOMER): resolve own accountId (`CurrentCustomer.require`), issue verify
  token + mail, `204`.
- **`/api/me/password`** (CUSTOMER): resolve accountId; if `findByEmail(email)` returns a credential (has password),
  require + `encoder.matches(currentPassword, hash)` (else `401 INVALID_CURRENT_PASSWORD`); if empty (SSO-only), no
  current required; validate policy; `setPassword(accountId, encoder.encode(newPw))`, `204`. (F-1)
- **`AuthController.register`:** on `Registered(accountId)` issue a verify token + `mailer.sendEmailVerification`
  (append only; `AlreadyRegistered` branch untouched — no enumeration). `me` gains `emailVerified` (CUSTOMER via
  `CurrentCustomer` → `isEmailVerified`; operator `null`). Extract validation to `CustomerPasswordPolicy`.
- **SecurityConfig:** permit `/api/auth/customer/forgot-password|reset-password|verify-email`; `/api/me/**` already
  CUSTOMER-gated. No CSRF-ignore additions.
- **RateLimitFilter:** add a `recoveryBuckets` per-IP map for the recovery paths (own `props.login()`-class limit;
  not `customerAuthBuckets` — R-8).
- **WebSliceStubs:** inert `Mailer`, `CustomerAccountRecovery`, session-repo beans (R-7).
- TDD per AC-3/4/5/7/9. Watch R-7 (module/web-slice beans) — run `*ModularityTests*` + web-slice + module tests.

## Phase 3 — SSO=verified wiring + V28 backfill test

**Files:** modify `JdbcCustomerAccounts` (SSO insert sets `email_verified = true`) if not done in Phase 0;
`SsoAccountVerifiedIT`, `V28MigrationIT`.

- TDD: `SsoAccountVerifiedIT` — `resolveOrCreate` for a new subject creates a verified account; auto-link keeps
  the existing account and marks it verified (provider-verified). `V28MigrationIT` — a pre-existing SSO-linked
  account is `email_verified = true` after migration; a password account is `false` (AC-8).

## Phase 4 — Frontend screens + verify nudge + mocked e2e

**Files:** new `auth/forgot-password.ts`, `auth/reset-password.ts`, `auth/verify-email.ts`, `auth/set-password.ts`,
`auth/verify-email-nudge.ts`; modify `core/customer-auth.ts`, `core/session-auth.ts`, `auth/sign-in.ts`,
`app.routes.ts`; new `e2e/email-verification.e2e.ts`, `e2e/password-reset.e2e.ts`; modify `e2e/support/auth-mocks.ts`,
add page objects.

**Skills to load first (routing gate):** `riviera-frontend` (folder placement), `angular-developer` + **angular-cli MCP**
(v22 APIs + a11y; the query-param-driven async reset/verify pattern — Ivo's standing ask), `riviera-tailwind`
(styling), `playwright-cli` (best-practice mocked specs).

- Components per FE table; "Forgot password?" link on sign-in; the nudge banner shows when `signedIn && emailVerified === false`.
- `CustomerAuth` gains `emailVerified` (from `me`) + `forgotPassword`/`resetPassword`/`verifyEmail`/`requestVerification`/`setPassword`;
  `SessionAuth.AuthPrincipal` gains optional `emailVerified`.
- Mocked e2e (CI-safe `e2e/`, run via `npm run test:e2e:a11y` on Windows): stateful `mockCustomerRecoveryApi`
  (forgot → `204`; reset → flips the mock password; verify → flips verified; `me` reflects verified). Both journeys
  + a11y. Reset journey asserts old password fails / new succeeds against the mock.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1,2:** `./gradlew test --tests "*CustomerAccountRecoveryIT*" --tests "*CustomerAccountServiceTest*"` → PASS.
- [ ] **AC-3,4,5,6,7,9:** `./gradlew test --tests "*PasswordResetIT*" --tests "*ForgotPasswordEnumerationIT*" --tests "*RecoveryRateLimitIT*" --tests "*SetPasswordIT*" --tests "*RegisterIssuesVerificationIT*" --tests "*AuthMeVerifiedFlagIT*"` → PASS.
- [ ] **AC-8:** `./gradlew test --tests "*SsoAccountVerifiedIT*" --tests "*V28MigrationIT*"` → PASS.
- [ ] **AC-10:** `./gradlew test --tests "*RealMailerTest*" --tests "*MockMailerProdGuardTest*"` → PASS.
- [ ] **AC-11:** `./gradlew test --tests "*ModularityTests*" --tests "*CustomerAuthPlacementTests*" --tests "*PublishedSurfacePlacement*"` → PASS.
- [ ] **AC-12 (FE):** `npm run test:e2e:a11y` (from `frontend/`) → `email-verification.e2e.ts` + `password-reset.e2e.ts` PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1); persistence is `JdbcClient` + text-block SQL.
- [ ] **Availability** section justified N/A (S8 does not touch `availability`); guest+signed-in booking paths preserved.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `customer::api` port +
      `::vocabulary` outcomes only; mailer/session machinery stays in the root package (invariant #11, RV-BE-11,
      `CustomerAuthPlacementTests`).
- [ ] **Payment/payout** N/A justified.
- [ ] Tokens: unguessable + single-use + expiring + **hashed** (invariant #7); raw token never logged/persisted.
- [ ] Reset invalidates all sessions; endpoints rate-limited (own bucket) + non-enumerating (D-8).
- [ ] Mock forbidden in prod (guard tested); real adapter throws loud (no silent fallback).
- [ ] F-1 closed **safely** — password set only via authenticated session or token-proven reset, never register-UPSERT.
- [ ] Error contract: 4xx via `ApiProblem`/`ApiErrorHandler`; no per-controller handler; no leak in `detail`.
- [ ] Flyway V28 present; `token_hash` UNIQUE + `purpose` CHECK tested; number verified free (invariant #12).
- [ ] **Frontend** standards met; angular-cli MCP consulted for the async reset/verify pattern; no `as any`.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty or deferred with an issue #.
- [ ] Design **D-6 amended** in the repo (no back-linking; soft verification); `CONTEXT.md` recovery terms added at close-out.
