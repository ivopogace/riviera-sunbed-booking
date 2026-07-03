# T8 — Find my booking: code-entry lookup (Liquid Glass) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox
> (`- [ ]`) syntax. Riviera discipline: this is a **pure-FE** slice — the Availability,
> Modulith, and Payment sections are `N/A` with reasons, but the **booking code as an
> unguessable bearer credential (invariant #7)** and a11y/contrast are first-class. The
> code-lookup oracle is already guarded server-side (rate limit, #56); this slice must not
> weaken that or leak the code.

**Goal:** Add the v3 **"Find a booking"** entry point — a nav trigger (desktop + mobile
menu) that opens a glass **modal** where a guest types their booking code; a valid code
navigates to the existing T5 `/booking/:code` detail view, and an unknown / rate-limited /
failed lookup shows an inline error **without** navigating. No backend change (the lookup
endpoint `GET /api/bookings/{code}` — permitAll, rate-limited #56 — already exists).

**Architecture:** One new self-contained modal component `booking/find-booking.ts`
(`role="dialog"`, focus-trapped, ESC/backdrop-dismissable), cloning the shipped
`booking-dialog` a11y-modal + glass recipe. The app **shell** (`app.ts`) owns only the
open-state + the two nav triggers + focus-restore, and renders `<app-find-booking>` when
open — mirroring its existing `closeMenus()` idiom. The single non-obvious decision:
**the find surface performs the lookup itself** (`BookingService.getByCode`) so an unknown/
rate-limited code renders inline with no navigation (AC-1); on success it navigates to the
existing `/booking/:code` deep link, which re-fetches — an accepted 2nd GET, negligible
against the 60/min per-code **and** per-IP buckets (#56).

**Persistence:** JDBC only (invariant #1). N/A — no server persistence touched (pure FE).

**Source of intent:** GitHub issue **#148** (epic #133); design
`docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` → *Find booking* modal (`findOpen`
block, lines ~688–702; the `openFind`/`submitFind` demo handlers ~1057–1066; the nav
triggers, desktop line ~78 + mobile line ~53) and `docs/design/2026-07-02-liquid-glass-redesign-note.md`
(v3 mapping table: "Find-a-booking … new tourist-epic slice (T8)").

**Skills consulted:** `riviera-sdlc` (loop orchestration; **Issue-intake grill gate run** —
findings folded into *Resolved* below; two product decisions escalated to the maintainer) ·
`riviera-frontend` (placement: modal in `booking/`, open-state + triggers in the `app` shell,
**no new route**, glass cloned not yet extracted (2nd modal, rule of three), contrast by
composited math, e2e in the CI-safe suite, one-way imports) · `angular-developer` + angular-cli
MCP (`get_best_practices` + `list_projects`: v22 standalone/signals, `@if`, `inject()`,
`@Service`, `output()`, **Signal Forms** for the code field, native control-flow, a11y/focus)
· `playwright-cli` (author the CI-safe `find-a-booking` e2e; two-suite split — loaded at Phase 5)
· `riviera-plan-doc` (this doc) · `tdd` (red-green per behavior) · `riviera-review-overlay`
(RV-FE-*, RV-FE-E2E, the booking-code-security bank item, RV-PROC-1 — at the review gate) ·
`riviera-local-debug` (scoped test/e2e run recipes — loaded before the first `npm`). No
`postgres`/`riviera-modulith`/`riviera-stripe-payments` — no DB, no backend Java, no money logic.

**Branch:** `feature/t8-find-my-booking` (created before Phase 0; local session on `main`,
stands in for a remote session branch).

---

## Acceptance criteria (testable)

> Phrased at the component/shell boundary (what the modal does for a typed code + a mocked
> `BookingService` response), not pixel level. Pinned by `find-booking.spec.ts`,
> `find-booking.a11y.spec.ts`, `find-booking.contrast.spec.ts`, `app.spec.ts`, and the
> CI-safe e2e `find-a-booking.e2e.ts`.

- [ ] **AC-1 (valid code → existing detail view):** Given the find modal open and a code the
  server answers `200`, when the guest submits, then `BookingService.getByCode(normalized)` is
  called and the app navigates to `/booking/{normalized}` (the T5 deep link) — **no new route,
  no code in a query string** (invariant #7). *Pinned by:* `find-booking.spec.ts` "navigates to
  the booking detail on a found code" + the e2e.
- [ ] **AC-2 (unknown code → inline error, no navigation):** Given a code the server answers
  `404`, when the guest submits, then an inline `role="alert"` error renders ("No booking found
  for {code}. Check the code and try again.") **and no navigation occurs** and the modal stays
  open. *Pinned by:* `find-booking.spec.ts` "shows the not-found error and does not navigate on a 404".
- [ ] **AC-3 (rate-limited → retry copy):** Given the lookup endpoint answers `429` (the #56
  per-code / per-IP limit), when the guest submits, then the inline error reads the retry copy
  ("Too many attempts. Please wait a moment and try again.") and no navigation occurs. *Pinned by:*
  `find-booking.spec.ts` "shows the rate-limit retry copy on a 429".
- [ ] **AC-4 (network / server failure → generic error):** Given the lookup fails with status
  `0` or `≥500`, when the guest submits, then a generic inline error ("Something went wrong.
  Please try again.") renders and no navigation occurs. *Pinned by:* `find-booking.spec.ts`
  "shows a generic error on a transport/5xx failure".
- [ ] **AC-5 (empty submit → required message, no request):** Given an empty code, when the
  guest submits, then the required-field message ("Enter your booking code.") renders and **no**
  `getByCode` call is made. *Pinned by:* `find-booking.spec.ts` "requires a code before calling
  the API".
- [ ] **AC-6 (code normalization):** Given input with surrounding whitespace, internal spaces/
  dashes, or lowercase (e.g. `" k4tq-7m9p x2 "`), when submitted, then the code sent is the
  normalized `K4TQ7M9PX2` (trim → uppercase → strip `\s`/`-`); no strict client format regex
  rejects an otherwise-valid code (the server 404 is the authority on unknown/malformed).
  *Pinned by:* `find-booking.spec.ts` "normalizes the entered code before lookup".
- [ ] **AC-7 (no double-submit):** Given a submit is in flight, when the button is pressed
  again, then a second `getByCode` is **not** issued (the button is disabled / the handler
  guards) — the lookup oracle is not hit twice per attempt. *Pinned by:* `find-booking.spec.ts`
  "disables submit while a lookup is in flight".
- [ ] **AC-8 (nav trigger, desktop + mobile, opens the modal):** Given the shell, the desktop
  primary nav and the mobile menu each expose a **"Find a booking"** control that, when
  activated, opens the modal (`findOpen`) and closes the menu/theme popovers; it is a
  `<button>` (opens a dialog), **not** a router link, and adds **no** route. *Pinned by:*
  `app.spec.ts` "exposes a Find a booking trigger on desktop and mobile that opens the modal".
- [ ] **AC-9 (accessible modal):** Given the modal open, it exposes `role="dialog"`,
  `aria-modal="true"`, an accessible name from its heading (`aria-labelledby`), a labelled code
  input, and a close control; focus moves into the input on open, is trapped while open, and
  returns to the triggering control on dismiss (desktop trigger / the mobile menu button).
  *Pinned by:* `find-booking.a11y.spec.ts` (roles/name/label/close) + `app.spec.ts`
  (focus-restore target) + the e2e axe run.
- [ ] **AC-10 (dismiss paths):** Given the modal open, ESC, a backdrop click, and the close
  button each emit `close` and hide the modal (with focus restore); a successful navigation also
  closes it (focus goes to the new page, **not** restored to the trigger). *Pinned by:*
  `find-booking.spec.ts` "emits close on esc/backdrop/close" + `app.spec.ts` "closes the find
  modal on navigation".
- [ ] **AC-11 (a11y, both themes):** Given the open modal (idle and error states), when
  rendered, then `expectNoAxeViolations` / `expectNoSeriousAxeViolations` pass; the error region
  is an `aria-live`/`role="alert"` announced to AT. *Pinned by:* `find-booking.a11y.spec.ts` +
  the e2e axe run (riviera + porcelain).
- [ ] **AC-12 (contrast, both themes):** Given riviera + porcelain, every text pair on the glass
  modal (title ink, body-soft, field ink, the error red, the white CTA on `--riv-cta-grad`)
  meets AA over the worst-case gradient stop under the modal scrim. *Pinned by:*
  `find-booking.contrast.spec.ts` (composited math, both themes).
- [ ] **AC-13 (invariant #7 — code confinement):** The typed code is sent only to the existing
  `GET /api/bookings/{code}` and placed in a URL only via the existing `/booking/:code`
  navigation; it is **never** `console.*`-logged and no new code-bearing route/query is
  introduced. *Pinned by:* source review + a grep gate in Phase 1 (no `console` referencing the
  code) + AC-1's "no query string" assertion.
- [ ] **AC-14 (e2e, CI-safe suite):** open the modal from the nav → type a valid (mocked) code
  → land on the `/booking/:code` detail; and type an unknown (mocked-404) code → inline error,
  no navigation; axe green in both themes. *Pinned by:* `frontend/e2e/find-a-booking.e2e.ts`.

## Non-goals

- **A dedicated `/find` page / deep-linkable route** — **decision (maintainer, this session):
  build the nav-triggered glass **modal** per the committed v3 design.** The trade-off (a modal
  has no URL, so no refresh/deep-link) is accepted; a `/find` page was the declined alternative.
- **A new code-in-query-string lookup route** (e.g. `/find?code=…`) — forbidden by invariant #7;
  the only place a code appears in a URL stays the existing `/booking/:code` deep link.
- **Backend changes** — the endpoint, its 404, and its rate limit (#56) already exist. This
  slice adds **no** unthrottled lookup path (the find surface calls the same throttled GET).
- **A strict client-side code-format validator** — real codes are 10-char Crockford base32
  (`SecureRandomBookingCodeGenerator`), and a brittle regex risks rejecting a valid code; the
  server 404 judges unknown/malformed. Only trim/uppercase/strip normalization is client-side.
- **A Find affordance in the "My bookings" empty state / list header** — the v3 empty state
  (design ~line 433) shows no find button; T6 deliberately omitted one. Adding a cross-link is a
  possible follow-up, not an AC of #148. Out of scope.
- **Prefetch/hand-off of the fetched detail into `booking-view`** — the find surface validates
  then navigates, and `booking-view` re-fetches from the route param (its deep-link path stays
  pure). The 2nd GET is negligible against the #56 budget; no shared-signal hand-off is added.
- **Extracting a shared `modal-glass` mixin** — `find-booking` is the **2nd** modal (after
  `booking-dialog`); rule of three defers extraction to a 3rd modal. The glass values are cloned
  with a comment pointing at the shared origin.
- **Auth / account-backed lookup** — epics #108/#114. A guest with the code is the only actor here.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The booking code (a bearer credential, invariant #7) leaks via a log line, a query string, or an error/telemetry sink | low | high | Code sent only to the existing `GET /api/bookings/{code}`; URL only via `/booking/:code`; **grep gate** — no `console` referencing the code; error copy echoes the user's own on-screen input only (not a log). Pin AC-13 | agent | open |
| R-2 | The lookup oracle is hit harder than #56 assumes (double-submit, retry loop) → faster rate-limit trip for a legit guest | med | med | Disable submit while in flight (AC-7); one GET per attempt; success does exactly one extra GET via `booking-view` (well under 60/min per-code + per-IP) | agent | open |
| R-3 | The design's `RIV-XXXX` placeholder / `RIV-K4TQ` example trains guests to type a prefix/dash the real 10-char code lacks → self-inflicted 404s | med | med | **Decision (maintainer): match real codes** — accurate placeholder/example, no `RIV-`/dash, drop the demo-tip line; forgiving normalization strips a stray dash/space anyway (AC-6) | agent | open |
| R-4 | Focus not restored (or restored to a now-removed mobile menu item) on dismiss → keyboard/AT trap or lost focus (WCAG 2.4.3) | med | high | Trap focus while open (clone `booking-dialog`); autofocus the input; restore to the **desktop** trigger or, when opened from mobile (menu collapses), the persistent **menu button**; success-navigation lets the new page take focus (no restore). Pin AC-9/AC-10 | agent | open |
| R-5 | Modal glass text fails AA in one theme over the gradient's worst stop under the scrim (the recurring `css:S7924` translucent-glass trap) | low | high | Clone `booking-dialog`'s AA-proven values (white 0.82 panel, dark `--riv-field-border`, `#a3160e` error, `--riv-cta-grad` white CTA); prove every pair by composited math both themes (AC-12) | agent | open |
| R-6 | Shell → feature import (`app` renders `booking/find-booking`) misread as a boundary violation | low | low | The shell is the **composition root**, not a feature folder; a globally-triggered booking modal must be rendered by the always-present shell (it can't live in `core/` — it needs `BookingService`). Note it for the review gate as a deliberate, justified import | agent | open |
| R-7 | Adding the trigger button to the desktop nav breaks the `<a>`-only nav styling / spacing | low | low | Style a real `<button>` to match `.riv-nav-link` (semantics: it opens a dialog, not a link); axe + the existing shell a11y spec stay green | agent | open |
| R-8 | e2e copy assertions break when modal/error copy is reworded | med | low | Assert stable phrases + `data-testid`s (`find-open`, `find-code`, `find-submit`, `find-error`); keep booking-view testids untouched | agent | open |
| R-9 | Case/whitespace mismatch: server stores uppercase codes; a lowercased/space-padded entry 404s a valid code | med | med | Normalize trim→uppercase→strip `\s`/`-` before lookup (AC-6), matching the stored uppercase form and the design's `toUpperCase()` | agent | open |

## Open questions / Assumptions

- **Assumption (resolved by evidence):** `GET /api/bookings/{code}` is rate-limited on **both**
  a per-code and a per-IP bucket (`RateLimitProperties`, #56, 60/min default) and returns `404`
  `NO_SUCH_BOOKING` for an unknown code with the code never logged (`BookingController.view`) →
  the AC-2/AC-3 error paths are reachable with **no** backend work. *Owner:* agent · *Resolved:*
  grill gate (code read).
- **Assumption:** the server matches codes as stored (uppercase, from
  `SecureRandomBookingCodeGenerator`) → client uppercasing is correct and defensive. *Owner:*
  agent · *Resolves by:* Phase 1 (unit-pin the normalized value sent).

### Resolved (Issue-intake grill gate, this session)

- **Surface shape** → **nav-triggered glass modal** (per v3 design), not a `/find` page
  (maintainer decision, escalated).
- **Code input copy** → **match real codes** (10-char bare base32; drop the design's `RIV-XXXX`/
  `RIV-K4TQ`/demo-tip) (maintainer decision, escalated).
- **On success** → navigate to the existing `/booking/:code` (T5) deep link; the find surface
  validates first so unknown/rate-limited codes render inline without navigation (AC-1/AC-2).
- **Nav "How it works" slot** — the issue says the entry "takes the slot the dead 'How it works'
  item vacated in T1," but the shipped nav (`app.html`) has **no** such item (Beaches + My
  bookings only). T8 is a **pure add** of "Find a booking" to desktop nav + mobile menu.
- **Nav entry ownership** — T6 (#139) deferred the "Find a booking" nav entry to this slice; it
  is in T8's DoD (AC-8), added once each to desktop + mobile.
- **Backend needed?** — **No.** Endpoint + 404 + rate-limit (#56) all exist; pure FE.
- **In flight:** epic #133's last open slice; T7 (#140) merged (3d23063); zero open PRs → no
  shared-file collision, **no Flyway migration** (FE-only, so no `V<n>` to claim); branch off
  clean `main`.

## Availability & concurrency (invariant #2)

N/A — pure FE. No write path to `availability(set_id, booking_date)`. The find modal only issues
the existing read `GET /api/bookings/{code}` and navigates to the unchanged T5 detail view. No
concurrency surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend Java, no module boundary, no event, no `api/` port touched.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves. The modal fetches a booking by code and navigates; it renders nothing
about money, confirms nothing (webhook-as-truth #8 untouched), and computes no refund. Any money
the guest then sees is rendered by the unchanged T5 detail view from server data (invariant #5).

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/find-booking.ts` (+ `.scss`) | **new** | standalone modal component (`app-find-booking`) | signals: `lookupError`, `submitting`; `inject()` `BookingService` + `Router`; `output() close` | **Signal Forms** (single `code` field, `required`) |
| FE-2 | `booking/find-booking.spec.ts` | **new** | unit | mocked `BookingService.getByCode` (found / 404 / 429 / 5xx / empty / normalize / in-flight) | — |
| FE-3 | `booking/find-booking.a11y.spec.ts` | **new** | axe | dialog role + name, labelled input, close control, alert region | — |
| FE-4 | `booking/find-booking.contrast.spec.ts` | **new** | contrast | composited-math AA both themes (panel ink/soft/field/error/CTA) | — |
| FE-5 | `app.ts` | existing (extend) | shell component | add `findOpen` signal, `openFind(fromMobile)`, `dismissFind()` (focus restore), close-on-`NavigationEnd`; import + render `FindBooking` | — |
| FE-6 | `app.html` | existing (extend) | shell template | "Find a booking" `<button>` in desktop nav + mobile menu; `@if (findOpen()) { <app-find-booking (close)="dismissFind()" /> }` | — |
| FE-7 | `app.spec.ts` | existing (extend) | unit | trigger present desktop + mobile, opens modal, closes menus; modal closes on navigation; focus-restore target | — |
| FE-8 | `frontend/e2e/find-a-booking.e2e.ts` | **new** | e2e (CI-safe) | mocked API; find→open→detail + unknown-code error; axe both themes | — |

**Standards:** standalone (default), `inject()`, `@Service()` reuse, `@if` native control-flow,
`output()` for `close`, signals + Signal Forms (`@angular/forms/signals` — `form`/`required`/
`submit`/`FormField`, the `booking-dialog` precedent), inline template if compact (else
`find-booking.html`), no `as any`, **no `new Date()`** in the component. The code input carries
`autocomplete="off"`, `autocapitalize="characters"`, `spellcheck="false"`. Reduced-motion guard
beside the `riv-pop` open animation.

**Import direction (riviera-frontend):** `booking/find-booking` (feature) → `core`/`shared` only
— it imports `BookingService` from its own feature and `Router`; it does **not** import another
feature. The **shell** `app.ts` imports the feature modal `booking/find-booking` — the shell is
the app composition root (it already composes every feature via the router), not a feature
folder, so shell→feature is permitted; the modal cannot live in `core/` (it needs
`BookingService`). Flagged for the review gate (R-6).

## FE↔BE contract

N/A — no contract change. `GET /api/bookings/{code}` is consumed exactly as the T5 detail view
and T6 list do (`BookingService.getByCode`, `BookingDetail`). The find surface adds no endpoint
and no query parameter; the 404 (`NO_SUCH_BOOKING`) and 429 (rate limit, #56) responses already
exist and are mapped to inline copy client-side. Money/date on the wire: not rendered by this
surface.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | 2ad9f8b |
| 1 — `find-booking` component: form + normalize + lookup + 4 error states + navigate + close + in-flight guard (unit) | ✅ | (impl commit) |
| 2 — `find-booking.a11y.spec.ts` (dialog role/name/label/close/alert) + focus trap/autofocus | ✅ | (impl commit) |
| 3 — `find-booking.scss` glass (clone `booking-dialog`) + `find-booking.contrast.spec.ts` both themes | ✅ | (impl commit) |
| 4 — Shell wiring: triggers (desktop + mobile), `findOpen`/`openFind`/`dismissFind`, close-on-nav, focus restore; `app.spec.ts` | ✅ | (impl commit) |
| 5 — e2e CI-safe `find-a-booking.e2e.ts` (find→open→detail + unknown-code; axe both themes); font-link re-check | ✅ | (impl commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window.

---

## File structure

- `docs/plans/t8-find-my-booking.md` — this plan.
- `frontend/src/app/booking/find-booking.ts` (+ `.scss`) — the glass modal: `role="dialog"`,
  `aria-modal`, focus trap + autofocus, ESC/backdrop/close dismiss, Signal-Forms `code` field
  (`required`), submit → normalize → `getByCode` → navigate `/booking/:code` on 200, inline
  `lookupError` on 404/429/other, `submitting` guard, `output() close`. Never logs the code.
- `frontend/src/app/booking/find-booking.spec.ts` — found→navigate; 404/429/5xx/empty inline
  errors + no-navigate; normalization; in-flight disable; close output; no-console grep.
- `frontend/src/app/booking/find-booking.a11y.spec.ts` — dialog role + accessible name, labelled
  input, close control, `role="alert"` error region; axe on idle + error states.
- `frontend/src/app/booking/find-booking.contrast.spec.ts` — composited AA both themes (title
  ink, body-soft, field ink, error red, white CTA on `--riv-cta-grad`).
- `frontend/src/app/app.ts` — `findOpen` signal, `openFind(fromMobile)`, `dismissFind()` (focus
  restore to desktop trigger / mobile menu button), close-find on `NavigationEnd`; import +
  conditionally render `<app-find-booking>`.
- `frontend/src/app/app.html` — "Find a booking" `<button>` in desktop nav + mobile menu;
  `@if (findOpen())` render of the modal.
- `frontend/src/app/app.spec.ts` — trigger present desktop + mobile → opens modal; opening
  closes menu/theme; modal closes on navigation; focus-restore target.
- `frontend/e2e/find-a-booking.e2e.ts` — CI-safe mocked e2e: open modal → valid code → detail;
  unknown code → inline error, no navigation; axe both themes.

---

## Phases (TDD)

Each phase is red → green → refactor, scoped to the touched specs (never the full suite locally;
see `riviera-local-debug`). Run recipe per phase: `npm test -- <spec filter>`.

- **Phase 1 — The modal component (behavior).** Failing `find-booking.spec.ts`: a found code
  (mocked `getByCode` → `BookingDetail`) calls `getByCode` with the **normalized** code and
  navigates to `/booking/{code}` (spy the `Router`); a `404` sets the not-found `lookupError`
  and does **not** navigate; a `429` sets the rate-limit copy; a status-`0`/`500` sets the
  generic copy; an empty submit shows the required message and issues **no** `getByCode`; a
  second submit while in flight issues no second call; ESC/backdrop/close emit `close`.
  Green: the standalone component with an inline glass template, a Signal-Forms `code` field
  (`required` → "Enter your booking code."), a private `normalizeCode` (trim → `toUpperCase` →
  `replace(/[\s-]/g, '')`), a `lookupErrorOf(status)` mapper (`404`→not-found, `429`→rate-limit,
  else→generic — the `operator-auth` `status === 429` precedent), a `submitting` guard, and
  `output() close`. Grep gate: no `console` referencing the code (invariant #7, AC-13).
- **Phase 2 — a11y structure + focus.** Failing `find-booking.a11y.spec.ts`: `role="dialog"` +
  `aria-modal="true"` + `aria-labelledby` naming the heading; the input has an associated label;
  a close control with an accessible name; the error region is `role="alert"`; axe clean on idle
  and error states. Green: add the roles/labels; move focus into the input on open (`afterNextRender`
  / `effect`); trap Tab/Shift-Tab within the panel (clone `booking-dialog.trapFocus`); ESC + backdrop
  wired to `close`.
- **Phase 3 — Glass SCSS + contrast.** `find-booking.scss`: clone `booking-dialog`'s AA-proven
  modal recipe — the scrim `:host`/backdrop, the white-0.82 panel, `--riv-field-*` input, the
  `#a3160e` error, the white `--riv-cta-grad` CTA — with a header comment noting the shared origin
  and the **rule-of-three deferral** (extract a `modal-glass` mixin at the 3rd modal). Reduced-motion
  guard beside `riv-pop`. `find-booking.contrast.spec.ts`: `expectAaOverStops` / `contrastRatio` for
  every text pair over both themes' worst gradient stop under the modal scrim.
- **Phase 4 — Shell wiring + nav triggers.** Extend `app.ts`/`app.html`: add a "Find a booking"
  `<button>` to the desktop nav (styled to match `.riv-nav-link`) and the mobile menu
  (`.riv-mobile-link`); `openFind(fromMobile)` sets `menuOpen=false, themeOpen=false, findOpen=true`
  and records the focus-restore target (`fromMobile ? menuButton : findButton`); `dismissFind()`
  sets `findOpen=false` and restores focus to that target; a `NavigationEnd` subscription sets
  `findOpen=false` (no focus restore — the new page takes focus); render `@if (findOpen())
  { <app-find-booking (close)="dismissFind()" /> }`. Extend `app.spec.ts`: the trigger exists on
  desktop + mobile and opens the modal; opening closes the menu/theme popovers; the modal closes on
  navigation. Keep the existing shell a11y spec green.
- **Phase 5 — e2e + font check.** Load `playwright-cli`. New CI-safe `find-a-booking.e2e.ts`:
  `page.route` the venue/detail mocks; open the modal from the desktop nav → type a valid code →
  submit → assert `/booking/{code}` detail; reopen → type an unknown code (mocked `404`) → assert
  the inline error + still on the same URL (no navigation) + modal open; `expectNoSeriousAxeViolations`
  on the open modal in **both** themes (await `getAnimations().finished` first — the modal fades in).
  Run: the cloud e2e recipe from `riviera-local-debug`. Re-grep `Manrope|Instrument Serif` in
  `frontend/src` — `staff-daily.scss` still consumes both (operator epic #141), so **keep** the
  `index.html` font `<link>`; T8 is not the last consumer (per the T6 note).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-03 | Phase 3 (glass modal styling) | the modal-glass recipe's consumers | `grep -rn "backdrop-filter.*blur(34px)" frontend/src` | `booking-dialog.scss` (1st) + `find-booking.scss` (2nd) | **Not** extracted — rule of three defers a shared `modal-glass` mixin to the 3rd modal; find-booking clones booking-dialog's AA-proven values with a comment pointing at the origin. |
| 2026-07-03 | Phase 5 (e2e helper reuse) | the animation-`settle` helper | `grep -rn "getAnimations" frontend/e2e/support` | `support/booking-dialog.ts` `settle` (existing) | Reused `settle` for the modal pop-in axe timing — no new duplicate helper. |
| 2026-07-03 | Phase 5 (font-link close-out) | Manrope / Instrument Serif consumers | `grep -rn "Manrope\|Instrument Serif" frontend/src` | `staff-daily.scss` (still uses both) + `index.html` (the link) | Keep the `<link>` — `staff-daily` (operator epic #141) is the true last consumer; T8 does not touch it. |

---

## Review-gate record (high effort — `riviera-review-overlay` + workflow `/code-review`)

Ran on the PR #167 diff at **high effort** (invariant #7 = security-sensitive bearer credential;
12 agents, 4 finder angles + adversarial verify). Overlay Blockers **RV-BE-1 / RV-CT-3 / RV-BE-9:
N/A** (pure FE — no availability write, no webhook confirm, no venue-scoped endpoint). **RV-PROC-1
✅** (Skills-consulted covers the diff; all fixes stayed FE — `angular-developer`/`riviera-frontend`/
`playwright-cli` already loaded, no new area). **RV-FE-* / RV-FE-E2E ✅.** 7 verified findings, all
fixed test-first in the FE area:

| # | Finding | Sev | Resolution |
|---|---|---|---|
| [0] | booking→booking nav reuses `BookingView` (constructor read `route.snapshot` once) → shows the **wrong booking** — a trust bug the T8 find modal makes reachable on the detail page | correctness | `booking-view` now subscribes to `route.paramMap` and reloads (resetting view state) on a code change; `paramMap` emits synchronously so the initial load is unchanged. Test: "reloads and re-renders when the route code changes". |
| [1] | success path never reset `submitting` → modal freezes on "Opening…" when the nav produces no `NavigationEnd` (same-URL / blocked / rejected chunk) | correctness | `onSubmit` checks `navigate()`'s boolean: `false` → reset `submitting` + `dismissed.emit()` (close, target already shown); a rejected nav is caught → generic error, no freeze. Test: "closes the modal without freezing when the navigation is a no-op". |
| [2] | whitespace/dash-only code passed `required` but normalized to '' → silent no-op, no feedback | correctness | Empty message now keyed off `normalizedCode()` (blank AND whitespace/dash-only). Test: "shows the enter-a-code message for a whitespace/dash-only entry". |
| [3] | stale server error lingered while the guest typed a correction | correctness | `(input)` clears `lookupError`. Test: "clears a stale lookup error when the guest edits the code". |
| [4] | focus lost after find→nav (modal removed, `BookingView` doesn't take focus) — WCAG 2.4.3 | correctness (a11y) | The shell focuses `<main tabindex="-1">` when the find modal closes on navigation. Test: "closes … and moves focus to main". |
| [5] | double-GET (find validate + booking-view re-fetch) can 429 near the rate ceiling | correctness (PLAUSIBLE) | **Deferred → follow-up issue.** Bounded (2 GETs vs 60/min per-code+per-IP); only a pathological near-ceiling case 429s. The clean fix (a prefetch hand-off to booking-view) is a design change; filed separately. |
| [6] | `trapFocus` + autofocus verbatim-duplicated from `booking-dialog` (2nd modal) | cleanup | **Deferred → follow-up issue** (rule of three — extract a shared focus-trap directive at the 3rd modal). Added a note in `find-booking.ts` flagging the deliberate duplication (mirrors the SCSS rule-of-three note). |

Refuted at verify: 1 (a duplicate framing of [1]). All fixes: 458 unit + 25 e2e + lint + prod build
green.

## Sonar-gate record (PR #167)

SonarCloud quality gate ran on PR #167. The reported new-issue list (pulled from the API, not
just the gate conclusion) carried **1 CRITICAL code smell**: `typescript:S3735` at
`find-booking.ts:154` — "Remove this use of the void operator" (the `void this.router.navigate(...)`
in the subscribe `next`). **Fixed in-code** (FE area — `angular-developer`/`riviera-frontend`
already loaded): `onSubmit` became `async`, validating the code via `firstValueFrom(getByCode)` then
**awaiting** `router.navigate` — matching the codebase's every-other-navigate idiom (venue-map,
booking-view) and removing the `void`. Re-verified: 23 find-booking specs + 3 e2e + lint green; the
3 error-path unit tests gained a `detectChanges()` after the now-async settle (a test-timing
artifact — the real browser re-renders on the signal write, proven by the e2e error test). A re-run
after the fix push confirms the reported list reaches zero. New-code coverage / duplications checked
via the measures API after the re-analysis.

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1..AC-7, AC-13:** `npm test -- find-booking.spec` → green (navigate on found; inline
  errors + no-navigate on 404/429/5xx/empty; normalization; in-flight guard; no code logged).
- [ ] **AC-9, AC-11:** `npm test -- find-booking.a11y` → axe green (roles/name/label/close/alert).
- [ ] **AC-12:** `npm test -- find-booking.contrast` → contrast green both themes.
- [ ] **AC-8, AC-10:** `npm test -- app.spec` → green (trigger desktop + mobile opens modal;
  closes on navigation; focus-restore target).
- [ ] **AC-14:** `npm run test:e2e:a11y find-a-booking` → green (find→open→detail + unknown-code
  error + axe both themes).
- [ ] **AC-13 (grep):** `grep -rn "console" frontend/src/app/booking/find-booking.ts` → no code
  logging; and no new code-in-query route in `app.routes.ts`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc or code.
- [ ] No JPA (N/A — FE). Availability/module/payment logic unchanged (all N/A with reasons).
- [ ] Booking code (invariant #7): sent only to `GET /api/bookings/{code}`, in a URL only via the
  existing `/booking/:code`, never logged; **no new code-bearing route/query**.
- [ ] No new unthrottled lookup path; submit disabled in flight; ≤1 extra GET on success (#56 budget).
- [ ] Frontend standards met; Signal Forms for the code field; no `as any`; import direction
  one-way (shell→feature justified, R-6); a11y proven (axe + dialog role + focus trap + restore).
- [ ] Contrast proven both themes; deviations commented; glass cloned (rule-of-three note present).
- [ ] Nav trigger present desktop + mobile (added once each); opens the modal; **no new route**;
  e2e green.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty/deferred.
- [ ] Close-out: tick epic #133 T8 with the squash SHA; **this closes epic #133** → run the epic
  close-out (`riviera-docs-freshness` over T8's range **and** the epic's full merge span); keep the
  font `<link>` (still #141); tick the PR Gates checkboxes as each gate passes.
