# Daily view phone rail: grid letters, three tiles per row — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** On `/operator/:venueId/daily` at 390px, at least three whole tiles per row are in view
before any swipe; from `sm` up the Daily view renders exactly as today.

**Architecture:** Below `sm` the Daily view's left rail chip shows the row's grid letter (the Beach
map editor's vocabulary, from `gridY`) and reserves 24px; from `sm` up it shows the stored row name
whole and reserves 54px, as today. The price rail's bare-amount cell floor drops from 52px to 44px
below `sm`. Both are CSS tiers on the shared canvas, so the loading placeholder reserves what the
loaded rail renders at every width (#749/#751). Owner's choice B of the measured options
(#1532); the caveat #724 raises (a renamed row can collide with another row's grid letter on the
phone rail only) is accepted and recorded in the PR body.

**Source of intent:** GitHub #1532; the rail vocabulary decisions in #723/#724.

**Branch:** `bugfix/daily-rail-phone-cap`

## Acceptance criteria

- [ ] **AC-1:** Given the seeded four-row map at 390px, when the Daily view loads, then every row
  shows at least three whole tiles inside the pan viewport. *Seam:* the rendered `daily-grid`
  viewport · *Pinned by:* `operator-daily.e2e.ts › #1532`
- [ ] **AC-2:** Given the same map at 390px, then each rail chip reads the row's grid letter; at
  1280px it reads the stored name whole. *Seam:* `BeachMapCanvasRow.phoneCode` + the `labels`
  vocabulary · *Pinned by:* `beach-map-canvas.spec.ts` (tiers) and `operator-daily.e2e.ts › #1532`
- [ ] **AC-3:** Given the Daily view loads, then the rail and price columns reserve the same width
  loading and loaded at both tiers. *Seam:* `railColumnClass`/`railPlaceholderClass` and the price
  cell floor · *Pinned by:* `beach-map-canvas.spec.ts › #749`, `› #751`
- [ ] **AC-4:** Given the Daily rows, then each carries `phoneCode` = `gridRowLabel(gridY − 1)`
  of its sets. *Seam:* `DailyViewTab.rows` · *Pinned by:* `daily-view-tab.spec.ts`

## Non-goals

- The tourist map's `capped-labels` rail and the editors' `letters` rail are untouched.
- No change to tile accessible names (they keep the stored row name) or the tile size.

## Risks

- **R-1:** A rail or price reservation that differs between the skeleton and the loaded map slides
  the grid on load (#749/#751) → both tiers are vocabulary classes, asserted equal in both states.
- **R-2:** A 3-digit bare amount is wider than the 44px phone floor → the price rail widens by a few
  px on load at phone width only; recorded, accepted.
- **R-3:** #724's collision (a row renamed to another row's grid letter) → phone rail only, from
  `sm` up the stored name is the one identity; recorded in the PR body.

## Open questions

### Resolved

- Ellipsis vs letters vs captions — owner chose letters + a tighter price floor (B), 2026-10-10.

## Availability & concurrency

No write path to `set_availability` is touched; the slice changes the rail chrome and the price
cell floor only. Tile states, their accessible names and the mark/release flow are unchanged.

## Phases

- **Phase 0 — canvas tiers:** `labels` renders `phoneCode` below `sm`, reserves 24px there; the
  price cell floor is 44px below `sm` · red `beach-map-canvas.spec.ts`
- **Phase 1 — Daily rows carry the letter** · red `daily-view-tab.spec.ts`
- **Phase 2 — the bar** · the red `operator-daily.e2e.ts › #1532` goes green

## Execution status

**Stage pointer:** `PR — draft open, CI due`

**Next action:** CI green on the head → ready for review → review gate at high.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — canvas tiers | ✅ | (this commit) |
| 1 — Daily rows carry the letter | ✅ | (this commit) |
| 2 — the bar | ✅ | 1b9e720 (red), (this commit) green |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
