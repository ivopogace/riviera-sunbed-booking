# Venue tab — derive the "Saved" notice with `linkedSignal` Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Replace `VenueTab`'s state-copying `effect` and its four scattered
`saved.set(false)` reset sites with one `linkedSignal` over the four draft sources, so the
"Saved." notice drops on any draft edit from a single declared list instead of five
hand-maintained call sites.

**Architecture:** `saved` becomes a `linkedSignal` whose `source` is the tuple of all four
drafts (`details`, `locationDraft`, `amenityDraft`, `distanceDraft`) and whose `computation`
is the constant `false`. angular.dev: "The `linkedSignal` updates its value when the `source`
changes or when any signal referenced in the `computation` changes, updating its value with
the result of the provided `computation`" — so a constant computation is exactly "reset to
false whenever any draft moves", while `saved.set(true)` after a successful PATCH survives
until the next draft change. Only `onSave`'s explicit clear stays, because that one is a
deliberate action rather than a derivation.

**Persistence:** N/A — frontend-only; no tables, no migration (invariant #1 not engaged).

**Source of intent:** GitHub issue #1119 (found during the #1099 review round, PR #1118).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue is same-day fresh against `origin/main`, no in-flight branch touches
`frontend/src/app/operator/venue-tab.*`, no Flyway number to claim; surfaced the
save-path-ordering risk R-1 the issue does not name) · `riviera-plan-doc` (this template —
forced the behavior-parity ledger, which is what turns "refactor only" from a claim into a
row-by-row check) · `tdd` (characterization specs for the two uncovered reset paths land and
pass **before** the refactor, and are proven meaningful by a revert-check; the refactor then
has to keep them green) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (<to fill at close-out>) · `riviera-frontend` (placement: the change
stays inside the `operator/` feature folder, no new file, no import-direction change) ·
`angular-developer` + angular-cli MCP (`get_best_practices`: "Use `linkedSignal()` for state
derived from multiple reactive sources that must stay synchronized"; `search_documentation`
v22 + angular.dev `guide/signals/linked-signal` + `guide/signals/effect` for the reset and
explicit-`set` semantics — see R-2/Resolved) · `playwright-cli` (consulted for suite
placement: **no new e2e**, because the existing mocked suite already pins this behavior end
to end — see *Non-goals*) · `riviera-tailwind` (**not loaded** — nothing is styled; the
component carries no legacy SCSS, so migrate-on-touch does not fire).

**Branch:** `claude/tailwind-angular-docs-p9cwtt` — the cloud session's designated remote
branch stands in for `bugfix/venue-tab-saved-linked-signal`.

---

## Acceptance criteria (testable)

> Each AC is observed through the operator-visible seam: `VenueTab` rendered in TestBed,
> read through its `data-testid` surface (`venue-saved`, `venue-saved-announce`) — the
> notice as the operator sees it, never the `saved` field itself. Pinning the private signal
> would couple the specs to the very implementation this slice replaces.

- [ ] **AC-1:** Given a saved venue profile showing the "Saved." notice, when the operator
  toggles an amenity, then the notice is gone. *Seam:* rendered `VenueTab` DOM,
  `[data-testid="venue-saved"]` · *Pinned by:*
  `venue-tab.spec.ts` › `drops the stale Saved notice when an amenity is toggled after a save`
- [ ] **AC-2:** Given a saved venue profile showing the "Saved." notice, when the operator
  edits the distance-to-water field, then the notice is gone. *Seam:* rendered `VenueTab`
  DOM, `[data-testid="venue-saved"]` · *Pinned by:*
  `venue-tab.spec.ts` › `drops the stale Saved notice when the distance is edited after a save`
- [ ] **AC-3:** Given the refactor, when `venue-tab.ts` is read, then `saved` is a
  `linkedSignal` over the four draft sources, the constructor `effect` that tracked signals
  only to write one is gone, and the only remaining `saved.set(false)` is `onSave`'s.
  *Seam:* the source file itself (a structural AC — the diff is the evidence) · *Pinned by:*
  the diff + the existing suite staying green (AC-4)
- [ ] **AC-4:** Given the refactor, when the venue-tab suites run unchanged, then every
  pre-existing case still passes — in particular
  `clears the Saved notice when a details field is edited after saving (no silent lost edit)`,
  `drops the stale Saved notice when the pin is edited after a save (#1099)`,
  `announces the profile save through a region that predates it (#1078)`, and the
  second-consecutive-save case. *Seam:* rendered `VenueTab` DOM · *Pinned by:*
  `npm test -- venue-tab` (all three venue-tab spec files, zero spec edits beyond the two
  added in AC-1/AC-2)

## Non-goals

- **No new e2e spec.** This is behavior-preserving, and the CI-safe mocked suite already
  pins the notice end to end from three angles: `operator-venue.e2e.ts` (save → visible,
  409 stale-write → hidden, second consecutive save → visible) and
  `operator-venue-location.e2e.ts` (the pin path). Re-proving unchanged behavior in a new
  spec buys nothing; those runs are the regression net.
- **Not collapsing the four drafts into one `draft` object.** That would make a missed reset
  structurally impossible rather than merely single-sited, but it rewrites `onSave`'s request
  construction and the template bindings — past what #1119 asks for. AC-3's bar is "the source
  list is the one place it is stated", and a TSDoc line on the source list states the rule for
  the next person adding a draft.
- **No change to the save path's own semantics** — `saved.set(true)`, the `epoch` guard, the
  `loadedVersion` bump and the stale-write handling are untouched.
- **No sweep of the other 20 components using `effect`.** The generalization audit below
  enumerates them and records the verdict; acting on it is a separate slice.

## Behavior-parity ledger

> The slice replaces an existing mechanism (the reset `effect` + four manual clears), so
> every behavior of the old mechanism is listed and verdicted.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| constructor `effect` clears `saved` when `details` (the Signal-Form model) changes | preserved | `details` is source #1 of the `linkedSignal` |
| constructor `effect` clears `saved` when `locationDraft` changes (added by #1099) | preserved | `locationDraft` is source #2 |
| `onToggleAmenity` clears `saved` by hand | preserved | `amenityDraft` is source #3; the manual line goes |
| `onDistanceInput` clears `saved` by hand | preserved | `distanceDraft` is source #4; the manual line goes |
| `onDistanceInput` also clears `distanceError` | preserved | untouched — only the `saved` line is removed |
| `resetForVenue` clears `saved` in its bulk reset | dropped (redundant) | the same method rewrites all four drafts two lines earlier, which resets `saved` through the source list |
| `onSave` clears `saved` at the start of a save | preserved | kept verbatim — a deliberate action, not a derivation |
| `saved.set(true)` after a successful PATCH | preserved | `linkedSignal` is a `WritableSignal`; the explicit value holds until the next source change |
| the notice clears on initial render / venue load seed | preserved | the computation's initial value is `false`, and the load seeds all four drafts |
| the reset lands at the next change-detection flush (effect timing) | changed → **improved** | `linkedSignal` is pull-based, so the reset is observable on the next read — strictly earlier, and it removes the `ExpressionChangedAfterItHasBeenChecked` hazard angular.dev warns about for state-propagating effects |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `saved.set(true)` happens **after** an `await` inside `submit()`. If Signal Forms writes back to the `details` model signal when the submit action resolves, the new source list would reset `saved` to `false` and the notice would never appear — a regression the issue does not name. | med | high | The pre-existing `announces the profile save through a region that predates it (#1078)` and `reflects an amenity toggle + a name edit in the saved body` specs assert the notice **appears** after a PATCH; they fail loudly if this bites. Run them as the phase-1 gate. | this slice | **closed** — did not bite: `submit()` does not write back to the model signal, and both canaries pass (41/41 in `venue-tab.spec.ts`, 842/842 across `operator/`). |
| R-2 | `computation: () => false` may infer the literal type `false` for `D`, making `saved.set(true)` a compile error. | med | low | Pin `D` explicitly with `linkedSignal<S, boolean>` generics, matching `set-editor.ts`'s existing style; `npm run lint` + `npm test` (Vitest type-checks through the Angular compiler) prove it. | this slice | **closed** — pinned with a return-type annotation (`computation: (): boolean => false`) instead of explicit generics: it fixes `D` just as firmly while letting `S` stay inferred from the real source tuple. Builds and lints clean. |
| R-3 | A source that is a fresh array literal is never `Object.is`-equal to the previous one, so the reset could fire on reads that changed nothing. | low | low | Harmless by construction: the source computed only re-evaluates when one of the four drafts actually changes, and re-applying `false` to an already-`false` signal notifies nobody (default `Object.is` equality on `D`). | this slice | **closed** — no observable effect; the whole operator suite is green. |
| R-4 | Dropping `resetForVenue`'s clear leaves a venue switch showing a stale notice. | low | med | The same method sets all four drafts to empty immediately above, which resets `saved` through the source list. The existing in-place venue-switch specs cover it. | this slice | **closed** — the in-place venue-switch specs pass unchanged. |

## Open questions / Assumptions

*(empty — both entries resolved before phase 0)*

### Resolved

- **Open question:** does a `linkedSignal` whose `computation` returns a constant actually
  re-run on every `source` change, and does it override an explicit `.set()` made between
  source changes? → **Yes to both**, verified against angular.dev (not memory) per the
  issue's note and `frontend/.claude/CLAUDE.md`'s "verify against angular.dev" rule:
  `guide/signals/linked-signal` — "The `linkedSignal` updates its value when the `source`
  changes or when any signal referenced in the `computation` changes, updating its value with
  the result of the provided `computation`", and "When the value of the computation changes,
  the value of the `linkedSignal` changes to the computation result." The API page adds
  "Creates a writable signal whose value is initialized **and reset** by the linked, reactive
  computation." Custom `equal` is documented as what "downstream dependencies" use to decide
  the value changed — it gates notification, not the reset. Resolved at plan time.
- **Assumption:** AC-3's "cannot silently miss the reset" means *single-sited*, not
  *structurally impossible*. → Confirmed by the AC's own second clause, "the source list is
  the one place it is stated", and by the issue's proposed code being exactly that list. The
  stronger form is recorded as a Non-goal. Resolved at plan time.

## Availability & concurrency (invariant #2)

N/A — frontend-only presentation state. The slice touches no booking, no `availability` row,
no beach map; `saved` is a UI notice with no server effect.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. The PATCH this notice reports on carries no money field
(commission and payout currency are read-only on this tab and are never sent).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/operator/venue-tab.ts` | existing | standalone component | `linkedSignal` replaces a state-copying `effect`; the second `effect` (venue switch → `resetForVenue`, a genuine non-reactive side effect) stays | Signal Forms (`@angular/forms/signals`) — unchanged |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, `NgOptimizedImage` for new images. No deviation — the slice removes a documented
anti-pattern and adds no new surface.

## FE↔BE contract

N/A — no contract change. The `PATCH /api/venues/{venueId}` request and response shapes are
untouched.

## Execution status

**Stage pointer:** `PR — draft open, awaiting CI`

**Next action:** push the branch, open the draft PR as the CI vehicle, then mark it ready for
review so the Review + Sonar gates become due.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — characterization specs for the two uncovered reset paths | ✅ | `25736a97` |
| 1 — `linkedSignal` replaces the effect + the three redundant clears | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/venue-tab-saved-linked-signal.md` — this plan
- `frontend/src/app/operator/venue-tab.ts` — `saved` becomes a `linkedSignal`; the reset
  `effect` and the three redundant `saved.set(false)` sites go
- `frontend/src/app/operator/venue-tab.spec.ts` — two added characterization cases (AC-1,
  AC-2); every pre-existing case unchanged

---

## Phase 0 — Characterization specs for the two uncovered reset paths

**Files:** Test `frontend/src/app/operator/venue-tab.spec.ts`

- [x] **Step 1: Write the tests** — two cases beside the existing `#1099` pin, at the same
  seam (rendered DOM, `venue-saved`), following that spec's save-then-edit shape.

- [x] **Step 2: Run them** — `npm test -- --include="src/app/operator/venue-tab.spec.ts"` →
  **41 passed** on the unrefactored component. That is the point: they characterize behavior
  the manual `saved.set(false)` calls provide today, so phase 1 has a net before it removes
  them. (The documented `npm test` goes through the Angular builder; invoking `vitest` against
  `vitest-base.config.ts` directly fails with a JIT/`@angular/compiler` error — the builder is
  what AOT-compiles the specs.)

- [x] **Step 3: Prove they are meaningful (revert-check, not committed)** — with
  `onToggleAmenity`'s and `onDistanceInput`'s `this.saved.set(false)` deleted, the run was
  **2 failed | 39 passed**, and the two failures were exactly the two new cases. That also
  confirms the issue's gap analysis: nothing else in the suite covered those two reset paths.
  Both lines restored before committing.

- [x] **Step 4: Commit** — `git commit -m "Pin the amenity + distance Saved-notice resets before deriving them (#1119)"`

- [x] **Step 5: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — `linkedSignal` replaces the effect and the three redundant clears

**Files:** Modify `frontend/src/app/operator/venue-tab.ts`

- [x] **Step 1: Replace `saved`** with a `linkedSignal` over the four drafts, `D` pinned to
  `boolean` (R-2), carrying a TSDoc that states the rule for the next draft added. `saved` and
  `savedMessage` also **move** down beside the drafts: a field initializer reading `this.details`
  before its declaration is only safe because signal computations are lazy, and a declaration
  order that has to be defended is worse than one that doesn't.

- [x] **Step 2: Delete** the constructor reset `effect`, `onToggleAmenity`'s clear,
  `onDistanceInput`'s `saved` clear (keeping its `distanceError` clear) and `resetForVenue`'s
  clear. Keep `onSave`'s.

- [x] **Step 3: Drop the now-dead `effect` import** only if the second `effect` is also gone
  — it is not, so the import stays.

- [x] **Step 4: Run** — `npm test -- --include="src/app/operator/venue-tab.spec.ts"` → **41
  passed**, R-1's canaries included; `--include="src/app/operator/**/*.spec.ts"` → **842 passed
  across 64 files** (the a11y + contrast suites with it). `npm run lint` clean;
  `npm run format:check` flagged the new import block, fixed with `prettier --write`.

- [x] **Step 5: Generalization-audit pass** — recorded below; it found a second site and it is
  filed as **#1120** rather than fixed here.

- [x] **Step 6: Commit** — `git commit -m "Derive the venue tab's Saved notice with linkedSignal (#1119)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-16 | phase 1 — replacing a state-propagation `effect` | **Every `effect` / `afterRenderEffect` body that writes a signal and does no imperative work.** Not "components that look like `VenueTab`": the body of every effect under `frontend/src/app` was parsed by brace-matching, kept only if it contains `.set(`/`.update(`, then discarded if it also contains `await`, `void `, `untracked(`, DOM / `nativeElement` / `localStorage` / `ResizeObserver` / `setTimeout` / `navigator` access, a `.subscribe(`, an injected-service call, or **any** method call that is not a bare tracking read. What survives is a pure signal→signal copy. | the python sweep in the phase-1 transcript (parse `effect(`/`afterRenderEffect(` bodies → filter). A first, cruder pass (`rg` for `effect(` + `.set(`) returned **21 files** and was too coarse to act on — it counts every route-param→HTTP-load effect; the narrower bare-read grep (`^\s*this\.\w+\(\);$`) returned 88 lines that are nearly all ordinary method calls. Both are recorded because the **useful** command is the third one. | **2**: `operator/venue-tab.ts` (this slice) and `auth/auth-page.ts:423`. Two near-misses judged legitimate: `shared/beach-map-canvas.ts:425` (a bare `this.rows()` read, but inside `afterRenderEffect({read})` doing a real DOM measurement — the sanctioned "sync to a non-reactive API" use) and `pages/home/home.ts:354` (not in an effect at all — a stored-thunk call in a click handler). | Fixed `venue-tab.ts` here. Filed **#1120** for `auth-page.ts` rather than folding it in: its reset clears a **password** on an audience change only (not on a mode change), so it is security-adjacent and asymmetric between its two sources, and it hand-rolls `previousMode`/`previousAudience` bookkeeping that wants `linkedSignal`'s documented `previous` parameter. Its own specs, its own decision — the same reasoning that kept this refactor out of PR #1118. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npm test -- venue-tab` → the amenity case passes. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm test -- venue-tab` → the distance case passes. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `grep -n "saved.set(false)\|linkedSignal\|effect(" frontend/src/app/operator/venue-tab.ts`
      → exactly one `saved.set(false)` (in `onSave`), one `linkedSignal`, one `effect(` (the
      venue-switch one). Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npm test -- venue-tab` → every pre-existing case green, spec diff limited
      to the two added cases. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

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

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
