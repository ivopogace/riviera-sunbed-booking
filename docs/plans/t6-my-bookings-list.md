# T6 — Guest "My bookings" device-local list (Liquid Glass) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox
> (`- [ ]`) syntax. Riviera discipline: this is a **pure-FE** slice — the Availability,
> Modulith, and Payment sections are `N/A` with reasons, but server-truth (invariants
> #4/#5/#6/#10), booking-code handling (#7), and a11y/contrast are first-class.

**Goal:** Ship the v3 "My bookings" screen (`/my-bookings`, new `booking/my-bookings`):
a **device-local** list of the guest's bookings (no account, no list endpoint — the
booking codes held in `localStorage` are the only key, invariant #7), each row fetched
live by code from `GET /api/bookings/{code}` and rendered as a glass button (venue name,
`Set B7 · date`, an optional status sub-label, the code, the shared status chip, the
amount) that opens the T5 detail view; plus the "No booking yet" empty state and the
"My bookings" header/mobile nav entry. As the **2nd consumer of the status chip**, this
slice **extracts** the chip recipe out of `booking-view` into shared code.

**Architecture:** One new standalone list component + one new `core/` device-local store
(`string[]` of codes in `localStorage`, signal-backed). Rows are an **independent
fetch-per-code fan-out** (the sub-label deadlines need live server data), each row loading/
loaded/failed on its own. Two non-obvious decisions: **(1) store codes only, not a display
snapshot** — the row renders a skeleton while fetching, never stale data, and nothing but
the bearer code is persisted (invariant #7); **(2) the status-chip recipe is extracted by
the rule of three** — the presentational `STATUS_META` map + `metaFor` move to
`shared/booking-status.ts` and the solid-fill CSS to a `shared/_glass.scss` `status-chip`
mixin, both consumed by `booking-view` (refactored, kept green) and the new list.

**Persistence:** JDBC only (invariant #1). N/A — no server persistence touched (pure FE;
device state is `localStorage`).

**Source of intent:** GitHub issue **#139** (epic #133); design
`docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` → *My bookings* list card (`bkList`,
lines ~309–333), empty state (~430–440), `subLineOf` sub-labels (~1330–1338). **The issue
body cites the stale `…v2` design; v3 (PR #147) supersedes it and is the spec built here.**

**Skills consulted:** `riviera-sdlc` (loop orchestration; Issue-intake grill gate run —
findings folded into Open Questions) · `riviera-frontend` (placement: list in `booking/`,
store in `core/`, chip recipe promoted to `shared/`, tokens in `styles.scss`, contrast by
composited math, e2e in the CI-safe suite, one-way import direction) · `angular-developer`
+ angular-cli MCP (`get_best_practices`: v22 signals, `@if`/`@for`, `inject()`, `@Service`,
inline template, a11y, no `new Date()` in components) · `playwright-cli` (author the CI-safe
`my-bookings` e2e; two-suite split — loaded at Phase 7) · `riviera-plan-doc` (this doc) ·
`tdd` (red-green per behavior) · `riviera-review-overlay` (RV-FE-*, RV-FE-E2E, RV-PROC-1 at
review) · `riviera-local-debug` (scoped test/e2e run recipes — loaded before the first `npm`).
No `postgres`/`riviera-modulith`/`riviera-stripe-payments` — no DB, no backend Java, no money
*logic* (money is display-only via `shared/money.ts`).

**Branch:** `feature/t6-my-bookings-list` (created before Phase 0; local session on `main`,
stands in for a remote session branch).

---

## Acceptance criteria (testable)

> Phrased at the component/service boundary (what the rendered surface shows for given
> stored codes + server `BookingDetail`s), not pixel level. Pinned by
> `device-local-bookings.spec.ts`, `booking.service.spec.ts`, `my-bookings.spec.ts`,
> `my-bookings.contrast.spec.ts`, `booking-status.spec.ts`,
> `booking-status.contrast.spec.ts`, `app.spec.ts`, and the CI-safe e2e.

- [ ] **AC-1 (remember on create, all 3 outcomes, deduped):** Given a successful booking
  create returning `confirmed` / `awaiting` / `requested`, when the response is handled, then
  the booking `code` is stored in `DeviceLocalBookings` (`localStorage`) exactly once even if
  created/seen twice. *Pinned by:* `device-local-bookings.spec.ts` "remembers and dedupes
  codes" + `booking.service.spec.ts` "remembers the code for each create outcome".
- [ ] **AC-2 (row per code from server truth):** Given 3 remembered codes, when the list
  loads, then it issues `GET /api/bookings/{code}` per code and renders one glass **button**
  row each showing the venue name, `Set {rowLabel}{positionNo} · {date}`, the code, the status
  chip with the design label, and `formatMoney(amount)`. *Pinned by:* `my-bookings.spec.ts`
  "renders a row per remembered code from the fetched detail".
- [ ] **AC-3 (per-row status sub-label, server-adjacent):** Given a fetched detail of each
  status, when the row renders, then the sub-label reads: `AWAITING_PAYMENT`→"Payment needed",
  `PENDING_REQUEST`→"Awaiting host · by {formatDeadline(requestExpiresAt)}" (or "Awaiting host
  reply" when no deadline), `DECLINED`→"Host could not accept", `EXPIRED`→"Request expired
  unanswered", `CANCELLED`→"Booking cancelled", `COMPLETED`→"Enjoyed · thanks for visiting",
  `NO_SHOW`→"Marked as no-show", `CONFIRMED`→(no sub-label). *Pinned by:* `my-bookings.spec.ts`
  "renders the design sub-label for every status".
- [ ] **AC-4 (row opens the T5 detail):** Given a rendered row for code `C`, when it is
  activated (click/Enter), then the app navigates to `/booking/C`. *Pinned by:*
  `my-bookings.spec.ts` "a row links to its /booking/:code detail" + the e2e.
- [ ] **AC-5 (unknown code silently dropped):** Given a remembered code the server answers
  `404`, when the list loads, then the code is removed from `DeviceLocalBookings` and no row
  (and no error) is shown for it. *Pinned by:* `my-bookings.spec.ts` "drops a 404 code
  silently and forgets it".
- [ ] **AC-6 (transient failure kept + retryable):** Given a remembered code whose fetch fails
  transiently (status 0/≥500), when the list loads, then the code is **not** forgotten and the
  row shows a "Couldn't load" state with a Retry control that re-fetches that one code.
  *Pinned by:* `my-bookings.spec.ts` "keeps a transiently-failed code and retries it".
- [ ] **AC-7 (empty state):** Given no remembered codes (or all dropped as 404), when the list
  settles, then the "No booking yet" glass card renders with the "Browse beaches" CTA to `/`
  and **no** Find-by-code button (deferred to T8/#148). *Pinned by:* `my-bookings.spec.ts`
  "shows the empty state with Browse beaches and no find-by-code button".
- [ ] **AC-8 (nav entry, desktop + mobile):** Given the shell, the desktop primary nav and the
  mobile menu each expose a "My bookings" link to `/my-bookings`. *Pinned by:* `app.spec.ts`
  "lists a My bookings nav entry on desktop and mobile".
- [ ] **AC-9 (route un-legacied):** Given the app routes, `my-bookings` carries no
  `legacySurface` flag and appears in `RESTYLED_PATHS`. *Pinned by:* `app.spec.ts` "marks every
  not-yet-restyled route…".
- [ ] **AC-10 (chip extraction, booking-view unchanged behavior):** Given the shared chip
  recipe, `booking-view` imports `STATUS_META`/`metaFor` from `shared/booking-status.ts` and
  `@include`s the shared `status-chip` mixin, and every existing `booking-view.spec.ts` /
  `booking-view.contrast.spec.ts` assertion (labels, `data-testid="booking-status"`, chip AA)
  stays green. *Pinned by:* the existing booking-view specs (unchanged) + `booking-status.spec.ts`.
- [ ] **AC-11 (a11y, all states, both themes):** Given the populated / loading / failed /
  empty list, when rendered, then `expectNoAxeViolations` passes; each booking row is a native
  `<button>` reachable by keyboard with an accessible name including venue + status. *Pinned
  by:* `my-bookings.spec.ts` axe assertions + the e2e axe run.
- [ ] **AC-12 (contrast, both themes):** Given riviera + porcelain, every row/empty-state text
  pair meets AA over the worst-case card-glass stops, and every status chip meets AA on its
  solid fill. *Pinned by:* `my-bookings.contrast.spec.ts` (card-glass pairs) +
  `booking-status.contrast.spec.ts` (the 8 chip solids — the single home of that assertion).
- [ ] **AC-13 (server-truth, no client date/money math):** Given any status, the component
  performs **no** `Date`/cutoff arithmetic (PENDING deadline via the shared `formatDeadline`
  from `requestExpiresAt`; AWAITING has no pay-by field → "Payment needed"), and every amount
  is `formatMoney(detail.amount)` from integer minor units. *Pinned by:* `my-bookings.spec.ts`
  "PENDING_REQUEST shows the Tirane deadline" + the source has no `Date`/`new Date`/math.
- [ ] **AC-14 (e2e, CI-safe suite):** book → the booking appears under My bookings → open its
  detail → cancel → return to My bookings → the row shows the `Cancelled` chip; axe green in
  both themes. *Pinned by:* `frontend/e2e/my-bookings.e2e.ts`.
- [ ] **AC-15 (invariant #7 — code confinement):** The code is persisted only in `localStorage`
  and sent only to the existing `GET /api/bookings/{code}`; it is never `console.*`-logged.
  *Pinned by:* source review + a grep gate in Phase 1 (no `console` in the store/list touching
  the code).

## Non-goals

- **Find-by-code button + "Find a booking" nav entry** — the v3 design shows a Find-by-code
  chip in the list header and empty state, but both route to **T8 (#148)**, which is not built.
  **Decision (user, this session): defer to T8** — T6 omits the button; #148 adds it and the nav
  entry when it ships. No dead link.
- **A live AWAITING_PAYMENT pay-by countdown** — `BookingDetail` exposes no pay-hold instant
  (only `requestExpiresAt`, the venue *response* deadline; `payment` = intent creds). A real
  pay-by field is a backend contract change, which **epic #133 forbids** ("without changing
  backend contracts"). Sub-label falls back to "Payment needed".
- **A live relative countdown** ("2h left") — the design shows relative time; **decision (user):
  render the absolute deadline** via the shipped `formatDeadline` (Europe/Tirane), avoiding
  client clock math/skew and matching T5.
- **The "Request withdrawn" CANCELLED sub-variant** — needs a `withdrawn` field the API lacks
  (guest withdraw is backend #123, unshipped). CANCELLED always reads "Booking cancelled".
- **A stored display snapshot** — codes only; the row shows a skeleton while fetching, not
  stale data (cleaner invariant #7, no `core/`→feature `MoneyView` import).
- **Status-priority sort** — rows render newest-first (store insertion order), a stable order
  under async per-row loads; the design's action-needed-first sort is deferred (not an AC).
- **Account-backed my-bookings** — epic #108/#114. At close-out, record the coexistence rule
  (account list later supersedes/merges the device-local list) on **#114** per the issue.
- **Extracting the status *banner* recipe** — the banner has only one consumer (the T5 detail
  view); the list reuses the **chip** only. Banner stays local to `booking-view.scss` (rule of
  three: still 1st consumer).
- **Backend/API changes** — pure FE; the `BookingDetail` contract is consumed as-is.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Transient failure misclassified as "gone" → a valid booking silently dropped from the device (data loss; the code may be the guest's only key, invariant #7) | med | high | Drop **only** on `404` (and 410 if seen); status `0`/`≥500`/parse → keep + retry row. Unit-pin both branches (AC-5, AC-6) | agent | open |
| R-2 | Chip extraction breaks `booking-view` labels / `data-testid="booking-status"` / contrast → T5 regression | med | high | Move `STATUS_META`/`metaFor` verbatim to `shared/booking-status.ts` + a `status-chip` mixin with the **exact** T5 solid values; run booking-view unit+contrast specs green before/after (AC-10) | agent | open |
| R-3 | The two contrast specs duplicate the chip ink/fill array → SonarCloud `common-*:DuplicatedBlocks` at the Sonar gate | med | med | The 8-chip assertion lives in **one** spec (`booking-status.contrast.spec.ts`); remove the CHIPS block from `booking-view.contrast.spec.ts`; `my-bookings.contrast.spec.ts` asserts only card-glass pairs | agent | open |
| R-4 | `&ngsp;` / middot spacing gotcha in `Set B7 · {date}` and `Awaiting host · by {deadline}` glues words for AT + substring assertions (the T2/T5 lesson) | high | low | Explicit `·` with literal spaces / `&ngsp;`; assert rendered `textContent` in the unit spec | agent | open |
| R-5 | Chip/row contrast eyeballed → AA regression in one theme | low | high | All pairs computed + asserted (`expectAaOverStops` for card glass, `contrastRatio` for solids); values reuse T5's pre-verified set | agent | open |
| R-6 | Malformed/oversized `localStorage` (hand-edited, quota, private mode throw) crashes the store | low | med | `try/catch` around parse+write; parse failure → treat as empty; never throw to the component | agent | open |
| R-7 | Amount shown on a no-charge row (DECLINED/EXPIRED/PENDING/AWAITING) reads as "paid" | low | med | Faithful to the v3 design (amount always shown); chip + sub-label carry the state. Flag to the review gate; adjust to a Paid/Amount label only if review calls it | agent | open |
| R-8 | e2e copy assertions break when list/detail copy is reworded | med | low | Assert stable phrases + `data-testid`s; preserve booking-view testids | agent | open |

## Open questions / Assumptions

- **Assumption (resolved by evidence):** `AWAITING_PAYMENT` has no server pay-by deadline
  (`BookingDetail` exposes only `requestExpiresAt` + `payment` creds) → sub-label "Payment
  needed". *Owner:* agent · *Resolved:* Phase 0 (design read).
- **Assumption:** store **codes only** (no snapshot) satisfies the issue's "stored display data
  is only a fallback while loading" — the fallback is a skeleton, not stale data. *Owner:* agent
  · *Resolves by:* Phase 1.

### Resolved (Issue-intake grill gate, this session)

- **Design version** — issue #139 cites `…v2`; **v3 (PR #147) is the spec** (epic #133).
  Build to v3.
- **Nav entry does not exist yet** — `app.html` lists only *Beaches* + theme picker (no "My
  bookings"). The prompt's "already listed — wire the route" was inaccurate; **T6 adds** the
  entry to desktop nav + mobile menu (in scope per the issue).
- **Find-by-code button** → **deferred to T8** (user decision).
- **Wait-time label** → **absolute deadline** via `formatDeadline` (user decision).
- **In flight:** zero open PRs → no shared-file/route collision; branch off clean `main`.

## Availability & concurrency (invariant #2)

N/A — pure FE. No write path to `availability(set_id, booking_date)`. The list only issues the
existing read `GET /api/bookings/{code}`; opening a row and cancelling reuse the unchanged T5
detail view (which calls the existing backend). No concurrency surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend Java, no module boundary, no event, no `api/` port touched.

## Payment & payout (invariants #5, #8, #9, #10)

- **Money:** display only — the row amount is `formatMoney(detail.amount)` from integer minor
  units + ISO currency (invariant #5). No arithmetic in the component.
- **Refund/lifecycle (invariants #4/#10):** the row shows the server's status + amount verbatim;
  cancellation/refund still happen only in the T5 detail view from server data. No client
  cutoff/date math (PENDING deadline via the shared `formatDeadline`). Webhook-as-truth (#8) is
  untouched — the list never confirms anything.
- **Payout:** N/A — not touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `core/device-local-bookings.ts` | **new** | `@Service()` singleton | `signal<string[]>` seeded from `localStorage`, write-through | — |
| FE-2 | `core/device-local-bookings.spec.ts` | **new** | unit | — | — |
| FE-3 | `booking/my-bookings.ts` (+ `.scss`) | **new** | standalone component | signals: per-row state array (`loading`/`loaded`/`failed`), `inject()` store + `BookingService` + `Router` | none |
| FE-4 | `booking/my-bookings.spec.ts` | **new** | unit + axe | — | — |
| FE-5 | `booking/my-bookings.contrast.spec.ts` | **new** | contrast | composited-math AA (card glass, both themes) | — |
| FE-6 | `shared/booking-status.ts` | **new** (moved from `booking-view.ts`) | pure module | `STATUS_META` (string-keyed) + `metaFor` + `humanizeStatus` | — |
| FE-7 | `shared/booking-status.spec.ts` | **new** | unit | exhaustiveness of the 8 labels/chips | — |
| FE-8 | `shared/booking-status.contrast.spec.ts` | **new** (moved chip block from booking-view) | contrast | the 8 chip ink/fill solids (theme-independent) | — |
| FE-9 | `shared/_glass.scss` | existing (add `status-chip` mixin) | Sass partial | base `.chip` + `.chip--*` solid fills | — |
| FE-10 | `booking/booking-view.ts` | existing (refactor) | component | import `STATUS_META`/`metaFor` from `shared/booking-status` (behavior unchanged) | — |
| FE-11 | `booking/booking-view.scss` | existing (refactor) | stylesheet | `@include glass.status-chip` in place of local chip block | — |
| FE-12 | `booking/booking-view.contrast.spec.ts` | existing (trim) | contrast | keep card/banner/button; drop the CHIPS block (now in FE-8) | — |
| FE-13 | `booking/booking.service.ts` | existing (one hook) | `@Service()` | `remember(code)` on each create outcome | — |
| FE-14 | `booking/booking.service.spec.ts` | existing (extend) | unit | assert remember-on-create | — |
| FE-15 | `app.html` | existing (add nav links) | shell template | "My bookings" desktop + mobile links | — |
| FE-16 | `app.routes.ts` | existing (add route) | routes | `my-bookings` lazy, no `legacySurface` | — |
| FE-17 | `app.spec.ts` | existing (add tests) | unit | nav-entry test + `'my-bookings'` in `RESTYLED_PATHS` | — |
| FE-18 | `frontend/e2e/my-bookings.e2e.ts` | **new** | e2e (CI-safe) | mocked API, axe both themes | — |

**Standards:** standalone (default), `inject()`, `@Service()`, `@if`/`@for` (`track` by code),
signals + `computed`, inline template if compact (else `my-bookings.html`), `shared/money.ts`
for money, `shared/booking-date-label.ts` for the date, `shared/deadline.ts` for the PENDING
deadline, no `as any`, **no `new Date()`/date math in the component**. Rows are native
`<button>`s (keyboard + AT). Reduced-motion guard beside any hover transition.

**Import direction (riviera-frontend):** `booking/` (feature) → `core/` (store) + `shared/`
(status/money/date) — allowed. `core/device-local-bookings.ts` imports **nothing app-internal**
beyond `shared/` (codes are plain strings; no `MoneyView`). `shared/booking-status.ts` is pure
and string-keyed — it does **not** import the `BookingStatus` domain type from `booking/`
(preserving `shared → nothing`); exhaustiveness of the 8 statuses is guarded by
`booking-status.spec.ts`, not the compiler.

## FE↔BE contract

N/A — no contract change. `GET /api/bookings/{code}` (`BookingDetail`) consumed exactly as the
T5 detail view does. The list adds no endpoint (there is deliberately no guest list endpoint —
invariant #7: the codes are the key, held on-device).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | 9f62725 |
| 1 — `core/device-local-bookings` store (unit red→green) | ✅ | (impl commit) |
| 2 — `remember` on create in `BookingService` (unit) | ✅ | (impl commit) |
| 3 — Extract chip → `shared/booking-status.ts` + `_glass.scss` mixin; refactor booking-view green | ✅ | (impl commit) |
| 4 — `my-bookings` component: rows, sub-labels, 404-drop, transient-retry, empty state (unit + axe) | ✅ | (impl commit) |
| 5 — `my-bookings.scss` glass + `my-bookings.contrast.spec.ts` + shared chip contrast spec | ✅ | (impl commit) |
| 6 — Route + nav entry + `app.spec.ts` (RESTYLED_PATHS + nav test) | ✅ | (impl commit) |
| 7 — e2e (CI-safe `my-bookings.e2e.ts`); font-link re-check | ✅ | (impl commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window.

---

## File structure

- `docs/plans/t6-my-bookings-list.md` — this plan.
- `frontend/src/app/core/device-local-bookings.ts` — `@Service()`; `signal<string[]>` +
  `localStorage` (key `riviera.bookings.v1`); `remember(code)`, `codes()`, `forget(code)`;
  parse/write in `try/catch`; never logs a code.
- `frontend/src/app/core/device-local-bookings.spec.ts` — dedupe, persistence, forget,
  malformed-storage tolerance.
- `frontend/src/app/shared/booking-status.ts` — `StatusMeta`, string-keyed `STATUS_META`,
  `metaFor`, `humanizeStatus` (moved verbatim from `booking-view.ts`).
- `frontend/src/app/shared/booking-status.spec.ts` — every #98 status → exact design
  label/chip/amount; unknown status → humanized fallback.
- `frontend/src/app/shared/booking-status.contrast.spec.ts` — the 8 chip ink/fill solids AA
  (moved from `booking-view.contrast.spec.ts`).
- `frontend/src/app/shared/_glass.scss` — add `@mixin status-chip` (base `.chip` + `.chip--*`).
- `frontend/src/app/booking/my-bookings.ts` (+ `.scss`) — the list component.
- `frontend/src/app/booking/my-bookings.spec.ts` — rows, sub-labels, nav, 404-drop,
  transient-retry, empty, axe.
- `frontend/src/app/booking/my-bookings.contrast.spec.ts` — card-glass row/empty text AA both
  themes.
- `frontend/src/app/booking/booking-view.ts` / `.scss` / `.contrast.spec.ts` — refactor onto
  the shared status source + `status-chip` mixin; trim the moved chip block.
- `frontend/src/app/booking/booking.service.ts` / `.spec.ts` — `remember(code)` on create.
- `frontend/src/app/app.html` — "My bookings" nav links (desktop + mobile).
- `frontend/src/app/app.routes.ts` — `my-bookings` route (no `legacySurface`).
- `frontend/src/app/app.spec.ts` — nav-entry test + `'my-bookings'` in `RESTYLED_PATHS`.
- `frontend/e2e/my-bookings.e2e.ts` — CI-safe mocked e2e (book→list→detail→cancel→Cancelled).

---

## Phases (TDD)

Each phase is red → green → refactor, scoped to the touched specs (never the full suite
locally; see `riviera-local-debug`). Run recipe per phase: `npm test -- <spec filter>`.

- **Phase 1 — Device-local store.** Failing `device-local-bookings.spec.ts`: remembers a code,
  dedupes a repeat, persists across a fresh service instance (same `localStorage`), `forget`
  removes it, malformed JSON → empty (no throw). Green: the `@Service()` with a
  `localStorage`-seeded `signal<string[]>`, write-through, `try/catch`. Grep gate: no `console`
  referencing the code (invariant #7).
- **Phase 2 — Remember on create.** Failing `booking.service.spec.ts`: each of the three create
  responses (201 confirmed / 202 awaiting / 202 requested) calls `DeviceLocalBookings.remember`
  with the returned code. Green: inject the store, `remember(...)` in each branch of the
  `createBooking` map.
- **Phase 3 — Extract the chip.** Move `STATUS_META`/`metaFor`/`humanizeStatus` to
  `shared/booking-status.ts` (string-keyed `Record<string, StatusMeta>`); add
  `booking-status.spec.ts` (8 statuses + fallback). Add `@mixin status-chip` to `_glass.scss`
  with the **exact** T5 fills. Refactor `booking-view.ts` to import from `shared/booking-status`
  and `booking-view.scss` to `@include glass.status-chip`; move the CHIPS assertion to
  `shared/booking-status.contrast.spec.ts` and delete it from `booking-view.contrast.spec.ts`.
  Green: **all** booking-view unit + contrast specs unchanged-and-passing (AC-10).
- **Phase 4 — The list component.** Failing `my-bookings.spec.ts` cases: a row per remembered
  code from a mocked `BookingService.getByCode`; the exact sub-label per status; row is a
  `<button>` linking to `/booking/:code`; a `404` code is forgotten + no row; a transient (500)
  code stays + shows Retry that re-fetches; empty state (no codes) with "Browse beaches" and no
  find-by-code button; axe green. Green: the component (fetch-per-code fan-out into a per-row
  signal; `metaFor` for chip/label; `subLineOf` local helper using `formatDeadline`;
  `formatMoney`/`formatBookingDate`).
- **Phase 5 — SCSS + contrast.** `my-bookings.scss`: card-glass rows (`@include glass.card-glass`
  + `status-chip`), reduced-motion guard on the hover lift. `my-bookings.contrast.spec.ts`:
  `expectAaOverStops` for card-ink/-soft/accent over both themes + the "Browse beaches" CTA
  white on `--riv-cta-grad` + the Retry outline ink on `#f4f6f7`.
- **Phase 6 — Route + nav.** Add the `my-bookings` route (no flag); add "My bookings" links to
  the desktop nav + mobile menu in `app.html`; extend `app.spec.ts` with the nav-entry test and
  add `'my-bookings'` to `RESTYLED_PATHS`. Run `app.spec.ts` green.
- **Phase 7 — e2e + font check.** Load `playwright-cli`. New CI-safe `my-bookings.e2e.ts`:
  seed a code (or run the book flow) with `page.route` mocks → `/my-bookings` shows the row →
  open detail → cancel → back on the list the chip reads `Cancelled`; `expectNoSeriousAxeViolations`
  in both themes (await `getAnimations().finished` first). Run:
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` (cloud path).
  Re-grep `Manrope|Instrument Serif` in `frontend/src` — `staff-daily.scss` still consumes both
  (operator epic #141), so **keep** the `index.html` font `<link>`; T6 is not the last consumer.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-03 | Phase 1 (fake-localStorage helper) | inline Map-backed localStorage fakes | `grep -rn "installFakeStorage" frontend/src` | `theme.spec.ts` (inline copy) + the new store spec would be a 2nd copy | Extracted `testing/fake-storage.ts`; refactored `theme.spec.ts` + the new spec onto it (pre-empts a Sonar duplicated-block finding). |
| 2026-07-03 | Phase 3 (chip extraction) | the status-chip recipe's consumers | `grep -rn "STATUS_META\|chip--" frontend/src` | `booking-view` (1st) + `my-bookings` (2nd) | Promoted the chip recipe to `shared/booking-status.ts` + `_glass.scss` `status-chip` mixin; single contrast home. Rule of three met at the 2nd consumer. |
| 2026-07-03 | Phase 7 (e2e helpers) | duplicated `settle`/`completeDialog` in e2e specs | `grep -rn "async function settle\|completeDialog" frontend/e2e` | `booking-flow` + `request-to-book` (`settle`), `booking-flow` (`completeDialog`) — my new spec would be a 3rd | Extracted `e2e/support/booking-dialog.ts`; refactored both existing consumers + the new spec onto it (dedup; keeps the Sonar gate clean). |
| 2026-07-03 | Phase 7 (font-link close-out) | Manrope / Instrument Serif consumers | `grep -rn "Manrope\|Instrument Serif" frontend/src` | `staff-daily.scss` (still uses both) + `index.html` (the link) | Keep the `<link>` — `staff-daily` (operator epic #141) is the true last consumer; T6 is not. |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1..AC-7, AC-13:** `npm test -- device-local-bookings booking.service my-bookings` → green.
- [ ] **AC-8, AC-9:** `npm test -- app.spec` → green (nav entry + `RESTYLED_PATHS`).
- [ ] **AC-10:** `npm test -- booking-view booking-status` → green (booking-view unchanged;
  shared status source exhaustive).
- [ ] **AC-11, AC-12:** `npm test -- my-bookings booking-status.contrast` → axe + contrast green.
- [ ] **AC-14:** `npm run test:e2e:a11y my-bookings` → green (book→list→detail→cancel→Cancelled + axe).
- [ ] **AC-15:** `grep -rn "console" frontend/src/app/core/device-local-bookings.ts
  frontend/src/app/booking/my-bookings.ts` → no code logging.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc or code.
- [ ] No JPA (N/A — FE). Availability/module/payment logic unchanged (all N/A with reasons).
- [ ] Money via `shared/money.ts`, minor units (invariant #5); no client date/cutoff math
  (invariants #4/#6) — PENDING deadline via shared `formatDeadline`.
- [ ] Booking codes: stored only in `localStorage`, sent only to `GET /api/bookings/{code}`,
  never logged (invariant #7).
- [ ] Chip extraction: booking-view specs + testids green; no chip-value drift; one contrast
  home for the chips (no Sonar duplication).
- [ ] Frontend standards met; no `as any`; import direction one-way; a11y (axe + `<button>` rows
  + keyboard) proven.
- [ ] Contrast proven both themes; deviations commented.
- [ ] Route un-legacied + `RESTYLED_PATHS` updated; nav entry present desktop + mobile; e2e green.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty/deferred.
- [ ] Close-out: tick epic #133 T6; update the T5 chip note to "extracted at T6"; record the
  #114 coexistence rule; keep the font `<link>`; run `riviera-docs-freshness`.
</content>
</invoke>
