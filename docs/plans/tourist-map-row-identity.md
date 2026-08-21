# Tourist map: one row identity — the stored label (#724)

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tourist beach map stops minting a second row namespace from insertion
order (`rowCode(index)`) and reads the venue's stored `rowLabel` as the only row
identity — so no surface can ever announce, print, or mail a set identity that
resolves to a different physical row than the map showed.

**Architecture:** Retire the browser-only derived-code namespace instead of
reconciling two namespaces that share an alphabet. The stored `rowLabel` is already
unique per venue (backend: `set_position_cell_uniq` + `renameRow`'s `ROW_NAME_TAKEN`)
and every other surface — booking dialog, pay page, booking view, confirmations,
mail, operator console — already renders it; the tourist map is the single opt-out.
The identity phrase joins the existing vocabulary seam (`shared/set-label.ts`), and
the left rail renders the label with a tourist-only ellipsis cap (product call,
2026-08-21: truncate; the operator daily view keeps its untruncated precedent).

**Persistence:** JDBC only (invariant #1). No tables or migrations touched —
frontend-only slice.

**Source of intent:** issue #724 + its two intake comments (collision framing,
2026-08-21 planning brief); product call on rail truncation answered in-session
2026-08-21.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught
that the "make labels match derivation" direction died when #723/#726 merged, and
escalated the rail-width product call instead of auto-filling it) · `riviera-plan-doc`
(this template — forced the parity ledger, which surfaced that #702's venue-words
price-chip qualifier becomes a rail restatement and needs a deliberate verdict, not a
side effect) · `tdd` (the walkway-collision repro from the issue brief is written
first, red, in phase 1) · `riviera-review-overlay` (review gate — at ready-for-review)
· `riviera-docs-freshness` (to run at close-out over this PR's range — #702's plan-doc
premise about disagreeing namespaces goes stale) · `riviera-frontend` (placement:
`spotLabel()` belongs in `shared/set-label.ts`, the published vocabulary home; the
truncation input stays on the shared canvas in `shared/`) · `riviera-tailwind`
(truncation as utilities on an inner span so the shared chip's computed styles don't
drift for operator surfaces; keep `data-testid="row-code"` as the queried marker; no
SCSS anywhere in scope) · `angular-developer` + angular-cli MCP (v22 idioms at
implement: `input()` for the canvas opt-in, `@if` template flow) · `playwright-cli`
(e2e touch-ups at implement; suite placement per RV-FE-E2E — CI-safe mocked suite).

**Branch:** `claude/issue-724-review-av7hki` — the session's designated remote branch,
standing in for `bugfix/tourist-map-row-identity` per the riviera-sdlc remote addendum.

---

## Acceptance criteria (testable)

- [ ] **AC-1 (the collision dies):** Given a venue whose stored row labels skip a
  letter (a walkway row saves no sets: labels `A, C, D, E`), when the tourist map
  renders, then the left rail reads `A, C, D, E` — the stored labels, not derived
  `A, B, C, D` — and no tile's accessible name contains a row identity that differs
  from its set's `rowLabel`. *Pinned by:* `venue-map.spec.ts › 'announces the stored
  row label — a walkway cannot shift identities (#724)'`
- [ ] **AC-2 (one identity, booking vocabulary):** Given the seeded Miramar venue,
  when tiles render, then a tile's accessible name is
  `Front row · Sea view · spot 1, front row, €45, taken` — the stored label in the
  same `rowLabel · spot N` phrase the booking surfaces print, with no derived
  `A1`-style seat code anywhere in the name. *Pinned by:* `venue-map.spec.ts`
  (updated tile-name specs) + `set-label.spec.ts › spotLabel`
- [ ] **AC-3 (the price chip never restates the rail):** Given any row, when its
  zone's price chip renders, then the chip's qualifier is only ever the channel
  (`at venue`) or the tier (`Front row`) — never words copied from the `rowLabel`
  the adjacent rail chip now displays itself. *Pinned by:* `row-price-label.spec.ts`
  (reworked)
- [ ] **AC-4 (tourist rail truncates, operator rail doesn't):** Given a row label
  longer than the tourist rail cap, when the tourist map renders, then the rail
  chip's label span carries the ellipsis cap (`max-w-[96px] truncate`) while the
  full label still reads in the tile accessible names; and given the operator Daily
  view on the same shared canvas, the cap is absent (opt-in input, default off).
  *Pinned by:* `venue-map.spec.ts` (cap present) + `beach-map-canvas` default
  asserted via `daily-view-tab.spec.ts` or a canvas-level spec (cap absent)
- [ ] **AC-5 (the namespace is gone):** Given the frontend sources, when searched,
  then no insertion-index `rowCode` derivation remains under `frontend/src/app/venue/`
  (the layout editor's grid-based `rowCode(y)`/`gridRowLabel` are out of scope and
  remain). *Pinned by:* compile + `git grep -n "rowCode" frontend/src/app/venue/`
  returning nothing at final verification.

## Non-goals

- **No backend change.** The API already serves `rowLabel`; the write-path gap
  (`replaceLayout` accepting duplicate labels) is #728, deliberately separate.
- **Booking-surface templates stay byte-identical.** Dialog, pay page, booking view,
  my-bookings, confirmations and mail already print the stored label; they are the
  standard this slice converges on, not surfaces to edit. (`spotLabel()` is added to
  the vocabulary seam and consumed by the map; folding the six existing template
  copies onto it is a refactor for another day.)
- **The layout editor keeps its grid letters.** `gridRowLabel(y)` anchors the
  row-name input beside a grid you are painting; a later reader should not
  "consistency-fix" it (issue brief's explicit non-goal).
- **`positionNo` stays the grid column** (a row painted `[gap, set, set]` has spots
  2 and 3). Dense per-row renumbering would be a worse bug.
- **Operator surfaces keep untruncated rail chips** — the truncation cap is
  tourist-only, opt-in.
- **No ESLint pinning / structural rules** beyond the change itself.

## Behavior-parity ledger

The slice retires the derived-code namespace and reworks #702's chip qualifier, so
the old tourist-map behaviors are enumerated:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Left rail shows derived `A/B/C…` per insertion index | **changed** | Rail shows the stored `rowLabel` — the fix itself (AC-1) |
| Tile a11y name `Set {code}{n}, {rowLabel}, {tier}, {price}, {state}` (two identities) | **changed** | `{rowLabel} · spot {n}, {tier}, {price}, {state}` — one identity, in the booking surfaces' phrase (AC-2) |
| `bookName` appends `. Select to book.` | preserved | unchanged suffix on the new name |
| Tile visible text = `positionNo` only | preserved | template untouched (`venue-map.html`) |
| Rails `aria-hidden` (tile names carry the row) | preserved | canvas template unchanged in that respect |
| Price chip venue-words qualifier (`€45 · Front row` from the label's first non-positional segment, #702) | **changed** | retired — the rail now displays the venue's own words for every row, so the chip repeating them is the restatement #702 existed to avoid. Seed output is coincidentally identical (row A is all-premium → tier qualifier renders the same `Front row`) |
| Price chip channel qualifier `at venue` for all-walk-in rows (#702, invariant #3) | preserved | priority 1 in the reworked `rowPriceLabel` |
| Price chip tier qualifier for all-premium rows whose label was only positional | **changed (broadened)** | tier now fires for every all-premium, non-walk-in row (the "was the label positional?" gate dies with `restatesPosition`). A premium row named `Cabana` reads `€45 · Front row` instead of `€45 · Cabana`; the rail shows `Cabana` |
| Zones = runs of identical rendered chip labels; walk-in row priced like its neighbour still opens its own zone | preserved | mechanism untouched; the walk-in split rides the preserved channel qualifier |
| Two adjacent same-price standard rows with different venue words split into two zones | **changed** | they merge into one zone (chips are now bare prices); the rail differentiates the rows by name |
| Zone gaps `mt-3` aligned across rail / tiles / price column | preserved | canvas layout untouched |
| `rowCode` bijective base-26 (`Z → AA`) for >26 rows | **dropped** | the namespace it serialized no longer exists; labels come from the venue |
| Booking dialog / confirmations print `rowLabel` | preserved | untouched — and now agree with the map |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Retiring the venue-words qualifier silently re-partitions price zones (rows that split under #702 merge back) | med | med | Deliberate verdict in the parity ledger; `row-price-label.spec.ts` reworked to pin the new rule; `venue-map.spec.ts` zone specs re-asserted (seed output identical) | session | open |
| R-2 | Truncation drifts the shared chip's computed styles on operator surfaces (no-drift rule) | low | med | Opt-in `input()` default **off**; cap classes on an inner span so the chip box is untouched; e2e `venue-map-pan` already pins chip fill/radius by computed style | session | open |
| R-3 | e2e specs assert the old derived rail text | low | low | Checked at plan time: `venue-map-pan.e2e.ts` asserts computed styles and geometry, never chip text; fixtures already use real labels | session | resolved (plan-time survey) |
| R-4 | Long labels make tile accessible names verbose | low | low | Accepted: a long correct name beats a short wrong one; axe suite re-run (`npm run test:a11y`, mocked e2e) | session | open |
| R-5 | A hidden consumer of `rowCode()`/`TileView.seat` breaks | low | low | Blast radius surveyed (issue brief + plan-time grep): only `venue-map.ts:223`, its spec, and `row-price-label.spec.ts`; `TileView.seat` is template-unused. Negative confirmed against `git ls-files`, not just search | session | resolved (plan-time survey) |

## Open questions / Assumptions

- **Assumption:** the live database's venues currently mis-announce only where a
  walkway/gap row exists; the V3 seed's labels agree ordinally, so no seeded surface
  changes meaning (only wording). Verified against repo fixtures, **not** the live
  DB — treated as a wording-risk note, not a data migration need. — *Owner:*
  session · *Resolves by:* close-out (no action unless review disagrees)

### Resolved

- **Rail width for long labels (product call):** truncate with ellipsis at a
  ~96px cap on the tourist map; operator surfaces unchanged. — answered by
  maintainer via AskUserQuestion, 2026-08-21.
- **Which identity survives:** the stored `rowLabel` (issue comment 1: derivation
  can no longer match labels post-#723/#726; the backend already guarantees label
  uniqueness).

## Availability & concurrency (invariant #2)

N/A — display-only slice. It renders identities of sets on the tourist map; every
availability read stays on the existing `SetView.availability` tokens, and no write
path, claim, pool rule, or cutoff is touched. (Invariant #3's *display* corollary —
only free ONLINE sets render bookable — rides `toTile` unchanged.)

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No module, port, or event in scope (`RESPONSIBILITIES.md`
untouched; the adjacent backend gap is #728).

### Module ownership (§4a)

All in the Angular frontend: `venue/` feature (map identity), `shared/` (vocabulary
+ canvas opt-in). No boundary change; import direction stays feature → `shared/`.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. (Money renders through the untouched `formatMoneyRange`.)

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/venue-map.ts` (+ `.spec.ts`) | existing | standalone component | signals/`computed` (rows, tiles) | — |
| FE-2 | `venue/row-price-label.ts` (+ `.spec.ts`) | existing | pure function module | — | — |
| FE-3 | `shared/set-label.ts` (+ `.spec.ts`) | existing | pure vocabulary module | — | — |
| FE-4 | `shared/beach-map-canvas.ts` + `.html` | existing | standalone component | new `input<boolean>` (truncate opt-in) | — |
| FE-5 | `frontend/e2e/venue-map-pan.e2e.ts` | existing | CI-safe mocked e2e | — | — |

**Standards:** standalone, `inject()`, `@if`/`@for`, `input()` signal API. No
deviations planned.

## FE↔BE contract

N/A — no contract change. The map already receives `rowLabel` on `SetView`.

## Execution status

**Stage pointer:** implement (phase 3)

**Next action:** phase 3 — tourist rail truncation (canvas opt-in) + e2e touch-up

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | 5490020, PR #729 |
| 1+2 — one identity in `venue-map` + `row-price-label` qualifier rework (landed together: `row-price-label.spec.ts`'s `at()` helper imports `rowCode`, so the phases are compile-coupled — a separate phase 1 could not be green) | ✅ | (this commit) |
| 3 — tourist rail truncation (canvas opt-in) + e2e touch-up | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/tourist-map-row-identity.md` — this plan
- `frontend/src/app/venue/venue-map.ts` — retire `rowCode()` + `TileView.seat`; rows keyed/coded by stored label; `toTile` names via `spotLabel`
- `frontend/src/app/venue/venue-map.spec.ts` — collision repro (AC-1), new tile names, rail = stored labels, truncation cap, `rowCode` describe-block removed
- `frontend/src/app/venue/row-price-label.ts` — qualifier rework: drop `RowPosition`/`restatesPosition`; channel > tier > nothing
- `frontend/src/app/venue/row-price-label.spec.ts` — re-pin the new rule; drop `rowCode` import
- `frontend/src/app/shared/set-label.ts` — add `spotLabel(rowLabel, positionNo)` to the vocabulary seam
- `frontend/src/app/shared/set-label.spec.ts` — pin `spotLabel`
- `frontend/src/app/shared/beach-map-canvas.ts` — `truncateRailCodes` input (default false)
- `frontend/src/app/shared/beach-map-canvas.html` — rail chip renders label via inner span; cap classes under the opt-in
- `frontend/src/app/venue/venue-map.html` — pass the opt-in to the canvas
- `frontend/e2e/venue-map-pan.e2e.ts` — assert the rail shows stored labels + the cap geometry on the tourist map

---

## Phase 0 — Plan doc + draft PR

**Files:** Create `docs/plans/tourist-map-row-identity.md`

- [ ] **Step 1:** Commit this plan doc on the designated branch.
- [ ] **Step 2:** Push and open the **draft PR** (CI fires on `pull_request` only, #417).
- [ ] **Step 3:** Update Execution status (phase 0 ✅) in the same commit window.

## Phase 1 — One identity in `venue-map`

**Files:** Modify `venue/venue-map.ts`, `venue/venue-map.spec.ts`, `shared/set-label.ts`, `shared/set-label.spec.ts`

- [ ] **Step 1: Write the failing test** — the issue brief's repro, as a permanent spec:

```ts
it('announces the stored row label — a walkway cannot shift identities (#724)', async () => {
  const base = miramar();
  // A gap row in the editor's grid saves no sets, so the venue's letters skip one.
  const original = [...new Set(base.sets.map((s) => s.rowLabel))];
  const shifted = ['A', 'C', 'D', 'E'];
  const sets = base.sets.map((s) => ({ ...s, rowLabel: shifted[original.indexOf(s.rowLabel)] }));
  venueRequest().flush({ ...base, sets });
  await fixture.whenStable();

  // The rail reads the venue's own letters — including the skip.
  const codes = [...el().querySelectorAll('[data-testid="row-code"]')].map((n) => n.textContent?.trim());
  expect(codes).toEqual(['A', 'C', 'D', 'E']);
  // Every tile announces exactly its set's stored label; the derived namespace is gone.
  const names = [...el().querySelectorAll('[data-testid="set-tile"]')].map(
    (t) => t.getAttribute('aria-label') ?? t.querySelector('button')?.getAttribute('aria-label') ?? '',
  );
  expect(names[0]).toBe('A · spot 1, front row, €45, taken');
  expect(names.some((n) => n.startsWith('C · '))).toBe(true);
  // No name carries a second, contradicting identity ("Set B1, C, …" was the defect).
  expect(names.some((n) => /^Set [A-Z]+\d/.test(n))).toBe(false);
});
```

plus the `spotLabel` pin in `set-label.spec.ts`:

```ts
it('renders the booking surfaces\' identity phrase', () => {
  expect(spotLabel('Front row · Sea view', 1)).toBe('Front row · Sea view · spot 1');
});
```

- [ ] **Step 2: Run, verify red** — `npx ng test` (from `frontend/`; scoped by the failing specs)
- [ ] **Step 3: Minimal implementation** — `shared/set-label.ts` gains
  `spotLabel(rowLabel: string, positionNo: number): string`; `venue-map.ts` deletes
  `rowCode()` and `TileView.seat`, `rows` uses the stored label as `code` (interim:
  passes `{ code: label, ordinal: index + 1 }` to `rowPriceLabel` until phase 2),
  `toTile(set, label)` builds `name` as
  `` `${spotLabel(set.rowLabel, set.positionNo)}, ${tier}, ${money}, ${announced}` ``.
- [ ] **Step 4: Run, verify green** — `npx ng test` (full Vitest run, ~13s; update the
  existing tile-name/rail specs and delete the `rowCode` describe-block in the same pass)
- [ ] **Step 5: Generalization audit** — population: *frontend code deriving a row
  identity from an array index* → `grep -rn "rowCode\|fromCodePoint(65" frontend/src`
  → expect only the layout editor's grid-based pair (in-scope non-goal). Log below.
- [ ] **Step 6: Commit** — `Announce the stored row label on tourist map tiles (#724)`
- [ ] **Step 7: Update Execution status.**

## Phase 2 — `row-price-label` qualifier rework

**Files:** Modify `venue/row-price-label.ts`, `venue/row-price-label.spec.ts`, `venue/venue-map.ts` (call site), `venue/venue-map.spec.ts` (zone specs re-asserted)

- [ ] **Step 1: Write the failing tests** — the new rule: the chip never repeats the
  rail; channel then tier then nothing:

```ts
it('never repeats the venue\'s words — the rail displays them itself (#724)', () => {
  const sets = [set({ rowLabel: 'Garden · Back', tier: 'STANDARD', price: 3000 })];
  expect(rowPriceLabel(sets)).toBe('€30');
});

it('still names an all-premium row by its tier', () => {
  const sets = [set({ rowLabel: 'Cabana', tier: 'PREMIUM', price: 4500 })];
  expect(rowPriceLabel(sets)).toBe('€45 · Front row');
});

it('still marks an all-walk-in row by its channel, over the tier', () => {
  const sets = [set({ rowLabel: 'Row 4', tier: 'PREMIUM', pool: 'WALK_IN', price: 2500 })];
  expect(rowPriceLabel(sets)).toBe('€25 · at venue');
});
```

- [ ] **Step 2: Run, verify red** — `npx ng test`
- [ ] **Step 3: Minimal implementation** — `rowPriceLabel(sets)` (drop the `position`
  parameter, `RowPosition`, `restatesPosition`, both regexes); `qualifierOf`:
  walk-in → `at venue`; all-premium → `tierLabel('PREMIUM')`; else `null`. Rewrite
  the file's doc comment: the premise ("the map derives its rail codes…") is gone —
  the rail shows the label, so the chip only adds what the label cannot say
  (channel, tier). Update the `venue-map.ts` call site (drop the interim positions).
- [ ] **Step 4: Run, verify green** — `npx ng test` (seed zone chips must still read
  `['€45 · Front row', '€35', '€25 · at venue']`; #702's walk-in-split and
  premium-merge specs must survive with qualifiers only)
- [ ] **Step 5: Generalization audit** — population: *code comparing a derived rail
  code to venue words* → `grep -rn "restatesPosition\|BARE_REFERENCE\|NAMED_REFERENCE" frontend/src`
  → must be empty after this phase. Log below.
- [ ] **Step 6: Commit** — `Price chips stop restating the rail's row names (#724)`
- [ ] **Step 7: Update Execution status.**

## Phase 3 — Tourist rail truncation + e2e

**Files:** Modify `shared/beach-map-canvas.ts` + `.html`, `venue/venue-map.html`, `venue/venue-map.spec.ts`, `frontend/e2e/venue-map-pan.e2e.ts`

- [ ] **Step 1: Write the failing tests** — unit: the tourist rail chip carries the
  cap on an inner span (`.max-w-\[96px\].truncate` inside `[data-testid="row-code"]`)
  and the canvas default leaves it off (canvas rendered without the opt-in has no
  capped span — asserted where the Daily view already pins its rail). e2e: on the
  tourist map, a long-label fixture's first `row-code` chip is no wider than ~110px
  and its text still starts with the stored label.
- [ ] **Step 2: Run, verify red** — `npx ng test`; e2e deferred to step 4's suite run.
- [ ] **Step 3: Minimal implementation** — `BeachMapCanvas` gains
  `truncateRailCodes = input<boolean>(false)`; the chip's text moves into an inner
  `<span>` that conditionally carries `max-w-[96px] truncate` (`@if`/ternary class),
  so the chip's own box and computed styles are untouched for the three operator
  surfaces; `venue-map.html` passes `[truncateRailCodes]="true"`.
- [ ] **Step 4: Run, verify green** — `npx ng test`, `npm run lint`,
  `npm run format:check`, then the mocked e2e (`npm run test:e2e:a11y`) per
  `riviera-local-debug`.
- [ ] **Step 5: Generalization audit** — population: *shared-canvas consumers whose
  rail could overflow* → `grep -rln "app-beach-map-canvas" frontend/src` → tourist
  map (capped here), layout editor / daily view / set editor (operator precedent:
  untruncated — non-goal). Log below.
- [ ] **Step 6: Commit** — `Cap the tourist rail's row-name chips with an ellipsis (#724)`
- [ ] **Step 7: Update Execution status; merge latest origin/main; mark PR ready for review.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-21 | phase 1+2 | frontend code deriving a row identity from an array index | `grep -rn "rowCode\|fromCodePoint(65" frontend/src/app` (non-spec) | layout editor's grid pair (`beach-cell.ts:59`, `layout-editor.ts:375` + template) | skip — grid coordinates for painting, the plan's explicit non-goal; tourist map now clean |
| 2026-08-21 | phase 1+2 | code comparing a derived rail code to venue words | `grep -rn "restatesPosition\|BARE_REFERENCE\|NAMED_REFERENCE\|RowPosition" frontend/src/app` | none | population extinct after rework |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npx ng test` → walkway spec green. Verified at commit `<sha>`.
- [ ] **AC-2:** `npx ng test` → tile-name + `spotLabel` specs green. Verified at commit `<sha>`.
- [ ] **AC-3:** `npx ng test` → reworked `row-price-label.spec.ts` green. Verified at commit `<sha>`.
- [ ] **AC-4:** `npx ng test` + `npm run test:e2e:a11y` → cap present on tourist, absent by default. Verified at commit `<sha>`.
- [ ] **AC-5:** `git grep -n "rowCode" frontend/src/app/venue/` → empty. Verified at commit `<sha>`.

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
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
