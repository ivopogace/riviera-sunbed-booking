# Vitest per-file setup Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `frontend/src/test-setup.ts` genuinely re-run before every test file — and prove it by
measurement, not by reading the docs — so the frozen clock is a property of the suite rather than a
convention seven call sites are trusted to uphold.

**Architecture:** The single decision is that the setup module stays an **entry point with no
importers**. Vitest already re-imports each setup file per test file; `@angular/build:unit-test`
pre-bundles setup files with esbuild, so a second importer makes the module shared, esbuild hoists
its body into a chunk, and Vitest re-imports a shim whose chunk is already evaluated. Moving
`freezeClock()` into `src/testing/freeze-clock.ts` restores per-file execution at zero cost, and
makes `isolate: true` — the other way to get the same property, at ~9× wall clock — unnecessary.

**Persistence:** N/A — no backend, no database, no migration. Frontend test infrastructure only.

**Source of intent:** GitHub issue #663 (opened against PR #662's fix, asking why the leak was
possible at all — and stating that the answer decides whether `freezeClock()` is a fix or a
workaround). Decision record: `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the ticket's own
suggested direction, "determine what `@angular/build:unit-test` passes for `isolate`/`pool`", turned
out to be a red herring: the builder's `isolate: false` is real but is *not* what breaks setup
re-execution, so the slice measures instead of reading config) · `riviera-plan-doc` (this template —
forced the mutation-proof column, which is what turned "we added guards" into "we watched each guard
fail") · `tdd` (each guard was written against the mutated tree first: import `test-setup`, call
`vi.useRealTimers()`, plant a poisoner spec — watch it go red, then restore) ·
`riviera-local-debug` (scoped Vitest runs, and the full `npm test` only where the count of setup
executions across 157 files *is* the measurement) · `riviera-frontend` (placement — the new helper
belongs in `src/testing/`, beside `fake-storage.ts` and `axe.ts`, not in `app/shared/`) ·
`riviera-review-overlay` (review gate — RV-CT/RV-STYLE items over the diff) ·
`riviera-docs-freshness` (**ran** over `origin/main..HEAD`, 2 findings — `frontend/.claude/CLAUDE.md`
said `freezeClock()` is "exported by `src/test-setup.ts`", true when written and false after this
slice; and `docs/plans/guard-cli-coverage.md` § *The CI blocker* recorded "under CI's worker reuse it
evidently does not [re-freeze]" as an open unknown, which this slice closes. Both patched.)

> The routed table matched no other row: the slice adds no Java, no SQL, no Flyway migration, no
> Angular component and no user-facing behaviour. `postgres` / `riviera-modulith` /
> `riviera-java-conventions` / `riviera-stripe-payments` / `angular-developer` / `playwright-cli` are
> `N/A — frontend test harness only, nothing under `platform/` and no rendered surface`.

**Branch:** `claude/issue-663-1gyfkf` — the cloud session's designated remote branch, standing in for
`bugfix/vitest-per-file-setup` per `riviera-sdlc`'s remote-session addendum.

---

## Issue-intake grill (what the ticket got right, and what it aimed at the wrong target)

The ticket is hours old and its evidence holds. One of its three suggested directions is misaimed,
and that changes the work.

- **"Determine what `@angular/build:unit-test` passes for Vitest's `isolate`/`pool`/`fileParallelism`,
  and whether `setupFiles` is per-file or per-worker under it."** The first half is answerable from
  the builder source — `isolate` defaults to `false`, "to align with the Karma/Jasmine experience",
  and the pool is Vitest's default `forks`. The second half does **not** follow from the first: a
  plain Vitest project with `isolate: false` re-executes its setup body per file (measured — 6/6),
  because `TestRunner.importFile(…, 'setup')` invalidates the setup module before each file. Reading
  the config would have produced a confident wrong answer.
- **"If setup is per-worker, decide deliberately: pin `isolate: true`, or treat 'restore global state
  yourself' as the standing rule and give it a guard."** Correct fork, and it is the one this slice
  answers — but with a third option the ticket could not see, because it presumes the cause is
  isolation. See ADR-0014.
- **"A cheap regression net either way: a spec that asserts `new Date()` equals the frozen instant,
  placed so it runs after the fake-timer specs."** Adopted, minus the placement clause: file→worker
  assignment is not stable between runs (observed — the same poisoner spec was followed by a
  different file on two consecutive local runs), so "placed so it runs after" is not something a
  spec file can express. The ordering-independent half of that idea lives in the setup file instead,
  as AC-5.

**"Would not reproduce locally in any configuration tried" is no longer true.** It reproduces here,
deterministically enough to watch: with a spec that ends on `vi.useRealTimers()` in the tree, a later
file in the same worker was handed `2026-08-14T05:55:27.002Z`. What made it look CI-only is that the
victim must land behind the poisoner *in the same worker*, which shuffles run to run.

---

## Acceptance criteria (testable)

| # | Given / when / then | Pinned by | Mutation that reddens it |
|---|---|---|---|
| AC-1 | Given the 157-file suite, when it runs with the shipped configuration, then the `test-setup.ts` body executes **once per test file**, not once per worker process | measurement (below) | revert the `freeze-clock.ts` split → 3 executions |
| AC-2 | Given a spec that opts into full fake timers, when it restores with `freezeClock()`, then `Date.now()` is back at the frozen instant for the rest of the file | `frozen-clock.spec.ts` — *is restored by `freezeClock()` after a spec opts into full fake timers* | drop the `finally { freezeClock() }` → red |
| AC-3 | Given any file under `frontend/src`, when it imports `test-setup`, then `npm run lint` fails naming the chunk-hoisting reason | `no-restricted-imports` | remove the rule → lint green on the probe file |
| AC-4 | Given a spec, when it calls `vi.useRealTimers()`, then `npm run lint` fails pointing at `freezeClock()` | `no-restricted-syntax` | remove the rule → lint green on the probe file |
| AC-5 | Given a test file that inherits a clock other than the frozen instant, when its setup runs, then the file fails naming the **predecessor** that left it that way | the `test-setup.ts` tripwire | plant a poisoner spec → the file behind it in that worker fails |
| AC-6 | Given the shipped configuration, when the suite runs, then wall clock does not regress against `main` | measurement (below) | pin `isolate: true` instead → ~9× |

**The measurement, since two ACs rest on it.** The setup body appends one line per execution to a
file outside the repo; the suite runs; the lines are counted against the 157 spec files.

| Tree | Setup body executions | Distinct pids | `npm test` duration |
|---|---|---|---|
| `main` (as #662 shipped it) | **3** | 3 | 14.3 s |
| `main` + `--isolate` | **157** | 157 | 97.3 s |
| This slice | **157** | 3 | 10.9 s |

---

## Non-goals

- **Flipping `isolate` to `true`.** Measured and rejected in ADR-0014; the number to re-take before
  revisiting is in the table above.
- **Closing the rest of the shared-worker leak class.** Sibling files in a worker still share one
  jsdom document and one module graph. This slice restores the posture `test-setup.ts` owns, and
  says so rather than implying the class is closed.
- **Reporting a leak that has no successor.** A poisoner that happens to be the last file in its
  worker is invisible to AC-5, by construction — the lint rules are what cover that case.
- **Patching `@angular/build`.** The chunk-hoisting behaviour is the builder's, and working with it
  costs one file move.

---

## Risk register

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R-1 | A future edit re-imports `test-setup.ts` and silently drops the freeze back to per-worker | medium — it is exactly what #662's fix did | high — the leak returns invisibly for half the day | `no-restricted-imports` (AC-3) + the tripwire (AC-5) | closed |
| R-2 | The tripwire fires on an innocent file and reads as a flake | low | medium — a confusing red | the message names the predecessor and says "this file is the messenger, not the cause" | closed |
| R-3 | esbuild changes how it splits entry points and the entry becomes a shim for some other reason | low | high — silent | AC-1's count is re-measurable in one command; the tripwire still fires on the resulting leak | accepted |
| R-4 | `expect.getState().testPath` is internal-ish and could move | low | low — the tripwire degrades to `(unknown file)` | verified against Vitest 4.1.10; the `?? '(unknown file)'` fallback keeps the throw useful | accepted |

---

## Open questions / Assumptions

None open. One assumption worth stating: the freeze is re-established per file **before collection**,
so a module-scope `new Date()` in a spec sees the frozen clock — verified by the first case in
`frozen-clock.spec.ts`, which reads the clock at test time, and by the 157/157 count, which is taken
at setup time.

---

## Availability & concurrency (invariant #2)

N/A — no booking, availability, or set-claim path is touched. The slice changes only how the frontend
unit-test harness establishes its global clock.

## Spring Modulith — modules, interfaces, events (invariant #11)

N/A — no Java. No module, published surface, port or event changes.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money, no Stripe, no ledger.

## Angular — frontend surfaces touched

No component, route, service, template or style changes; no rendered surface, so no a11y or
touch-target obligation and no e2e coverage is due. The diff is the unit-test harness plus its lint
guards.

## FE↔BE contract

N/A — no HTTP surface.

---

## Execution status

**Stage pointer:** `implement` — complete; CI gate next.

**Next action:** push the branch, open the draft PR, and check that push's CI run before claiming the
slice green.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Measure: what actually re-runs, and what does not | ✅ | (investigation, no code) |
| 1 — Split `freezeClock()` out so the setup entry stays un-shared | ✅ | this branch |
| 2 — Guard it: two lint rules + the runtime tripwire | ✅ | this branch |
| 3 — Docs: ADR-0014, `frontend/.claude/CLAUDE.md`, this plan, #662's open unknown | ✅ | this branch |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/testing/freeze-clock.ts` — **new.** Owns `FROZEN_INSTANT` and `freezeClock()`; the
  module specs import, so that `test-setup.ts` does not have to be one.
- `frontend/src/test-setup.ts` — no longer exports anything: imports `freezeClock()`, calls it, and
  carries the inherited-clock tripwire plus the contract for why nothing may import it.
- `frontend/src/testing/frozen-clock.spec.ts` — **new.** AC-2's pin, plus the frozen-instant
  assertion the ticket asked for and the "only `Date` is faked" case.
- `frontend/src/app/booking/booking-pay.spec.ts` — import moved to `../../testing/freeze-clock`.
- `frontend/src/app/operator/camera-qr-scanner.spec.ts` — same.
- `frontend/src/app/operator/requests-tab.spec.ts` — same.
- `frontend/eslint.config.js` — `no-restricted-imports` on `test-setup` (AC-3), and a spec-scoped
  `no-restricted-syntax` on `vi.useRealTimers()` (AC-4).
- `frontend/.claude/CLAUDE.md` — § *Unit tests* rewritten: per-file freeze, the un-imported rule, the
  `isolate: false` posture.
- `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md` — **new.** The decision and the numbers
  behind it.
- `docs/plans/vitest-per-file-setup.md` — this plan.
- `docs/plans/guard-cli-coverage.md` — § *The CI blocker*'s open unknown closed with a pointer.

---

## Phase 0 — Measure: what actually re-runs, and what does not

**Files:** none — instrumentation only, reverted before phase 1.

- [x] **Step 1: Count setup executions.** Append one line per setup-body execution to a file outside
      the repo; run the full 157-file suite; count. Result: **3**, one per worker pid.
- [x] **Step 2: Separate the builder from Vitest.** Same probe in a bare Vitest project with
      `isolate: false`: **6/6**. So `isolate: false` is not the cause.
- [x] **Step 3: Find the cause.** Instrument Vitest's `TestRunner.importFile` and Vite's
      `ModuleRunner.directRequest`: the setup module *is* invalidated and re-evaluated per file — and
      its transformed body is a re-export shim over `/chunk-*.js`, because three specs import
      `test-setup.ts` and esbuild hoists shared modules out of entry points.
- [x] **Step 4: Price the alternative.** `--isolate`: 157/157 executions, 157 pids, 97.3 s.

## Phase 1 — Split `freezeClock()` out so the setup entry stays un-shared

**Files:** Create `frontend/src/testing/freeze-clock.ts` · Modify `frontend/src/test-setup.ts` and the
three specs that import it

- [x] **Step 1: Write the failing measurement.** With the probe still in place, the count is 3/157.
- [x] **Step 2: Move `FROZEN_INSTANT` + `freezeClock()`** into `src/testing/freeze-clock.ts`; leave
      `test-setup.ts` importing and calling it, exporting nothing.
- [x] **Step 3: Re-point the three importers** at `../../testing/freeze-clock`.
- [x] **Step 4: Re-measure.** 157/157 executions, 3 pids, 10.9 s. Suite green.

## Phase 2 — Guard it

**Files:** Modify `frontend/eslint.config.js` and `frontend/src/test-setup.ts` · Test
`frontend/src/testing/frozen-clock.spec.ts`

- [x] **Step 1: Write the guards' mutations first.** A probe spec that imports `../test-setup` and
      calls `vi.useRealTimers()` — lint green before the rules exist.
- [x] **Step 2: Add the two lint rules.** Re-run: both fire, each with the reason and the
      replacement. Probe deleted.
- [x] **Step 3: Add the runtime tripwire** to `test-setup.ts` — compare the inherited clock against
      the frozen instant from the second file in a worker onward, and throw naming the predecessor.
- [x] **Step 4: Prove the tripwire.** Plant a poisoner spec that ends on real timers (via a
      lint-evading indirect call); the file behind it in that worker fails. Separately confirmed that
      a throw from a setup file does fail its test file rather than being swallowed. Poisoner deleted.
- [x] **Step 5: Add `frozen-clock.spec.ts`** — frozen instant, restore-after-fake-timers, real timers
      untouched.

## Phase 3 — Docs

**Files:** Create `docs/adr/ADR-0014-…` and this plan · Modify `frontend/.claude/CLAUDE.md` and
`docs/plans/guard-cli-coverage.md`

- [x] **Step 1: ADR-0014** — the decision, the mechanism, and the three-row measurement table.
- [x] **Step 2: `frontend/.claude/CLAUDE.md`** § *Unit tests* — per-file freeze, the un-imported rule,
      the `isolate: false` posture.
- [x] **Step 3: Close #662's open unknown** in `docs/plans/guard-cli-coverage.md` § *The CI blocker*,
      where it is currently recorded as "under CI's worker reuse it evidently does not".

---

## Generalization-audit log

- **The `freezeClock()` convention was not generalized away.** It stays, for a narrower reason than
  #662 gave it: within a single file, a spec that installs full fake timers still owes the rest of
  that file the frozen posture. What changed is that it is no longer load-bearing *across* files.
- **The tripwire deliberately does not generalize to "assert all global state".** It pins the clock,
  which is the thing `test-setup.ts` owns. A generic global-state differ would be a second harness to
  maintain and would report noise from jsdom and Angular's own TestBed teardown.

## Acceptance-criteria verification (final)

| # | Verified by | Result |
|---|---|---|
| AC-1 | probe count over the full suite | 157/157 |
| AC-2 | `frozen-clock.spec.ts` | green |
| AC-3 | `npx eslint` over a probe file importing `../test-setup` | fails with the chunk-hoisting message |
| AC-4 | same probe file, `vi.useRealTimers()` | fails pointing at `freezeClock()` |
| AC-5 | poisoner spec planted in the tree | the successor file failed, naming the poisoner |
| AC-6 | `npm test` wall clock | 10.9 s vs 14.3 s on `main` |

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test or measurement.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Every regression AC has a filled mutation column — a guard never observed failing is not
      coverage, it is decoration.
- [x] **No JPA** introduced (invariant #1) — trivially, no Java in scope.
- [x] **Availability** section justified N/A (invariants #2, #3, #4).
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9, #10).
- [x] `npm run lint`, `npm run format:check` and `npm test` green on the final tree.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [ ] **CI gate** — due on the first push; unticked until that run is checked.
- [ ] **The review gate ran in full** — unticked deliberately. This session is directed not to spawn
      agents, so the `/code-review` subagent fan-out at the top of `references/pr-gates.md` §1 did not
      run. The box stays unticked rather than claiming a gate that did not run.
- [ ] **Close-out written in THIS PR**, citing `merged via PR #NN`.
