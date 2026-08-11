# ESLint type-aware presets Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `frontend/eslint.config.js` from the syntax-only typescript-eslint presets to
their type-checked twins, bring `frontend/e2e/` under a TS project so the new rules reach it, and
drive the resulting finding count to **zero with no rule relaxations** — so `npm run lint` gates
the unawaited-promise and unsafe-`any` bug classes that nothing else in the toolchain sees.

**Architecture:** The single significant decision is **no carve-outs for test code.** The measured
409 findings are 95% concentrated in `**/*.spec.ts`, and the cheap answer — relaxing `no-unsafe-*`
and `require-await` for specs — was considered and **rejected** (see Open questions → Resolved):
the noise is a *typing* defect (`ComponentFixture.nativeElement` is `any`), so it is fixed at the
source with a typed accessor in `src/testing/`, not suppressed at the gate. The only carve-out is
`playwright*.config.ts`, which belongs to no TS project and gets `disableTypeChecked` — build
tooling, not app code.

**Persistence:** N/A — frontend-only slice, no backend, no schema, no Flyway migration.

**Source of intent:** GitHub issue **#632** (sibling of #631, from the PR #630 "do we benefit from
the ESLint we have?" audit).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — its "answer the
discoverable questions yourself" rule is what turned the issue's *"Step 1 is a spike: flip it and
count"* into the measured table below, which then contradicted three of the issue's own
assumptions) · `riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is
where the preset-superset check got verified rather than assumed) · `tdd` (the linter *is* the
test: phase 0 lands the gate RED at 409 and every later phase is a red→green cluster with a
recorded count) · `riviera-review-overlay` (review gate — due at ready-for-review; RV-FE-E2E owns
the e2e-suite placement question this slice reopens by adding `e2e/tsconfig.json`) ·
`riviera-docs-freshness` (N/A at plan time — **due at merge close-out step 5** over this branch's
merge span; `CLAUDE.md`'s CI paragraph states the frontend job's checks and will need the
type-aware flip recorded) · `riviera-frontend` (STRUCTURE — placed the typed fixture accessor in
`src/testing/` alongside the existing `axe.ts`/`contrast.ts`/`glass-tokens.ts` helpers rather than
in `shared/`, which is app code; also confirmed `e2e/tsconfig.json` sits beside the suite it
scopes) · `riviera-local-debug` (frontend recipe — `npm run lint`, and the Windows note that the
mocked e2e suite is `npm run test:e2e:a11y`, not `test:e2e`) · `angular-developer` + angular-cli
MCP (consulted for the Signal Forms `submit()` idiom; the MCP doc search returned nothing for v22,
so the signature was read from the shipped typings instead — `submit()` returns `Promise<boolean>`,
which is what makes the three production findings real) · `playwright-cli` (due at phase 3 — the
two `route.fulfill` fixes are e2e authoring, and the suite must still pass afterwards)

**Branch:** `feature/eslint-type-aware` — created before phase 0. ✅

---

## Spike results (the measurement this plan is built on)

Run on `main` @ `0bf23b35`, with the flipped config + an `e2e/tsconfig.json` + the
`playwright*.config.ts` carve-out. **This table is the plan's factual foundation; re-measure
before trusting it if `main` has moved.**

| Bucket | Files | Findings | Character |
|---|---|---|---|
| Production `src` (non-spec) | 281 | **9** | Nearly clean; 3 are real bugs |
| `src` specs | — | **389** | 95% of total; two artifact families dominate |
| `e2e` | 52 | **11** | Only reachable after adding a tsconfig; 2 are real bugs |
| `playwright*.config.ts` | 2 | 0 | Carved out (`disableTypeChecked`) |
| **Total** | 351 | **409** | Baseline today: **0** |

**Lint runtime:** 8.7s → 20.3s (2.3×, +11.6s) measured locally.

**Findings by rule:**

| Rule | Count | Where | Auto-fixable |
|---|---|---|---|
| `no-unsafe-member-access` | 94 | specs (89), e2e (5) | no |
| `non-nullable-type-assertion-style` | 76 | specs (74), e2e (2) | **yes** |
| `require-await` | 74 | specs (71), prod (3) | no |
| `no-unsafe-call` | 55 | specs | no |
| `no-unnecessary-type-assertion` | 42 | specs | **yes** |
| `no-unsafe-argument` | 16 | specs | no |
| `no-unsafe-return` | 14 | specs | no |
| `no-unsafe-assignment` | 13 | specs (11), e2e (1), prod (1) | no |
| `unbound-method` | 9 | specs | no |
| `no-misused-promises` | 7 | specs | no |
| `no-floating-promises` | **5** | prod (3), e2e (2) | no |
| `prefer-*` / `prefer-promise-reject-errors` | 4 | mixed | partly |

**The five real bugs** (the issue's value claim, confirmed):

| # | Site | What is wrong |
|---|---|---|
| B-1 | `src/app/booking/booking-dialog.ts:344` | `submit(form, async …)` returns `Promise<boolean>`, unawaited — a rejection vanishes |
| B-2 | `src/app/operator/venue-create-card.ts:60` | same idiom |
| B-3 | `src/app/operator/venue-tab.ts:221` | same idiom |
| B-4 | `e2e/my-bookings.e2e.ts:103` | `route.fulfill({…})` not awaited inside a `page.route` handler — a Playwright race |
| B-5 | `e2e/my-bookings.e2e.ts:158` | same |

---

## Acceptance criteria (testable)

> These ACs are written against the **lint gate** — the application boundary for this slice is the
> `npm run lint` contract, not an Angular surface. There is no runtime behavior change to assert;
> the ACs that protect runtime behavior are AC-6 and AC-7, which pin that the existing suites still
> pass after ~400 mechanical edits.

- [ ] **AC-1:** Given `frontend/eslint.config.js` on this branch, when `npm run lint` runs over the
  full `lintFilePatterns` set, then it exits **0 with zero findings and zero warnings**.
  *Pinned by:* CI job `Frontend (lint + test + build)`, lint step.
- [ ] **AC-2:** Given the flipped config, when the rule set is enumerated, then it is a **strict
  superset** of today's — `recommended`(46)→`recommendedTypeChecked`(73) and
  `stylistic`(37)→`stylisticTypeChecked`(46) with **no rule dropped**.
  *Pinned by:* the Behavior-parity ledger check below (already verified at plan time).
- [ ] **AC-3:** Given a newly written unawaited promise in production code (e.g. dropping the `void`
  from `booking-dialog.ts`), when `npm run lint` runs, then it **fails** with
  `@typescript-eslint/no-floating-promises`. *Pinned by:* manual red-check recorded in phase 6.
- [ ] **AC-4:** Given a newly written unawaited `route.fulfill()` in an `e2e/*.e2e.ts` spec, when
  `npm run lint` runs, then it **fails** — proving the e2e suite is genuinely type-linted and not
  silently skipped by a missing TS project. *Pinned by:* manual red-check recorded in phase 6.
- [ ] **AC-5:** Given `frontend/eslint.config.js`, when the tree is searched for `eslint-disable`,
  then **zero occurrences** exist under `frontend/src` and `frontend/e2e` (the standing culture
  bar), and the only rule-level carve-out in the config is `disableTypeChecked` scoped to
  `playwright*.config.ts`. *Pinned by:* `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty.
- [ ] **AC-6:** Given the ~400 mechanical source edits, when `npm test` runs, then the Vitest suite
  passes with **no change in test count**. *Pinned by:* CI frontend job, test step.
- [ ] **AC-7:** Given the e2e edits, when `npm run test:e2e:a11y` runs, then the mocked Playwright
  suite passes. *Pinned by:* CI frontend job, e2e step.
- [ ] **AC-8:** Given `npm run format:check`, when it runs after every phase, then it reports the
  tree **clean** — the `--fix` sweep must not fight the pinned Prettier (#631/#636).
  *Pinned by:* CI frontend job, Prettier step.

## Non-goals

- **Enabling TypeScript `strict`** — discovered off during the spike (see R-3). Explicitly out of
  scope by decision; recorded as a risk, no follow-up issue filed (user's call, 2026-08-11).
- **Bumping `typescript-eslint` or `eslint`** — 8.64.0 already ships every preset and option this
  plan uses, so no version is changed. `package.json` gains exactly one line (`@types/node` as a
  declared devDependency, phase 0 — see Resolved), and the lockfile one; no bump, minimal overlap
  with open dependabot PRs #337 and #335 (see R-4).
- **Adding new lint rules beyond the two presets** — no à-la-carte rules, no `strictTypeChecked`.
- **Changing the CI workflow, job names, or required-context names** — `Frontend (lint + test +
  build)` stays exactly as-is (the issue is explicit about this).
- **Touching the backend, the three diff-scoped hygiene checks, or the Prettier gate.**
- Refactoring any production logic beyond the minimum each finding requires.

## Behavior-parity ledger

> The slice replaces the two active typescript-eslint presets, so the ledger applies to the **lint
> gate as a surface**. Verified at plan time by enumerating both rule sets programmatically rather
> than trusting the docs.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| 46 `recommended` rules active on `**/*.ts` | **preserved** | `recommendedTypeChecked` is a strict superset — verified: 46 → 73, **0 dropped** |
| 37 `stylistic` rules active on `**/*.ts` | **preserved** | `stylisticTypeChecked` is a strict superset — verified: 37 → 46, **0 dropped** |
| `angular.configs.tsRecommended` + the two selector rules | **preserved** | Untouched in the flipped config |
| `templateRecommended` + `templateAccessibility` on `**/*.html` | **preserved** | The HTML block is untouched; type-aware rules do not apply to templates |
| `processInlineTemplates` processor (inline `template:` literals audited) | **preserved** | Untouched — this is the a11y coverage #632's audit called out as load-bearing |
| `e2e/**/*.ts` linted with syntax-only rules | **changed** | Now type-linted via a new `e2e/tsconfig.json`; strictly more coverage, nothing lost |
| `playwright*.config.ts` linted with syntax-only rules | **preserved** | `disableTypeChecked` restores exactly today's rule set for these 2 files |
| Zero `eslint-disable` in the tree | **preserved** | AC-5 pins it; no suppressions introduced |
| `npm run lint` exits 0 on a clean tree | **preserved** | AC-1 — restored by phase 5, red in between by design |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Lint runtime 2.3× (8.7s → 20.3s) pushes the CI frontend job past its observed-green budget | high | low | Measured: +11.6s absolute on a job that also runs Vitest, a prod build and Playwright — noise-level. Re-check the job duration on the first green CI run and record it here | Ivo | open |
| R-2 | **`no-unnecessary-type-assertion`'s 42 verdicts are computed under a non-strict compiler.** With `strictNullChecks` off, `x as T` where `x: T \| null` reads as unnecessary and the fixer **deletes** it — removing null-safety that a future strict migration would need | med | **med** | Do **not** blind-`--fix` this rule. Phase 1 applies the fixer for `non-nullable-type-assertion-style` + `prefer-*` only; the 42 `no-unnecessary-type-assertion` sites are reviewed by hand in phase 1b, and any assertion that is only "unnecessary" because strict is off is **kept** by rewriting to `!` rather than deleted | Ivo | open |
| R-3 | **TypeScript `strict` is off** — `strict`, `strictNullChecks`, `noImplicitAny` all unset in `frontend/tsconfig.json` (confirmed via `tsc --showConfig`). This contradicts `frontend/.claude/CLAUDE.md`'s "Use strict type checking", and is the root cause of the unsafe-`any` volume | certain | med | **Accepted, not fixed** — out of scope by explicit decision (2026-08-11). Recorded here so the next session finds it rather than rediscovering it. Enabling strict later would *reduce* the unsafe-`any` surface, not grow it | Ivo | accepted — noted, no issue filed |
| R-4 | Dependabot PRs **#337** (typescript-eslint 8.64→8.66) and **#335** (eslint 10.7→10.8) touch `frontend/package.json` + lockfile | med | low | Reduced but not eliminated in phase 0: this slice now adds one `devDependencies` line (`@types/node`) and one lockfile line, in a different part of the file from either bump. Whoever merges second takes a trivial merge-from-main; no version is contested | Ivo | open |
| R-5 | A new `frontend/e2e/tsconfig.json` changes how Playwright's own transpiler resolves the suite | low | med | Playwright reads tsconfig for `paths` mapping; this file declares none and only sets `include`/`outDir`/`types: []`. AC-7 (the mocked suite must still pass) is the proof, and it runs in CI on every push | Ivo | open |
| R-6 | ~400 mechanical edits across ~110 files silently change test semantics (e.g. an `await` added to a mock that changes timing, a removed assertion that was load-bearing) | med | high | Every phase ends with the **full Vitest suite**, not a scoped run — this slice's blast radius *is* the suite. AC-6 pins "no change in test count". The e2e legs are pinned by AC-7 | Ivo | open |
| R-7 | The `require-await` fixes (74) tempt a mechanical `async` removal that breaks an interface contract — e.g. `FakeStripePaymentGateway.mountPaymentElement` **overrides** an abstract `Promise`-returning method | med | med | Fix by returning `Promise.resolve(…)` / keeping the declared return type, **never** by narrowing an override's signature. `npm run build` (prod build, AC-6's neighbour) catches a broken override | Ivo | open |
| R-8 | Landing ~110 changed files beside an in-flight feature branch causes painful conflicts (the issue's own timing caution, inherited from #631) | low | med | Working tree was clean at branch time and the only open PRs are dependabot bumps (verified 2026-08-11). Land promptly rather than letting the branch age | Ivo | open |

## Open questions / Assumptions

- **Assumption:** The 285 `nativeElement` occurrences across 94 spec files are mechanically
  convertible to a single typed accessor without changing any assertion's meaning. — *Owner:* Ivo ·
  *Resolves by:* phase 4, spot-checked against the Vitest suite staying green.

### Resolved

- **Assumption:** `npm run lint` (the `@angular-eslint/builder:lint` builder) honours
  `parserOptions.projectService` identically to the bare `npx eslint` used in the spike.
  — **Resolved in phase 0 (`<sha>`): confirmed, 409 both ways, zero parse errors.**
- **Open question (raised and settled in phase 0):** what `types` should `e2e/tsconfig.json`
  declare? The plan said `types: []` on the strength of a grep for `process.`/`__dirname` that
  found nothing in `e2e/`. That grep was too narrow: three photo specs
  (`admin-venue-photos`, `discover-photos`, `operator-venue-photos`) call
  `Buffer.from(…, 'base64')` to mint mocked image bytes, and with no Node types those read as
  *unresolved* — which showed up as **12 extra findings (421, not 409)** on the first builder run.
  **Resolved: `types: ["node"]`, plus `@types/node` promoted to a declared devDependency.** It was
  already installed transitively and would have "worked" undeclared, which is precisely the
  fragility worth closing — a dependency-tree change could silently drop it and either resurrect
  the 12 findings or, worse, let `Buffer` sit as `any`. The lockfile delta is one line, and
  `tsconfig.app.json` (`types: []`) and `tsconfig.spec.json` (`types: ["vitest/globals"]`) both
  pin their own `types`, so nothing leaks into the app or unit-test builds.
- **Open question:** Should the 389 spec findings be suppressed with a narrow, rule-scoped
  relaxation for `**/*.spec.ts` (the option #632's own text floats), or fixed at the source?
  — **Resolved 2026-08-11 (Ivo): fixed at the source, zero relaxations.** The finding count alone
  argued for a relaxation, but the *character* of the findings argues against: they are one typing
  defect (`ComponentFixture.nativeElement: any`) reflected ~186 times, and a config relaxation would
  permanently blind the specs to genuine unsafe-`any` rather than fix the accessor once.
- **Open question:** Does this slice need a `typescript-eslint` version bump? — **Resolved: no.**
  8.64.0 (already pinned) ships `recommendedTypeChecked`, `stylisticTypeChecked`,
  `disableTypeChecked` and `projectService.allowDefaultProject`; all four were exercised in the
  spike against the installed version.
- **Open question:** How do `playwright*.config.ts` get type information, given they sit in no TS
  project? — **Resolved: they don't, and shouldn't.** `projectService.allowDefaultProject` was
  measured and made things *worse* (19 unsafe-`any` findings from an untyped `process.env`, since
  the inferred project loads no `@types/node`, which is not even a declared devDependency).
  `disableTypeChecked` scoped to those two files is the answer — it restores exactly today's rules
  for build tooling. Measured: 428 → 409, those 2 files clean.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice changes lint configuration and applies mechanical
source edits; it writes no `availability(set_id, booking_date)` row, touches no booking path, and
adds no runtime code. The three production fixes (B-1..B-3) add a `void` operator to an existing
call and change no control flow.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend Java, no module boundary, no event, no `api/`/`spi/` port.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Note `src/app/booking/stripe-payment.gateway.ts` appears in the diff
(two `require-await` findings on `FakeStripePaymentGateway`), but the change is limited to how the
**test-only fake** declares its async signatures; no charge, refund, commission, or ledger logic is
touched, and the real `StripeJsPaymentGateway` behavior is unchanged. R-7 guards the override
contract.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/testing/fixture-dom.ts` | **new** | test helper (not a component) | none — pure accessor | none |
| FE-2 | `src/app/booking/booking-dialog.ts` | existing | standalone component | unchanged | Signal Forms — `void submit(…)` |
| FE-3 | `src/app/operator/venue-create-card.ts` | existing | standalone component | unchanged | Signal Forms — `void submit(…)` |
| FE-4 | `src/app/operator/venue-tab.ts` | existing | standalone component | unchanged | Signal Forms — `void submit(…)` |
| FE-5 | `src/app/booking/stripe-payment.gateway.ts` | existing | DI-token adapter (fake) | unchanged | none |
| FE-6 | `src/app/operator/camera-qr-scanner.ts`, `fake-qr-scanner.ts` | existing | service/adapter | unchanged | none |
| FE-7 | `src/app/shared/focus-after-render.ts` | existing | pure helper | unchanged | none |
| FE-8 | `src/app/pages/home/home.ts` | existing | standalone component | unchanged | none |
| FE-9 | ~94 `**/*.spec.ts` + 3 `e2e/*.e2e.ts` | existing | specs | — | — |

**Standards:** no new component is created; every edit preserves the existing standalone/signals/
`inject()` shape. The one new file (FE-1) is a test helper, placed in `src/testing/` per
`riviera-frontend` — beside `axe.ts`, `contrast.ts`, `fake-storage.ts`, `glass-tokens.ts` — and
**not** in `shared/`, which is app code shipped to users.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or wire shape is touched. (Worth noting the slice
*strengthens* the "never `as any` on the contract" convention from a review-checked rule into a
machine-checked one, which is #632's third stated motivation.)

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `implement — phase 0 done (gate is RED at 409, by design); phase 1 next`

**Next action:** Phase 1 — apply `eslint --fix` for the **safe** rules only
(`non-nullable-type-assertion-style`, `prefer-includes`, `prefer-string-starts-ends-with`),
explicitly **not** `no-unnecessary-type-assertion` (R-2). Then `npm run format`, then `npm test`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Flip the gate (RED at 409) | ✅ | `<sha>` |
| 1 — Safe auto-fix sweep (~78) | | |
| 1b — `no-unnecessary-type-assertion` by hand (42) | | |
| 2 — Production source (9, incl. B-1..B-3) | | |
| 3 — e2e (11, incl. B-4/B-5) | | |
| 4 — Spec unsafe-`any` family via typed accessor (~186) | | |
| 5 — Spec `require-await` + `unbound-method` + `no-misused-promises` (87) | | |
| 6 — Green: AC red-checks, docs, close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/eslint.config.js` — the flip: type-checked presets, `projectService`,
  `tsconfigRootDir`, and the `playwright*.config.ts` `disableTypeChecked` block.
- `frontend/e2e/tsconfig.json` — **new**; brings the 52 mocked-suite specs into a TS project so
  type-aware rules reach them. `types: ["node"]` — three photo specs use `Buffer.from` (phase 0).
- `frontend/package.json` — one line: `@types/node` promoted from transitive to declared.
- `frontend/package-lock.json` — the corresponding one-line entry.
- `frontend/src/testing/fixture-dom.ts` — **new**; the typed `ComponentFixture` DOM accessor that
  removes the ~186 unsafe-`any` findings at their source.
- `frontend/src/app/**/*.spec.ts` — ~94 spec files: adopt the accessor, fix `require-await`,
  `unbound-method`, `no-misused-promises`, and the mechanical assertion nits.
- `frontend/src/app/booking/booking-dialog.ts` — B-1, `void submit(…)`.
- `frontend/src/app/operator/venue-create-card.ts` — B-2, `void submit(…)`.
- `frontend/src/app/operator/venue-tab.ts` — B-3, `void submit(…)`.
- `frontend/src/app/booking/stripe-payment.gateway.ts` — two `require-await` on the fake gateway.
- `frontend/src/app/operator/camera-qr-scanner.ts` — `prefer-promise-reject-errors`.
- `frontend/src/app/operator/fake-qr-scanner.ts` — `require-await`.
- `frontend/src/app/pages/home/home.ts` — `prefer-optional-chain`.
- `frontend/src/app/shared/focus-after-render.ts` — `no-unsafe-assignment` (`ElementRef<any>`).
- `frontend/e2e/my-bookings.e2e.ts` — **B-4/B-5**, the two unawaited `route.fulfill()` calls.
- `frontend/e2e/booking-flow.e2e.ts` — two assertion-style nits.
- `frontend/e2e/customer-password.e2e.ts` — `prefer-string-starts-ends-with`.
- `frontend/e2e/operator-venue.e2e.ts` — 6 unsafe-`any` on an untyped request-body read.
- `docs/plans/eslint-type-aware-linting.md` — this plan doc.
- `CLAUDE.md` — CI paragraph: record that the frontend lint gate is now type-aware (phase 6,
  pending the `riviera-docs-freshness` run).

> Reconcile this section against the diff with
> `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing.

---

## Phase 0 — Flip the gate (RED)

**Files:** Modify `frontend/eslint.config.js` · Create `frontend/e2e/tsconfig.json`

The TDD shape of this slice: **the linter is the test.** This phase writes the failing test.

- [ ] **Step 1: Flip the config** — replace `tseslint.configs.recommended`/`stylistic` with
  `recommendedTypeChecked`/`stylisticTypeChecked`, add
  `languageOptions.parserOptions = { projectService: true, tsconfigRootDir: __dirname }`, and
  append the carve-out block:

```js
  {
    files: ['playwright*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
```

- [ ] **Step 2: Add `frontend/e2e/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "../out-tsc/e2e",
    "types": []
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Run it, verify it fails** — `cd frontend && npm run lint` → FAIL with **409
  problems**. If the count differs from 409, `main` has moved: re-measure and update the spike
  table before continuing (do not proceed on a stale baseline).
- [ ] **Step 4: Confirm zero parse errors** — no `was not found by the project service` message may
  remain. That message means a file is outside every TS project and is being *skipped*, not
  checked — the exact failure mode this phase exists to close.
- [ ] **Step 5: Commit** — `git commit -m "Flip the frontend ESLint config to the type-aware presets (#632)"`
  Push as an explicit **red-TDD** push; the PR body must say the lint gate is red at 409 by design.
- [ ] **Step 6: Open the draft PR** — CI fires on the `pull_request` event only, so the draft is
  what makes every later push gated (`riviera-sdlc` rule 3).
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Safe auto-fix sweep

**Files:** Modify `frontend/src/**/*.spec.ts` · `frontend/e2e/*.e2e.ts`

- [ ] **Step 1: Apply the fixer for the safe rules only** — `non-nullable-type-assertion-style`,
  `prefer-includes`, `prefer-string-starts-ends-with`. **Not** `no-unnecessary-type-assertion` (R-2).
- [ ] **Step 2: Run Prettier** — `npm run format` (the fixer's output is not Prettier-shaped; AC-8).
- [ ] **Step 3: Verify** — `npm run lint` count drops by ~78; `npm test` green (R-6).
- [ ] **Step 4: Commit + update execution status.**

## Phase 1b — `no-unnecessary-type-assertion` by hand

**Files:** Modify the 42 flagged sites.

- [ ] **Step 1: Review each site against R-2** — for each, ask *"is this assertion unnecessary only
  because `strictNullChecks` is off?"* If yes, rewrite to `!` (which stays correct under strict);
  if genuinely redundant, delete it.
- [ ] **Step 2: Verify** — `npm run lint` (42 fewer), `npm test` green, `npm run build` green.
- [ ] **Step 3: Commit + update execution status.**

## Phase 2 — Production source (9 findings)

**Files:** the eight production files in the File-structure section.

- [ ] **Step 1: B-1..B-3** — `void submit(this.<form>, async () => {…})`. `submit()` returns
  `Promise<boolean>` (read from `@angular/forms/types/_structure-chunk.d.ts:2092`), so `void` is
  the correct marker in a `void`-returning handler; do **not** make the handler `async`, since it
  is a template event handler.
- [ ] **Step 2: `require-await` ×3** — per R-7, preserve each declared `Promise<…>` return type and
  the `override` contract; return `Promise.resolve(…)` rather than dropping `async` from a signature
  that an abstract base declares.
- [ ] **Step 3: the remaining 3** — `prefer-promise-reject-errors` (reject with an `Error`),
  `prefer-optional-chain`, `no-unsafe-assignment` (`ElementRef<any>` → a typed read).
- [ ] **Step 4: Verify** — `npm run lint` (9 fewer), `npm test`, `npm run build` all green.
- [ ] **Step 5: Generalization-audit pass** — the `submit(form, async …)` idiom is a **pattern**:
  search every call site, not just the 3 flagged, and record the result in the log below.
- [ ] **Step 6: Commit + update execution status.**

## Phase 3 — e2e (11 findings, incl. the two real bugs)

**Files:** `frontend/e2e/my-bookings.e2e.ts`, `booking-flow.e2e.ts`, `customer-password.e2e.ts`,
`operator-venue.e2e.ts`

- [ ] **Step 1: Load `playwright-cli`** (routing gate — this phase authors e2e code).
- [ ] **Step 2: B-4/B-5** — `await route.fulfill({…})` inside the `page.route` handlers, making
  each handler `async`. This is a real race fix, not a lint appeasement.
- [ ] **Step 3: `operator-venue.e2e.ts`** — type the request-body read instead of letting it be `any`.
- [ ] **Step 4: Verify** — `npm run lint` (11 fewer) and **`npm run test:e2e:a11y`** green (the
  mocked suite; on Windows this is the correct script, not `test:e2e` — `riviera-local-debug`).
- [ ] **Step 5: Generalization-audit pass** — search every `page.route(` handler in both suites for
  the same unawaited-`fulfill` shape; the linter only sees the 2, but the pattern may sit in
  `e2e/real-backend/` or `e2e/support/` too.
- [ ] **Step 6: Commit + update execution status.**

## Phase 4 — Spec unsafe-`any` family via a typed accessor (~186 findings)

**Files:** Create `frontend/src/testing/fixture-dom.ts` · Modify ~94 spec files

The root cause: Angular types `ComponentFixture.nativeElement` as `any`, so every
`fixture.nativeElement.querySelector(…)` is an unsafe member access on `any`.

- [ ] **Step 1: Write the accessor** — a small typed helper in `src/testing/` returning
  `HTMLElement`, so call sites keep reading naturally. Exact shape decided at implementation time
  against the real call-site distribution (285 occurrences across 94 files); it must not require
  rewriting every assertion, only the `nativeElement` hop.
- [ ] **Step 2: Thread it through the flagged specs**, file by file, running `npm test` per batch
  rather than once at the end (R-6 — this is the phase most likely to change test semantics).
- [ ] **Step 3: Verify** — `npm run lint` (~186 fewer), `npm test` green with **no change in test
  count** (AC-6), `npm run format:check` clean.
- [ ] **Step 4: Commit + update execution status.**

## Phase 5 — Spec `require-await`, `unbound-method`, `no-misused-promises` (87 findings)

**Files:** the remaining flagged spec files.

- [ ] **Step 1: `require-await` ×71** — these are mock implementations of async ports; apply R-7's
  rule (preserve the declared `Promise` return type).
- [ ] **Step 2: `unbound-method` ×9 and `no-misused-promises` ×7** — the latter are
  `admin-*.spec.ts` sites passing an async callback where `void` is expected; check each for a
  genuinely swallowed assertion before mechanically fixing.
- [ ] **Step 3: Verify** — `npm run lint` → **0 findings** (AC-1); `npm test` green.
- [ ] **Step 4: Commit + update execution status.**

## Phase 6 — Green: AC red-checks, docs, close-out

- [ ] **Step 1: AC-3 red-check** — temporarily drop a `void` in `booking-dialog.ts`, confirm
  `npm run lint` fails with `no-floating-promises`, revert. Record the output in this doc.
- [ ] **Step 2: AC-4 red-check** — temporarily drop an `await` on a `route.fulfill()`, confirm the
  lint fails, revert. This is the proof the e2e tsconfig actually took effect.
- [ ] **Step 3: AC-5** — `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty.
- [ ] **Step 4: Reconcile the File-structure section** —
  `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [ ] **Step 5: Record the CI frontend-job duration** against R-1.
- [ ] **Step 6: `riviera-docs-freshness`** over the branch's merge span; patch `CLAUDE.md`'s CI
  paragraph to state the frontend lint gate is type-aware.
- [ ] **Step 7: Mark the PR ready for review** — this is what makes the Review and Sonar gates due.
- [ ] **Step 8: Finalize the Execution status in this PR's last commit**, citing `merged via PR #NN`
  (never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `cd frontend && npm run lint` → exit 0, zero problems. Verified at commit `<sha>`.
- [ ] **AC-2:** Verified at plan time — `recommended` 46→73, `stylistic` 37→46, 0 rules dropped.
- [ ] **AC-3:** Run the phase-6 step-1 red-check → lint FAILS with `no-floating-promises`. Verified at `<sha>`.
- [ ] **AC-4:** Run the phase-6 step-2 red-check → lint FAILS on the e2e file. Verified at `<sha>`.
- [ ] **AC-5:** Run `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty. Verified at `<sha>`.
- [ ] **AC-6:** Run `cd frontend && npm test` → green, test count unchanged. Verified at `<sha>`.
- [ ] **AC-7:** Run `cd frontend && npm run test:e2e:a11y` → green. Verified at `<sha>`.
- [ ] **AC-8:** Run `cd frontend && npm run format:check` → clean. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled (justified N/A); invariant #2 untouched.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section filled (justified N/A); invariant #11 untouched.
- [ ] **Payment/payout** section filled (justified N/A) — invariants #5, #8, #9 untouched; R-7 guards the fake gateway's override contract.
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met; the new helper is placed per `riviera-frontend`; no `as any` introduced.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
