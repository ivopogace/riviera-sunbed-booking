# O1 — Operator Console Shell (porcelain glass chrome, tabbed nav, sign-in gate) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox (`- [ ]`) syntax.
> This is the **foundation slice of epic #141** (Liquid Glass operator console) and the **reference
> plan for O2–O8** — the follow-up slices restyle/build one tab each on top of this shell.

**Goal:** Ship an additive, porcelain-light **operator console** at `/operator/:venueId` — a glass
chrome (sticky header + six pill tabs with a live Requests badge) gated by a restyled glass sign-in
card — without touching, restyling, or regressing the two existing legacy operator surfaces
(`/venue-admin`, `/venue-admin/daily/:venueId`), which stay fully functional and reachable.

**Architecture:** The single most significant decision — **the console is additive, not a takeover.**
It is a new `operator/` feature folder with a layout component (`OperatorConsole`) at a new
`/operator/:venueId` route tree; the six tabs are **child routes** so each future slice (O3–O8) owns
its tab's route+component independently and deep-links/redirects land precisely. In O1 every tab body
is a lightweight **placeholder** that forward-links to the surviving legacy surface; **no legacy route
is redirected or has its `legacySurface` flag removed** (scope guardrail). The console renders
**always-porcelain** by scoping `data-riv-theme="porcelain"` on its own root element — the `--riv-*`
tokens are attribute-scoped in `styles.scss`, so they re-scope for the console subtree **without
mutating `ThemeService`** (the tourist theme choice is untouched). The tourist app shell (`app.ts`)
suppresses its own header/nav/footer for `/operator/**` via a route-data flag, mirroring its existing
`legacySurface` `NavigationEnd` computation.

**Persistence:** N/A — frontend-only slice. No Flyway migration, no DB write, no table touched
(invariant #1 not in play here).

**Source of intent:** GitHub issue **#170** (epic **#141**). Design: `docs/design/riviera-operator-console-v2.dc.html`
(look/copy/interaction only — the script block is demo logic, never behavior) + intake note
`docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted (Skill-routing gate):**
- `riviera-sdlc` — orchestration; Issue-intake grill gate run against current code (3 product decisions escalated + resolved).
- `riviera-plan-doc` — this plan-doc discipline.
- `riviera-frontend` — **placement**: new `operator/` feature folder; routes stay in the flat `app.routes.ts`; the porcelain-scoping token rule; the two-suite e2e split (CI-safe mocked in `frontend/e2e/`).
- `angular-developer` + **angular-cli MCP** (`list_projects` → Angular **v22**; `get_best_practices`) — v22 idioms: standalone default, signals, `@Service`, `inject()`, `input()`/`output()`, native control flow, no explicit `OnPush`, Signal Forms; mandatory a11y (AXE, WCAG AA).
- `playwright-cli` — authoring the CI-safe mocked e2e (Phase 5).
- `riviera-local-debug` — loaded before the first `npm` command (scoped tests; CI owns the full suite).
- `postgres` / `riviera-modulith` / `riviera-java-conventions` / `riviera-stripe-payments` — **not consulted: no DB, no backend Java, no money in scope.**

**Branch:** `feature/o1-operator-console-shell` (exists; cut from `main` @ `518af4e`, the current `origin/main` tip — drift ledger empty, no open PRs).

---

## Acceptance criteria (testable)

> Each is "Given X, when Y, then Z" naming the target test. Written at the surface's observable boundary.

- [ ] **AC-1 (console shell + 6 tabs, responsive):** Given a signed-in operator, when they open `/operator/:venueId`, then the porcelain glass shell renders with a sticky header and all six pill tabs (Beach map, Pricing, Daily view, Requests, Payouts, Venue & commodities); the tab row wraps/scrolls on a narrow viewport (no horizontal page scroll). *Pinned by:* `operator-console.spec.ts` (tabs present) + `operator-console.e2e.ts` (narrow-viewport tab row).
- [ ] **AC-2 (Requests badge = live pending count):** Given a signed-in operator whose venue has N pending requests, when the console loads, then the Requests tab shows a badge of N (via `GET /api/venues/{venueId}/booking-requests`), and no badge when N = 0. *Pinned by:* `operator-console.spec.ts` (badge count / hidden-when-zero).
- [ ] **AC-3 (sign-in gate + session lifecycle):** Given a signed-out visitor to `/operator/:venueId`, then the glass sign-in card shows (not the shell); when they sign in successfully, the console renders; the session survives a page reload (restored via `GET /api/auth/me`); sign-out returns to the card; a failed sign-in shows the existing **generic** failure copy. *Pinned by:* `operator-console.spec.ts` (gate states, reload-restore, generic failure) + `operator-console.e2e.ts` (full sign-in → reload → sign-out).
- [ ] **AC-4 (legacy surfaces preserved + cross-linked — reconciled, see Open Questions):** Given the two legacy operator routes, when O1 ships, then both still render their existing components with their `legacySurface` flag intact and function unchanged; the console's tab placeholders forward-link to them (Daily → `/venue-admin/daily/:venueId`; Beach map/Pricing/Venue → `/venue-admin`). *Pinned by:* `app.spec.ts` (legacy routes + flags unchanged) + `operator-console.spec.ts` (placeholder links).
- [ ] **AC-5 (onboarding reachable):** Given a signed-in operator in the console, when they need to create a venue, then a reachable link lands them on the surviving `/venue-admin` create-venue flow (unchanged). *Pinned by:* `operator-console.spec.ts` (create-venue link present + href).
- [ ] **AC-6 (theme interplay decided + documented):** Given a tourist who selected the `riviera` (dark) theme, when they enter the console, then the console renders porcelain-light regardless, and when they return to a tourist route their `riviera` choice is preserved (the console never writes `data-riv-theme` globally / never calls `ThemeService.select`). *Pinned by:* `operator-console.spec.ts` (console root carries `data-riv-theme="porcelain"`; `ThemeService.select` never called) + this plan's Architecture note.
- [ ] **AC-7 (tourist chrome suppressed on console routes):** Given navigation to `/operator/**`, when the shell renders, then the tourist header/nav/footer are hidden and the compat `riv-legacy-surface` panel is not applied; on any tourist route they are shown. *Pinned by:* `app.spec.ts` (chrome hidden on `/operator`, shown on `/`).
- [ ] **AC-8 (per-venue authorization unchanged — no new unscoped calls):** Given the console's only backend read is the badge, when it fetches, then it calls the existing owner-asserted `GET /api/venues/{venueId}/booking-requests` and adds **no** new or unscoped endpoint. *Pinned by:* `operator-console.spec.ts` (asserts the exact URL) + code review RV-BE-9/RV-FE.
- [ ] **AC-9 (a11y + composited contrast):** Given each console surface (sign-in card, signed-in shell, tab row, badge), when rendered on the porcelain background, then axe reports no serious violations and every text pair clears WCAG AA by composited math. *Pinned by:* `operator-console.a11y.spec.ts` + `operator-console.contrast.spec.ts` + `operator-console.e2e.ts` (axe both gate + shell).

## Non-goals

- **The stats strip** (Free today · Booked online · Walk-ins · Takings after commission) — that is **O2/#171** (fullstack; the per-`(venue,date)` takings aggregate is missing server-side). Not in O1.
- **Restyling any tab's content** — Beach map (O3), Pricing (O4), Daily view (O5), Requests queue (O6), Payouts (O7), Venue & commodities (O8). O1 ships placeholders only.
- **Retiring `StaffDaily` / `VenueEditor`** — O6 / O8 respectively.
- **Redirecting the legacy routes into the console** (see AC-4 reconciliation) — lands per-tab with each content slice.
- **A "my venues" picker / multi-venue switching** — needs a backend read that does not exist; deferred.
- **Touching `index.html`** (the Manrope/Instrument-Serif font link) — belongs to O6/#176; `staff-daily.scss` still consumes it.
- **The shared Riviera sign-in/register page** (epic #108) — O1 keeps the existing username/password form, restyled; no dead "register on the shared page" link.
- **Any backend change** — no new endpoint, DTO, migration, or module.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Console porcelain-scoping bleeds into / is overridden by the global `data-riv-theme` on `<html>` | med | med | Set `data-riv-theme="porcelain"` on the console root element; attribute-scoped `--riv-*` re-scope for the subtree; contrast spec proves AA on porcelain stops; e2e enters console from a `riviera`-themed tourist route and axe-checks | Ivo | open |
| R-2 | Suppressing tourist chrome for `/operator/**` accidentally hides it on tourist routes (or vice-versa) | med | med | Data-flag walked root→leaf in the existing `NavigationEnd` computation; `app.spec.ts` pins both directions | Ivo | open |
| R-3 | Hosting/forward-linking loses existing daily/editor function, or removes a `legacySurface` flag | low | high | O1 is **additive** — legacy routes untouched (flags intact), verified by `app.spec.ts`; tabs forward-link only | Ivo | open |
| R-4 | Requests badge fetch fails / 401 mid-session and breaks the shell | med | low | Badge is best-effort: a failed/401 fetch yields no badge (count 0) and never blocks the shell; `sessionLost()` on 401 mirrors `StaffDaily` | Ivo | open |
| R-5 | Route-based "tabs" mis-modeled as an ARIA `tablist` (needs roving tabindex/tabpanel) | low | med | Tabs are **navigation** (`routerLink` + `routerLinkActive` + `aria-current="page"`), a `<nav>`, not an ARIA tablist — the a11y-correct pattern for route tabs | Ivo | open |
| R-6 | Per-venue authorization weakened by a new/unscoped call | low | high | Only reused read is the owner-asserted `booking-requests`; AC-8 asserts the exact URL; no new endpoint | Ivo | open |

## Open questions / Assumptions

- **Assumption:** an operator reaches `/operator/:venueId` by URL (like `StaffDaily` today) — there is no "my venues" listing. Onboarding (`/venue-admin`) returns the created id. Acceptable for the foundation. — *Owner:* Ivo · *Resolves by:* a later "my venues" slice.

### Resolved (maintainer, this session)

- **Venue-id source →** route param `/operator/:venueId` (keeps O1 frontend-only; no "my venues" endpoint exists). SHA: (plan commit).
- **Console route →** new `/operator/:venueId` namespace; `/venue-admin` and `/venue-admin/daily/:venueId` stay. SHA: (plan commit).
- **Onboarding home →** stays at `/venue-admin` (legacy `VenueEditor`), reachable via a console link; retires with #115/O8. SHA: (plan commit).
- **AC-4 direction (grill reconciliation, my call):** In O1 the "alias" between old routes and console tabs is **forward** (console tab → surviving legacy route), **not** old-route→console redirect. Reason: the issue's literal "old routes redirect to the equivalent console tab" presupposes the tabs host real function in O1, but the existing function is entangled in two monolithic components (`VenueEditor` is create-centric + bundles layout/pricing/commodities; `StaffDaily` bundles daily+requests) and **Payouts has no FE surface at all** — so redirecting into an O1 placeholder tab would regress working surfaces, and redirecting into an embedded legacy component would force removing a `legacySurface` flag (scope guardrail forbids). The old→console redirect + flag removal therefore lands **per-tab** in O5/O6/O8, which already own `StaffDaily`/`VenueEditor` retirement. Recorded here and flagged in the PR body.

## Review-gate record (PR #178, high effort)

`riviera-review-overlay` + `/code-review` (high — sign-in/session surface). Overlay bank items all
clear (RV-BE-9 BOLA: only the existing owner-asserted `booking-requests` read reused, no new/unscoped
call; RV-FE placement + one-way imports; RV-FE-E2E; RV-PROC-1 skills line covers the diff; theme
scoping + legacy guardrails intact). The `/code-review` workflow surfaced 5 verified findings:

- **F1 (CONFIRMED, correctness) — fixed:** a non-numeric/non-positive `:venueId` left `venueId`
  undefined but still rendered the signed-in shell with broken tab `routerLink`s. Now the id parse
  requires a positive integer and the template shows a **not-found** state (`oc-invalid-venue`) for an
  invalid id — no shell, no venue/badge reads. Pinned by `operator-console.spec.ts` (invalid-venue-id describe).
- **F2 (CONFIRMED, correctness) — fixed:** the placeholder forward-links were dead — a non-empty
  child route does **not** inherit the parent's `:venueId` under the router's default `emptyOnly`
  strategy, so Daily/Requests links resolved to `/venue-admin/daily/`. Now `ConsolePlaceholder` reads
  `venueId` from `route.parent`. The unit spec was made faithful (param on the parent), and the e2e
  now asserts the real-browser placeholder-link hrefs (`/venue-admin`, `/venue-admin/daily/1`).
- **F3 (PLAUSIBLE, correctness) — deferred → #180:** `venueId` read once in the constructor; a future
  in-app venue switcher would keep the old venue. No in-app operator→operator nav exists in O1 (full-page
  nav reconstructs the component); same pattern as shipped `StaffDaily`.
- **F4 (CONFIRMED, cleanup) — deferred → #179:** the header over-fetches the full beach map for
  `venue.name`; no lighter by-id read exists (adding one is backend work, out of O1's FE-only scope).
- **F5 (CONFIRMED, cleanup) — fixed:** `hideShellChrome` duplicated `legacySurface`'s router-events
  walk; collapsed into one `routeChrome` `NavigationEnd` pipeline returning both flags from a single
  root→leaf walk. `app.spec.ts` unchanged and green.

Fixes re-entered the loop (Skill-routing gate: frontend → `angular-developer` + angular-cli MCP +
`playwright-cli`, already loaded; test-first; full suite 492 + e2e 3 + lint + build green; changed
surface re-reviewed against the overlay bank items).

## Sonar-gate record (PR #178)

First analysis (`a1d7225`): quality gate **FAILED** on duplication — reported **0 new issues, 0
bugs/vulns/smells/hotspots, new-code coverage 84.29%** (≥80% ✅), but **3 new duplicated blocks /
6.90%** in `app.routes.ts` (42 lines — the six near-identical child tab route entries) and
`operator-console.ts` (11 lines — `loadVenue`/`loadRequestsCount` sharing the guard+subscribe shape).

Fixed (re-entered the loop, frontend): the six tab routes are generated from one `consoleTabRoutes`
factory; the two best-effort loaders collapse into one `load()` + a `bestEffort<T>()` helper.

Re-analysis (`dbd4d5b`): gate green, but **1 block remained** — `operator-console.ts:87-97` (`onSignIn`)
duplicated `venue-editor.ts:132-143` (the operator sign-in, now its 3rd occurrence). Extracted
`runOperatorSignIn` to `core/operator-auth.ts` (its natural home) and delegated from the console —
**additive** (the legacy `venue-editor`/`staff-daily` retire onto it in O6/O8, untouched here). Added 4
direct helper unit tests (success/failure/blank/busy) so the guard branches stay covered.

Behavior unchanged throughout (full FE suite 496 + 3 e2e + lint + build green). Merge bar (per
feedback): **0 new issues · 0 duplicated blocks · ≥80% new-code coverage** — confirmed on the final
re-analysis before merge.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** The console performs no write to `availability(set_id, booking_date)` and no booking-lifecycle transition. Its single backend read (the Requests badge) is a read-only query. Tap-to-mark, accept/decline, and every availability write remain in the untouched `StaffDaily`/backend and are out of O1 scope.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend Java is created or modified; no new `api/`/`spi/` port, no domain event, no module boundary touched. The reused read endpoint (`GET /api/venues/{venueId}/booking-requests`) already exists (booking module, owner-asserted).

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** The Payouts tab is an inert placeholder in O1; no charge, refund, commission, or ledger logic. Money display, the ledger, the period statement, and the weather-refund action all land in **O7/#173**.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/operator-console.ts` (+`.html`/`.scss`) | new | standalone layout component | Signals; `computed` for gate state, badge count, venue title | **Plain signals** for the sign-in card (deviation from plan's "Signal Forms" — mirrors the `venue-editor`/`staff-daily` operator sign-in for consistency; the form is trivial, required-only, generic failure copy) |
| FE-2 | `operator/console-placeholder.ts` | new | standalone presentational | `input()` for tab name/slice/legacy link | — |
| FE-3 | `operator/operator-requests.ts` (badge source) | new | `@Service()` (or inline in console) — wraps existing `StaffService.pendingRequests` into a count signal | Signals | — |
| FE-4 | `app.ts` / `app.html` / `app.scss` | modified | shell chrome suppression for `/operator/**` (new `hideShellChrome` signal) | Signals (`toSignal` off `NavigationEnd`) | — |
| FE-5 | `app.routes.ts` | modified | add `/operator/:venueId` parent + 6 lazy child tab routes; **legacy routes untouched** | — | — |

**Standards (v22):** standalone (no `standalone:true`), no explicit `OnPush`, `inject()`, `@if`/`@for`, `input()`/`output()`, Signal Forms for the sign-in card, `class`/`style` bindings (no `ngClass`/`ngStyle`), host bindings in the `host` object. **A11y:** tabs are `<nav>` links with `routerLinkActive` + `aria-current="page"` (not an ARIA tablist); sign-in card labelled inputs + `role="alert"` error; focus management on gate transitions; AXE clean; composited AA. Reuse `shared/_glass.scss` mixins + `--riv-*` tokens; **opaque solid fills** for chips/badges (the `css:S7924` treatment) so both the WCAG math and the static analyzer pass. Reduced-motion guard lives in `operator-console.scss` next to any animation.

## FE↔BE contract

**N/A — no contract change.** O1 reuses existing endpoints only:
- `POST /api/auth/operator/login`, `POST /api/auth/logout`, `GET /api/auth/me` — via `core/OperatorAuth` (unchanged).
- `GET /api/venues/{venueId}/booking-requests` — via `staff/StaffService.pendingRequests` (unchanged) for the badge count (owner-asserted server-side, invariant #13).
Money/date on the wire: none rendered in O1.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Routing skeleton + tourist-chrome suppression | ✅ | 6d6d608 |
| 1 — OperatorConsole shell: porcelain chrome + sign-in gate | ✅ | 4cd3695 |
| 2 — Pill tab nav + live Requests badge | ✅ | d082cf4 |
| 3 — Placeholder tab panels + legacy forward-links + onboarding link | ✅ | e5ff8e7 |
| 4 — Glass styling + composited AA contrast proof | ✅ | 814fa13 |
| 5 — CI-safe mocked e2e (shell, tab switching, sign-in gate, axe) | ✅ | (phase-5) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Updated in the SAME commit window as each phase.

---

## File structure

- `frontend/src/app/operator/operator-console.ts` / `.html` / `.scss` — the layout component: venueId, porcelain scoping, sign-in gate, header, tab nav, badge, child `<router-outlet>`.
- `frontend/src/app/operator/operator-console.spec.ts` — gate states, sign-in/out, reload-restore, venue title, tabs present, badge, placeholder links, theme non-mutation, exact badge URL.
- `frontend/src/app/operator/operator-console.a11y.spec.ts` — axe over the signed-out gate and the signed-in shell.
- `frontend/src/app/operator/operator-console.contrast.spec.ts` — composited AA for every text pair on porcelain.
- `frontend/src/app/operator/console-placeholder.ts` — reusable tab placeholder (name + upcoming-slice note + optional legacy link).
- `frontend/src/app/operator/console-placeholder.spec.ts` — renders name + link.
- `frontend/src/app/app.ts` / `app.html` / `app.scss` — `hideShellChrome` suppression for `/operator/**`.
- `frontend/src/app/app.spec.ts` — chrome suppression both directions; legacy routes + flags unchanged.
- `frontend/src/app/app.routes.ts` — `/operator/:venueId` parent + 6 child tab routes (lazy); legacy routes untouched.
- `frontend/e2e/operator-console.e2e.ts` — CI-safe mocked flow + axe (both themes-of-entry).

---

## Phase 0 — Routing skeleton + tourist-chrome suppression

**Files:** Modify `app.routes.ts`, `app.ts`, `app.html`, `app.spec.ts` · Create the `operator/` route targets (stub components acceptable this phase).

- [ ] **Step 1 (red):** `app.spec.ts` — navigating to `/operator/1` hides the tourist header/nav/footer (`hideShellChrome()` true) and does not apply `riv-legacy-surface`; navigating to `/` shows them. Route config resolves `/operator/:venueId` to `OperatorConsole`.
- [ ] **Step 2:** Run `npm test -- --include='**/app.spec.ts'` → FAIL (flag/route absent).
- [ ] **Step 3 (green):** In `app.ts`, add `hideShellChrome` computed off `NavigationEnd` — walk root→leaf, true if any activated route carries `data.operatorConsole === true`; also skip `legacySurface` when it is true. In `app.html`, wrap header + footer + find-modal triggers in `@if (!hideShellChrome())`. In `app.routes.ts`, add the `/operator/:venueId` parent route (`data: { operatorConsole: true }`, lazy `OperatorConsole`) with six lazy child routes (`beach-map`/`pricing`/`daily`/`requests`/`payouts`/`venue`) + a default redirect to `beach-map`; **leave both legacy routes byte-for-byte unchanged.**
- [ ] **Step 4 (green):** `npm test -- --include='**/app.spec.ts'` → PASS.
- [ ] **Step 5:** Generalization pass — is any other route a "chromeless" surface? (No today.) Record.
- [ ] **Step 6/7:** Commit `feat(fe): O1 console route tree + tourist-chrome suppression (#170)` + update this table.

## Phase 1 — OperatorConsole shell: porcelain chrome + sign-in gate

**Files:** `operator/operator-console.ts`/`.html` + `operator-console.spec.ts`.

- [ ] **Step 1 (red):** spec — signed-out (after `restoring` settles) shows the sign-in card, not the shell; a successful `signIn` renders the shell; `signIn` failure shows `signInFailureMessage(result)` (generic); `signOut` returns to the card; a restored session (`/me` returns a principal) renders the shell after reload; the console root element carries `data-riv-theme="porcelain"` and `ThemeService.select` is never called; header shows the venue title + `Signed in as {username}`.
- [ ] **Step 2/3/4:** Build `OperatorConsole` — inject `OperatorAuth`; gate on `restoring`/`signedIn`; Signal Forms sign-in card reusing `signInFailureMessage`; header (Operator wordmark, venue title, signed-in-as, Sign out). Green.
- [ ] **Step 5–7:** Generalization (gate pattern vs `VenueEditor`/`StaffDaily` inline sign-ins — note, don't refactor them here), commit, update table.

## Phase 2 — Pill tab nav + live Requests badge

**Files:** `operator-console.ts`/`.html`, badge source (FE-3), `operator-console.spec.ts`.

- [ ] **Step 1 (red):** spec — six pill tabs render as `routerLink`s with `aria-current` on the active one; the Requests tab shows a badge equal to `StaffService.pendingRequests(venueId).length`, hidden at 0; a failed badge fetch yields no badge and does not break the shell; the fetched URL is exactly `/api/venues/{venueId}/booking-requests`.
- [ ] **Step 2/3/4:** Build the tab `<nav>` + badge count signal (best-effort load on `signedIn`). Green.
- [ ] **Step 5–7:** Generalization, commit, update table.

## Phase 3 — Placeholder tab panels + legacy forward-links + onboarding link

**Files:** `operator/console-placeholder.ts` + spec; wire the six child routes to it via route `data`.

- [ ] **Step 1 (red):** `console-placeholder.spec.ts` — renders the tab name + upcoming-slice note; when route `data` names a legacy link, renders it (Daily → `/venue-admin/daily/:venueId` with the id; Beach map/Pricing/Venue → `/venue-admin`); Requests notes "in the Daily view until O6"; Payouts notes "arrives in O7". The console header exposes a reachable create-venue link to `/venue-admin` (AC-5).
- [ ] **Step 2/3/4:** Build the reusable placeholder reading route `data`; point all six child routes at it (each future slice swaps its route's `loadComponent`). Green.
- [ ] **Step 5–7:** Generalization, commit, update table.

## Phase 4 — Glass styling + composited AA contrast proof

**Files:** `operator/operator-console.scss`, `operator/console-placeholder` styles, `operator-console.contrast.spec.ts`, `operator-console.a11y.spec.ts`.

- [ ] **Step 1 (red):** `operator-console.contrast.spec.ts` — composited AA (via `src/testing/contrast.ts`) for every text pair on the **porcelain** background stops: header wordmark + venue title + signed-in-as + Sign-out ink, sign-in card title/intro/label/error/CTA, tab label + active-tab ink, Requests badge ink-on-fill. `operator-console.a11y.spec.ts` — axe over the signed-out gate and the signed-in shell.
- [ ] **Step 2/3/4:** Style with `_glass.scss` mixins + `--riv-*` tokens; **opaque solid fills** for the badge/active pill (`css:S7924` treatment); reduced-motion guard beside any animation. Green (contrast + a11y + all prior specs).
- [ ] **Step 5–7:** Generalization (any new token belongs in `styles.scss`, not a literal), commit, update table.

## Phase 5 — CI-safe mocked e2e (shell, tab switching, sign-in gate, axe)

**Files:** `frontend/e2e/operator-console.e2e.ts` (CI-safe mocked suite).

- [ ] **Step 1:** Author (with `playwright-cli`) the mocked flow: mock `/api/auth/me` (signed-out → 401, then signed-in → principal), `/api/auth/operator/login`, `/api/venues/1/booking-requests` (N pending). Signed-out shows the card → sign in → console renders → switch tabs (URL + `aria-current` update) → reload keeps the session → sign out returns to the card. Requests badge shows N. Enter the console from a `riviera`-themed tourist route and assert porcelain. Narrow-viewport tab row wraps/scrolls (no page x-scroll). Axe (via `e2e/support/axe.ts`) on the gate and the shell, awaiting animation settle first. Legacy `/venue-admin/daily/1` still renders (not broken).
- [ ] **Step 2–4:** Green in real Chromium; place in `frontend/e2e/` (CI-safe) per RV-FE-E2E.
- [ ] **Step 5–7:** Commit, update table, then run the PR/review/Sonar gates.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-9:** each verified by its pinned spec/e2e — FE 496 unit + 40 operator + 3 real-Chromium e2e green locally AND on the PR #178 CI run (`c913021`); the review-fix e2e proves AC-4's placeholder links in a real browser.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders/TODO/TBD in the doc.
- [x] **No JPA / no backend change** — frontend-only (invariant #1 not in play).
- [x] **Availability** N/A justified (no availability write) (invariant #2).
- [x] Pool/cutoff (#3/#4) N/A — no booking write.
- [x] **Modulith** N/A justified — no backend Java (invariant #11).
- [x] **Payment/payout** N/A justified — Payouts tab inert (invariants #5/#8/#9/#10).
- [x] Booking codes: none rendered/logged in O1 (invariant #7).
- [x] **Per-venue authorization unchanged** — only the owner-asserted badge read reused, exact URL asserted (invariant #13, RV-BE-9).
- [x] **Frontend** v22 standards met; tabs are route-nav not ARIA tablist; AXE clean; composited AA; `data-riv-theme` scoped, `ThemeService` untouched.
- [x] **Scope guardrails:** both `legacySurface` flags intact; `index.html` font link untouched; onboarding reachable.
- [x] Execution-status table at HEAD matches reality; Open Questions empty or deferred with rationale (#179/#180).

All boxes checked. Gates green (CI + review + Sonar: 0 issues / 0 dupes / 90.23% new-code coverage).
Held at merge for the two-party review guard — maintainer merges; on merge, tick epic #141's O1 line
with the squash SHA and run `riviera-docs-freshness` over the range.
