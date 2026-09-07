# Tourist header: phone bottom tab bar Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Below `sm` the tourist shell replaces the top-bar hamburger with a fixed three-tab
bottom bar (`Beaches`, `My bookings`, `Menu`/`Account`) whose third tab opens the account sheet,
lit by URL section from route data, hidden on `/booking/pay` by route data, painted on its own
near-opaque `--riv-tabbar-glass` token, rendered before the header in the DOM, with the phone top
bar `relative` and the safe-area inset carried by the bar, the sheet and the shell padding.

**Architecture:** A rebuild of the shipped shell's phone chrome in `app.html` / `app.ts` after the
corrected variant H (`claude/header-variant-h-review-0g30q1`, layout and class choices only). The
one design decision: **the section and the checkout flag are route data** (`data.section`,
`data.tabBar`) read off the same root→leaf snapshot walk `App.routeChrome` already runs for
`operatorConsole` / `operatorChrome`, so the bar never parses a URL and the checkout flag composes
with the chrome switch. The sheet reuses the shipped `menuOpen` machinery and its rows keep their
test ids; what changes is that focus now moves INTO the sheet on open (`focusMover()`) and back to
the third tab on every close leg.

**Persistence:** N/A — frontend-only; no tables or migrations.

**Source of intent:** GitHub issue #1003 (signed-off spike verdict, `VERDICT.md` § *Corrections
from the adversarial review* items 4, 6, 8, 9, 10, 11 on the review branch; the issue already
carries every AC edit that section's *Issue ACs that need editing* lists for #1003).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — no open PRs, no
Flyway in scope; the drift is listed under *Grill outcome*) · `riviera-plan-doc` (this template —
forced the parity ledger for the retired hamburger and the seam shift for the computed-style ACs)
· `tdd` (each AC is one red test in `app.spec.ts` / `app.routes.spec.ts` / `app.contrast.spec.ts`
or the named e2e before the template changes) · `riviera-review-overlay` (review gate — due at
ready-for-review) · `riviera-docs-freshness` (**ran** over `5e158aed..HEAD` — rename grep for the hamburger / mobile menu
across the substrate: 1 hit, a historical design-note row, not a stated fact; the v3 artboard depicts the
hamburger, so it got the README's `as-built diverges — see #1003` pointer; no Nth-of-something
introduced; `docs/plans/tourist-header-destinations.md` retired, no citation of its slug outside `docs/plans/`) · `riviera-local-debug` (unshallowed the
clone, fetched the reference branch, scoped Vitest runs, `PW_CHROMIUM_EXECUTABLE` for the mocked
e2e) · `riviera-frontend` (all changes stay in `app.*` + `app.routes.ts` at the shell root,
`testing/glass-tokens.ts` for the token mirror, `e2e/`; route data lives in the one route table;
a new token = one CSS block per theme + one `@theme inline` row) · `riviera-tailwind` (no
`@apply`; tokens only — `--riv-tabbar-glass` declared per theme, never a double paint of the
header glass; the marker is `before:` + `group-aria-[current=page]:ring-*` in `currentColor`;
every tab `<a>` is `flex` so `appTouchTarget`'s floor is live; `max-sm:` variant for the
`relative` header; `env()`/`calc()` inside arbitrary values) · `angular-developer` + angular-cli
MCP (`list_projects` → Angular 22, Vitest; `get_best_practices`; `search_documentation` v22 on
`ActivatedRouteSnapshot.data` — static route data is on the snapshot the existing walk reads —
and `afterNextRender`, the hook `focusMover()` schedules) · `playwright-cli` (the mocked suite is
the CI-safe one; new spec `e2e/tourist-tab-bar.e2e.ts`, extensions to `current-page-marker`,
`theme-shell`, `touch-targets-tourist`) · `riviera-java-conventions` §6c +
`references/inline-comment-guard.md` (the provenance gate, which postdates every artboard pointer,
flagged the README-mandated `as-built diverges — see #1003` pointer on the v3 artboard; the
`docs/design/*.dc.html` artboards are now out of the guard's scope — `syntaxFor` + one test + the
reference's scope bullet; the artboards' support scripts stay in).

**Branch:** `claude/tourist-header-phone-tab-frrvap` (the session's designated remote branch,
standing in for `feature/tourist-header-phone-tab-bar`)

---

## Grill outcome (issue-intake gate)

The issue is current against `main` at `5e158aed` (PR #1004 merged: two destinations, swatch,
hamburger sheet with `Find a booking` and the auth group). Drift and gaps found:

- **The issue carries the VERDICT edits.** AC 2 (`relative` top bar), AC 4 (sheet inset), AC 7
  (shape cue), AC 8 (backdrop leg + find-from-sheet return), AC 10 (nav before header), AC 11
  (`--riv-tabbar-glass`) are all present; the two settled follow-ups are gone from *Out of scope*.
- **Seam shift for computed styles.** The Vitest run loads no stylesheet (`angular.json`'s `test`
  target has no `styles`; `vitest-base.config.ts` only registers the setup file), so
  `getComputedStyle(header).position` and the sheet's computed `bottom` are not observable in
  `app.spec.ts`. Those ACs (2, 4) pin the **class-list declaration** in `app.spec.ts` and the
  **computed value** in the mocked e2e at 390px and 820px (`review-h-scroll.mjs`'s read).
  Chromium resolves `env()` at computed-value time, so the sheet's `bottom` reads `76px` there —
  the `calc(76px+env(safe-area-inset-bottom))` class is the declaration proof, as the AC says.
- **`viewport-fit=cover` is absent** from `index.html`'s viewport meta. Without it iOS Safari
  keeps the layout viewport inside the safe area and `env(safe-area-inset-bottom)` resolves to
  `0`, so the inset arithmetic is inert today (the operator set-editor's existing
  `pb-[max(1rem,env(safe-area-inset-bottom))]` is inert the same way). Adding `viewport-fit=cover`
  is app-wide (landscape side insets on every page) and not this issue's — recorded as A-1 for
  the maintainer; the declarations ship ready for it.
- **`booking/confirmation` and `booking/requested`** keep the bar (the issue leaves it to the
  maintainer; the spike tested pay only) — A-2.
- **The retiring hamburger's ids are load-bearing for 8 spec files** (enumerated in the
  Generalization-audit log). The sheet's rows keep `nav-*-mobile` / `find-open-mobile`; the third
  tab keeps `menu-toggle`, the sheet `mobile-menu`, its backdrop `menu-backdrop` — same roles, so
  most consumers need only their prose changed. `current-page-marker.e2e.ts`'s phone case reads
  `Beaches` / `My bookings` rows in the sheet, which no longer exist: it moves to the tabs.
- **`nav[aria-label="Primary"]`** is what `app.spec.ts`'s #1002 test selects and expects two links
  and no button; the bottom bar takes `aria-label="Primary (phone)"` (H's label) so the desktop nav
  stays as merged and axe sees two distinct landmarks in jsdom, where both render.
- **`overlayHeldFocus`** in the close-on-navigation subscriber excludes `menuOpen` because focus
  never used to enter the sheet. It now does, so a navigation that closes an open sheet must land
  focus on `<main>` too (the #351 rule) — a row activation still returns to the tab because the
  row's own `closeMenus()` runs before `NavigationEnd`.

## Acceptance criteria (testable)

- [x] **AC-1:** Given the tourist chrome in either auth state, when the shell renders, then a
  `nav[aria-label="Primary (phone)"]` (`tab-bar`) holds `Beaches` → `/`, `My bookings` →
  `/my-bookings` and a `button` (`menu-toggle`) reading `Menu` signed out / `Account` signed in
  (accessible name `Account: <email>`), no control labelled `Sign in` in the bar, and no
  hamburger in the header (`.riv-header [data-testid="menu-toggle"]` absent). *Seam:* the shell
  DOM · *Pinned by:* `app.spec.ts` › `renders the three-tab bottom bar and no hamburger in the top
  bar (signed in: %s) (#1003)`.
- [x] **AC-2:** Given the header, when it renders, then its class list declares `sticky` and
  `max-sm:relative` and the top bar's phone-only control set is brand + swatch (the `sm:hidden`
  hamburger is gone). *Seam:* the class-list declaration + computed `position` in a real browser ·
  *Pinned by:* `app.spec.ts` › `the top bar scrolls away below sm: relative there, sticky from sm up
  (#1003)`; `e2e/tourist-tab-bar.e2e.ts` › `phone › the top bar is relative and scrolls away; the bar is
  the only sticky chrome below sm` and `tablet: the inline nav, no bar › the header sticks and the
  bar is not laid out`.
- [x] **AC-3:** Given the third tab, when activated, then the sheet (`mobile-menu`) opens holding,
  in order: `Sign in` / `Create an account` (signed out) or the identity block + `Your account`
  (signed in), then `Find a booking`, then `Sign out` (signed in); Escape and a backdrop tap close
  it. *Seam:* the shell DOM · *Pinned by:* `app.spec.ts` › `the third tab opens the sheet with the
  auth rows, Find a booking and Sign out in order (signed in: %s) (#1003)`, and the existing
  `hamburger opens the mobile menu; Escape closes it…` / `backdrop click closes the mobile menu`
  re-titled for the tab; `e2e/theme-shell.e2e.ts` › `mobile viewport › the Menu tab opens the
  sheet, navigates, closes on Escape with focus returned (AC-3, #1003)` (the `describe` title is
  `mobile viewport`).
- [x] **AC-4:** Given the tab bar is shown, when the shell renders, then the shell's root element
  declares `max-sm:pb-[calc(61px+env(safe-area-inset-bottom))]` and the sheet declares
  `bottom-[calc(76px+env(safe-area-inset-bottom))]`; given `/booking/pay`, the padding class is
  absent. In a real browser at 390px the last interactive element on `/venues/1` sits fully above
  the bar's top edge. *Seam:* class-list declaration + rendered boxes · *Pinned by:* `app.spec.ts`
  › `pads the shell by the bar plus the safe-area inset, and the sheet's offset carries the inset
  too (#1003)`; `e2e/tourist-tab-bar.e2e.ts` › `phone › nothing on the beach map is occluded by the
  bar`.
- [x] **AC-5:** Given the tourist routes, when navigating to `/`, `/venues/1`, `/my-bookings`,
  `/booking/CODE`, `/booking/confirmation`, `/booking/requested`, `/account/password` (signed in
  and out), `/account/sign-in` and `/legal/privacy`, then exactly one tab carries
  `aria-current="page"` per the section table, none on the legal page or on `/account/**` signed
  out, decided by `data.section` (the test routes carry the data, no real page loads). Every
  route in the real table carries the expected `section`. *Seam:* `Router` + `data.section` via
  `App.routeChrome`; the route table · *Pinned by:* `app.spec.ts` › `lights exactly one tab by
  route section, and none on legal pages or on the account section signed out (#1003)`;
  `app.routes.spec.ts` › `carries the tab-bar section on every tourist route and on no other
  (#1003)`.
- [x] **AC-6:** Given `data.tabBar === false` on the active route, when the shell renders, then no
  `tab-bar` exists and the shell padding class is absent; `booking/pay` carries the flag in the
  real table. In a real browser at 390px, `/booking/pay` reached through the dialog shows
  `Pay €45` fully in the viewport and no bottom `nav`. *Seam:* `data.tabBar` via `App.routeChrome`;
  the route table; rendered boxes · *Pinned by:* `app.spec.ts` › `hides the bar and drops the
  padding on a route carrying tabBar: false (#1003)`; `app.routes.spec.ts` › `hides the tab bar on
  booking/pay and nowhere else (#1003)`; `e2e/tourist-tab-bar.e2e.ts` › `the payment page has no
  bar and Pay €45 is fully visible`.
- [x] **AC-7:** Given the current tab, when rendered, then it wears full `--riv-ink`, a 3px
  top-edge bar (`::before` at opacity 1) and a 1.5px `currentColor` ring round the icon pill; the
  other tabs wear `--riv-ink-soft` with the bar at opacity 0 and no ring — in porcelain, riviera
  and dark. `--riv-ink` composites ≥ 3:1 against the tab bar at the worst stop of every theme.
  *Seam:* computed styles in a real browser; `testing/contrast.ts` maths · *Pinned by:*
  `e2e/current-page-marker.e2e.ts` › `phone: the bottom tab bar › marks the current tab with a
  full-ink shape cue in $theme (#1003)` (three themes); `app.contrast.spec.ts` › `the current tab's
  full-ink marker clears 3:1 against the tab bar in every theme: $theme (#1003)`.
- [x] **AC-8:** Given the sheet, when opened from the tab, then focus lands on its first row
  (`nav-signin-mobile` / `nav-account-link-mobile`; `find-open-mobile` while restoring); when
  closed by Escape, a backdrop tap or a row activation, then focus returns to the tab; when
  `Find a booking` is opened from the sheet and dismissed, focus returns to the tab — both auth
  states. A navigation that closes the sheet lands focus on `<main>`. *Seam:*
  `document.activeElement` · *Pinned by:* `app.spec.ts` › `the sheet takes focus on open and hands
  it back to the tab on Escape, backdrop and row activation (signed in: %s) (#1003)`, the existing
  `Find a booking from the mobile menu (signed in: %s) closes the menu and returns focus to the
  hamburger (#148, #1002)` re-titled for the tab, and `moves focus to main when a navigation closes
  the sheet (#1003)`; `e2e/find-a-booking.e2e.ts` › `phone › opens from the sheet and returns
  focus to the Menu tab on dismiss (#1002, #1003)` (the `describe` title is `phone`).
- [x] **AC-9:** Given every tab and sheet row, when the phone sweep runs, then each measures
  ≥ 44 × 44 and every tab `<a>` declares `appTouchTarget`. *Seam:* the rendered boxes; the class
  list for `<a>` · *Pinned by:* `e2e/touch-targets-tourist.e2e.ts` › `home — discovery with its filter
  bar, and the tab bar every phone surface lays out` (every phone-width surface lays the bar out)
  and `the tab bar's sheet, and the find-a-booking dialog behind it`; `app.spec.ts` › `every
  header link declares the touch floor…` extended to the bar's links.
- [x] **AC-10:** Given the tourist chrome, when it renders, then the `tab-bar` precedes the
  `header` in the DOM (`compareDocumentPosition` → `DOCUMENT_POSITION_FOLLOWING`); in a real
  browser at 390px with the theme popover open, `elementFromPoint` over a tab is the theme
  backdrop. *Seam:* DOM order; hit-testing in a real browser · *Pinned by:* `app.spec.ts` › `renders
  the tab bar before the header so the header popovers' backdrop covers it (#1003)`;
  `e2e/tourist-tab-bar.e2e.ts` › `the theme popover's backdrop covers the tab bar`.
- [x] **AC-11:** Given the three themes, when `/venues/1` renders at 390px, then the bar's computed
  `background-color` is `rgba(255, 255, 255, 0.85)` / `rgba(10, 44, 63, 0.92)` /
  `rgba(15, 23, 42, 0.92)` and its class list names `bg-riv-tabbar-glass`, not
  `bg-riv-header-glass`; `--riv-ink` and `--riv-ink-soft` composite AA over the token at every
  stop. *Seam:* computed styles; `testing/glass-tokens.ts` mirror + contrast maths · *Pinned by:*
  `e2e/tourist-tab-bar.e2e.ts` › `the bar paints its own near-opaque token per theme`;
  `app.contrast.spec.ts` › `tab labels (ink, ink-soft) meet AA on the tab-bar glass over every
  stop: $theme (#1003)`.

## Non-goals

- Desktop layout — the `sm`-and-up bar stays exactly as merged in #1004.
- Operator/admin chrome.
- Any new route or destination; hiding the bar on `booking/confirmation` / `booking/requested`
  (A-2); hiding the bar while a text field has focus.
- `viewport-fit=cover` on the viewport meta (A-1).
- A tinted selected-tab fill (would need a `--riv-tab-selected-*` pair, the maintainer's call).

## Behavior-parity ledger (retirement / replacement slices only)

The phone hamburger (`sm:hidden` button in the top bar + the header-anchored sheet) retires.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Hamburger `menu-toggle` (`Menu`, `aria-expanded`) in the top bar, `sm:hidden` | changed | the third tab in the bottom bar keeps the id and `aria-expanded`; reads `Menu` signed out, `Account` signed in |
| Sheet `mobile-menu` anchored under the header (`top-[calc(100%+8px)]`), `menu-backdrop` | changed | the same ids on a sheet fixed above the bar (`bottom-[calc(76px+env(…))]`), rendered after the header |
| Sheet rows `Beaches`, `My bookings` (exact-path `aria-current`) | dropped | they are the first two tabs, lit by section (AC-5) |
| Sheet auth group (`nav-user-mobile`, `nav-account-link-mobile`, `nav-signin-mobile`, `nav-register-mobile`) hidden while `restoring()` | preserved | same rows, same ids, same guard, first in the sheet |
| `find-open-mobile` → `openFind(menuButton)`, focus back to the hamburger on dismiss | preserved | same row; `menuButton` is the tab |
| `nav-signout-mobile` → `signOut()` parks focus on `<main>` | preserved | unchanged |
| Escape / backdrop close → focus on the hamburger | preserved | `closeMenus()` → the tab; focus now also moves INTO the sheet on open (AC-8) |
| Close-on-navigation without focus restore (focus never entered the sheet) | changed | focus enters the sheet now, so the subscriber counts `menuOpen` in `overlayHeldFocus` and lands `<main>` |
| Theme swatch beside the hamburger; picking a theme closes the sheet | preserved | the swatch stays in the top bar; `toggleThemePicker()` still closes `menuOpen` |
| Header sticky at every width | changed | `max-sm:relative`: below `sm` the top bar scrolls away and the tab bar is the only sticky chrome (AC-2) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The bar's stacking beats the header popovers' backdrop (a tab tap navigates with the picker open) | med | med | the bar renders before the header (AC-10), pinned by DOM order in the unit spec and hit-testing in the e2e | this session | closed — `app.spec.ts` DOM-order pin + `tourist-tab-bar.e2e.ts` `elementFromPoint` over a tab is `theme-backdrop` |
| R-2 | The Vitest jsdom has no stylesheet, so the ACs written as computed styles cannot be pinned there | high | low | seam shift recorded above: declaration in `app.spec.ts`, computed value in the mocked e2e | this session | closed — AC 2 / AC 4 pinned that way in phases 2–3 |
| R-3 | `focusMover()`'s `afterNextRender` fires after the sheet renders; a test that reads `activeElement` without `whenStable()` sees the tab | med | low | the focus-after-render.spec pattern: `detectChanges()` + `await fixture.whenStable()` per leg | this session | closed — the three focus tests in `app.spec.ts` await `whenStable()` per open |
| R-4 | Tailwind does not generate a class written only in a computed string | low | med | every recipe is a literal in `CLS` (app.ts) or `app.html`, the shipped idiom; the e2e reads the computed background/position, which fails on a missing class | this session | closed — built CSS carries all three `env()` declarations, `max-sm:relative`, the ring rules and `.bg-riv-tabbar-glass`; the e2e reads them rendered |
| R-5 | The sheet's rows keep their ids, so a spec that still passes may be asserting the OLD layout by accident | med | low | every consumer in the audit-log population is re-read and its prose updated, and the two that assert layout (`theme-shell` backdrop hit, `current-page-marker` phone) are rewritten | this session | closed — phase 3; `focus-ring-baseline.e2e.ts` needed no change (id only, no prose) |
| R-6 | `env()` inside a Tailwind arbitrary value is mangled (underscores, calc spacing) | low | med | phase 2 reads the built CSS for the three declarations and the e2e reads the computed `padding-bottom` (61px) and sheet `bottom` (76px) | this session | closed — Tailwind spaced the `calc()` operators itself (`calc(61px + env(…))` in the build); e2e reads 61px / 76px |
| R-7 | Two `nav` landmarks with distinct labels but only one visible per width confuse a screen-reader user | low | low | `display:none` removes the hidden one from the accessibility tree; axe in `app.a11y.spec.ts` sees both and passes on distinct labels | this session | closed — `app.a11y.spec.ts` green with both landmarks in the DOM; `theme-shell.e2e.ts` axe sweeps green at 390px |
| R-8 | The design README's `as-built diverges — see #NNN` pointer and the inline-comment guard's provenance gate contradict each other on `.dc.html` artboards | high | med | the `docs/design/*.dc.html` artboards excluded from the guard (narrowed from all of `docs/` at the review gate, F-2); the exclusion is tested and the reference states it; flagged in the PR body for the maintainer | this session | closed — guard 32/32, diff-scoped run exit 0 |

## Open questions / Assumptions

- **Assumption A-1:** `viewport-fit=cover` stays absent from the viewport meta; the
  `env(safe-area-inset-bottom)` declarations ship inert-but-ready, as the operator set-editor's
  already does. — *Owner:* maintainer · *Resolves by:* PR review (flagged in the PR body).
- **Assumption A-2:** the bar stays on `booking/confirmation` and `booking/requested` (section
  `bookings`); only `booking/pay` carries `tabBar: false`. — *Owner:* maintainer · *Resolves by:*
  PR review.

### Resolved

- **A-3:** the bottom bar's landmark label is `Primary (phone)`, leaving the desktop nav's
  `Primary` as merged — shipped in `39332e3e`.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; shell chrome only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope (the pay page only loses the bar).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.html` + `app.ts` | existing | root shell component | `routeChrome` gains `section` + `tabBar`; `computed` `tabSection`, `tabBar`, `shellClass`; `focusMover()` for the sheet; `menuOpen` reused | none |
| FE-2 | `frontend/src/app/app.routes.ts` | existing | route table | `data: { section }` on the tourist routes, `data: { tabBar: false }` on `booking/pay` | — |
| FE-3 | `frontend/src/tailwind.css` + `src/testing/glass-tokens.ts` | existing | token registry + test mirror | `--riv-tabbar-glass` per theme, `@theme inline` row | — |
| FE-4 | `frontend/src/app/app.spec.ts`, `app.routes.spec.ts`, `app.a11y.spec.ts`, `app.contrast.spec.ts` | existing | Vitest specs | — | — |
| FE-5 | `frontend/e2e/tourist-tab-bar.e2e.ts` (new) + `current-page-marker`, `theme-shell`, `touch-targets-tourist`, `find-a-booking`, `focus-ring-baseline`, `tourist-header`, `support/shell.ts` | new + existing | mocked Playwright | — | — |

**Standards:** standalone, `inject()`, native control flow, `viewChild()` signal queries, `host`
bindings, `computed()` for every derived flag; no deviation.

## FE↔BE contract

N/A — no contract change.

## Sonar gate note

First analysis on the plan-only head `433d68e0`: nothing analysed (a plan doc lies outside `sonar.sources`). On `43b20ce2`: gate OK, 244 new lines, 0 bugs, 0 vulnerabilities, 0 duplicated blocks, **96.8%** new-code coverage (API-confirmed), 1 new code smell — `javascript:S6557` on the guard's `docs/` regex, fixed in this commit together with the review gate's narrowing (F-2/F-8). Re-analysis due on this push.

## Review gate note

Ran `/code-review` (the plugin, high effort) + `riviera-review-overlay` on PR #1005 over `5e158aed..43b20ce2` (22 files / +1461 / −538, matched against the PR): six reviewers (CLAUDE.md, shallow bugs, git history, prior-PR comments, comment guidance, the overlay bank), findings scored and every one fixed in this commit — F-2..F-7 above. The overlay walk: RV-FE-1/7/8/9/E2E and RV-PROC-1/2 clean; RV-STYLE-1 the one Minor (F-5).

## Execution status

**Stage pointer:** DONE — merge close-out; merged via PR #1005 (awaiting the maintainer's merge; CI, the review gate and the Sonar gate all ran on the PR).

**Next action:** after the merge, `riviera-sdlc` `references/pr-gates.md` §3: confirm #1003 closed, unsubscribe, retire this plan at the next close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc + draft PR | ✅ | `433d68e0`, PR #1005 |
| 1 — AC 5, 6 route data: `data.section` / `data.tabBar` in the table and the `routeChrome` walk | ✅ | `073e115f` |
| 2 — AC 1, 2, 3, 4, 7, 8, 9, 10, 11 in the shell: the bar, the sheet's focus legs, the `relative` header, the padding, the token | ✅ | `39332e3e` |
| 3 — the e2e half: `tourist-tab-bar.e2e.ts`, `current-page-marker`, `theme-shell`, `touch-targets-tourist`, `find-a-booking`, `tourist-header` | ✅ | `e78c9424` |
| 4 — integration and gates (`main` unchanged, nothing to merge); close-out incl. retiring `docs/plans/tourist-header-destinations.md`; the review-gate + Sonar fix round | ✅ | `cba324cb`, `43b20ce2`, (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (repo hygiene) | the inline-comment guard flagged two `(#1003)` doc comments and the touched `support/shell.ts` TSDoc's history phrasing in the phase-3 e2e files (the guard had only been run before phase 3) | fixed-in-`43b20ce2` |
| F-2 | CI (repo hygiene) + review (agent 1, scored 60) | the design README's `as-built diverges — see #NNN` pointer vs the guard's provenance gate; the first exclusion covered all of `docs/`, wider than its stated reason (the artboards' support scripts lost the guard) | fixed-in-`43b20ce2`, narrowed to `docs/design/*.dc.html` in this commit |
| F-3 | review (git history) | a sheet opened during the in-flight navigation to a `tabBar: false` route stayed open under the #892 skip while the bar — and the sheet's trigger — unmounted: `Find a booking` no-oped and Escape stranded focus on `<body>` | fixed in this commit: the skip closes the sheet and lands `<main>` when the destination hides the bar; pinned by `app.spec.ts` › `closes the sheet and lands focus on main when the navigation it was opened during hides the bar (#1003)` and its #892 counterpart |
| F-4 | review (prior-PR recurrence, scored 95) | plan-doc *Pinned by* citations paraphrased five shipped e2e titles (the #895/#957 finding again) | fixed in this commit: quoted verbatim |
| F-5 | review (agents 1 + 6, scored 75) | an `app.spec.ts` comment cited `the #351 rule` — provenance in prose the guard's citing-word list misses | fixed in this commit |
| F-6 | review (prior-PR recurrence, scored 70) | a test-local `hamburger` variable outlived the rename its own test title carried | fixed in this commit: `menuTab` |
| F-7 | review (comment accuracy, scored 75) | the `focusAfterRender` TSDoc claimed all three focus legs for a field that serves the open leg alone | fixed in this commit |
| F-8 | sonar | `javascript:S6557` on the guard's `docs/` check: `String#startsWith` over a regex | fixed in this commit, together with F-2's narrowing |

---

## File structure

- `docs/plans/tourist-header-phone-tab-bar.md` — this plan
- `docs/plans/tourist-header-destinations.md` — retired at close-out (PR #1004 merged)
- `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — the `as-built diverges` pointer beside the artboard's phone hamburger
- `scripts/check-inline-comments.mjs` + `scripts/check-inline-comments.test.mjs` — the `docs/design/*.dc.html` artboards out of the guard's scope (the pointer convention), with its test
- `.claude/skills/riviera-java-conventions/references/inline-comment-guard.md` — the scope bullet stating it
- `frontend/src/app/app.html` — the bottom bar before the header, the sheet after it, the `max-sm:relative` header, the hamburger removed, the shell padding binding
- `frontend/src/app/app.ts` — `TouristSection` / `TouristRouteData`, `routeChrome` walk for `section` + `tabBar`, `tabSection` / `tabBar` / `shellClass` computeds, the sheet's `focusMover()`, `overlayHeldFocus` includes `menuOpen`, class recipes
- `frontend/src/app/app.routes.ts` — `data.section` on the tourist routes, `data.tabBar: false` on `booking/pay`
- `frontend/src/app/app.spec.ts` — AC 1, 2, 3, 4, 5, 6, 8, 9, 10 unit pins; hamburger tests re-titled
- `frontend/src/app/app.routes.spec.ts` — AC 5, 6 route-table pins
- `frontend/src/app/app.a11y.spec.ts` — axe over the bar + sheet in both auth states (title update)
- `frontend/src/app/app.contrast.spec.ts` — AC 7, 11 composited maths
- `frontend/src/testing/glass-tokens.ts` — `PORCELAIN_TABBAR_GLASS`, `RIVIERA_TABBAR_GLASS`, `DARK_TABBAR_GLASS`
- `frontend/src/tailwind.css` — `--riv-tabbar-glass` per theme + `@theme inline` row
- `frontend/e2e/tourist-tab-bar.e2e.ts` — AC 2, 4, 6, 10, 11 in a real browser
- `frontend/e2e/current-page-marker.e2e.ts` — AC 7 per theme; the sheet's `Beaches`/`My bookings` case retired
- `frontend/e2e/theme-shell.e2e.ts` — the phone case re-pointed at the tab
- `frontend/e2e/touch-targets-tourist.e2e.ts` — AC 9: the bar in the sweep, prose
- `frontend/e2e/find-a-booking.e2e.ts` — phone case re-titled (tab, not hamburger)
- `frontend/e2e/tourist-header.e2e.ts` — the phone swatch case no longer asserts a hamburger beside it
- `frontend/e2e/support/shell.ts` — helper TSDoc naming the sheet trigger

---

## Phase 0 — plan doc + draft PR

- [x] Commit `Plan the phone bottom tab bar (#1003)`; push; open the draft PR (CI fires on
  `pull_request` only); subscribe to it.

## Phase 1 — AC 5, 6: route data

**Files:** Modify `frontend/src/app/app.routes.ts`, `app.ts`; Test `app.routes.spec.ts`, `app.spec.ts`.

- [x] Red: `app.routes.spec.ts` — a table of `path → section` for every route (redirects and
  operator/admin routes → `undefined`); `booking/pay` alone has `tabBar === false`.
  `app.spec.ts` — surface routes carry `data.section`; navigating lights exactly one tab per
  section; `/account/password` lights `Account` signed in only; a `pay` route with
  `tabBar: false` renders no bar and no padding class.
- [x] `npx ng test --watch=false --include='src/app/app.routes.spec.ts' --include='src/app/app.spec.ts'` → FAIL.
- [x] Green: `TouristRouteData` in `app.ts`; the table's `data`; `routeChrome` walks `section`
  (leaf wins) and `tabBar` (any `false` wins); `tabSection` / `tabBar` computeds. The bar
  markup lands in phase 2 — phase 1's unit pins for AC-5 assert `tabSection()` through the
  rendered `aria-current` only once the bar exists, so phase 1 commits the route-table pins and
  the walk, and the `app.spec.ts` pins go red-then-green together with phase 2.
- [x] Commit `Carry the tab-bar section and checkout flag as route data (#1003)`.

## Phase 2 — AC 1–4, 7–11: the bar, the sheet, the header, the token

**Files:** Modify `app.html`, `app.ts`, `tailwind.css`, `testing/glass-tokens.ts`; Test
`app.spec.ts`, `app.a11y.spec.ts`, `app.contrast.spec.ts`.

- [x] Red: the `app.spec.ts` tests named in AC 1, 2, 3, 4, 8, 9, 10 (+ the AC-5/6 rendered pins
  from phase 1); `app.contrast.spec.ts` AC 7 / 11; `app.a11y.spec.ts` sheet cases.
- [x] `npx ng test --watch=false --include='src/app/app*.spec.ts'` → FAIL.
- [x] Green: the token (three blocks + `@theme inline`), the bar before the header, the third tab
  `#menuButton`, the sheet after the header with `focusAfterRender(first, 'find-open-mobile')`,
  `overlayHeldFocus` incl. `menuOpen`, `max-sm:relative` on the header, `shellClass`.
- [x] Read the built CSS (`npm run build` or `npx tailwindcss`) for the three `env()` declarations
  and the `max-sm:relative` rule (R-6).
- [x] Generalization pass: every `fixed`-to-bottom tourist surface must clear the bar — enumerate
  `grep -rn "bottom-0" frontend/src/app --include=*.html --include=*.ts`.
- [x] Commit `Replace the phone hamburger with the three-tab bottom bar (#1003)`.

## Phase 3 — the e2e half

- [x] Red-then-green per file with
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts <files>`:
  new `tourist-tab-bar.e2e.ts` (AC 2, 4, 6, 10, 11); `current-page-marker.e2e.ts` phone block
  (AC 7, three themes); `theme-shell.e2e.ts` phone case; `touch-targets-tourist.e2e.ts`;
  `find-a-booking.e2e.ts`; `focus-ring-baseline.e2e.ts` prose; `tourist-header.e2e.ts` phone swatch.
- [x] Commit `Pin the phone tab bar in the mocked e2e suite (#1003)`.

## Phase 4 — integration and gates

- [x] `git merge origin/main` (fetched fresh); `npm run lint`, `npm run format:check`, `npm test`,
  the full mocked e2e; `node scripts/check-*.mjs --diff origin/main` guards; `git rm
  docs/plans/tourist-header-destinations.md` + grep the slug outside `docs/plans/`; push; mark
  ready for review; review gate; Sonar gate; close-out in the last code-touching commit.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | plan (retiring the hamburger) | every spec/e2e reading a hamburger/sheet test id or the `menuOpen` machinery | `grep -rln -E "menu-toggle\|mobile-menu\|find-open-mobile\|nav-signout-mobile\|nav-signin-mobile\|nav-register-mobile\|nav-account-link-mobile\|nav-user-mobile\|menu-backdrop\|menuOpen\|toggleMenu\|mobileItem\|mobileBtn\|mobileMenu" frontend/src frontend/e2e` | 11 files (`app.html`, `app.ts`, `app.spec.ts`, `app.a11y.spec.ts`, `focus-ring-baseline`, `find-a-booking`, `current-page-marker`, `touch-targets-tourist`, `theme-shell`, `tourist-header`, `support/shell.ts`) | ids kept for the same roles; each file re-read in phases 2–3 (parity ledger) |
| 2026-09-07 | phase 2 (a new fixed-to-bottom tourist surface) | every tourist surface fixed to the viewport's bottom edge, which now has to clear the bar | `grep -rn "bottom-0" frontend/src/app --include=*.html --include=*.ts \| grep -v operator/` | 1 (the bar itself; the operator set-editor sheets sit under the operator/console chrome, which renders no bar) | none needed |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..11 (unit):** `npx ng test --watch=false --include='src/app/app*.spec.ts'` → 104 passed (this commit); the full unit suite 2600/2600 at `43b20ce2`.
- [x] **AC-2, 4, 6, 7, 8, 9, 10, 11 (e2e):** the seven touched specs 64/64 locally at `e78c9424`; the full mocked suite 460/460 locally at `43b20ce2`; CI green on `43b20ce2`, the frontend job's mocked e2e included.

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
- [x] Risk register has no stale `open` rows; Open Questions hold only the two maintainer assumptions (A-1, A-2), flagged in the PR body for the review.
- [x] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here (the review-gate fix commit), citing `merged via PR #1005`, and no docs-only commit follows it.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
