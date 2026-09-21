# Shell header on a wide route Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** The shell header's inner wrapper runs edge to edge on a route carrying `data.wide`
and keeps its 1080 px cap everywhere else; the eyebrow is 12.5 px in its own case on every
route; and the theme swatch leaves the header row for a labelled, keyboard-reachable row in
both account menus.

**Architecture:** The width is a static route flag (`TouristRouteData.wide`) read off the
existing single root→leaf `routeChrome` walk and applied as Tailwind v4's bare boolean
`data-wide:` variant on the same element that carries the cap — deliberately not the
prototype's page-scoped treatment of rendered DOM, which existed only so a spike could avoid
editing the shared shell. The swatch becomes a nested disclosure inside the account menu
(`aria-expanded` on the row, the existing `aria-pressed` option buttons revealed in place),
which retires the separate theme popover and its backdrop rather than nesting two popovers.

**Persistence:** N/A — frontend-only; no tables, no migrations, no JDBC (invariant #1
untouched).

**Source of intent:** GitHub issue #1169; measurements from the map-design prototype's
`README.md` § *Round 11* § 3 and `prototype-header.ts` on `claude/map-design-prototype-417sh1`
@ `2cf675da` (PR #1155, an open draft that is never merged).

**Skills consulted:** `riviera-sdlc` (the intake gate caught that `theme-shell.e2e.ts` cannot
"pass unchanged" as AC 6 implies — three of its cases have the two-sibling-popover premise the
slice deletes — and that no in-flight PR touches the shell) · `riviera-plan-doc` (forced the
behaviour-parity ledger, which surfaced the retiring swatch-ring contrast test) · `tdd` (each
phase red→green at the seams below) · `riviera-review-overlay` (review gate, at
ready-for-review) · `riviera-docs-freshness` (close-out, over the PR range) ·
`riviera-local-debug` (unshallowed the clone to read the prototype branch; scoped test
commands) · `riviera-frontend` (placement: the flag joins `TouristRouteData` in `app.ts`, the
new e2e goes in the mocked suite `frontend/e2e/`) · `riviera-tailwind` (rule 3 — two competing
`max-width` utilities; resolved by measuring specificity, see R-1) · `angular-developer` +
angular-cli MCP (`[attr.*]`-with-`null` semantics confirmed against the v22 binding guide;
`@angular/aria` ruled out, see R-4) · `frontend-design` (independently names the tracked-out
all-caps eyebrow AND middle-dot meta strings as templated tells — the second one changes how
the row renders, see FE-3) · `playwright-cli` (the wide-header measurement e2e)

**Branch:** `claude/sdlc-1169-styo00` (the designated remote branch stands in for
`feature/shell-header-wide-route`; exists before phase 0)

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a route whose `data` carries `wide: true`, when the shell renders it,
      then the header's inner wrapper carries the `data-wide` attribute; given a route without
      the flag, the attribute is absent. The *rendered* `max-width` is AC-2's job: Tailwind's
      stylesheet is not loaded under jsdom (`vitest-base.config.ts` imports no CSS, and no unit
      spec in the tree asserts a computed value), so a unit spec can only pin the plumbing.
      *Seam:* `TouristRouteData` route flag observed through the rendered header wrapper ·
      *Pinned by:*
      `app.spec.ts` › "the header wrapper opts into full-bleed on a data.wide route and not elsewhere"
- [ ] **AC-2:** Given Discover (`/`), when it is opened at 1440 and at 1920, then the header
      wrapper's rendered box spans the full viewport width and the brand's left edge sits at
      the panel's own left edge (x ≈ 24 at both), not 180/420 px inside it. *Seam:* the
      `/` route in a real browser · *Pinned by:*
      `shell-header-wide.e2e.ts` › "the header is the page's on Discover at 1440 and 1920"
- [ ] **AC-3:** Given any tourist route, when the header renders, then the brand's eyebrow
      computes `font-size: 12.5px` and `text-transform: none`. *Seam:* the rendered brand
      block · *Pinned by:* `shell-header-wide.e2e.ts` › "the eyebrow is 12.5px in its own case on every route"
- [ ] **AC-4:** Given the header row on any route, when it renders, then it contains no
      theme control; and given the account menu (desktop popover) or the phone sheet, when
      opened, then it contains a row named `Colour theme` whose current value is the active
      theme's name, focusable by keyboard, with `aria-expanded="false"`, and measuring at
      least 44 × 44 CSS px. *Seam:* the rendered header and both account menus · *Pinned by:*
      `app.spec.ts` › "the theme control is a labelled menu row, not a header swatch" and
      `tourist-header.e2e.ts` › "the header carries no theme control; the menu row does"
- [ ] **AC-5:** Given the `Colour theme` row, when it is activated, then `aria-expanded`
      becomes `true` and the three theme options are revealed in the same menu; when an
      option is chosen, then `ThemeService.theme()` is that id, `<html>`'s `data-riv-theme`
      follows, the choice survives a reload, and the menu closes. Holds for all three themes
      and from both menus. *Seam:* `ThemeService` + the `data-riv-theme` document attribute ·
      *Pinned by:* `app.spec.ts` › "choosing a theme from the menu row selects and persists it"
      and `theme-shell.e2e.ts` › "a theme chosen from the menu row persists across a reload"
- [ ] **AC-6:** Given each of the three themes on both a capped route and a wide route, when
      the header and the open account menu are audited, then axe reports no serious
      violations and the row's composited colours meet the thresholds
      `docs/design/non-text-contrast.md` sets (rule 2a for the row's `aria-hidden` swatch
      circle — the label and value carry the identity — measured, not assumed).
      *Seam:* the rendered shell in each theme · *Pinned by:*
      `app.a11y.spec.ts` › "the account menu's theme row is clean in every theme",
      `app.contrast.spec.ts` › "the theme row's circle is decorative under rule 2a: $theme",
      and `theme-shell.e2e.ts` › "the header and its menu are axe-clean on a capped and a wide route"
- [ ] **AC-7:** Given a wide route that renders the shared footer, when it renders, then the
      footer's inner carries `data-wide`, mirroring the header; and given a capped route that
      renders it, the attribute is absent and the inner computes `max-width: 1080px` in a real
      browser. No shipped route is both wide and footer-rendering (Discover is `footer: false`),
      so the positive leg is pinned on a synthetic test route at the attribute, and the rendered
      proof rests on AC-2: the footer inner carries the *same* `data-wide:max-w-none` utility on
      the same element, so AC-2 proving that utility compiles and outranks the cap proves it
      here too. *Seam:* the rendered footer inner · *Pinned by:*
      `app.spec.ts` › "the footer follows the header on a wide route" and
      `shell-header-wide.e2e.ts` › "a capped route's footer keeps its 1080px cap"
- [ ] **AC-8:** Given the full mocked e2e suite, when it runs, then `tourist-header.e2e.ts`,
      `theme-shell.e2e.ts` and `current-page-marker.e2e.ts` pass — every route keeps its
      header, its account controls and its current-page marker. *Seam:* the mocked suite ·
      *Pinned by:* `npm run test:e2e:a11y`

## Non-goals

- Making Discover's map the default route (#1167) — this slice only ensures the desktop
  header is not wrong on the day that lands.
- Removing the eyebrow. Measured quieter (brand block 126 px vs 142 px) and rejected in #1169:
  it throws away the one line that says where this is, and the brand would then differ between
  this route and every other.
- Varying the width by query param. `?map=off` keeps the wide header for the one release it
  survives — see the ledger row and R-3.
- Any change to `ThemeService`, `THEME_OPTIONS`, the storage key or the `index.html` seed. The
  registry stays two places (`riviera-frontend` § Theming).
- Adding `@angular/aria` (R-4).

## Behavior-parity ledger

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Header swatch button (`theme-toggle`) opens a theme popover | **changed** | The control is now the `Colour theme` row inside each account menu; the options are revealed in place by the row's own `aria-expanded` disclosure. |
| `theme-toggle` is the accessible name `Color theme: <name>` | **changed** | The row's name comes from its content — `Colour theme` plus the active theme's name — so the value is announced without an `aria-label` override. Retires the repo's lone American "Color" string; visible copy is `Colour theme`, matching `docs/design`'s colour ledger and #1169. |
| Separate theme popover (`cls.themePop`, `.riv-theme-pop`) + its own backdrop (`theme-backdrop`) | **dropped** | One popover is open at a time by construction now: the options live inside the account popover/sheet, which already has a backdrop (`account-backdrop` / `menu-backdrop`). Deleting the second surface is what makes the "one header popover at a time" tests collapse into the nesting itself. |
| Choosing a theme closes whatever surface was open | **preserved** | `selectTheme` still calls `closeMenus()`; the collapse of the nested options is implied by the menu closing. |
| Swatch visible in the header at phone width | **changed** | Phone theming moves to the sheet's `Colour theme` row. The header row below `sm` is now brand-only; the sheet is the only menu reachable there, so no reach is lost. |
| `app.contrast.spec.ts` › "the swatch ring (ink-soft) clears 3:1 against the header glass in every theme (#1002)" | **dropped, replaced** | Its premise — "the theme control is a bare swatch, so the swatch's ring is its only WCAG 1.4.11 boundary" — dies with the header swatch. Replaced by the rule-2a measurement in AC-6: in the menu the circle is an `aria-hidden` ornament whose meaning is carried by the labelled row, so `--riv-ink-soft`'s ring is no longer load-bearing. The number is still measured. |
| `tourist-tab-bar.e2e.ts` › the theme backdrop covers the tab bar | **changed** | Same guarantee, different backdrop: the assertion moves to the account/sheet backdrop, which is the surface that now covers the bar. |
| `theme-shell.e2e.ts` cases whose premise is "swatch and account menu are two sibling header popovers, only one open at a time" | **changed** | Rewritten to the nesting: opening the menu and expanding the row is one surface, so the mutual-exclusion cases become "the sheet/popover closes on select" and "the backdrop intercepts". AC 6 of #1169 says these specs "pass"; they pass *as updated*, not unchanged — recorded here because the issue understates it. |
| `openShellOverlay(page, 'theme-toggle')` as the one-click way into the picker (10 call sites) | **changed** | Replaced by one helper, `openThemePicker(page)`, that opens the right menu for the viewport and expands the row. The second line of each call site (`theme-option-<id>`) is unchanged, so the testids the suite asserts on survive. |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `riviera-tailwind` rule 3: `max-w-[1080px]` and `data-wide:max-w-none` are two competing `max-width` utilities, which resolve by stylesheet order, not class order — a silent full-bleed-everywhere or capped-everywhere bug | Medium | High | **Measured, not assumed.** Compiled both with the repo's own tailwindcss 4.3.3: `data-wide:max-w-none` → `.data-wide\:max-w-none[data-wide]`, specificity (0,2,0), vs `.max-w-\[1080px\]` at (0,1,0). The variant wins on specificity, independent of order. AC-1 asserts the *computed* `max-width`, not the class list, so a regression is caught rather than reasoned about | plan | resolved at plan time |
| R-2 | The ancestor form `in-data-wide:` compiles to `:where([data-wide]) .in-…`; `:where()` contributes zero specificity, so it **ties** `max-w-[1080px]` at (0,1,0) and is decided by emission order alone | Medium | High | Do not use it. Header wrapper and footer inner each get their own same-element `[attr.data-wide]` binding, so both carry the (0,2,0) form. Recorded because one attribute on the shell root is the obvious-looking simplification a later reviewer or slice will reach for | plan | resolved at plan time |
| R-3 | Discover's `?map=off` fallback renders `<section class="discover mx-auto max-w-[1080px]">` — a capped column — so a static route flag gives it a full-bleed header over a capped page | High (certain while `?map=off` lives) | Low | Accepted and stated in the PR. The mismatch is the mild direction (header wider than content, not narrower), `?map=off` is a one-release comparison lever that `home.ts` documents as going away with the parameter, and the alternative — the shell reading a page's query param — is the coupling #1169 explicitly rejects | plan | accepted; stated in PR |
| R-4 | Reaching for `@angular/aria`'s Menu to get roving-tabindex/arrow-key correctness "for free", against a locked stack | Low | Medium | Ruled out on the docs' own scope: `@angular/aria` § Menu is "for actions, commands, and context menus (**not for form selection**)" and § Listbox is for "visible selection lists (**not dropdowns**)". A theme setting inside a popover is excluded by both; the package is not installed and CLAUDE.md locks the stack, so adding it needs its own ADR. Angular Aria's *styling* guidance is itself "target `[aria-expanded]`", which is the disclosure this slice builds | plan | resolved at plan time |
| R-5 | The nested disclosure destroys the focused element when the options collapse or the menu closes, stranding focus on `<body>` | Medium | Medium | `frontend/.claude/CLAUDE.md`: a transition that destroys the focused element moves focus via `shared/focus-after-render.ts`'s `focusMover()` on all three legs. The row is the return target when the options collapse; `closeMenus()` already returns focus to the menu trigger. `scripts/check-focus-posture.mjs` runs as a hook | phase 2 | open |
| R-6 | 11 e2e files and 3 unit specs reference `theme-toggle`; a missed one fails CI late, and `e2e/support/shell.ts` documents `theme-toggle` as an example overlay trigger | High | Low | Enumerate by mechanism before editing (generalization log): `grep -rn "theme-toggle\|theme-backdrop\|riv-theme-pop" src/ e2e/`. Migrate every site to `openThemePicker`, then re-run the grep to zero (excluding the helper itself) | phase 2 | open |
| R-7 | The wide header at 1920 is asserted with hard-coded pixel expectations that drift with unrelated padding changes | Low | Low | Assert the *relationship* the issue states (wrapper spans the viewport; brand's left edge within a small tolerance of the page's own left gutter) rather than transcribing 24/1416 as magic numbers; keep the measured values in a comment as provenance | phase 0 | resolved in phase 0 — `shell-header-wide.e2e.ts` asserts span-equals-viewport and a ≤40px gutter, with round 11's numbers in the file's TSDoc as provenance |

## Open questions / Assumptions

- **Assumption:** "12.5 px lowercase" in #1169 AC 3 means *not all-caps*, i.e. the CSS
  `uppercase` transform is dropped and the text renders in its own case (`Albanian Coast`) —
  not a literal `lowercase` transform. *Owner:* plan · *Resolves by:* resolved at plan time,
  see Resolved.
- **Assumption:** The `·` in `Colour theme · <value>` is the issue's shorthand for label-and-
  value, not glyph copy to render. *Owner:* plan · *Resolves by:* resolved at plan time, see
  Resolved.

### Resolved

- **The eyebrow's case.** #1169's table says "12.5 px lowercase"; the prototype it cites says
  "as 12.5 px `tracking-wide` **in its own case**" and its class list is
  `['text-[12.5px]', 'tracking-wide']` with `uppercase` toggled *off* — no `lowercase` class.
  Confirmed against the measured artifact: `Q-shore-1440-hdr-lower.png` renders
  **`Albanian Coast`**. So the source text is unchanged and `uppercase` is dropped. Resolved at
  plan time from the prototype branch + its shot.
- **The row's rendering.** `frontend-design` names "meta strings joined with middle dots
  ('A · B · C')" as a templated tell, in the same list that names the tracked-out all-caps
  eyebrow #1169 is removing. The prototype's row already avoids it: two spans, `Colour theme`
  left and the value right-aligned in `text-riv-pop-ink-soft`, no dot rendered — confirmed in
  `Q-shore-1440-menu.png`. The row renders label-plus-value, never a `·` string. Resolved at
  plan time.
- **The theme row's mechanism** (expand in place) and **the footer's cap** (follows the
  header). Put to the maintainer with the docs-recommended option after consulting
  `@angular/aria`, the Angular v22 a11y/binding guides, compiled Tailwind variants and
  `frontend-design`; both docs picks chosen. Resolved at plan time.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches the shell's header, footer and account
menus only: no booking, no beach map, no `set_availability` read or write, no date or cutoff
logic. Invariants #2, #3 and #4 are untouched.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java, no module boundary, no `api/` port, no event, no migration.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No money is rendered, charged or refunded by any surface this slice
touches.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app.ts` route-chrome walk | existing | shell component | `TouristRouteData.wide` → `RouteChrome.wide` on the single root→leaf walk; `wide()` computed off `routeChrome()`; `||=` (any route on the chain opts in), mirroring how `tabBar`/`footer` let the restrictive value win | none |
| FE-2 | `app.html` header inner wrapper + footer inner | existing | template | `[attr.data-wide]="wide() ? '' : null"` on each, beside `max-w-[1080px] data-wide:max-w-none` on the same element | none |
| FE-3 | `app.html` brand eyebrow | existing | template | static classes: `text-[12.5px] tracking-wide`, `uppercase` dropped, source text unchanged | none |
| FE-4 | `Colour theme` menu row + nested options, desktop popover | existing surface, new rows | template + `cls` recipes | new `themeRowOpen` signal; row `[attr.aria-expanded]`; options reuse today's `aria-pressed` buttons and `theme-option-<id>` testids | none |
| FE-5 | `Colour theme` menu row + nested options, phone sheet | existing surface, new rows | template + `cls` recipes | same signal, `MOBILE_ITEM` skin; the sheet is the only menu below `sm`, so this is where phone theming lives | none |
| FE-6 | `app.routes.ts` Discover route | existing | route data | `data: { section: 'beaches', footer: false, wide: true } satisfies TouristRouteData` | none |
| FE-7 | `e2e/support/shell.ts` | existing | e2e helper | new `openThemePicker(page)`: opens the viewport's menu, expands the row, proves `aria-expanded="true"` | none |

## FE↔BE contract

N/A — no contract change. No endpoint, DTO or wire shape is touched.

## Execution status

**Stage pointer:** `implement (phase 2)`

**Next action:** Move the theme swatch out of the header into a `Colour theme` disclosure row in
both account menus, then migrate the e2e population named in R-6.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — the `data.wide` route flag, header + footer full-bleed | ✅ | `d185cdbd` |
| 1 — the eyebrow at 12.5 px in its own case | ✅ | `<phase-1-sha>` |
| 2 — the swatch becomes a labelled menu row | ⏳ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| | | | |

---

## File structure

- `docs/plans/shell-header-wide-route.md` — this plan
- `frontend/src/app/app.ts` — `TouristRouteData.wide`, `RouteChrome.wide`, the walk, `wide()`, the theme-row disclosure state, `cls` recipes; retires `cls.themePop`
- `frontend/src/app/app.html` — wrapper + footer `data-wide`, the eyebrow, the swatch's removal, the `Colour theme` row and nested options in both menus
- `frontend/src/app/app.routes.ts` — Discover carries `wide: true`
- `frontend/src/app/app.spec.ts` — AC-1, AC-4, AC-5, AC-7
- `frontend/src/app/app.a11y.spec.ts` — AC-6 axe leg
- `frontend/src/app/app.contrast.spec.ts` — AC-6 contrast leg; retires the swatch-ring case, adds the rule-2a row case
- `frontend/e2e/shell-header-wide.e2e.ts` — AC-2, AC-3 (new)
- `frontend/e2e/support/shell.ts` — `openThemePicker`
- `frontend/e2e/tourist-header.e2e.ts` — header carries no theme control; the menu row does
- `frontend/e2e/theme-shell.e2e.ts` — rewritten to the nested disclosure; AC-5/AC-6 e2e legs
- `frontend/e2e/tourist-tab-bar.e2e.ts` — backdrop assertion moves to the account/sheet backdrop
- `frontend/e2e/mobile-zoom-tourist.e2e.ts` — phone theme control is the sheet row
- `frontend/e2e/find-a-booking.e2e.ts` — `openThemePicker` migration
- `frontend/e2e/discover-photos.e2e.ts` — `openThemePicker` migration
- `frontend/e2e/discovery-flow.e2e.ts` — `openThemePicker` migration
- `frontend/e2e/legal-pages.e2e.ts` — `openThemePicker` migration
- `frontend/e2e/my-bookings.e2e.ts` — `openThemePicker` migration

> Reconcile before every push: `node scripts/check-plan-file-structure.mjs --diff origin/main`

---

## Phase 0 — The `data.wide` route flag, header and footer full-bleed

**Files:** Modify `frontend/src/app/app.ts` · `frontend/src/app/app.html` ·
`frontend/src/app/app.routes.ts` · Test `frontend/src/app/app.spec.ts` ·
Create `frontend/e2e/shell-header-wide.e2e.ts`

- [ ] **Step 1: Write the failing test** — AC-1 and AC-7 in `app.spec.ts`: render the shell on
      a route with `wide: true` and on one without; assert the header wrapper's and footer
      inner's `data-wide` attribute presence and their computed `max-width`.
- [ ] **Step 2: Run it, verify it fails** — `npx vitest run src/app/app.spec.ts` → FAIL
      (`data-wide` absent on the wide route).
- [ ] **Step 3: Minimal implementation** — `wide?: true` on `TouristRouteData`, `wide` on
      `RouteChrome` + `PRE_NAVIGATION_CHROME` (`false`), `wide ||= route.data['wide'] === true`
      in the walk, `wide()` computed, the two `[attr.data-wide]` bindings with
      `data-wide:max-w-none` beside each cap, `wide: true` on Discover.
- [ ] **Step 4: Run it, verify it passes** — `npx vitest run src/app/app.spec.ts` → PASS.
- [ ] **Step 5: Write the e2e** (AC-2) and run it —
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/shell-header-wide.e2e.ts`.
- [ ] **Step 6: Generalization-audit pass** — population: every element in the shell carrying
      the 1080 cap. Enumerate `grep -rn "max-w-\[1080px\]" frontend/src`; judge each (header
      wrapper → wide; footer inner → wide, per the maintainer's call; `home.html`'s `.discover`
      column → page content, not shell chrome, deliberately untouched, see R-3).
- [ ] **Step 7: Commit** — `git commit -m "Give the shell header a wide-route flag (#1169)"`
- [ ] **Step 8: Update Execution status** in the same commit window.

---

## Phase 1 — The eyebrow at 12.5 px in its own case

**Files:** Modify `frontend/src/app/app.html` · Test `frontend/e2e/shell-header-wide.e2e.ts`

- [ ] **Step 1: Write the failing test** — AC-3: the eyebrow's computed `font-size` is
      `12.5px` and `text-transform` is `none`, on a capped route and a wide one.
- [ ] **Step 2: Run it, verify it fails** → FAIL (`10px` / `uppercase`).
- [ ] **Step 3: Minimal implementation** — `text-[10px] tracking-[0.24em] uppercase` →
      `text-[12.5px] tracking-wide` on the eyebrow span; source text unchanged.
- [ ] **Step 4: Run it, verify it passes** → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: tracked-out all-caps eyebrows in the
      tourist chrome. Enumerate `grep -rn "uppercase" frontend/src/app --include=*.html`;
      judge each (in scope: the shell brand's eyebrow only — the hero chip and other page-level
      labels are #1169's out-of-scope, noted not changed).
- [ ] **Step 6: Commit** — `git commit -m "Quiet the brand eyebrow to 12.5px in its own case (#1169)"`
- [ ] **Step 7: Update Execution status.**

---

## Phase 2 — The swatch becomes a labelled menu row

**Files:** Modify `frontend/src/app/app.ts` · `frontend/src/app/app.html` ·
`frontend/src/app/app.spec.ts` · `frontend/src/app/app.a11y.spec.ts` ·
`frontend/src/app/app.contrast.spec.ts` · `frontend/e2e/support/shell.ts` · the seven e2e
files listed in File structure

- [ ] **Step 1: Write the failing tests** — AC-4 (no theme control in the header; a named row
      with `aria-expanded` and the 44 px floor in each menu), AC-5 (expand → select →
      `ThemeService` + `data-riv-theme` + persistence + menu closes, all three themes, both
      menus).
- [ ] **Step 2: Run them, verify they fail** — `npx vitest run src/app/app.spec.ts` → FAIL.
- [ ] **Step 3: Minimal implementation** — remove the swatch button and the `themePop`
      block; add the `Colour theme` row (label + right-aligned value + `aria-hidden` circle)
      and the nested `theme-option-<id>` buttons to the desktop popover and the sheet; a
      `themeRowOpen` signal reset by `closeMenus()`/`toggleMenu()`/`toggleAccountMenu()`;
      `focusMover()` on the collapse leg (R-5); retire `cls.themePop` and `theme-backdrop`.
- [ ] **Step 4: Run them, verify they pass** → PASS; then `npm run test:a11y`.
- [ ] **Step 5: Migrate the e2e population** — add `openThemePicker`, migrate every call site,
      rewrite `theme-shell.e2e.ts` to the nesting, invert `tourist-header.e2e.ts`'s
      header-swatch assertions, move `tourist-tab-bar.e2e.ts`'s backdrop assertion, and
      replace `app.contrast.spec.ts`'s swatch-ring case with the rule-2a row case. Then
      `npm run test:e2e:a11y`.
- [ ] **Step 6: Generalization-audit pass** — population: every reference to the retired theme
      surface. Enumerate `grep -rn "theme-toggle\|theme-backdrop\|riv-theme-pop\|themePop" frontend/src frontend/e2e`;
      target zero outside the new helper.
- [ ] **Step 7: Commit** — `git commit -m "Move the theme swatch into the account menu as a named row (#1169)"`
- [ ] **Step 8: Update Execution status.**

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | plan-time blast-radius map for the retiring swatch | every reference to the header theme control's testids and popover class | `grep -rn "theme-toggle\|theme-backdrop\|riv-theme-pop" frontend/src frontend/e2e` | 11 e2e files + `app.spec.ts`, `app.a11y.spec.ts`, `app.html`, `app.ts` | recorded as R-6; migration is phase 2 step 5 |
| 2026-09-21 | phase 1: the eyebrow's all-caps treatment | every all-caps label in the app's templates | `grep -rn "uppercase" frontend/src/app --include=*.html` | 20 beyond the eyebrow (operator console labels, `home.html`'s hero chip + section labels) | none changed: #1169 scopes the shell brand only, and the rest is page/console content, not shared chrome. `home.html:603`'s `tracking-[0.16em] uppercase` hero chip is the same tell on Discover's own page and is a fair follow-up, deliberately not widened into here |
| 2026-09-21 | phase 0: a second element needed the same cap lifted | every element in the tree carrying the shell's 1080px cap | `grep -rn "max-w-\[1080px\]" frontend/src` | 3 (header wrapper, footer inner, `home.html`'s `.discover` column) | header wrapper + footer inner take `data-wide:max-w-none`; the Discover column is page content, not shell chrome, and stays capped — it is what `?map=off` renders under the wide header (R-3) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `npx vitest run src/app/app.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/shell-header-wide.e2e.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Same command as AC-2 → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npx vitest run src/app/app.spec.ts` and `npx playwright test --config playwright.a11y.config.ts e2e/tourist-header.e2e.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npx vitest run src/app/app.spec.ts` and `… e2e/theme-shell.e2e.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `npm run test:a11y` and `… e2e/theme-shell.e2e.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `npx vitest run src/app/app.spec.ts` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** Run `npm run test:e2e:a11y` → PASS. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A (frontend-only; no availability path).
- [ ] Pool + cutoff not in scope (#3, #4). No money rendered (#5). No time reasoning (#6). No booking codes (#7).
- [ ] Modulith section justified N/A (frontend-only); no cross-module concern (#11).
- [ ] Payment section justified N/A (#8, #9, #10 not in scope).
- [ ] No Flyway migration in scope (#12).
- [ ] Frontend standards met: `riviera-frontend` placement, `riviera-tailwind` rules 3/4/6, `frontend/.claude/CLAUDE.md` focus + touch-target posture; no `as any`.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
