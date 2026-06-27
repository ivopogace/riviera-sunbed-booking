# CD pipeline — non-prod deploy runbook

How the non-prod / demo environment is deployed, and the **maintainer-only** wiring it
needs. Decision rationale: [ADR-0004](../adr/0004-non-prod-hosting-render-neon-pages.md).
Workflow: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).

## How it works

`deploy.yml` triggers on **`workflow_run` of the `CI` workflow** and only proceeds when
CI concluded **`success` on `main`** — a red build never deploys. Two independent jobs:

- **`frontend-pages`** → builds the Angular app (`--base-href=/riviera-sunbed-booking/`,
  `404.html` SPA fallback) and publishes `frontend/dist/frontend/browser` to GitHub Pages.
- **`backend-render`** → POSTs the Render deploy hook (Render git-builds `platform/Dockerfile`),
  then polls `<BACKEND_API_URL>/actuator/health` until `{"status":"UP"}`.

Each job is **opt-in via a repository variable**, so until you wire the accounts below the
workflow runs green as a no-op (no red `main`).

## Required GitHub configuration

Set under **Settings → Secrets and variables → Actions**.

### Variables (not secret)

| Variable | Value | Enables |
|---|---|---|
| `DEPLOY_FRONTEND_PAGES` | `true` | the GitHub Pages deploy job |
| `DEPLOY_BACKEND_RENDER` | `true` | the Render deploy job |
| `BACKEND_API_URL` | e.g. `https://riviera-sunbed-booking.onrender.com` | post-deploy health check **and** the frontend's baked-in API base URL (overrides the committed default) |

### Secrets

| Secret | Value |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | the Render service's **Deploy Hook** URL (Render → service → Settings → Deploy Hook) |

> No datasource or deploy credential is ever committed. The frontend's `BACKEND_API_URL`
> is a **public URL**, so it is a variable, not a secret.

## Ready-for-human checklist (maintainer)

The pipeline is authored; these one-time account/secret steps need you:

1. **Neon** — create a project + free Postgres; copy the connection string. Build the
   JDBC URL with SSL required:
   ```
   SPRING_DATASOURCE_URL=jdbc:postgresql://<host>.neon.tech/<db>?sslmode=require
   SPRING_DATASOURCE_USERNAME=<user>
   SPRING_DATASOURCE_PASSWORD=<password>
   ```
2. **Render** — create a **Web Service** → **Docker**, connected to this repo:
   - **Root Directory:** `platform` (so the Docker build context is the backend module).
   - **Dockerfile Path:** `platform/Dockerfile` (or `./Dockerfile` relative to root dir).
   - **Environment variables:** the three `SPRING_DATASOURCE_*` above. (Render injects
     `PORT`; the app already binds it via `server.port=${PORT:8080}`.)
   - **Health Check Path:** `/actuator/health`.
   - Optionally set `APP_WEB_CORS_ALLOWED_ORIGINS` if the Pages origin differs from the
     committed default `https://ivopogace.github.io`.
   - Copy the service's **Deploy Hook** URL → GitHub secret `RENDER_DEPLOY_HOOK_URL`.
   - Note the service URL (`https://<name>.onrender.com`) → GitHub variable `BACKEND_API_URL`.
3. **GitHub Pages** — Settings → Pages → **Source: GitHub Actions**.
4. **GitHub Actions vars/secrets** — set the table above, then set
   `DEPLOY_FRONTEND_PAGES=true` and `DEPLOY_BACKEND_RENDER=true` to arm the jobs.

After wiring, the next green CI on `main` deploys both apps. Verify:
- `https://ivopogace.github.io/riviera-sunbed-booking/` loads (and a deep link doesn't 404);
- `https://<name>.onrender.com/actuator/health` returns `{"status":"UP"}` (transitively
  proves Neon connectivity + Flyway boot);
- the home page shows **Backend status: UP** (proves CORS + API base URL).

## Notes & caveats

- **Cold starts:** Render free instances sleep after idle and the first Docker build is
  slow; the health poll waits up to ~15 min before failing.
- **Flyway today:** only the empty `V1__baseline.sql` exists, so "migrations apply on boot"
  currently just creates `flyway_schema_history`. Feature tables arrive in later slices.
- **DSGVO:** Render/Neon are US-incorporated — fine for dummy data only. EU-sovereign PROD
  hosting is a separate, deferred issue (ADR-0004).
