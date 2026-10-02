# Request-to-Book refuses a retired set — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a Request-to-Book reserve on a retired set answers `NO_SUCH_SET` on `POST /api/bookings` and
`POST /api/stays` and writes no booking, as the instant path does.

**Architecture:** the reserve's fence read, `SetBookingFacts#setBookingInfo(s)ForReserve`, reads through
`active_set_position` (the owner's decision), so a retired set falls into the reserve services' existing
`NO_SUCH_SET` branches. It also takes the set `FOR KEY SHARE OF sp`: the single-set retire
(`BeachMapEditService#removeSet`) locks the set `FOR UPDATE` and never the venue, so the venue `FOR SHARE`
alone does not order it against the reserve.

**Source of intent:** GitHub issue #1284

**Branch:** `bugfix/1284-request-retired-set`

## Acceptance criteria

- [x] **AC-1:** Given a REQUEST-mode venue with a retired online set, when a guest posts a booking for it,
  then the reserve is `NO_SUCH_SET` and no booking row exists. *Seam:* `POST /api/bookings` ·
  *Pinned by:* `RetiredSetRequestReserveIT.aRequestBookingOnARetiredSetIsNoSuchSet`
- [x] **AC-2:** Given the same venue, when a guest posts a stay one of whose stretches is on the retired set,
  then `NO_SUCH_SET`, no booking and no stay row. *Seam:* `POST /api/stays` · *Pinned by:*
  `RetiredSetRequestReserveIT.aRequestStayWithARetiredStretchIsNoSuchSet`
- [x] **AC-3:** Given a booking already on a set, when the set retires, then the booking view still names its
  row and position. *Seam:* `GET /api/bookings/{code}` · *Pinned by:*
  `RetiredSetRequestReserveIT.aBookingAlreadyOnTheSetStillResolvesAfterItRetires`; the bare reads by
  `SetBookingInfoIT.answersForARetiredSetExceptToTheReserve`
- [x] **AC-4:** Given a single-set retire in flight (uncommitted), when a request reserve for that set runs,
  then it waits and answers `NO_SUCH_SET`, single and stay alike. *Seam:* `ReserveSetService#reserve`,
  `ReserveStayService#reserve` · *Pinned by:* `RetireVsRequestReserveRaceIT`

## Non-goals

- A `retired` component on `SetBookingInfo` or a new check in `ReserveFences` (owner decided against).
- Splitting the facts adapter's bare reads out of the exempt class (#1337).

## Risks

- **R-1:** the retire races the request reserve → the reserve's set `FOR KEY SHARE` through the view waits
  for the retire's `FOR UPDATE` and re-checks the predicate (AC-4).
- **R-2:** the new set lock inverts a lock order → the reserve takes venue then set (the layout writes'
  order); the single-set editors lock one set and never touch the venue row after it; the bulk save and
  remodel take the venue `FOR UPDATE` first. The batch read locks sets in id order.
- **R-3:** a sold booking on a retired set stops resolving → only the `ForReserve` twins change; the bare
  `setBookingInfo(s)` callers (cancel, views, mails, staff lookup) are untouched (AC-3).

## Open questions

### Resolved

- The brief said the layout write's venue `FOR UPDATE` serializes a retirement with the reserve; true for
  the bulk save and the remodel commit, not for single-set `removeSet` → closed with the set lock, proven
  red without it.

## Availability & concurrency

- **Write paths to `set_availability`:** unchanged; a request writes none (ADR-0025).
- **Concurrency strategy:** venue `FOR SHARE` (#1304) then set `FOR KEY SHARE` through
  `active_set_position`, as `poolForClaim`.
- **Pool (#3) and cutoff (#4):** unchanged.
- **Pinning test:** `RetireVsRequestReserveRaceIT`

## Phases

- **Phase 0 — retired set refused at the reserve:** red `RetiredSetRequestReserveIT`, `SetBookingInfoIT`
- **Phase 1 — retire in flight waited for:** red `RetireVsRequestReserveRaceIT`

## Execution status

**Stage pointer:** implement done → PR

**Next action:** open draft PR, CI, review gate at high.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 | done | |
| 1 | done | |
