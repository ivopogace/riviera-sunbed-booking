# ADR-0014: The frontend suite registers its Vitest setup file outside the Angular builder, and keeps `isolate: false`

- **Status:** Accepted
- **Date:** 2026-08-14
- **Relates to:** #663 (this decision's issue), #662 (the flake that exposed it, and the
  `freezeClock()` restore convention it introduced), #572 (the `console-stats-strip` assertion that
  went red), `frontend/.claude/CLAUDE.md` § *Unit tests*, `docs/plans/vitest-per-file-setup.md`

## Context

`frontend/src/test-setup.ts` freezes `Date` at a fixed instant so no spec can depend on the
machine's calendar. The contract everyone read into it was **"this runs before every test file"**.

It did not. #662 traced a CI flake to a spec that ended on `vi.useRealTimers()` and handed the real
calendar to a *later file*, and closed it by exporting `freezeClock()` and calling that at the seven
restore sites. That fixed the symptom while leaving the premise unexplained — and if setup really
runs once per worker, then every global a spec mutates leaks the same way and the clock is merely
the leak with a visible symptom.

### What the measurement says

Instrumenting the setup body with a per-process counter, over the real suite:

| Configuration | Setup body executions | Wall clock |
|---|---|---|
| As shipped by #662, `npm test` | **3** — one per worker process | ~14 s |
| As shipped by #662, `--isolate` | 157 — one per file | ~97 s |
| This ADR, `npm test` | **158** — one per file | ~14 s |
| This ADR, `npm run test:coverage` (what CI runs) | **158** — one per file | ~20 s |

The premise was right; the suspected cause was not. Vitest re-imports each setup file before each
test file — `TestRunner.importFile(…, 'setup')` invalidates the module first — and a bare Vitest
project with `isolate: false` re-executes its setup body per file (measured 6/6). Isolation is not
what breaks it.

**The cause is that `@angular/build:unit-test` pre-bundles setup files as esbuild entry points.**
Two independent paths turn that entry into a re-export shim, and Vitest's invalidation reaches only
the shim, never the already-evaluated module behind it:

1. **A second importer.** #662 exported `freezeClock` to three specs, which made the module *shared*
   between entry points, so esbuild hoisted its body into a chunk:
   `__vite_ssr_exportName__("freezeClock", …); await __vite_ssr_import__("/chunk-5XKCZ4NE.js")`.
2. **Coverage — unconditionally, for every entry point.** The builder's in-memory loader emits
   `import "./setup-test-setup.js";` as the whole module whenever `coverage.enabled`, so that the
   real file can be excluded from the coverage report. CI's frontend job runs **only**
   `npm run test:coverage`, so this path alone would have kept the freeze per-worker in the exact
   place #662's flake happened — no arrangement of the source files can avoid it.

## Decision

**1. The setup file is registered with Vitest, not with the builder.** `angular.json`'s `test` target
sets `runnerConfig: true`, and `frontend/vitest-base.config.ts` carries
`test.setupFiles: ['./src/test-setup.ts']`. The builder merges that config into its own, so Vitest
resolves the file through Vite directly instead of pre-bundling it as an entry point. It is then a
real module that per-file invalidation re-evaluates — measured 158/158 in both modes, at no cost in
wall clock. It also puts the file out of reach of both shim paths at once, rather than dodging one.

**2. `isolate` stays `false`** — the `@angular/build:unit-test` default. Isolation closes the whole
leak class structurally, but at ~7× the suite's wall clock on 4 cores (worse on CI's 2), because the
forks pool starts a fresh process per file. That is not a price this suite needs to pay for a
property per-file setup already delivers for the state the setup file owns.

**3. The property is pinned by a test, not by a convention.** `src/test-setup.ts` stamps the file its
run belongs to, and `src/testing/freeze-clock.spec.ts` asserts the stamp is its own path — which is
true only if setup ran for *that* file. It goes red under both regression paths: re-sharing the
module, and moving it back under the builder's `setupFiles`. Alongside it, the setup file registers
an `afterEach` that fails the exact test which leaves the clock off the frozen instant, and
`eslint.config.js` fails the lint on `vi.useRealTimers()` under `src/`.

## Consequences

- The `freezeClock()` restore convention stays, for a narrower reason: within a single file, a spec
  that installs full fake timers still owes the rest of that file the frozen posture.
- Sibling test files in a worker still share one jsdom document and one module graph. Anything a spec
  mutates globally that `src/test-setup.ts` does not re-establish, that spec restores itself — the
  `afterEach` guard covers the clock only.
- `vitest-base.config.ts` becomes a load-bearing file: deleting it, or dropping `runnerConfig`, moves
  the setup file back under the builder. The `freeze-clock.spec.ts` assertion is what says so.
- `src/testing/freeze-clock.ts` is imported by specs and therefore lives in a chunk evaluated once
  per worker. It must stay stateless; its TSDoc says so.
- Choosing `isolate: true` later is a one-word change in `angular.json`; the cost measured above is
  the number to re-take before making it.
