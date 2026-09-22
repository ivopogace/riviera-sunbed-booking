# Remove the pre-Q Discover page and the map flag — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Discover consults no query parameter at all — the pre-Q hero/filters/switch/preview
arm, the `?map=off` opt-out and the flag plumbing are deleted, the template picks between two
arms by viewport width alone, and every assertion the old arm carried either moves onto the
shipped design or is recorded in the parity ledger as deliberately dropped.

**Architecture:** Slice 4 (#1167) inverted the flag rather than removing it, which left one
`Home` class serving three arms and 88 e2e sites asking for `?map=off`. The pre-Q page is an
`@else` arm of `home.html`, not a separate component, so this is a surgical edit of
`home.ts`/`home.html` plus one clean five-file deletion (`venue-preview-card.*`). The ordering
is the whole design: **coverage moves first**, in three e2e phases that are green against the
shipped page before any source is deleted, then the red unit specs, then the deletion that
turns them green.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration; frontend-only slice.

**Source of intent:** GitHub issue #1168 (slice 5 of epic #1156); the #1173 handover comment on
#1168; epic #1156 § *Out of scope*.

**Skills consulted:** `riviera-sdlc` (intake gate: caught that the issue names 3 e2e files
where the tree has 13, that the epic's close-out note points at an already-retired plan, and
that the `?map=off` population must be re-swept rather than taken from the handover) ·
`riviera-plan-doc` (forced the behaviour-parity ledger, which is what turns "retire
`discover-map.e2e.ts`" into a per-test verdict) · `tdd` (phases 3→4 are the red/green pair:
the inert-parameter specs fail while the flag exists) · `riviera-review-overlay` (review gate,
phase 6) · `riviera-docs-freshness` (close-out, over the **epic** range per #1168's close-out
note) · `riviera-frontend` (`pages/home/` placement; the two-suite e2e split; that
`/account/sign-in` is the surviving tourist-theme surface for the rehomed field test) ·
`riviera-tailwind` (rule 2's worked example **is** `--riv-hero-scrim`, so the skill prose is in
this diff; `--riv-hero-shadow` is NOT dead and stays) · `playwright-cli` (e2e authoring for the
three rewrite phases) · `riviera-local-debug` (unshallowed the clone before any history claim;
scoped the test runs) · `domain-modeling` (owns `CONTEXT.md`: retired the **Pin preview** term
and corrected three others off the flag) · `code-review:code-review` (the review gate's rung 1,
five parallel agents over `a94a1738..b38782be`; findings F-5…F-9).

**Branch:** `claude/sdlc-1168-ngou93` — the cloud session's designated branch, standing in for
`feature/discover-pre-q-removal`. Exists before phase 0.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a tourist at 390 × 844, when Discover is entered as `/?map=off`, then the
      riviera-map sheet renders exactly as it does for `/` — `sheet-scroller` present,
      `view-switch` and `filter-beach` absent — and nothing throws.
      *Seam:* the `''` route's rendered page · *Pinned by:*
      `home.spec.ts` › `the map query parameter is inert` › `?map=off renders the sheet below lg`
- [x] **AC-2:** Given a tourist at 1440 × 900, when Discover is entered as `/?map=off` or
      `/?map=sheet`, then the pinned desktop panel renders (`desk-panel` present, `map-panel`
      absent). *Seam:* the `''` route's rendered page · *Pinned by:*
      `home.spec.ts` › `the map query parameter is inert` › `?map=off and ?map=sheet render the panel from lg`
- [x] **AC-3:** Given the `Home` component, when its template is rendered at either width, then
      the arm is chosen by `wide()` alone: `sheetMode === !wide`, `panelMode === wide`, and the
      class exposes no `view`, no `listShown`, no `mapOpen` and no `mapFlag`.
      *Seam:* `Home`'s rendered template + protected surface · *Pinned by:*
      `home.spec.ts` › `the two arms are chosen by width alone`
- [x] **AC-4:** Given the repository, when `VenuePreviewCard` is searched for, then its five
      files are gone and no module imports it or renders `app-venue-preview-card`.
      *Seam:* the Angular module graph · *Pinned by:* `npm run build` + `npm run lint` (an
      unresolved import fails the compile), and `discover-sheet.e2e.ts` › `no preview card is
      rendered on any Discover surface` asserting `venue-preview` count 0 at a phone **and** a
      desktop width.
- [x] **AC-5:** Given the mocked e2e suite, when `discovery-flow.e2e.ts` runs, then the tourist
      discovery journey — pick a beach, change the day, reach a venue, reach the empty state —
      is driven through the sheet's head (`head-place`, `head-beaches`, `head-day`) with no
      `filter-beach`, `filter-region`, `filter-date`, `view-switch` or `results` testid in the
      file. *Seam:* the `''` route at 390 × 844 · *Pinned by:* `discovery-flow.e2e.ts`
- [x] **AC-6:** Given the mocked e2e suite, when `touch-targets-tourist.e2e.ts` runs, then the
      44 px floor is swept over the sheet's head and grabber and the desktop panel's controls,
      not the old filter bar's, and no case reaches its subject through `view-map`.
      *Seam:* the `''` route at 390 × 844 and 1440 × 900 · *Pinned by:*
      `touch-targets-tourist.e2e.ts`
- [x] **AC-7:** Given `discover-map.e2e.ts`, when it runs, then every test loads `/` with no
      query parameter, and the near-me arms, pin/preview mechanics, crowd walking and the
      real-engine same-origin guards assert against the shipped sheet and panel.
      *Seam:* the `''` route · *Pinned by:* `discover-map.e2e.ts`; the per-test verdicts are the
      behaviour-parity ledger below, reproduced in the PR body.
- [x] **AC-8:** Given `frontend/`, when `grep -rn "map=off\|map=sheet\|OFF_FLAG" src e2e` runs,
      then it reports only the AC-1/AC-2 spec bodies that prove inertness — no `goto`, no
      `convertToParamMap`, no source read. *Seam:* the tree · *Pinned by:* the phase-4
      verification command, recorded in the generalization-audit log.
- [x] **AC-9:** Given the three themes, when `--riv-hero-scrim` is searched for, then it is gone
      from `tailwind.css`'s base, `riviera` and `dark` blocks, from the two comments that cite
      it for other tokens, and from `riviera-tailwind` rule 2 — while `--riv-hero-shadow` /
      `--text-shadow-riv-hero` remain, because `venue/venue-map.html:82` still wears them.
      *Seam:* `src/tailwind.css` + the skill prose · *Pinned by:* `npm run test:a11y` (the
      contrast specs compile without the `heroScrim` model) and the AC-9 grep in the audit log.
- [x] **AC-10:** Given a full local gate run, when `npm run lint`, `npm run format:check`,
      `npm test`, `npm run test:a11y`, `npm run test:eslint-rules`, `npm run test:e2e:a11y` and
      `npm run build` are run, then all pass, and the five `scripts/check-*.mjs` guards exit 0
      against `origin/main`. *Seam:* the CI job set · *Pinned by:* the PR's green CI run.

## Non-goals

- Removing the `/prototype/map` route from the bundle — epic #1156 § *Out of scope*, its own issue.
- The shoreline snap in the operator's pin placer — epic § *Out of scope*.
- Any change to what Q · Shore *does*. This slice deletes the loser; the sheet, poster, pin
  layer, coast picker and panel behaviour are untouched. Phase 4 is subtraction only.
- Re-opening decisions the epic settled: no card over the map, a region never the whole coast,
  the coast picker as the only coast chooser, no whole-coast map state.
- Fixing #1175 (the pre-existing `discover-sheet.a11y.spec.ts` flake, reproduces on `main`).
- Any backend, table, money or booking-path change.

## Behavior-parity ledger

> Every behaviour the pre-Q arm carried, with a verdict. The `discover-map.e2e.ts` rows are
> reproduced in the PR body — AC-7 and the issue's sixth AC both demand that no coverage is
> silently dropped.

### The page's own behaviours

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Hero: chip, dashed rule, title, intro | **dropped** | Q's first screen is the map. The epic's Problem section is written against this hero; deleting it is the slice's point. |
| Beach `<select>` (`filter-beach`) | **changed** | The sheet head's beaches chip (`head-beaches`) + the beach rail; on the panel, the same head. |
| Region `<select>` (`filter-region`) | **changed** | The coast picker (`head-place` → `coast-picker`), which the epic made the only coast chooser. |
| Date `<select>` (`filter-date`) | **changed** | The head's day control (`head-day`) + the day rail. |
| Live result count (`bar-count`) | **changed** | The head's subtitle carries "N selling today" (invariant #4, rendered not changed). |
| List/Map switch (`view-switch`, `view-list`, `view-map`) | **dropped** | Two arms by width alone: below `lg` the list is a sheet **over** the map, so there is nothing to switch between. |
| `list-panel` / `map-panel` `[hidden]` pair | **dropped** | Same reason; `sheet-scroller`'s three rests replace the binary. |
| `rescueFocusFromHiddenPanel` | **dropped** | It existed only to unstrand focus when the switch hid the panel holding it. No hidden panel, no rescue. |
| Preview card over the map (`venue-preview`, `preview-*`) | **dropped** | **The row is the pin's preview** — Q's rule on both surfaces, settled over fourteen prototype rounds, epic § *not to be reopened*. |
| `map-beach-crumb` (the way back from a place pill) | **changed** | The head's beaches chip carries `aria-current` when narrowed and resets on press. |
| `results` live region | **changed** | `sheet-outcome` (sheet) / `desk-outcome` (panel). |
| Shared `#venueCardTpl`, `#skeletonTpl`, `#failureTpl` | **preserved** | The sheet arm already renders all three; only the pre-Q call sites go. |
| Empty state (`empty`) | **preserved** | Three producers; the sheet's and panel's survive. |
| Failure panel + Retry | **preserved** | `#failureTpl` is shared by all three arms. |
| `--riv-hero-scrim` (riviera-only gradient) | **dropped** | Its only consumer was `home.html:601`. A token with no user is a dead ledger entry. |
| `--riv-hero-shadow` / `--text-shadow-riv-hero` | **preserved** | `venue/venue-map.html:82` still wears it — **not** dead, do not sweep. |

### `discover-map.e2e.ts`, per test

> Describes **D** (`the riviera map's pins keep off the chrome`, L993) and **E** (`the desktop
> panel`, L1050) already load `/` and are untouched, except E's `?map=off leaves today's
> Discover at the same width` (L1225), which is the flag's own guard and dies with it.

| Old test (line) | Verdict | Where it lands |
|---|---|---|
| A: map chrome labelled/skippable/axe-clean; switch alternates panels (188) | **split** | Chrome, skip-link and axe assertions → rewritten on `/` at 390; the switch half **dropped** (no switch). |
| A: credit inset on the narrowest phone (223) | **preserved** | Same assertions on `/` at 344 × 882. |
| A: centres on a granted position, marks the spot (239) | **preserved** | `/` at 390; `sheet-near-me` replaces `map-near-me`. |
| A: reports a declined permission (255) | **preserved** | Same, via `sheet-near-me`. |
| A: near-me message dismissible (277) | **preserved** | Same; `head-note` / `head-note-dismiss` are the shipped ids. |
| A: a pin per pinned venue, priced, none without a location (300) | **preserved** | `/` at 390, `map-venue-pin` unchanged. |
| A: a pin opens its preview → beach map with the date (322) | **changed** | The row is the preview: press the pin, assert the row lights and scrolls to top, then the row's link carries the date. |
| A: one preview at a time, Escape closes with focus back (351) | **changed** | Row selection is single by construction; the Escape/focus leg moves onto the lit row. |
| A: tapping the map closes the preview (374) | **dropped** | No card to close. The row stays lit — Q's deliberate behaviour. |
| A: marks the selected venue's card in the list (387) | **preserved** | This *is* Q's rule; asserted on `sheet-rows`' `aria-current`. |
| A: re-feeds pins from one further request on a filter change (400) | **preserved** | Driven from `head-beaches` instead of `filter-beach`; the one-extra-request assertion is the point and is kept. |
| A: the map follows the Beach filter (424) | **preserved** | Driven from the head's beach rail. |
| A: pins keep double-tap on a double-tap-to-zoom map (452) | **preserved** | `/` at 390. |
| A: pins + open preview stay accessible, credit visible (463) | **changed** | Re-aimed at the sheet at its rests: the lit row and the credit, touch targets + axe. |
| A: list and map side by side on a wide screen, no switch (486) | **dropped** | Describe E already owns the panel geometry on `/` (L1085, three widths). Duplicate. |
| B: crowded pins group into a place pill (526) | **preserved** | `/` at 390. |
| B: press a place → pins separate, filter follows, crumb is the way back (555) | **changed** | The head's beaches chip is the filter *and* the way back; the crumb leg asserts the chip's `aria-current` and its reset. |
| B: press through the venues, the pill inverts and walks the previews (592) | **changed** | The stepper walks **rows**, not preview cards: `preview-stack-*` → the lit row's position in `sheet-rows`. |
| B: a keyboard reaches every venue in a crowd, in feed order (675) | **preserved** | Tab from pill → member, Enter, Escape; the target of Enter is the row. |
| C: the map fills its panel under the engine's stylesheet (708) | **preserved** | `/` — real-engine describe moves wholesale. |
| C: the list renders and works before the map asks for anything (725) | **preserved** | Stronger on `/`: the poster guarantees it. |
| C: credits the tiles exactly as the committed style does (753) | **preserved** | Unchanged. |
| C: the map open on Discover makes no request to a third party (773) | **preserved** | Unchanged; the preview leg re-aimed at the row. |
| C: a granted near-me sends the position nowhere (829) | **preserved** | Unchanged — the privacy guard, kept verbatim. |
| E: `?map=off` leaves today's Discover at the same width (1225) | **dropped** | Replaced by AC-2's unit spec, which asserts the parameter is inert. |
| `discover-sheet.e2e.ts`: `?map=off leaves today's Discover…` (263) | **dropped** | Same; replaced by AC-1/AC-2 and AC-4's count-0 guard. |
| `theme-shell.e2e.ts`: `paints the hero in riviera only` (65) | **dropped** | The hero and its token are gone; there is nothing to measure. Recorded here rather than silently deleted. |
| `theme-shell.e2e.ts`: native field scheme follows the field tokens (93) | **rehomed** | `/account/sign-in`'s `auth-identifier` — `appFieldGlass` on a tourist-theme route, the only surviving surface that can show the riviera branch (console routes never wear `riviera`). |
| `mobile-zoom-tourist.e2e.ts`: the List/Map switch case (170) | **changed** | Re-aimed at the sheet's grabber and rests, the shipped equivalent of "a control that changes what fills the screen". |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Coverage evaporates: an assertion only the old arm carried is deleted with it, and the suite is green because nothing asserts it any more. | High | High | Phases 0–2 land the rewritten e2e **before** phase 4 deletes anything. Every retired `test()` has a ledger row above; the PR body reproduces the `discover-map.e2e.ts` table. | this slice | closed — merged via PR #1184 |
| R-2 | The token sweep over-reaches and silently restyles a live surface. Concrete near-miss: `--riv-hero-shadow` looks hero-only but `venue/venue-map.html:82` wears it. | Medium | High | Enumerate each candidate's consumers by command before deleting; log the command in the generalization-audit table. AC-9 names the keep explicitly. | this slice | closed — merged via PR #1184 |
| R-3 | The sweep under-reaches: a token or class the old arm was the last user of survives as a dead ledger entry. | Medium | Low | Re-run the enumeration after the deletions expecting zero consumers; reconcile `docs/design/colour-literal-token-audit.md`. | this slice | closed — merged via PR #1184 |
| R-4 | A bookmark carrying `?map=off` throws or 404s instead of being ignored. | Medium | Medium | AC-1/AC-2 pin both spellings as inert at both widths, asserted on the rendered page rather than on the absence of a signal. | this slice | closed — merged via PR #1184 |
| R-5 | A spec parked on `?map=off` because it needed *some* page, not the pre-Q page, is deleted as collateral — the failure the #1173 handover caught once for `tourist-tab-bar.e2e.ts`. | Medium | High | Re-sweep the population on **this** tree (the handover is a snapshot at #1174) and classify every site by subject before touching it. Phase 0 exists for exactly this. | this slice | closed — merged via PR #1184 |
| R-6 | `riviera-tailwind` rule 2 cites `--riv-hero-scrim` as its only in-tree treatment-off example; deleting the token strands the rule. Two `tailwind.css` comments cite it for *other* tokens. | High | Low | AC-9 puts the skill prose and both comments in this diff, re-worded rather than deleted. | this slice | closed — merged via PR #1184 |
| R-7 | #1175 (pre-existing `discover-sheet.a11y.spec.ts` flake, reproduces on `main`) is read as a regression this slice caused, or masks one. | Medium | Low | Confirm against `main` before diagnosing; never "fix" it here — it has its own issue. | #1175 | closed — not this slice's; reproduces on `main` |
| R-8 | Phase 4 is meant to be pure subtraction, but an edit to a shared template (`#venueCardTpl`, `#skeletonTpl`, `#failureTpl` — all used by the surviving arms) restyles the shipped design. | Medium | High | Those three templates are not edited, only their pre-Q call sites. Proven by the sheet/poster/panel specs and `discover-sheet.e2e.ts` passing untouched across phase 4. | this slice | closed — merged via PR #1184 |
| R-9 | The e2e default viewport is 1280 (`Desktop Chrome`), above `WIDE_VIEWPORT` (1024). On `/` that is the **panel** arm, which renders `venue-row` and no `venue-card` — so a collateral spec that merely drops `?map=off` goes green-to-red for a reason unrelated to its subject. | High | Medium | Phase 0 sets an explicit phone viewport on the card-measuring specs rather than re-selecting onto `venue-row`, so the assertion measures the same shared `#venueCardTpl` it always did. | this slice | closed — merged via PR #1184 |
| R-10 | jsdom has no `matchMedia`, so `wide()` stays `false` and every unit spec sees the sheet arm. AC-2/AC-3's desktop cases are untestable unless `matchMedia` is stubbed. | High | Medium | Reuse the stub the existing sheet/panel specs already use in `home.spec.ts`; AC-3 asserts the predicates, not only the DOM. | this slice | closed — merged via PR #1184 |

## Open questions / Assumptions

- **Assumption:** `discover-map.e2e.ts` is **rewritten onto the shipped design**, not retired
  into `discover-sheet.e2e.ts`. The issue's sixth AC permits either. Rewriting wins on the
  evidence: two of the file's five describes (D and E, L993–1233) *already* run on `/`, so the
  file is not a pre-Q artefact; and folding ~700 surviving lines into a 929-line
  `discover-sheet.e2e.ts` would make one 1,600-line file where the repo's e2e split is by
  subject. — *Owner:* this slice · *Resolves by:* stated in the PR body with the ledger table.
- **Assumption:** `theme-shell.e2e.ts`'s field-scheme test rehomes to `/account/sign-in` rather
  than being dropped. The riviera map renders no native field, and console routes never wear
  the `riviera` theme, so `/account/sign-in`'s `auth-identifier` (`appFieldGlass`,
  `data-testid` already present) is the only surface that can still show all three themes'
  field chrome. — *Owner:* this slice · *Resolves by:* phase 0.

### Resolved

- **`discover-map.e2e.ts` rewritten, not retired** — outcome: describes A/B/C moved onto `/`;
  D and E already ran there. Stated in the PR body with the per-test ledger. Closed at the
  phase-2 commit.
- **`theme-shell.e2e.ts`'s field-scheme test rehomed to `/account/sign-in`** — outcome: the
  riviera map renders no native field and console routes never wear `riviera`, so
  `auth-identifier` is the only surface that can still show all three themes' field chrome.
  Closed at the phase-0 commit.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice deletes a rendering arm and a query-parameter
read; it writes no table and touches no booking, claim or pool path. Invariant #4 stays
rendered-not-changed exactly as slice 4 left it: the head's "N selling today" and the dusk
pin/row still read each venue's `sales_close` for today, and neither the pay nor the confirm
path appears in the diff. Invariant #6 is likewise untouched — the head's clock is still
`Europe/Tirane`, read by code this slice does not edit.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is in the diff, so the structural net is not
due.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money moves; no ledger, refund, commission or Stripe surface is
touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/home.ts` | existing | page component | `mapFlag`, `view`, `listShown`, `mapOpen` signals deleted; `sheetMode`/`panelMode` become `!wide()`/`wide()` | none |
| FE-2 | `pages/home/home.html` | existing | template | three arms → two; the `@else` arm (595–827) deleted | none |
| FE-3 | `pages/home/venue-preview-card.*` | existing | component (5 files) | **deleted** | none |
| FE-4 | `app.routes.ts` | existing | route data | unchanged flags (`footer: false`, `wide: true`); their `?map=off` justification rewritten | none |
| FE-5 | `src/tailwind.css` | existing | tokens | `--riv-hero-scrim` removed from all three blocks; two citing comments re-worded | none |

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or client type moves; the surviving arms request
exactly what they requested before.

## Execution status

**Stage pointer:** DONE — merged via PR #1184.

**Next action:** none; the slice is closed out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Collateral e2e re-pointed off the flag | ✅ | phase-0 commit |
| 1 — `discovery-flow` + `touch-targets-tourist` onto the shipped design | ✅ | phase-1 commit |
| 2 — `discover-map.e2e.ts` rewritten onto `/` | ✅ | phase-2 commit |
| 3 — RED: the parameter is inert; two arms by width | ✅ | phase-3/4 commit |
| 4 — GREEN: delete the flag, the arm and `VenuePreviewCard` | ✅ | phase-3/4 commit |
| 5 — Retire `--riv-hero-scrim`, the hero classes and the stranded citations | ✅ | phase-5 commit |
| 6 — Gates, close-out, epic docs-freshness | ✅ | merged via PR #1184 |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | intake gate | The issue names 3 e2e files; the tree has 13 touching `?map=off`. Recorded on the issue. | fixed — all 13 moved |
| F-2 | intake gate | The epic's close-out note says retire `docs/plans/pin-layer-placement.md`; already retired at #1166. The plan this close-out must `git rm` is `shell-header-wide-route.md` (PR #1182, merged). | done — retired in this commit |
| F-3 | CI (Repo hygiene) | `check-inline-comments.mjs` failed on four multi-line inline comments and two "no longer" narrations the phase 0–4 commits introduced. | fixed in the phase-5 window |
| F-4 | CI (Frontend) | `theme-shell.e2e.ts`'s pre-navigation paint test identified the Discover chunk by the `filter-beach` testid, which this slice deletes, so it withheld nothing and the assertion went vacuous-then-red. Re-pointed at `sheet-ground`. | fixed |
| F-5 | review gate | `discover-map.e2e.ts`'s "one row at a time" check used `filter({ has: … })`, which matches a *descendant*; `aria-current` is on the row's own root, so the locator was always empty and the assertion could never fail. Replaced with the file's own `litRow()` helper. | fixed |
| F-6 | review gate | Three computeds outlived the arm that read them — `isEmpty`, `selectedCard`, `crowdStack`, the last with TSDoc still describing the preview card's stepper. Deleted, and added to the spec that pins the retired members' absence. | fixed |
| F-7 | review gate | `lastLoad`'s TSDoc still claimed `loadInitial` re-seeds the filter selects and `reload` preserves the beach/region filter; neither exists. Rewritten. | fixed |
| F-8 | review gate | `home.contrast.spec.ts` kept `fieldFill`/`fieldBorder` on every theme and a doc clause promising a field-border deviation, with no assertion left reading either. Both removed. | fixed |
| F-9 | review gate | Two comments referred to things a fresh session cannot resolve — `litRow`'s "on either arm" (the selector is the panel's only) and "where the old select cost exactly one". Both restated as the current contract. | fixed |

---

## File structure

- `docs/plans/discover-pre-q-removal.md` — this plan (exempt from the guard).
- `frontend/src/app/pages/home/home.ts` — flag, `view`/`listShown`/`mapOpen`, the pre-Q-only members and the `FieldGlass`/`VenuePreviewCard` imports removed; both predicates reduced to `wide()`.
- `frontend/src/app/pages/home/home.html` — the `@else` arm (595–827) removed; the three shared templates kept.
- `frontend/src/app/pages/home/home.spec.ts` — the four `PRE_Q` describes and the flag block removed; the AC-1/2/3 describes added.
- `frontend/src/app/pages/home/home.a11y.spec.ts` — the pre-Q describe removed.
- `frontend/src/app/pages/home/home.contrast.spec.ts` — the hero, field and switch cases and the `heroScrim`/`heroInk`/`heroBackdrop` models removed.
- `frontend/src/app/pages/home/venue-preview-card.ts` — deleted.
- `frontend/src/app/pages/home/venue-preview-card.html` — deleted.
- `frontend/src/app/pages/home/venue-preview-card.spec.ts` — deleted.
- `frontend/src/app/pages/home/venue-preview-card.a11y.spec.ts` — deleted.
- `frontend/src/app/pages/home/venue-preview-card.contrast.spec.ts` — deleted.
- `frontend/src/app/app.routes.ts` — the `''` route's `?map=off` comments rewritten.
- `frontend/src/tailwind.css` — `--riv-hero-scrim` retired from the base, `riviera` and `dark` blocks; the two comments citing it re-worded.
- `frontend/e2e/discover-map.e2e.ts` — describes A/B/C rewritten onto `/`; E's flag guard removed.
- `frontend/e2e/discover-sheet.e2e.ts` — the flag guard replaced by the AC-4 count-0 guard.
- `frontend/e2e/discovery-flow.e2e.ts` — the journey re-driven through the sheet's head.
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the sweep re-aimed at the sheet and panel controls.
- `frontend/e2e/discover-photos.e2e.ts` — re-pointed at `/` at a phone viewport.
- `frontend/e2e/theme-shell.e2e.ts` — the hero-scrim test dropped; the field-scheme test rehomed to `/account/sign-in`.
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — the switch case re-aimed at the sheet's grabber.
- `frontend/e2e/sun-token.e2e.ts` — re-pointed at `/`.
- `frontend/e2e/operator-venue-season.e2e.ts` — re-pointed at `/` at a phone viewport.
- `frontend/e2e/same-day-booking.e2e.ts` — re-pointed at `/` at a phone viewport.
- `frontend/e2e/loading-announcements.e2e.ts` — re-pointed at `/`, `results` → `sheet-outcome`.
- `frontend/e2e/solid-fill-token-skin.e2e.ts` — re-pointed at `/` at a phone viewport.
- `frontend/e2e/panel-glass-inks.e2e.ts` — re-pointed at `/` at a phone viewport.
- `CONTEXT.md` — the **Pin preview** term retired; **Pin crowd**, **Venue sheet** and **Sheet head** corrected off the flag.
- `docs/design/colour-literal-token-audit.md` — the sun family recounted at this slice.
- `.claude/skills/riviera-tailwind/SKILL.md` — rule 2's stranded `--riv-hero-scrim` example replaced.
- `docs/plans/shell-header-wide-route.md` — deleted at close-out (PR #1182 merged); nothing outside `docs/plans/` cited it.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-22 | intake gate | Every site reading the map flag, by mechanism "names the query parameter or its constant" | `grep -rn "map=off\|map=sheet\|map: 'off'\|map: 'sheet'\|OFF_FLAG\|mapParam" frontend/src frontend/e2e` | 95 lines / 22 files (3 false positives: `beach-map`, `off-map`) | Classified by subject; 13 e2e files + 4 source files are in scope. Phases 0–4. |
| 2026-09-22 | phase 5 | Every token the retired arm might have been the last user of, by mechanism "a `--riv-*` custom property the hero or the filter bar consumed" | `grep -rn "riv-hero-scrim\|riv-hero-shadow\|text-shadow-riv-hero" frontend/src docs .claude` | `--riv-hero-scrim`: 1 consumer, the hero — dead. `--riv-hero-shadow`: 2 consumers, one of them `venue/venue-map.html:82` — alive | Retired the scrim from all three theme blocks and repointed the three citations it stranded; kept the shadow. |
| 2026-09-22 | phase 5 | Every marker class the retired arm might have been the last user of, by mechanism "an inert class a spec queries" | `for c in hero hero-chip … venue-grid map-panel; do grep -rn "\b$c\b" src; done` | 12 orphaned; `venue-grid` was the one still in the tree, on the shared skeleton, with no consumer left | Removed it; `field-label` kept (`booking-dialog.ts` still wears it). |
| 2026-09-22 | phase 5 | The counting sweep over `--riv-sun-grad`, whose ledger entry claims "three" | `grep -rn "riv-sun-grad" frontend/src --include=*.html --include=*.ts` | 4 live consumers after the deletion, 5 before — the ledger's three predates `venue-row` (#1159) | Corrected `colour-literal-token-audit.md` with the recount and the unchanged role split. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 / AC-2 / AC-3:** `npm test -- --watch=false --include="src/app/pages/home/home.spec.ts"` → PASS.
- [x] **AC-4:** `npm run build` → PASS; `grep -rn "VenuePreviewCard\|venue-preview-card\|app-venue-preview-card" frontend/src` → no hits.
- [x] **AC-5 / AC-6 / AC-7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → PASS.
- [x] **AC-8:** `grep -rn "map=off\|map=sheet\|OFF_FLAG" frontend/src frontend/e2e` → only the inertness specs.
- [x] **AC-9:** `grep -rn "riv-hero-scrim" frontend docs .claude` → no hits; `grep -rn "text-shadow-riv-hero\|riv-hero-shadow" frontend/src` → still present with `venue-map.html` among the consumers.
- [x] **AC-10:** the PR's CI run green on the head commit.

**Sonar note (gate applied, not skipped).** On head `b38782be`: `new_lines` 31, so the gate
reached this diff rather than falling outside `sonar.sources`; `new_coverage` 100.0 %,
`new_duplicated_blocks` 0, `new_duplicated_lines_density` 0.0 %, `new_bugs` /
`new_vulnerabilities` / `new_code_smells` all 0, and the issues API returns `total: 0`. The
`SonarCloud Code Analysis` check run concluded `success`, so none of the three false zeros
applies.

## Self-review checklist

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] No JPA (#1). Availability section justified N/A; no concurrency path touched (#2).
- [x] Pool + cutoff untouched (#3, #4). No money (#5). No clock change (#6). No codes (#7).
- [x] Modulith section justified N/A — frontend-only (#11).
- [x] Payment section justified N/A (#8, #9, #10).
- [x] No Flyway migration in scope (#12).
- [x] Frontend standards met; no `as any`; the two-suite e2e split respected.
- [x] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [x] `shell-header-wide-route.md` retired in the same commit.
- [x] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay).
