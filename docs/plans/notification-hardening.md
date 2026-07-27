# Notification-module hardening (#386) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Close the four confirmed hardening gaps the post-merge `/code-review` fan-out found
over #382 (`63270f1`) — machine-lock the root-package discipline, make the DB agree with the Java
on email normalization, bound the suppression read that now runs on the mail drainer thread, and
prove the fire-and-forget wiring end-to-end — plus the cleanup sweep.

**Architecture:** The single most significant decision is **where the one canonical email
normalization lives: `customer::vocabulary`, not the `shared` kernel.** The issue proposed the
kernel; the intake grill proved that impossible — `shared` depends on `customer::api`/`::vocabulary`
while `customer` declares `allowedDependencies = {}`, so the three `customer`-side call sites would
have forced `customer → shared → customer::api`, a cycle of exactly the #371 shape. `customer` owns
the canonical form natively and every other consumer (`notification`, the root) is already granted
`customer::vocabulary`, so this needs **zero new module grants**. Second decision: the suppression
read's finite timeout is **scoped to the notification adapter's own `JdbcClient`**, never the global
`spring.jdbc.template.query-timeout`, which would also bound `availability`'s `SELECT … FOR UPDATE`
(invariant #2).

**Persistence:** JDBC only (invariant #1). One migration: **`V34__email_suppression_domain_normalization.sql`**
tightening the `domain` CHECK on `email_suppression`. No new table, no new column.

**Source of intent:** GitHub issue **#386** (+ its two coordination comments and the intake-grill
comment [#issuecomment-5097163522](https://github.com/ivopogace/riviera-sunbed-booking/issues/386#issuecomment-5097163522)).
Upstream: the `/code-review` fan-out over `63270f1` (#382, PR #385); ADR-0011 decision 5; ADR-0012.

**Skills consulted:**
- `riviera-sdlc` — routed the gate; issue-intake grill gate (this is an existing ticket).
- `grilling` — the intake pass that killed item 4's proposed home and re-scoped item 2 post-#388.
- `riviera-plan-doc` — this doc's structure; forced the Behavior-parity ledger (the fail-open change).
- `riviera-modulith` — placed `Emails` in `customer::vocabulary` (published surface by *kind*: a value
  helper, not a port); confirmed no `allowedDependencies` change is needed; the `spi`-vs-`api` rule
  did not apply (nothing is implemented by another module here).
- `postgres` — the `CHECK`-over-native-`ENUM` house style carried into the tightened `domain`
  constraint; named the new constraint explicitly instead of relying on PG's auto-generated name.
- `riviera-java-conventions` — records/no-Lombok, package-private adapters, §6 *catch the narrowest
  type* (the fail-open catch is `DataAccessException`, not `RuntimeException`), §6a name-your-literals
  (the timeout default), §6c one-line-or-no inline comments.
- `riviera-local-debug` — **to load before this session's first `./gradlew`** (phase 0 step 2).
- `riviera-review-overlay` — at the review gate.

**Branch:** `feature/notification-hardening` *(created before phase 0; local session, so the literal
branch name applies — no cloud-branch substitution)*

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a fixture root class importing a module surface outside the granted set
  (`notification.application`), when the root-discipline rule runs, then it fails naming that class —
  and the granted set is an **allowlist** (`customer`, `operator`, `notification::api`, `shared`)
  matching the test's own Javadoc, so a ninth module needs no test edit.
  *Pinned by:* `CompositionRootDisciplineTests.rootTouchesOnlyGrantedModuleSurfaces` +
  `CompositionRootDisciplineTests.ungrantedModuleSurfaceIsRejected` (fixture negative proof).

- [ ] **AC-2:** Given the production classpath as it stands today, when the allowlist rule runs, then it
  passes with **no production change** — the root's actual module imports are exactly
  `customer.api`, `customer.vocabulary`, `notification.api`, `operator.api`, `operator.vocabulary`,
  `shared.*`. *Pinned by:* `CompositionRootDisciplineTests.rootTouchesOnlyGrantedModuleSurfaces`.

- [x] **AC-3:** Given a hand-inserted `email_suppression` row whose `domain` carries edge whitespace
  (space, tab, newline, CR, form feed), is empty, or is not lower-case, when the insert runs, then
  Postgres rejects it — i.e. the DB rejects every `domain` value the Java writer could not produce,
  **and accepts every value it can** (an interior space survives `trim()`, so a blanket whitespace ban
  would be stricter than the writer and would raise a constraint violation on the drainer thread).
  *Pinned by:* `EmailSuppressionIT.theSchemaRejectsADenormalizedDomain` +
  `EmailSuppressionIT.aDomainTheWriterCanProduceIsStillAccepted`.

  > **Correction to this AC as first written.** It claimed NBSP (`U+00A0`) coverage. That was wrong in
  > two ways found while implementing: `String#trim()` strips only code points `<= U+0020`, so an NBSP
  > **is** producible by the writer and must stay acceptable for the two sides to agree; and Postgres's
  > `[:space:]` class is collation-dependent, so a blanket ban would not even mean the same thing in
  > every environment. V34 mirrors `String#trim()` exactly (`btrim(domain, E' \t\n\r\f\v')`) instead.

- [ ] **AC-4:** Given `suppress("user@")` (an address with an empty domain part), when it runs, then the
  adapter rejects it with `IllegalArgumentException` before touching the DB — closing the gap where
  `atIndex < 1` passed but stored an empty `domain`.
  *Pinned by:* `EmailSuppressionIT.aNonAddressWriteIsRejected` (extended case).

- [ ] **AC-5:** Given a suppression lookup that blocks longer than the configured timeout, when a
  recovery mail is dispatched, then the read aborts inside the timeout **and the mail is still sent**
  (fail-open, recovery vehicle only) rather than being silently dropped.
  *Pinned by:* `SuppressionQueryTimeoutIT.aWedgedSuppressionReadAbortsAndTheMailStillGoes`.

- [ ] **AC-6:** Given a suppression read that throws, when the **booking-confirmation** (registry)
  vehicle sends, then the exception still propagates so the Event Publication Registry retries —
  fail-open is scoped to recovery and does not leak to the at-least-once vehicle.
  *Pinned by:* `TransactionalMailServiceTest.aSuppressionReadFailureStillPropagatesOnTheRegistryVehicle`.

- [ ] **AC-7:** Given the six former private copies of `trim().toLowerCase(Locale.ROOT)`, when the slice
  lands, then exactly one definition exists (`customer.vocabulary.Emails#normalize`) and all six sites
  delegate to it — coverage by **deletion**, not by an agreement test.
  *Pinned by:* `EmailsTest` (contract, incl. the inputs the DB CHECK must agree on) + compilation.

- [ ] **AC-8:** Given the fully component-scanned application context (no `@Primary` synchronous
  dispatch override), when the `MailSender` bean **the edge actually receives** sends a password reset,
  then both the suppression read and the transport run on a `recovery-mail-` pool thread, never the
  caller's — so a future decorating/`@Primary` `MailSender` doing inline I/O fails the build.
  *Pinned by:* `MailSenderWiringIT.theEdgeInjectedMailSenderDispatchesOffTheCallersThread`.

- [ ] **AC-9:** Cleanup sweep done — `PackageShapeArchitectureTests` Javadoc names the real module set,
  `docs/plans/notification-module.md` no longer references the dropped `RecordedMailbox` probe, import
  grouping fixed in the five named files, `BookingConfirmationMailIT` seeds via one
  `seedConfirmedBooking` helper on the class's unique-date discipline, `ListenerMoveMigrationIT` drops
  its redundant try/finally. *Pinned by:* the existing suites staying green + review.

- [ ] **AC-10:** Sonar reports **0 new issues, 0 duplicated blocks, ≥80% new-code coverage** on the PR.
  *Pinned by:* the SonarCloud PR analysis (merge bar, `riviera-sdlc` pr-gates §2).

## Non-goals

- **The GDPR posture of the suppression list** — settled by ADR-0012 / #388, already merged. Not revisited.
- **The bounce-feed-conditional findings** — upsert out-of-order guard, unsuppress path (#391), the
  suppressed-skip log's booking id, the V31-class deploy-overlap window. All recorded on epic #367 for
  the #370-gated `adapter/in` slice.
- **The suppressed-mail UX gap (#390).**
- **A socket-level timeout backstop.** `queryTimeout` issues a PG cancel; a black-holed socket could
  still wedge the cancel itself. A connection-global `socketTimeout` is the instrument for that and has
  app-wide blast radius — recorded as R-7, deliberately deferred, not silently skipped.
- **Any change to the registry (booking-confirmation) vehicle's failure semantics** beyond proving they
  are unchanged (AC-6).
- **Re-opening `shared`'s membership.** `Emails` goes to `customer::vocabulary`; the kernel stays at four types.

## Behavior-parity ledger

> This slice **changes** one existing behavior and **preserves** the rest of the send chokepoint.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Recovery send: a suppression-**read** failure is swallowed and the mail is **dropped** (accepted drift Info-5) | **changed** → fail **open** | The read gets its own narrow `catch (DataAccessException)` → treat as "not suppressed" and send. Rationale: the list is empty in prod until #370's bounce feed lands; a user-requested reset to a suppressed address is the most harmless send available; and a dropped reset is a silent dead end because D-8 makes the response identical either way. `docs/plans/notification-module.md` Info-5 is **amended**, not left contradicting the code. |
| Recovery send: a **transport** failure is swallowed, the request is uninfluenced (D-8 / #369 oracle) | preserved | The `catch` around `send.run()` stays; only the read moves out of it. `TransactionalMailServiceTest` keeps its existing pin. |
| Recovery send: suppression check runs **inside** the dispatched task, off the request thread (R-2) | preserved | Unchanged, and now *proven at the wiring level* by AC-8 rather than only through mocks. |
| Recovery send: a suppressed address completes normally, no throw | preserved | Unchanged. |
| Booking confirmation: suppressed address → log + return (a *complete* outcome, so the registry does not retry-loop, R-6) | preserved | Unchanged. |
| Booking confirmation: transport failure propagates so the registry retries (at-least-once, #371) | preserved | Unchanged. |
| Booking confirmation: a suppression-**read** failure propagates → registry retries | preserved | Explicitly pinned for the first time (AC-6), so fail-open cannot leak here later. |
| Suppression matching is on the trimmed, lower-cased address on both read and write | preserved | Same rule, now sourced from `Emails.normalize` instead of a private copy. |
| `suppress()` rejects a non-address loudly (no `@`, empty local part) | preserved **+ extended** | Empty **domain** part (`"user@"`) now also rejected (AC-4) — previously stored an empty `domain`. |
| Row stores a `v1:` peppered-HMAC key + cleartext domain, never the address | preserved | Untouched by this slice. |
| Every DB-backed IT gets `SynchronousMailDispatch` automatically via `TestcontainersConfiguration` | preserved | The container bean is extracted to `PostgresContainerConfiguration`, but `TestcontainersConfiguration` keeps importing **both**, so no existing test changes and none can forget (R-5). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | V34's `DROP CONSTRAINT` targets PG's **auto-generated** name for V33's inline `domain` CHECK (`email_suppression_domain_check`); if the real name differs the migration fails | med | med | Name the replacement constraint **explicitly** so no future migration inherits the guess; a wrong drop name fails Flyway loudly on the first Testcontainers IT run, before any PR. Verify the actual name via `\d email_suppression` in phase 2 step 2 before writing the DDL | plan | **closed** — probed `pg_constraint` against the real container before writing the DDL: the name is `email_suppression_domain_check`, as predicted. The replacement is named `email_suppression_domain_normalized`, so the guess is not inherited |
| R-2 | A **global** `spring.jdbc.template.query-timeout` would also bound `availability`'s `SELECT … FOR UPDATE` — the serialization point of invariant #2 — aborting a legitimate lock wait under contention | low | **high** | The timeout is scoped to a `JdbcClient` built inside `JdbcEmailSuppressions` only; the global property is **never** set. Phase 3 asserts the global property is absent | plan | open |
| R-3 | Fail-open punches a hole in the module's defining invariant *no send to a suppressed address* | med | med | Scoped to the recovery vehicle alone; the registry vehicle still propagates (AC-6 pins it); the read failure is logged distinctly from a transport failure; decision recorded in the Javadoc **and** the amended Info-5 row | maintainer (decided at intake) | resolved — see Resolved |
| R-4 | `Emails` in `customer::vocabulary` introduces cross-module imports from `notification` + the root | low | low | Both already hold `customer::vocabulary` (grants unchanged); `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` prove it (a final class is legal in `vocabulary`, which rejects only plain interfaces) | plan | open |
| R-5 | Extracting `PostgresContainerConfiguration` lets a future IT import the container **without** `SynchronousMailDispatch` → async sends race `MockMailer` assertions → flake, which does not fail loudly | med | med | `TestcontainersConfiguration` keeps `@Import`-ing both and stays the default entry point; the new config's Javadoc states it is for `MailSenderWiringIT` only; no existing test is repointed | plan | open |
| R-6 | Flyway `V34` collision with a parallel slice | **low** | high | Verified free on `main` @ `59a9e52`; all 10 open PRs are Dependabot **frontend** bumps with no migration in their diff. Default rule recorded: whoever merges second renumbers | plan | open |
| R-7 | `queryTimeout` cannot bound a black-holed socket (the PG cancel can wedge too) | low | med | Out of scope by decision (Non-goals); a connection-global `socketTimeout` is the instrument and carries app-wide blast radius. Revisit with #370, when a real relay + real bounce volume exist | plan | deferred |
| R-8 | The wiring IT (AC-8) asserts on a thread-name prefix, coupling it to `AsyncMailDispatcher`'s `THREAD_NAME_PREFIX` | low | low | Same coupling `AsyncMailDispatcherTest` already accepts deliberately; assert *both* "not the caller's thread" and the prefix, so a renamed prefix fails on the prefix clause only and reads obviously | plan | open |

## Open questions / Assumptions

*(none open — all three decisions were taken at the intake-grill gate before planning)*

### Resolved

- **Where does the canonical normalization live?** → **`customer::vocabulary`**, not the `shared` kernel.
  The issue's proposal is architecturally impossible: `shared → customer::api` plus `customer`'s
  deliberate `allowedDependencies = {}` makes `customer → shared` a cycle, and three of the six call
  sites are inside `customer`. Zero new grants needed. *Decided:* maintainer, 2026-07-27 (intake grill).
- **Fail-open or fail-closed on a suppression-read error?** → **fail open, recovery vehicle only**;
  the registry vehicle keeps failing closed and retrying. *Decided:* maintainer, 2026-07-27.
- **Is item 2 still worth a migration post-#388?** → **yes, small.** V33's `email_key ~ '^v1:[0-9a-f]{64}$'`
  already blocks the cleartext-insert attack the item was written for, so the residue is the `domain`
  column only (whitespace-padded values pass one-arg `btrim`; `suppress("a@")` stores an empty domain).
  Ship V34. *Decided:* maintainer, 2026-07-27.

## Availability & concurrency (invariant #2)

**N/A — this slice has no write path to `availability(set_id, booking_date)`** and touches neither
`booking`, nor the beach map, nor the cutoff.

**But it is not inert with respect to invariant #2**, which is why this section is not a bare N/A:
the obvious instrument for AC-5 — `spring.jdbc.template.query-timeout` — is **global**, and would
bound *every* statement in the application, including the availability claim's `SELECT … FOR UPDATE`.
Under set contention a legitimate lock wait could then abort with a timeout instead of serializing,
turning the invariant's serialization point into a flaky failure. The plan therefore scopes the
timeout to the `notification` adapter's own `JdbcClient` (R-2), and phase 3 asserts the global
property is not set anywhere.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `customer` | existing | `Customer`, `CustomerAccount` | Owns tourist identity, and with it the **canonical form of an email address**. Three of the six normalization copies are already its own code; the other consumers are already granted its vocabulary. |
| M-2 | `notification` | existing | *(none — owns `email_suppression` state)* | Owns the send chokepoint, the suppression list, and the drainer thread — items 2, 3, 5 are all its state and its failure semantics. |
| M-3 | *(root, not a module)* | existing | — | `CompositionRootDisciplineTests` is a test over the root package; two of the six normalization copies (`CustomerPasswords`, `SsoController`) are edge classes. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | *(none added)* | — | — | — |

No new port. The one **published type** added is a `vocabulary` member, not a port:

| # | Surface | Type | Kind | Consumers | Grant needed? |
|---|---|---|---|---|---|
| NI-2 | `customer.vocabulary` | `Emails` (final class, `static String normalize(String)`) | value helper — legal in `vocabulary`, which rejects only plain interfaces | `customer` (internal), `notification.adapter.out`, root (`CustomerPasswords`, `SsoController`) | **No** — `notification` already lists `customer::vocabulary`; the root already imports it |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | *(none added or changed)* | — | — | — | — | — |

No event is added, moved, or renamed — so **no Flyway `event_type` rewrite is needed** (contrast V31).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The canonical email-normalization rule (`Emails.normalize`) | `customer` | `customer` **Job**: "tourist identity: guest-checkout contact + the customer account (email + …)" — the canonical form of the address *is* identity vocabulary. Not on any module's **Not My Job** list. Explicitly **not** `shared` (cycle, see Architecture) and **not** `notification`, whose Job is *delivery*, not identity — `notification` merely consumes the rule as its hash input contract. |
| The suppression-read timeout + fail-open policy | `notification` | `notification` **Job**: owns "the email-suppression list … with its defining invariant *no send to a suppressed address*, enforced at the one send chokepoint" and the bounded dispatcher. The failure semantics of its own read are its own call. Not on another module's list. |
| The tightened `domain` CHECK (V34) | `notification` | Same Job line — `email_suppression` is the module's first owned state, and it is the sole writer. |
| The root-package allowlist rule | *(test over the root)* | Not a module capability; `CompositionRootDisciplineTests` is a platform-wide fitness function, sibling to `PackageShapeArchitectureTests`. |

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves, no ledger row, no Stripe surface, no refund decision.

## Angular — frontend surfaces touched

**N/A — backend-only.** No file under `frontend/` changes, so no `riviera-frontend` /
`angular-developer` / `playwright-cli` routing applies and no e2e spec is owed (RV-FE-E2E not triggered).

## FE↔BE contract

**N/A — no contract change.** No endpoint, DTO, or error code is added or altered.

## Execution status

**Stage pointer:** `implement — phase 3 (bounded suppression read + fail-open)`

**Next action:** Write `SuppressionQueryTimeoutIT` + the two `TransactionalMailServiceTest` cases
(red), then scope a `queryTimeout` to the suppression adapter's own `JdbcClient` and split the read
out of the transport catch.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Allowlist-form root discipline (item 1) | ✅ | `116d4ec` |
| 1 — One canonical `Emails.normalize` (item 4) | ✅ | `f671840` |
| 2 — V34 `domain` CHECK + empty-domain guard (item 2) | ✅ | `<phase-2>` |
| 3 — Bounded suppression read + fail-open (item 3) | | |
| 4 — Fire-and-forget wiring IT (item 5) | | |
| 5 — Cleanup sweep + docs (item 6) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | *(none yet)* | — |

---

## File structure

**Created**

- `platform/src/main/java/ai/riviera/platform/customer/vocabulary/Emails.java` — the one canonical
  email normalization (`trim().toLowerCase(Locale.ROOT)`).
- `platform/src/main/resources/db/migration/V34__email_suppression_domain_normalization.sql` — tighten
  the `domain` CHECK to reject everything the Java normalization cannot produce.
- `platform/src/test/java/ai/riviera/platform/customer/vocabulary/EmailsTest.java` — the contract,
  including the exact inputs the DB CHECK must agree on.
- `platform/src/test/java/ai/riviera/platform/rootfixture/…` — the deliberately mis-shaped root fixture
  (a root class importing an ungranted module surface) for AC-1's negative proof.
- `platform/src/test/java/ai/riviera/platform/PostgresContainerConfiguration.java` — the container bean
  alone, extracted so the wiring IT can opt out of the `@Primary` synchronous dispatch override.
- `platform/src/test/java/ai/riviera/platform/notification/MailSenderWiringIT.java` — AC-8.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SuppressionQueryTimeoutIT.java` — AC-5.

**Modified**

- `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` — deny-list →
  allowlist, violation-collector shape parameterized by base package (the
  `PublishedSurfacePlacementArchitectureTests` pattern).
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/JdbcEmailSuppressions.java` —
  delegate to `Emails.normalize`; reject an empty domain part; build a timeout-bounded `JdbcClient`.
- `platform/src/main/java/ai/riviera/platform/notification/application/TransactionalMailService.java` —
  split the read out of the transport catch; fail open on the recovery vehicle only.
- `platform/src/main/java/ai/riviera/platform/notification/application/AsyncMailDispatcher.java` —
  Javadoc: the drainer thread runs a DB read too, and what bounds it.
- `platform/src/main/java/ai/riviera/platform/customer/application/CustomerAccountService.java`,
  `…/AccountErasureService.java`, `…/customer/adapter/out/JdbcCustomerDirectory.java`,
  `…/CustomerPasswords.java`, `…/SsoController.java` — delete the private copy, delegate.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/EmailSuppressionIT.java` — AC-3, AC-4.
- `platform/src/test/java/ai/riviera/platform/notification/application/TransactionalMailServiceTest.java` — AC-6.
- `platform/src/test/java/ai/riviera/platform/TestcontainersConfiguration.java` — import the extracted
  container config + keep `SynchronousMailDispatch` (behavior identical for every existing test).
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` — Javadoc: the real
  module set (eight bounded contexts + `shared`), and `notification` as full-without-`domain/`.
- `docs/plans/notification-module.md` — drop the three stale `RecordedMailbox` references; amend Info-5
  to record the fail-open reversal.
- `platform/src/test/java/ai/riviera/platform/{PasswordResetIT,EmailVerificationIT,RecoveryTokenNeverPersistedIT,WebSliceStubs}.java`,
  `…/payout/PayoutModuleTest.java` — import grouping.
- `platform/src/test/java/ai/riviera/platform/notification/BookingConfirmationMailIT.java` — extract
  `seedConfirmedBooking`; restore the class's unique-date discipline on the 4th copy.
- `platform/src/test/java/ai/riviera/platform/notification/ListenerMoveMigrationIT.java` — drop the
  redundant try/finally (match `EmailSuppressionIT`'s no-cleanup convention).
- `RESPONSIBILITIES.md`, `CLAUDE.md` — only if the docs-freshness pass at close-out finds a contradiction.

---

## Phase 0 — Allowlist-form root discipline (item 1)

**Files:** Modify `platform/src/test/java/ai/riviera/platform/CompositionRootDisciplineTests.java` ·
Create `platform/src/test/java/ai/riviera/platform/rootfixture/`

Rationale: the current rule denies five named spine modules, so (a) a root class importing
`notification.application.Mailer` — the raw transport, bypassing suppression *and* off-thread
dispatch — passes, and (b) a ninth module is never in the deny set. The allowlist is
self-maintaining and makes `MockMailer`'s Javadoc claim ("pinned to `notification::api`") true.

- [ ] **Step 1: Write the failing test.** Restructure to a violation collector parameterized by base
  package (mirroring `PublishedSurfacePlacementArchitectureTests`), add the fixture tree
  `ai.riviera.rootfixture` with `RootImportingUngrantedSurface` importing
  `ai.riviera.rootfixture.notification.application.InternalTransport`, and assert the collector
  reports it. Granted set: `customer`, `operator` (any surface), `notification::api` only, `shared`.
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*CompositionRootDisciplineTests*"`
  → FAIL (the fixture violation is not reported by the deny-list rule).
- [ ] **Step 3: Minimal implementation** — replace `noClasses().should().dependOnClassesThat()` with the
  allowlist collector; update the Javadoc so the prose and the code state the same rule.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, **with no production change** (AC-2).
- [ ] **Step 5: Generalization-audit pass** — the same deny-vs-allow shape may exist in sibling fitness
  functions. Search: `rg "resideInAnyPackage" platform/src/test`. Decide per hit; record below.
- [ ] **Step 6: Commit** — `git commit -m "test(#386): pin root discipline as an allowlist, not a deny-list"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — One canonical `Emails.normalize` (item 4)

**Files:** Create `customer/vocabulary/Emails.java`, `EmailsTest.java` · Modify the six call sites

- [ ] **Step 1: Write the failing test** — `EmailsTest` pinning `trim().toLowerCase(Locale.ROOT)`
  semantics over the exact input table the DB CHECK must agree on (leading/trailing space, tab,
  newline, NBSP, mixed case, already-normalized, Turkish dotted İ for the `Locale.ROOT` guarantee).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*EmailsTest*"` → FAIL (no such class).
- [ ] **Step 3: Minimal implementation** — add `Emails` to `customer.vocabulary` (final, private
  constructor, one static method, Javadoc stating it is the hash input contract for
  `notification`'s suppression key). Then delete all six private copies and delegate.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*EmailsTest*" --tests "*ModularityTests*"
  --tests "*PublishedSurfacePlacementArchitectureTests*"` → PASS (proves the placement is legal and no
  grant changed).
- [ ] **Step 5: Generalization-audit pass** — search `rg "trim\(\)\.toLowerCase" platform/src` → expect
  **zero** hits outside `Emails`. Record.
- [ ] **Step 6: Commit** — `git commit -m "refactor(#386): one canonical email normalization in customer::vocabulary"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — V34 `domain` CHECK + empty-domain guard (item 2)

**Files:** Create `V34__email_suppression_domain_normalization.sql` · Modify `JdbcEmailSuppressions`,
`EmailSuppressionIT`

- [ ] **Step 1: Write the failing test** — extend `EmailSuppressionIT` with
  `theSchemaRejectsADenormalizedDomain` (direct inserts: tab-padded, newline-padded, NBSP-padded,
  empty `domain` — each expecting `DataIntegrityViolationException`) and extend
  `aNonAddressWriteIsRejected` with `suppress("user@")`.
- [ ] **Step 2: Verify the constraint's real name first** (R-1) — start the container and inspect
  `\d email_suppression`, or `SELECT conname FROM pg_constraint WHERE conrelid = 'email_suppression'::regclass`.
  Then run `./gradlew test --tests "*EmailSuppressionIT*"` → FAIL (padded/empty domains are accepted).
- [ ] **Step 3: Minimal implementation** — V34 drops the auto-named CHECK and adds an **explicitly named**
  replacement (`email_suppression_domain_normalized`) requiring `domain = lower(btrim(domain))`,
  `domain <> ''`, and `domain !~ '[[:space:][:cntrl:]]'`; `JdbcEmailSuppressions.suppress` rejects an
  empty domain part alongside the existing `atIndex < 1` guard.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*EmailSuppressionIT*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — other one-arg `btrim` CHECKs share the weakness. Search
  `rg "btrim" platform/src/main/resources/db/migration`. Expect the V32 `email` CHECK (dropped by V33,
  so moot) — decide and record; do **not** silently widen scope to other tables.
- [ ] **Step 6: Commit** — `git commit -m "feat(#386): make the email_suppression domain CHECK agree with the Java normalization"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — Bounded suppression read + fail-open (item 3)

**Files:** Modify `JdbcEmailSuppressions`, `TransactionalMailService`, `AsyncMailDispatcher` ·
Create `SuppressionQueryTimeoutIT` · Modify `TransactionalMailServiceTest`,
`docs/plans/notification-module.md`

- [ ] **Step 1: Write the failing tests** — `SuppressionQueryTimeoutIT` drives a deliberately wedged
  read (`pg_sleep` well past the configured timeout) and asserts (a) it aborts inside the timeout and
  (b) the recovery mail is **still sent** (AC-5); `TransactionalMailServiceTest` gains
  `aSuppressionReadFailureStillPropagatesOnTheRegistryVehicle` (AC-6) and a recovery-side fail-open case.
- [ ] **Step 2: Run them, verify they fail** —
  `./gradlew test --tests "*SuppressionQueryTimeoutIT*" --tests "*TransactionalMailServiceTest*"`
  → FAIL (no timeout; the read failure currently drops the mail).
- [ ] **Step 3: Minimal implementation** — `JdbcEmailSuppressions` builds its own `JdbcClient` over a
  `JdbcTemplate` with `setQueryTimeout(…)` from a named default
  (`riviera.notification.suppression-query-timeout-seconds`, default 5); `TransactionalMailService`
  moves the read out of the transport catch into its own narrow `catch (DataAccessException)` that
  fails **open** on the recovery vehicle only; `AsyncMailDispatcher`'s Javadoc is corrected — the
  drainer thread runs a suppression **read** as well as SMTP, and what bounds each.
- [ ] **Step 4: Run them, verify they pass** — same command, then broaden to
  `./gradlew test --tests "*notification*"` → PASS. Assert the global property is unset:
  `rg "query-timeout" platform/src/main/resources` → **no hits** (R-2).
- [ ] **Step 5: Generalization-audit pass** — is any *other* unbounded query on a bounded/serial
  executor? Search `rg -l "JdbcClient|JdbcTemplate" platform/src/main/java` cross-referenced with the
  scheduled sweeps (`ExpireRequests`, the #101 retention sweep). Record the decision — this is the
  finding class most likely to generalize.
- [ ] **Step 6: Commit** — `git commit -m "fix(#386): bound the suppression read on the drainer thread and fail open for recovery mail"`
- [ ] **Step 7: Update plan-doc execution status** + amend Info-5 in `docs/plans/notification-module.md`
  in the same commit window.

---

## Phase 4 — Fire-and-forget wiring IT (item 5)

**Files:** Create `PostgresContainerConfiguration`, `MailSenderWiringIT` · Modify `TestcontainersConfiguration`

Rationale: today the "no mail work on the caller's thread" property is proven only half-by-half —
`CustomerRecoveryTest` mocks `MailSender`, `TransactionalMailServiceTest` proves the class in
isolation, and every DB IT installs `@Primary SynchronousMailDispatch`. A future decorating
`@Primary MailSender` doing inline I/O would pass all of them while re-opening the timing oracle.
The IT must therefore use the **full component-scanned context**, not a hand-listed slice — a slice
would not see a future decorator at all.

- [ ] **Step 1: Write the failing test** — `MailSenderWiringIT`: `@SpringBootTest` (full scan),
  `@Import(PostgresContainerConfiguration.class)` plus a `@Primary` recording `Mailer` that captures
  `Thread.currentThread().getName()`; autowire the published `MailSender`; assert the captured thread
  is neither the caller's nor absent, and starts with `recovery-mail-` (R-8).
- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*MailSenderWiringIT*"` → FAIL
  (initially: the config does not exist; once it does, this is the guard that would fail on an inline
  decorator).
- [ ] **Step 3: Minimal implementation** — extract the container `@Bean` into
  `PostgresContainerConfiguration`; `TestcontainersConfiguration` `@Import`s it **and**
  `SynchronousMailDispatch`, so every existing IT is byte-for-byte unaffected (R-5), with Javadoc on
  both stating why the split exists and that the split config is for this IT alone.
- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*MailSenderWiringIT*"` → PASS, then
  a regression sweep over the ITs that depend on the synchronous override:
  `./gradlew test --tests "*PasswordResetIT*" --tests "*EmailVerificationIT*" --tests "*RecoveryTokenNeverPersistedIT*"` → PASS.
- [ ] **Step 5: Generalization-audit pass** — any other "the real wiring is never exercised because a
  `@Primary` test bean replaces it" gap? Search `rg "@Primary" platform/src/test`. Record.
- [ ] **Step 6: Commit** — `git commit -m "test(#386): prove the edge-injected MailSender dispatches off the caller's thread"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — Cleanup sweep + docs (item 6)

**Files:** the modified list above (arch-test Javadoc, plan doc, import grouping, IT helpers)

- [ ] **Step 1:** `PackageShapeArchitectureTests` Javadoc — replace "all seven" with the real module set
  (eight bounded contexts + the non-context `shared`), and note `notification` is full **without**
  `domain/`, which the adjacent phrasing currently contradicts.
- [ ] **Step 2:** `docs/plans/notification-module.md` — remove the three stale `RecordedMailbox`
  references (lines ~105/250/296) that contradict the doc's own recorded plan change.
- [ ] **Step 3:** Import grouping in `PasswordResetIT`, `EmailVerificationIT`,
  `RecoveryTokenNeverPersistedIT`, `WebSliceStubs`, `PayoutModuleTest`.
- [ ] **Step 4:** `BookingConfirmationMailIT` — extract `seedConfirmedBooking` (the seed SQL is copied
  4×) and restore the class's unique-date discipline on the copy that slipped.
- [ ] **Step 5:** `ListenerMoveMigrationIT` — drop the try/finally cleanup made redundant by its
  seeded-COMPLETED design; match `EmailSuppressionIT`'s no-cleanup convention.
- [ ] **Step 6: Run the structural net + the touched suites** —
  `./gradlew test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*CompositionRootDisciplineTests*"` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "chore(#386): cleanup sweep — stale Javadoc/plan refs, import grouping, IT helpers"`
- [ ] **Step 8: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-28 | Phase 2 — a normalization CHECK weaker than the Java that feeds it | Other Flyway CHECKs asserting a stored value is normalized | `grep -rn "btrim\|lower(" platform/src/main/resources/db/migration/` | 2, both the same column's history: V32's `email` CHECK (that column was **dropped** by V33 — moot, and V32 is immutable) and V33's `domain` (this fix) | **No other table has one.** Noted but deliberately skipped: `customer.email` and `customer_account.email` are normalized in Java with **no** DB CHECK at all — the same class of gap. Skipped because those tables hold real data (a CHECK could fail the deploy on a pre-existing row), they are written and read by the same adapter, and no bearer-credential invariant rides on them. Flagged in the PR body so a reviewer can disagree rather than have it pass silently. |
| 2026-07-28 | Phase 1 — six private copies of one correctness-critical rule | Any surviving email normalization outside `Emails` | `grep -rn "toLowerCase" --include=*.java platform/src` | 5 hits, **0** of them email normalization: `StripePaymentGateway:70` (ISO currency for Stripe), `SsoProviders:30`, `PhotoUploadResponse:23,28`, `VenueProfileResponse:41` (enum names for the wire) | **Correctly left alone.** These lowercase a *closed enum name or ISO code* for wire representation — no trim, no user input, no cross-component agreement requirement. Folding them into `Emails.normalize` would couple unrelated concepts to an identity rule. The email rule now has exactly one definition; `CustomerPasswords.normalizeEmail` was deleted rather than left as a delegating wrapper, so its 3 external callers now name `Emails.normalize` directly. |
| 2026-07-27 | Phase 0 — deny-list fitness function weaker than its own prose | Other ArchUnit rules stated as a deny-list over an *enumerable, growing* set | `rg "noClasses\(\)\|resideInAnyPackage" platform/src/test` | 4: `CustomerAuthPlacementTests`, `OperatorAuthPlacementTests`, `PackageShapeArchitectureTests#applicationAndDomainDoNotDependOnAdapters`, `VenueApiRoleSplitTests` | **Skip all 4, none share the defect.** The two auth-placement rules deny one *third-party* package (`org.springframework.security..`); "all auth libraries" is not an enumerable set, so an allowlist is not the stronger form — and module→module grants are already allowlisted by `allowedDependencies`. The hexagon-direction rule's denied set (`adapter..`) is closed by construction, since assertion 1 already bounds a module's top-level packages to a fixed set. `VenueApiRoleSplitTests` denies one *named type* outside one module — effectively already an allowlist, with no growing set behind it. The #386 failure mode (a ninth module silently escaping) needs a set that grows with the codebase; none of these have one. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `./gradlew test --tests "*CompositionRootDisciplineTests*"` → PASS incl. the fixture negative proof.
- [ ] **AC-2:** same run → green with zero production-file changes in phase 0's diff.
- [ ] **AC-3:** `./gradlew test --tests "*EmailSuppressionIT*"` → `theSchemaRejectsADenormalizedDomain` PASS.
- [ ] **AC-4:** same run → `aNonAddressWriteIsRejected` PASS with the `"user@"` case.
- [ ] **AC-5:** `./gradlew test --tests "*SuppressionQueryTimeoutIT*"` → PASS.
- [ ] **AC-6:** `./gradlew test --tests "*TransactionalMailServiceTest*"` → PASS.
- [ ] **AC-7:** `rg "trim\(\)\.toLowerCase" platform/src/main/java` → only `Emails.java`.
- [ ] **AC-8:** `./gradlew test --tests "*MailSenderWiringIT*"` → PASS.
- [ ] **AC-9:** the structural net + touched suites green; the stale references are gone.
- [ ] **AC-10:** SonarCloud PR analysis → 0 new issues, 0 duplicated blocks, ≥80% new-code coverage.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A **plus** the R-2 global-timeout hazard); no
      concurrency test owed — no availability write path.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event added
      (so no `event_type` rewrite owed) (invariant #11).
- [ ] **Payment/payout** N/A justified (invariants #5, #8, #9).
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone untouched (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] Flyway V34 present, number verified free, invariant-enforcing constraint tested (invariant #12).
- [ ] **Frontend** N/A — no file under `frontend/` in the diff.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here citing `merged via PR #NN`,
      never a merge SHA, so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — `/code-review` *plus* `riviera-review-overlay`, not the overlay alone.
