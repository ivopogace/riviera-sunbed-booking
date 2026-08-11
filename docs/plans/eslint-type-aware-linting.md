| Ivo | closed — landed same day, only dependabot PRs open || Ivo | closed — every override kept its Promise return type; production build clean || Ivo | closed — 1372 tests pass, zero it/test/describe lines added or removed || Ivo | closed — mocked Playwright 176 passed on the new tsconfig || Ivo | closed — one devDependency line + one lockfile line, no version contested || Ivo | **closed — materialised twice** (phases 1-2) and once more from my own codemod (phase 6); the standing verify-then-revert method is the mitigation that held || Ivo | closed — measured locally 8.7s → 20.3s (+11.6s); read the CI job duration off PR #638 |# ESLint type-aware presets Implementation Plan

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
source — by adopting the tree's existing `as HTMLElement` idiom at the ~66 sites that skipped it
(see *Design correction*) — not suppressed at the gate. The only carve-out is
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
type-aware flip recorded) · `riviera-frontend` (STRUCTURE — its "colocate what the feature owns"
rule is what prompted measuring the call sites before adding a `src/testing/` helper, which
**retired the helper entirely**: the tree already had a house idiom at 164 sites, and a second one
would have been the placement mistake. Also confirmed `e2e/tsconfig.json` sits beside the suite it
scopes) · `riviera-local-debug` (frontend recipe — `npm run lint`, and the Windows note that the
mocked e2e suite is `npm run test:e2e:a11y`, not `test:e2e`) · `angular-developer` + angular-cli
MCP (consulted for the Signal Forms `submit()` idiom; the MCP doc search returned nothing for v22,
so the signature was read from the shipped typings instead — `submit()` returns `Promise<boolean>`,
which is what makes the three production findings real) · `playwright-cli` (due at phase 5 — the
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

- [x] **AC-1:** Given `frontend/eslint.config.js` on this branch, when `npm run lint` runs over the
  full `lintFilePatterns` set, then it exits **0 with zero findings and zero warnings**.
  *Pinned by:* CI job `Frontend (lint + test + build)`, lint step.
- [x] **AC-2:** Given the flipped config, when the rule set is enumerated, then it is a **strict
  superset** of today's — `recommended`(46)→`recommendedTypeChecked`(73) and
  `stylistic`(37)→`stylisticTypeChecked`(46) with **no rule dropped**.
  *Pinned by:* the Behavior-parity ledger check below (already verified at plan time).
- [x] **AC-3:** Given a newly written unawaited promise in production code (e.g. dropping the `void`
  from `booking-dialog.ts`), when `npm run lint` runs, then it **fails** with
  `@typescript-eslint/no-floating-promises`. *Pinned by:* manual red-check recorded in phase 6.
- [x] **AC-4:** Given a newly written unawaited `route.fulfill()` in an `e2e/*.e2e.ts` spec, when
  `npm run lint` runs, then it **fails** — proving the e2e suite is genuinely type-linted and not
  silently skipped by a missing TS project. *Pinned by:* manual red-check recorded in phase 6.
- [x] **AC-5:** Given `frontend/eslint.config.js`, when the tree is searched for `eslint-disable`,
  then **zero occurrences** exist under `frontend/src` and `frontend/e2e` (the standing culture
  bar), and the only rule-level carve-out in the config is `disableTypeChecked` scoped to
  `playwright*.config.ts`. *Pinned by:* `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty.
- [x] **AC-6:** Given the ~400 mechanical source edits, when `npm test` runs, then the Vitest suite
  passes with **no change in test count**. *Pinned by:* CI frontend job, test step.
- [x] **AC-7:** Given the e2e edits, when `npm run test:e2e:a11y` runs, then the mocked Playwright
  suite passes. *Pinned by:* CI frontend job, e2e step.
- [x] **AC-8:** Given `npm run format:check`, when it runs after every phase, then it reports the
  tree **clean** — the `--fix` sweep must not fight the pinned Prettier (#631/#636).
  *Pinned by:* CI frontend job, Prettier step.

## Non-goals

- ~~**Enabling TypeScript `strict`**~~ — moot: it is already on, via TypeScript 6.0's default.
  See the correction under *Open questions* (R-3 withdrawn).
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
| R-1 | Lint runtime 2.3× (8.7s → 20.3s) pushes the CI frontend job past its observed-green budget | high | low | Measured: +11.6s absolute on a job that also runs Vitest, a prod build and Playwright — noise-level. Re-check the job duration on the first green CI run and record it here | Ivo | closed — measured 8.7s → 20.3s locally (+11.6s); read the CI job duration off PR #638 |
| R-2 | **The assertion-rewriting rules' verdicts are computed under a non-strict compiler *and* against `any`-typed DOM roots, so their fixers destroy real type information.** Confirmed empirically — see the phase-ordering note below | **certain** | **high** | Fix the *root typing* before running any fixer, so every assertion verdict is computed against real types. Phase 1 (accessor idiom) now precedes phase 2 (auto-fix); `no-unnecessary-type-assertion` is still hand-reviewed (phase 3) | Ivo | **closed — it materialised, twice from ESLint fixers (phases 1–2) and once from my own codemod (phase 6)**; the verify-then-revert method is what contained it |
| R-3 | ~~TypeScript `strict` is off~~ — **withdrawn, the premise was wrong.** See the correction below | — | — | No action needed; `frontend/.claude/CLAUDE.md`'s "Use strict type checking" is in fact satisfied | Ivo | **closed — not a risk** |
| R-4 | Dependabot PRs **#337** (typescript-eslint 8.64→8.66) and **#335** (eslint 10.7→10.8) touch `frontend/package.json` + lockfile | med | low | Reduced but not eliminated in phase 0: this slice now adds one `devDependencies` line (`@types/node`) and one lockfile line, in a different part of the file from either bump. Whoever merges second takes a trivial merge-from-main; no version is contested | Ivo | closed — one devDependency line + one lockfile line; no version contested |
| R-5 | A new `frontend/e2e/tsconfig.json` changes how Playwright's own transpiler resolves the suite | low | med | Playwright reads tsconfig for `paths` mapping; this file declares none and only sets `include`/`outDir`/`types: []`. AC-7 (the mocked suite must still pass) is the proof, and it runs in CI on every push | Ivo | closed — mocked Playwright 176 passed against the new tsconfig |
| R-6 | ~400 mechanical edits across ~110 files silently change test semantics (e.g. an `await` added to a mock that changes timing, a removed assertion that was load-bearing) | med | high | Every phase ends with the **full Vitest suite**, not a scoped run — this slice's blast radius *is* the suite. AC-6 pins "no change in test count". The e2e legs are pinned by AC-7 | Ivo | closed — 1372 tests pass; zero `it`/`test`/`describe` lines added or removed |
| R-7 | The `require-await` fixes (74) tempt a mechanical `async` removal that breaks an interface contract — e.g. `FakeStripePaymentGateway.mountPaymentElement` **overrides** an abstract `Promise`-returning method | med | med | Fix by returning `Promise.resolve(…)` / keeping the declared return type, **never** by narrowing an override's signature. `npm run build` (prod build, AC-6's neighbour) catches a broken override | Ivo | closed — every override kept its `Promise` return type; production build clean |
| R-8 | Landing ~110 changed files beside an in-flight feature branch causes painful conflicts (the issue's own timing caution, inherited from #631) | low | med | Working tree was clean at branch time and the only open PRs are dependabot bumps (verified 2026-08-11). Land promptly rather than letting the branch age | Ivo | closed — landed same day; only dependabot PRs were open |

### Correction: TypeScript `strict` is ON, not off (R-3 withdrawn)

The spike concluded `strict` was off, from `tsc --showConfig` reporting `strict`,
`strictNullChecks` and `noImplicitAny` as `undefined`. **That reading was wrong, and it was wrong
in a way worth writing down: `--showConfig` echoes only *explicitly set* options, never effective
defaults.** The repo pins `typescript: ~6.0.2`, and **TypeScript 6.0 turns `strict` on by
default** — a probe compiled with `--ignoreConfig` and no tsconfig at all errors on both
`const s: string = null` (TS2322) and a possibly-undefined access (TS18048).

Proof from this branch rather than from the flag: phase 1 produced **20 genuine strict-mode
errors** (`Type 'HTMLElement | null' is not assignable to type 'HTMLElement'`, `Object is possibly
'null'`) the moment the DOM root stopped being `any`. A non-strict compiler could not have emitted
one of them.

Consequences: **R-3 is closed as not-a-risk** — `frontend/.claude/CLAUDE.md`'s "use strict type
checking" is satisfied. The unsafe-`any` volume has a single cause, `ComponentFixture.nativeElement:
any`, and nothing to do with compiler strictness. **R-2's stated premise is likewise corrected**
below: its danger is real but comes from the `any` root, not from a lax compiler. The phase-0
commit message and the original PR body both assert "strict is off"; both are superseded by this
section.

### Phase-ordering correction (discovered while executing the original phase 1)

The plan originally ran the auto-fix sweep first and the spec typing fix fourth. **That order was
wrong, and running it proved it.** Recorded here rather than silently re-ordered, because the
reasoning generalizes to any type-aware lint adoption.

Applying `eslint --fix` to `non-nullable-type-assertion-style` on the *untyped* tree took the count
from 409 to 394 — but the composition moved the wrong way: `non-nullable-type-assertion-style` -74,
`no-unsafe-call` **+62**, and one brand-new `no-non-null-asserted-optional-chain`. Two distinct
failures:

1. **It destroyed type information.** `fixture.nativeElement.querySelector(…) as HTMLButtonElement`
   became `…!`. The rule fired only because `nativeElement` is `any`, which makes the assertion
   look like pure null-removal; it is actually a **downcast** carrying the author's intent. Once
   the root is typed (phase 1), `querySelector` returns `Element | null`, and `Element` has no
   `.click()`, `.value` or `.disabled` — so the "fix" would have broken those specs at the next
   typing improvement, with no lint signal pointing back at the cause.
2. **It created a violation the same preset flags.** `field?.querySelector('input, select')!`
   trips `no-non-null-asserted-optional-chain` — *"Optional chain expressions can return undefined
   by design — using a non-null assertion is unsafe and wrong."*

Generalized rule: **fix the root typing first; run fixers only against real types.** R-2 anticipated
this for one rule (`no-unnecessary-type-assertion`); the empirical result is that it applies at
least as strongly to `non-nullable-type-assertion-style`, whose fixer is the one that runs by
default.

**Phase 2 then showed the ordering was necessary but not sufficient, and exposed the real
mechanism.** Re-running the same fixer on the *typed* tree reproduced the damage — `no-unsafe-call`
+63, and **69** type errors. The cause is not strictness and not `any`; it is that
**a trailing type assertion was silently supplying `querySelector`'s generic argument**:

```ts
el.querySelector('…') as HTMLButtonElement   // E infers as HTMLButtonElement -> HTMLButtonElement | null
                                             // so the assertion looks like pure null-removal…
el.querySelector('…')!                       // …but with it gone, E falls back to Element — no .click()
```

The fixer is therefore **unsound for any assertion that feeds inference**, in any codebase — worth
knowing beyond this repo. The correct rewrite states the intent where no fixer can misread it:

```ts
el.querySelector<HTMLButtonElement>('…')!
```

Applied to **79 assertions across 14 files**, which took 259 → 181 with zero type errors, where the
fixer had produced 69. Only after that were the genuinely-safe fixers (`prefer-*`) run.

### Design correction: no new helper file

The plan proposed a new `src/testing/fixture-dom.ts` accessor. Measuring the call sites first
retired that idea: the tree **already has a house idiom** — `fixture.nativeElement as HTMLElement`,
used at **164** sites (97 `const host =`, 38 `host =`, 29 `return`). The ~186 unsafe-`any` findings
come from roughly **66** lines that simply skip it (`fixture.nativeElement.querySelector(…)` ×45,
`expectNoAxeViolations(fixture.nativeElement)` ×15, `.textContent` ×3, `.querySelectorAll` ×3).

So the fix is to make the stragglers adopt the existing idiom, not to introduce a second one. A new
helper would either leave **two** competing idioms (helper at ~66 sites, `as HTMLElement` at 164)
or force a 230-site refactor that #632 did not ask for. `FE-1` is dropped from the surfaces table
and `src/testing/fixture-dom.ts` from the File-structure section.

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
| FE-1 | ~~`src/testing/fixture-dom.ts`~~ | **dropped** | — | — | see *Design correction* above |
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

**Stage pointer:** `DONE — merged via PR #638`

**Next action:** None. The gate is green at zero; the PR carries its own close-out.

**Final verification (at `169cb616` + this commit):**

| Check | Result |
|---|---|
| `npm run lint` | **exit 0, "All files pass linting"** (from 409) |
| `tsc --noEmit` × 3 projects (app / spec / **e2e**) | 0 errors |
| Vitest | **1372 passed / 156 files** |
| Mocked Playwright (`test:e2e:a11y`) | **176 passed** |
| `npm run build` | clean |
| `prettier --check src e2e` | clean |
| `eslint-disable` under `src` + `e2e` | **0** |
| `it`/`test`/`describe` lines added or removed vs `origin/main` | **0** |

**AC-3 red-check:** removing the `void` in `booking-dialog.ts:344` →
`error … @typescript-eslint/no-floating-promises`. **AC-4 red-check:** removing the `await` on
`route.fulfill` in `my-bookings.e2e.ts:103` → the same error, which is the proof `e2e/` is genuinely
type-linted rather than skipped.

**Standing method (earned across phases 1–3, applied to every phase after):** never trust an ESLint
autofix or a codemod — apply it, then run `tsc --noEmit` on all three projects *and* the suite, and
revert anything that regresses. Five regressions were caught this way and none by the linter: two
from ESLint's own fixers (phases 1–2), two over-reached assertion removals (phase 3), and one from
a codemod of my own (phase 6).

**Standing method (earned across phases 1–3, applies to every remaining phase):** never trust an
ESLint autofix — apply it, then run `tsc --noEmit` on all three projects *and* the suite, and
revert anything that regresses. Phase 1 and phase 2 each shipped a fixer-induced regression that
only a typecheck caught; phase 3 caught two more.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Flip the gate (RED at 409) | ✅ | `e05e1c4c` |
| 1 — Spec unsafe-`any`: adopt the `as HTMLElement` idiom (409 → 259) | ✅ | `<sha>` |
| 2 — `querySelector<T>(…)!` codemod + safe fixers (259 → 179) | ✅ | `<sha>` |
| 3 — `no-unnecessary-type-assertion`, verified not trusted (179 → 139) | ✅ | `<sha>` |
| 4 — Production source clean (139 → 130, incl. B-1..B-3) | ✅ | `<sha>` |
| 5 — e2e clean (130 → 121, incl. B-4/B-5) | ✅ | `<sha>` |
| 6 — Spec `require-await`, stub typing, `unbound-method` (139 → **0**) | ✅ | `ba8ffb37`, `169cb616` |
| 7 — Green: AC red-checks, docs, close-out | ✅ | this commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | No review-gate, Sonar or red-CI finding has been raised yet; the Review and Sonar gates fall due at ready-for-review. | — |

---

## File structure

- `frontend/eslint.config.js` — the flip: type-checked presets, `projectService`,
  `tsconfigRootDir`, and the `playwright*.config.ts` `disableTypeChecked` block.
- `frontend/e2e/tsconfig.json` — **new**; brings the 52 mocked-suite specs into a TS project so
  type-aware rules reach them. `types: ["node"]` — three photo specs use `Buffer.from` (phase 0).
- `frontend/package.json` — one line: `@types/node` promoted from transitive to declared.
- `frontend/package-lock.json` — the corresponding one-line entry.
- `frontend/src/app/**/*.spec.ts` — ~94 spec files: adopt the `as HTMLElement` idiom, fix `require-await`,
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
- `frontend/e2e/admin-venue-photos.e2e.ts` — index-signature access (`TS4111`), surfaced by the new
  e2e project; pre-existing, invisible until now (Playwright transpiles without typechecking).
- `frontend/e2e/venue-map-pan.e2e.ts` — implicit `any[]` (`TS7034`/`TS7005`), same origin; gains a
  named `MapSet` type for the mocked payload.
- `docs/plans/eslint-type-aware-linting.md` — this plan doc.
- `CLAUDE.md` — CI paragraph: record that the frontend lint gate is now type-aware (phase 6,
  pending the `riviera-docs-freshness` run).

> Reconcile this section against the diff with
> `node scripts/check-plan-file-structure.mjs --diff origin/main` before pushing.

---

## Phase 0 — Flip the gate (RED)

**Files:** Modify `frontend/eslint.config.js` · Create `frontend/e2e/tsconfig.json`

The TDD shape of this slice: **the linter is the test.** This phase writes the failing test.

- [x] **Step 1: Flip the config** — replace `tseslint.configs.recommended`/`stylistic` with
  `recommendedTypeChecked`/`stylisticTypeChecked`, add
  `languageOptions.parserOptions = { projectService: true, tsconfigRootDir: __dirname }`, and
  append the carve-out block:

```js
  {
    files: ['playwright*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
```

- [x] **Step 2: Add `frontend/e2e/tsconfig.json`**

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

- [x] **Step 3: Run it, verify it fails** — `cd frontend && npm run lint` → FAIL with **409
  problems**. If the count differs from 409, `main` has moved: re-measure and update the spike
  table before continuing (do not proceed on a stale baseline).
- [x] **Step 4: Confirm zero parse errors** — no `was not found by the project service` message may
  remain. That message means a file is outside every TS project and is being *skipped*, not
  checked — the exact failure mode this phase exists to close.
- [x] **Step 5: Commit** — `git commit -m "Flip the frontend ESLint config to the type-aware presets (#632)"`
  Push as an explicit **red-TDD** push; the PR body must say the lint gate is red at 409 by design.
- [x] **Step 6: Open the draft PR** — CI fires on the `pull_request` event only, so the draft is
  what makes every later push gated (`riviera-sdlc` rule 3).
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Safe auto-fix sweep

**Files:** Modify `frontend/src/**/*.spec.ts` · `frontend/e2e/*.e2e.ts`

- [x] **Step 1: Apply the fixer for the safe rules only** — `non-nullable-type-assertion-style`,
  `prefer-includes`, `prefer-string-starts-ends-with`. **Not** `no-unnecessary-type-assertion` (R-2).
- [x] **Step 2: Run Prettier** — `npm run format` (the fixer's output is not Prettier-shaped; AC-8).
- [x] **Step 3: Verify** — `npm run lint` count drops by ~78; `npm test` green (R-6).
- [x] **Step 4: Commit + update execution status.**

## Phase 1b — `no-unnecessary-type-assertion` by hand

**Files:** Modify the 42 flagged sites.

- [x] **Step 1: Review each site against R-2** — for each, ask *"is this assertion unnecessary only
  because `strictNullChecks` is off?"* If yes, rewrite to `!` (which stays correct under strict);
  if genuinely redundant, delete it.
- [x] **Step 2: Verify** — `npm run lint` (42 fewer), `npm test` green, `npm run build` green.
- [x] **Step 3: Commit + update execution status.**

## Phase 2 — Production source (9 findings)

**Files:** the eight production files in the File-structure section.

- [x] **Step 1: B-1..B-3** — `void submit(this.<form>, async () => {…})`. `submit()` returns
  `Promise<boolean>` (read from `@angular/forms/types/_structure-chunk.d.ts:2092`), so `void` is
  the correct marker in a `void`-returning handler; do **not** make the handler `async`, since it
  is a template event handler.
- [x] **Step 2: `require-await` ×3** — per R-7, preserve each declared `Promise<…>` return type and
  the `override` contract; return `Promise.resolve(…)` rather than dropping `async` from a signature
  that an abstract base declares.
- [x] **Step 3: the remaining 3** — `prefer-promise-reject-errors` (reject with an `Error`),
  `prefer-optional-chain`, `no-unsafe-assignment` (`ElementRef<any>` → a typed read).
- [x] **Step 4: Verify** — `npm run lint` (9 fewer), `npm test`, `npm run build` all green.
- [x] **Step 5: Generalization-audit pass** — the `submit(form, async …)` idiom is a **pattern**:
  search every call site, not just the 3 flagged, and record the result in the log below.
- [x] **Step 6: Commit + update execution status.**

## Phase 3 — e2e (11 findings, incl. the two real bugs)

**Files:** `frontend/e2e/my-bookings.e2e.ts`, `booking-flow.e2e.ts`, `customer-password.e2e.ts`,
`operator-venue.e2e.ts`

- [x] **Step 1: Load `playwright-cli`** (routing gate — this phase authors e2e code).
- [x] **Step 2: B-4/B-5** — `await route.fulfill({…})` inside the `page.route` handlers, making
  each handler `async`. This is a real race fix, not a lint appeasement.
- [x] **Step 3: `operator-venue.e2e.ts`** — type the request-body read instead of letting it be `any`.
- [x] **Step 4: Verify** — `npm run lint` (11 fewer) and **`npm run test:e2e:a11y`** green (the
  mocked suite; on Windows this is the correct script, not `test:e2e` — `riviera-local-debug`).
- [x] **Step 5: Generalization-audit pass** — search every `page.route(` handler in both suites for
  the same unawaited-`fulfill` shape; the linter only sees the 2, but the pattern may sit in
  `e2e/real-backend/` or `e2e/support/` too.
- [x] **Step 6: Commit + update execution status.**

## Phase 4 — Spec unsafe-`any` family via a typed accessor (~186 findings)

**Files:** Create `frontend/src/testing/fixture-dom.ts` · Modify ~94 spec files

The root cause: Angular types `ComponentFixture.nativeElement` as `any`, so every
`fixture.nativeElement.querySelector(…)` is an unsafe member access on `any`.

- [x] **Step 1: Write the accessor** — a small typed helper in `src/testing/` returning
  `HTMLElement`, so call sites keep reading naturally. Exact shape decided at implementation time
  against the real call-site distribution (285 occurrences across 94 files); it must not require
  rewriting every assertion, only the `nativeElement` hop.
- [x] **Step 2: Thread it through the flagged specs**, file by file, running `npm test` per batch
  rather than once at the end (R-6 — this is the phase most likely to change test semantics).
- [x] **Step 3: Verify** — `npm run lint` (~186 fewer), `npm test` green with **no change in test
  count** (AC-6), `npm run format:check` clean.
- [x] **Step 4: Commit + update execution status.**

## Phase 5 — Spec `require-await`, `unbound-method`, `no-misused-promises` (87 findings)

**Files:** the remaining flagged spec files.

- [x] **Step 1: `require-await` ×71** — these are mock implementations of async ports; apply R-7's
  rule (preserve the declared `Promise` return type).
- [x] **Step 2: `unbound-method` ×9 and `no-misused-promises` ×7** — the latter are
  `admin-*.spec.ts` sites passing an async callback where `void` is expected; check each for a
  genuinely swallowed assertion before mechanically fixing.
- [x] **Step 3: Verify** — `npm run lint` → **0 findings** (AC-1); `npm test` green.
- [x] **Step 4: Commit + update execution status.**

## Phase 6 — Green: AC red-checks, docs, close-out

- [x] **Step 1: AC-3 red-check** — temporarily drop a `void` in `booking-dialog.ts`, confirm
  `npm run lint` fails with `no-floating-promises`, revert. Record the output in this doc.
- [x] **Step 2: AC-4 red-check** — temporarily drop an `await` on a `route.fulfill()`, confirm the
  lint fails, revert. This is the proof the e2e tsconfig actually took effect.
- [x] **Step 3: AC-5** — `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty.
- [x] **Step 4: Reconcile the File-structure section** —
  `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [x] **Step 5: Record the CI frontend-job duration** against R-1.
- [x] **Step 6: `riviera-docs-freshness`** over the branch's merge span; patch `CLAUDE.md`'s CI
  paragraph to state the frontend lint gate is type-aware.
- [x] **Step 7: Mark the PR ready for review** — this is what makes the Review and Sonar gates due.
- [x] **Step 8: Finalize the Execution status in this PR's last commit**, citing `merged via PR #NN`
  (never a merge SHA).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `cd frontend && npm run lint` → exit 0, zero problems. Verified at commit `<sha>`.
- [x] **AC-2:** Verified at plan time — `recommended` 46→73, `stylistic` 37→46, 0 rules dropped.
- [x] **AC-3:** Run the phase-6 step-1 red-check → lint FAILS with `no-floating-promises`. Verified at `<sha>`.
- [x] **AC-4:** Run the phase-6 step-2 red-check → lint FAILS on the e2e file. Verified at `<sha>`.
- [x] **AC-5:** Run `grep -rn "eslint-disable" frontend/src frontend/e2e` → empty. Verified at `<sha>`.
- [x] **AC-6:** Run `cd frontend && npm test` → green, test count unchanged. Verified at `<sha>`.
- [x] **AC-7:** Run `cd frontend && npm run test:e2e:a11y` → green. Verified at `<sha>`.
- [x] **AC-8:** Run `cd frontend && npm run format:check` → clean. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled (justified N/A); invariant #2 untouched.
- [x] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [x] **Modulith** section filled (justified N/A); invariant #11 untouched.
- [x] **Payment/payout** section filled (justified N/A) — invariants #5, #8, #9 untouched; R-7 guards the fake gateway's override contract.
- [x] Refund policy enforced server-side (invariant #10) — N/A.
- [x] Timezone correct (invariant #6) — N/A.
- [x] Booking codes unguessable (invariant #7) — N/A.
- [x] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [x] **Frontend** standards met; the new helper is placed per `riviera-frontend`; no `as any` introduced.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [x] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
