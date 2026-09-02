# ADR-0004: Non-prod hosting on Render + Neon, same-origin SPA; prod target Hetzner

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

The project needs a continuously-deployed **non-prod / demo** environment: somewhere the Angular
frontend and the Spring Boot backend actually run so changes merged to `main` are exercised
end-to-end. The priorities at this stage are **zero cost, lowest setup friction, and
GitHub-Actions-native deployment** — not production hardening.

The data in this phase is **dummy/test data only**. There is no real EU personal data, so the
DSGVO (GDPR) data-residency posture we will eventually need does **not** govern this choice yet.
That requirement is real but deferred (see the prod plan below).

## Decision

For the **non-prod** environment we deploy to an all-free, GitHub-native stack:

- **Backend → Render** free web service, deployed as a **Docker** image Render builds from the
  multi-stage `platform/Dockerfile` (JDK 25 Temurin build → slim JRE runtime). Trade-off
  accepted: free instances **cold-start** after idle.
- **Frontend → same origin, served by the backend.** The Angular app is built in a Node stage of
  `platform/Dockerfile` and baked into the backend jar's `classpath:/static/`, so the **single
  Render web service** serves both the SPA shell and `/api/**` from one origin
  (`riviera-sunbed-booking.onrender.com`). The public-shell authorization lives in a dedicated
  Spring Security filter chain (`SecurityConfig`, ordered after the `/api/**` + `/actuator/**`
  chain); deep links are served `index.html` by `SpaWebConfig`. Same-origin is a **requirement of
  the auth design**, not a convenience: session cookies (`SESSION` / `XSRF-TOKEN`, `SameSite=Lax`)
  need the SPA and `/api/**` same-site in every deployed environment, and a cross-site pair
  (`*.github.io` + `*.onrender.com`) fails sign-in with a `403` CSRF error before credentials are
  checked, Safari's ITP most aggressively.
- **Database → Neon** free serverless Postgres. Unlike Render's / Railway's expiring free
  databases, Neon's free tier is **persistent** and scales to zero. The backend reaches it over
  SSL via `SPRING_DATASOURCE_*` env vars; Flyway runs migrations on boot.

Deployment is **gated on a green CI run on `main`** (`deploy.yml`, triggered by `workflow_run` on
the `CI` workflow only when its conclusion is `success`), so a red build never deploys. No
credential is committed — datasource and deploy secrets live only in GitHub Actions
secrets/variables. Operational details: `docs/deploy/cd-pipeline.md`.

## Consequences

- A live, auto-updating demo environment at no cost, wired entirely through GitHub Actions, with
  the CI gate preventing broken deploys.
- **Render and Neon are US-incorporated.** Acceptable **only** because the data is dummy/test. It
  is explicitly **not** the data-sovereignty posture required before real EU personal data is
  processed.
- Render free-tier cold starts make the first request after idle slow (seconds), and the JVM
  service serving the SPA means a cold start also delays the first HTML; a frontend change
  rebuilds the backend image. Accepted for a demo.
- **Single instance only.** The backend runs as **one** instance, and must until scale-out
  preconditions are met: rate-limit buckets are in-process and the scheduler sweeps are
  lockless-on-one-runner, so a second instance weakens rate limits and races duplicate gateway
  cancels. Failure modes and the precondition list (ShedLock on every sweep + shared-store
  rate-limit state) live in
  [production-hardening.md → *Single instance only*](../deploy/production-hardening.md#single-instance-only--do-not-scale-out-yet-the-two-lockless-sweeps--rate-limit-buckets).

## DSGVO-conform PROD plan: Hetzner (planned, not implemented)

Before processing **real personal data** in production, hosting moves to **Hetzner** (EU regions —
Nuremberg / Falkenstein / Helsinki), alongside the payments + entity migration to Paysera and an
Albanian sh.p.k. (ADR-0009). The cutover is its own PROD-hardening epic, contingent on ADR-0009
flipping to Accepted and the prod entity existing; Render + Neon + same-origin remain the non-prod
stack until then.

- **Database is self-managed on Hetzner.** Hetzner has no managed-Postgres PaaS, so backups +
  point-in-time recovery must be **built and operated** (WAL archiving + base backups via
  pgBackRest/WAL-G to EU object storage, encrypted + retained) — the GDPR/backups work in #101.
- **Carry-forward requirements, binding on Hetzner:** SPA + `/api/**` from **one origin** or
  same-registrable-domain subdomains (`app.…` / `api.…`) — anything cross-site re-breaks the
  session cookie; an **EU region** + a Hetzner DPA; and the single-instance → scale-out
  preconditions before running more than one instance.
- This move resolves the "US-incorporated" caveat above — for **prod**. The payments side is
  ADR-0009's concern; they are the two halves of the same prod-readiness step.

## Alternatives considered

- **Railway / Fly.io for the backend** — comparable free tiers, but Render's Docker-from-Git flow
  + deploy hook is the lowest-friction GitHub-native path.
- **Render Postgres / Railway Postgres** — rejected: their free databases **expire**; Neon's
  persists, which matters even for a demo.
- **Going straight to EU-sovereign hosting now** — rejected for this phase: over-engineering for
  dummy data and slower to stand up. Correctly deferred to PROD.
- **Frontend on GitHub Pages** (the original decision) — retired: cross-site with the API, which
  breaks session cookies (above). It had free static hosting and independent release cadence, both
  given up for the same-origin requirement.
- **A Render static site with a `/api/*` rewrite-proxy** — tried first and abandoned: a static
  site cannot reverse-proxy to another `*.onrender.com` service; the rewrite matches but returns
  an empty `200` that never reaches the backend. A separate Caddy/nginx proxy service works but
  adds a running service; a custom domain with `app.`/`api.` subdomains needs a domain.

## Amendment log

- 2026-07-09, #110 — the frontend moved from GitHub Pages to same-origin hosting by the backend.
- 2026-07-24 — the deferred DSGVO-conform prod target became Hetzner.
