# ADR-0004: Non-prod hosting on Render + Neon + GitHub Pages

- **Status:** Accepted — **Amended 2026-07-09 (issue #110)**: the frontend moves from GitHub
  Pages to **same-origin** hosting (the backend serves the SPA). See the amendment section.
- **Date:** 2026-06-27

## Context

The project needs a continuously-deployed **non-prod / demo** environment during the
learning and dummy-data phase: somewhere the Angular frontend and the Spring Boot
backend actually run so changes merged to `main` are exercised end-to-end. The
priorities at this stage are **zero cost, lowest setup friction, and GitHub-Actions-native
deployment** — not production hardening.

Crucially, the data in this phase is **dummy/test data only**. There is no real EU
personal data, so the DSGVO (GDPR) data-residency posture we will eventually need does
**not** govern this choice yet. That requirement is real but deferred (see below).

## Decision

For the **non-prod** environment we deploy to an all-free, GitHub-native stack:

- **Frontend → GitHub Pages.** Free static hosting, published straight from a GitHub
  Actions workflow. Built with `--base-href=/riviera-sunbed-booking/` for the repo
  subpath, with a `404.html` copy of `index.html` so SPA deep links don't hard-404.
  *(Superseded for the dev/demo env by the #110 amendment below — the frontend is now
  served **same-origin** by the backend; GitHub Pages is retired.)*
- **Backend → Render** free web service, deployed as a **Docker** image Render builds
  from the multi-stage `platform/Dockerfile` (JDK 25 Temurin build → slim JRE runtime).
  Simplest GitHub-connected Spring Boot deploy. Trade-off accepted: free instances
  **cold-start** after idle.
- **Database → Neon** free serverless Postgres. Unlike Render's / Railway's expiring
  free databases, Neon's free tier is **persistent** and scales to zero. The backend
  reaches it over SSL via `SPRING_DATASOURCE_*` env vars; Flyway runs migrations on boot.

Deployment is **gated on a green CI run on `main`** (a separate `deploy.yml` triggered by
`workflow_run` on the `CI` workflow, only when its conclusion is `success`), so a red
build never deploys. No credential is committed — datasource and deploy secrets live only
in GitHub Actions secrets/variables. Operational details: `docs/deploy/cd-pipeline.md`.

## Consequences

- We get a live, auto-updating demo environment at no cost, wired entirely through
  GitHub Actions, with the CI gate preventing broken deploys.
- **Render and Neon are US-incorporated.** This is acceptable **only** because the data
  is dummy/test. It is explicitly **not** the data-sovereignty posture required before
  real EU personal data is processed.
- Render free-tier cold starts make the first request after idle slow (seconds), and the
  first Docker build is slow; the post-deploy health poll tolerates this.
- The frontend's backend URL is baked in at build time (static site). It defaults to the
  expected Render host and is overridable via the `BACKEND_API_URL` repo variable.

## DSGVO-conform PROD plan (deferred)

Before processing **real personal data** in production, hosting moves to a
**DSGVO-sovereign / EU-based** provider (e.g. Hetzner, Scaleway, Clever Cloud, or an
EU region with a Data Processing Agreement and EU data residency). That migration —
covering the database, the backend runtime, and any logs/backups — is tracked as a
**separate PROD-hardening issue** and is a precondition of the real launch, not part of
this non-prod pipeline.

## Alternatives considered

- **Railway / Fly.io for the backend** — comparable free tiers, but Render's
  Docker-from-Git flow + deploy hook is the lowest-friction GitHub-native path here.
- **Render Postgres / Railway Postgres** — rejected: their free databases **expire**;
  Neon's free tier persists, which matters even for a demo.
- **Going straight to EU-sovereign hosting now** — rejected for this phase:
  over-engineering for dummy data and slower to stand up. Correctly deferred to PROD.
- **Bundling the Angular app into the Spring Boot jar (single deploy)** — rejected:
  loses the free static-hosting/CDN benefit of Pages and couples FE/BE release cadence.
  *(Reversed for the dev/demo env by the #110 amendment below — the same-origin requirement
  outweighs those benefits here.)*

## Amendment (2026-07-09, issue #110): same-origin frontend (Spring serves the SPA)

The **frontend → GitHub Pages** decision is superseded for the dev/demo env. Session cookies
(S1, issue #109) require the SPA and `/api/**` to be **same-site in every deployed
environment**; Pages (`*.github.io`) and the API (`*.onrender.com`) are cross-site, so the
`SESSION` / `XSRF-TOKEN` cookies were dropped by the browser (Safari's ITP most aggressively)
and sign-in failed with a **403 CSRF error before credentials were even checked**.

**What changed:** the Angular app is now built in a Node stage of `platform/Dockerfile` and
baked into the backend jar's `classpath:/static/`, so the **single Render web service** serves
both the SPA shell and `/api/**` from one origin (`riviera-sunbed-booking.onrender.com`). The
public-shell authorization lives in a dedicated Spring Security filter chain (`SecurityConfig`,
ordered after the `/api/**` + `/actuator/**` chain, which keeps its rules verbatim); deep links
are served `index.html` by `SpaWebConfig`. **No auth-model change** — `.spa()` CSRF and the
`SameSite=Lax` cookies were already correct; they only needed same-origin. GitHub Pages is
retired and CD collapses to the one backend deploy.

**Why not a static-site rewrite-proxy (the first attempt):** a Render **static site** cannot
reverse-proxy `/api/*` to another `*.onrender.com` service — the rewrite matches but returns an
empty `200` that never reaches the backend (verified 2026-07-09: backend direct returns venue
JSON, the proxied path returns `Content-Length: 0` with no backend headers; confirmed against
Render docs + community reports). A separate Caddy/nginx proxy **web service** works but adds a
running service; a custom domain with `app.`/`api.` subdomains needs a domain. For a dev/demo
env, one service with no new infrastructure wins.

**Consequence — loses the CDN / independent-cadence benefits** the original "Bundling…"
rejection valued: the JVM service serves the SPA (a free-tier cold start now also delays the
first HTML), and a frontend change rebuilds the backend image. Accepted for a demo — these are
exactly why this stays **dev/demo-only**.

**Prod-hoster selection criterion (carry-forward):** the future DSGVO-conform prod hoster
**must** serve the SPA and `/api/**` from **one origin** (a reverse proxy) or from
**same-registrable-domain subdomains** (`app.…` / `api.…`) — anything cross-site re-breaks the
session cookie. This is now a hard requirement on that deferred migration, not a nicety.
