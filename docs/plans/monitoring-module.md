# Closed `monitoring` module Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** Platform observability lives in a closed `monitoring` module (`allowedDependencies = {}`):
the five root types and the two `shared` types move, with no behaviour change and no metric renamed.

**Architecture:** ADR-0028 Decision 5. Internals go to `monitoring.adapter.in`; `ObservabilityMetrics`
and `MdcTaskDecorator` are published in `monitoring.vocabulary` (a vocabulary allowance), not as a
`TaskDecorator` bean, because Boot applies a `TaskDecorator` bean to its own `applicationTaskExecutor`
and scheduler.

**Source of intent:** issue #1328; ADR-0028 Decision 5.

**Branch:** `feature/monitoring-module`

## Acceptance criteria

- [x] **AC-1:** Given the moved tree, when `ApplicationModules.verify()` runs, then `monitoring` is a
  closed module depending on nothing, and only `booking` and `notification` reach it, through
  `monitoring::vocabulary`. *Seam:* the module model · *Pinned by:* `ModularityTests`, the rest of the
  structural net.
- [x] **AC-2:** Given every self-configured worker pool, when the scan runs, then each still installs
  `MdcTaskDecorator`, and Boot's `applicationTaskExecutor` stays undecorated (no `TaskDecorator` bean).
  *Seam:* pool bytecode · *Pinned by:* `WorkerContextArchitectureTest`, the per-pool
  `aWorkerRunsWithTheSubmittersLoggingContext` tests.
- [x] **AC-3:** Given `MoneyPathAlertCheck` in `monitoring`, when the scheduler scan runs, then the job
  list and the pool sizing hold. *Seam:* `@Scheduled` bytecode · *Pinned by:* `ScheduledWorkArchitectureTest`.
- [x] **AC-4:** Given the moved gauge, filter and timeout, when the app boots, then the outbox gauge,
  the request timer, the correlation id and the scheduled-query bound behave as before, under the same
  metric names (`docs/runbooks/observability.md` stays true). *Seam:* the running context ·
  *Pinned by:* `ScheduledQueryTimeoutIT`, `OutboxBacklogGaugeIT`, `HttpServerRequestMetricsIT`,
  `StructuredLoggingIT`, `CorrelationIdFilterTest`, `MoneyPathAlertCheckTest`.
- [x] **AC-5:** Given the root after the move, when the root-discipline rules run, then they stay green.
  *Pinned by:* `CompositionRootDisciplineTests`.

## Non-goals

- Decorating Boot's `applicationTaskExecutor` (a stated non-goal of `WorkerContextArchitectureTest`).
- Renaming any metric, or moving emission/tags out of the modules that own the thing measured.

## Risks

- **R-1:** A module test loses a root bean it relied on → the `@ApplicationModuleTest` population
  (`PayoutModuleTest`, `ReviewSubmitFlowIT`) is run after the move.
- **R-2:** The `ScheduledQueryTimeout` boot check stops running in module tests → enough: production
  and every `@SpringBootTest` boot it, the committed value is unit-tested
  (`ScheduledQueryTimeoutBoundsTest`), and neither module test overrides the property.
- **R-3:** A missing grant passes compilation but fails `verify()` → the structural net runs before push.

## Open questions

### Resolved

- **How is `MdcTaskDecorator` published?** `monitoring::vocabulary`, built with `new`. A bean would be
  applied by Boot 4 (`TaskExecutorConfigurations`, `TaskSchedulingConfigurations`) to
  `applicationTaskExecutor` and the scheduler, and `AsyncMailDispatcher` needs the static
  `payloadOf`/`inContextOf`. Recorded in `riviera-modulith`.
- **Which modules get a grant?** `booking` and `notification` only; `payment` references only
  inlined constants.

## Modulith

- New module `monitoring`: `vocabulary` (`ObservabilityMetrics`, `MdcTaskDecorator`) plus `adapter/in`
  (`ObservabilityConfig`, `CorrelationIdFilter`, `MoneyPathAlertCheck`, `MoneyPathAlertProperties`,
  `ScheduledQueryTimeout`). No port, no event, no table. Owner check: `RESPONSIBILITIES.md` § `monitoring`.

## Phases

- **Phase 0 — move + grants + substrate:** the move, the grants, the docs · net green.

## Execution status

**Stage pointer:** `review`

**Next action:** open the draft PR, then run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — move + grants + substrate | ✅ | 85ac1619 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
