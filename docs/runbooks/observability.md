# Observability runbook (D4, issue #100)

Production observability for the single-instance soft launch: structured logs with a correlation id,
an authenticated Prometheus scrape endpoint, and three money-path failure signals wired to an in-app
alert route. This runbook says what each signal means, how it is alerted today, and how to upgrade to
metric-native alerting later.

> **Single-instance posture.** Like the two sweeps, the alert self-check is correct only on **one**
> instance (in-memory metrics, no lease). Do not scale out before adding ShedLock + a shared metrics
> backend — see `docs/deploy/production-hardening.md` and ADR-0004 (improvement-plan D3).

## Structured logging

- **Off by default** (local + tests stay plain-text). **Enable in the deployed environment** with one
  variable: `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs` (Spring relaxed-binding →
  `logging.structured.format.console`; Boot 4 native ECS JSON, no `logstash-encoder` dependency).
- Every request carries a **correlation id**: `CorrelationIdFilter` puts it in the MDC (rendered on
  every JSON line as `correlationId`) and echoes it in the `X-Correlation-Id` response header. An
  inbound `X-Correlation-Id` is reused only if it passes a bounded allowlist; a forged/over-long value
  is discarded and a fresh UUID generated (log-injection safe).
- **Tracing a booking across its full flow** (reserve → PaymentIntent → webhook → confirm → ledger):
  the correlation id is per-request, so across the async spine grep the **booking id**, which every
  per-booking money-path line already logs (`… booking 1234 …`). Booking **codes** are never logged
  (invariant #7).

## Prometheus metrics

- Exposed at **`/actuator/prometheus`**, **authenticated** (an operator session; anonymous → 401). The
  #75 actuator lockdown is preserved — `/actuator/health` remains the only anonymous actuator surface,
  and `/actuator/metrics` stays off the exposure allowlist.
- Enabled by `management.endpoints.web.exposure.include=health,prometheus` +
  `management.prometheus.metrics.export.enabled=true` (Boot 4 gates a named registry's export behind an
  explicit enable).

## The three money-path signals

| Signal | Metric / query | Meaning | Alert when |
|---|---|---|---|
| **Outbox backlog** | `riviera_outbox_pending` (gauge) — live `count(*)` over the incomplete `event_publication` table | Event publications are not draining: a listener keeps failing, or the outbox fills faster than it drains | `> riviera.observability.alert.outbox-backlog-threshold` (default 10) |
| **Failed refunds** | `riviera_refunds_failed_total` (counter) — incremented when the gateway returns `RefundResult.Failed` | A refund the platform owes a tourist could not be issued | any increase since the last check |
| **Webhook 5xx** | `http_server_requests_seconds_count{uri="/api/payments/stripe/webhook", status=~"5.."}` (standard Boot timer) | The Stripe webhook — the payment source of truth (invariant #8) — is erroring; Stripe will retry and payment state may lag | new 5xx `> …webhook-server-error-threshold` (default 0) |

## Other platform metrics (not money-path)

`ObservabilityMetrics` is the one place metric names are declared; not every name in it is a
money-path signal, and `MoneyPathAlertCheck` deliberately reads only the three above.

| Metric | Meaning | Alert when |
|---|---|---|
| `riviera_mail_registry_shed_total` (counter, #408) | A booking-confirmation mail was **shed**: the registry-mail bulkhead (#383) was saturated — `pool-size` threads busy and all `queue-capacity` slots full — so the send never reached the relay. The work is *expected* to survive: its event publication stays outstanding and `spring.modulith.events.republish-outstanding-events-on-restart` re-delivers it at the next start (**not yet covered by a test — #407**), but until then a paying tourist has no arrival code by mail | any increase. A single shed means the relay is degraded or the pool is undersized for real volume. **Diagnose the relay first** — raising the bounds trades a lossless shed for a larger backlog, and past the ceilings below it is not accepted at all |

**A rejection during shutdown is not a shed** and does not touch this counter: a redeploy can reject an
in-flight send from an otherwise idle pool, which logs one `INFO` and is not saturation. Without that
distinction the "any increase" rule above would fire on every routine deploy. **The recovery counter
below makes the opposite call, for a reason** — see its note.

### `riviera_mail_recovery_dropped_total` (counter, #415)

The other vehicle's loss. A **verification or password-reset** mail the bounded in-memory dispatcher
(#369) could not accept, and therefore never sent.

**Read one increment as: one person asked for a reset or verification link, got a `200`, and no mail
is coming.** They recover only by requesting again — and nothing will tell them to. This is the
counter's whole meaning, and it is why the series exists.

**It is not the shed counter's twin, and the two must never be summed.** A shed registry mail is
*deferred*: its event publication is still outstanding and a restart republishes it. A dropped
recovery mail is *gone*: the payload is a single-use bearer credential the Event Publication Registry
may not persist (ADR-0011 decision 5), so there is nothing to retry from, by design.

| Tag | Meaning | Alert when |
|---|---|---|
| `reason="saturated"` | The dispatcher's single drainer was busy and all 100 queue slots were full. The relay is degraded or too slow for current volume | **any increase.** Diagnose the relay — this is the actionable one |
| `reason="shutdown"` | A redeploy outran an in-flight request: the pool stopped accepting before the request reached it. The mail is still lost, but no relay is at fault | not on its own. Expect ones and twos around a deploy; a *sustained* rise means requests are arriving long after shutdown begins |

**Why a shutdown rejection is counted here but not for the registry vehicle.** The registry excludes
it because a shed-at-shutdown send loses nothing. Here it is a genuine loss — `server.shutdown` is
not `graceful`, so an in-flight request can reach the dispatcher after the pool has closed, and that
mail is gone with nothing to retry from. Excluding it would make this counter under-report exactly
what the paragraph above says it means. The tag, not the omission, is what keeps a routine deploy
from reading as an outage: **alert on `reason="saturated"`, track the total.**

**Logging is one line per drop — deliberately, and the inverse of the shed counter's throttle.** A
throttle trades repeated lines for the durable record that makes them redundant; the registry has
that record and this vehicle has none, so each line here is the only per-loss artefact that exists,
carrying in its MDC the correlation id of the request whose user is still waiting. Only
`reason="saturated"` escalates to `ERROR`; the shutdown race stays `WARN`. Neither line carries the
address or the link (invariant #7).

> **A relay outage shows up here first and hardest.** Saturating this pool needs 100 sends queued at
> a volume of "a handful a day", so `reason="saturated"` is rare — but a *transport* failure (relay
> down, DNS blip, SMTP 5xx) is not rare, and today it increments **nothing**: it is logged once at
> `WARN` by `TransactionalMailService` and that is the whole record. Tracked as **#423**. Until it
> lands, a relay outage is diagnosed from `riviera_outbox_pending` (the registry side) plus those
> `WARN` lines, not from this counter.

The shed path also logs **one `ERROR` per saturation episode** — not one per shed send, which would
bury the lines that matter during a burst. The episode ends when the pool's **queue empties**, not
merely when a worker picks something up: under saturation each completed send frees exactly one slot
that the next arrival refills, so ending the episode on task-start would peg the log rate to the
drain rate and turn a restart's republish of a backlog into hundreds of lines. **Alert on the
counter, not the log**: the log tells you an episode started, the counter tells you how big it was.

**Tunables** (`riviera.notification.registry-mail.*`, both validated at boot on **both** ends):

| Env var | Property | Default | Accepted range |
|---|---|---|---|
| `RIVIERA_REGISTRY_MAIL_POOL_SIZE` | `pool-size` (core = max threads) | `2` | `1`–`32` |
| `RIVIERA_REGISTRY_MAIL_QUEUE_CAPACITY` | `queue-capacity` (sends queued before shedding) | `200` | `1`–`10000` |

**Both ends of each range are enforced at boot, and the upper end is not bureaucracy.** A huge
`queue-capacity` does *not* fail loudly: the queue allocates lazily, so the app boots clean, sheds
nothing, holds this counter at zero, and fills the heap with retained sends until the JVM dies —
taking the money-path listeners with it. That is the unbounded queue the bulkhead exists to remove,
restored by a well-meaning retune. A huge `pool-size` is the mirror image, surfacing as
`OutOfMemoryError: unable to create native thread` on the transaction-commit thread.

## Alert route (today): in-app self-check → ERROR log

`MoneyPathAlertCheck` (`@Profile("stripe")`, scheduled every
`riviera.observability.alert.interval` — default 5m, after a 1m initial delay) reads the three signals
from the meter registry and logs one **structured `ERROR`** line per crossed threshold, e.g.:

```
money-path alert: outbox backlog is 42 (threshold 10) — event publications are not draining
money-path alert: 1 refund(s) failed since the last check — a tourist may be owed money
money-path alert: 3 webhook 5xx response(s) since the last check (threshold 0) — Stripe may be retrying …
```

Alert lines carry only counts + thresholds — never a booking code or PII.

**Consume it:**
1. In the Render dashboard, watch the service logs for `money-path alert:` at `ERROR`.
2. For paging/notification, configure a **Render log drain** to forward logs to a sink (e.g. a Slack
   webhook via a log-drain integration, or Logtail/Datadog) and alert on the `money-path alert:`
   substring at level `ERROR`.

**Tunables** (`riviera.observability.alert.*`): `outbox-backlog-threshold` (10),
`webhook-server-error-threshold` (0), `webhook-uri` (`/api/payments/stripe/webhook`), `interval` (PT5M),
`initial-delay` (PT1M).

## Alert route (upgrade path): Grafana Cloud scrape

When metric-native alerting is wanted (dashboards, rate windows, silences):

1. Point a Grafana Cloud (free tier) / Prometheus agent at `https://<host>/actuator/prometheus`,
   authenticating with an operator credential (the endpoint is not anonymous — do **not** widen it).
2. Add alert rules on the three signals:

```promql
# Outbox backlog sustained high
riviera_outbox_pending > 10

# Any failed refund in the last 15m
increase(riviera_refunds_failed_total[15m]) > 0

# Webhook 5xx in the last 5m
increase(http_server_requests_seconds_count{uri="/api/payments/stripe/webhook", status=~"5.."}[5m]) > 0
```

The in-app self-check and the scrape route are complementary; keep the self-check as the
no-external-dependency backstop.
