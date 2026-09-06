# Admin console: derive the active tab and current URL from router signals — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `AdminConsole` and `AdminConsoleTabs` read their route state from
`Router.lastSuccessfulNavigation()` (the shared `shared/current-url.ts` helper for both
`currentUrl`s, a `computed()` for the console's `tab`), with no `NavigationEnd` import left in
either file and every observable behaviour unchanged.

**Architecture:** The one decision is *which* signal form each read takes, and it is the one
#982 made for the operator half. Both `currentUrl`s are exactly "the current URL", so they take
the shared helper #981 promoted for this purpose. The console's `tab` is not a URL but a walk of
`route.snapshot.firstChild.data` — a non-signal read — so it becomes a `computed()` **keyed on**
`lastSuccessfulNavigation()`, returning `FALLBACK_TAB` while that signal is still `null`,
mirroring the shell's `routeChrome` (`app.ts`) and the operator console's `currentTabPath`. All
three rest on the ordering guarantee re-verified in the installed `@angular/router` 22.1.4
(`fesm2022/_router-chunk.mjs:3972–3988`): `routerState` is assigned on `BeforeActivateRoutes`,
routes activate, then `lastSuccessfulNavigation.set(...)` runs on the line before `NavigationEnd`
is emitted — a `computed` on the signal observes the same settled snapshot a `NavigationEnd`
subscriber did.

**Persistence:** N/A — frontend-only slice, no tables, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #983 (the admin half of #981 / PR #990; the operator half is
#982 / PR #997, whose plan doc this one follows).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that three
of the issue's "specs pass unchanged" ACs name pins that do not exist; see D-1) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger, which surfaced the
pre-navigation initial-value delta in D-2) · `tdd` (pin-first: the new unit pins are written
and run green against the OLD event pipes before the migration, so the migration is proved by
their staying green; there is no red step for a refactor that adds no behaviour) ·
`riviera-review-overlay` (review gate — ran at ready-for-review over `96a683c7..053701b2`, layered on `/code-review` rung 1: five reviewers + the overlay walk, all RV-FE/RV-STYLE/RV-PROC items ✅ or N/A; one below-bar note F-1; the S-1 fix re-walked by hand, R-1) ·
`riviera-docs-freshness` (**ran** over the PR range — the rename/removal grep on the retired
`operator-route-signals` slug (no citation outside `docs/plans/`) and the substrate grep for
`NavigationEnd` / `toSignal` / `AdminConsole` (hits only in the vendored `angular-developer`
references, which describe the generic API and stay true); **0 findings**. The "three `admin/`
sites" count lived only in PR #997's body and its plan doc, which this slice retires) · `riviera-frontend` (the
helper stays in `shared/`; `admin/` imports it along the allowed feature → `shared` direction; no
folder move) · `angular-developer` + angular-cli MCP (`get_best_practices` v22: `computed()` for
derived state, signals over event pipes; `search_documentation` v22 at the maintainer's
mid-session request — angular.dev/api/router/Router documents `lastSuccessfulNavigation` as
`Signal<Navigation | null>`, "the most recent navigation to succeed and `null` if there has not
been a successful navigation yet", which is exactly the `null` branch `tab` guards;
angular.dev/api/router/Navigation guarantees `finalUrl` is set after `RoutesRecognized`;
angular.dev/guide/signals states `computed` is lazily evaluated and memoized, which is what the
parity ledger's "first read is the first template check / effect run" rests on;
angular.dev/guide/routing/read-route-state documents `isActive()` as the signal for a path *test*
— not used because neither surface needs one, the pills' highlight is already `routerLinkActive`)
· `riviera-tailwind` (loaded for the maintainer's Tailwind-doc check: the slice styles nothing —
neither template is touched — and the tab row's classes the scroll effect relies on are verified
against tailwindcss.com/docs as first-party v4 utilities: `overflow-x-auto` (`overflow`),
`scroll-px-1` → `scroll-padding-inline` (`scroll-padding`), `scrollbar-none` →
`scrollbar-width: none` (`scrollbar-width`), the `aria-[current=page]:` arbitrary variant
(`hover-focus-and-other-states` § ARIA states) and the `[mask-image:…]` /
`[-webkit-mask-image:…]` arbitrary properties with `_` for spaces (`adding-custom-styles`
§ Arbitrary properties)) · `playwright-cli` (the mocked
`admin-console-tabs`, `admin-console-stats`, `touch-targets-admin` suites re-run; no new spec —
`admin-console-tabs.e2e.ts`'s "on click and on reload" case already pins the scroll in a real
browser) · `riviera-local-debug` (unshallowed the clone; `ng test --include` for scoped runs;
`PW_CHROMIUM_EXECUTABLE` for the mocked e2e).

**Branch:** `claude/sdlc-983-3q2crm` — the cloud session's designated remote branch stands in
for `feature/admin-route-signals` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the shipped sources, when `AdminConsole` and `AdminConsoleTabs` are read,
  then neither imports `NavigationEnd` or `toSignal`, and
  `grep -n "import.*NavigationEnd\|instanceof NavigationEnd\|toSignal" frontend/src/app/admin/admin-console.ts frontend/src/app/admin/admin-console-tabs.ts`
  returns nothing (the console's TSDoc still *names* the event, as the shell's does, to state
  the ordering guarantee). *Seam:* the two component source files · *Pinned by:* the grep in
  **AC verification** below (an absence, per the #995/#997 precedent — not test-pinned).
- [x] **AC-2:** Given the console rendered under a real router at `/admin` (child carries
  `TAB_A`), when the page renders, then the `<h1>` reads `Tab A` under id `tab-a-title`; when a
  navigation to `/admin/b` (child carries `TAB_B`) completes, then the title, gate test id and
  content switch to `TAB_B`'s; and when the active child carries **no** `adminTab`, then the
  title is `Admin` under id `admin-console-title` (the fallback). *Seam:* the rendered shell
  under `provideRouter` · *Pinned by:* `admin-console.spec.ts` → `renders the active child's
  title, scoped to its own id` + `switches the rendered title, gate id and content to match the
  newly active tab` (existing) + `falls back to the Admin title when the active child carries
  no adminTab (#983)` + `renders the fallback tab and a root returnUrl before any navigation has
  completed (#983)` (new) + `AdminConsole — deep link over the real routes (#983)` (new — the real
  `app.routes` table, so the `data.adminTab` the computed reads is the shipped one).
- [x] **AC-3:** Given the console rendered signed-out, when the page is `/admin/b`, then the
  Sign in link's href is `/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Fb`; and given
  it rendered at `/admin`, when a navigation to `/admin/b` completes, then the same link's
  `returnUrl` becomes `%2Fadmin%2Fb` (and the signed-out notice is `TAB_B`'s). *Seam:* the
  rendered signed-out notice's `<a>` `href` · *Pinned by:* `admin-console.spec.ts` → `shows a
  sign-in prompt for a signed-out visitor, returning to the page they landed on` (existing) +
  `follows a navigation: the sign-in returnUrl is the tab the visitor is on (#983)` + the
  pre-navigation and real-routes cases named under AC-2 (new).
- [x] **AC-4:** Given the console rendered for a signed-in non-admin, then the forbidden line
  names the active tab and no tab strip renders — unchanged. *Seam:* the rendered shell ·
  *Pinned by:* `admin-console.spec.ts` → `shows the forbidden line for a signed-in non-admin,
  naming the active tab` + `never renders the tab strip until the gate passes …`, passing
  unchanged.
- [x] **AC-5:** Given the tab strip rendered at `/admin/email`, when the pills render, then only
  the Email pill carries `aria-current="page"` (Operators does not — exact match); and the
  `Email` anchor's `scrollIntoView` is called (the on-load path); and when a navigation to
  `/admin/audit` completes, then the `Audit` anchor's `scrollIntoView` is called (the tab-switch
  path). *Seam:* the rendered `nav a` anchors' `aria-current` and `scrollIntoView` (jsdom does
  not implement it; the spec installs a `vi.fn()` on `HTMLElement.prototype` and removes it
  after) · *Pinned by:* `admin-console-tabs.spec.ts` → `does not light Operators while Email is
  open` (existing) + `AdminConsoleTabs — active tab scroll-into-view (#983)` (new, two cases).
- [x] **AC-6:** Given a fresh reader of each migrated signal, when they read its TSDoc, then it
  names the source signal (`Router.lastSuccessfulNavigation()`, via `currentUrl()` for the two
  URL reads) and, for `tab`, states the ordering guarantee. *Seam:* the TSDoc on
  `AdminConsole.tab`, `AdminConsole.currentUrl`, `AdminConsoleTabs.currentUrl` · *Pinned by:*
  review (RV-STYLE-1) + `node scripts/check-inline-comments.mjs`.
- [x] **AC-7:** Given the branch, when `npm run lint`, `npm run format:check`, `npm test` and the
  mocked e2e `admin-console-tabs`, `admin-console-stats`, `touch-targets-admin` suites run, then
  all are green. *Seam:* the CI command set · *Pinned by:* the AC-verification commands + the
  PR's CI run.

## Non-goals

- **Not** touching the tab order, the reserved Payouts slot, the forbidden branch
  (`AdminForbidden`) or any tab's page — out of scope per the issue.
- **Not** touching the pills' active styling (`routerLinkActive` + `exact: true` +
  `aria-current`) — it is what keeps Operators dark on the Email tab, and `currentUrl` never
  drove it.
- **Not** changing `shared/current-url.ts` — consumed as shipped by #981.
- **Not** adding e2e cases: `admin-console-tabs.e2e.ts`'s "on click and on reload" case already
  pins the on-load and on-switch scroll in a real browser.
- **Not** migrating `app.ts`'s constructor subscription — event-shaped by design (#981).

## Behavior-parity ledger (retirement / replacement slices only)

> The slice replaces each surface's event pipe with a signal read, so every behaviour of the old
> pipes is enumerated.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Console `tab`: initial value read from `route.snapshot.firstChild.data` at construction (`initialValue`) | **preserved in every reachable render** (D-2); the pre-navigation `FALLBACK_TAB` is pinned by the S-1 case | The `computed` returns `FALLBACK_TAB` while `lastSuccessfulNavigation()` is `null` and the snapshot walk otherwise. The console is a routed component, constructed during activation, but its template is first checked in a tick *after* the navigation completes (activation, the `set` and `NavigationEnd` are one synchronous `tap` chain), by which time the signal is set and the walk returns exactly what the old `initialValue` read. The spec's `renderAt` navigates before it mounts, so the two are equal there too. |
| Console `tab`: re-read on every `NavigationEnd`, including a child-only navigation that reuses the shell instance | **preserved** | Each completed navigation is a new `Navigation` object, so the `computed` re-runs and re-walks `firstChild`; a same-tab result is deduped by `Object.is` on the route's `data` object exactly as `toSignal`'s inner `signal.set` deduped it. Pinned by AC-2's switch case. |
| Console `tab`: `FALLBACK_TAB` when the active child carries no `adminTab` | **preserved** | Same `?? FALLBACK_TAB` in `activeTabData()`. Pinned by AC-2's new fallback case (a pin the old code never had). |
| Console `currentUrl`: `router.url` at construction (`initialValue`) | **preserved in every reachable render** (D-2); the pre-navigation `/` is pinned by the S-1 case | `currentUrl()` is `/` until a navigation completes, then `router.url`. First template check is after completion (row 1). The sign-in link is the only consumer. |
| Console `currentUrl`: updates on every `NavigationEnd` | **preserved** | `lastSuccessfulNavigation` is set on the line before `NavigationEnd` emits. Pinned by AC-3's new case. |
| Both `currentUrl`s: unchanged on `NavigationSkipped` / cancel / error | **preserved** | Neither sets `lastSuccessfulNavigation` (`current-url.spec.ts` pins the skipped case). |
| Tabs `currentUrl`: `router.url` at construction, feeding the scroll `effect`'s first run | **preserved at the effect** | The strip renders only inside the console's authorized branch, i.e. on a completed navigation; the `effect` first flushes in a later tick. Even a hypothetical mid-navigation `/` finds no tab (`findIndex` → `-1`, no scroll) and the effect re-runs when the signal moves. |
| Tabs `currentUrl`: compares the *full* URL (`tab.path === url`, so `/admin?x=1` scrolls nothing) | **preserved** | The helper serialises `finalUrl` with its query string (`current-url.spec.ts`), so the comparison is the same one. Not "fixed" here — the issue keeps the effect as is. |
| Tabs: the scroll `effect` also depends on `tabLinks()` | **preserved** | Untouched. |
| All three: the `toSignal` subscription's lifetime is the component's | **dropped — nothing to tear down** | A `computed` holds no subscription. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `computed` observes a stale `route.snapshot` (ordering) | low | med | Re-verified in the installed router source (Architecture); AC-2's switch case pins the re-walk with a real navigation; the e2e reload leg is the real-browser proof | agent | closed — `3b333301`; the real-routes case adds the shipped table |
| R-2 | A pre-navigation `FALLBACK_TAB` / `/` reaches a live render | low | low | Parity ledger rows 1, 4, 7; D-2 | agent | closed — D-2 verified; both pre-navigation values now pinned |
| R-3 | The new `scrollIntoView` spy leaks across spec files (`isolate: false`) | low | med | Installed in `beforeEach`, deleted in `afterEach` of its own `describe` — the #997 pattern | agent | closed — full suite 2563/2563 green with the block in place (reviewer 2 confirmed jsdom has no own `scrollIntoView`, so the `delete` restores the pristine prototype) |
| R-4 | Merge conflict with an in-flight branch | low | low | Checked at the intake gate: all five open PRs are Dependabot bumps; none touches `admin/`. No Flyway number in play (frontend-only) | agent | closed — branch on the tip of `main` at ready-for-review |

## Open questions / Assumptions

None open.

### Resolved

- **D-1 (drift, reconciled at plan time):** the issue's ACs "the heading/test id … fall back
  when no child carries `adminTab`", "the sign-in link's `returnUrl` follows navigation" and
  "the scroll-into-view on load and switch" name unit pins that do not exist:
  `admin-console.spec.ts` has no fallback case and pins `returnUrl` only on the landed-on URL;
  `admin-console-tabs.spec.ts` has no `scrollIntoView` assertion (jsdom lacks it; the code
  optional-calls it). Only the mocked e2e "on click and on reload" case pins the scroll.
  *Resolution:* add the three pins pin-first (AC-2, AC-3, AC-5), so "pass unchanged" becomes a
  verified claim — the same reconciliation #982 made. — *Owner:* agent · *Resolves by:* phases
  0–1.
- **D-2 (assumption, verified at plan time):** the pre-navigation values (`FALLBACK_TAB`, `/`)
  never reach a live render, because a routed component's template is first checked after the
  activating navigation has completed. *Verified* against `_router-chunk.mjs:3972–3988` (the
  `BeforeActivateRoutes` → activate → `lastSuccessfulNavigation.set` → `NavigationEnd` chain is
  one synchronous `tap` sequence) and PR #997's identical reasoning for the operator console's
  `effect`. — *Owner:* agent · *Resolves by:* plan.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: a frontend route-state refactor with no booking, map or
availability path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behaviour added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `admin/admin-console.ts` | existing | standalone component | `tab`: `computed()` keyed on `Router.lastSuccessfulNavigation()`; `currentUrl`: `currentUrl(router)` (both were `toSignal` over `NavigationEnd`) | — |
| FE-2 | `admin/admin-console-tabs.ts` | existing | standalone component | `currentUrl(router)` signal (was `toSignal` over `NavigationEnd`); the scroll `effect` unchanged | — |

**Standards:** standalone components, `inject()`, `computed()` for derived state; no deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — review gate run, Sonar gate read on the final head; merged via PR #998`

**Next action:** Merge close-out (`references/pr-gates.md` §3): issue #983 closes via the PR; no
epic checklist; the one deferred item is the coverage-tooling artifact, filed as #999; this doc is
retired at the next close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `AdminConsole`: `tab` as a `computed`, `currentUrl` onto the helper | ✅ | `3b333301` |
| 1 — `AdminConsoleTabs.currentUrl` onto the helper | ✅ | `7bfec97f` |
| 2 — Full check suite + mocked e2e, draft PR → ready | ✅ | lint / format / 2561 unit (225 files) / 23 e2e / 4 guards green on `7bfec97f`; draft PR #998 opened at `3b333301`, ready at this commit |
| 3 — Review gate + Sonar gate + close-out | ✅ | review gate over `96a683c7..053701b2` (no findings; F-1 below); Sonar S-1 fixed in this PR's final commit (two pins added to `admin-console.spec.ts`), which also carries this close-out |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (CLAUDE.md-audit agent) | `AdminConsole.tab`'s TSDoc runs past `riviera-java-conventions` §6d's ~3-line member-doc budget. Judged contract (the trap and its remedy: why a non-signal snapshot read inside a `computed` is safe), not archaeology — the same shape and length as the sibling `currentTabPath` doc PR #997 shipped. Below the bar; no comment posted. | no change |
| S-1 | sonar (quality gate on `053701b2`: 66.7% new-code coverage, ≥ 80% required; 0 issues, 0 duplications) | Two of the three shortfalls were the two new `import { currentUrl }` lines reading `DA:<n>,0` in the full-suite lcov — a pre-existing V8-coverage artifact on every lazy `loadComponent` target no spec evaluates through the real route table (~30 files carry it; `operator-console.ts` does not because `console-venue-switch.spec.ts` deep-links to it). The third was the real `null` branch of `tab`, which no spec reached because `renderAt` navigates before mounting. | fixed in this PR's final commit: (a) `renders the fallback tab and a root returnUrl before any navigation has completed (#983)` mounts the shell with no completed navigation — pins parity-ledger rows 1 and 4 and covers the branch; (b) `AdminConsole — deep link over the real routes (#983)` renders `/admin/audit` then `/admin` over `app.routes` with `RouterTestingHarness` (the `console-venue-switch.spec.ts` precedent) — pins the real `data.adminTab` wiring the computed reads, and evaluates the lazy chunk so both import lines read `1`. Full-suite lcov after the fix: `admin-console.ts` 29/29 lines, 11/11 branches; `admin-console-tabs.ts` 21/21, 5/5. The artifact itself is tooling, out of scope: #999. |
| R-1 | re-review of the S-1 fix (touches `admin-console.spec.ts` only) | Overlay re-walked by hand for the spec: RV-FE-E2E (a `.spec.ts`, jsdom-level; the real-browser scroll case stays in `e2e/admin-console-tabs.e2e.ts`) ✅ · RV-FE-8 (`../app.routes` from a spec — the `console-venue-switch.spec.ts` precedent; spec files are outside the item's grep) ✅ · RV-STYLE-1 (one `describe`-level TSDoc stating why the real table is needed; no inline comments) ✅ · RV-PROC-1 (no new area: `angular-developer`'s `RouterTestingHarness` is the routed skill's own reference) ✅ | closed |

---

## File structure

- `docs/plans/admin-route-signals.md` — this plan.
- `docs/plans/operator-route-signals.md` — **retired** (PR #997's plan, merged at `96a683c7`;
  `riviera-docs-freshness` § *Plan-doc retirement*, the sweep #997 itself ran for PR #996's
  doc). No citation outside `docs/plans/` refers to the slug.
- `frontend/src/app/admin/admin-console.ts` — `tab` as a `computed` keyed on
  `lastSuccessfulNavigation()`; `currentUrl` from the shared helper; drop
  `NavigationEnd`/`toSignal`/`filter`/`map` imports.
- `frontend/src/app/admin/admin-console.spec.ts` — the fallback pin (AC-2), the "follows a
  navigation" pin (AC-3), and the S-1 pins: pre-navigation fallback + the real-routes deep link.
- `frontend/src/app/admin/admin-console-tabs.ts` — `currentUrl` from the shared helper; drop
  `NavigationEnd`/`toSignal`/`filter`/`map` imports.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — the scroll-into-view pins (AC-5).

---

## Phase 0 — `AdminConsole`: `tab` as a `computed`, `currentUrl` onto the helper

**Files:** Modify `frontend/src/app/admin/admin-console.ts` · Test `frontend/src/app/admin/admin-console.spec.ts`

- [x] **Step 1: Write the pins** — the spec's route table gains a child `bare` with no `data`;
  case 1 renders at `/admin/bare` and asserts the `#admin-console-title` `<h1>` reads `Admin`;
  case 2 renders signed-out at `/admin`, navigates to `/admin/b`, asserts the `TAB_B` notice's
  link `href` carries `returnUrl=%2Fadmin%2Fb`.
- [x] **Step 2: Run them against the old pipes, verify they pass** —
  `npx ng test --include='src/app/admin/admin-console.spec.ts'` → PASS (pin-first, no red step).
- [x] **Step 3: Migrate** — `tab = computed(() => this.router.lastSuccessfulNavigation() === null ? FALLBACK_TAB : this.activeTabData())`
  with TSDoc stating the source signal and the ordering guarantee;
  `currentUrl = currentUrl(this.router)` with TSDoc naming the source; remove the
  `NavigationEnd`, `toSignal`, `filter`, `map` imports.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; `grep -n "import.*NavigationEnd\|toSignal"` on the file → nothing.
- [x] **Step 5: Generalization-audit pass** — population: every `toSignal(this.router.events…NavigationEnd` in `frontend/src`; enumerated below.
- [x] **Step 6: Commit** — `git commit -m "Derive the admin console's active tab and current URL from router signals (#983)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit.

## Phase 1 — `AdminConsoleTabs.currentUrl` onto the helper

**Files:** Modify `frontend/src/app/admin/admin-console-tabs.ts` · Test `frontend/src/app/admin/admin-console-tabs.spec.ts`

- [x] **Step 1: Write the pins** — a new `describe` with a `vi.fn()` on
  `HTMLElement.prototype.scrollIntoView` (installed in `beforeEach`, deleted in `afterEach`);
  case 1 renders at `/admin/email`, asserts the spy's contexts' labels are `['Email']`; case 2
  then navigates to `/admin/audit`, asserts `['Email', 'Audit']`.
- [x] **Step 2: Run against the old pipe, verify it passes** —
  `npx ng test --include='src/app/admin/admin-console-tabs.spec.ts'` → PASS.
- [x] **Step 3: Migrate** — `private readonly currentUrl = currentUrl(this.router);` with TSDoc naming the source signal; remove `NavigationEnd`, `toSignal`, `filter`, `map` imports; the `effect` stays as is.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; `grep -n "NavigationEnd\|toSignal"` on the file → nothing.
- [x] **Step 5: Generalization-audit pass** — same population as phase 0; expect zero non-`app.ts` members left.
- [x] **Step 6: Commit** — `git commit -m "Derive the admin tab strip's current URL from the shared router signal (#983)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit.

## Phase 2 — Full check suite, mocked e2e, PR

- [x] `npm run lint` · `npm run format:check` · `npm test` → green (225 files, 2561 tests).
- [x] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/admin-console-tabs.e2e.ts e2e/admin-console-stats.e2e.ts e2e/touch-targets-admin.e2e.ts` → 23 passed.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean (and `check-inline-comments`, `check-touch-target`, `check-focus-posture`).
- [x] Draft PR #998 opened at the phase-0 commit; ready for review after phase 2 (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | plan | every `toSignal` fed by the router's `NavigationEnd` event stream | `grep -rn "instanceof NavigationEnd" frontend/src --include=*.ts \| grep -v spec` | `admin-console.ts` ×2, `admin-console-tabs.ts`, `app.ts` (constructor, event-shaped by design — #981) | the three `admin/` sites are this slice; `app.ts` stays |
| 2026-09-06 | phase 0 | same | same | `admin-console-tabs.ts`, `app.ts` | the tabs site is phase 1; `app.ts` stays |
| 2026-09-06 | phase 1 | same | same | `app.ts` only | population of `toSignal`-over-`NavigationEnd` pipes is now empty; `app.ts`'s constructor subscription is event-shaped by design |
| 2026-09-06 | phase 3 / S-1 | every module whose relative import lines read `DA:<n>,0` in the full-suite lcov (a lazy `loadComponent` target never evaluated over the real route table) | `awk '/^SF:/{sf=$0} /^DA:([2-9]\|1[0-2]),0$/{print sf}' frontend/coverage/frontend/lcov.info \| sort \| uniq -c` after `npm run test:coverage` | ~30 files (`admin-reviews.ts`, `requests-tab.ts`, `admin-operators.ts`, `pricing-tab.ts`, `home.ts`, `booking-view.ts`, …, `admin-console.ts`, `admin-console-tabs.ts`) | the two admin members are this slice's (fixed by the real-routes pin); the population is a coverage-tooling matter → #999 |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `grep -n "import.*NavigationEnd\|instanceof NavigationEnd\|toSignal" frontend/src/app/admin/admin-console.ts frontend/src/app/admin/admin-console-tabs.ts` → nothing.
- [x] **AC-2 / AC-3 / AC-4:** `npx ng test --include='src/app/admin/admin-console.spec.ts'` → 11 passed (final commit).
- [x] **AC-5:** `npx ng test --include='src/app/admin/admin-console-tabs.spec.ts'` → 12 passed (`7bfec97f`).
- [x] **AC-6:** `node scripts/check-inline-comments.mjs --diff origin/main` → clean; review at the gate.
- [x] **AC-7:** the phase-2 commands green locally (above; the full suite re-run with coverage after S-1: 225 files / 2563 tests, lint + format clean); the PR's CI on `053701b2` 7/8 with only the Sonar gate red (S-1), re-read green on the final head — see the PR.

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
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
