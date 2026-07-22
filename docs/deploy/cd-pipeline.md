# CD pipeline — non-prod deploy runbook

How the non-prod / demo environment is deployed, and the **maintainer-only** wiring it
needs. Decision rationale: [ADR-0004](../adr/0004-non-prod-hosting-render-neon-pages.md)
(amended by issue #110 — same-origin hosting).
Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).

## How it works

Since **#110** the frontend and `/api/**` are served **same-origin** by one service: the
Angular SPA is built in a Node stage of `platform/Dockerfile` and baked into the backend
jar's `classpath:/static/`, so the **Render web service serves both the app shell and the
API**. That is what makes the S1 session/CSRF cookies (issue #109) first-party — GitHub
Pages (cross-site with `*.onrender.com`) could not, and sign-in died at a 403 CSRF error.
There is now **one deploy job**.

`deploy.yml` triggers on **`workflow_run` of the `CI` workflow** and only proceeds when CI
concluded **`success` on `main`** — a red build never deploys.

- **`backend-render`** → POSTs the Render deploy hook (Render git-builds `platform/Dockerfile`:
  the Node stage compiles the SPA, the JDK stage bundles it into the jar), then polls
  `<BACKEND_API_URL>/actuator/health` until `{"status":"UP"}`.

The job is **opt-in via a repository variable** (`DEPLOY_BACKEND_RENDER=true`), so until you
wire the account below the workflow runs green as a no-op (no red `main`). A **manual**
`workflow_dispatch` (Actions → CD → *Run workflow*) does an on-demand re-deploy; dispatching
is itself the opt-in.

## Required GitHub configuration

Set under **Settings → Secrets and variables → Actions**.

### Variables (not secret)

| Variable | Value | Enables |
|---|---|---|
| `DEPLOY_BACKEND_RENDER` | `true` | the Render deploy job |
| `BACKEND_API_URL` | e.g. `https://riviera-sunbed-booking.onrender.com` | the post-deploy health-check URL (also the app origin) |

> The frontend's config is no longer set via GitHub variables — it is baked into the image at
> build time (see **Render service configuration**). `DEPLOY_FRONTEND_PAGES`, and the
> frontend's use of `BACKEND_API_URL` / `STRIPE_PUBLISHABLE_KEY` as GitHub build variables,
> are **retired** by #110.

### Secrets

| Secret | Value |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | the Render service's **Deploy Hook** URL (Render → service → Settings → Deploy Hook) |

> No datasource or deploy credential is ever committed.

## Render service configuration (the app origin)

One Render **Web Service** (Docker) builds and serves everything. Since #110 its build context
must include `frontend/`, so:

- **Root Directory:** *(empty — the repository root)*. **Changed by #110** (was `platform`) so
  the Docker build can see both `platform/` and `frontend/`.
- **Dockerfile Path:** `platform/Dockerfile`.
- **Environment variables:**
  - `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` (Neon; see checklist). Render injects
    `PORT` — the app binds it via `server.port=${PORT:8080}`.
  - `STRIPE_PUBLISHABLE_KEY` = `pk_test_…` — the frontend's Stripe **publishable** key. It is
    passed to the Dockerfile's Node build stage (`ARG STRIPE_PUBLISHABLE_KEY`) and baked into
    the SPA. Public, not a secret. Unset ⇒ the payment page shows a clear config-error state.
  - `CORS_ALLOWED_ORIGINS` — **leave unset/empty.** The app is same-origin, so there is no
    cross-origin browser caller. (The env var name is `CORS_ALLOWED_ORIGINS`, **not**
    `APP_WEB_CORS_ALLOWED_ORIGINS`; overriding it is only for a cross-origin setup.)
  - `RIVIERA_RATELIMIT_TRUSTED_PROXIES` (#129) — **currently SET, and #286 makes it
    retirable.** It was set on 2026-07-22 as a stopgap: the 8 shipped defaults **plus
    Cloudflare's 15 IPv4 + 7 IPv6 published ranges** (30 CIDRs), taken from
    <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6> that day.
    Why it was needed: `*.onrender.com` is fronted by **Cloudflare**, so the chain is client →
    Cloudflare edge → Render → app, and the hop Render appends is a **public,
    per-request-varying** edge address. #129's right-most-untrusted-hop walk keyed on that
    edge — measured at 143 × `403` + 57 × `429` for 200 same-client requests against a cap of
    10/min, i.e. **~14 buckets for one client**. Trusting Cloudflare's ranges made the walk
    skip the edge and land on the client (re-measured after: 11 allowed / 189 throttled = one
    bucket).
    **Drift risk — the reason it is a stopgap:** those 22 CIDRs are a hand-copied snapshot of
    a third-party list. When Cloudflare adds a range, the walk lands on an untrusted edge
    again and the defect returns **with no signal**. #286 removes the dependency: the app now
    prefers `CF-Connecting-IP` behind a trusted peer, which needs no chain walk and therefore
    no CDN ranges — so this variable should be **unset**, leaving the shipped
    private-range default whose only job is classifying Render's own internal hop.
    **Do not just delete it:** the retirement is a two-step, probe-verified procedure with a
    rollback — `docs/runbooks/rate-limit-client-ip.md`.
    Never set this blank: empty means "trust no proxy", which keys every client on the
    proxy's own address and throttles everyone together.
  - `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` (#286) — **leave unset.** The shipped default is
    `CF-Connecting-IP`, which is correct for this Cloudflare-fronted topology. Override only
    when moving to a CDN that publishes the originating client under a different name (e.g.
    `True-Client-IP`); an empty value disables the preferred path and falls back to the #129
    `X-Forwarded-For` walk.
- **Health Check Path:** `/actuator/health`.
- Copy the service's **Deploy Hook** URL → GitHub secret `RENDER_DEPLOY_HOOK_URL`.
- Note the service URL (`https://<name>.onrender.com`) → GitHub variable `BACKEND_API_URL`.

## Ready-for-human checklist (maintainer)

1. **Neon** — create a project + free Postgres; copy the connection string:
   ```
   SPRING_DATASOURCE_URL=jdbc:postgresql://<host>.neon.tech/<db>?sslmode=require
   SPRING_DATASOURCE_USERNAME=<user>
   SPRING_DATASOURCE_PASSWORD=<password>
   ```
2. **Render** — configure the Web Service per **Render service configuration** above: set the
   Root Directory to the **repo root**, Dockerfile Path to `platform/Dockerfile`, add
   `STRIPE_PUBLISHABLE_KEY`, and leave `CORS_ALLOWED_ORIGINS` empty.
3. **GitHub Actions vars/secrets** — set `RENDER_DEPLOY_HOOK_URL`, `BACKEND_API_URL`, and
   `DEPLOY_BACKEND_RENDER=true`.
4. **Retire GitHub Pages** — Settings → Pages → disable; remove the `DEPLOY_FRONTEND_PAGES`
   variable (and the frontend's GitHub-variable config, now baked into the image).

After wiring, the next green CI on `main` deploys the one service. Verify:
- `https://<name>.onrender.com/` loads the app, and a deep link (`/operator/1`) doesn't 404;
- `https://<name>.onrender.com/actuator/health` returns `{"status":"UP"}` (proves Neon + Flyway);
- operator sign-in reaches the credential check (the same-origin session cookie works — #110's fix).

## Notes & caveats

- **Cold starts:** Render free instances sleep after idle; the first request — now including the
  first SPA load, since the JVM serves it — waits out the wake, and the first Docker build is
  slower (it now also runs `npm ci` + `ng build`). The health poll waits up to ~15 min.
- **Flyway:** versioned migrations under `platform/src/main/resources/db/migration` apply on
  boot; the health check passing transitively proves Neon connectivity + a clean migration run.
- **DSGVO:** Render/Neon are US-incorporated — fine for dummy data only. EU-sovereign PROD
  hosting is a separate, deferred issue, and per the ADR-0004 amendment it **must** be
  same-origin (a reverse proxy) or same-registrable-domain subdomains or the session cookie
  re-breaks.
