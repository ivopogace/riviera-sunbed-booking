# Console nav 4/7 — one shell Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Every operator and admin route — `/operator/:venueId/*`, `/admin/*`, `/operator` and
`/account/operator-password` — renders one shell: a sticky section row (brand · the venue
switcher as the venue-console section · `Admin` for admins · one account chip) over the active
section's tab rail, then the page; `app-operator-chrome` and the venue console's own header no
longer exist in the tree, the porcelain pin sits on the shell host alone, and below `sm` the
section row hides on scroll-down and returns on scroll-up.

**Architecture:** One new root-level component, `console-shell.ts` (`app-console-shell`), mounted
by the app shell (`app.ts`) in place of `app-operator-chrome` whenever the active route chain
carries `data.console` — the one flag that replaces `operatorConsole` + `operatorChrome` and names
the section (`venue` · `admin` · `plain`), read on the same root→leaf walk as the tourist flags.
The shell reads everything it renders from the router and root singletons: the venue id off the
route chain (App hands it over from the walk), the venue name through the coalesced
`ConsoleVenueMap` snapshot the console and the stats strip already share (so the header's read
costs no extra request), the Requests badge from `PendingRequestsStore`, the admin gate from
`OperatorAuth`. The hosts shrink to their page: the venue console becomes strip + banner + tab
outlet, the admin console title + gate + tab outlet, the landing and password page change only
their route data. Sign-out stays the chip's output; its teardown (park focus on the shell's
`<main>`, sign out, drop the two console stores, leave for the operator sign-in) moves into the
shell, the one header every host now wears. The shell lives at the app root because it composes
two features (`operator/`'s chip, switcher and stores; `admin/`'s tab rail) and the root is the
one stratum allowed to import both — the same reason `app.ts` imports `booking/find-booking`.

**Persistence:** JDBC only (invariant #1). No backend change; nothing new on the wire.

**Source of intent:** GitHub issue #1011 (parent epic #1006; the spike's `console-nav-g.ts` and
its host wirings on `claude/operator-admin-nav-prototype-727vnz` are the layout reference, not
code to copy; decisions 6, 7, 9 and 15 in the spike's `VERDICT.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that
`RESPONSIBILITIES.md` names neither chrome (grep-verified: the docs AC lands in the
`riviera-frontend` theming bullet, three TSDocs and the design artboard pointer); that the spike's
"host wirings" become a router-and-singletons context because the issue puts the flag on App's
walk and the pin on App's host; that #1009's plan doc is still in `docs/plans/` and retires at
this close-out; that the phone `Admin` link has no home until slice 5's More sheet) ·
`riviera-plan-doc` (this template — forced the parity ledger over three old surfaces and a seam
per AC) · `tdd` (each phase red first at the named seam, scoped Vitest runs) ·
`riviera-review-overlay` (review gate — due at ready-for-review, on the PR) · `riviera-docs-freshness`
(**ran** over `09a5a335..HEAD` (the merge base with a freshly fetched `origin/main`), 6 findings,
all patched in phase 5: the `riviera-frontend` theming bullet located the pin on the console's
host; `riviera-tailwind`'s theme-invariant case, `colour-literal-token-audit.md` (three rows),
`tailwind.css` (six rationale comments) and five contrast specs / two e2e headers / the
`glass-tokens.ts` TSDoc said "whose host pins porcelain" — now "whose routes the app shell pins
porcelain", and the two "the only `data-riv-theme` host bindings in the tree are the consoles"
sentences name the app shell's one binding; the credential runbook's "operator console header" is
the shell's section row; the operator-console and admin artboards carry `as-built diverges — see
#1011` pointers; the counting sweep (`the two`/`both` × header/chrome/shell/console/popover/prefix)
found one stale count, the chip spec's "the two headers tear down differently" — retitled. Plan-doc
retirement: #1009's `console-nav-venue-switcher.md` deleted, no citation outside `docs/plans/`) · `grilling` (the intake questions answered from the code,
the seven reversible calls recorded under *Open questions*) · `riviera-local-debug` (unshallowed
the clone; scoped `npx vitest run <files>`; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`
for the mocked e2e) · `riviera-frontend` (the shell is root-level beside `app.ts` — the only
stratum that may import both `operator/` and `admin/`; the chip, switcher and stores stay in
`operator/`; the e2e is the mocked suite) · `riviera-tailwind` (rule 2: `.oc-wordmark`, `.oc-tabs`
and `.oc-main` stay as inert markers; rule 4: `appTouchTarget` on every row control; rule 6: no
`outline-*` on the new controls; the sticky row's transform under `motion-reduce:transition-none`;
tokens only) · `angular-developer` (loaded at plan — `input()`/`computed()`/`effect()` +
`untracked` for the name read, `host` listeners for `window:scroll`, `RouterLinkActive` +
`ariaCurrentWhenActive` on the rail; verified at phase 1 via the angular-cli MCP) ·
`playwright-cli` (loaded at phase 2 — the scroll-hide case at 390px, the four-route sweeps).

**Branch:** `claude/console-nav-unification-1011-puns5i` (the session's designated remote branch
stands in for `feature/console-nav-one-shell`, per the `riviera-sdlc` cloud addendum; as with
#1009, the maintainer opens the PR — this session pushes the branch and does not open one).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a signed-in admin operator, when `/operator/1/daily`, `/admin`,
  `/operator` and `/account/operator-password` render, then each shows one `header`
  (`data-testid="oc-header"`) holding a `nav[aria-label="Sections"]` with the venue switcher
  slot and an `Admin` link, one account chip (`oc-account`), and — on the two console routes —
  the rail beneath (`nav[aria-label="Operator console sections"]` /
  `nav[aria-label="Admin console sections"]`), and `app-operator-chrome` and `oc-tabs` inside the
  console no longer exist in the tree. *Seam:* the app shell over its stub route table
  (`app.spec.ts`), the shell's own DOM through its inputs (`console-shell.spec.ts`), and the two
  hosts' DOM (`operator-console.spec.ts`, `admin-console.spec.ts`) · *Pinned by:*
  `app.spec.ts` › `renders the console shell instead of the tourist header on every console route (#1011)`;
  `console-shell.spec.ts` › `venue section: brand, the switcher slot, Admin for an admin, the chip and the six-tab rail`;
  `operator-console.spec.ts` › `renders no header, rail or footer of its own — the shell wears them (#1011)`;
  `admin-console.spec.ts` › `renders no tab strip of its own — the shell wears it (#1011)`;
  `operator-chrome.spec.ts` deleted with its component.
- [x] **AC-2:** Given the shell, when the section is `venue` with a venue id, then the venue slot
  carries `aria-current="page"` and `Admin` does not; when `admin`, `Admin` carries it and the
  slot does not; when `plain` (or `venue` with no parsable id), neither does. *Seam:* the shell's
  `section`/`venueId` inputs and the real route table's `data.console` values · *Pinned by:*
  `console-shell.spec.ts` › `marks the venue slot current on the venue section only, Admin on admin only`;
  `app.spec.ts` › `app.routes chrome flags` › `names the console section on the four operator/admin surfaces and nowhere else (#1011)`.
- [x] **AC-3:** Given the shell at 390px on a page taller than the viewport, when the page is
  scrolled down 200px, then `oc-header`'s bounding box bottom is ≤ 0 and after scrolling up 50px
  its top is 0 again; the header is `position: sticky`, the rail and the stats strip are
  `position: static`; under `prefers-reduced-motion: reduce` the header's `transition-duration`
  is `0s`. *Seam:* the shell's `window:scroll` host listener (unit) and the routed console over
  `page.route` mocks (e2e) · *Pinned by:*
  `console-shell.spec.ts` › `hides the section row on scroll-down past 64px and shows it on scroll-up, below sm only`;
  `operator-console.e2e.ts` › `only the section row is sticky; below sm it slides away on scroll-down and returns on scroll-up (#1011)`.
- [x] **AC-4:** Given the beach-map tab at 1280×900 with a 24-set, 12-column fixture, when the
  editor renders, then the grid frame's `scrollWidth` equals its `clientWidth` (all twelve
  columns visible without scrolling the frame). *Seam:* the routed layout editor over
  `page.route` mocks · *Pinned by:*
  `layout-editor.e2e.ts` › `fits a twelve-column layout to width at 1280px under the shell (#1011)`.
- [x] **AC-5:** Given a signed-out visitor on `/admin/audit`, when the page renders, then the
  section row shows `Sign in` (`oc-signin`, `href` carrying `returnUrl=%2Fadmin%2Faudit`), the
  page shows the Audit tab's sign-in copy, and no `a[href^="/admin"]` exists anywhere in the
  document. *Seam:* the admin console over a stub route table (unit) and the routed SPA (e2e) ·
  *Pinned by:* `admin-console.spec.ts` › `never renders the tab strip until the gate passes`
  (kept); `console-shell.spec.ts` › `admin section, signed out: Sign in with returnUrl, no Admin link, no rail`;
  `console-shell.e2e.ts` › `a signed-out visitor on /admin/audit sees the section row with Sign in and no tab link anywhere (#1011)`.
- [x] **AC-6:** Given the tourist theme stored as `dark` and as `riviera`, when each of the four
  console routes renders, then `app-root` carries `data-riv-theme="porcelain"`, `html` keeps the
  stored theme, and the header, rail and page background colours equal the porcelain run's.
  *Seam:* the app host binding (unit) and computed styles over the routed SPA (e2e) · *Pinned by:*
  `app.spec.ts` › `pins the shell porcelain on every console route and never on a tourist one (#1011)`;
  `theme-shell.e2e.ts` › `every console route renders porcelain under a dark and a riviera tourist theme, with no seam (#1011)`.
- [x] **AC-7:** Given a signed-in operator on each of the four routes, when `Sign out` is chosen
  from the chip, then focus is on the shell's `<main>` before the chip unmounts, the session is
  signed out, `PendingRequestsStore` reads 0 and `ConsoleVenueMap` refetches on its next load,
  and the app lands on `/account/sign-in?audience=operator`. *Seam:* the shell's sign-out through
  the chip's `oc-signout` row (unit) and the routed SPA (e2e) · *Pinned by:*
  `console-shell.spec.ts` › `Sign out parks focus on main, signs out, drops the console stores and leaves for the operator sign-in`;
  `app.spec.ts` › `console-shell Sign out parks focus on main before the control unmounts (WCAG 2.4.3)`;
  `console-shell.e2e.ts` › `Sign out from the chip lands on the operator sign-in from the console and from /admin (#1011)`.
- [x] **AC-8:** Given each of the four routes at 390px and at 1280px, when swept, then every
  visible control measures ≥ 44 × 44 CSS px, the brand, the `Admin` link, the switcher button and
  the chip paint a 3px focus ring, and axe reports no serious violation. *Seam:*
  `expectTouchTargets` / `expectNoSeriousAxeViolations` over the routed SPA · *Pinned by:*
  `console-shell.e2e.ts` › `the shell's controls meet the 44px floor and the 3px ring on the four routes at 390px and 1280px, axe clean (#1011)`;
  `console-shell.a11y.spec.ts` (jsdom axe on the three sections).
- [x] **AC-9:** Given the merge, when `riviera-docs-freshness` runs over the range, then no
  substrate doc still describes the console pinning porcelain on its own host or a second
  operator chrome. *Seam:* the docs-freshness audit at close-out · *Pinned by:* the close-out
  commit (the `riviera-frontend` theming bullet, `admin-console-tabs.ts` TSDoc,
  `e2e/support/shell.ts` TSDoc, the artboard pointers).

## Non-goals

- The phone rail (glyph tabs, `More` and its sheet, `Admin` leaving the row below `sm`) —
  #1012, slice 5. In this slice `Admin` stays in the row at every width.
- The ⌘K palette and its search glyph (#1013) and the dark console theme (#1010).
- Any change to the tourist chrome, `core/owned-venues.ts`, the `/operator` picker's own
  content, or the backend.
- Hoisting the chip's and the switcher's shared disclosure mechanics into a directive (the
  palette is the third disclosure and the point to extract).
- Reworking `admin-console-tabs.ts`'s order contract — the amended order shipped in #1007.

## Behavior-parity ledger (retirement / replacement slices only)

Three old surfaces retire into the shell: `app-operator-chrome`, the venue console's own header
(+ rail + footer + `<main>`), and the admin console's in-section tab strip.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `app-operator-chrome`: brand `Riviera Operator` links to `/operator` | changed | the shell's brand links to `/operator` and reads `Riviera` (the spike's draw — the section row now says which console you are in); `.oc-wordmark` marker kept on it |
| `app-operator-chrome`: no session controls while `restoring()` | preserved | the same `@if (!operator.restoring())` around chip / Sign in |
| `app-operator-chrome`: signed out → `Sign in` link with `audience=operator&returnUrl=<current url>` | preserved | `oc-signin`, `signInParams` off `shared/current-url.ts` |
| `app-operator-chrome`: signed in → the account chip, prefix `opc` | changed | one prefix, `oc`, on every route (the venue-console ids, the switcher's `oc-venue-*` included, stay untouched; every `opc-*` reference is rewritten) |
| `app-operator-chrome`: Sign out → focus on `main`, `signOut()`, navigate to the operator sign-in | preserved | the shell's `onSignOut()` |
| `app-operator-chrome`: `host: { class: 'contents' }` so the sticky header's containing block is the app's flex column | preserved | same host class on the shell |
| `app-operator-chrome`: the shell footer and `.riv-bg` render around it | preserved | App renders both whenever `console()` is set |
| console header: wordmark `Riviera Operator` as a `<span>` (`Operator` hidden below `sm`) | changed | the brand link above |
| console header: the venue switcher with `venueId`, `venueName`, `section` | preserved | the shell passes the id from the route walk, the name from its own `ConsoleVenueMap` read, the tab path parsed from `currentUrl` |
| console header: `Your venue` while the name read is pending / failed | preserved | the shell's `venueName` starts undefined per venue and stays so on a failed read |
| console header: the chip, `oc` prefix, sign-out clears `venueName`/`venue`, resets `ConsoleVenueMap` + `PendingRequestsStore`, navigates | preserved | the shell's `onSignOut()` resets both stores (it imports them from `operator/`); the console's `venue` signal is dropped when the console is destroyed by the navigation |
| console header: the account chip's `Admin console` row | dropped (issue: Admin is a section now) | the `Admin` section link; the chip holds identity · Change password · Sign out |
| console: the stats strip ABOVE the rail | changed (spike decision 9) | the rail is the shell's and sits under the section row; the strip is the console's first page element |
| console rail: six tabs, Today-first, two dividers, the Requests badge from the store | preserved | the same `ConsoleTab[]` and rail directives, moved into the shell for section `venue` |
| console rail: the active tab scrolls into view on load and on switch | preserved | `TabRailTab`'s own mechanism |
| console: header `sticky top-0 z-20` | changed | still sticky from `sm` up; below `sm` translated away on scroll-down past 64px, back on scroll-up (issue) |
| console: own `<footer data-testid="oc-footer">` | dropped | App's shared footer (`.riv-footer`), as the other operator routes already wear |
| console: own `<main tabindex="-1" class="oc-main …max-w-[1300px]">` | changed | App's `<main>` is the landmark and focus park; the console keeps a `div.oc-main` with the 1300px width the beach map needs |
| console: `host: data-riv-theme="porcelain"` + `bg-(image:--riv-bg)` | changed (issue: the pin moves to the shell host) | App's host binding pins porcelain for every `console()` route; the `.riv-bg` fixed layer paints the background |
| console: `Venue not found` page with NO header at all on `/operator/<bad>/…` | changed | the section row still renders (brand, `Your venues`, chip); the switcher is not current and no rail renders for an unparsable id |
| console: `OwnedVenues` loaded on a deep-linked console | preserved | the switcher still triggers the read wherever it mounts |
| admin console: the tab strip inside the 860px section, past the gate | changed | the shell renders `app-admin-console-tabs` under the section row, full 1120px, only when `!restoring && signedIn && isAdmin` |
| admin console: title, then the gate copy / forbidden line / outlet | preserved | unchanged in `admin-console.ts`, minus the strip and the pin |
| admin console: signed-out visitor sees no tab link anywhere | preserved | the shell's gate mirrors the console's; the `Admin` section link renders only for `isAdmin()` |
| `operator-home`: `host: data-riv-theme="porcelain"` | dropped | the shell host pins it |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two subscribers to `ConsoleVenueMap.load()` (the shell for the name, the console for the strip) fire two `GET /api/venues/1` and the console spec's `expectOne` goes red | med | low | the snapshot coalesces same-key reads; the console spec never mounts the shell (it is App's), the app spec fakes the snapshot; `console-venue-switch.spec.ts` under the real App matches the reads order-independently | agent | closed — phase 2, `httpMock.verify()` green across `operator/` |
| R-2 | A venue switch (`/operator/1/daily` → `/operator/2/daily`) leaves venue 1's name in the row (invariant #13) | low | high | the shell clears `venueName` and bumps a generation counter per `venueId`; `console-venue-switch.spec.ts` (real routes) asserts the row reads venue 2's name and nothing of venue 1 | agent | closed — phase 2: the shell spec's superseded-read case and the real-route switch spec under `App` |
| R-3 | The section row no longer fits one line at 390px / 344px with brand + name + `Admin` + chip | med | med | brand `shrink-0`, name `min-w-0 truncate`, `Admin` `shrink-0`, chip handle hidden below `sm`; the #1008 one-row assertion (`header.height ≤ 80`) re-pinned in `console-shell.e2e.ts` at 390px | agent | closed — phase 4, the 390px one-row case (`header.height ≤ 80`, no page overflow) on `/admin`, and the 344px overhang case on the console |
| R-4 | `(window:scroll)` + a signal per event re-runs change detection on every scroll frame | low | low | the signal only changes value at a direction flip (`set` with an equal value is a no-op); the listener is on the shell alone | agent | closed — phase 1, `hidden.set()` with an unchanged value is a no-op (the shell spec's scroll cases) |
| R-5 | The section slot's `relative` (for its marker) captures the switcher's `absolute` popover, so it anchors to the name and overhangs at 344px (the #1009 pin) | high | med | the popover is `fixed`: the header's `backdrop-filter` makes it the containing block, `left: max(1.5rem, 50% − 536px)` finds the centred row's content edge; the #1009 e2e pins x = brand.x and y under the row, and the 344px overhang case | agent | closed — phase 2, `operator-console.e2e.ts` green |
| R-6 | The rail moving out of `AdminConsole` breaks `admin-console-tabs.e2e.ts`'s scrolling-row pins | med | low | the nav keeps `appTabRail` and its aria-label; only its inset classes change; run the file at phase 3 | agent | closed — phase 3, `admin-console-tabs.e2e.ts` 6/6 green with the rail under the shell |
| R-7 | Deleting `oc-footer` / the console `<main>` breaks e2e cases that locate them | med | low | `grep -rn "oc-footer\|oc-main\|locator('main"` (two hits: the console spec, `theme-shell.e2e.ts` reads App's main — unchanged) | agent | closed — phase 2, no e2e locates either |
| R-8 | `AdminConsole`'s spec stubs `OperatorAuth` with four signals; the shell needs `username`, `restoring`, `isAdmin`, `signedIn` | low | low | the shell has its own spec with a fuller stub; the admin spec keeps its stub since the shell is not in its tree | agent | closed — phase 3, the admin spec's four-signal stub still suffices (no shell in its tree) |
| R-9 | `app.routes.spec.ts` › `resolves all 32 loadComponent targets` counts change | low | low | no route added or removed; only `data` changes | agent | closed — phase 3, `app.routes.spec.ts` unchanged and green |

## Open questions / Assumptions

None open. The reversible calls below were decided by the agent (the maintainer was not present
at the intake gate) and are each recorded so the maintainer can reverse them on the PR:

### Resolved

- **Decided:** the shell is mounted by App (`app.html`) and reads its context from the router and
  root singletons, not mounted by the hosts with `lead`/`body` templates as the spike's variant
  switcher did — the issue puts the flag on App's walk and the pin on App's host, and a
  host-mounted shell would put the header inside `<main>` and re-create it on every host change.
- **Decided:** `data.console: 'venue' | 'admin' | 'plain'` is the one flag; leaf-most value wins
  on the walk (the console's flag sits on the parent, children carry none).
- **Decided:** the shell reads the venue name itself through `ConsoleVenueMap` rather than the
  console publishing it — the header reads what it renders, and the snapshot makes it free.
- **Decided:** sign-out teardown lives in the shell (focus → `main`, `signOut()`, reset
  `ConsoleVenueMap` + `PendingRequestsStore`, navigate). On `/admin` the resets are no-ops.
- **Decided:** `Admin` stays visible in the row below `sm` in this slice — hiding it before slice
  5's More sheet exists would dead-end a phone admin. Slice 5 moves it.
- **Decided:** the brand reads `Riviera` (the spike's draw); the `.oc-wordmark` class stays on it
  for the e2e that measures it.
- **Decided:** off the console the switcher slot reads `Your venues`: a disclosure for two or more
  owned venues (rows link to `/operator/<id>`, the console's index redirect picks the tab), a plain
  link to `/operator` otherwise (unknown list included — the landing forwards a one-venue operator
  into the console); signed out it renders nothing, as today.
- **Decided:** one test-id prefix, `oc`; `opc-*` retires with its component.
- **Decided:** AC-8's "3px focus ring on every header control" is pinned on the row's two buttons (the switcher and the chip); the brand, `Admin` and `Sign in` are `<a>`s, which the `@layer base` rule (`button:focus-visible`, `riviera-tailwind` rule 6) deliberately leaves on the user-agent ring — as the retired chrome's links were. Widening that rule to links is a product-wide change for the maintainer, not this slice.
- **Fact:** `RESPONSIBILITIES.md` names neither chrome (`grep -n -i chrome RESPONSIBILITIES.md`
  is empty); AC-9's targets are the four listed under *Skills consulted*.
- **Fact:** #1009's close-out is complete (issue closed via PR #1016); its plan doc retires in
  this PR. No Flyway version in play. No open PR touches `frontend/src/app/app.*`, the consoles
  or `frontend/e2e/` (zero open PRs at intake).
- **Due on the PR, not in this session:** the review gate (`riviera-sdlc` `references/pr-gates.md`
  §1) and the Sonar gate (§2) run at ready-for-review, and the close-out line (`merged via PR #NN`)
  is written in the PR's last code-touching commit — the two unticked self-review boxes below.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: the slice moves chrome; no `set_availability` write path,
no booking.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. The reads the shell issues (`GET /api/venues/{id}?date=`,
`GET /api/venues/mine`, `GET /api/venues/{id}/booking-requests`) are the ones the console and the
switcher issue today.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| One console shell for every operator/admin route | frontend app root (`console-shell.ts` beside `app.ts`) | composes `operator/` and `admin/`, which no feature folder may do; `core/` may not import a feature either |
| The venue rail's tab list and badge | the shell (from `operator/operator-console.ts`) | rendered by the shell for section `venue`; the badge store stays `operator/` |
| The admin rail past the gate | the shell, rendering `admin/admin-console-tabs.ts` | the order contract and its spec stay in `admin/` |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `console-shell.ts` (`app-console-shell`) | new | standalone component, root-level | `input()` `section` + `venueId`; `signal` `hidden`, `venueName`; `computed` current marks, tab path, gate; `effect` + `untracked` for the name read; `host` `(window:scroll)` | none |
| FE-2 | `app.ts` + `app.html` | existing | the app shell | `routeChrome` walk gains `console` + `venueId`, loses `chromeless`/`operatorChrome`; `shellChrome` → `console()`; host pin keyed on it | none |
| FE-3 | `app.routes.ts` | existing | route table | `data.console` on four routes; `ConsoleRouteData` type | none |
| FE-4 | `operator/operator-console.ts` + `.html` | existing | layout component | drops header, rail, footer, `<main>`, pin, `venueName`, `section`, `tabs`, `onSignOut` | none |
| FE-5 | `operator/operator-venue-switch.ts` | existing | component | `venueId`/`section` inputs become optional; the off-console `Your venues` form | none |
| FE-6 | `operator/operator-account-chip.ts` | existing | component | drops the `Admin console` row and its id | none |
| FE-7 | `admin/admin-console.ts` | existing | layout component | drops the strip and the pin | none |
| FE-8 | `admin/admin-console-tabs.ts` | existing | component | nav inset classes for the shell's 1120px box | none |
| FE-9 | `operator/operator-home.ts` | existing | page | drops the pin | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal
APIs. No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement done — branch pushed for the maintainer's draft PR; review gate + Sonar gate due at ready-for-review`

**Next action:** the maintainer opens the PR from `claude/console-nav-unification-1011-puns5i` (CI fires on the `pull_request` event only); then run the review gate per `riviera-sdlc` `references/pr-gates.md` §1 and the Sonar gate §2, each fix re-entering at Implement.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | |
| 1 — expand: `ConsoleShell` + its specs; the switcher's off-console form; the chip drops `Admin console` (the admin rail's inset moves to phase 3, with the rail) | ✅ | be84ef86 |
| 2 — migrate the venue console: App reads `data.console`, mounts the shell for `venue`; the console sheds its chrome; the retired `operatorConsole` flag dropped with its last user; e2e (scroll-hide at 390px, the 1280px beach map) | ✅ | 47e9e60f |
| 3 — migrate the admin routes: the shell renders the admin rail past the gate; `AdminConsole` sheds its strip; e2e (`console-shell.e2e.ts` from `operator-chrome.e2e.ts`, signed-out `/admin/audit`) | ✅ | eecead86 |
| 4 — migrate the plain pages: route data on `/operator` and the password page; `OperatorHome` sheds the pin; the theme e2e over the four routes; the four-route sweeps (44px, ring, axe) at 390px and 1280px | ✅ | db83856b |
| 5 — contract: `operator-chrome.*` and the `operatorChrome` walk deleted; one e2e prefix; the docs + the #1009 plan retired; docs-freshness run (below); file-structure guard green; `npm run lint` + `format:check` green; 2650 unit specs green; the whole mocked e2e suite 473/473 green; branch pushed | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | red e2e (`theme-shell.e2e.ts`, phase 4) | Under a dark tourist theme, `main` on a console route inherited `body`'s already-resolved white ink: the retired console host carried `text-riv-ink` to re-resolve it under the pin, and the shell had not | fixed — `text-riv-ink` on the app shell's root box, every pinned route re-resolves; the four-route theme case pins header, rail, page, background and footer paints equal to the porcelain run |
| F-2 | red e2e (`console-shell.e2e.ts` sweeps, phase 4) | The landing picker's `Add another venue` link measured 145×20 — an inline `<a>` no sweep had visited | fixed — `appTouchTarget` + `inline-flex items-center` (`riviera-tailwind` rule 4) |

---

## File structure

- `docs/plans/console-nav-one-shell.md` — this plan.
- `docs/plans/console-nav-venue-switcher.md` — #1009's plan doc, retired at this close-out (deleted).
- `docs/design/riviera-operator-console-v2.dc.html` — as-built pointer on the console header (docs-freshness).
- `docs/design/riviera-admin-console.dc.html` — as-built pointer on the in-section strip (docs-freshness).
- `.claude/skills/riviera-frontend/SKILL.md` — the theming bullet: the pin sits on the app shell host for every console route.
- `frontend/src/app/shared/tab-rail.ts` — exports the marker recipe (`TAB_RAIL_MARKER`) both rows share.
- `frontend/src/app/shared/parent-venue-id.ts` — exports the id parser the app shell's walk applies to `:venueId`.
- `frontend/src/app/console-shell.ts` — the shell: section row, rail, sign-out teardown.
- `frontend/src/app/console-shell.spec.ts` — its DOM per section, the current marks, the scroll-hide, the gate, the sign-out.
- `frontend/src/app/console-shell.a11y.spec.ts` — jsdom axe on the three sections.
- `frontend/src/app/app.ts` — the `console` walk, the shell mount, the host pin.
- `frontend/src/app/app.html` — `<app-console-shell>` in place of `<app-operator-chrome>`; background and footer keyed on `console()`.
- `frontend/src/app/app.spec.ts` — the chrome-per-route cases, the route-flag cases, the sign-out focus case.
- `frontend/src/app/app.routes.ts` — `data.console` on the four routes.
- `frontend/src/app/app.routes.spec.ts` — unchanged unless the target count moves.
- `frontend/src/app/operator/operator-console.ts` — the page-only console.
- `frontend/src/app/operator/operator-console.html` — strip, banner, outlet.
- `frontend/src/app/operator/operator-console.spec.ts` — the header/rail/footer cases move to the shell spec; the store-reset assertions move too.
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — the mount without the switcher's read.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — the header rows move to `console-shell.contrast.spec.ts`.
- `frontend/src/app/console-shell.contrast.spec.ts` — the venue name and the `Admin` link on the header glass.
- `frontend/src/app/operator/console-venue-switch.spec.ts` — the real-route switch now through App + the shell.
- `frontend/src/app/operator/operator-venue-switch.ts` — the off-console form.
- `frontend/src/app/operator/operator-venue-switch.spec.ts` — the off-console cases.
- `frontend/src/app/operator/operator-account-chip.ts` — drops `Admin console`.
- `frontend/src/app/operator/operator-account-chip.spec.ts` — row sets without it.
- `frontend/src/app/operator/operator-home.ts` — drops the pin.
- `frontend/src/app/operator/operator-home.spec.ts` — the pin assertion, if any.
- `frontend/src/app/operator/operator-chrome.ts` — deleted.
- `frontend/src/app/operator/operator-chrome.spec.ts` — deleted.
- `frontend/src/app/operator/operator-chrome.a11y.spec.ts` — deleted.
- `frontend/src/app/admin/admin-console.ts` — drops the strip and the pin; TSDoc.
- `frontend/src/app/admin/admin-console.spec.ts` — the strip cases.
- `frontend/src/app/admin/admin-console.a11y.spec.ts` — if it mounts the strip.
- `frontend/src/app/admin/admin-console-tabs.ts` — the nav's inset classes; TSDoc.
- `frontend/src/app/admin/admin-console-tabs.spec.ts` — if it pins the nav classes.
- `frontend/src/app/admin/admin-console.contrast.spec.ts` · `accent-tokens.contrast.spec.ts` — doc comments: the pin is the app shell's.
- `frontend/e2e/support/shell.ts` — one operator prefix.
- `frontend/e2e/console-shell.e2e.ts` — from `operator-chrome.e2e.ts`: the four routes, the sweeps, the signed-out admin URL, sign-out.
- `frontend/e2e/operator-chrome.e2e.ts` — deleted (renamed).
- `frontend/e2e/operator-console.e2e.ts` — ids, the scroll-hide case, the footer locator.
- `frontend/e2e/layout-editor.e2e.ts` — the 1280px twelve-column case.
- `frontend/e2e/theme-shell.e2e.ts` — the four routes under dark and riviera.
- `frontend/e2e/touch-targets.e2e.ts` — ids.
- `frontend/e2e/touch-targets-admin.e2e.ts` — ids.
- `frontend/e2e/operator-registration.e2e.ts` — the one-prefix chip helper.
- `frontend/src/tailwind.css` · `frontend/src/testing/glass-tokens.ts` · `frontend/src/app/shared/{warn-token-skin,class-o-tint-tokens,fixed-fill-token-skins}.contrast.spec.ts` · `frontend/src/app/operator/{console-negative-token,console-accent-token,set-editor}.contrast.spec.ts` · `frontend/e2e/operator-error-ink.e2e.ts` · `frontend/e2e/fixed-ink-token-recut.e2e.ts` · `docs/design/colour-literal-token-audit.md` · `docs/runbooks/operator-credential-provisioning.md` · `.claude/skills/riviera-tailwind/SKILL.md` — docs-freshness: the pin lives on the app shell's host, not the console's (rationale prose only).
- `frontend/e2e/operator-daily.e2e.ts` · `operator-onboarding.e2e.ts` · `operator-password.e2e.ts` · `operator-payouts.e2e.ts` · `operator-pricing.e2e.ts` · `operator-requests.e2e.ts` · `operator-set-editing.e2e.ts` · `operator-venue-photos.e2e.ts` · `operator-venue.e2e.ts` — `opc-*` / `oc-header` references.
- `frontend/e2e/real-backend/venue-editor.e2e.ts` — the same ids.

---

## Phase 1 — expand: `ConsoleShell` and its specs

**Files:** Create `console-shell.ts`, `console-shell.spec.ts`, `console-shell.a11y.spec.ts`,
`console-shell.contrast.spec.ts` · Modify `operator-venue-switch.ts` + `.spec.ts`,
`operator-account-chip.ts` + `.spec.ts`, `admin-console-tabs.ts`.

- [x] **Step 1: Write the failing tests** — a host `<app-console-shell [section]="section()"
  [venueId]="venueId()" />` under `provideRouter` (blank pages at `/operator`, `/operator/:venueId/daily`,
  `/admin`, `/admin/audit`, `/account/sign-in`), `provideHttpClientTesting`, `OperatorAuth`
  restored from a flushed `/me`:

```ts
it('venue section: brand, the switcher slot, Admin for an admin, the chip and the six-tab rail', async () => {
  await mount('venue', 1, { admin: true });
  expect(brand().getAttribute('href')).toBe('/operator');
  expect(sections().getAttribute('aria-label')).toBe('Sections');
  expect(venueSlot().getAttribute('aria-current')).toBe('page');
  expect(adminLink().getAttribute('aria-current')).toBeNull();
  expect(railHrefs()).toEqual([1, 'daily', 'requests', 'beach-map', 'pricing', 'venue', 'payouts'].slice(1).map((p) => `/operator/1/${p}`));
});
it('admin section, signed out: Sign in with returnUrl, no Admin link, no rail', …);
it('hides the section row on scroll-down past 64px and shows it on scroll-up, below sm only', () => {
  scrollTo(100); expect(header().classList).toContain('max-sm:-translate-y-full');
  scrollTo(50);  expect(header().classList).not.toContain('max-sm:-translate-y-full');
});
it('Sign out parks focus on main, signs out, drops the console stores and leaves for the operator sign-in', …);
```

  plus the switcher's off-console cases (`Your venues` disclosure for two venues linking to
  `/operator/<id>`; a link to `/operator` for one) and the chip's row set without `Admin console`.
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/console-shell.spec.ts` → FAIL (no component).
- [x] **Step 3: Minimal implementation** — the component per the Architecture; the section slot
  recipe shares the rail's marker (`after:` 3px bar, `aria-[current=page]:`); `host: { class:
  'contents', '(window:scroll)': 'onScroll()' }`.
- [x] **Step 4: Run it, verify it passes** — the four files + `src/app/operator/` → PASS.
- [x] **Step 5: Generalization-audit pass** — population: every consumer of the chip's
  `adminLink` id → `grep -rn "admin-link" frontend/src frontend/e2e`.
- [x] **Step 6: Commit** — `Add the console shell with its section row and rail (#1011)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — migrate the venue console

**Files:** Modify `app.ts`, `app.html`, `app.spec.ts`, `app.routes.ts`, `operator-console.ts`,
`.html`, `.spec.ts`, `.a11y.spec.ts`, `.contrast.spec.ts`, `console-venue-switch.spec.ts`;
e2e `operator-console.e2e.ts`, `layout-editor.e2e.ts`, `touch-targets.e2e.ts`.

- [x] **Step 1: Write the failing tests** — `app.spec.ts`: a stub route `operator/:venueId` with
  `data: { console: 'venue' }` renders `app-console-shell`, no `.riv-header`, the footer, the
  host pin; `operator-console.spec.ts`: no `oc-header`, `oc-tabs`, `oc-footer`, no `main` inside
  the host; the console still loads the strip's venue and seeds the badge.
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/app.spec.ts src/app/operator/operator-console.spec.ts` → FAIL.
- [x] **Step 3: Minimal implementation** — App's walk + mount; the console template.
- [x] **Step 4: Run it, verify it passes** — the two files + `src/app/operator/` → PASS; then the
  e2e: `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts operator-console layout-editor touch-targets.e2e`.
- [x] **Step 5: Generalization-audit pass** — population: every e2e that locates the console's
  header, rail, footer or main → `grep -rln "oc-header\|oc-tabs\|oc-footer\|oc-main" frontend/e2e`.
- [x] **Step 6: Commit** — `Mount the console shell for the venue console (#1011)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — migrate the admin routes

**Files:** Modify `app.routes.ts`, `admin-console.ts`, `.spec.ts`, `console-shell.ts` (admin
rail), `.spec.ts`; e2e `console-shell.e2e.ts` (from `operator-chrome.e2e.ts`),
`touch-targets-admin.e2e.ts`, `admin-console-tabs.e2e.ts` run unchanged.

- [x] **Step 1: Write the failing tests** — `admin-console.spec.ts`: no `nav` in the host when
  authorized either; `console-shell.spec.ts`: the admin rail renders only past the gate.
- [x] **Step 2: Run it, verify it fails** — `npx vitest run src/app/admin/admin-console.spec.ts src/app/console-shell.spec.ts` → FAIL.
- [x] **Step 3: Minimal implementation** — the route flag, the console without the strip, the shell's admin branch.
- [x] **Step 4: Run it, verify it passes** — the two files + `src/app/admin/` → PASS; e2e
  `console-shell admin-console-tabs touch-targets-admin`.
- [x] **Step 5: Generalization-audit pass** — population: every e2e reading `opc-*` →
  `grep -rn "opc-" frontend/e2e frontend/src` (rewritten in phases 3–5, none left at contract).
- [x] **Step 6: Commit** — `Mount the console shell for the admin routes (#1011)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 4 — migrate the plain pages

**Files:** Modify `app.routes.ts`, `operator-home.ts` (+ spec if it pins the attribute);
e2e `console-shell.e2e.ts` (landing + password cases), `theme-shell.e2e.ts`.

- [x] **Step 1: Write the failing tests** — `app.spec.ts` route-flag case: `operator` and
  `account/operator-password` carry `console: 'plain'`, `admin` `'admin'`, `operator/:venueId`
  `'venue'`, no route carries `operatorChrome` / `operatorConsole`.
- [x] **Step 2: Run it, verify it fails** → FAIL on the two plain routes.
- [x] **Step 3: Minimal implementation** — the two route entries; `OperatorHome` without the pin.
- [x] **Step 4: Run it, verify it passes** — `app.spec.ts`, `operator-home.spec.ts`; e2e `console-shell theme-shell operator-password operator-onboarding`.
- [x] **Step 5: Generalization-audit pass** — population: every self-pinned porcelain host →
  `grep -rn "data-riv-theme" frontend/src/app --include=*.ts --include=*.html | grep -v spec` → only App's binding and `core/theme.ts` remain.
- [x] **Step 6: Commit** — `Mount the console shell for the operator landing and password page (#1011)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 5 — contract

**Files:** Delete `operator-chrome.ts`, `.spec.ts`, `.a11y.spec.ts`, `e2e/operator-chrome.e2e.ts`
· Modify `app.ts` (drop the old flags), `app.spec.ts`, `e2e/support/shell.ts`, the remaining
`opc-*` e2e references, the docs listed under AC-9, `docs/plans/console-nav-venue-switcher.md` (deleted).

- [x] **Step 1: Write the failing test** — `app.spec.ts`: a route carrying only the retired
  `operatorChrome: true` renders the tourist chrome (the flag is dead).
- [x] **Step 2: Run it, verify it fails** → FAIL (the flag still works).
- [x] **Step 3: Minimal implementation** — the deletions and the walk without the flags.
- [x] **Step 4: Run it, verify it passes** — `npm run lint`, `npm run format:check`, `npm test`,
  the mocked e2e files touched; `node scripts/check-plan-file-structure.mjs --diff origin/main`.
- [x] **Step 5: Generalization-audit pass** — population: every reference to the retired
  component, flags and prefix → `grep -rn "OperatorChrome\|operator-chrome\|operatorChrome\|operatorConsole\|opc-" frontend docs .claude`.
- [x] **Step 6: Commit** — `Retire the operator chrome and the console's own header (#1011)`.
- [x] **Step 7: Update plan-doc execution status; push the branch for the maintainer's PR.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 4 (F-1) | every element under the pin that inherits `color` rather than naming a `text-riv-*` utility — the mechanism is `body { color: var(--riv-ink) }` resolving once at document scope | `grep -n "color: var(--riv" frontend/src/tailwind.css` → one site, `body`; the fix sits on the one root box every route shares | 1 (`app.ts` `SHELL`) | fixed at the root; no per-page `text-riv-ink` needed |
| 2026-09-07 | phase 4 (F-2) | every `<a>` on the four routes' resting surfaces — enumerated by the sweep itself (`expectTouchTargets` over each route at 390px and 1280px) | the `console-shell.e2e.ts` sweep cases | 1 (`operator-home-add-venue`) | fixed |
| 2026-09-07 | phase 2 | every e2e/spec that locates the console's header, rail, footer or main | `grep -rln "oc-header\|oc-tabs\|oc-footer\|oc-main" frontend/e2e frontend/src` | 14 e2e files + 3 specs read `oc-header`/`oc-tabs` — both ids survive on the shell, so only the console's own specs changed; `oc-footer` had one reader (the console spec, rewritten) | ids kept; the `motion-reduce:transition-none` finding (it zeroes `transition-property`, not the duration) fixed the AC-3 assertion |
| 2026-09-07 | phase 1 | every consumer of the chip's `adminLink` id / `Admin console` row | `grep -rn "admin-link\|Admin console" frontend/src frontend/e2e` | `operator-account-chip.spec.ts`, `operator-chrome.spec.ts` (unit, rewritten now); `operator-chrome.e2e.ts` (rewritten in phase 3 with the file) | rewritten |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 … AC-8:** `npm test` → 231 files, 2650 specs PASS; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → 473/473 PASS (the pinning cases named per AC among them). Verified at the phase-5 commit.
- [x] **AC-9:** `riviera-docs-freshness` over `09a5a335..HEAD` → 6 findings, all patched in the phase-5 commit (the *Skills consulted* line records each).

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
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
