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
- `riviera-local-debug` — scoped-test recipe (system `gradle`, JDK-25 toolchain, one IT class at a time); CI owns the full suite. Also the mid-session `dockerd` restart (`scripts/start-dockerd.sh`) after the daemon dropped and a run skipped clean.
- `riviera-review-overlay` + the inline `/review` engine — the first review pass; produced F-1 and F-2.
- `code-review` (the plugin's full subagent fan-out, run once authorised) — the review gate's strongest rung; no finding reached the 80-confidence bar, and it produced F-5 and F-6.
- `postgres` — **not loaded**: no migration, no schema change, no new query shape beyond the `event_publication` read the sibling IT already performs.

**Branch:** `claude/sdlc-407-d73ev9` — the cloud session's designated remote branch, standing in for
`feature/registry-mail-shed-durability` per the `riviera-sdlc` remote-session addendum.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the registry-mail bulkhead saturated (its worker wedged on an unresponsive
  transport and its queue full), when a further `BookingConfirmed` is published after commit, then
  the send is **shed** — `riviera.mail.registry.shed` increments and the transport is never entered
  for that booking. *Pinned by:* `RegistryMailShedDurabilityIT.aShedSendStaysOwedAndIsDeliveredByAResubmit`
- [x] **AC-2:** Given that shed send, when the registry is read, then exactly one
  `event_publication` row for the confirmation listener's `listener_id` carries
  `completion_date IS NULL` — the shed mail is still **owed**, not lost. *Pinned by:* the same test.
- [x] **AC-3:** Given the transport recovers and the pool drains, when
  `resubmitIncompletePublications` is called with a predicate **narrowed to the booking under test**,
  then the confirmation is delivered exactly once and the publication completes — the loop
  `republish-outstanding-events-on-restart` performs at boot. *Pinned by:* the same test.
- [x] **AC-4:** The saturating class cannot affect any other test's outstanding publications.
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
| R-1 | Copy-pasting the sibling IT's fixtures (blocking mailer, booking seeding, registry query) trips the Sonar **0-duplicated-blocks** merge bar | high | med | Extract `ControllableMailer`, `ControllableMailerConfiguration` and `ConfirmationMailFixtures` as shared test types; both ITs consume them | Claude | closed — extracted in phase 1 |
| R-2 | Saturation is timing-dependent and flakes (the #406 failure mode) | med | high | Sequence on **observable pool state**, not sleeps: await the wedge's transport entry, then `pool.getQueueSize() == 1`, only then publish the send that must be shed | Claude | closed — 3/3 + 3/3 + 3/3 combined, `3e783be` |
| R-3 | A stray republished publication from an earlier IT occupies the shrunk pool and shifts which event is shed | low | high | The distinct `@TestPropertySource` yields a distinct context ⇒ a **fresh** container/database with no outstanding rows; additionally the class waits for a quiet pool before saturating | Claude | closed — `awaitQuietPool()` in `3e783be` |
| R-4 | The narrowed resubmit re-delivers unrelated publications (#406's reproducible flake) | med | high | Predicate matches `BookingConfirmed.bookingId() == <this test's booking>`, mirroring `RegistryMailBulkheadIT`; asserted by delivery counts per address | Claude | closed — narrowed in `3e783be` |
| R-5 | Moving `ControllableMailer` out of `RegistryMailBulkheadIT` changes that class's context cache key or drops its `@TestConfiguration` pickup, silently un-wedging it | med | high | The extracted config is `@Import`ed explicitly by both classes; AC-4's repeat runs of `RegistryMailBulkheadIT` are the check | Claude | closed — 4 tests × 3 clean runs, `fa519c8`/`3e783be` |
| R-6 | A second Postgres container + context slows CI or pressures the sandbox | med | low | Already the norm here (every `@TestPropertySource` IT does it); locally run one IT class at a time per `riviera-local-debug` | Claude | closed — two containers observed; CI backend job ~3m10s, inside its usual range |
| R-7 | The shrunk pool is a **shared-state bean** — the `riviera-local-debug` full-suite failure class | low | med | The bean is context-scoped and this context is not shared; the class leaves no publication outstanding and releases the transport in `@AfterEach` | Claude | closed — `No publications outstanding!` locally, and the PR's full-suite CI green on both pushes |

## Open questions / Assumptions

_(none open)_

### Resolved

- **Assumption (phase 2, `3e783be`):** with the async dispatch rejected, Spring Modulith never marks
  the publication complete — completion is registered *inside* the listener invocation, which never
  happens. **Confirmed:** the shed booking's row reads `completion_date IS NULL` and the resubmit
  then completes it. The shed contract's claim holds; #407 found a coverage gap, not a defect.
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

**Stage pointer:** `all gates green (CI + full review gate + Sonar) — awaiting the merge`

**Next action:** merge PR #432. Post-merge, GitHub-only: confirm #407 closed and link it under
epic #367.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | `9a2d38c` (draft PR #432) |
| 1 — Shared test fixtures extracted from `RegistryMailBulkheadIT` | ✅ | `fa519c8` |
| 2 — `RegistryMailShedDurabilityIT` (red → green) | ✅ | `3e783be` |
| 3 — Repeat-run verification (AC-4) | ✅ | `596c5f0` |
| 4 — Review round (F-1, F-2) + close-out | ✅ | `5397664`, `af177e2` |
| 5 — `/code-review` fan-out over the final diff (F-3 closed; F-5, F-6) | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (inline `/review` + overlay) | The shared `ConfirmationMailFixtures` still seeded its guest as `'Bulkhead Guest'` — the name of only one of its two consumers | fixed (this commit) |
| F-2 | review (self, AC-4 evidence) | The plan and PR asserted "own context ⇒ own container/database" as the isolation mechanism without ever observing it | fixed (this commit) — two concurrent `postgres:17` containers observed during a combined run; recorded under AC-4 |
| F-3 | review (process) | The `/code-review` subagent fan-out — the gate's strongest rung — could not run: this session is instructed not to launch agents unasked, and the authorisation request went unanswered | **closed** — the human authorised it; the full workflow ran (eligibility + CLAUDE.md map + summary, 5 parallel reviewers, confidence scoring). The gate is complete and its checkbox is now ticked |
| F-5 | review (`/code-review` fan-out, bug-scan reviewer) | The shed-counter delta is asserted immediately while every other cross-thread step awaits observable state — scored **60**, below the workflow's 80 bar, so not a reported finding. It did expose a contradiction in this class's own Javadoc, which claimed "nothing here is timed" without naming the one deliberate exception | fixed (this commit) — the immediacy is the claim (an `AFTER_COMMIT` dispatch is rejected on the committing thread); awaiting it would quietly stop asserting that, so the prose was corrected rather than the assertion |
| F-6 | review (`/code-review` fan-out, comment-compliance reviewer) | `ControllableMailer`'s Javadoc said the extraction was "unchanged" when visibility had widened to cross the package boundary — sub-threshold, but false as written | fixed (this commit) |
| F-4 | sonar gate | None. Quality gate passed **and** the API-reported list is empty (`total: 0`; 0 new bugs / vulnerabilities / smells; 0 duplicated blocks) against a `success` analysis check-run | n/a |

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

- [x] **Step 1: Commit this plan doc on the designated branch**, then push and open the **draft PR**
      immediately (a branch with no PR gets no CI at all, #417). Draft PR #432.

## Phase 1 — Extract the shared test fixtures

**Files:** Create `ControllableMailer`, `ControllableMailerConfiguration`, `ConfirmationMailFixtures`
· Modify `RegistryMailBulkheadIT`

- [x] **Step 1:** Move the nested `ControllableMailer` and `ControllableMailerConfiguration` out of
      `RegistryMailBulkheadIT` verbatim (public types, Javadoc carried across), and lift its seeding /
      publishing / registry-reading helpers into `ConfirmationMailFixtures`.
- [x] **Step 2: Run the moved class, verify it is still green** —
      `gradle --no-daemon --console=plain test --tests "*RegistryMailBulkheadIT*"` → PASS (4 tests,
      `BUILD SUCCESSFUL in 3m 54s`). A pure move: if this is red, the move is wrong, not the design.
- [x] **Step 3: Commit** — `refactor(#407): share the registry-mail IT fixtures`.

## Phase 2 — The saturation IT (red → green)

**Files:** Create `RegistryMailShedDurabilityIT`

- [x] **Step 1: Write the test** — `@TestPropertySource` shrinking the bulkhead to `1/1`; wedge the
      single worker with a real confirmation send, fill the single queue slot with a second, then
      publish a third whose dispatch must be shed. Assert (AC-1) the shed counter moved and the
      transport was never entered for that booking; (AC-2) its publication is outstanding under the
      listener's `listener_id`; (AC-3) after release + drain, a **narrowed** resubmit delivers it and
      completes the publication.
- [x] **Step 2: Run it** — `gradle --no-daemon --console=plain test --tests "*RegistryMailShedDurabilityIT*"`
      → PASS. Then a falsification pass: with `queue-capacity=3` the third send is queued rather than
      shed and both tests FAIL (`AssertionError` at the shed-counter assertion), so the assertion has
      teeth. Property restored before the commit.
- [x] **Step 3: Commit** — `test(#407): prove a shed confirmation mail stays owed` (`3e783be`).

## Phase 3 — Repeat-run verification (AC-4) + close-out

- [x] **Step 1:** Run `RegistryMailShedDurabilityIT` **3×** and `RegistryMailBulkheadIT` **3×**,
      consecutively, and record the results in the AC-verification section. One clean run is not
      evidence for a class whose predecessor flaked 1-in-7. Also ran **both classes together in one
      JVM 3×** — the arrangement in which #406's interference actually surfaced.
- [x] **Step 2:** Run the structural net (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`,
      `*PackageShapeArchitectureTests*`) plus the mail-executor neighbours
      (`*MailListenerExecutorArchitectureTest*`, `*RegistryMailExecutorConfigTest*`,
      `*RegistryMailExecutorWiringIT*`, `*RegistryMailPropertiesTest*`) — all green.
- [x] **Step 3:** Mark the PR ready for review; run the Review + Sonar gates; finalize this section.
      Review gate: overlay + inline `/review` (degraded — F-3). Sonar gate: quality gate **passed**
      and, per `pr-gates.md` §2, the reported *list* pulled from the API rather than trusting the
      badge — `api/issues/search` returns `total: 0` and `new_bugs` / `new_vulnerabilities` /
      `new_code_smells` are all `0` against a `SonarCloud Code Analysis` check-run that concluded
      `success`, so the zero is an analysed zero, not the unanalysed one that reads identically.
      `new_lines` is absent because every file in the diff is a test or a doc.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-29 | Phase 1 (fixture extraction) | Other tests hand-rolling a controllable `Mailer`, or duplicating the confirmation-seeding SQL | `grep -rln "implements Mailer" platform/src/test/java` | `RegistryMailBulkheadIT` (extracted), `MockMailer` (production double, serves the recording-only ITs) | Extracted only what the two registry-mail ITs share; left `MockMailer`-based ITs alone — they need recording, not a gate |

---

## Acceptance-criteria verification (final)

> Filled with the real command output + commit SHA as each AC is actually verified.

- [x] **AC-1:** `gradle --no-daemon --console=plain test --tests "*RegistryMailShedDurabilityIT*"`
      → PASS. The test asserts the `riviera.mail.registry.shed` delta ≥ 1 immediately after the
      commit that is shed, and zero transport entries for that booking once the pool is idle again.
      Falsified deliberately at `queue-capacity=3` (third send queued, not shed) → `AssertionError`.
      Verified at commit `3e783be`.
- [x] **AC-2:** Same run — `outstandingMailPublications(407_000_703)` is exactly 1 under the
      confirmation listener's `listener_id`, read from the real `event_publication` table.
      Verified at commit `3e783be`.
- [x] **AC-3:** Same run — the narrowed resubmit delivers exactly one mail to that address and drives
      the outstanding count to 0; the context logs `No publications outstanding!` at shutdown, so the
      class strands nothing. Verified at commit `3e783be`.
- [x] **AC-4:** `RegistryMailShedDurabilityIT` **3/3** clean, `RegistryMailBulkheadIT` **3/3** clean,
      and the two together in one JVM **3/3** clean (`--rerun` each time, so no cached results), with
      the JUnit XML confirming `skipped=0` (4 + 2 tests) rather than a clean Docker-absent skip.
      The isolation mechanism was then **observed, not assumed**: polling `docker ps` through a
      combined run shows **two concurrent `postgres:17` containers**, so the shrunk-pool context
      really does carry its own database. Verified at commit `3e783be` (evidence re-gathered at the
      review round).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (N/A justified: no `availability` write path).
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking is created through the
      application; rows are seeded directly, as the sibling IT does.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports beyond the
      module's own test packages; event payload id-based (invariant #11).
- [x] **Payment/payout** section filled (N/A).
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — booking dates
      are `LocalDate`, seeded on dates no other IT uses.
- [x] Booking codes unguessable (invariant #7) — the test's seeded codes are fixtures, never logged.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards — N/A.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed.
- [x] **The review gate ran in full** — `riviera-review-overlay` plus, once the human authorised the
      subagents, the complete `/code-review` workflow: eligibility check, CLAUDE.md map, change
      summary, **five parallel reviewers** (CLAUDE.md compliance, bug scan, git-history context,
      prior-PR comments, comment compliance) and per-issue confidence scoring. **Zero issues scored
      at or above the 80 bar.** The one 60-scored observation and one sub-threshold wording nit were
      taken anyway (F-5, F-6).
