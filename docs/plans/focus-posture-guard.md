# Mechanical pin for the busy-button and confirm-focus patterns Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the repo's most-repeated bug class (WCAG 2.4.3 stranded focus, twelve instances
across #604/#614/#616) from recurring, by making both compliant forms machine-checkable at
authoring time and in CI — and fix the twelfth instance the detector found while it was being built.

**Architecture:** The single most significant decision is that **rule 1 discriminates on a curated
busy-flag vocabulary (a deny-list), not on a state/validity allow-list.** For a hygiene guard the two
error directions are not symmetric: a false negative leaves the status quo, a false positive fails a
build on legitimate code and the guard gets switched off — the lesson `check-inline-comments.mjs`'s
own header records from #529. Everything else follows the three shipped `scripts/check-*.mjs` guards
exactly: diff-scoped, dependency-free, `PostToolUse` hook + a CI step in `Repo hygiene (diff-scoped)`.

**Persistence:** N/A — no backend, no schema, no migration. Frontend templates and repo tooling only.

**Source of intent:** GitHub issue #621 (deferred from #616 and recorded as a Non-goal in
`docs/plans/confirm-focus-busy-posture.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — it caught the finding
that resizes the slice: `operator/payouts-tab.ts` is a **live twelfth instance** of the very class
being pinned. It renders its own weather-refund confirm surface with **zero** focus handling and
**zero** focus specs, so all three legs strand focus; #604/#614/#616 all swept past it. The grill
also overturned the issue's proposed shape for item 2 — see the Resolved open questions) ·
`riviera-plan-doc` (this template — the Behavior-parity ledger is what forced verdicting the two
`@if` conditions the naive `/confirm/i` match would have false-positived on, `booking-pay`'s
`state() === 'confirmed'` and `booking-confirmation`'s `confirmation(); as c`, before a line was
written rather than at review) · `tdd` (both rules are `node --test` suites written and proven RED
against fixtures before the detector exists; the payouts-tab legs are proven RED in
`payouts-tab.spec.ts` before the fix) · `riviera-review-overlay` (review gate — RV-FE-E2E consulted
at plan time for spec placement; full run due at ready-for-review) · `riviera-docs-freshness`
(close-out — due: the slice adds the **fourth** `scripts/check-*.mjs` guard and the **third** CI
hygiene step, so every substrate sentence saying "two diff-scoped guards" or "three hygiene checks"
goes stale outside the diff) · `riviera-frontend` (placement: no new file under `src/app` — the
payouts-tab fix modifies an existing feature component in place, so the taxonomy and RV-FE-8's
frozen five-edge table are both untouched) · `angular-developer` + angular-cli MCP
(`get_best_practices` → the fix uses the existing `focusMover()` helper and signal `set()`, no new
API surface; confirmed no `@HostListener`/`ngClass` creep) · `playwright-cli` (the real-browser half
lands in the existing `e2e/operator-payouts.e2e.ts`, mocked suite) · `riviera-local-debug` (cloud
session: scoped `npx ng test --include=…` runs, never the bare full suite; `node --test` for the
guard suites, which is what CI's hygiene job runs)

**Branch:** `claude/sdlc-621-zcgp9i` — the cloud session's designated branch, standing in for
`bugfix/focus-posture-guard` per `riviera-sdlc`'s remote-session addendum. Restarted from `main`
before phase 0 (the previous PR for this branch name, #620, is merged).

---

## Acceptance criteria (testable)

> Written at the guard's own boundary: given file content and the set of lines a diff added, which
> violations come back. The CLI, the hook payload and the CI step are adapters over that.

### Rule 1 — `[disabled]` on a busy flag (issue item 1)

- [ ] **AC-1:** Given a diff adds `<button [disabled]="saving()">`, when the guard runs, then it
  reports one violation at that line naming `[appBusy]` as the fix. *Pinned by:*
  `check-focus-posture.test.mjs` › `flags a button disabled by an in-flight flag`
- [ ] **AC-2:** Given the same expression on an `<input>`, `<textarea>` or `<select>`, then no
  violation — `aria-disabled` does not stop typing, and focus is on the clicked button, never the
  field. *Pinned by:* `check-focus-posture.test.mjs` › `leaves inputs alone`
- [ ] **AC-3:** Given `<button [disabled]="!canAddRow()">`, `[disabled]="cell.disabled"`,
  `[disabled]="isPending(set)"` or `[disabled]="venueForm().invalid()"`, then no violation — a
  genuinely unavailable control should leave the tab order. *Pinned by:*
  `check-focus-posture.test.mjs` › `leaves validity and state bindings alone`
- [ ] **AC-4:** Given `[disabled]` and `[appBusy]` on the same element (the deliberate split
  #616 established), then no violation. *Pinned by:*
  `check-focus-posture.test.mjs` › `accepts a split binding`
- [ ] **AC-5:** Given `[disabled]="saving()"` written inside a TSDoc block or anywhere in a `.ts`
  file outside a `template:` literal, then no violation — the live case is `shared/busy-action.ts`,
  whose own documentation quotes the form it replaces. *Pinned by:*
  `check-focus-posture.test.mjs` › `ignores bindings outside an inline template`

### Rule 2 — a confirm surface with no focus leg (issue item 2)

- [ ] **AC-6:** Given a diff adds `@if (confirmRemove()) { … }` to a component that calls neither
  `focusMover()` nor a shared confirm component, then one violation is reported against that
  component. *Pinned by:* `check-focus-posture.test.mjs` › `flags a confirm surface with no focus leg`
- [ ] **AC-7:** Given the same, but the component's `.ts` obtains `focusMover()`, then no violation —
  including when the surface lives in a sibling `.html` and the helper in the `.ts`. *Pinned by:*
  `check-focus-posture.test.mjs` › `accepts a confirm surface whose component moves focus` and
  › `pairs an external template with its component`
- [ ] **AC-8:** Given a confirm surface rendered by `<app-confirm-panel>` or
  `<app-confirm-with-reason>`, then no violation — both focus their own confirm button. *Pinned by:*
  `check-focus-posture.test.mjs` › `accepts delegation to the shared confirm components`
- [ ] **AC-9:** Given `@if (state() === 'confirmed')` or `@if (confirmation(); as c)`, then no
  violation — a payment state and a domain noun, neither a confirm-before-destroy prompt. *Pinned
  by:* `check-focus-posture.test.mjs` › `does not mistake confirmed state or a confirmation value for a prompt`

### Both rules — scoping

- [ ] **AC-10:** Given a violating line that the diff did **not** add, then no violation — the guard
  judges what a diff writes, never the standing tree. *Pinned by:*
  `check-focus-posture.test.mjs` › `judges only the lines a diff added`
- [ ] **AC-11:** Given the **whole** `frontend/src/app` tree swept with `--all`, then rule 1 reports
  **0** violations and rule 2 reports exactly **1** component — `operator/payouts-tab`, the live bug —
  before phase 2, and **0** after it. *Verified by:* the recorded `--all` runs in Acceptance-criteria
  verification. This is the guard's real proof: zero false positives against 12 standing `[disabled]`
  bindings and 8 standing confirm surfaces, and one true positive.

### The twelfth instance — `operator/payouts-tab.ts`'s weather-refund confirm

- [ ] **AC-12:** Given the weather-refund confirmation closed, when the operator activates **Weather
  refund**, then the confirmation opens and focus moves onto its destructive **Issue full weather
  refund** button — the trigger it replaced having been removed from the DOM. *Pinned by:*
  `payouts-tab.spec.ts` › `moves focus to the weather confirm button when the prompt opens`
- [ ] **AC-13:** Given the confirmation open, when the operator activates **Cancel**, then the prompt
  closes and focus returns to the **Weather refund** trigger. *Pinned by:*
  `payouts-tab.spec.ts` › `returns focus to the weather trigger when the operator backs out`
- [ ] **AC-14:** Given the confirmation open, when the refund settles — succeeded or failed — then
  the confirmation is gone, the notice states the outcome, and focus lands on that notice rather than
  `<body>`. *Pinned by:* `payouts-tab.spec.ts` › `parks focus on the notice when a weather refund
  settles` and › `parks focus on the notice when a weather refund fails`
- [ ] **AC-15:** Given a weather refund in flight, when it settles **after** the operator has
  switched venue, then focus is moved nowhere and no notice is written — the existing `epoch` guard
  governs the focus leg too. *Pinned by:* `payouts-tab.spec.ts` › `moves no focus when a refund
  settles under another venue`
- [ ] **AC-16:** Given the date input changed while the confirmation is open, then the prompt closes
  and focus stays on the date input — it was never destroyed, so nothing is moved. *Pinned by:*
  `payouts-tab.spec.ts` › `moves no focus when changing the date closes the prompt`
- [ ] **AC-17:** Given a real browser, when the operator opens, backs out of, and completes a weather
  refund, then focus is never on `<body>` at any step and axe reports no serious violations.
  *Pinned by:* `e2e/operator-payouts.e2e.ts` › `keeps focus off body across the weather-refund confirm`

## Non-goals

- **No `angular-eslint` template rule.** The issue offers it as an alternative; it is rejected
  because an ESLint rule is repo-wide, so the 12 standing `[disabled]` bindings would each need an
  inline disable comment or a config allow-list — and the issue's own constraint is that they "must
  not fail the repo". A custom template rule also needs a local plugin package, which the
  dependency-free hygiene job cannot run.
- **No flip-level confirm rule.** The shape the issue proposed for item 2 — a `confirming`-style
  flip with no adjacent `focusAfterRender` — is not built; the spike that killed it is recorded
  under Resolved open questions.
- **No sweep of the standing tree.** Rule 1 reports 0 over `--all` today, so there is nothing to
  sweep; rule 2's single hit is fixed here. Neither rule is retro-applied to history.
- **Not converting the four non-busy `[disabled]` bindings**, nor the four input ones. They are the
  carve-outs the rule exists to respect (AC-2, AC-3), re-confirming #616's Non-goal.
- **No `--fix` mode.** Both fixes are judgement calls — which of the two carve-outs applies, and
  where focus should land — so the guard reports and points, as `check-inline-comments.mjs` does.
- **No new shared confirm component for `payouts-tab`.** Its amber weather panel is a fourth markup
  family; #604, #616 and now this slice have all made the same call, that a variant axis imposes
  drift.

## Behavior-parity ledger

> The slice replaces no surface — both rules are new, and the `payouts-tab` change is additive. The
> one thing it *changes* is the repo-hygiene job's contract, verdicted here.

| Old-surface behavior | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| `Repo hygiene (diff-scoped)` runs exactly two guard steps | **changed (deliberate)** | a third step is appended, `if: ${{ !cancelled() }}` like the second, so one push surfaces all three rules rather than trickling them out |
| The job's `Test the guards themselves` step globs `scripts/*.test.mjs` | preserved | the glob picks the new suite up with no edit to `ci.yml` — the reason it was written as a glob |
| The job runs with no install step, so a guard may import nothing outside `node:` | preserved | the new guard imports `node:fs`/`node:path`/`node:url` and `./git-diff.mjs` only |
| `PostToolUse` fires one guard command on `Write`/`Edit` | **changed (deliberate)** | a second command joins the same matcher block, same `\|\| true` shape so a guard fault can never block an edit |
| The job name `Repo hygiene (diff-scoped)` is a ruleset-required status context | preserved | **untouched** — the new rule is a step inside the existing job, deliberately not a new job, which would report without blocking (`ci.yml`'s own warning) |
| `payouts-tab` renders the weather confirm and reconciles the ledger after a refund | preserved | untouched; only focus legs are added around the existing transitions |
| `payouts-tab` applies a refund outcome only while its own venue is on screen (`epoch`) | preserved (extended) | the guard now governs the focus move too, not just the notice — AC-15, the `admin-venue-photos` precedent |
| `payouts-tab`'s date change silently closes an open confirmation | preserved | it stays silent: the date input keeps focus, so there is nothing to move (AC-16) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | **A false positive kills the guard.** ~11 pre-existing legitimate `[disabled]` bindings and 8 standing confirm surfaces must all stay green; the issue calls this out as the hard part, and #616's review already showed one input wrongly swept | high | high | Diff-scoping (AC-10) means the standing tree can never fail a PR. On top of that, AC-11 sweeps the **whole** tree with `--all` and requires 0/1 — so a false positive is caught by a recorded run, not by a red PR on someone else's branch | Ivo | open |
| R-2 | **A curated vocabulary has false negatives.** A novel busy-flag name (`persisting()`, `flushing()`) is not in the list, so rule 1 stays silent | med | low | **Accepted deliberately** — it is the safe error direction (R-1 is the unsafe one), and the hook half fires at authoring time where the convention is also stated. The vocabulary is one exported, documented array, so extending it is a one-line PR | Ivo | open |
| R-3 | **The `.ts` template extraction is hand-rolled.** The hygiene job has no `node_modules`, so there is no Angular compiler or HTML parser; a mis-scanned template literal (nested backticks, `${}`) could mis-report a line | med | med | Only `template:` backtick regions are scanned in `.ts`, and the scan honours escapes — the same technique `check-inline-comments.mjs` uses for strings. AC-5 pins the TSDoc case that motivated it. `--all` over 70 real components (55 inline + 15 external) is the breadth proof | Ivo | open |
| R-4 | **`payouts-tab` is money-adjacent.** The weather refund cancels and fully refunds every confirmed booking for a day (invariants #9, #10); a careless edit to its handlers could change what it triggers | med | high | The fix adds **only** `focusAfterRender(...)` calls and one `tabindex="-1"`; no request, condition, or notice text changes. The existing `epoch` guard is reused rather than reworked (AC-15). No amount, currency or ledger behaviour is computed client-side, before or after | Ivo | open |
| R-5 | **jsdom focus fidelity.** #616 R-1 showed jsdom does not implement unfocus-on-disable, so a busy-window claim can pass without the fix | low | med | Narrower here: this slice moves focus on **element destruction**, which jsdom *does* model, and it touches no `[disabled]`→`aria-disabled` posture. Every AC-12..AC-16 spec is still proven RED first, and AC-17 adds the Chromium leg | Ivo | open |
| R-6 | **Hook noise.** The `PostToolUse` hook now runs two commands on every `Write`/`Edit`; a slow or chatty second guard degrades every edit in the repo | low | med | The guard reads at most two files per edit and does no git work in `--hook` mode beyond the one `HEAD` diff its sibling already does; `timeout: 15` and the `\|\| true` suffix match the existing entry exactly, so a fault degrades to silence | Ivo | open |
| R-7 | **CI runs the guard against the wrong base.** `ci.yml`'s own comment records that `github.event.pull_request.base.sha` is stale once `main` moves, handing a PR other people's merged lines | med | med | The new step reuses the identical `origin/${{ github.event.pull_request.base.ref }}` form as its two siblings — copied, not re-derived | Ivo | open |

## Open questions / Assumptions

- **Assumption:** the busy-flag vocabulary may be authored here rather than needing sign-off — it is
  derived mechanically from the 17 distinct expressions already bound to `[appBusy]` in the tree, not
  invented. — *Owner:* Ivo · *Resolves by:* Phase 0 (flagged for review at the PR).

### Resolved

- **Open question:** build item 2 at all, and in which shape? — **Resolved 2026-08-11 at plan time by
  Ivo, after a spike.** The issue's proposed shape — a `confirming`-style flip with no adjacent
  `focusAfterRender` — is **unworkable**: there are 34 flip sites across 8 components, and the bulk
  state-reset blocks in `booking-view` (route change), `payouts-tab` (venue switch), `layout-editor`
  and `set-editor` (selection change) each reset a confirm signal alongside 5–12 sibling signals
  where no focus move is wanted or correct. Distinguishing them needs to know whether the flip
  destroys a *currently focused* element, which is a runtime fact. A **component-level** rule was
  chosen instead: 8 components render a confirm surface, 7 either call `focusMover()` or delegate to
  the shared confirm components, and the 1 that does neither is a real bug. Rejected: dropping item 2
  (nothing mechanical would have caught `payouts-tab`), and the flip-level rule as written.
- **Open question:** fix the `payouts-tab` bug here, or file it? — **Resolved 2026-08-11 at plan time
  by Ivo:** fix it here. It is one component and three legs mirroring `set-password`, and it makes
  the guard's value provable rather than asserted — a mechanical pin whose first find is a live bug.
- **Open question:** one script or two? — **Resolved 2026-08-11 at plan time:** one,
  `check-focus-posture.mjs`. Both rules guard the same WCAG 2.4.3 stranded-focus class from its two
  causes, both need the same template-region scanner, and nothing else needs it — `git-diff.mjs`'s
  own header sets the bar for extraction at the third consumer. Each rule keeps its own advice
  string so a failure names which one fired, which is the #539 lesson.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice adds **no request** and changes no existing one: the
guard is build tooling that never runs in the app, and the `payouts-tab` change adds only
`focusAfterRender(...)` calls, which move keyboard focus and touch no state. Every write path to
`availability(set_id, booking_date)` is untouched, and the weather refund's server-side cancel +
release is not reached by any line in this diff.

## Spring Modulith — modules, interfaces, events

N/A — frontend and repo tooling only; no backend code in scope.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment logic in scope, but the surface being fixed is called out rather than left implicit:
`payouts-tab`'s weather refund is the **admin-triggered weather exception** of invariant #10, and it
posts payout reversals under invariant #9. The fix adds focus moves and a `tabindex="-1"` only — it
does not add, remove, reorder or condition the `weatherRefund` request, does not compute an amount or
a currency, and leaves the server as the sole decider of what is refunded and reversed. R-4 tracks
the blast radius.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/payouts-tab.ts` | existing | standalone component, external template | adds `focusMover()` + four return legs inside the existing `epoch` guard | unchanged |
| FE-2 | `operator/payouts-tab.html` | existing | external template | `tabindex="-1"` on the existing `payouts-notice` landmark | unchanged |
| FE-3 | `operator/payouts-tab.spec.ts` | existing | Vitest/jsdom | AC-12..AC-16 | — |
| FE-4 | `e2e/operator-payouts.e2e.ts` | existing | Playwright (mocked suite) | AC-17, the real-browser leg + axe | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal APIs, host bindings in the
`host` object, no `ChangeDetectionStrategy.OnPush` (default in v22), no `standalone: true` (default).
No deviation. No new component, service, route or token — `riviera-frontend`'s taxonomy is untouched.

## FE↔BE contract

N/A — no contract change. No request URL, method, body or header is added, removed or reshaped.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `implement — phases 0–3 done, entering phase 4 (the last)`

**Next action:** Phase 4 step 1 — write AC-17's e2e leg in `e2e/operator-payouts.e2e.ts` and verify
it RED against `origin/main`'s `payouts-tab.ts`.

PR: **#622** — opened as a draft at the Phase 0 commit, per `riviera-sdlc` rule 3 (CI fires on the
`pull_request` event only).

**Gates:** CI — running on the draft. Review gate — due at ready-for-review. Sonar gate — due at PR.
docs-freshness — due at close-out (the counting sweep matters: this is the **fourth**
`scripts/check-*.mjs` guard and the **third** CI hygiene step).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Rule 1: `[disabled]` on a busy flag | ✅ | |
| 1 — Rule 2: a confirm surface with no focus leg | ✅ | |
| 2 — The twelfth instance: `payouts-tab`'s three legs | ✅ | |
| 3 — Wire it: `PostToolUse` hook + the CI step | ✅ | |
| 4 — Full verification + the conventions doc | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/focus-posture-guard.md` — this plan
- `scripts/check-focus-posture.mjs` — both rules, their CLI modes, and the template-region scanner
- `scripts/check-focus-posture.test.mjs` — AC-1..AC-10
- `.claude/settings.json` — the second `PostToolUse` command, beside the inline-comment one
- `.github/workflows/ci.yml` — the third step in `Repo hygiene (diff-scoped)`
- `frontend/.claude/CLAUDE.md` — the guard named beneath the two conventions it now enforces
- `frontend/src/app/operator/payouts-tab.ts` — `focusMover()` + the four return legs
- `frontend/src/app/operator/payouts-tab.html` — `tabindex="-1"` on the notice landmark
- `frontend/src/app/operator/payouts-tab.spec.ts` — AC-12..AC-16
- `frontend/e2e/operator-payouts.e2e.ts` — AC-17

> Reconcile this section with `node scripts/check-plan-file-structure.mjs --diff origin/main`
> before pushing.

---

## Phase 0 — Rule 1: `[disabled]` on a busy flag

**Files:** Create `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`

- [x] **Step 1: Write the failing tests** — AC-1..AC-5 and AC-10, as fixture strings fed to the
      exported detector (no git, no filesystem), mirroring `check-inline-comments.test.mjs`'s shape.
      **Widened:** a second case walks all 12 distinct busy shapes the app already binds to
      `[appBusy]`, so the vocabulary is pinned by evidence rather than by one example.
- [x] **Step 2: Run them, verify they fail** — `node --test scripts/check-focus-posture.test.mjs`
      → RED on the missing module.
- [x] **Step 3: Implement** the template-region scanner (`.html` whole-file minus `<!-- -->`; `.ts`
      only inside `template:` backtick regions) plus rule 1: start-tag attribute scan, skipping
      `input`/`textarea`/`select`, skipping any tag carrying `[appBusy]`, flagging `[disabled]`
      whose expression contains a busy stem from the exported vocabulary.
- [x] **Step 4: Run them, verify they pass.** → **8 passed**, after one real defect the suite caught:
      the inline-template scanner cleared its `template:` lookbehind buffer *before* testing it, so
      every inline template was masked away and `scans the inline template of a component` failed.
      That case is the only reason rule 1 is not silently blind to 55 of the app's 70 components.
- [x] **Step 5: Generalization-audit pass** — see the log's second row: the vocabulary's derivation,
      the five stems excluded as too close to state, and the positive control that proves the sweep's
      `0` is a real zero rather than a scanner that reaches nothing.
- [x] **Step 6: Commit** — `git commit -m "Detect a button disabled by its own in-flight flag (#621)"`
- [ ] **Step 7: Open the draft PR** (`riviera-sdlc` rule 3 — CI fires on the `pull_request` event
      only) and **update plan-doc execution status** in the same commit window.

---

## Phase 1 — Rule 2: a confirm surface with no focus leg

**Files:** Modify `scripts/check-focus-posture.mjs`, `scripts/check-focus-posture.test.mjs`

- [x] **Step 1: Write the failing tests** — AC-6..AC-9, including the external-template pairing and
      both domain-noun exclusions.
- [x] **Step 2: Run them, verify they fail.** → **2 failed | 12 passed** — the honest red for this
      shape: only the two *flagging* cases can fail before the rule exists, since the four carve-out
      cases pass vacuously against a rule that reports nothing. Both were re-checked green after.
- [x] **Step 3: Implement** — find `@if` conditions whose first called identifier matches
      `/confirm/i` and which are not the `; as` aliasing form; a component is compliant when its
      `.ts` obtains `focusMover()` or its template uses `<app-confirm-panel>` /
      `<app-confirm-with-reason>`.
- [x] **Step 4: Run them, verify they pass.** → **15 passed**, one case more than planned: the sweep
      showed a surface routinely spans two `@if` blocks (the trigger's and the prompt's), so
      FOCUS-1 reports **one finding per component** and a new case pins it.
- [x] **Step 5: Add the `--all` sweep mode** and run it over the tree → `BUSY-1: 0  FOCUS-1: 1`,
      the single hit being `operator/payouts-tab.html:84`. AC-11's first half, exactly as predicted.
      `check()` gained the sibling-`.ts` pairing in the same step — without it every compliant
      external template (`set-editor`, `layout-editor`) would have reported, since their confirm
      surface and their `focusMover()` live in different files.
- [x] **Step 6: Generalization-audit pass** — see the log's third row.
- [x] **Step 7: Commit** — `git commit -m "Detect a confirm surface with no focus leg (#621)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — The twelfth instance: `payouts-tab`'s three legs

**Files:** Modify `frontend/src/app/operator/payouts-tab.ts`, `.html` · Test
`frontend/src/app/operator/payouts-tab.spec.ts`

- [x] **Step 1: Write the failing specs** — AC-12..AC-16, one per transition, mirroring
      `set-password.spec.ts` › `returns focus to the erase trigger when the customer backs out`.
- [x] **Step 2: Run them, verify they fail** —
      `npx ng test --include="src/app/operator/payouts-tab.spec.ts"` → **6 failed | 16 passed**, the
      first three with the honest red for this bug class: `expected <body> to be <button …>`.
- [x] **Step 3: Implement** — `focusMover()`; `onWeatherRefund` focuses `weather-confirm-btn`,
      `onCancelWeather` focuses `weather-trigger`, both settle legs focus `payouts-notice` **inside**
      the existing `epoch` guard; `tabindex="-1"` on the notice. `onDateChange` gains nothing (AC-16).
- [x] **Step 4: Run them, verify they pass**, the existing payouts specs included as the parity net.
      → **35 passed** across the three payouts spec files (unit + a11y + contrast), 16 of them the
      untouched parity net. AC-15 and AC-16 assert the *absence* of a move, so they could pass
      vacuously; both were **mutation-checked** — focusing outside the `epoch` guard, and adding a
      leg to `onDateChange`, each turns its own case RED.
- [x] **Step 5: Re-run `--all`** → `BUSY-1: 0  FOCUS-1: 0`. AC-11's second half; the detector and the
      fix agree.
- [x] **Step 6: Generalization-audit pass** — see the log's fourth row.
- [x] **Step 7: Commit** — `git commit -m "Move focus with the weather-refund confirmation (#621)"`
- [x] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Wire it: `PostToolUse` hook + the CI step

**Files:** Modify `.claude/settings.json`, `.github/workflows/ci.yml`

- [x] **Step 1: Add the `--hook` mode** and prove it by piping a `PostToolUse` payload on stdin,
      asserting `additionalContext` comes back for a violating file and nothing for a clean one.
      → All three cases exercised by hand: a violating `payouts-tab.html` returns the BUSY-1
      `additionalContext`, the same file clean returns nothing, and an out-of-scope path
      (`scripts/check-focus-posture.mjs`) is ignored.
- [x] **Step 2: Add the second `PostToolUse` command** to the existing `Write|Edit` matcher block,
      copying the sibling's `cd "$CLAUDE_PROJECT_DIR" && … 2>/dev/null || true` shape and `timeout`.
      **It has already earned its keep:** it fired on this slice's own `payouts-tab.spec.ts` edit,
      catching a six-line inline comment the author wrote — RV-STYLE-1's guard doing to this PR
      exactly what the new one will do to the next.
- [x] **Step 3: Add the CI step** to `Repo hygiene (diff-scoped)` — after the plan-doc guard, with
      `if: ${{ !cancelled() }}` and the same `origin/${{ github.event.pull_request.base.ref }}` base
      as its siblings (R-7). Do **not** add a new job (the ruleset names contexts by name).
      **Also corrected the job's own header comment**, which read "Two diff-scoped repo-hygiene
      guards, not one" — the counting-sweep staleness `riviera-docs-freshness` exists to catch,
      here inside the diff that caused it.
- [x] **Step 4: Verify** — `node scripts/check-focus-posture.mjs --diff origin/main` exits 0 on this
      branch, and `node --test "scripts/*.test.mjs"` (the exact CI invocation) passes all four
      suites → **93 tests, 0 failures**. `.claude/settings.json` and `ci.yml` both re-parsed after
      editing, and the hygiene job's step list read back to confirm the new step landed in it.
- [x] **Step 5: Commit** — `git commit -m "Run the focus-posture guard at authoring time and in CI (#621)"`
- [x] **Step 6: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Full verification + the conventions doc

**Files:** Modify `frontend/.claude/CLAUDE.md` · Test `frontend/e2e/operator-payouts.e2e.ts`

- [ ] **Step 1: Write the failing e2e** — AC-17, and verify it RED against `origin/main`'s
      `payouts-tab.ts`, exactly as #616's Phase 6 step 2 did.
- [ ] **Step 2: Axe** — `expectNoSeriousAxeViolations` after each new state, per the file's siblings.
- [ ] **Step 3: Name the guard** in `frontend/.claude/CLAUDE.md` beneath the two conventions it
      enforces, with the by-hand invocation — the shape the inline-comment rule already uses there.
- [ ] **Step 4: Full verification** — `npm run lint` · `npm test` · `npm run build` ·
      `npm run test:e2e:a11y` · `node --test "scripts/*.test.mjs"`.
- [ ] **Step 5: Reconcile the File-structure section** —
      `node scripts/check-plan-file-structure.mjs --diff origin/main` → exit 0;
      `node scripts/check-inline-comments.mjs --diff origin/main` → exit 0;
      `npm run format:check` from `frontend/` → clean.
- [ ] **Step 6: Commit** — `git commit -m "Cover the weather-refund focus legs end to end (#621)"`
- [ ] **Step 7: Update plan-doc execution status**; mark the PR ready for review.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-11 | Plan time — the issue-intake grill, asking whether #616's sweep was complete | every component rendering a **confirm-before-destroy surface**, asked whether it moves focus at all | `grep -rn "@if (.*[Cc]onfirm" src/app` cross-referenced with `grep -rln "focusAfterRender\|focusMover" src/app` | 8 components with a confirm surface; 7 compliant, **1 not** — `operator/payouts-tab`, with zero focus handling and zero focus specs | **The twelfth instance, and the finding that justifies item 2.** #604, #614 and #616 each audited the *adopters of `focusMover()`* — a population `payouts-tab` is not in, so three consecutive audits could not see it. Searching the adopters of the **confirm surface** instead is what found it. Fixed in Phase 2; it is also rule 2's single true positive in AC-11 |
| 2026-08-11 | Phase 2 — fixing the twelfth instance | every `weatherConfirm` flip in `payouts-tab`, asked whether it destroys the element focus is on — the question the rejected flip-level rule would have had to answer | read all six flip sites | 6 flips: **4 need a leg** (open, back-out, settled ×2), **2 must not have one** | **The 2:1 split is the evidence for the plan's rule-shape decision, now from inside the component rather than from a survey.** `resetForVenue`'s flip (a venue switch) and `onDateChange`'s both close the prompt without the user having activated anything in it — focus is on the venue picker or the date input, both of which survive, so a leg there would *move focus away* from where the user is. A flip-level guard sees all six identically. Both no-leg cases are pinned rather than assumed: AC-16 covers the date change, AC-15 the venue switch, and each was mutation-checked because a test asserting nothing moved passes against a component that moves nothing |
| 2026-08-11 | Phase 1 — choosing rule 2's confirm-surface predicate | every `@if` condition in the app whose text mentions `confirm`, asked whether it is a confirm **prompt flag** or something else | `grep -rn "@if (.*[Cc]onfirm" src/app --include=*.ts --include=*.html` | 10 conditions: 8 real prompts across 7 files, **2 not** — `booking-pay.ts:70` `@if (state() === 'confirmed')` and `booking-confirmation.ts:30` `@if (confirmation(); as c)` | **Both would have been false positives**, and neither component moves focus, so both would have failed a PR on correct code — one of them on the money path. The predicate was tightened twice as a result: match the **called identifier** rather than the condition text (which drops the payment state, where `confirmed` is a string literal), and reject the `; as` aliasing form (which drops the domain noun, since binding a value is never a prompt). AC-9 pins both. The inverse case is a deliberate false negative worth recording: `admin-operators` renders its prompt through `<app-confirm-panel>` with no `@if (confirm…)` at all, so the predicate never sees it — harmless, because delegation is itself a carve-out |
| 2026-08-11 | Phase 0 — choosing rule 1's discriminator | every expression the app binds to `[appBusy]`, asked which identifier stems denote an in-flight write, and every expression it still binds to `[disabled]`, asked which must never match | `grep -rhno '\[appBusy\]="[^"]*"' src/app` (51 bindings, 17 distinct) and `grep -rn '\[disabled\]=' src/app` (13 hits, 12 real + 1 in `busy-action.ts`'s own TSDoc) | 22 stems adopted; **5 rejected** — `loading`, `pending`, `processing`, `updating`, `creating` | **The rejections are the finding, and one of them was nearly a live false positive.** `pending` would have matched the standing `[disabled]="isPending(set)"` in `daily-view-tab.html` — a *state* binding #616 deliberately kept — turning the first PR that touched that line red on correct code. The other four read as state at least as often as busyness. Two controls on the outcome: the whole tree sweeps to **0** violations across 297 files, and a **positive control** (rewriting every real `[disabled]` expression to `saving()` in memory) flags 3 in `set-editor.html` and 1 in `daily-view-tab.html` while leaving the four inputs and the `[appBusy]` splits clean — so the zero is a real zero, not a scanner that reaches nothing. The 13th grep hit is why AC-5 exists |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..AC-5, AC-10:** `node --test scripts/check-focus-posture.test.mjs` → all pass, each RED
      first.
- [ ] **AC-6..AC-9:** same suite → all pass, each RED first.
- [ ] **AC-11:** `node scripts/check-focus-posture.mjs --all` → rule 1: 0, rule 2: 1 before Phase 2;
      0 and 0 after.
- [ ] **AC-12..AC-16:** `npx ng test --include="src/app/operator/payouts-tab.spec.ts"` → all pass,
      each RED first.
- [ ] **AC-17:** `npx playwright test --config playwright.a11y.config.ts operator-payouts` → passes,
      verified RED against `origin/main`'s `payouts-tab.ts`.
- [ ] **Full verification:** `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e:a11y` ·
      `node --test "scripts/*.test.mjs"` · all three repo-hygiene guards clean over the whole diff.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend code.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (N/A, no backend); no new cross-feature FE import (RV-FE-8).
- [ ] **Payment/payout** section filled — the weather-refund surface is named and its blast radius
      bounded (R-4).
- [ ] Refund policy enforced server-side (invariant #10) — unchanged; no client-side computation added.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A.
- [ ] **Frontend** standards met; no `as any`; every `data-testid` preserved.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder plus
      `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
