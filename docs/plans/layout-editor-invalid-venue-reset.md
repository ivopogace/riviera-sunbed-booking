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
it).

**Branch:** `claude/angular-tailwind-docs-zfcami` — the cloud session's designated remote
branch, standing in for `bugfix/layout-editor-invalid-venue-reset` per `riviera-sdlc`
§ *Remote / cloud session addendum*.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the editor has loaded venue 1 and the operator has generated a grid
  and typed row names, when the parent `:venueId` param goes invalid, then no previous-venue
  state is readable — no `layout-row-name` input and no beach cell is rendered, and no new
  map GET is issued. *Seam:* the rendered `LayoutEditor` DOM by `data-testid`, plus
  `HttpTestingController` for the absent request · *Pinned by:*
  `layout-editor.spec.ts` › `clears the previous venue's grid and row names when the venue param goes invalid (#1125)`
- [ ] **AC-2:** Given an invalid parent `:venueId`, when the editor renders, then
  `layout-invalid` is shown carrying the console-link copy, and neither `layout-tool-rail`
  nor `layout-load-failed` is rendered. *Seam:* the rendered `LayoutEditor` DOM by
  `data-testid` · *Pinned by:* `layout-editor.spec.ts` ›
  `renders an invalid-link card, not the load-failure copy, on an invalid venue param (#1125)`
- [ ] **AC-3:** Given a layout save and a row rename have both been announced, when the
  parent `:venueId` param goes invalid, then both `<output>` live regions are the **same DOM
  nodes** and both are empty. *Seam:* the two live-region `data-testid`s
  (`layout-saved-announce`, `layout-row-name-saved-announce`) · *Pinned by:* the existing
  `layout-editor.spec.ts` › `empties the layout-saved announcer when the venue param goes invalid (#1122)`
  and `empties the row-name announcer when the venue param goes invalid (#1122)`, which must
  keep passing unchanged (#1078, RV-FE-10).
- [ ] **AC-4:** Given a row rename has failed and `layout-row-name-write-error` is on
  screen, when the parent `:venueId` param goes invalid, then that error is gone. *Seam:*
  the rendered `LayoutEditor` DOM by `data-testid` · *Pinned by:* `layout-editor.spec.ts` ›
  `drops a row-name write error when the venue param goes invalid (#1125)`
- [ ] **AC-5:** Given the editor has loaded venue 1, when the parent param switches
  in place to venue 2, then the editor issues the map GET for venue 2 and re-seeds from it —
  exactly as today. *Seam:* `HttpTestingController` + the rendered DOM · *Pinned by:*
  `layout-editor.spec.ts` › `reloads the map when the venue is switched in place (#1125)`
- [ ] **AC-6:** Given an invalid parent `:venueId`, when axe audits the rendered editor,
  then there are no violations. *Seam:* `expectNoAxeViolations` over the component's host
  element · *Pinned by:* `layout-editor.a11y.spec.ts` ›
  `the invalid-venue card is clean`

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
- **Not touching the other five console tabs.** #1124 swept them; `payouts-tab` and
  `daily-view-tab` render their notice inside the `@else`, so `markInvalid()` unmounts it.
- **No new design token, no new shared primitive.** The card reuses `appCardGlass` and
  `text-riv-card-ink-soft` verbatim from `venue-tab`.

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

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Wrapping a 540-line template in a new `@else` silently drops or re-nests a branch | med | high | Do the move as an indent-only edit, then diff with `git diff -w` to prove no content changed; the full `layout-editor` spec suite (2467 lines) plus the a11y and contrast specs re-run | Claude | open |
| R-2 | The new branch is placed above the live regions, unmounting them and regressing #1124/#1078 (RV-FE-10) | low | high | AC-3 keeps the two existing #1122 specs unchanged as the regression guard; they assert node identity across the transition | Claude | open |
| R-3 | `rowNameError`'s `linkedSignal` conversion changes in-venue behavior (the error should survive unrelated re-renders, and still clear on the next edit) | low | med | `clearRenameNotices()` keeps setting it; the existing rename-failure specs re-run untouched | Claude | open |
| R-4 | An in-flight map load from the previous venue lands after the invalid transition and re-seeds the grid | med | med | `clearVenueState()` bumps `epoch`, the existing identity guard every continuation already compares; AC-1 asserts no cell is rendered after the transition | Claude | open |
| R-5 | Frontend-only slice, but the console tabs share `parentVenueId` — a change there would reach six tabs | low | high | The slice does not touch `shared/parent-venue-id.ts`; the generalization audit records the sweep | Claude | open |

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

**Stage pointer:** `plan — committed, entering implement (phase 0)`

**Next action:** Phase 0 step 1 — write the failing spec for AC-1 in
`frontend/src/app/operator/layout-editor.spec.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Clear venue-scoped state on an invalid param | | |
| 1 — Render the invalid-link card | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| *(none yet)* | | | |

---

## File structure

- `docs/plans/layout-editor-invalid-venue-reset.md` — this plan
- `frontend/src/app/operator/layout-editor.ts` — the effect's `undefined` arm,
  `clearVenueState()` extracted from `resetForVenue()`, `rowNameError` → `linkedSignal`
- `frontend/src/app/operator/layout-editor.html` — the invalid-link card branch and the
  `@else` around the editor body
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-1, AC-2, AC-4, AC-5
- `frontend/src/app/operator/layout-editor.a11y.spec.ts` — AC-6

---

## Phase 0 — Clear venue-scoped state on an invalid param

**Files:** Modify `frontend/src/app/operator/layout-editor.ts` · Test
`frontend/src/app/operator/layout-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-1, AC-4, AC-5 in `layout-editor.spec.ts`.
- [ ] **Step 2: Run them, verify they fail** —
  `npm test -- --run layout-editor.spec.ts` → AC-1/AC-4 FAIL (previous venue's grid and
  row-name error still rendered).
- [ ] **Step 3: Minimal implementation** — extract `clearVenueState()` (every reset in
  `resetForVenue` except `loadExisting`, including `epoch++`), give the effect its
  `undefined` arm, convert `rowNameError` to `linkedSignal({source: venueId})`.
- [ ] **Step 4: Run them, verify they pass** — `npm test -- --run layout-editor.spec.ts`.
- [ ] **Step 5: Generalization-audit pass** — population: every console tab whose
  `:venueId` effect has an `undefined` arm that only flips a flag rather than clearing
  venue-scoped draft state.
- [ ] **Step 6: Commit** — `git commit -m "Clear the layout editor's venue state on an invalid param (#1125)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Render the invalid-link card

**Files:** Modify `frontend/src/app/operator/layout-editor.html` · Test
`frontend/src/app/operator/layout-editor.spec.ts`, `layout-editor.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-2 and AC-6.
- [ ] **Step 2: Run them, verify they fail** — `layout-invalid` absent.
- [ ] **Step 3: Minimal implementation** — the `@if (venueId() === undefined)` card
  (`appCardGlass`, `role="alert"`, `data-testid="layout-invalid"`, `venue-tab`'s copy) with
  the existing body under `@else`, live regions left above.
- [ ] **Step 4: Run them, verify they pass** — the three `layout-editor*` spec files, then
  `git diff -w` on the template to prove the move was indent-only (R-1).
- [ ] **Step 5: Generalization-audit pass** — population: console tabs with a venue-scoped
  failure branch but no invalid-link branch.
- [ ] **Step 6: Commit** — `git commit -m "Render an invalid-link card in the layout editor (#1125)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- --run layout-editor.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm test -- --run layout-editor.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `npm test -- --run layout-editor.spec.ts` → the two #1122 specs PASS unchanged. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npm test -- --run layout-editor.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npm test -- --run layout-editor.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `npm test -- --run layout-editor.a11y.spec.ts` → PASS. Verified at commit `<sha>`.

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
