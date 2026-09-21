# Discover-sheet opening-rest race Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Every spec that drives `DiscoverSheet` waits until it has stopped retaking its opening
rest before it taps, so the sheet's own retake can no longer undo the tap and drop the Map pill.

**Architecture:** The reported defect is a race between the spec and the sheet's opening rest, not
an accessibility regression: `rest()` confirms its rest on a `requestAnimationFrame` of its own and
retakes it while `scrollTop` differs from the offset it wants. A tap that lands inside that
window is read as the browser's snapping and reverted to half. One shared helper,
`src/testing/sheet-opened.ts`, pumps frames until the sheet's own `opened()` signal says the
window has shut — it is set both when a rest confirms and when the sheet gives up, and neither
leaves a retry pending, which is the property the wait actually needs. All four spec sites that
drive the sheet call it. The slice then grew one production change, on the user's instruction: a
rest the viewport has superseded retires rather than fighting the rest that replaced it (AC-5,
closes #1181), which is the same race one layer down — the wait could not have closed it, because
it reopens *after* `opened()`.

**Persistence:** JDBC only (invariant #1). N/A — no table, migration or query is touched.

**Source of intent:** GitHub issue #1171 (its later duplicate #1175 was fixed only in part by
PR #1176 — see *Resolved* below)

**Skills consulted:** `riviera-sdlc` (intake gate found #1171's duplicate #1175/PR #1176 already
on `main`, which forced the re-diagnosis below) · `riviera-plan-doc` (forced the generalization
pass that found two further sites the issue never named) · `tdd` (the red was the
frame-held repro; a review round then turned the inert half of the first guard test into a second
test that drives the window, so the repro now lives in the suite) ·
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

- [x] **AC-1:** Given a sheet whose `opened()` reports the opening rest done, when the tourist taps
  to `full`, then the sheet stands at `full` with the Map pill — and given one whose rest is still
  pending, when the same tap lands and the held frame is flushed, then the sheet is retaken to
  `half` and the pill goes, which is the window the wait exists to close. *Seam:*
  `DiscoverSheet.opened` / `.detent()` (the component's public signals) · *Pinned by:*
  `discover-sheet.spec.ts` › *reports opened before a spec drives it, so the tap that follows
  stands* and › *retakes the opening rest over a tap that lands before it, which is why a spec
  waits*
- [x] **AC-2:** Given the reported case, when the grabber is tapped, then the Map pill is in the
  DOM and axe finds no serious violation — and the case still fails when the pill genuinely stops
  rendering at `full`. *Seam:* the rendered sheet DOM (`[data-testid="sheet-map-pill"]`) ·
  *Pinned by:* `discover-sheet.a11y.spec.ts` › *has no serious violations at full, with the Map
  pill*, plus the recorded negative control
- [x] **AC-3:** Given the load that reproduces it, when the suite runs repeatedly before and
  after, then it is green, and the frame-held repro that fails deterministically on `main` passes.
  *Seam:* the suite as CI runs it · *Pinned by:* the run log in *Acceptance-criteria
  verification*. Reworded from "20 consecutive two-file runs": that command is #1175's and is
  already green on `main`, so it could not have been the bar for #1171.
- [x] **AC-4:** Given the mechanism "a spec drives `DiscoverSheet` before its opening rest is
  confirmed", when every member of that population is enumerated, then each one waits on that
  condition and no site waits on a duration for it. *Seam:* the population, enumerated by the
  command in the generalization-audit log · *Pinned by:* the log's row. The sweep was re-run per
  **site**, not per file, after a review finding: `discover-sheet.spec.ts`'s own
  `await nextFrame(window)` before `go('full')` was the same wait and is now dead, so it is gone.
  The one that remains in that file waits for the rest a *later* `go()` takes, which is not the
  opening rest this helper covers.
- [x] **AC-5:** Given a sheet whose opening rest is still unconfirmed, when the viewport changes so
  a second rest supersedes the first, then the frame the first left in flight retires instead of
  scrolling the sheet back to the offset the re-measure replaced. *Seam:* `DiscoverSheet`'s outer
  scroller, through every `scrollTo` it asks for · *Pinned by:* `discover-sheet.spec.ts` ›
  *abandons a rest a re-measure has superseded, instead of pulling the sheet back* — red before
  the guard with `expected [ 383, 323 ] to deeply equal []`, the stale offset and the correction
  chasing each other.

## Non-goals

- **Teaching the sheet to stand down on a tourist's gesture.** The retake is deliberate — the
  opening rest exists to beat the browser's own snapping, which a tourist's early flick is
  indistinguishable from. That stays.
- ~~Changing `DiscoverSheet` itself.~~ **Reversed on the user's instruction** after the review
  found a second defect in `rest()` (below, AC-5). The retake still stands; what changed is that a
  rest the viewport has *superseded* now retires instead of fighting the rest that replaced it.
- Skipping, quarantining or retrying the case. The issue is explicit: the flake is the bug.
- Retiring `home.spec.ts`'s other timing waits. Only the one that waits on this race is touched.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — replaces nothing; no surface is retired.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Waiting for the pill rather than for the rest would mask a real failure to render it | Medium | High — the case stops guarding what it claims | The helper waits on `opened()`, a precondition asserted *before* the tap; the pill stays a bare assertion. Negative control recorded under AC-2 | this slice | closed — control run, `33c1c62f` |
| R-2 | `whenSheetOpened` hangs a spec if `opened()` never flips | Low | Medium — a timeout instead of a legible failure | Bounded at 12 frames (the sheet gives up at 8 of its own) and closed by an `expect` naming the condition | this slice | closed — `33c1c62f` |
| R-3 | A later change to `rest()` reopens the window after `opened()` | Low | High — the flake returns silently | AC-1's second test drives the window itself, so a `rest()` that stops retaking goes red there rather than silently making the wait pointless | this slice | closed — this commit |
| R-5 | Two rest chains can overlap if `tops()` changes while the opening chain is pending (a resize before `opened()`): the second can set `opened()` true while the first's frame is still queued, and that stale callback re-scrolls to the old offset — the same race, behind the wait | Low | Medium | **Fixed here** on the user's instruction, after first being deferred: `rest()` records the offset the sheet is resting at, and a queued confirmation for any other offset retires. Pinned by AC-5, red before the guard | this slice | closed — this commit, closes #1181 |
| R-6 | AC-1's second test holds `requestAnimationFrame`, and Angular's zoneless scheduler races rAF against `setTimeout`. Full fake timers in that file — which `frontend/.claude/CLAUDE.md` explicitly allows — would kill both legs and hang `whenStable()` | Low | Medium — a hang, not a failure | No spec in the file fakes timers, and the suite fakes `Date` only (`freeze-clock.ts`). Recorded so the next person to reach for `vi.useFakeTimers()` here knows what it costs | follow-up | accepted — no spec in the file fakes timers; recorded for whoever reaches for them |
| R-4 | `src/testing/` importing a page component inverts the folder taxonomy | Low | Low | `src/testing/` is spec support, outside `riviera-frontend`'s `src/app/` taxonomy; `venue-cards.ts` already imports a page **component** (`app/pages/home/venue-card`) | this slice | closed — precedent verified, `33c1c62f` |

## Open questions / Assumptions

### Resolved

- **Assumption:** the jsdom-only race is the same one CI hits. — **Held as far as it can be
  shown.** CI runs this suite in jsdom and the reported repro is a jsdom full-suite run, so the
  mechanism is the same; the *rate* could not be measured here at all — 0 reproductions in 13
  full-suite runs on `main`, plain and stressed. The mechanism is pinned deterministically by
  AC-1's second test instead, which is worth more than a rate would have been.

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

**Stage pointer:** `DONE — merged via PR #1180`

**Next action:** None — merge.

> Re-entered at Implement after close-out: the user asked for #1181 to be fixed here rather than
> deferred. Phase 3 below carries it; the gates were re-run on the new head.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — The wait and its guard | ✅ | `33c1c62f`, `f1c308b2` |
| 1 — Verification (negative control + before/after runs) | ✅ | negative control + 19 full-suite runs, recorded under the ACs |
| 2 — Review-gate findings | ✅ | `c767dc8f`, `7974ce01`, `e0dbc92e` |
| 3 — The superseded rest retires (#1181, user-directed) | ✅ | this commit |

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
| F-11 | Review gate | The guard test's stub-and-flush half **could not fail**: once the wait has closed the chain the sheet queues no frame at all, because the rest effect's reactive deps (`tops()`, `scroller()`) do not change on a tap and `detent` is read `untracked`. AC-1's "asks for no further rest" clause was therefore unpinnable and the F-2 assertion inert — the `tdd` skill's tautology anti-pattern | fixed in this commit — the inert half is gone; a second test drives the window itself, holding the frame, tapping, flushing, and proving the sheet is retaken to `half`. AC-1 reworded to what the two tests pin |
| F-12 | Review gate | The wait is a no-op at most `home.spec.ts` / `home.a11y.spec.ts` call sites in this environment (`opened()` already true on entry at 28 of 36 sites); it bites only under load | Recorded, not fixed — that is what the wait is for. It does mean those files' green runs cannot be *attributed* to the wait, which AC-3 now says outright |

---

## File structure

- `docs/plans/discover-sheet-opening-rest-race.md` — this plan
- `frontend/src/testing/sheet-opened.ts` — the shared wait: pumps frames until the sheet's
  opening rest is confirmed
- `frontend/src/app/pages/home/discover-sheet.ts` — `rest()` retires a superseded rest (AC-5)
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

## Phase 3 — The superseded rest retires (#1181)

Added after close-out, on the user's instruction, reversing this plan's own non-goal.

- [x] **Step 1: Write the failing test** — `discover-sheet.spec.ts` › *abandons a rest a re-measure
  has superseded, instead of pulling the sheet back*: hold the frames, render, move `innerHeight`
  so a second rest supersedes the first, flush, and assert the sheet was asked for no scroll.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --include="src/app/pages/home/discover-sheet.spec.ts"` → FAIL, `a superseded rest scrolled the sheet: expected [ 383, 323 ] to deeply equal []`
- [x] **Step 3: Minimal implementation** — `rest()` records `restingAt` and a queued confirmation
  for any other offset returns. The closure's `restedAt` becomes that field, so the effect's
  "already resting there" guard reads the same number.
- [x] **Step 4: Run it, verify it passes** — the home folder: 24 files / 399 tests green; the
  sheet's real-browser suite `e2e/discover-sheet.e2e.ts` 27/27, which is what proves the retake
  still beats the browser's snapping where jsdom cannot.
- [x] **Step 5: Generalization-audit pass** — logged below.
- [x] **Step 6: Commit.**
- [x] **Step 7: Update Execution status** in the same commit window.

---

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
| 2026-09-21 | The #1181 fix (AC-5) | A queued `requestAnimationFrame` callback that acts on state captured before a re-measure | `grep -n "requestAnimationFrame" frontend/src/app/pages/home/*.ts frontend/src/app/shared/*.ts` | One: `DiscoverSheet.rest`. `riviera-map.ts` and `map-poster.ts` schedule no frames; the only other `requestAnimationFrame` under `src/` is the spec harness and `src/testing/sheet-opened.ts`, neither of which captures state | Fixed at the single site; no population to sweep |
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
  mechanism proof is the deterministic frame-held repro, now committed as AC-1's second test, not
  a rate. #1175's two-file command is 20/20 green. One honesty note (F-12): at 28 of 36
  `home.spec.ts` / `home.a11y.spec.ts` call sites the wait is a no-op in this environment, so
  those files' green runs are not evidence *for* it — the wait is insurance for the loaded case.
  Verified at this commit.
- [x] **AC-4:** Audit-log row complete and re-run per site after the review finding. Verified at
  this commit.

## Self-review checklist

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] No JPA (#1). Availability section justified N/A; no concurrency in scope (#2).
- [x] Invariants #3–#7 N/A: no pool, cutoff, money, time or booking-code logic is touched.
- [x] Modulith section justified N/A; no backend file in the diff (#11).
- [x] Payment section N/A (#8, #9, #10). No migration, so #12 is not engaged.
- [x] Frontend standards met: helper in `src/testing/`, no `as any`, no duration-based wait left.
- [x] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [x] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [x] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #1180`.
- [x] The merged plan `docs/plans/legal-links-on-the-riviera-map.md` (#1173, PR #1174, merged
  2026-09-21) is retired in this commit; nothing cited its path.
- [x] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay).
