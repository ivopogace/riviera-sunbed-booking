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

**One backlog cause worth recognising by name: a payout reversal waiting for its accrual** (#428's
audit). `BookingCancelledPayoutListener` throws when a refunded cancellation finds no `ACCRUAL` to
mirror, so its publication stays outstanding and this gauge holds at ≥ 1 until the next restart's
republish. Its `ERROR` line — *"refunded booking N (venue M) has no ACCRUAL to reverse"* — is the
tell. **Do not "fix" it by making that listener return normally:** the branch did exactly that until
#428, which completed the publication and left the venue's ledger permanently overstating the refund
(invariant #9). If the gauge will not drain after a restart, check whether the *accrual* listener is
the one failing (a venue with no commission rate makes it throw), because the reversal cannot post
until the accrual does.

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

> **A relay outage does *not* show up here first.** Saturating this pool needs 100 sends queued at
> a volume of "a handful a day", so `reason="saturated"` is rare by construction. The counter that
> moves on the first failed send is `riviera_mail_recovery_failed_total` below — read that one first.

### `riviera_mail_recovery_failed_total` (counter, #423)

The same vehicle's *other* loss, and the one that moves first in a real outage. A **verification or
password-reset** mail the dispatcher **accepted** and then could not deliver.

**Read one increment as: the same thing a `dropped` increment means to the user** — they asked for a
link, got a `200`, and no mail is coming — **but a different thing to you.** `dropped` says the
dispatcher refused the work. This says the work was taken and then failed. Only one of those is
about the relay.

| Tag | Meaning | Alert when |
|---|---|---|
| `reason="transport"` | The send attempt itself failed — the relay refused the message or could not be reached (down, DNS, auth, SMTP 5xx). **This is the relay signal**, with one caveat below | **any increase.** A sustained rise usually means the relay is broken *right now*, and every recovery mail is being lost for its duration |
| `reason="suppression-lookup"` | The pre-send suppression read failed **non-transiently** — a revoked grant, schema drift, a column renamed under `JdbcEmailSuppressions`. The mail is lost before the relay is ever reached | **any increase — but go to the database, not the mail provider.** A *transient* read failure is not here: #386 fails open and sends anyway, so it counts nothing |
| `kind="verification"` / `kind="password-reset"` | Which recovery flow the lost mail belonged to. They ride different rate-limit budgets (register vs recovery), so a rise in only one narrows where to look | — |

> **`transport` is "the send failed", not "the relay failed" — read the exception class before
> paging the provider.** The tag is applied to *any* exception escaping the send call, so a defect
> in the mail path itself (a template-rendering `NullPointerException`, a bad `URI`) lands in the
> same bucket as a dead relay. That is deliberate — the alternative is an exception-class tag, whose
> cardinality is unbounded by construction — and the discrimination lives in the `WARN` line beside
> each increment, which carries the exception's simple name. A mail/IO exception means the provider;
> anything else means our code, and no amount of relay-poking will move the number.

### `riviera_mail_confirmation_abandoned_total` (counter, #428)

**The one mail loss `riviera_outbox_pending` cannot show** — and the only one of the four that is
never retried by anything.

A booking confirmation the registry listener **gave up on** because a fact it needs did not resolve:
the booking row, the set, or the guest contact. The listener logs and returns *normally*, which is
correct — none of the three can appear later, so a retry would park a permanently-failing publication
in the outbox — but the normal return is exactly why nothing else sees it: the Event Publication
Registry marks the publication **complete**, and the outbox gauge never moves.

**Read one increment as: one tourist paid, holds a `CONFIRMED` booking, and will never receive their
arrival code by mail.** The booking itself is fine; only the mail is gone. The operational remedy is
the admin resend (#380/#405) *after* the underlying data fault is fixed — nothing will retry on its
own.

| Tag | Meaning | Which module to investigate | Alert when |
|---|---|---|---|
| `reason="no-booking"` | `BookingNotificationFacts.notificationInfo` found no booking for the confirmed booking id | `booking` | **any increase** |
| `reason="no-set"` | `SetBookingFacts.setBookingInfo` found no set for the event's set id | `venue` | **any increase** |
| `reason="no-contact"` | `CustomerLookup.findById` found no contact for the booking's customer id | `customer` | **any increase** |

> **This is a data-integrity signal, not a relay signal — do not page the mail provider.** None of
> the three is reachable through any application path: `booking.set_id` and `booking.customer_id` are
> plain foreign keys with **no** `ON DELETE CASCADE` (so neither row can vanish under a live
> booking), no code path deletes a booking, and GDPR erasure and the retention sweep are
> tombstone-**in-place** `UPDATE`s, so an erased guest still resolves. A non-zero value means rows
> that cannot legally be missing are missing — a restore, a manual `DELETE`, or a defect in one of
> the three ports. Start at the module in the table, not at the relay.

**Logging is one `ERROR` per loss, deliberately unthrottled.** The shed path throttles to one line
per *episode* because saturation is transient, self-recovering and bursty; the recovery vehicle stays
at `WARN` because a relay outage fails every send at once and would flood. Neither applies here: this
is zero in a healthy system, so it cannot flood, and with the publication completed there is no
durable copy — the line is the only per-loss artefact there is. Lines carry the booking and set ids,
never the arrival code and never the address (invariant #7).

**Which of the four mail counters to read first, during a suspected relay outage:**

1. **`riviera_mail_recovery_failed_total{reason="transport"}`** — the fastest and least ambiguous
   signal. One failed send moves it; no queue has to fill first.
2. **`riviera_outbox_pending`** — the registry vehicle's equivalent. A confirmation mail whose
   transport fails *propagates*, so its event publication stays outstanding and this gauge rises.
   Booking confirmations and recovery mails share a relay, so these two move together.
3. **`riviera_mail_recovery_dropped_total`** — last. It needs 100 sends queued behind a wedged
   drainer, so at current volume it is a symptom of a *long* outage, not an early warning.

`riviera_mail_confirmation_abandoned_total` is deliberately **not** in that order: it never rises
because of a relay, so seeing it during an outage means you have found a *second*, unrelated fault.

**Why the registry vehicle has no *transport* failure counter of its own.** Its transport failure
propagates rather than being swallowed, so the publication survives and step 2 above already accounts
for it; a second series would count one failure twice and invite summing two numbers that mean
different things. **That argument holds only for failures that throw.** A confirmation the listener
*abandons* (no booking, set, or contact row) returns normally, completes the publication, and moves
no gauge — which is why that loss gets its own counter,
`riviera_mail_confirmation_abandoned_total` (#428), and why it is the one mail loss
`riviera_outbox_pending` **cannot** show. The asymmetry is between *throwing* and *returning*, not
between the two vehicles.

**Logging is one line per loss at `WARN`, and stays `WARN` deliberately.** The shed path escalates
saturation to `ERROR` because saturation is rare and always actionable; a relay outage fails *every*
send for its duration, so escalating each one would flood `ERROR` exactly when someone is reading
it. Same standing rule as everywhere else here: **alert on the counter, read the log for detail.**
Neither line carries the address or the link (invariant #7).

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

**The relay socket budget is a third knob, shared by both mail vehicles** (`#410`):

| Env var | Property | Default | Accepted range |
|---|---|---|---|
| `RIVIERA_SMTP_SOCKET_TIMEOUT_MS` | `riviera.notification.mail.socket-timeout-ms` | `10000` | `1`–`10000` |

**Retuning it moves three things at once, by design.** It is interpolated into all three
`spring.mail.properties.mail.smtp.*` timeouts (connect / read / write) under both the `mailer` and
`smtp4dev` profiles, **and** both mail pools derive their shutdown drain window from it. Before #410
those were four copies of one decision and they disagreed — 5s of drain against a 10s socket budget —
so a redeploy stopped waiting on sends that were still legitimately running and closed the data source
underneath them. Do not "fix" a slow relay by raising this past the range: the ceiling *is* the
shutdown drain budget, and a longer drain outlasts the platform's SIGTERM grace, so the process gets
killed mid-close instead of shutting down in order. Milliseconds rather than a `Duration` because
Jakarta Mail reads the interpolated value as a plain number.

**Note the shipped default sits AT the ceiling, so this knob only tunes downward.** That is not an
oversight: you cannot simultaneously have a relay budget larger than the platform's shutdown grace and
a drain window that covers it, and the ceiling forces that trade-off to fail at boot rather than hide.
If a real relay genuinely needs more than 10s per socket operation (#370 is the first point that is
knowable), the fix is **not** to raise this past its range — it is to raise the platform's shutdown
grace first, then raise `SHUTDOWN_BUDGET_MS` in `MailTransportProperties` to match. Lowering the knob
is always safe and shortens both the relay budget and the drain together.

**When the drain window expires, an in-flight send is abandoned, never interrupted.** For the registry
vehicle that costs nothing — the publication stays outstanding and the next start republishes it, so
expect `riviera.outbox.pending` to carry a redeploy's unfinished sends briefly. For the recovery
vehicle it is a lost mail the user must re-request, and note that it is **not** counted by
`riviera.mail.recovery.dropped`, which counts *rejections*, not abandonment at shutdown. The
non-interruption is deliberate: an interrupt cannot tell a send that already handed off to the relay
from one that has not, and interrupting the first is how at-least-once becomes a duplicate mail.

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
