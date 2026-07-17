# S4 — SsoGateway port + mocked Google/Apple SSO end-to-end — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task, red-green-refactor.
> The **Execution status** section is the session-recovery anchor — re-read it (plus the current
> `riviera-sdlc` reference file) after any compaction or in a fresh session before acting.

**Goal:** Ship "Continue with Google / Continue with Apple" customer sign-in end-to-end against
**mocked** identity providers — real IdP client credentials are S5 (#116). First SSO sign-in for an
unknown `(provider, subject)` resolves-or-creates a `CustomerAccount` (find-or-create by verified
email, auto-linking to an existing account when the email is already taken) and links the identity;
a returning subject reuses the same account. Real `Google`/`Apple` adapters exist but throw
`UnsupportedOperationException`; the mock adapter under the `prod` profile aborts boot.

**Architecture:** The single most significant decision — **SSO is OIDC Authorization Code + PKCE
completed server-side (D-3)**, so tokens never reach browser JS and a successful callback
establishes the *same* session cookie as form login. The `SsoGateway` (IdP token-exchange) is
**platform-edge machinery in the root package `ai.riviera.platform`** — the root is *not* a Modulith
module (a sub-package would wrongly register as one), so there is no `api/`/`spi/` question for it;
it mirrors how `SecurityConfig`/`AuthController` live at the edge and how `PaymentGateway` is an
*unpublished* driven port. The only **cross-module** call — resolve-or-create-account-by-
`(provider, subject)` — is a new **`customer::api`** port (others call it → `api/`, per the
riviera-modulith decision rule), speaking a new `customer::vocabulary.SsoProvider` (AC-4). Mock vs
real adapters use the **profile-predicate pair** precedent (`@Profile("!sso")` / `@Profile("sso")`),
mirroring `StubPaymentGateway`/`StripePaymentGateway`.

**Persistence:** JDBC only (invariant #1). New **V27** migration: `customer_sso_identity` link table
(`UNIQUE(provider, subject)`, FK → `customer_account(id)`) + relax `customer_account.password_hash`
to nullable (SSO-only accounts carry no local password). No other table changes.

**Source of intent:** Issue **#112** (epic **#108**, S4). Design: `docs/architecture/auth-signin-register.md`
(D-2, D-3, D-4, D-8). Prior slices this builds on: S2 #111 (`customer_account`, edge auth machinery,
2nd `customerAuthenticationManager`), S3 #114 (`CustomerAccountDirectory`, `CurrentCustomer`, `/api/me/*`).

**Skills consulted:**
- `riviera-sdlc` (issue-intake grill gate — re-validated ACs against today's code; found the AC-3
  "startup guard" has no payment precedent and there is **no `prod` profile** → guard is net-new; found
  `customer_account.email` UNIQUE forces the account-linking decision).
- `riviera-modulith` (port placement — `SsoGateway` stays flat in the **root** edge package, *not* a
  module sub-package; the cross-module provisioning port is `customer::api` not `spi/`; no
  `allowedDependencies` change).
- `postgres` (V27 shape — `BIGINT GENERATED ALWAYS AS IDENTITY` PK, index the FK column, `TEXT` +
  `CHECK (provider IN (...))` over native enum, `TIMESTAMPTZ`; race-safe `INSERT … ON CONFLICT` claim).
- `riviera-plan-doc` (this template + discipline).
- *To load at their phases (routing gate):* `riviera-java-conventions` (Phases 0-2 Java idioms),
  `riviera-frontend` + `angular-developer` + angular-cli MCP + `riviera-tailwind` + `playwright-cli`
  (Phase 3), `riviera-local-debug` (before first build), `riviera-review-overlay` (review gate),
  `riviera-docs-freshness` (merge close-out).

**Branch:** `feature/s4-sso-mocked` (cloud/session branch stands in for `feature/<slug>`; created before phase 0).

---

## Acceptance criteria (testable)

> Written at the application boundary (inner hexagon) where possible; adapter-level assertions
> (HTTP status, session cookie, Angular button) live in adapter/e2e tests.

- [ ] **AC-1 (resolve-or-create, inner hexagon):** Given no `customer_sso_identity` for
  `(GOOGLE, "g-sub-1")`, when `SsoAccountProvisioning.resolveOrCreate(GOOGLE, "g-sub-1", "t@example.com")`
  is called and no account has that email, then a new `customer_account` (password_hash NULL) **and**
  a `customer_sso_identity` row are created and its `CustomerAccountId` returned; a **second** call
  with the same `(GOOGLE, "g-sub-1")` returns the **same** id and creates **no** new rows.
  *Pinned by:* `SsoAccountProvisioningIT.firstCallCreatesAccountAndLink_secondReuses`.
- [ ] **AC-2 (auto-link by verified email):** Given a `customer_account` already exists for
  `"t@example.com"` (e.g. a password account), when `resolveOrCreate(GOOGLE, "g-sub-2", "t@example.com")`
  is called for an unknown subject, then **no new account** is created — the new identity links to the
  existing account and its id is returned. *Pinned by:* `SsoAccountProvisioningIT.unknownSubjectWithTakenEmailLinksToExistingAccount`.
- [ ] **AC-3 (SSO-only account cannot password-login):** Given an SSO-only `customer_account`
  (password_hash NULL), when `CustomerAccounts.findByEmail(email)` is called, then it returns
  `Optional.empty()` (no credential), so password login yields the generic 401 (non-enumeration, D-8).
  *Pinned by:* `SsoAccountProvisioningIT.ssoOnlyAccountHasNoPasswordCredentialButResolvesAsAnAccount`
  (the null-hash filter is SQL behavior, proven against real Postgres).
- [ ] **AC-4 (mock end-to-end, adapter/e2e):** With the default (mock) profile, a tourist clicks
  "Continue with Google", is redirected through the mock IdP and back to the callback, and ends
  **signed-in with a `SESSION` cookie**; the header shows their identity; clicking again reuses the
  same account. Same for Apple (distinct account). *Pinned by:* backend `SsoCallbackIT.mockGoogleFlowEstablishesSession`
  + FE `sso-sign-in.e2e.ts` (mocked suite).
- [ ] **AC-5 (real adapter fails loud):** With the `sso` profile active and no credentials, invoking
  either real adapter throws `UnsupportedOperationException`; nothing silently falls back to the mock
  (the mock bean is absent under `sso`). *Pinned by:* `RealSsoGatewayTest.googleAndAppleThrowUnsupported`.
- [ ] **AC-6 (mock forbidden in prod):** With profiles `prod` active and `sso` **not** active, the
  application context **fails to start** (the mock IdP must never be reachable in prod). Booting
  `prod,sso` succeeds (guard absent, real adapters active). *Pinned by:* `MockSsoProdGuardTest.prodWithoutSsoAbortsContext`.
- [ ] **AC-7 (state round-trip / CSRF protection on the callback):** Given an authorize call stored a
  `state` in the session, when the callback arrives with a **missing or mismatched** `state`, then it
  is rejected (`4xx`) and **no** session is established and **no** account is created; a matching
  `state` proceeds. *Pinned by:* `SsoCallbackIT.callbackWithBadStateIsRejectedAndCreatesNoSession`.
- [ ] **AC-8 (rate-limited callback):** The SSO `authorize` and `callback` endpoints are behind the
  `RateLimitFilter` (per-IP), returning `429` past the login limit. *Pinned by:* `SsoRateLimitIT.callbackIsRateLimited`.
- [ ] **AC-9 (module purity / boundaries):** Provider/subject/email are expressed in `customer`
  vocabulary/id terms; **no** Spring Security / auth machinery lands inside the `customer` module;
  `ModularityTests` and `CustomerAuthPlacementTests` stay green. *Pinned by:* `ModularityTests` +
  `CustomerAuthPlacementTests` (existing, must stay green).

## Non-goals

- **Real Google/Apple client credentials + real token exchange** — S5 (#116); the real adapters
  throw `UnsupportedOperationException` here.
- **Cryptographic PKCE verification** — the mock IdP is cooperative and does not verify the
  `code_verifier`; the `state` CSRF check *is* enforced server-side. Real PKCE exchange lands with S5.
- **Back-linking / claiming device-local guest bookings** into the SSO account — deferred to S8/#113
  (maintainer decision 2026-07-17: no auto-claim; callback only establishes the session).
- **Operator SSO** — non-goal for the whole epic.
- **Setting a password on an SSO-only account / password reset** — S8 (#113).
- **Storing a display name / avatar** — not modeled; the identity carries `(provider, subject, email)` only.
- **Any change to guest checkout or the booking-code flow.**

## Behavior-parity ledger

N/A — new behavior, replaces nothing. SSO is additive; form login, guest checkout, and the
booking-code flow are untouched. (One *additive* change to an existing surface — `findByEmail` now
skips password-less rows — is covered by AC-3, not a retirement.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **Flyway V27 collision** with a parallel slice | low | high | V26 is highest on `main`; all 10 open PRs are Dependabot frontend bumps (none touch migrations). V27 claimed. If a parallel migration merges first, **this branch renumbers** (merges second). | Ivo | open |
| R-2 | **Auto-link becomes account-takeover** if a real adapter ever returns an *unverified* email | med (in S5) | high | S4 mock returns only verified canned identities; real adapters throw UOE (inert). **Documented constraint for S5:** the real `Google`/`Apple` adapter MUST assert `email_verified == true` before returning an identity. Recorded in Open Questions + carried to #116. | Ivo | open (S5-gated) |
| R-3 | **Callback CSRF / code-injection** (attacker replays a callback) | med | high | Server-side `state` nonce stored in the HTTP session at authorize-time, compared + single-use-cleared at callback (AC-7); `SESSION` cookie is `SameSite=Lax` so it rides the top-level callback GET but not cross-site sub-requests. | Ivo | open |
| R-4 | **Mock IdP reachable in production** | low | high | `MockSsoGateway` + `MockSsoIdpController` are `@Profile("!sso")`; `MockSsoProdGuard` (`@Profile("prod & !sso")`) aborts boot (AC-6). | Ivo | open |
| R-5 | **New edge beans break slice tests** — a new controller/bean the security chain depends on can break `@WebMvcTest` (`WebSliceStubs`) and `@ApplicationModuleTest` partial contexts (case history: S2 #111). | med | med | After adding `SsoController`/gateway beans, run `*ModularityTests*` + the web-slice + module tests; add stubs to `WebSliceStubs` for `SsoGateway`/`SsoAccountProvisioning` if the slice test needs them. Full-suite-only failures surface in CI (check the push's run). | Ivo | open |
| R-6 | **`password_hash` nullability** breaks the password credential read path (NPE on null hash) | med | med | `findByEmail` filters `password_hash IS NOT NULL` (AC-3); a null-hash account is invisible to password login. Test both an SSO-only account and a password account that later gains an SSO link. | Ivo | open |
| R-7 | **Bean ambiguity** — two `SsoGateway` beans under `sso` (Google + Apple) | low | med | Exactly one `SsoGateway` bean per profile: `MockSsoGateway` (`!sso`) vs a single `RealSsoGateway` router (`sso`) that dispatches to the per-provider `GoogleSsoGateway`/`AppleSsoGateway`. Verified by a context-loads test under each profile. | Ivo | open |
| R-8 | **Error contract drift** — SSO endpoints return ad-hoc bodies | low | med | Redirect endpoints (302) + the existing centralized RFC-7807 handler for 4xx (`ApiErrorHandler`); no per-controller `{"error":…}` body (`riviera-java-conventions` §6b). | Ivo | open |

## Open questions / Assumptions

- **Assumption (resolved by maintainer 2026-07-17):** On email collision, SSO **auto-links** the new
  identity to the existing account (trusting the provider-verified email). See R-2 for the S5 constraint.
- **Assumption (resolved by maintainer 2026-07-17):** No auto-claim of device-local guest bookings on
  SSO sign-in; the callback only establishes the session. Back-linking stays S8/#113.
- **Assumption:** Callback redirects to the SPA root `/` (same-origin in demo/prod since #110); the
  fresh SPA load runs `CustomerAuth.restore()` (`GET /api/auth/me`) → signed-in. The cross-port
  local dev-server case (`:4200`→`:8080`) is the known D-7 same-site caveat; the **mocked** e2e routes
  the authorize URL so it is origin-independent. — *Owner:* Ivo · *Resolves by:* Phase 3.
- **Assumption:** The two SSO profiles are `sso` (activates real adapters, mirrors `stripe`) and `prod`
  (the future DSGVO hoster sets `SPRING_PROFILES_ACTIVE=prod,sso`; `prod` alone is the misconfig the
  guard catches). No `application-prod.properties` is added in this slice. — *Owner:* Ivo · *Resolves by:* Phase 1.
- **Open question → carried to #116 (S5):** the real adapters must enforce `email_verified` and handle
  Apple's first-auth-only email / private-relay addresses. Not actioned here (adapters throw). — *Owner:* Ivo.

### Resolved

- Account-linking + session-merge semantics — resolved via `AskUserQuestion` (2026-07-17): auto-link by
  verified email; no device-code auto-claim.

## Availability & concurrency (invariant #2)

**N/A — does not affect `availability`.** SSO touches identity only; it writes `customer_account` /
`customer_sso_identity`, never `availability(set_id, booking_date)`, and does not change the booking or
beach-map flow. The one concurrency concern here is **duplicate account/identity creation on concurrent
first sign-ins**, handled by race-safe `INSERT … ON CONFLICT DO NOTHING` claims on
`customer_account.email` and `customer_sso_identity (provider, subject)` (see Phase 0), *not* the
availability invariant.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing (full) | `CustomerAccount` (row-mapped) | Owns customer **account identity** + SSO subject linkage (D-2). SSO identity persistence is identity, not auth machinery. |
| M-2 | *(platform edge — not a module)* `ai.riviera.platform` | existing root | — | Login/SSO **machinery** (redirect/callback, token exchange, session establishment) stays at the edge (RV-BE-11), like `SecurityConfig`/`AuthController`. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `customer.api` | `SsoAccountProvisioning#resolveOrCreate(SsoProvider, String subject, String email) → CustomerAccountId` | `customer.vocabulary.SsoProvider`, `customer.vocabulary.CustomerAccountId` | platform edge (`SsoController`) |

- **New vocabulary:** `customer.vocabulary.SsoProvider` (enum `GOOGLE`, `APPLE`). Reused by the edge
  `SsoGateway` (the edge may depend on `customer::vocabulary`).
- **`allowedDependencies`:** unchanged — `customer` still depends on nothing; the edge is ungated.
- **No new `spi/`** — nothing is dependency-inverted (the edge, outside the module system, *calls*
  the `customer::api` port; that is the default inbound direction, not an inversion).
- **Edge types (root package, not a module surface):** `SsoGateway` (port), `ExternalIdentity`
  (`provider, subject, email`), `SsoAuthorizationChallenge` (`state, codeChallenge`), `MockSsoGateway`,
  `RealSsoGateway` + `GoogleSsoGateway`/`AppleSsoGateway`, `MockSsoIdpController`, `SsoController`,
  `MockSsoProdGuard`. All flat in `ai.riviera.platform` (a sub-package would be seen as a new module).

**Domain events (id-based payloads, invariant #11)**

N/A — no new domain event. SSO establishes a session; it does not announce a spine fact. (A future
"customer registered via SSO" analytics event is out of scope.)

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Persist an external `(provider, subject) → account` link; resolve-or-create the account by verified email | `customer` | `customer` **Job:** owns "the customer account (email + opaque credential hash) … account identity is separate from the guest row, no FK (D-6)". SSO subject linkage is explicitly assigned to `customer` by D-2. **Not** on any other module's Not-My-Job list. |
| Relax `customer_account.password_hash` to nullable; skip null-hash rows in the credential read | `customer` | Same Job line — the module owns the credential store; the edge only reads via `CustomerAccounts`. |
| OIDC redirect/callback, `state`/PKCE round-trip, IdP token exchange, session establishment | platform edge (`ai.riviera.platform`) | RV-BE-11: **login machinery stays at the platform edge, never inside a domain module** (`CustomerAuthPlacementTests`). The module never imports a Spring Security type. |
| Rate-limit the SSO endpoints | platform edge (`RateLimitFilter`) | Edge concern (#56); the filter matches by URL path, importing nothing from any module. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** SSO is identity only; no charge, refund, commission, or payout. The
*profile-gated adapter pattern* is borrowed from payment (`StubPaymentGateway`/`StripePaymentGateway`)
as a structural precedent, but no money moves and `riviera-stripe-payments` logic is untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `auth/sign-in.ts` | modify | standalone component | Signals | — (adds SSO buttons below the form) |
| FE-2 | `auth/register.ts` | modify | standalone component | Signals | — (adds the same SSO buttons) |
| FE-3 | `core/customer-auth.ts` | modify | `@Service` | — | adds `startSso(provider)` full-page-nav helper |
| FE-4 | `auth/auth.scss` or Tailwind | modify | styles | — | SSO button styling (per `riviera-tailwind` — prefer Tailwind, don't grow SCSS) |
| FE-5 | `e2e/sso-sign-in.e2e.ts` | new | Playwright spec (mocked suite) | — | button → routed authorize redirect → signed-in + a11y |
| FE-6 | `e2e/support/auth-mocks.ts` + `e2e/support/pages/customer-auth.page.ts` | modify | test support | — | `mockCustomerSsoApi(page, …)` + SSO button locators/data-testids |

**Standards:** standalone, `inject()`, `@if`/`@for`, signal APIs; no `as any`. SSO start is a
**full-page navigation** (`window.location.href = …/api/auth/sso/{provider}/authorize`), not an XHR —
the redirect flow must leave the SPA and return with a session cookie, so the CSRF interceptor and
`HttpClient` are deliberately not involved. Buttons carry `data-testid` (`sso-google`, `sso-apple`).

## FE↔BE contract

- **New endpoints (all under the existing `/api/auth` edge, GET redirects — not JSON):**
  - `GET /api/auth/sso/{provider}/authorize` → `302` to the IdP (mock or real) authorize URL; sets the
    `SESSION` cookie holding `state`/`code_verifier`/`provider`.
  - `GET /api/auth/sso/{provider}/callback?code=&state=` → validates `state`, exchanges the code,
    resolves-or-creates the account, establishes the session, `302` to `/` (SPA root). On bad state → `4xx`.
  - `GET /api/auth/sso/mock/{provider}/authorize?state=&redirect_uri=` (**mock profile only**) → `302`
    back to the callback with a canned `code` + echoed `state` (plays the IdP).
  - `{provider}` ∈ `google` | `apple`; unknown provider → `4xx`.
- **Client typing:** no typed HTTP client needed — the FE only *navigates* to authorize and reads
  signed-in state afterward via the existing `GET /api/auth/me` (`AuthPrincipal { username, principalType }`).
- **Money/date on the wire:** N/A.

## Execution status

> Session-recovery anchor. Re-read after any compaction / fresh session before acting. Update in the
> same commit window as the change it records, at every phase boundary and SDLC stage transition.

**Stage pointer:** `review gate — fixes applied, re-pushing` → then Sonar gate → merge close-out.

**Next action:** Push the review-fix batch (F-3/5/6/7/8/9), confirm CI green on the new push, pull the
SonarCloud new-issue + duplication list for PR #251 and clear it, then the merge close-out. F-1/F-2/F-4
deferred with rationale (findings register) — propagate to #113/#116/new follow-up at close-out.

**Review gate:** high-effort `/code-review` workflow ran on the PR diff (9 findings, 2 refuted). Cleanups
F-3/5/6/7/8/9 fixed + re-tested locally (SsoCallbackIT 7 incl. mock-IdP hop, RateLimitFilterTest 12, 687 FE
unit + e2e + build). F-1 (SSO-only account can't set a password) deferred → S8 #113; F-2 (pre-existing S2
register edge case) → follow-up; F-4 (IdP-error redirect) → S5 #116.

**Verified so far:** Phase 0 — `SsoAccountProvisioningIT` (4) + `CustomerAccountServiceTest` (5) + S2
regression. Phase 1 — `MockSsoGatewayTest` (2) + `RealSsoGatewayTest` (2) + `MockSsoProdGuardTest` (3).
Phase 2 — `SsoCallbackIT` (5: google+apple flows, reuse, bad-state 400, no-authorize 400) + `SsoRateLimitIT`
(1) + refactor regression (`AuthSessionIT` 5 — session-id rotation intact, `CustomerLoginIT` 3) + web slices
with new stubs (`RateLimitFilterTest` 12, `WebCorsConfigTest` 2) + structural net (`ModularityTests`,
`ErrorContract*`, `PackageShape*`, `PublishedSurfacePlacement*`). All pass locally. Full suite = CI.

| Phase | Status | Commits |
|-------|--------|---------|
| Plan — plan doc | ✅ | `2cddfeb` |
| 0 — V27 + customer SSO provisioning | ✅ | `e08e545` |
| 1 — Edge SsoGateway + adapters + guard | ✅ | `852a343` |
| 2 — SsoController (authorize/callback, session, rate-limit) | ✅ | `9a1ec27` |
| 3 — Frontend buttons + mocked e2e | ✅ | (this commit) |
| Close-out — docs + epic tick | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate / Sonar-gate / red-CI finding. Every fix re-enters at
Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what the fix touches first).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-CI | CI (full suite) | `PayoutModuleTest` (`@ApplicationModuleTest`) failed to init — the edge `SsoController` needs `customer::api SsoAccountProvisioning`, absent in module isolation (the memory-noted #127-class trap; scoped runs skip it) | fixed (`@MockitoBean SsoAccountProvisioning`); full backend suite green locally |
| F-3 | review (high) | `SsoController` builds the session principal from the raw provider email, not normalized — S5-latent display drift | fixed |
| F-5 | review (high) | `MockSsoIdpController` open-redirect guard misses scheme/port | fixed (Location rebuilt from the request, guard tightened) |
| F-6 | review (high) | SSO button block duplicated across sign-in/register (also a Sonar-duplication risk) | fixed (extracted `auth/sso-buttons.ts`) |
| F-7 | review (high) | `RateLimitFilter` runs two AntMatchers on every API GET | fixed (`startsWith` pre-check) |
| F-8 | review (high) | new component SCSS vs the Tailwind go-forward | fixed (shared component is Tailwind; SSO SCSS removed) |
| F-9 | review (high) | `MockSsoGateway.providerSlug()` duplicates `SsoProviders.slug()` | fixed |
| F-1 | review (high) | An SSO-only (password-less) account can't set/use a password — no recovery path | **deferred → #113 (S8)**: safe set-password / verified-email reset is S8's job; the unsafe register-UPSERT is a takeover vector. Flagged on #113 + #116. |
| F-2 | review (high) | FE `register()` misclassifies a fresh registration as `exists` when already signed in | **deferred → follow-up #252**: pre-existing S2 (#111) code (the `!wasSignedIn` "review F3" guard), untouched by this diff; rare edge case |
| F-4 | review (high) | Callback returns raw 400 on an IdP error redirect (no `code`/`state`) | **deferred → #116 (S5)**: unreachable with the cooperative mock; graceful IdP-error handling belongs with the real provider flow |
| — | review (high) | auto-link takeover (unverified email) | **refuted** — the mock returns only verified canned identities; real adapters throw. Documented for S5 (R-2) |

---

## File structure

**Backend — `customer` module (`platform/src/main/java/ai/riviera/platform/customer/`)**
- `vocabulary/SsoProvider.java` — new enum `GOOGLE`, `APPLE` (`@NamedInterface("vocabulary")`).
- `api/SsoAccountProvisioning.java` — new `api/` port: `CustomerAccountId resolveOrCreate(SsoProvider, String subject, String email)`.
- `application/CustomerAccountService.java` — implement `SsoAccountProvisioning` (add `resolveOrCreate`).
- `application/CustomerAccountStore.java` — extend: `findAccountBySubject`, `linkOrCreate` (or a single `resolveSsoAccount`).
- `adapter/out/JdbcCustomerAccounts.java` — implement the new store methods (race-safe `ON CONFLICT`); change `findByEmail` to filter `password_hash IS NOT NULL`.

**Backend — Flyway (`platform/src/main/resources/db/migration/`)**
- `V27__customer_sso_identity.sql` — new link table + relax `customer_account.password_hash`.

**Backend — platform edge (`platform/src/main/java/ai/riviera/platform/`)**
- `SsoGateway.java` — port: `authorizationRequest(SsoProvider, SsoAuthorizationChallenge, URI redirectUri) → URI` + `exchangeCode(SsoProvider, String code, String codeVerifier, URI redirectUri) → ExternalIdentity`.
- `ExternalIdentity.java` — record `(SsoProvider provider, String subject, String email)`.
- `SsoAuthorizationChallenge.java` — record `(String state, String codeChallenge)`.
- `MockSsoGateway.java` — `@Component @Profile("!sso")`; canned identities per provider; authorize → mock-IdP URI.
- `MockSsoIdpController.java` — `@RestController @Profile("!sso")`; `GET /api/auth/sso/mock/{provider}/authorize` → 302 to callback with canned code.
- `GoogleSsoGateway.java`, `AppleSsoGateway.java` — `@Component @Profile("sso")` per-provider adapters; throw `UnsupportedOperationException`.
- `RealSsoGateway.java` — `@Component @Profile("sso")`; single `SsoGateway` bean, dispatches to the per-provider adapters (resolves R-7).
- `SsoController.java` — `@RestController`; authorize + callback; state/PKCE in session; establishes session; 302 to `/`.
- `MockSsoProdGuard.java` — `@Component @Profile("prod & !sso")`; constructor throws (aborts boot).
- `SecurityConfig.java` — permit the SSO GET endpoints in the API chain; add an `establishSession(Authentication)` path (pre-built `Authentication`, `ROLE_CUSTOMER`, principal = email) reusing the `changeSessionId()` + `saveContext()` dance.
- `RateLimitFilter.java` — add the SSO authorize/callback GET paths to a per-IP bucket (reuse `login` limit).

**Frontend (`frontend/src/`)** and **e2e (`frontend/e2e/`)** — per the Angular table above.

**Tests (backend)**
- `SsoAccountProvisioningIT` (module/JDBC) — AC-1, AC-2.
- `CustomerAccountServiceTest` — AC-3 (null-hash filter).
- `RealSsoGatewayTest` — AC-5 (UOE).
- `MockSsoProdGuardTest` — AC-6 (context aborts under `prod` w/o `sso`; boots under `prod,sso`).
- `SsoCallbackIT` — AC-4 (happy path establishes session; create/reuse), AC-7 (bad state rejected, no session/account).
- `SsoRateLimitIT` — AC-8.

---

## Phase 0 — V27 migration + `customer` SSO provisioning (resolve-or-create)

**Files:** Create `V27__customer_sso_identity.sql`, `SsoProvider.java`, `SsoAccountProvisioning.java`,
`SsoAccountProvisioningIT` · Modify `CustomerAccountService`, `CustomerAccountStore`,
`JdbcCustomerAccounts` · Test `CustomerAccountServiceTest`.

**Skills to load first (routing gate):** `riviera-local-debug` (first build), `riviera-java-conventions`
(records, sealed outcomes, JdbcClient), `postgres` (already loaded — migration), `riviera-modulith`
(already loaded — placement).

**V27 migration (design):**
```sql
-- Maps an external (provider, subject) identity to a customer_account (D-2/D-6 separate identity).
CREATE TABLE customer_sso_identity (
    id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id  BIGINT      NOT NULL REFERENCES customer_account (id),
    provider    TEXT        NOT NULL CHECK (provider IN ('GOOGLE', 'APPLE')),
    subject     TEXT        NOT NULL,
    email       TEXT        NOT NULL,   -- provider-asserted email at link time (audit)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_sso_identity_provider_subject_uniq UNIQUE (provider, subject)
);
CREATE INDEX customer_sso_identity_account_id_idx ON customer_sso_identity (account_id);

-- SSO-only accounts carry no local password; relax NOT NULL so find-or-create can insert one.
ALTER TABLE customer_account ALTER COLUMN password_hash DROP NOT NULL;
```

**Resolve-or-create (all in one `@Transactional`, race-safe):**
1. `SELECT account_id FROM customer_sso_identity WHERE provider=? AND subject=?` → if present, return it.
2. `INSERT INTO customer_account (email, password_hash) VALUES (?, NULL) ON CONFLICT (email) DO NOTHING RETURNING id`;
   if no row (email taken → **auto-link**), `SELECT id FROM customer_account WHERE email=?`.
3. `INSERT INTO customer_sso_identity (account_id, provider, subject, email) VALUES (?,?,?,?)
   ON CONFLICT (provider, subject) DO NOTHING RETURNING account_id`;
   if no row (concurrent link), `SELECT account_id FROM customer_sso_identity WHERE provider=? AND subject=?`. Return it.

- TDD: `SsoAccountProvisioningIT` (Testcontainers/JDBC) — first-creates-second-reuses (AC-1),
  unknown-subject-taken-email-links (AC-2). `CustomerAccountServiceTest` — `findByEmail` skips null hash (AC-3).
- End-of-phase regression: `./gradlew test --tests "*Customer*" --tests "*ModularityTests*"` (scoped).

## Phase 1 — Edge `SsoGateway` port, mock + throwing real adapters, startup guard

**Files:** `SsoGateway`, `ExternalIdentity`, `SsoAuthorizationChallenge`, `MockSsoGateway`,
`MockSsoIdpController`, `GoogleSsoGateway`, `AppleSsoGateway`, `RealSsoGateway`, `MockSsoProdGuard` +
`RealSsoGatewayTest`, `MockSsoProdGuardTest`.

**Skills to load first:** `riviera-java-conventions`, `riviera-modulith` (edge placement).

- Profiles: `MockSsoGateway` + `MockSsoIdpController` = `@Profile("!sso")`; `GoogleSsoGateway` /
  `AppleSsoGateway` / `RealSsoGateway` = `@Profile("sso")`; `MockSsoProdGuard` = `@Profile("prod & !sso")`.
- Mock canned identities: `GOOGLE → (subject "google-mock-subject-001", email "google.tourist@example.com")`,
  `APPLE → (subject "apple-mock-subject-001", email "apple.tourist@example.com")` — deterministic so a
  second click reuses the account; distinct providers → distinct accounts.
- TDD: `RealSsoGatewayTest` (both real adapters throw UOE — AC-5); `MockSsoProdGuardTest` via
  `ApplicationContextRunner` with active profiles set through an initializer — `prod` w/o `sso` fails,
  `prod,sso` boots (AC-6). Context-loads sanity under each profile (R-7).

## Phase 2 — `SsoController` (authorize + callback), session, rate-limit

**Files:** `SsoController`, modify `SecurityConfig` (permit + `establishSession(Authentication)`),
modify `RateLimitFilter` + `SsoCallbackIT`, `SsoRateLimitIT`.

**Skills to load first:** `riviera-java-conventions`, `riviera-modulith`.

- **authorize:** generate `state` (secure random) + PKCE `code_verifier`/`code_challenge (S256)`, store
  `state`/`code_verifier`/`provider` in the HTTP session, `302` to `ssoGateway.authorizationRequest(...)`.
- **callback:** validate `state == session state` (+ provider matches); pull `code_verifier`; call
  `ssoGateway.exchangeCode(...)` → `ExternalIdentity`; `customer` `resolveOrCreate(...)` → `CustomerAccountId`;
  build an authenticated `UsernamePasswordAuthenticationToken(email, null, [ROLE_CUSTOMER])`,
  `changeSessionId()` + save context; clear SSO session attrs; `302` to `/`. Bad/missing state → `4xx`, no session/account.
- **RateLimitFilter:** add the two SSO GET paths to a per-IP bucket (reuse the `login` limit); note the
  filter currently only rate-limits POSTs → extend `authBucketsFor` (or add `ssoBucketsFor`) for the GET paths.
- TDD: `SsoCallbackIT` (mock profile) — happy path sets `SESSION` cookie + create/reuse (AC-4 backend),
  bad state rejected (AC-7); `SsoRateLimitIT` (AC-8). Watch R-5 (WebSliceStubs / module-test beans).

## Phase 3 — Frontend SSO buttons + mocked e2e

**Files:** modify `auth/sign-in.ts`, `auth/register.ts`, `core/customer-auth.ts`, styles; new
`e2e/sso-sign-in.e2e.ts`; modify `e2e/support/auth-mocks.ts`, `e2e/support/pages/customer-auth.page.ts`.

**Skills to load first (routing gate):** `riviera-frontend` (folder placement), `angular-developer` +
angular-cli MCP (v22 APIs + a11y), `riviera-tailwind` (button styling), `playwright-cli` (best-practice spec).

- Add "Continue with Google" / "Continue with Apple" buttons below each form's submit, above `.auth-alt`,
  with `data-testid="sso-google"`/`"sso-apple"`; `startSso(provider)` in `CustomerAuth` does the full-page nav.
- Mocked e2e (CI-safe `e2e/`, run via `npm run test:e2e:a11y` on Windows): `page.route` the authorize
  URL → fulfill `302` to `/` and flip a `signedIn` closure so the subsequent `/api/auth/me` returns the
  CUSTOMER; assert signed-in via `CustomerAuthPage.expectSignedInAs(...)` (AC-4 FE, AC-6-adjacent a11y).
  Add `mockCustomerSsoApi(page, …)` alongside the existing helpers. Both providers covered.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-3, AC-5..AC-8:** `./gradlew test --tests "*Sso*" --tests "*CustomerAccountServiceTest*" --tests "*MockSsoProdGuard*"` → all PASS.
- [ ] **AC-4 (FE) / AC-6-adjacent a11y:** `npm run test:e2e:a11y` (from `frontend/`) → `sso-sign-in.e2e.ts` PASS.
- [ ] **AC-9:** `./gradlew test --tests "*ModularityTests*" --tests "*CustomerAuthPlacementTests*"` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A (SSO does not touch `availability`).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; `customer::api`
      port + `::vocabulary` enum only; edge machinery stays in the root package (invariant #11, RV-BE-11).
- [ ] **Payment/payout** N/A justified.
- [ ] Flyway V27 present; `UNIQUE(provider, subject)` + FK tested; number verified free (invariant #12).
- [ ] SSO callback protected by server-side `state`; endpoints rate-limited (D-8).
- [ ] Mock forbidden in prod (guard tested); real adapters throw loud (no silent fallback).
- [ ] **Frontend** standards met; SSO start is a deliberate full-page nav; no `as any`.
- [ ] Execution status at HEAD matches reality; findings register current.
- [ ] Risk register has no stale `open` rows at merge; Open Questions empty or deferred with an issue #.
