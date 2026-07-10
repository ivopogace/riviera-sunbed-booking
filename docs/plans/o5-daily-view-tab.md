# O5 — Daily-view tab Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox syntax for tracking.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Restyle the staff daily-operations surface as the operator console's **Daily view**
tab — a sea-facing availability grid (tap free→mark walk-in, tap marked→release, online-booked
locked), a Europe/Tirane date picker, and an Arrivals card listing the day's confirmed bookings
with their booking-code chips — while extracting the beach grid both this tab and the O3 layout
editor now consume (rule of three).

**Architecture:** Frontend-only restyle. The new `DailyViewTab` (a console child route, mirroring
O4's `PricingTab`) reuses the **existing** owner-asserted endpoints (daily-bookings read, staff
mark/release) — no backend, no schema, no new endpoint. The single significant decision is the
**grid extraction**: a presentational `BeachGridFrame` (the ▲/▼ sea-facing map chrome + per-row
scaffold) that both `LayoutEditor` and `DailyViewTab` project their own tiles into — tile look and
tap semantics stay per-consumer, because the two grids are semantically different (O3 paints
`premium|standard|walkin|gap`; the daily grid shows `FREE|BOOKED_ONLINE|STAFF_MARKED`).

**Persistence:** N/A — frontend-only, no migration (invariant #1 not engaged).

**Source of intent:** GitHub issue #175 (epic #141 operator console, slice O5).

**Skills consulted (riviera-sdlc Skill-routing gate):**
- `riviera-plan-doc` — plan discipline + this template.
- `riviera-frontend` — placement: `BeachGridFrame` stays in `operator/` (two consumers in the
  *same* feature folder → no promotion to `shared/`); the `parentVenueId` route helper is a pure
  util → `shared/`; new tab is a lazy console child route in `app.routes.ts`; unit+a11y+contrast
  spec trio per surface.
- `angular-developer` + angular-cli MCP (`get_best_practices`, v22) — signals/`computed`, `@Service`
  + `inject()`, `input()`/content-projection for the frame, native control flow, no `ngClass`.
- `riviera-tailwind` — share via the frame **component** not `@apply`; keep test-hook classes
  (`.set-tile`, `.premium`, …) as inert markers; frame carries no `border-radius`; prove no colour
  drift via computed-style diff, not the class list.
- `playwright-cli` — CI-safe mocked e2e in `frontend/e2e/` (real browser + `page.route` mock + the
  shared `expectNoSeriousAxeViolations`); local-only real-backend spec in `frontend/e2e/real-backend/`.

**Branch:** `feature/o5-daily-view-tab` (exists before phase 0).

---

## Acceptance criteria (testable)

> Phrased at the component boundary (the FE inner surface): the tab's observable behaviour given a
> mocked/overridden console service, independent of the exact Tailwind.

- [ ] **AC-1 (grid reflects truth):** Given a venue map for the selected date with sets in each of
  FREE / online-booked / staff-marked states, when `DailyViewTab` renders, then each tile shows the
  matching state and only FREE/STAFF_MARKED tiles are actionable (online-booked is a non-actionable,
  labelled tile). *Pinned by:* `daily-view-tab.spec.ts › renders availability states / locks online`.
- [ ] **AC-2 (mark round-trips):** Given a FREE set, when the operator taps it, then `markSet(venueId,
  setId, date)` is called, the tile optimistically flips to STAFF_MARKED, and after the reconcile
  re-read the tile reflects server truth. *Pinned by:* `daily-view-tab.spec.ts › tap free marks + reconciles`.
- [ ] **AC-3 (release round-trips):** Given a STAFF_MARKED set, when the operator taps it, then
  `releaseSet(venueId, setId, date)` is called and the tile flips to FREE after reconcile.
  *Pinned by:* `daily-view-tab.spec.ts › tap marked releases`.
- [ ] **AC-4 (online lock):** Given a set held by a confirmed online booking, when the operator taps
  it, then no write is sent and the tile stays BOOKED_ONLINE. *Pinned by:* `daily-view-tab.spec.ts ›
  online-booked tile is not actionable`.
- [ ] **AC-5 (arrivals codes):** Given confirmed bookings for the date, when the tab renders, then the
  Arrivals card lists one row per booking with its set label and its booking **code** rendered
  display-only (a `<code>` chip, never an input, never logged — invariant #7). *Pinned by:*
  `daily-view-tab.spec.ts › arrivals lists code chips`.
- [ ] **AC-6 (date in Tirane):** Given the default load, when no date is picked, then the selected date
  is `todayBookingDate(new Date())` (Europe/Tirane civil day, invariant #6) and the human label formats
  the UTC-anchored civil date; changing the date re-reads map+bookings and clears optimistic overrides.
  *Pinned by:* `daily-view-tab.spec.ts › defaults to Tirane today / date change reloads`.
- [ ] **AC-7 (shared grid extracted):** Given `BeachGridFrame`, when both `LayoutEditor` and
  `DailyViewTab` render their grids, then both do so through `BeachGridFrame` (the ▲/▼ banners + card
  chrome come from one component), and the pre-existing `layout-editor.spec.ts` / `.a11y.spec.ts` /
  `.contrast.spec.ts` all still pass unchanged (regression guard). *Pinned by:* `beach-grid-frame.spec.ts`
  + the unchanged O3 specs.
- [ ] **AC-8 (owner-assert preserved / 403+401 copy):** Given a cross-venue or expired session, when a
  mark/release returns 403 `NOT_VENUE_OWNER` / 401, then the tab surfaces the mapped operator copy and a
  401 triggers `operator.sessionLost()` (the server owner-assert on `/api/venues/{venueId}/**` is
  unchanged — invariant #13). *Pinned by:* `daily-view-tab.spec.ts › maps write errors / 401 drops session`.
- [ ] **AC-9 (a11y + contrast):** axe finds no serious violations and tile state is conveyed by an
  accessible name, not colour alone; the porcelain glass surfaces pass composited-AA. *Pinned by:*
  `daily-view-tab.a11y.spec.ts`, `daily-view-tab.contrast.spec.ts`.
- [ ] **AC-10 (e2e):** The CI-safe mocked Playwright spec drives sign-in → daily tab → mark a set →
  see it flip → read an arrival code chip, all against `page.route` mocks, axe-clean. *Pinned by:*
  `frontend/e2e/operator-daily.e2e.ts`.

## Non-goals

- The **Request-to-Book pending-requests queue** (accept/decline/badge) — that is **O6 (#176)**, which
  also **retires** the legacy `StaffDaily` page and drops its `legacySurface` route flag. O5 leaves the
  legacy `/venue-admin/daily/:venueId` route and the `StaffDaily` component untouched.
- Any backend change: no new endpoint, no controller/service/SQL/Flyway edit.
- Promoting `BeachGridFrame` to `shared/` or wiring it into the tourist `venue-map` (both consumers are
  in `operator/`; promote only if a third consumer outside operator appears).
- Migrating `console-placeholder`'s string-based venue-id fallback to the new helper (different shape;
  the placeholder is being emptied tab-by-tab anyway).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Grid extraction regresses the **merged** O3 layout editor (paint/drag, keyboard, contrast) | med | high | `BeachGridFrame` is presentational chrome + a projected per-row tile template; O3 keeps its own tile/paint logic; the existing `layout-editor.*spec.ts` are the regression guard and must pass **unchanged** | Ivo | open |
| R-2 | Over-abstraction: forcing one grid to serve two different tile-track layouts (CSS-grid equal-cols vs flex set-grid) makes the frame fight both | med | med | Frame shares only the map **chrome** + row rhythm via a template-outlet; if the row abstraction fights the two layouts, fall back to chrome-only sharing and record it in the generalization log | Ivo | open |
| R-3 | Behaviour drift on the availability write path (invariants #2/#3) during the "restyle" | low | high | Reuse the proven optimistic-override→reconcile logic verbatim from `StaffDaily`; same endpoints, same server guards (release only deletes a `STAFF_MARKED` row); no new write channel — see Availability section | Ivo | open |
| R-4 | Tab reads its `:venueId` from its own snapshot (empty under `emptyOnly`) instead of the parent | low | med | Use the extracted `parentVenueId(route)` helper (the O1 finding), same as `LayoutEditor`/`PricingTab`; covered by a unit test | Ivo | open |
| R-5 | Colour/spacing drift porting the SCSS daily grid to Tailwind porcelain | med | low | `*.contrast.spec.ts` (composited AA) + computed-style discipline (`riviera-tailwind`); keep `.set-tile`/`.premium` markers | Ivo | open |
| R-6 | Booking code leaks into logs/analytics (invariant #7) | low | high | Code rendered only in a display-only `<code>` chip; never bound to an input, never passed to a logger/analytics call | Ivo | open |

## Open questions / Assumptions

_None outstanding — all assumptions resolved below._

### Resolved
- **Scope vs O6:** the Daily view tab is availability grid + date + arrivals only; the Request-to-Book
  queue AND the legacy-page retirement are O6 (#176). Confirmed at the intake grill against #176's body.
- **Daily read/write home:** landed on `OperatorConsoleService` (not a cross-import of `StaffService`),
  matching the service's own class doc ("the console is `StaffDaily`'s successor… this becomes its single
  home"). Commit `[phase 1]`.
- **`BeachGridFrame` placement:** `operator/` — both consumers are operator tabs in the same feature
  folder, so no promotion to `shared/` (that's for cross-feature primitives). Commit `[phase 2]`.
- **Shared-grid depth:** frame chrome only (card + ▲/▼ banners), tiles per-consumer — see the
  Generalization-audit log (R-2). O3's specs pass unchanged (AC-7).
- **Are the endpoints present?** Yes — `GET /api/venues/{id}/bookings?date`, `POST`/`DELETE
  /api/venues/{id}/sets/{setId}/availability` are live and owner-asserted (used today by `StaffDaily` via
  `StaffService`, and `dailyBookingCount` already on `OperatorConsoleService`). Frontend-only confirmed at
  the intake grill.

## Availability & concurrency (invariant #2)

> The tab is a **second driving adapter** onto the *existing* staff availability writes — no new write
> path, no behaviour change. This section documents that the restyle preserves the invariant.

- **Write paths to `availability(set_id, booking_date)` in scope:** staff tap-to-mark
  (`POST …/sets/{setId}/availability`) and staff release (`DELETE …/sets/{setId}/availability`) — the
  **same** endpoints `StaffDaily` uses today. No online-booking, cancellation, or request path is touched.
- **Uniqueness guarantee:** unchanged — the DB `(set_id, booking_date)` unique constraint and the
  server-side claim/lock (invariant #2) are untouched; the client only sends the same requests.
- **Concurrency strategy (client):** optimistic override on tap, then **reconcile** (re-read map +
  bookings for the selected date and drop the override — server truth wins). A mis-tap on an
  online-held tile resolves to a safe server no-op (release only deletes a `STAFF_MARKED` row) and
  reconciles back. Ported verbatim from `StaffDaily`.
- **Pool rule (invariant #3):** unchanged — the tab never assigns pools; online-vs-walk-in separation
  stays server-side. Tiles are driven by the read model's `availability` + which sets confirmed bookings
  hold.
- **Cutoff rule (invariant #4):** N/A — no booking is created here; the tab only marks/releases and reads.
- **Pinning test:** the invariant itself stays pinned by the existing backend
  `ConcurrentReservationIT` / staff availability ITs (unchanged). FE side: AC-2/AC-3/AC-4 pin the
  optimistic-flip + reconcile + online-lock behaviour.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend module, port, or event is added or changed.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. Money is only **displayed** (set price on a tile, via the existing
`formatMoney`, integer minor units — invariant #5); nothing is charged, refunded, or accrued.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/daily-view-tab.ts` (+ `.html`) | new | standalone console-tab component | signals + `computed` (rows, tile-state, arrivals, overrides, pending) | native `<input type=date>` (no Signal Form — single control, mirrors `PricingTab`) |
| FE-2 | `operator/beach-grid-frame.ts` | new | presentational component (content-projected rows + per-tile `ng-template`) | inputs only (`input()`), no app state | — |
| FE-3 | `shared/parent-venue-id.ts` | new | pure util `parentVenueId(route): number \| undefined` | — | — |
| FE-4 | `operator/layout-editor.ts` + `.html` | modify | consume `BeachGridFrame` + `parentVenueId` | unchanged behaviour | — |
| FE-5 | `operator/pricing-tab.ts` | modify | use `parentVenueId` (dedup) | unchanged behaviour | — |
| FE-6 | `operator/operator-console.service.ts` | modify | add `dailyBookings` / `markSet` / `releaseSet` + `markErrorOf` / `releaseErrorOf` | — | — |
| FE-7 | `operator/operator-console.model.ts` | modify | add `ConsoleDailyBooking`, `MarkErrorCode`, `ReleaseErrorCode` | — | — |
| FE-8 | `app.routes.ts` | modify | swap the `daily` child route from `ConsolePlaceholder` to `DailyViewTab` | — | — |
| FE-9 | `operator/console-placeholder.ts` + `.spec.ts` | modify | drop the `daily` case (mirrors O4 dropping `pricing`) | — | — |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`, `inject()`, `@Service()`,
`input()` + content projection for the frame, `@if`/`@for`, `class`/`style` bindings (no `ngClass`),
signals + `computed`, no `as any` on the contract. Tile state conveyed by accessible name (WCAG AA).

## FE↔BE contract

- **New/changed endpoints:** none. The tab consumes existing owner-asserted endpoints:
  `GET /api/venues/{venueId}/bookings?date=YYYY-MM-DD` → `[{ setId, code }]`;
  `POST /api/venues/{venueId}/sets/{setId}/availability` body `{ date }`;
  `DELETE /api/venues/{venueId}/sets/{setId}/availability?date=YYYY-MM-DD`.
- **Client typing:** hand-written typed methods on `OperatorConsoleService`; `ConsoleDailyBooking`
  in `operator-console.model.ts` mirrors the response `{ setId: number; code: string }`. No `as any`.
- **Money/date on the wire:** date is ISO `LocalDate` (`YYYY-MM-DD`, Europe/Tirane civil day, #6);
  set price displayed from integer minor units + currency (#5). No amounts sent by this tab.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — `parentVenueId` helper + migrate the 2 existing consumers | ✅ | (this commit) |
| 1 — console service/model: `dailyBookings`/`markSet`/`releaseSet` + error mappers | ✅ | (this commit) — verified via the tab spec (phase 3) |
| 2 — `BeachGridFrame` extraction + migrate `LayoutEditor` (O3 specs stay green) | ✅ | (this commit) |
| 3 — `DailyViewTab` (grid + date + arrivals) via the frame, unit specs | ✅ | (this commit) |
| 4 — a11y + contrast specs; route swap; placeholder `daily` case removed | ✅ | (this commit) |
| 5 — CI-safe mocked e2e (+ local real-backend spec) | ✅ | (this commit) — full mocked e2e suite 35/35 |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

### Review gate — findings resolved

High-effort workflow-backed review (4 finders + adversarial verify) surfaced 8 distinct findings, all in
`daily-view-tab.ts`. Resolved in the post-review fix commit:

- **F1 (Major, correctness):** `reconcile()` cleared ALL overrides/pendingSets → a concurrent second tap
  lost its optimistic/pending state and could fire a duplicate mark POST. **Fixed** — `reconcile(setId)`
  now clears only the settled set; pinned by a new concurrency test.
- **F3 (correctness):** date change didn't clear `pendingSets` → a set stayed disabled on the new day.
  **Fixed** (full new-day reset in `onDateChange`).
- **F4 (correctness):** `loaded` flipped after the first of two parallel reads → empty-grid flash if
  bookings resolved first. **Fixed** — flips only when both settle.
- **F2 (cleanup):** a transient reconcile read-blip wiped the working grid to the error card. **Fixed** —
  `loadError` is set only when there's no grid to preserve (`venue() === undefined`).
- **F5 (cleanup):** new date label shown over the old day's counts/codes during load. **Fixed** (new-day reset).
- **F6 (cleanup):** duplicated session-expired literal. **Fixed** — uses the `SESSION_EXPIRED` constant.
- **F7 (cleanup):** `dateLabel()` rebuilt an `Intl.DateTimeFormat` every call. **Fixed** — memoized `computed`.
- **F8 (PLAUSIBLE, cleanup):** row-grouping duplicated. **Resolved after all** — the Sonar gate (below)
  forced a real de-duplication that made this a genuine 3-consumer extraction (`groupSetsByRow`).

### Sonar gate — findings resolved

First analysis failed all three bars (1 issue, 9.66% duplication, 74.9% new-code coverage). Root cause:
`daily-view-tab.ts` was a large verbatim port of `StaffDaily`. Fixed:

- **Issue `Web:S6819`** (`role="img"` on the locked tile): replaced with an `sr-only` text alternative —
  satisfies both axe (accessible name) and Sonar (no img role).
- **Duplication (9.66%):** extracted the shared grid logic (`groupSetsByRow`, `deriveTileStates`,
  `tileTapAction`, `TileState`) to `shared/availability-grid.ts` and refactored **all three** consumers
  onto it — `DailyViewTab`, `StaffDaily` (removing its inline copies), and `PricingTab` (row grouping).
  The `DailyViewTab` tap flow was consolidated into one `onTile` (killing the third duplicated block).
- **Coverage (74.9% → target ≥80%):** the shared helpers are pure and fully covered by
  `availability-grid.spec.ts`; a new `operator-console.service.spec.ts` exhaustively covers the
  `markErrorOf`/`releaseErrorOf` branches; added component tests for the mark/release failure notices.

Verified: `npm run lint` clean, targeted specs 52/52, `npm run build` clean, affected e2e 6/6.
**Re-analysis (PR #215) confirmed all three bars cleared: 0 new issues · 0.0% new-duplication · 88.13%
new-code coverage** (up from 74.9%).

### Docs-freshness (merge close-out step 5)

Ran `riviera-docs-freshness` over the O5 merge range. One finding: `CLAUDE.md` epic-#141 status line
(O1–O4 → **O1–O5** merged, O6–O8 remain) — patched via the docs close-out PR. No skill/substrate
references to the removed `StaffTileState` or to `staff-daily` as an example. Otherwise clean.

---

## File structure

- `frontend/src/app/shared/parent-venue-id.ts` — pure `parentVenueId(route: ActivatedRoute): number | undefined`.
- `frontend/src/app/shared/parent-venue-id.spec.ts` — unit spec for the helper.
- `frontend/src/app/operator/beach-grid-frame.ts` — presentational sea-facing map chrome + projected rows.
- `frontend/src/app/operator/beach-grid-frame.spec.ts` — renders banners + projected rows.
- `frontend/src/app/operator/daily-view-tab.ts` (+ `.html`) — the new Daily view tab.
- `frontend/src/app/operator/daily-view-tab.spec.ts` — behaviour (AC-1..8).
- `frontend/src/app/operator/daily-view-tab.a11y.spec.ts` — axe + accessible-name.
- `frontend/src/app/operator/daily-view-tab.contrast.spec.ts` — composited porcelain AA.
- `frontend/src/app/operator/operator-console.service.ts` — add daily read/write + mappers.
- `frontend/src/app/operator/operator-console.model.ts` — add `ConsoleDailyBooking` + error codes.
- `frontend/src/app/operator/layout-editor.ts` + `.html` — consume `BeachGridFrame` + `parentVenueId`.
- `frontend/src/app/operator/pricing-tab.ts` — use `parentVenueId`.
- `frontend/src/app/app.routes.ts` — `daily` → `DailyViewTab`.
- `frontend/src/app/operator/console-placeholder.ts` + `.spec.ts` — drop the `daily` case.
- `frontend/e2e/operator-daily.e2e.ts` — CI-safe mocked e2e.
- `frontend/e2e/real-backend/daily.e2e.ts` — local-only real-backend round-trip.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-10 | Phase 2 (grid extraction, R-2) | shared sea-facing grid chrome vs per-row tile scaffold | read `layout-editor.html` + `staff-daily.html` grid bodies | 2 grids: O3 paint grid (CSS-grid equal-cols + right price col) vs daily grid (price-header + flex set-grid) | Shared the **frame chrome only** (`BeachGridFrame` = card + ▲/▼ banners via `<ng-content>`); left the per-row tile scaffold per-consumer because the two tile-track layouts genuinely differ. Sharing the row scaffold too would force one abstraction over two layouts (R-2). |
| 2026-07-10 | Review finding F8 (group-sets-by-row duplication) | `new Map<…>()` group-by-`rowLabel` across operator components | inspected `PricingTab.rows`, `DailyViewTab.rows`, `LayoutEditor.displayRows` | Only **2** true label-grouping consumers (`PricingTab`, `DailyViewTab`); `LayoutEditor.displayRows` is grid-**coordinate** based (2D array), a different pattern | **Deferred** (finding was PLAUSIBLE, not a defect). Rule-of-three not met for the identical pattern — extracting now is premature and would drag `PricingTab` back through review for no correctness gain. Revisit if a 3rd label-grouping consumer lands. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..8:** `npm test` → `daily-view-tab.spec.ts` (10) + `beach-grid-frame.spec.ts` (3) +
  `parent-venue-id.spec.ts` (5) pass; `layout-editor.*spec.ts` pass **unchanged** (AC-7 regression guard).
- [x] **AC-9:** `daily-view-tab.a11y.spec.ts` + `.contrast.spec.ts` pass; `operator-daily.e2e.ts` axe-clean.
- [x] **AC-10:** full mocked e2e suite green (35/35) incl. `operator-daily.e2e.ts`.
- [x] Full gate before PR: `npm run lint` (clean) · `npm test` (577/578 — the 1 failure is the
  pre-existing `booking.service.spec.ts` localStorage-isolation flake, A/B-proved identical on clean
  `origin/main`, out of scope) · `npm run build` (clean; 2 pre-existing SCSS-budget warnings) ·
  `npm run test:e2e:a11y` (35/35).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] Availability section: no new write path; optimistic+reconcile preserves invariant #2 (restyle only).
- [x] Pool + cutoff (invariants #3/#4) untouched.
- [x] Modulith / Payment sections justified N/A (frontend-only, no money moves).
- [x] Timezone: selected date is the Tirane civil day (`todayBookingDate`); label UTC-anchored (invariant #6).
- [x] Booking codes render display-only (`<code>` chip), never logged (invariant #7).
- [x] Owner-assert preserved: `/api/venues/{venueId}/**` server check unchanged (invariant #13); 403/401 copy mapped.
- [x] Frontend standards met; no `as any`; `BeachGridFrame` placed in `operator/` per `riviera-frontend`.
- [x] O3 regression: `layout-editor.*spec.ts` pass unchanged (AC-7).
- [x] Execution-status table at HEAD matches reality; Open Questions empty.
