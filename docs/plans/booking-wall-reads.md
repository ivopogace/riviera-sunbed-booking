# Booking ITs read the context clock (#1842, group B) Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** with `RIVIERA_TEST_TRAVEL_TO=2038-01-01T10:00:00Z`, the 18 group-B classes that #1842's triage found red
(48 tests) are green, and the `booking` package batch has no red left; with the real clock, the suite stays green.

**Architecture:** every wall read in the 18 classes, in the six compile-only callers group A left, and in
`StayFixtures.insertStay` reads the context `Clock`: `TiraneDaytimeClock.today(clock)` for "today",
`clock.instant()` for stamps and expiries, a bound `:now` for seed SQL. Static date helpers become instance methods;
clock-derived fields move into `@BeforeEach`, since a field initializer runs before injection.

**Source of intent:** #1842 (triage comment, PR order; the group-A note on `insertStay`).

**Branch:** `bugfix/booking-wall-reads-1842`

## Acceptance criteria

- [ ] **AC-1:** Given the clock at 2038-01-01T10:00Z, when the `booking` package batch runs, then the 48 group-B
  tests red on `main` are green and nothing else in the batch is red. *Seam:* the context `Clock` moved by
  `TestClockTravel` · *Pinned by:* the 18 classes; the batch.
- [ ] **AC-2:** Given the real clock, when the touched classes and the rest of the suite run, then they are green.
  *Seam:* same · *Pinned by:* the touched classes; the suite in package batches.
- [ ] **AC-3:** No file under `platform/src/main` in the diff.

## Non-goals

- Groups C–F, section 1's writers, #1846's residue, sections 3 and 4: later PRs on #1842.
- `event_publication.completion_date = now()` in `StayFixturesCleanupScopeIT`: Modulith's registry, not a domain row.

## Risks

- **R-1:** a clock-derived field initialised before injection is null → moved into `@BeforeEach`
  (`RequestAcceptRevertIT`, `SeasonClosureVsReserveRaceIT`); the no-travel run shows it.
- **R-2:** an untyped `:now` inside `CASE` or arithmetic → `CAST(:now AS timestamptz)` there.
- **R-3:** `StayMoveReminderIT` already pins its own `MovableClock`; `insertStay` takes that clock, no second field.

## Phases

- **Phase 0 — the group-B classes, the compile-only callers and `insertStay` read the clock:** red = the 48 tests
  at 2038 on `main`.

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** open the draft PR; finish the booking batch at 2038 and the no-travel suite.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — group B reads the clock | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
