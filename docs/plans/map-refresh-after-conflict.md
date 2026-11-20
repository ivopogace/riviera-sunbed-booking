# Beach map refresh after a booking conflict — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A booking dialog that closes while its standing answer is `409 SET_TAKEN` makes the
venue map re-read the same days once, on every width, and a failed re-read leaves the map as it was.

**Architecture:** The dialog knows the outcome, so its `dismissed` output carries it; the map does
not re-read on every dismissal. The read is a refresh of its own beside `load()`, not a mode of
it: `load()` owns a fresh attempt (it clears failure state, seeds the lens, tears down on failure),
the refresh only replaces a map that is already shown.

**Source of intent:** #1809 (body, the deferral comment, the triage brief).

**Branch:** `bugfix/1809-map-refresh-after-conflict`

## Acceptance criteria

- [x] **AC-1:** Given the dialog's last submit was refused `SET_TAKEN`, when it is dismissed, then
  it reports a conflict close; a dismissal with no error, or after a later different refusal,
  reports none. *Seam:* `BookingDialog.dismissed` · *Pinned by:* `booking-dialog.spec.ts` "says
  whether it closed on a taken set"
- [x] **AC-2:** Given the map from `sm` up, when the dialog closes on a conflict, then the map is
  read once more for the same days and the set renders taken, with no button. *Seam:* `VenueMap`
  DOM + `GET /api/venues/:id` · *Pinned by:* `venue-map.spec.ts` "re-reads the map when the dialog
  closes on a taken set"
- [x] **AC-3:** Given a phone and a pick, when the dialog closes on a conflict and the read shows
  the set taken, then the pick, its bar and the solid cell go, `pick-status` is empty, `lensSeed`
  is unchanged, and focus the bar held lands on the open row. *Seam:* `VenueMap` DOM · *Pinned
  by:* `venue-map-lens.spec.ts` "a dialog closed on a taken set re-reads the map…"
- [x] **AC-4:** Given focus on a tile button, when the refresh removes that button, then focus
  lands on the open row (phone) or the map (`sm` up), never `<body>`; focus held elsewhere stays.
  *Seam:* `document.activeElement` · *Pinned by:* `venue-map.spec.ts` "moves focus to the map when
  the refresh takes the tile that held it"
- [x] **AC-5:** Given a refresh, when it fails (503, 404), then the map, the pick and focus stay
  and no failure panel shows. *Seam:* `VenueMap` DOM · *Pinned by:* `venue-map-lens.spec.ts` "a
  refresh that fails keeps the map, the pick and focus"
- [x] **AC-6:** Given any other dismissal, then no request is dispatched. *Pinned by:* the
  existing `venue-map-lens.spec.ts` "dismissing the dialog keeps the pick, asks the server nothing…"
- [x] **AC-7:** Given the stay plan panel open, when a refresh lands, then no itinerary is
  re-asked and the plan stands. *Pinned by:* `venue-map.spec.ts` "a refresh leaves an open stay
  plan alone"
- [x] **AC-8:** Given a map read in flight, when the dialog closes on a conflict, then no second
  read is dispatched; given a refresh in flight, when the days change, then the refresh's answer
  is dropped. *Pinned by:* `venue-map.spec.ts` "a refresh never supersedes a read in flight" and
  "a date change supersedes a refresh"
- [x] **AC-9:** The conflict close is covered in the mocked e2e at phone and desktop width.
  *Pinned by:* `e2e/venue-map-row-lens.e2e.ts`, `e2e/booking-flow.e2e.ts`

## Non-goals

- #1810: `resetForVenue`, `selectedPlan`, focus after an in-place route change, the stale map
  staying tappable while a date change loads.
- The plan dialog's close, which already re-reads through `load()`.
- The other refusals that also mean a stale map (see Risks R-5).

## Risks

- **R-1: a failed refresh tears the map down** (what #1808 withdrew) → the refresh has its own
  error arm that does nothing; `failed`/`notFound` are never cleared or set by it.
- **R-2: the refresh supersedes a date-change `load()` and then fails**, leaving the old days'
  map under the new header → the refresh is not dispatched while a `load()` is in flight; that
  read is for the same days and lands after the conflict.
- **R-3: focus stranded on `<body>`** when the read turns the focused tile's button into a plain
  cell (WCAG 2.4.3, RV-FE-9) → an `onlyIfLost` focus mover, armed only when a tile button holds
  focus, so a visitor whose focus is elsewhere is not moved or scrolled.
- **R-4: the pick is announced again or rows re-pan** → the refresh leaves `lensUnseeded` false,
  so `settleLens()` neither bumps `lensSeed` nor reseeds; `pickAnnouncement` is a string computed.
- **R-5: sibling refusals** (`BOOKING_CLOSED`, `VENUE_CLOSED`, `SET_NOT_BOOKABLE_ONLINE`,
  `NO_SUCH_SET`, `STAY_TOO_LONG`) leave the same stale map → out of #1809's scope; filed as #1812.
  `INVALID_REQUEST`, `UNKNOWN` and the challenge refusals say nothing about the map.
- **R-6: conflict with #1810** in `venue-map.ts` → `load()` gains only the in-flight flag's three
  writes; everything else is new members.

## Open questions

### Resolved

- A 404 on the refresh keeps the map too: the issue asks that a failed refresh never tears down,
  and the next tap or date change states the venue's absence through `load()`.
- With no plan panel open, a refresh that leaves no set covering the stay asks the itinerary as
  any read does, since the no-cover banner offers the plan from it.

## Availability & concurrency

- No write path changes. The refresh is a read; the server still decides every claim (#2), pool
  (#3) and cutoff (#4). The map stays display only.

## Phases

- **Phase 0 — the dialog says how it closed:** red `booking-dialog.spec.ts` "says whether it
  closed on a taken set".
- **Phase 1 — the map refreshes on a conflict close:** red `venue-map.spec.ts` AC-2, then AC-3,
  AC-5 in the lens spec.
- **Phase 2 — focus, the plan and reads in flight:** red AC-4, AC-7, AC-8.
- **Phase 3 — e2e and `RESPONSIBILITIES.md` § Frontend.**

## Execution status

**Stage pointer:** PR — draft open, CI on the first push

**Next action:** check CI, merge `origin/main`, mark ready, run the review gate (effort high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the dialog says how it closed | ✅ | first commit |
| 1 — the map refreshes on a conflict close | ✅ | first commit |
| 2 — focus, the plan and reads in flight | ✅ | first commit |
| 3 — e2e and docs | ✅ | first commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
