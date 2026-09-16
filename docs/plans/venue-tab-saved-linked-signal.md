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
`riviera-docs-freshness` (**ran** over `e6bbb8af..HEAD` — **0 substrate findings**: the diff
touches no file in the substrate map, renames and removes no identifier (step 2a has nothing to
hand the grep), and makes the Nth of nothing a substrate doc counts (step 2b). Its *Plan-doc
retirement* section **did** apply and was executed — see *File structure*) · `riviera-frontend` (placement: the change
stays inside the `operator/` feature folder, no new file, no import-direction change) ·
angular-cli MCP (`get_best_practices`: "Use `linkedSignal()` for state derived from multiple
reactive sources that must stay synchronized"; `search_documentation` v22 + angular.dev
`guide/signals/linked-signal` + `guide/signals/effect` for the reset and explicit-`set`
semantics — see R-2/Resolved) · `angular-developer` (loaded at the review gate, not at plan
time — RV-PROC-1 on myself, F-4; its `references/linked-signal.md` is the in-repo authority
and states the rule outright: "**Never** use `effect` to sync one piece of state to another")
· `playwright-cli` (same correction — loaded once F-3 meant an e2e was actually being written,
for locator and suite-placement conventions) · `riviera-java-conventions` §6c/§6d (the comment
authority `frontend/.claude/CLAUDE.md` defers to; its drop list and 3-line member budget are
what F-1/F-2 were judged against) · `riviera-tailwind` (**not loaded** — nothing is styled;
the component carries no legacy SCSS, so migrate-on-touch does not fire).

**Branch:** `claude/tailwind-angular-docs-p9cwtt` — the cloud session's designated remote
branch stands in for `bugfix/venue-tab-saved-linked-signal`.

---

## Acceptance criteria (testable)

> Each AC is observed through the operator-visible seam: `VenueTab` rendered in TestBed,
> read through its `data-testid` surface (`venue-saved`, `venue-saved-announce`) — the
> notice as the operator sees it, never the `saved` field itself. Pinning the private signal
> would couple the specs to the very implementation this slice replaces.

- [x] **AC-1:** Given a saved venue profile showing the "Saved." notice, when the operator
  toggles an amenity, then the notice is gone. *Seam:* rendered `VenueTab` DOM,
  `[data-testid="venue-saved"]` · *Pinned by:*
  `venue-tab.spec.ts` › `drops the stale Saved notice when an amenity is toggled after a save`
- [x] **AC-2:** Given a saved venue profile showing the "Saved." notice, when the operator
  edits the distance-to-water field, then the notice is gone. *Seam:* rendered `VenueTab`
  DOM, `[data-testid="venue-saved"]` · *Pinned by:*
  `venue-tab.spec.ts` › `drops the stale Saved notice when the distance is edited after a save`
- [x] **AC-3:** Given the refactor, when `venue-tab.ts` is read, then `saved` is a
  `linkedSignal` over the four draft sources, the constructor `effect` that tracked signals
  only to write one is gone, and the only remaining `saved.set(false)` is `onSave`'s.
  *Seam:* the source file itself (a structural AC — the diff is the evidence) · *Pinned by:*
  the diff + the existing suite staying green (AC-4)
- [x] **AC-4:** Given the refactor, when the venue-tab suites run unchanged, then every
  pre-existing case still passes — in particular
  `clears the Saved notice when a details field is edited after saving (no silent lost edit)`,
  `drops the stale Saved notice when the pin is edited after a save (#1099)`,
  `announces the profile save through a region that predates it (#1078)`, and the
  second-consecutive-save case. *Seam:* rendered `VenueTab` DOM · *Pinned by:*
  `npm test -- venue-tab` (all three venue-tab spec files, zero spec edits beyond the two
  added in AC-1/AC-2)

## Non-goals

- ~~**No new e2e spec.**~~ **Overturned at the review gate (F-3).** The original reasoning —
  "the mocked suite already pins the notice from three angles" — did not survive checking
  *which* angles: `operator-venue.e2e.ts` toggles an amenity **before** its save, so neither
  of the two paths this slice changes (an amenity toggle and a distance edit **after** a save)
  had any browser-level coverage. The existing spec's save flow was extended rather than a new
  spec added; **no new spec file**, and no e2e was written for behavior the slice did not change.
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
| `onDistanceInput` clears `saved` by hand | **changed (benign, and more correct)** — F1 | The old clear was *unconditional*: any `input` event dropped the notice, even one re-entering the same value. A `linkedSignal` resets on a version bump, and `signalSetFn` (`_effect-chunk.mjs:362`) skips the bump on an `Object.is`-equal write — so an identical-value edit (paste over a selection, an IME commit, autofill) now leaves the notice up. That is the better answer: the draft still equals what was saved, so the notice is still true. Pinned deliberately by `keeps the Saved notice when a distance input re-enters the same value (#1119)`, which fails if the old unconditional clear is restored. |
| `onDistanceInput` also clears `distanceError` | preserved | untouched — only the `saved` line is removed |
| `resetForVenue` clears `saved` in its bulk reset | dropped (redundant) | The method rewrites the drafts immediately above, which resets `saved` through the source list. The reset is **over-determined**, not balanced on one write: `details.set(EMPTY_DETAILS)` genuinely changes after a load (the load's `seed` sets a *fresh object literal*, never `EMPTY_DETAILS`), and `amenityDraft.set(new Set())` is a fresh `Set` every time. Shown rather than argued: with `source` cut to `[details]` alone the venue-switch spec still passes, and with it cut to `[locationDraft, distanceDraft]` it also passes. Now pinned outright by `drops the Saved notice when the venue is switched in place (#1119)`. |
| `onSave` clears `saved` at the start of a save | preserved | kept verbatim — a deliberate action, not a derivation |
| `saved.set(true)` after a successful PATCH | preserved | `linkedSignal` is a `WritableSignal`; the explicit value holds until the next source change |
| the notice clears on initial render / venue load seed | preserved | the computation's initial value is `false`, and the load seeds all four drafts |
| the reset lands at the next change-detection flush (effect timing) | changed → **improved** | `linkedSignal` is pull-based, so the reset is observable on the next read — strictly earlier, and it removes the `ExpressionChangedAfterItHasBeenChecked` hazard angular.dev warns about for state-propagating effects |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `saved.set(true)` happens **after** an `await` inside `submit()`. If Signal Forms writes back to the `details` model signal when the submit action resolves, the new source list would reset `saved` to `false` and the notice would never appear — a regression the issue does not name. | med | high | The pre-existing `announces the profile save through a region that predates it (#1078)` and `reflects an amenity toggle + a name edit in the saved body` specs assert the notice **appears** after a PATCH; they fail loudly if this bites. Run them as the phase-1 gate. | this slice | **closed** — structurally impossible, not merely untriggered. `linkedSignalSetFn` (Angular 22.1.4, `core/fesm2022/_untracked-chunk.mjs:32`) runs `producerUpdateValueVersion(node)` **before** `signalSetFn`, then `producerMarkClean(node)` — so an explicit `.set()` consumes any pending source change and writes after it. A draft write between `onSave`'s clear and `saved.set(true)` is therefore absorbed by the set, not applied over it. (The old `effect` had the opposite hazard: it would have run *after* `set(true)` and clobbered it.) Both canaries also pass: 41/41 in `venue-tab.spec.ts`, 842/842 across `operator/`. **Residual:** a source write placed *after* `set(true)` — e.g. a future re-seed from the PATCH response — would still reset it. Left uncommented deliberately: `announces the profile save through a region that predates it (#1078)` fails loudly on it, so it is a caught trap, not a silent one. |
| R-2 | `computation: () => false` may infer the literal type `false` for `D`, making `saved.set(true)` a compile error. | med | low | Pin `D` explicitly with `linkedSignal<S, boolean>` generics, matching `set-editor.ts`'s existing style; `npm run lint` + `npm test` (Vitest type-checks through the Angular compiler) prove it. | this slice | **closed** — pinned with a return-type annotation (`computation: (): boolean => false`) instead of explicit generics: it fixes `D` just as firmly while letting `S` stay inferred from the real source tuple. Builds and lints clean. |
| R-3 | A source that is a fresh array literal is never `Object.is`-equal to the previous one, so the reset could fire on reads that changed nothing. | low | low | Harmless by construction: re-applying `false` to an already-`false` signal notifies nobody (default `Object.is` equality on `D`). | this slice | **closed — and the premise was wrong.** Reading the installed implementation (`_untracked-chunk.mjs:60-72`) rather than assuming: `source` is **not** wrapped in its own computed. `node.source()` is invoked inline inside the linkedSignal's own consumer context, so the four drafts are *direct* producers of the node and the array's identity is never compared to anything. There is no equality check to be defeated, so the risk as written does not exist. Conclusion unchanged (harmless); the reasoning is replaced. |
| R-4 | Dropping `resetForVenue`'s clear leaves a venue switch showing a stale notice. | low | med | The method rewrites the drafts immediately above, which resets `saved` through the source list. | this slice | **closed at the review gate, on evidence — the original resolution was bogus (F-5).** It read "the existing in-place venue-switch specs pass unchanged", but those two specs (`#180`) never call `save()` and never read `venue-saved` or `venue-saved-announce`: they assert the `venue-name` input only, so they pass identically whether or not `saved` resets. Nothing pinned this. Now pinned by `drops the Saved notice when the venue is switched in place (#1119)`, which asserts the **announcer** (the banner is unmounted during the new venue's load, so asserting it would pass vacuously) and fails when the reset mechanism is removed. |

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

**Stage pointer:** `merge close-out — written in the last code-touching commit`

**Next action:** watch CI + the SonarCloud gate on PR #1121. Sonar is green-and-cleared or its
reported list is fixed; then merge. If a Sonar finding forces another code commit, this close-out
is rewritten in that commit rather than pushed on its own.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — characterization specs for the two uncovered reset paths | ✅ | `25736a97` |
| 1 — `linkedSignal` replaces the effect + the three redundant clears | ✅ | `edbe707d` |
| 2 — review-gate findings F-1…F-8 | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review — history reviewer | **Behaviour-parity error.** `onDistanceInput`'s old clear was unconditional; the derived reset needs a real value change, so an identical-value re-entry no longer drops the notice. The ledger claimed "preserved". | fixed — ledger row corrected to *changed (benign, and more correct)*, and the new behaviour pinned by a spec that fails if the old clear is restored |
| F-2 | review — comment + CLAUDE.md reviewers (independently) | `onToggleAmenity`'s TSDoc still read "clears the stale saved notice" — false after the diff, and it re-stated the reset rule in a second place, the exact trap #1119 removes. | fixed — clause dropped |
| F-3 | review — overlay RV-FE-E2E (self-walked) | The "no new e2e" non-goal did not survive checking *which* angles the mocked suite covers: it toggles an amenity **before** its save, so neither changed reset path had browser-level coverage. | fixed — the existing `operator-venue.e2e.ts` save flow extended (no new spec file); mutation-checked by cutting the source list, which fails it |
| F-4 | review — overlay RV-PROC-1 (self-walked) | *Skills consulted* claimed `angular-developer` and `playwright-cli`, neither of which had been loaded — the angular-cli MCP and the overlay's own e2e rules had been used instead. A false record is worse than an omission. | fixed — both loaded and the line corrected; `angular-developer`'s `references/linked-signal.md` turned out to state the rule outright |
| F-5 | review — prior-PR reviewer | **R-4 closed on evidence that does not exist** (the `#180` specs never read the notice). Traced to PR #495, which established that each venue-switch flag clear gets its own pin. | fixed — pin added; R-4 and the ledger row rewritten with evidence |
| F-6 | review — comment + CLAUDE.md reviewers | The new TSDoc was 4 lines against §6d's ~3-line member budget, and two clauses were on §6c's drop list (restating the code; motivation). | fixed — trimmed to 3 lines, keeping the contract and the trap-and-remedy |
| F-7 | review — history reviewer | The TSDoc called the source list "the entire reset rule", but `venueId` going invalid resets nothing and leaves the sr-only announcer reading the old venue's save. **Verified present on the base commit too** — pre-existing, not this slice's. | deferred → **#1122**; the TSDoc was narrowed to claim only the *draft* reset rule so it no longer papers over it |
| F-8 | review — bug-scan + history reviewers | R-1 and R-3's reasoning were both wrong at the implementation level (R-3's premise — an array-identity equality check — does not exist at all). | fixed — both rows rewritten from the installed Angular source rather than from assumption; conclusions unchanged |
| F-9 | review — prior-PR reviewer (out of scope) | `set-editor.ts` has `saved = signal(false)` with four manual clears — proposed as the same anti-pattern. | **not filed — checked and rejected.** All four pair with `errorCode.set(undefined)` at the start of a *user action* (select, batch-select, arm a move, begin a write). That is `onSave`'s deliberate-action shape, not a derivation from drafts, and no `effect` writes it. Filing it as #1119's pattern would have been wrong. |

---

## File structure

- `docs/plans/venue-tab-saved-linked-signal.md` — this plan
- `frontend/src/app/operator/venue-tab.ts` — `saved` becomes a `linkedSignal`; the reset
  `effect` and the three redundant `saved.set(false)` sites go
- `frontend/src/app/operator/venue-tab.spec.ts` — two added characterization cases (AC-1,
  AC-2); every pre-existing case unchanged
- `frontend/e2e/operator-venue.e2e.ts` — added at the review gate (RV-FE-E2E, F-3): the two
  changed reset paths, exercised in a real browser inside the existing save flow
- `docs/plans/venue-location.md` · `docs/plans/riviera-map-archive-storage.md` — **deleted**, not
  this slice's work: the close-out plan-doc retirement sweep (`riviera-docs-freshness` § *Plan-doc
  retirement*), since both their PRs (#1118 for #1099, #1117 for #1109) have merged. Nothing cites
  either path — grepped across the tree outside `docs/plans/` before removing them.

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

- [x] **AC-1:** `npm test -- --include="src/app/operator/venue-tab.spec.ts"` → the amenity case
      passes, and fails when `onToggleAmenity`'s old clear is removed without the `linkedSignal`.
- [x] **AC-2:** same run → the distance case passes, and fails under the same mutation.
- [x] **AC-3:** `grep -n "saved.set(\|linkedSignal\|effect(" frontend/src/app/operator/venue-tab.ts`
      → one `linkedSignal`, one `effect(` (the venue-switch one), and exactly two `saved.set` lines,
      both in `onSave` (`set(false)` on entry, `set(true)` on success).
- [x] **AC-4:** **43 passed** in `venue-tab.spec.ts` (41 pre-existing + the 2 of AC-1/AC-2, plus the
      2 added at the review gate for F-1 and F-5); **842 passed / 64 files** across `src/app/operator/**`;
      the mocked e2e file green at 3/3. No pre-existing case was edited.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled — justified N/A (frontend presentation state; no `availability` row, no booking, no map).
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
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
