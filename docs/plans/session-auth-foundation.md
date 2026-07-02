# Session-Auth Foundation (S1) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-request HTTP Basic with framework-native Spring Security session
authentication (Postgres-persisted via Spring Session JDBC) + CSRF cookie-to-header for
the whole operator surface, end-to-end (BE + FE + e2e), with auth errors on the RFC-7807
contract.

**Architecture:** All login machinery (login/logout/me endpoints, session config, CSRF
handling, 401 entry point) lives at the **platform edge** (root package
`ai.riviera.platform`) — the `operator` module stays untouched and is consulted only via
its existing `api/` ports (`OperatorAccounts` feeds the `UserDetailsService`,
`OperatorDirectory` feeds `CurrentOperator`). Login is **controller-based**
(`AuthenticationManager` behind a `@RestController`) — no JWT, no custom token filter
(D-1) — which routes login failures through the single `ApiErrorHandler` advice, putting
the 401 on the RFC-7807 contract for free. Sessions persist in Postgres
(`spring-session-jdbc`, Flyway-managed schema) so restarts/redeploys keep users signed in.

**Persistence:** JDBC only (invariant #1). New Flyway migration **V19** vendors Spring
Session's canonical PostgreSQL schema (`SPRING_SESSION`, `SPRING_SESSION_ATTRIBUTES`)
verbatim; `spring.session.jdbc.initialize-schema=never` keeps Flyway the only DDL writer
(invariant #12). No other schema change.

**Source of intent:** Issue #109 (S1 of epic #108) ·
`docs/architecture/auth-signin-register.md` (D-1, D-2, D-8) · grill-gate record on #109
(2026-07-02 comment).

**Skills consulted:** `grilling` (intake gate: RFC-7807 401 conformance re-decision, V19
not V18, CSRF-exemption inversion, #120-item-1 fold-in), `riviera-modulith` (all auth
machinery at the platform edge, `operator` module untouched, no new module/port/event),
`postgres` (V19 = vendored canonical Spring Session PG schema, verbatim — library issues
fixed SQL against it; `initialize-schema=never`), `riviera-java-conventions` (records for
DTOs, controller-based login through the one advice §6b, no per-controller
`@ExceptionHandler`, exceptions-for-exceptional: `BadCredentialsException` is the
framework's own signal here), `riviera-frontend` (auth state + interceptor stay in
`core/`; no new feature folder in S1 — sign-in card stays in `venue-admin`; e2e POM under
`frontend/e2e/support/`), `riviera-local-debug` (loaded before first gradle command),
`angular-developer` + angular-cli MCP (loaded at Phase 5), `playwright-cli` (loaded at
Phase 6).

**Branch:** `claude/session-auth-foundation-s1-9cd4v3` — the session's designated remote
branch stands in for `feature/session-auth-foundation` (cloud-session addendum;
restarted from `main` d8063cb, previous PRs merged).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an active operator with valid credentials, when
  `POST /api/auth/operator/login` succeeds, then the response carries a session cookie
  with `HttpOnly`, `Secure`, `SameSite=Lax` and the principal (username) in the body.
  *Pinned by:* `AuthSessionIT.loginEstablishesSessionCookieWithSecureFlags`
- [ ] **AC-2:** Given wrong password, unknown username, or a suspended operator, when
  login is attempted, then the response is `401 application/problem+json` with
  `code=INVALID_CREDENTIALS` and an **identical body across all three cases** (no
  account enumeration, D-8). *Pinned by:* `AuthSessionIT.badCredentialsGetGeneric401`
- [ ] **AC-3:** Given a session-authenticated operator, when they call every existing
  operator-gated endpoint, then it authorizes exactly as Basic did (owns → 2xx, other's
  venue → 403 `NOT_VENUE_OWNER`); an `Authorization: Basic` header alone no longer
  authenticates (401). *Pinned by:* migrated `PerOperatorLoginIT`, `CrossVenueDenialIT`,
  `VenueAdminControllerIT`, `StaffAvailabilityControllerIT`, `StaffBookingControllerIT`,
  `WeatherRefundSecurityIT`, `AdminPayoutSecurityIT`
- [ ] **AC-4:** Given a signed-in operator, when the session is established, then it is
  stored in Postgres (`SPRING_SESSION` row via `JdbcIndexedSessionRepository`) — an app
  restart preserves it because the container holds no session state. *Pinned by:*
  `SessionPersistenceIT.sessionIsStoredInPostgresAndAuthenticatesSubsequentRequests`
- [ ] **AC-5:** Given a session-authenticated operator, when a venue-scoped write is sent
  without (or with a wrong) CSRF token, then it is rejected `403 application/problem+json`
  `code=INVALID_CSRF_TOKEN`; with the cookie-supplied token it succeeds. Guest booking
  endpoints and the Stripe webhook stay token-less (unchanged posture). *Pinned by:*
  `CsrfProtectionIT`
- [ ] **AC-6:** Given a signed-in operator, when `POST /api/auth/logout` is called, then
  the server session is invalidated (replaying the old cookie → 401); and the session id
  rotates on login (fixation, D-1). *Pinned by:*
  `AuthSessionIT.logoutInvalidatesServerSession`, `AuthSessionIT.sessionIdRotatesOnLogin`
- [ ] **AC-7:** Given repeated login attempts from one IP past the limit, when the next
  attempt arrives, then it gets `429 application/problem+json` `code=RATE_LIMITED` +
  `Retry-After` (D-8, #56 pattern). *Pinned by:* `RateLimitFilterTest` (login-path cases)
- [ ] **AC-8:** Given a signed-in operator in the SPA, when the page reloads, then the
  signed-in state is restored via `GET /api/auth/me` (no credentials held in browser
  memory). *Pinned by:* `operator-auth.spec.ts` (restore-on-init) + mocked e2e
  `operator-sign-in.e2e.ts`
- [ ] **AC-9:** Given any FE request to the API, when it is sent, then it carries
  `withCredentials` and (for mutating requests) the `X-XSRF-TOKEN` header from the
  `XSRF-TOKEN` cookie; **no `Authorization` header is ever attached**. *Pinned by:*
  `api-session.interceptor.spec.ts`
- [ ] **AC-10:** The mocked e2e suite covers the sign-in flow (success, generic failure,
  reload-restore, a11y) using the new Page Object convention (#120 item 1); the
  real-backend suite's `support/operator.ts` + `venue-editor.e2e.ts` work against real
  session auth. *Pinned by:* `frontend/e2e/operator-sign-in.e2e.ts` (CI suite),
  `frontend/e2e/real-backend/venue-editor.e2e.ts` (local)
- [ ] **AC-11:** Structural net green: `OperatorAuthPlacementTests` (no Spring Security in
  `operator..`), `ModularityTests`, `ErrorContractArchitectureTests` (still exactly one
  advice), `JdbcOnlyArchitectureTests`. *Pinned by:* the named classes, unchanged.
- [ ] **AC-12:** The `riviera-docs-freshness` skill exists
  (`.claude/skills/riviera-docs-freshness/SKILL.md`), is registered in `CLAUDE.md`'s
  skills list and `riviera-sdlc`'s merge close-out step 5, and one smoke run against this
  slice's own diff catches the facts the slice staled (at minimum: the
  `riviera-frontend` skill's `core/` example filenames; the real-backend e2e
  `InMemoryUserDetailsManager` comments — pre-fixed by this slice, the run confirms none
  remain). *Verified by:* the smoke-run record in this plan's review note.

## Non-goals

- Customer accounts/registration (S2), SSO (S4/S5), operator self-registration/approval
  and bootstrap-operator retirement (S6), email flows (S8).
- Same-site deployed hosting (S7) — deployed cross-site cookie behavior is out of scope;
  local dev and the real-backend e2e are same-site (`localhost`) and must work.
- A dedicated `auth/` FE feature folder — arrives with S2's customer pages; S1 keeps the
  operator sign-in card in `venue-admin` (placement re-checked then).
- Retrofitting all existing e2e specs onto Page Objects (#120 item 1 lands the convention
  + auth-flow objects only).
- Remember-me, session-timeout tuning, concurrent-session limits, MFA/lockout (epic
  non-goals).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Removing CSRF `ignoringRequestMatchers` breaks the token-less guest booking flow (create/cancel) or the Stripe webhook | med | high | Keep exactly those three paths exempt; `CsrfProtectionIT` pins both directions (operator write needs token; guest+webhook don't) | Claude | open |
| R-2 | Controller-based login skips the filter-chain `SessionAuthenticationStrategy` → session fixation not mitigated | med | high | Explicit rotation in the login service (`changeSessionId`) + `AuthSessionIT.sessionIdRotatesOnLogin` | Claude | open |
| R-3 | `Secure` cookie flag breaks local dev / real-backend e2e over `http://localhost` | low | med | Browsers exempt `localhost` from the Secure-over-HTTPS rule (trustworthy origin); verified live by the real-backend e2e in Phase 6 | Claude | open |
| R-4 | Session-cookie + CORS: FE on `:4200` against BE `:8080` needs `allowCredentials` and the cookie is port-agnostic on localhost | med | med | `WebCorsConfig` gains `allowCredentials(true)` with explicit origins (never `*`); real-backend e2e proves the pair | Claude | open |
| R-5 | 7+ ITs authenticate with `.with(httpBasic(...))` — mass breakage on the auth switch | high | med | One shared test helper (session-login `RequestPostProcessor`/MockMvc flow) introduced first, migrated file-by-file in one phase | Claude | open |
| R-6 | Angular's built-in XSRF support skips absolute URLs — `withXsrfConfiguration` alone silently never sends the header | high | high | Custom `core/` interceptor reads the `XSRF-TOKEN` cookie and sets the header for `apiBaseUrl` mutating requests; spec pins it | Claude | open |
| R-7 | Spring Security 7 SPA CSRF handling (BREACH/Xor handler + deferred tokens) mis-wired → token never issued or always rejected | med | high | Follow the current Spring Security SPA recipe (cookie repo + request handler + force-load filter as documented); `CsrfProtectionIT` covers issue+accept+reject | Claude | open |
| R-8 | A second error-mapping path for auth sneaks in (second advice / per-controller handler) breaking the #117 contract | low | med | Login errors flow through `ApiErrorHandler` (new 401 mappings); filter-level 401/403 hand-mirror `ApiProblem` like `RateLimitFilter`; `ErrorContractArchitectureTests` unchanged | Claude | open |
| R-9 | Spring Session cleanup / serialization: principal object graph stored as bytes — a heavyweight or non-serializable principal breaks persistence | low | med | Store the minimal Spring Security `User` principal (username + authorities) only; `SessionPersistenceIT` round-trips it | Claude | open |

## Open questions / Assumptions

- **Assumption:** Chrome (Playwright) accepts `Secure` cookies from `http://localhost`
  (trustworthy-origin exemption) — *Owner:* Claude · *Resolves by:* Phase 6 (real-backend
  e2e run).
- **Assumption:** Spring Boot 4.1 auto-configures the Spring Session cookie from
  `server.servlet.session.cookie.*` (name/SameSite/Secure/HttpOnly) — *Owner:* Claude ·
  *Resolves by:* Phase 1 (`AuthSessionIT` cookie-flag assertions).

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No write path to `availability(set_id, booking_date)`
changes; the slice swaps the **authentication mechanism** in front of the same
application services. The ownership check (invariant #13) is untouched: `CurrentOperator`
still resolves the principal name → `OperatorId` via `OperatorDirectory`, and the
application-service `assertOwns` checks stay as-is (`CrossVenueDenialIT` re-pins them
under session auth).

## Spring Modulith — modules, interfaces, events

**Modules touched:** none structurally. All new code lands in the **root package**
`ai.riviera.platform` (platform-edge config, precedent: `SecurityConfig`,
`RateLimitFilter`, `CurrentOperator`, `ApiProblem`) — the root is not a module, so no
`allowedDependencies` change and no new named interface.

**Module-ownership table (plan-time boundary gate):**

| Capability (what the slice adds/changes) | Owner | Justification |
|---|---|---|
| Login/logout/me endpoints, session config, CSRF wiring, 401 entry point | platform edge (root pkg) | RESPONSIBILITIES `operator` Not-My-Job: "credential encoding/verifying → the platform edge… never the login machinery (RV-BE-11)"; pinned by `OperatorAuthPlacementTests` |
| Credential lookup for login | `operator` via existing `api/` port `OperatorAccounts` | Already the #74 seam; no port change |
| Principal → `OperatorId` for ownership checks | `operator` via existing `api/` port `OperatorDirectory` (`CurrentOperator` unchanged) | Invariant #13 seam untouched |
| Session storage (`SPRING_SESSION*` tables) | platform edge infra | Framework-owned tables, like the Event Publication Registry (V8 precedent); no module owns them |

**Cross-module named interfaces:** none new. **Domain events:** none.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The Stripe webhook endpoint's CSRF-exempt, unauthenticated
posture is explicitly preserved (AC-5).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/operator-auth.ts` | rewritten | `@Service()` singleton | signals (`signedIn`, `username`, `pending`); async `signIn`/`signOut`; restore-on-init via `/api/auth/me` | n/a |
| FE-2 | `core/api-session.interceptor.ts` | new (replaces `core/operator-auth.interceptor.ts`) | `HttpInterceptorFn` | stateless: `withCredentials` for `apiBaseUrl`, `X-XSRF-TOKEN` from cookie on mutating requests; **never** an `Authorization` header | n/a |
| FE-3 | `venue-admin/venue-editor.ts` | modified | standalone component | sign-in becomes async server-validated (pending/error signals); sign-out calls the service | template-driven signals (existing pattern) |
| FE-4 | `app.config.ts` | modified | composition root | swap interceptor registration | n/a |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal APIs (per
`angular-developer` + angular-cli MCP `get_best_practices`, loaded at Phase 5). Auth
state/interceptor stay in `core/` (riviera-frontend); features keep importing `core/`
only.

## FE↔BE contract

- **New endpoints (all platform-edge, all rate-limit-eligible):**
  - `POST /api/auth/operator/login` — body `{"username": string, "password": string}` →
    `200` `{"username": string, "principalType": "OPERATOR"}` + session cookie; `401`
    problem+json `INVALID_CREDENTIALS` (generic); CSRF-protected (token pre-fetched via
    any prior GET).
  - `POST /api/auth/logout` — `204`, invalidates session; principal-type-agnostic (S2
    reuses it).
  - `GET /api/auth/me` — `200` `{"username", "principalType"}` when authenticated; `401`
    problem+json `UNAUTHENTICATED` when not (FE treats 401 as signed-out, not an error).
- **Error contract:** login failure `401 INVALID_CREDENTIALS` (via `ApiErrorHandler`);
  unauthenticated API access `401 UNAUTHENTICATED` (entry point, hand-mirrored shape);
  CSRF rejection `403 INVALID_CSRF_TOKEN` (access-denied handler, hand-mirrored);
  `429 RATE_LIMITED` unchanged. All `application/problem+json` with `instance` redacted
  (invariant #7 posture).
- **Client typing:** hand-written typed service (existing pattern), no `as any`.
- **Cookies on the wire:** session cookie `HttpOnly; Secure; SameSite=Lax`; CSRF cookie
  `XSRF-TOKEN` (not HttpOnly — the SPA must read it), header `X-XSRF-TOKEN`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 1 — BE: session login/logout/me + Spring Session JDBC (V19) + 401 contract | ✅ | ed2ae5a |
| 2 — BE: migrate ITs off Basic; remove httpBasic | ✅ | (this commit) |
| 3 — BE: CSRF cookie-to-header; exemptions inverted | ⏳ | |
| 4 — BE: login rate limit | | |
| 5 — FE: session auth state + interceptor + sign-in UX | | |
| 6 — e2e: POM + sign-in spec; real-backend update | | |
| 7 — riviera-docs-freshness skill + substrate updates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

**Backend (all in `platform/`):**
- `build.gradle` — add `org.springframework.session:spring-session-jdbc`.
- `src/main/resources/db/migration/V19__spring_session.sql` — vendored canonical schema.
- `src/main/resources/application.yaml` — session store type, `initialize-schema=never`,
  cookie flags (name `SESSION`, HttpOnly, Secure, SameSite=Lax).
- `src/main/java/ai/riviera/platform/AuthController.java` — new: login/logout/me
  (package-private, thin; delegates to `AuthenticationManager`).
- `src/main/java/ai/riviera/platform/SecurityConfig.java` — sessions
  (`IF_REQUIRED`), drop `httpBasic`, 401 entry point + CSRF denied handler emitting the
  `ApiProblem` shape, CSRF cookie repo + SPA handler, exemption list inverted,
  `AuthenticationManager` bean.
- `src/main/java/ai/riviera/platform/ApiErrorHandler.java` — add
  `BadCredentialsException`/`AuthenticationException` → `401 INVALID_CREDENTIALS`.
- `src/main/java/ai/riviera/platform/RateLimitFilter.java` (+ `RateLimitProperties`) —
  cover `POST /api/auth/operator/login` per-IP.
- `src/main/java/ai/riviera/platform/WebCorsConfig.java` — `allowCredentials(true)`.
- Tests: `AuthSessionIT` (new), `SessionPersistenceIT` (new), `CsrfProtectionIT` (new),
  `RateLimitFilterTest` (extend), `SessionLoginSupport` test helper (new), migrations of
  the 7 httpBasic ITs.

**Frontend:**
- `src/app/core/operator-auth.ts` + spec — rewritten (session state).
- `src/app/core/api-session.interceptor.ts` + spec — new; delete
  `core/operator-auth.interceptor.ts` + spec.
- `src/app/core/auth.model.ts` — principal/login DTO types (core-owned, cross-feature).
- `src/app/app.config.ts` — interceptor swap.
- `src/app/venue-admin/venue-editor.ts` (+ spec) — async sign-in.
- `e2e/support/pages/operator-sign-in.page.ts` (+ any minimal shared fixture) — POM seed.
- `e2e/operator-sign-in.e2e.ts` — new mocked+a11y spec.
- `e2e/staff-daily.e2e.ts` — add `/api/auth/*` mocks for the sign-in step.
- `e2e/real-backend/support/operator.ts`, `e2e/real-backend/venue-editor.e2e.ts` — stale
  comments fixed; flow adapted to server-validated login.

**Docs/skills:**
- `.claude/skills/riviera-docs-freshness/SKILL.md` — new.
- `CLAUDE.md` (skills list + operator-note wording), `.claude/skills/riviera-sdlc/SKILL.md`
  (close-out step 5 reference), `.claude/skills/riviera-frontend/SKILL.md` (core/
  examples), `RESPONSIBILITIES.md`/`CONTEXT.md` if the freshness run flags them.
- This plan doc — status updates per phase.

---

## Phases (TDD discipline per riviera-plan-doc; scoped test runs per riviera-local-debug)

Each phase: red (named test) → green (minimal impl) → end-of-phase scoped regression →
commit referencing #109 → plan-doc status update in the same window. Full suite runs in
CI, never locally (cloud sandbox OOM rule).

### Phase 1 — BE: session login/logout/me + Spring Session JDBC + 401 contract
Red: `AuthSessionIT` (AC-1, AC-2, AC-6) + `SessionPersistenceIT` (AC-4).
Green: dep + V19 + yaml + `AuthController` + `SecurityConfig` session wiring + entry
point + `ApiErrorHandler` 401 mapping. `httpBasic` stays temporarily so existing ITs
stay green until Phase 2.

### Phase 2 — BE: migrate ITs off Basic; remove httpBasic
Red: flip one IT to `SessionLoginSupport`; then sweep all seven; remove `.httpBasic()`;
`PerOperatorLoginIT` keeps every scenario (wrong pw, unknown user, suspended, cross-op)
now expressed through login-then-session (AC-3).

### Phase 3 — BE: CSRF
Red: `CsrfProtectionIT` (AC-5: operator write w/o token 403 `INVALID_CSRF_TOKEN`; with
token 2xx; guest create/cancel + webhook token-less OK).
Green: cookie repo + SPA request handler + denied handler; exemptions inverted.

### Phase 4 — BE: login rate limit
Red: `RateLimitFilterTest` login cases (AC-7). Green: filter covers the login path
per-IP (reuse #56 bucket machinery + properties).

### Phase 5 — FE: session auth state + interceptor + sign-in UX
(Load `angular-developer` + angular-cli MCP first.) Red: rewritten `operator-auth.spec.ts`
(AC-8) + `api-session.interceptor.spec.ts` (AC-9) + `venue-editor` spec updates.
Green: FE-1..FE-4. Lint + full FE unit suite (cheap locally).

### Phase 6 — e2e: POM + sign-in spec; real-backend update
(Load `playwright-cli` first.) Mocked suite: `operator-sign-in.e2e.ts` via the new page
object (AC-10); update `staff-daily.e2e.ts` mocks. Real-backend: `support/operator.ts` +
`venue-editor.e2e.ts` against real session auth (validates R-3/R-4 live).

### Phase 7 — riviera-docs-freshness skill + substrate updates
Draft the skill (AC-12), register it (CLAUDE.md + riviera-sdlc), run it on
`origin/main...HEAD`, patch what it flags (known targets: riviera-frontend `core/`
examples; verify SecurityConfig/e2e stale comments are gone; CONTEXT.md/RESPONSIBILITIES
wording).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-02 | Phase 2 (Basic retirement) | remaining `httpBasic(` in backend | `grep -rn httpBasic platform/src` | 0 (main + test) after sweep of 8 IT files + SecurityConfig | complete; SecurityConfig javadoc rewritten to session posture |

Planned audits (run at their phases, results recorded here): Phase 2 — remaining
`httpBasic(`/`basicAuthHeader` usages; Phase 3 — stale "stateless / no session → CSRF
n/a" comments in `platform/src/main`; Phase 6 — stale `InMemoryUserDetailsManager`
comments in `frontend/`.

## Acceptance-criteria verification (final)

> Filled with commands + SHAs as each AC is verified; the gate before claiming done.

- [ ] **AC-1..AC-7:** scoped gradle runs of the pinning ITs (local, dockerd session) + CI full suite green.
- [ ] **AC-8/AC-9:** `npm test` (vitest) green incl. the rewritten/new specs.
- [ ] **AC-10:** mocked suite (`playwright.a11y.config.ts`) green incl. `operator-sign-in.e2e.ts`; real-backend `venue-editor.e2e.ts` green locally.
- [ ] **AC-11:** scoped run of the four structural test classes green.
- [ ] **AC-12:** skill drafted + registered; smoke-run record added to the review note.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A; no concurrency surface changed (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module internals imports; no new events (invariant #11).
- [ ] **Payment/payout** N/A; webhook posture explicitly preserved (invariant #8).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6); session timestamps are framework-owned epoch millis.
- [ ] Booking codes: error bodies stay redacted (`ApiProblem` by construction) (invariant #7).
- [ ] Flyway V19 present; `initialize-schema=never` (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

## Review-gate record

Filled at the review gate (findings, fixes, skills loaded per fix, Sonar note).
