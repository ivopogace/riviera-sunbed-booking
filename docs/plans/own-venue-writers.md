# Section 1's writers own their venue, and #1846's residue goes (#1842) Implementation Plan

> Test code only. Invariant numbers: `CLAUDE.md`.

**Goal:** each of section 1's five writers and the four classes #1846 left residue in reads and writes only rows it
created and leaves none behind, run alone and in one fork with neighbours.

**Architecture:** the writers move from the seeded venue's first online sets onto a venue of their own
(`StayFixtures.venue`), removed after each test; the residue classes record the venues and operators they insert and
remove them; `StayFixtures.cleanupNow` also removes the guests its bookings named that no other booking still names.

**Source of intent:** #1842 (section 1; the #1846 residue comment; triage comment PR order).

**Branch:** `bugfix/own-venue-writers-1842`

## Acceptance criteria

- [x] **AC-1:** Given the ten classes, when each runs alone and all run in one fork, then the row counts of the tables
  they touch are the same before and after each class. *Seam:* the shared Testcontainers database · *Pinned by:* a
  scratch row-count probe (evidence only, never committed); the result is in the PR body.
- [x] **AC-2:** Given a venue's cleanup, when its bookings named a guest no other booking names, then the guest is
  removed, and a guest another venue still books stays. *Pinned by:*
  `StayFixturesCleanupScopeIT.cleanupRemovesTheCustomersOfItsBookingsButNotOneAnotherVenueStillBooks`.
- [x] **AC-3:** `StaffMarkVsOnlineClaimConcurrencyIT` races on a day the staff mark accepts (from the clock), so the
  race never degenerates into the claim winning alone. *Pinned by:* the class.
- [x] **AC-4:** The whole suite is green with no travel and red only on F (#1854) at 2038.
- [x] **AC-5:** No file under `platform/src/main` in the diff.

## Non-goals

- The other classes that write on the seeded venue's first online set (`ORDER BY id LIMIT 1`, about 25): none is known
  to collide today; reported on #1842 with a proposal, not swept here.
- Section 3 (the no-show sweep's reach): a report after this PR.

## Risks

- **R-1:** deleting a guest another booking still names → the delete is guarded by `NOT EXISTS (booking)`; the only
  foreign key to `customer` is `booking.customer_id`.
- **R-2:** a test re-points a booking's guest and orphans the old one → `BookingMovedMailIT` removes it where it
  re-points.

## Phases

- **Phase 0 — own venues, residue removal, guest cleanup:** red = the new cleanup-scope test; the probe on `main`.

## Execution status

**Stage pointer:** review (round 1)

**Next action:** mark #1856 ready and run the review gate at high.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — own venues and residue | ✅ | `b48dd95`, `ec77daf` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
