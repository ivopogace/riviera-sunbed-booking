# Far-date flips in the backend ITs Implementation Plan

**Goal:** Every test in #1841's section 1 is green with the test clock at 2038-01-01T10:00Z and with the real clock, and none of those classes writes on a venue it does not own.

**Architecture:** Test code only. A date that must be in the future comes from the context `Clock` (`TiraneDaytimeClock.today`); a class that writes availability or bookings does it on a `StayFixtures.venue` of its own and removes it, so a clock-derived date cannot collide across classes or runs. `StayFixtures` becomes public so the `availability`, `notification` and root test packages can use it.

**Source of intent:** #1841 (agent brief comment); pattern from #1839.

**Branch:** `bugfix/far-date-flips-1841`

## Acceptance criteria

- [ ] **AC-1:** Given the clock at 2038-01-01T10:00Z, when each class of #1841's section 1 table runs, then every test in it is green. *Seam:* `RIVIERA_TEST_TRAVEL_TO` (`TestClockTravel`) · *Pinned by:* the eleven classes, red before and green after, recorded in the PR body.
- [ ] **AC-2:** Given the real clock, when the same classes run, then they are green. *Seam:* the same classes · *Pinned by:* CI's backend job.
- [ ] **AC-3:** Given a venue made by `StayFixtures.venue(…, true)`, when `cleanupNow` runs, then the operator it created is gone and no other operator is. *Seam:* `StayFixtures.cleanupNow` · *Pinned by:* `StayFixturesCleanupScopeIT.cleanupRemovesTheOperatorTheFixtureCreatedAndNoOther`.
- [ ] **AC-4:** No file under `platform/src/main` changes. *Pinned by:* the diff.

## Non-goals

- #1842: the other writers on the seeded set, the wall-reading classes (`GuestContactRetentionIT`'s racing test among them), the no-show-sweep question, a clock-travel pass in the daily workflow.

## Risks

- **R-1:** A clock-derived date on a shared set collides for ever (#2) → every converted class that writes owns its venue and removes it after each test.
- **R-2:** A test that only passed because its date was far away now exercises another window (#4/#10) → dates are chosen inside the same window the literal was in (free-cancellation, on sale), and each class is run under travel and on the real clock.
- **R-3:** Removing the fixture's operator breaks a row that names it → no foreign key names `operator` except `operator_venue` (deleted first) and two `ON DELETE CASCADE` tables; only a `stay-op-%` owner of the venue is deleted, never the bootstrap operator a class linked itself.
- **R-4:** A real date bug in production code surfaces → stop, `NEEDS USER DECISION`.

## Open questions

None.

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged; the tests drive the staff mark, the online claim and SQL seeds on their own venues.
- **Pinning test:** `ConcurrentReservationIT` is untouched.

## Phases

- **Phase 0 — fixture:** `StayFixtures` public; cleanup removes its operator · red `StayFixturesCleanupScopeIT.cleanupRemovesTheOperatorTheFixtureCreatedAndNoOther`
- **Phase 1 — availability:** `StaffAvailabilityIT`, `StaffAvailabilityControllerIT`, `RetiredSetClaimIT`, `CrossVenueDenialIT`
- **Phase 2 — booking:** `BookingViewIT`, `CancellationTermsEndpointIT`, `BookingEventIT`, `CancelBookingIT`
- **Phase 3 — venue and notification:** `BeachMapReplaceIT`, `BookingCancellationMailIT`, `StayCancellationMailIT`

## Execution status

**Stage pointer:** implement (phase 0)

**Next action:** phase 0 red test

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — fixture | ⏳ | |
| 1 — availability | | |
| 2 — booking | | |
| 3 — venue and notification | | |
