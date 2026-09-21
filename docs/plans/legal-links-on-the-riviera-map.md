# Legal links on the riviera map Implementation Plan

> Implement with `tdd` at the named seams. Checkbox steps track progress. The Availability,
> Modulith and Payment sections are spec, not documentation. Invariant numbers: `CLAUDE.md`.

**Goal:** Privacy and Terms are reachable and hit-testable from the default Discover route on
both surfaces, from the shell chrome that is always present, and `desk-frame` stops consuming
pointer events where it paints nothing.

**Architecture:** The links go into the **shell menu chrome** — two rows at the foot of the phone
menu sheet and of both auth branches of the desktop account popover — not into the sheet, the
panel or the coast picker. The stacking order decides it: the menu sheet is `z-40` over a `z-30`
backdrop and the desktop popovers sit inside the header's `z-20` stacking context, while the
Discover page's own fixed layers top out at `z-[11]` (`discover-sheet.ts:133`, the Map pill). A
chrome placement therefore clears the map *by construction* and cannot regress into the 60-second
click timeout, and being route-independent it also closes the `?map=off` remainder without
touching the static route flag.

**Persistence:** JDBC only (invariant #1). N/A — no table, no migration; frontend-only slice.

**Source of intent:** [#1173](https://github.com/ivopogace/riviera-sunbed-booking/issues/1173),
opened from #1167 (PR #1172) which took the `footer: false` half of the fix and deferred
placement plus finding F-8 here. Parent epic context: #1156. Next slice: #1168.

**Skills consulted:** `riviera-sdlc` (intake gate: no in-flight PR touches the tourist shell or
`pages/home` — #1155 is the never-merged prototype draft; no Flyway number to claim; #1167's
close-out is complete, so `docs/plans/q-shore-discover-default.md` is this close-out's retirement)
· `riviera-plan-doc` (forced the behaviour-parity ledger for the moved scroll-away spec and the
seam name on every AC) · `tdd` (spec-first per phase; the component's spec before its template,
the e2e before the `pointer-events` change) · `riviera-review-overlay` (review gate at
ready-for-review) · `riviera-docs-freshness` (owed at close-out over this slice's range;
`docs/design/` in scope because a hairline was considered and rejected) · `grilling`
(issue-intake gate — caught that `pointer-events-none` would not have saved the footer, and that
`legal-pages.e2e.ts:143-151` and `app.spec.ts:607-621` both stay green because this placement is
additive) · `frontend-design` (placement as an information-class question: a legal link is *about
the site*, so it belongs with the always-present chrome, not interleaved with venue rows; rows not
the footer's sentence; the routes' own sentence-case labels; no hairline) · `codebase-design`
(F-8 read as an interface that lies about itself; `LegalMenuRows` passes the deletion test;
declined a shared `legal-documents.ts`; `elementFromPoint` is an overdue seam at five call sites)
· `riviera-frontend` (`shared/` is the folder for a pure presentational primitive; the three
themes are `porcelain`/`riviera`/`dark`) · `riviera-tailwind` (rule 1 — an `<a>`-rendering shared
element takes an element selector with a `class: 'contents'` host; rule 4 — the 44 px floor via
`appTouchTarget`, which a row makes free where the footer's inline links needed the WCAG 2.5.5
exemption) · `riviera-local-debug` (clone deepened; `npm ci` done; `ng test --include`, and
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`) · `playwright-cli`
(mocked-suite authoring: `page.route` per spec, the `waitForEvent('popup')` new-tab pattern)

**Branch:** `claude/sdlc-1173-iu97sk` — the cloud session's designated branch, standing in for
`bugfix/legal-links-on-the-riviera-map`. Exists at `origin/main` before phase 0.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the Discover default route at 390 × 844 with the API mocked, when a tourist
      taps the Menu tab and then the **Privacy policy** row, then `/legal/privacy` opens in a new
      tab showing the `Privacy Policy` heading and the Discover route has not navigated.
      *Seam:* the `/` route in the mocked Playwright suite · *Pinned by:*
      `legal-pages.e2e.ts` › `the phone menu sheet carries the legal rows on the riviera map`
- [ ] **AC-2:** Given the Discover default route at 1280 × 720 signed out, when a tourist opens the
      header menu and clicks **Terms of service**, then `/legal/terms` opens in a new tab showing
      the `Terms of Service` heading and Discover has not navigated.
      *Seam:* the `/` route in the mocked Playwright suite · *Pinned by:*
      `legal-pages.e2e.ts` › `the desktop header menu carries the legal rows on the riviera map`
- [ ] **AC-3:** Given each legal row rendered on the Discover route, when `elementFromPoint` is
      read at the row's centre, then it resolves to that row — the check that caught this, where
      `toBeVisible()` reported the dead footer link as "visible, enabled and stable". Asserted at
      both 390 × 844 and 1280 × 720. *Seam:* `e2e/support/hit-test.ts`'s `hitTestId(page, testId)`
      · *Pinned by:* `legal-pages.e2e.ts` › the two tests above
- [ ] **AC-4:** Given the tourist shell, when the phone menu sheet is open and when each auth
      branch of the desktop popover is open, then all three carry both documents as rows whose
      `href` is `/legal/privacy` and `/legal/terms`, each with `target="_blank"` and
      `rel="noopener"`. *Seam:* `app-root`'s rendered shell · *Pinned by:*
      `app.spec.ts` › `carries the legal rows in the phone sheet and in both desktop popover branches`
- [ ] **AC-5:** Given the shell with the legal rows present, when axe audits the open menu sheet
      and the open account popover in each of `porcelain`, `riviera` and `dark`, then there are no
      critical or serious violations. *Seam:* `app-root`'s rendered shell ·
      *Pinned by:* `app.a11y.spec.ts` › the theme-looped open-state cases
- [ ] **AC-6:** Given the legal rows wear `POP_ITEM`/`MOBILE_ITEM`, when the popover ink/surface
      pair is measured in all three themes, then it clears AA over every gradient stop — and the
      rows introduce **no new ink, surface or edge pair**, so the existing measurements are the
      coverage. *Seam:* the token mirror in `src/testing/glass-tokens.ts` · *Pinned by:*
      `app.contrast.spec.ts:156-175` (extended to name the legal rows in the usage comment)
- [ ] **AC-7:** Given the desktop Discover panel at 1280 × 900, when `elementFromPoint` is read
      inside `desk-frame`'s 12 px gutter, then it does **not** resolve to `desk-frame` — the frame
      takes no pointer events where it paints nothing — while the panel's rows and the map pane
      stay clickable. *Seam:* the `/` route in the mocked Playwright suite · *Pinned by:*
      `discover-map.e2e.ts` › `the desk frame takes no pointer events where it paints nothing`
- [ ] **AC-8:** Given the route table, when a route carries `footer: false`, then it does not also
      carry `tabBar: false` — on a footerless route the phone's only legal surface is the tab bar's
      menu sheet. *Seam:* the exported `routes` array · *Pinned by:*
      `app.routes.spec.ts` › `never withholds the footer and the tab bar on the same route`
- [ ] **AC-9:** Given the shell below `sm`, when the document is scrolled on a route that survives
      #1168, then the top bar has scrolled away and the tab bar is still pinned 61 px tall at the
      bottom edge — the guarantee no longer rests on `?map=off`. *Seam:* the `/venues/1` route in
      the mocked Playwright suite · *Pinned by:* `tourist-tab-bar.e2e.ts` › `the top bar is
      relative and scrolls away; the bar is the only sticky chrome below sm`

## Non-goals

- Restoring the shared footer on `/` or on `?map=off`. Route data is static and the map paints to
  every edge; the chrome placement makes the documents reachable on both, which is what #1173
  asks for. `legal-pages.e2e.ts:143-151` keeps asserting `.riv-footer` count 0 on `/`.
- Reserving a band at the window's foot so a real footer can render under the desktop map. That
  reopens #1159's measured geometry (panes 568 / 864 / 1,344), which #1156 lists as decided.
- Deleting the pre-Q page, the `?map=off` flag or `venue-preview-card` — that is #1168.
- Moving the *other* `?map=off`-dependent specs (`touch-targets-tourist.e2e.ts:52,65,86,114`,
  `home.a11y.spec.ts:73`). #1168's own ACs move that population onto the sheet and the panel;
  #1173 owns only the one **shell** guarantee that was mis-parked there.
- A shared `legal-documents.ts`. See Open questions § Resolved.
- The `data.wide` header flag and the theme swatch as a labelled menu row (#1156 § Out of scope).

## Behavior-parity ledger

> Scoped to the one surface this slice moves: `tourist-tab-bar.e2e.ts`'s scroll-away spec.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Header is `position: relative` below `sm` | preserved | Asserted on `/venues/1`; `max-sm:relative` is a shell rule, not a pre-Q one |
| Header scrolls off the top (`headerBottom <= 0`) after `window.scrollTo(0, 600)` | preserved | `/venues/1` is already scrolled to `document.documentElement.scrollHeight` by the sibling test at `tourist-tab-bar.e2e.ts:140-158`, so the route is proven to exceed 844 px at this viewport |
| Tab bar pinned to the bottom edge, `barBottom === 844`, `barTop === 844 - 61` | preserved | Unchanged assertions; the bar is `fixed inset-x-0 bottom-0` on every tourist route |
| Shell padding-bottom `61px` | preserved | `SHELL_WITH_TAB_BAR` applies on any `tabBar` route |
| The document that scrolls is the pre-Q Discover page | changed | Now the venue detail page. The guarantee was never about Discover; `?map=off` was chosen only because it was the nearest scrolling document |
| `VENUES` padded to 8 copies so `/` scrolls at 390 × 844 (`tourist-tab-bar.e2e.ts:46-51`) | preserved | **Verdict corrected on inspection:** the fixture is the `/api/venues` payload the file's local `mockTourist` serves to *every* test, not just the scroll-away one, so it stays. Only its comment was dropped — the count is no longer load-bearing for anything |
| The subject read off a single `header` element | changed | `/venues/1` renders a venue card that carries its own `<header>`, so the bare selector is a strict-mode violation there. Both the locator and the in-page `querySelector` now pin `.riv-header`, which is the shell's and route-independent |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The desktop popover is auth-branched into two template copies that cannot share a template ref (`app.html:247`), so rows land in one branch only and a signed-in tourist on desktop keeps no legal route | Medium | High | One component symbol, mounted in both branches; AC-4 asserts all three call sites, and the spec drives `customerAuth.signedIn()` both ways | me | **closed in phase 1** — AC-4's `it.each([false, true])` proved red on both branches before the mount |
| R-2 | `pointer-events-none` on `desk-frame` breaks pointer interaction on the panel or the map if a child misses `pointer-events-auto` | Medium | High | Both children (`desk-panel`, `desk-pane`) take `pointer-events-auto`; the ~20 existing `WIDE` interaction cases in `discover-map.e2e.ts` (row press, near-me, pin press, picker) must stay green, and AC-7 adds the gutter proof | me | **closed in phase 3** — all 44 `discover-map.e2e.ts` cases green, and AC-7 was proven red (the gutter returned `desk-frame`) before the fix |
| R-3 | Two more rows grow the phone sheet; at 344 × 882 (the `fold` project) the signed-in sheet is identity + 5 rows and could overflow the viewport top | Low | Medium | Measured: ≈ 320 px of sheet above a 76 px bottom offset leaves ≈ 486 px of air at 844, ≈ 524 px at 882. `support/shell.ts`'s `expectPhoneRailFits` is the existing helper — use it rather than a fresh assertion | me | open |
| R-4 | `toggleMenu` hard-codes the sheet's first focus target (`app.ts:435-438`: `nav-account-link-mobile` / `nav-signin-mobile`, fallback `find-open-mobile`), so rows inserted above it would silently take focus on open | Low | Medium | Rows go at the **foot**, below Find a booking and Sign out; `app.spec.ts`'s existing focus-on-open assertion stays green unmodified and is the fence | me | **closed in phase 1** — the sheet's order spec now pins the legal rows last, and the focus-on-open assertion passed unmodified |
| R-5 | A row that opens a new tab while closing the menu would destroy the focused element, which `frontend/.claude/CLAUDE.md` requires be handled by `focusMover()` on all three legs | Medium | Medium | The rows do **not** call `closeMenus()`. A `target="_blank"` link does not navigate the originating document, so there is no NavigationSkipped problem to solve (that is why the other rows close), and the menu is where the tourist left it on return. No focus machinery is owed | me | open |
| R-6 | A group hairline (`border-t border-riv-pop-border`) would be a new non-text surface; `--riv-pop-border` is measured nowhere and named in neither `docs/design/` doc, so under the non-text-contrast rule 2a it would owe a measured ratio plus a ledger row | Medium | Low | Separate the group with **space** (`mt-1`), not a line: the same grouping information, no new non-text pair, no `docs/design/` change. Recorded as a decision, not an omission | me | **closed in phase 1** — `mt-1` shipped; the reason is in `legal-menu-rows.ts`'s TSDoc so a future session does not add the line back |
| R-7 | The e2e clicks a `target="_blank"` row, so the assertion must use the popup pattern; a naive `click()` + `toHaveURL` would pass vacuously against the unchanged Discover URL | Low | Medium | Reuse `legal-pages.e2e.ts:129-141`'s established shape — `page.waitForEvent('popup')` before the click, then assert the popup's URL *and* that the opener is still on `/` | me | **closed in phase 2** — both tests use the popup pattern and assert the opener stayed on `/` |
| R-8 | Extracting `hitTestId` and rewriting the two same-shape call sites could quietly weaken an existing assertion (`tourist-tab-bar.e2e.ts:190` expects `'theme-backdrop'`, `theme-shell.e2e.ts:208` expects `'menu-backdrop'`) | Low | Medium | Migrate only the two sites whose shape is identical (testid at a rect centre); leave `booking-flow.e2e.ts:170` (containment question) and the two `waitForFunction` predicates alone, with the enumeration logged. Both migrated expectations keep their exact values | me | **closed in phase 2, with a correction** — only **one** site had the shape, not two: `theme-shell.e2e.ts:208` probes an arbitrary viewport point (`innerWidth / 2`, `innerHeight * 0.7`), not an element's box, so it stays inlined. `tourist-tab-bar.e2e.ts` migrated and still expects `'theme-backdrop'` |

No Flyway migration, no DTO, no error contract, no venue-scoped endpoint: invariant #13 / RV-BE-9
are not in scope. No JPA or Stripe Connect temptation — no backend code at all.

## Open questions / Assumptions

- **Assumption:** `discover-map.e2e.ts`'s `WIDE` (1280 × 900) cases already drive the desktop panel,
  so AC-7 needs no new fixture — only a new test in that file. — *Owner:* me · *Resolves by:*
  phase 3, by reading the file's existing `WIDE` block before writing the test.
- **Assumption:** removing the 8-copy `VENUES` padding from `tourist-tab-bar.e2e.ts` breaks no
  other test in that file. — *Owner:* me · *Resolves by:* phase 4, by running the whole file.

### Resolved

- **Open question (put to the user, round 1):** where do Privacy and Terms live on the riviera map
  — the chrome menus, a line in the sheet at `full` and the end of `desk-rows`, the coast picker's
  foot, or a hybrid? **Outcome:** the user asked for `frontend-design`'s read and accepted it: the
  **chrome menus, both surfaces, two rows at the foot**. A legal link's information class is
  *about the site*, so ending the beach-grouped venue list with it asserts a false structure; the
  sheet's list is the app's most expensive real estate and is gesture-gated on the phone (it only
  scrolls at the `full` detent); the coast picker is a `role="dialog"` labelled "Choose a place on
  the coast" and would be doing a second job; the hybrid gives one piece of content two treatments.
- **Open question (put to the user, round 1):** how far should this slice go on F-8's `desk-frame`
  stacking? **Outcome:** the user asked for `codebase-design`'s read and accepted it:
  `pointer-events-none` on the frame plus `pointer-events-auto` on its two children, because the
  frame's interface carries an unstated fact (*it consumes pointer events across the whole window*)
  and removing the fact beats commenting it. Stated plainly in the plan and the PR: this buys back
  the 12 px gutter and gap only — **it would not have saved the footer**, because `desk-panel` and
  `desk-pane` genuinely paint across the window, so document flow on this route is unreachable by
  construction, not by a missing class. The recurrence-proof half is the `hitTestId` seam.
- **Open question (put to the user, round 1):** which permanent route hosts the scroll-away
  guarantee? **Outcome:** `/venues/1` — the sibling test at `tourist-tab-bar.e2e.ts:140-158`
  already scrolls it to document height at this exact viewport with the fixtures the file already
  has, so the route is proven tall and no new mock is owed.
- **Open question (raised by the grill, decided by me):** extract a shared `legal-documents.ts`,
  since `/legal/privacy` and `/legal/terms` are hard-coded at `legal-footer.ts:15-16` and
  `legal-consent.ts:25,34` and a menu row makes a third shape? **Outcome: declined.**
  `app.routes.spec.ts:48-53` pins the route paths by literal and `legal-footer.spec.ts` /
  `legal-consent.spec.ts` pin the hrefs by literal, so a rename already fails loudly on both sides
  — which is the property that matters. A module whose entire implementation is two string
  constants is maximally shallow, and sharing the labels too would force one voice onto three
  surfaces where it legitimately differs (terse inline, formal sentence, menu row). Recorded here
  so the next session sees a decision rather than an oversight.

## Availability & concurrency (invariant #2)

N/A — frontend-only. No write path to `set_availability`, no reservation transaction, no booking
lifecycle. The slice adds two links to chrome and one CSS property to a layout frame.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No Java changes, so the structural net does not need to run.

### Module ownership (§4a)

N/A — no backend behaviour is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. Worth one note on why the rows open a new tab rather than routing: the
desktop popover renders on `booking/pay` (that route's `tabBar: false` removes only the phone bar),
so an in-app row would unmount a mounted Payment Element mid-checkout. That is `legal-consent.ts`'s
stated reason and it is live at this call site.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/legal-menu-rows.ts` | new | presentational component, element selector `app-legal-menu-rows`, `class: 'contents'` host, required `variant` input over an internal skin table (the `booking/manage-booking-link.ts:24-36` idiom) | none — `computed()` over the `variant` input only | none |
| FE-2 | `app.html` chrome: phone menu sheet foot (after `:470`), signed-in popover foot (after `:322`), signed-out popover foot (after `:383`) | existing | template | existing `menuOpen()` / `accountOpen()` / `customerAuth.signedIn()` signals; no new state | none |
| FE-3 | `pages/home/home.html:411-415` `desk-frame` + `:416` `desk-panel` + `:520` `desk-pane` | existing | template classes only | none | none |

## FE↔BE contract

N/A — no contract change. `/legal/privacy` and `/legal/terms` are existing Angular routes
(`app.routes.ts:280-290`), served same-origin by the SPA.

## Execution status

**Stage pointer:** `CI gate — all five phases pushed, PR #1174 ready for review`

**Next action:** Check the CI run on this push, then run the review gate (ladder rung 1 + the
overlay) and clear the Sonar new-issue list. `origin/main` has not moved since the branch point
(`a133f878`), so there is nothing to integrate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `LegalMenuRows`, the shape module | ✅ | `99c78d5d` |
| 1 — Mounted at the three chrome call sites | ✅ | `069e75df` |
| 2 — The `hitTestId` seam and the reachability e2e | ✅ | `ca3c62fc` |
| 3 — `desk-frame`'s pointer-events interface | ✅ | `a6378692` |
| 4 — The two handovers: scroll-away route, route-table fence | ✅ | `6ae45d88` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review, Sonar or CI finding; each fix re-enters at Implement.

| # | Source | Finding | Status |
|---|---|---|---|
| F-11 | CI `Repo hygiene (diff-scoped)` on `069e75df` and `4d8229b5` | Two multi-line inline comments in `app.spec.ts` (RV-STYLE-1). I had run `check-inline-comments.mjs --files` over a hand-picked list; CI runs `--diff origin/main` over everything the branch touched, which is the only run that counts | fixed in `32fe8b9c`; all five guards now run locally as `--diff origin/main` |
| F-10 | CI `Frontend (lint + test + build)` on `069e75df` | **`theme-shell.e2e.ts:212` broken by this slice**, deterministically (failed on the retry too): the test hit-tested `(innerWidth / 2, innerHeight * 0.7)` expecting `menu-backdrop`, and the two new rows made the sheet tall enough to reach that point, so the hit landed on `nav-register-mobile`. The guarantee is the backdrop's *extent*, and the sheet legitimately covers more of the screen now | fixed: the probe point is derived at runtime from the header's bottom and the bottom-anchored sheet's top, so it is past the strip the original regression shrank the backdrop to and clear of the sheet at any row count. Still fails on the regression it guards, so it is not vacuous |
| F-9 | Local full-suite run, phase 4 | `discover-sheet.a11y.spec.ts` › "has no serious violations at full, with the Map pill" failed once in ~6 full runs (`expected null not to be null`). **Not this slice's**: reproduces on `origin/main` with `npx ng test --include="src/app/app.a11y.spec.ts" --include="src/app/pages/home/discover-sheet.a11y.spec.ts"` (1 in ~6). Hypothesis, not a diagnosis — the spec waits a single `setTimeout(0)` tick for a detent change driven by a scroll event, which is racy by construction; 12 targeted probe runs did not catch it in the act, and the probe found no leftover `header.riv-header`, `.riv-tab-bar` or `app-root`, so it is **not** a shared-jsdom DOM leak | deferred → follow-up issue. Not blind-fixed: the file is outside this slice and a speculative wait change could mask a real defect in the sheet's detent logic. This slice's own contribution — `app.a11y.spec.ts` leaving `data-riv-theme` on `documentElement` — is fixed with an `afterEach`, per the `isolate: false` convention |
| F-8 | #1172 review gate, deferred here | `desk-frame`'s stacking is worked around, not fixed; the next footer-like row on this route meets the same fixed, opaque-to-pointers overlay | **fixed in phase 3** (`pointer-events-none` + both children `pointer-events-auto`, red-first) and in phase 2 (the `hitTestId` seam), with the scope correction recorded under Open questions § Resolved |

---

## File structure

- `docs/plans/legal-links-on-the-riviera-map.md` — this plan (guard-exempt)
- `frontend/src/app/shared/legal-menu-rows.ts` — the two document rows as a menu shape; owns the hrefs, the labels and the skin table
- `frontend/src/app/shared/legal-menu-rows.spec.ts` — its own spec: hrefs in order, `target`/`rel`, the 44 px declaration, both variants' skins
- `frontend/src/app/shared/popover-skin.ts` — `MOBILE_ITEM` promoted out of `app.ts` to sit beside `POP_ITEM`, so both menus paint from one place
- `frontend/src/app/app.ts` — imports `LegalMenuRows` into the shell's `imports`
- `frontend/src/app/app.html` — mounts it at the three chrome call sites
- `frontend/src/app/app.spec.ts` — AC-4: all three call sites, both auth branches
- `frontend/src/app/app.a11y.spec.ts` — AC-5: the open-state cases looped over the three themes
- `frontend/src/app/app.contrast.spec.ts` — AC-6: the usage comment at `:158` names the legal rows (no new pair to measure)
- `frontend/src/app/app.routes.spec.ts` — AC-8: the `footer: false` + `tabBar: false` fence
- `frontend/src/app/pages/home/home.html` — `pointer-events-none` on `desk-frame`, `pointer-events-auto` on `desk-panel` and `desk-pane`
- `frontend/e2e/support/hit-test.ts` — `hitTestId(page, testId)`: the `elementFromPoint`-at-centre check, as one interface
- `frontend/e2e/legal-pages.e2e.ts` — AC-1, AC-2, AC-3
- `frontend/e2e/discover-map.e2e.ts` — AC-7
- `frontend/e2e/tourist-tab-bar.e2e.ts` — AC-9, and the first `hitTestId` call site
- `frontend/e2e/theme-shell.e2e.ts` — the second `hitTestId` call site
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the menu sheet's own 44 px sweep, which no resting-surface sweep reaches today

---

## Phase 0 — `LegalMenuRows`, the shape module

**Files:** Create `frontend/src/app/shared/legal-menu-rows.ts` · Test
`frontend/src/app/shared/legal-menu-rows.spec.ts`

Depth check (the deletion test): delete this component and two rows plus a skin choice reappear at
three `app.html` call sites, two of them inside `@if` branches that cannot share a template ref. It
earns its keep. Its interface is one element selector and one `variant` input.

- [ ] **Step 1: Write the failing test** — the host-component pattern `legal-footer.spec.ts:6-10`
      uses, driven over both variants.

```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LegalMenuRows } from './legal-menu-rows';

@Component({
  imports: [LegalMenuRows],
  template: `<app-legal-menu-rows [variant]="'sheet'" />`,
})
class SheetHost {}

describe('LegalMenuRows', () => {
  function rows(host: typeof SheetHost): HTMLAnchorElement[] {
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('a')];
  }

  it('renders the two documents in order, each opening in a new tab', () => {
    const [privacy, terms] = rows(SheetHost);
    expect(privacy.getAttribute('href')).toBe('/legal/privacy');
    expect(privacy.textContent?.trim()).toBe('Privacy policy');
    expect(terms.getAttribute('href')).toBe('/legal/terms');
    expect(terms.textContent?.trim()).toBe('Terms of service');
    for (const row of [privacy, terms]) {
      expect(row.getAttribute('target')).toBe('_blank');
      expect(row.getAttribute('rel')).toBe('noopener');
      expect(row.hasAttribute('appTouchTarget')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx ng test --watch=false
      --include="src/app/shared/legal-menu-rows.spec.ts"` → FAIL, cannot resolve `./legal-menu-rows`
- [ ] **Step 3: Minimal implementation** — the `ManageBookingLink` idiom: `class: 'contents'` host
      so the `<a>`s are what the menu lays out, a required `variant` input, and the skin table
      inside the component rather than at the call site.

```ts
import { Component, computed, input } from '@angular/core';

import { MOBILE_MENU_ITEM, POP_ITEM } from './popover-skin';
import { TouchTarget } from './touch-target';

/** The menu the rows are wearing: the phone sheet's 15.5px rows, or the desktop popover's 14px. */
export type LegalMenuVariant = 'sheet' | 'popover';

const SKINS: Record<LegalMenuVariant, string> = {
  sheet: MOBILE_MENU_ITEM,
  popover: POP_ITEM,
};

/**
 * Privacy and Terms as menu rows, for the chrome that is always present. The riviera map paints to
 * every edge, so Discover withholds the shared footer and nothing in document flow on that route is
 * reachable; the menu is `z-40` (sheet) or inside the header's `z-20` context (popover), above the
 * page's own fixed layers, which is what makes these rows clickable where the footer was not.
 *
 * <p>New tab rather than in-app nav, as `legal-footer.ts` and `legal-consent.ts`: the desktop
 * popover renders on `booking/pay`, where routing away would unmount a mounted Payment Element.
 * The rows deliberately do NOT close their menu — a `target="_blank"` link does not navigate the
 * opener, so there is no focus to move and the menu is where the tourist left it on return.
 *
 * <p>Rows, not `legal-footer.ts`'s sentence: a menu has room for the documents' real names, the
 * copyright notice is footer furniture, and a row carries the 44px floor for free where the
 * footer's inline links needed the WCAG 2.5.5 exemption.
 */
@Component({
  selector: 'app-legal-menu-rows',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `<a
      appTouchTarget
      [class]="skin()"
      href="/legal/privacy"
      target="_blank"
      rel="noopener"
      data-testid="legal-privacy-row"
      >Privacy policy</a
    >
    <a
      appTouchTarget
      [class]="skin()"
      href="/legal/terms"
      target="_blank"
      rel="noopener"
      data-testid="legal-terms-row"
      >Terms of service</a
    >`,
})
export class LegalMenuRows {
  readonly variant = input.required<LegalMenuVariant>();

  protected readonly skin = computed(() => SKINS[this.variant()]);
}
```

> `MOBILE_MENU_ITEM` does not exist yet: `MOBILE_ITEM` is file-local to `app.ts:39`. Promote it to
> `shared/popover-skin.ts` beside `POP_ITEM` (same file, same family, `riviera-tailwind` rule 1's
> "one place so the popovers cannot drift") and have `app.ts` import it. If promotion turns out to
> pull anything else along, fall back to a `sheet`/`popover` pair of local constants and say so.

- [ ] **Step 4: Run it, verify it passes** — same command → PASS; then
      `npx ng test --watch=false --include="src/app/shared/*.spec.ts"`
- [ ] **Step 5: Generalization-audit pass** — mechanism: *a hard-coded legal document path in a
      template*. Enumerate `grep -rn "/legal/privacy\|/legal/terms" frontend/src --include=*.ts
      --include=*.html | grep -v spec`. Expect four sites (footer ×2 lines, consent ×2 lines) plus
      this one. Decision is already taken and recorded: declined, both sides are literal-pinned.
- [ ] **Step 6: Commit** — `git commit -m "Privacy and Terms as menu rows for the always-present chrome (#1173)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 1 — Mounted at the three chrome call sites

**Files:** Modify `frontend/src/app/app.html` (after `:470`, `:322`, `:383`) ·
`frontend/src/app/app.ts` (imports) · Test `frontend/src/app/app.spec.ts`,
`frontend/src/app/app.a11y.spec.ts`, `frontend/src/app/app.contrast.spec.ts`

Rows go at the **foot** of each menu, in a `mt-1` group — space, not a hairline (R-6). Below Find a
booking and Sign out, which leaves `app.ts:435-438`'s hard-coded first-focus target untouched (R-4).

- [ ] **Step 1: Write the failing test** — AC-4, both auth branches and the sheet.

```ts
it('carries the legal rows in the phone sheet and in both desktop popover branches', () => {
  for (const signedIn of [false, true]) {
    customerAuth.signedIn.set(signedIn);
    const { el } = shell();

    for (const opener of ['menu-toggle', signedIn ? 'nav-user' : 'nav-menu']) {
      el.querySelector<HTMLButtonElement>(`[data-testid="${opener}"]`)!.click();
      const privacy = el.querySelector<HTMLAnchorElement>('[data-testid="legal-privacy-row"]');
      const terms = el.querySelector<HTMLAnchorElement>('[data-testid="legal-terms-row"]');
      expect(privacy?.getAttribute('href'), `${opener} privacy`).toBe('/legal/privacy');
      expect(terms?.getAttribute('href'), `${opener} terms`).toBe('/legal/terms');
      for (const row of [privacy!, terms!]) {
        expect(row.target).toBe('_blank');
        expect(row.rel).toBe('noopener');
      }
    }
  }
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx ng test --watch=false
      --include="src/app/app.spec.ts"` → FAIL, `privacy` is `null`
- [ ] **Step 3: Minimal implementation** — `<div class="mt-1"><app-legal-menu-rows variant="sheet" /></div>`
      at the sheet's foot and `variant="popover"` at both popover feet; `LegalMenuRows` into
      `app.ts`'s `imports`.
- [ ] **Step 4: Run it, verify it passes** — `npx ng test --watch=false
      --include="src/app/app.spec.ts" --include="src/app/app.a11y.spec.ts"
      --include="src/app/app.contrast.spec.ts"` → PASS
- [ ] **Step 5:** Extend `app.a11y.spec.ts`'s open-state cases (`:62`, `:74`, `:83`, `:93`) to
      `it.each(['riviera', 'porcelain', 'dark'] as const)` — today only the menus-closed case is
      theme-looped, so AC-5's "in all three themes" is not yet met for any open menu. Then extend
      `app.contrast.spec.ts:158`'s usage comment to name the legal rows, and confirm by reading
      `:156-175` that `--riv-pop-ink` on `--riv-pop-surface` is already measured in all three
      themes, so no new assertion is owed. Generalization pass: mechanism *an open-state a11y case
      that audits one theme only*; enumerate `grep -n "detectChanges()" frontend/src/app/app.a11y.spec.ts`.
- [ ] **Step 6: Commit** — `git commit -m "Mount the legal rows in the tourist menu chrome (#1173)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 2 — The `hitTestId` seam and the reachability e2e

**Files:** Create `frontend/e2e/support/hit-test.ts` · Test `frontend/e2e/legal-pages.e2e.ts` ·
Modify `frontend/e2e/tourist-tab-bar.e2e.ts:190`, `frontend/e2e/theme-shell.e2e.ts:208`,
`frontend/e2e/touch-targets-tourist.e2e.ts`

Five specs inline `elementFromPoint` today. Two adapters make a real seam; five make it overdue.

- [ ] **Step 1: Write the failing test** — AC-1/AC-2/AC-3, on the popup pattern (R-7).

```ts
import { hitTestId } from './support/hit-test';

test('the phone menu sheet carries the legal rows on the riviera map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/api\/venues(\?.*)?$/, (route) => route.fulfill({ json: VENUES }));

  await page.goto('/');
  await expect(page.getByTestId('venue-row').first()).toBeVisible();
  await openShellOverlay(page, 'menu-toggle');

  // The check that caught #1173: Playwright called the dead footer link visible, enabled and
  // stable while every click timed out for 60s against desk-rows.
  expect(await hitTestId(page, 'legal-privacy-row')).toBe('legal-privacy-row');

  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('legal-privacy-row').click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/legal\/privacy$/);
  await expect(popup.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
```

- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx
      playwright test --config playwright.a11y.config.ts legal-pages` → FAIL on the missing
      `support/hit-test` module, then on the missing row
- [ ] **Step 3: Minimal implementation** — `hitTestId`, then the desktop twin of the test at
      1280 × 720 through `openHeaderMenu`.

```ts
import { Page } from '@playwright/test';

/**
 * The `data-testid` of whatever actually receives a pointer at the centre of `testId`'s box — the
 * occlusion check `toBeVisible()` cannot make. A control that paints under a fixed overlay is
 * reported visible, enabled and stable, and every click on it times out (#1173).
 */
export async function hitTestId(page: Page, testId: string): Promise<string | null | undefined> {
  return page.evaluate((id) => {
    const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    return document
      .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      ?.closest('[data-testid]')
      ?.getAttribute('data-testid');
  }, testId);
}
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS; then the same run for
      `tourist-tab-bar`, `theme-shell` and `touch-targets-tourist`
- [ ] **Step 5: Generalization-audit pass** — mechanism: *an inlined `elementFromPoint` occlusion
      check*. Enumerate `grep -rn "elementFromPoint" frontend/e2e`. Migrate only the two
      same-shape sites and keep their exact expectations (R-8); log why the other three stay
      (a containment question, and two `waitForFunction` predicates). Add the menu sheet's own
      44 px sweep, which today's resting-surface sweeps never reach — `touch-targets-tourist.e2e.ts:40-45`
      opens the sheet but then clicks Sign out, which closes it before `expectTouchTargets` runs.
- [ ] **Step 6: Commit** — `git commit -m "Pin the legal rows as hit-testable, not merely visible (#1173)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 3 — `desk-frame`'s pointer-events interface

**Files:** Modify `frontend/src/app/pages/home/home.html:411-415`, `:416`, `:520` · Test
`frontend/e2e/discover-map.e2e.ts`

- [ ] **Step 1: Write the failing test** — AC-7, in the file's existing `WIDE` block.

```ts
test('the desk frame takes no pointer events where it paints nothing', async ({ page }) => {
  await page.setViewportSize(WIDE);
  // ... the file's standing WIDE arrangement
  const gutter = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="desk-frame"]')!.getBoundingClientRect();
    // 6px in: inside the frame's 12px padding, outside both children.
    return document.elementFromPoint(frame.left + 6, frame.top + 6)?.getAttribute('data-testid');
  });
  expect(gutter).not.toBe('desk-frame');
  await expect(page.getByTestId('venue-row').first()).toBeVisible();
});
```

- [ ] **Step 2: Run it, verify it fails** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx
      playwright test --config playwright.a11y.config.ts discover-map` → FAIL with `'desk-frame'`
- [ ] **Step 3: Minimal implementation** — `pointer-events-none` on `desk-frame`'s class,
      `pointer-events-auto` on `desk-panel` and on `desk-pane`, with the comment stating the
      invariant this slice is really buying: *this route paints to every edge, so no control may
      live in document flow here; the frame paints nothing and takes nothing.*
- [ ] **Step 4: Run it, verify it passes** — the whole `discover-map` file, so all ~20 existing
      `WIDE` interaction cases re-run against the change (R-2)
- [ ] **Step 5: Generalization-audit pass** — mechanism: *a `fixed` full-window layer with no
      `pointer-events-none` whose children do the painting*. Enumerate
      `grep -rn "fixed inset" frontend/src/app/pages/home frontend/src/app/app.ts`; judge
      `sheet-ground` (`home.html:194`) and the sheet's own scroller (already
      `pointer-events-none` at `discover-sheet.ts:73`, the precedent this copies).
- [ ] **Step 6: Commit** — `git commit -m "The desk frame paints nothing and takes nothing (#1173)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 4 — The two handovers

**Files:** Modify `frontend/e2e/tourist-tab-bar.e2e.ts:116-138` and `:46-51` · Test
`frontend/src/app/app.routes.spec.ts`

- [ ] **Step 1: Write the failing test** — AC-8, beside the two existing chrome fences at
      `app.routes.spec.ts:167-175`.

```ts
it('never withholds the footer and the tab bar on the same route', () => {
  // Below sm the tab bar's menu sheet is the only legal surface a footerless route has (#1173).
  const stranded = routes
    .filter((r) => r.data?.['footer'] === false && r.data?.['tabBar'] === false)
    .map((r) => r.path);
  expect(stranded).toEqual([]);
});
```

- [ ] **Step 2: Run it, verify it fails** — prove it goes red by temporarily adding `tabBar: false`
      to Discover's route data, exactly as #1167's F-6 proved its own fence. `npx ng test
      --watch=false --include="src/app/app.routes.spec.ts"`
- [ ] **Step 3: Minimal implementation** — revert the temporary flag (the fence passes on the real
      table), then repoint AC-9's spec at `/venues/1` and drop the 8-copy `VENUES` padding with its
      comment once the file proves nothing else needs it.
- [ ] **Step 4: Run it, verify it passes** — `npx ng test --watch=false
      --include="src/app/app.routes.spec.ts"`, then the whole `tourist-tab-bar` e2e file
- [ ] **Step 5: Generalization-audit pass** — mechanism: *a shell guarantee parked on `?map=off`*.
      Enumerate `grep -rn "map=off" frontend/e2e frontend/src`. Everything else in that population
      measures the pre-Q **page** and is #1168's by its own ACs; only this one measured the
      **shell**. Log the split so #1168 inherits a clean list.
- [ ] **Step 6: Commit** — `git commit -m "Move the scroll-away guarantee off the dying map flag (#1173)"`
- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Generalization-audit log

| Date | Trigger | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-21 | Phase 0 added a third template holding a legal document path | A hard-coded legal document path in a template | `grep -rn "/legal/privacy\|/legal/terms" frontend/src --include=*.ts --include=*.html \| grep -v spec` | 3 (`legal-footer.ts:15-16`, `legal-consent.ts:25,34`, `legal-menu-rows.ts`) + the two route declarations | No extraction. Both sides are literal-pinned (`app.routes.spec.ts:48-53` vs the three component specs), so a rename fails loudly; a module whose implementation is two string constants is maximally shallow. Reasoning under Open questions § Resolved |
| 2026-09-21 | F-10: a test broke on the sheet's new height | An e2e assertion that depends on the phone menu sheet's size or its exact row set | `grep -rln "menu-toggle\|mobile-menu" frontend/e2e frontend/src/app --include=*.ts` | 9 files + `support/shell.ts` | **2 were affected and both are fixed**: `theme-shell.e2e.ts` (the fixed-fraction probe point, F-10) and `app.spec.ts`'s sheet-order spec (phase 1). The other seven were run and pass: `current-page-marker`, `find-a-booking`, `focus-ring-baseline`, `tourist-header`, `tourist-tab-bar`, `touch-targets-tourist`, `legal-pages`. Lesson recorded: a fixed viewport fraction as a hit-test probe is brittle against any growth in fixed chrome |
| 2026-09-21 | Phase 4 moved a guarantee off the dying map flag | A spec parked on `?map=off` | `grep -rn "map=off\|map: 'off'" frontend/e2e frontend/src` | ~60 sites across 16 e2e files plus `home.spec.ts`/`home.a11y.spec.ts` | **1 moved.** Every other site's *subject* is the pre-Q **page** — the hero, the filter bar's selects, the List/Map switch, the preview card, the card token sweeps — which #1168's own ACs already claim. The scroll-away test was the only one whose subject was the **shell**, so #1168 inherits a population with no shell guarantees hidden in it |
| 2026-09-21 | Phase 3 fixed one fixed layer's pointer-events | A `fixed` full-window layer with no `pointer-events-none` whose children do the painting | `grep -rn "fixed inset" frontend/src/app/pages/home frontend/src/app/app.ts frontend/src/app/app.html` | 9 layers | **1 acted on** (`desk-frame`). The rest are not the same defect and were left: `sheet-ground` and the coast picker's backdrop and dialog genuinely paint across their box; the tab bar and menu sheet are opaque surfaces; `riv-bg` is at `z-[-1]` with nothing behind it to block; `discover-sheet.ts:73,133` already carry the property and were the precedent copied |
| 2026-09-21 | Phase 2 extracted the `hitTestId` seam | An inlined `elementFromPoint` occlusion check | `grep -rn "elementFromPoint" frontend/e2e` | 7 sites in 6 files | **1 migrated** (`tourist-tab-bar.e2e.ts:190`, the only testid-box-centre shape), expectation unchanged. Not migrated, with reasons: `theme-shell.e2e.ts:209` (arbitrary viewport point, not an element's box — the plan wrongly predicted this one), `booking-flow.e2e.ts:174` (asks containment, not identity), `discover-photos.e2e.ts:228,389` and `discover-sheet.e2e.ts:761` (`waitForFunction` predicates), `operator-venue-location.e2e.ts:329` (returns the element, not an id) |
| 2026-09-21 | Phase 2 nearly shipped a duplicate sweep | A tourist touch-target sweep of the open menu sheet | `grep -n "menu-toggle" frontend/e2e/touch-targets-tourist.e2e.ts` | 2 (the sign-out notice case, which closes the sheet before sweeping; and `:267`, which sweeps it open) | The new case I added was a **duplicate of `:267`** and its justifying comment was false — deleted. `:267` strengthened instead with two visibility assertions, so the sweep cannot pass vacuously on the rows it is now the only measurement of |
| 2026-09-21 | Phase 1's mount reddened two unrelated specs | An `app.spec.ts` assertion pinning a menu's exact row list, which any added row breaks | `grep -n "find-open-mobile'\|nav-signout'" frontend/src/app/app.spec.ts` | 1 spec (`it.each` over both auth states) | Extended to pin the legal rows **last**, and its title renamed. The desktop popovers have no equivalent order spec, so nothing else moved |
| 2026-09-21 | AC-5 needed three themes on an open menu | An `app.a11y.spec.ts` open-state case auditing the default theme only | `grep -n "detectChanges();" frontend/src/app/app.a11y.spec.ts` | 4 open-state cases; 3 are menus carrying the legal rows | The three menu cases crossed with the theme axis via one `auditOpenMenu` helper (8 cases → 16). The theme-picker case was left alone: it carries no legal row. The file's header doc said "BOTH themes" and now says all three |
| 2026-09-21 | Phase 0 needed the phone sheet's row skin outside `app.ts` | A menu-row skin the popover family owns but a call site keeps private | `grep -rn "MOBILE_ITEM" frontend/src` | 1 (`app.ts:39`, consumed twice at `:78-79`) | Promoted to `shared/popover-skin.ts` beside `POP_ITEM` — `riviera-tailwind` rule 1's one place so the popovers cannot drift. `CURRENT_POP_ROW` and `POP_ROW_RING` became unused in `app.ts` and were dropped from its import |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts legal-pages` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Same run → the desktop test PASSES. Verified at commit `<sha>`.
- [ ] **AC-3:** Same run; both tests assert `hitTestId` before clicking. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `npx ng test --watch=false --include="src/app/app.spec.ts"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `npm run test:a11y` → PASS, the open-state cases theme-looped. Verified at commit `<sha>`.
- [ ] **AC-6:** Same run; `app.contrast.spec.ts:156-175` green and its usage comment names the rows. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `… playwright test --config playwright.a11y.config.ts discover-map` → PASS. Verified at commit `<sha>`.
- [ ] **AC-8:** Run `npx ng test --watch=false --include="src/app/app.routes.spec.ts"` → PASS, proven red first. Verified at commit `<sha>`.
- [ ] **AC-9:** Run `… playwright test --config playwright.a11y.config.ts tourist-tab-bar` → PASS on `/venues/1`. Verified at commit `<sha>`.

## Self-review checklist

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc.
- [ ] No JPA (#1). Availability section justified N/A — frontend-only, no `set_availability` write.
- [ ] Pool + cutoff untouched (#3, #4). No money (#5). No clock (#6). No codes (#7).
- [ ] Modulith section justified N/A — no Java in the diff, so the structural net is not owed.
- [ ] Payment section justified N/A; the new-tab decision's payment reason recorded there.
- [ ] No Flyway migration in scope (#12); no `V<n>` claimed, so nothing to renumber.
- [ ] Frontend standards met: `shared/` placement, element selector + `class: 'contents'` host for an `<a>`-renderer, `appTouchTarget` on every row, tokens never theme-named, no `@apply`.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` clean with the plan committed.
- [ ] The three hook-run `scripts/check-*.mjs` guards pass, plus `check-comment-only.mjs` and `check-review-range.mjs` by hand.
- [ ] Execution status at HEAD matches reality; no finding row left `open` without a decision.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with an issue #.
- [ ] `docs/plans/q-shore-discover-default.md` retired at close-out per the plan-doc retirement rule, checked against `riviera-docs-freshness` rather than from memory.
- [ ] Close-out written in THIS PR's last code-touching commit, citing `merged via PR #NN`.
- [ ] The review gate ran in full (ladder in `riviera-sdlc` `references/pr-gates.md` §1 plus the overlay); if blocked, stated in the PR with the box unticked.
