# Tourist phone beach map: the row lens (#1762) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** Below `sm`, the tourist beach map draws every row at overview scale and opens one row
inline to 44px tiles for the pick; from `sm` up nothing changes.

**Architecture:** A new surface-agnostic `shared/beach-row-lens` component sits beside
`BeachMapCanvas` (inside the same `BeachGridFrame`); the tourist map mounts one or the other from a
`matchMedia` signal for `(width < 40rem)`, Tailwind's own `sm` boundary. The tile markup both
layouts need moves into one `ul[appVenueMapRow]` component so neither copy can drift.

**Source of intent:** #1762, the comment headed "Agent Brief" (the contract), with the round 3 and
wide-beach comments and the prototype at `5e7bc16` as look-and-feel reference.

**Branch:** `feature/1762-phone-row-lens`

## Acceptance criteria

Seams: **lens** = `BeachRowLens`'s inputs/outputs and rendered DOM (`beach-row-lens.spec.ts`);
**map** = `VenueMap`'s rendered DOM under a stubbed `matchMedia` (`venue-map-lens.spec.ts`);
**render** = the mocked Playwright suite (`venue-map-row-lens.e2e.ts`); **maths** =
`venue-map-lens.contrast.spec.ts`.

- [ ] **AC-1:** Given Miramar at 390px, then all nine rows render without a sideways pan, every row button is ≥44px tall and full width, and no overview cell is a button or link. *Seam:* render · *Pinned by:* `venue-map-row-lens.e2e.ts` "all nine rows"
- [ ] **AC-2:** Given a 7-wide open row at 390px, then seven tiles ≥44px show with no horizontal overflow; a 13-wide open row pans. *Seam:* render · `…e2e.ts` "a 7-wide row fits"
- [ ] **AC-3:** Given a map that lands for a fresh venue or other days, then the first row with a free set is open, and none when no set is free; a row that reopens on the pick shows the pick inside the pan viewport. *Seam:* map + render · `venue-map-lens.spec.ts` "the default open row", e2e "an open row starts at its first free set…"
- [ ] **AC-4:** Given an open row with no free set visible from position 1, then it starts panned to its first free set. *Seam:* render · e2e "starts at the first free set"
- [ ] **AC-5:** When another row is opened, then the first closes, the tapped row's top stays within a few px, and focus is on its first free tile; the close control leaves no row open, shows the hint and returns focus to the row button. *Seam:* lens + render · `beach-row-lens.spec.ts` "one open row", e2e "no page jump"
- [ ] **AC-6:** When a bookable tile is tapped on a phone, then it becomes the pick and the bar shows; the bar's action opens the booking dialog for it; a second tap clears pick and bar; dismissing the dialog keeps the pick and focuses the bar's action. *Seam:* map · `venue-map-lens.spec.ts` "the pick"
- [ ] **AC-7:** The pick's overview cell is solid while its row is closed and no other state is solid. *Seam:* map + maths · `venue-map-lens.spec.ts`, `map-tile.spec.ts`
- [ ] **AC-8:** A partly-free tile opens the partly-free sheet and never becomes the pick. *Seam:* map
- [ ] **AC-9:** Every zone band shows price and "N of M free", counts match the free-look cells, and rows sharing a band show their own count where the empty columns allow. *Seam:* map + lens
- [ ] **AC-10:** With a stay plan open, each plan set's overview cell wears its stretch ring; the number shows only on a 44px tile. *Seam:* map
- [ ] **AC-11:** A 20-column beach fits at 390px with cells ≥12px and no overview pan. *Seam:* render
- [ ] **AC-12:** A 40-column beach keeps 12px cells; panning one closed row moves all by the same offset, the position bar's text and thumb match, and panning the open row moves the overview to follow. *Seam:* render (+ lens with stubbed geometry)
- [ ] **AC-13:** A 26-row beach scrolls with the page; the lens has no vertical scroller. *Seam:* render
- [ ] **AC-14:** Every overview state, the pick, the plan ring, the chevron and the position bar clear 3:1 in porcelain, riviera and dark over each wash stop (and the open row's surface where they sit on it). *Seam:* maths
- [ ] **AC-15:** Under forced colours free, partly, walk-in, taken and the pick stay distinguishable. *Seam:* render · e2e "forced colours"
- [ ] **AC-16:** The phone map passes axe and the touch-target measurement in all three themes with a row open and with a pick. *Seam:* render
- [ ] **AC-17:** A closed row's name carries row, price and free count and exposes `aria-expanded`. *Seam:* lens + map
- [ ] **AC-18:** From `sm` up the tourist map renders and behaves as before; Daily view and editors untouched. *Seam:* the existing unit and e2e specs, unedited for those widths
- [ ] **AC-19:** The lens mounts with a second, non-tourist vocabulary and row summary, more than one row open. *Seam:* lens · `beach-row-lens.spec.ts` "a second vocabulary"

## Non-goals

- The operator Daily view on a phone (#1807), the editors, the canvas's operator vocabularies.
- Tablet and desktop; the rejected variants; solid free cells; the dialog, sheet and plan panel.

## Risks

- **R-1:** the shared tile markup moves into a component and the `sm`-up DOM drifts → the host is the
  `<ul>` itself (attribute selector), the 2 300-line `venue-map.spec.ts` runs unedited.
- **R-2:** overview shapes drawn as backgrounds vanish under forced colours → every shape is a real
  `border` (edge, strike, dot, half, solid), never a gradient or `box-shadow`.
- **R-3:** the riviera theme's stretch fills are light, and the wash under the overview is the light
  porcelain wash → the plan ring takes its own `--riv-stretch-N-ring` tokens, measured.
- **R-4:** phone-width e2e that tap a tile and expect the dialog → those specs go through the bar; the
  `sm`-up ones are not edited.
- **R-5:** a scroll-sync loop between closed rows → only a scroller that differs by more than 1px is
  written.

## Open questions

None.

## Behaviour-parity ledger (phone widths only)

| Old-surface behaviour | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Legend leads the card | preserved | projected above the rows; swatches show overview looks plus "Your pick" |
| Zone price header bands | changed | a band per zone with the price and "N of M free" |
| Tile accessible names, badges, plan numbers | preserved | the open row renders the same tile component |
| Tap a free tile → dialog | changed | tap sets the pick; the bottom bar opens the dialog (owner decision) |
| Partly-free tile → sheet | preserved | |
| Pan the whole grid, drag hint, vertical wash scroller | dropped | the overview fits (≤20 columns) or pans as one block; rows scroll with the page |
| Four whole tiles of a 7-wide row at 390px (#1732) | changed | all seven fit in the open row |
| Mode-aware footer copy | preserved | |
| Empty map, closed season, closed sales | preserved | |
| Skeleton | preserved | the same canvas skeleton; the card grows on load |

## Phases

- **Phase 0 — the lens:** rows, bands, cells, open/close, focus, second vocabulary · red `beach-row-lens.spec.ts`
- **Phase 1 — tourist wiring:** viewport switch, row component, counts, pick, bar, plan ring · red `venue-map-lens.spec.ts`
- **Phase 2 — looks and contrast:** overview looks from `MAP_TILE_STATES`, tokens, ledger · red `venue-map-lens.contrast.spec.ts`
- **Phase 3 — wide and deep:** overview pan, position bar, follow · e2e
- **Phase 4 — render proofs:** e2e (themes, axe, touch, forced colours), phone specs through the bar, screenshots
- **Phase 5 — docs + i18n**

## Execution status

**Stage pointer:** PR — draft #1808 open; full mocked e2e, then screenshots, then ready for review

**Next action:** fill the PR body with the 390px sheets, mark ready, run the review gate (high)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the lens | ✅ | 183a501 |
| 1 — tourist wiring | ✅ | 183a501, e5b0883 |
| 2 — looks and contrast | ✅ | e5b0883 |
| 3 — wide and deep | ✅ | a2236a6 |
| 4 — render proofs | ✅ | a2236a6, 2b78098 |
| 5 — docs + i18n | ✅ | e5b0883, 8c038e8 |
