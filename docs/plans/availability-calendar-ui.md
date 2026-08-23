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
(**ran** over `origin/main...HEAD` — 3 staleness patches folded into this PR: the focus trap's
two-consumer prose, `check-focus-posture.mjs`'s standing-surface count, and an as-built pointer on
the v3 design artboard) · `riviera-frontend` (placement:
the popover is venue-feature-local because #761 scopes out the other three date fields; the
`DailyAvailability` response mirror belongs in `shared/venue-views.ts`) · `riviera-tailwind`
(Tailwind-only styling; opaque solid tints so each contrast proof is a plain pair that holds on
both themes — as literal hex in the component's own class record, **not** `styles.scss` tokens,
which this slice leaves untouched; one `outline-color` utility per element, since two resolve by
stylesheet order; `appTouchTarget` on the trigger, both month arrows and every day cell) · `angular-developer` + angular-cli MCP
(`get_best_practices` for the v22 posture: `input()`/`output()`, no `@HostListener`, no explicit
`OnPush`, `@Service`; `angular-aria.md` surfaced `@angular/aria`'s `ngGrid`, considered and
rejected below) · `playwright-cli` (loaded at phase 7 — role/test-id locators, web-first `expect.poll` over fixed
waits, `settle()` before any measurement or axe pass on an animated surface, and `page.clock` to
pin the suite's date so the tint fixture stops depending on which day CI runs) · `riviera-local-debug`
(the cloud-session run recipe: `ng test --include` for scoped unit runs and
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e, never `playwright install`).

**Branch:** `claude/availability-calendar-ui-sycn3r` — **cloud-session substitution** for the
local `feature/availability-calendar-ui` convention (`riviera-sdlc` § *Remote / cloud session
addendum*). Branched from `origin/main` at `7d93a3f`.

---

## Acceptance criteria (testable)

> Written at the component boundary — the frontend's inner hexagon is the calendar's own
> inputs/outputs and the pure functions beneath it, not the rendered pixel.

- [x] **AC-1:** Given a venue whose calendar read answers `free`/`total` per day, when the picker
  is opened, then every day cell of the visible month carries a tint state derived from that day's
  counts and a capacity bar whose width is `free / total`.
  *Pinned by:* `availability-calendar.spec.ts` › `renders a tint and a capacity bar per day of the visible month`.
- [x] **AC-2:** Given the picker is open on month M, when the user navigates to M±1, then exactly one
  new calendar request is issued for that month's inclusive bounds and the grid re-renders from its
  response.
  *Pinned by:* `availability-calendar.spec.ts` › `refetches for the new month and re-renders`.
- [x] **AC-3:** Given any day with counts, then its accessible name is
  `"<Wed 26 Aug 2026>, <free> of <total> sets free"` — the exact integers, never a tint word alone.
  *Pinned by:* `day-availability.spec.ts` › `carries the civil day and the exact counts` + `says a day is the one the map is showing`.
- [x] **AC-4:** Given today and any past day, when the grid renders, then those cells are present,
  carry `aria-disabled="true"`, announce `"not bookable"`, are reachable by arrow keys, and
  `Enter`/`Space` on them emits nothing.
  *Pinned by:* `availability-calendar.spec.ts` › `announces today and past days as disabled, and refuses to select them` + `refuses Enter and Space on a day that cannot be booked`.
- [x] **AC-5:** Given the picker is open, when the user presses `ArrowLeft/Right` (±1 day),
  `ArrowUp/Down` (±7 days), `Home`/`End` (week bounds), `PageUp`/`PageDown` (∓/±1 month),
  `Shift+PageUp`/`Shift+PageDown` (∓/±1 year), then focus moves accordingly without committing a
  selection; `Enter`/`Space` commits the focused day; `Escape` closes and returns focus to the trigger.
  *Pinned by:* `availability-calendar.spec.ts` › the `keyboard` describe (one case per key, incl.
  `commits the focused day on Enter and on Space, the keys a booking is made with` and
  `carries real DOM focus with the roving tabindex, not just the attribute`).
- [x] **AC-6:** Given the picker is open, when the user Tabs past the last focusable control, then
  focus wraps inside the popover and never reaches the page behind it.
  *Pinned by:* `availability-calendar.spec.ts` › `traps focus inside the popover, wrapping past the
  last control` + `wraps backwards from the first control on Shift+Tab`, and
  `shared/focus-trap.spec.ts` › the `around a roving tabindex` describe.
- [x] **AC-7:** Given the month label changes, then it is rendered inside an `aria-live="polite"`
  region so the change is announced.
  *Pinned by:* `availability-calendar.spec.ts` › `announces the month change from a live region`.
- [x] **AC-8:** Given the calendar read fails, then the grid still renders and stays fully
  selectable, every day reads `"availability unknown"`, and a non-blocking note says the counts
  could not be loaded — the picker never becomes unusable because a decorative read failed.
  *Pinned by:* `availability-calendar.spec.ts` › `degrades to a usable picker rather than an empty one`.
- [x] **AC-9:** Given a day is chosen, when the popover emits it, then `venue-map` sets
  `selectedDate` once, closes any open set dialog, re-fetches the map for that day, and the booking
  dialog opened afterwards is seeded with the same day.
  *Pinned by:* `venue-map.spec.ts` › `drives the map re-fetch and the dialog's seeded date from the chosen day`.
- [x] **AC-10:** Given both themes, then the day ink reads ≥ 4.5:1 on each of the three tint fills,
  the capacity-bar fill reads ≥ 3:1 against its track, and the focus ring reads ≥ 3:1 against every
  tint (WCAG 1.4.3 / 1.4.11).
  *Pinned by:* `availability-calendar.contrast.spec.ts`.
- [x] **AC-11:** `npm run test:a11y` is green including the open popover, and
  `node scripts/check-touch-target.mjs --diff origin/main` reports no TT-1/TT-2 violation.
  *Pinned by:* `venue-map.a11y.spec.ts` › `has no violations with the availability calendar open (#761)`
  + the guard run recorded in AC verification.
- [x] **AC-12:** Given the mocked e2e suite, when it opens the picker, navigates a month and picks a
  day, then the venue map request for that exact `date=` is observed.
  *Pinned by:* `frontend/e2e/availability-calendar.e2e.ts`.
- [x] **AC-13:** No request the calendar issues spans more than 62 days, so the server's window cap
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
| R-1 | **Held.** Month navigation races: a slow month-1 response lands after month-2 and repaints the wrong month | med | med | Per-dispatch `epoch` generation counter on the calendar fetch, mirroring `venue-map.ts:288-326`; a stale response is dropped. Pinned by `availability-calendar.spec.ts` › `drops a stale month response so a slow month cannot repaint a newer one`, which flushes two month requests out of order. | claude | closed in the phases-3-4 commit |
| R-2 | **Held.** The UI presents a count as a hold, contradicting invariant #2 / the `CONTEXT.md` snapshot rule | low | high | Counts are never phrased as bookable or reserved: the accessible name is the factual `"N of M sets free"`, the popover footer states the counts are a snapshot and the day is only held when a set is claimed, and nothing in the calendar path writes availability. Reviewed as part of AC-3. | claude | closed in the phases-3-4 commit |
| R-3 | **Held.** Popover open when a date change 404s: the header carrying the trigger is torn down, so Escape/close restores focus to a detached node and strands it on `<body>` (WCAG 2.4.3 — the repo's most-repeated bug class, RV-FE-9) | med | high | `venue-map` closes the popover on the `notFound`/`failed` transition and lets its existing `moveFocus('map-not-found' / 'map-error')` own focus; the popover restores to the trigger only on its own ordinary close legs (Escape, backdrop, selection). Pinned by `venue-map.spec.ts` › `closes the calendar without chasing a trigger the failure destroyed (RV-FE-9)`. | claude | closed in the phases-5-6 commit |
| R-4 | **Held.** A month grid request exceeds the server's 62-day cap → `400` and an empty calendar | low | med | Requests are the month's own inclusive bounds (28–31 days); the grid's leading/trailing cells are blank, never foreign-month days. Pinned by AC-13. | claude | closed in the phases-3-4 commit |
| R-5 | **Materialised as predicted, and one step further.** `httpMock.verify()` in `venue-map.spec.ts`'s `afterEach` fails every existing test that opens the picker but never flushes the calendar read | high | low | The calendar only fetches when open, and the picker starts closed, so existing specs are unaffected; the specs that do open it flush explicitly, following the suite's existing `flushVenue(); // settle the read` idiom — hoisted into one `flushCalendar()` helper matching any venue id, since an in-place venue switch fires the calendar read for the NEW id. | claude | closed in the phases-5-6 commit |
| R-6 | Roving tabindex vs `shared/focus-trap.ts` | med | med | **Materialised, and worse than predicted — fixed at phase 4.** The plan assumed `FOCUSABLE` excluded `[tabindex="-1"]`; it did not. Its `button:not([disabled])` clause matched the parked day cells by tag, so the trap's "last focusable" was a cell Tab never reaches and Tab from the real last control escaped the dialog. Fixed in the shared helper (every clause now also excludes `[tabindex="-1"]`, and disabled `select`/`textarea` are excluded for the same reason), with three cases added to `focus-trap.spec.ts`. All three existing modal consumers stay green — none has a parked focusable, so the fix is a no-op for them and closes a latent leak for any future roving widget. | claude | fixed in the phases-3-4 commit |
| R-7 | **Held, and measured.** 42 cells × the 44 px floor needs ≥ 308 px of grid width; the mocked e2e runs a 390 px viewport | med | med | Popover sized against that budget (44 px cells, ≤ 40 px total horizontal chrome) and measured by the existing `frontend/e2e/touch-targets*.e2e.ts` sweep, which is the only thing that proves a rendered box. `availability-calendar.e2e.ts` measures every day cell at 390 px and asserts the page gains no horizontal overflow; the standing `touch-targets.e2e.ts` sweep passes unchanged. | claude | closed in the phase-7 commit |
| R-8 | **Held, via the mirror rather than tokens.** New colour values drift between `styles.scss` and their test-side hand-copy | low | med | The tint fills live in one test-side mirror (`src/testing/calendar-tints.ts`, the `testing/chip-fills.ts` role) and the component spec pins the rendered class list as a **set**, so a value that drifts in either place fails loudly. The mirror also grew a `ring` per fill after the contrast spec caught a real defect (below). | claude | closed in the phases-5-6 commit |
| R-9 | **Held.** `venue-map`'s in-place route change (`routeKey()` effect, `venue-map.ts:236-248`) leaves the popover holding another venue's month cache | med | med | The popover is destroyed and re-created via `@if (pickerOpen())`, and `resetForVenue` closes it; the cache is component state, so it cannot outlive the reset. `resetForVenue` closes it, and the existing in-place-switch specs exercise the path. | claude | closed in the phases-5-6 commit |

## Open questions / Assumptions

### Resolved

- **Assumption (held):** "low" is `0 < free ≤ 25% of total`; "full" is `free === 0`; everything else is
  "free". #761 names the three tints but not the boundary. A ratio (not an absolute) is used
  because venue sizes differ by an order of magnitude. — *Owner:* claude · *Resolves by:* phase 2
  — shipped as `LOW_FRACTION` in `day-availability.ts`, pinned by
  `day-availability.spec.ts`; still one constant and one spec row to change.
- **Assumption (held):** disabled days (today and past) show no tint, no count and no capacity bar,
  and announce `"not bookable"`. The endpoint answers them, but a free/total figure on a day nobody
  can book reads as an offer. — shipped at phase 2; the review fan-out extended it to a *bookable*
  day whose counts are unreadable, which now also draws no bar.
- **Assumption (held):** the week starts **Monday** — the repo pins `en-IE` for civil-date
  formatting and Albania is a Monday-first locale. Shipped at phase 0 in `startOfWeek`/`endOfWeek`.
- **Assumption (held):** the trigger is a **button**, not a text input plus a calendar button —
  #706's "one control, one behaviour, one test matrix". The cost is in the parity ledger, mitigated
  by `Shift`+`PageUp`/`PageDown` year navigation. Shipped at phase 5.

**No open questions remain.**

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
| FE-1 | `venue/availability-calendar.ts` + `.html` | new | standalone component (`app-availability-calendar`) | `linkedSignal` `focusedDate` + `signal` `focusRequest`/`counts`/`countsFailed`/`countsLoading`; `computed` `visibleMonth`/`monthLabel`/`weeks`; private `epoch` | none |
| FE-2 | `venue/day-availability.ts` | new | pure vocabulary (the `map-tile.ts` shape, minus the directive — nothing needed a host binding) | none — pure functions and `Record` lookups | none |
| FE-3 | `venue/venue.service.ts` | existing | `@Service` HTTP client | none (cold `Observable`) | none |
| FE-4 | `venue/venue-map.ts` + `.html` | existing | routed component | adds a `pickerOpen` signal; focus restore goes through the already-injected `focusMover()`; `selectedDate` stays the single writer | none |
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

**Stage pointer:** `merge close-out` — CI green, review gate run in full (a `/code-review` pass plus a five-lens subagent fan-out), Sonar list cleared, all findings resolved.

**Next action:** merge PR #763, then tick epic #706's checklist for #761.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Month arithmetic in `shared/booking-date.ts` | ✅ | see phase-0 commit |
| 1 — `DailyAvailability` + `VenueService.availabilityCalendar` | ✅ | see phase-1 commit |
| 2 — Day-availability vocabulary (tints, counts, accessible names) | ✅ | see phase-2 commit |
| 3 — The calendar component: grid, month nav, fetch, degradation | ✅ | landed with phase 4 |
| 4 — Keyboard, roving tabindex, focus trap and restore | ✅ | see phases-3-4 commit |
| 5 — Wire into `venue-map`, retire the native input | ✅ | see phases-5-6 commit |
| 6 — Tokens, contrast spec, a11y spec, touch-target guard | ✅ | see phases-5-6 commit |
| 7 — Mocked Playwright e2e | ✅ | see phase-7 commit |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | review (`/code-review`) | **Blocker.** The `fixed inset-0` overlay was rendered inside `<header appPanelGlass>`, whose `backdrop-filter` makes it the containing block for fixed descendants and whose `overflow:hidden` clips them — the exact bug #134 already shipped and fixed once. Measured: at a 1280×720 viewport the overlay was 730×594 at x=275, so the backdrop covered neither the map nor the viewport. | fixed — moved beside `app-booking-dialog`, outside the glass panel; pinned by an e2e that **measures** the overlay against the viewport and clicks the bottom-left corner to dismiss |
| F-2 | review (`/code-review`) | The `afterRenderEffect` re-focused the roving day cell on every `focusedDate` change, so clicking "next month" threw focus into the grid and a keyboard user had to re-tab per month (APG keeps focus on the nav button). | fixed — a `focusRequest` counter that only keyboard moves bump; pinned in both the unit spec and the e2e |
| F-3 | review (`/code-review`) | The capacity bar also painted on the **selected** day, where its track and fill sit on the accent at ≈2.1:1 and ≈1.5:1 — under the 3:1 the contrast spec enforces everywhere else, and untested because the spec never checked `CALENDAR_SELECTED` for the bar. | fixed — no bar on the chosen day (its count is on the page behind and in its accessible name); the contrast spec now **asserts** the ratios are too low, so a future accent change fails loudly |
| F-4 | review (`/code-review`) | `discover-photos.e2e.ts`'s focus-ring assertion now targets a `<button>` after a programmatic `.focus()`; `:focus-visible` may not match as it did for the old `<input>`. | **not a defect** — the assertion is non-vacuous by construction (`toHaveCSS('outline-width','3px')` fails at `0px` if the ring is absent) and it passes both locally and in CI on the pushed head. No change. |
| F-5 | review (`/code-review`) | `isSameMonth` was exported from `shared/booking-date.ts` with no caller outside its own spec. | fixed — removed, with its spec |
| F-6 | sonar (`Web:S6819`, MAJOR) | `role="dialog"` on a `<div>` — the rule asks for the native element. | fixed — the panel is a real `<dialog open tabindex="-1">`. **Not** `showModal()`: jsdom 29 implements neither it nor the top layer, so the 193 unit specs would be testing a fiction; the app's own `trapFocusWithin` still runs, exactly as in the three sibling modals. A deliberate divergence from those three (they are `<div role="dialog">`), and a precedent for migrating them. |
| F-7 | sonar (`Web:S6819`, MAJOR) | `role="status"` on a `<p>` — the rule asks for `<output>`, which carries that role implicitly. | fixed — `<output class="block">`. |
| F-28 | sonar (`typescript:S4624`, MAJOR) | A nested template literal in the day view-model's class composition. | fixed — the two parts are joined rather than interpolated one inside the other |
| F-9 | review fan-out (CSS lens) | **Major, introduced by F-6's own fix.** The UA stylesheet gives `<dialog>` `position:absolute; left:0`, so the panel left the host's flex centring and sat against the viewport's left edge (measured: x=7 at a 1280 viewport, where centred is x=471). The e2e passed because it measured the fixed **host**, not the panel. | fixed — `static` on the dialog; the e2e now measures the **panel** and asserts it is centred |
| F-10 | review fan-out (a11y lens) | The counts land after the first render, so the focused day was announced "availability unknown" and nothing re-announced when the real numbers arrived. No live region existed for the load. | fixed — `app-load-announcer` mounted outside every branch, per the #741 rule |
| F-11 | review fan-out (a11y lens) | The chosen day was never announced as chosen: `aria-selected` sat on the `gridcell`, but the **button** is what takes focus, and AT reports the focused object. | fixed — the selection is spoken in the day's own name (", selected") |
| F-12 | review fan-out (a11y lens) | **F-7 read as resolved but was not.** `<output>` carries `role="status"` implicitly, so swapping the element changed nothing: the region was still *born holding its message* and announces nothing (RV-FE-10). | fixed — `role="alert"`, insertion being the one case a live region announces without a prior mutation |
| F-13 | review fan-out (a11y + logic) | `closePicker` hand-rolled the focus restore with `queueMicrotask` + a document-wide query, and ran **before** the date was written — so the trigger announced the day the tourist had just left. | fixed — `focusMover()` (already injected in the class), and the date is written first |
| F-14 | review fan-out (a11y + logic) | `resetForVenue` destroyed the focus-trapped popover with no focus leg (RV-FE-9 instance-14's shape; FOCUS-1 cannot see it). | fixed — a deliberate move when the picker was open |
| F-15 | review fan-out (logic + a11y) | Month range was bounded on the button path only: `PageUp`/arrows walked past the earliest month, firing a request per month, while the Previous control announced itself unavailable. | fixed — both paths clamp to the same floor |
| F-16 | review fan-out (logic) | `isReadable` used coercing relational operators, so `{free: null}` and `{free: "0"}` passed the "fails closed" gate and painted the amber tint with "null of 30 sets free". Latent — today's server sends `int`s. | fixed — `Number.isInteger` on both fields |
| F-17 | review fan-out (logic) | A stale `countsFailed` outlived its month (navigate away from a failed month and the notice persisted over a month still in flight), and the previous month's counts were held until the new response landed. | fixed — both cleared at dispatch, with a `countsLoading` signal driving the announcer |
| F-18 | review fan-out (logic) | The calendar's HTTP subscriptions were never torn down; closing the popover mid-request left the XHR running and its callbacks writing a destroyed component's signals. | fixed — `takeUntilDestroyed` |
| F-19 | review fan-out (test lens) | **BLOCKER, and a false record.** The two `venue-map.spec.ts` floor assertions were still unscoped and still reading `aria-disabled` off the trigger — the phase-7 log claimed all eight sites were scoped. An off-by-one on the booking floor would have slipped through. | fixed and **mutation-verified** (`>=`→`>` now turns 2 tests red); the log row is corrected to say what actually happened |
| F-20 | review fan-out (test lens) | AC-9's dialog-seed clause was a tautology: `getAttribute('ng-reflect-date') ?? chosen` on a **signal** input always returns null, reducing to `expect(chosen).toContain(chosen)`. | fixed — asserts the rendered `dialog-date` text; it immediately caught a format mismatch, which is the proof it is real |
| F-21 | review fan-out (test lens) | `Enter`/`Space` — the two keys a booking is actually made with — had no test in any suite, in either the commit or the refusal direction. | fixed — three cases, mutation-verified |
| F-22 | review fan-out (test lens) | No unit test asserted that DOM focus follows the roving tabindex; deleting the `focusRequest` bump left the whole unit suite green. | fixed — mutation-verified |
| F-23 | review fan-out (test lens) | The bar and chrome colours were hand-copies the mirror file exists to forbid, so the 1.4.11 proofs could go on asserting colours the template no longer used. | fixed — the rendered bar is tied to `CALENDAR_BAR` |
| F-24 | review fan-out (test lens) | `venue-map.a11y.spec.ts`'s `% 4` fixture could never produce the `free` tint (that needs >25% of 30), so its comment claimed coverage it did not have. | fixed — an explicit three-state spread, asserted present before the audit runs |
| F-25 | review fan-out (logic lens) | **CI time bomb.** The e2e keyed counts to position in the requested window and asserted all three tints on the opening month — but on the 29th/30th of any month too few bookable days remain, so `npm run test:e2e:a11y` would have gone red on **two days of every month**. | fixed — counts keyed to day-of-month, tints asserted on a navigated-to month, and the suite's clock pinned with `page.clock` to 2026-08-30 (one of the dates that would have failed). Verified: removing the forward step turns it red on that date |
| F-26 | docs-freshness sweep | `focus-trap.ts` named two consumers (there are four); `check-focus-posture.mjs`'s header counted 3 focus-trapped modals (now 4); the v3 design artboard still drew a native date input. | fixed — all three patched in this PR rather than a follow-up docs PR |
| F-27 | review fan-out (conventions lens) | *Skills consulted* omitted `riviera-local-debug`, and its `riviera-tailwind` parenthesis described `styles.scss` tokens that were never created. Six AC pin-names named tests that do not exist, and three sections cited an `availability-calendar.a11y.spec.ts` that was never created. | fixed — line corrected, every pin-name reconciled against the shipped titles |
| F-8 | sonar (`typescript:S7766`, MINOR) | "Prefer `Math.max()`" on the opening-focus ternary. The suggestion is literally wrong for ISO **strings** (`Math.max` coerces to `NaN`), but the shape it flags was a max hiding a domain rule. | fixed by expressing the rule instead: an `isBookable(iso)` predicate now names invariant #4's display side and is reused by the grid computation, which had inlined the same comparison. |

---

## File structure

- `docs/plans/availability-calendar-ui.md` — this plan
- `frontend/src/app/shared/booking-date.ts|.spec.ts` — month/day arithmetic for the grid
- `frontend/src/app/shared/venue-views.ts` — the `DailyAvailability` response mirror
- `frontend/src/app/venue/venue.service.ts` — the typed `availabilityCalendar` read
- `frontend/src/app/venue/venue.service.spec.ts` — its spec (new file; the service had none)
- `frontend/src/app/venue/day-availability.ts|.spec.ts` — tint states, classes, accessible names
- `frontend/src/app/venue/availability-calendar.ts|.html|.spec.ts` — the popover
- `frontend/src/app/shared/focus-trap.ts|.spec.ts` — the trap fix a roving tabindex forced
- `frontend/src/app/venue/availability-calendar.contrast.spec.ts` — WCAG token maths
- `frontend/src/app/venue/venue-map.ts|.html|.spec.ts` — the swap and the new close legs
- `frontend/src/app/venue/venue-map.a11y.spec.ts` — jsdom axe audit of the header and of the open popover
- `frontend/src/testing/calendar-tints.ts` — the one test-side mirror of the tint recipes
- `frontend/src/testing/calendar-days.ts` — the shared calendar-response fixture builder
- `frontend/src/app/venue/venue.service.spec.ts` — the typed read's spec
- `scripts/check-focus-posture.mjs` · `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — docs-freshness patches
- `frontend/e2e/availability-calendar.e2e.ts` — the CI-run mocked flow
- `frontend/e2e/discovery-flow.e2e.ts` — the carried-`?date=` assertion, re-expressed for the trigger

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

**Files:** Modify `venue/venue-map.ts`, `.html`, `.spec.ts`, `venue-map.a11y.spec.ts`

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

**Files:** Create `src/testing/calendar-tints.ts`, `venue/availability-calendar.contrast.spec.ts` ·
Modify `venue/venue-map.a11y.spec.ts`

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
| 2026-08-23 | review F-1 — a `position: fixed` overlay inside a `backdrop-filter` ancestor | every fixed-position overlay in the app, and every ancestor that can contain or clip one (`backdrop-filter`, `filter`, `transform`, `contain`, `will-change`, `overflow`) — enumerated by **measuring the rendered box against the viewport**, not by reading class lists, since the containing block is a computed fact | a Playwright probe walking `hostEl.parentElement` for a non-`none` `backdropFilter`/`filter`/`transform` or a non-`visible` `overflow`, then comparing `getBoundingClientRect()` to `innerWidth/innerHeight` | 1 — the calendar overlay; the three existing modals (`booking-dialog`, `find-booking`, `payout-statement`) are already rendered outside the glass panels, which is *why* they were | fixed the one site, and turned the probe into a permanent e2e assertion so the next overlay cannot regress it silently |
| 2026-08-23 | phase 7 — a strict-mode violation on `button[data-date="…"]` | every selector that can match a day cell, which is the mechanism: the trigger carries `data-date` as its own test hook and precedes the popover in the document, so an unscoped query returns the trigger whenever the two dates coincide | `grep -rn 'data-date' src/app e2e --include=*.ts --include=*.html \| grep -v 'attr.data-date'` | 8 query sites: 3 in `venue-map.spec.ts`, 4 in the new e2e, 1 in the component | **two of the unit sites were false-greens** — `venue-map.spec.ts`'s floor assertions read `aria-disabled` off the *trigger* (which has none) and so passed for the wrong reason. The e2e sites were scoped; **the two unit sites were not — the edit silently failed to match after Prettier reformatted them, and this row recorded the fix as done anyway.** Caught by the review fan-out and fixed in round 2, where a mutation (`>=` → `>` on the booking floor) now turns both red. The lesson is the row itself: an unverified edit plus a confident log entry is worse than no log entry. |
| 2026-08-22 | phase 6 — gave each fill its own focus-ring colour | every element that can end up with two competing `outline-color` utilities, which resolve by stylesheet order rather than class order (`riviera-tailwind` rule 3) | `grep -rn 'focus-visible:outline-\[' frontend/src/app --include=*.html --include=*.ts` | the calendar day cell was the only element where a base ring and a state ring would have met; every other site sets exactly one | fixed by moving the ring onto the per-state class, so exactly one reaches each element by construction rather than by luck |
| 2026-08-22 | phase 4 — fixed the focus trap's focusable selector | every site that enumerates focusable elements by selector, which is the mechanism the defect lives in (a clause matching an element the browser will not tab to) | `grep -rn 'a\[href\]\|tabindex="-1"\]\|:not(\[disabled\])' src/app src/testing e2e --include=*.ts` | 1 — `shared/focus-trap.ts` is the only such site | fixed there, so all four consumers (`booking-dialog`, `find-booking`, `payout-statement`, `availability-calendar`) get it; the three pre-existing modals' specs re-run green, since none parks a focusable. Also swept the sibling defect in the same selector — `select`/`textarea` were matched even when `disabled` — and fixed it in the same line. |
| 2026-08-22 | phase 0 — introduced ISO civil-day month arithmetic | every site that does civil-day arithmetic on a `Date` by hand, rather than through `shared/booking-date.ts` | `grep -rn "setUTCDate\|setUTCMonth\|setUTCFullYear\|toISOString()" src/app src/testing e2e --include=*.ts` | 3 outside the module: `e2e/discovery-flow.e2e.ts:176-177` (civil day via `toISOString().slice(0,10)`), `e2e/operator-requests.e2e.ts:21` (a full instant, correct usage), and the module's own docs | none — both live sites are **mocked-e2e fixtures**, which drive the built app as a black box and import nothing from `src/` on purpose (`testing/chip-fills.ts` header states the rule). No app-source site rolls its own day arithmetic, so the new helpers have no existing duplicate to absorb. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1 … AC-9, AC-13:** `npm test` → **1767 passed / 185 files**, including the 36-case
  `availability-calendar.spec.ts` and the 78-case `venue-map.spec.ts`.
- [x] **AC-10, AC-11:** `npm run test:a11y` green (contrast maths + the jsdom axe audit of the open
  popover); `node scripts/check-touch-target.mjs --diff origin/main` clean, and the rendered 44 px
  box is measured at 390 px by `availability-calendar.e2e.ts`.
- [x] **AC-12:** `npm run test:e2e:a11y` → **278 passed**, incl. 9 calendar cases.
- [x] **Non-vacuity spot-checked by mutation**, since three assertions in this slice were found
  passing for the wrong reason: `>=`→`>` on the booking floor turns 2 tests red, deleting the
  `focusRequest` bump turns 1 red, routing `Enter`/`Space` into the keydown switch turns 1 red, and
  removing the e2e's forward month-step turns the tint assertions red on the pinned date.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test — pin-names reconciled against the shipped titles at review round 2 (six had drifted).
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced (invariant #1) — N/A, frontend-only.
- [x] **Availability** section filled; the snapshot-never-a-hold rule is honoured in wording and in code (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4) — `total` is not presented as bookable; today/past are display-only.
- [x] **Modulith** section filled (N/A, frontend-only); no new cross-feature FE import — RV-FE-8 verified mechanically, the grep returns exactly the five grandfathered edges.
- [x] **Payment/payout** N/A.
- [x] Refund policy — N/A.
- [x] Timezone correct: every date operation goes through `shared/booking-date.ts`; no `toISOString()` (invariant #6).
- [x] Booking codes — N/A.
- [x] Flyway — N/A, no schema change.
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] `node scripts/check-plan-file-structure.mjs --diff origin/main` green (plan doc staged first), alongside the touch-target, focus-posture and inline-comment guards.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty.
- [x] **Close-out written in THIS PR** — final plan-doc state committed here, citing `merged via PR #763`.
- [x] **The review gate ran in full** — a `/code-review` pass, then a five-lens subagent fan-out
      (a11y/ARIA, CSS-layout-stacking, logic-and-edge-cases, test-quality, conventions) explicitly
      requested by the maintainer, plus `riviera-review-overlay` and a `riviera-docs-freshness`
      sweep. 22 findings; every one fixed or answered in the register below.
