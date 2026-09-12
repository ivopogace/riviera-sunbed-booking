# Operator + Discover Live-Region Placement Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Give each of the nine live regions enumerated on #1078 a region that already exists
in the DOM before the text it announces changes, so the outcome is actually announced
(RV-FE-10), without changing a pixel of the visible surfaces.

**Architecture:** The repair is per site, as #1076 was, because which of the three correct
shapes fits depends on what the branch holds and what its parent does with an empty box.
Three sites hoist the region in place (the styled inner element branches, the `<output>`
does not); five take a persistent `sr-only` announcer beside a visible copy demoted to
`aria-hidden`; one drops its live semantics because a persistent sibling already speaks the
same outcome.

**Persistence:** N/A — frontend-only, no table or migration in scope (invariant #1 untouched).

**Source of intent:** GitHub issue #1078 (generalization sweep on #1076, PR #1077).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
seven of the nine test ids carry existing presence/absence assertions in unit specs and both
e2e suites, which is what forced the shape split below rather than one uniform rewrite) ·
`riviera-plan-doc` (this template — forced the per-site shape table and the re-announce
analysis for identical repeat outcomes) · `tdd` (every spec red first, then mutation-checked
by moving the region back inside its branch) · `riviera-review-overlay` (RV-FE-10's checklist
is the acceptance criteria here; runs again at the review gate) · `riviera-docs-freshness`
(N/A — no substrate doc states anything about these nine sites; re-checked at close-out) ·
`riviera-frontend` (placement: the announcers are component-local, no new `shared/` primitive —
`load-announcer.ts` is for loading surfaces and none of these nine is one) · `riviera-tailwind`
(`sr-only` is the zero-layout-cost region; the visual classes move to the inner element so an
empty hoisted `<output>` renders no box) · `playwright-cli` (the `data-identity-probe`
technique from `loading-announcements.e2e.ts` pins node identity across a real round trip).

**Branch:** `claude/sdlc-1078-nhvaae` — the session's designated remote branch stands in for
`bugfix/operator-live-region-placement` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## The nine sites and the shape each takes

The mechanism, restated from #1078: a live region whose element mounts inside the `@if`/`@case`
branch that produces its text, with no persistent sibling region and no focus move onto it.

| # | Site | Test id | Shape | Why this shape and not another |
|---|---|---|---|---|
| S1 | `operator/requests-tab.html` | `requests-notice` | **A — hoist in place** | Parent is block flow and the branch holds no control, so the `<output>` can stay mounted with the styled `<span>` inside it branching |
| S2 | `operator/set-editor.html` | `batch-saved` | **A — hoist in place** | Same: the batch panel is a block-flow `<section>` |
| S3 | `operator/set-editor.html` | `set-saved` | **A — hoist in place** | Same: the set panel is a block-flow `<section>` |
| S4 | `operator/set-editor.html` | `set-move-armed` | **B — persistent `sr-only` announcer** | The branch holds the **Cancel move** button, so the element cannot be hoisted out of it |
| S5 | `operator/venue-tab.html` | `venue-saved` | **B — persistent `sr-only` announcer** | Parent is `flex flex-col gap-3`; an empty flex item still spends the 12 px gap, so hoisting is visible drift |
| S6 | `operator/layout-editor.html` | `layout-saved` | **B — persistent `sr-only` announcer** | Parent is the save bar's `flex … gap-2.5`; same gap problem |
| S7 | `operator/layout-editor.html` | `layout-row-name-saved` | **B — one announcer for the editor** | Mounted per `@for` row inside a gapped flex column; hoisting would give one region per row, which RV-FE-10 rules out outright |
| S8 | `operator/pricing-tab.html` | `pricing-saved-<label>` | **B — one announcer for the table** | One region per row, the case RV-FE-10 names; the issue's own judgement call, and the evidence agrees |
| S10 | `operator/operator-home.ts` | `operator-home-loading` | **`app-load-announcer`** | Found by this slice's own generalization sweep, not by #1078: the only one of the ten that is a *loading* surface, so it takes the shared announcer rather than a hand-rolled region |
| S9 | `pages/home/home.html` | `empty` | **C — drop `aria-live`** | The persistent `results` count region sits above the whole `@if` chain and already says "0 venues · <date>"; a second source for one sentence is the thing the rule forbids |

**Shape A** keeps one element: the `<output>` loses its `@if` and keeps its test id, the visual
classes move onto an inner `<span>` that branches. An `<output>` is `display: inline`, so with
no content it paints no box — verified block-flow parent by block-flow parent, never assumed.

**Shape B** adds one persistent `sr-only` `<output>` per notice signal, mounted above every
branch at the component root, and demotes the visible copy from `<output>` to a plain
`<p>`/`<span>` carrying `aria-hidden="true"`. The sentence lives in exactly one `computed()`
bound by both, so there is one literal and one source per sentence.

**Shape C** removes the attribute and nothing else.

### Re-announcing an identical outcome

A live region speaks text that **changes**; setting the same string twice is not a change. Each
site's handler already clears its notice signal before the write it will re-set — verified, not
assumed: `requests-tab.decide()`, `set-editor.write()` / `applyBatch()` / `armMove()`,
`venue-tab.onSave()`, `layout-editor.commitSave()` / `onRenameRow()`, `pricing-tab.onPriceChange()`.
No handler needs a clear added.

The two per-row announcers (S7, S8) are the exception that needs new text rather than new
clearing: "Row name saved." is the same string for every row, so renaming row A then row B
would mutate nothing. Their announcer sentences name the row; the visible copies keep the copy
they have today.

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the requests queue with no notice, when an accept resolves, then the
  `requests-notice` element that was already in the DOM is the same node now holding the
  outcome sentence. *Seam:* the rendered `app-requests-tab` DOM (`[data-testid="requests-notice"]`) ·
  *Pinned by:* `requests-tab.spec.ts` › `announces the decision through a region that predates it (#1078)`
- [ ] **AC-2:** Given a selected set, when a save resolves, then the `set-saved` node present
  before the save is the same node holding "Saved.…". *Seam:* the rendered `app-set-editor` DOM
  (`[data-testid="set-saved"]`) · *Pinned by:* `set-editor.spec.ts` › `announces a set save through a region that predates it (#1078)`
- [ ] **AC-3:** Given a swept batch, when Apply resolves, then the `batch-saved` node present
  before the apply is the same node holding "2 sets updated.…". *Seam:* the rendered
  `app-set-editor` DOM (`[data-testid="batch-saved"]`) · *Pinned by:* `set-editor.spec.ts` ›
  `announces a batch apply through a region that predates it (#1078)`
- [ ] **AC-4:** Given a selected set, when Move is armed, then a persistent `sr-only` region that
  existed before the arm carries the "Pick an empty spot…" instruction, and the visible panel copy
  is `aria-hidden`. *Seam:* the rendered `app-set-editor` DOM (`[data-testid="set-move-armed-announce"]`) ·
  *Pinned by:* `set-editor.spec.ts` › `announces an armed move through a region that predates it (#1078)`
- [ ] **AC-5:** Given the venue profile form, when Save resolves, then the persistent
  `venue-saved-announce` node that existed before the save holds the saved sentence and the
  visible `venue-saved` copy is `aria-hidden`. *Seam:* the rendered `app-venue-tab` DOM
  (`[data-testid="venue-saved-announce"]`) · *Pinned by:* `venue-tab.spec.ts` › `announces the
  profile save through a region that predates it (#1078)`
- [ ] **AC-6:** Given a painted layout, when Save resolves, then the persistent
  `layout-saved-announce` node that existed before the save holds the saved sentence. *Seam:* the
  rendered `app-layout-editor` DOM (`[data-testid="layout-saved-announce"]`) · *Pinned by:*
  `layout-editor.spec.ts` › `announces a layout save through a region that predates it (#1078)`
- [ ] **AC-7:** Given two stored rows, when row A is renamed and then row B is renamed, then the
  single `layout-row-name-saved-announce` region's text changes on the second rename because it
  names the row. *Seam:* the rendered `app-layout-editor` DOM
  (`[data-testid="layout-row-name-saved-announce"]`) · *Pinned by:* `layout-editor.spec.ts` ›
  `re-announces a second row rename by naming the row (#1078)`
- [ ] **AC-8:** Given priced rows, when row A is repriced and then row B is repriced, then one
  table-level region — never one per row — carries both sentences, each naming its row. *Seam:*
  the rendered `app-pricing-tab` DOM (`[data-testid="pricing-saved-announce"]`) · *Pinned by:*
  `pricing-tab.spec.ts` › `announces each row's reprice through one table-level region (#1078)`
- [ ] **AC-9:** Given Discover with filters that match nothing, when the empty panel renders, then
  the panel carries no live-region semantics and the persistent `results` region speaks the zero
  count. *Seam:* the rendered `app-home` DOM (`[data-testid="empty"]`, `[data-testid="results"]`) ·
  *Pinned by:* `home.spec.ts` › `leaves the empty panel silent, since the count region speaks the outcome (#1078)`
- [ ] **AC-11:** Given an operator with two venues, when the owned-venues read resolves, then the
  `load-announcer` node that spoke "Opening your console…" is the same node that now speaks the
  picker, and the visible copy is `aria-hidden`. *Seam:* the rendered `app-operator-home` DOM
  (`[data-testid="load-announcer"]`) · *Pinned by:* `operator-home.spec.ts` › `announces through one
  region that survives opening → picker (#1078)`
- [ ] **AC-10:** Given the operator console in a real Chromium, when a set save and a row reprice
  resolve over a genuine round trip, then the element handle taken before each transition is still
  the element holding the text afterwards. *Seam:* the console routes under `/operator/:venueId`
  driven through the mocked e2e suite · *Pinned by:* `e2e/loading-announcements.e2e.ts` ›
  `the operator console announces through regions that outlive their text (#1078)`

## Non-goals

- **Focus management.** Accepting a request destroys the card holding the pressed Accept button,
  which strands focus on `<body>` (WCAG 2.4.3). That is a different defect from RV-FE-10, it is not
  enumerated on #1078, and hoisting the notice fixes the announcement without it. Follow-up issue
  at close-out.
- Changing any visible copy, colour, spacing or layout. Every visible sentence on these nine
  surfaces reads exactly as it does today.
- Extracting a shared announcer primitive. `shared/load-announcer.ts` is for loading surfaces;
  none of these nine is one, and five component-local one-liners do not yet argue for a component.
- The live regions the sweep cleared: `payouts-notice` and `daily-notice` (focus-moved by their
  tabs), and every region already mounted above its branch.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| S1–S3: the notice element is absent until there is a notice | **changed** | The element stays mounted and empty; the styled inner `<span>` is what comes and goes, so nothing paints. The one spec asserting the element's absence (`set-editor.spec.ts` `batch-saved`) becomes an empty-text assertion |
| S1–S3: the notice text is announced by that element | preserved | Same element, same implicit `status` role — it is now mounted before the text arrives, which is the fix |
| S4–S8: the visible notice mounts and unmounts with its branch | preserved | Untouched; every existing presence/absence assertion and both e2e suites keep passing |
| S4–S8: the visible notice is itself the live region | **changed** | It is demoted to a non-live element with `aria-hidden="true"`; the persistent `sr-only` region beside it carries the sentence, so there is still exactly one source |
| S7–S8: one live region per row | **dropped** | RV-FE-10 rules out a live region per row of a list; one table-level region replaces them, naming the row so consecutive rows still mutate the text |
| S9: the empty panel announces itself | **dropped** | It never did — it was born holding its text. The persistent `results` count region above the `@if` chain already speaks the outcome |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Hoisting (Shape A) makes an always-present element, breaking an existing absence assertion | high | low | Enumerated by grep over both spec suites and both e2e suites before writing: exactly one hit, `set-editor.spec.ts` on `batch-saved`. Updated to assert empty text, which is the stronger claim anyway | Claude | open |
| R-2 | An empty hoisted `<output>` paints a box or spends a flex gap | med | med | Visual classes move to the inner `<span>`; the outer `<output>` is `display: inline` with no content. Parent verified block-flow per site — the three gapped flex parents take Shape B instead | Claude | open |
| R-3 | Shape B duplicates a sentence, leaving two sources for one outcome | med | med | The sentence lives in one `computed()` bound by both the announcer and the visible copy; the visible copy carries `aria-hidden="true"` | Claude | open |
| R-4 | A per-row announcer repeats an identical string across rows, so nothing mutates | high | high | S7/S8 announcer sentences name the row; pinned by AC-7 and AC-8, which rename/reprice two different rows in sequence | Claude | open |
| R-5 | An e2e `toBeHidden()` starts failing because a region is now always mounted | med | med | The three ids asserted hidden (`venue-saved`, `layout-saved`) are Shape B, whose mounting is unchanged. No Shape A id is asserted hidden anywhere | Claude | open |
| R-6 | A spec passes against the broken shape because it only asserts text is present | high | high | Every new spec asserts node identity across the transition, and each is mutation-checked by moving the region back inside its branch | Claude | open |

## Open questions / Assumptions

- **Assumption:** `set-editor`'s three notices are mutually exclusive in practice (`armMove()`
  clears `saved`, the batch and set panels are `@if`/`@else if`), but the plan gives each its own
  region anyway rather than depending on that — *Owner:* Claude · *Resolves by:* phase 1
- **Open question:** does the stranded focus on request accept deserve its own issue, or is it
  covered by an existing one? — *Owner:* Claude · *Resolves by:* merge close-out

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No booking, beach-map write or `set_availability` path is in
scope; the slice changes announcement semantics on operator surfaces that already exist, and no
handler's write logic changes.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in scope.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. `pricing-tab` is touched, but only its save-outcome announcement; the
reprice call, its money handling and its stale-write token are untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/requests-tab.html` | existing | template only | existing `notice` signal | — |
| FE-2 | `operator/set-editor.ts` + `.html` | existing | standalone component | new `moveArmedMessage` computed | — |
| FE-3 | `operator/venue-tab.ts` + `.html` | existing | standalone component | new `savedMessage` computed | Signal Forms (untouched) |
| FE-4 | `operator/layout-editor.ts` + `.html` | existing | standalone component | new `savedMessage` + `renamedRowMessage` computeds | — |
| FE-5 | `operator/pricing-tab.ts` + `.html` | existing | standalone component | new `savedRowMessage` computed | — |
| FE-6 | `pages/home/home.html` | existing | template only | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
No deviation.

## FE↔BE contract

N/A — no contract change. No request or response shape is touched.

## Execution status

**Stage pointer:** `implement (phase 6)`

**Next action:** Phase 6 — extend `loading-announcements.e2e.ts` with the console (AC-10), then the
full frontend gate and close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — requests-tab (S1, Shape A) | ✅ | `1764ad1` (plan), this commit |
| 1 — set-editor (S2, S3 Shape A; S4 Shape B) | ✅ | this commit |
| 2 — venue-tab (S5, Shape B) | ✅ | this commit |
| 3 — layout-editor (S6, S7, Shape B) | ✅ | this commit |
| 4 — pricing-tab (S8, Shape B) + S10 operator-home | ✅ | this commit |
| 5 — Discover (S9, Shape C) | ✅ | this commit |
| 6 — e2e in real Chromium + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/operator-live-region-placement.md` — this plan
- `docs/plans/account-outcome-reveal.md` — retired at close-out (its PR #1079 merged; plan-doc
  retirement per `riviera-docs-freshness`)
- `frontend/src/app/operator/requests-tab.html` — S1 hoist
- `frontend/src/app/operator/requests-tab.spec.ts` — AC-1
- `frontend/src/app/operator/set-editor.html` — S2, S3 hoist; S4 announcer + demoted copy
- `frontend/src/app/operator/set-editor.ts` — `moveArmedMessage` computed
- `frontend/src/app/operator/set-editor.spec.ts` — AC-2, AC-3, AC-4, and the R-1 assertion update
- `frontend/src/app/operator/venue-tab.html` — S5 announcer + demoted copy
- `frontend/src/app/operator/venue-tab.ts` — `savedMessage` computed
- `frontend/src/app/operator/venue-tab.spec.ts` — AC-5
- `frontend/src/app/operator/layout-editor.html` — S6, S7 announcers + demoted copies
- `frontend/src/app/operator/layout-editor.ts` — `savedMessage` + `renamedRowMessage` computeds
- `frontend/src/app/operator/layout-editor.spec.ts` — AC-6, AC-7
- `frontend/src/app/operator/pricing-tab.html` — S8 table-level announcer + demoted copies
- `frontend/src/app/operator/pricing-tab.ts` — `savedRowMessage` computed
- `frontend/src/app/operator/pricing-tab.spec.ts` — AC-8
- `frontend/src/app/operator/operator-home.ts` — S10 takes `app-load-announcer`
- `frontend/src/app/operator/operator-home.spec.ts` — AC-11
- `frontend/src/app/pages/home/home.html` — S9 drops `aria-live`
- `frontend/src/app/pages/home/home.spec.ts` — AC-9
- `frontend/e2e/loading-announcements.e2e.ts` — AC-10

---

## Phase 0 — requests-tab: hoist the decision notice (S1)

**Files:** Modify `frontend/src/app/operator/requests-tab.html:10-20` · Test
`frontend/src/app/operator/requests-tab.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('announces the decision through a region that predates it (#1078)', async () => {
  const fixture = await render(consoleStub([pendingRow()]));

  // Present and empty beforehand: a region born holding its sentence announces nothing.
  const notice = byId('requests-notice');
  expect(notice).not.toBeNull();
  expect(notice?.textContent?.trim()).toBe('');

  clickAndSettle('request-accept-1');
  await fixture.whenStable();
  fixture.detectChanges();

  // Same node, mutated text: the mechanism that makes a live region speak.
  expect(byId('requests-notice')).toBe(notice);
  expect(byId('requests-notice')?.textContent?.toLowerCase()).toContain('asked to pay');
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- --run src/app/operator/requests-tab.spec.ts`
  → FAIL: `expected null not to be null` (the region does not exist before the decision).

- [ ] **Step 3: Minimal implementation** — hoist the `<output>` out of `@if (notice(); as msg)`,
  moving the box's classes onto an inner `<span>` so an empty region paints nothing.

```html
<!-- Above the @if on purpose: a live region must outlive the branch it describes (#1078). -->
<output aria-live="polite" data-testid="requests-notice">
  @if (notice(); as msg) {
    <span
      class="mt-3 block rounded-[12px] border border-riv-card-border bg-riv-console-inset/70 px-3.5 py-2.5 text-[13.5px] font-semibold text-riv-card-ink"
      >{{ msg }}</span
    >
  }
</output>
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- --run src/app/operator/requests-tab.spec.ts`
  → PASS, and the four existing `requests-notice` assertions still pass.

- [ ] **Step 5: Mutation-check** — move the `<output>` back inside the `@if` → the new spec fails.

- [ ] **Step 6: Commit** — `git commit -m "Keep the requests notice mounted before its text (#1078)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — set-editor: two hoists and one announcer (S2, S3, S4)

**Files:** Modify `frontend/src/app/operator/set-editor.html` · `frontend/src/app/operator/set-editor.ts` ·
Test `frontend/src/app/operator/set-editor.spec.ts`

- [ ] **Step 1: Write the three failing tests** (AC-2, AC-3, AC-4), each asserting node identity
  across the transition, plus `aria-hidden="true"` on the demoted move-armed copy.

- [ ] **Step 2: Run them, verify they fail** — `npm test -- --run src/app/operator/set-editor.spec.ts`

- [ ] **Step 3: Minimal implementation**
  - `set-saved` and `batch-saved`: hoist as in phase 0, classes onto an inner `<span>`.
  - `set-move-armed`: add a `moveArmedMessage` computed, a persistent `sr-only` region above the
    panel chain, and demote the in-panel `<output>` to an `aria-hidden` `<p>` bound to the same
    computed.

```ts
/** The armed-move instruction as one sentence, or '' — bound by both the announcer and the panel. */
protected readonly moveArmedMessage = computed(() =>
  this.armed()
    ? `Pick an empty spot on the map for ${this.selectedLabel()}. Its row and position follow the new spot.`
    : '',
);
```

- [ ] **Step 4: Run it, verify it passes**, then the R-1 update: `set-editor.spec.ts`'s
  `expect(byId('batch-saved')).toBeFalsy()` becomes an empty-text assertion.

- [ ] **Step 5: Run the component's neighbours** — `npm test -- --run src/app/operator/` →
  `set-editor.a11y.spec.ts` and `set-editor.contrast.spec.ts` green.

- [ ] **Step 6: Commit** — `git commit -m "Give the set editor's three notices regions that outlive them (#1078)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — venue-tab: the profile save announcer (S5)

**Files:** Modify `frontend/src/app/operator/venue-tab.html` · `frontend/src/app/operator/venue-tab.ts` ·
Test `frontend/src/app/operator/venue-tab.spec.ts`

- [ ] **Step 1: Write the failing test** (AC-5) — the `venue-saved-announce` node exists and is
  empty before Save, is the same node holding the sentence after, and the visible `venue-saved`
  copy is `aria-hidden="true"`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- --run src/app/operator/venue-tab.spec.ts`
- [ ] **Step 3: Minimal implementation** — `savedMessage` computed; persistent `sr-only`
  `<output data-testid="venue-saved-announce">` above every branch at the component root; the
  visible copy becomes `<span aria-hidden="true">` bound to the same computed.
- [ ] **Step 4: Run it, verify it passes** — existing `venue-saved` presence/absence assertions
  and `operator-venue.e2e.ts` untouched.
- [ ] **Step 5: Mutation-check** — move the announcer inside `@if (saved())` → the spec fails.
- [ ] **Step 6: Commit** — `git commit -m "Announce the venue profile save from a region that predates it (#1078)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — layout-editor: the save and row-rename announcers (S6, S7)

**Files:** Modify `frontend/src/app/operator/layout-editor.html` ·
`frontend/src/app/operator/layout-editor.ts` · Test `frontend/src/app/operator/layout-editor.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-6, AC-7) — AC-7 renames row A then row B and asserts
  the single region's text changed, which fails against a row-agnostic sentence.
- [ ] **Step 2: Run them, verify they fail** — `npm test -- --run src/app/operator/layout-editor.spec.ts`
- [ ] **Step 3: Minimal implementation** — two computeds, two persistent `sr-only` regions at the
  component root (separate, so a layout save and a row rename can never swallow each other's
  sentence), both visible copies demoted to `aria-hidden`. The rename sentence names the row.
- [ ] **Step 4: Run it, verify it passes** — the eight existing `layout-saved` /
  `layout-row-name-saved` assertions still pass.
- [ ] **Step 5: Mutation-check** — drop the row name from the rename sentence → AC-7 fails.
- [ ] **Step 6: Commit** — `git commit -m "Announce layout saves and row renames from regions that predate them (#1078)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — pricing-tab: one region for the table (S8)

**Files:** Modify `frontend/src/app/operator/pricing-tab.html` ·
`frontend/src/app/operator/pricing-tab.ts` · Test `frontend/src/app/operator/pricing-tab.spec.ts`

- [ ] **Step 1: Write the failing test** (AC-8) — reprice row A, then row B, asserting one
  table-level region carried both, each naming its row, and that no per-row region is live.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- --run src/app/operator/pricing-tab.spec.ts`
- [ ] **Step 3: Minimal implementation** — `savedRowMessage` computed naming the row; one
  `sr-only` `<output data-testid="pricing-saved-announce">` above the `@for`; the per-row copies
  become `aria-hidden` `<span>`s keeping their `pricing-saved-<label>` test ids.
- [ ] **Step 4: Run it, verify it passes** — `pricing-saved-A` presence assertions and
  `operator-pricing.e2e.ts` untouched.
- [ ] **Step 5: Generalization-audit pass** — re-run the RV-FE-10 enumeration command over the
  whole tree and record the result in the log below.
- [ ] **Step 6: Commit** — `git commit -m "Give row pricing one live region for the table (#1078)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 5 — Discover: drop the empty panel's second voice (S9)

**Files:** Modify `frontend/src/app/pages/home/home.html:130-142` · Test
`frontend/src/app/pages/home/home.spec.ts`

- [ ] **Step 1: Write the failing test** (AC-9) — the empty panel carries no `aria-live` and no
  live role, while `results` reads "0" and the date.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- --run src/app/pages/home/home.spec.ts`
- [ ] **Step 3: Minimal implementation** — remove `aria-live="polite"` from the empty panel and
  say why in a comment pointing at the count region.
- [ ] **Step 4: Run it, verify it passes** — `home.a11y.spec.ts` green.
- [ ] **Step 5: Commit** — `git commit -m "Leave Discover's empty panel to the count region (#1078)"`
- [ ] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 6 — the mechanism in a real browser, and close-out

**Files:** Modify `frontend/e2e/loading-announcements.e2e.ts`

- [ ] **Step 1: Write the failing e2e** (AC-10) — take an element handle on the console's regions,
  mark it with `data-identity-probe`, drive a set save and a row reprice over the mocked API, and
  assert the mark survives, exactly as the #1076 tests do.
- [ ] **Step 2: Run it, verify it fails against the pre-fix shape** — `npm run test:e2e:a11y -- loading-announcements`
- [ ] **Step 3: Confirm it passes against the fix.**
- [ ] **Step 4: Full frontend gate** — `npm run lint && npm run format:check && npm test && npm run build`
- [ ] **Step 5: Plan-doc guard** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
- [ ] **Step 6: Retire `docs/plans/account-outcome-reveal.md`** (PR #1079 merged) and finalize this
  doc's Execution status in the last code-touching commit.
- [ ] **Step 7: Commit + push.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-12 | phase 4 | Re-ran the same mechanism over the whole tree now that eight sites were repaired, resolving every remaining hit to its enclosing branch and checking each against its component's focus moves | `grep -rn 'aria-live\|role="status"\|<output' frontend/src` | The eight `admin/*` notices are already unconditional regions whose content branches (`min-h-[1.5rem]` reserves the space) — correct, untouched. One new hit: `operator-home.ts`'s `operator-home-loading`, born holding "Opening your console…" inside the `@else`, with the component's only focus move gated behind `skip(1)` on the query params so it never fires on the first load | Fixed here as S10 rather than ticketed: #1078 claims to close this population, and a member left standing would make that claim false. It is a loading surface, so it takes `app-load-announcer` |
| 2026-09-12 | plan (pre-phase-0) | A live region whose element mounts inside the `@if`/`@case` branch producing its text, with no persistent sibling region and no `focusMover()` target on it — every live region in the tree listed, each resolved to its nearest enclosing control-flow branch, each branch-nested hit checked against its component's focus moves | `grep -rn 'aria-live\|role="status"\|<output' frontend/src` | 9 in scope (S1–S9); `payouts-notice` + `daily-notice` cleared (focus-moved by `payouts-tab.ts` / `daily-view-tab.ts`); the auth five already repaired by #1077 | Fix all nine, per the shape table above |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 – AC-9:** Run `npm test -- --run src/app/operator/ src/app/pages/home/` → all green.
- [ ] **AC-10:** Run `npm run test:e2e:a11y -- loading-announcements` → green.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified — no availability path in scope).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled (N/A — frontend-only).
- [ ] **Payment/payout** section filled (N/A — no money path touched).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7) — untouched.
- [ ] Flyway migration present for schema changes (invariant #12) — none needed.
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the invocation ladder in `riviera-sdlc`
  `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
