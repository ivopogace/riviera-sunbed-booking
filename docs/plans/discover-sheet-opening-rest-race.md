# Discover-sheet opening-rest race Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Every spec that drives `DiscoverSheet` waits for its opening rest to be confirmed
before it taps, so the sheet's own retake can no longer undo the tap and drop the Map pill.

**Architecture:** The defect is a race between the spec and the sheet's opening rest, not an
accessibility regression: `rest()` confirms its rest on a `requestAnimationFrame` of its own and
retakes it while `scrollTop` differs from the offset it wants. A tap that lands inside that
window is read as the browser's snapping and reverted to half. One shared helper,
`src/testing/sheet-opened.ts`, pumps frames until the sheet's own `opened()` signal reports the
window closed; all four spec sites that drive the sheet call it. Nothing under `src/app/` moves.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query is touched.

**Source of intent:** GitHub issue #1171 (its later duplicate #1175 was fixed only in part by
PR #1176 — see *Resolved* below)

**Skills consulted:** `riviera-sdlc` (intake gate found #1171's duplicate #1175/PR #1176 already
on `main`, which forced the re-diagnosis below) · `riviera-plan-doc` (forced the generalization
pass that found two further sites the issue never named) · `tdd` (the deterministic
frame-deferred repro is the red; the committed guard test keeps it red-able) ·
`riviera-review-overlay` (at ready-for-review) · `riviera-docs-freshness` (**ran** over `2af102f..HEAD`, 0 findings: the substrate's only
`src/testing/` claims are `frontend/.claude/CLAUDE.md`'s "Shared helpers: `src/testing/`" — which
this slice obeys rather than changes — and ADR-0014's `freeze-clock` citations, untouched; no
substrate doc states a test count or names these specs) ·
`riviera-local-debug` (scoped `--include` runs; unshallowed the clone before every history claim)
· `riviera-frontend` (folder taxonomy; the `src/testing/` home for a shared spec helper is
`frontend/.claude/CLAUDE.md` § *Unit tests*, "Shared helpers: `src/testing/`") ·
`angular-developer` + angular-cli MCP (`search_documentation` v22: the zoneless TestBed guide's
"avoid `fixture.detectChanges()` when possible" dropped the manual bracketing from the new
helper; it also says converting *existing* suites is not worth it, so the specs' own `settle()`
stays)

**Branch:** `claude/sdlc-1171-6fia9w` (the cloud session's designated branch, standing in for
`bugfix/discover-sheet-opening-rest-race`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a sheet whose `opened()` reports its opening rest landed, when the tourist
  taps to `full` and every frame the sheet could still hold is flushed, then the sheet is still at
  `full` and asked for no further rest. *Seam:* `DiscoverSheet.opened` / `.detent()` (the
  component's public signals) · *Pinned by:* `discover-sheet.spec.ts` › *reports opened before a
  spec drives it, and retakes no rest under the tap that follows*
- [ ] **AC-2:** Given the reported case, when the grabber is tapped, then the Map pill is in the
  DOM and axe finds no serious violation — and the case still fails when the pill genuinely stops
  rendering at `full`. *Seam:* the rendered sheet DOM (`[data-testid="sheet-map-pill"]`) ·
  *Pinned by:* `discover-sheet.a11y.spec.ts` › *has no serious violations at full, with the Map
  pill*, plus the recorded negative control
- [ ] **AC-3:** Given the load that reproduces it, when the two-file repro command from #1175 runs
  20 consecutive times 4-way parallel, then all 20 are green — and the frame-deferred repro that
  fails deterministically on `main` passes. *Seam:* the suite as CI runs it · *Pinned by:* the run
  log in *Acceptance-criteria verification*
- [x] **AC-4:** Given the mechanism "a spec drives `DiscoverSheet` before its opening rest is
  confirmed", when every member of that population is enumerated, then each one waits on that
  condition and no site waits on a duration for it. *Seam:* the population, enumerated by the
  command in the generalization-audit log · *Pinned by:* the log's row. The sweep was re-run per
  **site**, not per file, after a review finding: `discover-sheet.spec.ts`'s own
  `await nextFrame(window)` before `go('full')` was the same wait and is now dead, so it is gone.
  The one that remains in that file waits for the rest a *later* `go()` takes, which is not the
  opening rest this helper covers.

## Non-goals

- **Changing `DiscoverSheet` itself.** The retake is deliberate — the opening rest exists to beat
  the browser's own snapping, which is exactly what a tourist's early flick is indistinguishable
  from. Teaching it to stand down on a user gesture is a behaviour change the sheet's e2e, not a
  flake fix, would have to justify.
- Skipping, quarantining or retrying the case. The issue is explicit: the flake is the bug.
- Retiring `home.spec.ts`'s other timing waits. Only the one that waits on this race is touched.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing; no surface is retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Waiting for the pill rather than for the rest would mask a real failure to render it | Medium | High — the case stops guarding what it claims | The helper waits on `opened()`, a precondition asserted *before* the tap; the pill stays a bare assertion. Negative control recorded under AC-2 | this slice | closed — control run, `33c1c62f` |
| R-2 | `whenSheetOpened` hangs a spec if `opened()` never flips | Low | Medium — a timeout instead of a legible failure | Bounded at 12 frames (the sheet gives up at 8 of its own) and closed by an `expect` naming the condition | this slice | closed — `33c1c62f` |
| R-3 | A later change to `rest()` reopens the window after `opened()` | Low | High — the flake returns silently | AC-1's guard test pins it; its flush assertion now also pins that no further rest is asked | this slice | closed — this commit |
| R-4 | `src/testing/` importing a page component inverts the folder taxonomy | Low | Low | `src/testing/` is spec support, outside `riviera-frontend`'s `src/app/` taxonomy; `venue-cards.ts` already imports a page **component** (`app/pages/home/venue-card`) | this slice | closed — precedent verified, `33c1c62f` |

## Open questions / Assumptions

- **Assumption:** the jsdom-only race is the same one CI hits — CI runs this suite in jsdom, and
  the reported repro is a jsdom full-suite run. *Owner:* this slice · *Resolves by:* AC-3.

### Resolved

- **Open question:** does Angular 22 offer a first-class wait that already covers this, making the
  frame pump unnecessary? — **No.** `fixture.whenStable()` resolves on the fixture's own
  asynchronous activity and `TestBed.tick()` "executes any pending work required to synchronize
  model to the UI"; neither reaches a raw `requestAnimationFrame` a component schedules for
  itself, which is what `rest()` uses. Measured, not assumed: after the specs' existing settle,
  two frame callbacks are still queued (one frame flushes both) and `opened()` is false. What the docs did change: the zoneless
  TestBed guide's "avoid using `fixture.detectChanges()` when possible" — the helper ends on
  `await fixture.whenStable()` alone. *Evidence:* angular.dev `guide/zoneless`,
  `api/core/testing/TestBed`, `api/core/testing/ComponentFixture` (v22), read via the angular-cli
  MCP this session.
- **Open question:** is #1171 already fixed by PR #1176 (its duplicate #1175, merged six hours
  before this session)? — **No.** #1176 swapped one insufficient wait (`setTimeout(0)`) for a
  better one (`whenStable()`) *after* the tap; it never touched the pending opening-rest frame
  that undoes the tap. The frame-deferred repro reproduces the reported failure deterministically
  on `ae05f10`, i.e. on `main` with #1176 in it. Outcome: #1171 stays open and this slice fixes
  the remaining mechanism. *Evidence:* the trace in the PR body.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `(set, date)` row, claim, pool or cutoff is read or
written; the change is test-support code in `frontend/`.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No module, port, event or backend file is touched.

### Module ownership (§4a)

N/A — no behaviour is added or moved; the diff is spec support only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/testing/sheet-opened.ts` | New | Spec helper | Reads the sheet's `opened()` signal; pumps `requestAnimationFrame` | — |
| FE-2 | `discover-sheet.a11y.spec.ts`, `discover-sheet.spec.ts`, `home.a11y.spec.ts`, `home.spec.ts` | Existing | Specs | Call FE-1 before driving the sheet | — |

No component, template or token changes: no user-facing surface moves.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `review gate — findings folded in`

**Next action:** Sonar gate on the new head, then close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The wait and its guard | ✅ | `33c1c62f`, `f1c308b2` |
| 1 — Verification (negative control + before/after runs) | ✅ | negative control + 19 full-suite runs, recorded under the ACs |
| 2 — Review-gate findings | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | Review gate | AC-1's *Pinned by* named a test title the tree does not carry | fixed in this commit |
| F-2 | Review gate | Execution status, risk rows and AC verification lines stale against the tree | fixed in this commit |
| F-3 | Review gate | The guard test asserted the detent but not AC-1's "asked for no further rest" clause, though the spec already records every rest in `asked` | fixed in this commit |
| F-4 | Review gate | `whenSheetOpened`'s TSDoc restated `rest()`'s own Javadoc and argued the diagnosis (RV-STYLE-1, prose that narrates history) | fixed in this commit — trimmed to the contract plus a pointer |
| F-5 | Review gate | The generalization sweep enumerated files, not sites: `discover-sheet.spec.ts`'s own pre-`go('full')` frame wait was the same wait and went dead | fixed in this commit — removed; the later-rest one stays, AC-4 reworded |
| F-6 | Review gate | *Skills consulted* and R-4 attributed the `src/testing/` rule to `riviera-frontend`; it is `frontend/.claude/CLAUDE.md`'s | fixed in this commit |
| F-7 | Review gate | The helper's headline said it waits for the rest to be *confirmed*; `opened()` is set on a confirmed rest **and** on a given-up one (`attempt >= REST_ATTEMPTS`). Neither leaves a retry pending, so the guarantee held, but the wording and the failure message named the wrong fact | fixed in this commit |
| F-8 | Review gate | "Two frames are still queued" was two frame *callbacks*, which one frame flushes — `rest()` schedules its next rAF only from inside the previous callback | fixed in this commit, and in the PR body |
| F-9 | Review gate | The audit row's own command returns 8 paths, not the 4 it accounted for | fixed in this commit — all 8 carry a verdict |
| F-10 | Review gate | The helper's TSDoc opened its second paragraph bare; six of seven `src/testing/` siblings use `<p>` | fixed in this commit |

---

## File structure

- `docs/plans/discover-sheet-opening-rest-race.md` — this plan
- `frontend/src/testing/sheet-opened.ts` — the shared wait: pumps frames until the sheet's
  opening rest is confirmed
- `frontend/src/app/pages/home/discover-sheet.a11y.spec.ts` — the reported case; waits before it taps
- `frontend/src/app/pages/home/discover-sheet.spec.ts` — waits in `beforeEach`; carries AC-1's guard
- `frontend/src/app/pages/home/home.a11y.spec.ts` — same tap-then-assert-pill pattern; `openSheet()`
  waits, and the `lg` cases (which render the desk panel, not a sheet) take a new `openPage()`
- `frontend/src/app/pages/home/home.spec.ts` — waits in `sheetPage()`; drops the 40 ms sleep that stood in for it

---

## Phase 0 — The wait and its guard

**Files:** Create `frontend/src/testing/sheet-opened.ts` · Modify the four specs above

- [x] **Step 1: Write the failing test** — `discover-sheet.spec.ts` › *a tap once the sheet has
  opened is never retaken by the opening rest*: assert `opened()` at test entry (which only the
  `beforeEach` wait can supply), tap to `full`, flush every queued frame, assert the sheet stayed.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/pages/home/discover-sheet.spec.ts"` → FAIL (`opened()` is false at entry)
- [x] **Step 3: Minimal implementation** — `whenSheetOpened(fixture)`; call it from the four sites.
- [x] **Step 4: Run it, verify it passes** — the home-folder specs: `--include="src/app/pages/home/*.spec.ts"` → PASS
- [x] **Step 5: Generalization-audit pass** — log the enumerating command and every site's verdict.
- [x] **Step 6: Commit** — `git commit -m "Wait for the sheet's opening rest before a spec drives it (#1171)"`
- [x] **Step 7: Update Execution status** in the same commit window.

## Phase 1 — Verification

- [x] **Step 1: Negative control** — force `atFull()` false so the Map pill never renders; both
  Map-pill cases must fail. Restore; record the result under AC-2.
- [x] **Step 2: 20 consecutive two-file runs**, 4-way parallel, per #1175's bar → all green.
- [x] **Step 3: Full frontend suite** + `lint`, `format:check`, `test:eslint-rules`, the guards.
- [x] **Step 4: Update Execution status.**

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | The #1171 fix | A spec that drives `DiscoverSheet` (taps the grabber, calls `go()`, or scrolls the outer scroller) before the sheet has stopped retaking its opening rest | `grep -rln "DiscoverSheet\|sheet-grabber\|sheet-map-pill\|sheet-scroller" src e2e --include="*.ts"` (run from `frontend/`) | 8 paths. In population: the 4 specs — `discover-sheet.a11y.spec.ts`, `discover-sheet.spec.ts`, `home.a11y.spec.ts`, `home.spec.ts`. Out: `discover-sheet.ts` and `home.ts` (the subject, not drivers), `src/testing/sheet-opened.ts` (the helper itself), `e2e/discover-sheet.e2e.ts` (a real browser, where the sheet rests against a real layout) | All four wait via the shared helper. Re-run per **site** after a review finding: `home.spec.ts`'s 40 ms sleep and `discover-sheet.spec.ts`'s pre-`go('full')` frame wait both stood in for this condition and are gone; the frame wait *after* `go('full')` stays, waiting on a later rest |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npx ng test --include="src/app/pages/home/*.spec.ts"` → 146 passed across the
  four files. The guard test goes red without the `beforeEach` wait (`expected false to be true`,
  run before the fix landed); its flush assertion additionally pins that no later rest retakes the
  sheet. Verified at this commit.
- [x] **AC-2:** Negative control recorded — with the Map pill's `@if` forced false, exactly the
  two Map-pill cases fail (2 failed / 20 passed across the two a11y files) and nothing else; the
  component was restored byte-identical. The wait did not turn the assertion into a tautology.
- [x] **AC-3:** Green, and reported for what it is. Branch: 6 full-suite runs (3 plain, 3 under
  4-way CPU contention), 3647 tests, 0 failures. Pristine `main`: 13 runs (8 plain, 5 stressed),
  **0 reproductions** — so these runs prove no regression, they are *not* a before/after rate
  comparison, and the issue's "1 in 3" does not hold in this sandbox once #1176 is in. The
  mechanism proof is the deterministic frame-held repro in the PR body, not a rate. #1175's
  two-file command is 20/20 green. Verified at this commit.
- [x] **AC-4:** Audit-log row complete and re-run per site after the review finding. Verified at
  this commit.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A; no concurrency in scope (#2).
- [ ] Invariants #3–#7 N/A: no pool, cutoff, money, time or booking-code logic is touched.
- [ ] Modulith section justified N/A; no backend file in the diff (#11).
- [ ] Payment section N/A (#8, #9, #10). No migration, so #12 is not engaged.
- [ ] Frontend standards met: helper in `src/testing/`, no `as any`, no duration-based wait left.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay).
