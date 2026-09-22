# Shoreline Snap in the Operator's Pin Placer Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** When an operator drops or drags the venue pin off the shoreline, the placer offers a
snapped point and says how far it would move; accepting stores the snapped coordinates, declining
stores the operator's own, and a pin already on the shore is left alone.

**Architecture:** The snap is a **pure function over a sampled raster** (`operator/shore-snap.ts`),
the seam `layoutPills` established in `pages/home/pin-crowding.ts` — the rule never touches the DOM
and is driven in specs by a stub sampler. The raster is the **live map's own rendered imagery**,
read back through one new method on the `MapHandle` seam (`readImagery`), so the sample is exactly
what the operator is looking at; `FakeMapHandle` answers the same method with a synthesised coast,
so jsdom and the mocked e2e drive the whole path with no WebGL.

**Persistence:** JDBC only (invariant #1). **No tables, no migration** — the slice is frontend-only
and writes through the existing venue-profile PATCH unchanged.

**Source of intent:** GitHub issue #1170 (follow-up named out of scope by #1156, fault 2 of the
map-design prototype's honest faults list; technique from PR #1155's README @ `2cf675da`, round 7).

**Skills consulted:** `angular-developer` + angular-cli MCP (verified `@if (…; as …)`, the `[class]`
string form, `afterNextRender`'s earlyRead→write order and `model()`'s `.set()` propagation against
angular.dev for v22) · `riviera-sdlc` (intake gate: the issue's "all three themes" reconciled to the
two the console wears — see OQ-1; no sibling close-out outstanding; no in-flight PR touches
`map-engine.ts`, `riviera-map.ts` or `venue-location-field.ts`) · `riviera-plan-doc` (forced the
route decision D-1 into the doc rather than the code, and the behaviour-parity ledger for the
placer's existing drop path) · `tdd` (rule-before-seam-before-UI, red then green per phase) ·
`riviera-review-overlay` (at ready-for-review) · `riviera-docs-freshness` (at close-out) ·
`riviera-local-debug` (unshallowed the clone to recover the prototype README; scoped Vitest runs) ·
`riviera-frontend` (the rule sits beside its consumer in `operator/`, not `shared/`, following
`layoutPills`; `distanceKm` promoted to `shared/` rather than imported across features) ·
`riviera-tailwind` (the proposal reuses the field's existing pill skin and the
`card-ink`-on-`console-inset` pair — no new token) · `angular-developer` + angular-cli MCP (signal
and focus APIs) · `playwright-cli` (the two mocked e2e legs and the touch-target sweep).

**Branch:** `claude/sdlc-1170-x972gb` (the cloud session's designated branch, standing in for
`feature/shoreline-snap`) — exists before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a sampler whose water lies west of a vertical shoreline and a pin 60 px
      inland of it, when the rule runs, then it returns a point 4 px inland of the nearest shore
      pixel — not the shore pixel itself. *Seam:* `snapToShore(at, isWater, frame)` ·
      *Pinned by:* `shore-snap.spec.ts` › "proposes a point four px onto the sand"
- [ ] **AC-2:** Given the same sampler and a pin already within the shore band of the water, when
      the rule runs, then it returns `null` — nothing is proposed. *Seam:* `snapToShore` ·
      *Pinned by:* `shore-snap.spec.ts` › "proposes nothing for a pin already on the shore"
- [ ] **AC-3:** Given a pin **in the water**, when the rule runs, then the returned point is on
      land, 4 px inland of the nearest land pixel — never the nearest water edge. *Seam:*
      `snapToShore` · *Pinned by:* `shore-snap.spec.ts` › "takes a pin at sea to the land"
- [ ] **AC-4:** Given a sampler that reports land everywhere (a frame holding no water at all, as
      Palasë's and Borsh's did), when the rule runs, then it returns `null` rather than a wrong
      point. *Seam:* `snapToShore` · *Pinned by:* `shore-snap.spec.ts` › "degrades honestly on a
      frame with no water"
- [ ] **AC-5:** Given an RGBA raster carrying the style's water fill, when `waterSamplerOf` reads a
      point, then interior water pixels answer `true`, land answers `false` and a point off the
      frame answers `undefined`; and the fill the sampler matches is the one
      `platform/map/style.json`'s `water` layer declares. *Seam:* `waterSamplerOf(imagery)` ·
      *Pinned by:* `shore-snap.spec.ts` › "reads the style's own water fill" + "matches the water
      fill the style declares"
- [ ] **AC-6:** Given a booted `FakeMapHandle` with a coast meridian, when a consumer calls
      `readImagery()`, then it gets an RGBA raster painted water west of that meridian and land
      east of it, and `unproject` inverts `project` for every point on it. *Seam:* `MapHandle` ·
      *Pinned by:* `fake-map-engine.spec.ts` › "paints a coast its consumers can sample"
- [ ] **AC-7:** Given a pin dropped 60 px inland on the placer's map, when the drop is handled,
      then `location` holds the operator's own rounded point, a proposal is rendered naming the
      distance in metres or km, and pressing *Move to shoreline* sets `location` to the snapped
      point at six decimals. *Seam:* `VenueLocationField.location` (the `model()` the profile form
      binds) · *Pinned by:* `venue-location-field.spec.ts` › "offers the shoreline and stores it
      when accepted"
- [ ] **AC-8:** Given the same proposal, when *Keep my point* is pressed, then `location` still
      holds the operator's own point, the proposal is gone, and focus has moved to a control that
      survived the transition — never `<body>`. *Seam:* `VenueLocationField.location` + the
      rendered field · *Pinned by:* `venue-location-field.spec.ts` › "keeps the operator's point
      and never strands focus"
- [ ] **AC-9:** Given a pin dropped on the shore, when the drop is handled, then no proposal is
      rendered. *Seam:* the rendered field · *Pinned by:* `venue-location-field.spec.ts` › "says
      nothing about a pin already on the shore"
- [ ] **AC-10:** Given neither control is ever `disabled` and the drop was made with *Place pin at
      map centre*, when a keyboard user tabs on, then both proposal controls are reachable and
      carry the 44 px floor. *Seam:* the rendered field · *Pinned by:*
      `venue-location-field.spec.ts` › "every proposal control is a real button at the floor" +
      `e2e/touch-targets.e2e.ts` › "operator console — venue tab, the shoreline proposal open"
- [ ] **AC-11:** Given the mocked operator console with a fake coast armed, when the operator drops
      a pin inland and accepts, then the saved profile carries the snapped coordinates; when a
      second operator declines, then it carries their own. *Seam:* the venue-profile PATCH body ·
      *Pinned by:* `e2e/operator-venue-location.e2e.ts` › "proposes the shoreline and saves the
      snapped point" + "…and saves the operator's own when declined"
- [ ] **AC-12:** Given the field with the proposal open, when axe audits it, then there are no
      violations; and the proposal's ink/fill pair clears AA in both themes the console wears.
      *Seam:* the rendered field · *Pinned by:* `venue-location-field.a11y.spec.ts` +
      `venue-tab.contrast.spec.ts` › the shoreline-proposal cases

## Non-goals

- **Showing the proposed point as a second pin on the map.** The map's seam carries exactly one
  pin; the operator's own point stays under it while the proposal is open, and the proposal states
  the move in words and coordinates. A second marker is a seam change this slice does not need.
- **Snapping anything but the operator's placer.** Discover's venue pins are what the venue stored;
  no sweep, no backfill of existing venues.
- **A server-side shoreline.** No endpoint, no table, no `venue` module change (see D-1).
- **Typing coordinates.** Still not offered (the field's standing WCAG 2.1.1 posture).

## Behavior-parity ledger

> The slice extends the placer's drop path rather than replacing it; the existing behaviours it
> passes through are listed because a drop now does two things instead of one.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| A tap on the map stores the tapped point at six decimals | preserved | `place()` still stores the operator's point first and unchanged; the proposal is offered after, never instead |
| A pin drag stores the dropped point | preserved | Same path — `pinMoved` and `mapClick` both run `place()` |
| *Place pin at map centre* stores the camera centre | preserved | Unchanged; it now also runs the snap, so the keyboard drop gets the same offer as a tap |
| *Clear pin* unpins and is never `disabled` | preserved | Unchanged; clearing also drops any open proposal, since it is about a pin that no longer exists |
| The readout names latitude/longitude at six decimals | preserved | Unchanged; the proposal is a separate block below it |
| Nothing ever moved the operator's point | changed | Only on an explicit press of *Move to shoreline*; a silent relocation is still never done |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `preserveDrawingBuffer` costs memory and a compositing step on every MapLibre map, and Discover's map is now the page | High if global | Medium | It is **opt-in per map**: `MapEngineOptions.readableImagery`, set only by the placer's own `PLACER_MAP_OPTIONS`. Discover and the venue map are untouched; a spec asserts the flag is off by default | this slice | open |
| R-2 | The canvas is read before the tiles at the current camera have drawn, so the frame reads as "no water" | Medium | Low | The honest-degradation arm (AC-4) already covers it: nothing is proposed, nothing wrong is proposed. The read happens on a drop, when the operator is already looking at drawn tiles | this slice | open |
| R-3 | A river or a lake reads as water, so a pin inland snaps to a riverbank | Low | Low | Accepted and stated: the snap is an **offer**, the operator's own point is one press away, and the style's rivers are drawn in the same fill because they are water. Noted in the component's TSDoc | this slice | open |
| R-4 | The hard-coded water fill drifts from `platform/map/style.json` after a style change | Medium | High (silent no-op: nothing would ever be proposed) | A no-drift spec reads the style file and asserts the constant is the `water` layer's `fill-color` (AC-5), the `core/theme-boot.spec.ts` pattern | this slice | open |
| R-5 | At the map's opening zoom (8.6, ~154 m/px) the shore band swallows almost every coastal pin, so the feature looks dead | Medium | Low | Deliberate and stated: the rule works in screen px, so its precision tracks the camera the operator chose — at a zoom too coarse to be precise, nothing is proposed rather than something imprecise. The placer's map opens at the riviera and the operator zooms to place | this slice | open |
| R-6 | Antialiased shoreline pixels match neither water nor the land beside it, biasing the shore pixel outward | Medium | Low | The match is a per-channel tolerance around the flat fill, so a blended edge pixel reads as land; the 4 px step then lands clear of the blend. The step and the band are named constants with the reason at each | this slice | open |
| R-7 | Scope creep into the `venue` module (a server-side ownership check for an endpoint that does not exist) | Low | Medium | The slice is frontend-only and says so (AC list, Modulith section); if an endpoint is ever added, invariant #13 applies then | this slice | open |
| R-8 | `distanceKm` promoted out of `pages/home/place-groups.ts` breaks Discover's distance captions | Low | Medium | Pure move, no signature change; `place-groups.spec.ts`'s own case moves with it and Discover's caption specs stay green | this slice | closed — 3606 unit specs and 729 e2e green |
| R-9 | A `WaterSampler` that never reports its own frame edge searches to the guard radius, hanging the UI on a drop | Medium | Medium | The contract is stated on the type; every stub in the tree is frame-bounded (generalization-audit log, 2026-09-22); the production sampler bounds by construction | this slice | closed — see the audit log |

## Open questions / Assumptions

- **OQ-1 (drift, reconciled here):** The issue asks for specs "in all three themes". The placer
  lives in the operator console, and every operator route wears the console theme — porcelain or
  dark, **never `riviera`** (`riviera-frontend` § Theming; `operator/console-accent-token.contrast.spec.ts`
  calls a `riviera` declaration for a console token "a third theme the console never wears"). The
  honest coverage is therefore the two themes the console wears, over
  `venue-tab.contrast.spec.ts`'s existing `describe.each(CONSOLE_THEMES)`. — *Owner:* this slice ·
  *Resolves by:* stated in the PR body so the AC's wording and the shipped coverage do not read as
  a gap.
- **Assumption:** The proposal needs no new colour token — it wears the field's existing pill skin
  and the `--riv-card-ink` / `--riv-console-inset` pair `venue-tab.contrast.spec.ts` already proves
  AA in both console themes. — *Owner:* this slice · *Resolves by:* the contrast cases added in
  phase 3; a new token would need its own registry row and guard.
- **Assumption:** The operator's own point is stored on every drop, before any proposal, so an
  operator who ignores the offer and saves gets exactly what they placed. — *Owner:* this slice ·
  *Resolves by:* AC-7/AC-8.

### Resolved

- **D-1 — the sample's source: the live canvas, not a re-render of the extract.** The issue leaves
  this to the slice. **Chosen: the live map's rendered canvas**, through `MapHandle.readImagery()`.
  *Why:* the offer is about the pin the operator is looking at, so the raster should be the picture
  they are looking at — the extract route's own stated advantage, reproducibility off a fixture
  raster, is already delivered by making the **rule** pure over a stub sampler (AC-1…AC-4), which
  the issue requires anyway. The extract route would need either a second offscreen MapLibre
  instance (same WebGL readback, twice the cost) or a new server-side render endpoint (a backend
  slice, invariant #13, for no accuracy gained). ADR-0022 holds either way: the canvas is drawn
  from the same first-party `/map/**` style and pmtiles, no third-party host. *Resolved at plan
  time; recorded here because the issue asks the plan to record it.*
- **D-2 — where the rule lives:** `operator/shore-snap.ts`, beside its consumer, exactly as
  `layoutPills` lives in `pages/home/pin-crowding.ts` beside `venue-pin-layer.ts` — the seam #1159
  established and the issue names. `shared/` is for what two features need; one does.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The slice touches no `booking`, no `availability` and no
beach map: the venue's map **pin** is `venue`-owned profile data (`venue.location`), and this slice
only changes how the operator's browser proposes a value for it before the existing profile PATCH.
No `(set, date)` row is read or written.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No Java changes, no new or changed endpoint, no DTO. The snapped point rides
the existing `PATCH /api/venues/{id}` profile write, whose ownership check (invariant #13, RV-BE-9)
already stands in `venue`'s application service and is untouched. The stored scale stays
`NUMERIC(_,6)` because the placer rounds to six decimals before it stores — the rule the field
already applies, now applied to the snapped point too.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.`

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/shore-snap.ts` | new | pure module (rule + raster sampler + move label) | none — plain functions | — |
| FE-2 | `operator/venue-location-field.ts` | existing | component | `model()` for the location; a `signal<ShoreProposal \| null>` for the offer; `focusMover()` on accept/decline | the profile form binds `location` |
| FE-3 | `shared/map-engine.ts` | existing | seam | `MapImagery` + `readImagery()` + `unproject()` on `MapHandle`; `readableImagery?` on `MapEngineOptions` | — |
| FE-4 | `shared/maplibre-map-engine.ts` | existing | adapter | reads the WebGL canvas through a 2D scratch canvas; `preserveDrawingBuffer` only when asked | — |
| FE-5 | `shared/fake-map-engine.ts` | existing | fake | synthesises a coast raster from a meridian, so specs and the mocked e2e need no WebGL | — |
| FE-6 | `shared/geo-distance.ts` | new | pure module | `distanceKm`, promoted from `pages/home/place-groups.ts` | — |
| FE-7 | `operator/venue-location-field.a11y.spec.ts` | new | spec | axe over the field, proposal open and closed | — |

## FE↔BE contract

`N/A — no contract change.` The profile PATCH body is unchanged; only the value of `location` may
differ, at the same six-decimal scale it already carried.

## Execution status

**Stage pointer:** `review gate — findings fixed, re-verifying`

**Next action:** Push F-1…F-6, re-run CI, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The snap rule and the raster sampler | ✅ | phase-0 commit |
| 1 — The imagery seam on `MapHandle` (real + fake) | ✅ | phase-1 commit |
| 2 — The placer offers, accepts and declines | ✅ | phase-2 commit |
| 3 — a11y, contrast, touch targets and the two e2e legs | ✅ | phase-3 commit |
| 4 — Close-out (docs freshness, execution status) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | Review gate (CLAUDE.md/convention agent) | **Blocker, RV-FE-8:** `shared/fake-map-engine.ts` imported `WATER_FILL` from `../operator/shore-snap` — the only `shared/` → feature edges in the tree, both mine. `shared/` may import nothing app-internal. | fixed — `WATER_FILL`, `WaterSampler` and `waterSamplerOf` moved to `shared/map-water.ts`; `snapToShore`/`shoreMoveLabel` stay in `operator/`. Re-checked: `grep -rnE "from '\.\./(operator\|booking\|venue\|auth\|admin\|pages)/" frontend/src/app/shared/` is empty. |
| F-2 | Review gate (past-PR agent) | **RV-FE-10:** the offer's `<output aria-live>` mounted inside the `@if` holding its sentence, so a screen reader has no mutation to announce. The lesson of PR #1160; MDN says the same ("the most reliable way … is to include them in the initial markup"). | fixed — a persistent `sr-only` `<output>` outside the `@if`, the shown copy `aria-hidden`; spec asserts element identity across the transition, not text presence. |
| F-3 | Review gate (comment-guidance agent) | `snapToShore`'s TSDoc claimed "a pin in the water is never one of them [the null cases]" — the spec's own all-sea case disproves it — and called four cases exhaustive when the stepped-point check is a fifth. | fixed — the doc now states the null cases as they are, and says the shore band alone is land-only. |
| F-4 | Review gate (comment-guidance agent) | `FakeMapHandle.readImagery()` ignored `MapEngineOptions.readableImagery`, so a consumer forgetting the flag passed every spec and would go blank against real MapLibre. The fake claimed parity it did not have. | fixed — the fake now gates on the flag as well as its coast, with a spec for it; the specs that read imagery ask for it explicitly. |
| F-5 | Review gate (bug-scan agent) | `shoreMoveLabel(0.9996)` read "1000 m" instead of "1.0 km" — the metres branch rounded up past its own boundary. | fixed — the branch is chosen on the rounded metres, with a case at the boundary. |
| F-6 | Angular/Tailwind doc check (user-requested) | No render proof that `bg-riv-console-inset/60` resolves: Tailwind's docs do not state that the slash modifier applies to a custom `@theme` colour, and riviera-tailwind's hard rule wants a `getComputedStyle` diff, not a class list. | fixed — the themed e2e leg now measures the offer panel's fill with `expectInsetFill(…, 60, theme)` in both console themes. |

---

## File structure

- `docs/plans/shoreline-snap.md` — this plan
- `frontend/src/app/operator/shore-snap.ts` — the pure shoreline rule and the move label
- `frontend/src/app/operator/shore-snap.spec.ts` — the rule against a stub sampler, and the label
- `frontend/src/app/shared/map-water.ts` — the water fill, the `WaterSampler` type and `waterSamplerOf`
- `frontend/src/app/shared/map-water.spec.ts` — the sampler against a hand-built raster; the style no-drift proof
- `frontend/src/app/operator/venue-location-field.ts` — the proposal: offer, accept, decline, focus
- `frontend/src/app/operator/venue-location-field.spec.ts` — the placer's new behaviour
- `frontend/src/app/operator/venue-location-field.a11y.spec.ts` — axe over the field, proposal open and closed
- `frontend/src/app/operator/venue-tab.contrast.spec.ts` — the proposal's pair in both console themes
- `frontend/src/app/shared/map-engine.ts` — `MapImagery`, `readImagery()`, `unproject()`, `readableImagery`
- `frontend/src/app/shared/maplibre-map-engine.ts` — the canvas read-back adapter
- `frontend/src/app/shared/maplibre-map-engine.spec.ts` — the read-back and the opt-in flag
- `frontend/src/app/shared/fake-map-engine.ts` — the synthesised coast and its read-back
- `frontend/src/app/shared/fake-map-engine.spec.ts` — the coast raster and `unproject`
- `frontend/src/app/shared/poster-handle.ts` — answers the two new seam methods (a still owns no pixels)
- `frontend/src/app/app.config.ts` — hands the fake the coast an e2e arms
- `frontend/src/app/app.config.spec.ts` — the coast flag reaches the fake
- `frontend/src/app/shared/geo-distance.ts` — `distanceKm`, promoted so two features may use it
- `frontend/src/app/shared/geo-distance.spec.ts` — its case, moved from `place-groups.spec.ts`
- `frontend/src/app/pages/home/place-groups.ts` — imports `distanceKm` instead of declaring it
- `frontend/src/app/pages/home/place-groups.spec.ts` — its `distanceKm` case moves out
- `frontend/e2e/operator-venue-location.e2e.ts` — propose → accept and propose → decline
- `frontend/e2e/touch-targets.e2e.ts` — the venue tab swept with the proposal open
- `frontend/e2e/support/map-resources.ts` — read by the real-engine leg (unchanged, listed for the guard)

---

## Phase 0 — The snap rule and the raster sampler

**Files:** Create `frontend/src/app/operator/shore-snap.ts` · Test `frontend/src/app/operator/shore-snap.spec.ts`

- [ ] **Step 1: Write the failing test** — the four rule cases (AC-1…AC-4), the sampler (AC-5) and the no-drift proof.

```ts
/** Water west of x = 100, land east of it; the frame is 300 × 200. */
const COAST: WaterSampler = (point) =>
  point.x < 0 || point.y < 0 || point.x >= 300 || point.y >= 200 ? undefined : point.x < 100;

it('proposes a point four px onto the sand', () => {
  expect(snapToShore({ x: 160, y: 50 }, COAST)).toEqual({ x: 103, y: 50 });
});

it('proposes nothing for a pin already on the shore', () => {
  expect(snapToShore({ x: 104, y: 50 }, COAST)).toBeNull();
});

it('takes a pin at sea to the land', () => {
  expect(snapToShore({ x: 40, y: 50 }, COAST)).toEqual({ x: 104, y: 50 });
});

it('degrades honestly on a frame with no water', () => {
  expect(snapToShore({ x: 160, y: 50 }, () => false)).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd frontend && npx vitest run src/app/operator/shore-snap.spec.ts` → FAIL, `snapToShore` is not exported.
- [ ] **Step 3: Minimal implementation** — expanding Chebyshev rings from the pin, stopping one ring past the first hit so the nearest is Euclidean; then `STEP_PX` inland along the pin→shore axis.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — append to the log if a fix lands here.
- [ ] **Step 6: Commit** — `git commit -m "Snap rule: the nearest shore, four px onto the sand (#1170)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 1 — The imagery seam on `MapHandle`

**Files:** Modify `frontend/src/app/shared/map-engine.ts` · `maplibre-map-engine.ts` · `fake-map-engine.ts` · Test `maplibre-map-engine.spec.ts` · `fake-map-engine.spec.ts`

- [ ] **Step 1: Write the failing test** — the fake paints a coast and inverts its own projection (AC-6); the real adapter asks for `preserveDrawingBuffer` only when `readableImagery` is set (R-1).

```ts
it('paints a coast its consumers can sample', () => {
  const handle = new FakeMapHandle({ ...RIVIERA_MAP_OPTIONS, coastLng: 19.75 }, surface);
  const imagery = handle.readImagery();

  expect(imagery).not.toBeNull();
  expect(isWaterAt(imagery!, handle.project({ lng: 19.7, lat: 40.05 }))).toBe(true);
  expect(isWaterAt(imagery!, handle.project({ lng: 19.8, lat: 40.05 }))).toBe(false);
});

it('keeps the drawing buffer only for a map that is read back', async () => {
  await engine.create(host, { ...RIVIERA_MAP_OPTIONS, readableImagery: true });
  expect(lastMapOptions().preserveDrawingBuffer).toBe(true);

  await engine.create(host, RIVIERA_MAP_OPTIONS);
  expect(lastMapOptions().preserveDrawingBuffer).toBeFalsy();
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/fake-map-engine.spec.ts src/app/shared/maplibre-map-engine.spec.ts` → FAIL, `readImagery` is not on the handle.
- [ ] **Step 3: Minimal implementation** — `MapImagery` + `readImagery()` + `unproject()` on the seam; MapLibre draws its canvas into a 2D scratch canvas and reads it back; the fake unprojects each pixel and paints the water fill west of `coastLng`.
- [ ] **Step 4: Run it, verify it passes** — same command, then `npx vitest run src/app/shared` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Map seam: read back the rendered imagery, and unproject (#1170)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 2 — The placer offers, accepts and declines

**Files:** Modify `frontend/src/app/operator/venue-location-field.ts` · Create `frontend/src/app/shared/geo-distance.ts` + spec · Modify `pages/home/place-groups.ts` + spec · Test `venue-location-field.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-7, AC-8, AC-9, AC-10 against the fake coast.

```ts
it('offers the shoreline and stores it when accepted', async () => {
  const fixture = await renderOnACoast();
  mapHandle(fixture).clickAt({ lng: 19.8, lat: 40.05 }); // 60 px inland
  await settle(fixture);

  expect(byTestId(fixture, 'venue-location-proposal')?.textContent).toMatch(/\d/);
  byTestId(fixture, 'venue-location-snap-accept')!.click();
  await settle(fixture);

  expect(fixture.componentInstance.location()).toEqual({ latitude: 40.05, longitude: 19.749972 });
  expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/operator/venue-location-field.spec.ts` → FAIL, no proposal is rendered.
- [ ] **Step 3: Minimal implementation** — `place()` stores the operator's point, then samples and offers; `acceptSnap()`/`keepOwnPoint()` clear the offer and move focus to *Place pin at map centre*; `PLACER_MAP_OPTIONS` turns on `readableImagery`.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/operator src/app/pages/home` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "The placer offers the shoreline, never takes it (#1170)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 3 — a11y, contrast, touch targets and the two e2e legs

**Files:** Create `venue-location-field.a11y.spec.ts` · Modify `venue-tab.contrast.spec.ts` · `e2e/operator-venue-location.e2e.ts` · `e2e/touch-targets.e2e.ts`

- [ ] **Step 1: Write the failing test** — AC-11 and AC-12.

```ts
test('proposes the shoreline and saves the snapped point', async ({ page }) => {
  const { patches } = await mockVenue(page, null, { coastLng: 19.75 });
  await openVenueTab(page);
  await dropPinInland(page);

  await expect(page.getByTestId('venue-location-proposal')).toBeVisible();
  await page.getByTestId('venue-location-snap-accept').click();
  await page.getByTestId('venue-save').click();

  expect(patchedLocation(patches)).toEqual({ latitude: 40.05, longitude: 19.749972 });
});
```

- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts operator-venue-location` → FAIL, no proposal.
- [ ] **Step 3: Minimal implementation** — arm the fake coast from the e2e (`window.__RIVIERA_FAKE_MAP_COAST__`), add the two legs, the axe spec and the two contrast cases, and the touch-target sweep with the proposal open.
- [ ] **Step 4: Run it, verify it passes** — the Playwright command above, plus `npx vitest run src/app/operator`, then `npm run lint && npm run format:check`.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Prove the shoreline offer: axe, contrast, touch targets, two e2e legs (#1170)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 4 — Close-out

- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` reconciles this plan with the diff.
- [ ] `riviera-docs-freshness` over the branch range; `RESPONSIBILITIES.md` / ADR updated if anything durable moved.
- [ ] Execution status finalized in this PR's last code-touching commit, citing `merged via PR #NN`.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-22 | `shore-snap.spec.ts` › "degrades honestly on a frame holding no water" passed alone and timed out in the full run (6.1 s for the file) | A `WaterSampler` that never answers `undefined` breaks the type's contract, so the ring search runs to `MAX_SEARCH_PX` (≈67 M samples) instead of stopping at the frame. Every sampler in the tree, stub and real. | `grep -rn "WaterSampler\|snapToShore(" frontend/src --include=*.ts` | 6: `COAST`, the two bare `() => false` / `() => true` literals, `inlet`, `waterSamplerOf`, the placer's call | The two bare literals became frame-bounded `ALL_LAND` / `ALL_SEA`, `COAST` and `inlet` now share one `inFrame` helper; `waterSamplerOf` already bounded. The contract is now stated on `WaterSampler` itself, and `MAX_SEARCH_PX` re-described as the last-resort stop for a sampler that breaks it. File: 6.13 s → 0.03 s. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-5:** Run `cd frontend && npx vitest run src/app/operator/shore-snap.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `npx vitest run src/app/shared/fake-map-engine.spec.ts src/app/shared/maplibre-map-engine.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7…AC-10:** Run `npx vitest run src/app/operator/venue-location-field.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-11:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts operator-venue-location` → PASS. Verified at commit `<sha>`.
- [ ] **AC-12:** Run `npx vitest run src/app/operator/venue-location-field.a11y.spec.ts src/app/operator/venue-tab.contrast.spec.ts` → PASS. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A.
- [ ] Money/cutoff/pool/codes untouched (#3, #4, #5, #7) — no backend in the diff.
- [ ] Modulith section justified N/A — frontend-only; #13 unaffected because no endpoint changes.
- [ ] Payment section N/A; no money moves.
- [ ] No Flyway migration needed (#12) — no schema change.
- [ ] Frontend standards met: no `as any`, no `disabled` on a pressed control, 44 px declared, focus moved on every destroy-the-focused-element transition.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
