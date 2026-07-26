# Tourist Account Menu (shell entry point) Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A signed-in tourist can reach `/account/password` from the shell on desktop **and**
mobile, via an account disclosure menu that groups the signed-in affordances (email label →
"Your account", "Sign out") behind one keyboard-reachable, axe-clean trigger.

**Architecture:** The menu is a **disclosure popover, not an ARIA `menu`** — a `<button
aria-expanded>` plus a plain container of links, exactly the pattern `riv-theme-picker`
already uses in this header. `role="menu"`/`menuitem` is deliberately rejected: it obligates
roving `tabindex` + arrow-key navigation, the same trap the theme options were downgraded out
of (`app.html:102`, a prior review finding). The third popover joins the existing
`menuOpen`/`themeOpen` signal machinery (`toggleX` closes siblings, `closeMenus()` restores
focus, `NavigationEnd` clears all) rather than growing a parallel one.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only, no tables, no migration.

**Source of intent:** GitHub issue #351. Entry-point shape (dropdown over the two simpler
options sketched in the issue) chosen by the maintainer on 2026-07-26, for future account
surfaces.

**Skills consulted:** `riviera-frontend` (the shell is app-root chrome — no new feature folder;
the popover stays in `app.html`/`app.scss` next to its two siblings) · `riviera-tailwind`
(**deliberate deviation, see R-4**: reuse the existing `riv-pop` SCSS recipe rather than
introducing Tailwind utilities into an otherwise-SCSS header — the skill's "SCSS is retiring
is the default, not an absolute" clause) · `angular-developer` + angular-cli MCP v22
(signals for popover state, `host` object not `@HostListener`, `@if` control flow, axe-clean
mandatory) · `playwright-cli` + RV-FE-E2E (mocked CI suite `frontend/e2e/`, test-id locators,
web-first assertions, no fixed sleeps) · `riviera-plan-doc` (this template).

**Branch:** `claude/sdlc-351-ndg1j2` — **cloud-session substitution** for the conventional
`feature/tourist-account-menu` (`riviera-sdlc` §Remote/cloud addendum); exists and is checked out.

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a signed-in tourist on the desktop header, when they activate the account
      trigger, then a popover exposes a link to `/account/password` whose accessible name is
      "Your account" (not the email address). *Pinned by:* `app.spec.ts` →
      `'opens an account menu with a Your account link when signed in (#351)'`
- [ ] **AC-2:** Given a signed-out tourist, when the header renders, then no account trigger,
      popover, or sign-out control is in the DOM (the Sign in / Register links show instead).
      *Pinned by:* `app.spec.ts` → `'shows Sign in and Register links in the header when signed out (S2 #111)'` (extended)
- [ ] **AC-3:** Given the account popover is open, when the user presses Escape or clicks the
      backdrop, then it closes and focus returns to the trigger button. *Pinned by:*
      `theme-shell.e2e.ts` → `'the account menu closes on Escape and restores focus (#351)'`
- [ ] **AC-4:** Given the account popover is open, when the user opens the theme picker (or vice
      versa), then only one popover is open at a time. *Pinned by:* `theme-shell.e2e.ts` →
      `'opening the account menu closes the theme picker (#351)'`
- [ ] **AC-5:** Given the account popover is open, when the user activates "Your account", then
      the app navigates to `/account/password` **and the popover is closed** on arrival.
      *Pinned by:* `theme-shell.e2e.ts` → `'the account menu closes on navigation (#351)'`
- [ ] **AC-6:** Given a signed-in tourist at the mobile viewport, when they open the hamburger
      menu, then an account group offers the same "Your account" destination and Sign out, with
      no nested popover. *Pinned by:* `app.spec.ts` → `'offers the account group in the mobile menu when signed in (#351)'`
- [ ] **AC-7:** Given the account popover (desktop) and the mobile account group are rendered,
      when axe runs, then there are no serious violations. *Pinned by:* `theme-shell.e2e.ts`
      via `expectNoSeriousAxeViolations`, at both viewports.
- [ ] **AC-8:** Given `customer-password.e2e.ts` and `erasure.e2e.ts`, when they reach the
      account page, then they do so **through the new entry point**, not `page.goto('/account/password')`.
      *Pinned by:* the specs themselves (the `goto` calls are deleted, not supplemented).

## Non-goals

- **Moving `My bookings` into the dropdown.** It stays a top-level nav link — see the
  Behavior-parity ledger; it is not account-scoped (signed-out guests reach their
  device-remembered codes through it), so hiding it behind a signed-in-only menu would be a
  regression dressed as tidying.
- Any new account surface (notifications, profile, saved cards). The menu is built to hold
  them; this slice adds none.
- Touching the operator console header (`oc-change-password`). Its shape is the precedent
  here, not the target.
- Backend, API, schema, or session changes of any kind.
- Migrating `app.scss` to Tailwind (R-4).

## Behavior-parity ledger

> The slice **replaces** the flat signed-in header controls (`nav-user` span + `nav-signout`
> button, desktop and mobile) with a grouped disclosure. Every behavior of the old surface:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `nav-user` shows "Signed in as {{ email }}" | **preserved** | the same string becomes the trigger button's visible label; **the `data-testid="nav-user"` moves onto the trigger**, so every existing `toContainText(EMAIL)` assertion keeps working without opening the menu |
| `nav-user` is non-interactive (`<span>`) | **changed** | becomes a `<button>`; it gains `aria-expanded` + focus styling. Accessible name stays the email string, so WCAG 2.5.3 (Label in Name) holds |
| `nav-signout` signs out on click | **preserved** | same `data-testid`, same `signOut()` handler — but now **inside** the popover, so callers must open the menu first (specs + page object updated in Phase 2) |
| `nav-signout` visible without interaction | **changed** | one extra activation. Accepted: that is the point of a menu; mobile keeps it one tap deep behind the hamburger it already needed |
| signed-in controls held until `!customerAuth.restoring()` | **preserved** | the `@if (!customerAuth.restoring())` guard wraps the whole account block, unchanged — no "Sign in" flash |
| signed-out state shows `nav-signin` + `nav-register` | **preserved** | untouched `@else` branch |
| mobile twins `nav-user-mobile` / `nav-signout-mobile` | **preserved** | same test-ids, regrouped under a labelled account group (the `riv-mobile-theme` precedent: desktop popover → mobile inline group) |
| `signOut()` closes the mobile menu first | **preserved** | `signOut()` must now also clear `accountOpen` — see R-2 |
| Escape closes open shell surfaces | **preserved + extended** | `accountOpen` joins `closeMenus()`, which the existing host `(document:keydown.escape)` already calls |
| a navigation closes shell overlays | **preserved + extended** | `accountOpen` joins the `NavigationEnd` reset — without this, activating "Your account" navigates with the popover still open (AC-5, R-2) |
| "Find a booking" closes other popovers before opening | **preserved + extended** | `openFind()` must also clear `accountOpen` (R-2) |
| `My bookings` top-level nav link | **preserved** | deliberately not moved (Non-goals) |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Reaching for `role="menu"`/`menuitem` — plausible for a "dropdown", but it obligates roving tabindex + arrow keys, and a half-implemented menu fails axe **and** keyboard users | high | med | Locked to the disclosure pattern in Architecture; the `app.html:102` theme-option comment is the in-repo precedent. AC-3/AC-7 pin it | Claude | open |
| R-2 | **Popover survives its own navigation** — the three existing close paths (`NavigationEnd`, `openFind`, `signOut`) each enumerate the open signals by hand, so a new signal silently misses all three | high | med | Phase 0 adds `accountOpen` to all four sites (`NavigationEnd`, `openFind`, `signOut`, `closeMenus`) in one edit; AC-5 pins the navigation case, which is the one a human would actually see | Claude | open |
| R-3 | Existing coverage breaks broadly: `nav-signout` is queried by `app.spec.ts:133`, `customer-auth.page.ts:33`, `customer-password.e2e.ts:73` and is now one activation deeper | high | med | Keep both test-ids; put `nav-user` on the trigger so signed-in assertions are untouched; funnel sign-out through `CustomerAuthPage.signOut()` (already the indirection) so most call sites need **no** change | Claude | open |
| R-4 | Styling-convention conflict: `riviera-tailwind` makes Tailwind the go-forward, but `app.scss` is SCSS and the popover recipe (`riv-pop`, `riv-pop-in`, `riv-backdrop`) lives there | med | low | Reuse the existing SCSS recipe + add one positioning class beside `riv-theme-pop`. Recorded as a deliberate deviation in *Skills consulted* so review reads it as a decision, not drift. Reviewer's call to overrule | Claude | open |
| R-5 | Header crowding — the desktop right rail already holds email, theme chip and Sign out at narrow-desktop widths | med | low | The menu **reduces** top-level items (2 → 1); verify at 1024px during Phase 0 | Claude | open |
| R-6 | Glass contrast regression on a new popover surface | low | med | None expected: `app.contrast.spec.ts:69` already proves `riv-pop` ink over the darkest riviera stop, and this reuses that surface with no new tokens. Confirm the spec passes unchanged rather than adding math | Claude | open |
| R-7 | Merge conflict in `app.html`/`app.scss`/`app.spec.ts` from a parallel slice | low | low | Only Dependabot PRs are open (#332–#341, all `frontend/package.json`); no overlap. Merge `origin/main` before the PR regardless | Claude | open |

No Flyway migration in this slice, so no `V<n>` claim to defend.

## Open questions / Assumptions

- **Assumption:** the link label is **"Your account"**, matching the route's existing
  `title: 'Your account — Riviera'` (`app.routes.ts:108`) — no new vocabulary invented.
  *Owner:* Claude · *Resolves by:* Phase 0 (reviewer may rename in one line)
- **Assumption:** the account menu is the right home for **Sign out**, i.e. sign-out leaves the
  top level. The alternative (Sign out stays a sibling, menu holds only "Your account") keeps
  sign-out one click away but re-splits the signed-in affordances the menu exists to group.
  *Owner:* Claude · *Resolves by:* Phase 0 review

### Resolved

- **Entry-point shape** — dropdown (issue's richer option) over "separate link" / "make the
  label a link". Decided by the maintainer, 2026-07-26, on future-growth grounds.
- **Does `My bookings` move into the menu?** No — see Non-goals; it must stay reachable while
  signed out. Decided at plan time, 2026-07-26.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. This slice adds no write path of any kind: it is header
navigation markup plus one boolean signal. No `(set_id, booking_date)` row, no booking, no
cutoff arithmetic.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend file is touched; no module, port, or event changes.

### Module ownership (§4a)

N/A — frontend-only, no backend capability added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `src/app/app.ts` | existing | shell component | `accountOpen` signal + `accountButton` `viewChild`; joins `closeMenus`/`NavigationEnd`/`openFind`/`signOut` | none |
| FE-2 | `src/app/app.html` | existing | template | desktop trigger + `riv-pop` popover; mobile account group | none |
| FE-3 | `src/app/app.scss` | existing | styles | one `riv-account-pop` positioning rule + trigger styling beside `riv-theme-pop` | none |
| FE-4 | `src/app/app.spec.ts` | existing | unit spec | AC-1, AC-2, AC-6 | none |
| FE-5 | `e2e/theme-shell.e2e.ts` | existing | e2e (mocked/CI) | AC-3, AC-4, AC-5, AC-7 | none |
| FE-6 | `e2e/support/pages/customer-auth.page.ts` | existing | page object | `openAccountMenu()`; `signOut()` opens first | none |
| FE-7 | `e2e/customer-password.e2e.ts` | existing | e2e (mocked/CI) | AC-8 — enter via the link | none |
| FE-8 | `e2e/erasure.e2e.ts` | existing | e2e (mocked/CI) | AC-8 — `goto('/')` then the link | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal state, `host` object
(no `@HostListener`), class bindings (no `ngClass`). No new images. Every new spec is
`*.e2e.ts` in the **mocked CI suite** (`frontend/e2e/`), per RV-FE-E2E — this is
render/a11y/interaction, so it must not go near `real-backend/`.

## FE↔BE contract

N/A — no contract change. No endpoint, DTO, or status code is added or altered.

## Execution status

> **This section is the session-recovery anchor.** Re-read it (plus the current stage's
> `riviera-sdlc` reference file) after any compaction or in a fresh session, before acting.

**Stage pointer:** `plan — authored, awaiting implement`

**Next action:** Start Phase 0 — write the failing `app.spec.ts` cases for AC-1/AC-2 first.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Desktop account menu | | |
| 1 — Mobile account group | | |
| 2 — E2E rewiring + shell coverage | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for
what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/app/app.ts` — `accountOpen` signal, `accountButton` ref, `toggleAccountMenu()`;
  `accountOpen` added to `closeMenus()`, `openFind()`, `signOut()`, and the `NavigationEnd` reset
- `frontend/src/app/app.html` — desktop trigger + popover; mobile account group
- `frontend/src/app/app.scss` — `riv-account-pop` (positioning) + trigger rule, beside `riv-theme-pop`
- `frontend/src/app/app.spec.ts` — AC-1, AC-2, AC-6; existing sign-out case opens the menu first
- `frontend/e2e/theme-shell.e2e.ts` — AC-3, AC-4, AC-5, AC-7
- `frontend/e2e/support/pages/customer-auth.page.ts` — `openAccountMenu()`; `signOut()` opens first
- `frontend/e2e/customer-password.e2e.ts` — AC-8; delete the `goto`, rewrite the stale TSDoc paragraph
- `frontend/e2e/erasure.e2e.ts` — AC-8; `goto('/')` + link, rewrite the stale TSDoc paragraph

---

## Phase 0 — Desktop account menu

**Files:** Modify `frontend/src/app/app.ts`, `app.html`, `app.scss` · Test `frontend/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-1, AC-2) in `app.spec.ts` — assert the trigger
      carries `data-testid="nav-user"` and the email text; that `nav-signout` is absent until
      the trigger is clicked; that the revealed link's `href` is `/account/password` and its
      text is "Your account"; and extend the signed-out case to assert the trigger is absent.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- app.spec` → FAIL (no account trigger).

> Scope: target the one spec file. Not the full suite.

- [ ] **Step 3: Minimal implementation** — `accountOpen` signal + `accountButton` viewChild +
      `toggleAccountMenu()` (which clears `menuOpen`/`themeOpen`); add `accountOpen` to
      `closeMenus()` (with focus return), `openFind()`, `signOut()`, and the `NavigationEnd`
      reset **in the same edit** (R-2). Template: `<button data-testid="nav-user"
      [attr.aria-expanded]="accountOpen()">` + `riv-backdrop` + `riv-pop riv-pop-in
      riv-account-pop` holding the `/account/password` link and the existing sign-out button.
      **No `role="menu"`** (R-1).
- [ ] **Step 4: Run it, verify it passes** — `npm test -- app.spec` → PASS.

> Scope (end-of-phase regression): `npm test` for the app-shell specs incl. `app.contrast.spec.ts`
> (R-6 — it must pass **unchanged**; if it needs edits, the popover grew a new surface, so stop
> and reconsider), then `npm run lint`.

- [ ] **Step 5: Generalization-audit pass** — search the shell for every site that enumerates
      the popover signals by hand (`grep -n 'themeOpen\|menuOpen' src/app/app.ts`) and confirm
      all four now include `accountOpen`. Append to the log.
- [ ] **Step 6: Verify header layout at 1024px** (R-5).
- [ ] **Step 7: Commit** — `git commit -m "feat(#351): tourist account menu in the desktop header"`
- [ ] **Step 8: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Mobile account group

**Files:** Modify `frontend/src/app/app.html`, `app.scss` · Test `frontend/src/app/app.spec.ts`

- [ ] **Step 1: Write the failing test** (AC-6) — within `[data-testid="mobile-menu"]`, assert
      an `a[href="/account/password"]` labelled "Your account" alongside `nav-user-mobile` and
      `nav-signout-mobile`.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- app.spec` → FAIL.
- [ ] **Step 3: Minimal implementation** — a labelled account group in the mobile menu (the
      `riv-mobile-theme` precedent: **no nested popover**), with `(click)="closeMenus()"` on the
      link so the sheet collapses on navigation.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- app.spec` → PASS.
- [ ] **Step 5: Generalization-audit pass** — confirm desktop and mobile expose the same
      destination set; append to the log.
- [ ] **Step 6: Commit** — `git commit -m "feat(#351): tourist account group in the mobile menu"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — E2E rewiring + shell coverage

**Files:** Modify `frontend/e2e/theme-shell.e2e.ts`, `support/pages/customer-auth.page.ts`,
`customer-password.e2e.ts`, `erasure.e2e.ts`

- [ ] **Step 1: Write the failing e2e** (AC-3, AC-4, AC-5, AC-7) in `theme-shell.e2e.ts` —
      Escape closes + restores focus; opening one popover closes the other; activating "Your
      account" lands on `/account/password` with the popover closed; `expectNoSeriousAxeViolations`
      with the menu open, at both viewports. Use `getByTestId` locators and web-first
      assertions — no fixed sleeps.
- [ ] **Step 2: Run it, verify it fails** — `npm run test:e2e:a11y -- theme-shell` → FAIL.
- [ ] **Step 3: Implementation** — add `openAccountMenu()` to `CustomerAuthPage` and make
      `signOut()` open the menu first (R-3, so most call sites stay untouched); rewire
      `customer-password.e2e.ts` and `erasure.e2e.ts` to enter through the link (AC-8) —
      `erasure.e2e.ts` needs a `page.goto('/')` first, since it fakes its session via
      `/api/auth/me` and never visits a page. **Rewrite the stale TSDoc paragraph in both
      specs** — each currently states the account page has no in-app entry point, which this
      slice makes false.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:e2e:a11y` (mocked CI suite; **not**
      `test:e2e`, which is the local-only real-backend suite) → PASS.

> Scope: the three rewired specs plus `theme-shell`; then the full mocked suite once, since the
> page object is shared and its blast radius is every customer-auth spec.

- [ ] **Step 5: Generalization-audit pass** — `grep -rn "getByTestId('nav-signout')" e2e` to
      catch any spec bypassing the page object; append to the log.
- [ ] **Step 6: Full local verification** — `npm run lint`, `npm test`, `npm run build`.
- [ ] **Step 7: Commit** — `git commit -m "test(#351): drive the account page through the shell entry point"`
- [ ] **Step 8: Update plan-doc execution status**, then push and open the PR into `main`
      (merge `origin/main` first, R-7).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- app.spec` → the account-menu case passes. Verified at commit `<sha>`.
- [ ] **AC-2:** `npm test -- app.spec` → the signed-out case passes. Verified at commit `<sha>`.
- [ ] **AC-3:** `npm run test:e2e:a11y -- theme-shell` → Escape/focus case passes. Verified at `<sha>`.
- [ ] **AC-4:** `npm run test:e2e:a11y -- theme-shell` → mutual-exclusion case passes. Verified at `<sha>`.
- [ ] **AC-5:** `npm run test:e2e:a11y -- theme-shell` → closes-on-navigation case passes. Verified at `<sha>`.
- [ ] **AC-6:** `npm test -- app.spec` → mobile-group case passes. Verified at commit `<sha>`.
- [ ] **AC-7:** `npm run test:e2e:a11y` → no serious axe violations at either viewport. Verified at `<sha>`.
- [ ] **AC-8:** `grep -n "goto('/account/password')" e2e/customer-password.e2e.ts e2e/erasure.e2e.ts`
      → no matches. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section justified N/A (invariant #2) — no write path in scope.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — N/A.
- [ ] **Modulith** section justified N/A (invariant #11) — no backend file touched.
- [ ] **Payment/payout** section justified N/A (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — N/A.
- [ ] Timezone correct (invariant #6) — N/A.
- [ ] Booking codes unguessable (invariant #7) — N/A.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented (R-4 is the one documented deviation);
      no `as any` on the contract.
- [ ] The disclosure pattern is intact: no `role="menu"`, no roving tabindex (R-1).
- [ ] All four popover-close paths include `accountOpen` (R-2).
- [ ] The behavior-parity ledger has no unexplained `dropped` row.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
