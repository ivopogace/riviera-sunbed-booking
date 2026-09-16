# Auth page: derive the mode/audience reset with `linkedSignal` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Delete `AuthPage`'s constructor `effect` and its two `previous*` closure variables by
deriving `error`, `challengePayload` and the model's `password` clear as `linkedSignal`s, keeping
the asymmetric security rule (a credential never crosses a principal type) pinned in both
directions.

**Architecture:** `error` and `challengePayload` reset on *either* source, so each collapses to a
`linkedSignal` over `[mode, audience]` with a constant `undefined` computation — the shape #1119
established. `model` is the asymmetric one: it resets only on `audience`, so it becomes a
`previous`-aware `linkedSignal` sourced on `audience` alone, which keeps `identifier`/`contactEmail`
and blanks only `password`. That split is what lets the hand-rolled previous-value bookkeeping go
without widening the reset.

**Persistence:** N/A — frontend-only, no tables and no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #1120 (found by #1119's phase-1 generalization audit).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's first-run AC rests on an *undocumented* `previous` semantic, and that no spec pins either
the error reset or the mode-only non-clear) · `riviera-plan-doc` (this template — forced the seam
per AC and the behavior-parity ledger below) · `tdd` (each reset leg pinned red-first before the
effect is deleted) · `riviera-review-overlay` (review gate — ran at ready-for-review over
`6b4d37c2..7de67092`; its RV-STYLE-1 and RV-PROC items produced F-2…F-5, F-7, F-9) ·
`riviera-docs-freshness` (**ran** over `6b4d37c2..HEAD` — the § *Plan-doc retirement* sweep is
F-8, retiring `venue-tab-saved-linked-signal.md`; no substrate doc states anything this
frontend-only slice changed, so no staleness patch and no counting sweep was due) ·
`riviera-frontend` (placement: everything stays in the existing `auth/` feature folder, no new
file under `src/`; confirmed the e2e leg belongs in the CI-safe mocked suite) ·
`angular-developer` + the angular-cli MCP (`get_best_practices` v22 posture — "`linkedSignal()` for
state derived from multiple reactive sources"; `search_documentation` + angular.dev for the
`previous` contract, recorded as F1–F7 below) · `playwright-cli` (the real-browser leg for the
security behaviour) · `riviera-local-debug` (before the session's first `npm` invocation)

**Branch:** `claude/angular-tailwind-docs-z4t9bb` — the cloud session's designated remote branch
stands in for `feature/auth-page-linked-signal` (`riviera-sdlc` § *Remote / cloud session addendum*).

---

## Framework facts this plan rests on (verified, not remembered)

`frontend/.claude/CLAUDE.md` requires Angular API behaviour to be verified against angular.dev
rather than recalled. The issue's own Notes ask for two specific confirmations. Both were run
before this plan was written; where angular.dev is silent, the shipped runtime
(`node_modules/@angular/core/fesm2022/_untracked-chunk.mjs`, `LINKED_SIGNAL_NODE`) was read.

| # | Fact | Source | Consequence here |
|---|---|---|---|
| F1 | `previous` has exactly `{ source, value }`; using it requires explicit generic type arguments | angular.dev *Accounting for previous state* | the `model` linkedSignal is written `linkedSignal<Audience, AuthModel>({…})` |
| F2 | **`previous` is `undefined` iff the value is `UNSET` (first computation) or `ERRORED` (the last computation threw)** — angular.dev does **not** state this; it is `oldValueValid` in the runtime | shipped runtime | a computation that cannot throw gets `previous === undefined` ⇔ first run. The issue's first-run AC rests on this, so it must be **pinned by a spec** rather than trusted — which AC-8, added at the review gate, is the first spec to actually do (AC-5 could not: see F-1) |
| F3 | A value written with `.set()` is what the next recompute reports as `previous.value` (`linkedSignalSetFn` → `signalSetFn` writes `node.value`) | shipped runtime | a user-typed password is readable as `previous.value`, so the computation can blank *only* `password` |
| F4 | An equal recompute does **not** bump the version (`wasEqual` → early return, `Object.is` by default) | shipped runtime | answers the issue's "does a linkedSignal on a linkedSignal compose?": a **mode-only** nav re-runs `audience`'s computation, it returns the same string, its version does not bump — so anything sourced on `audience` alone does not recompute. This is the mechanism the asymmetric password rule depends on |
| F5 | Recomputation is lazy/pull-based (on read), not at a change-detection flush | shipped runtime | removes the `ExpressionChangedAfterItHasBeenChecked` hazard the effect guide warns about |
| F6 | A `linkedSignal` is a documented Signal Forms model (`form(this.formModel)`) | angular.dev *Designing your form model* | making `model` a `linkedSignal` is a documented shape, not a gamble |
| F7 | "Avoid using effects for propagation of state changes… If you find yourself copying data from one signal to another with an effect… use `computed()` or `linkedSignal()` instead." | angular.dev *effect* guide | the rule this slice applies |

---

## Acceptance criteria (testable)

> All seams are the rendered `AuthPage` observed through its `[data-testid]` hooks and its live
> `queryParamMap` — the component's public surface. No AC reaches into a signal directly, so the
> specs stay true after the internals change.

- [x] **AC-1:** Given `AuthPage` as shipped, when the file is read, then the constructor holds no
  `effect` and neither `previousMode` nor `previousAudience` exists; `error` and `challengePayload`
  are `linkedSignal`s sourced on `[mode, audience]`. *Seam:* the `AuthPage` source file itself ·
  *Pinned by:* `npm run lint` + `auth-page.spec.ts` (the whole file passing unchanged is the real
  proof) and the behavior-parity ledger below.
- [x] **AC-2:** Given a tourist card with `tourist-secret` typed into the password field, when the
  audience switches to operator — by the in-card control **and**, separately, by a live
  `?audience=operator` nav — then the password field reads `''`. *Seam:* `[data-testid="auth-password"]`
  + `queryParamMap` · *Pinned by:* `auth-page.spec.ts` › `clears the password when the audience
  switches` and › `clears the password on a live audience query-param change` (both existing, must
  pass unchanged).
- [x] **AC-3:** Given a card with `tourist-secret` typed into the password field, when only the
  **mode** changes (the in-card toggle, and a live `?mode=register` nav), then the password field
  still reads `tourist-secret`. *Seam:* `[data-testid="auth-password"]` + `[data-testid="auth-toggle-mode"]`
  + `queryParamMap` · *Pinned by:* `auth-page.spec.ts` › `keeps the password when only the mode
  changes` **(new — this is the security asymmetry's negative leg, unpinned today)**.
- [x] **AC-4:** Given a card showing a sign-in failure in `[data-testid="auth-error"]`, when a live
  nav changes the mode, and separately when the audience switches, then the error element is gone.
  Both legs were chosen because neither had an explicit call site at the time — `toggleMode()` then
  still cleared the error itself, so a toggle-driven spec would have passed whatever the derivation
  did. F-5 removed that clear, and AC-10 now covers the toggle leg too. *Seam:*
  `[data-testid="auth-error"]` ·
  *Pinned by:* `auth-page.spec.ts` › `drops a stale error when a live nav changes the mode` and ›
  `drops a stale error when the audience switches` **(new — the error reset is unpinned today;
  only the challenge reset is covered)**.
- [x] **AC-5:** Given a card showing a sign-in failure, when a render pass happens with **no** change
  to mode or audience (a keystroke in the identifier field), then the error is still shown — no
  reset fires without a source change, matching today's early-return guard. *Seam:*
  `[data-testid="auth-error"]` · *Pinned by:* `auth-page.spec.ts` › `keeps the error while neither
  mode nor audience changes` **(new — this is the F2 guarantee, pinned rather than trusted)**.
- [x] **AC-6:** Given the tourist register card with a solved challenge, when the card changes mode
  and when it changes audience, then the remounted widget's solution is not reused. *Seam:* the
  `altcha-widget` element + `CustomerAuth.register`'s third argument · *Pinned by:*
  `auth-page.spec.ts` › `drops the solved challenge when the card changes mode, so a remounted
  widget starts fresh` and › `never carries the tourist card’s solution across the audience switch`
  (both existing, must pass unchanged).
- [x] **AC-7:** Given a real browser on `/account/sign-in` with a password typed, when the audience
  switches to operator, then the password field is empty. *Seam:* the rendered page in Chromium ·
  *Pinned by:* `frontend/e2e/unified-auth.e2e.ts` › `a credential never survives the audience
  switch, and a mode toggle keeps it (#1120)` **(new — jsdom is not where a security behaviour
  should be proved alone)**.

- [x] **AC-8:** Given an identifier AND a password typed on the tourist card, when the audience
  switches, then the identifier survives and only the password is blanked. *Seam:*
  `[data-testid="auth-identifier"]` + `[data-testid="auth-password"]` · *Pinned by:*
  `auth-page.spec.ts` › `carries the identifier across an audience switch, clearing only the
  password` **(added at the review gate — this is the ONLY spec that fails if `previous` stops
  arriving, and R-2 was closed without it; see F-1 in the findings register)**.
- [x] **AC-9:** Given a typed tourist credential, when the audience tab is clicked and the form is
  submitted **in the same task** (no render pass between), then neither sign-in is called — the
  credential cannot reach the operator endpoint. *Seam:* `CustomerAuth.signIn` /
  `OperatorAuth.signIn` · *Pinned by:* `auth-page.spec.ts` › `cannot submit a tourist credential to
  the operator endpoint in the same task` **(added at the review gate; fails on the pre-refactor
  effect — see the ledger's security row)**.
- [x] **AC-10:** Given a visible sign-in error, when the in-card mode toggle is clicked, then the
  error clears — through the derivation, not a hand-wired `set`. *Seam:*
  `[data-testid="auth-toggle-mode"]` · *Pinned by:* `auth-page.spec.ts` › `drops a stale error when
  the in-card toggle changes the mode` **(added at the review gate with the redundant clear's
  removal)**.

## Non-goals

- **Not** widening the reset: `identifier` and `contactEmail` keep surviving an audience change,
  exactly as today. Only `password` is blanked.
- ~~**Not** touching `toggleMode()`'s or `backToSignIn()`'s own explicit `error.set(undefined)` /
  `model.set(…)` calls — those are deliberate actions, not derivations (the #1119 line on
  `onSave`).~~ **Retracted at the review gate (F-5).** The #1119 citation was wrong: `onSave`'s
  clear survived because *no source covered it*, whereas `toggleMode()` always flips `mode`, which
  IS one of `error`'s two sources — so its clear was a second statement of the derived rule, the
  exact trap #1119's F-2 removed, and it masked the derivation on the commonest path. It is gone,
  and AC-10 pins the leg it was hiding. `backToSignIn()`'s clears stay: they are reached from the
  pending card, and `model` is not sourced on `mode` at all.
- **Not** the other 19 `effect` sites the #1119 audit cleared as legitimate (route-param → HTTP load,
  DOM measurement, focus management). The audit is re-run in phase 2 to confirm the population is
  closed, not to widen the slice.
- **No styling change.** `auth-page.ts` carries no SCSS and no `styles`/`styleUrl`; the template's
  Tailwind classes are untouched, so `riviera-tailwind`'s migrate-on-touch rule is not tripped.
- **Not** #1122 (the pre-existing announcer hole filed by #1119).

## Behavior-parity ledger

> The slice replaces one reset mechanism with another, so "refactor only" is verified leg by leg.

| Old-surface behavior (the constructor `effect`) | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| resets `error` when `mode` changes | preserved | `error` is a `linkedSignal` sourced on `[mode, audience]` (AC-4) |
| resets `error` when `audience` changes | preserved | same source list (AC-4) |
| resets `challengePayload` when `mode` changes | preserved | same shape as `error` (AC-6) |
| resets `challengePayload` when `audience` changes | preserved | same shape as `error` (AC-6) |
| blanks `model.password` when `audience` changes | preserved | `model` is a `previous`-aware `linkedSignal` sourced on `audience` alone (AC-2) |
| does **not** blank `model.password` when only `mode` changes | preserved | `model` is not sourced on `mode`; F4 is why the stacked `audience` linkedSignal does not bump on a mode-only nav (AC-3) |
| keeps `identifier`/`contactEmail` across an audience change | preserved | the computation spreads `previous.value` and overrides only `password` (F3) |
| no reset on the effect's first run (the early-return guard) | preserved | `previous === undefined` on the first computation (F2); `error`/`challengePayload` simply start `undefined` (AC-5) |
| reset lands at the next change-detection flush | **changed — and it closes a credential leak** | now pull-based on read (F5), and `linkedSignalSetFn` flushes a pending recompute *before* a write. Under the effect, clicking the audience tab and submitting in the SAME task read the stale model, so a tourist password could be posted to the operator endpoint; the derivation recomputes on `onSubmit`'s read and blanks it first. Found at the review gate, verified by running the new spec against the pre-refactor file (it fails there), and pinned by AC-9 |
| `model.set({ identifier: '', contactEmail: '', password: '' })` at two call sites — a fresh literal each time, so always a version bump | **changed** | both now pass the shared `EMPTY_AUTH_MODEL`, so a second set of the same object is `Object.is`-equal and skips the bump (the #1119 F-1 mechanism). Benign: the two writes carry identical content, `backToSignIn` is only reachable from the pending card whose form was already destroyed, and Signal Forms writes immutably (`valueForWrite` spreads), so the shared constant cannot be poisoned |
| `toggleMode()` clears `error` itself | **dropped** | removed at the review gate (F-5): `mode` always flips there, so the derivation already covers it; the line only masked it. AC-10 pins the leg |
| a same-tick `mode` A→B→A round trip nets to *no* reset (the effect batches and compares) | **changed** | a `linkedSignal` resets on the version bumps. Not a reachable user path (mode changes come from one click or one nav), and `toggleMode()` already clears `error` explicitly |
| the bookkeeping survives a re-seed of the component's reactive state | **dropped → fixed** | the `let` closure variables were outside the reactive graph (the issue's tell #2); there is no bookkeeping to go stale now |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The asymmetric rule inverts — a credential leaks across principal types, or the password is wiped mid-typing on a mode toggle | low | **high** (security) | both directions pinned: AC-2 (clears on audience) and AC-3 (keeps on mode), plus the real-browser AC-7; F4 records *why* the stacking composes | agent | **closed** — AC-2/AC-3/AC-7 green and each mutation-checked; the gate's same-task probe (AC-9) additionally showed the refactor *narrows* this risk |
| R-2 | `previous === undefined` is relied on for first-run and angular.dev does not state it | med | med | read from the shipped runtime (F2) and recorded; ~~AC-5 pins the behaviour~~ | agent | **closed, but only after the gate caught that the mitigation was wrong** — AC-5 asserts on `error`, whose computation never reads `previous`, so it could not have failed. Mutating the model computation to `() => EMPTY_AUTH_MODEL` left the whole suite green. AC-8 is the real pin and fails that mutation. See F-1 |
| R-3 | Signal Forms misbehaves with a `linkedSignal` model (writes lost, field tree rebuilt) | low | med | F6 — documented shape; the model keeps a static structure (same three keys), so no field is added or removed. The whole existing `auth-page.spec.ts` typing/submit suite is the regression net | agent | **closed** — the gate read `valueForWrite` in the installed `@angular/forms` and confirmed every field write is a fresh spread; 173 auth specs green |
| R-4 | `[(payload)]="challengePayload"` two-way binding needs a `WritableSignal` | low | med | `linkedSignal` returns `WritableSignal<T>` (F1 signature); AC-6's two existing specs exercise the binding both ways | agent | **closed** — `ɵɵtwoWayBindingSet` is `isWritableSignal(target) && target.set(value)`, which a `linkedSignal` satisfies; both AC-6 specs green |
| R-5 | The slice collides with in-flight work | low | low | checked at intake: the only open PR is #1093 (dependabot `vitest` 4→5), which touches no `src/` file. No Flyway number in play (frontend-only) | agent | closed — intake |

## Open questions / Assumptions

*(empty — see Resolved.)*

### Resolved

- **Assumption:** a same-tick `mode` A→B→A round trip is not a user-reachable path, so that ledger
  row needs no compensating spec. — **Held.** Mode changes come from one click or one nav. The
  review gate checked the same mechanism from the other side and found the *audience* same-task
  path, which IS reachable and is now pinned by AC-9. Resolved in the review-fix commit.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice changes how three client-side signals are derived
inside one auth card; it writes no booking, touches no `set_availability` row, and issues no
request it did not already issue.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No file under `platform/` is touched.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/auth/auth-page.ts` | existing | standalone component | `linkedSignal` replaces the constructor `effect`; `mode`/`audience` stay `linkedSignal`s over the URL | Signal Forms over a `linkedSignal` model (F6) |
| FE-2 | `frontend/src/app/auth/auth-page.spec.ts` | existing | Vitest/jsdom spec | — | — |
| FE-3 | `frontend/e2e/unified-auth.e2e.ts` | existing | Playwright (CI-safe mocked suite) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs.
No deviation. `get_best_practices` (v22) is explicit that `linkedSignal()` is the tool for "state
derived from multiple reactive sources that must stay synchronized", which is precisely this change.

## FE↔BE contract

N/A — no contract change. The same `CustomerAuth`/`OperatorAuth` calls with the same arguments.

## Execution status

**Stage pointer:** `merge close-out — review gate run, findings F-1…F-10 fixed; awaiting the Sonar
list on the review-fix push`

**Next action:** read the SonarCloud new-issue + measures list for PR #1123 on the review-fix head
(the earlier green badge was the plan-doc-only first push, which lies outside `sonar.sources` and
analysed nothing), clear any entry, then merge and run close-out steps 1-3 + 5-7.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — pin the reset legs with specs (AC-3, AC-4, AC-5) | ✅ | `e5197d75` |
| 1 — replace the effect with linkedSignals (AC-1, AC-2, AC-6) | ✅ | `c58bb0e2` |
| 2 — real-browser leg (AC-7) + generalization audit | ✅ | `b67e23aa` |
| 2a — RV-STYLE-1 comment fix, caught by the hygiene guard before pushing | ✅ | `7de67092` |
| 3 — review-gate findings F-1…F-10 (AC-8, AC-9, AC-10) + close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (git-history agent) | **R-2 was closed on evidence that does not exist.** The plan and phase 1's commit message both claimed `previous`'s semantics were "pinned by a spec rather than trusted", but AC-5 asserts on `error`, whose computation never reads `previous`. Mutating the model computation to `() => EMPTY_AUTH_MODEL` — R-2's exact failure mode, which silently wipes `identifier` and `contactEmail` on every audience switch — left all 51 specs green. The ledger's "keeps `identifier`/`contactEmail` — preserved" row was therefore unverified. #1119's F-5 class, repeating. | fixed — AC-8 added and confirmed to fail that mutation; R-2 and the claim corrected |
| F-2 | review (CLAUDE.md + comment agents, independently) | The `challengePayload` TSDoc explained the reset by "a **remounted** widget must start unverified", but `showChallenge` is `mode() === 'register'` only — an audience change leaves the widget mounted and the reset reaches it through `[(payload)]`. Correct behaviour, wrong stated mechanism, and the audience leg is the one a future reader could wrongly delete. | fixed — the TSDoc states the contract without the false mechanism |
| F-3 | review (comment agent) | `onAudienceChange`'s comment said the password reset derives from "`audience`/`mode`", contradicting the `model` TSDoc six lines above ("Sourced on `audience` ALONE, never the pair") — the very rule this slice documents. | fixed — the comment points at the declarations instead of restating the sources |
| F-4 | review (three agents; matches #1121 F-6 and #875 f.2) | The new TSDoc ran 4-7 lines against §6d's ~3-line member budget, carrying §6c "motivation and praise of the mechanism" clauses (the angular.dev quote, the `set-editor.ts` pointer, "derived rather than written from an `effect`"). `error`'s also claimed a reset "whenever the card changes shape", which `submittedForApproval` falsifies. | fixed — all three trimmed to contract; the rationale lives here, in the plan |
| F-5 | review (comment + git-history agents) | `toggleMode()`'s `error.set(undefined)` was redundant with the new `[mode, audience]` source and **masked the derivation on the commonest path**; the plan's non-goal defended it by mis-citing #1119's `onSave` line, which survived for the opposite reason (no source covered it). | fixed — removed, non-goal retracted, AC-10 pins the now-derived leg |
| F-6 | review (bug-scan agent, verified against the pre-refactor file) | Not a defect but an unrecorded **improvement**: the effect's flush-deferred reset let a same-task tab-click-then-submit post a tourist password to the operator endpoint. The derivation cannot. | recorded — ledger row rewritten, AC-9 added; the spec fails on the pre-refactor file |
| F-7 | review (CLAUDE.md + prior-PR agents; #649 f.3, #875 f.6 class) | Two `Pinned by` citations were ellipsis-truncated or missing a title suffix, and the **PR body's** AC-4 cited a spec title that does not exist (the spec was split in two). | fixed — every citation quotes the shipped `it(...)` title verbatim; PR body corrected |
| F-8 | review (prior-PR agent) | `docs/plans/venue-tab-saved-linked-signal.md` was still in the tree although its PR #1121 merged as `6b4d37c2`. The close-out retirement sweep was due in this PR, exactly as #1121 did for two others. | fixed — retired in this commit |
| F-9 | review (comment agent) | AC-5's "keystroke" leg retyped the identifier `failSignIn()` had already typed, so it wrote an identical string and asserted nothing. | fixed — a distinct value; mutation-checked (sourcing `error` on the model now fails it) |
| F-10 | self, while fixing F-7 | The phase table cited `b1600b70`/`6b75c20a`/`46df2464`, three **orphaned** commits: each phase inserted its own SHA and then `--amend`ed, which changed it. Same class as F-7 — a citation that does not resolve — and the reason this row records "this commit" rather than a SHA. | fixed — the three real branch SHAs recorded |

---

## File structure

- `docs/plans/auth-page-linked-signal.md` — this plan
- `docs/plans/venue-tab-saved-linked-signal.md` — **deleted**, not this slice's work: the close-out
  plan-doc retirement sweep (`riviera-docs-freshness` § *Plan-doc retirement*), since its PR #1121
  (for #1119) merged as `6b4d37c2`. Surfaced by the review gate (F-8)
- `frontend/src/app/auth/auth-page.ts` — the effect goes; three `linkedSignal`s arrive
- `frontend/src/app/auth/auth-page.spec.ts` — three new specs (AC-3, AC-4, AC-5)
- `frontend/e2e/unified-auth.e2e.ts` — the real-browser credential leg (AC-7)

---

## Phase 0 — Pin the reset legs that nothing covers today

**Files:** Modify `frontend/src/app/auth/auth-page.spec.ts`

Phase 0 is characterization: these three specs describe what the **current** effect already does,
so they must go **green against the unchanged component**. That is what makes them a regression net
for phase 1 rather than a restatement of it. AC-3 is the one that matters most — the security
asymmetry's negative leg.

- [x] **Step 1: Write the specs** (AC-3, AC-4, AC-5) using the file's existing helpers
  (`render`, `type`, `el`, `chooseAudience`, `navigateQueryParams`, `submit`).
- [x] **Step 2: Run them against the unchanged component** —
  `npx ng test --watch=false --include="src/app/auth/auth-page.spec.ts"` → 50/50 PASS
  (characterization; the bare `npx vitest` form fails on the jsdom environment — use `ng test`).
- [x] **Step 2a: Mutation-check them, so a passing characterization spec is not a vacuous one.**
  Two mutations of the *current* effect, each reverted after:
  `if (audience !== previousAudience)` → `if (true)` fails **only** `keeps the password when only
  the mode changes` (1 failed / 49 passed); deleting the effect's `this.error.set(undefined)`
  fails **only** the two new error specs (2 failed / 48 passed) — no pre-existing spec notices,
  which is the coverage gap this phase closes. AC-5's mutation needs the new source list and is
  run in phase 1.
- [x] **Step 3: Commit** — `Pin the auth card's reset legs before deriving them (#1120)`
- [x] **Step 4: Update plan-doc execution status** in the same commit window.

## Phase 1 — Derive the resets, delete the effect

**Files:** Modify `frontend/src/app/auth/auth-page.ts`

- [x] **Step 1: Replace `error` and `challengePayload`** with `linkedSignal`s sourced on
  `[this.mode(), this.audience()]`, computation `() => undefined`.
- [x] **Step 2: Replace `model`** with the `previous`-aware form, generics explicit per F1:
  sourced on `this.audience`, computation returns the empty model when `previous` is `undefined`
  (first run, F2) and `{ ...previous.value, password: '' }` otherwise (F3).
- [x] **Step 3: Delete the constructor `effect`**, both `previous*` variables, and the now-stale
  `// Password + error reset is owned by the audience/mode effect above.` comment in
  `onAudienceChange`; drop `effect` from the `@angular/core` import if unused.
- [x] **Step 4: Run the full auth spec set** —
  `npx ng test --watch=false --include="src/app/auth/**/*.spec.ts"` → 170/170 PASS across 11 files,
  including the phase-0 four and every pre-existing case.
- [x] **Step 4a: The mutation check phase 0 deferred**, now that the source lists exist. Sourcing
  `error` on `queryParams()` instead of the pair fails `keeps the error while neither mode nor
  audience changes` (and the in-card audience leg) — AC-5 earns its place. Sourcing `model` on the
  pair instead of `audience` alone fails `keeps the password when only the mode changes` and
  nothing else — the asymmetry is pinned from both sides. Both reverted.
- [x] **Step 5: Lint + format** — `npm run lint` → all files pass; `npm run format:check` → clean.
- [x] **Step 6: Commit** — `Derive the auth card's mode/audience reset with linkedSignal (#1120)`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

> **One addition the plan did not anticipate, recorded per the routing gate's step 3.** The empty
> model is now a named `EMPTY_AUTH_MODEL` beside an `AuthModel` interface, and the two imperative
> `model.set({…})` clears in `backToSignIn`/`onSubmit` use it. This follows `set-editor.ts`'s
> `EMPTY_BATCH_DRAFT` precedent exactly (module-level constant + explicit `linkedSignal` generics +
> reuse at the imperative call site). It does **not** breach the "don't touch those calls"
> non-goal: the calls stay, deliberate as before, with the identical value now named once instead
> of spelled out three times.

## Phase 2 — The real-browser leg, then the generalization sweep

**Files:** Modify `frontend/e2e/unified-auth.e2e.ts`

- [x] **Step 1: Write the e2e leg** (AC-7) in the CI-safe mocked suite, following the file's
  existing mocking idiom.
- [x] **Step 2: Run it** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
  --config playwright.a11y.config.ts unified-auth` → 12/12 PASS (the env var is required in a cloud
  session; `riviera-local-debug` § *Playwright in a cloud session*). Mutation-checked too: dropping
  the audience reset fails the new leg in a real browser.
- [x] **Step 3: Generalization-audit pass.** Re-run #1119's mechanism sweep — *every `effect` /
  `afterRenderEffect` body that writes a signal and does no imperative work* — and confirm the
  population is now closed. Record the command that **found** the population, the sites, and the
  decision in the log below.
- [x] **Step 4: Commit** — `Prove the credential never survives the audience switch in a real browser (#1120)`
- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | phase 2 (#1120) | **Every `effect` / `afterRenderEffect` body under `frontend/src/app` that writes a signal and does no imperative work** — #1119's own population, re-enumerated to check it is now closed. Enumerated by parsing each call's balanced-paren body out of every non-spec `.ts` file `git ls-files` lists, then classifying: writes = `.set(`/`.update(` in the body, imperative = `await`/`void`/`untracked(`/DOM/`localStorage`/`ResizeObserver`/`setTimeout`/emit/subscribe. Bodies matching neither rule were judged by hand rather than assumed. | `python3 scratchpad/effect-sweep.py` (the parser above; its raw input is `git ls-files src/app`, and the sanity cross-check that it was not under-counting was <code>git ls-files 'src/app/**/*.ts' \| grep -v '\.spec\.ts$' \| xargs grep -ln "\beffect(\\\|afterRenderEffect("</code> → 26 files) | 33 effect bodies across 26 files. 2 write a signal (`pricing-tab.ts:120`, `venue-tab.ts:277`) — both `untracked`-wrapped route-param → HTTP loaders, the legitimate category. 5 more needed a hand call: focus reclaim (`set-editor`), DOM measurement (`beach-map-canvas`), `aria-describedby` writes (`field-error-for`), MapLibre pin sync (`riviera-map`), month fetch (`availability-calendar`). | **Population closed — no action.** Zero pure state-propagation effects remain: #1119 took `venue-tab`'s Saved notice, this slice took `auth-page`. The count differs from #1119's "21 files" because that audit counted any effect reaching a signal through a method; this one counts a direct signal write in the body, and both agree on the two that mattered. |

---

## Acceptance-criteria verification (final)

All unit ACs run under one command — `npx ng test --watch=false --include="src/app/auth/**/*.spec.ts"`
→ **173 passed, 11 files**; the e2e AC under
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts unified-auth`
→ **12 passed**. Each AC below names the spec that carries it and the mutation that proves the spec
is load-bearing (every one was reverted after).

- [x] **AC-1:** no `effect(`, `previousMode` or `previousAudience` in `auth-page.ts` — only prose mentions remain.
- [x] **AC-2:** `clears the password when the audience switches` + `clears the password on a live audience query-param change`. *Mutation:* dropping the audience reset fails both, and the e2e leg.
- [x] **AC-3:** `keeps the password when only the mode changes`. *Mutation:* sourcing `model` on the pair fails it, and nothing else.
- [x] **AC-4:** `drops a stale error when a live nav changes the mode` + `drops a stale error when the audience switches`. *Mutation:* deleting the effect's `error.set(undefined)` (pre-refactor) failed exactly these two and no pre-existing spec.
- [x] **AC-5:** `keeps the error while neither mode nor audience changes`. *Mutation:* sourcing `error` on `queryParams()` fails it; sourcing it on the model fails it too (that second one is what F-9's fix bought).
- [x] **AC-6:** `drops the solved challenge when the card changes mode, so a remounted widget starts fresh` + `never carries the tourist card’s solution across the audience switch` — both pre-existing, both pass unchanged.
- [x] **AC-7:** `a credential never survives the audience switch, and a mode toggle keeps it (#1120)`. *Mutation:* dropping the audience reset fails it in Chromium.
- [x] **AC-8:** `carries the identifier across an audience switch, clearing only the password`. *Mutation:* `computation: () => EMPTY_AUTH_MODEL` (R-2's failure mode) fails it — and failed **nothing** before this spec existed (F-1).
- [x] **AC-9:** `cannot submit a tourist credential to the operator endpoint in the same task`. *Verification:* run against the pre-refactor `auth-page.ts`, it **fails** — the leak was real (F-6).
- [x] **AC-10:** `drops a stale error when the in-card toggle changes the mode`. *Mutation:* dropping `mode` from `error`'s source fails it alongside the live-nav leg.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — rung 1 of the ladder (`Skill("code-review:code-review")`) with `riviera-review-overlay` layered on, over the range verified by `check-review-range.mjs` (exit 0: 4 files, +462 -27, matched against the PR). Five parallel reviewers; ten findings, all fixed in phase 3.
