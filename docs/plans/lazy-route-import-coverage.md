# Lazy-route import-line coverage Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A PR that only changes an import line inside a lazy `loadComponent` route target no
longer reads that line as `0` coverage in SonarCloud, for every current and future lazy route,
without a per-component deep-link spec.

**Architecture:** Vitest's v8 coverage provider registers a lazy `loadComponent` target's
module boundary (with every line initialized to `0`) as soon as any spec merely imports
`app.routes.ts` — five specs do — but only flips its import lines to `1` once something
actually resolves the target's dynamic `import()` (real router navigation, or a direct
`loadComponent()` call). Rather than hacking the coverage/lcov pipeline (unsupported
territory) or repeating PR #998's heavier `RouterTestingHarness` deep-link-spec pattern for
each of the 19 still-uncovered routes, add **one generic test** that recursively walks the
real `routes` export (including the two nested tab-route trees) and resolves every
`loadComponent()` target once. This fixes all 20 currently-uncovered targets in one commit and
self-heals for any future lazy route — no code changes to `sonar-project.properties`,
`ci.yml`, or `vitest-base.config.ts`.

**Persistence:** N/A — frontend test-tooling only, no tables/migrations touched.

**Source of intent:** GitHub issue #999.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed no
in-flight overlap, only dependabot PRs open; confirmed frontend-only so no Flyway/module
concerns) · `riviera-plan-doc` (this template — forced the Given/When/Then ACs and the
lightweight-vs-full tier call) · `tdd` (built at the `app.routes.ts` `routes` export seam;
documented the adapted red/green loop below since this test proves an existing-behavior side
effect, not new application behavior) · `riviera-review-overlay` (review gate — runs at PR
ready-for-review) · `riviera-docs-freshness` (`N/A — single-slice close-out, no epic/merge
close-out due yet`) · `riviera-frontend` (Routing section — added the coverage-walker
convention so the next lazy route needs no extra spec) · `angular-developer` + angular-cli MCP
`search_documentation` (checked angular.dev v22 for official guidance on lazy-route coverage
semantics and `RouterTestingHarness` — confirmed no first-party fix/convention exists,
validating a project-level test convention as the right layer for the fix).

**Branch:** `claude/sdlc-999-5yb4tu` (session's designated remote branch, standing in for
`bugfix/lazy-route-import-coverage`)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the real `routes` table exported by `app.routes.ts` (including its
  nested `consoleTabRoutes` and `adminTabRoutes` children), when a new Vitest spec walks the
  array recursively and awaits every route's `loadComponent()`, then all 32 lazy-loaded
  target modules resolve to a defined component class (proving each one is genuinely
  evaluated, not merely discovered by the bundler). *Seam:* `app.routes.ts`'s exported
  `routes` array — the real route table, not a stub. *Pinned by:*
  `app.routes.spec.ts` › `app.routes — every lazy route target resolves its module (#999)` ›
  `resolves all 32 loadComponent targets, including the nested tab-route trees`.
- [ ] **AC-2:** Given AC-1's test is added and `npm run test:coverage` runs the full suite,
  when `frontend/coverage/frontend/lcov.info` is inspected for the import lines of the 20
  previously-`DA:<n>,0` lazy targets (admin tabs `commissions`/`email`/`refunds`/`photos`/
  `reviews`/`privacy`; console tabs `pricing`/`daily`/`requests`; and the top-level targets
  with no other real-route coverage — `home`, `my-bookings`, the six `account/*`/`legal/*`
  pages, `operator-home`, and `booking/confirmation`/`booking/pay`/`booking/requested`/
  `booking/:code`), then none of them remain at `,0`. *Seam:* the generated
  `frontend/coverage/frontend/lcov.info` artifact — a build-artifact check, not a unit-test
  assertion (lcov content isn't application behavior). *Verified by:* Phase 0 Step 4 (lcov
  grep before/after).
- [ ] **AC-3:** Given a future contributor adds a new lazy `loadComponent` route (top-level
  or nested) to `app.routes.ts`, when they read `riviera-frontend`'s `## Routing` section,
  then they find the coverage mechanism explained and learn the generic walker test already
  covers their new route with no extra spec needed for coverage alone. *Seam:*
  `.claude/skills/riviera-frontend/SKILL.md` `## Routing` — doc change, verified by review.

## Non-goals

- Not touching the Vitest coverage provider config, `sonar-project.properties`, or `ci.yml`
  — no coverage-tool internals change.
- Not retrofitting PR #998's `RouterTestingHarness` deep-link-spec pattern onto the other 19
  routes.
- Not asserting rendered DOM/behavior for the newly-loaded components — existing
  component-level specs already cover behavior; this test only proves the module resolves.
- Not adding coverage for `component:`-based (eager) routes — there are none currently, and
  eager imports aren't lazy chunk boundaries so they don't have this problem.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new test coverage, replaces nothing.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The walker's `await loadComponent()` calls trigger a real dynamic import of every lazy module at test time — a latent bug in any component's module-level code would now throw during this one test | low | low (surfaces immediately in CI, which is a good outcome) | run `npx ng test --include='**/app.routes.spec.ts'` scoped first before the full suite | this session | open — closes when Phase 0 lands green |
| R-2 | Recursion misses a nesting level (e.g. a future third-level child tree) and silently under-covers | low | med | assert `toHaveLength(32)` on the resolved-names array so a miscount fails loudly, not silently | this session | open — closes with Phase 0 |
| R-3 | The `riviera-frontend` doc note goes stale if a future route uses a pattern the walker doesn't visit (e.g. `component:` instead of `loadComponent`) | low | low | doc note states the walker only benefits `loadComponent` targets; not machine-enforced, flagged as a documentation limitation | this session | open — accepted, no code guard planned |

## Open questions / Assumptions

None open — the remedy (generic route-walker test) and doc location (`riviera-frontend`)
were settled via `AskUserQuestion` before this plan was written.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. Frontend test-tooling only; no booking/availability/money
code touched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.routes.spec.ts` | existing (extended) | Vitest spec, no component | N/A — plain async function over a static array | N/A |

**Standards:** N/A — no new component/template/forms; pure test code, no deviation.

## FE↔BE contract

N/A — no API shape change.

## Execution status

**Stage pointer:** plan (doc drafted, not yet committed)

**Next action:** run the Skill-routing gate confirmation, commit this plan doc + branch
state, then start Phase 0 test-first.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Generic lazy-route walker test + doc note | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `frontend/src/app/app.routes.spec.ts` — add the generic recursive lazy-route loader test
  (#999).
- `.claude/skills/riviera-frontend/SKILL.md` — document the coverage mechanism + walker
  convention under `## Routing`.
- `docs/plans/lazy-route-import-coverage.md` — this plan doc (retired at next close-out per
  `riviera-docs-freshness`).

---

## Phase 0 — Generic lazy-route walker test + doc note

**Files:** Modify `frontend/src/app/app.routes.spec.ts` · Modify
`.claude/skills/riviera-frontend/SKILL.md` · Test `frontend/src/app/app.routes.spec.ts`

> **TDD adaptation, stated honestly:** this test proves a coverage side effect of code that
> already works correctly (every route already resolves) — there's no application defect to
> reproduce red-first. The meaningful "red" state is the `toHaveLength(32)` assertion against
> a not-yet-written recursive walker; write the assertion and the (missing) walker together,
> confirm the test compiles and passes on first run (no red state expected, since the routes
> already function), then treat the **lcov diff** (Step 4) as the actual before/after proof
> the fix does something — that's where the real "was this red" evidence lives.

- [ ] **Step 1: Write the test**

```ts
// frontend/src/app/app.routes.spec.ts — appended
describe('app.routes — every lazy route target resolves its module (#999)', () => {
  /**
   * SonarCloud/V8 coverage only counts a lazy target's import lines as covered once its
   * dynamic import() actually resolves — a spec that merely imports `routes` (five do)
   * registers the chunk boundary with every line at 0 hits. This walk resolves every
   * loadComponent target in the real table, including the two nested tab-route trees, so a
   * new lazy route gets this for free with no per-component deep-link spec (issue #999).
   */
  async function loadedComponentNames(routeList: Routes): Promise<string[]> {
    const names: string[] = [];
    for (const route of routeList) {
      if (route.loadComponent) {
        const load = route.loadComponent as () => Promise<{ name: string }>;
        const component = await load();
        names.push(component.name);
      }
      if (route.children) {
        names.push(...(await loadedComponentNames(route.children)));
      }
    }
    return names;
  }

  it('resolves all 32 loadComponent targets, including the nested tab-route trees', async () => {
    const names = await loadedComponentNames(routes);
    expect(names).toHaveLength(32);
    expect(names.every((name) => name.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it scoped, verify it passes** —
  `npx ng test --include='**/app.routes.spec.ts'` (from `frontend/`) → PASS, `names.length`
  is `32`.

> Scope: target ONE spec file. Not the full suite (`riviera-local-debug`).

- [ ] **Step 3: Doc note** — add to `.claude/skills/riviera-frontend/SKILL.md` `## Routing`:

```md
- **A lazy target's import lines only count as covered once its module actually loads** —
  Vitest's v8 coverage provider registers a `loadComponent` target's chunk boundary as soon
  as any spec imports `app.routes.ts`, but its import lines stay at 0 hits until something
  resolves the dynamic `import()` (real navigation, or a direct `loadComponent()` call).
  `app.routes.spec.ts`'s `app.routes — every lazy route target resolves its module (#999)`
  test walks the whole real table (including `consoleTabRoutes`/`adminTabRoutes`) and
  resolves every target, so a new lazy route gets this for free — no per-component
  deep-link spec needed for coverage alone.
```

- [ ] **Step 4: Full-suite coverage run, verify the lcov delta** —
  `npm run test:coverage` (from `frontend/`) → inspect `frontend/coverage/frontend/lcov.info`
  for the import lines of the 20 previously-`,0` files listed in AC-2 → none remain `,0`.

> Scope (end-of-phase regression): this IS the full-suite run — coverage attribution is a
> full-suite-only phenomenon (`riviera-local-debug` § *the full-suite-only failure class*).

- [ ] **Step 5: Generalization-audit pass**

Population `every current and future lazy loadComponent route in app.routes.ts` → enumerated
by reading the full file (32 targets: 18 top-level + 8 `adminTabRoutes` + 6
`consoleTabRoutes`) → the recursive walker visits all 32 by construction (walks `routes` and
recurses into every `children` array, with no hardcoded route list) → decision: fix all, via
the generic walker rather than a per-route spec; no subset skipped. Appended to the log below.

- [ ] **Step 6: Commit** — `git commit -m "Cover every lazy route target's import lines
  generically (#999)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | Phase 0 | Every `loadComponent` route in `app.routes.ts`, incl. nested children | read full file; recursive walker visits `routes` + every `children` array by construction | 32 (18 top-level + 8 admin tabs + 6 console tabs) | fix all via one generic walker, no subset skipped |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npx ng test --include='**/app.routes.spec.ts'` → PASS, 32 names
  resolved. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `npm run test:coverage` → grep `frontend/coverage/frontend/lcov.info` for
  the 20 target files → no `,0` import-line entries remain. Verified at commit `<sha>`.
- [ ] **AC-3:** Review confirms the `riviera-frontend` `## Routing` doc note lands in the
  same PR. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** — N/A, frontend-only.
- [ ] **Availability** section filled (N/A, justified).
- [ ] Pool + cutoff rules — N/A, frontend-only.
- [ ] **Modulith** section filled — N/A, frontend-only.
- [ ] **Payment/payout** section filled — N/A, no payment in scope.
- [ ] Refund policy — N/A.
- [ ] Timezone — N/A, no date/time logic touched.
- [ ] Booking codes — N/A.
- [ ] Flyway migration — N/A, no schema change.
- [ ] **Frontend** standards met (pure test code, no deviation to document).
- [ ] Execution status at HEAD matches reality.
- [ ] Risk register has no stale `open` rows without a resolution note; Open Questions empty.
- [ ] **Close-out written in THIS PR, in its last code-touching commit.**
- [ ] **The review gate ran in full** — per the invocation ladder in `riviera-sdlc`
  `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
