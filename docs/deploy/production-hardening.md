# Production hardening — actuator, secrets, TLS

Operational-exposure posture for the Spring Boot backend (`platform/`), closed for the
multi-operator launch (issue **#75**, part of #72). This documents *what is locked down and
why*; the enforcing config lives in `platform/src/main/resources/application.properties` and
`SecurityConfig`, and the regression test in `ActuatorHardeningIT`.

Related: [ADR-0004](../adr/0004-non-prod-hosting-render-neon-pages.md) (hosting),
[cd-pipeline.md](./cd-pipeline.md) (deploy wiring),
[operator-credential-provisioning.md](../runbooks/operator-credential-provisioning.md) (#74 auth).

## Actuator endpoints

Only **`/actuator/health`** is web-exposed. The exposure allowlist is **explicit** — we do not
rely on the framework default — so a dependency that ships its own endpoint cannot silently
widen the surface:

```properties
management.endpoints.web.exposure.include=health
management.endpoint.health.show-details=when-authorized
management.endpoint.health.roles=OPERATOR
```

Consequences, enforced by **two independent layers**:

| Endpoint | Anonymous | Authenticated operator | Why |
|---|---|---|---|
| `GET /actuator/health` | `200 {"status":"UP"}` (no component details) | `200` **with** `components` (db/diskSpace/…) | Render health check + CD poll need it public; details `when-authorized` only |
| `env`, `beans`, `mappings`, `configprops`, `heapdump`, `threaddump`, `loggers`, `metrics`, `modulith` | `401` (security) | `404` (not exposed) | Leak config / resolved secrets / bean wiring / internals — never reachable |

- **Layer 1 — exposure allowlist:** a non-`health` endpoint has no HTTP handler → `404` even
  for an authenticated operator. This is the primary control.
- **Layer 2 — `SecurityConfig`:** everything but `/actuator/health/**` requires authentication,
  so an anonymous call to any other actuator path is `401` (never a `200` body).

The public health body is intentionally unchanged (`{"status":"UP"}`), so the CD post-deploy
poll in `deploy.yml` (which greps `"status":"UP"`) keeps working.

Pinned by `platform/src/test/java/ai/riviera/platform/ActuatorHardeningIT.java`.

## Secrets

**No secret is committed to source or config.** Every credential resolves from the environment
(empty/placeholder default so the app still boots locally without it):

| Secret | Source | Where referenced | Default when unset |
|---|---|---|---|
| `STRIPE_API_KEY` | env (`stripe.api-key`) | Stripe collection (payment module) | empty → in-process stub gateway (no Stripe) |
| `STRIPE_WEBHOOK_SECRET` | env (`stripe.webhook-secret`) | webhook signature verification (invariant #8) | empty |
| `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | env | Spring datasource auto-config | supplied entirely by the deploy target (Neon over `sslmode=require`) |
| `RIVIERA_OPERATOR_PASSWORD` | env (`riviera.operator.password`) | the seeded `operator` account's credential — **the platform admin** since #115 (was the owns-all bootstrap; unchanged variable, no new secret) | empty → admin login disabled, cannot approve registrations (logged at WARN, never the value) |

Notes:

- The **only** password literal in the repo is `platform/compose.yaml`
  (`POSTGRES_PASSWORD=secret`). That file backs the `spring-boot-docker-compose`
  **`developmentOnly`** dependency — it starts a throwaway local Postgres and is **never** on
  the production classpath or image. Not a shipped secret.
- The frontend's `STRIPE_PUBLISHABLE_KEY` and `BACKEND_API_URL` are **not** secrets (a
  publishable `pk_` key and a public URL); they are GitHub *variables*, baked into the static
  build (see cd-pipeline.md). The Stripe **secret** key never reaches the frontend.
- Per-operator credentials (beyond the admin account) are stored **hashed** in the DB via the
  operator module's provisioning port (#74) or **self-registration → admin approval** (#115) —
  never in config. Since #115 no account owns all venues (owns-all retired, V29): each operator owns
  only its explicit `operator_venue` mappings (creator-owns-on-create), and the seeded `operator` is
  the platform admin, owning the V29-backfilled venues.
- **Deploy note (#115):** `RIVIERA_OPERATOR_PASSWORD` keeps the same value — no Render env change.
  After V29 runs, the `operator` account is the admin + owner of the backfilled venues, not an
  owns-all operator (see `operator-credential-provisioning.md`).
- Deploy-time secrets (`RENDER_DEPLOY_HOOK_URL`, `SONAR_TOKEN`) live only in GitHub Actions
  secrets, not in the repo.

## TLS

**Termination point: the Render edge.** Render serves the public backend over **HTTPS** and
redirects HTTP→HTTPS at its load balancer; the app itself runs plain HTTP on `$PORT` *behind*
that TLS-terminating proxy (ADR-0004). So the production transport expectation is: **all client
↔ backend traffic is HTTPS, enforced by the platform**, and the app trusts the proxy hop.

- **Database transport is encrypted too:** the Neon JDBC URL uses `sslmode=require`
  (cd-pipeline.md), so backend↔DB traffic is TLS as well.
- **Frontend↔backend:** the Angular app's `apiBaseUrl` is an `https://` Render URL; CORS is
  restricted to the Pages origin (`app.web.cors.allowed-origins`).

### Considered and deferred: `server.forward-headers-strategy`

We deliberately do **not** enable Spring's `ForwardedHeaderFilter`
(`server.forward-headers-strategy`) in this slice:

- The app already reads the real client IP from `X-Forwarded-For` itself
  (`ClientIpResolver`, used by the per-IP rate-limit filter, ADR-0006). Enabling the framework
  filter would **strip** `X-Forwarded-For` before that filter runs and rewrite `getRemoteAddr()`
  — a behavior interaction the launch-hardening slice explicitly avoids (issue #75: "no behavior
  change to business endpoints").
- Nothing currently consumes the forwarded **scheme** (no server-side absolute-URL generation,
  no `requiresSecure()` redirect — TLS is enforced at the edge, not in-app).

**Update (2026-07-22, issue #129): the trusted-proxy reconciliation this section anticipated has
happened — inside `ClientIpResolver`, not via the framework filter.** The resolver now takes a
trusted-proxy CIDR list (`riviera.ratelimit.trusted-proxies`, default: loopback + RFC1918 +
link-local + the IPv6 equivalents, overridable per environment with
`RIVIERA_RATELIMIT_TRUSTED_PROXIES`). It honors `X-Forwarded-For` only from a peer in that list and
keys on the right-most *untrusted* hop — Render appends its own observation of the client rather
than overwriting the header, so that hop is unforgeable. `server.forward-headers-strategy` remains
deliberately **unset**, for the same two reasons above: the framework filter would still strip the
header before the rate-limit filter runs, and `WebCorsConfig`'s same-origin null-config trick assumes
no forwarded-scheme processing. If app-generated absolute HTTPS URLs ever become a need, enabling it
now means re-pointing the resolver at the rewritten `getRemoteAddr()` — a deliberate change, not a
silent one.

## Single instance only (the two lockless sweeps)

Run **exactly one instance** of the backend until ShedLock (or equivalent) is added.
Two schedulers assume it (improvement-plan D3):

- the **abandoned-payment sweep** (`AbandonedBookingScheduler`, `stripe` profile) — two
  instances would race duplicate Stripe PaymentIntent cancels (the guarded
  `UPDATE … RETURNING` keeps state correct, but the Stripe cancel call is doubled);
- the **request-expiry sweep** (`RequestSweepScheduler`, all profiles, issue #98) — safe
  state-wise for the same guarded-transition reason, but sized and documented for one runner.

In-memory rate-limit buckets (issue #56) share the same assumption. Before any horizontal
scale-out: ShedLock on both sweeps + move rate-limit state to Redis (improvement-plan D3).

## Not in scope (deferred)

- EU-sovereign / DSGVO-conform PROD hosting migration — separate deferred issue (ADR-0004).
- A secret manager / vault — env vars are the store for the current Render/Neon targets.
