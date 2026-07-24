# Observability (D4) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use `- [ ]` tracking.

> **Riviera discipline:** this slice touches the `payment` money path and the platform edge.
> The Payment & payout section is a first-class spec section. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give the single-instance soft launch production observability — structured JSON logs
carrying a correlation id, an **authenticated** Prometheus metrics endpoint that does not weaken the
#75 actuator lockdown, three measurable money-path failure signals (outbox backlog / failed refunds /
webhook 5xx), and an in-app scheduled self-check that emits a structured ERROR alert when a signal
crosses threshold — with the alert route + Grafana upgrade path documented in a runbook.

**Architecture:** The single most significant decision — **all observability infrastructure lives at
the platform edge (root package `ai.riviera.platform`)**, next to `RateLimitFilter` / `WebCorsConfig`:
a `CorrelationIdFilter`, a metrics `@Configuration`, and the money-path alert self-check. The **only**
in-module touch is surfacing the failed-refund signal (preferably as an edge gauge over persisted
payment state; a `MeterRegistry` counter inside `payment`'s own `RefundService` only if no such state
exists — self-observation, not a boundary crossing). Prometheus is exposed **authenticated
(OPERATOR)**, never public — only `/actuator/health` stays anonymous, so the #75 lockdown holds.

**Persistence:** JDBC only (invariant #1). **No Flyway migration** — no schema change. The outbox
gauge and the alert self-check issue a read-only `SELECT count(*) FROM event_publication` via
`JdbcClient` against the Spring Modulith registry table (V8), which no bounded context owns.

**Source of intent:** GitHub issue #100 (epic #93, improvement-plan D4); `docs/architecture/improvement-plan.md` §D4.

**Skills consulted:** `riviera-sdlc` (routing gate + issue-intake grill), `riviera-plan-doc` (this doc),
`riviera-modulith` (edge-vs-module placement: observability is root/edge, not a bounded context; the
payment counter is self-observation, not a boundary crossing), `riviera-java-conventions` (`OncePerRequestFilter`
+ `@ConfigurationProperties` + `MeterRegistry` idioms, SLF4J parameterized + CRLF log-injection guard §10,
constructor injection, package-private edge components), `riviera-stripe-payments` (the failed-refund
signal sits on the refund-execution path; webhooks are the source of truth — the 5xx metric observes the
existing signature-verified webhook, changes nothing about it). `postgres` — **considered, not loaded**:
the only SQL is a trivial read-only `COUNT(*)` over the Modulith registry table, no schema/index/DDL
design. No frontend → `riviera-frontend`/`angular-developer`/`playwright-cli` not triggered.
`riviera-local-debug` — load before the first `./gradlew` of the implement stage.

**Branch:** `feature/observability` (created off `main`, exists before phase 0).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given an inbound HTTP request, when it is handled, then a correlation id is placed in
  MDC (`correlationId`), echoed in the `X-Correlation-Id` response header, and cleared after the
  request; an inbound `X-Correlation-Id` carrying CRLF or an over-long/invalid value is **not**
  reflected verbatim (regenerated instead — log-injection safe, §10). *Pinned by:* `CorrelationIdFilterTest`.
- [ ] **AC-2:** Given structured console logging is enabled (`logging.structured.format.console=ecs`),
  when a log line is emitted during a request, then the line is valid JSON and contains the
  `correlationId` field. *Pinned by:* `StructuredLoggingIT` (`OutputCaptureExtension`).
- [ ] **AC-3:** Given the extended actuator exposure, when `/actuator/prometheus` is requested
  anonymously it returns **401**, and with an authenticated operator session it returns **200** with a
  Prometheus text body; the sensitive endpoints (`env/beans/…/metrics/modulith`) stay **401**-anon /
  **404**-operator and `/actuator/health` stays public. *Pinned by:* `ActuatorHardeningIT` (extended).
- [ ] **AC-4:** Given N pending rows in `event_publication`, when the `riviera.outbox.pending` gauge is
  read, then it reports N. *Pinned by:* `OutboxBacklogGaugeIT` (Testcontainers).
- [ ] **AC-5:** Given a refund that fails, when the refund path completes, then the failed-refund
  signal is measurable (an edge gauge over persisted refund-failure state, **or** the
  `riviera.refunds.failed` counter increments) and an ERROR is logged (no booking code / PII).
  *Pinned by:* `RefundFailureMetricTest` (payment module/unit test).
- [ ] **AC-6:** Given a 5xx from the webhook endpoint, when metrics are scraped, then it is countable
  via `http.server.requests` tagged with the webhook `uri` and a `5xx` outcome. *Pinned by:*
  `WebhookMetricIT` (or a documented query + a light assertion the timer is registered for the uri).
- [ ] **AC-7:** Given a pending-outbox backlog above its configured threshold, when the money-path
  self-check runs, then it logs exactly one structured ERROR naming the signal and value; when every
  signal is under threshold, it logs nothing at ERROR. *Pinned by:* `MoneyPathAlertCheckTest`
  (`OutputCaptureExtension`).
- [ ] **AC-8:** The runbook documents the three signals, the in-app ERROR-log alert route (incl. the
  Render log-drain step), and the Grafana Cloud scrape upgrade path (with the PromQL alert
  expressions). *Verified by:* presence + review (doc AC, no unit test).

## Non-goals

- External Prometheus/Grafana scraper provisioning, dashboards, or any paid/hosted metrics account —
  documented as an **upgrade path** only (no account is created).
- Distributed tracing / a Micrometer Tracing bridge, and **automatic MDC propagation across async
  `@ApplicationModuleListener` threads**. A single correlation id cannot span the reserve request and
  the later webhook request anyway (separate HTTP requests, possibly hours apart) — the durable
  cross-boundary key is the **booking id** logged on money-path lines (see R-5). v1 documents this.
- Alerting on infra signals (CPU / memory / latency) — Render's own service metrics cover those.
- ShedLock / multi-instance correctness. The new self-check inherits the single-instance posture
  (D3 / `docs/deploy/production-hardening.md`); scale-out is out of scope.
- Changing the actuator posture beyond adding `prometheus` (health `show-details`/`roles` unchanged).
- Any frontend change.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. No existing surface (page/endpoint/flow) is retired; the
actuator exposure is *extended* (health → health+prometheus), not replaced, and that extension is
covered by AC-3.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Injecting `MeterRegistry` into a `payment` module service breaks `@ApplicationModuleTest`/slice tests (no micrometer autoconfig in the slice — recurring class: new edge dep breaks module/web-slice tests) | med | med | **Prefer an edge gauge over persisted refund-failure state** (zero payment-code change); only if none exists, add the counter + a `SimpleMeterRegistry` test bean to the payment module test | Ivo | open |
| R-2 | Extending `management.endpoints.web.exposure.include` re-opens the #75 lockdown | med | high | Add **only** `prometheus`, authenticated (not public); extend `ActuatorHardeningIT` to pin 401-anon / 200-operator for prometheus **and** re-assert the sensitive list unchanged (AC-3) | Ivo | open |
| R-3 | Structured JSON format garbles local-dev / test console output | med | low | Env-driven: property **unset by default** (local = plain text); only the deployed env sets `ecs`. Test enables it explicitly via `@SpringBootTest(properties=…)` | Ivo | open |
| R-4 | Correlation-id inbound header = log injection / id spoofing (CRLF forging) | med | med | Sanitize: accept an inbound value only if it matches a bounded charset+length allowlist, else regenerate a UUID; never log the raw header (§10) — AC-1 | Ivo | open |
| R-5 | "Correlation id across a booking's full flow" is unachievable with one request-scoped id (reserve and webhook are separate requests; async listeners run on another thread with no MDC) | high | low | Scope the request id to intra-request tracing; use the **booking id** as the durable cross-request/cross-thread key on money-path log lines. Documented as a Non-goal, not a defect | Ivo | open |
| R-6 | The self-check adds a third scheduled job | low | low | It lives at the **edge**, not in `booking`, so it does not count toward the improvement-plan B3 "third scheduler in `booking`" split trigger. Single-instance posture inherited (D3) | Ivo | open |
| R-7 | `http.server.requests` may not tag the webhook `uri` stably (or is disabled) | low | med | Verify the webhook path is a static templated uri and the timer registers with the prometheus registry; light IT / documented query — AC-6 | Ivo | open |
| R-8 | Flyway version collision | n/a | n/a | **No migration in this slice** — no `V<n>` claimed; nothing to collide (verified: only two Dependabot FE PRs open, no backend/migration in flight) | Ivo | closed — no migration |

## Open questions / Assumptions

_All entries resolved — see **### Resolved** below._

- ~~**Open question:** failed-refund persisted state vs counter~~ → **resolved (phase 2):** counter in `RefundService`.
- ~~**Open question:** webhook `uri` + `http.server.requests` enablement~~ → **resolved (phase 2):** `/api/payments/stripe/webhook`; timer live (pinned by `HttpServerRequestMetricsIT`).
- ~~**Assumption:** `event_publication` = incomplete-only under archive mode~~ → **confirmed (phase 2)** against `V8`.
- ~~**Assumption:** Boot 4 `ecs` emits JSON with MDC, no logstash dep~~ → **confirmed (phase 1)** by `StructuredLoggingIT`.

### Resolved

- **Boot 4 named-registry export gate (phase 0):** adding `micrometer-registry-prometheus` + exposing
  `prometheus` is **not** enough on Boot 4.1 — a named registry's export is skipped unless enabled
  (`PrometheusMetricsExportAutoConfiguration` fails `@ConditionalOnEnabledMetricsExport`, since
  `management.defaults.metrics.export.enabled` resolves false; only `simple` is on by default). Fixed
  by `management.prometheus.metrics.export.enabled=true`. — resolved in phase 0.
- **SecurityConfig needs no change (phase 0):** the `@Order(1)` chain's `securityMatcher` already
  covers `/actuator/**` and terminates in `anyRequest().authenticated()`, so an exposed
  `/actuator/prometheus` is 401-anon / 200-operator automatically. No new matcher added (avoids a
  redundant rule); pinned by the extended `ActuatorHardeningIT`. — resolved in phase 0.
- **OQ-1 failed-refund signal (phase 2):** `RefundResult` is sealed `Refunded | Failed`; `RefundService`
  returns the gateway result with **no persisted failure state**, so the signal is a **counter**
  (`riviera.refunds.failed`) incremented in `RefundService` on `Failed`. `MeterRegistry` is a framework
  bean (not a cross-module dep), so ModularityTests + ResponsibilitiesArchitectureTests stay green.
- **OQ-2 outbox table + webhook uri (phase 2):** `event_publication` holds only incomplete rows
  (completed → `event_publication_archive`), so `count(*)` over it is the backlog. Webhook uri =
  `/api/payments/stripe/webhook` (static → stable `http.server.requests` `uri` tag).
- **R-1 (phase 2):** no payment `@ApplicationModuleTest` exists and web slices mock `RefundPort`, so
  injecting `MeterRegistry` into `RefundService` broke nothing (only `RefundServiceTest`'s direct
  construction needed the extra arg). No `SimpleMeterRegistry` test bean needed.
- **Phase-1 config-collision bug (fixed in phase 2):** `StructuredLoggingIT`'s nested
  `@SpringBootConfiguration` was a second config-finder candidate → would break auto-detection for
  every `@SpringBootTest` in the base package (incl. `ActuatorHardeningIT`) in the full suite.
  `@TestConfiguration` is supplemental (re-adds `PlatformApplication`), so the fix is the full-app
  Testcontainers pattern with no nested config — caught locally before CI.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice adds no write path to `availability(set_id,
booking_date)` and no reservation/claim logic. The outbox self-check performs a **read-only**
`SELECT count(*)` against the Modulith registry table (`event_publication`), never `set_availability`
— so the `ResponsibilitiesArchitectureTests` sole-writer rule (invariant #2) is untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | root/edge (`ai.riviera.platform`, **not a module**) | existing | — | Cross-cutting infra (filter, metrics config, alert self-check) lives at root per ADR-0007 / `riviera-modulith` — the root is where `SecurityConfig`/`WebCorsConfig`/`RateLimitFilter` sit |
| M-2 | `payment` | existing | `Payment` | Only if the failed-refund signal needs a counter — it sits in `payment`'s own `RefundService` (self-observation of its refund execution; no cross-boundary reach) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| — | none | — | — | — | No new published surface. No module calls another; observability reads framework infra (`MeterRegistry`, `event_publication`) at the edge. |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | — | No new events; nothing published or subscribed. |

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Correlation-id filter, structured-log config, Prometheus metrics config, outbox gauge, money-path alert self-check | root/edge | `riviera-modulith`: app-wide config + servlet filters live in the **root package only; the root is not a module**. Not a bounded-context concern; crosses no `@ApplicationModule` boundary. |
| Failed-refund signal (gauge over persisted state, or counter in `RefundService`) | `payment` | `payment` **Job:** owns Stripe collection incl. refund execution — counting/observing its **own** refund failures is self-observation, **not** on any Not-My-Job list. It does not re-decide the refund (still `booking`'s policy) nor touch the ledger (`payout`). |
| Read `event_publication` count | root/edge | The Modulith registry table is framework infra owned by **no** bounded context; reading it at the edge crosses no module boundary and is not `set_availability` (invariant #2 sole-writer rule untouched). |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect** (unchanged — this slice adds no payment behavior).
- **Confirmation trigger:** signature-verified webhook (unchanged). The webhook-5xx metric **observes**
  the existing `StripeWebhookController`; it does not alter signature verification, dedupe, or the
  transaction (invariant #8 intact).
- **Idempotency:** unchanged. No charge/refund is created by this slice; it only **counts** a failed
  refund that the existing `RefundService` already produces.
- **Money:** no amount is computed or moved; metrics are counts/gauges (no money on the wire).
- **Payout-ledger effect:** none — the slice does not accrue or reverse; it only measures.
- **Refund policy applied:** none — the failed-refund signal is instrumentation on the **execution**
  path (`payment`), never a refund *decision* (which stays `booking`'s, invariant #10).
- **Pinning tests:** `RefundFailureMetricTest` (AC-5), `WebhookMetricIT` (AC-6); existing
  `WebhookIdempotency`/refund tests stay green (behavior unchanged).

## Angular — frontend surfaces touched

N/A — backend-only. No component, route, service, or e2e change.

## FE↔BE contract

N/A — no API shape change. `/actuator/prometheus` is an operational endpoint (not consumed by the
SPA); the `X-Correlation-Id` response header is additive and not part of any typed client contract.

## Execution status

> Session-recovery anchor. Re-read this + the current `riviera-sdlc` reference file after any
> compaction before acting. Update in the same commit window as the change it records.

**Stage pointer:** `CI/PR gate` — all 4 build phases done + GREEN on branch; ready to push, confirm CI, open PR.

**Next action:** Push `feature/observability`; confirm the CI run is green (esp. the full backend suite —
the correlation filter + the stripe-gated scheduler are the shared-state classes CI reveals); merge
latest `origin/main`; open the PR into `main`; run the Review gate (`riviera-review-overlay`) + Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Prometheus endpoint + dependency, lockdown preserved | ✅ | `8c0859b` |
| 1 — Correlation-id filter + structured JSON logging | ✅ | `251caf5` |
| 2 — Money-path metrics (outbox gauge · failed-refund · webhook 5xx) | ✅ | `7122fd7` |
| 3 — In-app scheduled self-check → ERROR alert + runbook | ✅ | `MoneyPathAlertCheck` + `MoneyPathAlertProperties` + `MoneyPathAlertCheckTest` (6 green) + `docs/runbooks/observability.md` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate / Sonar-gate / red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (RV-STYLE-1) | 2-line inline comment on the `lastFailedRefunds` field in `MoneyPathAlertCheck` | fixed |
| F-2 | review (correctness) | outbox gauge's `Supplier` could be weak-ref GC'd (Micrometer footgun) → gauge would report NaN | fixed — `.strongReference(true)` |
| F-3 | review (walk) | RV-BE-1/7/8/9/11/13 + RV-PROC-1 all clear (see review note) | no change needed |

---

## File structure

> Files to create/modify. Root package = `platform/src/main/java/ai/riviera/platform/`.

- `platform/build.gradle` — add `implementation 'io.micrometer:micrometer-registry-prometheus'`.
- `platform/src/main/resources/application.properties` — extend `management.endpoints.web.exposure.include`
  to `health,prometheus`; update the #75 comment; add the env-driven `logging.structured.format.console`
  placeholder + the alert-threshold + self-check schedule properties.
- `.../CorrelationIdFilter.java` — **new**, root, package-private `OncePerRequestFilter`: MDC id +
  response header + inbound sanitization.
- `.../ObservabilityConfig.java` — **new**, root `@Configuration`: registers the
  `riviera.outbox.pending` gauge (JdbcClient count) and (if scheduling needed here) `@EnableScheduling`.
- `.../MoneyPathAlertCheck.java` — **new**, root, package-private `@Component @Profile("stripe")`:
  `@Scheduled` self-check evaluating the three signals against thresholds → structured ERROR.
- `.../MoneyPathAlertProperties.java` — **new**, root `@ConfigurationProperties`: thresholds + schedule.
- `.../SecurityConfig.java` — add an explicit `/actuator/prometheus` authorization matcher (pin intent;
  it already falls through to `authenticated()`).
- `payment/.../RefundService.java` (or an edge gauge) — surface the failed-refund signal (per OQ-1).
- `platform/src/test/.../ActuatorHardeningIT.java` — extend for `/actuator/prometheus` (AC-3).
- `platform/src/test/.../{CorrelationIdFilterTest,StructuredLoggingIT,OutboxBacklogGaugeIT,RefundFailureMetricTest,WebhookMetricIT,MoneyPathAlertCheckTest}.java` — **new** tests.
- `docs/runbooks/observability.md` — **new** runbook (AC-8).
- `docs/architecture/improvement-plan.md` — mark D4 shipped (close-out).

---

## Phase 0 — Prometheus endpoint + dependency, lockdown preserved

**Files:** Modify `build.gradle`, `application.properties`, `SecurityConfig.java` · Test
`ActuatorHardeningIT.java`

Rationale: smallest independently-valuable move, and it de-risks the highest-impact risk (R-2, the
lockdown) first. TDD: extend `ActuatorHardeningIT` red → add dependency + exposure + auth rule green.

- [ ] **Step 1:** Extend `ActuatorHardeningIT` — `/actuator/prometheus` anonymous → 401; with operator
  session → 200 + body starts with Prometheus text (`# HELP`/`# TYPE`); re-assert the sensitive list
  and public health unchanged.
- [ ] **Step 2:** Run `./gradlew test --tests "*ActuatorHardeningIT*"` → FAIL (prometheus 404, not exposed).
- [ ] **Step 3:** Add `micrometer-registry-prometheus`; set `management.endpoints.web.exposure.include=health,prometheus`;
  update the #75 comment; add an explicit `.requestMatchers("/actuator/prometheus").authenticated()` (or
  `hasRole(OPERATOR)`) before `anyRequest().authenticated()` in `apiSecurityFilterChain`.
- [ ] **Step 4:** Run it → PASS.
- [ ] **Step 5:** Generalization audit — any other actuator endpoint that should now be exposed? (No —
  only prometheus; metrics stays blocked.) Record.
- [ ] **Step 6:** Commit — `perf/obs: expose authenticated /actuator/prometheus without weakening the #75 lockdown (#100)`.
- [ ] **Step 7:** Update Execution status.

## Phase 1 — Correlation-id filter + structured JSON logging

**Files:** Create `CorrelationIdFilter.java` · Modify `application.properties` · Test
`CorrelationIdFilterTest.java`, `StructuredLoggingIT.java`

- [ ] **Step 1:** `CorrelationIdFilterTest` — filter sets MDC `correlationId`, echoes `X-Correlation-Id`,
  clears MDC after the chain, and regenerates when the inbound header is CRLF/over-long/invalid (AC-1).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `CorrelationIdFilter extends OncePerRequestFilter` (root, package-private):
  read + sanitize inbound `X-Correlation-Id` (allowlist regex + max length) else `UUID`; `MDC.put` in
  try / `MDC.remove` in finally; set the response header. Order it early (ahead of `RateLimitFilter`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** `StructuredLoggingIT` (`@SpringBootTest(properties="logging.structured.format.console=ecs")`
  + `OutputCaptureExtension`) — a logged line is valid JSON containing `correlationId` (AC-2). Add the
  env-driven `logging.structured.format.console=${LOGGING_STRUCTURED_FORMAT_CONSOLE:}` placeholder
  (unset → plain text locally; deployed env sets `ecs`).
- [ ] **Step 6:** Generalization audit — do the key money-path INFO/ERROR lines carry the booking id
  (the durable cross-request/thread key, R-5)? Grep the sweep/confirm/refund loggers; add the id where
  missing (never the booking **code**, invariant #7). Record.
- [ ] **Step 7:** Commit + update Execution status.

## Phase 2 — Money-path metrics (outbox gauge · failed-refund · webhook 5xx)

**Files:** Create `ObservabilityConfig.java` · Modify `RefundService.java` *(or edge gauge)* · Test
`OutboxBacklogGaugeIT.java`, `RefundFailureMetricTest.java`, `WebhookMetricIT.java`

- [ ] **Step 1:** Resolve OQ-1/OQ-2 — read `V8`, `RefundService`, `RefundResult`, `PaymentStatus`, and
  `StripeWebhookController`'s mapping. Pick: outbox gauge query; failed-refund via persisted state
  (edge gauge, preferred) or counter; webhook uri for the `http.server.requests` query.
- [ ] **Step 2:** `OutboxBacklogGaugeIT` (Testcontainers) — seed N pending publications, assert
  `riviera.outbox.pending` reads N (AC-4). RED first.
- [ ] **Step 3:** `ObservabilityConfig` registers the gauge via `Gauge.builder(...).register(registry)`
  backed by a `JdbcClient` `SELECT count(*) FROM event_publication`. → PASS.
- [ ] **Step 4:** `RefundFailureMetricTest` — a failed refund makes the signal move + logs ERROR
  (no code/PII) (AC-5). RED → implement per OQ-1 → PASS. If a counter is added, provide a
  `SimpleMeterRegistry` test bean for the payment module test (R-1).
- [ ] **Step 5:** `WebhookMetricIT` — a 5xx from the webhook uri is countable via `http.server.requests`
  (AC-6); or assert the timer is registered for the uri + document the PromQL query.
- [ ] **Step 6:** Generalization audit — other money-path failures worth a counter? (Scope guard:
  only the three issue signals; note extras, don't build.) Record.
- [ ] **Step 7:** Commit + update Execution status.

## Phase 3 — In-app scheduled self-check → ERROR alert + runbook

**Files:** Create `MoneyPathAlertCheck.java`, `MoneyPathAlertProperties.java`,
`docs/runbooks/observability.md` · Modify `application.properties`, `ObservabilityConfig.java`
(scheduling if needed) · Test `MoneyPathAlertCheckTest.java`

- [ ] **Step 1:** `MoneyPathAlertCheckTest` (`OutputCaptureExtension`) — backlog > threshold → exactly
  one structured ERROR naming the signal + value; all signals under threshold → no ERROR (AC-7).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `MoneyPathAlertCheck` (root, `@Component @Profile("stripe")`, `@Scheduled(fixedDelayString/
  initialDelayString)` mirroring `AbandonedBookingScheduler`): read backlog (JdbcClient), failed-refund +
  webhook-5xx deltas (MeterRegistry), log one ERROR per crossed threshold. Thresholds + schedule via
  `MoneyPathAlertProperties` (`@ConfigurationProperties`). Ensure `@EnableScheduling` is active for it.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Write `docs/runbooks/observability.md` (AC-8): the three signals + their metric
  names/queries; the in-app ERROR-log alert route + the Render log-drain step; the Grafana Cloud scrape
  **upgrade path** with PromQL alert expressions; the single-instance caveat (cross-ref
  `production-hardening.md` / ADR-0004).
- [ ] **Step 6:** Generalization audit — record.
- [ ] **Step 7:** Commit + update Execution status.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-24 | Phase 1 (R-5 durable key) | money-path loggers carry the booking id? | `grep 'log\.(info\|warn\|error)\(' booking/payment/payout` | ~30 per-booking lines all log `booking {}`/`bookingId`; only aggregate roll-ups are count-only | No change — booking **id** (not the bearer **code**, invariant #7) is already the consistent cross-request/thread key. R-5 satisfied by existing code; filter adds intra-request id on top. |
| 2026-07-24 | Phase 2 (money-path metrics) | other money-path failures worth a counter? | reviewed `booking`/`payment`/`payout` failure paths | webhook 5xx (covered by `http.server.requests`), failed refunds (counter added), payout-reversal-not-found (`log.warn` in `BookingCancelledPayoutListener`) | Scope guard: only the **three** issue signals. Payout-reversal-not-found noted as a future signal; not built (scope). |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-7:** each pinning test above passes (`./gradlew test --tests "*<Class>*"`), recorded with sha.
- [ ] **AC-8:** `docs/runbooks/observability.md` present with all three signals + both routes.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — JdbcClient count only.
- [ ] **Availability** N/A justified; no write to `set_availability`; sole-writer rule untouched (invariant #2).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new events; `ModularityTests` green (invariant #11).
- [ ] **Payment/payout** section filled; webhook/refund behavior unchanged; the failed-refund signal is on the execution path, not a refund decision (invariants #8, #9, #10).
- [ ] Booking codes never logged (invariant #7); untrusted correlation header sanitized (§10, R-4).
- [ ] No Flyway migration (no schema change) — R-8 closed.
- [ ] `ActuatorHardeningIT` proves the #75 lockdown held (only health public; prometheus authenticated).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
