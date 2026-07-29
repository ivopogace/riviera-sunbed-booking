# Prove a shed confirmation mail stays owed — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An integration test that saturates the **real** registry-mail executor in a Spring
context and proves that the shed `BookingConfirmed` send leaves its Event Publication Registry
row outstanding — and that a narrowed resubmit then delivers it.

**Architecture:** A dedicated `@SpringBootTest` class whose `@TestPropertySource` shrinks the
bulkhead to `pool-size=1, queue-capacity=1` (possible only since #408 externalised the bounds).
The distinct property set gives the class its **own** application context — and therefore its own
Testcontainers Postgres, since the container is a context-scoped `@ServiceConnection` bean — so it
is structurally incapable of touching another class's outstanding publications, which is the flake
#406 shipped. Saturation is driven through the real listener: one wedged send occupies the single
worker, a second fills the single queue slot, the third is shed. No production code changes.

**Persistence:** JDBC only (invariant #1). No migration; the test reads `event_publication` and
seeds `customer` / `booking` rows with `JdbcClient`, exactly as `RegistryMailBulkheadIT` does.

**Source of intent:** GitHub issue **#407** (parent epic #367, ADR-0011).

**Skills consulted:**
- `riviera-sdlc` — routed the gate; cloud-session addendum (designated branch stands in for `feature/<slug>`).
- `riviera-plan-doc` — this doc's structure and the Execution-status state store.
- `riviera-java-conventions` — §9 tests (Testcontainers for DB behaviour, AssertJ matching the surrounding class), §6a named literals, §6c one-line-or-none comments with the prose in Javadoc.
- `riviera-modulith` (`references/testing.md`) — full `@SpringBootTest` + `@Import(TestcontainersConfiguration)` + `@EnabledIfDockerAvailable` is the right harness here (not `@ApplicationModuleTest`): the subject spans the listener, the executor bean and the framework-owned registry.
- `riviera-local-debug` — scoped-test recipe (system `gradle`, JDK-25 toolchain, one IT class at a time); CI owns the full suite.
- `postgres` — **not loaded**: no migration, no schema change, no new query shape beyond the `event_publication` read the sibling IT already performs.

**Branch:** `claude/sdlc-407-d73ev9` — the cloud session's designated remote branch, standing in for
`feature/registry-mail-shed-durability` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the registry-mail bulkhead saturated (its worker wedged on an unresponsive
  transport and its queue full), when a further `BookingConfirmed` is published after commit, then
  the send is **shed** — `riviera.mail.registry.shed` increments and the transport is never entered
  for that booking. *Pinned by:* `RegistryMailShedDurabilityIT.aShedSendStaysOwedAndIsDeliveredByAResubmit`
- [ ] **AC-2:** Given that shed send, when the registry is read, then exactly one
  `event_publication` row for the confirmation listener's `listener_id` carries
  `completion_date IS NULL` — the shed mail is still **owed**, not lost. *Pinned by:* the same test.
- [ ] **AC-3:** Given the transport recovers and the pool drains, when
  `resubmitIncompletePublications` is called with a predicate **narrowed to the booking under test**,
  then the confirmation is delivered exactly once and the publication completes — the loop
  `republish-outstanding-events-on-restart` performs at boot. *Pinned by:* the same test.
- [ ] **AC-4:** The saturating class cannot affect any other test's outstanding publications.
  *Pinned by:* structure (its own context ⇒ its own database) + `RegistryMailShedDurabilityIT.theBulkheadIsShrunkForThisContextOnly`,
  and verified by running `RegistryMailShedDurabilityIT` and `RegistryMailBulkheadIT` **repeatedly**
  (≥3 clean consecutive runs each, recorded in the AC-verification section), not once.

## Non-goals

- **No production-code change.** #407 is a coverage gap, not a defect; `RegistryMailExecutorConfig`
  and `BookingConfirmationMailListener` ship unchanged.
- **Not #410** (MDC onto the mail workers, shutdown drain vs SMTP socket budget) — same files,
  separate slice; this plan deliberately leaves both alone to keep that PR conflict-free.
- **Not #405/#380** (admin resubmission surface). This test calls `IncompleteEventPublications`
  directly; it does not build or presume an operator-facing button.
- **No new shed behaviour, metric or log line** — #408 shipped those and
  `RegistryMailExecutorConfigTest` pins them at unit level. This slice adds the *registry* half only.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new coverage, replaces nothing. The one existing surface touched is a **test-internal
fixture move** (see the Modulith section's fixture note): `RegistryMailBulkheadIT`'s nested
`ControllableMailer` + its `@TestConfiguration` become shared test types with **identical
behaviour**; that class's four tests must stay green, which AC-4's repeat runs already verify.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Copy-pasting the sibling IT's fixtures (blocking mailer, booking seeding, registry query) trips the Sonar **0-duplicated-blocks** merge bar | high | med | Extract `ControllableMailer`, `ControllableMailerConfiguration` and `ConfirmationMailFixtures` as shared test types; both ITs consume them | Claude | open |
| R-2 | Saturation is timing-dependent and flakes (the #406 failure mode) | med | high | Sequence on **observable pool state**, not sleeps: await the wedge's transport entry, then `pool.getQueueSize() == 1`, only then publish the send that must be shed | Claude | open |
| R-3 | A stray republished publication from an earlier IT occupies the shrunk pool and shifts which event is shed | low | high | The distinct `@TestPropertySource` yields a distinct context ⇒ a **fresh** container/database with no outstanding rows; additionally the class waits for a quiet pool before saturating | Claude | open |
| R-4 | The narrowed resubmit re-delivers unrelated publications (#406's reproducible flake) | med | high | Predicate matches `BookingConfirmed.bookingId() == <this test's booking>`, mirroring `RegistryMailBulkheadIT`; asserted by delivery counts per address | Claude | open |
| R-5 | Moving `ControllableMailer` out of `RegistryMailBulkheadIT` changes that class's context cache key or drops its `@TestConfiguration` pickup, silently un-wedging it | med | high | The extracted config is `@Import`ed explicitly by both classes; AC-4's repeat runs of `RegistryMailBulkheadIT` are the check | Claude | open |
| R-6 | A second Postgres container + context slows CI or pressures the sandbox | med | low | Already the norm here (every `@TestPropertySource` IT does it); locally run one IT class at a time per `riviera-local-debug` | Claude | open |
| R-7 | The shrunk pool is a **shared-state bean** — the `riviera-local-debug` full-suite failure class | low | med | The bean is context-scoped and this context is not shared; the class leaves no publication outstanding and releases the transport in `@AfterEach` | Claude | open |

## Open questions / Assumptions

- **Assumption:** with the async dispatch rejected, Spring Modulith never marks the publication
  complete — completion is registered *inside* the listener invocation, which never happens.
  Today's `RegistryMailBulkheadIT.aFailedSendLeavesThePublicationOutstandingAndIsRetried` implies it
  for a *throwing* send; AC-2 is what proves it for a *never-invoked* one. — *Owner:* Claude ·
  *Resolves by:* phase 1 (the test is the proof; if it is false, #407 has found a real defect and
  the slice escalates to a bug).

### Resolved

- **Open question (from the issue text):** *"shrinking the pool via properties presumes the sizing
  is externalised, which it is not yet."* — **Stale.** #408 shipped `RegistryMailProperties`
  (`riviera.notification.registry-mail.pool-size` / `.queue-capacity`, validated on both ends), so
  `@TestPropertySource` is available and is the approach here. Issue #407's dependency is satisfied.
- **Open question:** does the dedicated class share the flaky database the issue warns about? —
  **No.** `PostgresContainerConfiguration` declares the container as a context-scoped
  `@ServiceConnection` bean, so a distinct context key (this class's `@TestPropertySource`) yields a
  distinct container. The narrowed predicate is kept anyway, as discipline and as defence if the
  container ever becomes static.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The test seeds `booking` rows with plain SQL on dates no other
IT uses and never claims a `(set, date)` row through `availability`, following the sibling IT's
unique-date discipline (a claimed row is never released, so tests must not compete for dates).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `notification` | existing | (none — owns `email_suppression` state) | The subject is `notification`'s registry vehicle: its listener, its executor bean, its shed contract. Test-only addition. |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | — | none added or changed | — | — |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` (published directly by the test, as the sibling IT does) | `{ bookingId, venueId, setId, bookingDate, amountMinor, currency }` | `notification` (registry vehicle), `payout` | async `AFTER_COMMIT`, registry-backed | `RegistryMailShedDurabilityIT` (new) |

### Module ownership (§4a)

All in `notification`, no boundary change: the slice adds test classes only, alongside the module's
existing ITs. No capability moves; no module's **Not My Job** list is implicated.

**Fixture note (test-code placement).** The new IT lives in
`ai.riviera.platform.notification.adapter.in` — next to `RegistryMailExecutorWiringIT`, because it
needs the package-private `RegistryMailExecutorConfig.MAIL_EXECUTOR` bean name to address the pool
(the constant exists precisely so a name cannot drift into a silent fallback). The shared fixtures
sit one package up in `ai.riviera.platform.notification`, public, since both packages consume them.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `BookingConfirmed` also fans out to `payout`'s accrual listener on Boot's
shared pool; the test neither asserts nor perturbs it, and the ledger rows it creates are incidental
(and confined to this class's own database).

## Angular — frontend surfaces touched

N/A — backend-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `plan → implement (phase 0: plan doc committed, draft PR next)`

**Next action:** push the plan-doc commit, open the draft PR (#417 — no PR means no CI), then start
phase 1's fixture extraction.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ⏳ | |
| 1 — Shared test fixtures extracted from `RegistryMailBulkheadIT` | | |
| 2 — `RegistryMailShedDurabilityIT` (red → green) | | |
| 3 — Repeat-run verification (AC-4) + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `platform/src/test/java/ai/riviera/platform/notification/ControllableMailer.java` — **new** (moved
  out of `RegistryMailBulkheadIT`): the transport whose latency and failure a test chooses.
- `platform/src/test/java/ai/riviera/platform/notification/ControllableMailerConfiguration.java` —
  **new** (moved): the `@Primary` bean definition, now `@Import`ed by both ITs.
- `platform/src/test/java/ai/riviera/platform/notification/ConfirmationMailFixtures.java` — **new**:
  seed an online set / a booking, publish `BookingConfirmed` inside a transaction, count outstanding
  publications for the confirmation listener, and hold the `listener_id` string V31 migrated.
- `platform/src/test/java/ai/riviera/platform/notification/RegistryMailBulkheadIT.java` — **modify**:
  consume the three shared types; behaviour unchanged.
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/RegistryMailShedDurabilityIT.java`
  — **new**: the slice's subject.

---

## Phase 0 — Plan doc + branch

- [ ] **Step 1: Commit this plan doc on the designated branch**, then push and open the **draft PR**
      immediately (a branch with no PR gets no CI at all, #417).

## Phase 1 — Extract the shared test fixtures

**Files:** Create `ControllableMailer`, `ControllableMailerConfiguration`, `ConfirmationMailFixtures`
· Modify `RegistryMailBulkheadIT`

- [ ] **Step 1:** Move the nested `ControllableMailer` and `ControllableMailerConfiguration` out of
      `RegistryMailBulkheadIT` verbatim (public types, Javadoc carried across), and lift its seeding /
      publishing / registry-reading helpers into `ConfirmationMailFixtures`.
- [ ] **Step 2: Run the moved class, verify it is still green** —
      `gradle --no-daemon --console=plain test --tests "*RegistryMailBulkheadIT*"` → PASS (4 tests).
      A pure move: if this is red, the move is wrong, not the design.
- [ ] **Step 3: Commit** — `refactor(#407): share the registry-mail IT fixtures`.

## Phase 2 — The saturation IT (red → green)

**Files:** Create `RegistryMailShedDurabilityIT`

- [ ] **Step 1: Write the test** — `@TestPropertySource` shrinking the bulkhead to `1/1`; wedge the
      single worker with a real confirmation send, fill the single queue slot with a second, then
      publish a third whose dispatch must be shed. Assert (AC-1) the shed counter moved and the
      transport was never entered for that booking; (AC-2) its publication is outstanding under the
      listener's `listener_id`; (AC-3) after release + drain, a **narrowed** resubmit delivers it and
      completes the publication.
- [ ] **Step 2: Run it** — `gradle --no-daemon --console=plain test --tests "*RegistryMailShedDurabilityIT*"`.
- [ ] **Step 3: Commit** — `test(#407): prove a shed confirmation mail stays owed`.

## Phase 3 — Repeat-run verification (AC-4) + close-out

- [ ] **Step 1:** Run `RegistryMailShedDurabilityIT` **3×** and `RegistryMailBulkheadIT` **3×**,
      consecutively, and record the results in the AC-verification section. One clean run is not
      evidence for a class whose predecessor flaked 1-in-7.
- [ ] **Step 2:** Run the structural net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`,
      `*PackageShapeArchitectureTests*`) — cheap, and this slice adds files under `platform/`.
- [ ] **Step 3:** Mark the PR ready for review; run the Review + Sonar gates; finalize this section.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| _(filled at phase 1)_ | | | | | |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Filled with the real command output + commit SHA as each
> AC is actually verified — never in advance.

- [ ] **AC-1:** Run `gradle --no-daemon --console=plain test --tests "*RegistryMailShedDurabilityIT*"`
      → expect PASS on the shed-counter delta and zero transport entries for the shed booking.
      Verified at commit `<sha>`.
- [ ] **AC-2:** Same run — one `event_publication` row, `completion_date IS NULL`, under the
      confirmation listener's `listener_id`. Verified at commit `<sha>`.
- [ ] **AC-3:** Same run — the narrowed resubmit delivers exactly one mail to that address and drives
      the outstanding count to 0. Verified at commit `<sha>`.
- [ ] **AC-4:** 3 consecutive clean runs of `RegistryMailShedDurabilityIT` **and** 3 of
      `RegistryMailBulkheadIT`, results recorded here. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified: no `availability` write path).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking is created through the
      application; rows are seeded directly, as the sibling IT does.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports beyond the
      module's own test packages; event payload id-based (invariant #11).
- [ ] **Payment/payout** section filled (N/A).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — booking dates
      are `LocalDate`, seeded on dates no other IT uses.
- [ ] Booking codes unguessable (invariant #7) — the test's seeded codes are fixtures, never logged.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards — N/A.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed.
- [ ] **The review gate ran in full** — `/code-review` via the `references/pr-gates.md` §1 ladder
      *plus* `riviera-review-overlay`.
