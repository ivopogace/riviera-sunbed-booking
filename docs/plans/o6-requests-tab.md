# O6 — Requests tab (+ StaffDaily retirement) Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox syntax for tracking.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Restyle the #98 Request-to-Book pending-queue as the operator console's **Requests**
tab — request cards (guest, set + tier, date, price, "Respond by", amber ⏰ time-left chip when
urgent), one-click **Accept → send to payment**, confirm-gated **Decline**, dismissible
**expired-race** copy, an **All-caught-up** empty state, and a **tab badge** that stays in sync
after every action — and, with O5's daily view done, **retire the legacy `StaffDaily` page**, drop
its `legacySurface` route, and remove the last Google-Fonts consumer from `index.html`.

**Architecture:** Frontend-only restyle. A new `RequestsTab` (a console child route, mirroring O5's
`DailyViewTab`) consumes the **existing** owner-asserted endpoints — no backend, no schema, no new
endpoint. Two decisions carry the slice's real work: **(1) the badge-sync seam** — a tiny
operator-scoped `PendingRequestsStore` signal service that the shell reads for its badge and the tab
writes after every load/action (chosen over a child→parent output across the router-outlet, and over
re-reading on navigation, which would miss the same-tab decrement after an accept); **(2) the
StaffDaily retirement** — this tab replaces the legacy page's *last* job (O5 replaced daily-ops), so
the whole legacy `staff/` folder, its route + `legacySurface` flag, and the deferred font link all
come out here.

**Persistence:** N/A — frontend-only, no migration (invariant #1 not engaged; JDBC-only unaffected).

**Source of intent:** GitHub issue #176 (epic #141 operator console, slice O6). Design:
`docs/design/riviera-operator-console-v2.dc.html` (Requests screen, lines 224–298).

**Skills consulted (riviera-sdlc Skill-routing gate):**
- `riviera-plan-doc` — plan discipline + this template; ACs at the component boundary.
- `riviera-frontend` — placement: `PendingRequestsStore` stays in `operator/` (both consumers — the
  shell + the tab — are in the *same* feature folder, so **no** promotion to `core/`; core/ is for
  *cross-cutting* singletons); the request client moves onto `OperatorConsoleService` (the one-way
  import rule forbids `operator/` importing legacy `staff/`); new tab is a lazy console child route;
  unit+a11y+contrast spec trio per surface; the two-suite e2e split.
- `angular-developer` + angular-cli MCP (`get_best_practices`, v22) — signals/`computed`, `@Service`
  + `inject()`, native control flow, `class`/`style` bindings (no `ngClass`/`ngStyle`), no explicit
  `OnPush`/`standalone`, accessible-name-not-colour.
- `riviera-tailwind` — cards via the shared `CardGlass` **directive** (not `@apply`); each card sets
  its own radius (surface directive carries none); keep `data-testid` hooks; prove no colour drift via
  computed-style diff; urgency/expired ambers are literals (no matching token) documented in the
  contrast spec.
- `playwright-cli` — CI-safe mocked e2e in `frontend/e2e/` (real browser + `page.route` + the shared
  `expectNoSeriousAxeViolations`); replace the two retired legacy specs; optional real-backend spec.
- `riviera-review-overlay` (review gate) — RV-FE-*, RV-BE-9 (owner-assert preserved), RV-PROC-1.

**Branch:** `feature/o6-requests-tab` (created before phase 0; local session, not the cloud
designated-branch case).

---

## Acceptance criteria (testable)

> Phrased at the component boundary (the FE inner surface): the tab's observable behaviour given a
> mocked/overridden console service, independent of the exact Tailwind. Payment/lifecycle stay
> server-owned — the tab is a driving adapter that never confirms a booking itself (invariant #8).

- [ ] **AC-1 (queue renders, code-less):** Given pending requests for the venue, when `RequestsTab`
  renders, then each card shows guest, set label + tier, booking date, price, and "Respond by
  <deadline>", and **no booking code appears anywhere in the requests region** (invariant #7 — the
  queue is deliberately code-less). *Pinned by:* `requests-tab.spec.ts › renders the pending queue / no code`.
- [ ] **AC-2 (urgency chip):** Given a request whose deadline is within the urgency window (< 8h), when
  the card renders, then an amber ⏰ time-left chip shows with a text label (e.g. "3h left"); a
  far-future request shows no chip. Urgency is conveyed by text, not colour alone. *Pinned by:*
  `requests-tab.spec.ts › urgency chip` + `deadline.spec.ts › timeLeftLabel/isUrgent` (boundary maths).
- [ ] **AC-3 (accept → payment, badge decrements):** Given a pending request, when the operator clicks
  "Accept — send to payment", then `acceptRequest(venueId, bookingId)` is called, the card leaves the
  queue, a transient notice reports the outcome, and the badge count decrements — **the tab never marks
  the booking confirmed** (that is the webhook's job, invariant #8; accept only moves the guest into the
  pay window). *Pinned by:* `requests-tab.spec.ts › accept removes card + updates badge`.
- [ ] **AC-4 (decline is confirm-gated):** Given a pending request, when the operator clicks "Decline",
  then an inline confirm appears ("<guest> will be notified and won't be charged"); "Confirm decline"
  calls `declineRequest` and removes the card; "Keep it" cancels with no call. *Pinned by:*
  `requests-tab.spec.ts › decline confirm flow / keep-it cancels`.
- [ ] **AC-5 (expired-race):** Given the operator accepts/declines a request the sweep already expired,
  when the server returns 409 `REQUEST_EXPIRED`, then the card flips **in place** to the designed copy
  ("This request just expired — our system swept it before you responded…"), the accept/decline buttons
  are gone (no double-action), and a "Dismiss" button removes the card and re-syncs the badge. *Pinned
  by:* `requests-tab.spec.ts › expired-race copy + dismiss`.
- [ ] **AC-6 (badge stays in sync):** Given the shell shows a Requests badge, when the tab loads the
  queue and after every accept/decline/dismiss, then the shell badge equals the tab's live pending
  count — both read one `PendingRequestsStore`. *Pinned by:* `requests-tab.spec.ts › writes the badge
  store` + `operator-console.spec.ts › badge reads the store`.
- [ ] **AC-7 (empty state):** Given no pending requests, when the tab renders, then the "All caught up"
  empty state shows and the badge is 0 / absent. *Pinned by:* `requests-tab.spec.ts › empty state`.
- [ ] **AC-8 (owner-assert preserved / 403+401 copy):** Given a cross-venue or expired session, when an
  accept/decline returns 403 `NOT_VENUE_OWNER` / 401, then the tab surfaces the mapped operator copy and
  a 401 triggers `operator.sessionLost()` — the server owner-assert on `/api/venues/{venueId}/**` is
  unchanged (invariant #13). *Pinned by:* `requests-tab.spec.ts › maps 403 / 401 drops session`.
- [ ] **AC-9 (StaffDaily retired, grep-clean):** Given the retirement, then the legacy `staff/` folder
  and the `/venue-admin/daily/:venueId` route (+ its `legacySurface` flag) are deleted, `app.spec.ts`
  asserts exactly **one** remaining legacy operator route (`venue-admin`), no source imports `staff/`,
  `grep -rn "Manrope\|Instrument Serif" frontend/src` is clean, and only then the Google-Fonts `<link>`
  + preconnects are removed from `index.html`. *Pinned by:* `app.spec.ts › one legacy operator route` +
  the Phase-3 grep step in Acceptance-criteria verification.
- [ ] **AC-10 (a11y + contrast):** axe finds no serious violations on the queue, the decline-confirm,
  the expired-race and the empty state; urgency/expired are not colour-only; the porcelain glass cards
  pass composited-AA. *Pinned by:* `requests-tab.a11y.spec.ts`, `requests-tab.contrast.spec.ts`.
- [ ] **AC-11 (e2e):** The CI-safe mocked Playwright spec drives sign-in → Requests tab → accept a
  request (badge decrements) → decline-confirm → an expired-race conflict → the empty state, all against
  `page.route` mocks, axe-clean; the two legacy specs are deleted. *Pinned by:*
  `frontend/e2e/operator-requests.e2e.ts`.

## Non-goals

- **Any request-lifecycle behaviour change.** The response deadline, the #98 expiry sweep, and the
  pay-window are **server-owned** and untouched; accept still moves the guest into the pay window and
  payment is confirmed only by the signature-verified Stripe webhook (invariant #8). This is a restyle
  + a client move, not a semantics change.
- **Exposing the booking code on request cards.** Resolved code-less — see Open questions / Resolved.
- **Any backend change:** no new endpoint, controller, service, SQL or Flyway edit.
- **A live countdown timer.** Urgency/time-left are computed at load (and recomputed on each queue
  reload), not ticked by a timer — simpler, testable, and no a11y live-region churn.
- **Retiring the venue editor** (`/venue-admin`) — that legacy route stays (O8 restyles it as the
  Venue & commodities tab); only the daily route retires here.
- **`shared/availability-grid.ts`** — it stays (used by `DailyViewTab` + `PricingTab`); only its stale
  doc-comment mention of `staff-daily` is corrected.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Badge drifts from the queue after an action (shell + tab hold separate counts) | med | med | One source of truth: a `PendingRequestsStore` readonly signal the shell binds and the tab writes after load + every accept/decline/dismiss; pinned by AC-6 in both specs | Ivo | open |
| R-2 | Retirement leaves a dangling reference (a `staff/` import, the deleted route, a broken `{@link}`) → red build | med | high | Blast-radius traced at intake: only `app.routes.ts` imports `staff/` in code; the rest are JSDoc `{@link}`s (`operator-console.service.ts`, `availability-grid.ts`) — corrected in the same phase; `app.spec.ts` legacy-route test updated; full `npm run build` + grep guard before the font link comes out | Ivo | open |
| R-3 | Font link removed while a Manrope/Instrument-Serif consumer survives → tourist/legacy text reflows | low | med | Removal is **gated** on `grep -rn "Manrope\|Instrument Serif" frontend/src` returning clean AFTER `staff-daily.scss` is deleted (its last consumer); order enforced in Phase 3 | Ivo | open |
| R-4 | The tab self-confirms / implies a booking is paid on accept (invariant #8) | low | high | Accept copy is "asked to pay" / "sent to payment"; the tab only calls `acceptRequest` and removes the card — it never sets CONFIRMED, never reads payment state; notice copy mirrors the legacy `decisionNotice` | Ivo | open |
| R-5 | Booking code leaks into the queue (invariant #7) | low | high | `PendingRequestItem` carries no `code`; the card template has no code binding; AC-1 + the e2e assert the requests region contains no code text | Ivo | open |
| R-6 | Expired-race reconcile wipes the in-card message (a full re-read would drop the expired card) | med | med | On 409 `REQUEST_EXPIRED` the card flips locally to expired-race and is **not** re-read; it leaves the queue only on Dismiss (which re-syncs the badge); no post-action full reload (the tab has no grid to reconcile, unlike daily-view) | Ivo | open |
| R-7 | Colour/spacing drift porting the SCSS/mock card to Tailwind porcelain | med | low | `requests-tab.contrast.spec.ts` (composited AA) + computed-style discipline (`riviera-tailwind`); amber literals documented; `CardGlass` directive for the surface | Ivo | open |
| R-8 | Cross-venue accept/decline (BOLA, invariant #13) | low | high | Unchanged — the server owner-asserts every `/api/venues/{venueId}/**` call (pinned by backend `CrossVenueDenialIT`); the tab maps the 403 `NOT_VENUE_OWNER` to copy (AC-8); no client-side authz introduced | Ivo | open |

## Open questions / Assumptions

_None outstanding — the one product/security question is resolved below._

### Resolved
- **Code chip on request cards (issue #176 open question):** **Dropped — the queue stays code-less.**
  The design mock (line 245) shows a `{{ rq.code }}` chip, but the live `PendingRequestItem` deliberately
  carries no code: a pending request isn't confirmed and paid yet, and the booking code is the guest's
  unguessable **bearer credential** that staff verify **at arrival** (invariant #7), not at request time
  — the code already surfaces in O5's Daily view arrivals for *confirmed* bookings. Exposing it here
  would reverse a security invariant **and** make the slice fullstack (the backend would have to add
  `code` to the booking-requests response). Escalated to the maintainer via `AskUserQuestion` (push
  first, per riviera-sdlc); **decision: Option A (keep code-less, drop the chip)**, 2026-07-10.
- **Badge-sync mechanism:** a shared `operator/pending-requests-store.ts` signal service both the shell
  and the tab inject — the shell binds `count` for the badge, the tab `set`s it after each load/action.
  Chosen over a child→parent `output()` (awkward across `<router-outlet>`) and over the shell
  re-reading on navigation (misses the same-tab decrement after an accept). Placement stays in
  `operator/` (both consumers same feature; not a `core/` cross-cutting singleton).
- **Request client home:** moved onto `OperatorConsoleService` (+ types to `operator-console.model.ts`),
  matching the service's own class doc ("the console is `StaffDaily`'s successor… this becomes its single
  home") and the one-way import rule; the legacy `StaffService` dies with the `staff/` folder.
- **Are the endpoints present?** Yes — `GET /api/venues/{id}/booking-requests`, `POST …/{bookingId}/
  accept`, `POST …/{bookingId}/decline` are live and owner-asserted (used today by `StaffDaily` via
  `StaffService`; `pendingRequestCount` already on `OperatorConsoleService` backs the O1 badge).
  **Frontend-only confirmed** at the intake grill against today's code.

## Availability & concurrency (invariant #2)

> The tab is a **driving adapter over the *existing* #98 request accept/decline** — no new write path,
> no lifecycle change. This section documents that the restyle preserves the invariants.

- **Write paths to `availability(set_id, booking_date)` in scope:** none written by this tab directly.
  Accept/decline drive the **existing** server flow: on **decline** the server frees the soft-held set;
  on **accept** the set stays held and the booking moves to the pay window (→ confirmed only when the
  Stripe webhook lands). The client sends the same `accept`/`decline` POSTs `StaffDaily` sends today.
- **Uniqueness guarantee:** unchanged — the DB `(set_id, booking_date)` unique constraint and the
  server-side hold/claim (invariant #2) are untouched; the client only triggers the same transitions.
- **Concurrency strategy (client):** on accept/decline **success**, remove that one card locally and
  update the badge (no full re-read — the tab has no grid to reconcile). On **409 `REQUEST_EXPIRED`**
  (lost the race with the sweep), flip the card to the dismissible expired-race state; on
  `REQUEST_NOT_PENDING` / `NO_SUCH_REQUEST` (already handled/gone) drop the stale card with a transient
  notice. No double-action: buttons disable while a decision is in flight and are removed once
  expired-race shows.
- **Pool rule (invariant #3):** unchanged — the tab never assigns pools; online/walk-in separation stays
  server-side.
- **Cutoff rule (invariant #4):** unchanged — the request deadline and the #98 sweep are server-owned;
  the tab reads and displays them, never computes or enforces them.
- **Pinning test:** the invariant itself stays pinned by the existing backend request-lifecycle ITs
  (unchanged). FE side: AC-3/AC-4/AC-5 pin accept/decline/expired-race client behaviour.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend module, port, or event is added or changed. (The `booking` module owns
the request lifecycle it exposes via `/api/venues/{venueId}/booking-requests` — unchanged here.)

### Module ownership (§4a)

N/A — no backend behaviour added or moved; all change is in the Angular `operator/` feature + the
`staff/` deletion. The server-side request-lifecycle + owner-assert (invariant #13) ownership is
unchanged (`booking` + `operator`).

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** unchanged — collect-only via Stripe, **no Connect**. This tab moves no money.
- **Confirmation trigger:** unchanged and **load-bearing here** — accept does **not** confirm the
  booking; it moves the guest to the pay window, and CONFIRMED comes only from the signature-verified
  webhook (invariant #8). The tab never reads or asserts payment state and never self-confirms (R-4).
- **Money:** request `amount` is **displayed** from integer minor units + currency via the existing
  `formatMoney` (invariant #5); nothing is charged/refunded/accrued by this tab.
- **Payout-ledger effect:** none — no confirmation happens here.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/requests-tab.ts` (+ `.html`) | new | standalone console-tab component | signals + `computed` (rows, urgency, deciding set, decline-confirm set, expired set) | none — buttons only, no form control |
| FE-2 | `operator/pending-requests-store.ts` (+ `.spec.ts`) | new | `@Service()` signal store (`count` readonly + `set`/`reset`) | writable signal, readonly out | — |
| FE-3 | `operator/operator-console.service.ts` (+ `.spec.ts`) | modify | add `pendingRequests` / `acceptRequest` / `declineRequest` + `requestErrorOf`; refactor `pendingRequestCount` → `pendingRequests().length`; clean stale `{@link staff}` JSDoc | — | — |
| FE-4 | `operator/operator-console.model.ts` | modify | add `PendingRequestItem`, `RequestDecision`, `RequestErrorCode` (moved from `staff.model.ts`) | — | — |
| FE-5 | `operator/operator-console.ts` (+ `.spec.ts`) | modify | badge reads `PendingRequestsStore.count`; `load()` sets the store; `onSignOut` resets it | signal from store | — |
| FE-6 | `shared/deadline.ts` (+ `.spec.ts`) | modify | add pure `timeLeftLabel(iso, nowMs)` + `isUrgent(iso, nowMs)` | — | — |
| FE-7 | `venue/booking-date.ts` (+ `.spec.ts`) | modify | add pure `formatCivilDate(iso)` (dedup the UTC-anchored LocalDate formatter O5 inlined) | — | — |
| FE-8 | `operator/daily-view-tab.ts` | modify | use `formatCivilDate` for its `dateLabel` (proactive dedup — R-7/Sonar lesson from O5) | unchanged behaviour | — |
| FE-9 | `app.routes.ts` | modify | swap `requests` child from `ConsolePlaceholder` → `RequestsTab`; **delete** `venue-admin/daily/:venueId`; drop `requests` from `CONSOLE_TABS` | — | — |
| FE-10 | `operator/console-placeholder.ts` + `.spec.ts` | modify | drop the `requests` case + the now-dead `daily`/`openDaily` locals; drop the placeholder spec's requests test | — | — |
| FE-11 | `app.spec.ts` | modify | "two legacy operator routes" → **one** (`venue-admin`); six-tab child assertion stays | — | — |
| FE-12 | `frontend/src/index.html` | modify | remove the Google-Fonts `<link>` + the two `fonts.*` preconnects (after grep-clean) | — | — |
| FE-13 | `shared/availability-grid.ts` | modify | correct the stale `staff-daily` doc-comment consumer mention | — | — |
| DEL | `operator/*.a11y.spec.ts` / `*.contrast.spec.ts` for requests | new | axe + composited-AA specs | — | — |
| DEL | `staff/` folder (`staff-daily.*`, `staff.service*`, `staff.model.ts`) | **delete** | legacy page + client retired | — | — |
| DEL | `frontend/e2e/staff-daily.e2e.ts` + `staff-requests.e2e.ts` | **delete** | replaced by `operator-requests.e2e.ts` (daily already covered by `operator-daily.e2e.ts`) | — | — |
| DEL | `frontend/e2e/operator-requests.e2e.ts` | new | CI-safe mocked e2e for the tab | — | — |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`, `inject()`, `@Service()`,
`@if`/`@for`, `class`/`style` bindings (no `ngClass`/`ngStyle`), signals + `computed`, no `as any` on
the contract. Urgency + tile/action state conveyed by accessible name, not colour alone (WCAG AA).
`new Date()` captured once at the component boundary (mirroring `todayBookingDate(new Date())`), never
in the template; the pure `timeLeftLabel`/`isUrgent`/`formatCivilDate` helpers take their inputs
explicitly so they're deterministic in unit tests.

## FE↔BE contract

- **New/changed endpoints:** none. The tab consumes existing owner-asserted endpoints:
  `GET /api/venues/{venueId}/booking-requests` → `PendingRequestItem[]` (no `code`);
  `POST /api/venues/{venueId}/booking-requests/{bookingId}/accept` → `{ bookingId, status }`;
  `POST /api/venues/{venueId}/booking-requests/{bookingId}/decline` → `{ bookingId, status }`.
- **Client typing:** hand-written typed methods on `OperatorConsoleService`; `PendingRequestItem` /
  `RequestDecision` / `RequestErrorCode` in `operator-console.model.ts` (moved verbatim from
  `staff.model.ts`). RFC-7807 `code` mapped by `requestErrorOf` (401 → `UNAUTHORIZED`). No `as any`.
- **Money/date on the wire:** `amount` is integer minor units + ISO currency (#5); `bookingDate` is
  ISO `LocalDate` (Europe/Tirane civil day, #6); `requestedAt` / `requestExpiresAt` are ISO-8601 UTC
  instants, rendered in `Europe/Tirane` via `formatDeadline` (#6). This tab sends no amounts.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — service/model request client + `requestErrorOf`; `PendingRequestsStore`; deadline + civil-date helpers | ✅ | (this commit) — 29/29 scoped specs green, lint clean |
| 1 — `RequestsTab` (queue, accept, decline-confirm, expired-race, empty, badge writes) + unit spec | ✅ | (this commit) — 12 tab specs + daily-view regression green, lint clean |
| 2 — a11y + contrast specs; route swap; shell badge ← store; placeholder `requests` case removed | ✅ | (this commit) — 51 specs (shell/placeholder/app/a11y/contrast/tab) green, lint clean |
| 3 — retirement: delete `staff/` + daily route + `legacySurface`; `app.spec.ts`; doc-comments; grep-clean → font link; delete legacy e2e | ✅ | (this commit) — 60 specs green, build + lint clean; `grep Manrope\|Instrument Serif frontend/src` + `staff` imports clean |
| 4 — CI-safe mocked e2e `operator-requests.e2e.ts` (real-backend spec deferred — see note) | ✅ | (this commit) — full mocked suite 34/34 green |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

### Review gate — self-review (pre-PR, riviera-review-overlay, frontend scope)

Frontend-only diff, no wire-shape change → frontend bank only. Walked against the RV-FE bank + the
three highest-stakes items. **No findings.**
- **#8 (RV-CT-3):** Accept calls `acceptRequest` and reports "asked to pay"/"confirmed" purely from the
  server's returned `status` — never self-confirms, reads no payment state. Held.
- **#7:** the queue is code-less (`PendingRequestItem` has no `code`; no code binding; asserted absent
  by unit + e2e). Held.
- **#13 (RV-BE-9):** no backend change; the server owner-assert on `/api/venues/{venueId}/**` is intact
  (pinned by `CrossVenueDenialIT`); 403 `NOT_VENUE_OWNER` mapped to copy. Held.
- **RV-FE-1/7:** standalone, `inject()`, `@if`/`@for`, signals, `CardGlass` directive (no `@apply`); no
  `ngClass`/`ngStyle`/`as any`/obsolete decorators (grep-clean). AA deviations from the design's lighter
  ambers/gradient documented; the contrast spec is pure maths.
- **RV-FE-2 analogue:** the stale-queue conflict path (409 `REQUEST_EXPIRED` → dismissible expired-race;
  `REQUEST_NOT_PENDING`/`NO_SUCH_REQUEST` → drop + notice) is the graceful recovery.
- **RV-FE-3:** money from minor units (`formatMoney`), dates UTC-anchored (`formatCivilDate`), no float math.
- **RV-FE-E2E:** mocked-suite spec, role/label/test-id locators, per-test `page.route` isolation; no
  coverage lost (daily-ops → `operator-daily.e2e.ts`, requests → `operator-requests.e2e.ts`).
- **RV-PROC-1:** the *Skills consulted* line covers every touched area (FE structure/Angular/Tailwind/e2e).

The formal peer review + Sonar gate run on the PR (Sonar analyzes PRs + `main`); pre-PR local gates green.

---

## File structure

- `frontend/src/app/operator/requests-tab.ts` (+ `.html`) — the new Requests tab.
- `frontend/src/app/operator/requests-tab.spec.ts` — behaviour (AC-1..8).
- `frontend/src/app/operator/requests-tab.a11y.spec.ts` — axe + accessible-name.
- `frontend/src/app/operator/requests-tab.contrast.spec.ts` — composited porcelain AA (card + ambers).
- `frontend/src/app/operator/pending-requests-store.ts` (+ `.spec.ts`) — the badge-sync signal store.
- `frontend/src/app/operator/operator-console.service.ts` (+ `.spec.ts`) — add request client + mapper.
- `frontend/src/app/operator/operator-console.model.ts` — add request types.
- `frontend/src/app/operator/operator-console.ts` (+ `.spec.ts`) — badge from store.
- `frontend/src/app/shared/deadline.ts` (+ `.spec.ts`) — `timeLeftLabel` / `isUrgent`.
- `frontend/src/app/venue/booking-date.ts` (+ `.spec.ts`) — `formatCivilDate`.
- `frontend/src/app/operator/daily-view-tab.ts` — consume `formatCivilDate`.
- `frontend/src/app/app.routes.ts` — `requests` → `RequestsTab`; delete daily route.
- `frontend/src/app/operator/console-placeholder.ts` + `.spec.ts` — drop the `requests` case.
- `frontend/src/app/app.spec.ts` — one legacy operator route.
- `frontend/src/index.html` — remove the Google-Fonts link.
- `frontend/src/app/shared/availability-grid.ts` — doc-comment fix.
- `frontend/e2e/operator-requests.e2e.ts` — CI-safe mocked e2e.
- **Deleted:** `frontend/src/app/staff/**`, `frontend/e2e/staff-daily.e2e.ts`,
  `frontend/e2e/staff-requests.e2e.ts`.
- **Deferred:** `frontend/e2e/real-backend/requests.e2e.ts` — the accept/decline endpoints are
  **unchanged** from what StaffDaily used (backend request-lifecycle ITs cover them), and the
  local-only real-backend suite (never in CI) can't be driven in this session; the CI-safe mocked
  spec is the verified FE coverage. Add it if/when the real-backend suite is next exercised locally.

---

## Phase 0 — Request client + store + helpers (no UI)

**Files:** Modify `operator/operator-console.model.ts`, `operator/operator-console.service.ts`,
`shared/deadline.ts`, `venue/booking-date.ts` · Create `operator/pending-requests-store.ts` · Test
`operator/operator-console.service.spec.ts`, `operator/pending-requests-store.spec.ts`,
`shared/deadline.spec.ts`, `venue/booking-date.spec.ts`.

- [ ] **Step 1 (red):** extend `operator-console.service.spec.ts` — `pendingRequests`/`acceptRequest`/
  `declineRequest` hit the right URLs; `requestErrorOf` maps `REQUEST_EXPIRED`/`REQUEST_NOT_PENDING`/
  `NO_SUCH_REQUEST`/`PAYMENT_INIT_FAILED`/`NOT_VENUE_OWNER`/401→`UNAUTHORIZED`/else→`UNKNOWN`. New
  `pending-requests-store.spec.ts` (`set`/`reset`/readonly). New `deadline.spec.ts` boundary cases
  (`isUrgent` true just under 8h / false at/over; `timeLeftLabel` "45m left" / "3h left"). New
  `booking-date.spec.ts` `formatCivilDate` case.
- [ ] **Step 2:** run the four specs → FAIL (methods/helpers absent).
- [ ] **Step 3 (green):** move `PendingRequestItem`/`RequestDecision` + a `RequestErrorCode` union into
  `operator-console.model.ts`; add the three methods + `requestErrorOf` to `OperatorConsoleService`,
  refactor `pendingRequestCount` to `pendingRequests(venueId).pipe(map(r => r.length))`, and correct the
  stale `{@link ../staff/...}` JSDoc; add `PendingRequestsStore`; add `timeLeftLabel`/`isUrgent` to
  `deadline.ts` and `formatCivilDate` to `booking-date.ts`.
- [ ] **Step 4:** run the four specs → PASS. Broaden: `npm test -- operator shared venue` scope.
- [ ] **Step 5:** generalization pass — `formatCivilDate` extraction (search the inlined
  `Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', … })` block) → log it.
- [ ] **Step 6–7:** commit `[phase 0]`; update the execution table in the same window.

## Phase 1 — RequestsTab component + unit spec

**Files:** Create `operator/requests-tab.ts` (+ `.html`), `operator/requests-tab.spec.ts` · Modify
`operator/daily-view-tab.ts` (use `formatCivilDate`).

- [ ] **Step 1 (red):** `requests-tab.spec.ts` — AC-1 (rows: guest/set+tier/date/price/respond-by, no
  code), AC-2 (urgency chip via far-future vs near `requestExpiresAt`), AC-3 (accept calls service,
  removes card, writes store), AC-4 (decline two-step + "Keep it" cancel), AC-5 (409 `REQUEST_EXPIRED`
  → in-card copy + Dismiss), AC-7 (empty state), AC-8 (403/401 mapping + `sessionLost`), AC-6 (store
  written on load + after actions).
- [ ] **Step 2:** run `requests-tab.spec.ts` → FAIL.
- [ ] **Step 3 (green):** build `RequestsTab` — load venue map (labels/tier, best-effort) + `pendingRequests`;
  `computed` request rows (setLabel, tierName, priceStr, dateLabel via `formatCivilDate`, respondByStr via
  `formatDeadline`, urgent/timeLeft via the helpers with a `now` captured at load); `deciding` /
  `declineConfirm` / `expired` signal sets; accept/decline/dismiss handlers writing the store; cards via
  `CardGlass`; refactor `daily-view-tab.ts` `dateLabel` onto `formatCivilDate`.
- [ ] **Step 4:** `requests-tab.spec.ts` + `daily-view-tab.spec.ts` (regression) → PASS.
- [ ] **Step 5:** generalization pass (accept/decline notice copy vs legacy `decisionNotice`) → log.
- [ ] **Step 6–7:** commit `[phase 1]`; update table.

## Phase 2 — a11y/contrast, route swap, shell badge ← store, placeholder

**Files:** Create `operator/requests-tab.a11y.spec.ts`, `.contrast.spec.ts` · Modify `app.routes.ts`,
`operator/operator-console.ts` (+ `.spec.ts`), `operator/console-placeholder.ts` (+ `.spec.ts`).

- [ ] **Step 1 (red):** a11y + contrast specs; `operator-console.spec.ts` badge-from-store case;
  `console-placeholder.spec.ts` requests-test removed (and the surviving cases still green).
- [ ] **Step 2:** run → FAIL where new.
- [ ] **Step 3 (green):** swap the `requests` route to `RequestsTab` + drop it from `CONSOLE_TABS`; shell
  binds `PendingRequestsStore.count` as `requestsCount`, `load()` sets it, `onSignOut` resets; remove the
  placeholder `requests` case + dead `daily`/`openDaily` locals.
- [ ] **Step 4:** `operator` scope specs + `app.spec.ts` (six tabs still asserted) → PASS.
- [ ] **Step 5:** generalization pass → log if any.
- [ ] **Step 6–7:** commit `[phase 2]`; update table.

## Phase 3 — StaffDaily retirement + font-link removal

**Files:** Delete `staff/**`, `frontend/e2e/staff-daily.e2e.ts`, `frontend/e2e/staff-requests.e2e.ts` ·
Modify `app.routes.ts` (delete daily route), `app.spec.ts`, `operator/operator-console.service.ts` +
`shared/availability-grid.ts` (doc-comments), `frontend/src/index.html`.

- [ ] **Step 1 (red):** update `app.spec.ts` "two legacy operator routes" → **one** (`venue-admin`);
  run → FAIL (daily route still present).
- [ ] **Step 2 (green):** delete the `/venue-admin/daily/:venueId` route; delete the `staff/` folder +
  the two legacy e2e specs; correct the `{@link staff}` doc-comments.
- [ ] **Step 3 (grep guard):** `grep -rn "Manrope\|Instrument Serif" frontend/src` → **clean** (expect
  only historical `docs/plans/*` hits, none under `frontend/src`). `grep -rn "from '.*staff" frontend/src`
  → clean.
- [ ] **Step 4:** remove the Google-Fonts `<link>` + the two `fonts.googleapis`/`fonts.gstatic`
  preconnects from `index.html`.
- [ ] **Step 5:** `npm run lint` + `npm run build` clean; `npm test` (operator/app scope) green.
- [ ] **Step 6–7:** commit `[phase 3]`; update table.

## Phase 4 — CI-safe mocked e2e (+ real-backend)

**Files:** Create `frontend/e2e/operator-requests.e2e.ts` (+ optional `real-backend/requests.e2e.ts`).

- [ ] **Step 1:** author `operator-requests.e2e.ts` — stateful `page.route` queue (mirroring the old
  `staff-requests.e2e.ts` scenarios but through `/operator/:venueId/requests`): list → accept (badge 3→2)
  → decline-confirm → 409 expired-race + Dismiss → empty; `expectNoSeriousAxeViolations` after each; assert
  no code text in the requests region.
- [ ] **Step 2:** `npm run test:e2e:a11y` (the CI mocked suite) green incl. the new spec; the two legacy
  specs already deleted.
- [ ] **Step 3–4:** full pre-PR gate (see verification); commit `[phase 4]`; update table.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-10 | Phase 1 (civil-date label needed on the Requests cards) | the UTC-anchored `Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', weekday, day, month, year })` block | read `daily-view-tab.ts` `dateLabel` | 2 consumers: `DailyViewTab.dateLabel` (inline) + the new `RequestsTab` rows | Extracted `formatCivilDate(iso)` to `venue/booking-date.ts` (next to `parseIsoDate`) and refactored **both** onto it — proactively dedups the identical formatter O5 inlined, pre-empting the Sonar duplication that bit O5's verbatim port. `daily-view-tab.spec.ts` passes unchanged. |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [x] **AC-1..8:** `requests-tab.spec.ts` (12), `pending-requests-store.spec.ts` (2),
  `operator-console.service.spec.ts`, `operator-console.spec.ts` (badge-store seam), `deadline.spec.ts`,
  `booking-date.spec.ts` pass; `daily-view-tab.spec.ts` passes **unchanged** (dedup regression guard).
- [x] **AC-9:** `app.spec.ts` "one legacy operator route" passes; `grep Manrope\|Instrument Serif
  frontend/src` = only the (removed) link, `grep import ...staff frontend/src` clean; `npm run build` clean.
- [x] **AC-10:** `requests-tab.a11y.spec.ts` + `.contrast.spec.ts` pass; e2e axe-clean at each stage.
- [x] **AC-11:** full mocked suite `npm run test:e2e:a11y` 34/34 incl. `operator-requests.e2e.ts`; legacy specs deleted.
- [x] Full gate before PR: `npm run lint` (clean) · `npm test` (585/586 — the 1 failure is the
  pre-existing `booking.service.spec.ts` localStorage-isolation flake, byte-identical to `origin/main`,
  out of scope) · `npm run build` (clean; only pre-existing SCSS-budget warnings) · `npm run test:e2e:a11y` (34/34).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD in the doc.
- [x] Availability section: no new write path; accept/decline drive the existing server flow (restyle only).
- [x] Pool + cutoff (invariants #3/#4) untouched; deadline/sweep/pay-window stay server-owned.
- [x] Modulith / Payment sections justified N/A / unchanged; **accept never self-confirms (invariant #8)**.
- [x] Money displayed from minor units (#5); deadlines rendered in Europe/Tirane (#6).
- [x] Booking codes **absent** from the queue (invariant #7) — no code binding, asserted by spec + e2e.
- [x] Owner-assert preserved: `/api/venues/{venueId}/**` server check unchanged (invariant #13); 403/401 copy mapped.
- [x] Retirement complete: `staff/` gone, daily route + `legacySurface` gone, font link gone, grep-clean.
- [x] Frontend standards met; no `as any`; `PendingRequestsStore` placed in `operator/` per `riviera-frontend`.
- [x] Badge single-source-of-truth: shell + tab both read one store; no drift (AC-6).
- [x] Execution-status table at HEAD matches reality; Open Questions empty.
