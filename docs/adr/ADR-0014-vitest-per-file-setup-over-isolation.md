# ADR-0014: The frontend suite keeps `isolate: false` and buys per-file setup by keeping `test-setup.ts` un-imported

- **Status:** Accepted
- **Date:** 2026-08-14
- **Relates to:** #663 (this decision's issue), #662 (the flake that exposed it, and the
  `freezeClock()` restore convention it introduced), #572 (the `console-stats-strip` assertion that
  went red), `frontend/.claude/CLAUDE.md` § *Unit tests*, `docs/plans/vitest-per-file-setup.md`

## Context

`frontend/src/test-setup.ts` is the `setupFiles` entry of the `@angular/build:unit-test` target. It
freezes `Date` at a fixed instant so no spec can depend on the machine's calendar. The contract
everyone read into it was **"this runs before every test file"**.

It did not. #662 traced a CI flake to a spec that ended on `vi.useRealTimers()` and handed the real
calendar to a *later file*, and closed it by exporting `freezeClock()` and calling that at the seven
restore sites. That fixed the symptom while leaving the premise unexplained — and if setup really
runs once per worker, then every global a spec mutates leaks the same way and the clock is merely
the leak with a visible symptom.

### What the measurement says

Instrumenting the setup body with a per-process counter, over the real 157-file suite:

| Configuration | Setup body executions | Wall clock |
|---|---|---|
| As shipped by #662 (`isolate: false`) | **3** — one per worker process | ~14 s |
| `--isolate` (one process per file) | **157** — one per file | ~97 s |
| This ADR (`isolate: false`, setup un-imported) | **157** — one per file | ~11 s |

So the premise was right, but the *cause* was not Vitest's isolation setting. Vitest invalidates and
re-imports each setup file before each test file (`TestRunner.importFile(…, 'setup')`), and a plain
Vitest project re-executes the setup body per file even with `isolate: false` — verified separately.

The cause is the Angular builder. `@angular/build:unit-test` pre-bundles setup files with esbuild
alongside every spec entry point. #662 exported `freezeClock` from `test-setup.ts` and had three
specs import it, which made the module **shared between entry points**; esbuild hoisted its body
into a chunk and left the entry as a re-export shim:

```js
__vite_ssr_exportName__("freezeClock", () => __vite_ssr_import_0__.freezeClock);
const __vite_ssr_import_0__ = await __vite_ssr_import__("/chunk-5XKCZ4NE.js", …);
```

Vitest's per-file invalidation clears that one node, so the **shim** re-executes 157 times — but its
import resolves to a chunk that is already evaluated and is never invalidated. The freeze therefore
ran once per worker process, and the fix for #662 is what put it there.

## Decision

**1. `test-setup.ts` stays an entry point with no importers.** `freezeClock()` and the frozen instant
move to `frontend/src/testing/freeze-clock.ts`; `test-setup.ts` imports it and calls it. The setup
body then stays in its own entry, and Vitest's per-file re-import re-freezes the clock before every
test file — measured 157/157, at no cost in wall clock.

**2. `isolate` stays `false`** — the `@angular/build:unit-test` default. Isolation closes the whole
leak class structurally, but at ~9× the suite's wall clock on 4 cores (worse on CI's 2), because the
forks pool starts a fresh process per file. That is not a price this suite needs to pay for a
property per-file setup already delivers for the state the setup file owns.

**3. The rule that keeps 1 true is machine-checked, not written down.** `eslint.config.js` fails on
any import of `test-setup` (`no-restricted-imports`) and on `vi.useRealTimers()` in a spec
(`no-restricted-syntax`). `test-setup.ts` additionally carries a runtime tripwire: from the second
file in a worker onward it compares the clock it *inherited* against the frozen instant and, on a
mismatch, throws naming the file that left it that way.

## Consequences

- The `freezeClock()` restore convention stays, for a narrower reason: within a single file, a spec
  that installs full fake timers still owes the rest of that file the frozen posture.
- Sibling test files in a worker still share one jsdom document and one module graph. Anything a spec
  mutates globally that `test-setup.ts` does not re-establish, that spec restores itself — the
  tripwire covers the clock only.
- The freeze is now one esbuild decision away from silently regressing. That is why the guard is a
  lint rule rather than a paragraph, and why the tripwire reports rather than trusting the rule.
- Choosing `isolate: true` later is a one-word change in `angular.json`; the cost measured above is
  the number to re-take before making it.
