# Actuator / Secrets / TLS Production Hardening — Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox syntax.

**Goal:** Lock down the backend's operational-exposure surface for multi-operator launch —
pin actuator web-exposure to an explicit allowlist (only `health`, details restricted),
prove no secret is committed (all externalized to env), and document/confirm the production
TLS posture — with a regression test that sensitive actuator endpoints are not publicly
reachable, and **no behavior change to any business endpoint**.

**Architecture:** The single significant decision is *how* to lock actuator down. Today there
is **no `management.*` config at all** — the app rides Spring Boot's defaults (only `health`
web-exposed, `show-details=never`), which is *accidentally* safe but unpinned and untested. We
make the allowlist **explicit** (`management.endpoints.web.exposure.include=health`) and set
health-detail policy to `when-authorized` (public probe sees `{"status":"UP"}`; an
authenticated operator sees component details), backed by a Docker-gated `@SpringBootTest` IT.

**Persistence:** JDBC only (invariant #1). **No tables/migrations touched** — config + docs +
test only.

**Source of intent:** GitHub issue **#75** (part of #72, item 03/10 — P0 launch blocker).

**Skills consulted:** `riviera-sdd` (routing gate — backend config only, no module-structure
change so `riviera-modulith` not central per the issue), `riviera-plan-doc` (this plan),
`riviera-java-conventions` (the IT: JUnit5 + Testcontainers, `@EnabledIfDockerAvailable`,
plain asserts, no new libs), `riviera-review-overlay` (review gate). `postgres` — N/A (no
schema change). `angular-developer`/`playwright-cli` — N/A (no frontend surface).

**Branch:** `claude/riviera-sdd-75-6797zd` (exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the app is running, when an **unauthenticated** client GETs a sensitive
  actuator endpoint (`/actuator/env`, `/actuator/beans`, `/actuator/mappings`,
  `/actuator/configprops`, `/actuator/heapdump`, `/actuator/threaddump`, `/actuator/loggers`,
  `/actuator/modulith`), then it is **not reachable** (`401`, never `200` with a body).
  *Pinned by:* `ActuatorHardeningIT.sensitiveEndpointsAreNotPubliclyReachable`
- [ ] **AC-2:** Given the app is running, when an **authenticated operator** GETs a sensitive
  actuator endpoint that is not on the exposure allowlist, then it returns `404` (proves it is
  **not exposed at all**, not merely auth-gated). *Pinned by:*
  `ActuatorHardeningIT.sensitiveEndpointsAreNotExposedEvenToOperator`
- [ ] **AC-3:** Given the app is running, when an **unauthenticated** client GETs
  `/actuator/health`, then it returns `200` with `status: UP` and **no** `components`/`details`
  in the body (details restricted). *Pinned by:*
  `ActuatorHardeningIT.healthIsPublicButHidesDetailsFromAnonymous`
- [ ] **AC-4:** Given the app is running, when an **authenticated operator** GETs
  `/actuator/health`, then it returns `200` and **includes** component details (details shown
  when authorized). *Pinned by:* `ActuatorHardeningIT.healthShowsDetailsToOperator`
- [ ] **AC-5:** No secret is present in committed source/config: every credential
  (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `SPRING_DATASOURCE_*`, `RIVIERA_OPERATOR_PASSWORD`)
  resolves from the environment with an empty/placeholder default. *Verified by:* grep audit +
  `docs/deploy/production-hardening.md` §Secrets (the local `compose.yaml` dev password is
  `developmentOnly` and never shipped).
- [ ] **AC-6:** The production TLS expectation is documented and its enforcement point named
  (Render terminates TLS at the edge; DB over `sslmode=require`). *Verified by:*
  `docs/deploy/production-hardening.md` §TLS.

## Non-goals

- No change to any business endpoint's behavior, routing, or auth (AC constraint).
- **Not** enabling `server.forward-headers-strategy` in this slice — see Risk R-2 / Open
  questions: it would strip `X-Forwarded-For` before `RateLimitFilter`'s `ClientIpResolver`
  reads it (a behavior interaction), and nothing currently consumes the forwarded *scheme*.
  Deferred with rationale, not forgotten.
- No secret-manager / vault integration (env vars are the store, per ADR-0004 + Render).
- No EU-sovereign PROD hosting migration (separate deferred issue per ADR-0004).
- No new actuator endpoints (metrics/prometheus/info stay off).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Pinning exposure accidentally hides `health`, breaking Render's health check + the CD poll (`deploy.yml` greps `"status":"UP"`) | low | high | Allowlist **includes** `health`; `when-authorized` still returns `{"status":"UP"}` to the anonymous probe; AC-3 asserts it | agent | open |
| R-2 | Enabling Spring forwarded-header handling strips `X-Forwarded-For` before `ClientIpResolver`, changing per-IP rate-limit keying (behavior change) | med | med | Do **not** enable it this slice; document the app already reads `X-Forwarded-For` itself; record as considered/deferred | agent | open |
| R-3 | Health `when-authorized` leaks component details to the anonymous probe if misconfigured | low | med | AC-3 explicitly asserts anonymous body has **no** `components` | agent | open |

## Open questions / Assumptions

- **Assumption:** CI's `ubuntu-latest` has Docker, so the `@EnabledIfDockerAvailable` IT runs
  (the existing `AdminPayoutSecurityIT` / `WeatherRefundSecurityIT` rely on the same). — *Owner:*
  agent · *Resolves by:* CI gate.
- **Assumption:** `management.endpoint.health.show-details=when-authorized` + `roles=OPERATOR`
  is the intended "appropriately restricted" policy (vs `never`). Chosen as best-practice: keeps
  operator visibility while the public probe stays minimal. — *Owner:* agent · *Resolves by:*
  review gate.

### Resolved

- **`forward-headers-strategy`?** Considered; **deferred** — interacts with the existing
  `ClientIpResolver` and has no current forwarded-scheme consumer (R-2). Documented in
  `production-hardening.md` §TLS as a future item.

## Availability & concurrency (invariant #2)

N/A — does not touch `booking`, `availability`, or the beach map. Config/docs/test only; no
write path to `availability(set_id, booking_date)`.

## Spring Modulith — modules, interfaces, events

N/A for module structure — no new module, `api/`/`spi/` port, event, or class move. The only
Java added is a root-package (`ai.riviera.platform`) integration test alongside the existing
`WebCorsConfigTest` / `AdminPayoutSecurityIT`; the changed config is `application.properties`.
No cross-module import introduced.

**Module-ownership table:** all in the application root (security/actuator config is an
app-level concern, not a bounded-context capability) — no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. (AC-5 *verifies* the Stripe keys are externalized, but no payment/refund
logic changes.)

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no API shape change. Actuator is an ops surface, not a business contract; health's public
body stays `{"status":"UP"}` (unchanged for Render).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Actuator exposure hardening (test + config) | ✅ | this commit |
| 1 — Secrets + TLS documentation | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**RED→GREEN evidence:** with the pre-change default config, `ActuatorHardeningIT` ran 4 tests
with `healthShowsDetailsToOperator` **FAILED** (`PathNotFoundException` on `$.components.db.status`
— default `show-details=never`); the 3 lockdown-guard tests passed on defaults (they pin the
allowlist against regression). After adding the `management.*` block all 4 pass, and the full
`./gradlew build` is green (`BUILD SUCCESSFUL in 1m 56s`).

---

## File structure

- `platform/src/test/java/ai/riviera/platform/ActuatorHardeningIT.java` — **new.** Docker-gated
  `@SpringBootTest` + `@AutoConfigureMockMvc` IT (models `AdminPayoutSecurityIT`) proving
  AC-1..AC-4.
- `platform/src/main/resources/application.properties` — **modify.** Add the `management.*`
  exposure allowlist + health-detail policy block.
- `docs/deploy/production-hardening.md` — **new.** Actuator exposure, secrets externalization
  matrix, TLS termination posture (AC-5, AC-6).
- `docs/plans/actuator-secrets-tls-hardening.md` — this plan.

---

## Phase 0 — Actuator exposure hardening (test-first)

**Files:** Create `ActuatorHardeningIT.java` · Modify `application.properties`

- [ ] **Step 1:** Write `ActuatorHardeningIT` (AC-1..AC-4).
- [ ] **Step 2:** Run it → FAIL (defaults: health details hidden already, but the test pins the
  *intended* contract; run to confirm the assertions are exercised, then lock config).
- [ ] **Step 3:** Add the `management.*` block to `application.properties`.
- [ ] **Step 4:** Run `./gradlew test --tests "*ActuatorHardeningIT*"` → PASS.
- [ ] **Step 5:** Generalization audit — is any other actuator endpoint sensitive + reachable?
  (exposure allowlist = `health` only closes all of them at once.)
- [ ] **Step 6:** Commit.
- [ ] **Step 7:** Update execution status.

## Phase 1 — Secrets + TLS documentation

**Files:** Create `docs/deploy/production-hardening.md`

- [ ] **Step 1:** Grep-audit the repo for committed secrets; record the externalization matrix.
- [ ] **Step 2:** Write the doc (actuator posture, secrets matrix, TLS termination + DB SSL,
  the deferred forward-headers note).
- [ ] **Step 3:** Commit + update execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-4:** `./gradlew test --tests "*ActuatorHardeningIT*"` → PASS.
- [ ] **AC-5:** grep audit shows no literal secret; env placeholders only.
- [ ] **AC-6:** `production-hardening.md` §TLS present.

## Review gate note

`/code-review origin/main...HEAD` (scoped to this slice's commit) + `riviera-review-overlay`
run at high effort — **no findings**. Overlay: RV-BE-1 / payment-webhook / RV-BE-9 ➖ (no
booking/availability/money/venue-scoped surface); RV-BE-11/12 ✅ (app-level config in the root
package, no module/package move); RV-PROC-1 ✅ (`riviera-java-conventions` + `riviera-plan-doc`
listed; no migration/frontend/module-structure). Role matching (`when-authorized` + role
OPERATOR) and 401-vs-404 exposure semantics are verified green by `ActuatorHardeningIT` itself.

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying test/check.
- [ ] No placeholders / TODO in the doc.
- [ ] No JPA introduced (invariant #1) — no persistence change at all.
- [ ] Availability section justified N/A.
- [ ] Modulith: no cross-module import; test in root package.
- [ ] Payment/payout N/A justified; Stripe keys confirmed externalized (AC-5).
- [ ] No business-endpoint behavior change (health public body unchanged).
- [ ] Execution-status table matches reality.
- [ ] Open Questions empty or deferred with rationale.
