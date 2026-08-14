# Vitest per-file setup Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `frontend/src/test-setup.ts` genuinely re-run before every test file — in the mode CI
actually runs — and prove it by a test the suite carries, so the frozen clock is a property of the
harness rather than a convention seven call sites are trusted to uphold.

**Architecture:** The single decision is that the setup file is registered with **Vitest**
(`vitest-base.config.ts` + `runnerConfig: true`) rather than with the Angular builder. Vitest already
re-imports each setup file per test file; `@angular/build:unit-test` pre-bundles its `setupFiles` as
esbuild entry points, and an entry point degrades to a re-export shim in two independent ways — when
a second importer makes it shared, and unconditionally whenever coverage is enabled. Registering it
outside the builder puts it beyond both at once.

**Persistence:** N/A — no backend, no database, no migration. Frontend test infrastructure only.

**Source of intent:** GitHub issue #663 (opened against PR #662's fix, asking why the leak was
possible at all — and stating that the answer decides whether `freezeClock()` is a fix or a
workaround). Decision record: `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md`.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — the ticket's own
suggested direction, "determine what `@angular/build:unit-test` passes for `isolate`/`pool`", turned
out to be a red herring: the builder's `isolate: false` is real but is *not* what breaks setup
re-execution, so the slice measures instead of reading config) · `riviera-plan-doc` (this template —
forced the mutation-proof column, which is what turned "we added guards" into "we watched each guard
fail") · `tdd` (each guard was written against the mutated tree first: re-share the setup module,
move it back under the builder, plant a clock-drifting spec — watch each go red, then restore) ·
`riviera-local-debug` (scoped Vitest runs, and the full `npm test` / `npm run test:coverage` only
where the count of setup executions across 158 files *is* the measurement) · `riviera-frontend`
(placement — the new helper belongs in `src/testing/`, beside `fake-storage.ts` and `axe.ts`, not in
`app/shared/`; and `<name>.spec.ts` is why the spec is `freeze-clock.spec.ts`) ·
`riviera-review-overlay` (review gate — RV-CT/RV-STYLE items; the `/code-review` fan-out ran and its
12 findings are in the register below) · `riviera-docs-freshness` (**ran** over `origin/main..HEAD`,
2 findings — `frontend/.claude/CLAUDE.md` said `freezeClock()` is "exported by `src/test-setup.ts`",
true when written and false after this slice; and `docs/plans/guard-cli-coverage.md` § *The CI
blocker* recorded "under CI's worker reuse it evidently does not [re-freeze]" as an open unknown,
plus an adjacent blockquote asserting the leak was not locally reproducible. Both patched.)

> The routed table matched no other row: the slice adds no Java, no SQL, no Flyway migration, no
> Angular component and no user-facing flow. `postgres` / `riviera-modulith` /
> `riviera-java-conventions` / `riviera-stripe-payments` / `angular-developer` / `playwright-cli` are
> `N/A — frontend test harness only, nothing under platform/ and no rendered surface`.

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
  spec file can express. What replaces it is stronger and ordering-independent: the setup stamps the
  file it ran for, and a spec asserts the stamp is *its own* path (AC-1).

**"Would not reproduce locally in any configuration tried" is no longer true.** It reproduces here:
with a spec that ends on `vi.useRealTimers()` in the tree, a later file in the same worker was handed
`2026-08-14T05:55:27.002Z`. What made it look CI-only is that the victim must land behind the
polluter *in the same worker*, which shuffles run to run — not CI's core count.

---

## Acceptance criteria (testable)

| # | Given / when / then | Pinned by | Mutation that reddens it |
|---|---|---|---|
| AC-1 | Given any test file, when its tests run, then the setup run that installed the clock belongs to **that file** | `freeze-clock.spec.ts` — *was installed by a setup run belonging to this very file* | re-share the setup module (import it from a spec) **or** move it back under `angular.json`'s `setupFiles` — both go red |
| AC-2 | Given a spec that opts into full fake timers, when it restores with `freezeClock()`, then `Date.now()` is back at the frozen instant and no fake timers remain | `freeze-clock.spec.ts` — *is restored by `freezeClock()` after a spec opts into full fake timers* | drop the `finally { freezeClock() }` → red |
| AC-3 | Given a test that leaves the clock off the frozen instant, when it finishes, then **that test** fails, naming the drift | `src/test-setup.ts`'s `afterEach` | remove the `afterEach` → a drifting spec passes |
| AC-4 | Given any file under `frontend/src`, when it calls `vi.useRealTimers()`, then `npm run lint` fails pointing at `freezeClock()` | `no-restricted-syntax` | remove the rule → lint green on the probe file |
| AC-5 | Given the frozen posture, when a spec inspects it, then only `Date` is faked — real timers still run and are not tracked by the fake clock | `freeze-clock.spec.ts` — *fakes Date alone, leaving real timers to run* | switch the setup to full `vi.useFakeTimers()` → `getTimerCount()` becomes 1 |
| AC-6 | Given the shipped configuration, when the suite runs, then wall clock does not regress against `main` | measurement (below) | pin `isolate: true` instead → ~7× |
| AC-7 | Given **`npm run test:coverage`** — the only frontend test command CI runs — then AC-1 still holds | the same `freeze-clock.spec.ts` case, run under `--coverage` | keep the setup file in `angular.json` → red under coverage even when green without it |

**The measurement, since two ACs rest on it.** The setup body appends one line per execution to a
file outside the repo; the suite runs; the lines are counted against the spec files present.

| Tree / command | Spec files | Setup body executions | Duration |
|---|---|---|---|
| `main`, `npm test` | 157 | **3** — one per worker pid | 14.3 s |
| `main`, `npm test -- --isolate` | 157 | 157 — one per file, 157 pids | 97.3 s |
| this slice, `npm test` | 158 | **158** — 3 pids | 14.2 s |
| this slice, `npm run test:coverage` | 158 | **158** — 3 pids | 20.5 s |

---

## Non-goals

- **Flipping `isolate` to `true`.** Measured and rejected in ADR-0014; the number to re-take before
  revisiting is in the table above.
- **Closing the rest of the shared-worker leak class.** Sibling files in a worker still share one
  jsdom document and one module graph. This slice restores the posture `src/test-setup.ts` owns, and
  says so rather than implying the class is closed.
- **Guarding leaks created in `afterAll`.** The `afterEach` guard covers tests; a clock left drifted
  by a file-level `afterAll` is not caught, and no longer matters cross-file now that the next file
  re-freezes.
- **Patching `@angular/build`.** The entry-point shimming is the builder's, deliberate on the
  coverage path ("to support coverage exclusion of the actual test file"), and working with it costs
  one config file.

---

## Risk register

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R-1 | A future edit moves the setup file back under the builder, or re-shares it, and silently drops the freeze to per-worker | medium — it is exactly what #662's fix did | high — the leak returns invisibly for half the day | AC-1, mutation-verified red on **both** paths, in both run modes | closed |
| R-2 | The guard fires on an innocent file and reads as a flake | low | medium — a confusing red | replaced the cross-file tripwire with the `afterEach`, which fails the exact test that drifted (review finding F-2) | closed |
| R-3 | `expect.getState().testPath` is internal-ish and could move | low | medium — AC-1 would stop pinning anything | verified against Vitest 4.1.10 in both run modes; an upgrade that moves it fails the case loudly rather than silently | accepted |
| R-4 | `vitest-base.config.ts` becomes load-bearing and its purpose is not obvious at the call site | medium | medium | the file's own TSDoc states it, ADR-0014 explains it, and AC-1 fails if it is removed | closed |
| R-5 | `src/testing/freeze-clock.ts` is chunk-hoisted and evaluated once per worker; module-level state added there would outlive its file | low | medium | stated as a contract in its TSDoc (review finding F-5) | accepted |

---

## Open questions / Assumptions

None open.

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
touch-target obligation and no e2e coverage is due. The diff is the unit-test harness, its
configuration, and one lint guard.

## FE↔BE contract

N/A — no HTTP surface.

---

## Execution status

**Stage pointer:** `merge close-out` — all gates green, **merged via PR #664**.

**Next action:** none. The slice is complete; #663 closes with the PR.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Measure: what actually re-runs, and what does not | ✅ | (investigation, no code) |
| 1 — Split `freezeClock()` out so the setup entry stays un-shared | ✅ | `a5f6a45` |
| 2 — Guard it: lint rules + runtime tripwire + regression spec | ✅ | `a5f6a45` |
| 3 — Docs: ADR-0014, `frontend/.claude/CLAUDE.md`, this plan, #662's open unknown | ✅ | `a5f6a45` |
| 4 — Review findings: register the setup file outside the builder; F-1…F-13 | ✅ | `a180c82` |
| 5 — Close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source | Finding | Status |
|---|---|---|---|
| F-1 | review | The tripwire is blind to the regression it exists to catch: under a degraded build the setup runs once, `predecessor` is never set, and the check stops running. Suggested a spec asserting the setup stamp is its own file | fixed — AC-1; **it immediately caught that the fix did not hold under `--coverage`**, which CI is the only consumer of |
| F-2 | review | The cross-file tripwire blames an innocent successor nondeterministically; an `afterEach` registered by the setup names the exact culprit every run | fixed — the entry tripwire is replaced by the `afterEach` (AC-3) |
| F-3 | review | `no-restricted-imports` does not cover `await import('../test-setup')` | fixed by removal — the import ban is retired (F-1's fix moved the property off "nobody imports it"); AC-1 is the guard now |
| F-4 | review | The setup file's TSDoc was decision archaeology with issue numbers, against `frontend/.claude/CLAUDE.md` § *Comments* | fixed — trimmed to the contract; the history lives in ADR-0014 |
| F-5 | review | `freeze-clock.ts` is now the chunk-hoisted shared module and nothing said it must stay stateless | fixed — stated in its TSDoc; R-5 |
| F-6 | review | The `vi.useRealTimers()` ban only covered `*.spec.ts`, leaving `src/testing/` — where the PR directs shared test code — unguarded | fixed — scoped to `src/**/*.ts`, mutation-verified on a non-spec helper |
| F-7 | review | ADR and plan reported 157/157 for a tree that ships 158 spec files | fixed — re-measured on HEAD, both run modes, tables corrected |
| F-8 | review | The docs-freshness patch left the adjacent blockquote in `guard-cli-coverage.md` still claiming the leak was not locally reproducible | fixed — that blockquote now carries the correction |
| F-9 | review | The "full fake timers" case never asserted that full fake timers were installed | fixed — `expect(vi.getTimerCount()).toBe(1)` inside the block |
| F-10 | review | The "only Date is faked" case failed by hanging for the test timeout rather than by assertion | fixed — a synchronous `getTimerCount()` assertion replaces the promise |
| F-11 | review | Spec named `frozen-clock.spec.ts` for a module named `freeze-clock.ts` | fixed — renamed `freeze-clock.spec.ts` |
| F-12 | review | The restricted-import pattern reached `frontend/e2e/**`, where the message is meaningless | fixed by removal (see F-3); mutation-verified that an `e2e/support/test-setup.ts` sibling lints clean |
| F-13 | sonar | Quality gate failed: 30.0% coverage on new code (required ≥ 80%) | fixed — `src/test-setup.ts` is a Vitest `setupFiles` entry, which Vitest excludes from its own coverage report, so it sat in `sonar.sources` with no lcov record; added to `sonar.coverage.exclusions` (analysis unaffected). `freeze-clock.ts` measures 3/3 lines covered |

---

## File structure

- `frontend/vitest-base.config.ts` — **new.** Registers `src/test-setup.ts` with Vitest, out of the
  builder's entry-point bundling. The load-bearing half of the fix.
- `frontend/angular.json` — the `test` target takes `runnerConfig: true` and drops `setupFiles`;
  `lintFilePatterns` gains the new config file.
- `frontend/src/test-setup.ts` — no longer exports anything: freezes the clock, stamps the file its
  run belongs to, and registers the `afterEach` that fails the test which drifts it.
- `frontend/src/testing/freeze-clock.ts` — **new.** Owns `FROZEN_INSTANT`, `freezeClock()` and the
  `StampedGlobal` type; documents that it must stay stateless.
- `frontend/src/testing/freeze-clock.spec.ts` — **new.** AC-1, AC-2 and AC-5.
- `frontend/src/app/booking/booking-pay.spec.ts` — import moved to `../../testing/freeze-clock`.
- `frontend/src/app/operator/camera-qr-scanner.spec.ts` — same.
- `frontend/src/app/operator/requests-tab.spec.ts` — same.
- `frontend/eslint.config.js` — `no-restricted-syntax` on `vi.useRealTimers()` under `src/**/*.ts`;
  `vitest-base.config.ts` joins the `disableTypeChecked` block (it is outside every TS project).
- `frontend/package.json` — `format`/`format:check` and the `lint-staged` glob cover the new config.
- `frontend/.claude/CLAUDE.md` — § *Unit tests* rewritten: per-file freeze, where the setup file is
  registered and why, the two guards, the `isolate: false` posture.
- `sonar-project.properties` — `sonar.coverage.exclusions` for the Vitest harness entry (F-13).
- `docs/adr/ADR-0014-vitest-per-file-setup-over-isolation.md` — **new.** The decision and the numbers.
- `docs/plans/vitest-per-file-setup.md` — this plan.
- `docs/plans/guard-cli-coverage.md` — § *The CI blocker*'s open unknown closed, and its
  "not reproduced locally" blockquote corrected.

---

## Phase 0 — Measure: what actually re-runs, and what does not

**Files:** none — instrumentation only, reverted before phase 1.

- [x] **Step 1: Count setup executions.** Append one line per setup-body execution to a file outside
      the repo; run the full suite; count. Result: **3**, one per worker pid.
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
- [x] **Step 4: Re-measure.** 157/157 executions, 3 pids. Suite green.

## Phase 2 — Guard it

**Files:** Modify `frontend/eslint.config.js` and `frontend/src/test-setup.ts` · Test
`frontend/src/testing/freeze-clock.spec.ts`

- [x] **Step 1: Write the guards' mutations first**, and watch each one pass before the guard exists.
- [x] **Step 2: Add the lint rule** and confirm it fires, with the reason and the replacement.
- [x] **Step 3: Add the `afterEach` clock check** to `test-setup.ts`; a planted drifting spec fails
      itself with `left the clock 60000 ms off the frozen instant`.
- [x] **Step 4: Add `freeze-clock.spec.ts`** — the setup-stamp assertion, restore-after-fake-timers,
      and Date-only faking.

## Phase 3 — Docs

**Files:** Create `docs/adr/ADR-0014-…` and this plan · Modify `frontend/.claude/CLAUDE.md` and
`docs/plans/guard-cli-coverage.md`

- [x] **Step 1: ADR-0014** — the decision, both shim paths, and the measurement table.
- [x] **Step 2: `frontend/.claude/CLAUDE.md`** § *Unit tests*.
- [x] **Step 3: Close #662's open unknown** in `docs/plans/guard-cli-coverage.md` § *The CI blocker*.

## Phase 4 — Review findings

**Files:** Create `frontend/vitest-base.config.ts` · Modify `frontend/angular.json`,
`frontend/package.json`, `frontend/eslint.config.js`, `frontend/src/test-setup.ts`,
`frontend/src/testing/freeze-clock.ts`, `frontend/src/testing/freeze-clock.spec.ts`,
`sonar-project.properties`, and the three docs

- [x] **Step 1: Take F-1's suggestion** — assert the setup stamp is the spec's own file.
- [x] **Step 2: Run it under coverage.** It fails: `@angular/build:unit-test` emits *every* entry
      point as `import "./setup-test-setup.js";` when coverage is on, so the phase-1 fix does not
      reach the only frontend test command CI runs.
- [x] **Step 3: Register the setup file with Vitest instead** — `runnerConfig: true` +
      `vitest-base.config.ts`. 158/158 in both modes; both mutations red.
- [x] **Step 4: Retire the import ban** (F-3, F-12) now that the property no longer rests on nobody
      importing the file, and fix F-2, F-4…F-11 as recorded above.
- [x] **Step 5: Fix the Sonar gate** (F-13) and re-verify lint, format, both test modes.

---

## Generalization-audit log

- **The `freezeClock()` convention was not generalized away.** It stays, for a narrower reason than
  #662 gave it: within a single file, a spec that installs full fake timers still owes the rest of
  that file the frozen posture. What changed is that it is no longer load-bearing *across* files.
- **The guard did not generalize to "assert all global state".** It pins the clock, which is what
  `src/test-setup.ts` owns. A generic global-state differ would be a second harness to maintain and
  would report noise from jsdom and Angular's own TestBed teardown.
- **The lint rule that stopped being load-bearing was deleted, not kept for comfort.** Once the
  property moved off "nothing imports this file", a rule whose message asserted that rationale would
  have been a guard defending a fact that no longer holds.

## Acceptance-criteria verification (final)

| # | Verified by | Result |
|---|---|---|
| AC-1 | `freeze-clock.spec.ts`, plus both mutations | green; red on re-share and on builder-registered setup |
| AC-2 | `freeze-clock.spec.ts` | green |
| AC-3 | planted drifting spec | the drifting test failed itself, naming 60000 ms |
| AC-4 | `npx eslint` over probe files, spec and non-spec | both flagged |
| AC-5 | `freeze-clock.spec.ts` | green (`getTimerCount()` 0 under the frozen posture, 1 under full fake timers) |
| AC-6 | `npm test` wall clock | 14.2 s vs 14.3 s on `main` |
| AC-7 | `npm run test:coverage` + the probe count | 158/158, suite green |

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test or measurement.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Every regression AC has a filled mutation column — a guard never observed failing is not
      coverage, it is decoration.
- [x] **No JPA** introduced (invariant #1) — trivially, no Java in scope.
- [x] **Availability** section justified N/A (invariants #2, #3, #4).
- [x] **Modulith** section justified N/A (invariant #11).
- [x] **Payment/payout** section justified N/A (invariants #5, #8, #9, #10).
- [x] `npm run lint`, `npm run format:check`, `npm test` and `npm run test:coverage` green on the
      final tree.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **The review gate ran in full** — `/code-review` over `origin/main...HEAD`; 12 findings, all
      resolved above, one of which (F-1) changed the shape of the fix.
- [x] **CI gate** — green on `a180c82`: backend, frontend, repo hygiene, CodeQL (both analyses).
- [x] **Sonar gate** — green on `a180c82`, and its issue list is empty, not merely passing:
      0 new issues, 0 accepted issues, 0 security hotspots, **100.0% coverage on new code**,
      0.0% duplication on new code.
- [x] **Close-out written in THIS PR**, citing `merged via PR #664`.
