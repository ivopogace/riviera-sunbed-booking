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

- [ ] **AC-1:** Given the tourist chrome, when the shell renders, then
  `nav[aria-label="Primary"]` contains exactly two links, `Beaches` → `/` and `My bookings` →
  `/my-bookings`, and no `Find a booking` control anywhere in the primary nav. *Seam:* the
  rendered shell (`App` host DOM) · *Pinned by:* `app.spec.ts` › `renders exactly two primary
  destinations, Beaches and My bookings (#1002)`.
- [ ] **AC-2:** Given either auth state at either breakpoint, when `Find a booking` is activated
  from the header popover (account menu signed in, menu button signed out) or the hamburger
  sheet, then `app-find-booking` opens, the popover/sheet closes, and dismissing the modal
  returns focus to that popover's persistent trigger. *Seam:* the shell DOM +
  `document.activeElement` · *Pinned by:* `app.spec.ts` › `Find a booking from the account menu
  returns focus to the chip on dismiss (#1002)`, `… from the signed-out menu returns focus to
  the menu button …`, `… from the mobile menu returns focus to the hamburger …`;
  `e2e/find-a-booking.e2e.ts` opening via the menu signed out and signed in.
- [ ] **AC-3:** Given the bar, when the theme control renders, then it is a button with no
  visible text whose accessible name is `Color theme: <active theme>`, opening the unchanged
  three-option popover; its swatch carries a 1.5px `--riv-ink-soft` ring that composites to
  ≥ 3:1 against the header glass at the worst stop of every theme. *Seam:* the shell DOM for the
  name; `testing/contrast.ts` maths for the ring · *Pinned by:* `app.spec.ts` › `the theme
  control is a swatch-only button named for the active theme (#1002)`, `app.a11y.spec.ts`
  (open picker, both auth states), `app.contrast.spec.ts` › `the swatch ring (ink-soft) clears
  3:1 against the header glass in every theme (#1002)`.
- [ ] **AC-4:** Given signed out, when the shell renders, then the bar holds a `Sign in` link
  (`href="/account/sign-in"`, `aria-current="page"` on the sign-in route via `authLinkCurrent`)
  and a separate button named `Menu` whose popover holds `Create an account`
  (`/account/sign-in?mode=register`) and `Find a booking`; given signed in, the bar holds one
  control — the avatar + handle chip, accessible name `Account: <email>` — whose popover holds
  the identity block with the full address, `Your account`, `Find a booking`, `Sign out`; the
  text `Signed in as` appears nowhere in the bar. *Seam:* the shell DOM · *Pinned by:*
  `app.spec.ts` › `signed out: a Sign in link plus a Menu button (#1002)`, `signed in: one
  account chip opening the account menu (#1002)`, `never marks Sign in and Create an account
  current together`.
- [ ] **AC-5:** Given `/venues/1` (or any page the nav does not list), when the desktop nav
  renders, then no link carries `aria-current`; `Beaches` is current at `/` only. *Seam:*
  `routerLinkActive` with `EXACT_PATH` · *Pinned by:* `app.spec.ts` › `marks Beaches current at
  the root only, and nothing on a page the nav does not list` (existing, extended to a
  `/venues/1` route).
- [ ] **AC-6:** Given the riviera theme on a touch tablet, when `/my-bookings` renders, then the
  current link is full ink (`rgb(255, 255, 255)`) with an underline in that same ink — never the
  accent ink. *Seam:* computed styles in a real browser · *Pinned by:*
  `e2e/current-page-marker.e2e.ts` › `marks the current page inline with full ink and an
  underline in the riviera theme (#1002)`.
- [ ] **AC-7:** Given `/booking/pay` reached through the dialog, in both auth states, when the
  header renders, then no header descendant's class list names `--riv-cta-grad` and no
  descendant's computed `background-image` equals the pay button's. *Seam:* computed styles ·
  *Pinned by:* `e2e/tourist-header.e2e.ts` › `no header control wears the CTA gradient on the
  pay page (#1002)`.
- [ ] **AC-8:** Given every header control, links included, when the phone sweep runs, then each
  declares `appTouchTarget` and measures ≥ 44 × 44. *Seam:* the rendered boxes · *Pinned by:*
  `e2e/touch-targets-tourist.e2e.ts` (existing sweep, the menu case re-pointed) +
  `app.spec.ts` › `every header link declares the touch floor (#1002)` (class-list declaration
  for `<a>`, which `check-touch-target.mjs` never judges).

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
| R-1 | An e2e that drove the retired controls (`find-open` in the nav, `nav-register` in the bar, `nav-user` text) goes red | high | med | each re-pointed in the same phase as the retirement; the mocked suite runs locally before push | this session | open |
| R-2 | The `<a>` links stay `display: inline`, so `appTouchTarget` is a silent no-op and the sweep fails | med | med | every bar link gets `inline-flex items-center`; the phone sweep (`touch-targets-tourist.e2e.ts`) is the proof | this session | open |
| R-3 | Two controls named `Menu` in the DOM (hamburger `sm:hidden`, desktop button `hidden sm:flex`) confuse a role locator | low | low | e2e locators key on test ids; `getByRole` skips CSS-hidden elements | this session | open |
| R-4 | The swatch ring reads under 3:1 on some stop (the swatch alone is 1.0–2.8:1) | low | high | `app.contrast.spec.ts` composites ink-soft over the header glass over every stop | this session | open |
| R-5 | Popover branches each declare a trigger ref; a ref used out of scope compiles to `undefined` and `openFind` records `null` | low | med | `app.spec.ts` asserts `document.activeElement` after dismiss in all three openers | this session | open |

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

## Execution status

**Stage pointer:** plan → implement (phase 1).

**Next action:** phase 1 red tests in `app.spec.ts` (AC 1, 4, 5).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc | ✅ | |
| 1 — AC 1, 4, 5: two destinations, Sign in + Menu, account chip | | |
| 2 — AC 2: Find a booking from the menus, opener-set return | | |
| 3 — AC 3, 6, 7, 8: swatch + ring, riviera marker, no CTA skin, touch floor | | |
| 4 — merge `main`, gates | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|

---

## File structure

- `docs/plans/tourist-header-destinations.md` — this plan
- `frontend/src/app/app.html` — the rebuilt tourist header
- `frontend/src/app/app.ts` — `openFind(trigger)`, `handle`/`initial`, the desktop menu trigger ref, class recipes
- `frontend/src/app/app.spec.ts` — AC 1, 2, 3, 4, 5, 8 unit pins; retired-control tests re-pointed
- `frontend/src/app/app.a11y.spec.ts` — axe over the account/menu popovers in both auth states
- `frontend/src/app/app.contrast.spec.ts` — the swatch ring and the avatar initial
- `frontend/e2e/tourist-header.e2e.ts` — AC 7 on `/booking/pay`; the swatch ring's rendered box-shadow
- `frontend/e2e/current-page-marker.e2e.ts` — AC 6 riviera leg; `Create an account` row
- `frontend/e2e/find-a-booking.e2e.ts` — opens via the menu in both auth states, focus return
- `frontend/e2e/theme-shell.e2e.ts` — phone theme pick from the bar swatch; identity block
- `frontend/e2e/touch-targets-tourist.e2e.ts` — the menu/find case re-pointed
- `frontend/e2e/customer-password.e2e.ts` — signed-in proof via the chip's accessible name
- `frontend/e2e/unified-auth.e2e.ts` — register via the menu popover
- `frontend/e2e/support/shell.ts` — `openFindBooking` helper; `openAccountMenu` unchanged
- `frontend/e2e/support/pages/customer-auth.page.ts` — `registerLink` behind the menu, `expectSignedInAs` on the accessible name

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
  signed-in case with focus return; `touch-targets-tourist.e2e.ts` menu case re-pointed.
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
| 2026-09-07 | phase 1 (retired test ids) | every spec/e2e reading a header test id or marker class | `grep -rn -E "find-open\|nav-user\|nav-signin\|nav-register\|riv-nav-desktop\|Signed in as\|riv-mobile-theme-label" frontend/e2e frontend/src --include=*.ts` | 12 files | re-pointed in phases 1–3 (parity ledger) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1..5, 8 (unit):** `npx ng test --watch=false --include='src/app/app*.spec.ts'` → PASS.
- [ ] **AC-2, 6, 7, 8 (e2e):** the mocked suite → PASS locally and in CI.

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
