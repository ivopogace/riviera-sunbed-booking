# Daily view phone rail: the tourist cap, two tiles per row — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** On `/operator/:venueId/daily` at 390px, at least two whole tiles per row are in view
before any swipe (the tourist map's own count); from `sm` up the Daily view renders exactly as today.

**Architecture:** Below `sm` the Daily view's left rail chip ellipsizes the stored row name at the
tourist map's cap (48px of text) inside the 54px the rail already reserves (#749); from `sm` up it
renders whole as today. One `computed` on the shared canvas, per vocabulary. Owner's final choice A
of the measured options (#1532): three tiles would need the row's grid letter on the phone rail,
which #724 rules out beside stored names (a row renamed to another row's letter collides), so the
bar is restated to two.

**Source of intent:** GitHub #1532; the rail vocabulary decisions in #723/#724.

**Branch:** `bugfix/daily-rail-phone-cap`

## Acceptance criteria

- [ ] **AC-1:** Given the seeded four-row map at 390px, when the Daily view loads, then every row
  shows at least two whole tiles inside the pan viewport, the long name ellipsizes inside its chip
  and a short name renders whole. *Seam:* the rendered `daily-grid` viewport and `row-code` chips ·
  *Pinned by:* `operator-daily.e2e.ts › #1532`
- [ ] **AC-2:** Given the same map at 1280px, then the chip reads the stored name whole and every
  tile of the row is in view. *Seam:* the `labels` vocabulary's text class · *Pinned by:*
  `beach-map-canvas.spec.ts › #1532`, `operator-daily.e2e.ts › #1532`
- [ ] **AC-3:** Given the Daily view loads, then the rail reserves 54px loading and loaded on both
  tiers, as before. *Seam:* `railColumnClass`/`railPlaceholderClass` · *Pinned by:*
  `beach-map-canvas.spec.ts › #749`, `loading-skeletons.e2e.ts › the Daily view's rail … (#749)`
- [ ] **AC-4:** Given the Daily rows, then the rail chip carries the phone-only cap and the tile
  accessible name the stored row name. *Seam:* `DailyViewTab`'s canvas wiring · *Pinned by:*
  `daily-view-tab.spec.ts › #1532`

## Non-goals

- The tourist map's `capped-labels` rail, the editors' `letters` rail and the price rail are untouched.
- No change to tile accessible names (they keep the stored row name) or the tile size.
- No grid letters on any rail (#724), and no row-caption layout (option D, not asked for).

## Risks

- **R-1:** A rail reservation that differs between the skeleton and the loaded map slides the grid
  on load (#749) → the reservation is untouched; the cap keeps the chip inside it.
- **R-2:** Rows whose names share a 48px prefix read alike on a phone ("Row 4 · Back" vs "Row 4 ·
  Front") → accepted with the tourist map's cap; the tile name and the arrivals list carry the whole name.

## Open questions

### Resolved

- Ellipsis vs letters vs captions — owner first chose letters (B), then, on #724's collision
  reasoning, the tourist cap with the bar restated to two tiles (A), 2026-10-10.

## Availability & concurrency

No write path to `set_availability` is touched; the slice changes the rail chip's text class only.
Tile states, their accessible names and the mark/release flow are unchanged.

## Phases

- **Phase 0 — the cap:** the `labels` rail ellipsizes at 48px below `sm` only · red
  `beach-map-canvas.spec.ts`, `daily-view-tab.spec.ts`
- **Phase 1 — the bar** · the red `operator-daily.e2e.ts › #1532` goes green at two tiles

## Execution status

**Stage pointer:** `PR — draft open, CI due`

**Next action:** CI green on the head → ready for review → review gate at high.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the cap | ✅ | (this commit; c62af0d carried the superseded B) |
| 1 — the bar | ✅ | 1b9e720 (red, 3 tiles), (this commit) green at 2 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
