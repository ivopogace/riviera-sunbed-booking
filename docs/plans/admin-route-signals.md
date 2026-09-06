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
`riviera-review-overlay` (review gate — due at ready-for-review, layered on `/code-review`) ·
`riviera-docs-freshness` (due at close-out over the PR range; the counting sweep on the
`NavigationEnd`-pipe population is the one fact this slice changes — PR #997's body and plan doc
name "three `admin/` sites" as #983's, and both retire with this slice) · `riviera-frontend` (the
helper stays in `shared/`; `admin/` imports it along the allowed feature → `shared` direction; no
folder move) · `angular-developer` + angular-cli MCP (`get_best_practices` v22: `computed()` for
derived state, signals over event pipes; `Router.lastSuccessfulNavigation()` is the documented
`Signal<Navigation | null>`; `isActive()` not used because neither surface needs a path *test* —
the pills' highlight is already `routerLinkActive`) · `playwright-cli` (the mocked
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
  no adminTab (#983)` (new).
- [x] **AC-3:** Given the console rendered signed-out, when the page is `/admin/b`, then the
  Sign in link's href is `/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Fb`; and given
  it rendered at `/admin`, when a navigation to `/admin/b` completes, then the same link's
  `returnUrl` becomes `%2Fadmin%2Fb` (and the signed-out notice is `TAB_B`'s). *Seam:* the
  rendered signed-out notice's `<a>` `href` · *Pinned by:* `admin-console.spec.ts` → `shows a
  sign-in prompt for a signed-out visitor, returning to the page they landed on` (existing) +
  `follows a navigation: the sign-in returnUrl is the tab the visitor is on (#983)` (new).
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
- [ ] **AC-6:** Given a fresh reader of each migrated signal, when they read its TSDoc, then it
  names the source signal (`Router.lastSuccessfulNavigation()`, via `currentUrl()` for the two
  URL reads) and, for `tab`, states the ordering guarantee. *Seam:* the TSDoc on
  `AdminConsole.tab`, `AdminConsole.currentUrl`, `AdminConsoleTabs.currentUrl` · *Pinned by:*
  review (RV-STYLE-1) + `node scripts/check-inline-comments.mjs`.
- [ ] **AC-7:** Given the branch, when `npm run lint`, `npm run format:check`, `npm test` and the
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
| Console `tab`: initial value read from `route.snapshot.firstChild.data` at construction (`initialValue`) | **preserved in every reachable render** (D-2) | The `computed` returns `FALLBACK_TAB` while `lastSuccessfulNavigation()` is `null` and the snapshot walk otherwise. The console is a routed component, constructed during activation, but its template is first checked in a tick *after* the navigation completes (activation, the `set` and `NavigationEnd` are one synchronous `tap` chain), by which time the signal is set and the walk returns exactly what the old `initialValue` read. The spec's `renderAt` navigates before it mounts, so the two are equal there too. |
| Console `tab`: re-read on every `NavigationEnd`, including a child-only navigation that reuses the shell instance | **preserved** | Each completed navigation is a new `Navigation` object, so the `computed` re-runs and re-walks `firstChild`; a same-tab result is deduped by `Object.is` on the route's `data` object exactly as `toSignal`'s inner `signal.set` deduped it. Pinned by AC-2's switch case. |
| Console `tab`: `FALLBACK_TAB` when the active child carries no `adminTab` | **preserved** | Same `?? FALLBACK_TAB` in `activeTabData()`. Pinned by AC-2's new fallback case (a pin the old code never had). |
| Console `currentUrl`: `router.url` at construction (`initialValue`) | **preserved in every reachable render** (D-2) | `currentUrl()` is `/` until a navigation completes, then `router.url`. First template check is after completion (row 1). The sign-in link is the only consumer. |
| Console `currentUrl`: updates on every `NavigationEnd` | **preserved** | `lastSuccessfulNavigation` is set on the line before `NavigationEnd` emits. Pinned by AC-3's new case. |
| Both `currentUrl`s: unchanged on `NavigationSkipped` / cancel / error | **preserved** | Neither sets `lastSuccessfulNavigation` (`current-url.spec.ts` pins the skipped case). |
| Tabs `currentUrl`: `router.url` at construction, feeding the scroll `effect`'s first run | **preserved at the effect** | The strip renders only inside the console's authorized branch, i.e. on a completed navigation; the `effect` first flushes in a later tick. Even a hypothetical mid-navigation `/` finds no tab (`findIndex` → `-1`, no scroll) and the effect re-runs when the signal moves. |
| Tabs `currentUrl`: compares the *full* URL (`tab.path === url`, so `/admin?x=1` scrolls nothing) | **preserved** | The helper serialises `finalUrl` with its query string (`current-url.spec.ts`), so the comparison is the same one. Not "fixed" here — the issue keeps the effect as is. |
| Tabs: the scroll `effect` also depends on `tabLinks()` | **preserved** | Untouched. |
| All three: the `toSignal` subscription's lifetime is the component's | **dropped — nothing to tear down** | A `computed` holds no subscription. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `computed` observes a stale `route.snapshot` (ordering) | low | med | Re-verified in the installed router source (Architecture); AC-2's switch case pins the re-walk with a real navigation; the e2e reload leg is the real-browser proof | agent | open |
| R-2 | A pre-navigation `FALLBACK_TAB` / `/` reaches a live render | low | low | Parity ledger rows 1, 4, 7; D-2 | agent | open |
| R-3 | The new `scrollIntoView` spy leaks across spec files (`isolate: false`) | low | med | Installed in `beforeEach`, deleted in `afterEach` of its own `describe` — the #997 pattern | agent | open |
| R-4 | Merge conflict with an in-flight branch | low | low | Checked at the intake gate: all five open PRs are Dependabot bumps; none touches `admin/`. No Flyway number in play (frontend-only) | agent | open |

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

**Stage pointer:** `implement (phase 2)`

**Next action:** Phase 2 — full check suite + the three mocked e2e suites + guards; draft PR → ready.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `AdminConsole`: `tab` as a `computed`, `currentUrl` onto the helper | ✅ | `3b333301` |
| 1 — `AdminConsoleTabs.currentUrl` onto the helper | ✅ | phase-1 commit (this one) |
| 2 — Full check suite + mocked e2e, draft PR → ready | ⏳ | |
| 3 — Review gate + Sonar gate + close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/admin-route-signals.md` — this plan.
- `docs/plans/operator-route-signals.md` — **retired** (PR #997's plan, merged at `96a683c7`;
  `riviera-docs-freshness` § *Plan-doc retirement*, the sweep #997 itself ran for PR #996's
  doc). No citation outside `docs/plans/` refers to the slug.
- `frontend/src/app/admin/admin-console.ts` — `tab` as a `computed` keyed on
  `lastSuccessfulNavigation()`; `currentUrl` from the shared helper; drop
  `NavigationEnd`/`toSignal`/`filter`/`map` imports.
- `frontend/src/app/admin/admin-console.spec.ts` — the fallback pin (AC-2) and the
  "follows a navigation" pin (AC-3).
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

- [ ] `npm run lint` · `npm run format:check` · `npm test` → green.
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/admin-console-tabs.e2e.ts e2e/admin-console-stats.e2e.ts e2e/touch-targets-admin.e2e.ts` → green.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` → clean (and `check-inline-comments`, `check-touch-target`, `check-focus-posture`).
- [ ] Draft PR as soon as the phase-0 commit exists; ready for review after phase 2 (`references/pr-gates.md`).

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | plan | every `toSignal` fed by the router's `NavigationEnd` event stream | `grep -rn "instanceof NavigationEnd" frontend/src --include=*.ts \| grep -v spec` | `admin-console.ts` ×2, `admin-console-tabs.ts`, `app.ts` (constructor, event-shaped by design — #981) | the three `admin/` sites are this slice; `app.ts` stays |
| 2026-09-06 | phase 0 | same | same | `admin-console-tabs.ts`, `app.ts` | the tabs site is phase 1; `app.ts` stays |
| 2026-09-06 | phase 1 | same | same | `app.ts` only | population of `toSignal`-over-`NavigationEnd` pipes is now empty; `app.ts`'s constructor subscription is event-shaped by design |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `grep -n "import.*NavigationEnd\|instanceof NavigationEnd\|toSignal" frontend/src/app/admin/admin-console.ts frontend/src/app/admin/admin-console-tabs.ts` → nothing.
- [ ] **AC-2 / AC-3 / AC-4:** `npx ng test --include='src/app/admin/admin-console.spec.ts'` → all passed.
- [ ] **AC-5:** `npx ng test --include='src/app/admin/admin-console-tabs.spec.ts'` → all passed.
- [ ] **AC-6:** `node scripts/check-inline-comments.mjs --diff origin/main` → clean; review at the gate.
- [ ] **AC-7:** the phase-2 commands green locally; the PR's CI green.

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
