# Same-origin FE/BE hosting (Render static site + `/api` rewrite) Implementation Plan

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

**Architecture:** Replace GitHub Pages with a **Render Static Site** whose rewrite rules
proxy `/api/*` to the existing backend web service and fall back `/*` → `/index.html` for
SPA deep links. The browser then talks to a single origin, making `SESSION` and
`XSRF-TOKEN` first-party host-only cookies — the `document.cookie` cookie-to-header echo
in `api-session.interceptor.ts` works again. The **frontend build moves onto Render**
(build command owns the `environment.prod.ts` rewrite), and CD keeps the green-CI-on-main
gate by using a **deploy hook with Auto-Deploy off** — the exact pattern the backend
already uses.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — no Flyway
version claimed, no collision possible.

**Source of intent:** GitHub issue #110 (epic #108 slice S7); design
`docs/architecture/auth-signin-register.md` D-7; ADR-0004 (amended by this slice).
Diagnosis evidence (2026-07-07 live repro): login POST from the Pages origin → 403
`INVALID_CSRF_TOKEN` before credentials are evaluated; guest booking/webhook paths are
unaffected because they are deliberately CSRF-exempt (`SecurityConfig`).

**Skills consulted:** `riviera-sdlc` (issue-intake grill of #110 — confirmed current;
surfaced the `cd-pipeline.md` CORS env-var-name drift), `riviera-plan-doc` (this
template), `riviera-frontend` (environment rules: public values only, deploy-time values
rewritten from config not committed edits, empty-keys-fail-loudly; interceptor/auth
placement in `core/` untouched), `grilling` (intake interrogation). At implement time:
`riviera-local-debug` before the first `npm` run; no `postgres` /
`riviera-java-conventions` / `riviera-stripe-payments` needed — no SQL, no Java code
change (a properties default + docs only), no payment-model change (the Stripe
**publishable** key only relocates from a GitHub variable to a Render build env var).

**Branch:** `feature/issue-110-same-origin-hosting`

---

## Acceptance criteria (testable)

> This is a devops/hosting slice: the "application boundary" here is the deployed
> environment's behavior, and several ACs are pinned by the post-deploy verification
> checklist (final section) rather than a CI test class — the CI e2e suite mocks the API
> via `page.route`, so an origin change is invisible to it by design. Each AC names its
> honest verification method.

- [ ] **AC-1 (session works end-to-end):** Given the deployed sandbox on the new origin,
  when the operator signs in at `/operator/1` with valid credentials, then the console
  loads and a subsequent `GET /api/auth/me` returns the principal (the session cookie
  persisted). *Pinned by:* post-deploy checklist V-1 — Chrome + Firefox + Safari (Safari
  is the ITP case the issue names).
- [ ] **AC-2 (CSRF echo reaches the backend):** Given the new origin, when a sign-in is
  submitted with a **wrong** password, then the form shows the credential error
  ("Sign-in failed. Check your username and password." — the 401 branch), **not** the
  generic error (the 403 CSRF branch observed 2026-07-07). *Pinned by:* post-deploy
  checklist V-2. This is the sharpest single regression probe for the whole slice.
- [ ] **AC-3 (SPA deep links):** Given a fresh browser, when it navigates directly to
  `https://<static-site>/operator/1`, then the app boots (rewrite `/*` → `/index.html`)
  and no hard 404 is served. *Pinned by:* post-deploy checklist V-3.
- [ ] **AC-4 (CD gate preserved):** Given a red CI run on `main`, when CD evaluates, then
  no frontend deploy happens; the static site deploys only via its deploy hook after
  green CI (Auto-Deploy = off on the Render side). *Pinned by:* `deploy.yml` guard
  (unchanged) + Render dashboard deploy list showing `deploy_hook` triggers only.
- [ ] **AC-5 (tourist flows unaffected):** Given the new origin, when a tourist browses
  venues, opens a beach map, and views a booking by code, then all succeed (these paths
  are session-free / CSRF-exempt and only the origin changed). *Pinned by:* post-deploy
  checklist V-4 + the existing CI e2e suite (origin-agnostic, still green).
- [ ] **AC-6 (docs current):** ADR-0004 amended (dev env = Render static site + rewrite,
  same-site as a prod-hoster selection criterion); `docs/deploy/cd-pipeline.md` rewritten
  for the new frontend path **including the pre-existing drift fix** (the CORS override
  env var is `CORS_ALLOWED_ORIGINS`, not `APP_WEB_CORS_ALLOWED_ORIGINS`); `CLAUDE.md`
  deployed-URL line updated. *Pinned by:* review gate + `riviera-docs-freshness` at
  close-out.
- [ ] **AC-7 (no secrets committed):** The static-site deploy hook URL lives only in the
  GitHub secret; nothing sensitive lands in the repo. *Pinned by:* review gate diff scan.

## Non-goals

- **No production/DSGVO hosting move** — Render stays dev/demo-only; the same-site
  requirement is recorded as a *selection criterion* for the future EU hoster (ADR
  amendment), not implemented (issue #110 scope note).
- **No auth-model change** — `SecurityConfig`, the CSRF repository, cookie flags
  (`Secure`, `SameSite=Lax`), and `api-session.interceptor.ts` are all correct once
  same-origin; none of them is edited.
- **No custom domain** (option B) and no FE-in-jar bundling (ADR-0004 already rejected).
- **No retirement of the owns-all bootstrap operator** — that is S6 (#115).
- **No change to the mocked e2e suite** — it is origin-agnostic by design.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Render's rewrite-proxy mangles what the cookie flow needs (drops `Set-Cookie`, rewrites `Host` in a way that breaks the session) | low | high | **Verify before cutover**: phase 0 stands the static site up while Pages still serves; probe the wrong-password 401-vs-403 signal through the proxy origin before phase 2 retires Pages | agent | open |
| R-2 | Auto-Deploy left on for the static site → a red `main` deploys, violating the CD gate (rule: never deploy red) | med | med | Create the site with Auto-Deploy **off**; AC-4 checks the deploy-trigger list | agent | open |
| R-3 | Base-href regression: Pages needed `/riviera-sunbed-booking/`, the static site serves from `/` — a stale `--base-href` breaks every asset URL | med | med | The Render build command owns the build (no flag → default `/`); V-3 deep-link check catches it | agent | open |
| R-4 | The GH-Actions env rewrite and the Render build-command rewrite of `environment.prod.ts` drift apart (two mechanisms, one file) | med | low | **Single mechanism after this slice**: the Render build command is the only rewriter; the Actions build step is deleted with the Pages job | agent | open |
| R-5 | Backend cold start behind the proxy: first `/api` call after idle waits out the free-tier wake | high | low | Unchanged from today (same backend, same tier); note in `cd-pipeline.md`; no action | — | accepted |
| R-6 | Old Pages URL keeps serving a stale app after cutover, confusing testers | med | low | Phase 2 disables Pages in repo settings (ready-for-human); memory/docs updated to the new URL | maintainer | open |
| R-7 | Interceptor prefix anchor fails on relative URLs | — | — | **Retired at plan time:** `API_PREFIX` becomes `'/api/'` when `apiBaseUrl=''`; requests are `'/api/…'` → `startsWith` holds; unit specs run against the dev environment (absolute) and are untouched | agent | resolved (plan) |
| R-8 | Per-IP rate limiting behind one more proxy hop mis-keys on the proxy IP (see #129 X-Forwarded-For) | low | low | The static-site proxy is Render-internal to the same region; verify the login rate limiter still keys per client in V-2 (repeat probe ≤ limit); defer hardening to #129 | agent | open |

**Error-contract note:** no DTO or endpoint changes; the 403 `INVALID_CSRF_TOKEN`
`ProblemDetail` shape stays as-is (it simply stops firing for legitimate clients).

## Open questions / Assumptions

- **Open question:** static-site name/URL — proposal `riviera-sunbed-booking-web`
  (→ `riviera-sunbed-booking-web.onrender.com`); the backend keeps the plain name.
  — *Owner:* Ivo · *Resolves by:* phase 0 (AskUserQuestion at execution).
- **Open question:** Pages afterlife — plain disable (proposal; it's a demo) vs leaving a
  redirect stub at the old URL. — *Owner:* Ivo · *Resolves by:* phase 2.
- **Assumption:** the Render MCP (`create_static_site` / `update_static_site`) can set
  root dir, build command, publish path, env vars, and Auto-Deploy; **rewrite rules may
  need the dashboard** (ready-for-human fallback in phase 0). — *Owner:* agent ·
  *Resolves by:* phase 0.
- **Assumption:** Render static-site rewrites proxy transparently enough for cookies
  (they are advertised for exactly this SPA+API pattern). Verified empirically by the
  phase-0 probe before anything is retired (R-1). — *Owner:* agent · *Resolves by:* phase 0.
- **Assumption:** `STRIPE_PUBLISHABLE_KEY` (a `pk_…` public value) moves from a GitHub
  Actions variable to a Render static-site env var consumed by the build command; the GH
  variable is then unused for the FE and can be retired (the backend never used it).
  — *Owner:* agent · *Resolves by:* phase 1.

## Availability & concurrency (invariant #2)

N/A — hosting/CD slice; no write path to `availability(set_id, booking_date)` is added,
removed, or re-routed. The same backend endpoints serve the same requests via a proxy hop.

## Spring Modulith — modules, interfaces, events

N/A — no backend module code in scope. The only backend-adjacent edit is the
`application.properties` **CORS default** (drop the now-unneeded
`https://ivopogace.github.io` allowance; the `CORS_ALLOWED_ORIGINS` env override and the
`dev` profile's localhost origins stay). `SecurityConfig` is not edited.

### Module ownership (§4a)

All changes live in deploy config (`.github/workflows/deploy.yml`, Render), frontend
environment config (`frontend/src/environments/`), and docs — no module behavior added or
moved; no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The Stripe **publishable** key (public by definition,
`riviera-frontend` environment rules) changes injection point only: GitHub Actions build
env → Render build env. The webhook path stays CSRF-exempt and signature-verified
(invariant #8), untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `environments/environment.prod.ts` | existing | env config | n/a | n/a |

No component, service, route, or interceptor changes. `environment.ts` (dev) is untouched
— local dev stays `localhost:4200` → `localhost:8080` (same-site; `dev` profile CORS).

## FE↔BE contract

N/A — no endpoint, DTO, or wire-shape change. Only the origin the browser addresses
changes; all paths (`/api/**`) are identical through the rewrite.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Provision + probe the static site | ⏳ | |
| 1 — Repo cutover (env, CD workflow, CORS default, docs) | | |
| 2 — Cutover verification + Pages retirement + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit
window as each phase's code.

---

## File structure

- `frontend/src/environments/environment.prod.ts` — committed default becomes
  same-origin (`apiBaseUrl: ''`); comment explains the Render-build rewrite.
- `.github/workflows/deploy.yml` — `frontend-pages` job replaced by `frontend-render`
  (deploy-hook POST + availability poll); Pages permissions/steps removed.
- `platform/src/main/resources/application.properties` — CORS default drops the Pages
  origin.
- `docs/adr/0004-non-prod-hosting-render-neon-pages.md` — amended (see phase 1).
- `docs/deploy/cd-pipeline.md` — rewritten frontend section + env-var-name drift fix.
- `CLAUDE.md` — deployed-URL line.
- Render (not in repo): static site `riviera-sunbed-booking-web` (name TBC), rewrite
  rules, env var, Auto-Deploy off; GitHub: `RENDER_FRONTEND_DEPLOY_HOOK_URL` secret,
  `DEPLOY_FRONTEND_RENDER` variable (ready-for-human items listed in phase 0/2).

---

## Phase 0 — Provision + probe the static site (Pages keeps serving; nothing retired yet)

**Files:** none in-repo (Render + GitHub config). Record outcomes in this doc.

- [ ] **Step 1: Resolve the two open questions** (site name; Pages afterlife) via
  `AskUserQuestion`.
- [ ] **Step 2: Create the static site** (Render MCP `create_static_site`; dashboard
  fallback → append the exact clicks to the ready-for-human checklist):
  - repo `ivopogace/riviera-sunbed-booking`, branch `main`, **root dir** `frontend`
  - **build command** (single owner of the env rewrite — retires the Actions-side one, R-4):
    ```bash
    printf "export const environment = {\n  production: true,\n  apiBaseUrl: '',\n  stripePublishableKey: '%s',\n};\n" "${STRIPE_PUBLISHABLE_KEY:-}" > src/environments/environment.prod.ts && npm ci && npm run build
    ```
    (no `--base-href` → default `/`; R-3)
  - **publish path** `dist/frontend/browser`
  - **env var** `STRIPE_PUBLISHABLE_KEY` = the `pk_test_…` value (copy from the GitHub
    variable)
  - **Auto-Deploy: off** (R-2)
- [ ] **Step 3: Rewrite rules** (order matters — specific first):
  1. `/api/*` → `https://riviera-sunbed-booking.onrender.com/api/*` (**Rewrite**)
  2. `/*` → `/index.html` (**Rewrite**, SPA fallback)
- [ ] **Step 4: First deploy + probe (the R-1 gate).** Trigger a manual deploy, then:
  - `GET https://<static-site>/` → 200, app boots (base-href sane).
  - `GET https://<static-site>/operator/1` fresh → app boots (V-3 preview).
  - In-browser sign-in with a **deliberately wrong** password → expect the
    **credential error** (401 branch). Getting the generic error (403) = rewrite loses
    the cookie flow → STOP, diagnose before any repo change (R-1).
- [ ] **Step 5: Record** the probe result + site URL here; update Execution status.

## Phase 1 — Repo cutover (one PR; CI must stay green with Pages still live)

**Files:** Modify `frontend/src/environments/environment.prod.ts`,
`.github/workflows/deploy.yml`, `platform/src/main/resources/application.properties`,
`docs/adr/0004-non-prod-hosting-render-neon-pages.md`, `docs/deploy/cd-pipeline.md`,
`CLAUDE.md`.

- [ ] **Step 1: `environment.prod.ts`** — committed default:
  ```ts
  export const environment = {
    production: true,
    apiBaseUrl: '', // same-origin: /api/* is rewrite-proxied to the backend (issue #110)
    stripePublishableKey: '', // injected by the Render static-site build command
  };
  ```
  Interceptor check already done at plan time (R-7 resolved): `API_PREFIX` → `'/api/'`,
  relative request URLs match; dev specs untouched. Run `npm test` scoped to
  `core/api-session.interceptor.spec.ts` + `core/operator-auth.spec.ts` as the guard.
- [ ] **Step 2: `deploy.yml`** — replace `frontend-pages` with `frontend-render`:
  - gate: `vars.DEPLOY_FRONTEND_RENDER == 'true'` (workflow_run path) or dispatch target
    `frontend`/`both` — mirror of the backend job.
  - body: POST `secrets.RENDER_FRONTEND_DEPLOY_HOOK_URL`, then poll
    `https://<static-site>/` for 200 (build takes ~2–4 min).
  - delete: Node setup, npm build, env-rewrite step, 404.html step, Pages
    configure/upload/deploy steps, `pages`/`id-token` permissions, the `github-pages`
    environment block.
- [ ] **Step 3: CORS default** in `application.properties`:
  ```properties
  # Origins allowed to call the API from a browser. Same-origin in the deployed sandbox
  # since #110 (static-site rewrite) — override per environment via CORS_ALLOWED_ORIGINS.
  app.web.cors.allowed-origins=${CORS_ALLOWED_ORIGINS:}
  ```
  Verify an empty default yields "no cross-origin browser callers" (check the CORS bean's
  empty-list handling in `SecurityConfig` **before** committing; if empty breaks bean
  wiring, keep the static-site origin as the default instead — decide from code, record here).
- [ ] **Step 4: Docs** — ADR-0004 amendment (status line "Amended 2026-07-0X by #110":
  frontend moves GitHub Pages → Render static site + `/api` rewrite, why session cookies
  require same-site — D-7 —, and the prod-hoster selection criterion: one origin or
  same-registrable-domain subdomains); `cd-pipeline.md` frontend section rewritten
  (deploy-hook pattern, Render-owned build, new vars/secrets table: add
  `DEPLOY_FRONTEND_RENDER` + `RENDER_FRONTEND_DEPLOY_HOOK_URL`, retire
  `DEPLOY_FRONTEND_PAGES` + FE use of `BACKEND_API_URL`/`STRIPE_PUBLISHABLE_KEY`;
  **fix the drift**: CORS env var is `CORS_ALLOWED_ORIGINS`); `CLAUDE.md` deployed-URL
  line.
- [ ] **Step 5: Ready-for-human comment on #110** — GitHub settings the agent may lack
  rights for: add secret `RENDER_FRONTEND_DEPLOY_HOOK_URL`, add variable
  `DEPLOY_FRONTEND_RENDER=true`, remove `DEPLOY_FRONTEND_PAGES`.
- [ ] **Step 6: PR** — through the full gates (CI, review + `riviera-review-overlay`,
  Sonar). Note for review: the workflow diff is the risky surface (guard conditions).
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — Cutover verification + Pages retirement + close-out

- [ ] **Step 1: Merge → green CI → CD runs.** Confirm the CD run deployed the static
  site (deploy hook) and the backend health poll passed.
- [ ] **Step 2: Run the post-deploy verification checklist** (final section) — V-1..V-4.
  V-1/V-2 in Chrome (agent, browser automation) **and** Firefox + Safari (maintainer,
  ready-for-human — Safari is the ITP case).
- [ ] **Step 3: Retire Pages** (maintainer): Settings → Pages → disable (or the redirect
  stub if chosen in phase 0). Remove the retired GH variables. Set
  `CORS_ALLOWED_ORIGINS` on the **backend** Render service to empty/unset (it currently
  pins the Pages origin — align with the new default).
- [ ] **Step 4: Close-out** (riviera-sdlc merge checklist): `riviera-docs-freshness`
  over the merge range; update the agent-memory deployed-URL note; `graphify update .`
  (doc-heavy slice); close #110 with the verification evidence; comment on epic #108
  that S7 unblocks cloud demos of S1+; note on epic #141 that sandbox verification of
  O-slices is unblocked.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-07 | plan (intake grill) | other docs naming the wrong CORS env var or the Pages origin | `grep -ri "APP_WEB_CORS\|ivopogace.github.io" docs/ CLAUDE.md README.md` | to run in phase 1 step 4 | fold every hit into the docs commit |

---

## Acceptance-criteria verification (final)

Post-deploy checklist — run after phase 2 step 1, record evidence (screenshot / curl
output + date) per item:

- [ ] **V-1 (AC-1):** Sign in at `https://<static-site>/operator/1` with the real
  credential → console beach-map tab renders; `GET /api/auth/me` (devtools) → 200
  principal. Chrome + Firefox + Safari.
- [ ] **V-2 (AC-2):** Sign in with a wrong password → "Sign-in failed. Check your
  username and password." (not the generic error). Also repeat to confirm the rate
  limiter still keys sanely (R-8).
- [ ] **V-3 (AC-3):** Fresh incognito navigation to `https://<static-site>/operator/1`
  and `/venues/1` → app boots, no 404.
- [ ] **V-4 (AC-5):** Tourist smoke on the new origin: home loads venue list, beach map
  renders, `booking/:code` view for a known code works.
- [ ] **AC-4:** Render dashboard → static-site deploys list shows `deploy_hook` triggers
  only; a subsequent red-CI push deploys nothing.
- [ ] **AC-6/AC-7:** verified at review gate (diff).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying step.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — no backend code touched at all.
- [ ] **Availability** section justified N/A (invariant #2 unaffected).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section justified N/A; no cross-module imports (invariant #11).
- [ ] **Payment/payout** justified N/A; publishable key stays public-only (invariant #5/#8 posture unchanged).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone rules untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change → no Flyway migration (invariant #12).
- [ ] **Frontend** env rules honored (public values only; deploy-time rewrite by config, not committed edits).
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
