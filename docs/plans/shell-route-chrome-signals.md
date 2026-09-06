# Shell route chrome from router signals (#981) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The app shell derives its route chrome (`routeChrome`, and through it `legacySurface`
and `shellChrome`) from `Router.lastSuccessfulNavigation()` as a `computed()`, the only
`NavigationEnd` subscription left in `app.ts` is the constructor's overlay close-on-navigation
rule, and a shared current-URL signal helper with its own spec exists in `shared/` for the
operator and admin follow-ups (#982, #983) to migrate onto.

**Architecture:** `routeChrome` becomes a `computed()` keyed on the router's
`lastSuccessfulNavigation` signal that walks `routerState.snapshot` root → leaf exactly as the
event pipe does today; the walk is safe because the router assigns `routerState` before it
activates the routes (on `BeforeActivateRoutes`) and sets `lastSuccessfulNavigation` on the line
before it emits `NavigationEnd`, so the computed observes the same settled state (verified in
`@angular/router` 22.1.4, `_router-chunk.mjs`: `commitTransition` sets
`this.routerState = targetRouterState` from the `BeforeActivateRoutes` handler, then after
`ActivateRoutes.activate()` comes `lastSuccessfulNavigation.set(…)` immediately followed by
`events.next(new NavigationEnd(…))`). The pre-navigation default (`legacySurface: true`,
tourist chrome) is preserved by returning it while `lastSuccessfulNavigation()` is `null`. The
new helper `currentUrl(router)` serialises `lastSuccessfulNavigation()?.finalUrl` (falling back
to an empty `UrlTree`, the same fallback `isActive()` uses) through `router.serializeUrl`, which
after a navigation equals `router.url` (the router sets `currentUrlTree = finalUrl` in the same
`commitTransition`). The constructor's close-on-navigation rule stays on the event stream: it
keys on each `NavigationEnd`'s navigation id, which no router signal exposes.

**Persistence:** JDBC only (invariant #1). No tables or migrations — the slice is the Angular
app shell, one shared helper, and their specs.

**Source of intent:** GitHub issue #981.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue against the installed router 22.1.4 source, found the pre-navigation default that a naked
snapshot walk would flip, enumerated the five `NavigationEnd` pipes and fenced this slice to the
shell's one) · `riviera-plan-doc` (this template — forced the parity ledger for `routeChrome`'s
initial value and a named seam per AC) · `tdd` (helper spec red first — `Could not resolve
"./current-url"` — then the helper, 3 passed; the shell migration is pinned by the existing
shell specs, 40 passed unchanged before and after) · `riviera-review-overlay` (review gate — ran
at ready-for-review over `40bf30a2..26eabb16`, rung 1 of the ladder, five reviewers plus the
overlay walk; F-1 to F-3 came out of it and were fixed) · `riviera-docs-freshness` (`N/A —
grep of CLAUDE.md, frontend/.claude/CLAUDE.md, CONTEXT.md, RESPONSIBILITIES.md, docs/adr,
docs/agents, docs/architecture and .claude/skills for NavigationEnd / routeChrome /
lastSuccessfulNavigation / current-url / toSignal hits only the vendored generic
angular-developer references; no substrate doc states the shell's route-state mechanism`; the
two retired plan docs are cited nowhere outside `docs/plans/`) · `riviera-frontend` (the helper
is pure and stateless → `shared/`, beside `parent-venue-id.ts`; the shell stays in `app.ts`; no
new e2e — the three mocked suites already cover the chrome) · `angular-developer` + angular-cli
MCP (`get_best_practices`: `computed()` for derived state; `search_documentation` v22 verified
`Router.lastSuccessfulNavigation: Signal<Navigation | null>`, `Navigation.finalUrl` set by
`RoutesRecognized`, `Router.serializeUrl`, and `isActive()` as the precedent computed) ·
`playwright-cli` (loaded at the review gate, after the three mocked suites had run green under
`PW_CHROMIUM_EXECUTABLE` — an RV-PROC-1 ordering miss recorded here; no e2e was authored, so the
re-check changed nothing) · `riviera-local-debug` (unshallowed the clone; scoped `ng test
--include` runs; a corrupt session CA bundle worked around with a repaired copy for git only).
No `postgres`, `riviera-modulith`, `riviera-java-conventions`, `riviera-tailwind` or
`riviera-stripe-payments` row fires: the diff holds no SQL, no Java, no styling (zero Tailwind
class or token lines) and no money.

**Branch:** `claude/sdlc-981-5puqy0` (the cloud session's designated branch stands in for
`feature/shell-route-chrome-signals`)

---

## Acceptance criteria (testable)

The seam for AC-1 and AC-2 is the new helper's exported function under a real router
(`provideRouter` with blank test routes): its signal value read after `Router.navigate`. The
seam for AC-3 to AC-5 is the app shell rendered under a real router: the chrome DOM
(`.riv-header`, `[data-testid="opc-header"]`, `main.riv-legacy-surface`, the overlays) after a
navigation — the seam the existing shell specs already observe through.

- [x] **AC-1:** Given a router with no completed navigation, when `currentUrl(router)` is read,
  then it is `/`; given a navigation to `/a?x=1` has completed, then it is `/a?x=1`, and a
  further navigation to `/b` moves it to `/b`. *Seam:* `shared/current-url.ts` ›
  `currentUrl(router)` under `provideRouter` · *Pinned by:* `current-url.spec.ts` ›
  `is the empty root before any navigation`, `follows each completed navigation, query string included`
- [x] **AC-2:** Given the signal reads `/a`, when a same-URL navigation is skipped
  (`NavigationSkipped`, no `NavigationEnd`), then the signal still reads `/a`. *Seam:* as AC-1 ·
  *Pinned by:* `current-url.spec.ts` › `does not change on a same-URL NavigationSkipped`
- [x] **AC-3:** Given the shell, when the router lands on a legacy-flagged, glass, console or
  operator-chrome route, then the compat surface, tourist chrome, no chrome, or operator chrome
  render as today. *Seam:* the shell's chrome DOM under `provideRouter` · *Pinned by:* the
  existing `app.spec.ts` › `wraps legacy-flagged routes in the opaque compat surface, glass routes not (AC-6)`,
  `suppresses the tourist header/footer chrome on operator-console routes (#170, AC-7)`,
  `renders the shared operator chrome instead of the tourist header on operator-chrome routes` — unchanged
- [x] **AC-4:** Given an open overlay, when a navigation the user set off completes, then it
  closes and focus lands on `main`; when the navigation it was opened during completes, it stays
  open. *Seam:* as AC-3 · *Pinned by:* the existing `app.spec.ts` ›
  `closes the Find a booking modal on navigation and moves focus to main (a11y, #148)` and the
  three `#892` cases — unchanged
- [x] **AC-5:** Given `/account/sign-in?mode=register` then `?returnUrl=…`, then Register and
  Sign in are current respectively, never together. *Seam:* as AC-3 · *Pinned by:* the existing
  `app.spec.ts` › `never marks Sign in and Register current together: the mode query param decides` — unchanged
- [x] **AC-6:** `app.ts` holds no `toSignal` and no `NavigationEnd` `filter` outside the
  constructor's close-on-navigation subscription. *Seam:* the source file · *Pinned by:* the
  verification command in *Acceptance-criteria verification* (a structural fact, not a behavior;
  no spec reads source)

## Non-goals

- Migrating `OperatorChrome`, `AdminConsole`, `AdminConsoleTabs` or `OperatorConsole` off their
  `NavigationEnd` pipes — follow-ups #982 and #983 migrate them onto the helper.
- Retiring the shell's pre-navigation `legacySurface: true` default (no route sets the flag any
  more, so it only shows during the initial navigation's chunk load) — a behavior change with
  its own review, not this refactor's.
- Any change to the shell's template, styling, or the overlay close-on-navigation rule.
- New e2e coverage: the slice is behavior-preserving and the three mocked suites already pin
  the chrome switching, the overlays, and the current-page marker.

## Behavior-parity ledger (retirement / replacement slices only)

The slice replaces the mechanism behind `routeChrome`, not a surface; the ledger lists the
mechanism's observable behaviors.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Before the first `NavigationEnd`: `legacySurface: true`, tourist chrome, not chromeless | preserved | the computed returns the same default (`PRE_NAVIGATION_CHROME`) while `lastSuccessfulNavigation()` is `null` |
| On every `NavigationEnd`: root → leaf walk OR-ing `operatorConsole` / `operatorChrome`, leaf-only `legacySurface` | preserved | the same walk, run when `lastSuccessfulNavigation()` changes — set on the line before `NavigationEnd` is emitted |
| Not recomputed on `NavigationSkipped` / cancel / error | preserved | those paths never set `lastSuccessfulNavigation`, and `commitTransition` leaves `routerState` alone when there is no target state |
| Recomputed on a same-URL `onSameUrlNavigation: 'reload'` navigation | preserved | a reload completes as a new navigation and sets the signal |
| Overlay close-on-navigation skips the navigation already in flight when the overlay opened | preserved | untouched: stays on the event stream (needs the `NavigationEnd` id) |
| Auth pair reads `mode` off `lastSuccessfulNavigation()?.finalUrl` | preserved | untouched (already the signal form) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The computed reads `routerState.snapshot` before the router has swapped it, showing the previous route's chrome | low | high | verified in router 22.1.4 source: `routerState` is assigned on `BeforeActivateRoutes`, `lastSuccessfulNavigation` set after activation on the line before `NavigationEnd`; three reviewers re-verified it independently; AC-3 pins the switching | agent | closed — fed209f3 |
| R-2 | A naked snapshot walk flips the pre-navigation `legacySurface` default to `false` | high | low | explicit `null` guard returning `PRE_NAVIGATION_CHROME`; parity ledger row 1 | agent | closed — fed209f3 |
| R-3 | The helper's fallback before any navigation differs from `router.url` | low | low | both serialise an empty `UrlTree` → `/`; AC-1 pins the value | agent | closed — e8dc881e |
| R-4 | A later reader "finishes" the migration by moving the constructor subscription onto a signal, breaking the overlay-navigation-id skip | med | med | the constructor TSDoc states the id dependency as contract (reworded at F-1 to drop the changelog framing); AC-4's specs would fail | agent | closed — the review-fix commit |
| R-5 | `lastSuccessfulNavigation()` returns `null` typed as `Navigation \| null`; a `?.` chain hides a wrong assumption in strict TS | low | low | the null guard is explicit, not optional chaining, in `routeChrome` | agent | closed — fed209f3 |

## Open questions / Assumptions

None open.

### Resolved

- **Assumption:** the helper takes the `Router` as a parameter like `isActive()` rather than
  injecting it, so it needs no injection context and stays pure — resolved as stated; the
  issue's "pure and stateless" reads the same way, and the spec calls it outside any injection
  context. e8dc881e

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice never leaves the Angular shell.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved. The frontend placement: the helper is pure →
`shared/` (`riviera-frontend` taxonomy); the shell's derived state stays in `app.ts`.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/current-url.ts` | new | pure signal helper | `computed()` over `Router.lastSuccessfulNavigation()` | none |
| FE-2 | `app.ts` (`App`) | existing | standalone component | `routeChrome` → `computed()`; constructor `NavigationEnd` subscription unchanged | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()`
signal APIs, `NgOptimizedImage` for new images. No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** DONE — merged via PR #990

**Next action:** none; the merge close-out's GitHub-side steps (issue closed by the PR, no
epic) follow the merge.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — shared `currentUrl` helper + spec | ✅ | e8dc881e |
| 1 — shell `routeChrome` as a `computed()`, TSDoc, constructor comment | ✅ | fed209f3 |
| 2 — lint / format / unit / mocked e2e, plan-doc retirement of the two merged plans | ✅ | 8c79ed9b, merge of `main` 26eabb16 |
| 3 — review-gate fixes F-1 to F-3 + this close-out | ✅ | the review-fix commit (this PR's last code-touching commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (CLAUDE.md agent, scored 75) | the constructor TSDoc's closing clause "so it is not a migration left unfinished" is changelog, not contract (`frontend/.claude/CLAUDE.md` § Comments) | fixed — reworded to the contract: the skip compares each `NavigationEnd`'s id, a per-event fact no router signal exposes |
| F-2 | review (comment-guidance agent, scored 50) | `routeChrome` TSDoc said `routerState` is assigned "during activation"; the router assigns it on `BeforeActivateRoutes`, before `ActivateRoutes.activate()` | fixed — TSDoc and this plan's Architecture paragraph say "before it activates the routes (on `BeforeActivateRoutes`)" |
| F-3 | review (comment-guidance agent, scored 50) | the helper spec's header omitted the pre-navigation `/` default its first case pins | fixed — header states it |

Review outcome: five reviewers (CLAUDE.md adherence, shallow bug scan, git history, prior-PR
comments over #985 / #894 / #555 / #500 / #495, code-comment guidance) over
`40bf30a2..26eabb16`; no bug, no behavior change, no CLAUDE.md violation beyond F-1; three
reviewers independently re-verified the router ordering claim against the installed source.
Overlay walk: RV-FE-1 ✅ (`computed()`, `inject()`, no decorators), RV-FE-7 N/A (no styling),
RV-FE-6/2/3/4/5 N/A, RV-FE-E2E ✅ (existing coverage, three suites green, no e2e file touched),
RV-FE-8 ✅ (new imports are `@angular/*` only), RV-FE-9/10/11 N/A (no DOM change), RV-STYLE-1
✅ (guard clean, no provenance in touched doc comments), RV-STYLE-2 ✅ (prettier clean),
RV-PROC-1 — `playwright-cli` was listed before it was loaded, fixed by loading it at the gate
and recording the order above, RV-PROC-2 N/A (no substrate file touched; the two retired plan
docs are cited nowhere outside `docs/plans/`). None of the three findings reached the
`/code-review` comment bar (80), so no review comment was posted on the PR; all three were fixed.

Sonar note: the changed frontend paths lie in `sonar.sources` (`frontend/src`); the two
deleted plan docs do not, so the gate judges the four frontend files only. Outcome recorded
in the PR body's Gates section once the analysis on the final head completes.

---

## File structure

- `frontend/src/app/shared/current-url.ts` — the current-URL signal helper
- `frontend/src/app/shared/current-url.spec.ts` — its spec (AC-1, AC-2)
- `frontend/src/app/app.ts` — `routeChrome` as a `computed()`; TSDoc; constructor comment
- `docs/plans/shell-route-chrome-signals.md` — this plan
- `docs/plans/tourist-current-page-marker.md` — retired (PR #985 merged)
- `docs/plans/shared-inline-template-opener.md` — retired (PR #980 merged)

---

## Phase 0 — shared `currentUrl` helper

**Files:** Create `frontend/src/app/shared/current-url.ts` · Test `frontend/src/app/shared/current-url.spec.ts`

- [x] **Step 1: Write the failing test** — three cases (AC-1, AC-2) under `provideRouter` with
  blank routes `a` and `b`; the skipped case subscribes to `router.events` and asserts a
  `NavigationSkipped` arrived and no `NavigationEnd`.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/shared/current-url.spec.ts"` → FAIL (`Could not resolve "./current-url"`)
- [x] **Step 3: Minimal implementation**

```ts
export function currentUrl(router: Router): Signal<string> {
  return computed(() =>
    router.serializeUrl(router.lastSuccessfulNavigation()?.finalUrl ?? new UrlTree()),
  );
}
```

- [x] **Step 4: Run it, verify it passes** — same command → 3 passed
- [x] **Step 5: Generalization-audit pass** — population: every `NavigationEnd` → URL/route-state
  pipe (`grep -rn "instanceof NavigationEnd" frontend/src/app`); decision: the shell only,
  the rest are #982/#983 by the issue's own fence.
- [x] **Step 6: Commit** — `git commit -m "Add the shared current-URL signal helper (#981)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — shell `routeChrome` as a `computed()`

**Files:** Modify `frontend/src/app/app.ts` (`routeChrome`, its TSDoc, the constructor TSDoc)

- [x] **Step 1: The existing shell specs are the pin** — run
  `npx ng test --watch=false --include="src/app/app.spec.ts"` green before the change (baseline, 40 passed).
- [x] **Step 2: Replace the `toSignal` pipe** with a `computed()` guarded on
  `lastSuccessfulNavigation() === null` → the old default, else the same snapshot walk; drop the
  `toSignal` and `map` imports the shell no longer uses (`takeUntilDestroyed`, `filter`
  stay for the constructor).
- [x] **Step 3: TSDoc** — `routeChrome` states the ordering guarantee; the constructor TSDoc
  states that the subscription stays event-driven because it needs the navigation id.
- [x] **Step 4: Run the shell specs** — same command → 40 passed, `app.spec.ts` untouched.
- [x] **Step 5: Commit** — `git commit -m "Derive the shell's route chrome from router signals (#981)"`

## Phase 2 — gates and close-out

- [x] `npm run lint`, `npm run format:check`, `npm test` (225 files, 2557 passed)
- [x] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts theme-shell current-page-marker find-a-booking` (21 passed)
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` and the other diff-scoped guards (all exit 0)
- [x] `git rm` the two merged plan docs; grep their slugs outside `docs/plans/` (none cite them)
- [x] Draft PR #990 → merge `origin/main` (#989) → ready for review → review gate (F-1 to F-3, fixed) → Sonar gate → close-out

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | phase 0 (the helper) | every `NavigationEnd` pipe deriving URL or route state | `grep -rn "instanceof NavigationEnd" frontend/src/app --include=*.ts` | `app.ts` ×2 (routeChrome, the constructor), `operator-chrome.ts`, `admin-console.ts` ×2, `admin-console-tabs.ts`, `operator-console.ts` | the shell's `routeChrome` only (this slice); the constructor stays event-driven by design; the four console pipes are #982/#983 |
| 2026-09-06 | F-2 (an ordering claim stated loosely) | every doc comment the diff wrote that states router ordering | `git diff origin/main -- frontend/src \| grep -n "activation\|before it emits"` | `app.ts` `routeChrome` TSDoc; this plan's Architecture paragraph | both corrected to "before it activates the routes (on `BeforeActivateRoutes`)" |

---

## Acceptance-criteria verification (final)

- [x] **AC-1, AC-2:** Run `npx ng test --watch=false --include="src/app/shared/current-url.spec.ts"` → 3 passed. Verified at the review-fix commit.
- [x] **AC-3, AC-4, AC-5:** Run `npx ng test --watch=false --include="src/app/app.spec.ts"` → 40 passed, `app.spec.ts` untouched in the diff. Verified at the review-fix commit.
- [x] **AC-6:** Run `grep -c "toSignal" frontend/src/app/app.ts` → `0`; `grep -c "instanceof NavigationEnd" frontend/src/app/app.ts` → `1` (the constructor). Verified at fed209f3.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #990`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
