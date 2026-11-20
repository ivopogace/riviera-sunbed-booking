# Map refresh after any staling refusal Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** The tourist beach map re-reads itself after the booking dialog closes on any refusal that
says the map is stale, and that re-read ends with the page and keeps focus where it can.

**Architecture:** The seam #1809 built stays: `BookingDialog.dismissed` carries a
`BookingDismissal`, `VenueMap.onDialogClose` calls `refresh()`. The dismissal's flag widens from
"set taken" to "map stale"; `refresh()` gains a lifetime, an owed re-read, a 404 arm and a focus
rule that follows the set rather than the element.

**Source of intent:** #1812 (with #1809's residuals in its first comment) and #1817; the agent
briefs posted on both at triage.

**Branch:** `bugfix/map-refresh-refusals-1812-1817`

## Acceptance criteria

- [ ] **AC-1:** Given the dialog's reserve was refused `SET_TAKEN`, `BOOKING_CLOSED`, `VENUE_CLOSED`,
  `SET_NOT_BOOKABLE_ONLINE`, `NO_SUCH_SET` or `STAY_TOO_LONG`, when it closes, then its dismissal
  reports the map stale; after `INVALID_REQUEST`, `UNKNOWN`, a proof-of-work refusal or none, it
  does not. *Seam:* `BookingDialog.dismissed` · *Pinned by:* `booking-dialog.spec.ts` "says the map is stale after …"
- [ ] **AC-2:** Given a staling refusal was seen, when a later attempt is refused otherwise and the
  dialog closes, then the dismissal still reports the map stale. *Seam:* `BookingDialog.dismissed` ·
  *Pinned by:* `booking-dialog.spec.ts` "keeps saying so after a later refusal of another kind"
- [ ] **AC-3:** Given a dismissal that reports the map stale, when the dialog closes, then one map
  read for the same days is sent; a dismissal that does not sends none. *Seam:* `GET /api/venues/{id}` ·
  *Pinned by:* `venue-map.spec.ts` "re-reads the map once for the same days", "asks nothing"
- [ ] **AC-4:** Given the reserve was refused `BOOKING_CLOSED`, when the dialog closes and the read
  answers `salesOpen: false`, then the sales-closed banner shows and no set is offered. *Seam:* the
  mocked API in a browser · *Pinned by:* `booking-flow.e2e.ts` "closing the dialog on a sales-closed refusal …"
- [ ] **AC-5:** Given a load in flight, when a stale dismissal arrives, then no read is sent beside
  it and exactly one refresh follows its answer; a date or venue change meanwhile sends none.
  *Seam:* `GET /api/venues/{id}` · *Pinned by:* `venue-map.spec.ts` "a read in flight is not superseded: one refresh follows its answer", "a date change drops the refresh owed"
- [ ] **AC-6:** Given a refresh in flight, when it answers 404, then the not-available panel replaces
  the map and takes focus the teardown stranded; a 503 keeps the map and focus. *Seam:* `GET /api/venues/{id}` ·
  *Pinned by:* `venue-map.spec.ts` "a refresh answered 404 shows the not-available panel", "a refresh that fails with 503 keeps the map and focus"
- [ ] **AC-7:** Given a refresh in flight, when the page is destroyed and it answers, then nothing
  changes and nothing throws. *Seam:* `GET /api/venues/{id}` · *Pinned by:* `venue-map-reload.spec.ts` "ends with the page"
- [ ] **AC-8:** Given a stay and focus on a free set's tile, when a refresh shows that set partly
  free, then focus is on the set's "which days" button; when it shows the set taken, focus is on
  the map card, moved without scrolling. *Seam:* `document.activeElement` · *Pinned by:*
  `venue-map-reload.spec.ts` "keeps focus on a tile that turns partly free", `venue-map.spec.ts` "moves focus to the map …"

## Non-goals

- The plan dialog's close (already `load()`), new copy, any closed-state display.
- `settleLens()`'s landing for focus the pick bar held: shared with `load()`.
- #1815's and #1816's areas (`staleDays`, `onDatesChange`, the availability line, `retry()`, the
  error arm of `load()`).

## Risks

- **R-1:** The owed refresh loops or fires for other days → set only by `refresh()` while a load is
  in flight, cleared at every `load()` dispatch, consumed once in that load's answer.
- **R-2:** The 404 teardown strands focus or leaves an overlay open → the arm closes what `load()`'s
  404 closes and uses the `onlyIfLost` mover.
- **R-3:** Conflicts with #1815/#1816 in `venue-map.ts` → `load()` gains two small edits only.

## Open questions

### Resolved

- Which refusals refresh: all that name the venue, set or days (one request per refused booking).
- What a "cannot be booked" refusal shows: what the map read already draws for it.

## Availability & concurrency

Display only. No write path to `set_availability` changes; the server refuses every retry
(#2, #3, #4), pinned where it was (`ConcurrentReservationIT`).

## Phases

- **Phase 0 — the dialog reports the map stale:** AC-1, AC-2 · red `booking-dialog.spec.ts`
- **Phase 1 — the refresh's lifetime, debt, 404 and focus:** AC-3, AC-5 to AC-8 · red the map specs
- **Phase 2 — e2e and docs:** AC-4, RESPONSIBILITIES.md §Frontend

## Execution status

**Stage pointer:** PR open, CI then review

**Next action:** mark ready, run the review gate

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — dialog | ✅ | first commit |
| 1 — refresh | ✅ | first commit |
| 2 — e2e + docs | ✅ | first commit |
