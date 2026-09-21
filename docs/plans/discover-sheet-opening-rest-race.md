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
`riviera-review-overlay` (at ready-for-review) · `riviera-docs-freshness` (at close-out) ·
`riviera-local-debug` (scoped `--include` runs; unshallowed the clone before every history claim)
· `riviera-frontend` (shared spec helpers belong in `src/testing/`, not the feature folder) ·
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
  component's public signals) · *Pinned by:* `discover-sheet.spec.ts` › *a tap once the sheet has
  opened is never retaken by the opening rest*
- [ ] **AC-2:** Given the reported case, when the grabber is tapped, then the Map pill is in the
  DOM and axe finds no serious violation — and the case still fails when the pill genuinely stops
  rendering at `full`. *Seam:* the rendered sheet DOM (`[data-testid="sheet-map-pill"]`) ·
  *Pinned by:* `discover-sheet.a11y.spec.ts` › *has no serious violations at full, with the Map
  pill*, plus the recorded negative control
- [ ] **AC-3:** Given the load that reproduces it, when the two-file repro command from #1175 runs
  20 consecutive times 4-way parallel, then all 20 are green — and the frame-deferred repro that
  fails deterministically on `main` passes. *Seam:* the suite as CI runs it · *Pinned by:* the run
  log in *Acceptance-criteria verification*
- [ ] **AC-4:** Given the mechanism "a spec drives `DiscoverSheet` before its opening rest is
  confirmed", when every member of that population is enumerated, then each one waits on the same
  condition and none waits on a duration. *Seam:* the population, enumerated by the command in the
  generalization-audit log · *Pinned by:* the log's row

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
| R-1 | Waiting for the pill rather than for the rest would mask a real failure to render it | Medium | High — the case stops guarding what it claims | The helper waits on `opened()`, a precondition asserted *before* the tap; the pill stays a bare assertion. Negative control recorded under AC-2 | this slice | open |
| R-2 | `whenSheetOpened` hangs a spec if `opened()` never flips | Low | Medium — a timeout instead of a legible failure | Bounded at 12 frames (the sheet gives up at 8 of its own) and closed by an `expect` naming the condition | this slice | open |
| R-3 | A later change to `rest()` reopens the window after `opened()` | Low | High — the flake returns silently | AC-1 pins the contract the helper leans on, deterministically | this slice | open |
| R-4 | `src/testing/` importing a page component inverts the folder taxonomy | Low | Low | `riviera-frontend`: `src/testing/` is spec support, outside the app graph; `fake-geolocation.ts` and `venue-cards.ts` already import app types | this slice | open |

## Open questions / Assumptions

- **Assumption:** the jsdom-only race is the same one CI hits — CI runs this suite in jsdom, and
  the reported repro is a jsdom full-suite run. *Owner:* this slice · *Resolves by:* AC-3.

### Resolved

- **Open question:** does Angular 22 offer a first-class wait that already covers this, making the
  frame pump unnecessary? — **No.** `fixture.whenStable()` resolves on the fixture's own
  asynchronous activity and `TestBed.tick()` "executes any pending work required to synchronize
  model to the UI"; neither reaches a raw `requestAnimationFrame` a component schedules for
  itself, which is what `rest()` uses. Measured, not assumed: after the specs' existing settle,
  two frames are still queued and `opened()` is false. What the docs did change: the zoneless
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

**Stage pointer:** `implement (phase 1 — verification)`

**Next action:** The stressed before/after full-suite comparison, then the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The wait and its guard | ✅ | this commit |
| 1 — Verification (negative control + stressed before/after) | ⏳ | negative control ✅ |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| | | | |

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

- [ ] **Step 1: Write the failing test** — `discover-sheet.spec.ts` › *a tap once the sheet has
  opened is never retaken by the opening rest*: assert `opened()` at test entry (which only the
  `beforeEach` wait can supply), tap to `full`, flush every queued frame, assert the sheet stayed.
- [ ] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/pages/home/discover-sheet.spec.ts"` → FAIL (`opened()` is false at entry)
- [ ] **Step 3: Minimal implementation** — `whenSheetOpened(fixture)`; call it from the four sites.
- [ ] **Step 4: Run it, verify it passes** — the home-folder specs: `--include="src/app/pages/home/*.spec.ts"` → PASS
- [ ] **Step 5: Generalization-audit pass** — log the enumerating command and every site's verdict.
- [ ] **Step 6: Commit** — `git commit -m "Wait for the sheet's opening rest before driving it (#1171)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

## Phase 1 — Verification

- [ ] **Step 1: Negative control** — force `atFull()` false so the Map pill never renders; both
  Map-pill cases must fail. Restore; record the result under AC-2.
- [ ] **Step 2: 20 consecutive two-file runs**, 4-way parallel, per #1175's bar → all green.
- [ ] **Step 3: Full frontend suite** + `lint`, `format:check`, `test:eslint-rules`, the guards.
- [ ] **Step 4: Update Execution status.**

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | The #1171 fix | A spec that drives `DiscoverSheet` (taps the grabber, calls `go()`, or scrolls the outer scroller) before the sheet's opening rest is confirmed | `grep -rln "DiscoverSheet\|sheet-grabber\|sheet-map-pill\|sheet-scroller" src e2e --include="*.ts"` | 4 spec files (`discover-sheet.a11y.spec.ts`, `discover-sheet.spec.ts`, `home.a11y.spec.ts`, `home.spec.ts`); `e2e/discover-sheet.e2e.ts` is a real browser, out of population | All four wait via the shared helper; `home.spec.ts`'s 40 ms sleep — a duration standing in for this condition — is replaced by it |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run the home-folder specs → PASS. Verified at commit `<sha>`.
- [x] **AC-2:** Negative control recorded — with the Map pill's `@if` forced false, exactly the
  two Map-pill cases fail (2 failed / 20 passed across the two a11y files) and nothing else; the
  component was restored byte-identical. The wait did not turn the assertion into a tautology.
- [ ] **AC-3:** 20/20 green. Verified at commit `<sha>`.
- [ ] **AC-4:** Audit-log row complete. Verified at commit `<sha>`.

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
