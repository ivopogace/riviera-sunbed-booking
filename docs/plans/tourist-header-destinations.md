# Tourist header: two destinations Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** The tourist header's primary nav carries exactly two destinations (`Beaches`,
`My bookings`); `Find a booking` and `Register` become rows in a header popover; the theme
chip becomes a bare swatch with a 3:1 ring; the signed-out bar carries a plain `Sign in` link
plus a round `Menu` button and the signed-in bar an avatar + handle chip — at both breakpoints,
keeping today's phone hamburger.

**Architecture:** A rebuild of the shipped shell header in `app.html` / `app.ts` after the
corrected variant H (spike branch `claude/header-variant-h-review-0g30q1`, layout and class
choices only, not code). The one behaviour change inside the shell class is that the find
modal's focus-return target is **set by the opener** — the popover row passes its persistent
trigger (the account chip, the desktop menu button, or the hamburger) as a template reference
into `openFind(trigger)` — instead of being resolved from a `#findButton` that no longer
renders. Everything else stays a disclosure (`aria-expanded` + plain links), one popover open
at a time, close-on-navigation as shipped.

**Persistence:** N/A — frontend-only; no tables or migrations.

**Source of intent:** GitHub issue #1002 (signed-off spike verdict, `VERDICT.md` § *Corrections
from the adversarial review* on the review branch).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — no open PRs, no
Flyway in scope; found the drift listed under *Grill outcome* below) · `riviera-plan-doc` (this
template — forced the parity ledger for the retired header controls and the per-AC seams) ·
`tdd` (each AC is one red test in `app.spec.ts` / the named spec before the template changes)
· `riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(`ran` at close-out — see Execution status) · `riviera-local-debug` (unshallowed the clone,
scoped Vitest runs, `PW_CHROMIUM_EXECUTABLE` for the mocked e2e) · `riviera-frontend` (all
changes stay in `app.*` at the shell root + `e2e/`; test-id markers kept as inert classes where
specs query them) · `riviera-tailwind` (no `@apply`; every `<a>` in the bar gets `appTouchTarget`
+ `inline-flex items-center`; tokens only — the avatar takes `--riv-solid-fill-brand`, the
fixed-white-ink family, not the CTA gradient; ring via `before:ring-[1.5px]
before:ring-riv-ink-soft`) · `angular-developer` + angular-cli MCP (`search_documentation` v22
on template reference variables: visible in descendant blocks, not across sibling `@if`
branches, declared once — which is why each popover branch passes its own trigger ref) ·
`playwright-cli` (the mocked suite is the CI-safe one; the new/extended e2e specs live in
`frontend/e2e/`) · Tailwind v4 docs (`before:` auto-adds `content: ''`; `ring-[<value>]` is a
box-shadow width, `ring-<theme color>` its colour; `hover:` compiles under
`@media (hover: hover)`; `aria-[current=page]:` arbitrary variant).

**Branch:** `claude/tourist-header-destinations-o7xz29` (the session's designated remote
branch, standing in for `feature/tourist-header-destinations`)

---

## Grill outcome (issue-intake gate)

The issue is current; the drift is in the *tests* that key on the retired controls, not in the
ACs:

- `e2e/find-a-booking.e2e.ts` opens the modal via `find-open` in the desktop nav (4 sites);
  `e2e/unified-auth.e2e.ts` clicks `nav-register` in the bar; `customer-password.e2e.ts`,
  `theme-shell.e2e.ts`, `support/pages/customer-auth.page.ts` read `nav-user`'s text for the
  email; `theme-shell.e2e.ts`'s phone test picks a theme from the hamburger sheet;
  `current-page-marker.e2e.ts` reads `nav-register-mobile`. Each is re-pointed in the phase that
  retires its control (parity ledger below).
- AC 7 forbids `--riv-cta-grad` anywhere under `<header>`; H's avatar used it. The avatar takes
  `--riv-solid-fill-brand` (#0a6e85, the fixed-white-ink badge family; white on it is 5.8:1).
- H puts the swatch in the bar at every width. With the swatch reachable in one tap on phones,
  the hamburger sheet's three-dot theme block would be a duplicate control, so it is dropped
  (Assumption A-1).
- H reshaped the brand (no subtitle, 56px bar). Neither is an AC; the bar keeps the shipped
  brand block and height — "structure, not colour", and the smaller bar is #1003's
  concern (Assumption A-2).

## Acceptance criteria (testable)

- [x] **AC-1:** Given the tourist chrome, when the shell renders, then
  `nav[aria-label="Primary"]` contains exactly two links, `Beaches` → `/` and `My bookings` →
  `/my-bookings`, and no `Find a booking` control anywhere in the primary nav. *Seam:* the
  rendered shell (`App` host DOM) · *Pinned by:* `app.spec.ts` › `renders exactly two primary
  destinations, Beaches and My bookings (#1002)`.
- [x] **AC-2:** Given either auth state at either breakpoint, when `Find a booking` is activated
  from the header popover (account menu signed in, menu button signed out) or the hamburger
  sheet, then `app-find-booking` opens, the popover/sheet closes, and dismissing the modal
  returns focus to that popover's persistent trigger. *Seam:* the shell DOM +
  `document.activeElement` · *Pinned by:* `app.spec.ts` › `Find a booking from the signed-out menu opens the
  modal, closes the popover and returns focus to the menu button (#1002)`, `Find a booking from
  the account menu returns focus to the chip on dismiss (#1002)`, `Find a booking from the mobile
  menu (signed in: %s) closes the menu and returns focus to the hamburger (#148, #1002)`;
  `e2e/find-a-booking.e2e.ts` › `opens from the header menu in both auth states and returns focus
  to the trigger on dismiss (#1002)` and `phone › opens from the hamburger sheet and returns focus
  to the hamburger on dismiss (#1002)`.
- [x] **AC-3:** Given the bar, when the theme control renders, then it is a button with no
  visible text whose accessible name is `Color theme: <active theme>`, opening the unchanged
  three-option popover; its swatch carries a 1.5px `--riv-ink-soft` ring that composites to
  ≥ 3:1 against the header glass at the worst stop of every theme. *Seam:* the shell DOM for the
  name; `testing/contrast.ts` maths for the ring · *Pinned by:* `app.spec.ts` › `the theme
  control is a swatch-only button named for the active theme (#1002)`, `app.a11y.spec.ts` ›
  `shell with the theme picker open has no violations` and the two popover cases,
  `app.contrast.spec.ts` › `the swatch ring (ink-soft) clears 3:1 against the header glass in
  every theme: $theme (#1002)`, `e2e/tourist-header.e2e.ts` › `the theme swatch › carries a 1.5px
  ink-soft ring in the porcelain theme` / `… in the riviera theme`.
- [x] **AC-4:** Given signed out, when the shell renders, then the bar holds a `Sign in` link
  (`href="/account/sign-in"`, `aria-current="page"` on the sign-in route via `authLinkCurrent`)
  and a separate button named `Menu` whose popover holds `Create an account`
  (`/account/sign-in?mode=register`) and `Find a booking`; given signed in, the bar holds one
  control — the avatar + handle chip, accessible name `Account: <email>` — whose popover holds
  the identity block with the full address, `Your account`, `Find a booking`, `Sign out`; the
  text `Signed in as` appears nowhere in the bar. *Seam:* the shell DOM · *Pinned by:*
  `app.spec.ts` › `signed out: a Sign in link plus a Menu button, never a Sign in that opens a
  menu (#1002)`, `signed in: one account chip opening the account menu, and signs out on click
  (#1002)`, `never marks Sign in and Create an account current together: the mode query param
  decides`, `closes the signed-out menu on Escape and on the backdrop, handing focus back to the
  Menu button (#1002)`.
- [x] **AC-5:** Given `/venues/1` (or any page the nav does not list), when the desktop nav
  renders, then no link carries `aria-current`; `Beaches` is current at `/` only. *Seam:*
  `routerLinkActive` with `EXACT_PATH` · *Pinned by:* `app.spec.ts` › `marks Beaches current at
  the root only, and nothing on a page the nav does not list` (existing, extended to a
  `/venues/1` route).
- [x] **AC-6:** Given the riviera theme on a touch tablet, when `/my-bookings` renders, then the
  current link is full ink (`rgb(255, 255, 255)`) with an underline in that same ink — never the
  accent ink. *Seam:* computed styles in a real browser · *Pinned by:*
  `e2e/current-page-marker.e2e.ts` › `tablet: the inline nav › marks the current page inline with
  full ink and an underline in the riviera theme`.
- [x] **AC-7:** Given `/booking/pay` reached through the dialog, in both auth states, when the
  header renders, then no header descendant's class list names `--riv-cta-grad` and no
  descendant's computed `background-image` equals the pay button's. *Seam:* computed styles ·
  *Pinned by:* `e2e/tourist-header.e2e.ts` › `no header control wears the CTA gradient on the
  pay page › signed out` and `… › signed in — the avatar included`.
- [x] **AC-8:** Given every header control, links included, when the phone sweep runs, then each
  declares `appTouchTarget` and measures ≥ 44 × 44. *Seam:* the rendered boxes · *Pinned by:*
  `e2e/touch-targets-tourist.e2e.ts` (the phone sweep, unchanged: it lays out the swatch, the
  hamburger and the sheet) + `e2e/tourist-header.e2e.ts` › `44px touch targets on the desktop
  bar, which the phone sweeps never lay out › signed out — the bar, then the menu popover` /
  `signed in — the bar, then the account popover` / `the theme picker open` +
  `app.spec.ts` › `every header link declares the touch floor, popovers and sheet open (signed
  in: %s) (#1002)` (class-list declaration for `<a>`, which `check-touch-target.mjs` never judges).

## Non-goals

- The phone bottom tab bar, its section marker, the checkout route flag, the `relative` phone
  top bar and the near-opaque bar token (#1003).
- Operator/admin chrome (`shellChrome() !== 'tourist'`).
- Token or palette changes; the brand block; the find modal's contents.
- A `role="menu"` — the popovers stay disclosures (the settled #351 posture).

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Desktop nav: Beaches, My bookings, exact-path `aria-current`, full-ink + underline marker | preserved | same links, same `EXACT_PATH`, same `cls.navLink` recipe, now with `appTouchTarget` |
| Desktop `Find a booking` button in the nav (`find-open`) | changed | a `find-open` row inside the account/menu popover; focus returns to the popover's trigger |
| Desktop `Register` link in the bar (`nav-register`, current under `?mode=register`) | changed | `Create an account` row (`nav-register`) in the signed-out popover, still current-marked by `authLinkCurrent` |
| Desktop `Sign in` link (`nav-signin`, current on the sign-in route) | preserved | same link, same marking, in the control cluster |
| `Signed in as <email>` chip (`nav-user`) opening the account menu | changed | avatar + handle chip (`nav-user`, `aria-label="Account: <email>"`); the full address moves into the popover's identity block |
| Account menu: `Your account` (current-marked), `Sign out`; Escape/backdrop/close-on-navigate; one popover at a time | preserved | same rows + identity block + `Find a booking`; same `accountOpen` machinery |
| Theme chip (swatch + label + caret) opening the three-option picker | changed | swatch-only button, same `theme-toggle` id and `Color theme: <name>` label, same popover |
| Hamburger (`menu-toggle`, `Menu`) with Beaches, My bookings, Find, auth group | preserved (reordered) | Beaches, My bookings, then the auth group with `Find a booking` inside it (H's sheet order) |
| Hamburger sheet: `Signed in as` line (`nav-user-mobile`) | changed | identity block (avatar, handle, full email) under the same test id |
| Hamburger sheet: `Register` (`nav-register-mobile`) | changed | `Create an account`, same id and marking |
| Hamburger sheet: three-dot theme block | dropped | the swatch is in the bar at every width (A-1); one control, one place |
| Auth controls hidden while `restoring()` | preserved | same guard around the desktop cluster and the sheet's auth group; `Find a booking` renders outside it |
| Sign-out parks focus on `<main>` | preserved | unchanged `signOut()` |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | An e2e that drove the retired controls (`find-open` in the nav, `nav-register` in the bar, `nav-user` text) goes red | high | med | each re-pointed in the same phase as the retirement; the mocked suite runs locally before push | this session | closed — every retired control re-pointed; full mocked suite 443/444 locally (the one failure an admin mail-delivery timing flake outside the diff, green alone), CI frontend job green on `fc4581c1` |
| R-2 | The `<a>` links stay `display: inline`, so `appTouchTarget` is a silent no-op and the sweep fails | med | med | every bar link gets `inline-flex items-center`; the phone sweep (`touch-targets-tourist.e2e.ts`) plus the desktop sweep in `tourist-header.e2e.ts` are the proof | this session | closed — both sweeps green (the desktop one added at the review gate, F-2) |
| R-3 | Two controls named `Menu` in the DOM (hamburger `sm:hidden`, desktop button `hidden sm:flex`) confuse a role locator | low | low | e2e locators key on test ids; `getByRole` skips CSS-hidden elements | this session | closed — no spec uses a `Menu` role locator; axe passes with both in the DOM |
| R-4 | The swatch ring reads under 3:1 on some stop (the swatch alone is 1.0–2.8:1) | low | high | `app.contrast.spec.ts` composites ink-soft over the header glass over every stop | this session | closed — spec green in all three themes; rendered ring pinned in `tourist-header.e2e.ts` |
| R-5 | Popover branches each declare a trigger ref; a ref used out of scope compiles to `undefined` and `openFind` records `null` | low | med | `app.spec.ts` asserts `document.activeElement` after dismiss in all three openers | this session | closed — the three focus-return tests and the e2e legs are green |

## Open questions / Assumptions

- **Assumption A-1:** the hamburger sheet's theme block is dropped because the swatch sits in
  the bar at every width (H's layout). — *Owner:* maintainer · *Resolves by:* PR review
  (flagged in the PR description).
- **Assumption A-2:** the brand block (wordmark + `Albanian Coast`) and the bar height stay as
  shipped; H's 56px bar is #1003's concern. — *Owner:* maintainer · *Resolves by:* PR review.
- **Assumption A-3:** the avatar fill is `--riv-solid-fill-brand`, not H's CTA gradient, because
  AC 7 forbids the gradient under the header. — *Owner:* this session · *Resolves by:* phase 1.

## Availability & concurrency (invariant #2)

N/A — does not affect availability; header structure only.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `frontend/src/app/app.html` + `app.ts` | existing | root shell component | signals (`menuOpen`, `themeOpen`, `accountOpen`, `findOpen`), `computed` (`activeTheme`, `authLinkCurrent`, new `handle`/`initial`) | none |
| FE-2 | `frontend/src/app/app.spec.ts`, `app.a11y.spec.ts`, `app.contrast.spec.ts` | existing | Vitest specs | — | — |
| FE-3 | `frontend/e2e/*.e2e.ts` + `e2e/support/` | existing + one new spec | mocked Playwright | — | — |

**Standards:** standalone, `inject()`, native control flow, `viewChild()` signal queries,
`host` bindings; no deviation.

## FE↔BE contract

N/A — no contract change.

## Sonar gate note

First analysis on `fc4581c1`: 0 issues, 0 duplicated blocks, new-code coverage **76.5%** → gate
ERROR on the 80% bar. The gap was branch coverage on `app.ts`, not lines (9/9 covered): the
`undefined` branches of the two address helpers (dead — a signed-in principal always has an
address) and the signed-out leg of `closeMenus` (`menuTrigger`), which no unit test walked.
Fix: the helpers take a `string` from one `address` computed, and `app.spec.ts` pins the
signed-out popover's Escape and backdrop close with focus return. Local lcov after the fix:
one uncovered new branch (the address fallback), 12/13 → ≈ 92%. Re-checked on the fix push —
see Execution status.

## Execution status

**Stage pointer:** review gate (reviewers 1, 2, 4, 5 reported and fixed — F-2..F-5; reviewer 3 pending) + sonar gate (F-1 fix pushed, awaiting the analysis of the current head) — PR #1004.

**Next action:** act on reviewer 3, post the review comment, confirm Sonar ≥ 80% on the final head, then the merge close-out.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | `0439930e` |
| 1 + 2 — AC 1, 2, 4, 5: two destinations, Sign in + Menu, account chip, Find a booking from the menus (one commit: the template cannot be rebuilt in halves, so both phases' red tests preceded one green) | ✅ | `c7c914b6` |
| 3 — AC 3, 6, 7, 8: swatch + ring, riviera marker, no CTA skin, touch floor | ✅ | (this commit) |
| 4 — gates (`main` unchanged, nothing to merge); Sonar coverage fix | ⏳ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar | new-code coverage 76.5% < 80% on `fc4581c1`: dead `undefined` branches in the address helpers, signed-out `closeMenus` leg untested | fixed-in-`82ebe1d7` (one `address` computed, string-only helpers; Escape/backdrop close test) |
| F-2 | review (RV-FE-7) | the touch-target sweeps run at phone width only, so the desktop-only controls (swatch, Sign in, menu button, chip, popover rows) were never measured; the plan doc claimed the phone sweep was re-pointed | fixed — desktop-width sweep in `tourist-header.e2e.ts`, plan doc corrected (this commit) |
| F-3 | review (prior PR #895 recurrence) | plan-doc *Pinned by* citations paraphrased test titles instead of quoting them | fixed-in-`85841c07` |
| F-4 | review (locator style) | `headerMenuTrigger` used a raw CSS attribute union where the file uses `getByTestId` | fixed-in-`85841c07` (`getByTestId(...).or(...)`) |
| F-5 | review (comment accuracy) | `accountOpen`/`toggleAccountMenu` TSDoc still said "signed-in" though the signal now drives the signed-out menu too; a spec comment cited the retired `riv-mobile-theme` block; the link-floor helper's comment read as its own opposite; the swatch's "1.0–2.8:1" range was not reproducible (only the 1.0 floor is) | fixed (this commit) |

---

## File structure

- `docs/plans/tourist-header-destinations.md` — this plan
- `frontend/src/app/app.html` — the rebuilt tourist header
- `frontend/src/app/app.ts` — `openFind(trigger)`, `handle`/`initial`, the desktop menu trigger ref, class recipes
- `frontend/src/app/app.spec.ts` — AC 1, 2, 3, 4, 5, 8 unit pins; retired-control tests re-pointed
- `frontend/src/app/app.a11y.spec.ts` — axe over the account/menu popovers in both auth states
- `frontend/src/app/app.contrast.spec.ts` — the swatch ring and the avatar initial
- `frontend/e2e/tourist-header.e2e.ts` — AC 7 on `/booking/pay`; the swatch ring's rendered box-shadow; the desktop-width touch-target sweep (AC 8)
- `frontend/e2e/current-page-marker.e2e.ts` — AC 6 riviera leg; `Create an account` row
- `frontend/e2e/find-a-booking.e2e.ts` — opens via the menu in both auth states, focus return
- `frontend/e2e/theme-shell.e2e.ts` — phone theme pick from the bar swatch; identity block
- `frontend/e2e/customer-password.e2e.ts` — signed-in proof via the chip's accessible name
- `frontend/e2e/unified-auth.e2e.ts` — register via the menu popover
- `frontend/e2e/customer-auth.e2e.ts` — comments naming the retired Register link
- `frontend/e2e/support/shell.ts` — `openFindBooking` helper; `openAccountMenu` unchanged
- `frontend/e2e/support/pages/customer-auth.page.ts` — `registerLink` behind the menu, `expectSignedInAs` on the accessible name
- `frontend/src/app/shared/cta-border-token.contrast.spec.ts` — the sweep-precision control literal moved with the chip glass from `app.html` to `app.ts`

---

## Phase 1 — AC 1, 4, 5: the structural change

**Files:** Modify `frontend/src/app/app.html`, `app.ts`, `app.spec.ts`; re-point
`e2e/unified-auth.e2e.ts`, `e2e/customer-password.e2e.ts`, `e2e/theme-shell.e2e.ts`,
`e2e/current-page-marker.e2e.ts`, `e2e/support/pages/customer-auth.page.ts`.

- [ ] Red: `app.spec.ts` — exactly two primary links; signed-out `nav-signin` href +
  `aria-current` on the sign-in route and a `nav-menu` button named `Menu` opening a popover with
  `nav-register` (`/account/sign-in?mode=register`); signed-in `nav-user` chip named
  `Account: <email>` with the handle as text, no `Signed in as`, popover with identity block,
  `nav-account-link`, `nav-signout`; `/venues/1` lights nothing.
- [ ] `npx ng test --watch=false --include='src/app/app.spec.ts'` → FAIL.
- [ ] Green: rebuild the header; keep `.riv-nav-desktop`, `riv-account-pop`, `riv-theme-pop`
  markers.
- [ ] Re-point the e2e listed above; run the touched mocked specs with
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts <files>`.
- [ ] Commit `Cut the tourist primary nav to two destinations (#1002)`; update Execution status.

## Phase 2 — AC 2: Find a booking from the menus

- [ ] Red: three `app.spec.ts` tests asserting `document.activeElement` after `find-close` for
  the chip, the menu button and the hamburger; `find-open` absent from the primary nav.
- [ ] Green: `openFind(trigger: HTMLElement)` with `findReturn = trigger`; the popover rows and
  the sheet row pass their branch's trigger ref.
- [ ] `e2e/find-a-booking.e2e.ts`: `openFindBooking` helper (desktop, either auth state) + a
  signed-in case with focus return; `touch-targets-tourist.e2e.ts` unchanged (it still drives
  `find-open-mobile`).
- [ ] Commit `Move Find a booking into the header menus (#1002)`.

## Phase 3 — AC 3, 6, 7, 8: seams and contrast

- [ ] Red: `app.spec.ts` swatch name + empty text + every header `<a>` carries `min-h-11`;
  `app.contrast.spec.ts` ring ≥ 3:1 per theme + avatar initial AA on `--riv-solid-fill-brand`;
  `app.a11y.spec.ts` popovers open in both auth states.
- [ ] Green: the swatch button (`before:` swatch + ring), `appTouchTarget` on every link.
- [ ] e2e: `current-page-marker.e2e.ts` riviera leg; new `tourist-header.e2e.ts` (AC 7 on
  `/booking/pay`, both auth states; the ring's computed `box-shadow`); `theme-shell.e2e.ts`
  phone theme pick.
- [ ] Commit `Demote the theme chip to a ringed swatch (#1002)`.

## Phase 4 — integration and gates

- [ ] `git merge origin/main`; `npm run lint`, `npm run format:check`, `npm test`, the mocked
  e2e; `node scripts/check-*.mjs` guards; push; mark ready for review; review gate; Sonar.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-07 | phase 3 (chip glass recipe hoisted to `app.ts`) | every spec asserting a literal's presence in a named shell file | `grep -rn "path: 'app" frontend/src --include=*.spec.ts` | 1 (`cta-border-token.contrast.spec.ts` OUT_OF_FAMILY) | re-pointed to `app.ts`, chip highlight restored in the CHIP recipe |
| 2026-09-07 | phase 1 (retired test ids) | every spec/e2e reading a header test id or marker class | `grep -rn -E "find-open\|nav-user\|nav-signin\|nav-register\|riv-nav-desktop\|Signed in as\|riv-mobile-theme-label" frontend/e2e frontend/src --include=*.ts` | 12 files | re-pointed in phases 1–3 (parity ledger) |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..5, 8 (unit):** `npx ng test --watch=false --include='src/app/app*.spec.ts'` → 71 passed.
- [x] **AC-2, 6, 7, 8 (e2e):** the touched mocked specs → 95 + 56 passed locally; the full suite and CI follow in phase 4.

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
