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
effect is deleted) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (<pending — runs at merge close-out over `origin/main..HEAD`>) ·
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
| F2 | **`previous` is `undefined` iff the value is `UNSET` (first computation) or `ERRORED` (the last computation threw)** — angular.dev does **not** state this; it is `oldValueValid` in the runtime | shipped runtime | a computation that cannot throw gets `previous === undefined` ⇔ first run. The issue's first-run AC rests on this, so AC-5 **pins it with a spec** rather than trusting it |
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

- [ ] **AC-1:** Given `AuthPage` as shipped, when the file is read, then the constructor holds no
  `effect` and neither `previousMode` nor `previousAudience` exists; `error` and `challengePayload`
  are `linkedSignal`s sourced on `[mode, audience]`. *Seam:* the `AuthPage` source file itself ·
  *Pinned by:* `npm run lint` + `auth-page.spec.ts` (the whole file passing unchanged is the real
  proof) and the behavior-parity ledger below.
- [ ] **AC-2:** Given a tourist card with `tourist-secret` typed into the password field, when the
  audience switches to operator — by the in-card control **and**, separately, by a live
  `?audience=operator` nav — then the password field reads `''`. *Seam:* `[data-testid="auth-password"]`
  + `queryParamMap` · *Pinned by:* `auth-page.spec.ts` › `clears the password when the audience
  switches` and › `clears the password on a live audience query-param change` (both existing, must
  pass unchanged).
- [ ] **AC-3:** Given a card with `tourist-secret` typed into the password field, when only the
  **mode** changes (the in-card toggle, and a live `?mode=register` nav), then the password field
  still reads `tourist-secret`. *Seam:* `[data-testid="auth-password"]` + `[data-testid="auth-toggle-mode"]`
  + `queryParamMap` · *Pinned by:* `auth-page.spec.ts` › `keeps the password when only the mode
  changes` **(new — this is the security asymmetry's negative leg, unpinned today)**.
- [ ] **AC-4:** Given a card showing a sign-in failure in `[data-testid="auth-error"]`, when the mode
  changes, and separately when the audience changes, then the error element is gone. *Seam:*
  `[data-testid="auth-error"]` · *Pinned by:* `auth-page.spec.ts` › `drops a stale error when the
  card changes mode or audience` **(new — the error reset is unpinned today; only the challenge
  reset is covered)**.
- [ ] **AC-5:** Given a card showing a sign-in failure, when a render pass happens with **no** change
  to mode or audience (a keystroke in the identifier field), then the error is still shown — no
  reset fires without a source change, matching today's early-return guard. *Seam:*
  `[data-testid="auth-error"]` · *Pinned by:* `auth-page.spec.ts` › `keeps the error while neither
  mode nor audience changes` **(new — this is the F2 guarantee, pinned rather than trusted)**.
- [ ] **AC-6:** Given the tourist register card with a solved challenge, when the card changes mode
  and when it changes audience, then the remounted widget's solution is not reused. *Seam:* the
  `altcha-widget` element + `CustomerAuth.register`'s third argument · *Pinned by:*
  `auth-page.spec.ts` › `drops the solved challenge when the card changes mode…` and › `never
  carries the tourist card's solution across the audience switch` (both existing, must pass
  unchanged).
- [ ] **AC-7:** Given a real browser on `/account/sign-in` with a password typed, when the audience
  switches to operator, then the password field is empty. *Seam:* the rendered page in Chromium ·
  *Pinned by:* `frontend/e2e/unified-auth.e2e.ts` › `a credential never survives the audience
  switch` **(new — jsdom is not where a security behaviour should be proved alone)**.

## Non-goals

- **Not** widening the reset: `identifier` and `contactEmail` keep surviving an audience change,
  exactly as today. Only `password` is blanked.
- **Not** touching `toggleMode()`'s or `backToSignIn()`'s own explicit `error.set(undefined)` /
  `model.set(…)` calls — those are deliberate actions, not derivations (the #1119 line on `onSave`).
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
| reset lands at the next change-detection flush | **changed** | now pull-based on read (F5). The same deliberate change #1119 made and the reason the docs prefer this shape; no spec observes the flush timing |
| a same-tick `mode` A→B→A round trip nets to *no* reset (the effect batches and compares) | **changed** | a `linkedSignal` resets on the version bumps. Not a reachable user path (mode changes come from one click or one nav), and `toggleMode()` already clears `error` explicitly |
| the bookkeeping survives a re-seed of the component's reactive state | **dropped → fixed** | the `let` closure variables were outside the reactive graph (the issue's tell #2); there is no bookkeeping to go stale now |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The asymmetric rule inverts — a credential leaks across principal types, or the password is wiped mid-typing on a mode toggle | low | **high** (security) | both directions pinned: AC-2 (clears on audience) and AC-3 (keeps on mode), plus the real-browser AC-7; F4 records *why* the stacking composes | agent | open |
| R-2 | `previous === undefined` is relied on for first-run and angular.dev does not state it | med | med | read from the shipped runtime (F2) and recorded; AC-5 pins the behaviour so a future Angular bump fails a spec rather than silently resetting | agent | open |
| R-3 | Signal Forms misbehaves with a `linkedSignal` model (writes lost, field tree rebuilt) | low | med | F6 — documented shape; the model keeps a static structure (same three keys), so no field is added or removed. The whole existing `auth-page.spec.ts` typing/submit suite is the regression net | agent | open |
| R-4 | `[(payload)]="challengePayload"` two-way binding needs a `WritableSignal` | low | med | `linkedSignal` returns `WritableSignal<T>` (F1 signature); AC-6's two existing specs exercise the binding both ways | agent | open |
| R-5 | The slice collides with in-flight work | low | low | checked at intake: the only open PR is #1093 (dependabot `vitest` 4→5), which touches no `src/` file. No Flyway number in play (frontend-only) | agent | closed — intake |

## Open questions / Assumptions

- **Assumption:** a same-tick `mode` A→B→A round trip is not a user-reachable path, so the ledger's
  one "changed" row needs no compensating spec. — *Owner:* agent · *Resolves by:* review gate.

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

**Stage pointer:** `plan — doc written, awaiting phase 0`

**Next action:** commit this plan doc, then open the draft PR so CI has a vehicle, then write the
three new unit specs (AC-3, AC-4, AC-5) against the *current* effect implementation.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — pin the reset legs with specs (AC-3, AC-4, AC-5) | | |
| 1 — replace the effect with linkedSignals (AC-1, AC-2, AC-6) | | |
| 2 — real-browser leg (AC-7) + generalization audit | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/auth-page-linked-signal.md` — this plan
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

- [ ] **Step 1: Write the specs** (AC-3, AC-4, AC-5) using the file's existing helpers
  (`render`, `type`, `el`, `chooseAudience`, `navigateQueryParams`, `submit`).
- [ ] **Step 2: Run them against the unchanged component** —
  `npm test -- --run src/app/auth/auth-page.spec.ts` → all PASS (characterization).
  A failure here means the behaviour is not what the issue claims; stop and reconcile.
- [ ] **Step 3: Commit** — `git commit -m "Pin the auth card's reset legs before deriving them (#1120)"`
- [ ] **Step 4: Update plan-doc execution status** in the same commit window.

## Phase 1 — Derive the resets, delete the effect

**Files:** Modify `frontend/src/app/auth/auth-page.ts`

- [ ] **Step 1: Replace `error` and `challengePayload`** with `linkedSignal`s sourced on
  `[this.mode(), this.audience()]`, computation `() => undefined`.
- [ ] **Step 2: Replace `model`** with the `previous`-aware form, generics explicit per F1:
  sourced on `this.audience`, computation returns the empty model when `previous` is `undefined`
  (first run, F2) and `{ ...previous.value, password: '' }` otherwise (F3).
- [ ] **Step 3: Delete the constructor `effect`**, both `previous*` variables, and the now-stale
  `// Password + error reset is owned by the audience/mode effect above.` comment in
  `onAudienceChange`; drop `effect` from the `@angular/core` import if unused.
- [ ] **Step 4: Run the full auth spec set** —
  `npm test -- --run src/app/auth/` → PASS, including the phase-0 three and every pre-existing case.
- [ ] **Step 5: Lint + format** — `npm run lint && npm run format:check`.
- [ ] **Step 6: Commit** — `git commit -m "Derive the auth card's mode/audience reset with linkedSignal (#1120)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 2 — The real-browser leg, then the generalization sweep

**Files:** Modify `frontend/e2e/unified-auth.e2e.ts`

- [ ] **Step 1: Write the e2e leg** (AC-7) in the CI-safe mocked suite, following the file's
  existing mocking idiom.
- [ ] **Step 2: Run it** — `npm run test:e2e:a11y -- unified-auth` → PASS.
- [ ] **Step 3: Generalization-audit pass.** Re-run #1119's mechanism sweep — *every `effect` /
  `afterRenderEffect` body that writes a signal and does no imperative work* — and confirm the
  population is now closed. Record the command that **found** the population, the sites, and the
  decision in the log below.
- [ ] **Step 4: Commit** — `git commit -m "Prove the credential never survives the audience switch in a real browser (#1120)"`
- [ ] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `grep -n "effect(\|previousMode\|previousAudience" frontend/src/app/auth/auth-page.ts` → no match. Verified at commit `<sha>`.
- [ ] **AC-2:** `npm test -- --run src/app/auth/auth-page.spec.ts` → the two audience-clear cases pass. Verified at commit `<sha>`.
- [ ] **AC-3:** same command → `keeps the password when only the mode changes` passes. Verified at commit `<sha>`.
- [ ] **AC-4:** same command → `drops a stale error when the card changes mode or audience` passes. Verified at commit `<sha>`.
- [ ] **AC-5:** same command → `keeps the error while neither mode nor audience changes` passes. Verified at commit `<sha>`.
- [ ] **AC-6:** same command → the two challenge cases pass unchanged. Verified at commit `<sha>`.
- [ ] **AC-7:** `npm run test:e2e:a11y -- unified-auth` → the credential leg passes. Verified at commit `<sha>`.

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
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
