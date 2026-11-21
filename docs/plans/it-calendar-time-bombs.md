# Backend ITs stop depending on literal dates that meet "today" — Implementation Plan

**Goal:** every backend IT known to fail before mid-2029 for a calendar reason passes with the application
clock moved years ahead, and no test reads the JVM default zone.

**Architecture:** test code only. A date that must be today or ahead of today comes from the context `Clock`
read in `Europe/Tirane` (`TiraneDaytimeClock.today`); a test that counts or races on a venue owns it and
removes it. `TestClockTravel` moves every test context's clock from an env var to show a test failing.

**Source of intent:** #1827 (triage outcome and agent brief in its comment). Follow-up: #1841.

**Branch:** `bugfix/1827-it-calendar-time-bombs`

## Acceptance criteria

- [x] **AC-1:** Given the clock moved to 2038-01-01, when `VenueAvailabilityCalendarIT`, `VenueAdminControllerIT`, `AbandonedBookingSweepIT`, `StaffBookingControllerIT`, `ConcurrentReservationIT` and `MyBookingsIT` run, then all pass. *Seam:* the context `Clock` · *Pinned by:* those classes under `RIVIERA_TEST_TRAVEL_TO`
- [x] **AC-2:** Given another class's rows on the seeded Miramar set, when `StaffBookingControllerIT` counts and `ConcurrentReservationIT` races, then neither sees them. *Seam:* `GET /api/venues/{id}/bookings`, `CreateBooking` · *Pinned by:* the pairs run in one fork at 2027-08-20, 2027-08-24, 2031-08-12, 2031-08-16, 2028-06-30
- [x] **AC-3:** Given any class under the base package, when it calls a no-argument `now()` or `ZoneId.systemDefault()`, then the build fails. *Pinned by:* `DefaultZoneArchitectureTests.nothingReadsTheJvmDefaultZone`
- [x] **AC-4:** No file under `platform/src/main` changes.

## Non-goals

- Flips from 2029-07 on, the collisions' writer side, the wall-reading classes: #1841.
- A static literal-date guard; a scheduled clock-travel run.

## Risks

- **R-1:** a clock-derived date on a shared seeded set collides every day instead of one day → the two classes that count or race own their venue; the three flip fixes sit on a venue the test creates, or in the `TiraneDaytimeClock` context's own database at an offset no other class there uses.
- **R-2:** invariant #2 loses its concurrency proof → `ConcurrentReservationIT` races the same `CreateBooking` on the same `(set, date)` shape, only on its own set.

## Execution status

- Phase 0 (hook, triage sweep): done. Phase 1 (near flips, owned venues): done. Phase 2 (default-zone call sites, rule): done.
- Next: CI on the push, merge `origin/main`, mark ready, review gate, remove this file in the last commit.
