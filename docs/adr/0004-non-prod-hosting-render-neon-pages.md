# ADR-0004: Non-prod hosting on Render + Neon + GitHub Pages

- **Status:** Accepted
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
