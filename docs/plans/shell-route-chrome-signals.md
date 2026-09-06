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
event pipe does today; the walk is safe because the router assigns `routerState` before
activation and sets `lastSuccessfulNavigation` on the line before it emits `NavigationEnd`, so
the computed observes the same settled state (verified in `@angular/router` 22.1.4,
`_router-chunk.mjs`: `this.routerState = targetRouterState` in the pre-activation
`beforeActivateHandler`, then `lastSuccessfulNavigation.set(…)` immediately followed by
`events.next(new NavigationEnd(…))`). The pre-navigation default (`legacySurface: true`,
tourist chrome) is preserved by returning it while `lastSuccessfulNavigation()` is `null`. The
new helper `currentUrl(router)` serialises `lastSuccessfulNavigation()?.finalUrl` (falling back
to an empty `UrlTree`, the same fallback `isActive()` uses) through `router.serializeUrl`, which
after a navigation equals `router.url` (the router sets `currentUrlTree = finalUrl` in the same
pre-activation step). The constructor's close-on-navigation rule stays on the event stream: it
keys on each `NavigationEnd`'s navigation id, which no router signal carries.

**Persistence:** JDBC only (invariant #1). No tables or migrations — the slice is the Angular
app shell, one shared helper, and their specs.

**Source of intent:** GitHub issue #981.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue against the installed router 22.1.4 source, found the pre-navigation default that a naked
snapshot walk would flip, enumerated the five `NavigationEnd` pipes and fenced this slice to the
shell's one) · `riviera-plan-doc` (this template — forced the parity ledger for `routeChrome`'s
initial value and a named seam per AC) · `tdd` (helper spec red first, then the helper; the shell
migration is pinned by the existing shell specs, which must pass unchanged — a red step there
would be a regression, not a new behavior) · `riviera-review-overlay` (review gate — <runs at
ready-for-review>) · `riviera-docs-freshness` (<ran / N/A at close-out>) · `riviera-frontend`
(the helper is pure and stateless → `shared/`, beside `parent-venue-id.ts`; the shell stays in
`app.ts`; no new e2e — the three mocked suites already cover the chrome) · `angular-developer` +
angular-cli MCP (`computed()` over a framework signal, an untracked non-signal read inside it
is the design; `search_documentation` for `Router.lastSuccessfulNavigation` / `Navigation.finalUrl`)
· `playwright-cli` (the mocked `theme-shell`, `current-page-marker`, `find-a-booking` suites
run under `PW_CHROMIUM_EXECUTABLE`) · `riviera-local-debug` (unshallowed the clone; scoped
`ng test --include` runs). No `postgres`, `riviera-modulith`, `riviera-java-conventions`,
`riviera-tailwind` or `riviera-stripe-payments` row fires: the diff holds no SQL, no Java, no
styling and no money.

**Branch:** `claude/sdlc-981-5puqy0` (the cloud session's designated branch stands in for
`feature/shell-route-chrome-signals`)

---

## Acceptance criteria (testable)

The seam for AC-1 and AC-2 is the new helper's exported function under a real router
(`provideRouter` with blank test routes): its signal value read after `Router.navigate`. The
seam for AC-3 to AC-5 is the app shell rendered under a real router: the chrome DOM
(`.riv-header`, `[data-testid="opc-header"]`, `main.riv-legacy-surface`, the overlays) after a
navigation — the seam the existing shell specs already observe through.

- [ ] **AC-1:** Given a router with no completed navigation, when `currentUrl(router)` is read,
  then it is `/`; given a navigation to `/a?x=1` has completed, then it is `/a?x=1`, and a
  further navigation to `/b` moves it to `/b`. *Seam:* `shared/current-url.ts` ›
  `currentUrl(router)` under `provideRouter` · *Pinned by:* `current-url.spec.ts` ›
  `is the empty root before any navigation`, `follows each completed navigation, query string included`
- [ ] **AC-2:** Given the signal reads `/a`, when a same-URL navigation is skipped
  (`NavigationSkipped`, no `NavigationEnd`), then the signal still reads `/a`. *Seam:* as AC-1 ·
  *Pinned by:* `current-url.spec.ts` › `does not change on a same-URL NavigationSkipped`
- [ ] **AC-3:** Given the shell, when the router lands on a legacy-flagged, glass, console or
  operator-chrome route, then the compat surface, tourist chrome, no chrome, or operator chrome
  render as today. *Seam:* the shell's chrome DOM under `provideRouter` · *Pinned by:* the
  existing `app.spec.ts` › `wraps legacy-flagged routes in the opaque compat surface, glass routes not (AC-6)`,
  `suppresses the tourist header/footer chrome on operator-console routes (#170, AC-7)`,
  `renders the shared operator chrome instead of the tourist header on operator-chrome routes` — unchanged
- [ ] **AC-4:** Given an open overlay, when a navigation the user set off completes, then it
  closes and focus lands on `main`; when the navigation it was opened during completes, it stays
  open. *Seam:* as AC-3 · *Pinned by:* the existing `app.spec.ts` ›
  `closes the Find a booking modal on navigation and moves focus to main (a11y, #148)` and the
  three `#892` cases — unchanged
- [ ] **AC-5:** Given `/account/sign-in?mode=register` then `?returnUrl=…`, then Register and
  Sign in are current respectively, never together. *Seam:* as AC-3 · *Pinned by:* the existing
  `app.spec.ts` › `never marks Sign in and Register current together: the mode query param decides` — unchanged
- [ ] **AC-6:** `app.ts` holds no `toSignal` and no `NavigationEnd` `filter` outside the
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
| Before the first `NavigationEnd`: `legacySurface: true`, tourist chrome, not chromeless | preserved | the computed returns the same default while `lastSuccessfulNavigation()` is `null` |
| On every `NavigationEnd`: root → leaf walk OR-ing `operatorConsole` / `operatorChrome`, leaf-only `legacySurface` | preserved | the same walk, run when `lastSuccessfulNavigation()` changes — set on the line before `NavigationEnd` is emitted |
| Not recomputed on `NavigationSkipped` / cancel / error | preserved | those paths never set `lastSuccessfulNavigation` |
| Recomputed on a same-URL `onSameUrlNavigation: 'reload'` navigation | preserved | a reload completes as a new navigation and sets the signal |
| Overlay close-on-navigation skips the navigation already in flight when the overlay opened | preserved | untouched: stays on the event stream (needs the `NavigationEnd` id) |
| Auth pair reads `mode` off `lastSuccessfulNavigation()?.finalUrl` | preserved | untouched (already the signal form) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The computed reads `routerState.snapshot` before the router has swapped it, showing the previous route's chrome | low | high | verified in router 22.1.4 source: `routerState` is assigned in the pre-activation step, `lastSuccessfulNavigation` set after activation on the line before `NavigationEnd`; AC-3 pins the switching | agent | open |
| R-2 | A naked snapshot walk flips the pre-navigation `legacySurface` default to `false` | high | low | explicit `null` guard returning the old default; parity ledger row 1 | agent | open |
| R-3 | The helper's fallback before any navigation differs from `router.url` | low | low | both serialise an empty `UrlTree` → `/`; AC-1 pins the value | agent | open |
| R-4 | A later reader "finishes" the migration by moving the constructor subscription onto a signal, breaking the overlay-navigation-id skip | med | med | the constructor TSDoc states the id dependency as contract; AC-4's specs would fail | agent | open |
| R-5 | `lastSuccessfulNavigation()` returns `null` typed as `Navigation \| null`; a `?.` chain hides a wrong assumption in strict TS | low | low | the null guard is explicit, not optional chaining, in `routeChrome` | agent | open |

## Open questions / Assumptions

- **Assumption:** the helper takes the `Router` as a parameter like `isActive()` rather than
  injecting it, so it needs no injection context and stays pure — *Owner:* agent · *Resolves by:*
  phase 0 (← confirm? the issue says "pure and stateless", which this reading satisfies)

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

**Stage pointer:** implement (phase 2 — gates)

**Next action:** phase 2 — full unit suite, the three mocked e2e suites, hygiene guards, retire the two merged plan docs; then draft → ready for review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — shared `currentUrl` helper + spec | ✅ | e8dc881e |
| 1 — shell `routeChrome` as a `computed()`, TSDoc, constructor comment | ✅ | phase-1 commit |
| 2 — lint / format / unit / mocked e2e, plan-doc retirement of the two merged plans | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

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
  `npx ng test --watch=false --include="src/app/app.spec.ts"` green before the change (baseline).
- [x] **Step 2: Replace the `toSignal` pipe** with a `computed()` guarded on
  `lastSuccessfulNavigation() === null` → the old default, else the same snapshot walk; drop the
  `toSignal`, `filter`, `map` imports the shell no longer uses (`takeUntilDestroyed`, `filter`
  stay for the constructor).
- [x] **Step 3: TSDoc** — `routeChrome` states the ordering guarantee; the constructor TSDoc
  states that the subscription stays event-driven because it needs the navigation id.
- [x] **Step 4: Run the shell specs** — same command → 40 passed, `app.spec.ts` untouched.
- [x] **Step 5: Commit** — `git commit -m "Derive the shell's route chrome from router signals (#981)"`

## Phase 2 — gates and close-out

- [ ] `npm run lint`, `npm run format:check`, `npm test`
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts theme-shell current-page-marker find-a-booking`
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` and the other hygiene guards
- [ ] `git rm` the two merged plan docs; grep their slugs outside `docs/plans/` (none cite them)
- [ ] Draft PR → merge `origin/main` → ready for review → review gate → Sonar gate → close-out

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | phase 0 (the helper) | every `NavigationEnd` pipe deriving URL or route state | `grep -rn "instanceof NavigationEnd" frontend/src/app --include=*.ts` | `app.ts` ×2 (routeChrome, the constructor), `operator-chrome.ts`, `admin-console.ts` ×2, `admin-console-tabs.ts`, `operator-console.ts` | the shell's `routeChrome` only (this slice); the constructor stays event-driven by design; the four console pipes are #982/#983 |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1, AC-2:** Run `npx ng test --watch=false --include="src/app/shared/current-url.spec.ts"` → 3 passed.
- [ ] **AC-3, AC-4, AC-5:** Run `npx ng test --watch=false --include="src/app/app.spec.ts"` → all passed, `app.spec.ts` untouched in the diff.
- [ ] **AC-6:** Run `grep -c "toSignal" frontend/src/app/app.ts` → `0`; `grep -c "instanceof NavigationEnd" frontend/src/app/app.ts` → `1` (the constructor).

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
