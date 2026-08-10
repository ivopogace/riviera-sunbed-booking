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

> **The webhook endpoint's event list is configuration too, and nothing in the app can check it.**
> The endpoint at Stripe must send `payment_intent.succeeded`, `payment_intent.canceled` and
> `payment_intent.payment_failed` — and, since #592, the refund lifecycle: `refund.failed`,
> `refund.updated`, and `charge.refund.updated` for accounts on an older API version. Miss the refund
> types and the failed-refund reconciliation is **inert**: a refund the issuer rejects stays recorded as
> accepted, the guest is told their money is on its way, and `riviera.refunds.failed` never fires. There
> is no boot check for this — an endpoint subscribed to nothing looks exactly like an endpoint with no
> traffic — so verify it in the Stripe dashboard whenever the endpoint is created or re-pointed.
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

**Update (2026-07-22, issue #286): the walk is now the _fallback_, not the primary path.** #129's
premise — that the hop Render appends is the client — does not hold here: `*.onrender.com` is
Cloudflare-fronted, so the appended hop is a public, per-request-varying **edge node**, and keying on
it gave one client ~14 buckets while strangers behind one edge shared one. Behind a trusted peer the
resolver now prefers a configurable edge-supplied client-IP header
(`riviera.ratelimit.client-ip-header`, shipped default `CF-Connecting-IP`), which Cloudflare
generates from the connection it terminated rather than appending to a client copy — unforgeable
behind a trusted peer, and needing no chain walk. The `X-Forwarded-For` walk is preserved unchanged
for the no-CDN case. The trusted-proxy list's remaining job is to classify the **socket peer** only.

**Corrected 2026-07-22 (#288), same day:** an earlier version of this note claimed the header meant
"the trust list never has to enumerate the CDN's own rotating ranges." **That is false here.** The
socket peer this app sees *is* a Cloudflare edge address, not a private Render hop, so the trust
gate in front of every forwarding header — the client-IP header included — still needs those ranges.
Measured: narrowing `RIVIERA_RATELIMIT_TRUSTED_PROXIES` to the shipped private defaults allowed
**166 of 200** requests against a cap of 10/min (~17 buckets) and produced **no** resolver warning at
all, i.e. resolution stopped at the untrusted-peer branch before ever reading the header; restoring
the ranges returned it to 11 of 200. **The variable must stay set.** The header removes the *walk*,
not the *list* — #286 stays open for that half.
`server.forward-headers-strategy` stays unset for the reasons above — and now for a third: the
framework filter would also drop the resolver's preferred header path. Verification procedure (no
unit or slice test can prove this class of change): `docs/runbooks/rate-limit-client-ip.md`.

## Single instance only — do not scale out yet (the two lockless sweeps + rate-limit buckets)

**Run exactly one instance of the backend.** Three pieces of state are held in-process and
are correct **only on a single runner**; a second instance breaks them silently — no error, no
log, just wrong behaviour. The Render service is configured for one instance
([cd-pipeline.md](./cd-pipeline.md) → *Render service configuration*), and it must **stay**
that way until the scale-out preconditions below are met. This is item 7 / **D3** of the
improvement plan, rooted in the in-memory choices of
[ADR-0004](../adr/0004-non-prod-hosting-render-neon-pages.md) (rate-limit buckets) and
ADR-0006 (the per-IP rate-limit filter).

### Inside the one instance: the scheduled jobs do not share a thread (#395)

One runner does **not** mean one thread. Until #395, Spring Boot's default scheduler pool of
**one** carried all four `@Scheduled` jobs, and none of their queries had a timeout (Postgres's
default statement timeout is infinite) — so a single wedged read stalled every sweep. The worst
case is quiet: `AbandonedBookingScheduler` stops, expired bookings keep their
`availability(set_id, booking_date)` claims, those sets stay unsellable, and `MoneyPathAlertCheck` —
the thing that would notice — is stalled on the same thread. Nothing is double-sold (the failure is
strictly in the safe direction), and nothing pages.

Two knobs now hold that open, both in `application.properties`:

| Property | Default | What it buys |
|---|---|---|
| `spring.task.scheduling.pool.size` | `4` | A thread per `@Scheduled` job, so a job that is stuck cannot delay a sibling's schedule. Must stay **≥ the number of `@Scheduled` methods** — `ScheduledWorkArchitectureTest` counts them and fails the build otherwise, so a new job either gets a thread or does not merge. |
| `riviera.scheduled.query-timeout-seconds` | `10` | A finite bound on each job's **entry** query, so a wedged job eventually ends instead of pinning its thread and its pooled connection. Applied per adapter; the sweeps' per-item **writes** stay unbounded on purpose. |

**Operationally:** a bounded read that aborts fails that run, logs, and is retried on the next tick
(every sweep is idempotent and its per-row transitions are guarded), so repeated sweep failures in
the log mean a *database* problem — a lock held by a migration, a saturated pool — not a sweep bug.
Raise `riviera.scheduled.query-timeout-seconds` only if a healthy sweep is genuinely slower than the
bound; **never** reach for `spring.jdbc.template.query-timeout` to do it, which would also bound
`availability`'s claim (invariant #2) and is failed by the build.

### What breaks at two instances

| Load-bearing assumption | Where it lives | Failure mode at N > 1 instances |
|---|---|---|
| **Abandoned-payment sweep** | `AbandonedBookingScheduler` (`@Profile("stripe")`) | Every instance runs the scheduler. The guarded `UPDATE … WHERE status='AWAITING_PAYMENT' … RETURNING` keeps **DB state** correct (one instance wins each row), but each winner still fires its own Stripe **PaymentIntent cancel** → duplicate cancel calls racing at Stripe for the same intent. |
| **Request-expiry sweep** | `RequestSweepScheduler` (all profiles, issue #98) | Same guarded-transition design, so DB state stays correct, but the sweep is **sized and timed for one runner**; N copies do N× the redundant scans and fan out any per-expiry side effect. |
| **In-memory rate-limit buckets** | `RateLimitFilter` + `TokenBucket` (per-IP #56/ADR-0006; per-identity login throttle #292) — bounded `ConcurrentHashMap`s on the heap | Each instance holds its **own** buckets. A client's requests spread across instances, so the **effective cap is ~N× the configured limit** — the brute-force / abuse / credential-guess protection weakens in proportion to instance count. |

### Scale-out preconditions (all required before a second instance)

1. **ShedLock (or equivalent) on *every* sweep** — both `AbandonedBookingScheduler` and
   `RequestSweepScheduler` — so exactly one instance runs each tick. Add it to any **new**
   scheduler at the same time (standing trigger: a third scheduler, improvement-plan B3).
2. **Rate-limit state in a shared store** (e.g. Redis) — one bucket per client across all
   instances, so the cap holds regardless of which instance serves a request.

Until **both** land, keep the instance count at one. The deploy-runbook callout that enforces
this at the point the count is set is in [cd-pipeline.md](./cd-pipeline.md).

## Not in scope (deferred)

- EU-sovereign / DSGVO-conform PROD hosting migration — separate deferred issue (ADR-0004).
- A secret manager / vault — env vars are the store for the current Render/Neon targets.
