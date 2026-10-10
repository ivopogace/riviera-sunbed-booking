# Home: a no-set venue is not a seller Implementation Plan

> Build with `tdd` at the named seams. Omit a conditional section that doesn't apply. Invariant
> numbers: `CLAUDE.md`.

**Goal:** A tourist-visible venue with `availability.total === 0` leaves the "N of M selling today"
numerator (N) while staying listed and counted as a venue (M, the picker and beach counts).

**Architecture:** The selling line is one `computed()` in `pages/home/home.ts` (`subtitle`), and the
live-region announcement renders `title(): subtitle()`, so the rule lives in that one derivation and
the announcement follows it with no second copy. The per-venue facts it reads (`salesClosed`,
`total`) are already on the `VenueCard` record every home surface shares, so no new data crosses the
API and no other surface changes.

**Source of intent:** GitHub issue #1530 (card stays listed per #717 / PR #719).

**Branch:** `bugfix/home-no-set-venue-not-selling`

## Acceptance criteria

- [ ] **AC-1:** Given today's list holds one venue with sets selling and one with
  `availability: { free: 0, total: 0 }` and `salesOpen: true`, when the sheet lands, then the head
  reads `1 of 2 selling today` and the outcome region speaks `<place>: 1 of 2 selling today`.
  *Seam:* `Home.subtitle` through `head-subtitle` / `sheet-outcome` · *Pinned by:*
  `home.spec.ts › Home (the riviera map sheet) › the selling line › counts a venue with no sets as listed, not selling`
- [ ] **AC-2:** Given the same list, when the coast picker opens, then its rows still count the
  no-set venue as a venue (`N venues`), and the beach chip's counts do too — the venue is listed,
  it is just not selling. *Seam:* `coastIndex` / `beachOptions` through `picker-row` ·
  *Pinned by:* the same spec's picker assertion.
- [ ] **AC-3:** Given a no-set venue whose sales are also closed (`salesOpen: false`), when counted,
  then it is one non-seller, never counted twice (N never goes negative, M unchanged).
  *Seam:* `Home.subtitle` · *Pinned by:* the same describe's second case.
- [ ] **AC-4:** Given the real-render discovery page with a no-set venue among the mocked list, when
  it lands, then the live count reads `2 of 3 selling today` and the no-set card is listed with
  `No sets yet`. *Seam:* the built app at `/` · *Pinned by:*
  `e2e/discovery-flow.e2e.ts › a venue with no sets is listed but not counted as selling today (#1530)`

## Non-goals

- Dropping the no-set card from the list, the pins or the picker — #717 decided it stays.
- Changing the coast picker's `N venues` rows or the beach chip's counts: both are documented and
  tested as venue counts (`coast-picker.ts` `PickerPlace.venues`, `home.ts` `beachOptions`), not
  selling counts, so the no-set venue stays in them (the orchestrator's reading of the issue's
  expected text: it stays in M, it leaves N).
- A dusk/desaturated treatment for the no-set card or its pin (`salesClosed` drives those).
- Any backend change: `availability.total` is already on the wire.

## Risks

- **R-1:** Invariant #4 is the head's light here (the server's per-date `salesOpen` verdict), and
  the new rule must not override it: a venue with sets and `salesOpen: false` stays a non-seller,
  a no-set venue with `salesOpen: true` becomes one; both are AND-ed, pinned by AC-1 and AC-3.
- **R-2:** `closedForSeason` is already folded into `salesOpen` by the backend (`JdbcVenueCatalog`
  passes `salesWindow.isOpen(…, seasonClosure, date, now)`), so the slice adds no season rule.
- **R-3:** The sibling slice #1541 edits `home.ts`'s `openStayPicker()` and the stay specs at the
  end of `home.spec.ts`; the new `describe` goes next to the selling-line tests (inside the sheet
  describe, after the outcome-region test), so both merge cleanly.

## Open questions

### Resolved

- Does a no-set venue stay in M? — Yes: the issue's expected text is `1 of 2 selling today`
  (owner's decision relayed at intake).

## Phases

- **Phase 0 — the selling line:** a no-set venue leaves N, stays in M; the picker count holds ·
  red test `home.spec.ts › the selling line` (AC-1..3)
- **Phase 1 — real render:** the mocked e2e lands a no-set venue and reads `2 of 3 selling today` ·
  red test `discovery-flow.e2e.ts` (AC-4)

## Execution status

**Stage pointer:** `implement (phase 1)`

**Next action:** run the mocked e2e in a real Chromium, open the draft PR, then the CI gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the selling line | ✅ | phase-0 commit |
| 1 — real render | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
