# Desktop panel row wears dusk — Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** A venue whose online sales for the selected day have closed is visible as closed on the
Discover **desktop panel** row — desaturated and badged — exactly as it already is on the phone
sheet's card, so invariant #4 is never conveyed to a sighted desktop user by nothing at all.

**Architecture:** The row already receives the whole `VenueCard`, which carries `salesClosed`,
`closedForSeason` and `reopensOn` — so no binding, page or model change is needed; the defect is
purely that `venue-row.html` renders neither carrier. Dusk on the row is the design record's
shape (`prototype-venue-row.ts` on the spike branch `claude/map-design-prototype-417sh1`
@ `2cf675da`): `saturate-0` on the row anchor, and the **price gives way** to a semantic chip in
its own slot on the name line — which is what keeps the panel's 92 px row height, and with it the
panel-geometry proofs, unchanged.

**Persistence:** N/A — frontend-only, no table, no migration.

**Source of intent:** GitHub issue #1185 (opened from epic #1156 slice 5, #1168). Design record:
`frontend/src/app/pages/prototype-map/prototype-venue-row.ts` @ `2cf675da`.

**Skills consulted:** `riviera-sdlc` (intake gate: the issue's open decision was already settled by
the design record and by the epic's own "dusk pin/row" wording; no in-flight PR or branch touches
`pages/home/`; no Flyway number to claim; slice 5's close-out left `docs/plans/discover-pre-q-removal.md`
behind, retired here) · `riviera-plan-doc` (forced the behaviour-parity ledger below — the row's
price is *replaced*, not merely decorated — and the risk register's row-height entry) · `tdd`
(component spec red first, then the page pairing, then the contrast proof, then the rendered e2e) ·
`riviera-review-overlay` (review gate at ready-for-review) · `riviera-docs-freshness` (close-out:
the `semantic-chip.ts` call-site count, `venue-row.ts`'s own TSDoc, epic #1156's out-of-scope entry,
and the retired plan doc) · `riviera-frontend` (the chip stays a row-local span on the shared
`appSemanticChip` directive — `pages/home/` owns its own boxes; no new `shared/` component) ·
`riviera-tailwind` (rule 1: the semantic-chip directive is the shared layer and deliberately carries
no geometry, so a sixth call-site box is the documented idiom, not drift; rule 2: `.row-closed` kept
as an inert marker) · `playwright-cli` (the rendered dusk + the unchanged 92 px in the mocked suite)

**Branch:** `claude/sdlc-1185-a789xu` (the cloud session's designated branch, standing in for
`bugfix/panel-row-dusk`) — exists before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `VenueCard` whose `salesClosed` is true, when the panel row renders it, then
  the row anchor carries `saturate-0` and no `opacity-*` class, and the price slot holds a
  `semantic-chip` reading `Closed today` instead of the price.
  *Seam:* `app-venue-row`'s `[card]` input · *Pinned by:* `venue-row.spec.ts` › `wears dusk when
  sales for today have closed, the price giving way to the fact that outranks it`
- [ ] **AC-2:** Given a `VenueCard` whose `closedForSeason` is true, when the panel row renders it,
  then the chip reads `Closed for season` — the season claim outranking today's sales close, as it
  does on the sheet card.
  *Seam:* `app-venue-row`'s `[card]` input · *Pinned by:* `venue-row.spec.ts` › `says closed for
  season instead, the badge that outranks today's close`
- [ ] **AC-3:** Given a venue still selling, when the panel row renders it, then the row wears no
  `saturate-0` and shows its price, with no closed chip anywhere in the row.
  *Seam:* `app-venue-row`'s `[card]` input · *Pinned by:* `venue-row.spec.ts` › `leaves a selling
  row its price and its colour`
- [ ] **AC-4:** Given the Discover page on the panel arm (`lg`+) with a region holding one closed
  venue and one open one, when the page renders, then only the closed venue's row is dusked and
  badged — the panel arm's pairing of the sheet's existing proof.
  *Seam:* the `/` route rendered at 1440 · *Pinned by:* `home.spec.ts` › `from lg: the panel` ›
  `wears dusk on the panel row whose sales for today have closed, as the sheet's card does`
- [ ] **AC-5:** Given the three themes and each theme's worst background stops, when a dusk panel
  row is desaturated, then the row ink and the soft ink still meet WCAG AA over the desaturated
  panel surface. *Seam:* the `--riv-*` token mirrors in `testing/glass-tokens.ts` ·
  *Pinned by:* `home.contrast.spec.ts` › `Discover dusk panel row contrast — $name theme`
- [ ] **AC-6:** Given the semantic-chip recipe, when a dusk surface desaturates both its ink and its
  fill, then the pair still meets WCAG AA — the proof the sheet card's own closed chip has been
  riding without. *Seam:* `testing/chip-fills.ts`'s `SEMANTIC_CHIP` ·
  *Pinned by:* `semantic-chip.contrast.spec.ts` › `the ink still meets AA once a dusk surface has
  desaturated both`
- [ ] **AC-7:** Given the mocked e2e at 1440 × 900, when the panel lists a closed venue beside a
  selling one, then the closed row computes `filter: saturate(0)` and contains `Closed today`, the
  selling row computes `filter: none` and does not, and **both rows are still 92 px tall** — dusk
  costs no height, so the panel-geometry tests above it keep measuring what they claim to.
  *Seam:* the built app at `/` · *Pinned by:* `discover-map.e2e.ts` › `Discover map — the desktop
  panel` › `a closed row wears dusk beside a selling one, and neither row changes height`

## Non-goals

- The pin's dusk, which already works (`data-dusk` per crowd) and is out of scope on the issue.
- The accessible name, which already carries the closed state via `closedStateText(...)`.
- The sheet card's own dusk, unchanged here beyond gaining the contrast proof AC-6 adds.
- Re-deciding whether the season badge should also desaturate: the sheet card keys desaturation on
  `salesClosed` alone, and the row mirrors that rule exactly rather than inventing a second one.
- Naming the reopen day in the row's season chip — the panel row has no room for
  `· reopens 15 May` beside a truncating venue name at a 420 px panel, and the accessible name
  already says it.

## Behavior-parity ledger

> The slice replaces one element of an existing surface: the panel row's price slot.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Row shows `card.priceLabel` (`€26`) in the name line | changed | Shown unless the venue is closed; a closed venue's slot holds the closed chip instead ("the row's price gives way to the fact that matters more" — design record). The from-price stays in the row's accessible name, which is unchanged. |
| Row shows `No sets yet` when `priceLabel` is null | changed | Same slot, now third in precedence: closed chip → price → `No sets yet`. A closed venue with no sets says it is closed, the fact that outranks. |
| Row wears no filter | changed | `saturate-0` when `salesClosed`, keyed on exactly the field the sheet card keys on. |
| Row height 92 px at rest, 121 px selected | preserved | The chip takes the price's slot rather than a new line, and the text column's content (~56 px) stays under its `min-h-[72px]`. AC-7 measures it rather than assuming it. |
| Row's accessible name carries the closed state | preserved | Untouched — `card().ariaLabel` is still the only thing AT reads; the whole visible column stays `aria-hidden`. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The chip's line box grows the name line past the price's, pushing the text column over `min-h-[72px]` and breaking the panel's 92 px row — `discover-map.e2e.ts`'s geometry and "selected row expands" tests both assert it | Low | High (two existing e2e tests red) | The column's three lines total ~56 px against a 72 px floor, so several px of slack exist; AC-7 measures the rendered height in Chromium rather than trusting the arithmetic | me | open |
| R-2 | `filter` on the row anchor creates a containing block and a stacking context, capturing the absolutely-positioned `row-photo-empty` sun or re-ordering the panel's paint | Low | Medium | The sun's containing block is already the `relative` photo span inside the anchor, so nothing moves; the `data-selected` outline lives on the `<li>` **outside** the anchor and so is neither desaturated nor clipped | me | open |
| R-3 | Desaturating the row drops an ink or the chip under WCAG AA in one of the three themes | Low | High (a11y regression on the surface the issue is about) | AC-5 and AC-6 compute it from the token mirrors over each theme's worst stops, the pattern `home.contrast.spec.ts`'s existing dusk-card describe already uses | me | open |
| R-4 | A third hand-copy of the `saturate(0)` matrix (one in `home.contrast.spec.ts`, one in `venue-pin-layer.contrast.spec.ts`) drifts from the other two | Medium | Low | Promote `desaturate` to `testing/contrast.ts` and point all three at it — the generalization-audit pass, logged below | me | open |
| R-5 | `semantic-chip.ts`'s TSDoc counts its call-site boxes ("five call sites", enumerated); a sixth box makes a substrate claim stale | High | Low | Counted and corrected in the same slice, and re-checked by the close-out sweep (`riviera-docs-freshness`) | me | open |

## Open questions / Assumptions

- **Assumption:** the row's closed copy is the design record's compressed `Closed today` rather than
  the sheet card's `Sales closed for today`, because the row's slot is a price slot beside a
  truncating name at a 420 px panel — *Owner:* me · *Resolves by:* confirmed with the user at the
  plan stage (the "dusk, chip in the price slot" option) and by the design record's own copy.

### Resolved

- **Open question (the issue's "What to decide"):** does the panel row wear dusk, or is the panel
  deliberately quieter with some other visible carrier? — **Outcome:** it wears dusk, with the chip
  in the price slot. The design record already built exactly that
  (`prototype-venue-row.ts`: "keeps its row but drops into dusk and says so, and the row's price
  gives way to the fact that matters more"), epic #1156 names "the dusk pin/row" together, and
  `VenueCard`'s own TSDoc says the surfaces "cannot disagree about a venue's … closed state".
  Confirmed by the user at the plan stage. No correction to the epic's wording is owed — the
  wording was right and the code was behind it. *SHA:* this plan's commit.

## Availability & concurrency (invariant #2)

N/A — nothing is written, claimed or read from `set_availability`. Invariant #4 is **rendered**
here, not enforced: the server's `salesOpen` verdict is already on the wire and already on the
`VenueCard`; this slice only draws it on a surface that was dropping it.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java file is touched, so the structural net does not run.

### Module ownership (§4a)

N/A — no backend behaviour is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The row's price is a display string already on the card; invariant #5's
minor-units form (`card.fromPrice`) is untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `pages/home/venue-row.{ts,html}` | existing | standalone component | one new `computed()` off the existing `card` input; no new input | none |
| FE-2 | `pages/home/home.contrast.spec.ts` | existing | contrast proof | pure maths over the token mirrors | none |
| FE-3 | `shared/semantic-chip.contrast.spec.ts` | existing | contrast proof | pure maths over `SEMANTIC_CHIP` | none |
| FE-4 | `testing/contrast.ts` | existing | test helper | the shared `saturate(0)` matrix | none |
| FE-5 | `e2e/discover-map.e2e.ts` | existing | mocked Playwright | rendered `filter` + measured height | none |

## FE↔BE contract

N/A — no contract change. `salesOpen`, `closedForSeason` and `reopensOn` are already on
`VenueSummary` and already mapped onto `VenueCard`.

## Execution status

**Stage pointer:** `implement (phase 1 done, phase 2 next)`

**Next action:** Phase 2 — the panel arm's pairing of the sheet's dusk proof in `home.spec.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan + branch | ✅ | `5fb2194b` |
| 1 — The row wears dusk (AC-1, AC-2, AC-3) | ⏳ | |
| 2 — The panel arm pairs the sheet's proof (AC-4) | | |
| 3 — Contrast under the filter (AC-5, AC-6) + the shared matrix | | |
| 4 — The rendered proof (AC-7) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | — | none yet | — |

---

## File structure

- `docs/plans/panel-row-dusk.md` — this plan
- `docs/plans/discover-pre-q-removal.md` — deleted: slice 5's plan, merged via PR #1184, retired at
  this close-out per `riviera-docs-freshness` § *Plan-doc retirement*
- `frontend/src/app/pages/home/venue-row.html` — the dusk filter and the closed chip in the price slot
- `frontend/src/app/pages/home/venue-row.ts` — the `closedLabel` computed and the TSDoc that says why
- `frontend/src/app/pages/home/venue-row.spec.ts` — AC-1, AC-2, AC-3
- `frontend/src/app/pages/home/home.spec.ts` — AC-4, in the `from lg: the panel` describe
- `frontend/src/app/pages/home/home.contrast.spec.ts` — AC-5; the dusk-card describe moves onto the shared matrix
- `frontend/src/app/pages/home/venue-pin-layer.contrast.spec.ts` — the third copy of the matrix retired
- `frontend/src/app/shared/semantic-chip.contrast.spec.ts` — AC-6
- `frontend/src/app/shared/semantic-chip.ts` — the call-site enumeration in its TSDoc, corrected
- `frontend/src/testing/contrast.ts` — `desaturate`, promoted out of the two specs that had it
- `frontend/e2e/discover-map.e2e.ts` — AC-7

---

## Phase 0 — Plan + branch

**Files:** Create `docs/plans/panel-row-dusk.md`

- [x] **Step 1:** ACs, risks and the parity ledger written before any source change.
- [x] **Step 2:** Branch `claude/sdlc-1185-a789xu` exists at `origin/main`.
- [ ] **Step 3: Commit** — `git commit -m "Plan the desktop panel row's dusk (#1185)"`

---

## Phase 1 — The row wears dusk (AC-1, AC-2, AC-3)

**Files:** Modify `frontend/src/app/pages/home/venue-row.html`, `venue-row.ts` · Test `venue-row.spec.ts`

- [ ] **Step 1: Write the failing tests** — a closed card, a season-closed card and a selling card
  through `render(...)`, asserting the anchor's filter class, the absence of any `opacity-*`, and
  the price slot's content.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/pages/home/venue-row.spec.ts`
  → FAIL (`row-closed` is null; the anchor has no `saturate-0`).
- [ ] **Step 3: Minimal implementation** — `[class.saturate-0]="card().salesClosed"` on the anchor;
  a `closedLabel` computed (`closedForSeason` → `Closed for season`, else `salesClosed` →
  `Closed today`, else `null`) rendered as an `appSemanticChip` span ahead of the price arms.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — logged below.
- [ ] **Step 6: Commit** — `git commit -m "The desktop panel row wears dusk, the price giving way to the closed chip (#1185)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 2 — The panel arm pairs the sheet's proof (AC-4)

**Files:** Test `frontend/src/app/pages/home/home.spec.ts` (`from lg: the panel`)

- [ ] **Step 1: Write the failing test** — `panelPage()` at 1440 over `sheetVenues()` (Palasa Sands
  carries `salesOpen: false`); assert its row is dusked and badged and the neighbouring row is not.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/pages/home/home.spec.ts -t "panel row"`
  → FAIL before phase 1's implementation is in; asserted as a guard against a vacuous test.
- [ ] **Step 3: Minimal implementation** — none needed; phase 1 satisfies it. The test exists to pin
  that the **page** feeds the panel arm the closed card, which is the defect the issue reported.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 6: Commit** — `git commit -m "Pair the sheet's dusk proof on the panel arm (#1185)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 3 — Contrast under the filter (AC-5, AC-6) + the shared matrix

**Files:** Modify `frontend/src/testing/contrast.ts`, `home.contrast.spec.ts`,
`venue-pin-layer.contrast.spec.ts`, `shared/semantic-chip.contrast.spec.ts`

- [ ] **Step 1: Write the failing tests** — a `Discover dusk panel row contrast` describe over the
  three themes (row ink and soft ink, desaturated, over the desaturated panel surface at each
  worst stop) and one semantic-chip case (ink and fill both desaturated).
- [ ] **Step 2: Run it, verify it fails** — the new describes reference `desaturate` from
  `testing/contrast`, which does not exist → FAIL to resolve.
- [ ] **Step 3: Minimal implementation** — promote `desaturate` into `testing/contrast.ts` with the
  Filter Effects matrix and its provenance comment; repoint the two specs that had their own copy.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/pages/home/home.contrast.spec.ts
  src/app/pages/home/venue-pin-layer.contrast.spec.ts src/app/shared/semantic-chip.contrast.spec.ts` → PASS.
- [ ] **Step 5: Generalization-audit pass** — logged below.
- [ ] **Step 6: Commit** — `git commit -m "Prove the dusk row and its chip hold AA under the filter (#1185)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 4 — The rendered proof (AC-7)

**Files:** Modify `frontend/e2e/discover-map.e2e.ts` (`Discover map — the desktop panel`)

- [ ] **Step 1: Write the failing test** — at 1440 × 900 over `MAP_VENUES` (Borsh Kilometre carries
  `salesOpen: false`): the closed row's computed `filter`, its chip text, the selling row's
  absence of both, and both rows still 92 px.
- [ ] **Step 2: Run it, verify it fails** — with the implementation reverted → FAIL.
- [ ] **Step 3: Minimal implementation** — none needed; phases 1–3 satisfy it.
- [ ] **Step 4: Run it, verify it passes** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
  npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts` → PASS, with the
  panel describe's pre-existing geometry tests still green.
- [ ] **Step 6: Commit** — `git commit -m "Pin the panel row's dusk in the browser, height unchanged (#1185)"`
- [ ] **Step 7: Update Execution status.**

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-22 | Phase 1: a tourist surface dropping a venue's closed state | Mechanism: every non-spec source that names `salesClosed`/`closedForSeason` — a wider population than "renders a `VenueCard`", which would have missed the beach map entirely | `grep -rln "salesClosed\|closedForSeason" frontend/src/app --include=*.ts --include=*.html \| grep -v spec.ts` | 11 | `home.html` (sheet card) ✅ dusks + chips; `venue-pin-layer.ts` ✅ dusks per crowd; `venue/venue-map.html` ✅ carries both claims already (lines 76, 223–236); `shared/venue-views.ts`, `home.ts`, `venue-card.ts` are the wire/record mappers, not surfaces; `operator/venue-tab.ts` + `operator-console.model.ts` are the operator's own console, a different audience from the tourist's dusk; `coast-picker.ts`, `place-groups.ts`, `pin-crowding.ts` take `VenueCard` for counting and geometry and render no closed state. `venue-row` was the sole gap — fixed here. No follow-up issue owed. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 / AC-2 / AC-3:** `npx vitest run src/app/pages/home/venue-row.spec.ts` → PASS.
- [ ] **AC-4:** `npx vitest run src/app/pages/home/home.spec.ts` → PASS.
- [ ] **AC-5 / AC-6:** `npx vitest run src/app/pages/home/home.contrast.spec.ts src/app/shared/semantic-chip.contrast.spec.ts` → PASS.
- [ ] **AC-7:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/discover-map.e2e.ts` → PASS.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1) — frontend-only. Availability section justified N/A (#4 is rendered, not enforced).
- [ ] Money untouched (#5): the from-price stays minor units on the card and in the accessible name.
- [ ] Modulith section justified N/A — no backend file in the diff.
- [ ] Payment section N/A.
- [ ] No Flyway migration in scope (#12).
- [ ] Frontend standards met: no `@apply`, the shared directive carries the family and the call site
      its own box (`riviera-tailwind` rule 1), `.row-closed` kept as an inert marker (rule 2), no
      `opacity-*` fade (the reason dusk is desaturation), no `as any`.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay).
