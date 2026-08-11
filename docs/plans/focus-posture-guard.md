# Mechanical pin for the busy-button and confirm-focus patterns Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the repo's most-repeated bug class (WCAG 2.4.3 stranded focus, **fourteen** instances
across #604/#614/#616 and this slice) from recurring, by making both compliant forms machine-checkable
at authoring time and in CI — and fix the three instances found along the way: the twelfth by the
detector itself, the thirteenth and fourteenth by the review gate, in the very file the slice edits.

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
(**ran** over `origin/main...HEAD` pre-merge, **2 stale statements, both patched, + 1 gap flagged** —
and the counting sweep is what found them, exactly as designed: `CLAUDE.md:109` said "**three**
diff-scoped hygiene checks" and `:114` split them "first two … the third", both falsified by the
fourth guard, in a file this slice would otherwise never have opened. The flagged gap is the
overlay's missing bank item for this bug class, recorded as a Non-goal) · `riviera-frontend` (placement: no new file under `src/app` — the
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

- [x] **AC-1:** Given a diff adds `<button [disabled]="saving()">`, when the guard runs, then it
  reports one violation at that line naming `[appBusy]` as the fix. *Pinned by:*
  `check-focus-posture.test.mjs` › `flags a button disabled by an in-flight flag`
- [x] **AC-2:** Given the same expression on an `<input>`, `<textarea>` or `<select>`, then no
  violation — `aria-disabled` does not stop typing, and focus is on the clicked button, never the
  field. *Pinned by:* `check-focus-posture.test.mjs` › `leaves inputs alone`
- [x] **AC-3:** Given `<button [disabled]="!canAddRow()">`, `[disabled]="cell.disabled"`,
  `[disabled]="isPending(set)"` or `[disabled]="venueForm().invalid()"`, then no violation — a
  genuinely unavailable control should leave the tab order. *Pinned by:*
  `check-focus-posture.test.mjs` › `leaves validity and state bindings alone`
- [x] **AC-4:** Given the deliberate split #616 established — a **validity** expression on
  `[disabled]` beside `[appBusy]` — then no violation; but given the **same busy flag** on both, one
  violation, because the native attribute blurs the pressed control whatever `aria-disabled` says.
  *Pinned by:* `check-focus-posture.test.mjs` › `accepts a split binding` and
  › `still flags the busy flag when appBusy sits beside it on the same element`.
  **Rewritten at the review gate (F-4):** as first written this AC exempted the element whenever
  `[appBusy]` was present, which accepted the one shape the rule exists to catch — and the suite
  asserted that miss as correct.
- [x] **AC-5:** Given `[disabled]="saving()"` written inside a TSDoc block or anywhere in a `.ts`
  file outside a `template:` literal, then no violation — the live case is `shared/busy-action.ts`,
  whose own documentation quotes the form it replaces. *Pinned by:*
  `check-focus-posture.test.mjs` › `ignores bindings outside an inline template`

### Rule 2 — a confirm surface with no focus leg (issue item 2)

- [x] **AC-6:** Given a diff adds `@if (confirmRemove()) { … }` to a component that holds no focus
  call site, then one violation is reported against that component. *Pinned by:*
  `check-focus-posture.test.mjs` › `flags a confirm surface with no focus leg`.
  **Corrected at the re-review gate (G-7/H-7):** as first written this AC also exempted a component
  rendering a shared confirm component, which contradicts the AC-8 below.
- [x] **AC-7:** Given the same, but the component's `.ts` obtains `focusMover()`, then no violation —
  including when the surface lives in a sibling `.html` and the helper in the `.ts`. *Pinned by:*
  `check-focus-posture.test.mjs` › `accepts a confirm surface whose component moves focus` and
  › `pairs an external template with its component`
- [x] **AC-8:** Given a confirm surface rendered by `<app-confirm-panel>` or
  `<app-confirm-with-reason>`, then the component is **still** required to hold a focus call site —
  those components own the *open* leg only, and their own TSDoc says focus back out is the caller's.
  *Pinned by:* `check-focus-posture.test.mjs` › `does not accept delegation as a substitute for the
  caller own legs` and › `does not report the trigger half of a trigger and prompt pair`.
  **Inverted at the re-review gate (G-11):** as first written this AC made delegation an exemption,
  which silently accepted two thirds of the rule.
- [x] **AC-9:** Given `@if (state() === 'confirmed')` or `@if (confirmation(); as c)`, then no
  violation — a payment state and a domain noun, neither a confirm-before-destroy prompt. *Pinned
  by:* `check-focus-posture.test.mjs` › `does not mistake confirmed state or a confirmation value for a prompt`

### Both rules — scoping

- [x] **AC-10:** Given a violating line that the diff did **not** add, then no violation — the guard
  judges what a diff writes, never the standing tree. *Pinned by:*
  `check-focus-posture.test.mjs` › `judges only the lines a diff added`
- [x] **AC-11:** Given the **whole** `frontend/src/app` tree swept with `--all`, then rule 1 reports
  **0** violations and rule 2 reports exactly **1** component — `operator/payouts-tab`, the live bug —
  before phase 2, and **0** after it. *Verified by:* the recorded `--all` runs in Acceptance-criteria
  verification. This is the guard's real proof: zero false positives against 12 standing `[disabled]`
  bindings and 8 standing confirm surfaces, and one true positive.

### The twelfth instance — `operator/payouts-tab.ts`'s weather-refund confirm

- [x] **AC-12:** Given the weather-refund confirmation closed, when the operator activates **Weather
  refund**, then the confirmation opens and focus moves onto its destructive **Issue full weather
  refund** button — the trigger it replaced having been removed from the DOM. *Pinned by:*
  `payouts-tab.spec.ts` › `moves focus to the weather confirm button when the prompt opens`
- [x] **AC-13:** Given the confirmation open, when the operator activates **Cancel**, then the prompt
  closes and focus returns to the **Weather refund** trigger. *Pinned by:*
  `payouts-tab.spec.ts` › `returns focus to the weather trigger when the operator backs out`
- [x] **AC-14:** Given the confirmation open, when the refund settles — succeeded or failed — then
  the confirmation is gone, the notice states the outcome, and focus lands on that notice rather than
  `<body>`. *Pinned by:* `payouts-tab.spec.ts` › `parks focus on the notice when a weather refund
  settles` and › `parks focus on the notice when a weather refund fails`
- [x] **AC-15:** Given a weather refund in flight, when it settles **after** the operator has
  switched venue, then focus is moved nowhere and no notice is written — the existing `epoch` guard
  governs the focus leg too. *Pinned by:* `payouts-tab.spec.ts` › `moves no focus when a refund
  settles under another venue`
- [x] **AC-16:** Given the date input changed while the confirmation is open, then the prompt closes
  and focus stays on the date input — it was never destroyed, so nothing is moved. *Pinned by:*
  `payouts-tab.spec.ts` › `moves no focus when changing the date closes the prompt`
- [x] **AC-17:** Given a real browser, when the operator opens, backs out of, and completes a weather
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
- **Two known limits, kept deliberately rather than silently** (both from the review rounds):
  **(a)** FOCUS-1's exemption is **component-scoped** — a component that moves focus at all is
  trusted to move it for each of its surfaces. Per-surface would mean deciding which legs belong to
  which prompt, which is the runtime question the flip-level rule already failed on. The re-review
  (G-2) showed why per-block is not the answer either: a trigger/prompt pair writes the trigger as a
  negated branch, so block-scoping reported the trigger half of the shape `payouts-tab.html` itself
  uses. **(b)** The template scanner is **not** extracted into `git-diff.mjs`. That module's own header
  scopes it to "what did this diff touch, and where" and forbids knowing what a guard checks; a
  TypeScript/HTML region scanner is the opposite. The two scanners also answer different questions —
  `check-inline-comments.mjs` wants *comment* regions, this one wants *template* and *code* regions —
  so a shared abstraction would be a union of both, not a reuse of either. What the duplication
  genuinely cost, a diverged backtick case, is fixed and pinned (F-11).
- **No new `riviera-review-overlay` bank item.** The docs-freshness sweep turned up that the overlay
  has **no** RV-FE item for this bug class at all — which is part of why fourteen instances shipped.
  Adding one is deliberately not done here: RV-STYLE-1's own history runs the other way (bank item
  first, after eight PRs raised it by hand; guard second). **Filed as #623**, which also carries the
  argument the third review pass added: with FOCUS-1 advisory rather than gating, the human half of
  the check is exactly the part still missing.
- **No narrowing of FOCUS-1's component-scoped exemption.** Two narrower scopings were tried and both
  were worse (known limit (a)); it is the gap that hid instance 14. **Filed as #624** with the two
  shapes worth spiking.
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
| R-1 | **A false positive kills the guard.** ~11 pre-existing legitimate `[disabled]` bindings and 8 standing confirm surfaces must all stay green; the issue calls this out as the hard part, and #616's review already showed one input wrongly swept | high | high | Diff-scoping (AC-10) means the standing tree can never fail a PR. On top of that, AC-11 sweeps the **whole** tree with `--all` and requires 0/1 — so a false positive is caught by a recorded run, not by a red PR on someone else's branch | Ivo | **closed** — the 12 standing `[disabled]` bindings and 8 standing confirm surfaces all stay green: `--all` reports `BUSY-1: 0  FOCUS-1: 1` before the fix and `0/0` after, the single hit being the real bug. Diff-scoping (AC-10) means even a future false positive cannot fail a PR that did not write the line |
| R-2 | **A curated vocabulary has false negatives.** A novel busy-flag name (`persisting()`, `flushing()`) is not in the list, so rule 1 stays silent | med | low | **Accepted deliberately** — it is the safe error direction (R-1 is the unsafe one), and the hook half fires at authoring time where the convention is also stated. The vocabulary is one exported, documented array, so extending it is a one-line PR | Ivo | **closed — accepted as designed, and made visible.** The posture is stated in `frontend/.claude/CLAUDE.md` beside the rule, naming `BUSY_STEMS` as the thing to extend, so the next author widens the vocabulary instead of routing around a silent guard |
| R-3 | **The `.ts` template extraction is hand-rolled.** The hygiene job has no `node_modules`, so there is no Angular compiler or HTML parser; a mis-scanned template literal (nested backticks, `${}`) could mis-report a line | med | med | Only `template:` backtick regions are scanned in `.ts`, and the scan honours escapes — the same technique `check-inline-comments.mjs` uses for strings. AC-5 pins the TSDoc case that motivated it. `--all` over 70 real components (55 inline + 15 external) is the breadth proof | Ivo | **closed** — the scanner reaches real content in both template forms, proven by a **positive control** rather than by the sweep's zero: rewriting every real `[disabled]` expression to `saving()` in memory flags 3 in `set-editor.html` (external) and 1 in `daily-view-tab.html`, while the four inputs and the `[appBusy]` splits stay clean. The one real defect it had — the `template:` lookbehind buffer cleared before its own test, masking away all 55 inline templates — was caught by AC-5's sibling case in Phase 0, not by review |
| R-4 | **`payouts-tab` is money-adjacent.** The weather refund cancels and fully refunds every confirmed booking for a day (invariants #9, #10); a careless edit to its handlers could change what it triggers | med | high | The fix adds **only** `focusAfterRender(...)` calls and one `tabindex="-1"`; no request, condition, or notice text changes. The existing `epoch` guard is reused rather than reworked (AC-15). No amount, currency or ledger behaviour is computed client-side, before or after | Ivo | **closed** — the diff on `payouts-tab.ts` is **+8 lines**: one import, one field, four `focusAfterRender(...)` calls, plus `tabindex="-1"` in the template. No request, condition, amount or notice text changed, and the 16 pre-existing specs passed unmodified as the parity net |
| R-5 | **jsdom focus fidelity.** #616 R-1 showed jsdom does not implement unfocus-on-disable, so a busy-window claim can pass without the fix | low | med | Narrower here: this slice moves focus on **element destruction**, which jsdom *does* model, and it touches no `[disabled]`→`aria-disabled` posture. Every AC-12..AC-16 spec is still proven RED first, and AC-17 adds the Chromium leg | Ivo | **closed** — narrower than feared and still not relied on: the slice touches no `[disabled]`→`aria-disabled` posture at all, and every claim has a Chromium leg (AC-17) **verified RED against `origin/main`**. The two absence-asserting cases were mutation-checked rather than trusted |
| R-6 | **Hook noise.** The `PostToolUse` hook now runs two commands on every `Write`/`Edit`; a slow or chatty second guard degrades every edit in the repo | low | med | The guard reads at most two files per edit and does no git work in `--hook` mode beyond the one `HEAD` diff its sibling already does; `timeout: 15` and the `\|\| true` suffix match the existing entry exactly, so a fault degrades to silence | Ivo | **closed** — the hook reads at most two files and runs one `HEAD` diff, the same work its sibling already does per edit; `timeout: 15` and the `|| true` suffix are copied from it, so a fault degrades to silence rather than blocking an edit |
| R-7 | **CI runs the guard against the wrong base.** `ci.yml`'s own comment records that `github.event.pull_request.base.sha` is stale once `main` moves, handing a PR other people's merged lines | med | med | The new step reuses the identical `origin/${{ github.event.pull_request.base.ref }}` form as its two siblings — copied, not re-derived | Ivo | **closed** — the new step's base expression is copied verbatim from its two siblings (`origin/${{ github.event.pull_request.base.ref }}`), not re-derived, and the job's `Fetch the base branch` step already provides it |

## Open questions / Assumptions

- **Assumption:** the busy-flag vocabulary may be authored here rather than needing sign-off — it is
  derived mechanically from the 17 distinct expressions already bound to `[appBusy]` in the tree, not
  invented. — *Owner:* Ivo · *Resolves by:* Phase 0 (flagged for review at the PR).

### Resolved

- **Open question:** should **FOCUS-1** stay a hard CI gate? — **Resolved 2026-08-11 at the third
  review pass by Ivo: no — it advises, it does not gate.** Three passes each produced a fresh
  false-positive finding against its "does this component move focus?" predicate (H-5, H-9, and
  G-2/G-4 before them), because that question is a runtime property approximated by a regex over
  source; five live components move focus with a plain `.focus()`. BUSY-1 was unchallenged across all
  three passes — syntactic, element-allow-listed, 0 false positives over 297 files — and keeps
  failing the build. FOCUS-1 still runs everywhere it did, still prints, and still found the two live
  bugs this slice fixed; it just returns 0. Rejected: widening the predicate again (a fourth pass
  would find the next hole), and dropping FOCUS-1 (nothing mechanical would have caught
  `payouts-tab`).

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

**Stage pointer:** `merge — every gate cleared, close-out written; awaiting the merge itself`

**Next action:** Merge PR #622. The only remaining items are GitHub-only: confirm the `Closes #621`
line closed the issue, and that #623/#624 carry what was deferred. No parent epic to tick (#621 has
none).

PR: **#622** — opened as a draft at the Phase 0 commit, per `riviera-sdlc` rule 3 (CI fires on the
`pull_request` event only); marked ready for review at the Phase 4 commit.

**Gates:** CI — green through the phase pushes; the final push's run is the one to confirm before
merge. Review gate — **run in full, three times**: `/code-review` via ladder rung 1 over the PR diff
(**12 findings**), again over the fix diff per `pr-gates.md` §1 step 3 (**13 more**, two of them
false-positive regressions the first round introduced), and a third time because that round changed
rule *semantics* (**14 more**, including a fourteenth instance of the bug class and the evidence that
settled FOCUS-1's gating posture). **39 findings, all closed** — by fix, or by the human's decision on
FOCUS-1. Sonar gate — **green on the final head SHA (`1549b02`), with the reported list actually pulled from
the API rather than read off the badge**: `issues/search` total **0**, `hotspots/search` **0**, and
`measures` **non-empty** (7 metrics — `new_lines 16`, `new_coverage 100.0`,
`new_duplicated_lines_density 0.0`, `new_duplicated_blocks 0`, 0 new bugs / vulnerabilities / code
smells), which is what distinguishes a clean PR from an unanalyzed one; the `SonarCloud Code
Analysis` check-run concluded `success`. All eight checks green. docs-freshness — **ran**
over `origin/main...HEAD`, 2 stale statements patched + 1 gap filed as #623.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Rule 1: `[disabled]` on a busy flag | ✅ | |
| 1 — Rule 2: a confirm surface with no focus leg | ✅ | |
| 2 — The twelfth instance: `payouts-tab`'s three legs | ✅ | |
| 3 — Wire it: `PostToolUse` hook + the CI step | ✅ | |
| 4 — Full verification + the conventions doc | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| H-1 | **3rd review** (CONFIRMED) | G-3's direct-children floor was judged **per token**, so one deeper sibling disqualified the whole token — `scripts/` stopped covering `scripts/a.mjs` merely because `scripts/lib/b.mjs` was also in the diff. A false positive on a hard gate, and a regression | fixed — the floor moved into `covers`, decided per path. Pinned by `a rooted directory token still covers its direct children beside a deeper sibling` |
| H-2 | **3rd review** (CONFIRMED) | G-3's floor only bit single-segment tokens, so `frontend/src/` restored the whole-app blanket four characters along | fixed by the same move — `isDirectChild` applies to every directory token. Pinned by `a multi-segment rooted token does not blanket a whole tree either` |
| H-3 | **3rd review** (CONFIRMED) | **G-6's fix was still untestable.** `checkPaths` gated its diff scoping on a `tracked === trackedAmong` identity check, so the injected seam could never reach that branch — deleting the diff scoping outright left all 27 tests green | fixed — a third `diff` seam. **Mutation-verified**: deleting the scoping now fails the suite (27/28) |
| H-4 | **3rd review** (CONFIRMED) | The FOCUS-1 **advice string** — the thing an author actually reads when the gate fails — still offered delegation as the remedy G-11 deleted, as did the module header. An author would follow it, push, and fail identically | fixed — both rewritten to say delegation does **not** clear the rule and why |
| H-6 | **3rd review** (CONFIRMED, doc) | A careless `sed` left the previous "Next action" tail behind, so the declared session-recovery anchor carried an orphaned clause with an unmatched `)` and a duplicated instruction | fixed — rewritten by hand |
| H-7 | **3rd review** (CONFIRMED, doc) | AC-6 still stated delegation as an exemption, contradicting the AC-8 the same diff inverted — two incompatible statements of FOCUS-1 six lines apart | fixed |
| H-8 | **3rd review** (CONFIRMED, doc) | `codeOf`'s TSDoc pointed at `MOVES_FOCUS`, renamed in the same commit that fixed the identical G-8 defect | fixed |
| H-10 | **3rd review** (CONFIRMED) | The BUSY-1 advice string still said "Inputs … keep `[disabled]`" (the guard allow-lists `button`/`a`, so *everything* else is out of scope) and still told the author to "split a binding", which F-4 made a violation when both halves carry the same flag | fixed — rewritten to name the allow-list and to say the **validity** half is what stays on `[disabled]` |
| H-13 | **3rd review** (CONFIRMED) | `checkPaths` forked `git diff` before knowing anything was tracked — pure waste on the new-file case the path exists for — and `trackedAmong([])` would have enumerated the whole repository | fixed — tracked first, diff only the tracked subset, empty short-circuits |
| H-14 | **3rd review** (CONFIRMED) | **A fourteenth instance, and one the guard structurally cannot see.** `resetForVenue()` tears down the focus-**trapped** statement modal with no focus leg, so a venue switch or route change while it is open strands focus on `<body>`. `payouts-tab.ts` holds `focusMover()`, so the component-scoped exemption (known limit (a)) excuses it forever | fixed — the leg fires only when the statement was actually open, so an ordinary venue switch still grabs nothing. Pinned by `parks focus on the tab when a venue switch tears down the open statement` and its guard twin, both verified RED |
| H-5, H-9 | **3rd review** (CONFIRMED) | **Two findings, one root cause: FOCUS-1's "does this component move focus?" predicate is a regex over source and cannot be made both safe and precise.** Five live components (`venue-map`, `app`, `operator-chrome`, `focus-trap`, `segmented-control`) move focus with a plain `.focus()` and would have failed the hard gate the moment they grew a confirm branch; and the `afterNextRender` + `.focus(` pair need not even be related | **resolved by decision, not by a fourth patch** — escalated to the human, who chose *advisory*: FOCUS-1 prints and returns 0, BUSY-1 keeps failing the build. Both findings stop being defects the moment a wrong guess costs a log line instead of a red build. See the Resolved open question |
| H-11 | **3rd review** (CONFIRMED) | `--files` on a committed file printed nothing whether or not it was clean, because it was diff-scoped — a by-hand check indistinguishable from a pass, and the wording `frontend/.claude/CLAUDE.md` had just gained pointed straight at it | fixed — an explicit request judges the named files **whole**. The doc now says so |
| H-12 | **3rd review** (CONFIRMED) | The violation was reported at the negated *trigger* branch, which renders no prompt and destroys nothing, sending the author to the wrong block | fixed — a non-negated branch is preferred. Pinned by the renamed `reports one finding per component, against the prompt rather than the trigger` |
| G-1 | **re-review** (CONFIRMED) | **F-11's fix was inert and made things worse.** The new `string` state sat *below* the backtick handler, so the closing backtick re-entered `string` and the `state = 'code'` line was dead — the code mask lost everything after the first plain backtick string. Live shape: `booking-pay.ts` orders a `` `Pay ${…}` `` string before its `afterNextRender(`, so the moment its template grew an `@if (confirmX())` the hard gate would fail a component that demonstrably moves focus | fixed — the `string` branch moved above the opener. Pinned by `returns to code after a plain backtick string closes`, written from the live `booking-pay.ts` shape |
| G-2 | **re-review** (CONFIRMED) | **F-9's per-block delegation flagged the trigger half of a trigger/prompt pair.** `isConfirmPrompt` accepts a negated condition, so `@if (!confirmRemove()) { trigger }` is itself a surface — and only the *prompt* block carries the panel. That is exactly how `payouts-tab.html` is written | fixed by G-11's change, which removes block scoping altogether. Pinned by `does not report the trigger half of a trigger and prompt pair` |
| G-11 | **re-review** (CONFIRMED) | **Delegation excused two thirds of the rule.** `<app-confirm-panel>` owns the *open* leg only — its own TSDoc says "focus back **out** is the caller's" — so a component that delegates and holds no focus helper still strands focus on cancel and on settle, and FOCUS-1 called it clean | fixed — **delegation is no longer an exemption at all**. The rule is now simply "a component rendering a confirm branch holds a focus call site", which also deleted `blockAfter` and with it G-5. AC-8 is inverted to match; all four standing delegators pass on their own helpers |
| G-3 | **re-review** (CONFIRMED) | **F-12's fix legalized whole-tree blanket tokens.** Nothing distinguished `scripts/` from `frontend/`, so one four-character entry satisfied #533 for the entire app — a resuming session learns nothing from it | fixed — a rooted directory token covers its **direct children** only. Pinned by `a rooted token does not blanket a whole tree` alongside the `scripts/` case |
| G-4 | **re-review** (CONFIRMED) | F-7 accepted bare `afterNextRender(` as compliance, but it is a general lifecycle API — `auth/verify-email.ts` uses it for a data call — so any component adopting the idiom for measurement or scrolling was permanently exempt | fixed — it counts only alongside an actual `.focus(`, which is what the two shared confirm components do. Pinned by `does not accept afterNextRender used for something other than focus` |
| G-5 | **re-review** (CONFIRMED) | `blockAfter` decremented depth on a `}` seen at depth 0 and truncated the block on any unbalanced brace (`title="are you sure}"`, `{{ '}' }}`), a false positive on a hard gate | fixed by deletion — G-11 removed the only caller |
| G-6 | **re-review** (CONFIRMED) | **F-6 shipped pinned by nothing.** `checkPaths`/`isTracked` appeared in no suite, so a revert to the old `HEAD`-diff form would have passed CI green — and the untracked case is the guard's whole authoring-time value | fixed — `checkPaths` takes `tracked`/`read` seams and is pinned by `judges an untracked file whole, and reports nothing for a clean tracked one`, which asserts **both** branches |
| G-7 | **re-review** (CONFIRMED, doc) | `frontend/.claude/CLAUDE.md` and AC-4 still advertised the "split bindings" carve-out F-4 deleted, and described the element carve-out as "inputs" when the code allow-lists `button`/`a`. An author following either would write the banned shape and be failed by CI | fixed — both rewritten; AC-4 now states the inverted claim and records why |
| G-8 | **re-review** (CONFIRMED, doc) | `covers`'s TSDoc pointed at `unambiguous`, renamed to `usable` in the same diff | fixed |
| G-9 | **re-review** (CONFIRMED) | `check()`'s `limitTo` parameter went dead when `--hook`/`--files` moved to `checkPaths`, leaving an uncovered filter and a TSDoc contract with no user | fixed — parameter and filter removed |
| G-10 | **re-review** (CONFIRMED) | `isTracked` forked one `git ls-files --error-unmatch` per path and let git's "did you forget to 'git add'?" reach stderr, so the by-hand invocation on a new file printed an error above a report that had in fact worked | fixed — one `git ls-files -z --` for the whole set, no error output |
| G-12 | **re-review** (CONFIRMED, doc) | The File-structure entry cited F-13 where it meant F-12, sending a resuming session to the wrong file from the declared recovery anchor | fixed |
| G-13 | **re-review** (CONFIRMED, doc) | F-3's replacement TSDoc sentence was grammatically incomplete, so the ownership claim it existed to make was not actually made | fixed — "On dismiss the parent must return focus to the trigger — re-rendering it does not focus it." |
| F-2 | **review** (CONFIRMED) | **F-1's fix reintroduced the ambiguity #533 exists to catch.** `changed.includes(token)` admitted the token *wholesale*, so a plan doc listing only root `CLAUDE.md` silently covered every other `CLAUDE.md` in the diff. F-1's test pinned only the both-listed case, so it could not see the hole | fixed — the exact match now settles **its own path** and nothing else; the general cover is judged separately. Pinned by `an exact match settles its own path only, not its suffix matches`, verified RED |
| F-3 | **review** (CONFIRMED) | **A thirteenth instance of the bug class, in the file this slice edits.** `closeStatement()` dismisses the payout-statement modal, which focused its own Close button on open — destroying it and moving focus nowhere. Compounding it: now that `payouts-tab.ts` obtains `focusMover()`, **FOCUS-1 exempts the whole component permanently**, so the new guard would never have surfaced it. The component's TSDoc actively claimed the opposite ("focus returns to the trigger (the parent re-renders it)") — re-rendering a button does not focus it | fixed — `closeStatement()` returns focus to `statement-open`; the false TSDoc claim corrected to name the parent as the leg's owner. Pinned by `returns focus to the statement trigger when the modal closes`, verified RED (`expected <body> to be <button …>`) |
| F-4 | **review** (CONFIRMED) | **BUSY-1 accepted the exact shape it exists to catch.** Skipping any tag carrying `[appBusy]` meant `[appBusy]="saving()"` + `[disabled]="saving()"` passed — the native attribute still blurs the pressed control however much `aria-disabled` says otherwise — and the suite *asserted the miss as correct*. The skip was never load-bearing: the genuine split is already accepted because `isBusyFlag` declines a validity expression | fixed — the `[appBusy]` skip is deleted. Proven by the positive control: `venue-tab.html` and a fourth `set-editor.html` binding now flag when their expression is forced to `saving()`, where before they were exempt. The four real splits still pass |
| F-5 | **review** (CONFIRMED) | **A null dereference crashed the hard CI gate.** `{{ a<b ? 'x' : 'y' }}` reads as a start tag, the attribute-name regex matches nothing at the quote, and `[0]` throws. In `--diff` the step dies with a stack trace; in `--hook` the `2>/dev/null \|\| true` wrapper turns it into a **silent pass**, so the author is told nothing *and* a real violation below it goes unreported | fixed — the tag is abandoned when no name is there. Pinned by `survives a less-than inside an interpolation` |
| F-6 | **review** (CONFIRMED) | **The authoring-time guard was blind to new files.** `--hook`/`--files` diffed against `HEAD`, so an untracked file produced an empty diff and reported clean — and a new component is precisely how a FOCUS-1 surface enters the tree, on the `Write` the hook fires for | fixed — `checkPaths()` judges an untracked file whole. Verified end to end with a probe component: violations now reported on `Write`, where before both modes exited 0 |
| F-7 | **review** (CONFIRMED) | **A comment could exempt a component.** `MOVES_FOCUS` was a substring test over raw source, so a TSDoc sentence *mentioning* `focusMover()` excused the file — live on `shared/confirm-panel.ts` and `shared/confirm-with-reason.ts`, and `auth-page.ts` was exempt via a private `refocusAfterRender()` | fixed — the scanner now emits a **code** mask (comments, strings and template literals removed) beside the template mask, and the marker is a call site. The three live components pass legitimately, on `afterNextRender(`. Pinned by `does not accept a focus helper named only in a comment` and its `afterNextRender` twin |
| F-8 | **review** (CONFIRMED) | **BUSY-1 failed correct code.** Exempting only `input`/`textarea`/`select` left `<fieldset [disabled]>` and a child component's `disabled` input flagged with advice they cannot satisfy — `BusyAction` is for buttons only. The guard's own design premise makes this the error direction it cannot afford | fixed — a deny-list of three became an allow-list of `button`/`a`, which is exactly where all **51** standing `[appBusy]` bindings live. Pinned by `judges only the controls appBusy can actually replace` |
| F-9 | **review** (CONFIRMED, partial) | **One compliant surface exempted every sibling.** Both exemptions were file-scoped, so `<app-confirm-panel>` anywhere excused a hand-rolled prompt added beside it later | fixed for delegation — judged **per block** now, where the prompt is rendered. The `focusMover()` half stays component-level **by design** (a component that moves focus at all is trusted to move it for each leg) and is recorded as a known limit below, not silently |
| F-10 | **review** (CONFIRMED) | `@else if (confirmRemove())` was invisible — `indexOf('@if')` never matches it, and it is the idiomatic way to write a trigger/prompt pair | fixed — a `@(?:else\s+)?if\b` scan. Pinned by `finds a confirm surface in an @else if branch` |
| F-11 | **review** (CONFIRMED, partial) | The template scanner duplicates `check-inline-comments.mjs`'s string/comment state machine, and the copy had **diverged**: a backtick that was not a `template:` value left the scanner in `code` state, so the literal's contents were read as source | the divergence is **fixed** (a non-template backtick now enters a string state); pinned by `skips a backtick string that is not a template`. The **extraction** is deliberately not done — see the known limits below |
| F-12 | **review** (CONFIRMED) | Adjacent pre-existing defect: `token.replace(/\/$/, '').includes('/')` strips a top-level directory token's only slash, so a bare `scripts/` was dropped as ambiguous and covered nothing — the same dead end F-1 fixed one step away | fixed — a rooted directory token is exempt from the ambiguity count, an unrooted one (`components/` across two trees) still is not. Pinned by `a top-level directory token covers the files beneath it` |
| F-13 | **review** (CONFIRMED) | `readCondition` appended a separator at depth 0, so a condition whose `(` opened on the next line arrived with a leading space and `isConfirmPrompt`'s `^\(` anchor never matched | fixed — the separator is appended only inside the parentheses. Pinned by `reads a condition whose parenthesis opens on the next line` |
| F-1 | CI (repo hygiene) | **A latent defect in the sibling plan-doc guard, surfaced by this slice's own docs-freshness patch.** `check-plan-file-structure.mjs` counts a bare token's *suffix* matches to decide whether it is ambiguous, and this diff touches both `CLAUDE.md` and `frontend/.claude/CLAUDE.md`. A repo-root file is written bare because nothing qualifies it, so the root token matched two paths, was dropped as ambiguous, and `CLAUDE.md` became **unlistable — no spelling of it could satisfy the guard.** The pairing is not exotic: it is what a docs-freshness sweep produces whenever it patches the root doc on a frontend slice | fixed-in-`22bd944` — an **exact** match now settles the token rather than being counted among its suffix matches (`changed.includes(token)`). Written test-first and verified RED; the bare-name ambiguity rule for genuinely ambiguous tokens (`index.ts` across two folders) is untouched, pinned by its existing case |

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
- `CLAUDE.md` — the docs-freshness counting-sweep patch: three → **four** diff-scoped hygiene
  checks, and the job split re-stated as "the first three"
- `scripts/check-plan-file-structure.mjs`, `scripts/check-plan-file-structure.test.mjs` — F-1/F-2/F-12:
  an exact path match settles its own path, and a rooted directory token covers its direct children
- `frontend/src/app/operator/payout-statement.ts` — F-3: the TSDoc claim that focus returns to the
  trigger on its own, corrected to name the parent as the owner of that leg

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
- [x] **Step 7: Open the draft PR** (`riviera-sdlc` rule 3 — CI fires on the `pull_request` event
      only) and **update plan-doc execution status** in the same commit window. → PR **#622**.

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

- [x] **Step 1: Write the failing e2e** — AC-17, and verify it RED against `origin/main`'s
      `payouts-tab.ts`, exactly as #616's Phase 6 step 2 did. → **RED confirmed**: with the pre-fix
      component checked out, `toBeFocused()` on `weather-confirm-btn` fails with
      `unexpected value "inactive"`; green with the fix restored.
- [x] **Step 2: Axe** — `expectNoSeriousAxeViolations` after each new state, per the file's siblings.
- [x] **Step 3: Name the guard** in `frontend/.claude/CLAUDE.md` beneath the two conventions it
      enforces, with the by-hand invocation — the shape the inline-comment rule already uses there.
      The `BUSY_STEMS` false-negative posture is stated there too, so the next author extends the
      vocabulary instead of working around a silent rule.
- [x] **Step 4: Full verification** — `npm run lint` clean · `npm test` **1369 passed (156 files)** ·
      `npm run build` succeeds · `npm run test:e2e:a11y` **174 passed (4.8m)** ·
      `node --test "scripts/*.test.mjs"` **93 passed** across all four guard suites.
- [x] **Step 5: Reconcile the File-structure section** — all three diff-scoped guards exit 0 over
      `origin/main` (`check-plan-file-structure`, `check-inline-comments`, and the new
      `check-focus-posture` judging its own PR), and `npm run format:check` is clean.
- [x] **Step 6: Commit** — `git commit -m "Cover the weather-refund focus legs end to end (#621)"`
- [x] **Step 7: Update plan-doc execution status**; mark the PR ready for review.

> **Cloud-session note for a resuming session:** the pre-installed Chromium is revision 1194 while
> this Playwright pins 1228, so the mocked suite needs
> `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. The config already
> reads that variable; never run `npx playwright install`.

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

- [x] **AC-1..AC-5, AC-10:** `node --test scripts/check-focus-posture.test.mjs` → **15 passed**, RED
      first on the missing module. AC-5's case matters most: it exists because
      `shared/busy-action.ts`'s own TSDoc quotes `[disabled]="saving()"`, the exact form rule 1 bans.
- [x] **AC-6..AC-9:** same suite → all pass. The two *flagging* cases (AC-6, and AC-7's stranded
      half) were verified RED; the four carve-out cases pass vacuously against a rule that reports
      nothing, so their real evidence is the `--all` sweep below, not their own red.
- [x] **AC-11:** `node scripts/check-focus-posture.mjs --all` → `BUSY-1: 0  FOCUS-1: 1` before Phase
      2 (the one hit being `operator/payouts-tab.html:84`), `BUSY-1: 0  FOCUS-1: 0` after. Rule 1's
      zero was additionally **positive-controlled** — rewriting every real `[disabled]` expression to
      `saving()` in memory flags 3 in `set-editor.html` and 1 in `daily-view-tab.html` while the four
      inputs and the `[appBusy]` splits stay clean — so it is a real zero, not an unreachable scanner.
- [x] **AC-12..AC-16:** `npx ng test --include="src/app/operator/payouts-tab*.spec.ts"` →
      **35 passed** across unit, a11y and contrast; AC-12..AC-14 verified RED first (`expected
      <body> to be <button …>`), AC-15 and AC-16 **mutation-checked** because they assert an absence.
- [x] **AC-17:** `npx playwright test --config playwright.a11y.config.ts operator-payouts` →
      **3 passed**, and **verified RED against `origin/main`'s `payouts-tab.ts`**
      (`toBeFocused` … `unexpected value "inactive"`).
- [x] **Full verification:** `npm run lint` clean · `npm test` **1369 passed (156 files)** ·
      `npm run build` succeeds · `npm run test:e2e:a11y` **174 passed (4.8m)** ·
      `node --test "scripts/*.test.mjs"` **93 passed** · `npm run format:check` clean · all three
      repo-hygiene guards exit 0 over the whole diff, the new one judging its own PR.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, no backend code.
- [x] **Availability** section filled (justified N/A); invariant #2 untouched.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section filled (N/A, no backend); no new cross-feature FE import (RV-FE-8).
- [x] **Payment/payout** section filled — the weather-refund surface is named and its blast radius
      bounded (R-4).
- [x] Refund policy enforced server-side (invariant #10) — unchanged; no client-side computation added.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A.
- [x] **Frontend** standards met; no `as any`; every `data-testid` preserved.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR**, citing `merged via PR #622`.
- [x] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder plus
      `riviera-review-overlay`, not the overlay alone. Run **three times** (PR diff, fix diff, and the
      semantics-changing second fix round): 12 + 13 + 14 findings, all closed.
- [x] Follow-ups filed for everything deferred: **#623** (the review bank's missing item) and
      **#624** (FOCUS-1's component-scoped exemption).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
