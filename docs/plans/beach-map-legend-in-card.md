# Beach Map Legend-in-Card + Walk-in Hatch Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On the tourist beach map, move the tile-colour legend **into** the map card
(directly under the "Facing the sea" banner, above the first tile row, replacing the
trailing legend card) and give free **walk-in** tiles a diagonal hatch so they are
unmistakable against front-row cream — with the legend swatches rendered from the same
appearance source as the tiles, and no change to any operator beach-map surface.

**Architecture:** Two decisions. (1) The legend arrives by **content projection**: the
shared `BeachMapCanvas` grows one more named slot, `canvasLegend`, rendered between the
frame's sea banner and the sea→sand wash; the tourist map projects its `<ul>` into it and
the three operator surfaces project nothing, so the shared frame stays tourist-agnostic
(the `canvasFooter` / `canvasEmpty` precedent), painted the wash's own first stop so a
translucent swatch composites over exactly the ground its tiles do — matching computed styles is
not the same as looking alike (F-1). (2) Tile **appearance** moves out of the
template's `[&.premium]:`-style arbitrary variants into a variant directive,
`venue/map-tile.ts` (`[appMapTile]`, the `shared/amenity-chip.ts` + `operator/beach-cell.ts`
shape): one `Record<MapTileState, string>` of fill/border/ink classes that the tile `<li>`
**and** the legend swatch both consume — which is what makes "swatches mirror the real
tile rendering" a structural fact rather than a copy-paste that drifts. The walk-in entry
in that record is the design canvas's refined treatment: fill `#efe0bd` at **0.6** (was
0.85) plus `repeating-linear-gradient(135deg, rgba(95,77,42,0.16) 0 3px, transparent 3px 8px)`.

**Persistence:** N/A — frontend-only slice; no table, no migration, no SQL (invariant #1
untouched).

**Source of intent:** GitHub issue #701. Visual reference: both "Refined" artboards
(desktop + mobile) on the Beach Map Refinement design canvas
(`https://claude.ai/code/artifact/464f8512-ec58-441f-aeca-284b484abe71`), whose map-card
markup specifies the legend band (`margin: 0 -18px; padding: 9px 16px; background:
rgba(255,255,255,0.55); border-bottom: 1px solid rgba(12,42,51,0.08); font-size: 12px;
color: rgba(12,42,51,0.78)`, 18 px swatches at radius 6 px — **its background is the one
deliberate departure**, see F-1) and the walk-in tile style
(`border:1.5px solid #c8ab62; background-color:rgba(239,224,189,0.6);
background-image:repeating-linear-gradient(135deg,rgba(95,77,42,0.16) 0px,rgba(95,77,42,0.16)
3px,transparent 3px,transparent 8px); color:#5f4d2a`) verbatim.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
the #700 breakout e2e pins `legend.width ≈ head.width`, an assertion this slice must
_invert_, and that no Flyway number or in-flight PR overlaps: the only open PRs are
Dependabot bumps) · `riviera-plan-doc` (this template — its Behavior-parity ledger is
what forced the premium **+** walk-in tile combination into the open: today both classes
apply and Tailwind stylesheet order silently picks a winner) · `tdd` (each phase red
first: the projection spec before the slot, the appearance-record spec before the
directive, the composited hatch-band maths before the new fill) ·
`riviera-review-overlay` (review gate — **ran** at ready-for-review, layered on `/code-review`
at high effort over `origin/main...HEAD`: 14 findings, 13 fixed in the same PR, F-1 escalated as
a design call. RV-FE-E2E placed every new spec in the CI-safe mocked suite; RV-PROC-1 re-walked
after the fix round — it pulled in no new area, so this line is unchanged apart from this
parenthesis) · `riviera-docs-freshness` (**ran** over `origin/main...HEAD` at close-out — see the
Sonar/docs note below) · `riviera-frontend` (placement: the appearance directive is
tourist-only, so it colocates in the `venue/` feature folder next to its consumer — **not**
`shared/`, which no second feature needs; the `canvasLegend` slot _is_ shared chrome, so
it belongs on `shared/beach-map-canvas.ts`) · `riviera-tailwind` (rule 1 — share at the
directive layer, never `@apply`; rule 2 — the `.set-tile` / `.premium` / `.walkin` /
`.taken` marker classes stay as inert test hooks while the directive does the styling;
geometry stays with the consumer per the `beach-cell.ts` precedent) · `angular-developer`

- angular-cli MCP (`get_best_practices`: host bindings in the `host` object not
  `@HostBinding`, `input()`/`computed()` signal APIs, no explicit `OnPush`) ·
  `playwright-cli` (the new e2e assertions are role/test-id located with web-first
  `expect` and computed-style reads, no fixed sleeps) · `riviera-local-debug` (scoped Vitest
- `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e — never
  `playwright install`).

**Branch:** `claude/sdlc-701-nrkj2v` — the cloud session's **designated** branch, standing
in for `feature/beach-map-legend-in-card` (`riviera-sdlc` § Remote / cloud session
addendum). It was cut fresh from `origin/main` at `8c5604f`.

---

## Acceptance criteria (testable)

> **Mandatory before phase 0.** Each item is "Given X, when Y, then Z" and names a
> test class. Prose is not an AC. **Write each AC at the application boundary — the
> inner hexagon — in domain terms** (`AvailabilityClaim` succeeds / `BookingConfirmed`
> is published / the ledger accrues once), never the Angular button, the Stripe
> redirect, or the HTTP status alone; tech-specific assertions belong in adapter-level
> tests (Cockburn 2005). This keeps ACs stable across UI/payment-adapter churn and
> reusable from any driving adapter.

- [ ] **AC-1:** Given a loaded venue map, when the tourist map renders, then the
      `Legend` list is a descendant of the map card (`[data-testid="beach-grid"]`), appears
      before the first `[data-testid="set-tile"]` in document order, and no `Legend` list
      exists outside the card. _Pinned by:_
      `venue-map.spec.ts › 'renders the legend inside the map card, above the tile grid (#701)'`
- [ ] **AC-2:** Given a 390 × 760 mobile viewport, when the beach map page loads, then the
      legend's bounding box bottom is above the first tile row's top and the legend is within
      the initial viewport (no scroll needed to reach it). _Pinned by:_
      `venue-map-pan.e2e.ts › 'the legend leads the map card on mobile — decoded before the first tile row (#701)'`
- [ ] **AC-3:** Given a venue whose row 5 is the walk-in pool, when the map renders, then
      every free walk-in tile's computed `background-image` is a `repeating-linear-gradient`
      while a free premium tile's is `none`, and the walk-in numeral colour clears WCAG AA
      (≥ 4.5:1) composited over **both** hatch bands on **every** wash stop. _Pinned by:_
      `venue-map-pan.e2e.ts › 'a free walk-in tile is hatched, a premium tile is not (#701)'` +
      `venue-map.contrast.spec.ts › 'the walk-in numeral meets AA on both hatch bands over every wash stop'`
- [ ] **AC-4:** Given the rendered map, when the legend swatches and the tiles are compared
      by computed style, then the walk-in swatch's `background-image`/`background-color`/
      `border-color` equal the walk-in tile's, and the taken swatch's `border-style` is
      `dashed` like the taken tile's. _Pinned by:_
      `venue-map-pan.e2e.ts › 'every legend swatch renders exactly like the tile it stands for (#701)'` +
      `map-tile.spec.ts › 'renders each state from the one shared appearance record, and nothing besides'`
- [ ] **AC-5:** Given a `BeachMapCanvas` host that projects **no** `canvasLegend` content
      (every operator surface), when it renders, then the wash scroller is the frame's first
      child after the sea banner and no legend band exists — the operator layout editor, Daily
      view and per-set editor render byte-identically to `main`. _Pinned by:_
      `beach-map-canvas.spec.ts › 'projects the legend slot above the wash, and renders nothing there when unprojected (#701)'`
      (+ `beach-map-canvas.spec.ts › 'emits no legend box for a host that projects none — the operator surfaces (#701)'`, + the unchanged `layout-editor.e2e.ts` / `operator-daily.e2e.ts` / `operator-set-editing.e2e.ts` staying green)
- [ ] **AC-6:** Given the map in either theme, when axe and the contrast suite run, then
      there are no serious/critical violations, the legend list still exposes the accessible
      name `Legend`, and the legend ink clears AA over the new white-plate band on the card
      glass over every theme stop. _Pinned by:_
      `venue-map.a11y.spec.ts` + `venue-map.contrast.spec.ts › 'legend ink meets AA on the legend plate over the card glass'` +
      `venue-map-pan.e2e.ts` axe run

## Non-goals

> **Mandatory.** What is explicitly OUT of scope — guards against "while I'm here…".

- **Restyling the operator legends.** The layout editor and Daily view keep their own
  legends _outside_ their canvas; unifying them is a separate slice.
- **Promoting the tile-appearance directive to `shared/`.** Only `venue/` consumes it;
  a second consumer is what would justify the move (`riviera-frontend` import rules).
- **Changing tile geometry, the wash, the rails, the pan behaviour or the 1100 px desktop
  breakout** (#672, #685, #700) — this slice touches colour/texture and one slot only.
- **Responsive legend copy.** The design's mobile artboard shortens the walk-in label to
  "Walk-in only"; we ship the full label at every width (see Open questions).
- **A `data-touch-exempt` / touch-target change.** The legend is static content with no
  controls; walk-in tiles remain non-interactive, exactly as today.

## Behavior-parity ledger (retirement / replacement slices only)

> **Mandatory when the slice retires or replaces an existing surface** (a page, component,
> endpoint, or flow); otherwise `N/A — new behavior, replaces nothing`. A "restyle / refactor
> only, no behavior change" claim is **aspirational until verified** — the cheapest place to
> catch a silently-dropped behavior is here, not at the review gate. List **every** behavior of
> the OLD surface (re-reads/reconciles, each error path, retries, empty/loading states, the
> exact 401/403 handling, redirects, background refreshes) and mark each **preserved / changed
> (with reason) / dropped (with reason)**. A `dropped` row with no reason is a bug in waiting;
> a `preserved` row names how the new surface does it (so review can check, not re-derive).

Old surface = the trailing legend card (`venue-map.html`) **plus** the tile appearance
expressed as `[&.premium]:` / `[&.walkin]:` / `[&.taken]:` arbitrary variants.

| Old-surface behavior                                                                                                                    | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legend is a `<ul aria-label="Legend">` of four `<li>` (Available · Front row · Walk-in only — book at the venue · Taken), in that order | preserved                               | same element, same `aria-label`, same four items in the same order — projected into `canvasLegend` instead of following the card                                                                                                                                                                                                                                                                                                                                         |
| Legend labels verbatim, incl. the em-dash "Walk-in only — book at the venue"                                                            | preserved                               | copied unchanged; `venue-map.spec.ts` + the e2e still assert on "Walk-in only"                                                                                                                                                                                                                                                                                                                                                                                           |
| Legend sits on its own `appCardGlass` pill below the map card                                                                           | changed                                 | it is now a full-bleed band **inside** the map card on a `white/55` plate with a hairline bottom rule — that is the whole point of #701 (decode before reading)                                                                                                                                                                                                                                                                                                          |
| Legend ink is `--riv-card-ink-soft`                                                                                                     | preserved                               | unchanged token; the design canvas's `rgba(12,42,51,0.78)` **is** that token's value                                                                                                                                                                                                                                                                                                                                                                                     |
| Legend width tracks the 780 px page shell (pinned by the #700 breakout e2e)                                                             | changed                                 | the legend now lives in the map card, so it tracks the card — 1100 px at ≥ 1280 px. The #700 assertion is inverted to `legend.width ≈ card.width` in the same slice (it is the same fact, re-aimed)                                                                                                                                                                                                                                                                      |
| Legend swatches are hand-copied fill/border literals                                                                                    | changed                                 | both swatch and tile now read the one `MAP_TILE_CLASS` record — AC-4 is structural, not a promise                                                                                                                                                                                                                                                                                                                                                                        |
| Free walk-in tile: `#efe0bd`@0.85, solid, border `#c8ab62`, ink `#5f4d2a`                                                               | changed                                 | fill drops to 0.6 and gains the 135° hatch (design canvas values); border and ink unchanged — the ink is re-proven AA on both bands                                                                                                                                                                                                                                                                                                                                      |
| Available / front-row / taken tile fills, borders, inks                                                                                 | preserved                               | identical literals, relocated into `MAP_TILE_CLASS`; the e2e's computed-style pins (ghost alpha < 0.5, dashed border) still hold                                                                                                                                                                                                                                                                                                                                         |
| `.set-tile`, `.premium`, `.walkin`, `.taken`, `.bookable` classes as test hooks                                                         | preserved                               | the `[class.*]` bindings on the `<li>` are untouched (`riviera-tailwind` rule 2); only the _styling_ moves to the directive                                                                                                                                                                                                                                                                                                                                              |
| `[&.bookable]:p-0` (bookable tile drops padding so the button fills it)                                                                 | preserved                               | stays a static class on the `<li>`; it keys off the untouched `[class.bookable]` binding                                                                                                                                                                                                                                                                                                                                                                                 |
| A **taken** tile beats walk-in and premium ("the ghost wins", #672)                                                                     | preserved                               | now explicit: `MapTileState` resolves `taken` first, so it can no longer depend on Tailwind stylesheet order                                                                                                                                                                                                                                                                                                                                                             |
| A **premium + walk-in** tile renders … whichever variant Tailwind happened to order last                                                | changed → **defined**: walk-in wins     | matches `operator/beach-cell.ts`'s `cellStateOf` ("walk-in reads as walk-in whatever its tier") and AC-3's intent — "you cannot book this online" must never lose to a tier tint. No fixture exercises the combination today, so this changes no current pixel                                                                                                                                                                                                           |
| A venue with **zero sets** still showed the legend (the trailing card rendered regardless of the grid)                                  | changed                                 | the legend now lives inside the canvas's `rows > 0` branch, so it goes with the grid — a legend explaining tiles that do not exist is noise, and `beach-map-canvas.spec.ts` pins the disappearance. It leaves that venue's map card holding only its two banners, which was **already** its state below the legend; giving the tourist map a `canvasEmpty` message is a real gap but a pre-existing one, so it goes to a follow-up issue rather than widening this slice |
| Tile hover/focus/transition, accessible names, tap targets, the tap-to-book flow                                                        | preserved                               | untouched — the directive supplies fill/border/ink only, the `<li>`/`<button>` markup is unchanged                                                                                                                                                                                                                                                                                                                                                                       |

## Risk register

> First-class section. Each row has a mitigation, an owner, and a resolution state.
> Fill before phase 0; use the `grilling` skill if risks aren't yet visible.
> Categories that already matter in this project: concurrent reservation of the
> same set (invariant #2), Stripe webhook duplicate/out-of-order delivery (#8),
> payout double-accrual (#9), timezone/cutoff arithmetic (#4/#6), money rounding
> (#5), module boundary leaks (#11), per-venue authorization on any venue-scoped
> endpoint (an operator must only reach their own venue's data — BOLA; if the slice
> touches `/api/venues/{venueId}/**`, the payout ledger, staff bookings, or
> beach-map edit, state how ownership is verified in the application service), and
> any temptation toward JPA or Stripe Connect. A new/changed request DTO or error
> response → note the error-contract expectation (`riviera-java-conventions` §6b). A
> Flyway migration → claim `V<n>` only per the in-flight check in `riviera-sdlc`
> `references/issue-intake-gate.md` (free on `main` AND unclaimed by open PRs; name
> who renumbers).

| #   | Description                                                                                                                                                                                                                                                                              | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner       | Resolution                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | The hatch darkens the walk-in tile under its own numeral and drops it below WCAG AA — the tile ink is a dark brown on a light sand, so _any_ dark overlay costs contrast                                                                                                                 | med        | high   | Prove the numeral composited over **both** bands (hatch stripe and gap) over **every** wash stop, not just the flat fill; the design's `rgba(95,77,42,0.16)` on a 0.6 fill computes to 5.05:1 worst case (`#cfeef6` stop), 6.37:1 on the gap band. A `0.3`-alpha hatch on the old 0.85 fill — the operator surfaces' value — computes to **3.46:1** and was rejected on that arithmetic                                                                                                                                                                         | this slice  | closed — phase 1: `venue-map.contrast.spec.ts › 'the walk-in numeral meets AA on both hatch bands over every wash stop (#701)'` proves 5.05:1 worst case                                                                           |
| R-2 | A reviewer reads the hatch as a WCAG 1.4.11 "graphical object required to understand content" and asks for 3:1 against the tile fill — the precedent exists (the ghost-taken dashed border is proven at 3:1, and the review gate rejected the softer "inactive component" reading there) | med        | med    | 3:1 _and_ an AA numeral are arithmetically incompatible on this tile (a 3:1 stripe needs ≈ 0.55 alpha, which puts the numeral at 2.1:1). So state the position in the contrast spec's header rather than leave it implicit: the walk-in state is carried by the tile's **accessible name** ("walk-in only — book at the venue") and by the absence of a button — the hatch is redundant reinforcement, the same exclusion the file already applies to the decorative tier borders (`#e6c483` / `#c8ab62`, neither of which reaches 3:1 either, on `main` today) | review gate | open                                                                                                                                                                                                                               |
| R-3 | The wash scroller's `-mt-3.5` (which today cancels the sea banner's `mb-3.5` so the wash sits flush under the banner) pulls **up over** the new legend band, clipping it                                                                                                                 | high       | med    | The band carries `-mt-3.5 mb-3.5`: its top margin cancels the banner's, its bottom margin cancels the wash's, so all three stay flush with no overlap and the no-legend case is byte-identical. Verified by measuring bounding boxes in the e2e (legend bottom ≤ wash top, legend height > 0)                                                                                                                                                                                                                                                                   | this slice  | closed — phase 3: the band carries `-mx-[18px] -mt-3.5 mb-3.5`, and the mobile e2e asserts `wash.y == legend.y + legend.height`                                                                                                    |
| R-4 | The `canvasLegend` slot is added to a component **three operator surfaces** render; an unprojected `<ng-content>` that still emits a box would shift every one of them                                                                                                                   | med        | high   | The slot is a bare `<ng-content select="[canvasLegend]">` — no wrapper element, so nothing is emitted when unprojected (all margins live on the projected `<ul>` itself). Pinned by AC-5's canvas spec plus the three untouched operator e2e specs                                                                                                                                                                                                                                                                                                              | this slice  | closed — phase 0: the slot is a bare `<ng-content>`; the legendless-host spec pins the wash as the banner's next sibling                                                                                                           |
| R-5 | `venue-map-pan.e2e.ts`'s #700 breakout test asserts `legend.width ≈ head.width` — true only while the legend is outside the card. Left alone it turns CI red _after_ the feature is correct                                                                                              | high       | med    | Found by the issue-intake grill before phase 0 and folded into AC-1/AC-2: the assertion is re-aimed at `legend.width ≈ card.width` in the same commit that moves the legend, keeping the test's real subject (only the map card breaks out)                                                                                                                                                                                                                                                                                                                     | this slice  | closed — phase 3: re-aimed to `legend.width ≈ banner.width` (the full-bleed reference in the same card) plus `> head.width`; the raw card width proved to be 2px wider, the `appCardGlass` 1px border a full-bleed child stops at  |
| R-6 | The hatch is a Tailwind arbitrary value carrying commas, parentheses and underscore-escaped spaces; a mis-parse silently emits no `background-image` and the tile just looks paler                                                                                                       | med        | med    | Follow the form already proven in this repo (`operator/beach-cell.ts`'s `bg-[repeating-linear-gradient(45deg,…_0_3px,…_3px_6px)]`), then verify by **computed style** in the e2e (AC-3) rather than by class list, and run `npm run build` before pushing                                                                                                                                                                                                                                                                                                       | this slice  | closed — phase 1: the emitted stylesheet carries `background-image:repeating-linear-gradient(135deg,rgba(95,77,42,.16) 0px,…)` **and** `background-color:color-mix(in oklab,#efe0bd 60%,transparent)` as two separate declarations |
| R-7 | Moving tile styling into a directive changes a computed value by accident (a dropped `hover:`, a re-ordered `border-*`) — the class list can look right while pixels drift                                                                                                               | med        | med    | `riviera-tailwind`'s hard rule: diff **computed styles**, not classes. The existing e2e already pins the ghost alpha and the dashed border; phase 3 adds the swatch-vs-tile computed-style equality (AC-4), which fails loudly on any drift                                                                                                                                                                                                                                                                                                                     | this slice  | closed — phase 3: `'every legend swatch renders exactly like the tile it stands for (#701)'` compares five computed properties per state; the pre-existing ghost-alpha and dashed-border pins still pass                           |

## Open questions / Assumptions

> **Mandatory. Work is NOT done while this has unresolved entries.**

- **Assumption:** the design canvas's **mobile** artboard shortens the walk-in legend
  label to "Walk-in only" purely to fit a 390 px artboard, not as a product requirement.
  We ship the full "Walk-in only — book at the venue" at every width and let it wrap:
  hiding the actionable half of the sentence (`hidden`/`sm:inline`) would also hide it
  from assistive tech, and mobile is exactly the audience that needs "book at the venue".
  — _Owner:_ this slice · _Resolves by:_ phase 2 (recorded as a deliberate deviation; the
  e2e's `toContainText('Walk-in only')` passes either way, so the assumption is cheap to
  revisit)

### Resolved

- **Open question (resolved at plan time):** where does the legend markup live — in the
  shared frame, the shared canvas, or the tourist page? → **the tourist page**, projected
  through a `canvasLegend` slot on `BeachMapCanvas`. #701 states the constraint ("the
  legend is tourist-only content, so it must arrive by projection/composition"); the slot
  sits on the canvas rather than `BeachGridFrame` because the canvas already owns the two
  existing projection slots and the frame is deliberately markup-free chrome.

## Availability & concurrency (invariant #2)

> **Mandatory if the feature touches `booking`, `availability`, or the beach map.**
> Otherwise write `N/A — does not affect availability` and say why. This is the
> highest-stakes section in the plan.

The slice touches the beach map, so this section is filled — but it is **display-only**:
no request, no state, no server contract changes.

- **Write paths to `availability(set_id, booking_date)`:** none. This slice adds no
  request and changes no service; the map remains a read of `GET /api/venues/{id}?date=`.
- **Uniqueness guarantee:** unchanged — `availability`'s unique `(set_id, booking_date)`
  constraint plus the reservation transaction's claim, both untouched and server-side.
- **Concurrency strategy:** unchanged; nothing in this slice runs on the write path.
- **Pool rule (invariant #3):** **strengthened, in presentation only.** A walk-in tile is
  still non-bookable in exactly the way it is today — `toTile` computes `bookable =
availability === 'FREE' && pool === 'ONLINE'`, so a walk-in tile renders no `<button>`
  and cannot open the booking dialog; the server remains authoritative. What changes is
  legibility: the hatch plus the legend-before-the-grid make "you cannot book this online"
  visible **before** a tourist taps, instead of after. Pinned by the untouched
  `venue-map.spec.ts › 'exposes a booking button only for free online sets'`.
- **Cutoff rule (invariant #4):** unchanged — the date picker's `min` and the cutoff
  explainer are not touched; the server still owns the real cutoff.
- **Pinning test:** N/A for a new concurrency test — no write path is in scope. The
  standing `ConcurrentReservationIT` and the availability ITs remain the guarantee and
  are unaffected by this diff (no backend file changes).

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` changes; no module, port or event is
added, moved or consumed.

### Module ownership (§4a)

`N/A — frontend-only`; no backend capability is added or moved, so there is nothing to
check against `RESPONSIBILITIES.md`. The frontend counterpart of the question — which
folder owns each new file — is answered in the File-structure section and by
`riviera-frontend`: the appearance directive is tourist-only → `venue/`; the projection
slot is shared chrome → `shared/`.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is displayed differently, collected, refunded or
accrued; the price rail and the booking dialog are untouched.

## Angular — frontend surfaces touched

> **Mandatory if frontend is in scope. Backend-only: `N/A — backend-only`.** Load
> `angular-developer`.

| #    | Surface                        | Existing/new | Type                                         | State/reactivity                                                                                   | Forms |
| ---- | ------------------------------ | ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----- |
| FE-1 | `venue/map-tile.ts`            | new          | attribute (variant) directive `[appMapTile]` | one required `input()` + one `computed()` for the class string; host bindings in the `host` object | none  |
| FE-2 | `venue/venue-map.html`         | existing     | template                                     | unchanged signals; the tile view model gains a precomputed `state` field                           | none  |
| FE-3 | `venue/venue-map.ts`           | existing     | standalone component                         | `toTile()` resolves `MapTileState` once per tile inside the existing `rows` `computed()`           | none  |
| FE-4 | `shared/beach-map-canvas.html` | existing     | template                                     | one added `<ng-content select="[canvasLegend]">`; no new state                                     | none  |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`
signal APIs, `NgOptimizedImage` for new images. Document any deviation. (Full
detail in the in-repo `angular-developer` skill's `references/`.)

Deviations: none. Specifically — no `@HostBinding`/`@HostListener` (host object only), no
explicit `ChangeDetectionStrategy.OnPush` (default in v22), no `ngClass`, and no new image.

## FE↔BE contract

`N/A — no contract change.` No endpoint, DTO or wire shape is added or altered; the map
consumes the same `VenueMapView` it does today.

## Execution status

> **This section is the session-recovery anchor.** Everything a resuming session needs
> lives HERE, committed — never only in the conversation. After a compaction, in a fresh
> session, or whenever unsure: re-read it (plus the current stage's `riviera-sdlc`
> reference file) before acting. Update it in the SAME commit window as the change it
> records — the same commit or the immediately-following one, nothing unrelated between;
> covers every plan-doc update incl. _Skills consulted_ — at every phase boundary and
> SDLC stage transition (why: `riviera-sdlc` §Context hygiene).
>
> **Finalize BEFORE the merge, in the PR's own last commit** — stage pointer DONE, phase
> rows ✅ with commits, Open Questions empty, risk rows closed, AC pin-names matching the
> shipped tests. Record **`merged via PR #NN`, never a merge SHA** — the SHA guarantees a
> second docs-only PR (case history + details: `riviera-sdlc` `references/pr-gates.md`
> §3 step 4).

**Stage pointer:** `sonar gate — CI + review gate cleared, all 14 findings resolved`

**Next action:** Pull the SonarCloud issue + duplication list for PR #716 (green is necessary,
not sufficient), then tick the PR's Gates boxes and merge.

| Phase                                                                        | Status | Commits     |
| ---------------------------------------------------------------------------- | ------ | ----------- |
| 0 — `canvasLegend` projection slot on the shared canvas                      | ✅     | `90acb83`   |
| 1 — `[appMapTile]` appearance directive + the walk-in hatch, contrast-proven | ✅     | `f24759f`   |
| 2 — tourist map recomposition: legend into the card, trailing card retired   | ✅     | `8b51995`   |
| 3 — e2e coverage (mocked suite) + the re-aimed #700 breakout assertion       | ✅     | `03004f3`   |
| review-gate fixes — 13 of 14 findings                                        | ✅     | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches _before_ editing).

| #    | Source (review / sonar / CI) | Finding                                                                                                                                                                                                                                               | Status                                                                                                                                                                                                                           |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1  | review                       | The legend band's `bg-white/55` plate puts the white-fill swatches (Available, Taken) on a near-white ground, where the tiles they stand for sit on the aqua→sand wash — so the two read differently even though their computed styles are identical. | **open** — a design call, not a defect: the plate is what the design canvas specifies. Put to the maintainer (keep the design, or move the band onto the wash's top stop `#cfeef6` so swatch and tile share a ground)            |
| F-2  | review                       | The mobile e2e scrolled the card into view before measuring, so its "within the first screen" assertion was near-trivially true.                                                                                                                      | fixed — it now asserts the legend **and** the first tile row are both on that screen; AC-2's wording is reconciled with the issue's own ("no scrolling _past the grid_")                                                         |
| F-3  | review                       | `.premium`/`.walkin`/`.taken` were bound from raw tier/pool/availability while `data-state` carried the resolved state, so `.set-tile.premium` and `[data-state="premium"]` selected different tiles.                                                 | fixed — all three markers bind from `tile.state`; `venue-map.spec.ts › 'spells one state two ways that can never select different tiles (#701)'` pins the agreement, and the front-row count spec now reads 4 premium + 2 ghosts |
| F-4  | review                       | The NO-DRIFT PIN was a subset check, so an added stray utility passed it.                                                                                                                                                                             | fixed — it compares the directive's full class set for equality                                                                                                                                                                  |
| F-5  | review                       | The state vocabulary was split across three files, and the walk-in sentence was duplicated between the accessible name and the legend label.                                                                                                          | fixed — `MAP_TILE_MEANING` colocates `legend` + `announced` beside `MAP_TILE_CLASS` (the `CELL_STATE_DESC` shape), with a spec pinning that the two agree                                                                        |
| F-6  | review                       | The bare slot pushed the canvas's own margin-cancellation contract onto every consumer.                                                                                                                                                               | fixed — the canvas owns the band's spacing in an `empty:hidden` wrapper, so an unprojected slot still generates no box; `layout-editor.e2e.ts` now measures banner-bottom == wash-top on a real operator surface                 |
| F-7  | review                       | Four copy-pasted legend `<li>` blocks.                                                                                                                                                                                                                | fixed — `@for` over `MAP_TILE_LEGEND`                                                                                                                                                                                            |
| F-8  | review                       | The Execution-status phase table said phases 1–3 were not started, and AC-6 pinned a legend assertion to a spec that has none.                                                                                                                        | fixed — this section; the table is now rebuilt by pattern rather than string-matched, which is how three prettier re-pads silently dropped the earlier updates                                                                   |
| F-9  | review                       | A zero-set venue now shows no legend at all — a behavior change missing from the mandatory parity ledger.                                                                                                                                             | fixed — ledger row added (the change is intended). The **empty tourist map card** it exposes is pre-existing and out of scope → follow-up issue                                                                                  |
| F-10 | review                       | The walk-in row in `TILE_SURFACES` re-asserted arithmetic the new hatch-band test already covers.                                                                                                                                                     | fixed — row dropped, with the reason in the file header                                                                                                                                                                          |
| F-11 | review                       | The pin constant reproduced the retired `bg-[#efe0bd]/85` literal, which Tailwind scans out of spec files and ships as a dead CSS rule.                                                                                                               | fixed — the pin names only walk-in's unchanged half; the departure is asserted from the shipped values                                                                                                                           |
| F-12 | review                       | The state list was hand-repeated with no exhaustiveness check.                                                                                                                                                                                        | fixed — `MapTileState` is derived from the exported `MAP_TILE_STATES` tuple the specs iterate; the e2e guards it with a swatch-count assertion                                                                                   |
| F-13 | review                       | The band's hairline shipped at 10% where the quoted design specifies 8%.                                                                                                                                                                              | fixed — `border-b-[#0c2a33]/8`                                                                                                                                                                                                   |
| F-14 | review                       | `TileView.walkInOnly` became pure derivable state.                                                                                                                                                                                                    | fixed — dropped; the template reads `tile.state`                                                                                                                                                                                 |

---

## File structure

> Map files to be created/modified before defining tasks.
>
> **Every path in the diff, including the one-line ones — and this is machine-checked.** Listing
> only the interesting files was a review finding on five consecutive slices (#438, #522, #524,
> #525, #526), and the paths that fall out are always the same shape: a registry entry, a
> comment-only freshness fix, a docs-sweep file. Since #533 CI fails the PR on any path the diff
> changed and this section does not list. Run it yourself before pushing — it is the check, not a
> reminder to do the check by hand:
>
> ```bash
> node scripts/check-plan-file-structure.mjs --diff origin/main
> ```
>
> Since #654 it judges untracked paths as well as the diff, so a file you have written but not
> staged is caught too. **Stage or commit this plan doc first** — `git add` is what marks it as part
> of the change, and with the doc merely written the guard short-circuits and passes whatever the
> section says. A file you never intend to commit belongs behind an ignore rule (`.git/info/exclude`
> for a personal scratch path, `.gitignore` repo-wide).
>
> The guard reads paths written any way real plans write them — repo-relative
> (`payout/application/DailyTakingsServiceTest.java`), sibling extensions
> (`` `privacy-policy.ts` `` then `` `.html` ``), brace sets, `a.ts|.html`, a bare directory, and
> globs (`frontend/src/app/**/*.contrast.spec.ts`) — so a large mechanical sweep is one honest
> entry rather than fifty. It never flags the reverse (a path you listed and did not need), and it
> exempts the plan doc itself and lockfiles. A slice with no plan doc is not checked at all.

- `docs/plans/beach-map-legend-in-card.md` — this plan; the session-recovery anchor.
- `frontend/src/app/shared/beach-map-canvas.html` — the `canvasLegend` slot, between the
  frame's sea banner and the wash scroller.
- `frontend/src/app/shared/beach-map-canvas.ts` — class doc: the third projection slot and
  why it is tourist-optional.
- `frontend/src/app/shared/beach-map-canvas.spec.ts` — AC-5: the slot projects above the
  wash, and renders nothing when unprojected.
- `frontend/src/app/venue/map-tile.ts` — new: `MapTileState`, the `MAP_TILE_CLASS`
  appearance record, and the `[appMapTile]` variant directive.
- `frontend/src/app/venue/map-tile.spec.ts` — new: AC-4's structural half — every state
  renders from the one record; `data-state` and the hatch reach the host.
- `frontend/src/app/venue/venue-map.ts` — `TileView` (renamed from the local `MapTile`
  interface to free the name) gains `state: MapTileState`; `toTile` resolves it; the
  component imports the directive.
- `frontend/src/app/venue/venue-map.html` — legend projected into `canvasLegend`, trailing
  legend card removed, tiles + swatches styled by `[appMapTile]`.
- `frontend/src/app/venue/venue-map.spec.ts` — AC-1 plus the tile-state resolution specs.
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — the walk-in fill alpha, the new
  hatch-band proofs (AC-3) and the legend-plate ink proof (AC-6), plus the 1.4.11 position
  from R-2 in the file header.
- `frontend/e2e/venue-map-pan.e2e.ts` — AC-2/AC-3/AC-4 and the re-aimed #700 breakout
  assertion (R-5).
- `frontend/e2e/layout-editor.e2e.ts` — AC-5's rendered half (review finding F-6): on a real
  operator surface, the sea banner and the wash still touch across the unprojected legend slot.

---

## Phase 0 — `canvasLegend` projection slot on the shared canvas

**Files:** Modify `frontend/src/app/shared/beach-map-canvas.html` ·
`frontend/src/app/shared/beach-map-canvas.ts` · Test
`frontend/src/app/shared/beach-map-canvas.spec.ts`

- [ ] **Step 1: Write the failing test** — mirror the existing footer-slot spec: with rows,
      a `<p canvasLegend>` projects **between** the sea banner and `[data-riv-scroller]`;
      with no `canvasLegend` host content, the wash scroller is the first element after the
      banner and the frame's child count is unchanged from `main`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- beach-map-canvas` → FAIL
      (`canvasLegend` content is not projected; it lands nowhere).
- [ ] **Step 3: Minimal implementation** — one line at the top of the `rows().length > 0`
      branch in `beach-map-canvas.html`:
      `<ng-content select="[canvasLegend]" />`, plus the class-doc sentence naming the
      third slot. **No wrapper element** (R-4): all spacing lives on the projected node.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- beach-map-canvas` → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Beach-map canvas: project a tourist-only legend slot above the grid (#701)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `[appMapTile]` appearance directive + the walk-in hatch

**Files:** Create `frontend/src/app/venue/map-tile.ts` ·
`frontend/src/app/venue/map-tile.spec.ts` · Modify
`frontend/src/app/venue/venue-map.contrast.spec.ts`

- [ ] **Step 1: Write the failing tests** — (a) `map-tile.spec.ts`: a host with each
      `MapTileState` carries that state's fill/border/ink classes and `data-state`, and the
      `walkin` state carries the `repeating-linear-gradient`; (b) `venue-map.contrast.spec.ts`:
      the walk-in numeral `#5f4d2a` clears AA composited over both hatch bands
      (`rgba(95,77,42,0.16)` stripe and the bare `#efe0bd`@0.6 fill) over every `WASH_STOPS`
      entry.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- map-tile venue-map.contrast` → FAIL
      (no `map-tile.ts`; the contrast table still carries the 0.85 flat fill).
- [ ] **Step 3: Minimal implementation** — `map-tile.ts` per the Architecture note; retune
      the contrast spec's `TILE_SURFACES` walk-in row to alpha 0.6 and add the hatch-band
      case + the R-2 paragraph in the file header.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- map-tile venue-map` → PASS
- [ ] **Step 5: Generalization-audit pass** — population: every place that hand-writes a
      beach-map tile/swatch appearance literal.
- [ ] **Step 6: Commit** — `git commit -m "Walk-in tiles get a diagonal hatch, from one shared tile-appearance record (#701)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — tourist map recomposition

**Files:** Modify `frontend/src/app/venue/venue-map.html` ·
`frontend/src/app/venue/venue-map.ts` · Test `frontend/src/app/venue/venue-map.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-1: the `Legend` list is inside
      `[data-testid="beach-grid"]`, precedes the first `[data-testid="set-tile"]` in
      document order, and is the only `Legend` list on the page; plus a spec that a taken
      walk-in tile resolves `state === 'taken'` and a free walk-in resolves `'walkin'`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- venue-map.spec` → FAIL (the legend
      is still the trailing card, outside the grid).
- [ ] **Step 3: Minimal implementation** — project the `<ul canvasLegend>` (full-bleed band,
      `-mt-3.5 mb-3.5` per R-3, white/55 plate, hairline bottom rule, swatches via
      `[appMapTile]`), delete the trailing legend card, and swap the tile's `[&.state]:`
      variants for `[appMapTile]` while keeping every `[class.*]` marker binding.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map` → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Beach map: the legend leads the map card; the trailing legend card retires (#701)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — e2e coverage + the re-aimed #700 breakout assertion

**Files:** Modify `frontend/e2e/venue-map-pan.e2e.ts`

- [ ] **Step 1: Write the failing tests** — AC-2 (mobile viewport: legend above the first
      tile row and within the first screen), AC-3 (walk-in tile hatched, premium tile not),
      AC-4 (each swatch's computed fill/border/hatch equals its tile's), and the re-aimed
      `legend.width ≈ card.width` in the #700 test.
- [ ] **Step 2: Run it, verify it fails** — `npx playwright test venue-map-pan` → FAIL on
      the new assertions before phases 0–2 land (and, on `main`, on the re-aimed one).
- [ ] **Step 3: Minimal implementation** — none expected beyond phases 0–2; any gap the e2e
      exposes is fixed here and re-enters at Implement.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y -- venue-map-pan` → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Pin the legend-in-card and hatched walk-in tiles as rendered (#701)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date       | Trigger (commit/phase)                    | Population (mechanism + how enumerated)                                                                                                                                                                                  | Search command                                                                                  | Sites found                                                                                                                    | Action                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 | phase 2 — the recomposed tourist map      | Every **`aria-label="Legend"` list in the app** — the mechanism the AC-1 "only one legend" assertion depends on, enumerated across templates rather than from the tourist page alone                                     | `grep -rn 'aria-label="Legend"' frontend/src`                                                   | 3: `venue/venue-map.html` (moved into the card), `operator/layout-editor.html`, `operator/daily-view-tab.html`                 | Only the tourist one moves. The two operator lists keep their own labels and positions (Non-goals); AC-1's "exactly one" assertion is scoped to the tourist map's own fixture, so the operator lists cannot make it flaky                                                                                                                                                                |
| 2026-08-20 | phase 1 — the extracted appearance record | Every file that **hand-writes one of the tourist tile's colour literals** (not "every legend" — that framing would have missed the contrast spec's own mirror table, which is exactly the copy that goes stale silently) | `grep -rln -E '#bfe3df\|#e6c483\|#c8ab62\|#6b7d77\|#fbf1d9\|#efe0bd' frontend/src frontend/e2e` | 4: `venue/map-tile.ts`, `venue/map-tile.spec.ts`, `venue/venue-map.contrast.spec.ts`, `venue/venue-map.html`                   | The record is now the single styling source (`map-tile.ts`); `venue-map.html`'s copies go in phase 2. The two spec files keep theirs **deliberately** — they are independent mirrors, which is what makes them able to catch a drift rather than follow it. The operator tiles share no literal with these (their palette is separate), so nothing outside `venue/` is in the population |
| 2026-08-20 | phase 0 — the `canvasLegend` slot         | Every surface that **renders `<app-beach-map-canvas>`** (not "every surface with a legend" — the resemblance framing would have missed `set-editor.html`, which renders the canvas and has no legend at all)             | `grep -rln 'app-beach-map-canvas' frontend/src --include='*.html' --include='*.ts'`             | 4 consumers: `venue/venue-map.html`, `operator/daily-view-tab.html`, `operator/layout-editor.html`, `operator/set-editor.html` | Only the tourist map projects the slot. The two operator legends stay **outside** their canvas (Non-goals: unifying them is a separate slice) and `set-editor` has none; all three are pinned unchanged by AC-5's legendless-host spec                                                                                                                                                   |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1:** Run `npm test -- venue-map.spec` → the legend-inside-the-card spec passes.
- [ ] **AC-2:** Run `npm run test:e2e:a11y -- venue-map-pan` → the mobile legend-order test passes.
- [ ] **AC-3:** Run `npm run test:e2e:a11y -- venue-map-pan` **and** `npm test -- venue-map.contrast` → hatch present on walk-in only; numeral AA on both bands.
- [ ] **AC-4:** Run `npm run test:e2e:a11y -- venue-map-pan` **and** `npm test -- map-tile` → swatch/tile computed styles equal.
- [ ] **AC-5:** Run `npm test -- beach-map-canvas` **and** `npm run test:e2e:a11y -- layout-editor operator-daily operator-set-editing` → no legend band without projection; operator suites green.
- [ ] **AC-6:** Run `npm run test:a11y` **and** the e2e axe run → no serious/critical violations; `Legend` accessible name intact.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 _plus_ `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.
