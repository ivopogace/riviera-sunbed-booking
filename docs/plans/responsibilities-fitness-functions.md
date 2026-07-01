# RESPONSIBILITIES.md Fitness Functions (C4) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Encode the machine-checkable half of `RESPONSIBILITIES.md` as three ArchUnit-style
fitness functions (availability sole-writer, Stripe-only-in-`payment`, id-based event
payloads), each with a proven red run, on top of a newly extracted shared ArchUnit support
class that de-duplicates the classpath import and package arithmetic across all arch tests.

**Architecture:** Test-only + docs slice, no production code change. The one significant
decision: rule 1 detects "writes the availability table" by **compiled-bytecode string
inspection** (the `NoStripeConnectArchitectureTest` precedent) rather than class-location
convention — location conventions cannot see SQL, and the project's text-block-SQL idiom
(`riviera-java-conventions` §1) keeps table names contiguous in the constant pool. Negative
proofs use **compiled test fixtures** (the `ai.riviera.placementfixture` precedent from #95),
never a broken production build.

**Persistence:** JDBC only (invariant #1). No tables/migrations touched — test-only slice.

**Source of intent:** issue #96 (epic #93, improvement-plan item C4), plus the #94/#95
review-gate notes on #93 mandating the shared ArchUnit support extraction.

**Skills consulted:** `riviera-modulith` (which surfaces the rules key off: events/vocabulary
named interfaces, the api/spi split; confirmed the new tests live at the platform test root
like their siblings), `riviera-java-conventions` (test idioms, text-block-SQL rationale for
the bytecode-scan decision, no-magic-literals in the rule constants), `tdd` (fixture-first
red→green per rule), `riviera-local-debug` (cloud Gradle recipe + scoped-test discipline),
`riviera-plan-doc` (this doc). `postgres` N/A — no schema change; `angular-developer`/
`playwright-cli` N/A — no frontend; `riviera-stripe-payments` consulted-by-reference only:
no payment behavior changes, rule 2 merely fences the existing locked model (an import rule,
not a payment change). `codebase-design` N/A — no production seam is added or moved.

**Branch:** `claude/archunit-shared-support-728qv7` (cloud session's designated branch,
standing in for `feature/responsibilities-fitness-functions` per the SDLC remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1 (sole-writer):** Given the production classes, when any class outside
  `ai.riviera.platform.availability` references the `set_availability` table in its compiled
  bytecode, then the rule fails naming the class; on current `main` it passes and the
  scan is proven non-vacuous (availability's own writers DO contain the symbol).
  *Pinned by:* `ResponsibilitiesArchitectureTests.availabilityTableIsTouchedOnlyInsideTheAvailabilityModule`
  (+ non-vacuous guard `theAvailabilityModuleItselfWritesTheTable`).
- [x] **AC-2 (sole-writer red run):** Given the compiled fixture class outside the
  availability "module" carrying `set_availability` SQL, when the same collector runs over
  the fixture tree, then it reports that class.
  *Pinned by:* `ResponsibilitiesArchitectureTests.outsideWriterFixtureIsRejected`.
- [x] **AC-3 (Stripe reach):** Given the production classes, when any class outside
  `ai.riviera.platform.payment` depends on a `com.stripe..` type, then the rule fails; on
  `main` it passes, and a sanity check proves `payment` itself does depend on Stripe
  (non-vacuous). *Pinned by:*
  `ResponsibilitiesArchitectureTests.stripeSdkIsReachableOnlyInsideThePaymentModule` (+
  `thePaymentModuleItselfUsesStripe`).
- [x] **AC-4 (Stripe red run):** Given a fixture class outside the fixture `payment` module
  importing the Stripe SDK, when the collector runs over the fixture import, then it reports
  that class. *Pinned by:* `ResponsibilitiesArchitectureTests.stripeOutsidePaymentFixtureIsRejected`.
- [x] **AC-5 (id-based events):** Given every record in any `events` named interface, when any
  raw type involved in a non-static field's declared type (generics/arrays unwrapped) is not
  (primitive | `java.*` | a `vocabulary`-surface type), then the rule fails naming the record
  and field — in particular any type from a `domain` package, bare or wrapped in a container;
  on `main` it passes (non-vacuous guard).
  *Pinned by:* `ResponsibilitiesArchitectureTests.eventRecordsCarryOnlyIdsAndValues` (+
  `eventSurfacesWereInspected`).
- [x] **AC-6 (events red run):** Given a fixture event record carrying a fixture
  domain-aggregate component, when the collector runs over the fixtures, then it reports the
  record. *Pinned by:* `ResponsibilitiesArchitectureTests.aggregateCarryingEventFixtureIsRejected`.
- [x] **AC-7 (shared support):** Given the extraction of `ArchitectureTestSupport`, when
  `PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`,
  `VenueApiRoleSplitTests`, `OperatorAuthPlacementTests` and the new class run, then they
  share ONE production `ClassFileImporter` scan and one copy of the module/surface package
  arithmetic, and all stay green. *Pinned by:* the five classes compiling against
  `ArchitectureTestSupport` + the structural-net run staying green.
- [x] **AC-8 (docs):** `RESPONSIBILITIES.md` cross-references the fitness tests and states
  the machine-checkable vs semantic (necessary-not-sufficient) split; the same statement
  heads the new test class's javadoc. *Verified by inspection at review.*
- [ ] **AC-9:** No behavior change; full suite green in CI.

## Non-goals

- **No semantic-boundary enforcement.** A refund *policy* reimplemented inside `payment` or
  commission *math* inside `venue` needs no illegal import — it cannot be encoded in ArchUnit
  and stays with the plan-time Module-ownership table + review item RV-BE-11. Stated
  explicitly in docs (AC-8).
- **No generalized consumer-allowlist rules for role ports.** Revisited per the #94
  review-gate note and **re-rejected**: an allowlist of consumers per port is brittle (every
  legitimate new consumer breaks the build for no design reason). #94's dependency-direction
  shape (`VenueApiRoleSplitTests`) stands.
- **No new production code, schema, or config.** Test sources + docs only.
- **No CI/Gradle changes** — ArchUnit already arrives via `spring-modulith-starter-test`.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Bytecode string scan misses SQL assembled by concatenation that splits the table name | low | med | Project idiom is text-block SQL with contiguous table names (`riviera-java-conventions` §1); limitation documented in the test javadoc as part of the necessary-not-sufficient statement | agent | documented in test javadoc |
| R-2 | Future legitimate non-SQL use of the literal `set_availability` outside `availability` (e.g. an error message) trips rule 1 | low | low | Failure message explains intent and points to availability's published ports; such a use is itself a boundary smell worth a build break | agent | accepted |
| R-3 | Shared-support refactor silently changes an existing rule's scope (e.g. `OperatorAuthPlacementTests` moving from an operator-only import to a filtered full import) | low | med | Phase 0 is a pure refactor gated by all five arch-test classes staying green, incl. #95's fixture-proven negative tests; equivalence reasoned in the commit | agent | closed @ phase 0 commit |
| R-4 | Rule 3's whitelist (primitive / `java.*` / vocabulary) is stricter than the issue's floor ("never domain") and could false-positive a future legitimate component kind | med | low | Documented weakening path in the test javadoc (add the category, never delete the rule); today's events all pass; the floor (no `domain` types) is unaffected | agent | documented |
| R-5 | Local full-suite run OOM-kills the cloud container | med | med | `riviera-local-debug` scoped-test discipline: structural net + new class only; CI owns the full suite | agent | standing |

## Open questions / Assumptions

*(none open)*

### Resolved

- **Rule-1 detection mechanism** (delegated to plan stage by the issue): **bytecode
  constant-pool string inspection** over `build/classes/java/main`, excluding the
  `availability` module tree — the `NoStripeConnectArchitectureTest` precedent. A
  class-location convention cannot see SQL; ArchUnit exposes no string constants. — resolved
  in this plan.
- **Rule-1 strength:** enforced as **sole-toucher** (no reference to `set_availability` at
  all outside the module), deliberately stronger than the issue's "sole-writer" floor:
  invariant #11 forbids cross-module *reads* of another module's table just as much (reads
  go through `availability`'s published ports — e.g. `venue.spi.SetAvailabilityLookup`
  implemented by availability), and today no outside class references the table. Documented
  in the test javadoc. — resolved in this plan.
- **Red-run proof approach** (delegated to plan stage): **compiled negative fixtures** under
  `ai.riviera.responsibilityfixture` with collectors parameterized by base/root — the exact
  #95 `placementfixture` mechanism; no documented-manual-red-run, the red case runs on every
  build. — resolved in this plan.
- **Rule-3 shape:** whitelist (positive "id/value types" form) over blacklist, static fields
  excluded (a `private static final` constant is not payload). — resolved in this plan.
- **Epic-note drift:** the #93 note says "three arch-test classes re-scan the classpath";
  reality on `main` is **four** classes / five importers (`PackageShape`,
  `PublishedSurfacePlacement`, `VenueApiRoleSplit`, `OperatorAuthPlacement`). The extraction
  covers all four + the new fifth. — recorded here; epic checklist tick will note it.

## Availability & concurrency (invariant #2)

No write path, constraint, or claim strategy changes — this slice adds the **fitness
function** that fences the existing design: only `availability` classes may reference the
`set_availability` table (today: `JdbcAvailabilityClaim`, `StaffAvailabilityService` write;
`JdbcSetAvailabilityLookup` reads). The DB-level guarantees (`set_availability_uniq`,
`INSERT … ON CONFLICT DO NOTHING`) are untouched and remain pinned by their existing ITs.
The new rule makes the "only writer" clause of invariant #2 a build failure instead of a
review memory.

## Spring Modulith — modules, interfaces, events

**Modules touched:** none in production. All new code is test-scope at the platform test
root (`ai.riviera.platform`, sibling to `ModularityTests` and the existing arch tests) plus
test fixtures under `ai.riviera.responsibilityfixture` (outside the Modulith base package,
like `ai.riviera.placementfixture`). No `allowedDependencies`, no named interfaces, no
events change. `ModularityTests` and the existing arch net are the safety rail.

**Module-ownership table:** all new capability is platform-root **test** code (cross-module
fitness functions cannot live inside one module) + docs; no production boundary change. The
one placement note: `NoStripeConnectArchitectureTest` stays where it is
(`…platform.payment`, module-scoped concern: *which Stripe APIs* payment may use); the new
rule 2 is the cross-module complement (*who* may use Stripe at all) and therefore lives at
the root.

**Cross-module named interfaces (`api/` ports):** none added/changed.

**Domain events:** none added/changed — rule 3 fences the existing ones
(`BookingConfirmed`, `BookingCancelled`, `PaymentConfirmed`, `PaymentCanceled`).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves and no payment/payout behavior changes. Rule 2 only fences the locked
collect-only model's *location* (Stripe SDK importable solely inside `payment`), which
`RESPONSIBILITIES.md` already states and `NoStripeConnectArchitectureTest` complements.

## Angular — frontend surfaces touched

N/A — backend-test-only.

## FE↔BE contract

N/A — no contract change.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Extract `ArchitectureTestSupport`, refactor 4 existing arch-test classes | ✅ | 3e78e27 |
| 1 — Rule 1: availability sole-writer (bytecode scan + fixture red run) | ✅ | 21d28fc |
| 2 — Rule 2: Stripe SDK only in `payment` (+ fixture red run) | ✅ | 21d28fc |
| 3 — Rule 3: id-based event payloads (+ fixture red run) | ✅ | 21d28fc |
| 4 — RESPONSIBILITIES.md cross-reference + necessary-not-sufficient statement | ✅ | 240e28d |
| 5 — Review-gate fixes (precision + dedup: Stripe package boundary, whole-word table match, generics-unwrapped event rule, source-URI scan, shared bytecode()/assertNoViolations) | ✅ | 6b4161a |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

---

## File structure

- `platform/src/test/java/ai/riviera/platform/ArchitectureTestSupport.java` — NEW: the one
  production `ClassFileImporter` import + fixture-importer helper + module/surface package
  arithmetic (`segmentsBelow`, `moduleOf`, `surfaceOf`, `moduleRelativeSegments`,
  `isPackageInfo`).
- `platform/src/test/java/ai/riviera/platform/PackageShapeArchitectureTests.java` — MODIFY:
  drop private importer + arithmetic, use the support.
- `platform/src/test/java/ai/riviera/platform/PublishedSurfacePlacementArchitectureTests.java`
  — MODIFY: same.
- `platform/src/test/java/ai/riviera/platform/VenueApiRoleSplitTests.java` — MODIFY: shared
  importer.
- `platform/src/test/java/ai/riviera/platform/OperatorAuthPlacementTests.java` — MODIFY:
  shared importer + `that().resideInAPackage("…operator..")` filter (equivalent scope).
- `platform/src/test/java/ai/riviera/platform/ResponsibilitiesArchitectureTests.java` — NEW:
  the three rules + non-vacuous guards + fixture-backed negative proofs; javadoc states the
  machine-checkable vs semantic split.
- `platform/src/test/java/ai/riviera/responsibilityfixture/**` — NEW: deliberately-violating
  fixtures (`rogue.adapter.out.RogueAvailabilityWriter` with `set_availability` SQL text
  block; `rogue.application.RogueStripeCaller` importing `com.stripe`; `provider.events.
  AggregateCarryingEvent` + `provider.domain.FakeAggregate`; fixture `payment` module class
  proving the payment-exclusion path).
- `RESPONSIBILITIES.md` — MODIFY: "Machine-checked vs review-checked" section.
- `docs/plans/responsibilities-fitness-functions.md` — this doc.

---

## Phase 0 — Extract shared ArchUnit support (pure refactor, net stays green)

- [x] Create `ArchitectureTestSupport` (package-private, static-only).
- [x] Refactor the four existing arch-test classes onto it; no rule-semantics change.
- [x] Scoped run green: `gradle --no-daemon --console=plain test --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*VenueApiRoleSplitTests*" --tests "*OperatorAuthPlacementTests*" --tests "*ModularityTests*"`.
- [x] Commit + status row update.

## Phases 1–3 — one rule per TDD cycle (fixture-red first)

Per rule: (a) write the fixture(s) + the negative-proof test asserting the collector flags
them → RED (collector not yet written); (b) implement the collector + the production test +
the non-vacuous guard → GREEN; (c) scoped run: `--tests "*ResponsibilitiesArchitectureTests*"`
+ the structural net.

## Phase 4 — docs

- [x] `RESPONSIBILITIES.md`: cross-reference table (which clause → which test) + the
  necessary-not-sufficient statement; commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-01 | Phase 0 (importer dedup) | other `new ClassFileImporter` | `grep -rn "new ClassFileImporter" platform/src/test` | 5 sites in 4 classes | all migrated to the support class |
| 2026-07-01 | Phase 5 (review fixes) | other ISO-8859-1 bytecode readers + `assertNoViolations` copies | `grep -rn "ISO_8859_1\|assertNoViolations" platform/src/test` | 2 readers, 3 assertion copies | all collapsed into `ArchitectureTestSupport.bytecode()` / `.assertNoViolations()` (incl. `NoStripeConnectArchitectureTest`) |

---

## Acceptance-criteria verification (final)

- [x] AC-1..AC-7: `gradle … test --tests "*ResponsibilitiesArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*" --tests "*VenueApiRoleSplitTests*" --tests "*OperatorAuthPlacementTests*" --tests "*ModularityTests*"` → all green locally (JDK-25 toolchain recipe); verified at 21d28fc and re-verified after the review-fix round 6b4161a (structural net + ResponsibilitiesArchitectureTests, 9/9, skipped=0).
- [x] AC-8: RESPONSIBILITIES.md section present; test-class javadoc states the split.
- [ ] AC-9: full suite green in CI on the PR.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-8 verified by inspection — docs).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — test-only slice.
- [x] **Availability** section filled — no write-path change; fitness function only (invariant #2).
- [x] Pool + cutoff rules untouched (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*` imports; no event payload change (invariant #11).
- [x] **Payment/payout** N/A justified; no money movement (invariants #5, #8, #9, #10).
- [x] Timezone/booking-code/Flyway items untouched (invariants #6, #7, #12).
- [x] **Frontend** N/A — backend-test-only.
- [x] Execution-status table at HEAD matches reality.
- [x] Risk register has no stale `open` rows; Open Questions empty.
