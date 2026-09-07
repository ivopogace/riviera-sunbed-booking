# Console nav 6/7 — the ⌘K palette Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On every console route a signed-in operator (past the admin gate on `/admin/*`) can press
⌘K / Ctrl-K, or from `sm` up click the search glyph in the section row, to open a `Go to` dialog
listing this console's sections (the current one marked, Requests with its live count), the owned
venues (each to the current tab on that venue), the other console and `Change password`; typing
filters by label, hint and group, Enter opens the first hit, Escape and the backdrop close, and focus
returns to whatever opened it — all rows at the 44px floor, the field on the 3px ring, axe clean.

**Architecture:** The shell (`console-shell.ts`) keeps knowing what is reachable — it already holds
both destination tables and the cross-console rows — and derives one `PaletteRow[]` per context
(`paletteRows`), a `computed` off the section, the URL, the owned list and the badge store. A new
`shared/console-palette.ts` component owns the dialog mechanics and nothing else: the chords as
document host listeners, the query, the filter, the first-hit highlight, Enter, the focus trap, the
backdrop, Escape, the opener bookkeeping, close-on-navigation. The shell mounts it once, past the
gate, as a sibling of the header (the #1011 R-5 lesson: a `fixed` box inside the filtered header
pins to the header), and its search button hands itself to `toggle()` as the opener. The rows reuse
the More sheet's recipe and the badge the rails share, hoisted so the three surfaces cannot drift.

**Persistence:** JDBC only (invariant #1). No backend change; nothing new on the wire.

**Source of intent:** GitHub issue #1013 (parent epic #1006; the spike's `proto-palette.ts` on
`claude/operator-admin-nav-prototype-727vnz` is the behaviour reference, not code to copy;
`sheet-palette-open.png` under the spike's `frontend/prototype-shots/console/`, G row, is the
decided rendering — the glyph plus a `⌘K` keycap right of the row before the chip, the dialog
centred under the row with the field on top and glyph · label-over-hint · group-tag rows).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced that the
glyph set has no search glyph (17 components, `More` the only non-destination one), so the set grows
and two count facts move (`console-glyphs.spec.ts`, `riviera-tailwind` § *Icons* "seventeen-glyph");
that the field must not take the spike's `outline-none` (`focus-ring-baseline.spec.ts` names any
`input` doing so); that `#1012`'s AC-5 left the ⌘K half vacuous, so `console-shell.e2e.ts`'s 390px
case and the shell spec gain the hidden-below-`sm` pin here; that #1012's plan doc is still in
`docs/plans/` and retires at this close-out; that the venue-console e2e's owned list has no venue
matching `aurora`, so the palette case mocks its own) · `riviera-plan-doc` (this template — forced a
seam per AC and the reversible-decision register below) · `tdd` (each phase red first at the named
seam, scoped Vitest runs) · `riviera-review-overlay` (review gate — due at ready-for-review) ·
`riviera-docs-freshness` (due at close-out over the PR's range; known movers listed under *File
structure*) · `grilling` (the intake questions answered from the code; the maintainer was not present,
so every product call is recorded under *Open questions* as reversible) · `riviera-local-debug`
(unshallowed the clone; scoped `npx vitest run <files>`; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`
for the mocked e2e) · `riviera-frontend` (the palette takes rows as an input and reads only the
router, so it is a presentational primitive → `shared/`; the shell, the one root-level component that
may read `operator/` and `admin/`, computes the rows; the e2e is the mocked suite) ·
`riviera-tailwind` (ICON-1..6 for the search glyph; rule 1: the row and hint recipes hoisted into
`popover-skin.ts`, the badge into `tab-rail.ts`, never `@apply`; rule 4: `appTouchTarget` on the
button, the field and every row; rule 6: the field keeps the 3px ring via `focus-visible:outline-*`,
never `outline-none`; tokens only — the dialog on the `--riv-pop-*` family, the field on
`--riv-field-*`) · `angular-developer` + angular-cli MCP (`get_best_practices` v22; angular.dev's
event-listener guide confirms `host` takes `document:` global targets and the `meta`/`control` key
modifiers — `(document:keydown.meta.k)` / `(document:keydown.control.k)`; `afterNextRender` with
`{ injector }` for the focus legs, `viewChild` for the palette and the field, `computed` for the rows,
`NgComponentOutlet` for the glyph) · `playwright-cli` (`page.keyboard.press('Meta+k')` /
`'Control+k'` for the chords; `getByRole('dialog', { name: 'Go to' })`; the touch sweep with the
dialog open).

**Branch:** `claude/command-palette-nav-1013-dg0g4q` (the session's designated remote branch
stands in for `feature/console-nav-palette`, per the `riviera-sdlc` cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in operator on a console route at 1280px, when the section row
  renders, then it carries a button named `Jump to a section or venue (⌘K)` with `aria-expanded`
  (`false`), `max-sm:hidden`; pressing it, ⌘K or Ctrl-K opens `dialog[aria-label="Go to"]`
  (`aria-modal`) with the search field focused and the button `aria-expanded="true"`; a second chord
  closes it. *Seam:* the shell's DOM through its inputs (unit), the app shell over the real routes
  (unit), the routed SPA (e2e) · *Pinned by:* `console-shell.spec.ts` ›
  `the search button opens the palette onto its field; ⌘K and Ctrl-K toggle it (#1013)`;
  `app.spec.ts` › `⌘K opens the palette on a console route and nothing on a tourist one (#1013)`;
  `console-shell.e2e.ts` › `the search glyph and ⌘K open the Go to dialog … (#1013)`.
- [ ] **AC-2:** Given `/operator/1/daily` as an admin owning two venues, when the palette opens,
  then its rows are, in order: the six venue sections (Daily view `aria-current="page"`), the owned
  venues (each to `/operator/<id>/daily`, the current venue marked), `Admin console` (→ `/admin`),
  `Change password` (→ `/account/operator-password`); a non-admin gets no `Admin console`; on
  `/admin` the eight admin tabs (Operators current), the owned venues (each to
  `/operator/<id>/beach-map`), `Change password`, and no `Admin console`; on `/operator` (plain)
  the venues, `Admin console`, `Change password`. *Seam:* the shell's palette through its host DOM
  · *Pinned by:* `console-shell.spec.ts` ›
  `the rows per context: sections with the current marked, venues on the current tab, the other console, Change password (#1013)`.
- [ ] **AC-3:** Given the palette open, when `aud` is typed on `/admin`, then only `Audit` remains,
  highlighted, and Enter navigates to `/admin/audit` and closes the dialog; when `aurora` is typed
  on `/operator/1/daily` with an owned venue `Aurora Bay`, only that row remains and Enter opens
  `/operator/2/daily`. *Seam:* the palette component through its DOM over a test router (unit); the
  routed SPA (e2e) · *Pinned by:* `console-palette.spec.ts` ›
  `typing filters by label, hint and group; the first hit is highlighted and Enter opens it`;
  `admin-console-tabs.e2e.ts` › `⌘K: typing aud leaves Audit, Enter opens it and closes the dialog (#1013)`;
  `operator-console.e2e.ts` › `Ctrl-K: typing a venue name leaves its row, Enter opens that venue on the current tab (#1013)`.
- [ ] **AC-4:** Given the palette open, when a query with no hit is typed, then `Nothing matches.`
  renders (a `role="status"`), no row is rendered, and Enter does nothing (the dialog stays open, the
  URL unchanged); an empty query highlights nothing and Enter does nothing. *Seam:* the palette
  component's DOM · *Pinned by:* `console-palette.spec.ts` ›
  `Nothing matches. for a query with no hit, and Enter does nothing then or on an empty query`.
- [ ] **AC-5:** Given the palette opened by the search button, when Escape or the backdrop closes
  it, then `document.activeElement` is the button; opened by the chord while another element held
  focus, focus returns to that element; a row activation closes and returns focus the same way; a
  navigation that ends with the dialog open (Back) closes it and, if focus was inside, lands focus on
  the opener, or on `<main>` when the opener is gone. *Seam:* the palette component's DOM (unit),
  the shell's button (unit), the routed SPA (e2e) · *Pinned by:* `console-palette.spec.ts` ›
  `Escape, the backdrop and a row hand focus back to the opener; the chord's opener is the element focused when it fired`,
  `a navigation that ends with the dialog open closes it; focus lands on the opener, or on main when it is gone`;
  `console-shell.spec.ts` › AC-1's case (the button as opener); the AC-1 e2e.
- [ ] **AC-6:** Given three pending requests, when the palette opens on the venue console, then the
  Requests row carries the badge `3` (none at zero); given a signed-out visitor on `/admin/audit`,
  when the row renders and ⌘K is pressed, then there is no search button and no dialog; the same
  while the session restores. *Seam:* the shell's DOM through the stores (unit), the routed SPA
  (e2e) · *Pinned by:* `console-shell.spec.ts` ›
  `the Requests row carries the live badge (#1013)`,
  `signed out on an admin URL: no search button and ⌘K opens nothing (#1013)`;
  `console-shell.e2e.ts` › the signed-out case (amended).
- [ ] **AC-7:** Given the dialog open at 1280px on `/operator/1/daily` and `/admin`, when the
  touch sweep, the ring probe and axe run, then every visible control (the field, every row) measures
  ≥ 44 × 44px, the field paints `outline-style: solid` / `outline-width: 3px` on focus, axe reports
  no serious violation, and the tree carries no `outline-none` on a control. *Seam:* the routed SPA
  (e2e), the stylesheet sweep (unit), the jsdom axe audit · *Pinned by:* `console-shell.e2e.ts` ›
  the AC-1 case (sweep + ring + axe with the dialog open); `focus-ring-baseline.spec.ts` (unchanged,
  sweeps the new file); `console-shell.a11y.spec.ts` › `is axe clean with the palette open on both consoles`;
  `console-palette.contrast.spec.ts` (the field inks over the field fill on the popover surface, the
  group tag, the hit row).
- [ ] **AC-8:** Given 390px, when the section row renders, then the search button is hidden
  (`max-sm:hidden`) and the row's brand, venue slot and chip still share one row; ⌘K still opens the
  dialog inside the viewport. *Seam:* the routed SPA · *Pinned by:* `console-shell.e2e.ts` ›
  `the account chip opens a popover on /admin — axe clean, one header row on a phone (#1008)` (amended:
  `oc-search` hidden, ⌘K opens the dialog inside 390px).

## Non-goals

- Arrow-key roving through the rows (Tab reaches them; the first hit is the Enter target).
- The dark console theme (#1010); any change to the tourist chrome or the backend.
- A `Ctrl K` keycap on non-Mac platforms — the decided rendering shows `⌘K`, the accessible name
  names it, and both chords work everywhere.
- Fuzzy matching, ranking or recents — a case-insensitive substring over label + hint + group.
- Moving the chip's / switcher's / sheet's disclosure mechanics into a shared directive.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. (The `Admin` section link, the rails and the More sheet keep
every route they offer; the palette is an accelerator over them.)

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The `fixed` dialog rendered inside the section row's `backdrop-filter` header pins to the header, not the viewport (the #1011 R-5 lesson) | high | high | the palette mounts as a sibling of the header, where the More sheet already lives; the e2e asserts the dialog's box lies inside the viewport at 1280px and 390px | agent | open |
| R-2 | `outline-none` on the field (the spike's shape) fails `focus-ring-baseline.spec.ts` and drops the only indicator | certain if copied | med | `focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink`, the find-booking field's shape; the e2e reads `outline-width` | agent | open |
| R-3 | A browser-level Ctrl-K (address-bar search) or ⌘K swallows the chord before the page | low | med | `preventDefault()` on the handled keydown; the e2e presses both chords headless where nothing competes; documented as the palette's own | agent | open |
| R-4 | Two rails, the sheet and the palette all render the badge — a copied recipe drifts | med | low | one `TAB_RAIL_BADGE` in `tab-rail.ts`; the sheet row / hint recipes hoisted to `popover-skin.ts` and consumed by the shell and the palette | agent | open |
| R-5 | The chord's opener unmounts on the navigation Enter drives (a focused page control), so focus lands on `<body>` | med | med | `landFocus()`: the opener when still connected, else the app shell's `<main>`; pinned in the palette spec | agent | open |
| R-6 | The palette's document Escape listener and the shell's, chip's and switcher's all fire on one press | certain | low | each is a no-op while its surface is closed (the established shape); the shell spec opens the palette alone and asserts the other disclosures stay untouched | agent | open |
| R-7 | The search button joins the row from `sm` up and pushes the chip onto a second row at 640px | low | med | the button is a 44px square, the row is `justify-between` with the switcher `min-w-0 truncate`; `console-shell.e2e.ts` keeps the one-row proof at 390px and the touch sweep at 1280px; measured at 640px in phase 4 | agent | open |
| R-8 | `check-touch-target.mjs` TT-1 on the new `<button>` and `<input>` | low | low | `appTouchTarget` on both; the hook runs on save | agent | open |
| R-9 | `type="search"`'s Preflight `outline-offset: -2px` competes with the ring offset | low | low | a utility beats Preflight; the e2e reads the ring; if it does not, `type="text"` with `role="searchbox"` | agent | open |

## Open questions / Assumptions

None open. The reversible calls below were decided by the agent (the maintainer was not present at
the intake gate) and are each recorded so the maintainer can reverse them on the PR:

### Resolved

- **Decided:** the palette also renders on the `plain` section (`/operator`, the password page):
  the issue says "anywhere on a console route", and there it lists the venues, `Admin console` and
  `Change password` with no section rows. Gate: signed in, not restoring, and on admin also
  `isAdmin` — the same gate as the admin rail.
- **Decided:** Enter acts only on a highlighted row, and only a non-empty query highlights one: ⌘K
  then Enter with nothing typed does nothing (the spike opened the first row — the current tab —
  which reads as a misfire).
- **Decided:** the dialog is `aria-modal="true"` with the shared focus trap (`focus-trap.ts`), like
  the app's four other modals; Tab reaches the rows and wraps to the field.
- **Decided:** the current venue's row is marked `aria-current="page"` on the venue console (it
  links to the page the operator is on), `Change password` on its page; two rows may therefore be
  current at once, each truthfully.
- **Decided:** venue rows on the admin console and the plain section link to `beach-map`, as the
  issue states (the switcher's rows off the console take the index redirect; the palette names the
  landing tab so its row reads the same as on the console).
- **Decided:** placement — `shared/console-palette.ts` (rows in, router only) and the rows computed in
  `console-shell.ts`; the search button is the shell's, in the row's right cluster before the chip,
  `max-sm:hidden`, with an `aria-hidden` `⌘K` keycap.
- **Decided:** the `Admin console` hint is the sheet's copy (`Operators, outboxes, moderation, records`);
  the venue hint is the spike's decided `Open <beach>`; `Change password`'s `Your operator account`.
- **Decided:** on close after a row activation or Enter, focus goes to the opener at once and, once
  the navigation ends, to the opener again or to `<main>` if it unmounted (R-5).
- **Fact:** zero open PRs at intake; no Flyway version in play; no other branch touches the shell,
  the e2e or the skills.
- **Fact:** #1012 closed via PR #1018 (merged); the epic's sub-issues read 5/7 complete; the
  close-out comment is on #1006. Its plan doc `console-nav-phone-rail.md` retires in this PR.
- **Fact:** module ownership is not in play — frontend only.

## Availability & concurrency (invariant #2)

N/A — does not affect availability: navigation chrome only; no booking, no `set_availability` write path.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No new read: the venues come from `OwnedVenues` (already loaded by the
switcher), the badge from `PendingRequestsStore`.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| What the palette lists per context (rows) | frontend app root (`console-shell.ts`) | the shell already reads both destination tables and the stores; only the root may import `operator/` and `admin/` |
| The dialog: chords, filter, highlight, Enter, trap, focus legs | `shared/console-palette.ts` | rows in, router only — a presentational primitive with UI state, like `shared/photo-lightbox.ts` |
| The search glyph | `shared/console-glyphs.ts` | the console's glyph set |
| The row / hint / badge recipes | `shared/popover-skin.ts`, `shared/tab-rail.ts` | one recipe per reused element (`riviera-tailwind` rule 1) |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/console-palette.ts` | new | standalone component | `input.required` `rows`; `signal` `open`, `query`; `computed` `hits`; `viewChild` field; `focusMover()`; document host listeners (escape, meta.k, control.k); `NavigationEnd` → close | none (a single search field bound by `(input)`) |
| FE-2 | `console-shell.ts` | existing | root-level component | `computed` `paletteRows`; `viewChild(ConsolePalette)`; the search button | none |
| FE-3 | `shared/console-glyphs.ts` | existing | glyph set | `SearchGlyph` | none |
| FE-4 | `shared/popover-skin.ts`, `shared/tab-rail.ts` | existing | recipes | `POP_NAV_ROW`, `POP_NAV_HINT`, `TAB_RAIL_BADGE` | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()` signal APIs.
`NgComponentOutlet` is the one structural directive (no native control-flow equivalent).

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** phase 3 — the shell's search button, gate, `paletteRows` and mount, red first at `console-shell.spec.ts`.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | 9b6713d7 |
| 1 — the search glyph; the row, hint and badge recipes hoisted and consumed by the shell | ✅ | 6fda2f03 |
| 2 — `shared/console-palette.ts`: the dialog, chords, filter, highlight, Enter, trap, focus legs, close on navigation; its spec, a11y and contrast specs | ✅ | (phase-2 commit) |
| 3 — the shell: the search button, the gate, `paletteRows`, the mount; shell spec, a11y spec, `app.spec.ts` | | |
| 4 — e2e: `console-shell.e2e.ts`, `operator-console.e2e.ts`, `admin-console-tabs.e2e.ts`, `support/shell.ts` | | |
| 5 — contract: lint, format, unit, the mocked e2e; docs-freshness; #1012's plan retired; file-structure guard; push | | |
| 6 — PR, CI, review gate, Sonar gate, merge close-out | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/console-nav-palette.md` — this plan.
- `docs/plans/console-nav-phone-rail.md` — #1012's plan doc, retired at this close-out (deleted).
- `.claude/skills/riviera-tailwind/SKILL.md` — § *Icons*: the glyph count (docs-freshness).
- `.claude/skills/riviera-frontend/SKILL.md` — the routing bullet: the shell wears the palette too (docs-freshness).
- `docs/design/riviera-operator-console-v2.dc.html` · `docs/design/riviera-admin-console.dc.html` — the #1013 as-built pointers (docs-freshness).
- `frontend/src/app/shared/console-palette.ts` — the palette component and `PaletteRow`.
- `frontend/src/app/shared/console-palette.spec.ts` — filter, highlight, Enter, empty state, chords, focus legs, navigation close.
- `frontend/src/app/shared/console-palette.a11y.spec.ts` — the dialog open, axe.
- `frontend/src/app/shared/console-palette.contrast.spec.ts` — the field inks, the group tag, the hit row.
- `frontend/src/app/shared/console-glyphs.ts` — `SearchGlyph`.
- `frontend/src/app/shared/console-glyphs.spec.ts` — the set gains the search glyph.
- `frontend/src/app/shared/popover-skin.ts` — `POP_NAV_ROW`, `POP_NAV_HINT`; the consumer list names the palette.
- `frontend/src/app/shared/tab-rail.ts` — `TAB_RAIL_BADGE`.
- `frontend/src/app/console-shell.ts` — the search button, `paletteRows`, the mount; the hoisted recipes consumed.
- `frontend/src/app/console-shell.spec.ts` — AC-1, AC-2, AC-6.
- `frontend/src/app/console-shell.a11y.spec.ts` — the palette open on both consoles.
- `frontend/src/app/app.spec.ts` — ⌘K on a console route vs a tourist route.
- `frontend/e2e/console-shell.e2e.ts` — AC-1, AC-5, AC-6, AC-7, AC-8.
- `frontend/e2e/operator-console.e2e.ts` — AC-3 (venue).
- `frontend/e2e/admin-console-tabs.e2e.ts` — AC-3 (Audit).
- `frontend/e2e/support/shell.ts` — `openPalette(page)`.

---

## Phase 1 — the search glyph and the hoisted recipes

**Files:** Modify `frontend/src/app/shared/console-glyphs.ts`, `console-glyphs.spec.ts`,
`popover-skin.ts`, `tab-rail.ts`, `console-shell.ts`.

- [x] **Step 1: Write the failing test** — `console-glyphs.spec.ts`: the set's selector list gains
  `app-search-glyph`; `draws Search as a lens — one circle and a handle`.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include src/app/shared/console-glyphs.spec.ts` → FAIL (TS2305: no exported member `SearchGlyph`). A bare `npx vitest run` has no config here (`describe is not defined`); the builder command is the one.
- [x] **Step 3: Minimal implementation** — `SearchGlyph`; `POP_NAV_ROW` / `POP_NAV_HINT` in
  `popover-skin.ts` and `TAB_RAIL_BADGE` in `tab-rail.ts`, the shell's `CLS.sheetRow`, `hint`,
  `badge` reading them (same strings, so no shell spec moves).
- [x] **Step 4: Run it, verify it passes** — the glyph spec + the shell's three specs + `tab-rail.spec.ts` → 116/116 PASS.
- [x] **Step 5: Generalization-audit pass** — population: every copy of the badge or sheet-row
  recipe → `grep -rn "min-w-5 items-center justify-center rounded-full\|rounded-\[14px\] px-3.5 py-\[11px\]" frontend/src/app`.
- [x] **Step 6: Commit** — `Add the search glyph and hoist the popover row and badge recipes (#1013)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 2 — the palette component

**Files:** Create `frontend/src/app/shared/console-palette.ts`, `.spec.ts`, `.a11y.spec.ts`,
`.contrast.spec.ts`.

- [x] **Step 1: Write the failing tests** — AC-3, AC-4, AC-5 cases over a host with a test router
  and a fixed `rows` input; the a11y case; the contrast cases.
- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include src/app/shared/console-palette.spec.ts …` → FAIL (TS2307: cannot find module).
- [x] **Step 3: Minimal implementation** — the component.
- [x] **Step 4: Run it, verify it passes** — the three palette specs + `focus-ring-baseline.spec.ts` → 19/19 PASS (the baseline sweep first flagged the suppression tokens *spelled* in a comment and a redundant assertion — both dropped; the sweep is the guard).
- [x] **Step 5: Generalization-audit pass** — population: every modal that traps focus → `grep -rln "trapFocusWithin" frontend/src/app` — same trap, same `aria-modal`.
- [x] **Step 6: Commit** — `Add the Go to palette: chords, filter, Enter, focus legs (#1013)`.
- [x] **Step 7: Update plan-doc execution status.**

## Phase 3 — the shell

**Files:** Modify `console-shell.ts`, `console-shell.spec.ts`, `console-shell.a11y.spec.ts`, `app.spec.ts`.

- [ ] **Step 1: Write the failing tests** — AC-1, AC-2, AC-6 in the shell spec; the a11y case; the `app.spec.ts` case.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/console-shell.spec.ts src/app/app.spec.ts` → FAIL.
- [ ] **Step 3: Minimal implementation** — the button, `paletteGate`, `paletteRows`, the mount.
- [ ] **Step 4: Run it, verify it passes** — the shell's four specs + `app.spec.ts` + `src/app/operator/` → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every reader of the row's ids that a new control could shift → `grep -rn "oc-account\b\|oc-signin\|oc-section-admin" frontend/e2e frontend/src --include=*.ts -l`.
- [ ] **Step 6: Commit** — `Mount the palette in the console shell behind the search glyph (#1013)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 4 — e2e

**Files:** Modify `console-shell.e2e.ts`, `operator-console.e2e.ts`, `admin-console-tabs.e2e.ts`, `support/shell.ts`.

- [ ] **Step 1: Write the failing tests** — the cases per AC.
- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test -c playwright.a11y.config.ts console-shell operator-console admin-console-tabs` → the new cases FAIL before phase 3 is merged into the run; here they prove the shipped behaviour.
- [ ] **Step 3: Minimal implementation** — any rendered-size or ring fix the sweep finds.
- [ ] **Step 4: Run it, verify it passes** — the touched files under `chromium`; the two touch sweeps under `phone` and `fold` (unchanged, the button is hidden there).
- [ ] **Step 5: Generalization-audit pass** — population: every e2e that presses Escape on a console route and could now hit the palette → `grep -ln "press('Escape')" frontend/e2e/*.e2e.ts | xargs grep -ln "oc-header\|oc-account"`.
- [ ] **Step 6: Commit** — `Prove the palette in the mocked e2e: chords, filter, Enter, focus, the floor (#1013)`.
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 5 — contract

- [ ] **Step 1–4:** `npm run lint`, `npm run format:check`, `npm test`, the whole mocked e2e;
  `node scripts/check-plan-file-structure.mjs --diff origin/main`; `riviera-docs-freshness` over the
  PR's range; #1012's plan deleted; the Tailwind and Angular doc checks recorded under *Skills consulted*.
- [ ] **Step 5: Generalization-audit pass** — population: every substrate line counting the glyphs or
  describing what the shell wears → `grep -rn "seventeen\|17 glyph\|More sheet)" .claude docs --include=*.md --include=*.html`.
- [ ] **Step 6: Commit** — `Retire #1012's plan and refresh the docs for the palette (#1013)`; push.
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 1 | every copy of the badge or the sheet-row recipe outside its new home — the drift mechanism the hoist removes | `grep -rn "min-w-5 items-center justify-center rounded-full\|rounded-\[14px\] px-3.5 py-\[11px\]" frontend/src/app` | none outside `popover-skin.ts` / `tab-rail.ts` (the shell now reads both) | nothing else to hoist |
| 2026-09-07 | phase 2 | every modal that traps focus — the mechanism the palette joins | `grep -rln "trapFocusWithin" frontend/src/app --include=*.ts \| grep -v spec` | `photo-lightbox.ts`, `payout-statement.ts`, `booking-dialog.ts`, `find-booking.ts`, `availability-calendar.ts`, the palette | the palette takes the same trap and `aria-modal`; `focus-trap.ts`'s doc names "four modals" — refreshed at close-out |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-8:** `npx vitest run` over the touched specs; `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.

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
