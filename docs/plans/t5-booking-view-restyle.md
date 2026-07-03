# T5 — Booking view + cancel restyle (Liquid Glass) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`. Steps use checkbox
> (`- [ ]`) syntax. Riviera discipline: this is a **pure-FE restyle** — the
> Availability, Modulith, and Payment sections are `N/A` with reasons, but the
> server-truth (invariants #4/#10/#5) and a11y/contrast discipline are first-class.

**Goal:** Restyle the booking detail page (`/booking/:code`, `booking/booking-view`)
to the v3 Liquid Glass design — a glass detail card with a unified status chip for the
whole #98 status union (CONFIRMED, PENDING_REQUEST, AWAITING_PAYMENT, DECLINED, EXPIRED,
CANCELLED, COMPLETED, NO_SHOW), status banners, a dashed code card, detail rows, and the
two-step cancel — **changing presentation only**, never behaviour: refund copy/amounts stay
the server's decision and the status/refund/message update in place after cancel.

**Architecture:** Presentation-only rewrite of one standalone component's inline template +
its `.scss`, reusing the shipped `shared/_glass.scss` `card-glass` recipe and the
`styles.scss` `--riv-*` tokens (as T2–T4 did). The one non-obvious decision: **status chips
and banners use opaque *solid* composited fills, not the design's translucent tints** — the
established `css:S7924` treatment (see `_glass.scss` `failure-icon`), which makes the chip/
banner text AA-provable by plain `contrastRatio(ink, fill)` and keeps the SonarCloud analyzer
from false-positiving translucent-tint text.

**Persistence:** JDBC only (invariant #1). N/A — no persistence touched (pure FE).

**Source of intent:** GitHub issue **#138** (epic #133); design
`docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` → *My bookings* detail card +
`STATUS_META` chip map (lines ~335–427, ~1163–1180).

**Skills consulted:** `riviera-frontend` (booking-view stays in the `booking/` feature
folder; tokens in `styles.scss`, glass recipe in `shared/_glass.scss`, contrast proven by
composited math, e2e in the CI-safe suite) · `angular-developer` + angular-cli MCP
(`get_best_practices`: signals/`@if`/`@switch`, `input()` n/a here, a11y focus/live-region,
inline template) · `playwright-cli` (author/adjust the CI-safe e2e specs; two-suite split) ·
`riviera-plan-doc` (this doc) · `tdd` (red-green per status) · `riviera-review-overlay`
(RV-FE-*, RV-FE-E2E at review). No `postgres`/`riviera-modulith`/`riviera-stripe-payments` —
no DB, no backend Java, no money *logic* (money is display-only via `shared/money.ts`).

**Branch:** `feature/t5-booking-view-restyle` (created before phase 0; stands in for the
remote session branch — this is a local session on `main`).

---

## Acceptance criteria (testable)

> Phrased at the component boundary (what the rendered view shows for a given server
> `BookingDetail`), not at pixel level. Pinned by `booking-view.spec.ts` (unit),
> `booking-view.contrast.spec.ts` (contrast), and the CI-safe e2e.

- [ ] **AC-1 (status chip, whole union):** Given a `BookingDetail` with each of the 8 #98
  statuses, when the view renders, then the header shows a status chip with the design's
  label (`Confirmed`/`Pending request`/`Awaiting payment`/`Declined`/`Expired`/`Cancelled`/
  `Completed`/`No-show`) carrying `data-testid="booking-status"`. *Pinned by:*
  `booking-view.spec.ts` "renders the status chip label for every #98 status".
- [ ] **AC-2 (PENDING_REQUEST banner, no withdraw):** Given `status=PENDING_REQUEST`, when
  rendered, then the `request-pending` banner shows "Waiting for the venue" + the
  Tirane-zone response deadline, and renders **no** withdraw control (guest withdraw is
  backend #123, not shipped). *Pinned by:* `booking-view.spec.ts` "PENDING_REQUEST shows
  waiting + deadline and no withdraw button".
- [ ] **AC-3 (AWAITING_PAYMENT accepted → Pay now):** Given `status=AWAITING_PAYMENT` with
  `payment` credentials and a (historical) `requestExpiresAt`, when rendered, then the
  `request-accepted` banner shows "Request accepted" + a `pay-now` button that hands the open
  intent to `/booking/pay`. *Pinned by:* `booking-view.spec.ts` "offers Pay now on an accepted
  request…" (existing, kept green).
- [ ] **AC-4 (AWAITING_PAYMENT instant resume):** Given `status=AWAITING_PAYMENT` with
  `payment` but `requestExpiresAt=null`, when rendered, then the banner shows "Complete your
  payment" and never claims the venue accepted anything. *Pinned by:* existing spec, kept green.
- [ ] **AC-5 (DECLINED/EXPIRED terminal):** Given `status=DECLINED` (resp. `EXPIRED`), when
  rendered, then the matching banner shows the terminal no-charge copy ("haven't been
  charged"). *Pinned by:* existing declined/expired specs, kept green.
- [ ] **AC-6 (server-truth refund terms):** Given a cancellable `CONFIRMED` booking, when
  rendered, then `refund-terms` shows copy derived only from server fields
  (`beforeCutoff`, `refundIfCancelledNow`) with the amount via `shared/money.ts` — no client
  date/cutoff arithmetic. *Pinned by:* `booking-view.spec.ts` "shows the full-refund terms…"
  (kept) + the source has no `Date`/cutoff math.
- [ ] **AC-7 (two-step cancel, in-place update):** Given a cancellable booking, when the guest
  clicks Cancel → Confirm cancellation, then `cancel` is called once, and the status chip
  becomes `Cancelled`, the `refunded-amount` row appears, and the `cancel-result` live region
  announces the server refund — all without a full reload. *Pinned by:* `booking-view.spec.ts`
  "cancels after confirmation and shows the refund result" (kept, extended to assert the chip
  flip + refunded row).
- [ ] **AC-8 (refund render from server data):** Given a `CANCELLED` detail with
  `refundedAmount`, when rendered, then the `Refunded` row shows `formatMoney(refundedAmount)`;
  given `refundedAmount=null`, the row is absent. *Pinned by:* `booking-view.spec.ts` "shows the
  refunded amount only when the server reports one".
- [ ] **AC-9 (a11y, both flows):** Given each status and the cancel confirm prompt, when
  rendered, then `expectNoAxeViolations` passes and focus moves to the destructive confirm
  button when the prompt appears. *Pinned by:* the axe assertions already in each `it`, kept.
- [ ] **AC-10 (contrast, both themes):** Given the riviera and porcelain themes, every text
  pair on the card glass meets AA over the worst-case gradient stops, and every chip/banner/
  button text pair meets AA on its solid fill. *Pinned by:* `booking-view.contrast.spec.ts`.
- [ ] **AC-11 (route un-legacied):** Given the app routes, `booking/:code` carries no
  `legacySurface` flag and appears in `RESTYLED_PATHS`. *Pinned by:* `app.spec.ts`
  "marks every not-yet-restyled route…".
- [ ] **AC-12 (e2e green):** The CI-safe e2e specs that open `/booking/:code`
  (`booking-flow`, `request-to-book`) stay green with preserved `data-testid`s. *Pinned by:*
  `npm run test:e2e:a11y`.

## Non-goals

- **My-bookings list** (the design's list card with per-row status sub-labels) — that is
  **T6 (#139)**, which depends on this slice. T5 is the single-code detail view only.
- **Guest request-withdraw** — backend **#123**, not shipped. Render the PENDING banner
  without the control; leave a code comment cross-linking #123.
- **A live payment-hold deadline** for AWAITING_PAYMENT — the API exposes no pay-hold field
  (`BookingDetail.requestExpiresAt` is the venue *response* deadline). Showing it as a pay
  countdown would be wrong; a real pay deadline is a backend field = a future slice. See
  Open questions.
- **Backend/API changes** — pure FE; the `BookingDetail`/`Cancellation` contract is unchanged.
- **New palette/theme tokens in `styles.scss`** — chips/banners are booking-view-local solids
  (rule of three: first user; extract to `_glass.scss` only when a 2nd/3rd page needs chips).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Copy reworded during restyle breaks e2e/unit substring assertions ("Waiting for the venue", "Request accepted", "haven't been charged", "Declined") | high | med | Preserve the exact asserted phrases; restyle is visual only. Grep tests for asserted strings before changing copy | agent | open |
| R-2 | Translucent chip/banner tints trip SonarCloud `css:S7924` (colored text on rgba) at the Sonar gate | high | med | Use opaque **solid** fills (composited design tint over white) + AA-clearing inks; prove each in the contrast spec so the analyzer computes ≥4.5 | agent | open |
| R-3 | Moving status from the `dl` row to a header chip drops the `booking-status` testid → e2e red | med | med | Move the `booking-status` testid onto the header chip; its text stays the status label ("Declined" etc.) | agent | open |
| R-4 | `&ngsp;` / whitespace gotcha: inline-template count/label text collapses spacing (the T2 lesson) | med | low | Keep literal spaces around interpolations; verify rendered `textContent` in the unit spec | agent | open |
| R-5 | Chip/banner contrast eyeballed instead of proven → AA regression in one theme | med | high | All fills/inks computed and asserted in `booking-view.contrast.spec.ts`; values in this plan are pre-verified | agent | open |
| R-6 | Focus management lost when the cancel prompt is restyled (the `effect` + `viewChild` focus) | low | med | Keep the existing `confirmBtn` `viewChild` + focus `effect`; a11y spec asserts it | agent | open |

## Open questions / Assumptions

- **Assumption (server-truth, resolved by evidence):** AWAITING_PAYMENT shows **no live pay
  deadline** because `BookingDetailView`/`BookingDetail` expose only `requestExpiresAt` (the
  venue *response* deadline, `null` for instant bookings) — there is no pay-hold field. The
  design's `payDeadlineStr` is demo-only. Rendering the response deadline as a pay countdown
  would violate server-truth. *Owner:* agent · *Resolves by:* phase 0 (flagged to the user in
  the plan summary; a real pay-hold deadline = a future backend slice).
- **Assumption:** the asserted copy strings above stay verbatim; only visual treatment changes.
  *Owner:* agent · *Resolves by:* phase 1.

### Resolved

- **Withdraw button** — resolved by the issue's own instruction and #123 status: render the
  PENDING banner **without** a withdraw control; cross-link #123 in a comment. (Not an open
  question — recorded here for traceability.)
- **Font-link removal (T1 follow-up)** — **deferred, not done.** `grep -ri "Manrope|Instrument
  Serif" frontend/src` at phase 7 shows `staff-daily.scss` still consumes both fonts (lines
  5/10/299). `staff-daily` is still `legacySurface` (operator epic **#141**, not yet restyled),
  so T5 is **not** the last consumer. The Google Fonts `<link>` in `index.html` **stays**; its
  removal defers to whichever operator slice restyles `staff-daily` last. Recorded here + on the
  PR + carried to the operator epic at close-out.

## Availability & concurrency (invariant #2)

N/A — pure FE restyle. No write path to `availability(set_id, booking_date)`; cancel calls the
existing `BookingService.cancel` (backend releases the set — unchanged). No concurrency surface.

## Spring Modulith — modules, interfaces, events

N/A — frontend-only. No backend Java, no module boundary, no event, no `api/` port touched.

## Payment & payout (invariants #5, #8, #9, #10)

- **Money:** display only — every amount rendered via `shared/money.ts` `formatMoney` from
  integer minor units + ISO currency (invariant #5). No arithmetic in the component.
- **Refund policy (invariant #10):** rendered **verbatim from the server's decision** —
  `beforeCutoff` + `refundIfCancelledNow` for the pre-cancel terms; the `Cancellation`
  (`tier` + `refund`) for the post-cancel message. **No client-side cutoff/date math** (there
  is no `Date`/timezone arithmetic in the component). Confirmation-of-payment path (#8) is
  untouched — Pay now reuses the existing `beginPayment` → `/booking/pay` hand-off.
- **Payout:** N/A — not touched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | existing (rewrite template + status metadata) | standalone component | signals (`booking`, `confirming`, `cancelling`, `cancellation`, `cancelFailed`, `notFound`, `failed`) + focus `effect` | none |
| FE-2 | `booking/booking-view.scss` | existing (rewrite to glass) | component stylesheet | `@use '../shared/glass'`; `--riv-*` tokens + solid chip/banner fills | — |
| FE-3 | `booking/booking-view.spec.ts` | existing (extend) | unit + axe | — | — |
| FE-4 | `booking/booking-view.contrast.spec.ts` | **new** | contrast | composited-math AA proof | — |
| FE-5 | `app.routes.ts` | existing (drop `legacySurface` on `booking/:code`) | routes | — | — |
| FE-6 | `app.spec.ts` | existing (add `'booking/:code'` to `RESTYLED_PATHS`) | unit | — | — |
| FE-7 | `e2e/booking-flow.e2e.ts`, `e2e/request-to-book.e2e.ts` | existing (adjust only if a testid/selector moves) | e2e | — | — |

**Standards:** standalone (default), `inject()`, `@if`/`@switch`, signals, inline template,
`shared/money.ts` for money, `shared/booking-date-label.ts` for the friendly date (as the T4
siblings do), no `as any`. Reduced-motion guard beside any new transition. Focus `effect` +
`viewChild('confirmBtn')` kept for the destructive-confirm a11y.

**Status metadata (component):** replace the `statusLabel` string-transform with an explicit
map so labels match the design exactly (esp. `No-show`) and drive the chip CSS class:

| status | label | chip class | chip ink | chip fill (solid) | AA |
|---|---|---|---|---|---|
| CONFIRMED | Confirmed | `chip--confirmed` | `#0e6e46` | `#d9f2e7` | 5.33 |
| PENDING_REQUEST | Pending request | `chip--pending` | `#8a5410` | `#fceed5` | 5.46 |
| AWAITING_PAYMENT | Awaiting payment | `chip--awaiting` | `#0a5e7a` | `#d5f1f6` | 6.13 |
| DECLINED | Declined | `chip--declined` | `#8a3a2a` | `#f6e5e0` | 6.33 |
| EXPIRED | Expired | `chip--expired` | `#5a6a72` | `#eceeef` | 4.83 |
| CANCELLED | Cancelled | `chip--cancelled` | `#8a3a2a` | `#f6e5e0` | 6.33 |
| COMPLETED | Completed | `chip--completed` | `#0a5e6e` | `#e1f5f9` | 6.56 |
| NO_SHOW | No-show | `chip--no-show` | `#7a4a3a` | `#ece6e3` | 5.93 |

**Banner solid fills (eyebrow / body `#334a52` / strong `#0a2a33`):** AWAITING `#ddf4f8`
(eyebrow `#0a5e7a` 6.35) · PENDING `#fdf5e6` (eyebrow `#8a5410` 5.77) · DECLINED `#faefec`
(eyebrow `#8a3a2a` 6.85) · EXPIRED `#f0f2f3` (eyebrow `#4f5f67` 5.91). Body/strong inks clear
8.2–13.9 on every banner fill.

**Cancel section:** "Confirm cancellation" = white on terracotta gradient `#c14a2c → #a83c25`
(white AA 4.90 / 6.29; the design's `#d96a4a` top stop failed at 3.44, darkened for AA).
"Cancel booking" / "Keep booking" outline buttons = solid `#f4f6f7` fill, inks `#a3372a` (6.17)
/ `#0a4f5e` (8.45). Card-glass surfaces (heading, detail rows, code card, terms, result,
empty/loading states) reuse the proven `--riv-card-ink` / `--riv-card-ink-soft` /
`--riv-accent-ink` tokens via `expectAaOverStops`.

## FE↔BE contract

N/A — no contract change. `BookingDetail` / `Cancellation` consumed exactly as today; the
`payment` credentials hand-off to `/booking/pay` is unchanged.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Plan doc + branch | ✅ | 552640a |
| 1 — Status metadata + chip (unit red→green) | ✅ | (impl commit) |
| 2 — Template restyle: header chip, code card, detail rows, banners, cancel, states | ✅ | (impl commit) |
| 3 — booking-view.scss glass rewrite | ✅ | (impl commit) |
| 4 — Contrast spec (new) | ✅ | (impl commit) |
| 5 — Route un-legacy + app.spec RESTYLED_PATHS | ✅ | (impl commit) |
| 6 — e2e adjust + run (CI-safe suite) | ✅ | (impl commit; no selector change needed — testids preserved) |
| 7 — Font-link close-out check (Manrope/Instrument Serif) | ✅ deferred | (impl commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

## Review-gate record (high effort — `riviera-review-overlay` + workflow `/code-review`)

Ran on PR #161 diff (lifecycle + refund display touch invariants #4/#10 → high effort). 5 distinct
findings, all verified, all fixed test-first (same area → `angular-developer` + `riviera-frontend`
already loaded; no new skill-routing area, RV-PROC-1 line unchanged):

| # | Finding | Sev | Fix | Test |
|---|---|---|---|---|
| 1 | Post-cancel reload error flips to the error card, discarding the cancellation confirmation | correctness | `load(isRefresh)` — a refresh error keeps the booking + live result | "keeps the cancellation confirmation when the post-cancel reload fails" |
| 2 | `STATUS_META[status]` throws on a status outside the #98 union (FE/BE skew) | correctness | `metaFor()` fallback → humanized label + neutral chip + `Amount` | "renders an unmapped status gracefully…" |
| 3 | Lost programmatic "Status:" label — bare chip announces only the value | a11y | sr-only "Booking status:" before the chip (chip testid text unchanged) | "gives the status chip a visually-hidden 'Booking status' label" |
| 4 | 🎉 in the accepted `<h2>` read as "party popper" | a11y | `aria-hidden` decorative span (+ `&ngsp;`) | "marks the celebratory emoji decorative…" |
| 5 | `amountLabel` a non-exhaustive second source of truth | maintainability | folded `amount:'Paid'\|'Amount'` into `STATUS_META` | covered by #2 + existing amount assertions |

RV-BE-1 (availability), RV-BE-9 (BOLA), RV-CT-3/#8 (webhook-as-truth): **N/A / ✅** — no availability
write, no venue-scoped endpoint, Pay now reuses the webhook-confirmed hand-off (no client confirm).
RV-FE-E2E ✅ (testids preserved, real-browser axe green). RV-PROC-1 ✅ (Skills-consulted covers the diff).

---

## File structure

- `docs/plans/t5-booking-view-restyle.md` — this plan.
- `frontend/src/app/booking/booking-view.ts` — inline template rewrite + explicit status
  metadata map; keep all signals, the focus `effect`, `payNow`, `refundTerms`, `refundSentence`;
  swap local `money()` → `formatMoney`, raw date → `formatBookingDate`.
- `frontend/src/app/booking/booking-view.scss` — glass rewrite (`card-glass`, solid chips/
  banners/buttons, reduced-motion guard).
- `frontend/src/app/booking/booking-view.spec.ts` — extend: chip-per-status, no-withdraw,
  chip-flip-after-cancel, refunded-row presence/absence.
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — **new**: card-glass tokens over
  both themes' stops + solid chip/banner/button pairs.
- `frontend/src/app/app.routes.ts` — remove `data: { legacySurface: true }` from `booking/:code`.
- `frontend/src/app/app.spec.ts` — add `'booking/:code'` to `RESTYLED_PATHS`.
- `frontend/e2e/booking-flow.e2e.ts`, `frontend/e2e/request-to-book.e2e.ts` — adjust selectors
  only if one moves; preserve testids.
- `frontend/src/index.html` — (phase 7) drop the Google Fonts `<link>` iff no scss still
  references Manrope/Instrument Serif.

---

## Phases (TDD)

Each phase is red → green → refactor, scoped to `booking-view*` specs
(`npm run test -- booking-view` / vitest filter), never the full suite locally.

- **Phase 1 — Status metadata + chip.** Failing unit: "renders the status chip label for
  every #98 status" (loop the 8 statuses, assert `booking-status` text = design label).
  Green: add the explicit `STATUS_META`-style map + header chip; move `booking-status` testid to
  the chip; drop the `dl` Status row.
- **Phase 2 — Template restyle.** Rewrite the inline template to the design structure (header
  h1 + chip; code card; Venue/Set/Date/Paid/Refunded rows; the 4 banners as heading+body with
  preserved copy + testids; PENDING with a no-withdraw comment slot #123; two-step cancel; the
  `role="status"` result; not-found/failed/loading as glass cards). Extend specs:
  no-withdraw-button, chip-flip + refunded-row after cancel, refunded-row absent when null.
- **Phase 3 — SCSS.** Rewrite `booking-view.scss` to `card-glass` + the solid chip/banner/
  button fills above; reduced-motion guard for any transition.
- **Phase 4 — Contrast spec.** New `booking-view.contrast.spec.ts`: `expectAaOverStops` for
  card-ink/-soft/accent over both themes; plain `contrastRatio` for each chip/banner/button
  solid pair. Values pre-computed in this plan.
- **Phase 5 — Route + app.spec.** Drop the flag; add the path to `RESTYLED_PATHS`; run
  `app.spec.ts`.
- **Phase 6 — e2e.** Run the CI-safe suite locally with
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` (cloud path);
  adjust only moved selectors.
- **Phase 7 — Font link.** Grep `frontend/src` scss for `Manrope`/`Instrument Serif`; if T5 is
  the last consumer, remove the `<link>` from `index.html`; else defer with a note.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-03 | Phase 2 (status chip pattern) | other status displays that should share the chip | `grep -r "statusLabel\|STATUS_META" frontend/src` | only `booking-view` today; T6 (#139 my-bookings list) will render the same chips | Keep chip styles local to `booking-view` (rule of three: 1st user). T6 promotes them to `_glass.scss`/`styles.scss` when it becomes the 2nd consumer. |
| 2026-07-03 | Phase 7 (font-link removal) | Manrope / Instrument Serif consumers | `grep -ri "Manrope\|Instrument Serif" frontend/src` | `index.html` (link) + `staff-daily.scss` (still uses both) | Defer link removal — `staff-daily` (operator epic #141) is the true last consumer. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-10:** `ng test --include booking-view*.spec.ts + app.spec.ts` → 28 green (unit +
  contrast); full FE suite 359 green.
- [x] **AC-11:** `app.spec.ts` route-flag test green (`booking/:code` in `RESTYLED_PATHS`, no flag).
- [x] **AC-12:** `npx playwright test --config playwright.a11y.config.ts request-to-book booking-flow`
  → 7 green (real-browser axe on the restyled banners; testids preserved).

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD in the doc or code (except the #123 cross-link comment).
- [ ] No JPA (N/A — FE). No availability/module/payment logic changed (all N/A with reasons).
- [ ] Money via `shared/money.ts`, minor units (invariant #5); refund copy server-derived,
      no client date math (invariants #4/#10).
- [ ] Booking code confined to the view + the `/booking/:code` link (invariant #7).
- [ ] Frontend standards met; no `as any`; a11y (axe + focus + live region) preserved.
- [ ] Contrast proven both themes; chip/banner solids AA; deviations commented.
- [ ] Execution-status table at HEAD matches reality; Open Questions empty/deferred.
- [ ] Route un-legacied + `RESTYLED_PATHS` updated; e2e green; testids preserved.
