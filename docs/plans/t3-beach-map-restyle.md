# T3 — Beach Map Restyle (Liquid Glass) Implementation Plan

> Implement with `implement` + `tdd`. Checkbox steps track progress. Riviera
> discipline (Availability, Modulith, Payment sections) is first-class below.

**Goal:** Restyle `venue/venue-map.*` to the Liquid Glass v3 design — glass header
(with venue **description**), row-major pannable tile map with a derived `A/B/…/AA`
row-code column + per-row price column, tile states, legend, orientation banners —
plus the v3 gap-fill (**cutoff explainer + non-today date picker**, **map
load-failure panel with Retry**), changing **no** booking/availability behaviour
(display parity only; invariants #2/#3/#4 stay server-enforced).

**Architecture:** Pure Angular presentation change on the existing `VenueMap`
standalone component; the single significant decision is that **every text-bearing
region sits on an AA-proven glass surface** (the T1/T2 deviation — white ink on the
bare gradient's light stops fails WCAG AA), and the **`A/B/…/AA` codes are derived
from row insertion order in the FE** (production `rowLabel` is a descriptive string,
not a compact code). This is the **second** glass page, so the glass CSS recipes are
extracted from `home.scss` into a shared Sass partial (rule of three) now.

**Persistence:** JDBC only (invariant #1). N/A — no DB/migration in scope; consumes
the existing `GET /api/venues/{id}` read model unchanged.

**Source of intent:** GitHub issue **#136** (epic #133); design
`docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` → **Beach map** screen; the
issue's v3 gap-fill comment (PR #147).

**Skills consulted:** `riviera-sdlc` (loop + gates), `riviera-plan-doc` (this doc),
`riviera-frontend` (placement: shared style partial → `app/shared/`; e2e suite
split), `angular-developer` + angular-cli MCP `get_best_practices` (v22 signals /
`afterRenderEffect` / a11y / no-`@HostListener`, template event bindings for the
pan handlers), `playwright-cli` (the pan-vs-select e2e authoring, `page.mouse`
drag), `riviera-review-overlay` (RV-FE-*, RV-FE-E2E at the review gate). `tdd`
throughout. `postgres`/`riviera-modulith`/`riviera-stripe-payments` — **N/A, no
backend/DB/money in scope** (verified against the diff: frontend-only).

**Branch:** `feature/t3-beach-map-restyle` (created off `main` before phase 0). This
is a local session, so the literal `feature/…` branch is used (no cloud-branch
substitution). Pre-existing unrelated working-tree drift (`angular.json`
`analytics:false`, a `@playwright/test` pin loosening) is **left unstaged** — never
`git add -A`; only slice files are committed.

---

## Acceptance criteria (testable)

Phrased at the component boundary (the rendered `VenueMap` + its e2e), not at CSS.

- [ ] **AC-1 (row-major + derived codes):** Given the 24-set Miramar map, when it
  loads, then 4 rows render **in insertion order** with left-column codes `A, B, C,
  D` and each row's 6 tiles in `positionNo` order. *Pinned by:*
  `venue-map.spec.ts` "renders rows with derived A/B letter codes in insertion order".
- [ ] **AC-2 (two-letter order, no lexicographic sort):** Given ≥27 rows, when
  rendered, then the 27th code is `AA` and follows `Z` (a lexicographic sort would
  place `AA` before `B`). *Pinned by:* `venue-map.spec.ts` "derives AA after Z by
  insertion order" (pure `rowCode(index)` helper unit-tested directly).
- [ ] **AC-3 (per-row price, minor units — invariant #5):** Given row A at 4500 EUR
  minor units, when rendered, then the right price column shows `€45`. *Pinned by:*
  `venue-map.spec.ts` "renders per-row price from minor units".
- [ ] **AC-4 (tile states):** premium front-row tiles get `.premium`; taken tiles
  get `.taken` and are inert (no button) but keep their title/accessible name;
  free-online tiles are `<button>`s. *Pinned by:* `venue-map.spec.ts` (existing,
  retained) "marks the premium front row and the taken sets distinctly".
- [ ] **AC-5 (pool parity — invariant #3):** Given a FREE WALK_IN set and a FREE
  ONLINE set, when rendered, then only the ONLINE set is a `Select to book` button;
  the WALK_IN set renders as an inert tile (display parity, no behaviour change).
  *Pinned by:* `venue-map.spec.ts` (existing) "exposes a booking button only for
  free online sets".
- [ ] **AC-6 (tap opens dialog):** Given a free online tile, when clicked (no drag),
  then the booking dialog opens seeded with the map's date. *Pinned by:*
  `venue-map.spec.ts` (existing) + `booking-flow.e2e.ts`.
- [ ] **AC-7 (pan ≠ select):** Given a wide venue, when the pointer drags the tile
  area horizontally past the 6px threshold and releases over a free tile, then the
  dialog does **not** open; a plain click on a free tile **does**. *Pinned by:*
  `venue-map-pan.e2e.ts` (new) + `venue-map.spec.ts` "a consumed pan suppresses the
  next tile select".
- [ ] **AC-8 (labels/prices track rows while panning):** Given a wide venue, when
  the tiles pan horizontally, then the row-code and price columns stay fixed (outside
  the horizontal scroller) and remain row-aligned. *Pinned by:* `venue-map-pan.e2e.ts`
  (row-label column bounding-box x unchanged after a horizontal pan).
- [ ] **AC-9 (accessible names + keyboard):** Each tile's accessible name carries
  state without colour (`Set A1, Front row · Sea view, standard, €45, available`);
  free tiles are tab-reachable and Enter-activatable. *Pinned by:*
  `venue-map.a11y.spec.ts` + `booking-flow.e2e.ts` (keyboard Enter step).
- [ ] **AC-10 (venue description in header):** Given a venue with a description, when
  the map renders, then the description appears in the header. *Pinned by:*
  `venue-map.spec.ts` "renders the venue description in the header".
- [ ] **AC-11 (cutoff explainer + non-today picker — invariant #4 display-only):**
  The map renders `⏰ Book by 6 PM the day before — today isn't bookable` beside the
  date field, and the date `<input>`'s `min` is **tomorrow** (Europe/Tirane), so
  today is not offered. *Pinned by:* `venue-map.spec.ts` "renders the cutoff
  explainer and sets the date-picker min to tomorrow".
- [ ] **AC-12 (load-failure panel + retry):** When the map request fails, the
  designed glass failure panel renders with `role="alert"`, a heading and a Retry
  button; when Retry is pressed, the map re-fetches for the current date and
  recovers. *Pinned by:* `venue-map.spec.ts` "shows the designed failure panel and
  recovers on Retry" + `venue-map.a11y.spec.ts` error-state axe.
- [ ] **AC-13 (preserved contract):** `data-testid`s `set-tile`, `availability`,
  `map-date` preserved; venue name stays an `<h1>` heading with the exact name; free
  tiles keep the `Select to book` accessible name and `data-set-id`. `booking-flow.e2e.ts`
  and `request-to-book.e2e.ts` stay green. *Pinned by:* those two e2e + unit assertions.
- [ ] **AC-14 (contrast + a11y, both themes):** every text pair meets AA composited
  over both themes' worst-case gradient stops; axe clean in loaded / loading / error
  states. *Pinned by:* `venue-map.contrast.spec.ts` (rewritten on the shared
  `glass-tokens.ts` fixtures) + `venue-map.a11y.spec.ts`.
- [ ] **AC-15 (route de-legacied):** `venues/:id` no longer carries
  `data:{legacySurface:true}`; `RESTYLED_PATHS` in `app.spec.ts` includes
  `'venues/:id'`. *Pinned by:* `app.spec.ts` "marks every not-yet-restyled route…".

## Non-goals

- **Any booking/availability/pool/cutoff behaviour change.** Display parity only —
  the server remains the source of truth (#2/#3/#4). FREE WALK_IN sets keep rendering
  as inert "available"-styled tiles exactly as today.
- **Venue photos** (deferred → #142; the gradient "photos coming soon" placeholder stays).
- **Amenity / distance-to-water chips** (T7 #140 — a `.card-chips` slot is left, empty).
- **Extra theme palettes** (#143). Only `riviera` + `porcelain` are proven.
- **Booking dialog / confirmation / pay restyle** (T4 #137) — the dialog is embedded
  unchanged; its own restyle is a separate slice.
- **Changing the read API / adding fields** — `description` is already served.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Drag-to-pan swallows legitimate taps, or a pan-release opens the dialog | med | high | 6px click-vs-drag threshold; `panned` flag consumed+reset in `select()`; reset on each `mousedown`; **both directions** pinned by `venue-map-pan.e2e.ts` + a unit test | agent | open |
| R-2 | White header/legend ink fails AA on the gradient's light stops (T1/T2 lesson) | high | high | put every text region on the AA-proven glass surface (`panel-glass`/`card-glass`); pin composited pairs in `venue-map.contrast.spec.ts` over both themes' worst-case stops | agent | open |
| R-3 | Extracting the shared glass partial regresses the T2 home page | low | med | home's contrast/a11y/unit specs are the net; mixins emit identical computed styles; run the full `home.*.spec.ts` green after the refactor | agent | open |
| R-4 | A restyle breaks a preserved `data-testid` / accessible name → booking e2e red | med | high | `booking-flow.e2e.ts` + `request-to-book.e2e.ts` + unit assertions pin them; run before PR | agent | open |
| R-5 | Deriving `A/B` codes drops the descriptive row info (`Front row · Sea view`, `Back`) from a11y | med | med | keep the descriptive `rowLabel` **inside** the tile accessible name; the letter is only the compact visual code | agent | open |
| R-6 | Scroll-hint measurement (`scrollWidth>clientWidth`) can't run under jsdom | low | low | measure via `afterRenderEffect` + a `viewChild`; cover visibility in the real-browser e2e (wide fixture → hint shown), not a unit assertion | agent | open |
| R-7 | Sonar new-code coverage <80% on the new pan-guard/retry/rowCode logic | med | med | unit-test `rowCode`, the pan-guard suppression, retry recovery and `minDate` directly (not only via e2e) | agent | open |

## Open questions / Assumptions

- **Assumption A1 (row codes — the one genuine UX/a11y call):** render **derived
  positional letter codes** (`A, B, …, Z, AA`) by row insertion order for the compact
  left column and the tile visual, and **retain the descriptive `rowLabel` in the
  accessible name** so nothing is lost. Basis: the issue **title + body** say "sticky
  row-label column (A, B, … AA)"; production `rowLabel` is descriptive
  (`Front row · Sea view`, seed `V3`) and won't fit a 24px chip. *Owner:* agent ·
  *Resolves by:* phase 1 (user may veto — reversible one-liner). ← confirm?
- **Assumption A2 (failure testids):** the map failure panel uses
  `data-testid="map-error"` (with `role="alert"`) and `data-testid="map-retry"`
  (page-specific, no clash with home's `error`/`retry`). *Owner:* agent.
- **Assumption A3 (tile size):** `--riv-tile: clamp(44px, 11vw, 56px)` — 44px touch
  minimum; the same var sizes the grid columns **and** the side-column cell heights so
  labels/prices stay row-aligned. *Owner:* agent.
- **Assumption A4 (drag threshold):** 6px pointer travel between `mousedown` and
  `mouseup` classifies a gesture as a pan. *Owner:* agent.
- **Assumption A5 (walk-in parity):** FREE WALK_IN sets render as non-bookable
  "available"-styled tiles exactly as today (invariant #3 is about **bookability**,
  which is unchanged; it does not hide walk-in sets from the map). *Owner:* agent.
- **Assumption A6 (min date):** the picker `min` is tomorrow in Europe/Tirane
  (`defaultBookingDate(new Date())`, the same value `selectedDate` already defaults to);
  display-only — the server still enforces the real cutoff (#4). *Owner:* agent.

_No blocking product question — the issue + epic + design specify this slice in
detail; A1 is documented as the reversible default rather than blocking the loop._

## Availability & concurrency (invariant #2)

**Not a write path — display parity only.** Filled (not `N/A`) because the slice
renders the availability display:

- **Write paths to `availability(set_id, booking_date)`:** **none.** This slice adds
  no writer; it only *renders* `SetView.availability` (`FREE`/`TAKEN`) from the read
  API. The single source of truth stays server-side (#2).
- **Pool rule (invariant #3):** unchanged — `isBookable = FREE && pool==='ONLINE'`.
  Only ONLINE-pool free sets are `Select to book` buttons; WALK_IN sets are inert.
  Display parity, no behaviour change.
- **Cutoff rule (invariant #4):** the date picker's `min` excludes **today**
  (display-only, Europe/Tirane). The server remains authoritative for the real cutoff;
  a user who bypasses the `min` still hits server enforcement. The `⏰` explainer is
  copy only.
- **Pinning test:** N/A (no concurrency added). Booking still routes through the
  existing dialog → `POST /api/bookings`, whose concurrency ITs are unchanged.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend module, `api/` port, event, or class move.

**Module-ownership table:** N/A — no backend behaviour added or moved; all changes are
in the Angular `venue`/`pages`/`shared` frontend folders.

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** The embedded booking dialog and its
`onBooked`/`onAwaiting`/`onRequested` navigation are unchanged; money is only
*displayed* from integer minor units via the shared `formatMoney` (invariant #5).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.ts` | existing | standalone component | Signals + `computed` + `afterRenderEffect`(scroll hint); imperative pan fields | none |
| FE-2 | `venue/venue-map.html` | existing | external template | `@if`/`@for`, native control flow | — |
| FE-3 | `venue/venue-map.scss` | existing | component styles | consumes `shared/_glass.scss` + `styles.scss` tokens | — |
| FE-4 | `shared/_glass.scss` | **new** | Sass partial (mixins) | `panel-glass`/`card-glass`/`failure-panel`/`failure-retry`/`cutoff-note` | — |
| FE-5 | `pages/home/home.scss` | existing | component styles | rewired to `@use '../../shared/glass'` (replaces its local `%…` placeholders) | — |
| FE-6 | `venue/venue-map.contrast.spec.ts` | existing | unit spec | rewritten on `testing/glass-tokens.ts` fixtures | — |
| FE-7 | `venue/venue-map.a11y.spec.ts` | existing | unit spec | kept green (fixture unchanged) | — |
| FE-8 | `venue/venue-map.spec.ts` | existing | unit spec | expanded (codes, price col, pan-guard, minDate, retry, description) | — |
| FE-9 | `e2e/venue-map-pan.e2e.ts` | **new** | Playwright (CI-safe, mocked) | large fixture; `page.mouse` drag; axe | — |
| FE-10 | `app.routes.ts` + `app.spec.ts` | existing | routing | remove `legacySurface`; extend `RESTYLED_PATHS` | — |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`/change-detection,
`inject()`, `@if`/`@for`, `signal`/`computed`, host bindings via template event
attributes (no `@HostListener`), `viewChild()` + `afterRenderEffect` for the scroll-hint
measurement, no `ngClass`/`ngStyle` (use `class`/`style` bindings), no `as any`. The
`_glass.scss` partial lives in `shared/` per `riviera-frontend` (pure presentational
primitive, imported one-way by features + pages).

## FE↔BE contract

**N/A — no contract change.** Consumes the existing `VenueMapView`
(`GET /api/venues/{id}?date=`), including the already-served `description`. Money stays
integer minor units + currency; booking date stays ISO `LocalDate`.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared glass partial (rule of three) | ✅ | Phase 0 |
| 1 — Component + template + SCSS restyle (TDD) | ✅ | Phase 1 |
| 2 — Contrast spec rewrite + a11y green | ✅ | Phase 2 |
| 3 — Pan-vs-select e2e + preserve booking e2e | ⏳ | |
| 4 — Route de-legacy + app.spec RESTYLED_PATHS | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Updated in the same commit
window as each phase.

---

## File structure

- `frontend/src/app/shared/_glass.scss` — **new**; the shared glass recipes as Sass
  mixins (`panel-glass`, `card-glass`, `failure-panel`, `failure-retry`, `cutoff-note`).
- `frontend/src/app/pages/home/home.scss` — rewired to `@use` the partial (replaces its
  local `%panel-glass`/`%card-glass` placeholders + inline failure/cutoff rules).
- `frontend/src/app/venue/venue-map.ts` — row model with derived codes + `mapCols` +
  `rowPrice`; `minDate`; `retry()`; pan-guard handlers + `panned` guard; `scrollHint`.
- `frontend/src/app/venue/venue-map.html` — full restyle (glass header w/ description,
  date field + cutoff line, availability + progress, pannable 3-column map card, legend,
  failure panel). Preserves testids + `Select to book` + `<h1>`.
- `frontend/src/app/venue/venue-map.scss` — glass restyle consuming the partial + tokens.
- `frontend/src/app/venue/venue-map.spec.ts` — expanded unit suite.
- `frontend/src/app/venue/venue-map.contrast.spec.ts` — rewritten on glass-tokens fixtures.
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — kept green.
- `frontend/e2e/venue-map-pan.e2e.ts` — **new**; pan-vs-select + scroll-hint + axe.
- `frontend/src/app/app.routes.ts` / `app.spec.ts` — route de-legacy + RESTYLED_PATHS.

---

## Phase 0 — Shared glass partial (rule of three)

**Files:** Create `frontend/src/app/shared/_glass.scss` · Modify
`frontend/src/app/pages/home/home.scss` · Test (net) `pages/home/home.spec.ts` +
`home.contrast.spec.ts` + `home.a11y.spec.ts`.

Refactor-only (no behaviour change); the home specs are the safety net. Extract the
glass recipes as **mixins** (Sass `@extend`/placeholders don't cross `@use` module
boundaries; mixins do), e.g.:

```scss
// shared/_glass.scss — the ONE home of the Liquid Glass CSS recipes (epic #133 rule of three)
@mixin panel-glass {
  background: var(--riv-header-glass);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  backdrop-filter: blur(22px) saturate(170%);
  border: 1px solid var(--riv-header-border);
  border-radius: 26px;
}
@mixin card-glass {
  background: var(--riv-card-glass);
  border: 1px solid var(--riv-card-border);
  color: var(--riv-card-ink);
}
// failure-panel / failure-retry / cutoff-note extracted likewise (see home.scss originals).
```

- [ ] **Step 1:** Run the home suite green first (baseline) —
  `npm test -- home` → PASS.
- [ ] **Step 2:** Create `_glass.scss`; in `home.scss` `@use '../../shared/glass' as
  glass;` and replace the `%panel-glass`/`%card-glass` `@extend`s with
  `@include glass.panel-glass;` etc., and the inline `.failure`/`.cutoff-note` rules
  with the shared mixins.
- [ ] **Step 3:** Re-run the home suite → PASS (identical computed styles). `ng build`
  clean (partial resolves).
- [ ] **Step 4:** Commit — `git commit -m "refactor(fe): extract shared Liquid Glass scss partial (#136)"`.
- [ ] **Step 5:** Update this table row to ✅.

---

## Phase 1 — Component + template + SCSS restyle (TDD)

**Files:** Modify `venue/venue-map.ts` · `venue-map.html` · `venue-map.scss` · Test
`venue-map.spec.ts`.

Drive each new behaviour red→green. Key new unit tests (sketches):

```ts
// rowCode: derive A..Z, AA.. by index (pure, exported from venue-map.ts or a helper)
it('derives A, B … Z, AA by insertion order (no lexicographic sort)', () => {
  expect(rowCode(0)).toBe('A');
  expect(rowCode(25)).toBe('Z');
  expect(rowCode(26)).toBe('AA'); // AA follows Z, not before B
  expect(rowCode(27)).toBe('AB');
});

it('renders rows with derived A/B codes and per-row price from minor units', async () => {
  flushVenue(); await fixture.whenStable();
  const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map(n => n.textContent?.trim());
  expect(codes).toEqual(['A', 'B', 'C', 'D']);
  const prices = [...el().querySelectorAll('[data-testid="row-price"]')].map(n => n.textContent);
  expect(prices[0]).toContain('€45'); // 4500 minor units
});

it('renders the venue description in the header', async () => {
  flushVenue(); await fixture.whenStable();
  expect(el().textContent).toContain('Premium loungers on the Ksamil shoreline.');
});

it('renders the cutoff explainer and sets the date-picker min to tomorrow', async () => {
  flushVenue(); await fixture.whenStable();
  expect(el().querySelector('[data-testid="cutoff-note"]')?.textContent)
    .toMatch(/book by 6\s+PM the day before/i);
  const input = el().querySelector<HTMLInputElement>('[data-testid="map-date"]')!;
  expect(input.getAttribute('min')).toBe(defaultBookingDate(new Date())); // tomorrow, today excluded
});

it('a consumed pan suppresses the very next tile select', () => {
  const c = fixture.componentInstance as any;
  c.onMapMouseDown({ clientX: 0, currentTarget: { scrollLeft: 0 } });
  c.onMapMouseMove({ clientX: 40, currentTarget: { scrollLeft: 0 } }); // 40px > 6px threshold → pan
  c.onMapMouseUp();
  const before = c.selectedSet();
  c.select({ id: 1 }); // the click that follows a pan-release
  expect(c.selectedSet()).toBe(before); // dialog NOT opened
  c.select({ id: 1 }); // a subsequent genuine click works
  expect(c.selectedSet()).not.toBe(before);
});

it('shows the designed failure panel and recovers on Retry', async () => {
  venueRequest().error(new ProgressEvent('error')); await fixture.whenStable();
  const panel = el().querySelector('[data-testid="map-error"]');
  expect(panel?.getAttribute('role')).toBe('alert');
  el().querySelector<HTMLButtonElement>('[data-testid="map-retry"]')!.click();
  venueRequest().flush(miramar()); await fixture.whenStable();
  expect(el().querySelector('[data-testid="map-error"]')).toBeNull();
  expect(el().querySelectorAll('[data-testid="set-tile"]').length).toBe(24);
});
```

Implementation notes (component): add `rowCode(i)`; extend the `rows` computed to
`{ code, descriptiveLabel, price, sets }`; `mapCols = max(row.sets.length)`;
`minDate = defaultBookingDate(new Date())`; `retry()` sets `failed=false` + `load()`
(and `load()` resets `failed=false` on entry so a date-change after a failure clears
it); pan fields `pointerDown/startX/startScrollLeft/panned` with
`onMapMouseDown/Move/Up`; `select()` guards on `panned` (consume+reset);
`scrollHint = signal(false)` set by an `afterRenderEffect` reading `venue()` and the
`viewChild` scroller (`scrollWidth > clientWidth`). Accessible tile name becomes
`Set {code}{positionNo}, {descriptiveLabel}, {tier}, {money}, {state}` (keeps the
`Select to book` suffix on the button). Update the existing accessible-name test to
the new format.

- [ ] Steps: write failing tests → run `npm test -- venue-map` FAIL → implement
  component+template+scss → `npm test -- venue-map` PASS → `ng build` clean →
  commit `feat(fe): restyle beach map to Liquid Glass with pannable row map (#136)`
  → table ✅. **Preserve** `set-tile`/`availability`/`map-date` testids, the `<h1>`
  name, and the `Select to book` button name (re-assert existing tests still pass).

---

## Phase 2 — Contrast spec rewrite + a11y green

**Files:** Modify `venue-map.contrast.spec.ts` · confirm `venue-map.a11y.spec.ts`.

Rewrite the contrast spec on the shared `testing/glass-tokens.ts` fixtures — assert
every text-bearing pair (header inks on `panel-glass`; card inks + tile inks + row
code/price + cutoff on `card-glass`; failure inks; the sea-banner white-on-teal) meets
AA composited over **both** themes' worst-case stops via `expectAaOverStops`. Tile
tokens (white/amber/dashed) keep their AA-proven literals where they sit on the map
card. Keep the a11y axe spec green (loaded/loading/error).

- [ ] write pairs → `npm test -- venue-map.contrast venue-map.a11y` PASS → commit
  `test(fe): pin beach-map glass contrast over both themes (#136)` → table ✅.

---

## Phase 3 — Pan-vs-select e2e + preserve booking e2e

**Files:** Create `e2e/venue-map-pan.e2e.ts` (CI-safe mocked suite, per `riviera-frontend`).

Large-venue fixture (e.g. 4 rows × ~20 sets) so the tile area overflows the 780px map
and pans. Assert: (a) a plain click on a free tile opens the dialog; (b) a
`page.mouse.down → move +150px → up` over a free tile does **not** open it; (c) the
scroll hint is visible; (d) the row-code column's bounding-box x is unchanged after a
horizontal pan; (e) `expectNoSeriousAxeViolations` on the map. Await
`getAnimations().finished` before axe (animated glass). Then run the **existing**
`booking-flow.e2e.ts` + `request-to-book.e2e.ts` to confirm they stay green.

- [ ] author spec → `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run
  test:e2e:a11y` (cloud) / local equivalent → PASS → commit
  `test(e2e): pin pan-vs-select on the beach map (#136)` → table ✅.

---

## Phase 4 — Route de-legacy + app.spec RESTYLED_PATHS

**Files:** Modify `app.routes.ts` (remove `data:{legacySurface:true}` from `venues/:id`
+ update its comment) · `app.spec.ts` (`RESTYLED_PATHS = ['', 'venues/:id']`).

- [ ] update → `npm test -- app` PASS → commit
  `feat(fe): drop legacy compat surface for the restyled beach map (#136)` → table ✅.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..6, 9..13:** `npm test -- venue-map` → all PASS at HEAD.
- [ ] **AC-7, 8:** `npm run test:e2e:a11y` (venue-map-pan) → PASS.
- [ ] **AC-13:** `npm run test:e2e:a11y` (booking-flow + request-to-book) → PASS.
- [ ] **AC-14:** `npm test -- venue-map.contrast venue-map.a11y` → PASS.
- [ ] **AC-15:** `npm test -- app` → PASS.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO in the doc or code.
- [ ] **No JPA / no backend** touched (frontend-only slice).
- [ ] Availability section filled — **no write path added**; pool + cutoff display
  parity (invariants #2/#3/#4 server-side unchanged).
- [ ] Modulith / Payment sections justified N/A (frontend-only, no money).
- [ ] Money rendered from minor units via `formatMoney` (invariant #5).
- [ ] Frontend standards met (signals, `@if`/`@for`, no `@HostListener`, no `as any`,
  a11y AA); deviation (header-on-glass) documented with contrast proof.
- [ ] Preserved `data-testid`s + `Select to book` + `<h1>`; both booking e2e green.
- [ ] Execution-status table at HEAD matches reality.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
