# Console nav 5/7 — the phone rail Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Below `sm` both consoles render a four-slot phone rail — three glyph-over-label primaries
(Daily · Requests · Beach map / Operators · Email · Refunds) plus a **More** slot that, whenever the
current page is a secondary, shows that page's glyph, label and `aria-current="page"` and otherwise
reads `More` — opening a grouped bottom sheet of the secondaries with the cross-console row at its
foot; the `Admin` section link leaves the row below `sm`; the whole row fits a 344px viewport with
every slot at the 44px floor and no sideways scroll.

**Architecture:** The shell (`console-shell.ts`) keeps one destination table per console — the
venue table it already holds gains a glyph, a hint and a group per tab; the admin table moves
out of `admin-console-tabs.ts`'s private rows into an exported `ADMIN_CONSOLE_TABS` the rail and
the shell both read — and derives from the active table one `PhoneNav` (primaries, secondaries by
group, the current destination) that a single phone-rail block renders for either console. CSS
decides which rail shows (`sm:hidden` / `max-sm:hidden`, the tourist tab bar's pattern): both are
in the DOM, so every phone-only element carries its own test id. Glyphs are one `@Component` each
(`riviera-tailwind` ICON-1..6) in `shared/console-glyphs.ts`, picked by the destination descriptor
through `NgComponentOutlet`. The sheet reuses the popover skin and the account chip's disclosure
mechanics (backdrop, Escape, close on `NavigationEnd`), with the tourist sheet's focus legs.

**Persistence:** JDBC only (invariant #1). No backend change; nothing new on the wire.

**Source of intent:** GitHub issue #1012 (parent epic #1006; the spike's `sm:hidden` rail, More
sheet and `proto-icon.ts` in `console-nav-g.ts` on `claude/operator-admin-nav-prototype-727vnz` are
the layout reference, not code to copy; `sheet-*-fold.png` and `sheet-more-open-*.png` under the
spike's `frontend/prototype-shots/console/` are the proof this slice re-establishes in e2e).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
"single scrolling row at 360/380px" contract of #1007 is superseded below `sm` by this rail, so
six e2e seams that read the desktop rail at a phone width go stale and are re-pinned here:
`admin-console-tabs.e2e.ts` (360px), the #710 case in `operator-console.e2e.ts` (380px), the
consoles block of `current-page-marker.e2e.ts` (390px), the rail-order reads in
`admin-commissions.e2e.ts` and `admin-privacy.e2e.ts` (360px), and the `Admin` box read in
`console-shell.e2e.ts` (390px); that two rails in one DOM make a shared `oc-requests-badge` id a
Playwright strict-mode violation; that the ⌘K button of AC-5 does not exist yet (#1013), so that
half of the AC is vacuous here; that #1011's plan doc is still in `docs/plans/` and retires at this
close-out) · `riviera-plan-doc` (this template — forced a seam per AC and the decisions register
below) · `tdd` (each phase red first at the named seam, scoped Vitest runs) ·
`riviera-review-overlay` (review gate — due at ready-for-review; this session pushes the branch
and opens no PR, so the gate has not run and its checkbox below stays unticked) ·
`riviera-docs-freshness` (**ran** over `5983407e..HEAD` (the merge base with a freshly fetched
`origin/main`), 5 findings, all patched in phase 5: `riviera-tailwind` § *Icons* named
`clock-icon.ts` as the one precedent — now two, with the set's shape and the template-literal trap;
`riviera-frontend`'s routing bullet said the shell wears "the section row and the section's rail" —
now the text rail from `sm` up and the phone rail below; the two console artboards gain a #1012
as-built pointer; `admin-console-tabs.ts`'s TSDoc said an overflow menu was rejected for stranding
`aria-current` — reworded in phase 2 to the More slot that carries it; the counting sweep
(`the two`/`both` × rail/icon/glyph/precedent across the two frontend skills) found nothing stale.
Plan-doc retirement: #1011's `console-nav-one-shell.md` deleted, no citation outside `docs/plans/`) · `grilling` (the intake questions answered from the code; the
reversible calls recorded under *Open questions*) · `riviera-local-debug` (unshallowed the clone;
scoped `npx vitest run <files>`; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked
e2e) · `riviera-frontend` (the glyph set is pure and presentational → `shared/`; the admin
destination table stays in `admin/`, read by the root-level shell, which may import both features;
the e2e is the mocked suite) · `riviera-tailwind` (ICON-1..6 for the glyph set; rule 3: the phone
slot composes `TAB_RAIL_MARKER` exactly as the section slot does — the same `after:-bottom-px`,
never a second `after:inset-x-*`, which would resolve by stylesheet order; rule 4:
`appTouchTarget` on every slot and sheet row; rule 6: no `outline-*`; tokens only, the sheet on
the `--riv-pop-*` family) ·
`angular-developer` + angular-cli MCP (`get_best_practices` v22; `NgComponentOutlet` verified on
angular.dev — `<ng-container *ngComponentOutlet="type" />` — for picking a glyph component from a
descriptor; `computed()` for the phone nav, `viewChild` for the More button, `focusMover()` for
the open leg) · `playwright-cli` (the mocked suite: two phone projects for the touch-target files,
`getByRole` excludes CSS-hidden elements so the rail assertions read the visible rail).

**Branch:** `claude/console-nav-phone-rail-9jofnk` (the session's designated remote branch stands
in for `feature/console-nav-phone-rail`, per the `riviera-sdlc` cloud addendum; as with #1011, this
session pushes the branch and opens no PR — the harness forbids one unless asked).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in operator at 390px on `/operator/1/daily` (and an admin on
  `/admin`), when the shell renders, then `nav[aria-label="Operator console sections (phone)"]`
  (`… "Admin console sections (phone)"`) is visible with exactly four slots — three links carrying a
  glyph and the labels `Daily` · `Requests` · `Beach map` (`Operators` · `Email` · `Refunds`) and a
  `More` button — and the desktop rail (`oc-tabs` / `nav[aria-label="Admin console sections"]`) is
  not visible; at 1280px the reverse. *Seam:* the routed SPA over `page.route` mocks (e2e) and the
  shell's DOM through its inputs (unit) · *Pinned by:* `operator-console.e2e.ts` ›
  `below sm the phone rail replaces the tab rail: four slots on one row, More reads the current secondary (#1012)`;
  `admin-console-tabs.e2e.ts` › `below sm the phone rail replaces the rail: Operators · Email · Refunds · More (#1012)`;
  `console-shell.spec.ts` › `phone rail: three primaries with glyph and label plus More, on both consoles`.
- [x] **AC-2:** Given the `phone` (390×780) and `fold` (344×882) Playwright projects, when
  `/operator/1/daily` and `/admin/audit` render, then the four slots share one `top`, the document
  never scrolls sideways, every slot's hittable box measures ≥ 44 × 44px (sheet closed and open),
  and the brand, the venue switcher and the account chip do not overlap. *Seam:* the touch-target
  sweeps over the routed SPA · *Pinned by:* `touch-targets.e2e.ts` ›
  `operator console — the phone rail fits one row, every slot at the floor, the More sheet too (#1012)`;
  `touch-targets-admin.e2e.ts` › `admin audit — the phone rail fits one row, every slot at the floor, the More sheet too (#1012)`.
- [x] **AC-3:** Given `/operator/1/payouts`, when the phone rail renders, then the fourth slot's
  accessible name contains `Payouts` and it carries `aria-current="page"`; on `/operator/1/daily` it
  reads `More` with no `aria-current`; on `/admin/audit` it reads `Audit` (current), on `/admin`
  `More`. *Seam:* the phone rail's More button through the router URL · *Pinned by:*
  `console-shell.spec.ts` › `the More slot carries the current secondary's glyph, label and aria-current, else More`;
  the two AC-1 e2e cases.
- [x] **AC-4:** Given the More button, when it is activated, then a sheet lists the secondaries in
  groups (`Set-up`: Pricing, Venue & commodities · `Money`: Payouts / `Moderation`: Photos, Reviews
  · `Money`: Commissions · `Records`: Privacy, Audit), each row a link with glyph, label and hint,
  the current one `aria-current="page"`, then the cross-console row — `Admin console` (→ `/admin`,
  admins only, venue console) or `Your venues` (→ `/operator`, admin console); focus lands on the
  first row; choosing a row navigates and closes the sheet; Escape and the backdrop close it and
  focus returns to the More button. *Seam:* the shell's sheet through its host DOM (unit) and the
  routed SPA (e2e) · *Pinned by:* `console-shell.spec.ts` ›
  `the More sheet lists the secondaries grouped with the current row marked, and the cross-console row per console`,
  `opening More focuses the first row; Escape, the backdrop and a row hand focus back to More`;
  `admin-console-tabs.e2e.ts` › `More opens the grouped sheet with Your venues at its foot; a row navigates and closes it, Escape and the backdrop return focus (#1012)`.
- [x] **AC-5:** Given an admin, when the section row renders below `sm`, then the `Admin` link is
  not visible (it carries `max-sm:hidden`); from `sm` up it is. (The ⌘K button is #1013's; nothing
  to hide yet.) *Seam:* the shell's row through its DOM (unit) and the routed SPA (e2e) ·
  *Pinned by:* `console-shell.spec.ts` › `the Admin section link leaves the row below sm (#1012)`;
  `console-shell.e2e.ts` › `the account chip opens a popover on /admin — axe clean, one header row on a phone (#1008)`
  (amended: `Admin` hidden at 390px) and
  `an admin on /admin gets the section row with Your venues, Admin current and the chip, over the admin rail (#1011)` (1280px, unchanged).
- [x] **AC-6:** Given two pending requests at 390px, when the Requests tab renders and one is
  accepted, then the phone slot's badge (`oc-phone-requests-badge`) reads `2` then `1`. *Seam:* the
  `PendingRequestsStore` count through the phone slot (unit) and the routed requests tab (e2e) ·
  *Pinned by:* `console-shell.spec.ts` › `the Requests phone slot carries the live badge, and none at zero`;
  `operator-requests.e2e.ts` › `the phone rail's Requests slot carries the badge and it decrements on accept (#1012)`.
- [x] **AC-7:** Given each glyph component, when rendered, then the host and the `<svg>` carry
  `aria-hidden="true"`, the host is `display: contents`, the svg strokes `currentColor`, sizes by
  presentation attributes with no `size-*` class, and the current slot's ink (full) and the resting
  slot's ink (0.7) composite ≥ 4.5:1 over the porcelain header glass (which covers the 3:1 graphic
  minimum); the sheet's hint ink ≥ 4.5:1 on the popover surface. *Seam:* the glyph components'
  DOM; the token maths · *Pinned by:* `console-glyphs.spec.ts` (every case runs over the whole
  set); `console-shell.contrast.spec.ts` › `the phone rail's current and resting slot inks meet AA on the header glass`,
  `the More sheet's hint ink meets AA on the popover surface`.
- [x] **AC-8:** Given 390px and 344px on `/operator/1/daily`, `/operator/1/requests`, `/admin` and
  `/admin/audit`, when axe runs with the sheet closed and open, then it reports no serious
  violation. *Seam:* `expectNoSeriousAxeViolations` over the routed SPA · *Pinned by:* the AC-2
  cases (both projects, both states) and the AC-1 cases; `console-shell.a11y.spec.ts` ›
  `is axe clean with the More sheet open on both consoles` (jsdom).
- [x] **AC-9:** Given the desktop rail's scrolling-row contract, when the viewport is `sm` (640px),
  then the admin tabs still share one row with no wrap, and the marker proofs of
  `current-page-marker.e2e.ts` hold on the phone slots at 390px and on the desktop rail at 820px.
  *Seam:* the routed SPA · *Pinned by:* `admin-console-tabs.e2e.ts` (its five rail cases moved to
  640px); `current-page-marker.e2e.ts` › `consoles: the phone rail` and `consoles: the tab rail` blocks.

## Non-goals

- The ⌘K palette and the search glyph (#1013); the dark console theme (#1010).
- Changing the desktop rail, its marker, its order contract (`ADMIN_CONSOLE_TAB_GROUPS`), or the
  section row's scroll-hide.
- Hoisting the three disclosures' shared mechanics into a directive (the palette is the point to
  extract).
- A `short` label anywhere but the phone slots; the sheet and the desktop rail keep the full labels.
- Any change to the tourist chrome or the backend.

## Behavior-parity ledger (retirement / replacement slices only)

Below `sm` the text rail retires into the phone rail; from `sm` up nothing changes.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| Rail below `sm`: one scrolling row of all six / eight text tabs, cut tab as the overflow cue | changed (issue) | four slots that fit; the rest under More, whose slot names the current one — #710's objection answered the other way (grill answer 3) |
| Rail below `sm`: every tab reachable in one tap | changed | primaries in one tap; secondaries in two (More → row) |
| Rail: `aria-current="page"` on the current tab | preserved | `routerLinkActive` on the phone links; the More button carries it when the current page is a secondary; the sheet row too |
| Rail: the Requests badge | preserved | on the phone slot's glyph (`oc-phone-requests-badge`), from the same store |
| Rail: the current tab scrolls into view | dropped below `sm` | nothing overflows; from `sm` up `TabRailTab` still does it |
| Section row below `sm`: `Admin` link for admins | changed (issue) | `max-sm:hidden`; the sheet's `Admin console` row is the phone's route |
| Section row: `Your venues` slot as the way back from admin | preserved, plus | the sheet's `Your venues` row at its foot |
| Admin rail renders only past the gate | preserved | the phone rail and sheet render under the same `adminGate()` |
| Signed-out admin URL: no `a[href^="/admin"]` anywhere | preserved | the phone rail is inside the gate; `console-shell.spec.ts` keeps the assertion |
| Rail is `position: static` (only the row is sticky) | preserved | the phone rail is in flow under the row, the sheet `fixed` only while open |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Both rails in the DOM: `getByTestId('oc-requests-badge')` matches two elements (strict mode) and `nav[aria-label$="console sections"]` / `oc-tabs` readers pick the wrong one | high | med | phone-only elements get their own ids (`oc-phone-rail`, `oc-phone-requests-badge`, `oc-more`, `oc-more-sheet`); the phone nav's label ends in ` (phone)` so the `$="console sections"` readers keep matching the desktop rail only; `grep -rn "oc-requests-badge\|oc-tabs\|console sections" frontend/e2e frontend/src` at phase 4 | agent | closed — phase 2: the audit log's population row; every phone-only element has its own id |
| R-2 | The phone-width e2e that read the desktop rail (eight files after the phase-2 audit — the six named under *Skills consulted* plus `admin-console-stats.e2e.ts` and `operator-daily.e2e.ts`'s helper) go red as soon as the rail is `max-sm:hidden` — `getByRole` excludes hidden elements | certain | med | rewritten in phase 4 against the phone rail (their intent kept: order, current, no overflow); the desktop-rail shape re-pinned at 640px/820px | agent | closed — phase 4: the eight files rewritten, plus a ninth site the second audit row found (`admin-commissions.e2e.ts`'s away-and-back clicks on `admin-tab-audit`/`-commissions` at 360px, now through the More sheet); 126/126 across the touched files and the three projects |
| R-3 | At 640px the eight admin tabs may fit without overflowing, so `admin-console-tabs.e2e.ts`'s "overflows horizontally" and "scrolls into view" cases lose their premise | med | low | measure at phase 4; if they fit, the two cases assert one row / no wrap and the on-load `aria-current`, and the overflow proof is recorded as dropped here | agent | closed — phase 4: measured at 640px, `scrollWidth` 796 against `clientWidth` 640, so the overflow proof stands as written |
| R-4 | `NgComponentOutlet` re-creates the glyph on every change-detection pass of the sticky header | low | low | the outlet only re-instantiates when the bound type changes; the descriptor tables are constants, `phoneNav` a `computed` | agent | closed — phase 4: the scroll-hide e2e (`operator-console.e2e.ts`, 200 scroll frames) and the axe sweeps run with the rail mounted; no churn observed |
| R-5 | The sheet's `fixed` box lands inside a filtered containing block and pins to the header instead of the viewport | low | med | the sheet renders in the rail box, a sibling of the header (the #1011 R-5 lesson); the e2e asserts the sheet's box sits above the viewport bottom and inside 344px | agent | closed — phase 4: `operator-console.e2e.ts` pins the sheet's box inside 390×780; the `fold` sweeps measure every row at 344px |
| R-6 | The `fold` project runs the two touch-target files whole at 344px and an unrelated surface fails the floor there | med | med | first run both files under `fold`; a pre-existing failure outside the rail is scoped out with a project `grep` on the rail cases and recorded in the findings register, never fixed silently in this slice | agent | closed — phase 4: both files pass whole under `fold` (every console surface already met the floor at 344px), so no `grep` and nothing scoped out |
| R-7 | The More button's accessible name changes with the route (`More` → `Payouts`), so an e2e locating `getByRole('button', { name: 'More' })` breaks after a navigation | med | low | the e2e locate it by `oc-more` and assert the name; the class doc says the name is route-dependent | agent | closed — phase 4: every e2e reaches it through `oc-more` (`openMoreSheet`) and asserts the name |
| R-8 | A stale template literal in `@Component.template` built from a shared `const` fails AOT if the compiler cannot evaluate it | low | low | phase 1 runs `npm run build` once; fall back to literal attributes per glyph | agent | closed — phase 1: the compiler and the build accepted `${SVG}`, angular-eslint's template parser did not (an unescaped `{`), so each glyph writes its `<svg>` attributes literally |
| R-9 | `check-touch-target.mjs` TT-1 on the new `<button>` (More) | low | low | `appTouchTarget` on it; the hook runs on save | agent | closed — phase 2: the guard passes on `console-shell.ts` |

## Open questions / Assumptions

None open. The reversible calls below were decided by the agent (the maintainer was not present
at the intake gate) and are each recorded so the maintainer can reverse them on the PR:

### Resolved

- **Decided:** CSS decides which rail shows — both are in the DOM, `max-sm:hidden` on the desktop
  rail box, `sm:hidden` on the phone rail (the tourist tab bar's "CSS decides and both live here"
  and the spike). A `matchMedia` branch would need a resize listener and a second render path.
- **Decided:** one glyph component per destination plus More, venues and admin — 17 classes in one
  file `shared/console-glyphs.ts`, sharing one `host` and one `<svg>` attribute set; picked by the
  descriptor through `NgComponentOutlet`. Per-file components would be 34 near-identical files; a
  `name` input on one component is the variant ICON-2 rules out.
- **Decided:** the admin destination table (`ADMIN_CONSOLE_TABS`: path, label, testId, glyph, hint,
  group) is exported from `admin/admin-console-tabs.ts` and the rail renders from it;
  `ADMIN_CONSOLE_TAB_GROUPS` and its subsequence spec are untouched — group *names*
  (`Accounts | Outboxes | Moderation | Money | Records`, the epic's story 16) sit in a parallel
  `ADMIN_CONSOLE_GROUP_NAMES`. The venue table (`VENUE_TABS` in the shell) gains the same fields;
  its groups are `Today | Set-up | Money` (grill answer 7).
- **Decided:** the primaries are the first three of each table (grill answer 13); a `PHONE_PRIMARIES`
  constant, not a per-row rank.
- **Decided:** the phone slots use a `short` label where the full one would wrap at 344px
  (`Daily view` → `Daily`, `Venue & commodities` → `Venue`); the sheet and the desktop rail keep
  the full label. The More slot, when current, shows the short label.
- **Decided:** the More button is a disclosure — `aria-expanded`, no `aria-haspopup` — like the chip
  and the tourist `Menu` tab; its accessible name is its visible label (`More`, or the current
  secondary's short label, which is what answers #710).
- **Decided:** the sheet is a `<nav aria-label="More (phone)">` of grouped links with `<p>` group
  labels; the cross-console group is labelled `Platform` (`Admin console`) on the venue console and
  `Operator` (`Your venues`) on admin.
- **Decided:** focus legs follow the tourist sheet — open → the first row (`focusMover()`), Escape /
  backdrop / a row → the More button; `NavigationEnd` closes without touching focus (a row click
  already handed focus back).
- **Decided:** the phone rail sits in flow under the section row (`sm:hidden grid grid-cols-4`, the
  header's glass and border, the marker on its bottom border); the section row stays the only
  sticky chrome (#1011 AC-3). Its box is `oc-phone-rail`, `position: static`.
- **Decided:** two Playwright projects, `phone` (390×780) and `fold` (344×882, the Galaxy Z Fold 5
  cover screen), run `touch-targets.e2e.ts` and `touch-targets-admin.e2e.ts`, which drop their own
  `setViewportSize`; the default `chromium` project ignores those two files. Every other spec stays
  on `chromium` and sets its viewport as today.
- **Decided:** hints are the spike's decided copy (`Arrivals, walk-ins, sales close`, …) — product
  content the maintainer approved with variant G, not code.
- **Decided:** the six stale phone-width seams are rewritten, not deleted: each keeps what it
  proved (the amended order, the current mark, no page overflow) against the rail that renders at
  its width.
- **Fact:** zero open PRs at intake; no Flyway version in play; no other branch touches
  `console-shell.ts`, the e2e or the Playwright config.
- **Fact:** #1011 closed via PR #1017 (merged); the epic's sub-issue summary reads 4/7 complete.
  Its plan doc `console-nav-one-shell.md` is still in `docs/plans/` and retires in this PR.
- **Fact:** module ownership is not in play — frontend only; the shell is the one root-level
  component allowed to read both `operator/` and `admin/`.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice adds phone navigation chrome; no booking, no
`set_availability` write path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No new read: the badge and the venue name come from the stores the shell
already consumes.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| The phone rail and More sheet for both consoles | frontend app root (`console-shell.ts`) | one block reads both destination tables; only the root may import `operator/` and `admin/` |
| The admin destination table (glyph, hint, group) | `admin/admin-console-tabs.ts` | the order contract lives there; the rail keeps rendering from the same rows |
| The glyph set | `shared/console-glyphs.ts` | pure presentational primitives, no state (`riviera-frontend` taxonomy) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/console-glyphs.ts` | new | 17 standalone glyph components | none | none |
| FE-2 | `console-shell.ts` | existing | root-level component | `computed` `phoneNav` (primaries, groups, current) from the tables + `currentUrl`; `signal` `sheetOpen`; `viewChild` More button; `focusMover()`; `(document:keydown.escape)` host listener; `NavigationEnd` → close | none |
| FE-3 | `admin/admin-console-tabs.ts` | existing | component + exported table | rows from `ADMIN_CONSOLE_TABS` | none |
| FE-4 | `playwright.a11y.config.ts` | existing | e2e config | the `phone` / `fold` projects | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. `NgComponentOutlet` is the one structural directive (no native control-flow equivalent).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `built and pushed — awaiting the maintainer's PR (review gate + Sonar gate due at ready-for-review)`

**Next action:** the maintainer opens the PR from `claude/console-nav-phone-rail-9jofnk`; the next session runs the review gate (`riviera-sdlc` `references/pr-gates.md` §1) and the Sonar gate, folds findings back through Implement, and writes `merged via PR #NN` here in the PR's last code-touching commit.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | a16ca12f |
| 1 — the glyph set (`shared/console-glyphs.ts` + spec; a production build to prove the shared template attributes compile) | ✅ | 03342ac1 |
| 2 — the phone rail: the destination tables, the four slots, the current-aware More button, the badge, `Admin` `max-sm:hidden`; shell spec, contrast spec (the a11y spec already mounts the rail closed; the open sheet is phase 3's) | ✅ | 3ab2a775 |
| 3 — the More sheet: groups, rows, cross-console row, the focus legs, close on navigation; shell spec, a11y spec | ✅ | 19e2bd55 |
| 4 — e2e: the two phone projects; the nine stale seams rewritten; the new cases (AC-1…AC-6, AC-8, AC-9); the touched files run under all three projects (126/126); F-1 fixed | ✅ | cc337d45 |
| 5 — contract: `npm run lint` + `format:check` green; 232 files / 2733 unit specs green; the whole mocked e2e 509/509 across `chromium`, `phone` and `fold` (7.4 min); docs-freshness run (5 findings, patched); #1011's plan retired; file-structure guard green; branch pushed | ✅ | the phase-5 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | red e2e (the AC-8 axe runs at 390px and 344px on `/admin/audit`, phase 4) | The audit table's `overflow-x-auto` wrapper scrolls sideways on a phone but is not keyboard-reachable — axe `scrollable-region-focusable`, serious. Pre-existing: no e2e had run axe on that route below `sm` | fixed — the wrapper is a named `role="region"` with `tabindex="0"`; the same treatment on the two payout table wrappers the audit found (below) |

---

## File structure

- `docs/plans/console-nav-phone-rail.md` — this plan.
- `docs/plans/console-nav-one-shell.md` — #1011's plan doc, retired at this close-out (deleted).
- `.claude/skills/riviera-tailwind/SKILL.md` — § *Icons*: the glyph set joins the clock icon as precedent, and the template-literal trap (docs-freshness).
- `.claude/skills/riviera-frontend/SKILL.md` — the routing bullet: the shell wears both rails (docs-freshness).
- `docs/design/riviera-operator-console-v2.dc.html` · `docs/design/riviera-admin-console.dc.html` — the #1012 as-built pointers (docs-freshness).
- `frontend/src/app/shared/console-glyphs.ts` — the 17 glyph components.
- `frontend/src/app/shared/console-glyphs.spec.ts` — the ICON-1..6 contract over the whole set.
- `frontend/src/app/console-shell.ts` — the destination tables, the phone rail, the More slot and sheet.
- `frontend/src/app/console-shell.spec.ts` — the phone rail, the More slot, the sheet, the focus legs, the badge, the Admin link's class.
- `frontend/src/app/console-shell.a11y.spec.ts` — the sheet open on both consoles.
- `frontend/src/app/console-shell.contrast.spec.ts` — the slot inks, the hint ink.
- `frontend/src/app/admin/admin-console-tabs.ts` — `ADMIN_CONSOLE_TABS`, `ADMIN_CONSOLE_GROUP_NAMES`; TSDoc on the phone rail.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — the table carries a glyph, a hint and a group per row.
- `frontend/playwright.a11y.config.ts` — the `phone` and `fold` projects.
- `frontend/e2e/touch-targets.e2e.ts` — no own viewport; the phone-rail case.
- `frontend/e2e/touch-targets-admin.e2e.ts` — no own viewport; the phone-rail case.
- `frontend/e2e/operator-console.e2e.ts` — the #710 case rewritten to the phone rail; the static pin on `oc-phone-rail`.
- `frontend/e2e/admin-console-tabs.e2e.ts` — the rail cases at 640px; the phone-rail and sheet cases at 390px.
- `frontend/e2e/current-page-marker.e2e.ts` — the consoles' marker on the phone slots (390px) and the rail (820px).
- `frontend/e2e/admin-commissions.e2e.ts` — the order read through the More slot and sheet.
- `frontend/e2e/admin-privacy.e2e.ts` — the order read through the More slot and sheet.
- `frontend/e2e/console-shell.e2e.ts` — `Admin` hidden at 390px.
- `frontend/e2e/operator-requests.e2e.ts` — the phone badge case.
- `frontend/e2e/admin-console-stats.e2e.ts` — the strip-under-the-rail case at 360px reads the phone rail.
- `frontend/e2e/operator-daily.e2e.ts` — the sign-in helper opens Daily through whichever rail is visible.
- `frontend/src/app/shared/console-destination.ts` — the destination descriptor both rails and the sheet read.
- `frontend/src/app/admin/admin-audit.ts` · `frontend/src/app/operator/payouts-tab.html` · `frontend/src/app/operator/payout-statement.ts` — F-1: the sideways-scrolling table wrappers become named, focusable regions.
- `frontend/e2e/support/shell.ts` — `openMoreSheet(page)`.

---

## Phase 1 — the glyph set

**Files:** Create `frontend/src/app/shared/console-glyphs.ts`, `console-glyphs.spec.ts`.

- [x] **Step 1: Write the failing test** — one `describe` iterating `CONSOLE_GLYPHS` (the exported
  list of the 17 components) on the `clock-icon.spec.ts` pattern:

```ts
for (const glyph of CONSOLE_GLYPHS) {
  describe(glyph.name, () => {
    it('hides itself from assistive tech at the host AND at the inner svg', …);
    it('drops its host out of layout (display: contents)', …);
    it('renders its geometry in the SVG namespace on currentColor', …);
    it('sizes itself with presentation attributes, which every call-site class outranks', …);
  });
}
it('merges the host class the call site writes, e.g. [&_svg]:size-[21px]', …);
it('exposes one glyph per venue and admin destination plus More, venues and admin', …);
```

- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/shared/console-glyphs.spec.ts` → FAIL (no module).
- [x] **Step 3: Minimal implementation** — the components; `npm run build` once (R-8).
- [x] **Step 4: Run it, verify it passes** — the spec + `src/app/shared/clock-icon.spec.ts` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every inline `<svg>` written by hand in a
  console template that a shared glyph could replace → `grep -rln "<svg" frontend/src/app --include=*.ts --include=*.html`.
- [x] **Step 6: Commit** — `Add the console glyph set (#1012)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — the phone rail and the current-aware More slot

**Files:** Modify `console-shell.ts`, `.spec.ts`, `.contrast.spec.ts`, `.a11y.spec.ts`,
`admin/admin-console-tabs.ts`, `.spec.ts`.

- [x] **Step 1: Write the failing tests** — `console-shell.spec.ts`:

```ts
it('phone rail: three primaries with glyph and label plus More, on both consoles', async () => {
  const rail = () => el.querySelector('nav[aria-label="Operator console sections (phone)"]')!;
  expect([...rail().querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
    '/operator/1/daily', '/operator/1/requests', '/operator/1/beach-map']);
  expect([...rail().children].map((c) => c.textContent.trim())).toEqual(['Daily', 'Requests', 'Beach map', 'More']);
  expect(rail().querySelectorAll('svg')).toHaveLength(4);
  await setSection('admin'); …['Operators', 'Email', 'Refunds', 'More']…
});
it('the More slot carries the current secondary\'s glyph, label and aria-current, else More', …);
it('the Requests phone slot carries the live badge, and none at zero', …);
it('the Admin section link leaves the row below sm (#1012)', () => {
  expect(byId('oc-section-admin')!.classList).toContain('max-sm:hidden');
});
```

  `admin-console-tabs.spec.ts`: `ADMIN_CONSOLE_TABS` has a glyph, a non-empty hint and a group in
  `ADMIN_CONSOLE_GROUP_NAMES` per row, in `ADMIN_CONSOLE_TAB_ORDER`.
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/console-shell.spec.ts src/app/admin/admin-console-tabs.spec.ts` → FAIL.
- [x] **Step 3: Minimal implementation** — the tables, `phoneNav`, the rail block.
- [x] **Step 4: Run it, verify it passes** — the shell's four specs + `src/app/admin/` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every reader of the rail's ids / labels
  that could now see two rails → `grep -rn "oc-requests-badge\|oc-tabs\|console sections" frontend/src frontend/e2e` (R-1).
- [x] **Step 6: Commit** — `Render the phone rail with a current-aware More slot below sm (#1012)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — the More sheet

**Files:** Modify `console-shell.ts`, `.spec.ts`, `.a11y.spec.ts`.

- [x] **Step 1: Write the failing tests** — the AC-4 cases; the a11y case with the sheet open.
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/console-shell.spec.ts src/app/console-shell.a11y.spec.ts` → FAIL.
- [x] **Step 3: Minimal implementation** — the sheet block, `sheetOpen`, the focus legs.
- [x] **Step 4: Run it, verify it passes** — the shell's four specs → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every disclosure that closes on
  `NavigationEnd` → `grep -rln "NavigationEnd" frontend/src/app` — same mechanism, same guard.
- [x] **Step 6: Commit** — `Open the More sheet from the phone rail (#1012)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — e2e

**Files:** Modify `playwright.a11y.config.ts`, the ten e2e files listed under *File structure*.

- [x] **Step 1: Write the failing tests** — the new cases per AC; the six stale seams rewritten.
- [x] **Step 2: Run it, verify it fails** — the stale readers already fail after phase 2 (R-2);
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts admin-console-tabs operator-console` → FAIL.
- [x] **Step 3: Minimal implementation** — the config projects, the rewritten cases, any rendered-size fix the sweep finds.
- [x] **Step 4: Run it, verify it passes** — the touched files under every project.
- [x] **Step 5: Generalization-audit pass** — population: every e2e that sets a viewport below 640px and reads a rail → `grep -ln "width: 3[0-9][0-9]" frontend/e2e/*.e2e.ts | xargs grep -ln "console sections\|oc-tabs\|admin-tab-"`.
- [x] **Step 6: Commit** — `Prove the phone rail at 390px and 344px in the mocked e2e (#1012)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 5 — contract

- [x] **Step 1–4:** `npm run lint`, `npm run format:check`, `npm test`, the whole mocked e2e;
  `node scripts/check-plan-file-structure.mjs --diff origin/main`; `riviera-docs-freshness` over
  `5983407e..HEAD`; #1011's plan deleted.
- [x] **Step 5: Generalization-audit pass** — population: every substrate line naming the rail's
  phone shape or the one icon precedent → `grep -rn "scroll\(s\|ing\) row\|clock-icon\|overflow menu" .claude docs frontend/src/app --include=*.md --include=*.ts` (the docs-freshness findings above).
- [x] **Step 6: Commit** — `Retire #1011's plan and refresh the docs for the phone rail (#1012)`; push.
- [x] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 1 | every hand-written inline `<svg>` in an app template that a shared glyph could replace | `grep -rln "<svg" frontend/src/app --include=*.ts --include=*.html \| grep -v spec` | `app.html` (the tourist tab bar's own three glyphs — the tourist chrome is a non-goal), `clock-icon.ts`, `console-glyphs.ts` | none to replace; the console templates hand-write no svg |
| 2026-09-07 | phase 4 (F-1) | every horizontally scrolling wrapper whose content a keyboard cannot reach — the mechanism is `overflow-x-auto` on a box with no focusable descendant | `grep -rn "overflow-x-auto" frontend/src/app --include=*.html --include=*.ts \| grep -v spec` | 4: `admin-audit.ts` (the table), `payouts-tab.html` (the ledger table), `payout-statement.ts` (the statement table), `beach-map-canvas.html` (the tile grid — its tiles are buttons, so it already passes the rule) | the three tables fixed alike; the canvas left as is |
| 2026-09-07 | phase 4 (R-2) | every e2e that clicks or waits on a desktop tab id at a width below `sm` — a second mechanism the phase-2 row (label reads) did not cover | `grep -n "admin-tab-[a-z]*').click\|admin-tab-[a-z]*').waitFor" frontend/e2e/*.e2e.ts`, cross-checked against each file's viewport | `admin-commissions.e2e.ts:144-145` (360px — rewritten through the More sheet); `admin-reviews.e2e.ts:263` and `admin-venue-photos.e2e.ts:185` click at the default desktop width | one site rewritten; the two desktop-width clicks keep the desktop rail |
| 2026-09-07 | phase 3 | every disclosure that closes itself on `NavigationEnd` — the mechanism the sheet joins | `grep -rln "NavigationEnd" frontend/src/app --include=*.ts \| grep -v spec` | `app.ts` (the tourist popovers and sheet), `operator-account-chip.ts`, `operator-venue-switch.ts`, `find-booking.ts`, `admin-console.ts`, `current-url.ts`, `console-shell.ts` | the sheet takes the chip's exact shape (`filter(NavigationEnd)` + `takeUntilDestroyed`, close without touching focus); nothing else changes — hoisting the three console disclosures' mechanics is a stated non-goal |
| 2026-09-07 | phase 2 (R-1, R-2) | every e2e or spec that reads the rail's ids or landmark names, now that two rails share the DOM — and, of those, every one that does so at a width below `sm` | `grep -rln "oc-requests-badge\|oc-tabs\|console sections" frontend/e2e frontend/src` then per file `grep -oE "width: [0-9]+"` | 20 e2e files + 4 specs read them; 8 e2e files do so below 640px: `admin-console-tabs` (360), `admin-commissions` (360), `admin-privacy` (360), `admin-console-stats` (360: the strip sits under the rail, a click on `admin-tab-commissions`), `current-page-marker` (390 consoles block), `operator-console` (380 #710 case, 390 static pin), `console-shell` (390 `Admin` box), `operator-daily` (390: the sign-in helper clicks the rail's `Daily view`) | the 12 desktop-width readers keep matching the desktop rail (the phone rail's ids and label differ; `getByRole` excludes the CSS-hidden rail); the 8 phone-width readers are rewritten in phase 4 |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 … AC-9:** `npx ng test --watch=false` → 232 files, 2733 specs PASS; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → 509/509 PASS across the three projects, the pinning cases named per AC among them. Verified at the phase-4 commit `cc337d45` plus the phase-5 docs (no code change after it).

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
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it. *Not yet: no PR exists (the maintainer opens it); the merge close-out is the next session's, in that PR's last code-touching commit.*
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked. *Not yet: due at ready-for-review, once the PR exists.*

If any box is unchecked, the feature is not done. Record the gap in Open Questions.

The two unticked boxes are the PR-stage gates: this session pushed the branch without opening a PR (the harness forbids one unless asked), so the review gate, the Sonar gate and the merge close-out are owed by the session that drives the PR.
