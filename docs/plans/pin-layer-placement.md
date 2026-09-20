# The pin layer's chrome-aware placement, dusk per crowd, and the desktop panel — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Behind `?map=sheet`, no place pill on Discover ever sits under the page's own map chrome
or the tourist's dot at 390, 430, 768, 1024, 1440 or 1920; a pill greys only when every venue in
its crowd has stopped selling for the chosen day; and from `lg` the sheet becomes a left panel
beside an inset map of one region, the row still being the pin's preview.

**Architecture:** **The placement inputs are values, not a DOM pass.** The prototype re-placed the
rendered pills with a `MutationObserver` over the layer's buttons (`variant-shore.ts`'s
`placePills`/`findSpot`/`noGo`); shipped, the same three facts — the boxes a pill may not sit on,
the window it must stay inside, and the nine spots it may try — are arguments to the pure
`layoutPills`, so the whole rule is unit-driven with a stub projection and the layer that draws
the result stays thin (`pin-crowding.ts` is already that seam for `crowds`/`separationZoom`). The
host measures the chrome once per change that can move it and hands `VenuePinLayer` viewport-space
rects; the layer subtracts its own box's origin, because pins are projected into the layer's box
and the two spaces only coincide on the phone. `RivieraMap` exposes its own controls' boxes
(`chromeBoxes()`) rather than letting the page query into its DOM, so the seam stays one-way.

**Dusk is read off the card, not handed in.** `VenueCard.salesClosed` is already the server's
verdict for the chosen day and already paints the list card's `Closed today` chip; a crowd is dusk
when every member's card says so, a lone pin when its own does. A parallel `dusk` input fed from
the same cards would be a second copy of one fact, and the card record exists precisely so the list
and the map cannot disagree.

**The desktop is the sheet's content in a pinned panel**, not a second page: the same
`app-discover-head`, the same groups, the same "the row is the preview" mechanism — only the row's
own form differs (flat, with the review count, expanding when selected), which is one component
(`venue-row.ts`) the panel renders instead of the phone's card.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1159 (epic #1156, slice 3, after #1157 / PR #1160, #1161 /
PR #1162 and #1158 / PR #1163) and its one comment (the `lg:` popover proof owed from #1161);
design record `frontend/src/app/pages/prototype-map/README.md` @ `2cf675da` (PR #1155, never
merged) — § Round 7 § 3 (the crowd-mean rule) and § 5 (the gutter, see D-3), § Round 10 § 3 (the
panel clamped to the row) and § 5 (Near me bottom-left), § Round 11 § 4 (dusk per crowd, the
vertical anchor) § 5 (sticky heads) § 6 (the count only where the group cannot be seen whole),
§ Round 12 (the review count, the selected row expanding), § Round 13 (the `round` edge),
§ Round 14 § 1 (the no-go boxes, the window, the lone-pin swap, the dot over the pins);
`variant-shore.ts` (`placePills`, `findSpot`, `noGo`, `footSwapped`, `duskPins`, `window()`).

**Skills consulted:** `riviera-sdlc` (routing + the intake gate — the gate found D-1…D-5 below) ·
`riviera-plan-doc` (forced the ACs to name seams, which moved the foot swap and the gutter
geometry out of `home.ts` into pure functions) · `tdd` (each phase red-first at
`pin-crowding.spec.ts` / `venue-pin-layer.spec.ts` / `home.spec.ts`) · `riviera-review-overlay`
(run at ready-for-review) · `riviera-docs-freshness` (**ran** over `bb0e0785..HEAD`, 3 findings,
all in `CONTEXT.md` and all patched: the venue sheet's "the desktop keeps its panel", the sheet
head's "filter bar (that is the desktop's)", and the coast picker's "not a state on any phone
screen"; `map-poster.md` retired, nothing outside `docs/plans/` cited it) ·
`riviera-local-debug` (the clone was shallow — unshallowed before every history claim here;
scoped Vitest runs, `PW_CHROMIUM_EXECUTABLE` for the mocked e2e) · `riviera-frontend` (the desktop
row is a flat file in `pages/home/`, not a `components/` subfolder; the e2e extension goes in the
CI-safe mocked suite) · `riviera-tailwind` (dusk is three utilities on the fixed solid-button pair,
not an opacity; the panel's clamp is one arbitrary value; every new control declares the 44 px
floor) · `angular-developer` + angular-cli MCP `search_documentation` (v22) · `playwright-cli`
(the intersection count runs in the mocked suite, two workers, the image's Chromium).

**Primary-doc answers recorded** (never from memory):

| Mechanism | Source | What it answered |
|---|---|---|
| `afterRenderEffect` phases | angular.dev `/api/core/afterRenderEffect` (v22) | Phases run `earlyRead → write → mixedReadWrite → read`, only when dirty through signal dependencies, browser-only, at least once; "never write to the DOM" in `earlyRead`. So the chrome is measured in `earlyRead` off a tick signal and published as a value. |
| Arbitrary values with CSS functions | tailwindcss.com `/docs/width` | `w-[<value>]` takes any valid CSS value, so `w-[clamp(420px,38vw,540px)]` is the panel clamp. |
| Whitespace in arbitrary values | tailwindcss.com `/docs/adding-custom-styles` | "When an arbitrary value needs to contain a space, use an underscore (`_`) and Tailwind will convert it at build-time" — so the clamp is written comma-separated with no spaces. |
| `data-*` variant, boolean vs value form | tailwindcss.com `/docs/hover-focus-and-other-states` | "To check if a data attribute exists (and not a specific value), you can just specify the attribute name" (`data-active:`); the value form is `data-[size=large]:`. `data-dusk:` and `data-hover:` are the boolean form, matching the shipped `data-here:`. |
| `viewChildren` signal queries | angular.dev `/api/core/viewChildren` (v22) | Confirmed the signal-query form for the panel's row elements. |

**Branch:** `claude/pin-layer-placement-1159-k7wkcg` (the designated remote branch stands in for
`feature/<slug>`; created off `bb0e0785`, `main`'s tip, before phase 0)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a crowd whose first member is narrower than its widest and offset from the
  crowd's mean, when a further pin is tested for membership, then it is tested against the crowd's
  running mean and widest member, so the inland-fixture case that drew a 7 px overlap groups into
  one crowd. *Seam:* `pin-crowding.ts` `crowdPins` · *Pinned by:*
  `pin-crowding.spec.ts` › `crowdPins` › `tests a pin against the crowd's running mean and widest member`
- [ ] **AC-2:** Given a pill that fits at none of centred, hung right or hung left, when it is laid
  out, then it is tried above, below and at the four diagonals (a 32 px hang, a 10 px gap from the
  point) before it collapses to a bare count. *Seam:* `pin-crowding.ts` `layoutPills` ·
  *Pinned by:* `pin-crowding.spec.ts` › `layoutPills` › `hangs a pill above, below and diagonally before collapsing it`
- [ ] **AC-3:** Given no-go boxes for Near me and the tourist's dot and a window narrower than the
  layer's box, when pills are laid out, then no placement intersects a no-go box or leaves the
  window, and a pill that fits nowhere keeps its layer placement (centred, compact) rather than
  being recentred elsewhere. *Seam:* `pin-crowding.ts` `layoutPills(crowds, fullWidth, space)` ·
  *Pinned by:* `pin-crowding.spec.ts` › `layoutPills` › `keeps a pill off a no-go box`, `confines a pill to the window`, `leaves a pill that fits nowhere at its layer placement`
- [ ] **AC-4:** Given a crowd of six of which four still sell today and a lone `Borsh · 2` whose
  two have closed, when the layer draws them at a frozen 16:30, then `Borsh` carries `data-dusk`
  and `3 beaches · 6` does not, and the dusk skin is desaturation on the fixed hover fill with the
  price struck and the ink untouched. *Seam:* `app-venue-pin-layer` rendered output ·
  *Pinned by:* `venue-pin-layer.spec.ts` › `dusk` › `greys a crowd only when every member has closed`, `greys a lone pin on its own close`; `venue-pin-layer.contrast.spec.ts` › `the dusk pill clears 4.5:1 in all three themes`
- [ ] **AC-5:** Given a lone pin under the foot row's right-hand spot and none under the mirrored
  left-hand spot, when the foot's placement is decided, then Near me and the credit swap sides
  together; given a lone pin under both, then nothing moves (it cannot oscillate). *Seam:*
  `pin-crowding.ts` `footSwap` · *Pinned by:* `pin-crowding.spec.ts` › `footSwap` (three cases)
- [ ] **AC-6:** Given the mocked fixture at 390, 430, 768, 1024, 1440 and 1920, located and not,
  when the page has settled, then the count of intersections between a rendered place pill or lone
  pin and any rendered map chrome box is **0** at every width. *Seam:* the rendered page ·
  *Pinned by:* `frontend/e2e/discover-map.e2e.ts` › `no pill sits on the map's chrome at any width, located or not`
- [ ] **AC-7:** Given `?map=sheet` at 1440 × 900, when the page renders, then the panel is 540 px
  wide with its first row at y 192, the map is inset 12 px on all four sides with 22 px corners and
  the pane is 864 px; at 1024 the panel is 420 and the pane 568, with Himarë's north end grouped
  into one `Palasë – Dhërmi · 6` pill; at 1920 the pane is 1,344. *Seam:* the rendered page ·
  *Pinned by:* `frontend/e2e/discover-map.e2e.ts` › `the desktop panel is clamped to the row and the map takes the rest`
- [ ] **AC-8:** Given a venue row selected on the desktop panel, when it expands to its amenity
  chips and its non-default booking mode, then it measures 118 px against every other row's 92, and
  the number of rows visible is unchanged. *Seam:* the rendered page · *Pinned by:*
  `frontend/e2e/discover-map.e2e.ts` › `the selected row expands and no other, losing no visible row`
- [ ] **AC-9:** Given a region of more than 15 venues, when the panel's list is scrolled past a
  beach head, then the head sticks at the list's top and carries its count; at 15 or fewer the
  desktop head carries no count at all. *Seam:* `app-venue-row`'s group head in `home.html` ·
  *Pinned by:* `home.spec.ts` › `the desktop panel` › `sticks beach heads past 15 venues, with their counts only then`
- [ ] **AC-10:** Given the desktop panel at 1440, when the place button is pressed, then the coast
  picker opens as a popover anchored 8 px under it, 420 px wide, with its ribbon 150 px tall.
  *Seam:* the rendered page · *Pinned by:* `frontend/e2e/discover-map.e2e.ts` ›
  `the coast picker opens as a popover under the place button at lg` (the proof owed to #1161)
- [ ] **AC-11:** Given the flag off, when Discover renders at any width, then the filter bar, the
  view switch and the shipped map panel are exactly what they are on `main`. *Seam:* the rendered
  page · *Pinned by:* `frontend/e2e/discover-map.e2e.ts` › the existing `shows the list and the map side by side on a wide screen, with no switch`
- [ ] **AC-12:** Given the desktop panel, when axe runs and every control's box is measured, then
  there are no serious violations and nothing is under 44 × 44 px. *Seam:* the rendered page ·
  *Pinned by:* `frontend/e2e/discover-map.e2e.ts` › `the desktop panel is axe clean at the touch floor`; `home.a11y.spec.ts`, `home.contrast.spec.ts`

## Non-goals

- The dots-and-label-gutter form under 560 px of pane (D-3 — unreachable; dropped with the
  arithmetic recorded on #1159).
- The header's `data.wide` route flag, the lowercase eyebrow and the theme swatch as a menu row
  (README § Round 11 § 3) — a shell change touching every route, a #1156 follow-up.
- Cards on the desktop panel, a coast-line strip, a whole-coast pane: built and cut in rounds 8–10.
- The sheet's physics and Near me's arms (#1157), the poster (#1158).

## Behavior-parity ledger (retirement / replacement slices only)

> The desktop panel replaces nothing that ships: it is a new branch behind `?map=sheet`, which is
> off by default. The shipped wide Discover (filter bar + `lg:grid` list/map) is untouched and
> still the only thing an unflagged visitor sees (AC-11). The one shipped behaviour this slice
> *changes* is the pill layout, which is behind the same flag only in its inputs — the nine spots
> and the crowd-mean rule apply to the flag-off map panel too, so they are listed here.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `crowdPins` tests a pin against a crowd's FIRST member | Changed | Tests against the running mean and widest member, so the grouping agrees with the drawing the pill does at the mean (README § Round 7 § 3). Strictly more grouping; no pin loses a pin. |
| `layoutPills` tries centred → right → left → bare count | Changed | Above, below and the four diagonals are tried before the collapse, so a pill that used to lose its name keeps it. A crowd that collapsed before can only do better. |
| `layoutPills` confines pills to `0,0 → box.width,box.height` | Changed | Confines them to the window the caller hands in; the layer passes its whole box when the host hands nothing, so the flag-off map panel is unchanged. |
| A pill that fits nowhere is drawn centred and compact | Preserved | Unchanged: that IS its layer placement, and the pass never moves it elsewhere. |
| A lone pin is never moved | Preserved | Unchanged, and now load-bearing: the chrome moves instead (AC-5). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Measuring the chrome in an `afterRenderEffect` and publishing it as a signal the layer consumes could loop: the layer re-lays-out, which re-renders, which re-measures | Medium | High (a hung tab) | The measurement tracks only a `chromeTick` counter, bumped by a plain `effect` reading the things that genuinely move the chrome (detent, foot bottom, located state, viewport, swap). Pills moving bumps nothing. A spec drives two renders and asserts the measurement ran once per tick | plan | |
| R-2 | The foot swap oscillates: swapping puts a lone pin under the mirrored spot, which swaps back | Medium | High | `footSwap` is pure and decides from the CURRENT rendered boxes and their mirror: it swaps only when the current spots are covered AND the mirrored ones are not; when both are covered nothing moves. Pinned by the third case of AC-5 | plan | |
| R-3 | Round 12's "6 rows visible at 1440, 7 at 1920" cannot be reproduced without the prototype's own fixture, so an e2e asserting the literal counts would pin the fixture, not the design | High | Medium | The e2e asserts the load-bearing claim — the selected row grows by 26 px, no other row's height changes, and the visible count before equals the visible count after — and records the fixture's actual counts in the assertion message (AC-8) | plan | |
| R-4 | The desktop branch doubles `home.html`'s size and `home.ts`'s surface; Sonar flags duplicated blocks between the sheet's rows and the panel's | Medium | Medium | The groups, the head, the picker and the selection machinery are shared signals, not copied; only the row's own markup differs, and that is `venue-row.ts`. Checked against the Sonar duplication list at the gate before merge | plan | |
| R-5 | The dot's no-go box is measured from the DOM, so it is one frame behind the camera on a fast pan and a pill could flash over it | Low | Low | The dot is bumped by the same `moved()` signal the pins re-project on, so both land in the same render; the e2e measures after `settle()` | plan | |
| R-6 | `crowdPins` grouping more aggressively changes the shipped flag-off map panel's pills, which existing e2e cases assert | Medium | Medium | The existing crowd e2e cases (`groups pins that bury each other…`, `press a place to go there…`) are run before and after; a changed expectation is a deliberate edit with the reason in the commit, not a silent one | plan | |
| R-7 | The `lg:` popover needs a positioned anchor inside `app-discover-head`, which owns the place button; adding a wrapper could move the head's 78 px geometry, which #1157's e2e pins at y 493 | Medium | High | The wrapper takes the button's own `min-w-0 flex-1` and adds only `relative`, which is not a layout property here; #1157's `rests at half … first row at y 493` cases are re-run at all five phone/tablet widths as the proof | plan | |

## Open questions / Assumptions

- **Assumption:** `VenueCard.salesClosed` is the right dusk signal for "sales for today have
  closed" — it is the server's verdict for the *chosen* day, and the design record's dusk case is
  `?now=16:30` on today. A tourist who picks tomorrow sees tomorrow's verdict on both the pin and
  the row, which is the consistency the shared card record exists for. — *Owner:* plan ·
  *Resolves by:* AC-4 and the list card's existing `Closed today` chip agreeing in `home.spec.ts`

### Resolved

- **Open question (D-1):** Should the dusk state be a `dusk` component input, as the issue's seam
  line says, or read off `VenueCard.salesClosed`? — **Read off the card.** The card is the record
  both surfaces render precisely so they cannot disagree (its own TSDoc says so), the layer already
  reads `card.priceLabel`, `card.name` and `card.beach`, and a host-computed input would be a
  second copy of one server verdict. Recorded in the PR body so a reviewer can overturn it in one
  line. *Outcome:* phase 2.
- **Open question (D-2):** The issue's desktop pane widths (580 at 1024, 1,356 at 1920) and its
  prose ("inset 12 px with 22 px corners on all four sides") cannot both hold: those numbers are
  round 10 § 3's, which are the `half` edge (flush right, two corners square), and round 13
  measured all three edges and chose `round`. — **`round`**, confirmed by the maintainer: 12 px on
  all four sides, 22 px corners, panes **568 / 864 / 1,344** at 1024 / 1440 / 1920. The issue's
  numbers are stale; noted on #1159. *Outcome:* AC-7.
- **Open question (D-3):** The issue asks for the dots-and-label-gutter form "under 560 px of
  pane". — **Dropped**, confirmed by the maintainer. The gutter is README § Round 7 § 5, built for
  the whole-coast pane (360 px wide); round 8 cut the whole-coast state and round 10 § 3 replaced
  the pane rule with *panel clamped to the row*, which makes the pane `W − panel − 36` with
  `panel = clamp(420, 38 % W, 540)` — a floor of **568 px at 1024**, the narrowest window `lg`
  reaches, so `pane < 560` is unreachable. No shot after round 7 shows it. *Outcome:* Non-goals;
  the arithmetic is on #1159.
- **Open question (D-4):** Where does the gutter's row geometry live if it is built? — Moot after
  D-3. *Outcome:* dropped.
- **Open question (D-5):** Is the previous slice's plan doc (`docs/plans/map-poster.md`, #1158,
  merged via PR #1163) due for retirement? — **Yes**, `riviera-docs-freshness` § *Plan-doc
  retirement* deletes a merged plan at the next close-out, and this is it. *Outcome:* phase 7.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Nothing here writes, reads or reasons about
`set_availability`; the slice moves pixels over a map and reads two already-computed view fields
(`VenueCard.salesClosed`, `VenueCard.freePercent`). Invariant **#4** is *rendered*, not changed:
the dusk pill and the desktop row read the same server verdict for the chosen day that the list
card's `Closed today` chip already reads, and no pay or confirm path moves.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file, no endpoint, no migration.

### Module ownership (§4a)

N/A — frontend-only; no backend behaviour is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Prices are rendered from `VenueCard.fromPrice`, already integer minor
units + ISO currency, through the existing `lowestFromPrice` (#5 honoured at the one comparison it
makes).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/pin-crowding.ts` | Existing | Pure module | none (pure functions over projected points) | — |
| FE-2 | `pages/home/venue-pin-layer.ts` / `.html` | Existing | Component | `input()` `noGo`/`window`; `computed()` places, dusk; `signal` box (now origin + size) | — |
| FE-3 | `pages/home/venue-row.ts` / `.html` | **New** | Component | `input()` card, selected, km; `output()` picked, hovered | — |
| FE-4 | `pages/home/home.ts` / `home.html` | Existing | Page | `computed()` `panelMode`, `panelWidth`, `mapChrome`; `signal` `hoveredVenue`, `footSwapped`; `afterRenderEffect(earlyRead)` for the chrome | — |
| FE-5 | `pages/home/discover-head.ts` | Existing | Component | one `ng-content` slot inside a `relative` anchor | — |
| FE-6 | `shared/riviera-map.ts` | Existing | Component | `chromeBoxes()` method over its own host | — |

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or query parameter moves; `?map=sheet` is the existing
flag.

## Execution status

**Stage pointer:** `implement (phase 7)`

**Next action:** Close out — docs-freshness over the range, retire `map-poster.md`, tick the epic.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `pin-crowding.ts`: the crowd mean, the nine spots, the window and the no-go boxes | ✅ | `7817a2b2` |
| 1 — The layer takes the placement inputs and hangs vertically | ✅ | `7817a2b2` |
| 2 — Dusk per crowd | ✅ | `07783031` |
| 3 — The host hands the chrome in; the lone-pin foot swap | ✅ | `797f524b` |
| 4 — The desktop panel: frame, head, rows, sticky heads, the selected row | ✅ | `4d8c566a` |
| 5 — The desktop's pin↔row lighting and the picker popover | ✅ | `e79b934e` |
| 6 — The mocked e2e: intersections, the panel's geometry, the popover | ✅ | this commit |
| 7 — a11y, contrast, touch targets, close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | e2e (own) | The panel's `overflow-hidden` made it a scroll container, so opening the coast picker scrolled the head 23 px out of view and its controls measured 34 px against the 44 floor | fixed in phase 6 |
| F-2 | e2e (axe) | `app-venue-row`'s host is `display: contents`, so its `<li>` was not a child of the `<ul>` in the accessibility tree | fixed in phase 6 — the list item is the page's, as the sheet's card's is |
| F-3 | contrast maths (own) | `--riv-accent-ink` is redeclared for the dark theme but not riviera, so the row's price and a group's distance read 1.1:1 on the panel's glass. The same pairing already shipped on the sheet's group head from #1157 | fixed in phase 6 — both take the page ink |
| F-4 | home.spec (own) | The pin layer was fed every venue on the coast whenever the page was not in sheet mode, so the desktop panel would have drawn pins for regions it does not list | fixed in phase 4 |

---

## File structure

- `docs/plans/pin-layer-placement.md` — this plan
- `docs/plans/map-poster.md` — deleted at close-out (#1158 merged via PR #1163; D-5)
- `CONTEXT.md` — the venue panel, and the three sentences the desktop surface falsified
- `frontend/src/app/pages/home/pin-crowding.ts|.spec.ts` — the crowd mean rule, the nine spots,
  `PillSpace` (window + no-go), `footSwap`
- `frontend/src/app/pages/home/venue-pin-layer.ts|.html|.spec.ts` — the placement inputs, the
  vertical hang, dusk per crowd, `loneBoxes()`
- `frontend/src/app/pages/home/venue-pin-layer.contrast.spec.ts` — the dusk pill's contrast
- `frontend/src/app/pages/home/venue-pin-layer.a11y.spec.ts` — dusk carries no meaning by colour
- `frontend/src/app/pages/home/venue-row.ts|.html|.spec.ts` — the desktop panel's flat row
- `frontend/src/app/pages/home/venue-row.contrast.spec.ts` — the row's inks on the panel
- `frontend/src/app/pages/home/home.ts|.html|.spec.ts` — the desktop panel, the chrome
  measurement, the foot swap, the pin↔row lighting
- `frontend/src/app/pages/home/home.a11y.spec.ts` — the panel's axe pass
- `frontend/src/app/pages/home/home.contrast.spec.ts` — the panel's inks in three themes
- `frontend/src/app/pages/home/discover-head.ts|.spec.ts` — the place button's popover anchor
- `frontend/src/app/pages/home/discover-sheet.ts` — the header selector, exported so the panel
  measures the shell by the same name the sheet does
- `frontend/src/app/pages/home/venue-card.ts` — `instantBook`, so the row names the mode only when
  it is the exception
- `frontend/src/app/pages/home/place-groups.spec.ts` — the new card field in its fixture
- `frontend/src/testing/venue-cards.ts` — the same, in the shared fixture
- `frontend/src/app/shared/map-credit.ts` — the foot credit's swapped placement
- `frontend/src/app/shared/riviera-map.ts|.spec.ts` — `chromeBoxes()`
- `frontend/e2e/discover-map.e2e.ts` — the intersection count, the panel's geometry, the popover
- `frontend/e2e/discover-sheet.e2e.ts` — the crowd count its fixture now groups to under the mean rule

---

## Phase 0 — `pin-crowding.ts`: the crowd mean, the nine spots, the window and the no-go boxes

**Files:** Modify `frontend/src/app/pages/home/pin-crowding.ts` · Test
`frontend/src/app/pages/home/pin-crowding.spec.ts`

- [ ] **Step 1: Write the failing tests** — `crowdPins` against the running mean and widest member;
  `layoutPills` trying above/below/diagonal; `layoutPills` honouring `space.noGo` and
  `space.window`; a pill that fits nowhere keeping its layer placement; `footSwap`'s three cases.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/pages/home/pin-crowding.spec.ts`
- [ ] **Step 3: Minimal implementation** — the running anchor in `crowdPins`; `PillRise` on
  `PillPlacement`; `SPOTS` as the nine (dx, dy) pairs in the record's order; `PillSpace` as
  `layoutPills`' third argument; `footSwap`.
- [ ] **Step 4: Run it, verify it passes** — the same command, then
  `npx vitest run src/app/pages/home` for the package.
- [ ] **Step 5: Generalization-audit pass** — appended below.
- [ ] **Step 6: Commit** — `git commit -m "Group pin crowds on their mean and give a pill nine spots in a window (#1159)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

## Phase 1 — The layer takes the placement inputs and hangs vertically

**Files:** Modify `venue-pin-layer.ts`, `venue-pin-layer.html` · Test `venue-pin-layer.spec.ts`

- [ ] Inputs `noGo` and `window` in viewport coordinates, converted by the layer's own measured
  origin; `translate()` carries the rise; `loneBoxes()` exposed in viewport coordinates.
- [ ] `npx vitest run src/app/pages/home/venue-pin-layer.spec.ts`
- [ ] Commit — `Hand the pin layer its no-go boxes and its window (#1159)`

## Phase 2 — Dusk per crowd

**Files:** Modify `venue-pin-layer.ts`, `venue-pin-layer.html` · Test `venue-pin-layer.spec.ts`,
`venue-pin-layer.contrast.spec.ts`, `venue-pin-layer.a11y.spec.ts`

- [ ] `data-dusk` on a pill whose every member has closed and on a lone pin that has; the skin is
  `saturate-0` + the fixed hover fill + the price struck, ink untouched.
- [ ] Commit — `Grey a place pill only when every venue in its crowd has closed (#1159)`

## Phase 3 — The host hands the chrome in; the lone-pin foot swap

**Files:** Modify `shared/riviera-map.ts`, `pages/home/home.ts`, `home.html` · Test
`riviera-map.spec.ts`, `home.spec.ts`

- [ ] `RivieraMap.chromeBoxes()`; `home`'s `chromeTick` + `earlyRead` measurement; the sheet's
  window (header → the sheet's rest); `footSwap` driving which side Near me and the credit take.
- [ ] Commit — `Keep the phone's pills off the map chrome, and move the chrome for a lone pin (#1159)`

## Phase 4 — The desktop panel: frame, head, rows, sticky heads, the selected row

**Files:** Create `venue-row.ts|.html` · Modify `home.ts`, `home.html`, `discover-head.ts` · Test
`venue-row.spec.ts`, `home.spec.ts`

- [ ] Commit — `Put the sheet's list in a pinned left panel beside an inset map from lg (#1159)`

## Phase 5 — The desktop's pin↔row lighting and the picker popover

**Files:** Modify `home.ts`, `home.html`, `discover-head.ts` · Test `home.spec.ts`,
`discover-head.spec.ts`

- [ ] Commit — `Light a row from its pin and a pin from its row on the desktop panel (#1159)`

## Phase 6 — The mocked e2e

**Files:** Modify `frontend/e2e/discover-map.e2e.ts`

- [ ] Commit — `Count every pill-on-chrome intersection across the fixture regions (#1159)`

## Phase 7 — Close-out

**Files:** Modify `docs/plans/pin-layer-placement.md` · Delete `docs/plans/map-poster.md`

- [ ] `riviera-docs-freshness` over `origin/main..HEAD`; the epic checklist ticked; #1159 closed.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-12:** commands and results recorded at the close-out commit.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability N/A justified; nothing touches `set_availability`.
- [ ] Pool + cutoff honoured (#3, #4 — rendered, not changed). Money minor units (#5). UTC stored,
      `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section N/A justified; no backend file in the diff.
- [ ] Payment section N/A justified.
- [ ] No Flyway migration (#12) — none needed.
- [ ] Frontend standards met: every new control declares the 44 px floor, no `outline-none`, tokens
      do the theme switching, no `@apply`.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the
      overlay); if blocked, stated in the PR with the box unticked.
