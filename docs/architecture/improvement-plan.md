# Riviera Sunbed Booking — Improvement Plan

> **What this is.** A single, sequenced improvement plan grounded in direct inspection of the `main` source tree, folding together the threads we've worked through: (1) go-live readiness, (2) Modulith/DDD/hexagonal architecture refinements, and (3) the new `operator` module the multi-operator launch forces. It opens with an honest snapshot of the current state, then lays out the work in priority order with explicit triggers and trade-offs.

---

## Part 1 — Current state of the code (as inspected)

### What's genuinely strong

The codebase is well past scaffold quality and ahead of its own `docs/`. The architecture is disciplined and the hard parts are done correctly.

**Module structure.** Six Spring Modulith modules — `venue` (1,294 LOC), `availability` (486), `booking` (2,426), `payment` (1,072), `payout` (1,054), `customer` (122) — each with `@ApplicationModule` and **explicit deny-by-default `allowedDependencies`**, plus `@NamedInterface` for `api` and `spi`. The dependency graph is acyclic and the directions are right: `payment` and `venue` depend on nothing; `booking` depends on `venue::api`/`availability::api`/`payment::api`/`customer::api`; `payout` depends only on `booking::api`/`venue::api`. The event direction is correct — `booking` listens to `payment` events, `payout` listens to `booking` events, never the reverse (verified: `payment` imports no `booking` types).

**Concurrency / no-double-booking (invariant #2).** `JdbcAvailabilityClaim` uses atomic `INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING` behind a `UNIQUE(set_id, booking_date)` constraint (`V4`), rows-affected deciding the winner — no `SELECT … FOR UPDATE`. `ReserveSetService` validates, claims, and inserts the `AWAITING_PAYMENT` booking in one committed transaction **before** any Stripe call, so no row lock is held across the network round-trip. Backed by `ConcurrentClaimIT`, `ConcurrentReservationIT`, `StaffMarkVsOnlineClaimConcurrencyIT`.

**Money path.** Real Stripe (`StripePaymentGateway`, `stripe` profile): PaymentIntents with deterministic idempotency keys (`booking-<id>-pi`), `createWithRecovery` that replays once on `ApiConnectionException` to recover an intent orphaned by a lost response, refunds/cancels with their own keys reading authoritative Stripe state first. The webhook (`StripeWebhookController`) verifies the signature on the raw body, dedupes on Stripe `event.id` via `ON CONFLICT`, runs in one transaction, and treats `payment_failed` as non-terminal. Source of truth is the webhook, never the client (invariant #8).

**Event spine / outbox.** `ConfirmBookingService` publishes `BookingConfirmed` from a single seam shared by the stub and webhook paths. Consumers use `@ApplicationModuleListener` (async, after-commit, own transaction). The Modulith JDBC registry is configured well: `completion-mode=archive`, `republish-outstanding-events-on-restart=true`, schema owned by Flyway (`V8`, verbatim Modulith 2.1 v2 structure), not auto-initialized.

**Abandonment.** No `HELD` state needed — the claim writes `BOOKED_ONLINE` directly; `AbandonedBookingSweepService` (15-min TTL, `stripe` profile) cancels the PaymentIntent first, then releases only on an authoritative `Canceled` outcome via the same guarded `UPDATE … RETURNING` path the webhook uses, so sweep and webhook can never double-act.

**Value objects.** `VenueId`, `BookingId`, `SetId` are immutable records; `Money` is a record validating non-negative minor units + currency in its canonical constructor (invariant #5). Cross-module references are id-only.

**Cross-cutting.** Per-IP + per-code token-bucket rate limiting (`RateLimitFilter`); CORS from config; codes never logged; Stripe errors log codes only. Architecture is fitness-tested: `ModularityTests` (`ApplicationModules.verify()`), `JdbcOnlyArchitectureTests`, `NoStripeConnectArchitectureTest`. Multi-stage Dockerfile runs non-root with `MaxRAMPercentage`.

### Where the strain and gaps are

1. **Authorization is a single shared `OPERATOR` account with no per-venue ownership.** Every venue-scoped endpoint (`VenueAdminController`, `StaffBookingController`, `AdminPayoutLedgerController`, staff availability, weather refund) takes `venueId` from the path and authorizes on role alone. Verified by reading the controllers: nothing checks that the authenticated operator owns the path venue. With multiple operators, operator A can read/modify operator B's bookings (including codes), payout ledger, and beach map by changing the id. This is OWASP API #1 (BOLA).

2. **`VenueCatalog` is a god-port.** One `venue::api` interface now carries seven methods serving four different consumers (tourist read model, availability's pool check, booking's reserve facts, payout/booking's rate config). Coarser dependency arrows than the actual coupling.

3. **Published `api` packages mix two axes.** Ports ("call-me" interfaces) cohabit with published domain vocabulary (value objects, identifiers, events) under one named interface — the "`api` is becoming a domain package day by day" drift.

4. **Request-to-Book is not implemented.** `PENDING_REQUEST`/`DECLINED` exist in the enum, but there's no accept/decline use case, host-response deadline, or payment-request-on-accept. Only Instant Book is wired end to end.

5. **Validation and error handling are ad-hoc.** No `spring-boot-starter-validation` anywhere (confirmed: zero `jakarta.validation`/`@Valid` usages). DTOs validate by hand in `toCommand()` throwing `IllegalArgumentException`; each controller maps it with a local `@ExceptionHandler`. Error bodies are `{"error": CODE}` maps, not RFC-7807 `ProblemDetail`. It works, but it's per-controller boilerplate with no consistent error contract.

6. **No actuator/production hardening.** No `management.*` config — health is exposed but there's no readiness/liveness split, no endpoint lockdown, no graceful shutdown.

7. **Single-instance assumptions are load-bearing and undocumented.** In-memory rate-limit buckets (ADR-0004) and the lockless sweep are both correct only on one instance. Two instances → duplicate Stripe cancels + per-instance rate limits.

---

## Part 2 — Improvement plan

The work splits into four workstreams. **A** (launch safety) and **B** (the architecture refactor) should interleave, because the `operator` module is both a launch blocker *and* the cleanest demonstration of the refactored conventions. **C** (enforcement) lands during **B** to lock the new structure in. **D** is product scope.

### Workstream A — Launch blockers (multi-operator)

**A1. Introduce the `operator` module and enforce per-venue ownership.** *(P0, gating)*

This is the headline launch blocker and it doubles as the seventh module that the architecture refactor will model. Design:
- A new `operator` (or `identity`) Modulith module owning operator accounts and the operator↔venue ownership mapping. It is *not* `venue` (that's layout/pricing), *not* `customer` (that's tourist guest-checkout).
- Publish a minimal query port in `operator::api` — `OwnsVenue(operatorId, venueId) → boolean`, or `ownedVenues(operatorId) → Set<VenueId>`.
- Enforce ownership in the **application service** of every venue-scoped command/query (not the controller), so no adapter can bypass it; reject non-ownership with `403`. Platform-wide admin (`/api/admin/payout-batches`) stays role-gated.
- Replace the single `InMemoryUserDetailsManager` operator with real per-operator credentials (the delegating password encoder is already in place); add provisioning/rotation.
- **Tests are part of the deliverable**: for every venue-scoped endpoint, operator A → operator B's id → assert `403`. This is the one weakness of the row-discriminator model and must be tested deliberately.
- Optional defence-in-depth, deferrable to P1: PostgreSQL Row-Level Security keyed on the operator's venue set, so a forgotten `WHERE venue_id = ?` is a non-event.

**A2. Secrets, TLS, credential model.** *(P0)* Per-operator credentials with rotation; TLS termination in front of the app; Stripe live keys + webhook secret + DB creds injected as environment secrets (the config already expects this — confirm the deploy wiring).

**A3. Actuator / production-readiness.** *(P0, small)* Split readiness/liveness probes; lock down actuator exposure (health public, rest authenticated or separate port); add `server.shutdown=graceful` with a drain timeout so in-flight bookings/webhooks finish on deploy.

### Workstream B — Architecture refinement

**B1. Split `VenueCatalog` by consumer role.** *(High value, low risk — do early)*

Break the god-port into role-named interfaces inside `venue::api`; implementations don't move, you're only narrowing what each consumer imports:
- `VenueCatalog` → tourist read model (`findVenueMap`, `listVenues`)
- `SetBookingFacts` → `setBookingInfo`, `poolOf` (consumed by `booking` and `availability`)
- `VenueRates` → `commissionBps`, `lateCancelRefundBps` (consumed by `payout`, `booking`)

This makes the `ModularityTests` dependency arrows honest — `availability` then depends only on the pool-check surface, not the whole catalog.

**B2. Separate published vocabulary and events from ports.** *(Directly addresses the `api`-drift)*

Restructure each module's published surface into distinct named interfaces along the two axes that are currently fused:
- `api` → ports only ("call-me" interfaces)
- a vocabulary named interface (e.g. `api.types` or `vocabulary`) → value objects + identifiers (`Money`, `VenueId`, …)
- an events named interface (e.g. `events`) → published domain events (`BookingConfirmed`, `PaymentConfirmed`, …)

This lets a listener-only consumer (`payout`) depend on `booking::events` without importing `booking`'s command surface, and it's the structural half of fixing the drift. The enforcement half is C2.

**B3. Decide and document module-split triggers for `booking`.** *(No action now — set the trigger)*

`booking` is already the largest module and will grow with Request-to-Book and the ownership checks. Don't split it now (it's cohesive around the lifecycle). Watch two seams: cancellation/refund policy (`CancellationPolicy`, `RefundPolicy`, weather refunds) and the staff/operational read side (`DailyBookingsService`, staff controllers). **Trigger to extract:** Request-to-Book pushing `booking` past ~3,500 LOC, or a third distinct scheduler appearing.

**B4. Read-model module (deferred, trigger-based).** The `venue → availability` inversion via `venue::spi` is correctly reasoned and tested — leave it. *If* the dated read side grows more overlays (pricing seasons, weather holds, promotions), introduce a dedicated query module depending on both `venue::api` and `availability::api` that owns the composed browse/map views, collapsing the inversion. Over-engineering today; note it as a trigger.

### Workstream C — Enforcement (extend the existing ArchUnit fitness tests)

The structural moves in B (splitting `VenueCatalog`, separating ports from vocabulary and events) are only durable if a test fails when someone violates them. The repo already enforces architecture with hand-written rules (`JdbcOnlyArchitectureTests`) and Spring Modulith's `ModularityTests` — extend that same baseline rather than adding a new dependency. Sequence this **during** workstream B: land each structural move green first, then add the rule that locks it in (never debug a refactor and a new rule's false positives at once).

**C1. The published-surface placement rule.** *(Highest-leverage for the `api`-drift)* Add an ArchUnit rule (alongside `JdbcOnlyArchitectureTests`) that enforces the B2 split: a ports `api/` named interface must contain only interfaces (ports), not value/record types; published events live only in the events named interface; published vocabulary (typed ids, value records) lives only in the vocabulary surface. Key the rule off package/naming conventions (e.g. the `events` / vocabulary package names from B2) since there's no annotation taxonomy to match on. This converts "the `api` package is becoming a domain package" from a review judgment call into a build failure — exactly while B2 is drawing those lines.

**C2. Keep the role split honest.** Add a rule (or extend `ModularityTests` expectations) that prevents new methods being piled onto the `VenueCatalog` god-port after the B1 role-split — e.g. assert the role-named interfaces (`SetBookingFacts`, `VenueRates`) are the home for their respective concerns, so a regression is caught.

**C3. The cross-venue authorization test is the enforcement that matters most.** The single most important fitness function added in this plan is **not** an architecture rule — it's the A1 cross-venue denial test matrix (operator A → operator B's id → `403`) for every venue-scoped endpoint. Treat it as part of the enforcement baseline: it must exist and stay green for the multi-operator invariant (#13) to hold.

**C4. Encode the machine-checkable half of `RESPONSIBILITIES.md`.** `RESPONSIBILITIES.md` (Job / Not-My-Job per module) has a **structural** subset that ArchUnit can enforce — convert those to fitness functions so the boundaries don't rely on review memory:
- **Sole-writer:** no class outside `availability` writes the `(set, date)` state table (the mechanical form of "`availability` is the only writer" / invariant #2).
- **No forbidden reach:** `booking` (and every non-`payment` module) must not import the Stripe SDK or `payment.infrastructure`; no module imports another module's `domain`/internal packages (only its `api/`). Much of this is already `ApplicationModules.verify()`; add the Stripe-import rule explicitly.
- **Id-based events:** event record components in the events named interfaces are id/value types, not aggregates from any `domain` package (the Need-To-Know / invariant #11 boundary).

What ArchUnit **cannot** encode is the **semantic** half — a refund *policy* reimplemented inside `payment`, commission *math* inside `venue` — because those need no illegal import. That half is the job of the plan-time Module-ownership table (plan-doc §4a) and review item **RV-BE-11**. State this split explicitly so no one assumes green ArchUnit means boundaries are fully enforced: the fitness functions are necessary, not sufficient.

**C5. Encode the package-shape (ADR-0007), after migration completes.** Once the restructure to the two-template layout has landed for every module, add an ArchUnit rule (alongside `JdbcOnlyArchitectureTests`) that locks the shape so it can't regress:
- **Allowed top-level set** — each module's top-level packages ⊆ `{api, spi, application, domain, adapter}`; a thin (serviceless) module ⊆ `{api, adapter}`. Fails a lingering `infrastructure/` or a reintroduced `application/in`|`application/out`.
- **Adapter direction, not technology** — under `adapter/`, the immediate children are `in`/`out` (technology may nest below); no top-level `adapter/rest`|`jdbc`|`event`.
- **`api`/`spi` top-level** — the `@NamedInterface` packages are direct children of the module, never nested under `application`.
- **Hexagon direction** — `application`/`domain` must not depend on `adapter.*` (adapters depend inward, never the reverse).

Sequence this **last** — enforcing the shape before the migration is done just means fighting a rule mid-move. The thin-vs-full *judgment* stays review-only (`riviera-review-overlay` RV-BE-12); C5 is the structural half. This is the fitness function for `ADR-0007`, exactly as C4 is for `RESPONSIBILITIES.md`.

**On DDD-stereotype tooling:** a library-based approach (annotating aggregates/value objects/events and verifying them) was considered and **deliberately not adopted** — the existing hand-written ArchUnit + `ModularityTests` baseline already covers what this project needs, and the structural rules above are expressible without a new dependency in the runtime/build. Don't reintroduce one for this.

### Workstream D — Product scope and post-launch hardening

**D1. Request-to-Book.** *(P0 or P1 — your product call)* If a venue can launch Instant-only, defer and ship the flows you have. If it must be live day one: accept/decline endpoints (operator-authorized via A1), a soft-hold on `PENDING_REQUEST`, a host-response-deadline sweep mirroring the abandoned-payment sweep, and the post-accept PaymentIntent leg (the `AWAITING_PAYMENT`-onward machinery already exists and is reused unchanged). Note: the existing sweep is lockless-on-one-instance; build the new deadline sweep the same way and document the same constraint, or add ShedLock now if you expect to scale.

**D2. Consistent validation + error contract.** *(P1)* Either adopt `spring-boot-starter-validation` with `@Valid` on DTOs, or keep the explicit-validation style but centralize it. Replace the per-controller `{"error": CODE}` + local `@ExceptionHandler` with one `@RestControllerAdvice` emitting RFC-7807 `ProblemDetail` with stable error codes. Removes boilerplate and gives clients one error shape.
> **Shipped by #97:** `ApiProblem` factory + single `ApiErrorHandler` advice (RFC-7807 + `code` extension, locked by `ErrorContractArchitectureTests`); validation stays centralized-explicit (`toCommand()`, no Bean Validation starter — decision recorded in `docs/plans/error-contract-problemdetail.md` and `riviera-java-conventions` §6b); Angular + the mocked e2e suite parse the `code` extension.

**D3. Document the single-instance constraint; plan for scale-out.** *(P1)* Add a "do not run more than one instance until X" note to the deploy runbook. Before any horizontal scale: ShedLock on both sweeps, and move rate-limit state to a shared store (Redis).

**D4. Observability.** *(P1)* Structured JSON logging with correlation ids; Micrometer/Prometheus metrics; alerts on incomplete `event_publication` rows (the outbox backlog), failed refunds, and webhook 5xx.

**D5. GDPR / legal + backups.** *(P1)* Privacy policy + terms at checkout; retention schedule; right-to-erasure workflow (with the statutory-retention exception for tax/payment records); DPAs with Stripe and the host. Confirm automated Postgres backups + PITR on the deploy plan and run one restore drill. (Code-side PII hygiene is already good.)

**D6. Disputes + reconciliation.** *(P1/P2)* Handle `charge.dispute.created`; daily reconciliation sweep against Stripe events with a recovery script.

---

## Part 3 — Sequencing

**Milestone 1 — Launch-safe for multi-operator.** A1 (operator module + per-venue ownership + denial tests), A2 (secrets/TLS), A3 (actuator). D1 only if Request-to-Book must be live. This is the minimum to put multiple operators on real money safely.

**Milestone 2 — Architecture clean-up, enforced.** B1 (split `VenueCatalog`) → B2 (separate vocabulary/events) → C1 (published-surface placement rule) → C2 (keep the role split honest). Land each structural move green under existing rules before adding the matching rule that locks it in. The new `operator` module from M1 gets the conventions applied as the reference example.

**Milestone 3 — Production hardening.** D2 (validation/error contract), D3 (scale-out readiness), D4 (observability), D5 (GDPR/backups), D6 (disputes/reconciliation). Parallelizable; none blocks a single-instance soft launch.

**Standing triggers (not scheduled):** B3 (split `booking` at ~3,500 LOC or a third scheduler), B4 (read-model module if dated reads grow), and scale-out work (the moment a second instance is on the table).

---

## Caveats
- Grounded in direct inspection of the uploaded `main` archive; class names, SQL, config, and the absence of `jakarta.validation` are quoted from the actual source. I read the money-path, concurrency, security, config, and the venue/payout/booking controllers and value types in full, and spot-checked the rest; a file I didn't open could shift a P1 detail but not the priority order.
- The Request-to-Book P0/P1 call is a product decision, not a safety one — everything else here is ordered by launch safety for the confirmed multi-operator scenario.
- Stripe/PCI specifics (SAQ A via Elements) and GDPR specifics should be confirmed with the Stripe Dashboard PCI wizard and counsel respectively, given EU tourist PII.
