# Retire the unread `data.tab` key on the operator-console tab routes — Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Remove the `data: { tab: … }` key from all six `consoleTabRoutes` entries in
`app.routes.ts` and correct the route group's doc paragraph, with the operator console's
active-tab marking and scroll-into-view unchanged and its existing pins passing untouched.

**Architecture:** The single significant decision is that this is a **pure removal, not a
replacement** — `data.tab` has no reader, so there is nothing to migrate. `OperatorConsole`
already derives the active tab from the router itself (`routerLinkActive` →
`ariaCurrentWhenActive="page"` for the marking, `firstChild.routeConfig.path` for the
scroll-into-view), which is why the key is inert. The doc paragraph is rewritten to state
that derivation, so the absence of a section key reads as deliberate rather than as an
omission a later slice should "fix".

**Persistence:** N/A — frontend-only slice, no tables, no migration (invariant #1 untouched).

**Source of intent:** GitHub issue #995 (deferred out of #992 / PR #994).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
AC-2 names the wrong pin file; see D-1 under Open questions) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger, which is what proved the removal is total) ·
`tdd` (no red step: the slice removes dead configuration and adds no behavior, so the
discipline is *pin-first* — the existing `#710` e2e case already pins both observable
behaviors and must stay green across the removal) · `riviera-review-overlay` (review gate —
runs at ready-for-review) · `riviera-docs-freshness` (due at close-out —
**not yet run**; this line is finalized with its range + findings before merge) · `riviera-frontend`
(routing lives in the one `app.routes.ts` array; confirmed no folder/taxonomy move is in
play) · `angular-developer` + angular-cli MCP `search_documentation` (v22: `Route.data` is
**arbitrary user-defined static data** — the router consumes no key implicitly, so removing
`data.tab` cannot change framework behavior; `RouterLinkActive` is what sets `aria-current`)
· `riviera-tailwind` (not loaded for authoring — nothing is styled; the Tailwind-doc check
below was verification only) · `riviera-local-debug` (unshallowed the clone before any
history claim; `PW_CHROMIUM_EXECUTABLE` for the mocked e2e run).

**Branch:** `claude/sdlc-995-yq1gqu` — the cloud session's designated remote branch stands
in for `feature/retire-console-tab-route-key` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the shipped route table, when `consoleTabRoutes` is read, then no entry
  carries a `data` property at all, and `grep -rn "data\.tab\|data\['tab'\]" frontend/src
  frontend/e2e` returns nothing. *Seam:* the `consoleTabRoutes` route configuration in
  `frontend/src/app/app.routes.ts` · *Pinned by:* the grep in **AC verification** below —
  deliberately **not** test-pinned, per the #992/PR #994 precedent, which retired the
  `legacySurface` enumeration specs rather than adding a spec asserting an absence.
- [ ] **AC-2:** Given the operator console at `/operator/1`, when the operator clicks a tab
  far along the scrolling row (`Venue & commodities`), then that pill carries
  `aria-current="page"` and is scrolled into the viewport — and the same holds after a reload
  directly onto that tab (the on-load path, not just the click). *Seam:* the rendered tab nav
  (`[data-testid="oc-tabs"]` anchors) · *Pinned by:*
  `e2e/operator-console.e2e.ts` → `renders porcelain over the tourist theme with a single
  scrolling tab row, no wrap (#710)`, passing unchanged.
- [ ] **AC-3:** Given the console mounted at `/operator/:venueId`, when the `:venueId` param
  changes in place (the router reuses the component), then the header and badge reload and
  the six tab links repoint at the new venue. *Seam:* the `OperatorConsole` component's
  rendered shell · *Pinned by:* `operator-console.spec.ts` → `OperatorConsole — in-place venue
  param change (#180)` (`reloads the header and badge when the venue param changes in place`,
  `shows not-found when the param turns invalid, and recovers`) plus `renders the six pill
  tabs linking to the tab routes (#170, AC-1)`, all passing unchanged.
- [ ] **AC-4:** Given a fresh reader of `app.routes.ts`, when they read the `consoleTabRoutes`
  doc paragraph, then every present-tense claim in it is true of the routes below it — no
  `data.tab` claim remains, and the paragraph says where the active tab actually comes from.
  *Seam:* the doc comment above `consoleTabRoutes` · *Pinned by:* review (RV-STYLE-1) +
  `node scripts/check-inline-comments.mjs`, which judges a doc comment whole once any line of
  it is added.

## Non-goals

- **Not** touching `data.adminTab` on `adminTabRoutes` — a live key, read by
  `AdminConsole` at `admin-console.ts:113`.
- **Not** touching `data.operatorConsole` / `data.operatorChrome`, read by the shell at
  `app.ts:168–173`.
- **Not** de-duplicating `OperatorConsole.tabs` against `consoleTabRoutes`. The component
  hard-codes its own six-entry pill list (path + label + badge flag) while the route table
  hard-codes the same six paths. That duplication is *why* `data.tab` was never read, and
  collapsing it is a design change well beyond a dead-key removal — see Open questions D-2.
- **Not** adding a guard test or lint rule that forbids re-adding a `tab` key.

## Behavior-parity ledger

> The slice retires an existing surface (the `data.tab` route-data key), so this section is
> mandatory. The "old surface" is the key itself; the ledger enumerates every way a route-data
> key can be observed and shows each is vacant here.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Read by a component via `route.data['tab']` / `route.snapshot.data['tab']` | **dropped — never existed** | Zero readers in the tree: `grep -rn "\.data\[" frontend/src --include="*.ts"` returns only `adminTab`, `operatorConsole`, `operatorChrome`. |
| Read by the router itself (an implicitly-consumed key) | **dropped — impossible** | Angular v22 docs: `Route.data` is *arbitrary* static data the developer defines; the router consumes no key implicitly. `title` is a sibling `Route` property, not a `data` key, and is untouched. |
| Read by a guard / resolver / `CanMatch` | **dropped — never existed** | The only guard on these routes is `operatorSessionGuard` (`core/operator-session.guard.ts`), applied on the parent `/operator/:venueId`; it reads session state, not route data. |
| Read by a spec or e2e assertion | **dropped — never existed** | `grep -rn "'tab'" frontend/src/app/app.spec.ts frontend/src/app/operator/*.spec.ts` returns nothing; no e2e references it. Nothing to retire alongside, unlike #992's `legacySurface` enumeration cases. |
| Used to style the active pill (a `data-*` Tailwind variant) | **dropped — never existed** | Route `data` never reaches the DOM. The active pill is styled by `aria-[current=page]:…` arbitrary ARIA variants (Tailwind v4's documented `aria-[attribute=value]:` syntax), fed by `RouterLinkActive`'s `ariaCurrentWhenActive="page"`. `grep -rn "data-tab" frontend/src` returns nothing. |
| Identifies the active section for the scroll-into-view effect | **preserved — by a different mechanism, already in place** | `OperatorConsole.currentTabPath` reads `this.route.snapshot.firstChild?.routeConfig?.path` on every `NavigationEnd`. Unchanged by this slice; pinned by AC-2. |

**Conclusion:** the removal is total — every row is either vacant or already served by the
router. This is what justifies "no behavior change" as a verified claim rather than an
aspiration.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A reader exists that the greps missed (e.g. a dynamic `data[key]` lookup with a computed key) | low | med | Swept by mechanism, not by name: `grep -rn "\.data\[" frontend/src --include="*.ts"` enumerates *every* route-data read in the app, computed key or not — three sites, none `tab`. Recorded in the Generalization-audit log. | agent | closed — see log |
| R-2 | The removal silently breaks active-tab marking or the scroll-into-view | low | med | Both are pinned by the `#710` e2e case (`aria-current` + `toBeInViewport`, on click *and* after reload); the mocked e2e suite runs before the PR and in CI. | agent | open until AC-2 verified |
| R-3 | A later slice re-adds a `tab` key, not knowing it was deliberate | med | low | The rewritten doc paragraph states the active tab comes from the router, so the absence reads as a decision. Cheaper than a guard test (a Non-goal). | agent | closed — AC-4 |
| R-4 | Merge conflict in `app.routes.ts` with an in-flight branch | low | low | Checked at the intake gate: all five open PRs are Dependabot bumps (`jsdom`, `typescript-eslint`, `@types/node`, `@stripe/stripe-js`, `stripe-java`); none touches `app.routes.ts`. No Flyway number in play (frontend-only). | agent | closed |

## Open questions / Assumptions

### Resolved

- **D-1 (drift, from the issue-intake grill gate):** Issue #995's AC-2 says the marking and
  scroll behaviors are "pinned by the existing `operator-console.spec.ts` cases". They are
  **not** — that unit spec pins the six links (#170) and the in-place venue switch (#180),
  while the `aria-current="page"` and `toBeInViewport()` assertions live in
  `e2e/operator-console.e2e.ts`'s `#710` case, on both the click and the reload
  leg. No code impact; reconciled by splitting the issue's AC-2 into this plan's AC-2 (e2e,
  marking + scroll) and AC-3 (unit, venue switch + links). Verified at `7c01678`.
- **D-2 (scope, raised and closed):** `OperatorConsole.tabs` and `consoleTabRoutes` both
  hard-code the same six paths. Tempting to collapse; explicitly **out of scope** as a
  Non-goal — it is a design change, not a dead-key removal, and folding it in would repeat
  exactly the widening #992 avoided when it deferred this key. Not filed as a follow-up
  issue: the duplication is small, deliberate-looking (labels and the badge flag are
  presentation, not routing), and no defect depends on it.
- **A-1 (assumption, discharged):** The issue's Notes say to close as obsolete if `data.tab`
  gained a reader before pickup. Re-verified at `7c01678` (current `origin/main`, one commit
  past the issue's `bede166c`): still unread. The slice proceeds.

## Availability & concurrency (invariant #2)

N/A — frontend routing configuration only. No write path to `set_availability`, no booking,
no beach-map data, no cutoff arithmetic. Invariants #2, #3, #4 are untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is in the diff, so no module, `api/` port, event, or
`RESPONSIBILITIES.md` ownership question arises (invariant #11 untouched).

### Module ownership (§4a)

N/A — frontend-only; the slice adds no behavior and moves none.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.routes.ts` (`consoleTabRoutes` + its doc paragraph) | existing | route configuration | none — static config | none |

**Standards:** no component, service, template, or style is touched, so the component
standards do not engage. The routes keep the repo's shape: every entry lazy
(`loadComponent`) with a `title`, literal segments only, `:venueId` still read from the
parent route (the `emptyOnly` inheritance rule the doc paragraph preserves). No deviation.

**Verified against the docs (per the maintainer's mid-session request):**

- **Angular** (angular-cli MCP `search_documentation`, v22 index + `angular.dev/guide/routing/define-routes#static-data`):
  `Route.data` is arbitrary developer-defined static data, read back through
  `ActivatedRoute`; the router consumes no key implicitly. `RouterLinkActive` is documented
  as the directive that "can also set the `aria-current` of an active link". Both confirm the
  removal is framework-inert and that the marking does not depend on route data.
- **Tailwind** (`tailwindcss.com/docs/hover-focus-and-other-states`): the pill's
  `aria-[current=page]:…` classes are the documented arbitrary-ARIA-variant syntax
  (`aria-[attribute=value]:` → `&[aria-current="page"]`). Tailwind's `data-*` variants read
  DOM attributes, which route `data` never becomes — so no styling can be keyed to the removed
  key. Confirmed by `grep -rn "data-tab" frontend/src` (no hits). Styling is unchanged by this
  slice.

## FE↔BE contract

N/A — no contract change; no endpoint, DTO, or client type is touched.

## Execution status

**Stage pointer:** `PR — open the draft, then the review gate`

**Next action:** push the branch, open the draft PR, run the review gate
(`riviera-sdlc` `references/pr-gates.md` §1), then finalize phase 1.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Retire the key + correct the doc paragraph | ✅ | this commit |
| 1 — Close-out (docs-freshness sweep + retire PR #994's merged plan doc) | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none raised | — |

---

## File structure

- `frontend/src/app/app.routes.ts` — drop `data: { tab: … }` from the six `consoleTabRoutes`
  entries; rewrite the group's doc paragraph.
- `docs/plans/retire-console-tab-route-key.md` — this plan doc.
- `docs/plans/retire-legacy-compat-surface.md` — **deleted**: PR #994's plan doc, merged at
  `7c01678`, retired by this slice's close-out per `riviera-docs-freshness`
  § *Plan-doc retirement* (the same sweep #994 itself ran for PR #990's doc).

---

## Phase 0 — Retire the key, correct the doc paragraph

**Files:** Modify `frontend/src/app/app.routes.ts:7–55`

- [ ] **Step 1: Pin first (the retirement-slice substitute for a red test)**

There is no red step to write: the slice removes inert configuration and adds no behavior, so
any new test would be green on the old code too. The discipline for a retirement slice is
instead **pin-before-remove** — establish that the observable behaviors are already covered,
and hold those pins green across the removal. AC-2's pin already exists and needs no edit:

```ts
// frontend/e2e/operator-console.e2e.ts — the #710 case, unchanged by this slice
await links.filter({ hasText: 'Venue & commodities' }).click();
await expect(page).toHaveURL(/\/operator\/1\/venue/);
const active = links.filter({ hasText: 'Venue & commodities' });
await expect(active).toHaveAttribute('aria-current', 'page');
await expect(active).toBeInViewport();
```

- [ ] **Step 2: Establish the baseline** —
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts operator-console admin-console-tabs`
  → PASS before the change (proves the pin is live, not vacuously green).

- [ ] **Step 3: The removal**

```ts
/**
 * The operator-console tab child routes — one per section, each deep-linkable. The active tab
 * comes from the router itself: the pills mark themselves with `routerLinkActive`, and
 * {@link OperatorConsole} reads `firstChild.routeConfig.path` to scroll the active one into
 * view, so no route here carries a section key of its own.
 * A child reads `:venueId` from the PARENT route (child routes don't inherit it under the
 * router's default `emptyOnly` strategy).
 */
const consoleTabRoutes: Routes = [
  {
    // The generate-grid + paint layout editor.
    path: 'beach-map',
    loadComponent: () => import('./operator/layout-editor').then((m) => m.LayoutEditor),
    title: 'Beach map — Operator console',
  },
  // … the remaining five entries, each losing only its `data: { tab: … }` line.
];
```

- [ ] **Step 4: Run the pins again** — the same e2e command → PASS, plus
  `npx vitest run src/app/operator/operator-console.spec.ts src/app/app.spec.ts` → PASS,
  then `npm run lint`, `npm run format:check`, and the hygiene guards.

- [ ] **Step 5: Generalization-audit pass** — recorded in the log below.

- [ ] **Step 6: Commit** — `git commit -m "Retire the unread data.tab key on the console tab routes (#995)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | Phase 0 | **Every route-data key the app sets and may read** — the mechanism is `Route.data` written in `app.routes.ts` and read via `ActivatedRoute(.snapshot).data[…]`. Enumerated by sweeping the *read* side across all of `frontend/src`, which catches a computed-key lookup a name-based grep would miss. | `grep -rn "\.data\[" frontend/src --include="*.ts"` | 3 reads: `adminTab` (`admin/admin-console.ts:113`), `operatorConsole` + `operatorChrome` (`app.ts:168–173`) | All three are live and stay. `tab` appears in none → confirmed dead, removed. This is the same sweep #992 ran, re-run one mechanism-instance later; it now reports **zero** dormant keys, so the population is exhausted and no follow-up issue is due. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `grep -rn "data\.tab\|data\['tab'\]" frontend/src frontend/e2e; grep -n "data:" frontend/src/app/app.routes.ts`
  → no `tab` hits; `data:` appears only under `adminTabRoutes`. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config=playwright.a11y.config.ts operator-console admin-console-tabs`
  → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `npx vitest run src/app/operator/operator-console.spec.ts src/app/app.spec.ts`
  → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `node scripts/check-inline-comments.mjs --diff origin/main` → clean, and
  the paragraph is read at review. Verified at commit `<sha>`.

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
