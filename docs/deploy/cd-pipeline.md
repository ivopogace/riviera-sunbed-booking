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

- **`backend-render`** → POSTs the Render deploy hook with `ref=<the commit CI judged green>`
  (Render git-builds `platform/Dockerfile` at that commit: the Node stage compiles the SPA, the
  JDK stage bundles it into the jar), then waits until that commit is live (below).

### The live check

Render keeps the previous instance serving until the new one passes its health check, so
`/actuator/health` alone is answered by the **old** build: a deploy whose new instance never boots
(a Flyway failure, a config guard aborting startup) used to go green on attempt 1 (#1632). So
`scripts/wait-for-live-commit.mjs` polls every 10 s until **`/actuator/info` names the deployed
commit and `/actuator/health` is `UP`**, and fails the job after 15 min (the cold-start bound; a
measured Render deploy takes ~4–5 min). Each attempt logs the commit live at that moment; the
passing one logs `live commit <sha>, health UP`. A failed run's error names the commit still serving.

- The commit is `head_sha` of the CI run (automatic path) or `main`'s head at dispatch (manual, which
  the guard allows from `main` only); the hook's `ref=` makes Render build exactly that one.
- **Only `main`'s current head deploys.** A run whose commit `main` has moved past (a re-run of an
  older green CI run, or two merges in quick succession) skips with a notice, green, so it never
  rolls the service back; the newer commit's own CD run deploys it. The trigger step reads `main`'s
  head just before its POST, so a re-run of the deploy job re-checks too; keep that read inside the
  deploy job (a separate job's output is reused by "Re-run failed jobs"). On the automatic path a red head, or one CI
  never ran on (`[skip ci]`, a cancelled run), therefore deploys nothing until a green one follows it.
- A dispatch from any branch but `main` fails the run, naming the branch.
- **Rollback** is not a CD path: use Render's dashboard (service → Events → *Rollback*) or merge a
  revert, whose green CI deploys it.
- The app publishes Render's runtime `RENDER_GIT_COMMIT` (the deploy's commit SHA) as
  `{"commit":"<sha>"}` on the public `/actuator/info`, and nothing else
  ([production-hardening.md](./production-hardening.md#actuator-endpoints)). No secret is needed. A
  human can read the same URL to see which build is live.
- **Limit:** re-deploying the commit already live (a manual dispatch, or a CI re-run of `main`'s
  head) passes on attempt 1, since the old instance names the same SHA; there the check proves only
  that the commit is still served, not that the re-deploy booted. Check Render's deploy status then.
- `BACKEND_API_URL` unset now **fails** the job: an unverified deploy is not a green one.
- Proving it locally: `node --test scripts/wait-for-live-commit.test.mjs` runs the poll against a
  stub backend (the old commit outlasting the deadline is the red case).

The job is **opt-in via a repository variable** (`DEPLOY_BACKEND_RENDER=true`), so until you
wire the account below the workflow runs green as a no-op (no red `main`). A **manual**
`workflow_dispatch` (Actions → CD → *Run workflow*, on `main`) does an on-demand re-deploy;
dispatching is itself the opt-in.

## Required GitHub configuration

Set under **Settings → Secrets and variables → Actions**.

### Variables (not secret)

| Variable | Value | Enables |
|---|---|---|
| `DEPLOY_BACKEND_RENDER` | `true` | the Render deploy job |
| `BACKEND_API_URL` | e.g. `https://riviera-sunbed-booking.onrender.com` | the post-deploy live check's URL (also the app origin); **required**, unset fails the job |

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
    **KEEP IT SET. Do not unset this variable** — measured 2026-07-22, see below.
    **Drift risk — the reason it is still called a stopgap:** those 22 CIDRs are a hand-copied
    snapshot of a third-party list. When Cloudflare adds a range, the defect returns **with no
    signal**. #286 was meant to remove the dependency by preferring `CF-Connecting-IP` behind a
    trusted peer (shipped in #287, `c8e111a`), which needs no chain walk. **It did not remove
    it**, for a reason only the deployed probe could surface: the socket peer this app sees is
    **itself a Cloudflare edge address, not a private Render hop**, so the trust gate in front
    of *every* forwarding header — the new one included — still needs Cloudflare's ranges to
    classify the peer. Unsetting the variable was tried and measured: **166 of 200 requests
    allowed against a cap of 10/min (~17 buckets)**, versus 11 with it set. It was rolled back
    within minutes; production is protected. #286 stays open for the durable answer.
    The earlier note claiming Render's peer is private was an incorrect inference — the peer
    was trusted because the Cloudflare ranges had just been added, not because it was private.
    Never set this blank: empty means "trust no proxy", which keys every client on the
    proxy's own address and throttles everyone together.
  - `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` (#286) — **leave unset.** The shipped default is
    `CF-Connecting-IP`, which is correct for this Cloudflare-fronted topology. Override only
    when moving to a CDN that publishes the originating client under a different name (e.g.
    `True-Client-IP`); an empty value disables the preferred path and falls back to the #129
    `X-Forwarded-For` walk.
  - `RIVIERA_SUPPRESSION_PEPPER` (#388, ADR-0012) — **required under the `prod` profile;
    boot aborts without it** (`SuppressionPepperProdGuard` also rejects the committed dev
    default). The HMAC pepper for the hashed email-suppression key — a **secret, env-only**
    (the Stripe-key posture) and **long-lived**: rotating it orphans every stored suppression
    row (accepted ADR-0012 consequence), so treat it like a KMS root key. Generate once, e.g.
    `openssl rand -base64 48`. Ops recipes: [`docs/runbooks/suppression-list-ops.md`](../runbooks/suppression-list-ops.md).
  - `RIVIERA_RECOVERY_LINK_BASE_URL` (#368) — the absolute origin every emailed verify/reset
    link is built on. **Deployed value: the backend's own origin** (the app serves the SPA
    same-origin since #110), i.e. `https://<name>.onrender.com` today. **Required under the
    `mailer` profile; boot aborts without it** (#1581). Without `mailer` an unset variable falls
    back to `http://localhost:4200`, which is only right for local dev. In every profile the value
    must be an `http`/`https` URL (scheme in any case) with a host (loopback included, and hosts
    with underscores between letters or digits, such as `riviera_backend`; no trailing dot), a
    port in 1..65535 if one is given (a bare `:` aborts), an optional path, and no user info,
    query, fragment or percent-escape. Otherwise boot aborts naming the key
    (`riviera.recovery.link-base-url` or `riviera.notification.booking-link.base-url`) and this
    variable, never the value. Surrounding whitespace is stripped and a trailing slash trimmed (#1592).
  - **SMTP relay (#368, ADR-0011) — only with the `mailer` profile** (production runs
    `prod,mailer`; without these the profile aborts at boot, by design):
    `RIVIERA_SMTP_HOST` (Scaleway TEM: `smtp.tem.scw.cloud`), `RIVIERA_SMTP_PORT` (default
    `587`, STARTTLS), `RIVIERA_SMTP_USERNAME` / `RIVIERA_SMTP_PASSWORD` (the TEM SMTP
    credentials — **secrets, env-only**, the Stripe-key posture), `RIVIERA_MAIL_FROM`
    (`noreply@<platform sending domain>`, #370). Activation steps + smoke send:
    [`docs/runbooks/mailer-profile-smoke-test.md`](../runbooks/mailer-profile-smoke-test.md).
  - `RIVIERA_REGISTRY_MAIL_POOL_SIZE` / `RIVIERA_REGISTRY_MAIL_QUEUE_CAPACITY` (#408) — **leave
    unset** until there is a reason. They size the bulkhead the booking-confirmation listener
    drains on (#383), and the shipped defaults `2` / `200` are the constants that slice pinned.
    They exist because those numbers were chosen against *estimated* SMTP timeouts, and #370 is
    the first moment a real relay's latency is measurable — retuning an estimate should not need a
    deploy. **Both are validated at boot on both ends** (`pool-size` 1–32, `queue-capacity`
    1–10000): a non-positive value would silently yield a `SynchronousQueue`, and an oversized one
    would silently restore the unbounded queue the bulkhead exists to remove — neither fails loudly
    on its own, which is why the range is enforced rather than documented. Watch
    `riviera_mail_registry_shed_total` to know whether they need raising:
    [`docs/runbooks/observability.md`](../runbooks/observability.md).
- **`RENDER_GIT_COMMIT`** is Render's own (the deploy's commit SHA, at runtime): never set or
  override it on the service, or `/actuator/info` stops naming the real build and the live check
  fails every deploy.
- **Health Check Path:** `/actuator/health`.
- **Instances / scaling: keep at exactly ONE.** Do **not** raise the instance count (Render
  *Scaling*). The in-memory rate-limit buckets and the lockless scheduler sweeps assume a single
  runner — a second instance weakens the rate limits (~N× the cap) and races duplicate Stripe
  cancels. Scaling out is gated on the preconditions (ShedLock on every sweep, shared-store
  rate-limit state, restart republish off with its recovery replaced) in [production-hardening.md → *Single instance only*](./production-hardening.md#single-instance-only--do-not-scale-out-yet-the-lockless-sweeps--rate-limit-buckets)
  (improvement-plan D3, issue #99).
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
- `https://<name>.onrender.com/actuator/info` returns `{"commit":"<the deployed sha>"}`;
- operator sign-in reaches the credential check (the same-origin session cookie works — #110's fix).

## Post-deploy steps by release

Render swaps instances with zero downtime, so for a moment the old and new instances both run.
A release listed here owes one extra step after the old instance has drained.

- **#1340 (Flyway V74, stable event-registry listener ids).** The old instance can write a
  publication under a pre-V74 listener id after V74 ran; no listener matches it, so it never
  completes. Once the deploy is live, run against Neon:
  ```sql
  SELECT id, listener_id, status, publication_date FROM event_publication
  WHERE completion_date IS NULL AND listener_id LIKE 'ai.riviera.platform.%';
  ```
  Zero rows: done. Any rows: run the statement in
  `platform/src/main/resources/db/migration/V74__event_publication_stable_listener_ids.sql`
  against the same database (it is idempotent), re-run the query to confirm zero rows, then
  restart the service so the restart republish delivers them.

## Notes & caveats

- **Cold starts:** Render free instances sleep after idle; the first request — now including the
  first SPA load, since the JVM serves it — waits out the wake, and the first Docker build is
  slower (it now also runs `npm ci` + `ng build`). The live check waits up to ~15 min.
- **Flyway:** versioned migrations under `platform/src/main/resources/db/migration` apply on
  boot; the new commit answering with health `UP` transitively proves Neon connectivity + a clean
  migration run.
- **DSGVO:** Render/Neon are US-incorporated — fine for dummy data only. EU-sovereign PROD
  hosting is a separate, deferred issue, and per the ADR-0004 amendment it **must** be
  same-origin (a reverse proxy) or same-registrable-domain subdomains or the session cookie
  re-breaks.
