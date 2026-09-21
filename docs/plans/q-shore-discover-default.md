# Q · Shore becomes the Discover default Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Discover with no query parameter renders Q · Shore (the riviera map sheet below `lg`,
the pinned panel from `lg`); `?map=off` renders the pre-Q page for one release; `?map=sheet`
becomes a no-op that still resolves to Q.

**Architecture:** One line of the page's route contract inverts — `mapFlag` becomes "the map,
unless the route says `off`" instead of "the map, only if the route says `sheet`". Nothing else
in `home.ts` or `home.html` moves: the three template arms (`sheetMode` / `panelMode` / the
pre-Q page) and every component under them are already built and pinned. The whole cost of the
slice is therefore in the **test population**, not the source, so the blast radius was measured
first (flag inverted, full unit suite + full mocked e2e suite run) rather than reasoned about,
and every failure carries an explicit verdict below.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no table and no migration.

**Source of intent:** GitHub issue #1167 (parent epic #1156, slice 4 of 5; the deletion slice is
#1168).

**Skills consulted:** `riviera-sdlc` (intake gate: the issue's AC list omits two unit describe
blocks that the flip breaks — `Home (the route-carried date)` and `Home accessibility (axe)`;
folded in as AC-6a/AC-6b) · `riviera-plan-doc` (forced the behaviour-parity ledger, which is
what turned "invert a flag" into a measured population) · `tdd` (route-contract spec red before
the flip; the pre-Q coverage moved to `?map=off` in a phase that is green on both sides of it) ·
`riviera-review-overlay` (review gate, phase 3) · `riviera-docs-freshness` (**ran** over `95341fd7..HEAD`, 4 findings, all patched — see below)
· `riviera-local-debug` (unshallowed the clone; scoped `ng test --include`; `PW_CHROMIUM_EXECUTABLE`
for the mocked e2e) · `riviera-frontend` (placement: no new file outside `pages/home/` and
`e2e/`; the e2e split — every changed spec is the CI-safe mocked suite) · `playwright-cli`
(the new first-screen e2e) · `riviera-tailwind` (consulted, changed nothing — this slice paints
no pixel; both designs' styling ships already)

**Branch:** `claude/sdlc-1167-qf336o` (cloud session; stands in for `feature/q-shore-discover-default`)

---

## Acceptance criteria (testable)

> *Seam* for the unit ACs is the **route's query contract** — `Home` rendered through a provided
> `ActivatedRoute.queryParamMap`, which is the public boundary a tourist's URL actually crosses.
> Asserting on `mapFlag`/`sheetMode` directly would be implementation-coupled: those are private
> and computed. For the e2e ACs the seam is the `/` route in Chromium.

- [ ] **AC-1:** Given no `map` query parameter, when Discover renders at a phone viewport, then
      the riviera map sheet is the page — `discover-head` and `sheet-poster` are present and the
      pre-Q `view-map` switch is absent. *Seam:* `Home` via `ActivatedRoute.queryParamMap` ·
      *Pinned by:* `home.spec.ts > Home (the riviera map sheet) > 'with no query parameter the
      page is the riviera map sheet'`
- [ ] **AC-2:** Given no `map` query parameter, when Discover renders from `lg`, then the pinned
      panel is the page — the panel is present and the pre-Q filter bar is absent. *Seam:* as
      AC-1 · *Pinned by:* `home.spec.ts > Home (the riviera map sheet) > from lg: the panel >
      'with no query parameter the page is the pinned panel'`
- [ ] **AC-3:** Given `?map=off`, when Discover renders, then the pre-Q page is unchanged — the
      hero, the three filter selects, the List/Map switch and the preview card over the map.
      *Seam:* as AC-1 · *Pinned by:* `home.spec.ts > Home (the riviera map sheet) > '?map=off is
      the pre-Q Discover page'` plus the whole `Home (venue discovery)` / `Home (list/map
      switch)` / `Home (venue pins and the preview)` population, moved onto `?map=off`
- [ ] **AC-4:** Given `?map=sheet`, when Discover renders, then it resolves to Q · Shore — the
      parameter is a no-op, not an error, so a bookmark carrying it keeps working. *Seam:* as
      AC-1 · *Pinned by:* `home.spec.ts > Home (the riviera map sheet) > '?map=sheet still
      resolves to the riviera map sheet'`
- [ ] **AC-5:** Given the sheet, poster and panel specs and `discover-sheet.e2e.ts` with no `map`
      parameter anywhere in their setup, when they run, then they pass — they assert the default
      page. *Seam:* as AC-1 / the `/` route · *Pinned by:* the suites themselves:
      `home.spec.ts > Home (the riviera map sheet)` (incl. `on a phone: the poster`, `on a phone:
      the pills’ room`, `from lg: the panel`), `home.a11y.spec.ts > Home accessibility (the
      riviera map sheet)`, `e2e/discover-sheet.e2e.ts`, `e2e/discover-map.e2e.ts`'s pin/panel
      describe, `e2e/panel-glass-inks.e2e.ts`
- [ ] **AC-6:** Given `?map=off`, when the pre-Q coverage runs, then it passes unchanged:
      `Home (list/map switch)`, `Home (venue pins and the preview)`, `e2e/discover-map.e2e.ts`,
      `e2e/discovery-flow.e2e.ts`, `e2e/touch-targets-tourist.e2e.ts`. *Seam:* as AC-1 / the `/`
      route · *Pinned by:* those suites
- [ ] **AC-6a:** *(drift — not in the issue)* Given `?map=off`, when `Home (venue discovery)` and
      `Home accessibility (axe)` run, then they pass: both are pre-Q coverage that the issue's AC
      list omits. `Home accessibility (axe)` provides no `ActivatedRoute` at all today, so the
      flip silently retargets it. *Seam:* as AC-1 · *Pinned by:* those two describe blocks
- [ ] **AC-6b:** *(drift — not in the issue)* Given no `map` parameter and `?date=2027-07-04`,
      when Discover renders, then the head's day chip reads the route's day (`Sun 4 Jul`) and the
      venue request carries `2027-07-04`. The block stays on the **default** route rather than
      moving to `?map=off`, because route-date seeding is a behaviour of the page that ships and
      #1168 would otherwise delete its only coverage. *Seam:* as AC-1 · *Pinned by:*
      `home.spec.ts > Home (the route-carried date)`
- [ ] **AC-7:** Given the default Discover route with no query parameter at 390 × 844, when the
      page first paints, then the poster image and at least one priced pin are wholly inside the
      first screen. *Seam:* the `/` route · *Pinned by:* `e2e/discover-sheet.e2e.ts >
      Discover sheet — the poster > 'the default route paints the poster and a priced pin inside
      the first screen'`
- [ ] **AC-8:** Given the default route on both surfaces in all three themes, when the a11y and
      contrast specs run, then they pass. *Seam:* as AC-1 · *Pinned by:*
      `home.a11y.spec.ts > Home accessibility (the riviera map sheet)`,
      `home.contrast.spec.ts`, `discover-head.{a11y,contrast}.spec.ts`,
      `discover-sheet.{a11y,contrast}.spec.ts`, `venue-pin-layer.{a11y,contrast}.spec.ts`,
      `e2e/discover-sheet.e2e.ts > Discover sheet — accessibility`
- [ ] **AC-9:** Given the default route's first paint at 390 × 844, when the counters are read,
      then map requests = 0, `/posters/` requests = 1 and WebGL contexts = 0 — #1158's guarantee
      is not lost by becoming the default. *Seam:* the `/` route · *Pinned by:*
      `e2e/discover-sheet.e2e.ts > 'the first paint is a poster: 0 map requests, 0 WebGL
      contexts, one image — and the counters are live'`, with `page.goto('/')`

## Non-goals

- Deleting the pre-Q page, its specs, `?map=off` or the `SHEET_FLAG` constant — that is #1168,
  and keeping it here would put the deletion churn in the same diff as the behaviour change.
- Any styling, token or layout change. Both designs already ship; this slice paints nothing.
- Any backend change, any new endpoint, any change to what `/api/venues` returns.
- Removing the `/prototype/map` route (epic § Out of scope).

## Behavior-parity ledger

> The slice replaces what `/` renders. Nothing is deleted, so every pre-Q behaviour is
> *preserved behind `?map=off`* for one release; the column records what the **default** route
> does with it now.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Hero (chip + display headline) | dropped on the default | Q's first screen is the map; the hero is the space the epic's Problem section was written against. Still rendered under `?map=off`. |
| The three filter selects (beach / region / date) | changed | The head's one 78 px row carries place → the coast picker, the region's beaches as one chip, and the day. Pinned by `discover-head.spec.ts`. |
| List/Map switch | dropped on the default | There is one surface: the map is the ground, the list is the sheet over it. Still under `?map=off`. |
| Preview card over the map | changed | The row is the pin's preview — a press lights the row and scrolls it to the top. Pinned by the sheet describe. |
| Beach narrowing via a server re-query (`beach` param) | changed | Sheet mode holds one whole-coast response per date and narrows client-side, so the chips and the picker can count every beach. Same endpoint, same DTO — no contract change, one request instead of N. |
| The crumb that undoes a filter-bar narrowing | dropped on the default | The head's beach chip is the narrowing and its own way back; no crumb is drawn in sheet mode (`home.ts`'s `onBeachNarrowed`). |
| Route-carried `?date` seeding + re-query | preserved | Same signal, same request; the head spells the day without the year (`formatBookingDate` without `withYear`), which is the one assertion AC-6b moves. |
| Skeletons, empty state, failure panel + Retry | preserved | The same shared `ng-template`s render under all three arms (`home.html` § "shared by the sheet (flag on) and the shipped page (flag off)"). |
| Card link to the beach map carrying the date | preserved | Same `venue-card` template on the sheet; from `lg` the **panel** renders `app-venue-row` instead, which carries the same link. A `venue-card` selector is therefore not a viewport-independent "the page loaded" marker any more — see R-8. |
| `?map=off` surviving in-page interaction | preserved | Discover never calls `router.navigate`: the date and the filters are signals, so the parameter lives for the page's lifetime and browser-back restores it. |
| `?map=off` surviving a press on the header/tab-bar **Discover** link | dropped, by design | Those link to `/` with no parameters, so the opt-out resets to Q. The issue calls `?map=off` "the comparison lever while the new design soaks" — a per-URL lever, not a sticky preference, so nothing persists it. |
| The shell footer, with the only links to Privacy and Terms | dropped on **both**, with a follow-up | The riviera map fills the window, so the footer was rendered and wholly covered — measured, not assumed. The route now declares `footer: false` and the shell withholds it. Route data is static, so `?map=off` gives its footer up too although it scrolls; harmless while nothing links to it, and it dies with #1168. Placement in Q: **#1173**. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A spec that lands on `/` for an unrelated reason (theme, token, header, tab bar, focus ring) silently starts measuring a different page, and either fails opaquely or — worse — passes for the wrong reason | High | High | Measure, don't reason: invert the flag on a scratch copy and run the **whole** unit suite and the **whole** mocked e2e suite before writing a line. Every failure gets a verdict in this plan; every suite that still passes on `/` is checked for whether the element it queries exists in both designs | me | open |
| R-2 | `?map=off` becomes dead-but-load-bearing and #1168 misses a spec | Medium | Low | The `OFF_FLAG` constant's TSDoc names #1168 as the issue that deletes it, so the grep that finds the flag finds the ticket | me | open |
| R-3 | The default route's first paint regresses to a live map, losing #1158's 0-request guarantee | Low | High | AC-9 moves the existing cost e2e onto `/` rather than trusting that it still holds | me | open |
| R-4 | A pre-Q unit block moved to `?map=off` drifts out of sync with the one that stays on the default, so `?map=sheet`'s no-op status is asserted nowhere | Low | Medium | AC-4 is its own spec, not a side effect of another one | me | open |
| R-5 | Timezone/cutoff (#4/#6): the head's "N selling today" and the dusk pin read each venue's sales close | Low | Low | Rendered, not changed — no code in the #4 path moves. The Vitest clock stays frozen at Monday 2026-06-15 midday `Europe/Tirane`; no spec introduces a second clock | me | open |
| R-6 | Boundary leaks (#11) / BOLA (#13) / rounding (#5) / concurrent reservation (#2) / webhook (#8) / payout (#9) | N/A | N/A | No backend, no money, no booking path, no venue-scoped endpoint — the diff is `frontend/src/app/pages/home/` plus `frontend/e2e/` | me | n/a |
| R-7 | Flyway `V<n>` claim | N/A | N/A | No migration in this slice | me | n/a |
| R-8 | The mocked e2e suite's default viewport is 1280 × 720 (`playwright.a11y.config.ts`), so an unqualified `goto('/')` lands in **panel** mode, where `venue-card` does not exist — `venue-row` does. Specs that use `venue-card` merely as a "the page settled" marker break for a reason unrelated to what they test | High | Medium | Each such marker is repointed to what that spec actually needs (`awaitRoutedPage`, `desk-panel`), not blanket-moved to `?map=off`: a header or token spec should keep measuring the page that ships | me | open |
| R-9 | `desk-frame` is `fixed inset-x-0 bottom-0 z-[1]` with no `pointer-events-none`, so from `lg` it covers the shell footer — `legal-pages.e2e.ts` clicks a footer link while parked on `/` | Medium | Medium | Confirmed or refuted by the measured run below. If real it is a **defect of #1159's panel**, not of this slice's flag, but it becomes visible here, so it is fixed here rather than worked around in the spec | me | **reproduced, fixed in `0aaec182`+**: real on BOTH surfaces (390: the sheet's card over it; 1280: the MapLibre canvas), doc height = viewport so nothing scrolls it into reach, and `legal-footer.ts` is mounted in exactly one place — so Privacy/Terms had no route from the landing page. Put to the user; chosen: a `footer: false` route flag + follow-up **#1173** |
| R-10 | A spec goes **vacuous** rather than red — e.g. `theme-shell.e2e.ts`'s `expect(filter-beach).toHaveCount(0)`, which proved "the deferred chunk has not landed" and now passes because `filter-beach` can never render at all | Medium | Medium | The measured run cannot catch this (it stays green), so every still-green `/` spec identified by the survey is read and repointed by hand | me | open |

## Open questions / Assumptions

- **Assumption:** `?map=off` is spelled `off` (the issue names it verbatim) and no other value is
  special — any other `map` value resolves to Q, so a stale `?map=sheet` bookmark keeps working
  (AC-4). — *Owner:* me · *Resolves by:* AC-3 + AC-4 together pin the whole contract.
- **Assumption:** the pre-Q page keeps its coverage rather than gaining new coverage; this slice
  adds tests only for the new default and for the route contract itself. — *Owner:* me ·
  *Resolves by:* #1168 deletes that coverage with the page.

### Resolved

- **Open question (raised by R-9, put to the user):** the riviera map covers the shell footer on
  both surfaces, and `shared/legal-footer.ts` is mounted in exactly one place, so making Q the
  default leaves Privacy and Terms unreachable from the landing page. Four options were costed:
  hide the footer here and follow up; place the links inside Q now; shrink the fixed surface above
  the footer (costs #1159's measured panes 568/864/1,344); or ship the regression. **Outcome:**
  hide it here — a `footer: false` route-data flag mirroring the shell's existing `tabBar: false`,
  which changes nothing a tourist sees (the footer was already invisible) but stops a dead row
  that a pointer and AT still reach; where the legal links belong in Q's design is **#1173**.
  Landed in the phase-1 commit.

## Availability & concurrency (invariant #2)

`N/A — does not affect availability.` The page issues one read of `/api/venues` and renders it.
No write path to `availability(set_id, booking_date)` is in the diff, no set is reserved, and the
beach map (`venue/venue-map.ts`) is not touched. Invariant #4 is **rendered, not changed**: the
head's selling count and the dusk pin/row read each venue's `salesOpen` for the selected day
exactly as they do today; neither the pay-deadline fence nor the confirm path is in scope.
Invariant #6 holds by reuse — the clock is `Europe/Tirane` via the existing
`shared/booking-date.ts` helpers, and no new `Date` is constructed.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No file under `platform/` is in the diff.

### Module ownership (§4a)

`N/A — no backend behaviour added or moved.`

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves; the card's from-price is a read of the existing
`fromPrice` view type (minor units + currency, unchanged).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/home.ts` — the route's `map` contract | existing | route component | `mapFlag` signal, seeded from `route.snapshot.queryParamMap` and kept live off `route.queryParamMap`; `sheetMode`/`panelMode` computed off it and `wide()` | none |
| FE-2 | `pages/home/home.spec.ts` — the route-contract describe + the pre-Q blocks' `?map=off` setup | existing | spec | — | — |
| FE-3 | `pages/home/home.a11y.spec.ts` — `Home accessibility (axe)` gains an `ActivatedRoute` on `?map=off`; the sheet describe drops the flag | existing | spec | — | — |
| FE-4 | `e2e/discover-sheet.e2e.ts` — flag out of the setup, plus the AC-7 first-screen test | existing | mocked e2e | — | — |
| FE-5 | `e2e/discover-map.e2e.ts`, `e2e/discovery-flow.e2e.ts`, `e2e/touch-targets-tourist.e2e.ts` and the rest of the measured pre-Q population — `/` → `/?map=off` | existing | mocked e2e | — | — |
| FE-6 | `e2e/panel-glass-inks.e2e.ts` — `/?map=sheet` → `/` | existing | mocked e2e | — | — |

## FE↔BE contract

`N/A — no contract change.` Same endpoint, same DTO, same query parameters. The default route now
issues the **whole-coast** `/api/venues` read (no `beach`/`region` param) instead of a filtered
one, which is sheet mode's existing behaviour from #1157, not a new shape.

## Execution status

**Stage pointer:** `review gate`

**Next action:** Mark ready for review, run the review gate on the resolved range, then Sonar.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Move the pre-Q coverage onto `?map=off` | ✅ | |
| 1 — Invert the flag; strip it from Q's setups | ✅ | |
| 1a — The covered footer: a `footer: false` route flag | ✅ | |
| 2 — The default route's e2e (AC-7, AC-9) | ✅ | |
| 3 — Docs freshness + close-out | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Sonar note.** On the plan-only commit the gate reported 0 new issues, 0 duplication and
**0.0 % coverage on new code** — the third false zero in `riviera-sdlc` `references/pr-gates.md`
§2: the only changed path was `docs/plans/`, which is outside `sonar.sources`, so `new_lines` was
absent. Record as *gate did not apply (paths)*, never "passed". It applies for real from the
first `frontend/src` commit; `frontend/e2e/` is outside `sonar.sources` too, so a phase whose
diff is only e2e will report the same false zero.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| — | | | |

---

## File structure

- `docs/plans/q-shore-discover-default.md` — this plan
- `frontend/src/app/pages/home/home.ts` — the route's `map` contract inverts
- `frontend/src/app/pages/home/home.spec.ts` — the route-contract describe; the pre-Q blocks onto `?map=off`; Q's blocks lose the flag
- `frontend/src/app/pages/home/home.a11y.spec.ts` — `Home accessibility (axe)` onto `?map=off`; the sheet describe loses the flag
- `frontend/src/app/pages/home/home.html` — the flag-era comment on the shared card template
- `frontend/e2e/discover-sheet.e2e.ts` — flag out of the setup; the AC-7 first-screen test
- `frontend/e2e/discover-map.e2e.ts` — the pre-Q blocks onto `?map=off`; the pin/panel describe loses the flag
- `frontend/e2e/panel-glass-inks.e2e.ts` — the sheet/panel helper loses the flag; the card-price test onto `?map=off`

**The pre-Q e2e population moved onto `?map=off`** (phase 0 steps 3–4a; every `goto('/')` in the
first group, named sites in the rest):

- `frontend/e2e/discovery-flow.e2e.ts` — plus the two "Back to Discover" markers, which land on Q
- `frontend/e2e/discover-photos.e2e.ts` — plus its two `toHaveURL('/')` assertions
- `frontend/e2e/same-day-booking.e2e.ts`
- `frontend/e2e/operator-venue-season.e2e.ts`
- `frontend/e2e/sun-token.e2e.ts`
- `frontend/e2e/loading-announcements.e2e.ts`
- `frontend/e2e/solid-fill-token-skin.e2e.ts` — `openDiscovery` only; its token-registry test stays on `/`
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the filter-bar and three map-view sweeps
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — the `SURFACES` row and the switch's double-tap test
- `frontend/e2e/theme-shell.e2e.ts` — the hero scrim and native-field-scheme tests; the withheld-chunk marker → `app-home`
- `frontend/e2e/tourist-header.e2e.ts` — settle marker only; the bar keeps measuring the page that ships
- `frontend/e2e/tourist-tab-bar.e2e.ts` — the scroll-away test, a handover to #1173
- `CONTEXT.md` — four entries whose present-tense facts the slice falsifies (below)
- `docs/plans/accent-ink-on-glass.md` — **deleted**: its PR #1166 merged, so it retires at this close-out
- `frontend/src/app/app.ts` — `TouristRouteData.footer?: false`, carried on the same root→leaf walk as `tabBar`
- `frontend/src/app/app.html` — the shared footer behind `@if (footer())`
- `frontend/src/app/app.routes.ts` — Discover declares `footer: false`
- `frontend/src/app/app.spec.ts` — the flag's own spec
- `frontend/e2e/legal-pages.e2e.ts` — the footer test moves to `/my-bookings`; a new test pins that Discover withholds it

*(The rest of the e2e population is listed in phase 0, from the measured run.)*

---

## How the population was measured

Two independent passes, because a flag inversion fails *silently* as easily as loudly:

1. **A static survey** of every `frontend/e2e/**` navigation to `/` and every unit spec that
   renders `Home`, classified OLD-DESIGN-DEPENDENT / NEW-DESIGN-OK / MODE-AGNOSTIC against the
   three template arms in `home.html` (`sheetMode` @192, `panelMode` @409, pre-Q @594).
2. **A measured run** with the flag inverted on a scratch copy. The **unit** pass ran to
   completion: **68 failures in exactly two files** (`home.spec.ts`, `home.a11y.spec.ts`);
   `home.contrast.spec.ts` and every component-level spec under `pages/home/` were untouched,
   because they render components directly rather than through the route. The **mocked e2e**
   pass was started and **stopped before it finished** — a failing Playwright test burns its
   full 60 s timeout, so an inverted-flag run of the whole suite is far slower than a green one,
   and the scratch inversion cannot sit in the working tree while the plan is committed. The e2e
   population below therefore comes from the survey, and the measured e2e check is **phase 0
   step 5** (green before the inversion) and **phase 1 step 4 / phase 2 step 4** (green after).

The survey catches what a run cannot (R-10: a spec that goes vacuous instead of red); a run
catches what the survey cannot (a spec that breaks through geometry rather than a selector,
R-9). Neither is trusted alone — so no e2e file is edited on the survey's word without the suite
agreeing, and R-9 in particular stays **open** until a run either reproduces the footer
occlusion or clears it.

Two facts from the survey drive most of the e2e work:

- The mocked suite's default viewport is **1280 × 720**, so an unqualified `goto('/')` lands in
  **panel** mode, not sheet mode. `venue-card` — which many specs use only as a settle marker —
  does not exist there; `venue-row` does (R-8).
- The new design renders **no native form control**: `head-beaches` and `head-day` are
  `<button>`s. Anything sweeping `input, select, textarea` on `/` measures nothing (R-10).

---

## Phase 0 — Move the pre-Q coverage onto `?map=off`

A pure preparatory refactor: `'off' !== 'sheet'` today and `'off' === OFF_FLAG` after the flip,
so every spec in this phase is **green on both sides of the inversion**. Landing it first keeps
phase 1's diff to the behaviour change.

**Files:** Modify `frontend/src/app/pages/home/home.spec.ts` · `frontend/src/app/pages/home/home.a11y.spec.ts` · the measured e2e population below · Test: the same files

- [ ] **Step 1: Unit — give the four pre-Q describes an `?map=off` route**
      `Home (venue discovery)` (`:127`) and `Home (list/map switch)` (`:764`) have **no**
      `ActivatedRoute` provider at all, so they inherit `provideRouter([])`'s empty query map —
      each gains one. `Home (venue pins and the preview)` (`:934`) already provides one at
      `:975`; its map becomes `{ map: 'off' }`, **and so does every later `routeParams.next(...)`
      in that block** (`:1158`, `:1177`, `:1272` push `{ date }` alone today, which after the
      flip would flip the page mid-test). `home.a11y.spec.ts`'s `Home accessibility (axe)`
      (`:65`) gains one too.
- [ ] **Step 2: Unit — `Home (the route-carried date)` stays on the default** (AC-6b)
      Its one mode-specific assertion is the date label: the pre-Q page spells
      `Sun 4 Jul 2027`, the head's day chip spells `Sun 4 Jul` (`formatBookingDate` without
      `withYear`). Assert the chip, not the page text. Its other three cases assert the request's
      `date` param and are mode-agnostic already.
- [ ] **Step 3: e2e — repoint the pre-Q population to `/?map=off`.** Whole-file (every
      `goto('/')` is pre-Q coverage): `discovery-flow`, `discover-map`, `discover-photos`,
      `same-day-booking`, `operator-venue-season`, `sun-token`, `loading-announcements`.
      Single-site: `solid-fill-token-skin` (`openDiscovery`, not its token-registry test),
      `panel-glass-inks` (the card-price test, not the sheet helper), `discover-sheet` and
      `discover-map`'s two inverse tests — both titled "the flag off leaves today's Discover",
      which is now what `?map=off` means, so the titles move with them.
      `discover-photos`'s two `toHaveURL('/')` assertions move with their `goto`.
- [ ] **Step 4: e2e — repoint what a spec *measures*, not its page**, where it is not pre-Q
      coverage and only used the pre-Q page as scaffolding (R-8, R-10):
      - `discovery-flow`'s two "Back to Discover" tests: the venue page's way back carries no
        query, so it *lands on Q*. Marker → `venue-card, venue-row`, which is any design's list.
      - `tourist-header`'s desktop-bar sweep: the bar is the subject, so it stays on the page
        that ships; marker → `venue-row` (at 1280 the default is the panel).
      - `theme-shell`'s withheld-chunk test: `expect(filter-beach).toHaveCount(0)` was the
        R-10 vacuous case — it proved Home's chunk had not landed, and would now pass whether it
        had or not. Marker → `app-home`, which is design-independent and survives #1168 too.
- [ ] **Step 4a: e2e — the two that need a judgement, not a move**
      - `touch-targets-tourist`'s filter-bar and three map-view sweeps → `?map=off`: their
        subject is the pre-Q switch, pill, crumb and preview card. Nothing is lost — the sheet's
        own sweeps already exist (`discover-sheet.e2e.ts`: half, full, the beach rail, the coast
        picker) and the panel's do too (`discover-map.e2e.ts`).
      - `tourist-tab-bar`'s "the top bar scrolls away below sm" → `?map=off`, because it
        `window.scrollTo`s and **the riviera map is fixed to the viewport, so the document does
        not scroll**. This one is a *handover*, not a move: it is a shell guarantee, and after
        #1168 deletes the pre-Q page it needs a different scrolling tourist route rather than
        deletion. Called out in the PR so #1168 does not drop it.
- [ ] **Step 5: Run** — `npx ng test --watch=false --include="src/app/pages/home/**"` → PASS, and
      the mocked e2e suite → PASS, **both before the inversion**. A red here means the move
      changed something it should not have.
- [ ] **Step 6: Commit** — `git commit -m "Move the pre-Q Discover coverage onto ?map=off (#1167)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 1 — Invert the flag; strip it from Q's setups

**Files:** Modify `frontend/src/app/pages/home/home.ts` (the flag + its TSDoc) · `frontend/src/app/pages/home/home.html` (the shared-template comment) · `frontend/src/app/pages/home/home.spec.ts` · `frontend/src/app/pages/home/home.a11y.spec.ts` · `frontend/e2e/discover-sheet.e2e.ts` · `frontend/e2e/discover-map.e2e.ts` · `frontend/e2e/panel-glass-inks.e2e.ts`

- [ ] **Step 1: Write the failing tests** — the route contract, as its own four cases in
      `home.spec.ts`'s sheet describe (AC-1 – AC-4): no parameter → the sheet at a phone and the
      panel from `lg`; `?map=sheet` → the sheet (a no-op); `?map=off` → the pre-Q page. The
      existing `it('without ?map=sheet the page is today's Discover')` (`:1691`) is what becomes
      the `?map=off` case, so nothing is lost. In the same step, drop `{ map: 'sheet' }` from
      `sheetPage()` (`:1623`), `panelPage()` (`:2329`), `:1702` and
      `home.a11y.spec.ts:279`, and from `discover-sheet.e2e.ts:104`/`:698`,
      `discover-map.e2e.ts:981` and `panel-glass-inks.e2e.ts:76` — Q's suites now assert the
      default page (AC-5).
- [ ] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/pages/home/home.spec.ts"` → FAIL on the three new default-route cases and on every flag-stripped case.
- [ ] **Step 3: Minimal implementation** — in `home.ts`, `SHEET_FLAG` gives way to `OFF_FLAG`:

```ts
/**
 * `?map=off` falls back to the pre-Q Discover page for one release — the comparison lever while
 * Q · Shore soaks on the deployed site. Any other value, the old `?map=sheet` among them, is the
 * riviera map. #1168 removes the parameter and the page it reaches.
 */
const OFF_FLAG = 'off';
```

```ts
this.mapFlag.set(this.route.snapshot.queryParamMap.get('map') !== OFF_FLAG);
// …and in the queryParamMap subscription:
this.mapFlag.set(params.get('map') !== OFF_FLAG);
```

- [ ] **Step 4: Run it, verify it passes** — `npx ng test --watch=false --include="src/app/pages/home/**"` → PASS, then the whole unit suite → PASS.
- [ ] **Step 5: Generalization-audit pass** — mechanism: *a spec that reaches Discover without
      saying which design it means*. Enumerate every one, not only the ones that went red, and
      judge each; log the command below.
- [ ] **Step 6: Commit** — `git commit -m "Q · Shore is the Discover default; ?map=off is the way back (#1167)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 2 — The default route's e2e (AC-7, AC-9)

**Files:** Modify `frontend/e2e/discover-sheet.e2e.ts` · Test: the same file

- [ ] **Step 1: Write the failing test** — AC-7, in the poster describe: at 390 × 844 with no
      query parameter, the poster image and at least one priced pin are wholly inside the first
      screen (`box.y + box.height <= 844`, `box.y >= 0`), and the pin carries a price.
- [ ] **Step 2: Run it, verify it fails** — on `main`'s flag it fails at the first assertion (the
      pre-Q page paints no poster); write it after phase 1 and it is a genuine new-behaviour test.
- [ ] **Step 3: Minimal implementation** — none; the behaviour ships from #1158/#1159. If the
      test is red after phase 1, that is a real defect and it is fixed here.
- [ ] **Step 4: Run it, verify it passes** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-sheet.e2e.ts` → PASS, then the whole mocked suite → PASS. AC-9's cost test rides the same run with `page.goto('/')`.
- [ ] **Step 5: Generalization-audit pass** — as phase 1 if anything was fixed.
- [ ] **Step 6: Commit** — `git commit -m "Pin the default Discover route's first screen and its poster cost (#1167)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 3 — Docs freshness + close-out

**Files:** Modify `CONTEXT.md` · `docs/plans/q-shore-discover-default.md` · Delete `docs/plans/accent-ink-on-glass.md`

- [ ] **Step 1:** Run `riviera-docs-freshness` over the PR's resolved range. Known finding
      already: `CONTEXT.md`'s **Venue sheet** and **Venue panel** entries say "Behind the map flag
      on Discover" / "the same flag lays the same list out as the venue panel" — after this slice
      the flag is the *exit*, not the entrance.
- [ ] **Step 2:** `git rm docs/plans/accent-ink-on-glass.md` — its PR #1166 merged, so it is
      retired at this close-out (`riviera-docs-freshness` § *Plan-doc retirement*).
- [ ] **Step 3:** Finalize this plan's Execution status, ACs and PR-gate boxes in the PR's last
      code-touching commit, citing `merged via PR #NN`.

---

## Docs-freshness report

Range `95341fd76f293354b5fb6144b191b287a957ec5e..HEAD`. Fact changes: `?map=sheet` was the way
**in** to the riviera map → `?map=off` is the way **out**; `/` renders the map; `SHEET_FLAG` →
`OFF_FLAG`; `TouristRouteData` gains `footer`. Four findings, all present-tense facts that were
true only while the flag defaulted off, all patched in place:

| Doc:line | Stated fact | Contradicted by | Action |
|---|---|---|---|
| `CONTEXT.md` **Venue sheet** | "Behind the map flag on Discover, below `lg`; from `lg` the same flag lays the same list out as the venue panel" | the sheet and the panel *are* what Discover renders | rewritten; `?map=off` named as the way back |
| `CONTEXT.md` **Coast picker** | "the coast is not a state on any screen the flag lays out" | there is no flag laying screens out any more | clause dropped; the claim itself still holds |
| `CONTEXT.md` **Pin preview** | "the compact card a tourist opens from a venue's pin on the Discover riviera map" | no card opens on the page that ships — the row is the preview | scoped to `?map=off`'s map, with the row named |
| `CONTEXT.md` **Pin crowd** | a crowd press "narrows the Beach filter (undone by the crumb on the map)" | the sheet and the panel have neither filter bar nor crumb | split: the head's beach chip there, the filter + crumb on `?map=off` |

Counting sweep (§2b): the slice made `footer: false` the **second** `TouristRouteData` chrome
flag beside `tabBar: false`. Swept `CONTEXT.md`, `RESPONSIBILITIES.md`, both `CLAUDE.md`s,
`docs/adr`, `docs/agents`, `.claude/skills` and `frontend/src/app/app.ts` for `the/both/only two`
near flag/chrome/route-data/tab-bar/footer/shell wording: the one hit is ADR-0003's two **pools**,
unrelated. No doc states a count of chrome flags, and none claims the footer is on every route.

`platform/` and the backend docs are untouched by this slice, so nothing there was swept.

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | phase 0 | *A spec that reaches Discover without saying which design it means* — every navigation to `/` in the mocked suite and every unit describe that renders `Home` | `grep -rn "page.goto('/'" e2e/*.e2e.ts e2e/support/*.ts` + `grep -rln "from './home'" src` | 31 e2e files, 6 unit describes | 15 e2e files and 4 describes moved to `?map=off`; 4 repointed at what they measure rather than their page; the rest left on `/` deliberately |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-6b:** `npx ng test --watch=false --include="src/app/pages/home/**"` → PASS.
- [ ] **AC-7, AC-9:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS.
- [ ] **AC-8:** `npm run test:a11y` → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section filled or justified N/A; concurrency test present (#2).
- [ ] Pool + cutoff honoured (#3, #4). Money minor units (#5). UTC stored, `Europe/Tirane` reasoned (#6). Codes unguessable (#7).
- [ ] Modulith section filled; no cross-module `application.*`/`adapter.*` imports; id-based payloads (#11).
- [ ] Payment section filled or N/A; webhooks are truth; idempotent; payout exactly-once (#8, #9). Refund policy server-side (#10).
- [ ] Flyway migration present; invariant-enforcing constraints tested (#12).
- [ ] Frontend standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
