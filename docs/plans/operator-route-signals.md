# Operator surfaces: derive current URL and console tab from router signals — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** `OperatorChrome` and `OperatorConsole` read their route state from
`Router.lastSuccessfulNavigation()` (the shared `shared/current-url.ts` helper for the chrome's
`returnUrl`, a `computed()` for the console's active-tab path), with no `NavigationEnd` import
left in either file and every observable behaviour unchanged.

**Architecture:** The one decision is *which* signal form each surface takes. The chrome's
`returnUrl` is exactly "the current URL", so it takes the shared helper #981 promoted for this
purpose. The console's `currentTabPath` is not a URL but a walk of `route.snapshot.firstChild`
— a non-signal read — so it becomes a `computed()` **keyed on** `lastSuccessfulNavigation()`
and guarded on its `null` pre-navigation value, mirroring the shell's `routeChrome` (`app.ts`).
Both rest on the ordering guarantee verified in `@angular/router` 22.1.4
(`fesm2022/_router-chunk.mjs`): `routerState` is assigned on `BeforeActivateRoutes`, routes
activate, then `lastSuccessfulNavigation.set(...)` runs on the line before `NavigationEnd` is
emitted — a `computed` on the signal observes the same settled snapshot a `NavigationEnd`
subscriber did.

**Persistence:** N/A — frontend-only slice, no tables, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #982 (follow-up to #981 / PR #990; the admin half is #983).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
two of the issue's "specs pass unchanged" ACs name pins that do not exist; see D-1) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger, which surfaced the
pre-navigation initial-value delta in D-2) · `tdd` (pin-first: the new unit pins are written
and run green against the OLD event pipe before the migration, so the migration is proved by
their staying green; there is no red step for a refactor that adds no behaviour) ·
`riviera-review-overlay` (review gate — ran at ready-for-review over `bb57e915..97743d37`, layered on `/code-review` rung 1: five reviewers + the overlay walk, all RV-FE/RV-STYLE/RV-PROC items ✅ or N/A; one candidate finding F-1) · `riviera-docs-freshness`
(**ran** over `bb57e915..97743d37` — rename/removal grep, the counting sweep on the
`NavigationEnd`-pipe population, and the reverse map-walk; **0 findings**) ·
`riviera-frontend` (the helper stays in `shared/`; `operator/` imports it along the allowed
feature → `shared` direction; no folder move) · `angular-developer` + angular-cli MCP
(`get_best_practices`/`search_documentation` v22: `isActive()` and `Router.lastSuccessfulNavigation()`
are the documented signal reads of route state — "Check if a URL is active" on
angular.dev/guide/routing/read-route-state; angular.dev/api/router/Router documents
`lastSuccessfulNavigation` as `Signal<Navigation | null>` and angular.dev/api/router/Navigation
guarantees `finalUrl` is set after `RoutesRecognized`; `isActive` not used here because neither
surface needs a path *test*, both need a value) · `riviera-tailwind` (loaded for the maintainer's
Tailwind-doc check: the slice styles nothing — the two touched templates are untouched, and the
tab row's `scroll-px-6` / `scroll-smooth` / `scrollbar-none` classes the effect relies on are
verified against tailwindcss.com/docs `scroll-padding`, `scroll-behavior`, `scrollbar-width` as
first-party v4 utilities) · `playwright-cli` (the mocked
`operator-chrome`, `operator-console`, `unified-auth` suites re-run; no new spec — the `#710`
case already pins scroll-into-view on click and on reload in a real browser) ·
`riviera-local-debug` (unshallowed the clone; `ng test --include` for scoped runs;
`PW_CHROMIUM_EXECUTABLE` for the mocked e2e).

**Branch:** `claude/sdlc-982-rzrbd5` — the cloud session's designated remote branch stands
in for `feature/operator-route-signals` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given the shipped sources, when `OperatorChrome` and `OperatorConsole` are read,
  then neither imports `NavigationEnd` or `toSignal`, and
  `grep -n "import.*NavigationEnd\|instanceof NavigationEnd\|toSignal" frontend/src/app/operator/operator-chrome.ts frontend/src/app/operator/operator-console.ts`
  returns nothing (the console's TSDoc still *names* the event, as the shell's does, to state
  the ordering guarantee). *Seam:* the two component source files · *Pinned by:* the grep in
  **AC verification** below (an absence, per the #995 precedent — not test-pinned).
- [x] **AC-2:** Given the operator chrome rendered signed-out, when the page is `/` (no
  navigation yet), then the Sign in link's href is
  `/account/sign-in?audience=operator&returnUrl=%2F`; and when a navigation to
  `/operator/onboarding` completes, then the same link's `returnUrl` becomes
  `%2Foperator%2Fonboarding`. *Seam:* the rendered `[data-testid="opc-signin"]` anchor's
  `href` · *Pinned by:* `operator-chrome.spec.ts` → `offers the operator sign-in (not session
  controls) when signed out` (existing) + `follows a navigation: returnUrl is the page the
  operator is on (#982)` (new).
- [x] **AC-3:** Given the console mounted on a completed navigation whose active child route is
  `daily`, when the pills render, then the `Daily view` anchor's `scrollIntoView` is called
  (the on-load path); and when the active child becomes `venue` and a navigation completes,
  then the `Venue & commodities` anchor's `scrollIntoView` is called (the tab-switch path).
  *Seam:* the rendered `[data-testid="oc-tabs"]` anchors' `scrollIntoView` (jsdom does not
  implement it; the spec installs a spy on `HTMLElement.prototype` and restores it) ·
  *Pinned by:* `operator-console.spec.ts` → `OperatorConsole — active tab scroll-into-view
  (#710, #982)` (new, two cases).
- [x] **AC-4:** Given the console at `/operator/1/daily`, when only `:venueId` changes in place
  (the router reuses the instance), then the header and badge reload and the six tab links
  repoint at the new venue — unchanged. *Seam:* the rendered console shell · *Pinned by:*
  `operator-console.spec.ts` → `OperatorConsole — in-place venue param change (#180)`, passing
  unchanged.
- [x] **AC-5:** Given a fresh reader of each migrated signal, when they read its TSDoc, then it
  names the source signal (`Router.lastSuccessfulNavigation()`, via `currentUrl()` for the
  chrome) and, for the console, states the ordering guarantee. *Seam:* the TSDoc on
  `OperatorChrome.currentUrl` and `OperatorConsole.currentTabPath` · *Pinned by:* review
  (RV-STYLE-1) + `node scripts/check-inline-comments.mjs`.
- [x] **AC-6:** Given the branch, when `npm run lint`, `npm run format:check`, `npm test` and the
  mocked e2e `operator-chrome`, `operator-console`, `unified-auth` suites run, then all are
  green. *Seam:* the CI command set · *Pinned by:* the AC-verification commands + the PR's CI run.

## Non-goals

- **Not** touching `AdminConsole` / `AdminConsoleTabs` — they keep their `NavigationEnd` pipes
  until #983.
- **Not** touching the tab pills' active styling (`routerLinkActive` + `aria-current`) or the
  `OperatorActions` sign-out flow — out of scope per the issue.
- **Not** changing `shared/current-url.ts` — it is consumed as shipped by #981.
- **Not** adding e2e cases: the `#710` case already pins the on-load and on-click scroll in a
  real browser.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice replaces each surface's event pipe with a signal read, so every behaviour of the old
> pipe is enumerated.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Chrome: `returnUrl` is `router.url` at construction (`initialValue`) | **preserved in every reachable state** (see D-2) | `currentUrl()` is `/` until a navigation completes, then `router.url`. The shell renders `OperatorChrome` only when `routeChrome` says so, and `routeChrome` is `PRE_NAVIGATION_CHROME` (tourist chrome) until `lastSuccessfulNavigation()` is non-null — so a live chrome always exists on a completed navigation, where the two are equal. The unit spec's un-navigated `/` case is equal too. |
| Chrome: `returnUrl` updates on every `NavigationEnd` | **preserved** | `lastSuccessfulNavigation` is set on the line before `NavigationEnd` emits. Pinned by AC-2's new case. |
| Chrome: unchanged on `NavigationSkipped` / cancel / error | **preserved** | Neither sets `lastSuccessfulNavigation` (`current-url.spec.ts` pins the skipped case). |
| Console: `currentTabPath` initial value read from `route.snapshot.firstChild` at construction | **preserved at the effect** | The `computed` is lazy: its first read is the effect's first run, in the CD tick *after* the activating navigation has set `lastSuccessfulNavigation` (activation, the `set`, and `NavigationEnd` are one synchronous `tap`). The `null` guard only fires if the effect ever ran mid-navigation, which the router's pipeline does not allow; the reload leg of the `#710` e2e case proves the on-load scroll in a real browser. |
| Console: re-reads `firstChild` on every `NavigationEnd`, including a venue-param-only navigation that reuses the instance | **preserved** | Each completed navigation is a new `Navigation` object, so the `computed` re-runs; a same-path result is deduped by `Object.is` exactly as `toSignal`'s inner `signal.set` deduped it, so the effect fires on a tab change and stays quiet on a venue-only change — as today. |
| Console: the scroll-into-view effect depends on `tabLinks()` too | **preserved** | Untouched. |
| Both: the `toSignal` subscription's lifetime is the component's | **dropped — nothing to tear down** | A `computed` holds no subscription. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `computed` observes a stale `route.snapshot` (ordering) | low | med | Verified in the installed router source (Architecture); the `#710` e2e reload leg is the real-browser proof; AC-3 pins the tab-switch path with a real navigation in the unit spec | agent | closed — `26b32f7d`, e2e 19/19 |
| R-2 | The chrome's pre-navigation value (`/`) differs from `router.url` somewhere the chrome is live | low | low | Parity ledger row 1: the shell gates the chrome on `lastSuccessfulNavigation` being set; D-2 records the reasoning | agent | closed — D-2 verified |
| R-3 | The new `scrollIntoView` spy leaks across spec files (`isolate: false`) | low | med | The spy is installed in `beforeEach` and restored in `afterEach` of its own `describe` | agent | closed — full suite 2557/2557 green with the block in place |
| R-4 | Merge conflict with an in-flight branch | low | low | Checked at the intake gate: all five open PRs are Dependabot bumps; none touches `operator/`. No Flyway number in play (frontend-only) | agent | closed |

## Open questions / Assumptions

None open.

### Resolved

- **D-1 (drift, reconciled — `b78a79c0`, `26b32f7d`):** the issue's AC "specs pass unchanged … follows a navigation" and
  "… the active tab scrolls into view on load and on tab switch" name pins that do not exist:
  `operator-chrome.spec.ts` pins only the un-navigated `/` case, and no unit spec asserts
  `scrollIntoView` (jsdom lacks it; the code optional-calls it). Only the mocked e2e `#710`
  case pins the scroll. *Resolution:* add the pins (AC-2's new case, AC-3) pin-first, so
  "pass unchanged" becomes a verified claim. — *Owner:* agent · *Resolves by:* phases 0–1.
- **D-2 (assumption, verified at plan time):** `currentUrl()`'s pre-navigation `/` never reaches a live
  chrome, because the shell renders operator chrome only once `lastSuccessfulNavigation()` is
  non-null (`app.ts` `routeChrome`). *Verified* by reading `app.ts:163–165`. — *Owner:*
  agent · *Resolves by:* plan.

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
| FE-1 | `operator/operator-chrome.ts` | existing | standalone component | `currentUrl(router)` signal (was `toSignal` over `NavigationEnd`) | — |
| FE-2 | `operator/operator-console.ts` | existing | standalone component | `computed()` keyed on `Router.lastSuccessfulNavigation()` (was `toSignal` over `NavigationEnd`) | — |

**Standards:** standalone components, `inject()`, `computed()` for derived state; no deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — review gate run, Sonar gate read on the final head; merged via PR #997`

**Next action:** Merge close-out (`references/pr-gates.md` §3): issue #982 closes via the PR; no
epic checklist; nothing deferred; this doc is retired at the next close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `OperatorChrome` onto `currentUrl()` | ✅ | `b78a79c0` |
| 1 — `OperatorConsole.currentTabPath` as a `computed` | ✅ | `26b32f7d` |
| 2 — Full check suite + mocked e2e, draft PR → ready | ✅ | lint / format / 2557 unit / 19 e2e / 4 guards green on `26b32f7d`; PR #997 ready at `97743d37`, CI 7/7 green |
| 3 — Review gate + Sonar gate + close-out | ✅ | review gate over `bb57e915..97743d37` (F-1 below); close-out in the PR's last code-touching commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (prior-PR-comments agent, PR #990 precedent `2d8e10b1`) | `currentTabPath`'s TSDoc states the ordering without naming the step (`BeforeActivateRoutes`) the sibling `routeChrome` doc names. Scored 50 — below the 80 bar, no review comment posted. | fixed anyway in the close-out commit (a one-token consistency change, inside the diff's own lines) |

---

## File structure

- `docs/plans/operator-route-signals.md` — this plan.
- `docs/plans/retire-console-tab-route-key.md` — **retired** (PR #996's plan, merged at `bb57e915`; `riviera-docs-freshness` § *Plan-doc retirement*, the sweep #996 itself ran for PR #994's doc). No citation outside `docs/plans/` refers to the slug.
- `frontend/src/app/operator/operator-chrome.ts` — `currentUrl` from the shared helper; drop `NavigationEnd`/`toSignal`/rxjs imports.
- `frontend/src/app/operator/operator-chrome.spec.ts` — the "follows a navigation" pin (AC-2).
- `frontend/src/app/operator/operator-console.ts` — `currentTabPath` as a `computed` keyed on `lastSuccessfulNavigation()`; drop `NavigationEnd`/`toSignal`/`filter`/`map` imports.
- `frontend/src/app/operator/operator-console.spec.ts` — the scroll-into-view pins (AC-3).

---

## Phase 0 — `OperatorChrome` onto `currentUrl()`

**Files:** Modify `frontend/src/app/operator/operator-chrome.ts` · Test `frontend/src/app/operator/operator-chrome.spec.ts`

- [x] **Step 1: Write the pin** — a signed-out render, then `router.navigateByUrl('/operator/onboarding')`
  (a real route in the spec's `provideRouter`), `detectChanges`, assert the href's `returnUrl`.
- [x] **Step 2: Run it against the old pipe, verify it passes** —
  `npx ng test --include='src/app/operator/operator-chrome.spec.ts'` → PASS (pin-first, no red step).
- [x] **Step 3: Migrate** — `private readonly currentUrl = currentUrl(this.router);` with TSDoc naming the source signal; remove the `NavigationEnd`, `toSignal`, `filter`, `map` imports.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; `grep -n NavigationEnd` on the file → nothing.
- [x] **Step 5: Generalization-audit pass** — population: every `toSignal(this.router.events…NavigationEnd` in `frontend/src`; enumerated below; the two `admin/` members are #983's.
- [x] **Step 6: Commit** — `git commit -m "Derive OperatorChrome's returnUrl from the shared current-URL signal (#982)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit.

## Phase 1 — `OperatorConsole.currentTabPath` as a `computed`

**Files:** Modify `frontend/src/app/operator/operator-console.ts` · Test `frontend/src/app/operator/operator-console.spec.ts`

- [x] **Step 1: Write the pins** — a new `describe` with a `scrollIntoView` spy on
  `HTMLElement.prototype` (restored in `afterEach`); the route stub gains a settable
  `snapshot.firstChild.routeConfig.path`; case 1 completes a navigation, mounts with
  `firstChild` = `daily`, asserts the spy fired on the `Daily view` anchor; case 2 then sets
  `firstChild` = `venue`, completes another navigation, asserts the spy fired on the
  `Venue & commodities` anchor.
- [x] **Step 2: Run against the old pipe, verify it passes** —
  `npx ng test --include='src/app/operator/operator-console.spec.ts'` → PASS.
- [x] **Step 3: Migrate** — `computed(() => this.router.lastSuccessfulNavigation() === null ? undefined : this.route.snapshot.firstChild?.routeConfig?.path)` with TSDoc stating the source signal and the ordering guarantee; remove `NavigationEnd`, `toSignal`, `filter`, `map` imports.
- [x] **Step 4: Run it, verify it passes** — same command → PASS; `grep -n "import.*NavigationEnd"` → nothing.
- [x] **Step 5: Generalization-audit pass** — same population as phase 0; no new members.
- [x] **Step 6: Commit** — `git commit -m "Derive the operator console's active tab from the router's navigation signal (#982)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit.

## Phase 2 — Full check suite, mocked e2e, PR

- [x] `npm run lint` · `npm run format:check` · `npm test` → green (225 files, 2557 tests).
- [x] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/operator-chrome.e2e.ts e2e/operator-console.e2e.ts e2e/unified-auth.e2e.ts` → 19 passed.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean (and `check-inline-comments`, `check-touch-target`, `check-focus-posture`).
- [x] Draft PR #997; ready for review after phase 2 (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | plan / phase 0 | every `toSignal` fed by the router's `NavigationEnd` event stream | `grep -rn "instanceof NavigationEnd" frontend/src --include=*.ts \| grep -v spec` | `operator-chrome.ts`, `operator-console.ts`, `admin-console.ts` ×2, `admin-console-tabs.ts`, `app.ts` (constructor, event-shaped by design — #981) | the two `operator/` sites are this slice; the three `admin/` sites are #983; `app.ts` stays |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `grep -n "import.*NavigationEnd\|instanceof NavigationEnd\|toSignal" frontend/src/app/operator/operator-chrome.ts frontend/src/app/operator/operator-console.ts` → nothing.
- [x] **AC-2:** `npx ng test --include='src/app/operator/operator-chrome.spec.ts'` → 6 passed (`b78a79c0`).
- [x] **AC-3 / AC-4:** `npx ng test --include='src/app/operator/operator-console.spec.ts'` → 16 passed (`26b32f7d`).
- [x] **AC-5:** `node scripts/check-inline-comments.mjs --diff origin/main` → clean; review at the gate.
- [x] **AC-6:** the phase-2 commands green locally (above); PR #997's CI on `97743d37` 7/7 green (backend, frontend, hygiene, CodeQL ×3, Sonar scan).

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
