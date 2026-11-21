# #1859 batch 3: booking part B owns its venue, and the sweep ITs read only their own rows

**Goal:** the booking ITs of part B write only on venues they create and remove, and the no-show sweep ITs
assert only their own rows. `StaffBookingControllerIT`'s far-future days are read from the clock.

**Architecture:**
- Each class takes a `StayFixtures.venue` per test, with cleanup in `@AfterEach`, or records the venues it
  makes by hand (`CheckInFlowIT`).
- `NoShowSweepIT` and `MultiDayAttendanceIT` drop the whole-table drain in `@BeforeEach`; their assertions
  read their own rows. The race reads the sweep's platform-wide count, so it keeps one drain in-test.
- Test code only.

**Source of intent:** #1859 (batch 3 of 5, scope agreed with the orchestrator, including (a): the two sweep
classes' hand-made venues become fixture venues).

**Branch:** `bugfix/1859-booking-own-venue-b`

## Acceptance criteria

- [ ] **AC-1:** Given the batch's 10 classes in one fork, when each class finishes, then the row counts of
  #1859's 13 tables are what they were before it. *Pinned by:* the uncommitted row-count listener (one fork
  on `main` and on the branch, each class alone).
- [ ] **AC-2:** Given the same classes, when run with no travel and at now + 12 years, then every test is
  green and none is skipped.
- [ ] **AC-3:** Given the scoped sweep assertions, when the sweep is broken by an uncommitted mutation
  (M1: `sweep()` a no-op; M2: the missed-day bound `<` widened to `<=`), then each mutation turns tests in
  `NoShowSweepIT` / `MultiDayAttendanceIT` red.
- [ ] **AC-4:** No file under `platform/src/main` in the diff.

## Risks

- **R-1:** dropping the drain could leave an assertion reading another class's rows. → Every remaining
  assertion reads a row by id. The race keeps its in-test drain because its subject is the sweep's own count.
- **R-2:** a scoped assertion might no longer fail when the sweep is broken. → AC-3's mutation run.

## Open questions

## Phases

- **Phase 0:** the 10 classes; the row-count evidence both ways; the mutation runs.

## Execution status

- Phase 0: in progress.
