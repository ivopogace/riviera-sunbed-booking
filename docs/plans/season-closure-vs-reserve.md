# Season closure serializes with the reserve Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a season closure and a reserve for the same venue can no longer both commit unaware of each other.
Either the reserve sees the closure and is refused `VENUE_CLOSED`, or the closure waits for the reserve and
its "still owed" answer counts the new booking.

**Architecture:** the reserve reads its fence facts through a new `SetBookingFacts` locking read. That read
takes the venue row `FOR SHARE`, in a statement of its own, for the caller's transaction. `FOR SHARE`
conflicts with the closure's `UPDATE venue`, so the two serialize on the venue row. It follows the precedent
of `poolForClaim`, the port's existing locking read, and is implemented by venue's own adapter.

**Source of intent:** #1304 (sweep for #1298). It also closes the reserve side of #1305's pairs 1 and 2.

**Branch:** `bugfix/season-closure-vs-reserve`

## Acceptance criteria

- [x] **AC-1:** Given a reserve holding its claim and booking uncommitted, when the venue is closed for the
  season, then the closure waits for the reserve and its owed count includes the new booking. *Seam:*
  `CloseForSeason.close` racing `ReserveSetService.reserve` · *Pinned by:*
  `SeasonClosureVsReserveRaceIT.aClosureWaitsForAnInFlightReserveAndCountsIt` (red on `main`: the closure
  does not wait).
- [x] **AC-2:** Given a closure committed but for its transaction's end, when a reserve for a closed date
  runs, then it waits and is refused `VENUE_CLOSED`, claiming nothing. *Seam:* `ReserveSetService.reserve` ·
  *Pinned by:* `SeasonClosureVsReserveRaceIT.aReserveWaitsForAnInFlightClosureAndIsRefused` (red on `main`).
- [x] **AC-3:** The stitched-stay reserve takes the same lock. *Seam:* `ReserveStayService.reserve` ·
  *Pinned by:* `SeasonClosureVsReserveRaceIT.aStayReserveWaitsForAnInFlightClosureAndIsRefused`.
- [x] **AC-4:** The existing reserve and closure suites stay green (`SeasonClosureReserveIT`,
  `SeasonClosureControllerIT`, `ConcurrentReservationIT`, `CreateStayIT` (34 classes, 244 tests, 0 skipped)), and so do the structural net and
  `VenueApiRoleSplitTests`.

## Non-goals

- The profile PATCH fences (sales close, maximum stay, booking mode). The sweep judged them serializable
  with the reserve first, because a PATCH reads no bookings.
- The stay *accept* path's lock order against layout writes (#1305 pair 2, accept side), and the weather
  refund pairs (#1305 pairs 3–4).

## Risks

- **R-1 (lock order, #1305):** the reserve now takes venue `SHARE`, then set `KEY SHARE`, then the booking's FK
  `KEY SHARE` on the venue (already covered by `SHARE`). Layout writes take venue `FOR UPDATE`, then sets
  `FOR UPDATE`. Both are venue-first, so there is no cycle.
- **R-2 (contention):** `FOR SHARE` readers don't block each other. They do make venue writers wait for the
  in-flight reserves: closure, profile edit, commission change, rating recompute and layout token. Reserve
  transactions are short and hold no external call.
- **R-3 (Modulith #11):** booking must not touch `venue` SQL. The lock lives in `JdbcSetBookingFacts` behind
  the port, under booking's existing `venue::api` grant.

## Modulith

- **Port:** `venue.api.SetBookingFacts` gains `setBookingInfoForReserve(SetId)` and
  `setBookingInfosForReserve(Collection<SetId>)`. Owner: `venue`. Consumer: `booking`'s reserve services only.
  This is the same conversation as `poolForClaim`, the other claim-time locking read, so it is no new port.
- **No new grant, event or module dependency.** Pinned by the structural net and `VenueApiRoleSplitTests`.

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged (`SpanClaim.claimEveryDay`). What changes is when the fence
  is read.
- **Strategy:** a venue row `FOR SHARE` in its own statement, then the fence read on a fresh snapshot.
- **Cutoff (#4):** the closure fence is `admitsDate` over each day, now read after any in-flight closure commits.
- **Pinning tests:** AC-1..3.

## Phases

- **Phase 0 — the locking fence read, single-set reserve:** AC-1, AC-2.
- **Phase 1 — stitched-stay reserve:** AC-3.

## Execution status

**Stage pointer:** review — findings fixed; CI, Sonar, then merge

**Next action:** CI + Sonar, delete this plan, merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — single-set | ✅ | e3e0808 |
| 1 — stay | ✅ | e3e0808 |
| review — docs, IT cleanup | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
