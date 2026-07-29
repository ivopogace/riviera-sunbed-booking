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
| `riviera_mail_registry_shed_total` (counter, #408) | A booking-confirmation mail was **shed**: the registry-mail bulkhead (#383) was saturated — `pool-size` threads busy and all `queue-capacity` slots full — so the send never reached the relay. The work is not lost (its event publication stays outstanding and is republished on the next restart), but until then a paying tourist has no arrival code by mail | any increase. A single shed means the relay is degraded or the pool is undersized for real volume; retune with the two env vars below before widening anything else |

The shed path also logs **one `ERROR` per saturation episode** — not one per shed send, which would
bury the lines that matter during a burst. The episode ends when the pool drains a task, so a
sustained outage reads as a heartbeat and a genuinely new saturation escalates again. **Alert on the
counter, not the log**: the log tells you an episode started, the counter tells you how big it was.

**Tunables** (`riviera.notification.registry-mail.*`, both validated at boot — a non-positive value
fails startup rather than silently yielding a `SynchronousQueue`):

| Env var | Property | Default |
|---|---|---|
| `RIVIERA_REGISTRY_MAIL_POOL_SIZE` | `pool-size` (core = max threads) | `2` |
| `RIVIERA_REGISTRY_MAIL_QUEUE_CAPACITY` | `queue-capacity` (sends queued before shedding) | `200` |

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
