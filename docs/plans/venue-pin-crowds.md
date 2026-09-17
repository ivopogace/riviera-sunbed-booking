# Riviera map: the place pill for crowded venue pins — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On Discover's riviera map, venue pins that bury each other at the current camera become
one **place pill** (beach, lowest from-price, count) whose press eases the camera to the zoom that
separates them and narrows the Beach filter (undone by a crumb on the map); where no zoom separates
them, the pill inverts and its presses walk the crowd's previews one by one — so every venue is
reachable by pointer at every zoom, and a keyboard still walks one real button per venue.

**Architecture:** The engine stops drawing venue markers. The pin layer becomes an Angular overlay
in light DOM over the map's box (`pages/home/venue-pin-layer.ts`), re-projected through three port
additions (`project`, `onMove`, `easeTo`) on every camera move; `@for … track pin.id` keeps one
element per venue across every re-group, which is what lets focus survive a fit, a re-group and a
filter narrowing. The crowd geometry is pure (`pages/home/pin-crowding.ts`) and the whole venue
vocabulary stays in `pages/home/`; `shared/riviera-map.ts` keeps the operator's placement pin and
the chrome and loses its venue-pin marker set (`MapPin`, `pins`, `selectedPin`, `pinSelected`,
`focusPin`), which nothing binds any more.

**Persistence:** JDBC only (invariant #1). No table or migration touched — frontend-only.

**Source of intent:** GitHub issue #1134 and its decision comment (the E + D hybrid, prototyped on
`claude/prototype-1134-variant-e-w9clbm` @ `1c37baa1`; the surviving prototype's README is the
design record, and nothing from that branch merges).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — re-verified every
code citation in the issue against `main` @ `240af40b`: the engine's pin layer, its `z-[2]` and
DOM-order paint rule, the pill width since #1137; only Dependabot's vitest bump (#1093) is open, no
overlap; `docs/plans/venue-pin-price.md` is stale — its PR #1137 merged — and is retired in this
PR's close-out) · `riviera-plan-doc` (this template — forced the parity ledger for the retired
engine layer, and a seam for every AC) · `tdd` (each AC red at its seam before the adapter, the
geometry, the layer or the page changed) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD` at close-out: the rename/removal
grep for `MapPin`, `venuePins`, `focusPin`, `syncVenuePins`, `selectedPin`, `pinSelected`,
`currentHandle`, `venue-pin-price` over the substrate — 0 findings; the counting sweep — 0 (every
"the two" hit is another subject: the placement pin and the here dot, the two panels); reverse walk —
CONTEXT.md's "one pin per venue" still holds (one button per venue), so the glossary *gains* _pin
crowd_ / _place pill_ rather than changing a fact; the stale #1135 plan retired, no citation outside
`docs/plans/`) · `riviera-local-debug` (`git fetch --unshallow` before any history
claim; scoped Vitest via `--include`; mocked e2e with `PW_CHROMIUM_EXECUTABLE`) · `riviera-frontend`
(the map port and its two adapters stay in `shared/`; the crowd geometry, the layer and every
venue word live in `pages/home/`; the mocked suite is the CI-run one) · `angular-developer` +
angular-cli MCP `get_best_practices` (v22: `input()`/`output()`, `computed`, `linkedSignal` for the
held card list, host bindings in the decorator, no `ngClass`) · `riviera-tailwind` (the pill wears
the theme-invariant `--riv-solid-btn-*` skin and inverts it for "here", exactly as the selected pin
does; `text-[…px]` sizes; `[appTouchTarget]` on every button; never `outline-none`; the
`data-here:` variant is Tailwind v4's native data-attribute variant) · `playwright-cli` (the mocked
`discover-map.e2e.ts` gains a crowd describe; role/test-id locators, web-first `expect`, no sleeps)
· `frontend-design` (the prototype's design pass is the visual spec: the pill is the priced pin's
own shape grown a name and a count; the memorable thing is the camera going where the tourist
pressed).

**Branch:** `claude/venue-pins-overlap-1134-bq91hx` (the session's designated remote branch stands
in for `bugfix/venue-pin-crowds`).

---

## Intake-gate outcome (issue #1134, grilled 2026-09-17)

| Issue claim | Checked against `main` @ `240af40b` |
|---|---|
| No collision handling; DOM order decides who wins (`z-[2]`, `syncVenuePins` in list order) | **Holds.** `riviera-map.ts` `VENUE_PIN_CLASSES` still `z-[2]`; markers added in feed order. |
| The pin is a 44 px disc | **Stale** — since #1137 it is a pill `h-11 min-w-11` that widens with its price (57 px for `€25`); the issue's own third comment records the wider overlap. The crowding rule is therefore a box-overlap test with a per-pin width, not a 44 px centre distance. |
| Keyboard and screen-reader users are unaffected (one `<button>` per pin in feed order) | **Holds**, and is the parity floor: the layer keeps one real button per venue in feed order. |
| Seams: `riviera-map.ts`, `map-engine.ts` + the two adapters, `pages/home/` | **Holds**, plus `pages/home/venue-preview-card` is out of this slice (the stepper is slice 2). |
| Out of scope: the operator's placement pin | **Holds.** `pin`/`pinDraggable`/`pinLabel`/`mapClick`/`pinMoved` are untouched. |

**In flight:** one open PR, Dependabot's vitest 4→5 bump (#1093) — no file overlap. No Flyway
number in play (frontend-only). No epic checklist to tick (#1134 is a standalone bug).

**Module ownership:** frontend-only; no backend module touched (§4a: one line).

### The five things the prototype left open — settled here

1. **The crowd's order — feed order, by construction.** The catalogue already serves the list in a
   tourist-meaningful order (`JdbcVenueCatalog`: `ORDER BY rating_tenths DESC, name ASC`), and the
   pill's "first", the walk's "next", the keyboard's Tab order and the list beside the map are all
   the same array (`shownCards`), so the one rule is *the list's order* and the three surfaces cannot
   disagree — as the tourist steps `1/3 → 2/3`, the highlighted card walks *down* the list. Sorting
   the crowd alone by sets free then price would make the pill and the list disagree; sorting the
   whole list that way is a catalogue-order product change for every tourist, which is not this
   bug's to make. If the maintainer wants it, it is one `ORDER BY` in the catalogue (or one sort of
   `shownCards`) and every surface here follows for free. Flagged for veto in the PR.
2. **The engine's own venue-pin layer goes.** `syncVenuePins`, `moveVenuePins`, `paintSelection`,
   `buildVenuePinElement`, `focusPin`, `MapPin` (with `badge`), the `pins`/`selectedPin` inputs and
   `pinSelected` output are removed from `riviera-map.ts`, and `pages/home/venue-pins.ts` with them.
   A fallback nobody binds is a production branch nothing exercises (the same argument
   `riviera-frontend` makes against unarmed flags), and a second way of drawing venue pins would
   drift from the first. The operator console's placement pin needs from `riviera-map.ts` exactly
   what it has today: `pin`, `pinDraggable`, `pinLabel`, `mapClick`, `pinMoved`, `options`, near me,
   zoom, skip, the credit. The one addition the layer needs from the component is the live handle
   as a signal: `currentHandle()` becomes `readonly handle: Signal<MapHandle | undefined>` (its two
   spec callers move to it). Every retired behaviour is accounted for in the parity ledger.
3. **A multi-beach crowd's press sets no filter, not Region.** A region is coarser than what the
   camera shows after the press (the fixture's whole coast is one region), so narrowing to it would
   leave venues outside the view in the list while claiming to narrow; and one filter set from the
   map with one crumb to undo it is a contract a tourist can predict. The second press — the
   beaches having come apart — narrows to the beach.
4. **Sets free on the preview card rides slice 2**, with the card's stepper: both are card-side,
   both are what the walk needs, and neither touches the map. Filed as issue #1139 at close-out.
5. **Slicing: two slices, each demoable, one PR each.** **Slice 1 (this PR):** the port additions,
   the overlay pin layer replacing the engine's, the place pill with travel, the Beach filter
   follow and its crumb, and press-through *from the pill* (invert, open first, press again walks)
   — so an inseparable crowd is never a regression on the day it ships. **Slice 2 (its own issue
   and PR):** the preview card's dot-rail stepper walking the same crowd, and the card's sets-free
   count (#1139). Splitting the crumb or press-through out of slice 1 would ship a filter with no way back
   on the map, or a Dhërmi pill whose press reaches nothing — both worse than today.

---

## Acceptance criteria (testable)

> Every seam below is public: the map port (`MapHandle`), the pure geometry's exported functions,
> the layer's inputs/outputs and rendered buttons, the Discover page's DOM, and the mocked e2e.

**The port**

- [x] **AC-1:** Given the fake handle at any camera, when `project(at)` is asked for a point, then
  it answers Web-Mercator px relative to the surface's box for that camera — the camera centre
  lands at the box's centre, a `setView`/`easeTo`/`zoomIn`/`zoomOut` re-projects (a point 0.01°
  east lands twice as far right at one zoom more), and every camera move reports to `onMove`
  subscribers until they unsubscribe. *Seam:* `MapHandle.project` / `MapHandle.onMove` on
  `FakeMapHandle` · *Pinned by:* `fake-map-engine.spec.ts` "projects a point relative to the
  camera and re-projects after every move" and "reports every camera move until unsubscribed".
- [x] **AC-2:** Given a marker on the fake, when the camera moves, then its element is re-placed at
  the same projection the pins use, and a click on the surface reports the inverse of it (a click
  on the box's centre is the camera's centre). *Seam:* `FakeMapHandle` markers + `onMapClick` ·
  *Pinned by:* `fake-map-engine.spec.ts` "re-places markers when the camera moves" and "turns a
  click on its surface into the position under it".
- [x] **AC-3:** Given the fake, when `easeTo(view)` is called, then the view is `view` at once (a
  cut) and `onMove` fired. *Seam:* `MapHandle.easeTo` · *Pinned by:* `fake-map-engine.spec.ts`
  "eases as a cut and reports the move". (The MapLibre adapter's three methods are ~12 lines over
  `map.project`, `map.on('move')` and `map.easeTo({duration: 700})` — MapLibre 6.9 itself sets
  `duration = 0` under `prefers-reduced-motion` for a non-essential animation — and are exercised
  by the real-engine e2e, not unit-testable in jsdom.)

**The geometry** (`pages/home/pin-crowding.ts`)

- [x] **AC-4:** Given two placed pins, when their rendered pills overlap (across, closer than half
  their widths together; down, closer than 44 px), then they crowd; two pins exactly that far apart
  do not. *Seam:* `crowds(a, b)` · *Pinned by:* `pin-crowding.spec.ts` "two pins crowd when their
  pills overlap on both axes".
- [x] **AC-5:** Given pins in feed order and a projection, when they are grouped, then each pin
  joins the first crowd whose anchor it overlaps, the crowd's key is its member ids joined, its
  members keep feed order, and a lone pin is a crowd of one. *Seam:* `crowdPins(pins, project)` ·
  *Pinned by:* `pin-crowding.spec.ts` "groups pins by where they land, in feed order".
- [x] **AC-6:** Given a crowd at zoom `z`, when the separation zoom is computed, then it is the
  smallest zoom at which every pair clears half their widths together + 12 px across or 44 + 12 px
  down (Web Mercator: offsets scale by `2^Δz`), never below `z`, capped at `maxZoom`, and — when the
  box is known — at the zoom where the crowd's span still fits inside the box less a 150 px
  margin. A crowd whose members coincide asks for `maxZoom`. *Seam:* `separationZoom(crowd, zoom,
  maxZoom, box)` · *Pinned by:* `pin-crowding.spec.ts` "names the smallest zoom that separates a
  pair", "is capped by maxZoom and the box", "asks for maxZoom for coinciding pins".
- [x] **AC-7:** Given a crowd's members, when the pill's words are derived, then the place is the
  one beach, `A & B` for two, `N beaches` beyond; the from-price is the least of the members'
  integer minor units formatted by `formatMoney` (never a parsed label), or absent when no member is
  priced. *Seam:* `placeName(beaches)`, `lowestFromPrice(cards)` · *Pinned by:*
  `pin-crowding.spec.ts` "names the place by its beaches" and "takes the lowest from-price in minor
  units" (invariant #5).
- [x] **AC-8:** Given pills laid out largest crowd first, when a pill would run over a lone pin,
  another pill or the box's edge centred, then it hangs off its point to the right, else the left,
  else collapses to its bare count; with no box known nothing hangs for the edge. *Seam:*
  `layoutPills(crowds, widths, box)` · *Pinned by:* `pin-crowding.spec.ts` "hangs a pill right,
  then left, then collapses it".

**The layer** (`pages/home/venue-pin-layer.ts`)

- [x] **AC-9:** Given located cards that do not crowd, when the layer draws them, then each is
  production's priced pin: a `<button>` `[data-testid="map-venue-pin"]` in feed order with the price
  (or `●`) on its face and `<name>, from <price>` (or the name) as its accessible name, keyed by
  venue id, `aria-expanded` following `selected`, and a press emits `chosen(id)`. *Seam:* the
  layer's `pins`/`selected` inputs → rendered buttons → `chosen` · *Pinned by:*
  `venue-pin-layer.spec.ts` "draws production's priced pin for a venue on its own" (#1135's AC-1/3/4
  carried over).
- [x] **AC-10:** Given a crowd, when the layer draws it, then it is n real buttons in feed order:
  the face member's button is the place pill (`[data-testid="map-place-pill"]`, showing the place,
  `from €X` and the count in a disc, named `<n> venues at <place>, from €X; press to zoom to them`)
  and the others are invisible members at the same spot (`[data-testid="map-crowd-member"]`, named
  `<venue>, k of n venues at <place>`, `pointer-events-none`, painted only when focused), each of
  which opens its own venue on press. *Seam:* as AC-9 · *Pinned by:* `venue-pin-layer.spec.ts`
  "draws a crowd as one place pill and n real buttons" and "a crowd member opens its venue directly".
- [x] **AC-11:** Given a place pill the camera can separate, when it is pressed, then the layer
  eases the handle to the crowd's centre at its separation zoom and emits `narrowed(beach)` only
  when every member shares one beach; after the ease the members are lone pins and the pressed
  element is still the same element (focus kept). *Seam:* the pill's press → `MapHandle.easeTo` +
  `narrowed` · *Pinned by:* `venue-pin-layer.spec.ts` "pressing a place goes there, narrows to its
  one beach and keeps focus on the same element" and "a crowd spanning beaches narrows nothing".
- [x] **AC-12:** Given a crowd the camera cannot separate (separation zoom within 0.05 of the
  current zoom), when the layer draws it, then the pill inverts (`data-here`), reads `See each
  venue`, and is named `…; press to open <first>`; its press emits `narrowed(beach)` then
  `chosen(first)`; with `selected` a member, the pill reads that venue's name, its price and `k/n`,
  is `aria-expanded`, and its press emits `chosen(next)`, wrapping. *Seam:* as AC-11 · *Pinned by:*
  `venue-pin-layer.spec.ts` "an inseparable crowd inverts its pill and presses through its venues,
  wrapping".
- [x] **AC-13:** Given any pin, when `focusPin(id)` is called, then that venue's button takes focus,
  whatever it currently shows (pill, lone pin or member); an unknown id is a no-op. *Seam:*
  `VenuePinLayer.focusPin` · *Pinned by:* `venue-pin-layer.spec.ts` "focuses a venue's button on
  request, whichever face it wears".
- [x] **AC-14:** Given the layer rendered in every state (lone, pill, inverted pill, walking, a
  focused member), when axe runs, then no violation; and the pill's inks clear AA on the resting,
  hover and inverted fills. *Seam:* the rendered DOM; the `--riv-solid-btn-*` pair · *Pinned by:*
  `venue-pin-layer.a11y.spec.ts`, `venue-pin-layer.contrast.spec.ts`.

**The page** (`pages/home/`)

- [x] **AC-15:** Given Discover with located venues, when the map is shown, then the engine holds no
  venue markers and the layer draws the pins from the same cards the list renders; a pin press opens
  its preview and moves focus into it; Escape closes it and hands focus back to that venue's button
  in the layer; a map tap closes it. *Seam:* the Discover DOM (`map-venue-pin`, `venue-preview`) ·
  *Pinned by:* `home.spec.ts` (the existing "venue pins and the preview" block, re-pinned on the
  layer) and `riviera-map.spec.ts` (the venue-pins block removed; the placement-pin block kept).
- [x] **AC-16:** Given a reload in flight (filter, date), when the list shows its skeletons, then the
  map keeps the last list's pins and an open preview, and once the new list lands the preview stays
  iff its venue is still in the result set. *Seam:* the Discover DOM across a `/api/venues` reload ·
  *Pinned by:* `home.spec.ts` "keeps the pins and the open preview while a reload is in flight" and
  the existing "re-feeds the pins and drops the preview when a filter changes the result set".
- [x] **AC-17:** Given a place pill whose crowd is one beach, when it is pressed, then the Beach
  select reads that beach, exactly one further `/api/venues?beach=` request is made, the crumb
  `<beach> ×` (`[data-testid="map-beach-crumb"]`, named `Showing <beach> only; press to show all
  beaches`) appears on the map, and pressing the crumb clears the filter, re-requests, removes the
  crumb and moves focus to Near me (else Zoom in). *Seam:* the Discover DOM + the HTTP seam ·
  *Pinned by:* `home.spec.ts` "narrows the Beach filter when a place is pressed and the crumb undoes
  it".
- [x] **AC-18:** Given an inseparable crowd, when its inverted pill is pressed, then the Beach filter
  narrows, the first venue's preview opens with focus inside it, and the next press of the pill
  opens the next venue's preview. *Seam:* the Discover DOM · *Pinned by:* `home.spec.ts` "presses
  through an inseparable crowd's previews from the map".

**End to end** (`frontend/e2e/discover-map.e2e.ts`, the mocked suite, fake engine)

- [x] **AC-19:** Given a fixture with a Ksamil pair (~120 m) and a Dhërmi trio (~20 m), when the
  map opens wide, then two place pills read `Ksamil · from €21 · 2` and `Dhërmi · from €24 · 3`,
  every control is ≥ 44 × 44 and the page is axe-clean. *Seam:* the mocked Discover page ·
  *Pinned by:* "groups pins that bury each other into a place pill…".
- [x] **AC-20:** Given the Ksamil pill, when pressed, then Beach = Ksamil, the list is its two
  venues, the crumb shows, two priced pins sit at least their widths apart, and the pressed element
  is still focused; the crumb press restores every venue and focuses Near me. *Seam:* as AC-19 ·
  *Pinned by:* "press a place to go there…".
- [x] **AC-21:** Given the Dhërmi pill, when pressed, then it inverts to `See each venue`; the next
  press opens Aurora Bay's preview with the pill reading `Aurora Bay … 1/3`; pressing again walks
  to Folie Marine `2/3`; Escape closes the preview and focuses the pill; Tab reaches each of the
  three member buttons, and Enter on one opens that venue. *Seam:* as AC-19 · *Pinned by:*
  "where nowhere is closer, press through the venues…" and "a keyboard still reaches every venue in
  a crowd".
- [x] **AC-22:** Given the phone width, when the map view shows a place pill, an inverted pill and
  the crumb, then the touch-target sweep passes. *Seam:* `touch-targets-tourist.e2e.ts` · *Pinned
  by:* "home — the map view with a crowd, its pressed-through pill and the beach crumb".

## Non-goals

- The preview card's stepper and its sets-free count (slice 2 — issue #1139).
- Sorting the crowd, or the list, by sets free then price (a catalogue-order decision; see §1).
- Setting the Region filter from a multi-beach crowd (§3).
- Any backend or API change; any change to the operator console's placement pin.
- Real-map screenshots or pixel measurements in CI — the real-engine e2e keeps its existing
  guards (same-origin, credit, no position leak); crowding is proven on the fake, whose projection
  is now Web Mercator around the camera.
- Iterative relaxation between neighbouring pills beyond right/left hanging (prototype C's cost).

## Behavior-parity ledger (retirement / replacement slices only)

The retired surface is the engine's venue-pin marker set in `shared/riviera-map.ts` (+
`pages/home/venue-pins.ts`), replaced by `pages/home/venue-pin-layer.ts`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| One `<button data-testid="map-venue-pin">` per located card, in feed order | preserved | the layer's `@for` over the cards in list order; a lone venue keeps the test id |
| Face shows the price badge, else `●`; name is `<name>, from <price>` / `<name>` (#1135) | preserved for a lone pin; **changed** for a crowd member | a crowd's face is the pill (place, from-price, count); a member's name is `<venue>, k of n venues at <place>` — the venue is still named first |
| `aria-expanded` flips on the selected pin, never a rebuild | preserved | attribute binding on a button that persists (`track pin.id`) |
| Rebuild only when the pin set's identity changes; move in place otherwise | **changed** | Angular's `@for` diffing keeps each button across any camera move or re-group; positions are style bindings, so nothing is ever re-added |
| A pin press does not reach the map-click handler | preserved | the layer is a sibling of `app-riviera-map`, outside the engine's surface; pinned by home.spec "closes when the map itself is tapped" still passing with a pin open |
| `focusPin(id)` hands focus back on close | preserved | `VenuePinLayer.focusPin(id)`; `Home.closePreview` calls it |
| Venue markers keep clear of the placement pin and the here dot (id namespace) | dropped | the engine holds no venue markers at all; the here dot stays an engine marker under the layer (`z-[1]` in the map host vs the layer's `z-[4]` in the panel) |
| `MapPin.badge` — map vocabulary for a face | dropped | the layer takes `VenueCard`s; the map port carries no pin vocabulary any more |
| A pin whose badge changes redraws (repriced date) | preserved | template binding on `card.priceLabel` |
| Pins positioned by the engine at its own projection, per frame | preserved | `project()` on every `onMove` (and on resize, via ResizeObserver) |
| `pins === undefined` (loading) draws nothing | **changed** | the first load still draws nothing; a *re*load keeps the last list's pins (`shownCards`) so focus and an open card survive a map-driven narrowing (AC-16) |
| "A filter or date change always closes the preview" (home.ts comment) | **changed** | the preview closes iff its venue leaves the result set — the rule the linked selection already states; the transient empty list no longer nulls it (home.spec "keeps the preview open when a reload still carries its venue" now passes by design rather than by the spec's synchronous flow) |
| The engine's marker paint order (`z-[2]`, last in DOM wins) | dropped | the defect itself — replaced by crowding |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A reload empties the list, destroying every pin button → focus lost, card closed, the prototype's "focus survives a filter narrowing" (measured on a synchronous fixture) fails in production | high | high | `shownCards` (`linkedSignal` holding the last non-undefined `venuesView`) feeds the pins and the preview; AC-16 pins it | agent | closed — phase 3 |
| R-2 | The fake's `project` ignoring the camera (bounds interpolation) would make the fit untestable and every fixture crowd permanent | high | med | the fake projects Web Mercator around its camera and re-places markers on move; clicks unproject (AC-1/2) | agent | closed — `fa2857e5` |
| R-3 | jsdom has no layout: boxes are 0 × 0, no `ResizeObserver`, no canvas | high | med | box unknown → `null` (nothing hangs for the edge, no fit cap); text width via `OffscreenCanvas` when present else a per-glyph estimate; `ResizeObserver` guarded | agent | closed — phases 1–2 |
| R-4 | Pill text width mis-measured → pills overlap or hang needlessly | med | low | measured in the page's own family at the pill's weight/size; e2e asserts separated pins' boxes do not intersect | agent | closed — phase 4 (`disjoint` in the e2e) |
| R-5 | Money: the crowd's from-price parsed from a label | low | high | `lowestFromPrice` takes `VenueCard.fromPrice` (new field, `MoneyView`) and formats with `formatMoney` (invariant #5; AC-7) | agent | closed — `afe80432` |
| R-6 | The layer's buttons intercept map gestures | med | med | host `pointer-events-none`; only the buttons re-arm; e2e "closes the preview when the map itself is tapped" | agent | closed — phase 4 |
| R-7 | Removing the engine's pin layer breaks a consumer we did not see | low | high | `git ls-files` + grep: the only binders are `home.html` and the two spec callers of `currentHandle()`; the operator field binds `pin` only | agent | closed (grep in intake) |
| R-8 | Sonar: duplicated class strings between the retired `VENUE_PIN_*` and the layer | med | low | the strings move, they are not copied; `riviera-map.ts` loses them | agent | closed — phase 3 |
| R-9 | Coverage: the MapLibre adapter's three methods are not unit-testable | certain | low | ~12 lines against ~700 new; they run in the real-engine e2e | agent | accepted |
| R-10 | A member button `opacity-0` is still "visible" to the touch-target sweep and to axe | certain | low | it is a 44 × 44 button with a name — it passes both; the sweep proves it (AC-22) | agent | closed — phase 4 |
| R-11 | A lone pin cut by the map's edge measures under the floor in the sweep (a 320 px phone puts Ksamil at the opening view's right edge) | certain | low | the layer is a pannable surface: `data-touch-pans` ends the sweep's clipping walk there, as a scrolling ancestor does; the pin's own box stays 44 × 44 | agent | closed — phase 4 |

## Open questions / Assumptions

None open.

### Resolved

- Feed order (the catalogue's rating-then-name) is the one crowd order — decided in §1 and
  flagged in PR #1138's Scope notes for the maintainer's veto, which would be one sort of
  `shownCards` with every AC intact.

- The crowd's order, the engine layer's fate, the multi-beach press, sets free on the card, the
  slicing — all five above (intake, `daff4679`).
- The crumb shows whenever the Beach filter is set, whichever control set it — the map shows what
  the list is narrowed to (phase 3; `home.spec.ts` "shows the crumb for a beach chosen in the
  select too").

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice reads `VenueSummary.availability` only to show it;
nothing here writes, holds or claims a set.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. Module ownership (§4a): all in `frontend/`, no boundary change.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Money appears only as display: the crowd's from-price is the minimum of
integer minor units, formatted by `shared/money.ts` (invariant #5).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/map-engine.ts` | existing | port (`MapHandle`) | — | — |
| FE-2 | `shared/fake-map-engine.ts`, `shared/maplibre-map-engine.ts` | existing | adapters | — | — |
| FE-3 | `shared/riviera-map.ts` (+ `.html` untouched) | existing | component | `handle` becomes a signal; venue-pin marker set removed | — |
| FE-4 | `pages/home/pin-crowding.ts` | new | pure functions | — | — |
| FE-5 | `pages/home/venue-pin-layer.ts` + `.html` | new | standalone component | `input()`/`output()`, `computed` over a move tick, `effect` for the subscription | — |
| FE-6 | `pages/home/home.ts` + `.html` | existing | page | `shownCards` `linkedSignal`, `pins` from it, the crumb | — |
| FE-7 | `pages/home/venue-card.ts` | existing | view record | `fromPrice: MoneyView \| null` added | — |
| FE-8 | `pages/home/venue-pins.ts` (+ spec) | removed | — | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`, no
deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `sonar gate` — the review gate ran in full on `240af40b..cbf816c9` (range
verified by `check-review-range.mjs`: 31 files, +2865/−788, matched to the PR): `/code-review`'s
five reviewers plus the overlay's frontend bank; seven findings scored, two above the bar, all
seven resolved in `2361f2a1` (F-4..F-10 below); the gate's comment is
https://github.com/ivopogace/riviera-sunbed-booking/pull/1138#issuecomment-5719352322.
`origin/main` unchanged since the branch's base (`240af40b`). Merges via PR #1138.

**Next action:** CI and the SonarCloud re-analysis on the Sonar-fix commit; the gate is done when
the check-run reads success with an empty list (F-11 was its one entry).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the port: `project`, `onMove`, `easeTo` in both adapters | ✅ | `fa2857e5` |
| 1 — the crowd geometry (`pin-crowding.ts`) | ✅ | `afe80432` |
| 2 — the pin layer (`venue-pin-layer.ts`) + a11y + contrast | ✅ | `e6c3753a` |
| 3 — Discover wiring, the crumb, `shownCards`; the engine layer retired | ✅ | `30dd404c` |
| 4 — mocked e2e: the crowd describe + the touch-target sweep | ✅ | `d6c0ac9c` |
| 5 — close-out: glossary, the stale #1135 plan retired, the slice-2 issue (#1139) | ✅ | phase-5 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (repo hygiene, phase-3 push) | `check-plan-file-structure`: `venue-preview-card.spec.ts` touched but not listed | fixed-in-`d6c0ac9c` |
| F-3 | CI (repo hygiene, close-out push) | `check-inline-comments`: provenance `(#1134)` in the crowd describe's doc comment | fixed-in-`5ffb6a76` |
| F-4 | review (prior-PR comments) | `venue-pin-layer.contrast.spec.ts` restated the resting pair with the arguments swapped — `contrastRatio` is order-independent (the #1130/#1131 correction) | fixed-in-`2361f2a1` (one assertion per pair; the doc comment says why the inverted states ride it) |
| F-5 | review (prior-PR comments) | the place pill's `touch-manipulation` unproven by the double-tap sweep (the #1130/#1131 coverage half) | fixed-in-`2361f2a1` (`expectTouchManipulation` on `map-place-pill`) |
| F-6 | review (git history) | the fake's click unprojection lost the "always inside `maxBounds`" guarantee its predecessor stated; in jsdom a far offset could leave the fence | fixed-in-`2361f2a1` (clamped to the fence; `fake-map-engine.spec.ts` "holds a click inside the fence") |
| F-7 | review (code comments) | `pin-crowding.ts` cited `VENUE_PIN_BADGE_CLASSES`, which this PR deleted | fixed-in-`2361f2a1` |
| F-8 | review (code comments) | `PILL_CHROME_PX = 13 + 8 + 26 + 6 + 4` did not decompose into the pill's classes (55, not 57) | fixed-in-`2361f2a1` (the breakdown named, the sum 55) |
| F-9 | review (code comments) | the inverted-pill axe check ran before the pill's colour transition settled | fixed-in-`2361f2a1` (`settleAnimations(pill)` first) |
| F-11 | sonar (PR 1138 analysis of `1c326886`: new lines 1009, new-code coverage 92.8 %, duplicated blocks 0, smells 0, bugs 1 → Reliability C) | `typescript:S6959` — `reduce()` without an initial value in `lowestFromPrice` | fixed-in-this-commit (the first priced card seeds the fold) |
| F-10 | review (bug scan) | anchor-based grouping splits a chain A–B–C where only A–B and B–C overlap | not a defect: the doc comment states the rule as deliberate, and `layoutPills` places lone pins first so a neighbouring pin is never buried under the pill — left as is |
| F-2 | the e2e sweep (phase 4, local) | `preview-link` 39 px tall with a preview open at ≥ 390 px; a lone pin cut by the map's edge 26 px wide at 320 px | fixed-in-`d6c0ac9c` (`appTouchTarget`; `data-touch-pans`) |

---

## File structure

- `docs/plans/venue-pin-crowds.md` — this plan
- `docs/plans/venue-pin-price.md` — retired (its PR #1137 merged; `riviera-docs-freshness` § *Plan-doc retirement*)
- `CONTEXT.md` — glossary: *pin crowd*, *place pill*
- `frontend/src/app/shared/map-engine.ts` — `ScreenPoint`; `project`, `onMove`, `easeTo` on `MapHandle`
- `frontend/src/app/shared/fake-map-engine.ts` — Web-Mercator `project`/unproject around the camera; markers re-placed on move; `onMove`; `easeTo` as a cut
- `frontend/src/app/shared/fake-map-engine.spec.ts` — AC-1..3
- `frontend/src/app/shared/maplibre-map-engine.ts` — the three methods over MapLibre
- `frontend/src/app/shared/riviera-map.ts` — `handle` signal; the venue-pin marker set removed
- `frontend/src/app/shared/riviera-map.spec.ts` — the venue-pins block removed; `handle()` in place of `currentHandle()`
- `frontend/src/app/shared/riviera-map.a11y.spec.ts` — no venue-pin case left to adjust (kept as is if untouched)
- `frontend/src/app/shared/riviera-map.contrast.spec.ts` — the selected-pin inversion case now cites the place pill
- `frontend/src/app/operator/venue-location-field.spec.ts` — `handle()` in place of `currentHandle()`
- `frontend/src/app/pages/home/pin-crowding.ts` — the geometry: widths, `crowds`, `crowdPins`, `separationZoom`, `placeName`, `lowestFromPrice`, `layoutPills`
- `frontend/src/app/pages/home/pin-crowding.spec.ts` — AC-4..8
- `frontend/src/app/pages/home/venue-pin-layer.ts` / `.html` — the overlay
- `frontend/src/app/pages/home/venue-pin-layer.spec.ts` — AC-9..13
- `frontend/src/app/pages/home/venue-pin-layer.a11y.spec.ts`, `venue-pin-layer.contrast.spec.ts` — AC-14
- `frontend/src/testing/venue-cards.ts` — the `VenueCard` fixture the new specs share
- `frontend/src/app/pages/home/venue-card.ts` — `fromPrice`
- `frontend/src/app/pages/home/venue-preview-card.spec.ts` — its card fixture carries `fromPrice`
- `frontend/src/app/pages/home/venue-pins.ts`, `venue-pins.spec.ts` — deleted
- `frontend/src/app/pages/home/home.ts` / `home.html` — the layer, `shownCards`, travel/narrowing, the crumb
- `frontend/src/app/pages/home/home.spec.ts` — AC-15..18
- `frontend/src/app/pages/home/home.a11y.spec.ts` — crowd states added
- `frontend/src/app/pages/home/home.contrast.spec.ts` — unchanged unless the crumb needs a case (it wears the map chrome's pair, already pinned)
- `frontend/e2e/discover-map.e2e.ts` — the crowd describe (AC-19..21)
- `frontend/e2e/touch-targets-tourist.e2e.ts` — AC-22
- `frontend/e2e/support/touch-targets.ts` — the walk ends at a `data-touch-pans` ancestor, as at a scrolling one
- `frontend/src/app/pages/home/venue-preview-card.html` — `appTouchTarget` on the beach-map link (39 px tall before; the sweep with a preview open at ≥ 390 px never ran until now)

---

## Phase 0 — The port: `project`, `onMove`, `easeTo`

**Files:** Modify `shared/map-engine.ts`, `shared/fake-map-engine.ts`, `shared/maplibre-map-engine.ts` · Test `shared/fake-map-engine.spec.ts`

- [x] **Step 1: Write the failing tests** (`fake-map-engine.spec.ts`)

```ts
it('projects a point relative to the camera and re-projects after every move', async () => {
  const host = document.createElement('div');
  const handle = await new FakeMapEngine().create(host, OPTIONS);
  const centre = handle.project(OPTIONS.view.center);
  const east = handle.project({ lng: OPTIONS.view.center.lng + 0.01, lat: OPTIONS.view.center.lat });
  expect(centre).toEqual({ x: 0, y: 0 }); // jsdom's box is 0 × 0, so its centre is its corner
  expect(east.x).toBeGreaterThan(0);
  expect(east.y).toBeCloseTo(0, 6);

  handle.zoomIn();
  expect(handle.project({ lng: OPTIONS.view.center.lng + 0.01, lat: OPTIONS.view.center.lat }).x)
    .toBeCloseTo(east.x * 2, 6);
});

it('reports every camera move until unsubscribed', async () => { /* setView, easeTo, zoomIn, zoomOut → 4 calls; off() → no more */ });
it('eases as a cut and reports the move', async () => { /* easeTo(view) → view() === view */ });
it('re-places markers when the camera moves', async () => { /* element.style.left changes after setView */ });
it('turns a click on its surface into the position under it', async () => { /* click at the box centre → the camera centre */ });
```

- [x] **Step 2: Run it, verify it fails** — `cd frontend && npx ng test --watch=false --include="src/app/shared/fake-map-engine.spec.ts"` → FAIL: `handle.project is not a function`.
- [x] **Step 3: Minimal implementation** — `ScreenPoint` + the three methods on `MapHandle`; the fake: `project`/`unproject` (Web Mercator: world = 512·2^zoom px; `x = box.w/2 + (mx(lng) − mx(c.lng))·world`, `y = box.h/2 + (my(lat) − my(c.lat))·world`), `moveHandlers` notified from `setView`/`easeTo`/`zoomIn`/`zoomOut`, markers re-placed in px on every move, `reportClick` through `unproject`; MapLibre: `map.project`, `map.on('move')`, `map.easeTo({center, zoom, duration: 700})`.
- [x] **Step 4: Run it, verify it passes** — the same command → PASS; then `--include="src/app/shared/*map*.spec.ts" --include="src/app/operator/venue-location-field.spec.ts"` (the click and marker consumers).
- [x] **Step 5: Generalization-audit pass** — population: every `MapHandle` implementer (`grep -rln "implements MapHandle" frontend/src`) → both adapters carry all three; no other implementer.
- [x] **Step 6: Commit** — `Riviera map port: project, onMove and easeTo in both adapters (#1134)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 1 — The crowd geometry

**Files:** Create `pages/home/pin-crowding.ts` · Test `pages/home/pin-crowding.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-4..8, one `it` per AC clause, with literal expected values: two 57 px pills 56 px apart across crowd, 57 px apart do not; a pair 1 px apart at zoom 8.6 with 57 px pills separates at `8.6 + log2(69)` ≈ 14.7; coinciding pins ask for `maxZoom`; `placeName(['Jale','Livadh'])` = `Jale & Livadh`; `lowestFromPrice` over `{minorUnits: 2400}`, `{2000}`, `null` = `€20`; layout: a pill at x = 20 in a 300-wide box hangs right, at x = 280 hangs left, in a 60-wide box collapses.
- [x] **Step 2: Run, verify FAIL** — `npx ng test --watch=false --include="src/app/pages/home/pin-crowding.spec.ts"`.
- [x] **Step 3: Minimal implementation** — pure functions; `textWidth` via `OffscreenCanvas` (absent in jsdom → `0.62 × size` per glyph estimate).
- [x] **Step 4: Run, verify PASS.**
- [x] **Step 5: Generalization audit** — population: every place a from-price is derived for display (`grep -rn "fromPrice" frontend/src/app --include=*.ts | grep -v spec`) → `home.ts` `toCard` (`formatMoney`) and now `lowestFromPrice`; both minor-unit based.
- [x] **Step 6: Commit** — `Discover: the crowd geometry behind the place pill (#1134)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — The pin layer

**Files:** Create `pages/home/venue-pin-layer.ts`, `.html`; `venue-card.ts` gains `fromPrice` · Test `venue-pin-layer.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`

- [x] **Step 1: Failing tests** — AC-9..14 against the layer rendered with a `FakeMapHandle` (from `FakeMapEngine.create` on a detached host) as its `map` input; lone/crowd fixtures: Miramar + Lori (Ksamil, 0.001° apart → crowd at 8.6), Aurora (Dhërmi, 0.4° away → lone); the inseparable case: three cards at the same coordinates.
- [x] **Step 2: Run, verify FAIL** — `--include="src/app/pages/home/venue-pin-layer*.spec.ts"`.
- [x] **Step 3: Minimal implementation** — inputs `pins`, `map`, `selected`, `maxZoom`; outputs `chosen`, `narrowed`; `focusPin`; the tick on `onMove` + `ResizeObserver` (guarded); slots computed from `crowdPins` + `layoutPills`; the template from the prototype, with the test ids above.
- [x] **Step 4: Run, verify PASS**, then `npm run test:a11y`.
- [x] **Step 5: Generalization audit** — population: every control on the map surface (`grep -n "appTouchTarget\|<button" venue-pin-layer.html riviera-map.html`) → every button carries `appTouchTarget`; the crumb (phase 3) too.
- [x] **Step 6: Commit** — `Discover: the venue pin layer — lone pins, the place pill, press-through (#1134)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — Discover wiring; the engine layer retired

**Files:** Modify `home.ts`, `home.html`, `riviera-map.ts`, specs; delete `venue-pins.ts` + spec

- [x] **Step 1: Failing tests** — AC-15..18 in `home.spec.ts` (the existing block re-pinned: `pins()` now finds the layer's buttons; new cases for the reload hold, the narrowing + crumb, the press-through); `riviera-map.spec.ts` loses the venue-pins block and uses `handle()`.
- [x] **Step 2: Run, verify FAIL** — `--include="src/app/pages/home/home.spec.ts"`.
- [x] **Step 3: Minimal implementation** — `shownCards`, `pins`, `selectedVenue` linked to `pins`, `onPinChosen`, `onBeachNarrowed`, `showAllBeaches`, `closePreview` → `pinLayer.focusPin`; the template; `riviera-map.ts` trimmed; `venue-pins.ts` removed.
- [x] **Step 4: Run, verify PASS** — `home*.spec.ts`, `riviera-map*.spec.ts`, `venue-location-field.spec.ts`; then `npm run lint`, `npm run format:check`, `npm test`.
- [x] **Step 5: Generalization audit** — population: every reader of `venuesView()` for the map (`grep -n "venuesView()" home.ts`) → the list keeps `venuesView` (skeletons), the map and the preview read `shownCards`.
- [x] **Step 6: Commit** — `Discover: the overlay owns the venue pins; the place pill narrows the beach, the crumb undoes it (#1134)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — Mocked e2e

**Files:** Modify `frontend/e2e/discover-map.e2e.ts`, `frontend/e2e/touch-targets-tourist.e2e.ts`

- [x] **Step 1: Failing tests** — AC-19..22 (a `CROWDED_VENUES` fixture: the three existing plus Lori Beach at Ksamil and Folie Marine + Dhërmi Sun Club at Dhërmi).
- [x] **Step 2: Run, verify** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts e2e/touch-targets-tourist.e2e.ts` (the crowd tests fail only if phases 2–3 missed something; e2e here is the proof in a real browser, not the red).
- [x] **Step 3–4:** fix anything the browser shows that jsdom could not (widths, hanging, the sweep).
- [x] **Step 5: Generalization audit** — population: every e2e that presses `map-venue-pin` (`grep -rln "map-venue-pin" frontend/e2e`) → all still lone pins under their fixtures; verified green.
- [x] **Step 6: Commit** — `Discover e2e: crowds, the place pill, press-through and the crumb (#1134)`
- [x] **Step 7: Update plan-doc execution status.**

## Phase 5 — Close-out

- [x] `git rm docs/plans/venue-pin-price.md`; grep `venue-pin-price` outside `docs/plans/` → nothing to repoint.
- [x] `CONTEXT.md`: *pin crowd* (with *place pill*) under the riviera-map entries.
- [x] Filed the slice-2 issue #1139 (the card's stepper + sets free), `enhancement`, `area:frontend`, `ready-for-agent`, citing #1134.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green; the docs-freshness sweep recorded in *Skills consulted*; execution status finalized.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-17 | phase 0 | every `MapHandle` implementer | `grep -rln "implements MapHandle" frontend/src` | `fake-map-engine.ts`, `maplibre-map-engine.ts` | both carry `project`/`onMove`/`easeTo`; no other implementer |
| 2026-09-17 | phase 4 | every e2e that presses a venue pin | `grep -rln "map-venue-pin" frontend/e2e` | `discover-map.e2e.ts` only | every existing case still presses a lone pin under its fixture; green in the browser |
| 2026-09-17 | phase 4 (the sweep) | every control the sweep measures with a preview open, at any width | the sweep itself: `expectTouchTargets` with `venue-preview` open at 320, 390 and 1280 | `preview-link` (39 px tall at ≥ 390, never swept there before) | `appTouchTarget` on the link; the pin cut by the map's edge is the pannable-surface case, `data-touch-pans` |
| 2026-09-17 | phase 3 | every reader of the list for the map or the preview | `grep -n "venuesView()\|shownCards()" frontend/src/app/pages/home/home.ts` | `venuesView`: the list panel (`home.html`) and `shownCards`'s source; `shownCards`: `pins`, `selectedCard` | the list keeps its skeletons; the map and the preview read the held list |
| 2026-09-17 | phase 2 | every control on the map surface | `grep -n "<button" frontend/src/app/pages/home/venue-pin-layer.html frontend/src/app/shared/riviera-map.html` | the layer's one `<button>` template (three faces), the map's skip, near-me, zoom ×2, dismiss | every one carries `appTouchTarget`; `check-touch-target.mjs` green on the layer |
| 2026-09-17 | phase 1 | every place a from-price is derived for display | `grep -rn "fromPrice" frontend/src/app --include=*.ts \| grep -v spec` | `home.ts` `toCard`, `venue/venue-map.ts`, `pin-crowding.ts` `lowestFromPrice` | all three take the `MoneyView` and format with `formatMoney`; none parses a label |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3:** `npx ng test --watch=false --include="src/app/shared/fake-map-engine.spec.ts"` → PASS (16 tests). Verified at `fa2857e5`.
- [x] **AC-4..8:** `--include="src/app/pages/home/pin-crowding.spec.ts"` → PASS (23). Verified at `afe80432`.
- [x] **AC-9..14:** `--include="src/app/pages/home/venue-pin-layer*.spec.ts"` → PASS (19 + 3 axe + 3 contrast). Verified at `e6c3753a`.
- [x] **AC-15..18:** `--include="src/app/pages/home/home*.spec.ts"` → PASS (67 + 13 axe + the contrast cases); the full suite 3378 green. Verified at `30dd404c`.
- [x] **AC-19..22:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts e2e/touch-targets-tourist.e2e.ts` → 41 passed. Verified at `d6c0ac9c`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
