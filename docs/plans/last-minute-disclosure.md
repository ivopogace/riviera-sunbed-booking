# Last-Minute Non-Refundable Disclosure Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface that states cancellation terms tells the truth for the booking in
front of it: the checkout shows *this* booking's server-computed terms before payment, the
confirmation and payment-due mails carry a structured born-past-free-cancellation
disclosure, and the booking view presents a same-day booking as a non-refundable
last-minute booking instead of rendering nothing.

**Architecture:** No policy change and no schema change — the three-window model
(FREE/LATE/CLOSED) already classifies every booking; this slice is pure *disclosure*. The
one significant decision: a new **pre-reserve terms read** owned by `booking`
(`GET /api/bookings/cancellation-terms?setId&date`), computed by the existing
`CancellationPolicy` (the single home of the refund rule), so the dialog can disclose
before the tourist commits — and `CancellationWindow` graduates from `booking/domain` to
`booking/vocabulary` so the events, mail payloads, and view DTO can all speak the same
published type (maintainer-confirmed forks: pre-reserve read over create-response-only;
structured window over a bare boolean; ToS copy in scope).

**Persistence:** JDBC only (invariant #1). **No migration** — `booking.created_at` is
already selected into `BookingRecord.createdAt`, and "born past the free-cancellation
deadline" is derived (`createdAt >= freeCancellationEndsAt(cutoff, bookingDate)`). V45
stays unclaimed.

**Source of intent:** issue #795 · epic #790 · design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md` §13.

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced the
LATE-born-with-bps>0 inaccuracy, the no-migration derivation, the admin-resend path, and
the two epic close-out notes for this slice) · `riviera-plan-doc` (this template — forced
the behavior-parity ledger on the booking-view nothing-branch and the pre-reserve fork to
the maintainer) · `tdd` (each phase red-green at the smallest seam) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(**ran** over the slice range + the epic #790 span (`6b6b677~1..HEAD`): 3 findings, all
slice-attributable, fixed pre-merge in the close-out commit) · `riviera-modulith` (the vocabulary move for `CancellationWindow`,
event-payload widening without an `event_type` rewrite, grants already sufficient —
`notification` holds `booking::vocabulary`) · `riviera-java-conventions` (records, typed
outcomes, `ApiProblem` error contract §6b, one-line comments) · `codebase-design` (terms
as a second method on the existing `CancellationPolicy` seam, not a new module/port) ·
`domain-modeling` (the Domain-model section: the *Cancellation window* duration-vs-phases
glossary conflict + reconciliation, left-closed boundary semantics, the S-1..S-7 scenario
register — S-5's birth-keyed-mail gap surfaced and resolved — inline glossary capture at
phase 0, and the no-ADR call against the three-part bar) · `riviera-frontend` (all new
FE files land in `booking/`; the Tirane time formatter joins `shared/booking-date.ts`) ·
`angular-developer` + angular-cli MCP (`get_best_practices` v22: signals, `@Service`,
native control flow; `search_documentation` corrected the fetch primitive to
`httpResource` — it runs through the HTTP stack incl. interceptors, where a bare
`resource()` + `fetch` would bypass `api-session.interceptor` — and confirmed the
attribute-selector-on-native-element and aria-live patterns) · `riviera-tailwind` +
Tailwind v4 docs (mode-note utility reuse, no `@apply`, inert marker classes kept for
specs; docs confirmed host-string class detection with the complete-static-token
constraint) · `playwright-cli` (mocked-suite journey + axe policy helper) · `postgres`
N/A — no migration, no SQL change.

**Branch:** `claude/sdlc-795-implement-5qurkp` — the implement session's designated remote
branch stands in for `feature/last-minute-disclosure` (riviera-sdlc cloud addendum);
restarted from the planning branch `claude/sdlc-795-planning-4avz5x`'s head so this plan
doc rides along.

---

## Acceptance criteria (testable)

- [x] **AC-1 (terms read — FREE):** Given a venue with cutoff 18:00 and a booking date D,
  when the terms are quoted at D-2 (before D-1 18:00 Tirane), then the quote is
  `window=FREE` with `freeCancellationEndsAt` = D-1 18:00 Tirane as an `Instant`.
  *Pinned by:* `CancellationPolicyTermsTest.freeWindowQuotesDeadline`
- [x] **AC-2 (terms read — LATE):** Given the same venue with `lateCancelRefundBps=2500`,
  when the terms are quoted between D-1 18:00 and D 00:00 Tirane, then the quote is
  `window=LATE, lateCancelRefundBps=2500`. *Pinned by:*
  `CancellationPolicyTermsTest.lateWindowCarriesVenueShare`
- [x] **AC-3 (terms read — CLOSED/same-day):** Given date D = today (Tirane), when the
  terms are quoted, then the quote is `window=CLOSED` (born non-refundable). *Pinned by:*
  `CancellationPolicyTermsTest.sameDayQuotesClosed`
- [x] **AC-4 (terms endpoint):** Given a known set, when
  `GET /api/bookings/cancellation-terms?setId=…&date=…` is called, then `200` with
  `{window, freeCancellationEndsAt, lateCancelRefundBps}`; an unknown set yields the
  `ApiProblem` 404 contract, and `GET /api/bookings/{code}` still resolves a code (route
  literal-vs-template pin). *Pinned by:* `CancellationTermsEndpointIT`
- [x] **AC-5 (confirmation mail):** Given a booking born in CLOSED (created on its service
  day) that confirms, when `BookingConfirmed` is handled, then the recorded
  `BookingConfirmationMail` carries `cancellationWindowAtBirth=CLOSED`; a booking born in
  FREE records `FREE` and each transport renders no disclosure line for it. *Pinned by:*
  `BookingConfirmationMailIT.sameDayBookingCarriesNonRefundableDisclosure` (+ sibling
  absent-case)
- [x] **AC-6 (payment-due mail):** Given a same-day request accepted before the venue's
  sales close, when `BookingPaymentDue` is handled, then the recorded `PaymentDueMail`
  carries `cancellationWindowAtBirth=CLOSED`. *Pinned by:*
  `RequestPaymentDueMailIT.sameDayAcceptCarriesNonRefundableDisclosure`
- [x] **AC-7 (registry compatibility):** Given a `BookingConfirmed` publication serialized
  *before* this slice (no window fields), when the listener deserializes and handles it,
  then the mail sends with no disclosure line (null window tolerated forever). *Pinned
  by:* `BookingConfirmationMailListenerTest.legacyPayloadWithoutWindowRendersNoDisclosure`
- [x] **AC-8 (booking view):** Given a CONFIRMED same-day booking, when
  `ViewBookingService` builds the view, then `cancellable=false` (already true) AND
  `cancellationWindowAtBirth=CLOSED`; an advance FREE-born booking reports `FREE` and
  keeps `beforeCutoff`/`refundIfCancelledNow` unchanged. *Pinned by:*
  `ViewBookingServiceTest.sameDayBookingReportsClosedBirthWindow`
- [x] **AC-9 (weather-refund regression):** Given a CONFIRMED booking created on its own
  service day, when the admin weather refund runs for that venue+date, then the booking is
  refunded in full and cancelled. *Pinned by:*
  `WeatherRefundServiceIT.reachesASameDayBooking` (pre-existing #791 pin — covers this AC; no new test needed)
- [x] **AC-10 (checkout renders truth):** Given the dialog opens with terms
  FREE/LATE(bps>0)/LATE(0)/CLOSED, then the mode note states respectively: free until the
  formatted Tirane deadline / partial-refund share / non-refundable / "non-refundable
  last-minute booking" — and while terms are loading or failed, **no** free-cancellation
  claim renders. *Pinned by:* `booking-dialog.spec.ts` (new cases) +
  `cancellation-terms-note.spec.ts`
- [x] **AC-11 (e2e + a11y):** The mocked today-journey shows the non-refundable disclosure
  in the dialog and on the pay page before payment, with axe green at each step; the
  booking view for a mocked CLOSED-born detail shows the last-minute state and no cancel
  section. *Pinned by:* `same-day-booking.e2e.ts` (extended), `find-a-booking.e2e.ts`
  (new case)

## Non-goals

- **No cancellation-policy change** — windows, refund math (`RefundPolicy`), the guest
  cancel guard, and the weather carve-out are untouched (epic decision: disclosure, not
  policy).
- No new refund tier, no per-venue disclosure toggles.
- No change to `shared/cutoff-note.ts` — that is the *sales-close* rule; this slice's
  disclosure is the *cancellation* rule and gets its own component.
- No booking-code or payment-flow changes; the confirm path stays unfenced (#792 posture).
- No real-backend e2e additions (mocked CI suite only, per epic testing decisions).
- No pre-rendered mail copy — payloads stay structured; each transport renders its line.
- No backfill/migration; no reworking of the `refundTerms` FREE/partial/zero branches for
  advance bookings.

## Behavior-parity ledger (retirement / replacement slices only)

The dialog's static instant-mode sentence and the booking view's `cancellable=false`
branch are replaced surfaces:

| Old-surface behavior | Verdict | How the new surface does it, or why it's gone |
|---|---|---|
| Instant note: "Next you'll pay securely to confirm this set right away." | preserved | sentence kept verbatim in the instant mode note |
| Instant note: "Free cancellation until the evening before" (static, unconditional) | **changed** | replaced by the terms note rendering the server-computed window; renders nothing while loading/failed (never a false claim) |
| Instant note: "your booking code arrives on-screen and by email." | preserved | sentence kept in the instant mode note |
| Request note: full "Request to Book…" copy, no cancellation claim | preserved + extended | copy kept; the same terms note is added beneath it (request mode discloses too — AC-1 covers both modes) |
| Booking view, `cancellable && !cancellation()`: cancel section with `refundTerms` three-branch copy | preserved | branch untouched for advance bookings (AC-8) |
| Booking view, `cancellable=false`: renders **nothing** where the cancel section would be | **changed** | CLOSED-**born** bookings render the "non-refundable last-minute booking" note; FREE/LATE-born bookings whose window has since closed keep rendering nothing (parity) |
| Booking view `cancel-result` "its date has already begun" post-attempt copy | preserved | untouched |
| ToS cancellation section: unqualified "free cancellation until the evening before" | **changed** | one sentence added: bookings made past the free-cancellation deadline (incl. same-day) are not freely cancellable (maintainer-approved scope) |
| `same-day-booking.e2e.ts` `AWAITING_DETAIL` fixture: `cancellable: true, beforeCutoff: true` | **changed** | corrected to the truthful CLOSED-born shape (`cancellable: false`, `cancellationWindowAtBirth: 'CLOSED'`) — the epic close-out note (#791, restated at #794) lands here |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Widened event payloads break outstanding Event Publication Registry entries serialized pre-slice (missing fields → null enum / 0 int) | med | med | additive fields only, same `event_type` (no move/rename → no Flyway rewrite per `riviera-modulith`); listeners treat null window as "no disclosure", pinned by AC-7 as a permanent guard, not a deploy-window hack | agent | resolved — additive fields, AC-7 pinned in `BookingConfirmationMailListenerTest` |
| R-2 | `GET /api/bookings/cancellation-terms` shadowed by `GET /api/bookings/{code}` (or vice versa) | low | med | Spring ranks the literal segment above the template; both directions pinned in `CancellationTermsEndpointIT` (AC-4) | agent | resolved — pinned both ways |
| R-3 | Terms quote drifts from the actual cancel/refund decision | low | high | both live in `CancellationPolicy` calling the same `BookingCutoff` boundaries; no second implementation of the window rule anywhere (invariant #10) | agent | resolved — `terms`/`windowAtBirth` live beside `quote` on `CancellationPolicy`; phase-1 audit found no second site |
| R-4 | FE renders the deadline in the browser's timezone, not `Europe/Tirane` (invariant #6) | med | med | wire carries the `Instant`; a `shared/booking-date.ts` formatter pins `timeZone: 'Europe/Tirane'`; asserted in `cancellation-terms-note.spec.ts` with a non-Tirane-ambiguous instant | agent | resolved — reused `shared/deadline.ts#formatDeadline` (already Tirane-pinned); spec asserts 16:00Z renders 18:00 |
| R-5 | "Non-refundable" line false for a LATE-born booking at a venue with bps > 0 | low | high | structured window + bps on payloads/DTOs (maintainer decision); transports and FE branch on it; per-branch mail ITs + FE specs | agent | resolved — LATE-at-bps>0 renders the share line everywhere (SmtpMailerIT, note spec, dialog spec) |
| R-6 | Async-loaded disclosure invisible to screen readers (RV-FE-10 precedent #741/#794) | med | med | the terms note container is a polite live region (`role="status"`); axe runs at the dialog step in e2e; the booking-view note renders with page data (no live region needed) | agent | resolved — `role="status"` container in the dialog, axe green at both disclosure steps |
| R-7 | New/changed DTOs drift from the error contract | low | med | unknown set → `ApiProblem` 404; invalid params → the standing `ApiErrorHandler` mapping; no per-controller `@ExceptionHandler` (§6b) | agent | resolved — pinned in `CancellationTermsEndpointIT` (404 `ApiProblem`, 400 contract) |
| R-8 | Mail listener contract break — listener class/method/param names are registry `listener_id` contract | low | high | only payload record fields and `SmtpMailer` rendering change; listener signatures untouched | agent | resolved — signatures untouched; registry ITs green |

## Open questions / Assumptions

### Resolved

- **Disclosure wording (web + mail + ToS)** → review gate ran 2026-08-29 with zero copy
  findings; the shipped prose stands.

- **Registry-payload tolerance** → the null-window tolerance (AC-7) is pinned permanently in
  `BookingConfirmationMailListenerTest.legacyPayloadWithoutWindowRendersNoDisclosure` (phase 2).
- **Pre-reserve terms read vs create-response-only** → pre-reserve read (booking-owned
  endpoint), maintainer-confirmed 2026-08-29 (AskUserQuestion, this session).
- **Mail flag shape: boolean vs structured window** → structured
  (`cancellationWindowAtBirth` + `lateCancelRefundBps`), maintainer-confirmed 2026-08-29 —
  a blanket "non-refundable" would be false for LATE-born at bps > 0.
- **ToS copy** → in scope, one-sentence addition, maintainer-confirmed 2026-08-29.

## Availability & concurrency (invariant #2)

This slice is **read-only toward availability**: it adds no write path, changes no claim
or release, and touches no `availability(set_id, booking_date)` row.

- **Write paths in scope:** none. The weather-refund regression (AC-9) exercises the
  existing cancel/release path unchanged.
- **Uniqueness guarantee / concurrency strategy / pool rule:** unchanged; not in scope.
- **Cutoff rule (invariant #4):** consumed, not changed — `BookingCutoff` gains a
  caller-supplied-instant *overload* of `cancellationWindow` (mirroring the existing
  `isBookable(…, Instant now)` precedent) so window-at-birth is classified from
  `createdAt`; the boundaries themselves are untouched.
- **Pinning test:** N/A — no concurrent write in scope; `WeatherRefundServiceIT` (AC-9)
  pins the one existing write path this slice re-verifies.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | owns cancellation-policy enforcement and all day boundaries (`BookingCutoff`); the terms quote is the same rule read pre-reserve |
| M-2 | `notification` | existing | (none) | renders the disclosure line in each transport — rendering, never deciding (RESPONSIBILITIES §notification posture) |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#setBookingInfo(SetId)` — **existing, unchanged** (already carries `venueId`, `bookingCutoff`, `salesClose`) | `SetBookingInfo` | `booking` |
| NI-2 | `venue.api` | `VenueRates#lateCancelRefundBps(VenueId)` — **existing, unchanged** | `OptionalInt` | `booking` |
| NI-3 | `booking.api` | `BookingNotificationFacts#confirmationFacts(BookingId)` — **return type widened** (admin-resend path) | `BookingConfirmationFacts` + `cancellationWindowAtBirth`, `lateCancelRefundBps` | `notification` |

New published type: **`booking.vocabulary.CancellationWindow`** — moved from
`booking/domain` (kind rule #95: a published enum belongs in `vocabulary/`). Five internal
usage sites update imports (`BookingCutoff`, `CancellationPolicy`, `CancelBookingService`,
`RefundPolicy`, the enum itself); `notification` consumes it under its **existing**
`booking::vocabulary` grant — no `allowedDependencies` change anywhere.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload change | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingConfirmed` | `booking` (every publication site — enumerated in phase 2) | + `cancellationWindowAtBirth` (`CancellationWindow`), + `lateCancelRefundBps` (`int`) — facts **fixed at the moment**, same posture as `amountMinor`; same `event_type`, no registry rewrite | `payout`, `notification` | async `AFTER_COMMIT` | `BookingConfirmationMailIT`, AC-7 |
| EV-2 | `BookingPaymentDue` | `booking` (request accept) | same two fields, classified from the booking's `createdAt` | `notification` | async `AFTER_COMMIT` | `RequestPaymentDueMailIT` |

`payout` listens to `BookingConfirmed` but reads none of the new fields — additive change,
its listener compiles and behaves identically (verified in phase 2).

### Domain model (ubiquitous language, scenarios, ADR check)

**Language.** Terms this slice adds or sharpens, kept consistent with `CONTEXT.md`
(existing entries: *Sales close*, *Cutoff*, *Refund tier*, *Cancellation window*).
Glossary updates land **inline with the phase that puts the term into code (phase 0)**,
not batched at close-out — the `domain-modeling` capture-as-it-crystallises rule.

| Term | Meaning | Carrier in code |
|---|---|---|
| **Last-minute booking** | a booking born past its free-cancellation deadline — birth phase LATE or CLOSED | derived predicate (`cancellationWindowAtBirth != FREE`); the copy "non-refundable last-minute booking" is reserved for CLOSED-born |
| **Window at birth** | the cancellation-window phase in force at the booking's creation instant | `cancellationWindowAtBirth` on both events, both mail payloads, `BookingConfirmationFacts`, `BookingDetailView` |
| **Cancellation terms** | the pre-reserve quote: phase now, free-cancellation deadline, venue's late share | `CancellationPolicy.CancellationTerms` / `CancellationTermsView` |
| **Free-cancellation deadline** | the existing *Cutoff* term (D−1 at the venue's cutoff, `Europe/Tirane`) | `BookingCutoff.freeCancellationEndsAt` — reused, never renamed |

**Glossary reconciliation (a real conflict, not a nicety):** `CONTEXT.md`'s
*Cancellation window* entry describes a **duration** ("how long a confirmed booking may
be cancelled at all… once the service day opens the window is closed"), while the
`CancellationWindow` enum names the three **phases** (FREE/LATE/CLOSED) of that same
timeline — and this slice publishes the enum into `booking/vocabulary`, making it
ubiquitous language. Phase 0 sharpens the entry to name the phases explicitly (FREE →
*full* tier, LATE → *partial/none* tier, CLOSED → refused) so glossary, enum, and the
*Refund tier* entry state one model, and adds the *Last-minute booking* and *Window at
birth* entries.

**Boundary semantics (explicit, the #792 F-2 practice).** The classification is
left-closed on both boundaries, inherited from `cancellationWindow`'s `isBefore` tests:
an instant **exactly at** the free-cancellation deadline is already **LATE**; an instant
**exactly at** 00:00 Tirane on D is already **CLOSED**. Stated here so the at-birth
overload, the terms quote, and every test agree; pinned by the phase-0 boundary cases in
`BookingCutoffTest`.

**Scenario register** (stress tests of the model — each resolves to a pinned behavior):

| # | Scenario | Model answer | Pinned by |
|---|---|---|---|
| S-1 | Instant booking created 09:00 on its own service day | CLOSED-born; disclosed at checkout, in the confirmation mail, on the view | AC-3/5/8/10/11 |
| S-2 | Booking created D−1 21:00 (cutoff 18:00) | LATE-born; share line at bps>0, non-refundable line at 0 bps | AC-2, AC-10, mail ITs |
| S-3 | Created **exactly at** D−1 18:00 / exactly at 00:00 on D | LATE / CLOSED (boundary semantics above) | `BookingCutoffTest` boundary cases (phase 0) |
| S-4 | Venue at sales close `00:01`: booking born in the [00:00, 00:01) sliver | legal and CLOSED-born; the disclosure covers it with no special case | S-1's pins (same path) |
| S-5 | Request born FREE (D−2), venue accepts D−1 20:00 — window is LATE by accept time | birth-keyed mails carry **no** disclosure (the issue/epic decision: "born past"); the surface the tourist actually pays from — the code-gated view — shows the **live** window truth via the existing `refundTerms` branches, so pay-time disclosure still exists. A deliberate resolution, recorded here rather than silently assumed | AC-8 (advance parity) + existing view ITs |
| S-6 | Venue edits its cutoff after a booking's birth | the event-stamped window is immutable (a sent mail's truth can't be rewritten); the admin resend re-derives from the current cutoff — bounded, documented drift | AC-5/AC-7; resend IT |
| S-7 | Weather refund on a CLOSED-born booking | reaches it — the weather refund is *outside the window* by the glossary's own definition | AC-9 |

**ADR check:** none offered. The one candidate (birth-keyed mail disclosure, S-5) fails
the bar — it is cheap to reverse (additive fields; a later slice could stamp
accept-time), and the trade-off is recorded here and in the issue. The vocabulary move
and the terms endpoint are ordinary evolution under existing decisions (ADR-0005/0007).

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Compute the pre-reserve cancellation terms (window, deadline, share) | `booking` | `booking` Job: owns cancellation/refund **policy** and all day boundaries; **not** `venue` (it stores the cutoff/bps config, decides nothing — the commission-vs-payout split's twin) |
| Classify window-at-birth and stamp it on the events | `booking` | publisher of both events; the facts are fixed at the moment, per the events' own documented posture |
| Serve the terms endpoint | `booking` (`adapter/in`) | driving adapter of the module that computes the answer; public tourist read, no venue-scoped operator auth (invariant #13 targets operator surfaces; this is the venue-map-read precedent) |
| Carry the disclosure fields to mail transports | `notification` | renders the server-computed facts, never decides them — the exact RESPONSIBILITIES §notification refund-mail posture |
| Report window-at-birth on the code-gated view | `booking` (`view` slice) | same service that already reports `cancellable`/`beforeCutoff` |
| Render web copy keyed on the window | frontend client | copy is the client's, keyed on structured codes (error-contract §6b posture applied to a non-error read) |

## Payment & payout (invariants #5, #8, #9, #10)

**No money moves in this slice.** Collect-only model unchanged; no Stripe surface, no
ledger effect, no refund-math change. Two touch points, both read-only toward money:

- **Refund policy applied:** unchanged — the slice *discloses* the invariant-#10 decision
  (`RefundPolicy` untouched); the terms quote reuses `CancellationPolicy`.
- **Pinning tests:** `WeatherRefundServiceIT.fullRefundReachesSameDayBooking` (AC-9)
  re-pins the admin carve-out for same-day bookings; existing refund/payout ITs stay
  green untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-dialog.ts` | modify | standalone component | terms via `httpResource` keyed on `(setId, date)`; render only when `hasValue()` | existing dialog form untouched |
| FE-2 | `booking/cancellation-terms-note.ts` (+ `.spec.ts`, `.a11y.spec.ts`) | new | standalone component (`p[appCancellationTermsNote]`, attribute selector on native `<p>` — the `cutoff-note` precedent) | `input.required<CancellationTerms>()`, `computed()` branch on window | n/a |
| FE-3 | `booking/booking-pay.ts` | modify | standalone component | terms ride `PaymentHandoff` (no refetch on the pay page) | n/a |
| FE-4 | `booking/booking-view.ts` | modify | standalone component | new `@else`-side branch on `cancellationWindowAtBirth === 'CLOSED'` | n/a |
| FE-5 | `booking/booking.service.ts` + `booking/booking.model.ts` | modify | `@Service()` | `cancellationTerms(params)` `httpResource` factory (URL + typing stay in the service; the dialog creates it in its own injection context) | n/a |
| FE-6 | `shared/booking-date.ts` | modify | pure util | Tirane-zoned date-time formatter for the deadline | n/a |
| FE-7 | `pages/legal/terms-of-service.html` | modify | static copy | one-sentence last-minute exception | n/a |

**Standards:** standalone components, `inject()`, native `@if`/`@switch` branching on the
window, `input()` signal API, no `ngClass`/`ngStyle`, OnPush-by-default (v22 — not set
explicitly). The dialog's fetch uses **`httpResource`** (angular.dev: it "makes HTTP
requests through the Angular HTTP stack, including interceptors" — a bare `resource()` +
`fetch` would bypass `api-session.interceptor`); render the note only when `hasValue()`,
so `loading`/`error` states show *no claim* rather than an error. The async-inserted note
container carries `role="status"` (polite live region; R-6 — the angular.dev a11y/defer
guidance for late-arriving content). Styling is Tailwind utilities per `riviera-tailwind`
— the note reuses the mode-note utility vocabulary, carries no `border-radius` of its own
beyond the call-site's, keeps `data-testid` markers for specs, and is non-interactive (no
touch-target obligation). Tailwind v4 detects classes in `host`/template strings by
plain-text scanning: any per-window styling variant maps to **complete static class
strings**, never interpolated fragments.

## FE↔BE contract

- **New endpoint:** `GET /api/bookings/cancellation-terms?setId=<long>&date=<ISO LocalDate>`
  → `200 CancellationTermsView { window: 'FREE'|'LATE'|'CLOSED', freeCancellationEndsAt:
  ISO instant, lateCancelRefundBps: number }`; unknown set → `ApiProblem` 404; malformed
  params → the standing 400 contract.
- **Changed DTO:** `BookingDetailView` (+ FE `BookingDetail`) gains
  `cancellationWindowAtBirth: 'FREE'|'LATE'|'CLOSED'`. Additive; no field removed or
  renamed.
- **Client typing:** hand-written types in `booking/booking.model.ts` (repo convention);
  no `as any`.
- **Money/date on the wire:** unchanged — amounts stay integer minor units; `date` is the
  ISO booking `LocalDate`; the deadline is a UTC instant formatted client-side in
  `Europe/Tirane` (invariant #6).

## Execution status

> **This section is the session-recovery anchor.** Update it in the SAME commit window as
> the change it records, at every phase boundary and SDLC stage transition.

**Stage pointer:** DONE — merged via PR #803. Both gates green 2026-08-29: review gate ran
clean (`/code-review` 5-agent fan-out at high effort + the full `riviera-review-overlay` bank
walk; record: PR #803 comment); Sonar gate API-verified on the final head (issue list EMPTY,
98.8% new-code coverage, 0 duplication). `riviera-docs-freshness` ran over the slice range AND
the epic #790 span: 3 findings, all slice-#795-attributable, all fixed in this commit
(RateLimitFilter endpoint count 4→5, the `events.md` BookingConfirmed example payload, the
liquid-glass design-doc as-built pointer). Epic #790 slice 5 of 5.

**Next action:** none — post-merge GitHub edits only (epic close-out comment; #795 closes via
the PR).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Publish the window (vocabulary move + at-birth overload) | ✅ | `Publish CancellationWindow …` |
| 1 — Terms quote + endpoint | ✅ | `Quote pre-reserve cancellation terms …` |
| 2 — Events + mails + resend | ✅ | `Carry the born-past-free-cancellation window …` |
| 3 — Booking-view window-at-birth (BE + model) | ✅ | `Report the cancellation window at birth …` |
| 4 — FE checkout, booking view, ToS | ✅ | `Disclose the booking's actual cancellation terms …` |
| 5 — Mocked e2e + docs + close-out | ✅ | `Pin the last-minute disclosure end-to-end …` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (run 2906) | `BookingController` injected the concrete `CancellationPolicy`, unsatisfiable in the shared `@WebMvcTest` context — 177 failures across 18 web-slice classes | fixed: `QuoteCancellationTerms` driving port + `WebSliceStubs` inert stub (the `CreateBooking` pattern) |
| F-2 | CI (run 2906) | `EndpointRoleGateCoverageTest` flagged the terms endpoint as reachable-but-undeclared | fixed: `DECLARED_REACHABLE` entry — public tourist read, permitAll via the one-segment GET matcher |
| F-3 | CI (run 2906) | plan-doc file-structure guard: prose globs don't satisfy #533 — touched paths must be listed explicitly | fixed: File structure section rewritten to explicit paths |
| F-4 | sonar (PR analysis) | java:S9358 — conditional expression outside the `Target` construction, `RateLimitFilter.java:370` | fixed-in-`1aa9afa5`, confirmed by re-analysis (0 issues) |
| F-5 | sonar (PR analysis) | java:S1192 — `"created_at"` literal duplicating `COL_CREATED_AT`, `JdbcBookings.java:284` (×2 sites) | fixed-in-`1aa9afa5`, confirmed by re-analysis (0 issues) |
| F-6 | review (fan-out agent #4) | RV-FE-10 candidate: dialog `terms-region` mounts inside the step-2 branch, plausibly born with its message | rejected at the confidence gate (25/100): region pre-exists content in the async leg (mutation-tested); resolve-early leg renders static step content — no lost announcement. No change needed |

---

## File structure

- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/CancellationWindow.java` — moved from `domain/` (published enum)
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/package-info.java` — mention the enum in the surface Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/domain/CancellationWindow.java` — deleted (the move)
- `platform/src/main/java/ai/riviera/platform/booking/domain/RefundPolicy.java` — import update
- `platform/src/main/java/ai/riviera/platform/booking/application/BookingCutoff.java` — `cancellationWindow(cutoff, date, Instant at)` overload
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancellationPolicy.java` — `terms(SetId, LocalDate)` + `windowAtBirth(SetId, LocalDate, Instant)`; implements the port; import update
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancellationTerms.java` — new quote record (top-level, the `ConfirmedBooking` style)
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/QuoteCancellationTerms.java` — new driving port (the controller depends on the seam, not the class — web-slice contexts stub it)
- `platform/src/main/java/ai/riviera/platform/booking/application/cancel/CancelBookingService.java` — import update
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingController.java` — terms endpoint
- `platform/src/main/java/ai/riviera/platform/RateLimitFilter.java` — the literal terms path spends per-IP only, never the shared per-code bucket; endpoint-count comments trued to five (freshness)
- `.claude/skills/riviera-modulith/references/events.md` — BookingConfirmed example payload trued to the widened record (freshness)
- `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` — as-built divergence pointer for the Instant Book blurb (freshness)
- `platform/src/test/java/ai/riviera/platform/RateLimitFilterTest.java` — pins that
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/CancellationTermsView.java` — new response DTO
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — + `cancellationWindowAtBirth`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — classify window-at-birth
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — + `cancellationWindowAtBirth`
- `platform/src/main/java/ai/riviera/platform/booking/events/BookingConfirmed.java` — + two fields
- `platform/src/main/java/ai/riviera/platform/booking/events/BookingPaymentDue.java` — + two fields
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/BookingConfirmationFacts.java` — + two fields (resend path)
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ConfirmBookingService.java` — stamps the birth window on `BookingConfirmed`
- `platform/src/main/java/ai/riviera/platform/booking/application/reserve/ConfirmedBooking.java` — + `createdAt` (off the confirm `RETURNING`)
- `platform/src/main/java/ai/riviera/platform/booking/application/request/RespondToRequestService.java` — stamps the birth window on `BookingPaymentDue`
- `platform/src/main/java/ai/riviera/platform/booking/application/request/AcceptedRequest.java` — + `createdAt` (off the accept `RETURNING`)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — `created_at` joins both `RETURNING` clauses
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingNotificationFacts.java` — resend path derives the birth window via `CancellationPolicy`
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingConfirmationMail.java` — + two fields
- `platform/src/main/java/ai/riviera/platform/notification/application/PaymentDueMail.java` — + two fields
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListener.java` — carry fields off the event
- `platform/src/main/java/ai/riviera/platform/notification/adapter/in/RequestPaymentDueMailListener.java` — carry fields off the event
- `platform/src/main/java/ai/riviera/platform/notification/application/BookingConfirmationResendService.java` — carry fields off the facts
- `platform/src/main/java/ai/riviera/platform/notification/adapter/out/SmtpMailer.java` — render the disclosure line (both mails)
- `platform/src/test/java/ai/riviera/platform/booking/application/cancel/CancellationPolicyTermsTest.java` — new (AC-1..3)
- `platform/src/test/java/ai/riviera/platform/booking/CancellationTermsEndpointIT.java` — new (AC-4)
- `platform/src/test/java/ai/riviera/platform/booking/application/BookingCutoffTest.java` — at-birth overload + boundary cases
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — import update (phase 0), AC-8 (phase 3)
- `platform/src/test/java/ai/riviera/platform/booking/domain/RefundPolicyTest.java` — import update
- `platform/src/test/java/ai/riviera/platform/booking/application/request/RespondToRequestServiceTest.java` — accept-path stamping pin
- `platform/src/test/java/ai/riviera/platform/booking/application/request/PaymentDueAnnouncerIT.java` — widened event construction
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — inert `QuoteCancellationTerms` stub for the web slices
- `platform/src/test/java/ai/riviera/platform/EndpointRoleGateCoverageTest.java` — the terms endpoint's declared-reachable entry
- `platform/src/test/java/ai/riviera/platform/EventRegistryDurabilityIT.java` — widened event construction
- `platform/src/test/java/ai/riviera/platform/payout/PayoutAccrualIT.java`, `platform/src/test/java/ai/riviera/platform/payout/PayoutModuleTest.java`, `platform/src/test/java/ai/riviera/platform/payout/PayoutSpineScenarioIT.java` — widened event constructions (`payout` reads none of the new fields)
- `platform/src/test/java/ai/riviera/platform/booking/**` — `WeatherRefundServiceIT` (AC-9, phase 3), `BookingCreationViewsContractTest` (only if touched)
- `platform/src/test/java/ai/riviera/platform/notification/BookingConfirmationMailIT.java` — AC-5 + real-checkout stamping pin
- `platform/src/test/java/ai/riviera/platform/notification/RequestPaymentDueMailIT.java` — AC-6
- `platform/src/test/java/ai/riviera/platform/notification/adapter/in/BookingConfirmationMailListenerTest.java` — AC-7 + pass-through pin
- `platform/src/test/java/ai/riviera/platform/notification/BookingMailFixtures.java` — stamped-event overloads
- `platform/src/test/java/ai/riviera/platform/notification/AdminMailDeliveryIT.java` — resend re-derivation pin (S-6)
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/SmtpMailerIT.java` — disclosure-line rendering pins
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/MockMailerTest.java` — widened record constructions
- `platform/src/test/java/ai/riviera/platform/notification/adapter/out/EmailSuppressionReinstatementIT.java` — widened record construction
- `platform/src/test/java/ai/riviera/platform/notification/application/TransactionalMailServiceTest.java` — widened record constructions
- `platform/src/test/java/ai/riviera/platform/notification/application/BookingConfirmationResendServiceTest.java` — resend pass-through pin
- `frontend/src/app/booking/cancellation-terms-note.ts` + `frontend/src/app/booking/cancellation-terms-note.spec.ts` + `frontend/src/app/booking/cancellation-terms-note.a11y.spec.ts` — new
- `frontend/eslint.config.js` — the note joins the attribute-selector override list
- `frontend/src/app/venue/venue-map.spec.ts` — `settle()` helpers flush the dialog's pending terms quote (an unanswered `httpResource` parks `whenStable`)
- `frontend/src/app/booking/booking-dialog.a11y.spec.ts` — same flush in its setup
- `frontend/src/app/booking/booking-dialog.ts` + `booking-dialog.spec.ts` — terms resource + note
- `frontend/src/app/booking/booking-pay.ts` + `booking-pay.spec.ts` — note on the pay step
- `frontend/src/app/booking/booking-view.ts` + `booking-view.spec.ts` — CLOSED-born branch
- `frontend/src/app/booking/booking.service.ts` + `booking.service.spec.ts` — terms read
- `frontend/src/app/booking/booking.model.ts` — `CancellationTerms`, widened `BookingDetail`/`PaymentHandoff`
- `frontend/src/app/booking/find-booking.spec.ts`, `frontend/src/app/booking/my-bookings.spec.ts` — fixture literals gain the new field
- `frontend/src/app/shared/booking-date.ts` — NOT touched after all: `shared/deadline.ts#formatDeadline` already pins the Tirane rendering (R-4), so the note reuses it instead of adding a near-duplicate formatter
- `frontend/src/app/pages/legal/terms-of-service.html` — one-sentence exception
- `frontend/e2e/same-day-booking.e2e.ts` — disclosure steps + corrected `AWAITING_DETAIL` fixture
- `frontend/e2e/find-a-booking.e2e.ts` — CLOSED-born booking-view case
- `docs/plans/last-minute-disclosure.md` — this plan
- `RESPONSIBILITIES.md` — §booking (terms read, window-at-birth stamping), §notification (widened payload fields)
- `CONTEXT.md` — *Cancellation window* sharpened to the three phases; *Last-minute booking* + *Window at birth* entries (phase 0, inline)

---

## Phase 0 — Publish the window (vocabulary move + at-birth overload)

**Files:** Move `booking/domain/CancellationWindow.java` → `booking/vocabulary/` · Modify
`BookingCutoff.java`, `RefundPolicy.java`, `CancellationPolicy.java`,
`CancelBookingService.java` (imports) · Test `BookingCutoffTest`, structural suite

- [x] **Step 1: Write the failing test** — at-birth classification in `BookingCutoffTest`:

```java
@Test
void classifiesWindowAtACallerSuppliedInstant() {
    // cutoff 18:00, date 2026-08-30; born 2026-08-30 09:00 Tirane → CLOSED at birth
    Instant bornSameDay = ZonedDateTime.of(2026, 8, 30, 9, 0, 0, 0, TIRANE).toInstant();
    assertEquals(CancellationWindow.CLOSED,
        cutoff.cancellationWindow(LocalTime.of(18, 0), LocalDate.of(2026, 8, 30), bornSameDay));
    Instant bornLateEvening = ZonedDateTime.of(2026, 8, 29, 21, 0, 0, 0, TIRANE).toInstant();
    assertEquals(CancellationWindow.LATE,
        cutoff.cancellationWindow(LocalTime.of(18, 0), LocalDate.of(2026, 8, 30), bornLateEvening));
}

@Test
void boundaryInstantsAreLeftClosed() {
    // Domain-model S-3: exactly AT the deadline is already LATE; exactly AT 00:00 on D is CLOSED.
    Instant atDeadline = ZonedDateTime.of(2026, 8, 29, 18, 0, 0, 0, TIRANE).toInstant();
    assertEquals(CancellationWindow.LATE,
        cutoff.cancellationWindow(LocalTime.of(18, 0), LocalDate.of(2026, 8, 30), atDeadline));
    Instant atDayOpen = ZonedDateTime.of(2026, 8, 30, 0, 0, 0, 0, TIRANE).toInstant();
    assertEquals(CancellationWindow.CLOSED,
        cutoff.cancellationWindow(LocalTime.of(18, 0), LocalDate.of(2026, 8, 30), atDayOpen));
}
```

- [x] **Step 2: Run it, verify it fails** —
  `./gradlew test --tests "*BookingCutoffTest*"` → FAIL (no such overload)
- [x] **Step 3: Minimal implementation** — move the enum file (same body, new package);
  update the five imports; refactor the existing `cancellationWindow` to delegate:

```java
public CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate) {
    return cancellationWindow(cutoff, bookingDate, clock.instant());
}

/** The same classification against a caller-supplied reading (the isBookable precedent). */
public CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate,
        java.time.Instant at) {
    if (at.isBefore(freeCancellationEndsAt(cutoff, bookingDate))) {
        return CancellationWindow.FREE;
    }
    return at.isBefore(serviceDayOpensAt(bookingDate))
            ? CancellationWindow.LATE : CancellationWindow.CLOSED;
}
```

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*BookingCutoffTest*"
  --tests "*CancellationPolicy*" --tests "*CancelBooking*"` → PASS
- [x] **Step 4a: Structural net** — `./gradlew test --tests "*ModularityTests*" --tests
  "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*"` → PASS (the
  moved enum sits in a `@NamedInterface("vocabulary")` package;
  `PublishedSurfacePlacementArchitectureTests` accepts an enum there)
- [x] **Step 5: Generalization-audit pass** — population: every reference to the old FQCN
  (`grep -rn "booking.domain.CancellationWindow" platform/src`) → fix all; append to log.
- [x] **Step 5a: Glossary, inline** — update `CONTEXT.md` in this same commit (the
  Domain-model section's reconciliation): sharpen *Cancellation window* to name the three
  phases, add *Last-minute booking* and *Window at birth*. Terms captured when they enter
  the code, not batched at close-out.
- [x] **Step 6: Commit** — `git commit -m "Publish CancellationWindow and classify the window at a caller-supplied instant (#795)"`
- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Terms quote + endpoint

**Files:** Modify `CancellationPolicy.java` (`terms`), `BookingController.java` · Create
`CancellationTermsView.java` · Test `CancellationPolicyTermsTest` (new, fixed clock),
`CancellationTermsEndpointIT` (new)

- [x] **Step 1: Write the failing tests** (AC-1..3 unit; AC-4 IT):

```java
@Test
void sameDayQuotesClosed() {
    // fixed clock: 2026-08-30 09:00 Tirane; date = today
    CancellationPolicy.CancellationTerms terms =
        policy.terms(SET, LocalDate.of(2026, 8, 30)).orElseThrow();
    assertEquals(CancellationWindow.CLOSED, terms.window());
    assertEquals(0, terms.lateCancelRefundBps());
}
```

IT pins: `200` shape for a seeded set (all three windows via mocked clock), 404
`ApiProblem` for an unknown set, and `GET /api/bookings/{code}` unshadowed (R-2).

- [x] **Step 2: Run, verify FAIL** — `./gradlew test --tests "*CancellationPolicyTerms*"
  --tests "*CancellationTermsEndpoint*"`
- [x] **Step 3: Minimal implementation** —

```java
/** The pre-reserve terms for booking this set on this date, quoted now (invariant #10). */
public Optional<CancellationTerms> terms(SetId setId, LocalDate bookingDate) {
    return setFacts.setBookingInfo(setId).map(set -> {
        CancellationWindow window = cutoff.cancellationWindow(set.bookingCutoff(), bookingDate);
        int lateBps = window == CancellationWindow.LATE
                ? rates.lateCancelRefundBps(set.venueId()).orElse(0) : 0;
        return new CancellationTerms(window,
                cutoff.freeCancellationEndsAt(set.bookingCutoff(), bookingDate), lateBps);
    });
}

public record CancellationTerms(CancellationWindow window,
        java.time.Instant freeCancellationEndsAt, int lateCancelRefundBps) {}
```

Controller: `@GetMapping("/api/bookings/cancellation-terms")`, params `setId` + ISO
`date`, empty → `ApiProblem` 404 (unknown set is an expected flow here — the tourist may
hold a stale map — unlike `quote`'s booking-FK breach).

- [x] **Step 4: Run, verify PASS** — same scoped commands, then the booking package.
- [x] **Step 5: Generalization-audit** — population: other pre-existing quotes of
  cancellation terms (`grep -rn "cancellationWindow\|freeCancellationEndsAt" platform/src/main`)
  → confirm every consumer still routes through `BookingCutoff`/`CancellationPolicy`.
- [x] **Step 6: Commit** — `git commit -m "Quote pre-reserve cancellation terms (#795)"`
  — then **open the draft PR** (first phase commit exists; CI needs the `pull_request` event).
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — Events + mails + resend

**Files:** Modify both event records, their publication sites, `BookingConfirmationFacts`,
its adapter, both mail records, both listeners, `BookingConfirmationResendService`,
`SmtpMailer` · Test `BookingConfirmationMailIT`, `RequestPaymentDueMailIT`,
`BookingConfirmationMailListenerTest` (AC-7), `MockMailerTest`, resend IT

- [x] **Step 1: Mechanism sweep first** — enumerate every publication site:
  `grep -rn "new BookingConfirmed(\|new BookingPaymentDue(" platform/src/main` (confirm
  the negative with `git ls-files` if a site seems missing — `adapter/out` is
  gitignore-shadowed). Every site stamps `cancellationWindowAtBirth` (classified from the
  booking's `createdAt` via the phase-0 overload) + the captured `lateCancelRefundBps`.
- [x] **Step 2: Write the failing tests** — AC-5/AC-6 via the recording `MockMailer`
  (present + absent cases), AC-7 legacy-payload null-window tolerance:

```java
@Test
void sameDayBookingCarriesNonRefundableDisclosure() {
    // seed a booking created on its service day; drive BookingConfirmed
    SentEmail sent = mockMailer.lastConfirmation();
    assertEquals(CancellationWindow.CLOSED, sent.confirmation().cancellationWindowAtBirth());
}
```

- [x] **Step 3: Run, verify FAIL** — scoped to the four notification test classes.
- [x] **Step 4: Minimal implementation** — widen the two event records + two mail records
  + `BookingConfirmationFacts` (additive fields, Javadoc: fixed-at-the-moment posture);
  listeners pass them through; `SmtpMailer` renders per branch (CLOSED or LATE@0 →
  non-refundable line; LATE@bps>0 → share line; FREE/null → none); resend classifies via
  the widened facts. `payout`'s `BookingConfirmed` listener: verify untouched compile +
  green.
- [x] **Step 5: Run, verify PASS** — the notification package + `*BookingConfirmed*` +
  `*Payout*` listener tests + the structural net (event payloads still id/fact-based).
- [x] **Step 6: Generalization-audit** — population: every consumer of the two widened
  records (`grep -rln "BookingConfirmationMail\|PaymentDueMail\|BookingConfirmed\|BookingPaymentDue" platform/src`)
  → each either uses the new fields or provably ignores them.
- [x] **Step 7: Commit** — `git commit -m "Carry the born-past-free-cancellation window on confirmation and payment-due mails (#795)"`
- [x] **Step 8: Update plan-doc execution status.**

---

## Phase 3 — Booking-view window-at-birth

**Files:** Modify `ViewBookingService.java`, `BookingDetailView.java`,
`frontend/src/app/booking/booking.model.ts` · Test `ViewBookingServiceTest`

- [x] **Step 1: Failing test** — AC-8: same-day booking → `cancellationWindowAtBirth=CLOSED`
  + `cancellable=false`; advance booking → `FREE` with every existing field unchanged.
- [x] **Step 2: Run, verify FAIL** — `./gradlew test --tests "*ViewBookingService*"`
- [x] **Step 3: Minimal implementation** — classify from `record.createdAt()` via the
  phase-0 overload (the set's cutoff is already resolved for the quote); additive DTO
  field; mirror on `BookingDetail` in `booking.model.ts`.
- [x] **Step 4: Run, verify PASS** — view slice + `BookingDetailView` contract tests.
- [x] **Step 5: Generalization-audit** — population: every producer of `BookingDetailView`
  (`grep -rn "new BookingDetailView(" platform/src`) → all stamp the field.
- [x] **Step 6: Commit** — `git commit -m "Report the cancellation window at birth on the code-gated view (#795)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 4 — FE checkout, booking view, ToS

**Files:** Create `booking/cancellation-terms-note.ts` (+ `.spec.ts`, `.a11y.spec.ts`) ·
Modify `booking.service.ts`, `booking.model.ts`, `booking-dialog.ts`, `booking-pay.ts`,
`booking-view.ts`, `shared/booking-date.ts`, `pages/legal/terms-of-service.html` (+ their
specs)

- [x] **Step 1: Failing specs** — AC-10 branches on the note component; dialog spec: terms
  fetched on open, note rendered per window, **no cancellation claim while
  loading/errored**; pay-page spec: note rendered from the handoff; booking-view spec:
  CLOSED-born renders the last-minute note and no cancel section, advance keeps
  `refundTerms`; `booking-date.spec.ts`: deadline formatted in `Europe/Tirane` for a
  non-ambiguous instant; a11y spec: axe green with the note present, `role="status"` on
  the async container.
- [x] **Step 2: Run, verify FAIL** — `npm test -- --run <touched specs>` (scoped).
- [x] **Step 3: Minimal implementation** —
  - `BookingService.cancellationTerms(params)` — an `httpResource` factory keeping URL +
    typing in the service; `CancellationTerms` model type.
  - Dialog: the `httpResource` keyed on `(set().id, date())`; the instant note keeps its
    pay/code sentences, the free-cancellation sentence is replaced by
    `<p appCancellationTermsNote [terms]=…>` inside a `role="status"` container rendered
    only on resolve; the request note gains the same note beneath its kept copy.
  - Note component: attribute selector on native `<p>` (cutoff-note precedent), Tailwind
    utilities only, `data-testid="cancellation-terms-note"`, branches:
    FREE → "Free cancellation until {Tirane-formatted deadline}." · LATE bps>0 →
    "Past free cancellation — cancelling refunds only {pct}%." · LATE bps=0 →
    "Past free cancellation — no refund if cancelled." · CLOSED →
    "Non-refundable last-minute booking — it can't be cancelled once paid."
  - `PaymentHandoff` carries the terms; `booking-pay` renders the same note near the pay
    action.
  - `booking-view`: `@else if (b.cancellationWindowAtBirth === 'CLOSED')` branch renders
    the last-minute note (no live region — page data).
  - ToS: one sentence in the cancellation section.
- [x] **Step 4: Run, verify PASS** — touched Vitest specs + `npm run lint` +
  `npm run format:check` + `npm run test:a11y`.
- [x] **Step 5: Generalization-audit** — population: every template stating a
  free-cancellation claim (`grep -rn "Free cancellation\|evening before" frontend/src`) →
  each surface now truthful or listed in the ledger.
- [x] **Step 6: Commit** — `git commit -m "Disclose the booking's actual cancellation terms across checkout, booking view and ToS (#795)"`
- [x] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — Mocked e2e + docs + close-out

**Files:** Modify `frontend/e2e/same-day-booking.e2e.ts`, `frontend/e2e/find-a-booking.e2e.ts`,
`RESPONSIBILITIES.md`, `CONTEXT.md` · plan doc final state

- [x] **Step 1: e2e** — extend the today-journey: dialog shows the non-refundable note
  before submit, pay page repeats it before payment; **correct the `AWAITING_DETAIL`
  fixture** to the truthful CLOSED-born shape (the #791/#794 close-out note);
  `expectNoSeriousAxeViolations` at the disclosure steps; `find-a-booking.e2e.ts` gains
  the CLOSED-born detail case (last-minute state, no cancel section). Suite placement is
  RV-FE-E2E's: mocked CI suite, both files already there.
- [x] **Step 2: Run** — `npm run test:e2e:a11y` → PASS.
- [x] **Step 3: Docs** — RESPONSIBILITIES §booking (the terms read + window-at-birth
  stamping join the cutoff-authority paragraph), §notification (the two widened payloads;
  rendering-not-deciding restated). CONTEXT.md already landed in phase 0 (step 5a) —
  verify it matches the shipped names, don't re-author it here. Run
  `riviera-docs-freshness` over the slice range, incl. the counting
  sweep (do the widened events change any "the five events carry…"-shaped statement?).
- [x] **Step 4: Guards** — `node scripts/check-plan-file-structure.mjs --diff origin/main`
  (plan doc staged first), inline-comment + touch-target guards over the diff.
- [x] **Step 5: Commit** — `git commit -m "Pin the last-minute disclosure end-to-end and refresh the substrate docs (#795)"`
- [x] **Step 6: Finalize Execution status** (stage pointer, `merged via PR #NN` at
  close-out — never a SHA), then the PR gates per `references/pr-gates.md`.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-29 | phase 0 (enum move) | every reference to the old FQCN, incl. gitignore-shadowed paths | `grep -rn "booking.domain.CancellationWindow" platform/src` + `git ls-files 'platform/*.java' \| xargs grep -ln "domain.CancellationWindow"` | 0 in code (5 main + 3 test files import-rewritten; only historical plan docs mention the old path) | none needed |
| 2026-08-29 | phase 1 (terms quote) | every consumer of the window rule in main sources | `grep -rn "cancellationWindow\|freeCancellationEndsAt" platform/src/main` | 3 files: `BookingCutoff` (the rule), `CancellationPolicy` (the one quote site), `CancellationTermsView` (field name only) | none needed — no second implementation |
| 2026-08-29 | phase 2 (event widening) | every publication site of the two events; every consumer of the four widened records | `grep -rn "new BookingConfirmed(\|new BookingPaymentDue(" platform/src/main` + `git ls-files … \| xargs grep -ln "BookingConfirmationMail\|PaymentDueMail\|BookingConfirmed\|BookingPaymentDue"` | 2 production publication sites (`ConfirmBookingService`, `RespondToRequestService`) — both stamp; 46 mentioning files — listeners/resend carry the fields, `payout`'s `BookingConfirmedPayoutListener` provably ignores them (ids/amount only), rest are Javadoc mentions | all updated or verified |
| 2026-08-29 | phase 3 (view DTO) | every producer of `BookingDetail`/`BookingDetailView` | `grep -rn "new BookingDetailView(\|new BookingDetail(" platform/src` | 1 producer each (`ViewBookingService`, `BookingDetailView.of`) + spec fixture literals (5 FE spec files) | all stamp the field |
| 2026-08-29 | phase 4 (disclosure surfaces) | every FE surface stating a free-cancellation claim | `grep -rn "Free cancellation\|evening before" frontend/src` | 3 surviving claims: the terms note (server-quoted), `booking-view.refundTerms` (conditional on server `beforeCutoff` — ledger: preserved), ToS (now qualified by the new bullet) | dialog's static claim replaced; all truthful |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..3:** scoped `gradle test --tests "*CancellationPolicyTermsTest*"` → PASS (4 tests, 0 skipped). Verified at commit `2c34cf2`.
- [x] **AC-4:** scoped `gradle test --tests "*CancellationTermsEndpointIT*"` → PASS (6 tests, 0 skipped, Testcontainers live). Verified at commits `2c34cf2` + `217de7c` (port refactor).
- [x] **AC-5/AC-7:** scoped `gradle test --tests "*BookingConfirmationMail*"` → PASS (IT 6 tests + listener 16, 0 skipped). Verified at commit `61ff689`.
- [x] **AC-6:** scoped `gradle test --tests "*RequestPaymentDueMailIT*"` → PASS (7 tests, 0 skipped). Verified at commit `61ff689`.
- [x] **AC-8:** scoped `gradle test --tests "*ViewBookingServiceTest*"` → PASS. Verified at commit `a85afb8`.
- [x] **AC-9:** scoped `gradle test --tests "*WeatherRefund*"` → PASS (pre-existing `reachesASameDayBooking` covers the AC). Verified at commit `a85afb8`.
- [x] **AC-10:** `npm test` → 1992/1992 PASS (dialog + note + pay + view specs included). Verified at commit `6f9c3ca`.
- [x] **AC-11:** `npm run test:e2e:a11y` → 295/295 PASS (extended today-journey + CLOSED-born view case). Verified at the phase-5 commit.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7) — no code in any event payload.
- [x] Flyway migration present for schema changes — N/A, no schema change (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — final state cites `merged via PR #803`.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone (record: PR #803 review comment).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
