# Editor canvas fits the width; tiles get numbers and a real selection state

**Goal:** In the operator beach-map editor (both Bulk layout and Edit sets), a typical
14-column venue renders whole at desktop widths with no drag-pan hint, every occupied
tile shows its position number, and a selected set in Edit sets gets a ring+lift
distinct from keyboard focus. Tourist map and Daily view are untouched.

**Architecture:** `BeachMapCanvas` gains an opt-in `fitWidth` input. When on, the
existing `afterRenderEffect`/`ResizeObserver` measurement pass (already computing the
pan-hint) also measures the pan viewport's actual `clientWidth` and solves for a
per-tile size — `floor((clientWidth − (cols − 1) × 6px) / cols)`, clamped to
`[44px, 56px]` — and writes it as `--riv-tile` via a `[style.--riv-tile]` binding,
replacing the default `clamp(47px, 11vw, 56px)` for that surface only. The floor
matches `[appTouchTarget]`'s own `min-w-11`/`min-h-11`, so AC-4 falls out of the
directive already on every tile button rather than needing a second guard. Because the
pan viewport is `flex-1 min-w-0` (sized from its siblings, not its own content), the
measurement doesn't feed back into itself — it converges in one extra render, the same
`afterRenderEffect` pattern the pan-hint measurement already uses.

Widening the container: the operator console shell's `oc-main` wrapper (shared by every
tab) was capped at `max-w-[1120px]`, tighter than the editor's own `max-w-[1100px]` —
neither leaves room for 14 columns even at the 44px floor. `oc-main` now caps at
`max-w-[1300px]`; every other tab keeps its own narrower section width, so only the
beach-map tab is visually affected.

Position numbers mirror the tourist map's existing pattern (`venue-map.html`'s
`<span aria-hidden="true">{{ tile.set.positionNo }}</span>`) — a plain number in each
non-gap cell, `#0c2a33` ink (proven ≥4.5:1 against every `beach-cell.ts` tile fill).

Selection ring+lift: replaced the `outline-*` classes (which collide with the browser's
own `:focus-visible` outline on the same CSS property) with a `ring`/`ring-offset`
(box-shadow-based, so it composites independently of focus) plus `-translate-y-1` and
an elevated shadow. The ring color moved from the design's `#0e8aa8` (fails 3:1 on the
premium tile's own gold fill, 2.40:1) to `#0a5f74` — the project's existing AA-safe CTA
teal, already proven elsewhere in this file's contrast suite — which clears 3:1 against
every tile fill and every wash stop (worst case 4.32:1 on premium).

**Persistence:** None — frontend-only (Angular templates + one shared component).

**Source of intent:** GitHub issue #709 (parent epic #708).

**Skills consulted:** `riviera-sdlc` (routing) · `riviera-frontend` (placement — no new
files, existing feature/shared boundaries kept) · `riviera-tailwind` (ring vs outline,
`ring-[#hex]` arbitrary-value precedent, no `@apply`) · `angular-cli` MCP
(`list_projects`, `search_documentation`) · `riviera-review-overlay` bank items
implicitly checked via the touch-target/contrast/e2e suites below · `tdd` (new
`BeachMapCanvas` fitWidth specs written alongside the implementation; contrast specs
extended for the new tile-number ink and ring colour) · `riviera-docs-freshness` — N/A,
no substrate doc states a fact this diff contradicts (the two editor surfaces'
container width and canvas tile-sizing are implementation detail, not documented
invariants).

**Branch:** `claude/tailwind-angular-mcp-search-fb5ckm` (cloud session designated branch).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a 14-column venue and a ≥1280px viewport, the Bulk layout and
      Edit sets grids render every column with no `scroll-hint` and `scrollWidth ===
      clientWidth`; a 20-column venue still overflows and shows the hint. *Pinned by:*
      `BeachMapCanvas` fitWidth specs (`beach-map-canvas.spec.ts`) + manual Playwright
      measurement against the real dev build (14-col: fits, tile 47–56px, hint absent;
      20-col: overflows, tile 44px floor, hint present).
- [x] **AC-2:** Every non-gap tile in both editor surfaces shows its position number at
      ≥4.5:1 contrast on every tile kind; a gap/empty cell shows none. *Pinned by:*
      `layout-editor.contrast.spec.ts` (`the tile position number meets AA…`), verified
      visually (gap cell renders `""`, occupied cells render their number).
- [x] **AC-3:** Selecting a set in Edit sets renders a ring+lift distinct from the
      native focus outline, at ≥3:1 non-text contrast on every tile fill and wash
      stop. *Pinned by:* `set-editor.contrast.spec.ts` (`the selection ring marks the
      picked cell at 3:1…`).
- [x] **AC-4:** Tile hit areas never drop below the 44px touch-target floor at any
      fitted width. *Pinned by:* `frontend/e2e/touch-targets.e2e.ts` (beach map, both
      modes) — passing; structurally guaranteed by `[appTouchTarget]`'s `min-w-11
      min-h-11` plus the fit algorithm's own 44px floor.
- [x] **AC-5:** The existing layout-editor e2e (generate → confirm → paint → save,
      `LAYOUT_IN_USE`, `STALE_WRITE`) stays green; axe clean. *Pinned by:*
      `frontend/e2e/layout-editor.e2e.ts` — 10/10 passing, including the axe checks
      inline in several of those tests.

## Non-goals

- Tourist map and Daily view sizing/behaviour — explicitly unchanged (`fitWidth`
  defaults `false`; regression-tested).
- Any change to the beach-map data model, saved layout, or API contract.

## Execution status

Done. All ACs verified against a running dev build (Playwright, manual) and the test
suites below; full frontend suite (1795 tests), lint, format, and production build all
green.

## Testing performed

- `npx ng test --watch=false` (full suite): 187 files / 1795 tests passed.
- `npm run lint`, `npm run format:check`: clean.
- `npm run build`: succeeds (pre-existing CommonJS warnings for `qrcode`/`jsqr`,
  unrelated).
- Mocked e2e (`playwright.a11y.config.ts`): `layout-editor.e2e.ts` (10/10),
  `touch-targets.e2e.ts` (11/11), `touch-targets-tourist.e2e.ts` +
  `touch-targets-admin.e2e.ts` (21/21) — all green, proving the tourist/admin/daily-view
  surfaces are unaffected.
- Manual verification against a running `ng serve` + mocked API (Playwright script, not
  committed): 14-column Bulk and Edit-sets grids fit at 1280×900 with no pan hint; a
  20-column Bulk grid still overflows and shows the hint; gap cells render no number;
  occupied cells render their position number; the selection ring/lift classes apply on
  click.
