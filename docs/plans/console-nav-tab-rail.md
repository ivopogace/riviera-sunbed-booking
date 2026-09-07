# Console nav 1/7 — the tab rail replaces both pill strips Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Both console headers render their sections as underlined text tabs on one shared
hairline through a `shared/` rail primitive, in the maintainer's two orders (venue console
Today-first, `ADMIN_CONSOLE_TAB_ORDER` amended to the regrouping), with no pill recipe left on
any routing control in either header.

**Architecture:** The primitive is three attribute directives in `shared/tab-rail.ts` — the rail
(`nav[appTabRail]`), the tab (`a[appTabRailTab]`) and the divider (`[appTabRailDivider]`) — so
the call site keeps its own `<a routerLink routerLinkActive appTouchTarget>` and the badge slot,
and the directive adds only classes (`riviera-tailwind` rule 1; no radius, no padding, no
margin of its own). The current-tab marker is `aria-current="page"` from `routerLinkActive`
with path-only matching, styled through the compound `aria-[current=page]:` selector; the
scroll-into-view of the current tab moves INTO the tab directive, driven by `RouterLinkActive`'s
`isActiveChange` on the same element, so both consumers drop their private `viewChildren` +
`effect` copies. The hairline is painted as an inset box-shadow on the rail, not a border: a
scroll container clips a child that overhangs its box, so a border-overlapping marker at
`-bottom-px` is impossible from inside `overflow-x: auto`; an inset shadow paints under the
children and stays put while the row scrolls.

**Persistence:** JDBC only (invariant #1). No tables or migrations touched — frontend-only.

**Source of intent:** GitHub issue #1007 (parent epic #1006); the spike's `VERDICT.md` on
`claude/operator-admin-nav-prototype-727vnz` (grill answers 5, 7, 8) — reference, not code to
copy.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught the
"five group boundaries" = five groups / four dividers slip, the unmeetable 3:1 on a white
`--riv-header-border` hairline, the `accent-token-inks.e2e.ts` pin on the admin tab's accent ink
that #984 retires, and the overflow-clip of a `-bottom-px` marker) · `riviera-plan-doc` (this
template — forced the behavior-parity ledger over both old strips and the seam per AC) · `tdd`
(one behavior per cycle at the seams below: primitive spec → admin spec → operator spec → e2e)
· `riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(ran by hand over the slice: `non-text-contrast.md`'s active-tab-pill row and the admin design
canvas's order note go stale and are amended here) · `grilling` (the intake interrogation,
answered from the code and marked ← confirm? below — the session is autonomous) ·
`riviera-frontend` (the primitive lands in `shared/`, pure and presentational; the two
consumers stay in their feature folders; e2e in the CI-safe mocked suite) · `riviera-tailwind`
(rule 1: directives, never `@apply`; rule 3: no radius/padding on the rail; rule 4: every tab
`<a appTouchTarget>` with `inline-flex`; the no-drift proof is a computed-style e2e, and the
contrast spec uses `src/testing/glass-tokens.ts`) · `angular-developer` + angular-cli MCP
(v22 `get_best_practices`: `input()`, `host: {}`, no `standalone: true`; `search_documentation`
had no entry for `RouterLinkActive`, so its API page was fetched directly — `isActiveChange`
"Emits: true -> Route is active", `ariaCurrentWhenActive`, `routerLinkActiveOptions:
Partial<IsActiveMatchOptions>`; Tailwind docs fetched for `aria-[current=page]:`, `after:`
auto-adding `content: ''`, `hover:` under `@media (hover: hover)`, `scrollbar-none`) ·
`playwright-cli` (the mocked-suite specs: role/test-id locators, `toHaveCSS` on computed style,
`toBeInViewport`, no sleeps) · `riviera-local-debug` (unshallowed the clone; scoped Vitest and
Playwright runs with `PW_CHROMIUM_EXECUTABLE`).

**Branch:** `claude/console-nav-tab-rail-k6feil` — the session's designated remote branch
stands in for `feature/console-nav-tab-rail` (`riviera-sdlc` remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given either console renders its header, when the section links are read, then
  they are `<a>` tabs on one rail landmark and no link carries the pill recipe (`rounded-full`
  together with a `border` and horizontal padding). *Seam:* the `nav[aria-label="… console
  sections"]` landmark and its links · *Pinned by:* `operator-console.spec.ts` "renders underlined
  text tabs on one rail, no pill recipe (#1007)" and `admin-console-tabs.spec.ts` "renders
  underlined text tabs, no pill recipe (#1007)".
- [x] **AC-2:** Given the operator is on `/operator/1/daily` (390px, touch) or the admin on
  `/admin/audit`, when the rail is measured, then the current tab alone has
  `aria-current="page"`, computed `color` = full ink `rgb(10, 42, 51)`, and its `::after`
  marker is `opacity: 1`, `height: 3px`; every other tab is soft ink with the marker at
  `opacity: 0`; hover is unreachable on that viewport so cannot produce the marker. *Seam:* the
  rendered DOM via Playwright (`getByRole('navigation', { name })`) · *Pinned by:*
  `current-page-marker.e2e.ts` "venue console: marks the current tab with full ink and a 3px
  underline (#1007)" and "admin console: marks the current tab with full ink and a 3px underline
  (#1007)".
- [x] **AC-3:** Given the venue console renders, when its tabs are read in DOM order, then they
  are Daily view, Requests, Beach map, Pricing, Venue & commodities, Payouts with a divider
  before Beach map and before Payouts, and the Requests tab carries the live count badge.
  *Seam:* `[data-testid="oc-tabs"]` links + `[data-testid="oc-requests-badge"]` · *Pinned by:*
  `operator-console.spec.ts` "orders the tabs Today-first with dividers at the two group
  boundaries (#1007)" (+ the existing badge specs, unchanged) and `operator-requests.e2e.ts`
  "lists the queue, accepts (badge decrements), and declines to empty — no booking code (#7, #8)"
  (unchanged).
- [x] **AC-4:** Given `ADMIN_CONSOLE_TAB_ORDER`, when read, then it is Operators, Email, Refunds,
  Photos, Reviews, Commissions, Payouts, Privacy, Audit; the rendered admin tabs are a
  subsequence of it (Payouts absent); and a divider sits at each of the four boundaries between
  the five groups. *Seam:* the exported constant + the rail landmark · *Pinned by:*
  `admin-console-tabs.spec.ts` "pins the amended canonical order (#1007)", "renders tabs in the
  canonical console order (Q1, #348)" (subsequence, unchanged rule), "draws a divider at each
  group boundary and nowhere else (#1007)"; `admin-console-tabs.e2e.ts` "the rail wears no edge
  mask and draws a divider at each of the four group boundaries (#1007)".
- [x] **AC-5:** Given a 360px viewport, when the admin console or the venue console renders, then
  `document.documentElement.scrollWidth - clientWidth ≤ 1`, the rail's `scrollWidth >
  clientWidth`, the rail has computed `mask-image: none`, and on `/admin/audit` the Audit tab is
  in the viewport on click and after reload (likewise Venue & commodities on the venue console).
  *Seam:* Playwright computed style + `toBeInViewport` · *Pinned by:*
  `admin-console-tabs.e2e.ts` "the page never scrolls sideways at 360px — only the tab row does",
  "every tab shares one row, and the row itself overflows horizontally", "switching to an
  off-screen tab scrolls it into view, on click and on reload" and "the rail wears no edge mask
  and draws a divider at each of the four group boundaries (#1007)"; `operator-console.e2e.ts`
  "renders porcelain over the tourist theme with a single scrolling tab row, no wrap (#710)"
  (extended).
- [x] **AC-6:** Given the touch-target sweeps at 390px, when they walk both consoles, then every
  rail tab measures ≥ 44 × 44 px. *Seam:* `expectTouchTargets` over the rendered page ·
  *Pinned by:* `touch-targets.e2e.ts` and `touch-targets-admin.e2e.ts` (existing sweeps, no
  edit; a tab is an `<a appTouchTarget>` with `inline-flex`).
- [x] **AC-7:** Given porcelain's worst background stop under the header glass, when the rail's
  marker ink (`--riv-ink`) and its hairline/divider ink (`--riv-ink-faint`) are composited over
  it, then each reaches ≥ 3:1 (WCAG 1.4.11). *Seam:* the token values mirrored in
  `src/testing/glass-tokens.ts` · *Pinned by:* `shared/tab-rail.contrast.spec.ts` "porcelain: the
  current tab's underline (full ink) clears 3:1 on the header glass" and "porcelain: the hairline
  and dividers (ink-faint) clear 3:1 on the header glass" (plus the riviera and dark rows).
- [x] **AC-8:** Given a signed-out visitor on `/admin`, when the shell renders, then no `<nav>`
  exists. *Seam:* `AdminConsole`'s gate · *Pinned by:* `admin-console.spec.ts` "never renders
  the tab strip until the gate passes — a signed-out visitor isn't told what exists" (unchanged).
- [x] **AC-9:** Given the current tab is off-screen, when the console loads or the operator
  switches tab, then that tab's `scrollIntoView` is called once per activation. *Seam:* the
  tab directive on a real router host · *Pinned by:* `shared/tab-rail.spec.ts` "scrolls the
  current tab into view on load, and the newly current one on a switch"; `admin-console-tabs.spec.ts`
  and `operator-console.spec.ts` "scrolls the active tab into view on load" and "scrolls the newly
  active tab into view on a tab switch" (the admin pair unchanged, the operator pair rewritten onto
  a real router).
- [x] **AC-10:** Given `/admin/email?resend=1` (a query string on a tab URL), when the rail
  renders, then the Email tab is still `aria-current="page"`. *Seam:* the rail landmark ·
  *Pinned by:* `admin-console-tabs.spec.ts` "keeps the tab lit under a query string — the match is
  path-only (#1007)" and `shared/tab-rail.spec.ts` "keeps the tab lit under a query string — the
  match is path-only".

## Non-goals

- The one shell (#1011): both chromes stay where they are; only their tab strip changes.
- The account chip (#1008), the venue switcher (#1009), the phone rail (#1012), the palette
  (#1013), the dark console theme (#1010).
- The venue console's default landing tab: `/operator/:venueId` still redirects to `beach-map`
  (`app.routes.ts`); Daily view being first in the rail does not move the redirect.
- Sticky/scroll behaviour of the rail (grill answer 9 lands with the shell).
- The pill recipe on non-routing controls (the admin outbox re-drive buttons, the payout
  statement chip) — not navigation, not this slice.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Admin: each tab is a routed `<a>` child of `AdminConsole`, deep-linkable | preserved | same `<a [routerLink]>` per tab; `AdminConsoleTabs` stays mounted by the shell |
| Admin: `aria-current="page"` on the open tab via `routerLinkActive` | preserved | same directive, `ariaCurrentWhenActive="page"` |
| Admin: `{ exact: true }` matching (`/admin` never lit on `/admin/email`) | changed | `TAB_RAIL_MATCH` = `paths: 'exact'`, query/fragment/matrix `ignored` — path still exact (spec holds), a query string no longer unlights (AC-10) |
| Admin: single scrolling row, edge mask fade | changed | single scrolling row, no mask — the cut tab is the overflow cue (AC-5) |
| Admin: active tab scrolls into view on load and on switch | preserved | moved into `a[appTabRailTab]`, fired by `isActiveChange`; the #983 spec pair holds unchanged |
| Admin: active pill = accent ink + lifted white fill | changed | full ink + 3px underline on the hairline (#984, grill answer 5) |
| Admin: `riv-tab` marker class | dropped | no spec or e2e queries it (`grep -rn 'riv-tab\b'` → only `app.ts`'s `riv-tab-bar`) |
| Admin: per-tab `data-testid="admin-tab-*"` | preserved | same ids on the same `<a>` |
| Admin: labelled landmark `Admin console sections` | preserved | `label` input unchanged |
| Admin: nothing rendered signed-out | preserved | the gate in `AdminConsole` is untouched (AC-8) |
| Admin: order Operators, Commissions, Email, Refunds, Photos, Reviews, Privacy, Audit | changed | the amended contract (grill answer 8, AC-4) |
| Operator: six routed tabs `['/operator', venueId, path]`, reactive to venue switch | preserved | same links; `console-venue-switch.spec.ts` holds |
| Operator: default (non-exact) `routerLinkActive` | changed | `TAB_RAIL_MATCH` path-exact — no tab has child routes (`consoleTabRoutes` are leaves), so nothing that was lit stops being lit |
| Operator: Requests badge from `PendingRequestsStore` | preserved | same span inside the tab (AC-3) |
| Operator: single scrolling row with mask fade, `oc-tabs` test id | changed / preserved | no mask; `data-testid="oc-tabs"` kept on the rail (seven e2e specs click through it) |
| Operator: active pill = opaque white + `--riv-console-card-border` | changed | full ink + underline; `--riv-console-card-border` keeps one consumer (the Venue-not-found card) — its docs rows amended |
| Operator: active tab scrolls into view (#710) | preserved | the tab directive (see admin row) |
| Operator: order Beach map, Pricing, Daily, Requests, Payouts, Venue | changed | Today-first (grill answer 7, AC-3) |
| Operator: `oc-tab-label` span | dropped | nothing queries it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A marker overhanging the rail (`-bottom-px`) is clipped by `overflow-x: auto` (it forces `overflow-y: auto`), so the "overlaps the hairline" look cannot come from a border | high | med | hairline = `shadow-[inset_0_-1px_0_var(--riv-ink-faint)]` on the rail, marker `bottom-0 h-[3px]` paints over it; e2e reads `::after` height/opacity; a screenshot check during implement | session | closed — screenshots at 360/1280 on both consoles show the underline on the hairline; `current-page-marker.e2e.ts` pins the computed marker + hairline |
| R-2 | `--riv-header-border` (white 0.7) cannot reach 3:1 on the header glass — AC-7 as written is unmeetable with the spike's token | high | med | hairline and dividers use `--riv-ink-faint` (already proven AA 4.5 on the header glass by `operator-console.contrast.spec.ts`); pinned by `tab-rail.contrast.spec.ts`; ← confirm? in Open questions | session | closed in code (`tab-rail.contrast.spec.ts`, three themes); the token choice awaits the maintainer's confirmation at review |
| R-3 | `accent-token-inks.e2e.ts` "the console accent ink resolves…" asserts `admin-tab-privacy` paints `--riv-accent-ink`, which this slice removes by design | high | low | retarget the assertion to another `text-riv-accent-ink` consumer on the admin console (the reviews stars glyph or the erasure heading); coverage of the token stays | session | closed — retargeted to `admin-review-stars-31` on `/admin/reviews` |
| R-4 | Short labels (Email, Audit) narrower than 44px | med | med | `appTouchTarget` (`min-w-11`) on an `inline-flex` `<a>`; measured by the two sweeps (AC-6) | session | closed — `touch-targets.e2e.ts` + `touch-targets-admin.e2e.ts` green locally (phase 3) |
| R-5 | `isActiveChange` as the scroll trigger does not fire on load in jsdom / the e2e | low | med | the existing #983 spec pair and both e2e reload tests pin load + switch; fallback is the consumer-side effect the strips have today | session | closed — `tab-rail.spec.ts` proves load + switch in jsdom (phase 0) |
| R-6 | `overflow-x: auto` on the rail plus `items-stretch` leaves the tab's `::after` inside the scroll box — if the rail gets vertical padding the marker floats above the hairline | med | low | rail carries no padding (rule 3); consumers add margin outside it, never padding inside | session | closed — the rule is in `TabRail`'s TSDoc (horizontal inset and top padding fine, never bottom padding); the venue console uses `pt-3.5` and the shot confirms the marker on the line |
| R-7 | Sibling slices (#1008–#1013) edit the same two headers | low | low | no open PRs today; they are sequenced after this one in the epic | session | closed — no in-flight overlap |
| R-8 | Group dividers as `<span aria-hidden>` inside the `<nav>` change the accessible link count or axe output | low | low | `aria-hidden="true"` set by the directive; axe runs in both console e2e | session | closed — axe green in `admin-console-tabs.e2e.ts` and `operator-console.e2e.ts` |

## Open questions / Assumptions

- **Assumption:** "dividers sit at the five group boundaries" in the issue means the five
  groups' four boundaries (Operators | Email · Refunds | Photos · Reviews | Commissions · Payouts
  | Privacy · Audit). ← confirm? — *Owner:* maintainer · *Resolves by:* review.
- **Assumption:** the rail's hairline and dividers take `--riv-ink-faint`, not the spike's
  `--riv-header-border`, because AC-7 asks for ≥ 3:1 on the header glass and a white hairline on
  white glass is ~1.1:1. ← confirm? — *Owner:* maintainer · *Resolves by:* review.
- **Assumption:** the venue console's default landing stays `beach-map` even though Daily view is
  now first (nothing in #1007 moves the redirect). ← confirm? — *Owner:* maintainer ·
  *Resolves by:* review.
### Resolved

- **Assumption:** `accent-token-inks.e2e.ts`'s admin-tab assertion is retargeted, not deleted
  (R-3). — retargeted to the reviews stars glyph, phase 3 commit.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: navigation chrome only, no booking, map or availability
read or write.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — no backend behavior added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/tab-rail.ts` — `TabRail`, `TabRailTab`, `TabRailDivider`, `TAB_RAIL_MATCH` | new | attribute directives | `TabRailTab` injects `RouterLinkActive` (`self`) and subscribes `isActiveChange` with `takeUntilDestroyed` | — |
| FE-2 | `admin/admin-console-tabs.ts` | existing | standalone component | drops `viewChildren`/`effect`; `rows` precomputed from `ADMIN_CONSOLE_TAB_GROUPS` | — |
| FE-3 | `operator/operator-console.ts` + `.html` | existing | standalone component | drops `tabLinks`/`currentTabPath` scroll effect; tabs reordered with `dividerBefore` | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs, host bindings in `host: {}`. No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `review gate — round 1 findings fixed; awaiting CI on the fix push, then merge`

**Next action:** confirm CI + Sonar green on the review-fix push, re-walk the overlay items the fix touched (RV-FE-E2E, RV-STYLE-1), then merge and run the close-out (`references/pr-gates.md` §3).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the rail primitive (`shared/tab-rail.ts` + spec + contrast spec) | ✅ | phase-0 commit (see git log, `Add the shared tab-rail primitive`) |
| 1 — admin console consumes the rail, amended order + dividers | ✅ | `Admin console: the tab rail and the amended order` |
| 2 — venue console consumes the rail, Today-first order + dividers | ✅ | `Venue console: the tab rail, Today-first` |
| 3 — e2e (marker, no mask, accent-ink retarget), docs rows, close-out | ✅ | `Console nav: marker e2e, docs rows` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Review gate (round 1):** ran `code-review:code-review` (rung 1) over `5a78f8ed..680058a3`
(21 files, +1107/−213, verified by `check-review-range.mjs`) with `riviera-review-overlay`: six
reviewers, three findings (F-2..F-4), all fixed in the review-fix commit; RV-FE-1/7/8/9/E2E,
RV-STYLE-1/2, RV-PROC-1 pass, the rest N/A. **Sonar gate:** quality gate passed on the head,
0 new issues, 0 duplicated blocks, 100% new-code coverage (the bot comment on the PR).
**Merge:** merged via PR #1014 (recorded here ahead of the merge, per §3 step 4).

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-2 | review (prior-PR threads, score 100) | the plan's "Pinned by" citations paraphrased the shipped test titles (the #895/#957/#1005 finding) | fixed — every citation quoted verbatim in the review-fix commit |
| F-3 | review (riviera overlay RV-FE-E2E, score 75) | `fixed-ink-token-recut.e2e.ts` located the Venue-not-found card by `locator('..')` | fixed — `data-testid="oc-invalid-venue-card"` on the card, located by test id |
| F-4 | review (git history, score 75) | `app.routes.ts`'s `consoleTabRoutes` TSDoc still described the retired `firstChild.routeConfig.path` scroll and the pills | fixed — the comment now points at the rail tab's own mechanism |
| F-1 | CI (frontend job, run 34110694421) | three e2e pinned the old strips through the landmark: Commissions slot 2, Privacy's last-three, the active pill's card border | fixed-in-`d10e7a99` |

---

## File structure

- `docs/plans/console-nav-tab-rail.md` — this plan.
- `frontend/src/app/shared/tab-rail.ts` — the primitive: `nav[appTabRail]`, `a[appTabRailTab]`, `[appTabRailDivider]`, `TAB_RAIL_MATCH`.
- `frontend/src/app/shared/tab-rail.spec.ts` — classes (no pill recipe), divider `aria-hidden`, scroll-into-view on activation.
- `frontend/src/app/shared/tab-rail.contrast.spec.ts` — marker + hairline ≥ 3:1 over the header glass, three themes.
- `frontend/src/testing/glass-tokens.ts` — the per-theme `--riv-ink-faint` mirrors the contrast spec reads.
- `frontend/src/app/admin/admin-console-tabs.ts` — amended `ADMIN_CONSOLE_TAB_ORDER`, new `ADMIN_CONSOLE_TAB_GROUPS`, TSDoc recording the departure from the canvas, rail markup.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — amended pin, dividers, no pill recipe, query-string case.
- `frontend/src/app/operator/operator-console.ts` — Today-first tabs with group markers; scroll effect removed.
- `frontend/src/app/operator/operator-console.html` — the rail in place of the pill row.
- `frontend/src/app/operator/operator-console.spec.ts` — order, dividers, no pill recipe.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — the active-tab-on-white case retitled (the pill is gone).
- `frontend/src/app/shared/fixed-ink-tokens.contrast.spec.ts` — doc comment: `--riv-console-card-border`'s consumers after the pill.
- `frontend/e2e/current-page-marker.e2e.ts` — the two console cases (AC-2).
- `frontend/e2e/admin-console-tabs.e2e.ts` — header, no-mask + divider assertions.
- `frontend/e2e/operator-console.e2e.ts` — order, no-mask, dividers.
- `frontend/e2e/accent-token-inks.e2e.ts` — retarget the accent-ink assertion (R-3).
- `frontend/e2e/admin-commissions.e2e.ts` — the Commissions slot pin, amended to the new order (F-1).
- `frontend/e2e/admin-privacy.e2e.ts` — the last-three pin, amended to the new order (F-1).
- `frontend/e2e/fixed-ink-token-recut.e2e.ts` — reads `--riv-console-card-border` off the Venue-not-found card, not the retired pill (F-1).
- `frontend/src/app/app.routes.ts` — the `consoleTabRoutes` TSDoc no longer names the retired scroll mechanism or the pills (F-4).
- `docs/design/non-text-contrast.md` — the `--riv-console-card-border` row.
- `docs/design/riviera-admin-console.dc.html` — the header note's order line and the rail.

---

## Phase 0 — The rail primitive

**Files:** Create `frontend/src/app/shared/tab-rail.ts` · Test `frontend/src/app/shared/tab-rail.spec.ts`, `frontend/src/app/shared/tab-rail.contrast.spec.ts`

- [ ] **Step 1: Write the failing tests** — a host under `provideRouter` with three `<a appTabRailTab routerLink routerLinkActive ariaCurrentWhenActive="page" [routerLinkActiveOptions]="match">` and one `<span appTabRailDivider>`; asserts: no link's class list has `rounded-full` + `border` + `px-`; every link has `inline-flex`; the rail has `overflow-x-auto` and no `[mask-image` class; the divider has `aria-hidden="true"`; `scrollIntoView` called on the current link once on load and once more on a switch; the current link keeps `aria-current` under `?x=1`. Contrast: `--riv-ink` and `--riv-ink-faint` composited over the header glass over every stop ≥ 3:1 (`AA_LARGE`), per theme.
- [ ] **Step 2: Run, verify fail** — `npx vitest run src/app/shared/tab-rail` → FAIL (module not found).
- [ ] **Step 3: Minimal implementation** — the three directives + `TAB_RAIL_MATCH`.
- [ ] **Step 4: Run, verify pass** — same command → PASS.
- [ ] **Step 5: Generalization audit** — population "every `routerLinkActive` link that also scrolls itself into view" → `grep -rn "scrollIntoView" frontend/src/app` → the two consumers, both migrated in phases 1–2.
- [ ] **Step 6: Commit** — `Add the shared tab-rail primitive (#1007)`.
- [ ] **Step 7: Update execution status.**

## Phase 1 — Admin console consumes the rail

**Files:** Modify `frontend/src/app/admin/admin-console-tabs.ts` · Test `frontend/src/app/admin/admin-console-tabs.spec.ts`

- [ ] Step 1: amend the pin to the new order; add "draws a divider at each group boundary", "no pill recipe", "keeps the tab lit under a query string" → FAIL.
- [ ] Step 2: `ADMIN_CONSOLE_TAB_GROUPS` + derived order, TSDoc, rail markup → PASS; the #983 pair still passes with the effect removed.
- [ ] Step 3: `admin-console.spec.ts` unchanged and green (AC-8).
- [ ] Commit — `Admin console: the tab rail and the amended order (#1007)`.

## Phase 2 — Venue console consumes the rail

**Files:** Modify `frontend/src/app/operator/operator-console.ts`, `.html` · Test `frontend/src/app/operator/operator-console.spec.ts`, `.contrast.spec.ts`

- [ ] Step 1: replace "renders the six pill tabs" with the order + dividers + no-pill spec → FAIL.
- [ ] Step 2: reorder `tabs` with `dividerBefore`, rail markup, drop the scroll effect → PASS; `console-venue-switch.spec.ts` green.
- [ ] Commit — `Venue console: the tab rail, Today-first (#1007)`.

## Phase 3 — e2e, docs, close-out

- [ ] `current-page-marker.e2e.ts` console cases; `admin-console-tabs.e2e.ts` + `operator-console.e2e.ts` no-mask/divider assertions; `accent-token-inks.e2e.ts` retarget; run the touched e2e files and both touch-target sweeps with `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.
- [ ] `non-text-contrast.md` row, `fixed-ink-tokens.contrast.spec.ts` doc comment, the canvas note.
- [ ] `npm run lint`, `npm run format:check`, `npm test`, `node scripts/check-plan-file-structure.mjs --diff origin/main`, the three hook guards by hand.
- [ ] Commit — `Console nav: marker e2e, docs rows (#1007)`; open the draft PR.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 0 (the rail carries scroll-into-view) | every routed link that scrolls itself into view via a consumer-side `viewChildren` + `effect` | `grep -rn "scrollIntoView" frontend/src/app --include=*.ts` | `admin-console-tabs.ts`, `operator-console.ts` (the two strips) | both migrated to `a[appTabRailTab]` in phases 1–2; the tourist header's links do not scroll (a non-scrolling row), no action |
| 2026-09-07 | CI red on PR #1014 (three e2e pins missed) | every e2e that reads the strips through the LANDMARK rather than a test id — `getByRole('navigation', { name: '… console sections' })` and bare `a[aria-current="page"]` locators — the mechanism the phase-3 grep (test ids, classes) did not enumerate | `grep -rn "getByRole('navigation'\|aria-current=\"page\"\]" frontend/e2e/*.e2e.ts` | `admin-commissions.e2e.ts` (slot 2 pin), `admin-privacy.e2e.ts` (last-three pin), `fixed-ink-token-recut.e2e.ts` (card border read off the active pill); the other role-located readers only click tabs by name | the two slot pins amended to the contract; the recut spec reads the card border off the Venue-not-found card, its remaining consumer |
| 2026-09-07 | phase 3 (an e2e pinned the admin tab's accent ink) | every spec or e2e that reads the old strips' markup: `riv-tab`, `oc-tab-label`, `admin-tab-*` colour, pill classes | `grep -rn "riv-tab\b\|oc-tab-label\|admin-tab-\|oc-tabs" frontend/e2e frontend/src` | 1 stale (`accent-token-inks.e2e.ts:108`), 20 files locating tabs by test id / role (unaffected) | the one stale assertion retargeted; the rest hold against the new markup (86 e2e green) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `npx ng test --watch=false --include="src/app/operator/operator-console.spec.ts" --include="src/app/admin/admin-console-tabs.spec.ts"` → the no-pill cases pass. Verified in the phase 1 and 2 commits.
- [x] **AC-2:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/current-page-marker.e2e.ts` → the two console cases pass (colour, `::after` 3px/opacity 1, hairline, no mask). Verified in the phase 3 commit.
- [x] **AC-3:** operator spec "orders the tabs Today-first…" + `operator-requests.e2e.ts` (badge decrement) pass. Verified phases 2–3.
- [x] **AC-4:** admin spec "pins the amended canonical order", the subsequence rule, "draws a divider at each group boundary"; `admin-console-tabs.e2e.ts` sequence. Verified phases 1 and 3.
- [x] **AC-5:** `admin-console-tabs.e2e.ts` (4 + the no-mask test) and `operator-console.e2e.ts` narrow test pass. Verified phase 3.
- [x] **AC-6:** `touch-targets.e2e.ts` + `touch-targets-admin.e2e.ts` pass at 390px. Verified phase 3.
- [x] **AC-7:** `npx ng test --watch=false --include="src/app/shared/tab-rail.contrast.spec.ts"` → 6 pass (three themes × marker/hairline). Verified phase 0.
- [x] **AC-8:** `admin-console.spec.ts` signed-out case unchanged and green in the phase 1 run.
- [x] **AC-9:** `tab-rail.spec.ts` scroll case + the admin `#983` pair + the operator scroll block (now on a real router). Verified phases 0–2.
- [x] **AC-10:** `tab-rail.spec.ts` and `admin-console-tabs.spec.ts` query-string cases pass. Verified phases 0–1.

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
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #) — the three ← confirm? assumptions are the maintainer's to confirm at review; each is a reversible choice recorded in the PR's scope notes.
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
