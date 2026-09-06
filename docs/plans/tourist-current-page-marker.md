# Tourist current-page marker (#984) Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** On a touch device, where no `hover:` recipe can ever paint, the tourist header marks
the current page with `aria-current="page"` and a visible token-styled marker in both the inline
nav (tablets) and the hamburger sheet (phones), and Sign in / Register never light together.

**Architecture:** The plain-path links (Beaches, My bookings, Your account) take
`routerLinkActive` + `ariaCurrentWhenActive="page"` with path-exact, query-params-ignored
matching, so `/` lights only at the root and a `returnUrl` does not unlight Your account. The
Sign in / Register pair shares one URL and differs only by `mode=register`, which
`routerLinkActive` cannot key on (subset matching lights both, exact matching unlights Sign in
under a `returnUrl`), so the pair is a `computed()` over Angular 22's `isActive()` signal and
`Router.lastSuccessfulNavigation()`. The marker paints through the `aria-[current=page]` compound
selector — the operator-console and admin-tabs precedent — with tokens only; the inline underline
is drawn in the link's own ink (`decoration-current`), since `--riv-accent-ink` has no riviera
override and would sit at ~1.6:1 on that theme's dark header glass.

**Persistence:** JDBC only (invariant #1). No tables or migrations — the slice is the Angular app
shell and its specs.

**Source of intent:** GitHub issue #984.

**Skills consulted:** `riviera-sdlc` (routing — entered late: the fix was built before the gate
had run in full. `riviera-frontend`, `riviera-tailwind` and `riviera-local-debug` were loaded
before the first edit; `angular-developer` + the angular-cli MCP, `playwright-cli` and `tdd` were
loaded at plan time, after the first implementation, and the shipped code was re-checked against
each — an RV-PROC-1 miss, recorded here rather than papered over; the re-check changed nothing)
· `riviera-plan-doc` (this template — forced every AC onto a named seam and the two
generalization sweeps below) · `tdd` (three shell specs red first — 3 failed / 36 passed — then
green; the e2e proof run against the pre-fix shell fails 4 of 4) · `riviera-review-overlay`
(review gate — ran at ready-for-review over the verified range; F-1 and F-2 came out of it and were
fixed test-first, then the fix re-walked RV-FE-7 and RV-FE-E2E) · `riviera-docs-freshness` (`N/A — no substrate doc states
the tourist header's nav cues or the shell's route-state mechanism`; re-checked at close-out)
· `riviera-frontend` (the shell stays in `app.ts`/`app.html`; the proof lands in the mocked
CI-safe e2e suite, not `real-backend/`) · `riviera-tailwind` (tokens only, no theme named in the
component; `hover:` compiles under `@media (hover: hover)` — the premise; a contrast pair for
the new ink-on-fill pairing in all three themes; the hover and current utilities set the same
value so stylesheet order is moot) · `angular-developer` + angular-cli MCP (`get_best_practices`:
signals, `computed()`, class bindings, no decorators; `search_documentation` v22 verified
`RouterLinkActive`, `ariaCurrentWhenActive`, `IsActiveMatchOptions`, the `isActive()` function and
`Router.lastSuccessfulNavigation`) · `playwright-cli` (mocked suite via `page.route`; device
emulation by `viewport` + `hasTouch` + `isMobile` rather than `devices['iPhone …']`, whose
`defaultBrowserType` would switch the project off Chromium) · `riviera-local-debug` (unshallowed
the clone; `ng test --include` for the scoped unit run; `PW_CHROMIUM_EXECUTABLE` for the mocked
e2e). No `postgres`, `riviera-modulith`, `riviera-java-conventions` or `riviera-stripe-payments`
row fires: the diff holds no SQL, no Java and no money.

**Branch:** `claude/mobile-routing-tourists-yo4n29` (the cloud session's designated branch
stands in for `bugfix/tourist-current-page-marker`)

---

## Acceptance criteria (testable)

The frontend seam for AC-1 to AC-3 is the app shell rendered under a real router
(`provideRouter` with blank test routes): the `aria-current` attribute on the header's nav
anchors, desktop nav and mobile sheet, observed through the DOM after a navigation. AC-4's seam
is the token maths in `testing/glass-tokens.ts`; AC-5's is the served app in Chromium under
touch emulation.

- [x] **AC-1:** Given the shell at `/my-bookings`, when the header renders (and the hamburger
  sheet is opened), then the desktop and mobile My bookings links carry `aria-current="page"`
  and the Beaches links do not; given a signed-in tourist at `/account/password`, the Your
  account link is current in the account popover and in the sheet. *Seam:* the shell's header
  DOM under `provideRouter` · *Pinned by:* `app.spec.ts` ›
  `marks the current page in the desktop nav and the mobile menu (touch has no hover)` and
  `marks Your account current in the account menu and the mobile sheet on the account page`
- [x] **AC-2:** Given the shell at `/`, then Beaches is current; given a page the nav does not
  list, then no nav anchor carries `aria-current`. *Seam:* as AC-1 · *Pinned by:*
  `app.spec.ts` › `marks Beaches current at the root only, and nothing on a page the nav does not list`
- [x] **AC-3:** Given `/account/sign-in?mode=register`, then Register is current and Sign in is
  not; given `/account/sign-in?returnUrl=/my-bookings`, then Sign in is current and Register is
  not, desktop and mobile. *Seam:* as AC-1 · *Pinned by:* `app.spec.ts` ›
  `never marks Sign in and Register current together: the mode query param decides`
- [x] **AC-4:** Given the popover accent ink over the hover fill over the popover surface, then
  the pair meets WCAG AA (4.5:1) over the darkest riviera stop and every dark-theme stop.
  *Seam:* `testing/glass-tokens.ts` token mirrors + `testing/contrast.ts` · *Pinned by:*
  `app.contrast.spec.ts` › `the mobile menu's current-page row (pop-accent on the hover fill) meets AA in every theme`
- [x] **AC-5:** Given a 390 px phone and an 820 px tablet with touch, then
  `matchMedia('(hover: hover)').matches` is false, the current link carries the marker, and its
  computed colour / underline / weight / fill differ from the inactive link's — and all four
  checks fail on the pre-fix shell; and the signed-in account popover's current row renders the
  accent ink on the hover fill. *Seam:* the served app in Chromium (`page.route`-mocked
  API) · *Pinned by:* `e2e/current-page-marker.e2e.ts` (5 tests)

## Non-goals

- The operator console tabs and admin console tabs: they already carry `routerLinkActive` +
  `aria-current` styled through the same compound selector.
- The operator chrome's Sign in link and the admin console's Sign in link: a sign-in link is not
  a current-page candidate, and its `hover:underline` stays.
- The Find a booking and theme buttons: not routes, no marker.
- Removing the `hover:` recipes: they still serve pointer devices.
- Moving the shell's `routeChrome`, the operator surfaces or the admin console off
  `NavigationEnd` event streams onto router signals — follow-ups #981, #982, #983.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior, replaces nothing. Every link keeps its target, its hover recipe and its
click handler; the marker is additive.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | `routerLinkActive`'s default subset match lights Beaches (`/`) on every page | high | med | path-exact, query-params-ignored `IsActiveMatchOptions` on every plain-path link; AC-2 | agent | closed — 6f64010 |
| R-2 | Sign in lights under `?mode=register` (subset) or unlights under a `returnUrl` (exact) | high | med | the pair is a `computed()` keyed on `mode`; AC-3 | agent | closed — db53178 |
| R-3 | `RouterLinkActive` sets `aria-current` in a `queueMicrotask`, so a link created after the navigation (the sheet) is unmarked on the first `detectChanges` | high | low | the spec awaits `whenStable()` after opening the sheet; the e2e uses auto-retrying `expect` | agent | closed — 6f64010 |
| R-4 | Popover accent ink over the hover fill could miss AA in the dark theme | low | high | AC-4 contrast pair over every stop, both themes | agent | closed — 6f64010 |
| R-5 | The accent underline token is themed for dark only: on riviera it stays `#085a6e` over dark navy header glass (~1.6:1), so the marker's underline vanishes there | high | med | review finding F-2: the underline takes the link's own ink (`decoration-current`), which the existing ink-on-header-glass pairs already prove AA in all three themes; the e2e pins `text-decoration-color` = the porcelain ink | agent | closed — review-fix commit |
| R-6 | The signal form reads `mode` from a source that could lag the path test (`isActive()`) | low | med | both read `lastSuccessfulNavigation().finalUrl`; the router sets that signal on the line before it emits `NavigationEnd`, after `routerState` is assigned (verified in `@angular/router` 22.1.4) | agent | closed — db53178 |
| R-7 | Skill-routing gate ran partially before the first edit (RV-PROC-1) | — | low | recorded in *Skills consulted*; the late-loaded skills were used to re-check the shipped code and changed nothing | agent | closed — this plan |

## Open questions / Assumptions

None open.

### Resolved

- **Open question:** event-stream `toSignal` (the file's existing `routeChrome` idiom) or the
  Angular 22 signal form for the auth pair? — *Resolved:* signal form, per the maintainer's
  stated preference; the rest of the file follows in #981. Commit db53178.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice touches only the header's navigation cues; no
booking, availability or beach-map path is read or written.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only.

### Module ownership (§4a)

N/A — frontend-only; no backend capability is added or moved.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `app.ts` / `app.html` (the app shell) | existing | standalone component | `routerLinkActive` on the plain-path links; `computed()` over `isActive()` + `Router.lastSuccessfulNavigation()` for the auth pair | none |
| FE-2 | `app.spec.ts` | existing | Vitest/jsdom spec under `provideRouter` | — | — |
| FE-3 | `app.contrast.spec.ts` | existing | pure contrast maths | — | — |
| FE-4 | `e2e/current-page-marker.e2e.ts` | new | mocked Playwright spec (CI-safe suite) | — | — |

**Standards:** standalone components, `inject()`, `@if`/`@for`, signal APIs. No deviation.

## FE↔BE contract

N/A — no contract change.

## Execution status

**Stage pointer:** `DONE — merged via PR #985`

**Next action:** none — the close-out is written here; at the next close-out this plan is
retired (`riviera-docs-freshness` § *Plan-doc retirement*).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Unit specs red → green (AC-1..3), contrast pair (AC-4), the fix | ✅ | 6f64010 |
| 1 — Browser proof on emulated phone + tablet (AC-5), negative run on the pre-fix shell | ✅ | 6f64010 |
| 2 — Auth pair on router signals (maintainer preference) | ✅ | db53178 |
| 3 — Plan doc, issue #984, draft PR | ✅ | 963a0c0 |
| 4 — Review gate (F-1, F-2 fixed), Sonar gate, close-out | ✅ | review-fix commit (the last code-touching commit of PR #985) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (in-code-comment pass; scored 75) | The desktop account popover's Your account link received `aria-current` but its `POP_ITEM` skin had no current-page styling, unlike the sheet row; no spec pinned the account links | fixed — `CURRENT_POP_ROW` shared by both skins; unit spec + tablet e2e pin it |
| F-2 | review (in-code-comment pass; scored 55, verified by hand) | `decoration-riv-accent-ink` on the header: the token has no riviera override, ~1.6:1 on that theme's header glass | fixed — `decoration-current`; e2e pins the ink as the underline colour |
| S-1 | sonar | Quality gate passed on the API: 0 open issues, 99 new lines, 100 % new-code coverage, 0 duplicated blocks; the SonarCloud Code Analysis check concluded success | clear |

---

## File structure

- `frontend/src/app/app.ts` — the shell: `RouterLinkActive` import, the exact-path match options, the current-page utilities on the nav and sheet skins, the auth-pair `computed()`.
- `frontend/src/app/app.html` — `routerLinkActive` + `ariaCurrentWhenActive` on Beaches / My bookings / Your account (desktop and sheet); `[attr.aria-current]` on Sign in / Register from the computed.
- `frontend/src/app/app.spec.ts` — the three current-page specs (AC-1..3) and the `my-bookings` test route.
- `frontend/src/app/app.contrast.spec.ts` — the accent-on-hover-fill pair (AC-4).
- `frontend/e2e/current-page-marker.e2e.ts` — the phone + tablet proof (AC-5).
- `docs/plans/tourist-current-page-marker.md` — this plan.

---

## Phase 0 — Unit specs red → green, contrast pair, the fix

**Files:** Modify `frontend/src/app/app.ts` · Modify `frontend/src/app/app.html` · Test `frontend/src/app/app.spec.ts` · Test `frontend/src/app/app.contrast.spec.ts`

- [x] **Step 1: Write the failing tests** — the three specs named in AC-1..3, sharing one helper:

```ts
function current(el: HTMLElement, scope: string, link: string): boolean {
  return el.querySelector(scope)?.querySelector(link)?.getAttribute('aria-current') === 'page';
}
```

- [x] **Step 2: Run it, verify it fails** — `npx ng test --watch=false --include="src/app/app.spec.ts"` → 3 failed / 36 passed, each on `expected false to be true` at the first `aria-current` assertion.

- [x] **Step 3: Minimal implementation** — `routerLinkActive ariaCurrentWhenActive="page" [routerLinkActiveOptions]="exactPath"` on the plain-path links, with

```ts
const EXACT_PATH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};
```

and the auth pair's marker from the `mode` query param; the `aria-[current=page]:` utilities on `navLink` and `MOBILE_ITEM`.

- [x] **Step 4: Run it, verify it passes** — same command → 39 passed. Full suite `npx ng test --watch=false` → 224 files / 2553 tests passed.

- [x] **Step 5: Generalization-audit pass** — see the log.

- [x] **Step 6: Commit** — `6f64010 Mark the current page in the tourist header on touch devices` (the subject predates #984; the issue is referenced from this plan and the PR)

- [x] **Step 7: Update plan-doc execution status** — this doc (phase 3).

## Phase 1 — Browser proof (AC-5)

**Files:** Create `frontend/e2e/current-page-marker.e2e.ts`

- [x] **Step 1: Write the test** — two `describe`s, `test.use({ viewport, hasTouch: true, isMobile: true })` at 390×844 and 820×1180; each asserts `matchMedia('(hover: hover)').matches === false` first, then the marker's `aria-current` and computed styles.
- [x] **Step 2: Run it against the pre-fix shell** — `git stash push -- src/app/app.ts src/app/app.html` then `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/current-page-marker.e2e.ts` → 4 failed, every one on `aria-current` absent.
- [x] **Step 3: Run it with the fix** — same command → 4 passed; with `theme-shell`, `touch-targets-tourist`, `my-bookings`, `customer-auth`, `unified-auth` → 48 passed.
- [x] **Step 4: Commit** — in `6f64010`.

## Phase 2 — Auth pair on router signals

**Files:** Modify `frontend/src/app/app.ts`

- [x] **Step 1: Re-express** `authLinkCurrent` as `computed()` over `isActive('/account/sign-in', router, EXACT_PATH)` and `router.lastSuccessfulNavigation()?.finalUrl?.queryParamMap.get('mode')`; AC-3's spec is the bar (unchanged).
- [x] **Step 2: Verify** — `app.spec.ts` 39 passed; lint (after swapping `queryParams['mode']`, typed `any`, for `queryParamMap.get`), format, inline-comment guard clean; marker + auth e2e 17 passed.
- [x] **Step 3: Commit** — `db53178 Derive the Sign in / Register marker from router signals`

## Phase 3 — Plan doc, issue, draft PR

- [x] Issue #984 filed; follow-ups #981 / #982 / #983 filed for the remaining `NavigationEnd` signals.
- [x] This plan committed; `node scripts/check-plan-file-structure.mjs --diff origin/main` green.
- [x] Draft PR opened; PR activity subscribed.

## Phase 4 — Review gate, Sonar gate, close-out

- [x] `origin/main` unchanged since the branch point (no merge-in needed); marked ready for review.
- [x] Review gate per `references/pr-gates.md` §1: range `53c732c7..963a0c01` verified by `check-review-range.mjs` against the PR (6 files, +549/−9); `code-review:code-review` rung 1 with the overlay's RV-FE-1/7/E2E/8/9, RV-STYLE-1/2, RV-PROC-1 walked; five reviewers, two findings (F-1, F-2), both fixed test-first; re-review of the fix commit re-walked RV-FE-7 (tokens only, the pairing already proven) and RV-FE-E2E (the new spec in the mocked suite).
- [x] Sonar gate per §2: S-1 above, read from `api/issues/search` and `api/measures/component`.
- [x] Close-out per §3, written in this, the last code-touching commit; `merged via PR #985`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-06 | 6f64010 / phase 0 | Navigation links in a shared chrome whose only cue is a `hover:` utility (compiled under `(hover: hover)`) | `grep -rn "routerLink" frontend/src/app/app.html frontend/src/app/operator/operator-chrome.ts frontend/src/app/admin/admin-console.ts frontend/src/app/operator/operator-console.html frontend/src/app/admin/admin-console-tabs.ts` | tourist header (7 links, no marker); operator-console tabs and admin tabs (`routerLinkActive` + `aria-current` already); operator chrome and admin console (a brand link and a Sign in link only) | fix the tourist header; the rest need nothing |
| 2026-09-06 | review fix / phase 4 | A `--riv-accent-ink` consumer painted on a surface that is dark in riviera (the token has no riviera override) | `grep -rl "riv-accent-ink" frontend/src/app` (120 hits in 4 source files + specs), then the files that also paint a riviera-dark surface: `grep -l "riv-header-glass\|riv-hero\|riv-blob\|riv-bg\b"` over them — `home.html`, `venue-map.html`, `operator-password.ts` | the header nav underline (this diff); `home.html`'s result count and from-prices sit on card glass (proven by `home.contrast.spec.ts` › `accent ink … meets AA on the card glass`); `venue-map.html`'s free count sits on panel glass; the operator page is porcelain-pinned; `home.html`'s three hero filter controls draw a `focus-visible` ring in accent ink, 2 px offset onto the riviera scrim — unproven, pre-existing | fix the header underline (`decoration-current`); the hero focus ring → #986 |
| 2026-09-06 | db53178 / phase 2 | Route state derived from a `toSignal` over `NavigationEnd` events where a router signal now exists | `grep -rl NavigationEnd frontend/src/app --include=*.ts \| grep -v spec` | `app.ts` (routeChrome + the overlay-id skip), `operator-chrome.ts`, `operator-console.ts`, `admin-console.ts`, `admin-console-tabs.ts`, `find-booking.ts` (a comment only) | auth pair migrated here; the rest deferred → #981 (shell + shared helper), #982 (operator), #983 (admin); the overlay-id skip stays event-driven by design |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3:** Run `cd frontend && npx ng test --watch=false --include="src/app/app.spec.ts"` → 40 passed. Verified at the review-fix commit.
- [x] **AC-4:** Run `cd frontend && npx ng test --watch=false --include="src/app/app.contrast.spec.ts"` → passed. Verified at 6f64010.
- [x] **AC-5:** Run `cd frontend && PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test --config playwright.a11y.config.ts e2e/current-page-marker.e2e.ts` → 5 passed (4 of the original 4 failed with `app.ts`/`app.html` stashed; the two review-fix checks failed before the fix). Verified at the review-fix commit.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — not touched.
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11) — N/A, frontend-only.
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9) — N/A.
- [x] Refund policy enforced server-side (invariant #10) — not touched.
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — not touched.
- [x] Booking codes unguessable (invariant #7) — not touched.
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12) — no schema change.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR, in its last code-touching commit** — this commit, citing `merged via PR #985`.
- [x] **The review gate ran in full** — rung 1 (`code-review:code-review`) plus `riviera-review-overlay`, range verified off the PR; findings F-1 and F-2 fixed in the loop.
