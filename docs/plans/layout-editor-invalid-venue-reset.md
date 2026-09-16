# Layout editor — invalid venue param resets the editor Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** When `LayoutEditor`'s parent `:venueId` param goes invalid, every venue-scoped
piece of editor state is dropped and the editor renders an invalid-link card instead of the
previous venue's grid.

**Architecture:** The single significant decision is **option 1 of #1125** (maintainer's
call): a top-level `@if (venueId() === undefined)` arm rendering a card that matches
`venue-tab`'s `venue-invalid`, with the rest of the editor moving under its `@else` — the
same shape every sibling console tab already has, and the only option whose copy is right
for a bad link. Its mechanical half is extracting `clearVenueState()` out of
`resetForVenue()` so the effect's new `undefined` arm clears without loading, and promoting
`rowNameError` to the `linkedSignal`-on-`venueId` form #1124 gave its two siblings — one
mechanism for identically-shaped venue-scoped notices rather than two.

**Persistence:** N/A — frontend-only; no table, no migration, no SQL (invariant #1
untouched).

**Source of intent:** GitHub issue #1125 (deferred from #1122 / PR #1124).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
`loadFailed()` renders a banner *above* the grid rather than instead of it, which makes the
issue's option 2 strictly worse than its own description; surfaced the design fork for the
maintainer) · `riviera-plan-doc` (this template — forced the seam-per-AC line and the
behavior-parity ledger for the template's moved branch) · `tdd` (each AC red before green,
one behavior per step) · `riviera-review-overlay` (review gate — runs at ready-for-review;
RV-FE-10 is the live-region item this slice must not regress) · `riviera-docs-freshness`
(N/A — no substrate doc states anything about this component contract; re-checked at
close-out) · `riviera-frontend` (placement: the change stays inside the existing
`operator/` feature files, no new file, no new import edge) · `riviera-tailwind` (the card
reuses `appCardGlass` + `text-riv-card-ink-soft`, the token pair
`layout-editor.contrast.spec.ts:72` already pins — so no new contrast case; no `@apply`, no
new token) · `angular-developer` + angular-cli MCP (`list_projects` → Angular 22;
`get_best_practices` → "use `linkedSignal()` for state derived from reactive sources that
must stay synchronized", native `@if`/`@else`; `search_documentation` → the
`linkedSignal({source, computation})` overload this repo already uses) · `playwright-cli`
(N/A — see Non-goals: the state is unreachable through the app shell, so no e2e can drive
it) · `riviera-local-debug` (loaded before the session's first `npm` invocation — the cloud
clone is shallow, so it was unshallowed before any git-history claim, and test runs stayed
scoped to the touched specs rather than the full suite).

**Branch:** `claude/angular-tailwind-docs-zfcami` — the cloud session's designated remote
branch, standing in for `bugfix/layout-editor-invalid-venue-reset` per `riviera-sdlc`
§ *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the editor has loaded venue 1 and the operator has generated a grid
  and typed row names, when the parent `:venueId` param goes invalid, then no previous-venue
  state is readable — no `layout-row-name` input and no beach cell is rendered, and no new
  map GET is issued. *Seam:* the rendered `LayoutEditor` DOM by `data-testid`, plus
  `HttpTestingController` for the absent request · *Pinned by:*
  `layout-editor.spec.ts` › `clears the previous venue's grid and row names when the venue param goes invalid (#1125)`
- [x] **AC-2:** Given an invalid parent `:venueId`, when the editor renders, then
  `layout-invalid` is shown carrying the console-link copy, and neither `layout-tool-rail`
  nor `layout-load-failed` is rendered. *Seam:* the rendered `LayoutEditor` DOM by
  `data-testid` · *Pinned by:* `layout-editor.spec.ts` ›
  `renders an invalid-link card, not the load-failure copy, on an invalid venue param (#1125)`
- [x] **AC-3:** Given a layout save and a row rename have both been announced, when the
  parent `:venueId` param goes invalid, then both `<output>` live regions are the **same DOM
  nodes** and both are empty. *Seam:* the two live-region `data-testid`s
  (`layout-saved-announce`, `layout-row-name-saved-announce`) · *Pinned by:* the existing
  `layout-editor.spec.ts` › `empties the layout-saved announcer when the venue param goes invalid (#1122)`
  and `empties the row-name announcer when the venue param goes invalid (#1122)`, which must
  keep passing unchanged (#1078, RV-FE-10).
- [x] **AC-4:** Given a row rename has failed and `layout-row-name-write-error` is on
  screen, when the parent `:venueId` param goes invalid, then that error is gone. *Seam:*
  the rendered `LayoutEditor` DOM by `data-testid` · *Pinned by:* `layout-editor.spec.ts` ›
  `drops a row-name write error when the venue param goes invalid (#1125)`
- [x] **AC-5:** Given the editor has loaded venue 1, when the parent param switches
  in place to venue 2, then the editor issues the map GET for venue 2 and re-seeds from it —
  exactly as today. *Seam:* `HttpTestingController` + the rendered DOM · *Pinned by:*
  `layout-editor.spec.ts` › `reloads the map when the venue is switched in place (#1125)`
- [x] **AC-6:** Given an invalid parent `:venueId`, when axe audits the rendered editor,
  then there are no violations. *Seam:* `expectNoAxeViolations` over the component's host
  element · *Pinned by:* `layout-editor.a11y.spec.ts` ›
  `has no axe violations on the invalid-link card`
- [x] **AC-7:** Given `PricingTab` has loaded venue 1's price rows, when the parent
  `:venueId` param goes invalid, then no `pricing-row` and no `pricing-projected` remains,
  `pricing-invalid` renders, neither `pricing-load-error` nor `pricing-empty` does, and the
  `pricing-saved-announce` region is still mounted. *Seam:* the rendered `PricingTab` DOM by
  `data-testid` · *Pinned by:* `pricing-tab.spec.ts` ›
  `clears the previous venue's price rows when the venue param goes invalid (#1125)`
- [x] **AC-8:** Given an invalid parent `:venueId`, when axe audits the rendered pricing
  tab, then there are no violations. *Seam:* `expectNoAxeViolations` over the component's
  host element · *Pinned by:* `pricing-tab.a11y.spec.ts` ›
  `has no axe violations on the invalid-link card`
- [x] **AC-9 (added at the review gate):** Given venue 1's remodel has been committed and its
  receipt is on screen, when the venue switches in place to venue 2, then neither the receipt
  nor the preview panel renders and venue 2's Save is not held inert. *Seam:* the rendered
  `LayoutEditor` DOM by `data-testid` · *Pinned by:* `layout-editor.spec.ts` ›
  `drops venue A's remodel receipt and preview when the venue switches (#1125)`

## Non-goals

- **No e2e spec.** `operator-console.html` gates the outlet on
  `@if (venueId() === undefined)`, so the console shell renders its own
  `oc-invalid-venue-card` and destroys the tab before an invalid param can reach the editor.
  The state is unreachable through the real app, so no Playwright spec in either suite can
  drive it; the unit spec is the only seam that observes this contract. (RV-FE-E2E's "the
  changed flow" is not reachable, not merely untested — recorded here so the review gate
  sees the reasoning rather than an omission.)
- **Not changing the console shell's gate** to make the state reachable. That is what keeps
  the bug latent, and removing it is a separate product question.
- ~~**Not touching the other five console tabs.**~~ **Superseded by the maintainer on
  2026-09-16:** the generalization sweep found the identical defect in `pricing-tab`, and the
  call was to fold its fix into this PR rather than file it. Its surface was not re-asked —
  the same option-1 card this slice's own question settled, applied to the parallel case; had
  the two tabs wanted different answers, that would have been a second question.
  The remaining four tabs stay out: `requests-tab`, `payouts-tab` and `daily-view-tab` render
  their `markInvalid()` branch in place of the content, and `venue-tab` already gates on
  `venueId() === undefined` in its first branch.
- **No new design token, no new shared primitive.** The card reuses `appCardGlass` and
  `text-riv-card-ink-soft` verbatim from `venue-tab`.
- ~~**Only the invalid-param path is reset.**~~ **Superseded by the maintainer at the review
  gate:** the review proved nine venue-scoped remodel fields (plus `reading`) survived *any*
  venue change, so venue 1's commit receipt rendered under venue 2 and `commitRemodel` could
  post venue 1's body to venue 2. Pre-existing, but this slice's own `clearVenueState()` doc
  claimed to cover it; the call was to fix rather than downgrade the claim.

## Behavior-parity ledger (retirement / replacement slices only)

The slice moves the editor's whole body under a new `@else` and re-parents the
`loadFailed()` banner. Nothing is retired, but the move is exactly the kind of "purely
structural" claim the ledger exists to verify, so the affected behaviors are enumerated.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Both `<output>` live regions sit above every branch and outlive it (#1078) | preserved | They stay above the new `@if`; only the body below them moves. AC-3 pins the node identity. |
| `loadFailed()` renders a banner above the grid, with the grid still rendered below | preserved | The banner and the grid move together into the `@else`; their relative order is unchanged. |
| A valid venue renders the tool rail, the mode surfaces and the save bar | preserved | Unchanged markup, one indent level deeper inside `@else`. |
| An invalid venue rendered the previous venue's grid and issued no load | changed → **fixed** | This is the bug. The new `undefined` arm clears the state; the new branch renders `layout-invalid`. |
| `resetForVenue()` resets ~20 fields then loads | preserved | Split into `clearVenueState()` + `loadExisting()`; `resetForVenue()` calls both, so the valid path is byte-for-byte the same sequence. AC-5 pins it. |
| `rowNameError` cleared by `clearRenameNotices()` on every reset path | preserved | Becomes a `linkedSignal` on `venueId`; `clearRenameNotices()` still sets it null for the in-venue edit paths. |
| A remodel preview/receipt stayed on screen across a venue switch | changed → **fixed** | Added at the review gate. `clearVenueState()` now drops the remodel preview, receipt, their flags and `pendingRemodel`, so a remodel belongs to the venue it was made on. AC-9 pins it. |
| `reading` was only ever cleared by the load that set it | changed | The split created the first caller that clears without loading, so a superseded in-flight read left `reading` true forever on the invalid arm. `clearVenueState()` now clears it. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Wrapping a 540-line template in a new `@else` silently drops or re-nests a branch | med | high | Done as an indent-only move. `git diff -w` was **not** sufficient — Prettier re-wraps prose at the deeper indent — so the proof used is stronger: the whole template with the new card and braces removed is byte-identical to `HEAD`'s once whitespace is normalized. 855 operator specs green | Claude | closed — whitespace-normalized template identity |
| R-2 | The new branch is placed above the live regions, unmounting them and regressing #1124/#1078 (RV-FE-10) | low | high | The two #1122 specs pass unchanged (AC-3), and AC-2 additionally asserts both regions are still mounted inside the invalid branch | Claude | closed |
| R-3 | `rowNameError`'s `linkedSignal` conversion changes in-venue behavior (the error should survive unrelated re-renders, and still clear on the next edit) | low | med | `clearRenameNotices()` still sets it on the in-venue edit paths; all nine existing rename-failure specs pass untouched | Claude | closed |
| R-4 | An in-flight map load from the previous venue lands after the invalid transition and re-seeds the grid | med | med | `clearVenueState()` bumps `epoch`, the identity guard every continuation already compares; AC-1 asserts no cell renders after the transition | Claude | closed |
| R-5 | Frontend-only slice, but the console tabs share `parentVenueId` — a change there would reach six tabs | low | high | `shared/parent-venue-id.ts` is untouched; the generalization audit swept all seven callers and found one real hit (`pricing-tab`), filed as its own issue | Claude | closed |

## Open questions / Assumptions

- *(none open)*

### Resolved

- **Open question (from #1125, "The design question this needs answered first"):** which
  surface renders on an invalid param — invalid-link card, reworded `loadFailed`, or
  state-only clear? → **Resolved by the maintainer via `AskUserQuestion`: option 1, the
  invalid-link card matching `venue-tab`'s `venue-invalid`.** The grill added one fact to
  the choice: `loadFailed()` is a banner above the grid, not a replacement for it, so option
  2 would have left an empty grid under a vague message.
- **Open question (from #1125 Notes):** does `rowNameError` join the `linkedSignal`
  derivation or the new reset arm? → **Resolved by the maintainer: the `linkedSignal`
  derivation**, matching its two siblings and the angular-cli best-practices guidance for
  state that must stay synchronized with a reactive source.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice renders and clears client-side editor state;
it issues no write, and the one request it is concerned with is the map GET it must *not*
issue on an invalid param.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is touched.

### Module ownership (§4a)

N/A — frontend-only; no backend capability added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` | existing | standalone component | Signals; the venue `effect` gains an `undefined` arm; `rowNameError` becomes `linkedSignal({source: venueId})` | none changed |
| FE-2 | `operator/layout-editor.html` | existing | external template | New top-level `@if (venueId() === undefined) { … } @else { … }`; live regions stay above it | none |

**Standards:** standalone components, `inject()`, `@if`/`@else` native control flow,
`linkedSignal()` for venue-derived state (Angular 22 — confirmed via the angular-cli MCP
against this workspace, not from memory). No `NgOptimizedImage` case (no image). No
deviation.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or client type is touched.

## Execution status

**Stage pointer:** `DONE — CI green, review gate run and resolved, Sonar gate green with an
empty list. Awaiting the maintainer's merge.`

**Next action:** None for the agent. PR #1126 is the maintainer's to merge; the
Contribution-terms declaration is theirs to make. On merge, the close-out's remaining items
are GitHub-only: confirm #1125 closed, and retire this plan doc at the next close-out.

**Gate evidence** (head `52e2efc4`): all 8 checks green. Sonar verified against the API
rather than the badge — `new_lines` 87 (so the analysis read the diff and this is not one of
the three false zeros), 0 open issues, 0 duplicated blocks, 0 new bugs/vulns/smells, 100%
coverage on new code. Review gate: `code-review:code-review` rung 1 at high effort over
`8f7c58ed..58a85ccd` with the overlay, 11 findings, 9 fixed in `52e2efc4`, 2 deferred to
#1127/#1128.

**Process note for the next slice:** the two follow-up issues were filed *after* the fix
commit, so their numbers could not ride in it and this register needed a docs-only push to
cite them — the one thing `pr-gates.md` §3 step 4 says to avoid. File deferred findings'
issues *before* the last code-touching commit, not after.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Clear venue-scoped state on an invalid param | ✅ | `7ce301ae` |
| 1 — Render the invalid-link card | ✅ | `42502442` |
| 2 — The same fix for `pricing-tab` (folded in by the maintainer) | ✅ | `58a85ccd` |
| 3 — Review-gate findings | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — the review gate ran `code-review:code-review` (rung 1) at high effort
over `8f7c58ed..58a85ccd` with `riviera-review-overlay` layered on, six agents.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review (agents 1, 4, 5) | **The whole TS half was untested.** Once phase 1's card existed, AC-1/AC-4/AC-7 were satisfied by the template branch alone — removing the state clearing entirely left every spec green. The specs were genuinely red-then-green at phase 0; phase 1 then made them pass for a different reason and nothing re-checked that they still discriminated. | fixed-in-this-commit — the ACs now assert the draft signals themselves, and both were mutation-checked: removing the clearing fails `[['premium'],['standard']] to deeply equal []` (layout) and the price rows (pricing) |
| F-2 | review (agents 2, 3, 5) | `clearVenueState()`'s doc claimed "every venue-scoped draft and flag" while ten fields survived; venue 1's commit receipt rendered under venue 2 and `commitRemodel` could post venue 1's body to venue 2. Pre-existing; the new doc made it a live misstatement. | fixed-in-this-commit — maintainer chose to fix rather than downgrade; AC-9 pins it |
| F-3 | review (agents 1, 4, 5) | `pricing-tab`'s `savedRow` TSDoc kept the "clears nothing of its own" clause this diff falsified — the twin clauses in `layout-editor` were fixed in the same diff, so the sweep was inconsistent. | fixed-in-this-commit |
| F-4 | review (agents 1, 4, 5) | `layout-editor.spec.ts`'s comment said "the grid kept the previous venue's state" directly above two assertions proving it did not. | fixed-in-this-commit |
| F-5 | review (agents 3, 4, 5) | `clearRenameNotices()`'s doc still listed "a venue switch" as a path that must call it, which this diff removed — two doc comments stating one rule, disagreeing. | fixed-in-this-commit |
| F-6 | review (agent 4) | The AC-2/AC-7 announcer assertions used `toBeTruthy()` while their comment claimed RV-FE-10 node identity — the bar #1124 set. An unmount-and-recreate would have passed. | fixed-in-this-commit — now `toBe(node)` captured before the transition |
| F-7 | review (agents 1, 4) | Four new doc comments were over §6d's ~3-line member budget and carried rejected-alternative archaeology ("rather than cleared by hand", "one mechanism rather than two"). | fixed-in-this-commit |
| F-8 | review (agents 1, 4, overlay) | Three spec inline comments restated the assertions beneath them; two a11y file-header enumerations did not list the new case; one a11y title carried an issue number its twin did not. | fixed-in-this-commit |
| F-9 | review (overlay, RV-PROC-1, Major) | `riviera-local-debug` was loaded and used but missing from *Skills consulted*. | fixed-in-this-commit |
| F-10 | review (agent 3) | The tab-level invalid-link cards are unreachable while `operator-console.html` gates the outlet, and the new card's copy disagrees with the shell's ("Open the console from your venue list" vs "Venue not found … create a venue"). | deferred → **#1127** (maintainer approved); the copy divergence is recorded there, not silently left |
| F-11 | review (agent 5) | This PR's own new comment indicts `requests-tab`, which still shows "Refresh the page" for a bad link. | deferred → **#1128** (maintainer approved); closes with #1127 if that retires the pattern |

---

## File structure

- `docs/plans/layout-editor-invalid-venue-reset.md` — this plan
- `frontend/src/app/operator/layout-editor.ts` — the effect's `undefined` arm,
  `clearVenueState()` extracted from `resetForVenue()`, `rowNameError` → `linkedSignal`
- `frontend/src/app/operator/layout-editor.html` — the invalid-link card branch and the
  `@else` around the editor body
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-1, AC-2, AC-4, AC-5
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — AC-6
- `frontend/src/app/operator/pricing-tab.ts` — the same `undefined` arm and
  `clearVenueState()` split (phase 2)
- `frontend/src/app/operator/pricing-tab.html` — the invalid-link card branch around the
  pricing card
- `frontend/src/app/operator/pricing-tab.spec.ts` — AC-7
- `frontend/src/app/operator/pricing-tab.a11y.spec.ts` — AC-8

---

## Phase 0 — Clear venue-scoped state on an invalid param

**Files:** Modify `frontend/src/app/operator/layout-editor.ts` · Test
`frontend/src/app/operator/layout-editor.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-1, AC-4, AC-5 in `layout-editor.spec.ts`.
- [x] **Step 2: Run them, verify they fail** —
  `npm test -- --run layout-editor.spec.ts` → AC-1/AC-4 FAIL (previous venue's grid and
  row-name error still rendered).
- [x] **Step 3: Minimal implementation** — extract `clearVenueState()` (every reset in
  `resetForVenue` except `loadExisting`, including `epoch++`), give the effect its
  `undefined` arm, convert `rowNameError` to `linkedSignal({source: venueId})`.
- [x] **Step 4: Run them, verify they pass** — `npm test -- --run layout-editor.spec.ts`.
- [x] **Step 5: Generalization-audit pass** — population: every console tab whose
  `:venueId` effect has an `undefined` arm that only flips a flag rather than clearing
  venue-scoped draft state.
- [x] **Step 6: Commit** — `git commit -m "Clear the layout editor's venue state on an invalid param (#1125)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Render the invalid-link card

**Files:** Modify `frontend/src/app/operator/layout-editor.html` · Test
`frontend/src/app/operator/layout-editor.spec.ts`, `layout-editor.a11y.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-2 and AC-6.
- [x] **Step 2: Run them, verify they fail** — `layout-invalid` absent.
- [x] **Step 3: Minimal implementation** — the `@if (venueId() === undefined)` card
  (`appCardGlass`, `role="alert"`, `data-testid="layout-invalid"`, `venue-tab`'s copy) with
  the existing body under `@else`, live regions left above.
- [x] **Step 4: Run them, verify they pass** — the three `layout-editor*` spec files, then
  `git diff -w` on the template to prove the move was indent-only (R-1).
- [x] **Step 5: Generalization-audit pass** — population: console tabs with a venue-scoped
  failure branch but no invalid-link branch.
- [x] **Step 6: Commit** — `git commit -m "Render an invalid-link card in the layout editor (#1125)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The same fix for `pricing-tab`

**Files:** Modify `frontend/src/app/operator/pricing-tab.ts|.html` · Test
`frontend/src/app/operator/pricing-tab.spec.ts`, `pricing-tab.a11y.spec.ts`

- [x] **Step 1: Write the failing tests** — AC-7 and AC-8.
- [x] **Step 2: Run them, verify they fail** — the previous venue's two rows survive.
- [x] **Step 3: Minimal implementation** — `clearVenueState()` split out of `resetForVenue`,
  the effect's `undefined` arm, and the `@if (venueId() === undefined)` card around the
  pricing card (the live region stays above it).
- [x] **Step 4: Run them, verify they pass** — 857 operator specs green; the template move
  verified content-identical under whitespace normalization.
- [x] **Step 5: Generalization-audit pass** — this phase *is* the audit's action; the
  population was enumerated in phase 0 and the remaining four callers were judged there.
- [x] **Step 6: Commit**
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | Phase 0 (#1125) | Every component whose venue `effect` has an `undefined` arm that flips a flag instead of clearing venue-scoped state, enumerated by the route-param helper each one calls rather than by resemblance | `grep -rln "parentVenueId(\|venueIdParam(" --include=*.ts frontend/src/app` then the `const id = this.venueId()` arm of each | 7 components: `layout-editor` (this fix), `venue-tab`, `pricing-tab`, `requests-tab`, `payouts-tab`, `daily-view-tab`, `operator-console` | **Subset — one real hit, fixed here.** `pricing-tab` has the identical defect: its `undefined` arm sets only `loaded`, `rows` is `computed` off `sets` which nothing clears, and the template's *first* branch is `@if (rows().length > 0)`, so the previous venue's price rows stay on screen. **The maintainer chose to fold the fix into this PR** (phase 2) rather than file it. `venue-tab` and `operator-console` gate on `venueId() === undefined` in the first template branch; `requests-tab`, `payouts-tab` and `daily-view-tab` render their `markInvalid()` error branch in place of the content. Those five leave stale signals in memory but nothing readable on screen. |

---

## Acceptance-criteria verification (final)

All nine verified by one command from `frontend/`:
`npx ng test --watch=false --include="src/app/operator/**/*.spec.ts"` → **858 passed**.

- [x] **AC-1:** `clears the previous venue's grid and row names…` PASS.
- [x] **AC-2:** `renders an invalid-link card, not the load-failure copy…` PASS.
- [x] **AC-3:** the two #1122 announcer specs PASS **unchanged** — no edit to either.
- [x] **AC-4:** `drops a row-name write error on an invalid venue param, and never resurrects it` PASS.
- [x] **AC-5:** `reloads the map when the venue is switched in place` PASS.
- [x] **AC-6:** `has no axe violations on the invalid-link card` PASS.
- [x] **AC-7:** `clears the previous venue's price rows when the venue param goes invalid (#1125)` PASS.
- [x] **AC-8:** `has no axe violations on the invalid-link card` (pricing) PASS.
- [x] **AC-9:** `drops venue A's remodel receipt and preview when the venue switches (#1125)` PASS.

**A note on AC-1/AC-7's strength, and how it was caught.** As first written these asserted
only the DOM, which phase 1's invalid-link branch unmounts regardless — so they passed with
the state clearing removed entirely, and covered none of it. The review caught it; they now
assert the draft signals, and each was mutation-checked by removing the clearing and
confirming the spec fails. The lesson is recorded rather than the fix alone: a spec written
red-then-green in one phase can be silently de-fanged by a later phase in the same slice.

**A note on AC-4's strength, recorded because the code comment originally overclaimed it:**
the round-trip assertion does *not* discriminate the `linkedSignal` from an imperative
clear. Both counterfactuals were run and both passed, because `loadExisting` already calls
`clearRenameNotices()` on re-seed. At this seam the three mechanisms are behaviourally
identical; the derivation was chosen for consistency with its two siblings, not for an
observable difference. AC-4 pins the behaviour, which is what it can honestly pin.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A, no booking path.
- [ ] **Modulith** section justified N/A (invariant #11).
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A, no time arithmetic.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** per `riviera-sdlc` `references/pr-gates.md` §1 plus `riviera-review-overlay`.
