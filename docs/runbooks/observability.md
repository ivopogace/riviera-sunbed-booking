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
| **Failed refunds** | `riviera_refunds_failed_total` (counter) — incremented when the gateway returns `RefundResult.Failed`, and when a verified refund-lifecycle webhook reports a recorded refund dead (#592) | A refund the platform owes a tourist did not reach them. **Six shapes, and they need different responses.** A gateway error (`rate_limit`, `no_collection`, a Stripe code) is transient or a data problem — the publication stays outstanding and re-drives. **`refund_returned_nothing`** means Stripe answered the create with a refund already `failed`/`canceled`, so the platform deliberately did **not** record it — the dashboard shows a refund the database has never heard of, and the WARN naming that refund id is the only link between them; settle it by hand. **`refund_key_replay`** means a retry landed inside the ~24h idempotency-key window and Stripe replayed a dead refund instead of creating one — it clears itself once the key expires. **`refund_mismatch` (#569) is not transient and will never clear itself**: the gateway holds several live refunds for the booking, or one for an amount other than the policy computed (e.g. a manual dashboard refund), and the platform deliberately refuses both to top up the shortfall (that is `booking`'s decision, not `payment`'s) and to report a success that would strand the guest. Every replay repeats it until a human settles the booking at the gateway. **`refund_died_before_record` (#594)** means a verified failure for the refund reached the row before the create call could write it down — the one shape that *does* recover by itself, because the refund was never recorded, so its event publication is still outstanding and a re-drive past the ~24h key window creates a fresh refund. Leave it to the outbox; chase it only if `riviera_refunds_owed` stays up. **It is also the one shape that reliably increments this counter twice for a single incident** — the webhook counts the refund it killed, and the recording call it beat counts its own refusal. Both observations are true, and the gauge still reads 1: this is the sharpest case for reading the counter as observations and `riviera_refunds_owed` as bookings. **A webhook-reported failure (#592) also will not clear itself**: the gateway accepted the refund, then the issuer rejected it, so the money came back to us — the log line is `refund re_… returned no money (failed) — the platform still owes it`, `refunded_minor` has been cleared and the guest is correctly shown the refund as outstanding again. **There is no in-app lever**: the publication completed when the refund was accepted and `completion-mode=archive` removed it, so `/api/admin/refund-outbox` reports 0 and cannot re-drive it; and a re-attempt inside the ~24h idempotency-key window only replays the dead refund, which the adapter refuses as `refund_key_replay`. Recovery is manual: issue the refund at the Stripe dashboard, or re-attempt after the key expires | any increase since the last check. On `refund_mismatch`, reconcile that booking by hand — re-driving will not help. On a webhook-reported failure, contact the guest for a payout route and settle it at the gateway. **Read the delta as "something is owed", never as a count of distinct refunds** — this counts *observations*: an outstanding publication that keeps retrying increments once per attempt (`refund_key_replay` inside the key window does exactly that), so one stuck refund produces a steady stream. The WARN lines name the booking — and since #594 you need not read them for this: `riviera_refunds_owed` gauges the distinct count, and the enumeration query below names the bookings |
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

**One webhook-5xx cause worth recognising by name: a verified event we could not read** (#570).
`UnreadableWebhookEventException` answers `503` when a payload on any handled type yields no fact to
apply — a `payment_intent.succeeded`/`.canceled`/`.payment_failed` with no PaymentIntent id, or a
`refund.failed` with no refund id or no refund **status** (#592: the status is what the refund branch
decides on, so a payload without one would otherwise read as "still live" and be consumed). The
every-transition types — `refund.updated`, `charge.refund.updated` — are deliberately **not** in this
set: an unreadable payload there is logged and answered `200`, because a permanent retry loop on a
type that fires for every refund on the account would get the endpoint disabled and stop
`payment_intent` delivery with it. Those log `no actionable refund in verified event evt_… ` and
answer `200`, so they produce **no** 5xx — if you are chasing a 5xx spike, they are not it — a deliberate rollback, so the event-id dedup
insert is undone and Stripe re-delivers rather than the payment fact being consumed. Its `WARN` —
*"could not deserialize event evt_… (payment_intent.succeeded)"* — is the tell. **Unlike a transient
5xx, this one will not clear on its own:** the same payload fails every re-delivery, so treat it as a
deserialization defect (usually API-version divergence beyond what the SDK tolerates) and fix the
adapter. The booking stays `AWAITING_PAYMENT` and holds its `(set, date)` claim meanwhile; the event
id is *not* blacklisted, so once the fix ships, re-send the event from the Stripe dashboard — or wait
for a re-delivery still inside Stripe's retry window.

## Other platform metrics (not money-path)

`ObservabilityMetrics` is the one place metric names are declared; not every name in it is a
money-path signal, and `MoneyPathAlertCheck` deliberately reads only the three above.

| Metric | Meaning | Alert when |
|---|---|---|
| `riviera_refunds_shed_total` (counter, #404) | A cancellation **refund** was shed: the refund bulkhead's pool was saturated — `riviera.booking.refund.pool-size` threads busy and all `queue-capacity` slots full — so `BookingRefundListener` never ran and the gateway was never asked. Like the mail shed below, the work survives: the event publication stays outstanding and `republish-outstanding-events-on-restart` re-delivers it at the next start — and since #454 you need not wait for one: `POST /api/admin/refund-outbox/resubmit` re-drives it on demand. **Read it beside `riviera_refunds_failed_total`, never summed with it** — *failed* is a refund the gateway refused (investigate there); *shed* is one it was never asked for (investigate the pool and the burst) | **any increase.** Reaching saturation at all means a burst far larger than one weather-refund sweep, or a gateway degraded long enough to back up 500 refunds. Diagnose the gateway first; raising the bounds trades a lossless shed for a longer backlog |
| `riviera_refunds_adopted_total` (counter, #569) | A refund the gateway **already held** was adopted instead of created again: the adapter lists the refunds on the booking's PaymentIntent before creating one, found exactly one live refund for exactly the requested amount, recorded it locally and reported success. An increment says an earlier attempt **moved the money but lost the response** (a read timeout), so nothing was written locally at the time — the money was always right and the record has just caught up. It logs `adopted refund re_… already held for booking <id>` at INFO. **Not a money-loss signal, and never summed with `riviera_refunds_failed_total`** — nothing failed here, and nothing is owed. It is a *gateway-connectivity* signal: read it beside the adapter's WARN lines about a timed-out create (`Stripe refund create timed out for booking <id>`). One-offs are the design working | not on a single increment. **A sustained rate** — lost responses have become routine, so investigate gateway latency; each one delays a tourist's refund *record* until a replay. The anomaly case does **not** land here: when the gateway holds several live refunds, or one for a different amount, the adapter refuses (`RefundResult.Failed("refund_mismatch")`, WARN `booking <id> carries N live refund(s) …`), so it shows up on `riviera_refunds_failed_total` and the publication stays outstanding — see that row |
| `riviera_refunds_owed` (gauge, #594) | How many bookings are **still owed** a refund the gateway would not issue — a live count over `payment.refund_failed_at IS NOT NULL`, served by the partial index that exists for it. This is the distinct-count answer `riviera_refunds_failed_total` cannot give: that counter records *observations*, so one stuck refund re-increments it on every resubmission, while this moves by one and falls back to zero as bookings are settled. **Read them together, never summed** — the counter for "something happened", the gauge for "how many are outstanding". A gauge above zero with a flat counter is the normal shape of an unresolved incident; a rising counter with a flat gauge is one stuck refund retrying. **It is not a fourth money-path signal** — it quantifies the debt signal 2 already counts, so `MoneyPathAlertCheck` still reads three; this is what you consult once that alert has fired | **any value above zero that does not fall.** Enumerate the bookings with the query below, then settle each at the gateway — a full refund clears its row when the retry records |
| `riviera_mail_registry_shed_total` (counter, #408) | A booking-confirmation mail was **shed**: the registry-mail bulkhead (#383) was saturated — `pool-size` threads busy and all `queue-capacity` slots full — so the send never reached the relay. The work is *expected* to survive: its event publication stays outstanding and `spring.modulith.events.republish-outstanding-events-on-restart` re-delivers it at the next start (pinned end-to-end by `RegistryMailShedDurabilityIT`, #407: it saturates a shrunk bulkhead, sheds a real confirmation, and proves the publication is still outstanding afterwards) — and since #405 you need not wait for one: `POST /api/admin/mail-outbox/resubmit` re-drives it on demand. Until it lands, a paying tourist has no arrival code by mail | any increase. A single shed means the relay is degraded or the pool is undersized for real volume. **Diagnose the relay first** — raising the bounds trades a lossless shed for a larger backlog, and past the ceilings below it is not accepted at all |

**A rejection during shutdown is not a shed** and does not touch this counter: a redeploy can reject an
in-flight send from an otherwise idle pool, which logs one `INFO` and is not saturation. Without that
distinction the "any increase" rule above would fire on every routine deploy. **The recovery counter
below makes the opposite call, for a reason** — see its note. `riviera_refunds_shed_total` follows the
registry pool's convention on both counts (shutdown rejections uncounted, one escalated `ERROR` per
saturation episode), because it shares the registry vehicle's durability: what is shed stays
outstanding.

**Why a shed refund needs its own counter when `riviera_outbox_pending` also rises.** Two reasons, and
the second is the one that matters. The backlog gauge alerts at a *threshold* (default 10), so the
first shed refund — the one worth knowing about — is invisible there. And a shed is the only loss mode
that does **not** trigger its own recovery: a crash restarts by definition and the restart republishes,
whereas a shed happens while the process is healthy and nothing restarts it. Until someone acts, a
tourist owed money under invariant #10 has not been paid.

**Enumerating the bookings that are owed money (#594).** `riviera_refunds_owed` says how many; this says
which. The un-record leaves the collection `SUCCEEDED` with nothing refunded — deliberately, because that
is what it still is — so the failure marker, not the status, is what identifies the debt:

```sql
SELECT booking_ref, amount_minor, currency, failed_refund_id, refund_failed_at
FROM payment
WHERE refund_failed_at IS NOT NULL
ORDER BY refund_failed_at;
```

`failed_refund_id` is the refund to look up in the Stripe dashboard. **Expect `refund_attempted_at` to
be NULL on every row of this list** — it records an attempt *in flight*, and every row here has one that
concluded, so it is cleared. That is the point rather than a gap: a stamp that outlived its attempt would
make the next refund on that collection look like ours, including one someone issued by hand. A row
leaves the list when a retry records successfully, or when someone clears it after settling by hand.

**The lever is `POST /api/admin/refund-outbox/resubmit` (#454; the admin console's Refunds tab at
`/admin/refunds` drives it since #460).** It re-drives what the registry
still owes `BookingRefundListener` — thrown, shed, or crash-stranded alike — and nothing else: the
scope is that listener's **exact id** (an allowlist of one, not the `booking` package prefix, which
would also sweep `PaymentEventListener`'s payment→confirm spine). The mail lever remains equally
narrow the other way — `/api/admin/mail-outbox` (#405) is scoped to `ai.riviera.platform.notification.`
and cannot reach the refund listener — so neither button can replay the other's work.
`GET /api/admin/refund-outbox` shows the outstanding count first; a press inside the 60s cooldown
(`riviera.booking.refund-resubmission.cooldown-ms`) answers `COOLING_DOWN` rather than sweeping
again, and a re-drive is idempotent at the gateway (`booking-<id>-refund`), so pressing it can never
double-refund. A restart's `republish-outstanding-events-on-restart` remains the unscoped fallback.
One case the button does not fix, by design: a *persistently* failing gateway (e.g. an insufficient
Stripe balance — the platform collects into Stripe and pays out via BKT, so funds legitimately leave
the balance a refund later needs). Fix the cause first — top up — then press; the publication just
stays outstanding, and `riviera_refunds_failed_total` counts, until it settles.

### `riviera_mail_recovery_dropped_total` (counter, #415)

The other vehicle's loss. A mail the bounded in-memory dispatcher (#369) **never ran**, and therefore
never sent.

> **"Recovery" names the vehicle, not the flow.** Both series here were named when this dispatcher
> carried only the verification and password-reset mails; since #375 it also carries the
> operator-approval notice, which is no recovery flow at all. The names are kept because renaming a
> shipped metric breaks every dashboard and alert that reads it — so **do not assume a tourist is
> behind every increment.**
>
> **Both series carry `kind`, and on this one that is new** (#442). For two slices this section told
> you to filter by a tag that was not here: the counter is raised by the dispatcher, whose interface
> was `dispatch(Runnable)`, so the kind was not in scope where the increment happened and a
> `kind`-filtered query matched nothing. #440 corrected the wording; #442 widened the seam, so the
> instruction is now true — **filter by `kind` rather than assuming a tourist is behind an
> increment.** All three `reason`s carry it, the drain path included, so a filtered query does not
> under-count.
>
> **The tag names the flow, not the person.** Invariant #7 keeps the address and the tokenized link
> out of metrics and logs alike, so `kind="operator-approved"` tells you an approval notice was lost
> and that the approval log of that window is where the operator is named. That is the difference
> between knowing to go and look and not knowing there is anything to look for — it is not a
> substitute for looking.

**Read one increment as: someone was told an action succeeded, and the mail it promised is not
coming.** For `verification`/`password-reset` that is a person who asked for a link and got a `200`;
for `operator-approved` it is an operator whose account really is active but who has no way to know —
it will find out by retrying sign-in, which is precisely the experience #375 set out to remove. All
three recover only by acting again, and nothing will tell them to. This is the counter's whole
meaning, and it is why the series exists.

**It is not the shed counter's twin, and the two must never be summed.** A shed registry mail is
*deferred*: its event publication is still outstanding, and either a restart or the #405 admin lever republishes it. A dropped
recovery mail is *gone*: the payload is a single-use bearer credential the Event Publication Registry
may not persist (ADR-0011 decision 5), so there is nothing to retry from, by design.

| Tag | Meaning | Alert when |
|---|---|---|
| `reason="saturated"` | The dispatcher's single drainer was busy and all 100 queue slots were full. The relay is degraded or too slow for current volume | **any increase.** Diagnose the relay — this is the actionable one |
| `reason="shutdown"` | A redeploy outran an in-flight request: the pool stopped accepting before the request reached it. The mail is still lost, but no relay is at fault | not on its own. Expect ones and twos around a deploy; a *sustained* rise means requests are arriving long after shutdown begins |
| `reason="abandoned"` (#434) | A redeploy outran the **queue**: the send was accepted, never started, and was discarded when the drain window expired. Same deploy, the other side of `execute()` — and bounded by how deep the queue was at SIGTERM, so normally zero or one | not on its own. A *sustained* rise means recovery volume has outgrown a single drainer thread, which nothing else makes visible |
| `kind="verification"` / `kind="password-reset"` (#442) | Which recovery flow the lost mail belonged to. Both self-heal — the token is already committed, so the person re-requests and gets a fresh link — which is why neither is the kind this dimension was added for | — |
| `kind="operator-approved"` (#442) | The kind that does **not** self-heal: nothing re-sends it, and the operator learns its account is live only by retrying sign-in. Before #442 a dropped notice was indistinguishable from a dropped password reset, and ADR-0011 decision 5 recorded the loss as mitigated "only in part" for exactly that reason | any increase, and read it as one lost person rather than a relay signal. Remedy: find the approval in that window's log and tell them. Same tag, same meaning, as on `…failed` |

**The two loss counters share one `kind` vocabulary, deliberately** (#442). They are raised from two
classes, on two threads, at two moments, so a kind spelled `password_reset` on one and
`password-reset` on the other would break every query that pivots between them while every test
stayed green. One enum (`MailKind`) is the single source for both, pinned by `MailKindTest`.

**Adding `kind` partitioned this series; it did not double-count it.** An unaggregated query returns
one row per `(kind, reason)` where it used to return one per `reason` — nine series rather than
three, all pre-registered at zero from boot so a flow that has never lost a mail is still queryable.
A `reason`-filtered query matches exactly as before, and the untagged total is unchanged.

**"Never ran" is the line, not "refused" — which is why `abandoned` belongs here.** It was *accepted*,
unlike its two siblings, and it still sits in this counter because the split #423 drew between this
name and `riviera_mail_recovery_failed_total` is **attempted versus never attempted**: `failed` is the
send the transport ran and lost. Every reason above is a send this pool never ran, so the total is
answerable as one question — "how many recovery mails did the dispatcher never send?" — and the tag
says which of the three ways. **Do not** read a rise in `abandoned` as a relay problem; read it as a
deploy that arrived mid-queue.

**One shutdown loss is deliberately in no counter: the send caught *running* when the window expires.**
The pool gives up rather than interrupting it (#410) precisely because an interrupt cannot tell a send
that already handed the message to the relay from one that has not — and for the same reason the
platform cannot say whether it was lost. Counting it would over-report a mail that arrived. So this
counter means *every recovery mail the pool never started*, and at most one send per redeploy sits
outside it.

**Why a shutdown rejection is counted here but not for the registry vehicle.** The registry excludes
it because a shed-at-shutdown send loses nothing. Here it is a genuine loss — `server.shutdown` is
not `graceful`, so an in-flight request can reach the dispatcher after the pool has closed, and that
mail is gone with nothing to retry from. Excluding it would make this counter under-report exactly
what the paragraph above says it means. The tag, not the omission, is what keeps a routine deploy
from reading as an outage: **alert on `reason="saturated"`, track the total.**

**Logging is one line per drop — deliberately, and the inverse of the shed counter's throttle.** A
throttle trades repeated lines for the durable record that makes them redundant; the registry has
that record and this vehicle has none, so each line here is the only per-loss artefact that exists,
carrying in its MDC the correlation id of the request whose user is still waiting. That holds for
`abandoned` too, though it takes machinery: those lines are emitted on the thread closing the context,
so each borrows the context of the send it is discarding rather than having one of its own. Only
`reason="saturated"` escalates to `ERROR`; both redeploy reasons stay `WARN`. No line carries the
address or the link (invariant #7).

> **A relay outage does *not* show up here first.** Saturating this pool needs 100 sends queued at
> a volume of "a handful a day", so `reason="saturated"` is rare by construction. The counter that
> moves on the first failed send is `riviera_mail_recovery_failed_total` below — read that one first.

### `riviera_mail_recovery_failed_total` (counter, #423)

The same vehicle's *other* loss, and the one that moves first in a real outage. A mail the dispatcher
**accepted** and then could not deliver. ("Recovery" names the vehicle — see the note above.)

**Read one increment as: the same thing a `dropped` increment means to the recipient** — the action
succeeded and no mail is coming — **but a different thing to you.** `dropped` says the
dispatcher never ran the work — it refused it at submit, or discarded it unrun at shutdown. This says
the work was taken, ran, and failed. Only one of those is about the relay.

| Tag | Meaning | Alert when |
|---|---|---|
| `reason="transport"` | The send attempt itself failed — the relay refused the message or could not be reached (down, DNS, auth, SMTP 5xx). **This is the relay signal**, with one caveat below | **any increase.** A sustained rise usually means the relay is broken *right now*, and every recovery mail is being lost for its duration |
| `reason="suppression-lookup"` | The pre-send suppression read failed **non-transiently** — a revoked grant, schema drift, a column renamed under `JdbcEmailSuppressions`. The mail is lost before the relay is ever reached | **any increase — but go to the database, not the mail provider.** A *transient* read failure is not here: #386 fails open and sends anyway, so it counts nothing |
| `kind="verification"` / `kind="password-reset"` | Which recovery flow the lost mail belonged to. They ride different rate-limit budgets (register vs recovery), so a rise in only one narrows where to look | — |
| `kind="operator-approved"` (#375) | Not a recovery flow at all: an operator whose registration an admin approved was never told. Volume is a trickle — one per approval — so **any** increase is one identifiable operator, and the manual remedy is to tell them, since nothing re-sends | any increase, but read it as one lost person rather than as a relay signal — with this volume the relay evidence lives in the other kinds |

> **`transport` is "the send failed", not "the relay failed" — read the exception class before
> paging the provider.** The tag is applied to *any* exception escaping the send call, so a defect
> in the mail path itself (a template-rendering `NullPointerException`, a bad `URI`) lands in the
> same bucket as a dead relay. That is deliberate — the alternative is an exception-class tag, whose
> cardinality is unbounded by construction — and the discrimination lives in the `WARN` line beside
> each increment, which carries the exception's simple name. A mail/IO exception means the provider;
> anything else means our code, and no amount of relay-poking will move the number.

### `riviera_mail_confirmation_abandoned_total` (counter, #428)

**A mail loss `riviera_outbox_pending` cannot show** — and one of the abandoned counters, which are
never retried by anything. Since #374 it has siblings — `riviera_mail_cancellation_abandoned_total`,
#373's `riviera_mail_payment_due_abandoned_total`, and #124's
`riviera_mail_request_declined_abandoned_total` / `riviera_mail_request_expired_abandoned_total` —
each this counter's argument applied to its own listener; everything below holds for all of them, and
the one place they differ — what an operator does about an increment — is in that section.

A booking confirmation the registry listener **gave up on** because a fact it needs did not resolve:
the booking row, the set, or the guest contact. The listener logs and returns *normally*, which is
correct — none of the three can appear later, so a retry would park a permanently-failing publication
in the outbox — but the normal return is exactly why nothing else sees it: the Event Publication
Registry marks the publication **complete**, and the outbox gauge never moves.

**Read one increment as: one tourist paid, holds a `CONFIRMED` booking, and will never receive their
arrival code by mail.** The booking itself is fine; only the mail is gone.

**Nothing re-drives it — the #405 admin lever included.** `POST /api/admin/mail-outbox/resubmit`
resubmits *outstanding* publications; this one was marked **complete** on the listener's normal
return, which is the very property that keeps this loss off `riviera_outbox_pending` (above). The
per-booking resend that would reach an already-completed publication is **#380, not yet built**. So
until it lands the remedy is out-of-band: fix the underlying data fault first, then reach the tourist
on the contact address recorded against the booking. Nothing will retry on its own.

**Sending an arrival code by hand means handling a bearer credential (invariant #7).** This is the
only point in this runbook where a *person* touches one — every automated path above is explicitly
barred from logging it, and #380's admin view is specified never to render it. So send it only to the
contact address on the booking, and keep it out of the incident channel, the ticket, and any pasted
output of the query you used to find it. If that address is itself the fault you just fixed, you have
no verified channel to send it on: escalate rather than improvise one.

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

**Which of the mail counters to read first, during a suspected relay outage:**

1. **`riviera_mail_recovery_failed_total{reason="transport"}`** — the fastest and least ambiguous
   signal. One failed send moves it; no queue has to fill first.
2. **`riviera_outbox_pending`** — the registry vehicle's equivalent. A confirmation mail whose
   transport fails *propagates*, so its event publication stays outstanding and this gauge rises.
   Booking confirmations and recovery mails share a relay, so these two move together.
3. **`riviera_mail_recovery_dropped_total`** — last. It needs 100 sends queued behind a wedged
   drainer, so at current volume it is a symptom of a *long* outage, not an early warning.

None of the abandoned counters — `riviera_mail_confirmation_abandoned_total`, its #374 sibling
`riviera_mail_cancellation_abandoned_total`, #373's `riviera_mail_payment_due_abandoned_total`, or
#124's `riviera_mail_request_declined_abandoned_total` /
`riviera_mail_request_expired_abandoned_total` —
is in that order, deliberately: they never rise because
of a relay, so seeing any of them during an outage means you have found a *second*, unrelated fault.

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
underneath them. Milliseconds rather than a `Duration` because Jakarta Mail reads the interpolated value
as a plain number.

**The ceiling is a per-pool share of a PLATFORM budget, not a mail one — every drain adds.** The
registry executor and the recovery dispatcher are separate beans, and Spring runs their `destroy()`
methods sequentially on one thread, so at the shipped 10s the pair can hold shutdown for **20s**, not
10 — and since #404 `booking`'s refund bulkhead claims a further 5s on the same window. The combined
figure is what has to fit Render's ~30s SIGTERM→SIGKILL grace, leaving the rest for the web layer and
Hikari to close in order — affordable here only because `server.shutdown` is *not* graceful, so no
request-draining phase competes for it.

Since **#456** that arithmetic lives in one place: `shared/ShutdownBudget` states `SIGTERM_GRACE_MS`
and every pool's claim against it, and `ShutdownDrainArchitectureTest` **discovers** draining pools
from bytecode and asserts their claims sum inside the grace. It reads call sites rather than the
`ApplicationContext` deliberately — the two bulkhead pools are `defaultCandidate = false` and the
recovery dispatcher's pool is not a bean at all, so a context scan would miss a third of the budget
and report healthy.

**Note the shipped default sits AT the per-pool ceiling, so this knob only tunes downward.** That is not
an oversight: you cannot simultaneously have a relay budget larger than the grace and a drain that
covers it, and the ceiling forces that trade-off to fail at boot rather than hide. If a real relay
genuinely needs more than 10s per socket operation (#370 is the first point that is knowable), the fix
is **not** to raise this past its range — raise the platform's shutdown grace first
(`ShutdownBudget.SIGTERM_GRACE_MS`), then this module's claim, and the per-pool ceiling follows.
Lowering the knob is always safe and shortens both the relay budget and the drain together. And a
**new draining pool anywhere** — mail or not — fails `ShutdownDrainArchitectureTest` until it is
accounted for and its claim declared, which is the check the previous, mail-scoped one could not be:
that one asserted `SHUTDOWN_BUDGET_MS * DRAINING_POOLS <= MAIL_SHUTDOWN_BUDGET_MS`, where the left
operand was *defined* as the right divided by the same factor, so it could never fail — and it did not
fail when pool #3 landed.

**When the drain window expires, an in-flight send is abandoned, never interrupted.** For the registry
vehicle that costs nothing — the publication stays outstanding and the next start (or the #405 admin lever) republishes it, so
expect `riviera.outbox.pending` to carry a redeploy's unfinished sends briefly. For the recovery
vehicle it is a mail that is simply gone — one the recipient re-requests on the recovery kinds, and
one **nobody** re-sends when it is the `operator-approved` notice (ADR-0011 decision 5, amended #439).
Which of the two it was, the counter now tells you: since #442 the `abandoned` reason carries `kind`
like its siblings, so do not read an abandoned increment as a self-healing loss — check the tag, and
on `operator-approved` go to that window's approval log. Since #434 the sends still **queued** at that
moment are counted — `riviera.mail.recovery.dropped{reason="abandoned"}`, one `WARN` line each,
carrying the submitting request's correlation id — and the one caught **running** deliberately is not,
because it may already have reached the relay. The non-interruption is deliberate for that same
reason: an interrupt cannot tell a send that already handed off to the relay from one that has not, and
interrupting the first is how at-least-once becomes a duplicate mail.

### `riviera_mail_cancellation_abandoned_total` (counter, #374)

**The sibling of `riviera_mail_confirmation_abandoned_total`, and read exactly the same way** — same
vehicle, same three `reason` tag values, same invisibility to every other signal. A cancellation mail
the registry listener **gave up on** because the booking, the set, or the guest contact did not
resolve; the listener returns *normally*, so the publication is marked complete and
`riviera_outbox_pending` never moves.

**Read one increment as: a booking was cancelled and the tourist has no written record of it —
including, where a refund applied, no record of the money owed back.** Two things follow, and the
order matters:

1. **The money is not affected by this loss.** The refund is issued on a different subscriber to the
   same event (`booking`'s own `BookingCancelled` listener → `payment`'s `RefundPort`) and the payout
   reversal on a third (invariant #9). None of them is touched by a failed mail. Confirm the refund
   actually moved — check `riviera_refunds_failed` and the booking's payment record — *then* worry
   about the mail.
2. **Nothing re-drives the mail**, the #405 admin lever included, for the same reason as its sibling:
   the publication was completed on the normal return. There is no per-booking resend yet (#380), so
   reaching the tourist is out-of-band once the underlying data fault is fixed.

Unlike the confirmation's remedy, this one involves **no bearer credential**: the cancellation record
is not a credential and can be re-sent by ordinary means. The arrival code that appears in the mail
is dead the moment the booking is `CANCELLED`.

| Tag | Meaning | Which module to investigate | Alert when |
|---|---|---|---|
| `reason="no-booking"` | `BookingNotificationFacts.notificationInfo` found no booking for the cancelled booking id | `booking` | **any increase** |
| `reason="no-set"` | `SetBookingFacts.setBookingInfo` found no set for the event's set id | `venue` | **any increase** |
| `reason="no-contact"` | `CustomerLookup.findById` found no contact for the booking's customer id | `customer` | **any increase** |

> **Data-integrity signal, not a relay signal** — the whole argument on the confirmation counter above
> applies unchanged: all three rows are FK-protected, no code path deletes a booking, and erasure and
> the retention sweep tombstone in place. Start at the module in the table, not at the relay.

**Why a separate series instead of `kind="cancellation"` on the confirmation counter.** #442 tagged
the two `MAIL_RECOVERY_*` series by `kind` because *"recovery"* there names the **vehicle**, so a
dimension for the flow was the missing piece. This name states the **flow**, so
`riviera_mail_confirmation_abandoned_total{kind="cancellation"}` would be a contradiction rather than
a dimension — and renaming the shipped one to something vehicle-shaped is barred by the standing rule
that a shipped metric name breaks whatever reads it. What #442's lesson *does* reach is the `reason`
dimension: both series read it off one enum (`notification.application.MissingBookingFact`), so a
filter written for one works verbatim on the other and `no-set` cannot become `no_set` across them.

**Do not sum the abandoned counters.** They are acted on differently — see the numbered steps
above, the confirmation's invariant-#7 errand, which has no analogue here, and #373's deadline, which
makes its errand expire.

**Logging is one `ERROR` per loss, unthrottled**, for the same three reasons as its sibling: zero in a
healthy system so it cannot flood, no durable copy of the mail, and nothing else recording the loss.
Lines carry the booking and set ids — which is what tells you *which* refund to go confirm — and
never the arrival code or the address (invariant #7).

### `riviera_mail_payment_due_abandoned_total` (counter, #373)

**The third of the abandoned series** — same vehicle, same three `reason` tag values off the same
enum, same invisibility to `riviera_outbox_pending`, same "do not sum" rule, same data-integrity
reading. The mail is the one an accepted Request-mode booking's guest gets telling them payment is
due and by when.

**What makes this one different is that it is a *deadline* you are racing, not a record you are
reconstructing.** The other two describe something already settled; this one is the guest's only
notice that an accepted request must be paid for. So read one increment as a **prediction**: unless
someone reaches that guest out-of-band, the abandoned-payment sweep will expire the booking at its
`payBy` and release the set, and the venue will have held a spot for nothing.

1. **Get the deadline first.** The `ERROR` line carries it alongside the booking and set ids,
   precisely so you do not have to derive it. It is `accepted_at + booking.request.pay-window`
   (default `PT12H`) — the same instant the sweep enforces, because both come off `RequestWindows`.
2. **Act before it, or not at all.** Reaching the guest after `payBy` is pointless: the set is gone
   and they would have to request it again. Nothing re-drives the mail — the #405 admin lever
   included — because the publication was completed on the normal return.
3. **Then fix the data fault** at the module named in the table below, so the next accept mails.

| Tag | Meaning | Which module to investigate | Alert when |
|---|---|---|---|
| `reason="no-booking"` | `BookingNotificationFacts.notificationInfo` found no booking for the accepted booking id | `booking` | **any increase** |
| `reason="no-set"` | `SetBookingFacts.setBookingInfo` found no set for the event's set id | `venue` | **any increase** |
| `reason="no-contact"` | `CustomerLookup.findById` found no contact for the booking's customer id | `customer` | **any increase** |

**Logging is one `ERROR` per loss, unthrottled**, for its siblings' three reasons. Lines carry the
booking id, the set id and the deadline — never the arrival code, never the pay link that embeds it
(invariant #7), never the address.

> **The separate-series argument is the cancellation counter's, verbatim:** this name states a
> **flow**, so it cannot be a `kind` tag on a counter named for a different flow, and the shipped
> names stay. Only the `reason` dimension is shared, off one enum, so a filter written for any of the
> three works on all three.

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
