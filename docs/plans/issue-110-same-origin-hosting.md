# Same-origin FE/BE hosting (Spring Boot serves the SPA, single image) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Operator sign-in works in the deployed sandbox: the frontend and `/api/**` are
served from **one origin**, so the S1 session/CSRF cookie model (issue #109) functions in
every browser — proven by a sandbox sign-in that reaches the credential check (401 branch)
instead of dying at CSRF (403).

**Architecture:** **Spring Boot serves the built Angular app itself.** The SPA is compiled
in a Node stage of `platform/Dockerfile` and baked into the jar's `classpath:/static/`, so
the **single existing backend web service** (`riviera-sunbed-booking.onrender.com`) serves
both the SPA shell and `/api/**` from one origin. The browser then sees `SESSION` and
`XSRF-TOKEN` as **first-party host-only cookies** — the `document.cookie` cookie-to-header
echo in `api-session.interceptor.ts` works again with **no auth-code change** (`.spa()`
CSRF + `SameSite=Lax` cookies are already correct; they only needed same-origin). GitHub
Pages and the Render static site are both **retired**; CD collapses to the backend deploy
that already exists.

> **Why not the static-site rewrite-proxy (the original design)?** Phase 0's R-1 probe
> **falsified** it: a Render **static site** cannot reverse-proxy `/api/*` to another
> `*.onrender.com` service — the rewrite matches but returns an **empty `200`** that never
> reaches the backend (verified: backend direct = `200` + venue JSON; proxied = `200`,
> `Content-Length: 0`, `cf-cache-status: MISS`, no backend headers). Confirmed against
> Render docs + community reports. The gate did its job — caught before any repo change.
> Full evidence in the Generalization-audit log. Alternatives weighed: a Caddy/nginx proxy
> **web service** (works, but adds a running service) and a custom domain with `app.`/`api.`
> subdomains (needs a domain — plan non-goal). Spring-serves-SPA wins for a **dev/demo**
> env: one service, no new infra, guaranteed same-origin.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — no Flyway
version claimed, no collision possible.

**Source of intent:** GitHub issue #110 (epic #108 slice S7); design
`docs/architecture/auth-signin-register.md` D-7; ADR-0004 (amended by this slice).
Diagnosis evidence (2026-07-07 live repro): login POST from the Pages origin → 403
`INVALID_CSRF_TOKEN` before credentials are evaluated; guest booking/webhook paths are
unaffected because they are deliberately CSRF-exempt (`SecurityConfig`).

**Skills consulted:** `riviera-sdlc` (issue-intake grill of #110; routed the pivot back to
Plan after the R-1 gate), `riviera-plan-doc` (this template), `riviera-modulith`
(SPA-serving is an **app-wide web concern** → root package `ai.riviera.platform` next to
`SecurityConfig`/`WebCorsConfig`, **not** a bounded context, so `ModularityTests` stays
green), `riviera-java-conventions` (the new web config/second-filter-chain Java: constructor
injection, package-private, no magic literals, records where they fit), `riviera-frontend`
(environment rules: public values only, deploy-time values from config not committed edits,
empty-keys-fail-loudly; `core/` interceptor/auth untouched), `riviera-local-debug` (scoped
build/test recipe; local `./gradlew` self-provisions), `grilling` (intake). No `postgres`
(no SQL), no `riviera-stripe-payments` (the Stripe **publishable** key only relocates to the
Node build stage; the payment model is untouched).

**Branch:** `feature/issue-110-same-origin-hosting` (the designated remote branch stands in
for the literal `feature/<slug>` per the riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

> This is a hosting slice whose "application boundary" is partly the deployed environment.
> ACs that CI *can* pin (the security carve-out, the SPA fallback) get a named test class;
> ACs that are inherently deploy-time (cross-browser same-site cookie behaviour) name the
> post-deploy checklist item. The mocked CI e2e suite is origin-agnostic by design, so an
> origin change is invisible to it — that is expected, not a gap.

- [ ] **AC-1 (session works end-to-end):** Given the deployed sandbox on the backend origin,
  when the operator signs in at `/operator/1` with valid credentials, then the console loads
  and a subsequent `GET /api/auth/me` returns the principal (session cookie persisted).
  *Pinned by:* post-deploy checklist V-1 — Chrome + Firefox + Safari (Safari is the ITP case).
- [ ] **AC-2 (CSRF echo reaches the backend):** Given the backend origin, when a sign-in is
  submitted with a **wrong** password, then the form shows the credential error ("Sign-in
  failed. Check your username and password." — the 401 branch), **not** the generic error
  (the 403 CSRF branch observed 2026-07-07). *Pinned by:* post-deploy checklist V-2. The
  sharpest single regression probe for the whole slice.
- [ ] **AC-3 (SPA deep links served by the backend):** Given a fresh browser, when it
  navigates directly to `https://riviera-sunbed-booking.onrender.com/operator/1`, then the
  app boots (Spring serves `index.html` for the non-`/api` path) and no hard 404 is served.
  *Pinned by:* `SpaShellIT` (`GET /operator/1` → 200 `text/html` index shell) + post-deploy V-3.
- [ ] **AC-4 (the secured API is unchanged):** Given the SPA shell is now public, when an
  anonymous client hits a protected path, then authorization is **identical to before this
  slice** — `GET /api/auth/me` → 401, operator write paths → 401, `GET /api/venues/**` → 200,
  actuator hardening intact, and an unknown `/api/**` path → 401 anonymous (not the SPA
  shell). *Pinned by:* `SpaShellIT` + the existing `AuthSessionIT` / `ActuatorHardeningIT` /
  `CrossVenueDenialIT` staying green.
- [ ] **AC-5 (SPA shell is public):** Given an anonymous browser, when it requests `/`, a
  hashed asset (`/main-*.js`), or a deep-link route, then all return 200 (shell/asset), never
  401 — while `/api/**` keeps its per-endpoint rules. *Pinned by:* `SpaShellIT`.
- [ ] **AC-6 (single deploy on green CI):** Given a green CI run on `main`, when CD evaluates,
  then only the **backend** service deploys (it now carries the SPA); no separate frontend
  deploy exists. A red CI run deploys nothing. *Pinned by:* `deploy.yml` (frontend-pages job
  removed; backend gate unchanged) + Render deploy list.
- [ ] **AC-7 (tourist flows unaffected):** Given the backend origin, when a tourist browses
  venues, opens a beach map, and views a booking by code, then all succeed (session-free /
  CSRF-exempt paths; only the origin changed). *Pinned by:* post-deploy V-4 + the existing
  origin-agnostic CI e2e suite (still green).
- [ ] **AC-8 (image bundles the SPA):** Given `docker build` of `platform/Dockerfile` from
  the repo root, when the image runs, then `GET /` returns the Angular `index.html` and
  `GET /api/venues` returns backend JSON from the same container. *Pinned by:* the local
  image smoke check (Phase 3) + the deployed V-1..V-4.
- [ ] **AC-9 (docs current):** ADR-0004 amended (dev env = Spring serves SPA single image;
  same-site as a prod-hoster selection criterion); `docs/deploy/cd-pipeline.md` rewritten for
  the single-image frontend path **including the pre-existing drift fix** (the CORS override
  env var is `CORS_ALLOWED_ORIGINS`, not `APP_WEB_CORS_ALLOWED_ORIGINS`); `CLAUDE.md`
  deployed-URL line updated. *Pinned by:* review gate + `riviera-docs-freshness` at close-out.
- [ ] **AC-10 (no secrets committed):** No secret enters the repo; the Stripe **publishable**
  key stays a Render build env var (public `pk_…` value). *Pinned by:* review gate diff scan.

## Non-goals

- **No production/DSGVO hosting move** — the same-image approach is dev/demo-only; the
  same-site requirement is recorded as a *selection criterion* for the future EU hoster (ADR
  amendment), not implemented (issue #110 scope note).
- **No auth-model change** — `SecurityConfig`'s CSRF `.spa()`, the session cookie flags
  (`Secure`, `SameSite=Lax`), and `api-session.interceptor.ts` are all correct once
  same-origin; none of their **behaviour** changes. The only `SecurityConfig` edit is
  splitting the API rules from a new public-SPA-shell chain — the API authorization set is
  copied verbatim (AC-4).
- **No custom domain** and **no separate proxy service** (both weighed and rejected above).
- **No retirement of the owns-all bootstrap operator** — that is S6 (#115).
- **No change to the mocked e2e suite** — it is origin-agnostic by design.
- **No committing built SPA assets** — the SPA is produced at image-build time;
  `src/main/resources/static/` stays empty in the repo (a `.gitkeep` only).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The static-site rewrite-proxy can't reach the backend (empty 200) | — | — | **Materialised & closed:** Phase 0 probe proved it; pivoted to Spring-serves-SPA. Evidence in the Generalization-audit log | agent | resolved (Phase 0) |
| R-2 | Making the SPA shell public accidentally widens the **API** surface (an `/api` path becomes reachable anonymously) | med | **high** | Two filter chains: chain 1 `securityMatcher("/api/**","/actuator/**")` keeps the **verbatim** current rule set incl. `anyRequest().authenticated()`; chain 2 (SPA) permits only non-API paths. Pinned by AC-4/AC-5 tests + the existing security ITs staying green | agent | open |
| R-3 | The SPA fallback swallows unknown `/api/**` as `index.html` (200 HTML instead of 404/401) | med | med | The `PathResourceResolver` returns `null` (→ not-found) for `api/`+`actuator/` prefixes; chain-1 auth still fires first for anonymous. Pinned by AC-4 "unknown /api → 401" test | agent | open |
| R-4 | Docker build context: `frontend/` is outside the current `platform/` context, so the SPA can't be copied into the jar | high | high | Widen the backend service's build context to the **repo root** (root dir → empty, Dockerfile path → `platform/Dockerfile`); Dockerfile COPYs become repo-root-relative. Ready-for-human on the Render service. Pinned by AC-8 local image build | agent+maintainer | open |
| R-5 | Base-href regression: the SPA is served from `/` (not the Pages subpath) — a stale `--base-href` breaks asset URLs | med | med | The Node build stage builds with default base-href `/` (no flag); V-3 deep-link check catches a regression | agent | open |
| R-6 | Empty CORS origin list breaks bean wiring (`WebCorsConfig` binds `[""]` from an empty property) | med | med | Make `WebCorsConfig` filter blank entries and register CORS only when ≥1 origin remains; default `CORS_ALLOWED_ORIGINS` empty. Local dev (`:4200→:8080`) keeps its origins via the `dev` profile. Pinned by a `WebCorsConfig` unit test | agent | open |
| R-7 | Backend cold start now also delays the **first SPA load** (the JVM serves the shell) | high | low | Inherent to one-service hosting on the free tier; unchanged wake time, just now also the first HTML. Note in `cd-pipeline.md`; accepted for a demo | — | accepted |
| R-8 | Local `bootRun`/tests have no bundled SPA (only the Docker build injects it) → `GET /` 404 locally | high | low | Expected: local dev uses the Angular dev server (`:4200`). Tests use a stub `index.html` under `src/test/resources/static/`. Documented in the Dockerfile + plan | agent | open |
| R-9 | The full test suite exercises the new filter chain cumulatively (shared-state class, per riviera-local-debug) | low | med | The SPA chain adds no stateful bean (no filter/limiter/scheduler); the rate-limit filter is unchanged and stays in chain 1. Verify on the push's CI run | agent | open |

**Error-contract note:** no DTO or endpoint changes; the 403 `INVALID_CSRF_TOKEN`
`ProblemDetail` shape stays as-is (it simply stops firing for legitimate clients). The SPA
fallback serves HTML for non-API paths; API error contracts (`ApiErrorHandler`) are untouched.

## Open questions / Assumptions

- **Resolved (Phase 0):** static-site name/URL question — moot; the static site is retired.
  Pages afterlife — **disable** (Ivo, this session).
- **Assumption:** the backend service's Docker build context can be widened to the repo root
  via the Render dashboard (root dir + Dockerfile path); the MCP `update_web_service` does not
  expose these, so it is a **ready-for-human** step. — *Owner:* maintainer · *Resolves by:* Phase 3.
- **Assumption:** `STRIPE_PUBLISHABLE_KEY` (a `pk_…` public value) is consumed by the Node
  build stage as a Render **backend-service** build env var (moved off the GitHub Actions
  variable, which the backend never used). — *Owner:* agent/maintainer · *Resolves by:* Phase 3.
- **Assumption:** baking the SPA into `classpath:/static/` + Spring's default resource
  handling serves it correctly with the `PathResourceResolver` fallback for deep links.
  Verified by `SpaShellIT` + the local image smoke check before cutover. — *Owner:* agent ·
  *Resolves by:* Phase 3.

## Availability & concurrency (invariant #2)

N/A — hosting slice; no write path to `availability(set_id, booking_date)` is added, removed,
or re-routed. The same backend endpoints serve the same requests; only the SPA's origin
changed (to the backend's own).

## Spring Modulith — modules, interfaces, events

**No bounded-context module changes.** SPA-serving is an **app-wide web concern**, so per
`riviera-modulith` it lives in the **root package** `ai.riviera.platform` alongside
`SecurityConfig`/`WebCorsConfig`/`TimeConfig` — the root is **not** a module, so
`ApplicationModules.verify()` (`ModularityTests`) is unaffected. New/edited root-package
types:

- `SpaWebConfig` (new) — a `WebMvcConfigurer` registering the `classpath:/static/` resource
  handler with a `PathResourceResolver` that falls back to `index.html` for non-`api`/
  non-`actuator` paths (deep-link support). Package-private.
- `SecurityConfig` (edit) — split into two `SecurityFilterChain` beans: `@Order(1)` API chain
  (`securityMatcher("/api/**","/actuator/**")`, current rules verbatim), `@Order(2)` SPA chain
  (permit the shell, CSRF disabled for static GETs).
- `WebCorsConfig` (edit) — tolerate an empty/blank origins list (register CORS only when ≥1).

### Module ownership (§4a)

No module behaviour added or moved; all edits are root-package web/config + deploy config +
frontend build + docs. No boundary change, no `allowedDependencies` change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope. The Stripe **publishable** key (public by definition) changes
injection point only: GitHub Actions build env → the backend image's Node build stage env. The
webhook path stays CSRF-exempt and signature-verified (invariant #8), untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `environments/environment.prod.ts` | existing | env config | n/a | n/a |

No component, service, route, or interceptor changes. `environment.ts` (dev) is untouched —
local dev stays `localhost:4200` → `localhost:8080` (cross-origin, `dev`-profile CORS). The
prod build is produced by the Dockerfile's Node stage with `apiBaseUrl: ''` and default
base-href `/`.

## FE↔BE contract

N/A — no endpoint, DTO, or wire-shape change. All paths (`/api/**`) are identical; the browser
now addresses the backend's own origin for both the app and the API.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Probe the static-site approach (R-1 gate) | ✅ | (falsified; pivoted — see audit log) |
| 1 — Backend: SPA-serving + security carve-out + CORS (test-first) | | |
| 2 — Dockerfile (Node stage, repo-root context) + frontend env + CD + docs | | |
| 3 — Render reconfig + deploy + sign-in probe + Pages/static-site retirement + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window
as each phase's change.

---

## File structure

- `platform/src/main/java/ai/riviera/platform/SpaWebConfig.java` — **new**; resource handler +
  `PathResourceResolver` SPA fallback.
- `platform/src/main/java/ai/riviera/platform/SecurityConfig.java` — split into the API chain
  (rules verbatim) + the public SPA-shell chain.
- `platform/src/main/java/ai/riviera/platform/WebCorsConfig.java` — empty-origins tolerance.
- `platform/src/main/resources/application.properties` — `app.web.cors.allowed-origins`
  default → empty.
- `platform/src/main/resources/static/.gitkeep` — **new**; keeps the (empty) static dir; the
  SPA is injected at image build.
- `platform/src/test/resources/static/index.html` — **new**; stub shell so `SpaShellIT` can
  assert the fallback without a real FE build.
- `platform/src/test/java/ai/riviera/platform/SpaShellIT.java` (or `@WebMvcTest` slice) — the
  AC-3/4/5 pins.
- `platform/Dockerfile` — Node build stage + repo-root COPYs; SPA into `static/` before `bootJar`.
- `frontend/src/environments/environment.prod.ts` — `apiBaseUrl: ''`.
- `.github/workflows/deploy.yml` — remove `frontend-pages`; backend job unchanged.
- `docs/adr/0004-non-prod-hosting-render-neon-pages.md` — amended.
- `docs/deploy/cd-pipeline.md` — rewritten frontend section + env-var-name drift fix.
- `CLAUDE.md` — deployed-URL line.
- Render (not in repo): backend service root dir → repo root, Dockerfile path →
  `platform/Dockerfile`, add `STRIPE_PUBLISHABLE_KEY` build env; delete the two static sites;
  disable Pages; set backend `CORS_ALLOWED_ORIGINS` empty (ready-for-human list, Phase 3).

---

## Phase 1 — Backend: SPA-serving + security carve-out + CORS (test-first)

**Files:** `SpaWebConfig.java` (new), `SecurityConfig.java`, `WebCorsConfig.java`,
`application.properties`, `src/main/resources/static/.gitkeep`,
`src/test/resources/static/index.html`, `SpaShellIT.java` (new).

- [ ] **Step 1 (red): `SpaShellIT`** pinning: `GET /` → 200 `text/html` (the stub shell);
  `GET /operator/1` → 200 shell (deep-link fallback); `GET /main-x.js` for a missing asset →
  shell (SPA fallback tradeoff, documented); `GET /api/auth/me` anonymous → 401;
  `GET /api/venues` anonymous → 200; `GET /api/does-not-exist` anonymous → 401 (**not** the
  shell — R-3). Use a stub `src/test/resources/static/index.html`.
- [ ] **Step 2 (green): `SpaWebConfig`** — `WebMvcConfigurer#addResourceHandlers` on `/**` →
  `classpath:/static/`, `PathResourceResolver` returning the requested resource if it exists,
  else `index.html`, except returns `null` for `resourcePath` starting `api/` or `actuator/`.
- [ ] **Step 3 (green): `SecurityConfig`** — two chains: `@Order(1)`
  `securityMatcher("/api/**","/actuator/**")` carrying the **current** cors/rate-limit/csrf/
  authorizeHttpRequests/logout/exceptionHandling **verbatim**; `@Order(2)` SPA chain —
  `authorizeHttpRequests(anyRequest().permitAll())`, `csrf.disable()` (static GETs). Confirm
  the existing security ITs pass unchanged (AC-4).
- [ ] **Step 4: `WebCorsConfig` + `application.properties`** — filter blank origins; register
  CORS only when the list is non-empty; default `app.web.cors.allowed-origins=${CORS_ALLOWED_ORIGINS:}`.
  A `WebCorsConfig` unit test covers empty → no cross-origin caller, non-empty → allowlisted.
- [ ] **Step 5:** scoped tests (structural net + `SpaShellIT` + touched security ITs); update
  Execution status in the same commit window.

## Phase 2 — Dockerfile + frontend env + CD + docs

**Files:** `platform/Dockerfile`, `frontend/src/environments/environment.prod.ts`,
`.github/workflows/deploy.yml`, ADR-0004, `docs/deploy/cd-pipeline.md`, `CLAUDE.md`.

- [ ] **Step 1: `environment.prod.ts`** — `{ production: true, apiBaseUrl: '',
  stripePublishableKey: '' }`; comment: same-origin; `apiBaseUrl:''` → relative `/api/**`;
  key injected by the image build.
- [ ] **Step 2: `Dockerfile`** (repo-root context) — add `FROM node:<lts> AS web`: `COPY
  frontend/ frontend/`, `cd frontend && npm ci && npm run build` (default base-href `/`,
  `stripePublishableKey` from `$STRIPE_PUBLISHABLE_KEY`). In the JDK build stage: `COPY
  platform/ ...`, then `COPY --from=web /…/dist/frontend/browser
  platform/src/main/resources/static/` **before** `bootJar`. Adjust every COPY to
  repo-root-relative. Comment the required Render root-dir/context reconfig.
- [ ] **Step 3: `deploy.yml`** — delete the `frontend-pages` job (Node setup, npm build,
  env-rewrite, 404.html, Pages configure/upload/deploy, `pages`/`id-token` permissions, the
  `github-pages` environment). Backend job + green-CI gate unchanged; it now ships the SPA.
- [ ] **Step 4: Docs** — ADR-0004 amendment (dev = Spring serves SPA single image; **why**
  the static-site proxy was rejected — R-1 evidence; the prod-hoster same-site criterion);
  `cd-pipeline.md` frontend section rewritten (single-image build, no separate FE deploy; new
  build env `STRIPE_PUBLISHABLE_KEY` on the backend service; retire `DEPLOY_FRONTEND_PAGES` +
  `BACKEND_API_URL`; **fix the drift** — CORS env var is `CORS_ALLOWED_ORIGINS`); `CLAUDE.md`
  deployed-URL line (frontend now at the backend origin).
- [ ] **Step 5:** run the generalization-audit grep (`APP_WEB_CORS` / `ivopogace.github.io`)
  and fold every hit into the docs commit; update Execution status.

## Phase 3 — Render reconfig + deploy + probe + retirement + close-out

- [ ] **Step 1: Ready-for-human on #110** — backend service: root dir → **(empty / repo
  root)**, Dockerfile path → `platform/Dockerfile`, add build env `STRIPE_PUBLISHABLE_KEY`
  (`pk_test_…`), set `CORS_ALLOWED_ORIGINS` empty. Add GitHub: nothing new (backend deploy
  hook already wired). Exact clicks provided at execution.
- [ ] **Step 2: Local image smoke (AC-8)** — `docker build -f platform/Dockerfile .` from the
  repo root; `docker run` → `GET /` serves the shell, `GET /api/venues` serves JSON. (If Docker
  is unavailable in-session, defer to the deployed check and say so.)
- [ ] **Step 3: Merge → green CI → CD** deploys the backend (now with the SPA). Confirm the
  health poll passed.
- [ ] **Step 4: Post-deploy verification** (final section) V-1..V-4 — V-1/V-2 in Chrome
  (agent, browser automation) **and** Firefox + Safari (maintainer; Safari is the ITP case).
- [ ] **Step 5: Retire** — delete the `riviera-ai` + `riviera-q5hs` static sites; disable
  GitHub Pages; remove retired GH variables.
- [ ] **Step 6: Close-out** (riviera-sdlc merge checklist): `riviera-docs-freshness` over the
  merge range; update the agent-memory deployed-URL note; `graphify update .`; close #110 with
  evidence; comment on epic #108 (S7 unblocks cloud demos of S1+) and epic #141 (O-slice
  sandbox verification unblocked).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-07 | plan (intake grill) | docs naming the wrong CORS env var or the Pages origin | `grep -ri "APP_WEB_CORS\|ivopogace.github.io" docs/ CLAUDE.md README.md` | to run in Phase 2 step 5 | fold every hit into the docs commit |
| 2026-07-09 | Phase 0 R-1 probe | can a Render static site reverse-proxy `/api/*` to a `*.onrender.com` backend? | curl proxied vs direct `/api/venues`; Render docs + community search | **empty-200, never reaches backend** — static-site external rewrite-proxy does not work for this; pivoted to Spring-serves-SPA (Option 1) | replan; this doc rewritten |

---

## Acceptance-criteria verification (final)

Post-deploy checklist — run after Phase 3 step 3, record evidence (screenshot / curl output
+ date) per item:

- [ ] **V-1 (AC-1):** Sign in at `https://riviera-sunbed-booking.onrender.com/operator/1` with
  the real credential → console renders; `GET /api/auth/me` (devtools) → 200 principal.
  Chrome + Firefox + Safari.
- [ ] **V-2 (AC-2):** Sign in with a wrong password → "Sign-in failed. Check your username and
  password." (not the generic error). Repeat to confirm the login rate limiter still keys sanely.
- [ ] **V-3 (AC-3):** Fresh incognito navigation to `…/operator/1` and `…/venues/1` → app boots,
  no 404.
- [ ] **V-4 (AC-7):** Tourist smoke on the backend origin: home loads venue list, beach map
  renders, `booking/:code` view for a known code works.
- [ ] **AC-6:** Render backend deploy list shows the deploy; no separate frontend deploy exists.
- [ ] **AC-8/AC-9/AC-10:** image smoke (Phase 3 step 2) + review gate (docs, no secrets).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying step.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] **No JPA** introduced (invariant #1) — persistence untouched.
- [ ] **Availability** section justified N/A (invariant #2 unaffected).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section: SPA-serving in the **root package**, not a module; `ModularityTests`
  green; no cross-module import (invariant #11).
- [ ] **API authorization set copied verbatim** into the API filter chain — no path silently
  opened (AC-4). Second chain permits only non-`/api` shell paths.
- [ ] **Payment/payout** justified N/A; publishable key stays public-only (invariant #5/#8 posture unchanged).
- [ ] Refund policy untouched (invariant #10). Timezone (invariant #6) & booking codes (invariant #7) untouched.
- [ ] No schema change → no Flyway migration (invariant #12).
- [ ] **Frontend** env rules honored (public values only; deploy-time key from build env, not committed).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
