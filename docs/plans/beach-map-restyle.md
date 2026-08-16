# Beach-Map Restyle (Sea→Sand Wash, Price Zones, Walk-In Treatment) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship issue #672's **Slice 1** — the approved beach-map restyle prototype
(`f781dbf`: sea→sand wash, per-zone price chips, ghost-taken tiles, edge fade + scroll
snap) hardened with unit/contrast/e2e coverage, plus a distinct visual + accessible
treatment for FREE walk-in sets. Tourist map only.

**Architecture:** No structural change — the restyle stays inside `venue/venue-map.*`
(pure Tailwind v4, no new SCSS). The one behavioral decision: a FREE `WALK_IN` set
stops masquerading as an available tile — it gets its own sand-toned tile class, an
accessible name saying "walk-in only", and a legend entry, while remaining
non-interactive (invariant #3 display parity: `bookable = FREE && ONLINE` is untouched).
Slice 2 of #672 (promoting a shared map canvas to `shared/`) is deliberately deferred.

**Persistence:** N/A — frontend-only; no tables or migrations touched (invariant #1 unaffected).

**Source of intent:** GitHub issue #672; approved prototype commit `f781dbf` on
`claude/venue-photos-skeleton-loading-ns9jc4`; design language `docs/design/` (Liquid Glass v3).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed
the prototype still applies cleanly to `main`, confirmed the walk-in a11y gap in
`toTile`, found no in-flight PR overlap) · `riviera-plan-doc` (this template — the
parity ledger surfaced that per-row prices become per-zone and that the ghost-taken
glyph cannot meet composited AA, forcing the documented 1.4.3 exclusion decision below)
· `tdd` (each phase writes the failing spec before the template/class change) ·
`riviera-review-overlay` (review gate — at ready-for-review) · `riviera-docs-freshness`
(due at merge close-out over the slice diff; parenthesis updated then) · `riviera-frontend` (placement: everything
stays in `venue/`; the pan e2e stays in the CI-safe mocked suite; no new cross-feature
edge — RV-FE-8 untouched) · `riviera-tailwind` (utilities not `@apply`; keep
`.set-tile`/`.premium`/`.taken` as inert marker classes for specs; `text-[..px]`
arbitrary sizes; computed-style drift checks in e2e) · `angular-developer` + angular-cli
MCP (`get_best_practices` v22 — native control flow, signals, `computed()` for the zone
derivation) · `playwright-cli` (e2e authoring for the restyle pins) ·
`riviera-local-debug` (scoped Vitest/Playwright runs; loaded before the session's first
`npm` invocation).

**Branch:** `claude/issue-672-bgn4sf` — the session's designated remote branch stands in
for `feature/beach-map-restyle` (riviera-sdlc remote addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given rows whose price differs from the row above (zone boundaries), when
  the map renders, then a `row-price` chip renders **once per price zone** (on `zoneStart`
  rows only) and rows inside a zone render none. *Pinned by:*
  `venue-map.spec.ts` "renders the price once per price zone…"
- [ ] **AC-2:** Given adjacent rows with equal prices, when the map renders, then the
  zone-gap class (`mt-3`) is present on every non-first `zoneStart` row (in the row-code,
  tile, and price columns) and absent on rows inside a zone. *Pinned by:*
  `venue-map.spec.ts` "separates price zones with a gap…"
- [ ] **AC-3:** Given a FREE `WALK_IN` set, when the map renders, then its tile carries the
  `walkin` marker class (sand treatment), renders **no button**, and its accessible name
  ends with "walk-in only — book at the venue" (never "available"). *Pinned by:*
  `venue-map.spec.ts` "gives free walk-in sets their own treatment…"
- [ ] **AC-4:** Given a TAKEN `WALK_IN` set, when the map renders, then the taken ghost
  treatment wins (class `taken`, name says "taken", no `walkin` class). *Pinned by:*
  `venue-map.spec.ts` "renders a taken walk-in set as taken…"
- [ ] **AC-5:** Given the legend, when the map renders, then it lists Available / Front
  row / Walk-in only / Taken with swatches mirroring the live tile fills+borders.
  *Pinned by:* `venue-map.spec.ts` "lists a walk-in entry in the legend"
- [ ] **AC-6:** Given the wash's worst-case gradient stops, when each live tile ink is
  composited (tile fill alpha over stop), then available, premium, walk-in tile inks and
  the row-code/zone-price chip inks all meet AA 4.5:1. *Pinned by:*
  `venue-map.contrast.spec.ts` (composited tile/chip table)
- [ ] **AC-7:** Given the restyled map (mask + `snap-x snap-proximity` applied), when a
  mouse drag-pan crosses the threshold and releases over a tile, then the grid pans, NO
  booking dialog opens, the side columns stay put, and a subsequent genuine click still
  opens the dialog. *Pinned by:* `venue-map-pan.e2e.ts` (existing drag test, extended to
  assert the mask/snap/wash computed styles are actually present)
- [ ] **AC-8:** Given the restyled map with a walk-in row, when axe runs (unit jsdom +
  real-browser e2e), then no serious/critical violations. *Pinned by:*
  `venue-map.a11y.spec.ts` + `venue-map-pan.e2e.ts` axe sweep.

## Non-goals

- **Slice 2 of #672** — promoting/growing `BeachGridFrame` into a `shared/` map canvas
  and moving the tourist map + operator surfaces onto it. Pure-refactor slice, later.
- Any operator-surface restyle (layout editor, daily view) — they inherit via Slice 2.
- Backend/API changes of any kind; the `VenueMapView` wire shape is untouched.
- Making walk-in sets bookable or tappable — invariant #3 stands.
- Theme-token work: the map's tile colours stay literals (the tiles are
  theme-independent by design, like today's solid tiles — see the contrast spec header).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Price rendered per row in the right column | **changed** | Rendered once per price zone as a chip on `zoneStart` rows (#672's approved direction); every tile's accessible name still carries its exact price, so no information is lost to AT |
| Free ONLINE tile → white tile + bookable button, name "…available. Select to book." | preserved | Same classes/names; fill becomes `bg-white/75` (composited-AA proven) |
| Premium tier tinted gold + name carries tier | preserved | `premium` class kept; fill `#fbf1d9/85` |
| TAKEN tile non-interactive, name says "taken", dashed border | preserved (restyled) | Ghost treatment: `bg-white/20 opacity-60` + dashed border; name unchanged |
| FREE `WALK_IN` tile renders identical to free online, silently un-tappable, name says "available" | **changed — deliberately** | The #672 walk-in treatment: sand tile + `walkin` class, name "walk-in only — book at the venue", legend entry; still no button |
| Mouse drag-pan with 6px click threshold; keyboard activation never swallowed | preserved | Untouched TS logic; e2e re-pins against the mask/snap viewport |
| Row-code column + price column fixed while tiles pan | preserved | Same three-column layout; e2e asserts side-column x stability |
| Scroll hint on overflow; date picker; availability summary; dialog open/close/focus-return | preserved | Untouched |
| Legend: Available / Front row / Taken swatches matching tiles | **changed** | Swatches restyled to mirror the new fills; **walk-in entry added** |
| Vertical scroller capped at 532px, hidden scrollbars | preserved | Wash gradient painted on the same scroller |
| Tile grid column count uniform across rows (`--riv-map-cols`) | preserved | Untouched |
| Contrast spec proves tile pairs as solid colours | **changed** | Tiles are translucent now → pairs proven composited over the wash's stops; ghost glyph excluded per WCAG 1.4.3 (below) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The mask-image / scroll-snap on the pan viewport breaks mouse drag-pan or the click-vs-pan threshold | low | high | Verified on the prototype (issue #672 records measured scrollLeft 0→156, no dialog); re-pinned in `venue-map-pan.e2e.ts` incl. computed-style proof the mask/snap are applied | this slice | open |
| R-2 | Ghost-taken glyph cannot meet AA composited (max ≈3.5:1 even with near-black ink at 0.6 group opacity) | certain | med | Documented WCAG 1.4.3 **inactive-component** exclusion in the contrast spec header: the glyph is `aria-hidden`, the tile is non-interactive, and "taken" is carried by the tile's accessible name + dashed (non-colour) border; axe skips aria-hidden text | this slice | open |
| R-3 | Available-tile ink margin is thin (4.62:1 over the aqua stop) | low | med | Pinned exactly in the composited contrast spec; any wash/fill retune fails the spec before it ships | this slice | open |
| R-4 | Changing walk-in accessible names breaks e2e/name-matching elsewhere | low | med | Bookable-set names ("Select to book") unchanged; grep shows only walk-in-related specs assert walk-in names | this slice | open |
| R-5 | Sonar new-code gate (0 issues, 0 duplication, ≥80% coverage) on spec-heavy diff | med | med | Shared fixture builders inside each spec file; review the Sonar issue list at the PR gate, not just pass/fail | this slice | open |
| R-6 | Restyle silently drops a computed style the class-diff can't see (cursor, transition, snap) | low | med | e2e asserts computed styles (wash background-image, mask-image, scroll-snap-type, ghost opacity) per riviera-tailwind's no-drift rule | this slice | open |

## Open questions / Assumptions

- **Assumption:** the walk-in tile shows its price chip like any row (the price is what
  you'd pay at the venue) — the issue's treatment covers the tile, not the price column.
  — *Owner:* this slice · *Resolves by:* review gate (maintainer can override cheaply)
- **Assumption:** ghost-taken AA exclusion (R-2) is acceptable because WCAG 1.4.3 exempts
  inactive UI components and the repo's own contrast spec already carries a
  "deliberately excluded" list. — *Owner:* this slice · *Resolves by:* review gate

## Availability & concurrency (invariant #2)

N/A — display-only. This slice writes nothing: no availability channel is touched, no
booking flow changes. Invariant #3 **display parity is preserved and sharpened**: the
`bookable = availability === 'FREE' && pool === 'ONLINE'` predicate in `toTile` is
unchanged; the slice only makes the already-un-bookable walk-in state *visible and
audible* (tile class + accessible name). The server stays authoritative for every claim.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

All in the `venue` frontend feature folder (`frontend/src/app/venue/`), no boundary
change; no backend module touched. No new cross-feature import (RV-FE-8 table untouched).

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (Prices rendered are display of `MoneyView` integer minor
units via the shared `formatMoney`, invariant #5 as today.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.ts` | existing | standalone component | `zoneStart` derived in the existing `rows` `computed()`; walk-in state in `toTile` | none |
| FE-2 | `venue/venue-map.html` | existing | template | wash, zone chips + gaps, ghost tiles, walk-in tiles, mask/snap viewport, legend | none |

**Standards:** standalone, signals, native control flow — no deviation. No new images.

## FE↔BE contract

N/A — no contract change (`VenueMapView`/`SetView` consumed as-is; `pool` already on the wire).

## Execution status

**Stage pointer:** implement (phase 1)

**Next action:** write the failing zone-chip unit specs, then apply prototype `f781dbf`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ⏳ | |
| 1 — restyle base (prototype `f781dbf` + zone unit specs) | | |
| 2 — walk-in treatment + legend (TDD) | | |
| 3 — composited contrast specs | | |
| 4 — e2e pins + a11y sweep + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | | none yet | |

---

## File structure

- `docs/plans/beach-map-restyle.md` — this plan
- `frontend/src/app/venue/venue-map.ts` — `zoneStart` on `MapRow`; walk-in tile state + accessible name in `toTile`
- `frontend/src/app/venue/venue-map.html` — wash, zone chips/gaps, ghost + walk-in tile classes, mask/snap viewport, legend entries
- `frontend/src/app/venue/venue-map.spec.ts` — zone-chip/zone-gap specs, walk-in treatment specs, legend spec; fixture gains an equal-price zone
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — composited tile/chip pairs over the wash stops; 1.4.3 exclusion documented
- `frontend/e2e/venue-map-pan.e2e.ts` — restyle pins (wash/mask/snap/ghost computed styles, per-zone chips, walk-in row) on the existing drag/axe suite

## Phase 1 — Restyle base: zone unit specs (red) → apply prototype (green)

**Files:** Modify `venue-map.spec.ts`, `venue-map.ts`, `venue-map.html`

- [ ] **Step 1:** Extend the miramar fixture so Rows 3+4 share a price (one zone), and
  write failing specs: `row-price` chips render only on zone starts (3 chips for 4 rows);
  `mt-3` on non-first zone starts across all three columns; absent inside a zone.
- [ ] **Step 2:** `npm test -- venue-map.spec` → the new specs FAIL (today: 4 per-row prices).
- [ ] **Step 3:** Apply the approved prototype (`git cherry-pick f781dbf` or equivalent
  patch): wash, translucent tiles, ghost-taken, zone chips + gaps, mask + snap.
- [ ] **Step 4:** `npm test -- venue-map` → PASS (incl. the untouched suite; the old
  per-row price assertions updated in the same commit).
- [ ] **Step 5:** Generalization audit — N/A (no bug fixed; restyle application).
- [ ] **Step 6:** Commit `Restyle the beach map: sea→sand wash, per-zone price chips, ghost taken sets (#672)`.
- [ ] **Step 7:** Update Execution status; open the draft PR (CI vehicle).

## Phase 2 — Walk-in treatment (TDD)

**Files:** Modify `venue-map.spec.ts` (red), then `venue-map.ts`, `venue-map.html`

- [ ] **Step 1:** Failing specs: AC-3 (walkin class + no button + "walk-in only — book at
  the venue" name), AC-4 (taken beats walk-in), AC-5 (legend walk-in entry).
- [ ] **Step 2:** `npm test -- venue-map.spec` → FAIL.
- [ ] **Step 3:** Implement: `toTile` walk-in state + name; template `walkin` class
  (sand `#efe0bd/85` fill, `#c8ab62` border, `#5f4d2a` ink); legend entry + swatch resync.
- [ ] **Step 4:** `npm test -- venue-map` → PASS; `npm run test:a11y` → PASS.
- [ ] **Step 6:** Commit `Give free walk-in sets a distinct sand tile, name and legend entry (#672)`.
- [ ] **Step 7:** Update Execution status.

## Phase 3 — Composited contrast specs

**Files:** Modify `venue-map.contrast.spec.ts`

- [ ] **Step 1:** Replace the solid `TILE_PAIRS` block with composited pairs: tile fill
  alpha over each wash stop (`#cfeef6`, `#e7f5f1`, `#f6eedb`), inks for available
  (`#0f7d8c` on white/75), premium (`#875911` on `#fbf1d9`/85), walk-in (`#5f4d2a` on
  `#efe0bd`/85), row-code chip (white/60) and zone-price chip (white/80) inks
  (`#0a4f5e`). Document the ghost-taken 1.4.3 exclusion in the header.
- [ ] **Step 2/4:** `npm run test:a11y` → PASS (values pre-verified: 4.62–8.95:1).
- [ ] **Step 6:** Commit `Prove the restyled tile inks AA composited over the wash stops (#672)`.

## Phase 4 — e2e pins + close-out

**Files:** Modify `frontend/e2e/venue-map-pan.e2e.ts`, this plan

- [ ] **Step 1:** Extend the mocked wide venue with a same-price zone + a walk-in row;
  assert per-zone chip count, wash background-image, mask-image + scroll-snap-type on
  the pan viewport, ghost opacity < 1, walk-in tile not a button, legend walk-in entry;
  keep the drag-pan pin + axe sweep green.
- [ ] **Step 2/4:** `npm run test:e2e:a11y` → PASS. `npm run lint` + `npm run format:check` → PASS.
- [ ] **Step 5:** Generalization audit — if any fix emerged, log it below.
- [ ] **Step 6:** Commit `Pin the restyled map's pan, wash and walk-in treatment in e2e (#672)`.
- [ ] **Step 7:** Finalize Execution status; mark PR ready for review; run the review +
  Sonar gates per `references/pr-gates.md`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| | | | | | |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5:** `npm test -- venue-map.spec` → PASS. Verified at `<sha>`.
- [ ] **AC-6:** `npm run test:a11y` → PASS (contrast + axe suites). Verified at `<sha>`.
- [ ] **AC-7/AC-8:** `npm run test:e2e:a11y` → PASS (incl. the extended
  `venue-map-pan.e2e.ts` drag + computed-style + axe pins). Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1 — frontend-only).
- [ ] **Availability** section justified N/A; invariant #3 display parity preserved.
- [ ] Pool + cutoff rules honored (invariants #3, #4 — display untouched).
- [ ] **Modulith** N/A — frontend-only.
- [ ] **Payment/payout** N/A.
- [ ] Refund policy N/A.
- [ ] Timezone N/A — no date logic touched.
- [ ] Booking codes N/A.
- [ ] Flyway N/A.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state cites `merged via PR #NN`.
- [ ] **The review gate ran in full** (`/code-review` + `riviera-review-overlay`).
