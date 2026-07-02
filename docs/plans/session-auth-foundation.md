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
| R-1 | Removing CSRF `ignoringRequestMatchers` breaks the token-less guest booking flow (create/cancel) or the Stripe webhook | med | high | Keep exactly those three paths exempt; `CsrfProtectionIT` pins both directions (operator write needs token; guest+webhook don't) | Claude | resolved (CsrfProtectionIT pins both directions; guest ITs green) |
| R-2 | Controller-based login skips the filter-chain `SessionAuthenticationStrategy` → session fixation not mitigated | med | high | Explicit rotation in the login controller (`changeSessionId`) + `AuthSessionIT.sessionIdRotatesOnLogin` | Claude | resolved (ed2ae5a) |
| R-3 | `Secure` cookie flag breaks local dev / real-backend e2e over `http://localhost` | low | med | Browsers exempt `localhost` from the Secure-over-HTTPS rule (trustworthy origin); verified live by the real-backend e2e in Phase 6 | Claude | resolved (8/8 live) |
| R-4 | Session-cookie + CORS: FE on `:4200` against BE `:8080` needs `allowCredentials` and the cookie is port-agnostic on localhost | med | med | `WebCorsConfig` gains `allowCredentials(true)` with explicit origins (never `*`); pinned by `WebCorsConfigTest`, proven live by the real-backend e2e | Claude | resolved |
| R-5 | 7+ ITs authenticate with `.with(httpBasic(...))` — mass breakage on the auth switch | high | med | One shared helper (`SessionLoginSupport`) + one sweep; all 8 IT files green | Claude | resolved (176a39a) |
| R-6 | Angular's built-in XSRF support skips absolute URLs — `withXsrfConfiguration` alone silently never sends the header | high | high | Custom `core/` interceptor reads the `XSRF-TOKEN` cookie and sets the header for `apiBaseUrl` mutating requests; `api-session.interceptor.spec.ts` pins it | Claude | resolved (bfbbc32) |
| R-7 | Spring Security 7 SPA CSRF handling mis-wired → token never issued or always rejected | med | high | Resolved via SS7's native `.spa()` + hardened cookie repo; `CsrfProtectionIT` + `CsrfCookieBootstrapIT` pin issue/accept/reject. Learned: the `csrf()` TEST post-processor permanently swaps the shared CsrfFilter repo in a cached context — bootstrap pin isolated in its own context | Claude | resolved (Phase 3) |
| R-8 | A second error-mapping path for auth sneaks in (second advice / per-controller handler) breaking the #117 contract | low | med | Login errors flow through `ApiErrorHandler` (new 401 mapping); filter-level 401/403 hand-mirror `ApiProblem` like `RateLimitFilter`; `ErrorContractArchitectureTests` green unchanged | Claude | resolved |
| R-9 | Spring Session cleanup / serialization: principal object graph stored as bytes — a heavyweight or non-serializable principal breaks persistence | low | med | Store the minimal Spring Security `User` principal (username + authorities) only; `SessionPersistenceIT` round-trips it | Claude | resolved (ed2ae5a) |

## Open questions / Assumptions

None open.

### Resolved

- **Chrome accepts `Secure` cookies from `http://localhost`** — CONFIRMED live: the
  real-backend suite (8/8, Chromium against bootRun on :8080) holds the session across
  sign-in → venue create → set writes with `Secure` set. Resolved Phase 6.
- **Boot 4.1 maps `server.servlet.session.cookie.*` onto the Spring Session cookie** —
  REFUTED in the mock web environment (the `EmbeddedWebServerConfiguration` mapping did
  not reach the cookie): resolved by owning the posture in code — the explicit
  `CookieSerializer` bean in `SecurityConfig`, pinned by `AuthSessionIT`. Resolved
  Phase 1 (ed2ae5a).

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
| 2 — BE: migrate ITs off Basic; remove httpBasic | ✅ | 176a39a |
| 3 — BE: CSRF cookie-to-header; exemptions inverted | ✅ | 1513f88 |
| 4 — BE: login rate limit | ✅ | 32b1294 |
| 5 — FE: session auth state + interceptor + sign-in UX | ✅ | bfbbc32, 2948e81 |
| 6 — e2e: POM + sign-in spec; real-backend update | ✅ | bfbbc32 (validated: mocked 7/7, real-backend 8/8) |
| 7 — riviera-docs-freshness skill + substrate updates | ✅ | e3cff42 |

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
| 2026-07-02 | Phase 2 (Basic retirement) | remaining `httpBasic(` in backend | `grep -rn httpBasic platform/src` | 5 at first pass: 3 stale main-source javadocs + SecurityConfig CSRF comment + SessionLoginSupport's intentional history note | 3 javadocs rewritten (Phase-3 commit); CSRF comment rewritten in Phase 3; helper note kept |
| 2026-07-02 | Phase 3 (CSRF inversion) | stale "CSRF-exempt"/"stateless → CSRF n/a" comments | `grep -n "CSRF-exempt\|token-less" SecurityConfig.java` | 4 path-constant javadocs + the csrf() block comment | all rewritten to the session+token posture |

| 2026-07-02 | Phase 5 (FE swap) | remaining `basicAuthHeader`/`operatorAuthInterceptor`/`operator-auth.interceptor` refs | `grep -rn ... frontend/src frontend/e2e` | 4 files (2 javadoc links, 2 spec imports) beyond the rewrites | all swapped to `apiSessionInterceptor`; 0 remain |
| 2026-07-02 | Phase 6 (e2e) | stale `InMemoryUserDetailsManager` comments | `grep -rn InMemoryUserDetailsManager frontend/` | 2 (support/operator.ts, venue-editor.e2e.ts) | both rewritten to the session flow; also independently caught by the riviera-docs-freshness smoke run |

## Acceptance-criteria verification (final)

> Filled with commands + SHAs as each AC is verified; the gate before claiming done.

- [x] **AC-1/2/4/6:** `gradle test --tests "*AuthSessionIT*" --tests "*SessionPersistenceIT*"` → 6/6 (ed2ae5a).
- [x] **AC-3:** all 8 migrated IT classes green in two scoped batches (176a39a); Basic no longer authenticates (no `httpBasic` in the chain).
- [x] **AC-5:** `gradle test --tests "*CsrfProtectionIT*" --tests "*CsrfCookieBootstrapIT*"` → green (1513f88); guest ITs (`BookingControllerIT`) green in the same batch.
- [x] **AC-7:** `gradle test --tests "*RateLimit*"` → green incl. the login cases (32b1294).
- [x] **AC-8/AC-9:** `npm test` → 194/194 incl. rewritten `operator-auth.spec.ts` + new `api-session.interceptor.spec.ts`; lint clean (2948e81).
- [x] **AC-10:** mocked suite 7/7 (`playwright.a11y.config.ts`, pinned Chromium) incl. `operator-sign-in.e2e.ts`; real-backend suite 8/8 against live bootRun + Postgres.
- [x] **AC-11:** `ModularityTests`, `OperatorAuthPlacementTests`, `ErrorContractArchitectureTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests` green (176a39a batch).
- [x] **AC-12:** skill drafted + registered + smoke run over `origin/main...HEAD` with 3 findings, all handled (e3cff42; record above). CI full suite = the PR gate.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1).
- [x] **Availability** section justified N/A; no concurrency surface changed (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module internals imports; no new events (invariant #11).
- [x] **Payment/payout** N/A; webhook posture explicitly preserved (invariant #8).
- [x] Refund policy untouched (invariant #10).
- [x] Timezone untouched (invariant #6); session timestamps are framework-owned epoch millis.
- [x] Booking codes: error bodies stay redacted (`ApiProblem` by construction) (invariant #7).
- [x] Flyway V19 present; `initialize-schema=never` (invariant #12).
- [x] **Frontend** standards met; no `as any` on the contract.
- [x] Execution-status table at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

## riviera-docs-freshness smoke run (AC-12)

Range: `origin/main...HEAD` (+ working tree), 2026-07-02 — the skill's first run, against
this slice's own diff. Findings:

1. `.claude/skills/riviera-frontend/SKILL.md:20` — core/ example cited the deleted
   `operator-auth.interceptor.ts` — contradicted by the FE interceptor swap — **patched**
   (now `api-session.interceptor.ts`).
2. `frontend/e2e/real-backend/support/operator.ts:4` + `venue-editor.e2e.ts:22` — stale
   `InMemoryUserDetailsManager` comments (that bean died in #74; the login is now the
   session flow) — **caught while still outstanding; patched by Phase 6** (the known
   seeded target — the skill found it independently).
3. `docs/architecture/auth-signin-register.md:55` — "The **current** FE `OperatorAuth`
   (raw password … Basic per request) is retired by this epic" — tense stale once S1
   ships — **patched** ("retired — done by S1 (#109)"), decision substance untouched.

Checked clean: `CLAUDE.md` operator note (mechanism-agnostic wording holds),
`CONTEXT.md` (no Basic-auth statements; bootstrap-operator entry still true),
`RESPONSIBILITIES.md` (edge/UserDetailsService Not-My-Job line still true), ADRs,
`docs/architecture/improvement-plan.md` (A1's `InMemoryUserDetailsManager` mention is
historical design narrative, in scope-discipline exempt).

## Review-gate record

**Run:** `riviera-review-overlay` + `/code-review` HIGH effort (authorization touched) over
`origin/main...HEAD`, PR #127, 2026-07-02. 8 finder angles (line-by-line, removed-behavior,
cross-file, reuse, simplification, efficiency+altitude, conventions, security, test-quality) →
verify. Skills reloaded per fix: `riviera-java-conventions` (BE test/config fixes),
`angular-developer` (FE `failWrite`/message-helper), `riviera-frontend` (FE placement) —
Skill-routing gate re-run on the fix diff.

**CI-red diagnosis (before review findings):** the full-suite CI backend job failed with 19
tests 429ing — the new login rate limiter (D-8) accumulates every MockMvc login from the same
default client IP across the cached Spring contexts in one JVM, exceeding 10/min mid-run (the
local scoped batches never did). Fixed by presenting a unique `X-Forwarded-For` per test login
(`SessionLoginSupport.uniqueClientIp()` + the direct-login ITs) — the limiter's own keying
dimension (f7704db).

**Findings fixed in-loop (985dbc7):**
1. *(3 finders, CONFIRMED)* VenueEditor mid-flow 401 didn't clear the session → operator stranded
   on the signed-in card. Now routes write failures through `failWrite`, which calls
   `sessionLost()` on 401 (matches StaffDaily); message → "session has expired". Spec updated to
   pin the re-rendered sign-in form.
2. *(test-quality, CONFIRMED)* `CsrfProtectionIT` guest-exemption tests used wrong DTO field names
   (`date`/`customer`) → 400 not the claimed domain 404; corrected to `bookingDate`/`contact`,
   now assert 404 (request reaches the domain un-CSRF-gated).
3. *(test-quality, CONFIRMED)* `SessionPersistenceIT` didn't prove the DB row is load-bearing;
   added delete-row-then-401 so a hypothetical in-memory cache over the store would fail (AC-4).
4. *(reuse, Major)* `signInFailureMessage()` extracted to `core/operator-auth.ts`; VenueEditor +
   StaffDaily consume it (was a verbatim duplicated switch).

**Verified as false positive (REFUTED on inspection — no change):**
- "Expired-session cleanup only runs under the `stripe` profile → unbounded growth." I wrote the
  fix (`@EnableScheduling` config + a scheduling IT), and the IT revealed the premise was wrong:
  scheduling is already on in the default profile (Modulith Moments), *and* more fundamentally
  `JdbcIndexedSessionRepository.afterPropertiesSet()` starts its **own** `ThreadPoolTaskScheduler`
  for cleanup (disabled only by cleanup-cron `"-"`), independent of `@EnableScheduling`. Cleanup
  runs by default; the redundant config + test were backed out.
- Login-path `%2F` encoding bypass → Spring's `StrictHttpFirewall` rejects encoded slashes (400)
  before any filter.
- First-login CSRF race → both surfaces gate the sign-in form behind `restoring()`, which only
  clears after `GET /api/auth/me` seeds the XSRF cookie.

**Deferred to follow-up issues (out of scope for S1 / broad):**
- **#128** — session revocation on operator suspend / password rotation / robust logout (a live
  session outlives suspension; logout swallows failures). Belongs with S6 operator-lifecycle
  (#115). `PerOperatorLoginIT` lost its request-time-suspension assertion in migration (no
  per-request re-check under sessions, by design) — replacement coverage lands with the fix.
- **#129** — trusted-proxy allowlist for the login limiter (XFF is client-spoofable; same
  pre-existing R-2 trust model as #56); travels with the S7 hosting/ADR-0004 work.
- **#130** — machine/CLI auth for admin + actuator after Basic retirement (BKT payout runbook;
  monitoring health-details probe).
- **#110 (S7, pre-existing)** — deployed cross-site cookie: `SameSite=Lax` + GitHub-Pages→Render
  is cross-site, so the deployed operator surface needs S7's same-origin hosting before it works
  in the cloud. Already tracked (S7's own scope note says S1 is only cloud-demoable once S7 lands);
  local dev + real-backend e2e are same-site and pass.

**Accepted with rationale (no change):** the webhook-no-signature-header 500 (pre-existing, noted
in the PR); the `SecurityProblemResponses` vs `RateLimitFilter` problem-JSON duplication and the
LOGIN_PATH triple-literal (real drift risks but a shared-builder/constant refactor is broader than
this slice warrants — the security control is pinned by tests either way; left as quality debt).

## Sonar-gate record

Filled at the Sonar gate (new issues, coverage on new code, resolutions).
