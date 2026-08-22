# Availability Calendar UI Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Replace the venue page's bare `<input type="date">` with a custom calendar
popover that shows each day's free/total set count before the tourist commits to a date,
at keyboard and screen-reader parity with (or better than) the native input.

**Architecture:** The calendar is a **venue-feature component** (`venue/availability-calendar.ts`)
that reads the shipped `GET /api/venues/{id}/availability-calendar` one visible month at a
time and emits a chosen ISO day; `venue-map.ts` stays the **single writer** of `selectedDate`,
so the map re-fetch and the booking dialog's seeded date keep agreeing by construction. The
single most significant decision is to **hand-roll the ARIA grid** (roving tabindex on the
`shared/segmented-control.ts` precedent + `shared/focus-trap.ts`) rather than add
`@angular/aria` — see *Rejected alternatives*.

**Persistence:** JDBC only (invariant #1). N/A — frontend-only slice; no tables, no migration.

**Source of intent:** GitHub issue **#761** (slice B of epic **#706**); the read it consumes
shipped in **#760** / PR #762. Glossary: `CONTEXT.md` § *Availability calendar*.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that
`onDateChange` is `Event`-typed and must change signature, that a map-read failure destroys the
header the trigger lives in, and that the calendar fetch needs its own generation guard) ·
`riviera-plan-doc` (this template — forced the behavior-parity ledger that surfaced the loss of
native type-a-date, answered with Shift+PageUp/PageDown year nav) · `tdd` (every phase below is
red→green→refactor; pure date math and tint vocabulary are tested before the component that uses
them) · `riviera-review-overlay` (review gate — RV-FE-E2E placed the new spec in the CI-run mocked
suite; RV-FE-8 checked that no new cross-feature import is introduced) · `riviera-docs-freshness`
(**pending — runs at merge close-out over the slice's merge span**) · `riviera-frontend` (placement:
the popover is venue-feature-local because #761 scopes out the other three date fields; the
`DailyAvailability` response mirror belongs in `shared/venue-views.ts`) · `riviera-tailwind`
(Tailwind-only styling, opaque solid tints so the contrast proof needs no per-theme compositing,
new tokens declared once in the `:root` block and overridden in porcelain only where the value
must differ, `appTouchTarget` on all 42 day cells) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 posture: `input()`/`output()`, no `@HostListener`, no explicit
`OnPush`, `@Service`; `angular-aria.md` surfaced `@angular/aria`'s `ngGrid`, considered and
rejected below) · `playwright-cli` (**loads at phase 7**, before the e2e spec is authored).

**Branch:** `claude/availability-calendar-ui-sycn3r` — **cloud-session substitution** for the
local `feature/availability-calendar-ui` convention (`riviera-sdlc` § *Remote / cloud session
addendum*). Branched from `origin/main` at `7d93a3f`.

---

## Acceptance criteria (testable)

> Written at the component boundary — the frontend's inner hexagon is the calendar's own
> inputs/outputs and the pure functions beneath it, not the rendered pixel.

- [ ] **AC-1:** Given a venue whose calendar read answers `free`/`total` per day, when the picker
  is opened, then every day cell of the visible month carries a tint state derived from that day's
  counts and a capacity bar whose width is `free / total`.
  *Pinned by:* `availability-calendar.spec.ts` › `renders a tint and a capacity bar per day of the visible month`.
- [ ] **AC-2:** Given the picker is open on month M, when the user navigates to M±1, then exactly one
  new calendar request is issued for that month's inclusive bounds and the grid re-renders from its
  response.
  *Pinned by:* `availability-calendar.spec.ts` › `refetches on month navigation`.
- [ ] **AC-3:** Given any day with counts, then its accessible name is
  `"<Wed 26 Aug 2026>, <free> of <total> sets free"` — the exact integers, never a tint word alone.
  *Pinned by:* `day-availability.spec.ts` › `the accessible name carries the exact counts`.
- [ ] **AC-4:** Given today and any past day, when the grid renders, then those cells are present,
  carry `aria-disabled="true"`, announce `"not bookable"`, are reachable by arrow keys, and
  `Enter`/`Space` on them emits nothing.
  *Pinned by:* `availability-calendar.spec.ts` › `today and past days are announced disabled and cannot be selected`.
- [ ] **AC-5:** Given the picker is open, when the user presses `ArrowLeft/Right` (±1 day),
  `ArrowUp/Down` (±7 days), `Home`/`End` (week bounds), `PageUp`/`PageDown` (∓/±1 month),
  `Shift+PageUp`/`Shift+PageDown` (∓/±1 year), then focus moves accordingly without committing a
  selection; `Enter`/`Space` commits the focused day; `Escape` closes and returns focus to the trigger.
  *Pinned by:* `availability-calendar.spec.ts` › the `keyboard` describe (one case per key).
- [ ] **AC-6:** Given the picker is open, when the user Tabs past the last focusable control, then
  focus wraps inside the popover and never reaches the page behind it.
  *Pinned by:* `availability-calendar.spec.ts` › `traps focus while open`.
- [ ] **AC-7:** Given the month label changes, then it is rendered inside an `aria-live="polite"`
  region so the change is announced.
  *Pinned by:* `availability-calendar.spec.ts` › `announces the month change`.
- [ ] **AC-8:** Given the calendar read fails, then the grid still renders and stays fully
  selectable, every day reads `"availability unknown"`, and a non-blocking note says the counts
  could not be loaded — the picker never becomes unusable because a decorative read failed.
  *Pinned by:* `availability-calendar.spec.ts` › `degrades to a usable picker when the counts fail`.
- [ ] **AC-9:** Given a day is chosen, when the popover emits it, then `venue-map` sets
  `selectedDate` once, closes any open set dialog, re-fetches the map for that day, and the booking
  dialog opened afterwards is seeded with the same day.
  *Pinned by:* `venue-map.spec.ts` › `the calendar's chosen day drives the map re-fetch and the dialog seed`.
- [ ] **AC-10:** Given both themes, then the day ink reads ≥ 4.5:1 on each of the three tint fills,
  the capacity-bar fill reads ≥ 3:1 against its track, and the focus ring reads ≥ 3:1 against every
  tint (WCAG 1.4.3 / 1.4.11).
  *Pinned by:* `availability-calendar.contrast.spec.ts`.
- [ ] **AC-11:** `npm run test:a11y` is green including the open popover, and
  `node scripts/check-touch-target.mjs --diff origin/main` reports no TT-1/TT-2 violation.
  *Pinned by:* `availability-calendar.a11y.spec.ts` + the guard run recorded in AC verification.
- [ ] **AC-12:** Given the mocked e2e suite, when it opens the picker, navigates a month and picks a
  day, then the venue map request for that exact `date=` is observed.
  *Pinned by:* `frontend/e2e/availability-calendar.e2e.ts`.
- [ ] **AC-13:** No request the calendar issues spans more than 62 days, so the server's window cap
  can never be tripped by month navigation.
  *Pinned by:* `availability-calendar.spec.ts` › `never requests a window wider than the server cap`.

## Non-goals

- The Discover date field (`pages/home/home.html:87`) and the two operator-console date fields —
  #761 scopes these out explicitly; rolling the calendar out there is a separate decision.
- Writing the chosen date back to the URL (`?date=`). Today's picker deliberately does not
  navigate; that stays true.
- A far-future booking horizon. None exists in the domain (no `horizon` config on the backend), so
  forward month navigation stays unbounded.
- Free-text date entry. See the behavior-parity ledger.
- Prefetching or caching adjacent months beyond the trivial per-month memo described in phase 3.
- Any backend change. The read shipped in #760 and is consumed as-is.

## Behavior-parity ledger

> The slice replaces `venue-map.html:92-108`'s native `<input type="date" id="map-date">`.

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| `[min]="minDate()"` floors selection at tomorrow (Europe/Tirane) | preserved | Same `minDate()` signal; days `< minDate` render `aria-disabled="true"` and reject `Enter`/`Space` (AC-4). |
| `[value]="selectedDate()"` reflects the current day | preserved | The trigger button's label is `formatCivilDate(selectedDate())`; the matching cell carries `aria-selected="true"`. |
| `(change)` re-fetches the map and closes the open set dialog | preserved | `onDateChange(value: string)` keeps the identical guard/close/set/load body; only the parameter type changes (`Event` → `string`). |
| Native picker's own keyboard + AT behaviour | changed | Fully replaced by the ARIA grid pattern (AC-5, AC-6, AC-7) — the point of the slice, and the bar #706 accepted explicitly. |
| **Typing a date directly into the field** | **dropped** | A button trigger has no text entry; adding one would require a parse/validate/error surface #761 does not ask for and would re-introduce the "one control, one behaviour" split #706 rejected. **Mitigated:** `PageUp`/`PageDown` move by month and `Shift+PageUp`/`Shift+PageDown` by year, so a distant date is a handful of keystrokes rather than dozens of arrow presses. Year nav is *not* in #761's key list — it is added here specifically to close this gap. |
| Native calendar UI on mobile | changed | Deliberately: #706 chose the custom popover on every viewport so mobile is not withheld the signal. |
| `scheme-light` styling of the native widget | dropped | No native widget remains; the popover carries its own near-opaque surface. |
| `<label for="map-date">Date</label>` associates the caption | changed | A `<label>` cannot label a `<button>`. The visible "DATE" caption stays and is wired with `aria-labelledby`, so the accessible name is still `"Date, <the current day>"`. |
| `data-testid="map-date"` query hook | preserved | Kept on the trigger button (`riviera-tailwind` rule 2 — never make a styling/structure change force a test rewrite). |
| `appTouchTarget` on the control | preserved | On the trigger and on all 42 day cells. |
| The `<p appCutoffNote>` sentence below the field | preserved | Untouched, stays outside the popover, exactly where it is (`venue-map.html:109`). |
| A map-read 404/error moves focus to the error panel | preserved | Plus a new leg: the popover closes on that transition and does **not** attempt to restore focus to a trigger the failure has destroyed (see R-3). |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Month navigation races: a slow month-1 response lands after month-2 and repaints the wrong month | med | med | Per-dispatch `epoch` generation counter on the calendar fetch, mirroring `venue-map.ts:288-326`; a stale response is dropped. Pinned by a spec that flushes two month requests out of order. | claude | open |
| R-2 | The UI presents a count as a hold, contradicting invariant #2 / the `CONTEXT.md` snapshot rule | low | high | Counts are never phrased as bookable or reserved: the accessible name is the factual `"N of M sets free"`, the popover footer states the counts are a snapshot and the day is only held when a set is claimed, and nothing in the calendar path writes availability. Reviewed as part of AC-3. | claude | open |
| R-3 | Popover open when a date change 404s: the header carrying the trigger is torn down, so Escape/close restores focus to a detached node and strands it on `<body>` (WCAG 2.4.3 — the repo's most-repeated bug class, RV-FE-9) | med | high | `venue-map` closes the popover on the `notFound`/`failed` transition and lets its existing `moveFocus('map-not-found' / 'map-error')` own focus; the popover restores to the trigger only on its own ordinary close legs (Escape, backdrop, selection). Pinned by a spec asserting focus lands on the error panel, not `<body>`. | claude | open |
| R-4 | A month grid request exceeds the server's 62-day cap → `400` and an empty calendar | low | med | Requests are the month's own inclusive bounds (28–31 days); the grid's leading/trailing cells are blank, never foreign-month days. Pinned by AC-13, which asserts the requested span for a 31-day month and for February. | claude | open |
| R-5 | `httpMock.verify()` in `venue-map.spec.ts`'s `afterEach` fails every existing test that opens the picker but never flushes the calendar read | high | low | The calendar only fetches when open, and the picker starts closed, so existing specs are unaffected; the specs that do open it flush explicitly, following the suite's existing `flushVenue(); // settle the read` idiom. | claude | open |
| R-6 | Roving tabindex vs `shared/focus-trap.ts`: `FOCUSABLE` excludes `[tabindex="-1"]`, so 41 of 42 cells are invisible to the trap | med | med | The trap still sees the month-prev/next buttons and the one `tabindex="0"` cell, so wrapping is well-defined. Pinned by AC-6, which Tabs from the last control and asserts the wrap target. | claude | open |
| R-7 | 42 cells × the 44 px floor needs ≥ 308 px of grid width; the mocked e2e runs a 390 px viewport | med | med | Popover sized against that budget (44 px cells, ≤ 40 px total horizontal chrome) and measured by the existing `frontend/e2e/touch-targets*.e2e.ts` sweep, which is the only thing that proves a rendered box. | claude | open |
| R-8 | New colour tokens drift between `styles.scss` and their test-side hand-copy | low | med | The tint fills live in one test-side mirror (`src/testing/calendar-tints.ts`, the `testing/chip-fills.ts` role) and the component spec pins the rendered class list as a **set**, so a value that drifts in either place fails loudly. | claude | open |
| R-9 | `venue-map`'s in-place route change (`routeKey()` effect, `venue-map.ts:236-248`) leaves the popover holding another venue's month cache | med | med | The popover is destroyed and re-created via `@if (pickerOpen())`, and `resetForVenue` closes it; the cache is component state, so it cannot outlive the reset. Pinned by extending `venue-map-switch.spec.ts`. | claude | open |

## Open questions / Assumptions

- **Assumption:** "low" is `0 < free ≤ 25% of total`; "full" is `free === 0`; everything else is
  "free". #761 names the three tints but not the boundary. A ratio (not an absolute) is used
  because venue sizes differ by an order of magnitude. — *Owner:* claude · *Resolves by:* phase 2
  (recorded in `day-availability.ts` and pinned by its spec; cheap for the maintainer to override —
  one constant, one spec row).
- **Assumption:** disabled days (today and past) show **no** tint and **no** count, and announce
  `"not bookable"` instead. The endpoint answers them, but a free/total figure on a day nobody can
  book reads as an offer. — *Owner:* claude · *Resolves by:* phase 2.
- **Assumption:** the week starts **Monday**. The repo pins `en-IE` for civil-date formatting
  (`shared/booking-date.ts` `formatCivilDate`), and Albania is a Monday-first locale. — *Owner:*
  claude · *Resolves by:* phase 0.
- **Assumption:** the trigger is a **button**, not a text input plus a calendar button. Follows from
  #706's "one control, one behaviour, one test matrix"; the cost is recorded in the parity ledger
  and mitigated by year navigation. — *Owner:* claude · *Resolves by:* phase 5.

### Resolved

- **Q: is `@angular/aria`'s `ngGrid` the right substrate?** — **No.** It is not installed, the
  stack is locked (`CLAUDE.md` § *Tech stack*), and it would supply only arrow-key roving: the
  calendar-specific behaviour (`PageUp`/`PageDown` month, `Shift+Page*` year, `Home`/`End` week
  bounds, focusable-but-`aria-disabled` days, month refetch on cross-month focus) would still be
  hand-written, on top of a new dependency. The repo already hand-rolls both halves —
  `shared/segmented-control.ts` for roving tabindex, `shared/focus-trap.ts` for the trap — so the
  slice follows precedent instead. Recorded at plan time; no code depends on the alternative.
- **Q: is there a maximum booking horizon that should bound forward navigation?** — **No.**
  `grep -rn 'horizon' platform/src/main` finds nothing in `booking`/`venue` config; the only
  fences are the evening-before cutoff and the service-day open (invariant #4), both of which
  bound the *near* edge. Forward navigation stays unbounded.

## Availability & concurrency (invariant #2)

**The slice writes nothing.** It is a read-only display over `venue`'s calendar read, which itself
only *counts* `set_availability` rows.

- **Write paths to `availability(set_id, booking_date)`:** none — this slice adds no write path and
  touches no existing one. The claim continues to happen exactly where it does today, in
  `booking`'s reserve transaction via `availability`'s `AvailabilityClaim` port.
- **Uniqueness guarantee:** unchanged — `set_availability_uniq UNIQUE(set_id, booking_date)`.
- **Concurrency strategy:** unchanged. The only concurrency this slice introduces is **client-side
  response ordering** (R-1), handled by a generation counter, not by any lock.
- **The snapshot-never-a-hold rule (the one that actually binds here):** a day showing free capacity
  can be full by the time a set is claimed, and **only the claim decides**. The UI therefore states
  counts as observed facts (`"12 of 30 sets free"`), never as availability to book, never as a
  reservation, and the popover footer says so in words. A count is not re-derived, cached across a
  venue change, or used to gate any later step of the booking flow — the map read and the reserve
  transaction remain the only things that decide.
- **Pool rule (invariant #3):** `total` deliberately spans **both** pools, so the count is a
  "how busy is this day" signal and **not** a count of online-bookable sets. The wording is chosen
  so it cannot be read as the latter; the online-pool restriction keeps being enforced at the map
  and the claim, unchanged by this slice.
- **Cutoff rule (invariant #4):** today and every past day are rendered non-selectable **client-side
  only** (display, as #706 recorded). The server stays authoritative: the evening-before cutoff and
  the service-day-open fence are untouched, and the existing `appCutoffNote` sentence remains the
  written explanation.
- **Pinning test:** N/A — no reservation path is added, so `ConcurrentReservationIT` is unchanged
  and no new concurrency test is warranted. The client-ordering risk is pinned instead by
  `availability-calendar.spec.ts` › `drops a stale month response`.

## Spring Modulith — modules, interfaces, events

`N/A — frontend-only.` No backend file is touched; the read consumed here shipped in #760 and its
module placement (a fourth method on `venue.spi.SetAvailabilityLookup`, no new module edge) is
already settled and merged.

### Module ownership (§4a)

`N/A — frontend-only; the slice adds no backend capability and moves none.` The frontend-side
placement decision it *does* make is recorded under *Angular — frontend surfaces touched*.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money is displayed, computed, or moved; the calendar shows set
counts only.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `venue/availability-calendar.ts` + `.html` | new | standalone component (`app-availability-calendar`) | signals: `visibleMonth`, `focusedDate`, `days`, `countsFailed`, `loading`; `computed` weeks/grid; private `epoch` | none |
| FE-2 | `venue/day-availability.ts` | new | pure vocabulary + variant directive (`map-tile.ts` shape) | none — pure functions and `Record` lookups | none |
| FE-3 | `venue/venue.service.ts` | existing | `@Service` HTTP client | none (cold `Observable`) | none |
| FE-4 | `venue/venue-map.ts` + `.html` | existing | routed component | adds `pickerOpen` signal + a stored trigger `ElementRef`; `selectedDate` stays the single writer | none |
| FE-5 | `shared/venue-views.ts` | existing | published API-view vocabulary | none | none |
| FE-6 | `shared/booking-date.ts` | existing | pure date math | none | none |
| FE-7 | `src/testing/calendar-tints.ts` | new | test-side mirror of the tint recipes | none | none |

**Placement rationale (`riviera-frontend`):** the popover lives in `venue/` because #761 scopes out
every other date field, so it has exactly one consumer and promoting it to `shared/` would be
speculative. The **response type** goes to `shared/venue-views.ts` — that file is the published
API-view vocabulary mirror and already holds `AvailabilitySummary`, `DailyAvailability`'s sibling.
The **date math** goes to `shared/booking-date.ts` because #761 requires it and that file is
already the one home of ISO-day arithmetic. **No new cross-feature import** is introduced (RV-FE-8):
every import is `venue/ → shared/` or within `venue/`.

**Standards:** standalone, `inject()`, `input()`/`output()`, `@if`/`@for`, host bindings in the
`host` object (never `@HostListener`), no explicit `OnPush`, no `standalone: true`. Deviation from
`angular-developer`'s Signal-Forms preference: **no form is involved** — the picker is a button and
a grid of buttons, not a field. Deviation from the `@angular/aria` recommendation: recorded under
*Resolved* above.

## FE↔BE contract

- **New/changed endpoints:** none. Consumes the already-shipped
  `GET /api/venues/{venueId}/availability-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` →
  `200 [{ "date": "2026-11-02", "free": 21, "total": 24 }, …]`, ascending, both bounds inclusive.
- **Client typing:** a hand-written `DailyAvailability` interface in `shared/venue-views.ts`
  mirroring `DailyAvailabilityView(String date, int free, int total)`, consumed by
  `VenueService.availabilityCalendar(venueId, from, to): Observable<DailyAvailability[]>`.
  **Never `as any`.**
- **Error posture:** mirrors the file's existing convention — no `catchError` in the service; the
  raw `HttpErrorResponse` propagates and the component branches (AC-8).
- **Money/date on the wire:** no money. Dates are ISO `YYYY-MM-DD` civil days in `Europe/Tirane`
  (invariant #6), parsed and formatted **only** through `shared/booking-date.ts` — never
  `toISOString()`.
- **Window cap:** the client never requests more than one calendar month (≤ 31 days) per call,
  well inside the server's 62-day cap (AC-13).

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** build `venue/availability-calendar.ts` + `.html` — the grid, month navigation,
the guarded fetch and the counts-failed degradation — test-first.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Month arithmetic in `shared/booking-date.ts` | ✅ | see phase-0 commit |
| 1 — `DailyAvailability` + `VenueService.availabilityCalendar` | ✅ | see phase-1 commit |
| 2 — Day-availability vocabulary (tints, counts, accessible names) | ✅ | see phase-2 commit |
| 3 — The calendar component: grid, month nav, fetch, degradation | | |
| 4 — Keyboard, roving tabindex, focus trap and restore | | |
| 5 — Wire into `venue-map`, retire the native input | | |
| 6 — Tokens, contrast spec, a11y spec, touch-target guard | | |
| 7 — Mocked Playwright e2e | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/availability-calendar-ui.md` — this plan
- `frontend/src/app/shared/booking-date.ts|.spec.ts` — month/day arithmetic for the grid
- `frontend/src/app/shared/venue-views.ts` — the `DailyAvailability` response mirror
- `frontend/src/app/venue/venue.service.ts` — the typed `availabilityCalendar` read
- `frontend/src/app/venue/venue.service.spec.ts` — its spec (new file; the service had none)
- `frontend/src/app/venue/day-availability.ts|.spec.ts` — tint states, classes, accessible names
- `frontend/src/app/venue/availability-calendar.ts|.html|.spec.ts` — the popover
- `frontend/src/app/venue/availability-calendar.a11y.spec.ts` — jsdom axe audit of the open popover
- `frontend/src/app/venue/availability-calendar.contrast.spec.ts` — WCAG token maths
- `frontend/src/app/venue/venue-map.ts|.html|.spec.ts` — the swap and the new close legs
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — header audit with the new trigger
- `frontend/src/app/venue/venue-map-switch.spec.ts` — popover reset on in-place route change
- `frontend/src/testing/calendar-tints.ts` — the one test-side mirror of the tint recipes
- `frontend/e2e/availability-calendar.e2e.ts` — the CI-run mocked flow

---

## Phase 0 — Month arithmetic in `shared/booking-date.ts`

**Files:** Modify `frontend/src/app/shared/booking-date.ts` · Test `frontend/src/app/shared/booking-date.spec.ts`

- [ ] **Step 1: Write the failing tests** for `addDays`, `addMonths`, `startOfMonth`,
  `endOfMonth`, `startOfWeek`, `endOfWeek` (Monday-first), `monthWeeks` (the 6×7 grid of the
  visible month with `undefined` for leading/trailing cells), `formatMonthLabel`
  (`"August 2026"`, `en-IE`, UTC), and `compareIsoDate`. Cover the traps: month-end clamping
  (31 Jan `addMonths(1)` → 28/29 Feb), a leap February, a month starting on Sunday, and a
  December→January year roll.
- [ ] **Step 2: Run it, verify it fails** — `npm test -- booking-date` → FAIL (`addMonths is not a function`).
- [ ] **Step 3: Minimal implementation** — all functions built on the existing UTC-anchored
  `parseIsoDate`/`formatIsoDate` pair; **no** `toISOString()`, **no** local-zone reads.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- booking-date` → PASS.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Add month-grid arithmetic to the shared booking-date helpers (#761)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

## Phase 1 — `DailyAvailability` + `VenueService.availabilityCalendar`

**Files:** Modify `shared/venue-views.ts`, `venue/venue.service.ts` · Create `venue/venue.service.spec.ts`

- [ ] **Step 1: Write the failing test** — with `provideHttpClientTesting`, assert the request URL
  is `${apiBaseUrl}/api/venues/7/availability-calendar`, that `from`/`to` ride as params, and that
  the typed array flows through unmapped.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — `HttpParams().set('from', …).set('to', …)`, no `.pipe()`
  (nothing to rewrite), no `catchError` (the file's convention).
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Type the availability-calendar read on the venue client (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 2 — Day-availability vocabulary

**Files:** Create `venue/day-availability.ts`, `venue/day-availability.spec.ts`

- [ ] **Step 1: Write the failing tests** — `DAY_STATES` tuple with the type derived from it
  (`map-tile.ts` shape); `dayAvailabilityState(free, total)` → `full` at `free === 0`, `low` at
  `≤ 25%`, `free` above, and `unknown` when counts are absent; `dayAccessibleName()` producing
  `"Wed 26 Aug 2026, 12 of 30 sets free"`, `"…, no sets free"`, `"…, availability unknown"`, and
  `"…, not bookable"` for a disabled day; and that the tint class record and the words record
  cover the same key set.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — the state tuple, `DAY_TINT_CLASS`, `DAY_MEANING`,
  the resolver (**failing closed**: a `total` of 0 or a negative/absent count resolves `unknown`,
  never `free`), and the accessible-name builder over `formatCivilDate`.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Give calendar days a tint and a spoken count (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 3 — The calendar component

**Files:** Create `venue/availability-calendar.ts`, `.html`, `.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-1, AC-2, AC-4, AC-8, AC-13, R-1's stale-response
  case, and the disabled-`Enter` case.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — `input.required<string>() selectedDate`,
  `input.required<string>() minDate`, `input.required<number>() venueId`,
  `output<string>() chosen`, `output<void>() dismissed`; `visibleMonth` signal seeded from
  `selectedDate`; a `fetchMonth()` with the `epoch` guard and a per-month memo; `<table role="grid">`
  with blank leading/trailing cells; each day a `<button appTouchTarget>` inside
  `<td role="gridcell">`.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Show a month of availability in a calendar popover (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 4 — Keyboard, roving tabindex, focus

**Files:** Modify `venue/availability-calendar.ts`, `.html`, `.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-5 (one case per key, including the cross-month
  arrow that triggers a refetch), AC-6, AC-7.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — `focusedDate` signal **distinct** from `selectedDate`
  (arrow keys move focus without committing); keydown bound on each cell, not the wrapper
  (`segmented-control.ts:103-107`); `viewChildren` + explicit `.focus()`; `trapFocusWithin` on
  `(keydown.tab)`/`(keydown.shift.tab)`; `(keydown.escape)` on the host; `aria-live="polite"`
  month caption.
- [ ] **Step 4: Run it, verify it passes.**
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Operate the calendar entirely from the keyboard (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 5 — Wire into `venue-map`, retire the native input

**Files:** Modify `venue/venue-map.ts`, `.html`, `.spec.ts`, `venue-map-switch.spec.ts`, `venue-map.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-9; R-3's focus case (date change 404s while the
  popover is open → focus on the error panel, not `<body>`); R-9's route-change reset; and the two
  existing `onDateChange` call sites (`venue-map.spec.ts:903-905`, `:1029-1033`) rewritten to the
  new signature.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — replace `venue-map.html:92-108` with the labelled
  trigger button + `@if (pickerOpen())` popover; change `onDateChange(event: Event)` to
  `onDateChange(value: string)` keeping the body; store the trigger `ElementRef` for restore
  (`app.ts:92-93,171-175` shape); close the popover in `resetForVenue` and on the map-failure legs.
- [ ] **Step 4: Run it, verify it passes** — `npm test -- venue-map`.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Give the venue page's date field its availability calendar (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 6 — Tokens, contrast, axe, touch targets

**Files:** Modify `src/styles.scss` · Create `src/testing/calendar-tints.ts`,
`venue/availability-calendar.contrast.spec.ts`, `venue/availability-calendar.a11y.spec.ts`

- [ ] **Step 1: Write the failing tests** — AC-10 (day ink AA on each tint; bar fill ≥ 3:1 vs
  track; focus ring ≥ 3:1 vs each tint), AC-11 (axe over the open popover).
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Minimal implementation** — **decided at phase 2:** the tints are literal opaque
  hex in `day-availability.ts`'s class record and **not** `styles.scss` tokens, following
  `venue/map-tile.ts` — the nearest exemplar, which does exactly this — because the palette belongs
  to one component rather than crossing components, and the drift guard the repo prescribes is the
  test-side mirror (`src/testing/calendar-tints.ts`) plus a set-equality spec, which is now in
  place. `styles.scss` is therefore untouched by this slice. The capacity bar carries its own
  opaque track rather than the translucent `--riv-card-track`, so its 1.4.11 proof needs no
  compositing either.
- [ ] **Step 4: Run it, verify it passes** — `npm run test:a11y` and
  `node scripts/check-touch-target.mjs --diff origin/main`.
- [ ] **Step 5: Generalization-audit pass.**
- [ ] **Step 6: Commit** — `git commit -m "Prove the calendar tints on both themes (#761)"`
- [ ] **Step 7: Update plan-doc execution status.**

## Phase 7 — Mocked Playwright e2e

**Files:** Create `frontend/e2e/availability-calendar.e2e.ts`

- [ ] **Step 0: Load `playwright-cli`** before authoring the spec (Skill-routing gate).
- [ ] **Step 1: Write the spec** — AC-12: mock the venue read and the calendar read per month via
  `page.route` (matching on `from`/`to` in `route.request().url()`), open the picker, assert axe is
  clean after `settle(page)`, navigate a month, pick a day, assert the venue request carried the
  new `date=`, and assert the popover's rendered surface via `getComputedStyle` (not a class list).
- [ ] **Step 2: Run it** — `npm run test:e2e:a11y -- availability-calendar`.
- [ ] **Step 3: Generalization-audit pass.**
- [ ] **Step 4: Commit** — `git commit -m "Drive the calendar end to end in the mocked suite (#761)"`
- [ ] **Step 5: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated (mechanism-not-resemblance — #641, Step 5).

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-22 | phase 0 — introduced ISO civil-day month arithmetic | every site that does civil-day arithmetic on a `Date` by hand, rather than through `shared/booking-date.ts` | `grep -rn "setUTCDate\|setUTCMonth\|setUTCFullYear\|toISOString()" src/app src/testing e2e --include=*.ts` | 3 outside the module: `e2e/discovery-flow.e2e.ts:176-177` (civil day via `toISOString().slice(0,10)`), `e2e/operator-requests.e2e.ts:21` (a full instant, correct usage), and the module's own docs | none — both live sites are **mocked-e2e fixtures**, which drive the built app as a black box and import nothing from `src/` on purpose (`testing/chip-fills.ts` header states the rule). No app-source site rolls its own day arithmetic, so the new helpers have no existing duplicate to absorb. |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-11:** Run `npm test` (Vitest) → all green. Verified at commit `<sha>`.
- [ ] **AC-10, AC-11:** Run `npm run test:a11y` and `node scripts/check-touch-target.mjs --diff origin/main` → green. Verified at commit `<sha>`.
- [ ] **AC-12:** Run `npm run test:e2e:a11y` → green. Verified at commit `<sha>`.
- [ ] **AC-13:** Covered by the Vitest run above.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [ ] **Availability** section filled; the snapshot-never-a-hold rule is honoured in wording and in code (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — `total` is not presented as bookable; today/past are display-only.
- [ ] **Modulith** section filled (N/A, frontend-only); no new cross-feature FE import (RV-FE-8).
- [ ] **Payment/payout** N/A.
- [ ] Refund policy — N/A.
- [ ] Timezone correct: every date operation goes through `shared/booking-date.ts`; no `toISOString()` (invariant #6).
- [ ] Booking codes — N/A.
- [ ] Flyway — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] `node scripts/check-plan-file-structure.mjs --diff origin/main` green (plan doc staged first).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `/code-review` subagent fan-out per `pr-gates.md` §1 *plus* `riviera-review-overlay`.
