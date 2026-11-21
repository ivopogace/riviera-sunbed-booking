# #1859 batch 2: booking part A owns its venue

**Goal:** the ten booking ITs of part A stop writing on the seeded venue's sets. Each test reserves or
seeds on a venue it creates and removes, and no class leaves a row behind.

**Architecture:**
- Each class takes a `StayFixtures.venue` per test, with `StayFixtures.cleanup` in `@AfterEach`.
  Classes that publish nothing use `cleanupNow`.
- `OwnershipFixtures.grantToBootstrap` is added where an operator path asserts ownership (#13).
- The classes that inserted venues and operators by hand now create them through `StayFixtures`, so the
  cleanup removes them too.
- Test code only.

**Source of intent:** #1859 (batch 2 of 5, scope agreed with the orchestrator).

**Branch:** `bugfix/1859-booking-own-venue-a`

## Acceptance criteria

- [ ] **AC-1:** Given the batch's 10 classes in one fork, when each class finishes, then the row counts
  of the 13 tables in #1859 are what they were before it. *Seam:* the shared Testcontainers database.
  *Pinned by:* the uncommitted row-count listener, run in one fork on `main` and on the branch, and on
  each class alone.
- [ ] **AC-2:** Given the same classes, when run with no travel and at `RIVIERA_TEST_TRAVEL_TO` = now +
  12 years, then every test is green and none is skipped.
- [ ] **AC-3:** Given `ConcurrentRangeReservationIT` on its own venue, when the claim's guard is weakened
  (an uncommitted mutation: the claim always answers `CLAIMED`), then the race test fails. The racers
  still contend for one `(set, date)` and exactly one wins (#2).
- [ ] **AC-4:** No file under `platform/src/main` in the diff.

## Risks

- **R-1:** `StayFixtures.cleanup` waits for the venue's incomplete publications, and a refund IT
  deliberately leaves one outstanding. → That test heals or completes its own row; the wait is never
  weakened.
- **R-2 (#2):** a race IT that moves sets could stop racing. → Both racers keep one set and one day.
  AC-3's mutation run proves the test can still fail.
- **R-3 (#13):** a venue nobody owns would turn the refund ITs' operator paths into `403` tests. → The
  venue is granted to the bootstrap operator. The "unowned" venues in `VenueDayRefundServiceIT` stay
  ungranted on purpose.

## Open questions

## Phases

- **Phase 0:** the 10 classes; the row-count evidence both ways; the mutation run.

## Execution status

- Phase 0: in progress.
