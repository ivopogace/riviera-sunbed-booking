# CD Pipeline — Deploy to Render + Neon + GitHub Pages (non-prod) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed).
> Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline:** this is a **devops / infrastructure** slice. The booking
> domain (availability, payment, payout) is not touched, so those sections are an
> explicit, justified `N/A`. The one live invariant here is **#1 (JDBC-only — the
> Dockerfile must not pull in JPA)** and the cross-cutting rule that **no credential
> is ever committed** (datasource + deploy creds come only from ENV / GitHub secrets).

**Goal:** On a green CI run on `main`, automatically deploy the Angular frontend to
GitHub Pages and the Dockerized Spring Boot backend to Render (backed by Neon
Postgres), such that the backend's `/actuator/health` returns `UP` and the Pages
site loads and can reach the backend — a tracer-bullet deploy, never from a red build.

**Architecture:** A **separate `deploy.yml` workflow gated on `workflow_run` of the
`CI` workflow** (`conclusion == success`, `head_branch == main`) is the single most
significant decision — it guarantees a red build never deploys (invariant for AC-5)
and keeps deploy concerns out of the required-status-check CI workflow. Backend
deploys are triggered via a **Render deploy hook** (Render git-builds the multi-stage
`Dockerfile`); the frontend publishes via the **official GitHub Pages Actions**.

**Persistence:** JDBC only (invariant #1). No migrations are added by this slice; the
existing empty `V1__baseline.sql` applies on boot. The Dockerfile must not introduce
any JPA starter — it only assembles the existing `bootJar`.

**Source of intent:** GitHub issue **#33** ([F6] CD pipeline) + the pre-plan
reconciliation comment on it.

**Branch:** `feature/cd-pipeline` (exists).

---

## Acceptance criteria (testable)

> Most ACs here are verified by **CI/workflow execution + a live HTTP probe** rather
> than a JUnit/Vitest class — this is infra. Where a unit test is the right pin
> (CORS config, the FE health service), one is named.

- [ ] **AC-1:** Given a green CI on `main`, when `deploy.yml` runs, then the backend
  image builds and deploys to Render and `GET https://<render-host>/actuator/health`
  returns `200` with `{"status":"UP"}`. *Pinned by:* the `backend-render` job's
  post-deploy health-poll step (fails the job if not `UP` within the timeout).
- [ ] **AC-2:** Given the deployed backend, when it boots, then it connects to **Neon**
  and **Flyway runs** (baseline `V1` applied; `flyway_schema_history` populated). Since
  overall actuator health `UP` requires the auto-registered `db` health indicator to be
  `UP`, AC-1's green health transitively proves DB connectivity. *Pinned by:* the same
  health-poll step (`status == UP` ⟹ datasource reachable) + Render boot logs.
- [ ] **AC-3:** Given a green CI on `main`, when `deploy.yml` runs, then the Angular app
  builds with `--base-href=/riviera-sunbed-booking/` and publishes to **GitHub Pages**;
  `GET https://ivopogace.github.io/riviera-sunbed-booking/` returns `200` and a deep
  link (`/riviera-sunbed-booking/booking`) does **not** 404 (SPA `404.html` fallback).
  *Pinned by:* the `frontend-pages` job (build asserts `dist/frontend/browser/index.html`
  + a copied `404.html`) and the official `deploy-pages` step's published URL.
- [ ] **AC-4:** Given the deployed frontend, when the home page loads, then it issues a
  cross-origin `GET <apiBaseUrl>/actuator/health` that **succeeds** (correct API base URL
  + backend CORS allows the Pages origin) and renders the backend status. *Pinned by:*
  `HealthService` unit test (`health.service.spec.ts`) for the client wiring; CORS
  proven live against the deployed origin.
- [ ] **AC-5:** Given the repo, when the tree is scanned, then **no deploy/datasource
  credential is committed** — all come from GitHub secrets/variables — and `deploy.yml`
  is **gated on CI success** (`workflow_run` + `conclusion == 'success'`). *Pinned by:*
  review of the diff (`git grep` for secret patterns) + the workflow's trigger/`if`.
- [ ] **AC-6:** Given `docs/adr/`, an ADR (**0004**) documents the Render+Neon+Pages
  non-prod choice and the plan to move to DSGVO-conform hosting before PROD. *Pinned by:*
  file presence + content review.

## Non-goals

- **DSGVO-sovereign PROD hosting** (Hetzner/Scaleway/Clever Cloud) — separate follow-up.
- Custom domains, blue-green / zero-downtime deploys, autoscaling.
- Secret management beyond GitHub Actions secrets/variables.
- Multi-environment promotion (staging → prod) — single non-prod target.
- Feature endpoints / real booking calls — only `/actuator/health` exists; FE↔BE is a
  **health smoke-ping** tracer bullet.
- Automatically creating the Render/Neon accounts or enabling Pages — maintainer-only
  (ready-for-human checklist on the PR).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A red CI build deploys broken code | low | high | `workflow_run` trigger + `if conclusion == 'success' && head_branch == 'main'`; deploy is a *separate* workflow, not a CI step | agent | open |
| R-2 | A credential is committed to the public repo | low | high | datasource + deploy creds only via GitHub secrets/vars; `.dockerfile`/workflow reference `secrets.*`; pre-merge `git grep` scan; no `application-prod.properties` with creds | agent | open |
| R-3 | `deploy.yml` runs before maintainer wires accounts → red X on `main` | med | low | gate each deploy job on an opt-in repo **variable** (`DEPLOY_BACKEND_RENDER`, `DEPLOY_FRONTEND_PAGES`); until set, jobs no-op green (mirrors the existing `SONAR_TOKEN` skip pattern) | agent | open |
| R-4 | JDK 25 Temurin base-image tag unavailable on Render build | low | med | use `eclipse-temurin:25-jdk`/`25-jre` (GA since 2025-09); confirm on first Render build; fallback to `25.0.x` explicit tag | maintainer | open |
| R-5 | Angular SPA deep-link 404s on Pages (no server rewrite) | med | med | copy `index.html` → `404.html` in the build job (GitHub Pages serves `404.html` for unknown paths; the SPA router takes over) | agent | open |
| R-6 | Wrong `--base-href` breaks asset URLs under the repo subpath | med | med | build with `--base-href=/riviera-sunbed-booking/`; dry-run confirmed `<base href>` is correct | agent | resolved (recon dry-run) |
| R-7 | Neon requires SSL; datasource URL without `sslmode=require` fails to connect | med | med | document the `jdbc:postgresql://…?sslmode=require` form in the ADR + secrets doc; surfaced by AC-2 health probe | maintainer | open |
| R-8 | Render free instance cold-starts; post-deploy health poll times out | med | low | poll with generous retry/backoff (up to ~5 min) before failing the job | agent | open |

## Open questions / Assumptions

- **Assumption:** GitHub Pages user/site origin is `https://ivopogace.github.io` and the
  project path is `/riviera-sunbed-booking/` (repo name). — *Owner:* agent · *Resolves by:* first Pages deploy.
- **Assumption:** The Render service is reachable at a host the maintainer supplies via
  repo variable `BACKEND_API_URL` (e.g. `https://riviera-sunbed-booking.onrender.com`);
  the committed FE prod default uses that value and is overridable at build time. —
  *Owner:* maintainer · *Resolves by:* Render service creation.
- **Open question:** None blocking — all remaining unknowns are maintainer account/secret
  wiring, tracked in the PR's ready-for-human checklist.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice ships no booking, beach-map, or
`availability` code; it deploys the existing scaffold. No write path to
`availability(set_id, booking_date)` is added or changed.

## Spring Modulith — modules, interfaces, events

**Mostly N/A — infra slice.** No new module, `api/` port, or domain event. The only
backend *code* change is a root-level **CORS configuration** (a web concern in the
application root package alongside the existing `SecurityConfig`, not inside any
bounded context) and a `server.port`/datasource binding via `application.properties`
(env-driven, no creds). No cross-module imports are introduced;
`ApplicationModules.verify()` is unaffected.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves; no Stripe, ledger, or refund code.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/environments/environment.ts` + `environment.prod.ts` | new | config | n/a | n/a |
| FE-2 | `src/app/core/health.service.ts` | new | injectable service | returns the health probe result | n/a |
| FE-3 | `src/app/app.ts` (home) backend-status line | modified | standalone component | Signal from the health probe | n/a |

**Standards:** standalone components, `inject()`, `@if` control flow, signals. The
health probe uses `HttpClient` via a thin service (testable with
`provideHttpClientTesting`). API base URL comes from the environment file
(`fileReplacements` for production), never hard-coded inline.

## FE↔BE contract

- **Endpoint consumed:** `GET <apiBaseUrl>/actuator/health` → `{ "status": "UP" }`
  (Spring Boot actuator default). No new backend endpoint is created.
- **API base URL:** `environment.apiBaseUrl` — dev `http://localhost:8080`, prod the
  Render host (committed default, overridable via the `BACKEND_API_URL` build var).
- **CORS:** backend allows the Pages origin (`https://ivopogace.github.io`) for `GET`,
  configurable via `app.web.cors.allowed-origins` (env `APP_WEB_CORS_ALLOWED_ORIGINS`).
- **No money/date on the wire** in this slice.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Backend image + runtime config (Dockerfile, CORS, port/datasource env) | ✅ | (this commit) |
| 1 — CD workflow (`deploy.yml`: Pages + Render, gated on CI) | ✅ | (this commit) |
| 2 — Frontend FE↔BE health ping (environments, service, home status) | ✅ | (this commit) |
| 3 — ADR 0004 + deploy/secrets docs + ready-for-human | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `platform/Dockerfile` — multi-stage JDK 25 build → JRE runtime (created).
- `platform/.dockerignore` — keep build context lean (created).
- `platform/src/main/resources/application.properties` — `server.port=${PORT:8080}`,
  CORS allowed-origins property (no creds).
- `platform/src/main/java/ai/riviera/platform/WebCorsConfig.java` — env-driven CORS.
- `platform/src/test/java/ai/riviera/platform/WebCorsConfigTest.java` — CORS preflight test.
- `.github/workflows/deploy.yml` — CD, `workflow_run`-gated on `CI`.
- `frontend/src/environments/environment.ts` / `environment.prod.ts` — API base URL.
- `frontend/src/app/core/health.service.ts` (+ `.spec.ts`) — backend health probe.
- `frontend/src/app/app.ts` / template — render backend status.
- `frontend/angular.json` — `fileReplacements` for the prod environment.
- `docs/adr/0004-non-prod-hosting-render-neon-pages.md` — the decision + DSGVO-PROD plan.
- `docs/deploy/cd-pipeline.md` — secrets/variables + ready-for-human runbook.

---

## Phase 0 — Backend image + runtime config

**Files:** Create `platform/Dockerfile`, `platform/.dockerignore`,
`WebCorsConfig.java`, `WebCorsConfigTest.java` · Modify `application.properties`.

- [ ] **Step 1: Write the failing test** — `WebCorsConfigTest`: a `GET /actuator/health`
  with `Origin: https://ivopogace.github.io` returns `Access-Control-Allow-Origin` for
  that origin (MockMvc, configured allowed-origins).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*WebCorsConfigTest*"` → FAIL (no CORS bean).
- [ ] **Step 3: Minimal implementation** — add `WebCorsConfig` (a `CorsConfigurationSource`
  bean reading `app.web.cors.allowed-origins`, default `https://ivopogace.github.io`),
  enable `http.cors(...)` in `SecurityConfig`; set `server.port=${PORT:8080}` in
  `application.properties`. Dockerfile/.dockerignore already authored.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — n/a (single CORS site).
- [ ] **Step 6: Commit** — `feat(cd): backend Dockerfile + env-driven CORS/port (#33)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 1 — CD workflow

**Files:** Create `.github/workflows/deploy.yml`.

- [ ] **Step 1:** Author `deploy.yml` triggered on `workflow_run` of `CI` (types:
  `[completed]`), with a top-level guard job asserting
  `conclusion == 'success' && head_branch == 'main'`.
- [ ] **Step 2: `frontend-pages` job** (gated `if: vars.DEPLOY_FRONTEND_PAGES == 'true'`):
  checkout → setup-node from root `.nvmrc` → `npm ci` → `npm run build -- --base-href=/riviera-sunbed-booking/`
  → `cp dist/frontend/browser/index.html dist/frontend/browser/404.html` →
  `upload-pages-artifact` (path `frontend/dist/frontend/browser`) → `deploy-pages`
  (env `github-pages`, perms `pages: write`, `id-token: write`).
- [ ] **Step 3: `backend-render` job** (gated `if: vars.DEPLOY_BACKEND_RENDER == 'true'`):
  `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL"` (from secret) → poll
  `"$BACKEND_API_URL/actuator/health"` until `status==UP` (retry/backoff, ~5 min cap).
- [ ] **Step 4: Lint the workflow** — `actionlint` if available; otherwise YAML parse check.
- [ ] **Step 5:** Verify no required-check interaction (deploy is not a required check).
- [ ] **Step 6: Commit** — `feat(cd): CI-gated deploy workflow for Pages + Render (#33)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — Frontend FE↔BE health ping

**Files:** Create `environment.ts`, `environment.prod.ts`, `health.service.ts`,
`health.service.spec.ts` · Modify `app.ts`/template, `angular.json`, `app.config.ts`
(ensure `provideHttpClient`).

- [ ] **Step 1: Write the failing test** — `health.service.spec.ts`: `checkHealth()`
  GETs `${apiBaseUrl}/actuator/health` and maps the response to a status; asserted with
  `HttpTestingController`.
- [ ] **Step 2: Run it, verify it fails** — `npm run test` (scoped) → FAIL.
- [ ] **Step 3: Minimal implementation** — `HealthService` + environments +
  `fileReplacements` + render `Backend: {{status}}` on the home page (signal).
- [ ] **Step 4: Run it, verify it passes** — `npm run test` → PASS; `npm run lint` clean;
  `npm run build` (prod) succeeds.
- [ ] **Step 5: Generalization-audit pass** — n/a.
- [ ] **Step 6: Commit** — `feat(cd): FE health ping + per-env API base URL (#33)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — ADR + deploy docs

**Files:** Create `docs/adr/0004-non-prod-hosting-render-neon-pages.md`,
`docs/deploy/cd-pipeline.md`.

- [ ] **Step 1:** Write ADR 0004 (context, decision, US-incorporation/DSGVO caveat,
  deferred PROD plan, alternatives) matching the 0001–0003 format.
- [ ] **Step 2:** Write the deploy runbook: required secrets/variables, Neon JDBC URL
  form (`sslmode=require`), Render service settings (root dir `platform`, Docker,
  env vars), Pages enablement, and the ready-for-human checklist.
- [ ] **Step 3: Commit** — `docs(cd): ADR 0004 + deploy runbook for non-prod hosting (#33)`.
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1/AC-2:** `deploy.yml` `backend-render` health-poll green against the Render host (post-merge, after maintainer wiring).
- [ ] **AC-3:** Pages URL 200 + deep-link no-404 (post-merge).
- [ ] **AC-4:** `health.service.spec.ts` PASS (pre-merge) + live CORS (post-merge).
- [ ] **AC-5:** `git grep` finds no committed secret; `deploy.yml` trigger is `workflow_run`+success-gated (pre-merge).
- [ ] **AC-6:** `docs/adr/0004-*.md` present (pre-merge).

> AC-1/2/3 fully verify only after the maintainer creates the Render/Neon accounts and
> enables Pages (ready-for-human). Pre-merge, the workflow is asserted to be correct and
> gated; the deploy jobs no-op green until the opt-in variables are set.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test/probe.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] **No JPA** introduced; Dockerfile only assembles the existing `bootJar` (invariant #1).
- [ ] **Availability** section justified N/A (no booking/availability code).
- [ ] **Modulith** section: no cross-module imports; CORS config in the app root, not a context.
- [ ] **Payment/payout** N/A (no money moves).
- [ ] **No secret committed** — datasource + deploy creds only via ENV / GitHub secrets (invariant: R-2).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows that are actually resolved; Open Questions empty or deferred.
