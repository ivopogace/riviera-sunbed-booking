# Restructure `payment` to the ADR-0007 layout Implementation Plan

> **Right-sized doc.** This is a **pure move-class refactor** (package/import renames,
> no behavior change) — part of the ADR-0007 restructure series (#76 customer, #77
> availability, #78 payout, #79 venue; this is **08/10** of #72). Per `riviera-sdlc` Rule 6
> this class of change normally skips the plan doc; it is written for a durable record because
> `payment` is a **money module** carrying the webhook-as-source-of-truth + idempotency
> invariant (#8) and the most driven adapters in the series (real Stripe gateway, stub
> gateway, two JDBC repos). Sections that cannot bite on a mechanical move are `N/A` with a
> reason. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Move the `payment` module into the ADR-0007 full-template package shape
(`api/` + `application/` + `domain/` + `adapter/in` + `adapter/out`) with zero behavior
change, proven by the safety net (`ModularityTests`, `JdbcOnlyArchitectureTests`, the full
`payment` suite incl. the webhook/idempotency ITs) staying green.

**Architecture:** ADR-0007 exploits the inside/outside asymmetry — `application` + `domain`
are the inside; `adapter/in` (driving: `StripeWebhookController` — the signature-verified
Stripe webhook endpoint) and `adapter/out` (driven: the four adapters +
Stripe SDK wiring) are the outside. `payment` owns **no cross-module inversion** — it has
no `spi/`; it publishes an inbound `api/` (`CheckoutPort`, `CancelPaymentPort`, `RefundPort`,
`Money`, the id/result records, and the `PaymentConfirmed`/`PaymentCanceled` events) and keeps
its single `domain/` enum (`PaymentStatus`). `allowedDependencies` is `{}` and stays `{}`.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — the JDBC
repositories moved package only (`infrastructure/out` → `adapter/out`), SQL unchanged.

**Source of intent:** GitHub issue #80 (part of #72, item 08/10).

**Skills consulted:** `riviera-modulith` (re-read the two-template + `api`-vs-`spi` sections;
confirmed the full-template fold `application/out` → `application/`, `infrastructure/{in,out}`
→ `adapter/{in,out}`, `api/` kept top-level `@NamedInterface`, no `spi/`, `allowedDependencies`
untouched, and the allowed top-level package set ⊆ `{api, application, domain, adapter}`);
`riviera-java-conventions` (verified the move preserves the Java idioms — JDBC-only/no-JPA,
records, package-private adapters kept package-private, no Lombok; the dropped imports were
redundant same-package ones); `riviera-stripe-payments` (confirmed the Stripe SDK + webhook
adapters are driven-side infrastructure — the gateway/JDBC repos and the `StripeConfig`/
`StripeProperties` SDK wiring all belong in `adapter/out`; the webhook controller is the one
driving adapter, `adapter/in`; collect-only/#8 untouched). No `postgres` (no SQL/schema
change), no frontend skills (backend-only).

**Branch:** `claude/riviera-sdlc-issue-79-jgtbnp` (designated branch for this task).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the payment module in the ADR-0007 layout, when `ModularityTests` runs,
  then `ApplicationModules.verify()` passes (no cycle, no illegal internal access, `payment`
  `allowedDependencies = {}` still resolves). *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [ ] **AC-2:** Given the moved JDBC repositories + gateways, when `JdbcOnlyArchitectureTests`
  runs, then no JPA type is introduced. *Pinned by:* `JdbcOnlyArchitectureTests`.
- [ ] **AC-3:** Given the moved controllers/adapters/services, when the `payment` suite runs,
  then all payment tests are green, unchanged — **including the webhook-as-source-of-truth and
  idempotency tests (invariant #8)**. *Pinned by:* `StripeWebhookIT`, `StripeWebhookListenerFailureIT`,
  `PaymentServiceTest`, `RefundServiceTest`, `PaymentCancelService` path, `JdbcPaymentsIT`,
  `StripePaymentGatewayTest`, `StubPaymentGatewayTest`, `StripeConfigTest`,
  `NoStripeConnectArchitectureTest`, `PaymentMigrationIT`, `EventRegistryMigrationIT`.
- [ ] **AC-4:** Given the final package tree, when inspected, then the shape is
  `api/` + `application/` + `domain/` + `adapter/in` + `adapter/out` (no `spi/`, no lingering
  `infrastructure/`, no `application/out`); `api/` is top-level `@NamedInterface`; all four
  driven adapters live in `adapter/out`; and `payment` `allowedDependencies = {}` is unchanged.
  *Pinned by:* `ModularityTests` + package-tree/`git diff` inspection.

## Non-goals

- No behavior change, no logic change, no SQL change.
- **No api-split** — `CheckoutPort`/`Money`/etc. are not decomposed here.
- No new `spi/` — `payment` owns no cross-module inversion.
- No widening/narrowing of `allowedDependencies` (`{}` stays `{}`).
- Not touching the sibling ADR-0007 restructures (`booking` is 09/10, still on the old layout).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A stale import/package decl left behind → compile break | low | med | Post-move grep proves zero remaining `payment.application.out` / `payment.infrastructure` refs; full compile + tests green | claude | |
| R-2 | Behavior drift hidden by the move (esp. webhook/idempotency #8) | low | high | Pure rename only; the webhook/idempotency ITs (`StripeWebhookIT`, `StripeWebhookListenerFailureIT`) run for real and stay green | claude | |
| R-3 | The bytecode-scan test's **hardcoded class path** (`NoStripeConnectArchitectureTest` L76: `infrastructure/out/StripePaymentGateway.class`) not updated → false failure | med | med | Explicitly rewrite the hardcoded path to `adapter/out/StripePaymentGateway.class`; a `git mv` alone would miss it | claude | |
| R-4 | An accidental edit to `allowedDependencies` (`{}`) | low | med | AC-4 check: `git diff` on `payment/package-info.java` shows only javadoc changed, `allowedDependencies = {}` intact | claude | |

## Open questions / Assumptions

_None open._

### Resolved

- **Drift caught (issue-intake gate): where do `StripeConfig` + `StripeProperties` go?** The
  issue text lists only `infrastructure/in` → `adapter/in` and `infrastructure/out` →
  `adapter/out`, but **two config classes sit directly in `infrastructure/`**
  (`StripeConfig` `@Configuration`, `StripeProperties` `@ConfigurationProperties`) — not under
  `in`/`out`. ADR-0007's allowed top-level package set is `{api, spi, application, domain,
  adapter}`, so `infrastructure/` must be **fully** removed. **Decision: both → `adapter/out`.**
  Rationale: they are driven-side Stripe **SDK wiring** — `StripeConfig` builds the
  `StripeClient` bean consumed by `StripePaymentGateway` (already `adapter/out`), and
  `riviera-stripe-payments` places the Stripe SDK on the driven/infrastructure side. Keeping the
  wiring beside the gateway it configures is the natural hexagonal home. (`StripeProperties`'
  `webhookSecret` is read by the inbound `StripeWebhookController` in `adapter/in`; a config
  *record* imported across the two adapter sub-packages within one module is fine — the ADR
  hexagon rule only forbids `application`/`domain` → `adapter`, and Modulith treats the module
  as one unit.) This sets the precedent `booking` will follow for its own config classes at 09/10.
- **`StripeConfigTest` moves with `StripeConfig`.** It exercises package-private `StripeConfig`
  (the `clientBuilder` timeout wiring), so it moves from `payment.infrastructure` to
  `payment.adapter.out` (test tree) to retain package-private access.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` `payment` never writes `availability(set_id, booking_date)`.
It confirms/cancels payments and publishes events; `availability` reacts elsewhere. No write path,
lock, or claim strategy is touched by a package move.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | Owns Stripe collection / PaymentIntents / refunds / webhook handling; the move only re-packages its own classes |

**Cross-module named interfaces (`api/` ports)**

| # | Interface | Kind | Declared in | Consumed by | Moved? |
|---|---|---|---|---|---|
| I-1 | `CheckoutPort` (+ `Money`, `BookingRef`, outcome records) | `api` (inbound) | `payment.api` | `booking` calls it | **No** — stays top-level |
| I-2 | `CancelPaymentPort`, `RefundPort` (+ `PaymentCancellation`, `RefundResult`) | `api` (inbound) | `payment.api` | `booking` calls them | **No** — stays top-level |
| I-3 | `PaymentConfirmed`, `PaymentCanceled` (events) | `api` (published events) | `payment.api` | consumed by `booking`/`payout` listeners | **No** — stays top-level |

No `spi/` — `payment` owns no dependency inversion. The move folds/renames only the module's
*internal* packages (`application.out` → `application`, `infrastructure.{in,out}` → `adapter.{in,out}`,
and the two `infrastructure/` config classes → `adapter/out`).

**Domain events (id-based payloads, invariant #11)**

`payment` publishes `PaymentConfirmed`/`PaymentCanceled` from `api/` — **unchanged**; no event
type, payload, or wiring is touched. Pure re-packaging of internals.

### Module-ownership table (§4a)

All changed classes stay in `payment`; no cross-module interaction added, removed, or moved.
`payment` has no cross-module dependency (`allowedDependencies = {}`) and that is unchanged.

## Payment & payout (invariants #5, #8, #9, #10)

- **#5 Money:** `Money` (integer minor units, EUR) is in `api/` — unmoved, no arithmetic touched.
- **#8 Webhooks as source of truth + idempotency:** the webhook controller
  (`StripeWebhookController`) moves package only (`infrastructure/in` → `adapter/in`); signature
  verification, event-id dedupe, and the idempotent state transition are **byte-for-byte
  unchanged**. The `StripeWebhookIT` / `StripeWebhookListenerFailureIT` ITs run for real and
  re-prove it (AC-3, R-2).
- **#9/#10 Payout/refund:** `RefundService` moves no logic; refund amount computation is
  server-side and untouched. `payout` is a separate module, not touched here.
- Collect-only / no Connect (ADR-0002): `NoStripeConnectArchitectureTest` still scans the
  gateway bytecode — its hardcoded probe path is updated to the new `adapter/out` location (R-3).

## Angular — frontend surfaces touched

`N/A — backend-only.`

## FE↔BE contract

`N/A — no contract change.` No endpoint path, method, or DTO shape changed — the webhook
controller moved package only; its `@RequestMapping` path and request handling are unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move + import rewrite + safety-net verify | ✅ | (this commit) |

**Safety net (run locally, real Testcontainers — not skipped):** `ModularityTests` ✅,
`JdbcOnlyArchitectureTests` ✅, `NoStripeConnectArchitectureTest` ✅, full
`ai.riviera.platform.payment.*` suite ✅ (incl. `StripeWebhookIT` / `StripeWebhookListenerFailureIT`
webhook + idempotency, invariant #8). Content diff = package/import/javadoc only, plus the single
`NoStripeConnectArchitectureTest` bytecode-probe path (R-3). `allowedDependencies = {}` unchanged.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

Moves (package/import renames only; `api/` + `domain/` unchanged and untouched):

- **`payment/application/out/*` → `payment/application/`**: `NewPayment`, `PaymentGateway`,
  `Payments`, `StripeWebhookEvents` — empty `out/` deleted; now-redundant same-package
  `application.out.PaymentGateway` imports dropped from `PaymentService`, `PaymentCancelService`,
  `RefundService` (main) and `PaymentServiceTest`, `RefundServiceTest` (test).
- **`payment/infrastructure/in/StripeWebhookController.java` → `payment/adapter/in/`**.
- **`payment/infrastructure/out/*` → `payment/adapter/out/`**: `JdbcPayments`,
  `JdbcStripeWebhookEvents`, `StripePaymentGateway`, `StubPaymentGateway` (the stub is a shipped
  `src/main` adapter → `adapter/out`, per the issue's rule).
- **`payment/infrastructure/{StripeConfig,StripeProperties}.java` → `payment/adapter/out/`**
  (see Resolved decision above); empty `infrastructure/` deleted.
- **`api/*`, `domain/*` — unchanged** (including `api/package-info.java`).
- **`payment/package-info.java`** — javadoc updated to the ADR-0007 layout;
  `allowedDependencies = {}` untouched.
- Test-side: mirror the package moves (`infrastructure/{in,out}` → `adapter/{in,out}`,
  `infrastructure/StripeConfigTest` → `adapter/out`); rewrite `application.out.*` →
  `application.*` imports in `WebSliceStubs`, the moved ITs, and the application tests; rewrite
  `infrastructure.StripeProperties` → `adapter.out.StripeProperties` in `WebSliceStubs` and
  `StripeWebhookController`; update the hardcoded bytecode-probe path in
  `NoStripeConnectArchitectureTest` (L76) `infrastructure/out/…` → `adapter/out/…`.

---

## Phase 0 — Move + import rewrite + safety-net verify

Executed as a single mechanical phase (no red-green TDD — a pure move has no new behavior to
drive test-first; the pre-existing tests are the safety net):

- [ ] `git mv` the classes into `application/` + `adapter/{in,out}`; delete empty
  `application/out` and `infrastructure/{,in,out}`.
- [ ] Rewrite package declarations + imports across main + test trees; verify zero remaining
  `payment.application.out` / `payment.infrastructure` references.
- [ ] Drop now-redundant same-package `PaymentGateway` imports (3 main + 2 test).
- [ ] Update the hardcoded class path in `NoStripeConnectArchitectureTest` (L76).
- [ ] Update `package-info.java` javadoc (layout only; `allowedDependencies = {}` untouched).
- [ ] Run the safety net: `./gradlew test --tests "*ModularityTests*"
  --tests "*JdbcOnlyArchitectureTests*"` → PASS; `./gradlew test --tests
  "ai.riviera.platform.payment.*"` → PASS.
- [ ] Commit + push to `claude/riviera-sdlc-issue-79-jgtbnp`.

---

## Review-gate note (PR #90)

Ran the SDLC review gate (`riviera-review-overlay` + `/code-review` on
`origin/main...HEAD`) — two independent finder passes (correctness + overlay conventions).
**No findings.** The content diff is exclusively package declarations, import statements, and
javadoc, plus the single `NoStripeConnectArchitectureTest` bytecode-probe path (a string a
`git mv` can't rewrite). Items walked:

- **RV-BE-12** (ADR-0007 package shape) ✅ — final top-level set `{api, application, domain,
  adapter}` ⊆ allowed; adapters split by direction; no `.in/.out` at the application layer;
  no lingering `infrastructure/`; `api` top-level `@NamedInterface`; no `application`/`domain`
  → `adapter.*` import.
- **RV-BE-3b/3c** (spi/api placement) ✅ — no `spi/` invented; nothing added to `api/` (the one
  `api/package-info.java` line is a javadoc accuracy fix).
- **RV-BE-11** (responsibility placement) ✅ — every changed file stays in `payment`
  (renames 88–98% similarity); no policy/calc moved between modules; no new writer to another
  module's table; no forbidden cross-module reach.
- **Invariant #8** (RV-BE-7/RV-CT-3) ✅ — `StripeWebhookController` is a 96% rename; signature
  verification and the idempotency dedup are byte-for-byte unchanged.
- **RV-PROC-1** ✅ — *Skills consulted* (`riviera-modulith`, `riviera-java-conventions`,
  `riviera-stripe-payments`) matches the payment-only backend diff (no migration/FE/SQL).
- Correctness (removed-behavior + cross-file) ✅ — dropped imports were genuinely same-package;
  every rewritten import points at the real landing package; probe path updated correctly.

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*ModularityTests*"` → PASS.
- [ ] **AC-2:** `./gradlew test --tests "*JdbcOnlyArchitectureTests*"` → PASS.
- [ ] **AC-3:** `./gradlew test --tests "ai.riviera.platform.payment.*"` → PASS (incl. webhook/idempotency ITs).
- [ ] **AC-4:** shape is `api/application/domain/adapter.{in,out}` (no `spi/`, no `infrastructure/`,
  no `application/out`); all four driven adapters in `adapter/out`; `git diff` shows
  `allowedDependencies = {}` unchanged.

## Self-review checklist (before merge / PR)

- [ ] Every AC has a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] Type & signature consistency (pure rename — signatures unchanged).
- [ ] **No JPA** introduced (invariant #1) — `JdbcOnlyArchitectureTests` green.
- [ ] **Availability** section justified N/A (payment never writes `(set,date)`).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports;
  `api` kept top-level `@NamedInterface`; no `spi/` invented; `allowedDependencies = {}`
  unchanged (invariant #11) — `ModularityTests` green.
- [ ] **Money/webhook** logic unchanged (invariants #5, #8) — webhook/idempotency ITs green;
  refund policy unchanged (#10); payout untouched (#9).
- [ ] Timezone handling unchanged (invariant #6); booking codes N/A (invariant #7).
- [ ] No schema change → no Flyway migration needed (invariant #12).
- [ ] **Frontend** N/A (backend-only).
- [ ] Execution-status table matches reality.
- [ ] Risk register has no stale rows; Open Questions empty.

> Remaining loop stages (post-plan): open PR → CI gate → Review gate
> (`riviera-review-overlay` RV-BE-12; RV-BE-3b confirms no `spi/` mis-placement) → Sonar gate → merge.
