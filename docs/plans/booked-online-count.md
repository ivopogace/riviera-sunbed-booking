# Booked-online count served by `booking` Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the console stats strip's **Booked online** tile reads one server-side count
(`GET /api/venues/{venueId}/bookings/count?date=`) instead of filtering the guest-list payload on the client.

**Architecture:** `booking` owns the rule: a count query beside `findSettledForVenueOn` on the `Bookings` port,
served through the existing `ListDailyBookings` inbound port (ownership asserted first, #13) by
`StaffBookingController`. The guest-list wire stays a bare list; the strip stops downloading guests' codes and
attendance just to count them.

**Source of intent:** #1624 (decision comment: Q1 server-served dedicated read, Q2 the meaning below).

**Branch:** `feature/booked-online-count` (cloud session branch).

## Acceptance criteria

- [ ] **AC-1:** Given a venue's bookings covering D in `CONFIRMED`, `COMPLETED` and `NO_SHOW`, plus one
  `AWAITING_PAYMENT` and one `CANCELLED` (a whole-booking cancel), when the owner reads the count for D, then it
  is the three settled ones. *Seam:* `GET /api/venues/{venueId}/bookings/count` · *Pinned by:*
  `StaffBookingControllerIT.bookedOnlineCountsSettledBookingsHoldingASet`
- [ ] **AC-2:** Given a stay whose D+1 was refunded and released by the venue (ADR-0027) and whose D was refunded
  with the claim kept (weather), when the count is read for D and D+1, then D counts the stay and D+1 does not.
  *Seam:* same route · *Pinned by:* `StaffBookingControllerIT.bookedOnlineDropsAReleasedDayAndKeepsAKeptClaim`
- [ ] **AC-3:** Given no `date`, when the owner reads the count, then it is today's in `Europe/Tirane` (#6), and
  the body names that date. *Seam:* same route · *Pinned by:* `StaffBookingControllerIT.bookedOnlineDefaultsToTodayInTirane`
- [ ] **AC-4:** Given an anonymous caller, the read is `401`; given an operator not owning the venue, `403`
  (ownership in `DailyBookingsService`, #13). *Seam:* route + `SecurityConfig` · *Pinned by:*
  `StaffBookingControllerIT.bookedOnlineCountRequiresOperator`, `CrossVenueDenialIT` (non-owner + owner cases),
  `EndpointRoleGateCoverageTest`
- [ ] **AC-5:** Given the strip loads or receives a `DAY_REFUND` change, when it reads Booked online, then it
  calls the count route and renders its `count` verbatim (no client filter); a failed read renders "—".
  *Seam:* `OperatorConsoleService#dailyBookingCount` · *Pinned by:* `console-stats-strip.spec.ts`,
  `operator-console.service.spec.ts`, `operator-daily.e2e.ts` / `operator-console.e2e.ts` tile asserts

## Non-goals

- The #1547 single-slot latest-wins token shared by the map refresh and a venue switch.
- Changing the guest-list wire or `findSettledForVenueOn`'s row set.
- Changing when the strip re-reads (`AvailabilityChanges` `DAY_REFUND` trigger kept as is).

## Risks

- **R-1 (BOLA, #13):** a new venue-scoped read → `DailyBookingsService` asserts `VenueOwnership` first;
  `CrossVenueDenialIT` pins the 403.
- **R-2 (public fall-through):** `/api/venues/*/bookings/count` would otherwise match the public
  `GET /api/venues/**` rule → an explicit `OPERATOR` matcher ahead of it; `EndpointRoleGateCoverageTest` +
  the 401 IT.
- **R-3 (rule drift):** the count and the guest list could disagree on what "settled" means → the count's SQL
  reuses the same status set and covering-date predicate, plus `released_at IS NULL`; the AC-2 IT pins the edge.
- **R-4 (#6):** the default date is today in `Europe/Tirane`, not the JVM zone.

## Open questions

### Resolved

- Q1/Q2 of #1624 — decided on the issue (server-served dedicated read; "Booked online" = settled online
  bookings whose day is not released).

## Modulith

- No new port, event or cross-module call: `Bookings#countBookedOnlineOn` and
  `ListDailyBookings#bookedOnlineOn` are methods on `booking`-internal ports; the controller is `booking`'s.
  Owner check: `booking` § staff daily list (RESPONSIBILITIES.md) — reading its own `booking`/`booking_day`.

## Availability & concurrency

- Read-only: no write to `set_availability`; no claim path touched. A released day's claim was already given
  back by ADR-0027's write; the count reads `booking_day.released_at`, the same fact the guest list badges.

## FE↔BE contract

- **New:** `GET /api/venues/{venueId}/bookings/count?date=YYYY-MM-DD` (operator, owner-asserted) →
  `{ "date": "YYYY-MM-DD", "count": n }`.

## Phases

- **Phase 0 — backend count read:** AC-1…AC-4 · red `StaffBookingControllerIT` count tests.
- **Phase 1 — strip reads the count:** AC-5 · red `console-stats-strip.spec.ts` / service spec; e2e mocks.
- **Phase 2 — docs + spec tidy:** CONTEXT.md term, RESPONSIBILITIES.md § booking; drop the trivially-true
  denial-path `expect(seen)` in `daily-view-tab.spec.ts`.

## Execution status

**Stage pointer:** PR — merge main, ready for review

**Next action:** merge origin/main, mark ready, run the review gate (high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — backend count read | ✅ | 5ab20774 |
| 1 — strip reads the count | ✅ | b0639e40 |
| 2 — docs + spec tidy | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
