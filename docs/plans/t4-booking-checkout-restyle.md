# T4 — Booking dialog + confirmation + pay/requested restyle (Liquid Glass) Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Issue **#137**, epic **#133** (Liquid Glass
> tourist redesign), slice **T4**.

**Goal:** Restyle the whole tourist checkout surface — the booking dialog, the `/booking/pay`
Payment page, the `/booking/requested` Request-sent screen, and the `/booking/confirmation`
Confirmed screen — to the Liquid Glass v3 design **without changing any payment/request
contract or booking behavior** (the three shipped #98 flows stay byte-identical), and flip
those three routes off the legacy compat surface.

**Architecture:** Pure frontend, glass-restyle only. The single most significant decision:
**confirmation state is never derived client-side** — the redesigned `/booking/pay` keeps the
existing webhook-driven backend poll (`GET /api/bookings/{code}` → `CONFIRMED`) as the *only*
source of confirmation (invariant #8); the v3 design's `Visa ···· 4242` mock and its demo
`finalizePayment`/`payStatus` script are **not** implemented. The dialog becomes a two-step
(Details → Review) glass modal; the map remains the single source of the booking date (#44/#136),
so the dialog's date is now **read-only**.

**Persistence:** N/A — frontend-only, no DB/migration (invariant #1 not engaged).

**Source of intent:** GitHub issue **#137** (+ its v3 gap-fill comment) under epic **#133**;
visual spec `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` (booking dialog lines 444–548,
confirmed modal 526–548, Payment page 550–662, Request-sent 664–686); intake note
`docs/design/2026-07-02-liquid-glass-redesign-note.md`.

**Skills consulted:**
- `riviera-plan-doc` — this plan's structure + the AC-at-the-surface-boundary discipline.
- `riviera-frontend` — placement: all files stay in the `booking/` feature folder; the new
  date helper is a pure util → `shared/`; glass contrast proven by composited math per theme;
  route flip lives in `app.routes.ts`; e2e in the CI-safe `frontend/e2e/` suite.
- `angular-developer` + angular-cli MCP (`get_best_practices`, v22) — v22 idioms: standalone,
  Signal Forms, `input()`/`output()`, `computed()`, `@if/@switch`, `class`/`style` bindings,
  `host` object (no `@HostListener`), inline templates; Vitest runner.
- `riviera-stripe-payments` — confirmed the invariant-#8 client posture (webhook-only
  confirmation, no client-side confirm, real Payment Element on the `clientSecret`); no backend
  money change in scope, the demo card UI is not built.
- `riviera-review-overlay` (at review) · `playwright-cli` (at e2e authoring) · `riviera-local-debug`
  (before the first `npm` run) — loaded at their stages.

**Branch:** `feature/t4-booking-checkout-restyle` (cloud-session designated branch; stands in
for `feature/t4-…` per the riviera-sdlc cloud addendum). Created off `main@f5fca69` before phase 0.

---

## Acceptance criteria (testable)

> Written at the FE surface boundary (the observable component/route behavior), not at the
> Angular-internal or Stripe-internal level.

- [ ] **AC-1 (2-step dialog):** Given a FREE online set on an INSTANT venue, when the dialog opens
  it shows step **Details** (read-only date + price + Full name/Email/Phone) with the step
  indicator on 1; when valid details are entered and **Continue** is clicked it shows step
  **Review** (Venue/Set/Date/Guest summary + big Total + Instant-Book note) with CTA
  **"Continue to payment"**, and **Back** returns to Details. *Pinned by:*
  `booking-dialog.spec.ts` "advances Details→Review on Continue and Back returns".
- [ ] **AC-2 (validation on submit-attempt):** Given step Details with an empty/invalid field, when
  **Continue** is clicked the dialog stays on Details and shows an inline `role="alert"` error per
  invalid field; no error is shown before the first Continue. *Pinned by:* `booking-dialog.spec.ts`
  "shows role=alert field errors only after the first Continue".
- [ ] **AC-3 (INSTANT+stripe preserved):** Given a 202 `AWAITING_PAYMENT` response, when the Review
  CTA is clicked the dialog emits **`awaiting`** (never `booked`) and the app routes to
  `/booking/pay`. *Pinned by:* `booking-dialog.spec.ts` "emits awaiting on 202" + `booking-flow.e2e.ts`.
- [ ] **AC-4 (INSTANT+stub preserved):** Given a 201 `CONFIRMED` response, when the Review CTA is
  clicked the dialog emits **`booked`** and the app lands `/booking/confirmation` showing the
  booking code. *Pinned by:* `booking-dialog.spec.ts` "emits booked on 201" + `booking-flow.e2e.ts`.
- [ ] **AC-5 (REQUEST preserved):** Given a REQUEST-mode venue, when step Review is reached the CTA
  reads **"Send request"** and the note says "you won't be charged yet"; clicking it emits
  **`requested`** (202 `PENDING_REQUEST`) and lands `/booking/requested`. *Pinned by:*
  `booking-dialog.spec.ts` "REQUEST review branch" + `request-to-book.e2e.ts`.
- [ ] **AC-6 (SET_TAKEN in-dialog):** Given a 409 `SET_TAKEN`, when the Review CTA is clicked the
  dialog stays open and announces a `role="alert"` "someone just booked this set" message; no
  navigation occurs. *Pinned by:* `booking-dialog.spec.ts` "maps 409 to alert" + `booking-flow.e2e.ts`.
- [ ] **AC-7 (focus trap + restore):** Given the dialog open, on open focus moves into the dialog;
  Tab/Shift+Tab at the edges wrap focus inside it; on close focus returns to the triggering tile.
  *Pinned by:* `booking-dialog.spec.ts` "traps Tab at both edges" + `booking-flow.e2e.ts` (focus-in)
  + `venue-map.spec.ts` (restore on close, unchanged).
- [ ] **AC-8 (no client-side confirmation, invariant #8):** Given INSTANT+stripe, after the card
  step on `/booking/pay` the page shows CONFIRMED **only** once the backend poll returns
  `CONFIRMED`; a first poll of `AWAITING_PAYMENT` must not confirm; a poll of `CANCELLED` shows a
  terminal failure; webhook lag past the window shows "payment received / awaiting", never
  "confirmed". *Pinned by:* `booking-pay.spec.ts` (unchanged behavioral suite) + `booking-flow.e2e.ts`.
- [ ] **AC-9 (pay page glass + v3 states):** Given `/booking/pay`, the ready state renders the glass
  two-column layout (Payment-Element host + Order-summary aside with the "Pay €X" button), the
  processing state renders the **"Confirming your booking…"** spinner card, and the declined state
  offers retry in place; all pay `data-testid`s (`pe-host`, `pay-button`, `pay-status`, `pay-error`,
  `booking-code`, `manage-link`) are preserved. *Pinned by:* `booking-pay.spec.ts` +
  `booking-pay.a11y.spec.ts` + `booking-pay.contrast.spec.ts`.
- [ ] **AC-10 (confirmed glass card):** Given a `CONFIRMED` hand-off, `/booking/confirmation` renders
  the "You're booked." glass card with the ✓ badge, the Includes/Paid summary, the **dashed
  booking-code card** ("Show this code to staff…"), and the "Back to the beach" / "View or manage
  this booking" actions; an `AWAITING_PAYMENT` hand-off renders "No booking to show" (invariant #8
  guard). *Pinned by:* `booking-confirmation.spec.ts`.
- [ ] **AC-11 (request-sent glass card):** Given a `PENDING_REQUEST` hand-off, `/booking/requested`
  renders the glass "Request sent" card with the code, the Europe/Tirane respond-by deadline
  (`data-testid="request-deadline"`), the "you haven't been charged" copy, and the track/home
  actions; a non-pending hand-off renders "No request to show". *Pinned by:*
  `request-confirmation.spec.ts`.
- [ ] **AC-12 (a11y + contrast, both themes):** For each restyled surface, axe reports no
  serious/critical violations and every text pair meets WCAG AA as the **composited effective
  colour** over each theme's worst-case gradient stops, in **riviera and porcelain**. *Pinned by:*
  `booking-dialog.a11y/.contrast.spec.ts`, `booking-pay.a11y/.contrast.spec.ts`,
  `request-confirmation.a11y/.contrast.spec.ts`, `booking-confirmation.a11y/.contrast.spec.ts`.
- [ ] **AC-13 (route flip):** `booking/confirmation`, `booking/pay`, `booking/requested` carry **no**
  `legacySurface` flag and appear in `RESTYLED_PATHS`; `booking/:code` stays legacy (T5).
  *Pinned by:* `app.spec.ts` "app.routes legacy-surface flags".
- [ ] **AC-14 (money from minor units, invariant #5):** Every total (dialog price/total, pay total,
  confirmed Paid, request Amount) renders via `shared/money` `formatMoney` from integer minor units.
  *Pinned by:* the component specs asserting `€45` on each surface.
- [ ] **AC-15 (booking code confined, invariant #7):** The booking code appears only on the confirmed
  card, the pay confirmed/awaiting state, the request-sent card, and the `/booking/:code` link — and
  is never passed to a logger. *Pinned by:* the testid assertions above + a `grep` review check
  (no `console.*`/logger call takes the code).

## Non-goals

- **No behavior/contract change to any of the three #98 flows** — INSTANT+stripe (202→pay→poll),
  INSTANT+stub (201→confirmed), REQUEST (202→requested), and the accepted-request "Pay now" resume
  are byte-identical; only look/copy/step-structure change.
- **No `/booking/:code` (booking-view) restyle** — that's T5 (#138); it stays `legacySurface`.
- **No demo payment UI** — the design's mock card rows / "Visa ···· 4242" / test-card radio list
  and its client-side `finalizePayment` are demo logic, not built (invariant #8).
- **No new theme palettes** (#143), **no venue photos** (#142), **no My-bookings list** (#139).
- **No backend change** — no new endpoint, DTO, migration, or module.
- **No date-editing in the dialog** — the map owns the date (#44/#136); the dialog shows it read-only.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A restyle accidentally introduces client-side confirmation (design's demo mock), breaking invariant #8 | low | high | Keep `booking-pay.ts`'s poll-only confirmation untouched; the behavioral `booking-pay.spec.ts` (CANCELLED-terminal, awaiting-lag, no-poll-on-decline) stays green unchanged; RV-CT-* walked at high-effort review | agent | open |
| R-2 | Glass gradient header / cards fail WCAG AA (design's bright teal + white ink) | med | med | Deviate to AA-safe dark-teal header gradient + token inks, exactly like T1–T3; pin every pair as composited effective colour in `*.contrast.spec.ts` over both themes' worst stops | agent | open |
| R-3 | The 2-step + copy changes silently break the money-path e2e | med | high | Update `booking-flow.e2e.ts` + `request-to-book.e2e.ts` in lockstep with the DOM change (Phase 1/2); preserve every downstream `data-testid`; run `test:e2e:a11y` before PR | agent | open |
| R-4 | Removing the dialog's `input[type="date"]` breaks the map→dialog date-handoff test | med | low | Re-target `venue-map.spec.ts:300` to assert the dialog's read-only date display; keep seeding `model.date` from the `date` input so the POST body is unchanged | agent | open |
| R-5 | Booking code leaks to logs during the restyle (invariant #7) | low | high | No new logging added; code stays a bound template value; AC-15 grep check at self-review | agent | open |
| R-6 | `&ngsp;` gotcha: text split across sibling inline spans glued together ("1venue") breaking AT/text assertions | med | low | Use explicit `&ngsp;` between sibling inline elements where words must stay separated; verified by the a11y/e2e text assertions | agent | open |

## Open questions / Assumptions

> The three fidelity/scope questions below were escalated via `AskUserQuestion` at plan time; the
> user was away (no response in 60s), so each proceeds on the **recommended** option (design =
> authority) and is **revisitable** before merge. None changes a contract or an invariant.

- **Assumption A (pay layout):** `/booking/pay` uses the **responsive two-column** v3 layout
  (Payment-Element form + sticky Order-summary aside on wide screens; single column stacked on
  mobile). — *Owner:* user · *Resolves by:* review gate (re-confirm; single-column is a trivial fallback).
- **Assumption B (confirmed copy):** Both confirmed surfaces (the `/booking/confirmation` route and
  the in-place confirmed state on `/booking/pay`) unify on **"You're booked."**; the two e2e heading
  assertions are updated accordingly. — *Owner:* user · *Resolves by:* review gate.
- **Assumption C (guest row):** The `/booking/confirmation` card **omits** a Guest row (the server
  `BookingConfirmationView` carries no guest name); the dialog's Review step still shows Guest (the
  form knows it). — *Owner:* user · *Resolves by:* review gate.
- **Assumption D (pay "taken" state):** The design's pay-page "Someone just booked this set" state is
  **not** reproduced on `/booking/pay` — the backend collapses race + decline into `CANCELLED`, which
  cannot be disambiguated, so a terminal `CANCELLED` keeps the honest generic "payment didn't go
  through" copy; the set-taken race is surfaced at booking-create in the dialog's existing `SET_TAKEN`
  path. — *Owner:* agent (data-availability fact, not a preference) · *Resolves by:* Phase 2.
- **Assumption E (dialog header needs venue name):** The dialog gains a `venueName` input (the map
  passes `v.name`) so the gradient header can show the venue; SetView carries no venue name. — *Owner:*
  agent · *Resolves by:* Phase 1.

## Availability & concurrency (invariant #2)

> Frontend-only: this slice **never writes** `availability(set_id, booking_date)`. It still touches
> the booking flow, so the FE-side obligations that protect #2/#8 are stated rather than `N/A`.

- **Write paths to `availability`:** none in scope. The FE only *reads* set availability (venue map)
  and *posts* `POST /api/bookings` (unchanged) — the server performs the claim + row lock.
- **#2 protection preserved on the FE:** the dialog surfaces a server `409 SET_TAKEN` honestly
  (in-dialog `role="alert"`, no navigation, no retry-loop) so a lost race is visible, never silently
  re-attempted. The design's pay-page "taken" state is deliberately not reproduced (Assumption D).
- **#8 protection preserved on the FE:** `/booking/pay` confirms **only** on the webhook-driven poll
  result; the Stripe.js `confirm()` result never confirms; unchanged from the shipped component.
- **Pool rule (#3) / cutoff rule (#4):** unchanged — enforced server-side; the map already restricts
  selection to online-pool sets and the read-only date is the map's in-window date. No FE change.
- **Pinning test:** existing backend `ConcurrentReservationIT` (out of scope, untouched); FE side
  pinned by `booking-dialog.spec.ts` (409→alert, no emit) and `booking-pay.spec.ts` (poll-only confirm).

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend module, `api/` port, or domain event is created or changed.

### 4a. Module-ownership table

**N/A — no backend behavior added or moved.** All work is in the `booking/` FE feature folder plus
one pure util in `shared/`; no cross-module (or cross-feature) boundary is crossed.

## Payment & payout (invariants #5, #8, #9, #10)

> The FE payment **surface** is in scope; no money-moving backend code changes.

- **Model:** unchanged — collect-only via Stripe, **no Connect**; the real Stripe Payment Element
  mounts on the 202's `clientSecret` via the existing `StripePaymentGateway` DI-token adapter
  (real vs `__RIVIERA_FAKE_STRIPE__` fake). The demo card UI is not built.
- **Confirmation trigger:** signature-verified webhook only, observed by the FE via
  `GET /api/bookings/{code}` polling for `CONFIRMED` (invariant #8). No client-side confirm anywhere.
- **Idempotency / webhook dedupe:** backend concern, unchanged.
- **Money:** integer minor units, EUR, rendered via `shared/money` `formatMoney` on every surface
  (invariant #5); no `number` arithmetic on amounts in the FE.
- **Payout-ledger effect / refund policy:** N/A — no accrual/refund path touched here.
- **Pinning tests:** `booking-pay.spec.ts` (invariant #8 state machine — kept green unchanged),
  the pay contrast/a11y specs, and the two e2e stripe paths.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `shared/booking-date-label.ts` | new | pure util | — | — |
| FE-2 | `booking/booking-dialog.ts` (+ `.scss`) | modify (rewrite template) | standalone component | signals + `computed()`; `step` signal; `submitAttempted` signal | Signal Forms (name/email/phone) |
| FE-3 | `booking/booking-pay.ts` (+ `.scss`) | modify (template/scss glass) | standalone component | signals (state machine unchanged) | — |
| FE-4 | `booking/request-confirmation.ts` (+ `.scss`) | modify | standalone component | `computed()` from `BookingService` | — |
| FE-5 | `booking/booking-confirmation.ts` (+ `.scss`) | modify | standalone component | `computed()` from `BookingService` | — |
| FE-6 | `app.routes.ts` | modify | routes | — | — |
| FE-7 | `venue/venue-map.html` | modify (pass `[venueName]`) | template | — | — |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`, `input()`/`output()`,
`computed()`, `@if/@switch`, `class`/`style` bindings (no `ngClass`/`ngStyle`), host bindings in the
`host` object, inline templates, Signal Forms, `@Service`/`inject()`. Reduced-motion guards colocated
with the spinner/pop animations. Date labels built without `new Date(isoString)` (parse ISO parts to
avoid the UTC-midnight off-by-one). No `as any` on any contract type.

## FE↔BE contract

**N/A — no contract change.** The `POST /api/bookings` request body is unchanged (`setId`,
`bookingDate`, `contact{email,fullName,phone}`); the 201/202 discrimination and
`GET /api/bookings/{code}` polling are unchanged. The new `venueName` dialog input is a
**component input**, not a wire field. Money stays integer minor units + currency; the booking date
stays an ISO `LocalDate` string on the wire (only its *display* is prettified).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Shared friendly booking-date label | ✅ | `feat(fe): friendly booking-date label helper (#137)` |
| 1 — Booking dialog: 2-step glass modal | ✅ | `feat(fe): 2-step Liquid Glass booking dialog (#137)` |
| 2 — Payment page: glass two-column + v3 states | ✅ | `feat(fe): Liquid Glass payment page + v3 states (#137)` |
| 3 — Confirmed + Request-sent glass cards | | |
| 4 — Route flip + e2e alignment + full green | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each
phase's code.

---

## File structure

- `frontend/src/app/shared/booking-date-label.ts` — **new**: `formatBookingDate(iso)` → friendly
  label ("Mon, 20 Jul 2026"), ISO-part parsing (no TZ footgun). `+ .spec.ts`.
- `frontend/src/app/booking/booking-dialog.ts` / `.scss` — 2-step glass modal (gradient header +
  step indicator, Details step, Review step, footer Back + primary CTA, read-only date,
  `role="alert"` errors on submit-attempt, header close button, `venueName` input).
- `frontend/src/app/booking/booking-dialog.spec.ts` — rewrite to the 2-step behavior.
- `frontend/src/app/booking/booking-dialog.a11y.spec.ts` — accessible name from the header title;
  axe on both steps.
- `frontend/src/app/booking/booking-dialog.contrast.spec.ts` — **rewrite** legacy palette → glass
  tokens + header-gradient white-ink pairs, both themes.
- `frontend/src/app/booking/booking-pay.ts` / `.scss` — glass two-column layout; states restyled
  (ready / "Confirming your booking…" / declined-retry / terminal / awaiting / missing); behavior
  and every `data-testid` preserved.
- `frontend/src/app/booking/booking-pay.spec.ts` — behavioral suite kept; only the confirmed-heading
  assertion updated to "You're booked." (Assumption B).
- `frontend/src/app/booking/booking-pay.a11y.spec.ts` / `.contrast.spec.ts` — **rewrite** to glass.
- `frontend/src/app/booking/booking-confirmation.ts` / `.scss` — "You're booked." glass card.
- `frontend/src/app/booking/booking-confirmation.spec.ts` — heading → "You're booked."; code/guard.
- `frontend/src/app/booking/booking-confirmation.a11y.spec.ts` / `.contrast.spec.ts` — **rewrite** glass.
- `frontend/src/app/booking/request-confirmation.ts` / `.scss` — "Request sent" glass card.
- `frontend/src/app/booking/request-confirmation.spec.ts` — copy/testid updates.
- `frontend/src/app/booking/request-confirmation.a11y.spec.ts` / `.contrast.spec.ts` — **new** (AC gap).
- `frontend/src/app/app.routes.ts` — remove `legacySurface` from the 3 booking routes.
- `frontend/src/app/app.spec.ts` — add the 3 paths to `RESTYLED_PATHS`.
- `frontend/src/app/venue/venue-map.html` — pass `[venueName]="v.name"` to `<app-booking-dialog>`.
- `frontend/src/app/venue/venue-map.spec.ts` — re-target the date-handoff assertion to the read-only
  date display.
- `frontend/e2e/booking-flow.e2e.ts` / `frontend/e2e/request-to-book.e2e.ts` — align to the 2-step
  flow + new copy/labels; every downstream testid preserved.

---

## Phase 0 — Shared friendly booking-date label

**Files:** Create `shared/booking-date-label.ts` · Test `shared/booking-date-label.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/booking-date-label.spec.ts
import { formatBookingDate } from './booking-date-label';

describe('formatBookingDate', () => {
  it('formats an ISO LocalDate as a friendly label without a timezone shift', () => {
    // Parsed from ISO parts (no new Date(str)) so it never rolls to the prior day.
    expect(formatBookingDate('2026-07-20')).toBe('Mon, 20 Jul 2026');
    expect(formatBookingDate('2026-12-01')).toBe('Tue, 1 Dec 2026');
  });

  it('returns an empty string for an empty/invalid input (defensive)', () => {
    expect(formatBookingDate('')).toBe('');
    expect(formatBookingDate('not-a-date')).toBe('');
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npm test -- booking-date-label` → FAIL (module missing)

- [ ] **Step 3: Minimal implementation**

```ts
// shared/booking-date-label.ts
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/** Friendly display of an ISO `LocalDate` (a booking date, invariant #6 — no TZ conversion:
 *  a LocalDate has no instant, so we parse the parts and never touch `new Date(string)`, which
 *  would parse as UTC midnight and can roll back a day in negative-offset zones). */
export function formatBookingDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const [, y, mo, d] = m.map(Number) as unknown as [string, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime())) return '';
  return `${DAYS[date.getUTCDay()]}, ${d} ${MONTHS[mo - 1]} ${y}`;
}
```

- [ ] **Step 4: Run it, verify it passes** — `npm test -- booking-date-label` → PASS
- [ ] **Step 5: Generalization-audit pass** — search current raw `bookingDate` renders; adopt the
  helper on pay/confirmation/request/dialog in later phases (record in log).
- [ ] **Step 6: Commit** — `feat(fe): friendly booking-date label helper (#137)`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 1 — Booking dialog: 2-step glass modal

**Files:** Modify `booking/booking-dialog.ts` + `.scss` · Rewrite `booking-dialog.spec.ts`,
`.a11y.spec.ts`, `.contrast.spec.ts` · Modify `venue/venue-map.html`, `venue/venue-map.spec.ts`.

**Behavior to build (TDD, one assertion group at a time):**
1. Header: `venueName` input; "Set {rowLabel} · spot {positionNo}" title (id = dialog accessible
   name); tier label; included = "2 loungers + umbrella · full day"; step indicator (1 Details →
   2 Review) reflecting the `step` signal. A header close button (`aria-label="Close"`) → `dismissed`
   (mobile/a11y discoverability; the design relies on backdrop/Escape which mobile lacks).
2. Step Details: read-only Date row (`formatBookingDate(date())`, `data-testid="dialog-date"`) + Price
   row; Signal-Form fields Full name/Email/Phone; `role="alert"` errors gated on `submitAttempted()`.
3. `Continue` → validate; invalid ⇒ set `submitAttempted`, stay on Details; valid ⇒ `step=2`,
   reset `submitAttempted`.
4. Step Review: summary rows (Venue/Set/Date/Guest) + big Total; INSTANT note vs REQUEST note;
   footer shows `Back` (Review only) + primary CTA ("Continue to payment" | "Send request").
5. Review CTA → `onSubmit()` (unchanged create+emit logic: 201→`booked`, 202 AWAITING→`awaiting`,
   202 PENDING→`requested`, 409→`role="alert"` error, no navigation). Keep seeding `model.date` from
   the `date` input; drop the visible date field + its `required` validator.
6. Focus trap unchanged (keydown.tab/shift.tab in `host`/panel); on-open focus into dialog.

- [ ] **Step 1: Write the failing tests** (representative — full set written during TDD)

```ts
// booking-dialog.spec.ts (key new/changed cases)
it('opens on Details with the read-only date and price, step indicator on 1', () => {
  expect(host().querySelector('[data-testid="dialog-date"]')?.textContent).toContain('Tue, 1 Dec 2026');
  expect(host().querySelector('[data-testid="dialog-price"]')?.textContent).toContain('€45');
  expect(host().querySelector('[data-testid="step-1"]')?.getAttribute('aria-current')).toBe('step');
  expect(host().querySelector('input[type="date"]')).toBeNull(); // date is read-only now
});

it('shows role=alert field errors only after the first Continue, then advances when valid', async () => {
  clickContinue();                                   // step 1, empty
  const alerts = host().querySelectorAll('[role="alert"]');
  expect(alerts.length).toBeGreaterThan(0);
  expect(host().querySelector('[data-testid="step-2"][aria-current="step"]')).toBeNull(); // still on 1
  await fillValid();
  clickContinue();
  expect(host().querySelector('[data-testid="step-2"]')?.getAttribute('aria-current')).toBe('step');
});

it('Review CTA reads "Continue to payment" (INSTANT) and Back returns to Details', async () => {
  await fillValid(); clickContinue();
  expect(reviewCta().textContent).toContain('Continue to payment');
  host().querySelector<HTMLButtonElement>('[data-testid="dialog-back"]')!.click();
  await fixture.whenStable();
  expect(host().querySelector('[data-testid="step-1"]')?.getAttribute('aria-current')).toBe('step');
});
// + preserved: emits booked (201) / awaiting (202) / requested (202 PENDING) / 409→alert / focus trap.
// REQUEST case: setInput('mode','REQUEST') → after Continue, CTA "Send request", note "won't be charged".
```

- [ ] **Step 2: Run, verify fail** — `npm test -- booking-dialog` → FAIL.
- [ ] **Step 3: Implement** the 2-step template + `booking-dialog.scss` (glass): dark AA-safe teal
  gradient header (R-2 deviation), light card-glass body, `--riv-*` inks, `--riv-cta-grad` CTA,
  `--riv-field-*` inputs; `@keyframes` pop reused from styles.scss; reduced-motion guard colocated.
- [ ] **Step 4: Run, verify pass** — `npm test -- booking-dialog` → PASS. Then re-target
  `venue-map.spec.ts:300` (assert `[data-testid="dialog-date"]` shows the map's date) and add
  `[venueName]="v.name"` in `venue-map.html`; run `npm test -- venue-map` → PASS.
- [ ] **Step 5: a11y + contrast specs.** Rewrite `.a11y.spec.ts` (accessible name from header title
  id; axe on Details AND Review; both steps have no serious violations). Rewrite `.contrast.spec.ts`
  to the glass token pattern (`glass-tokens.ts` helpers, `expectAaOverStops`, both themes): header
  white inks over the AA-safe gradient stops; card inks / field / error `#b3362b`-family / total /
  CTA white text over both themes' worst card-glass stops.
- [ ] **Step 6: Commit** — `feat(fe): 2-step Liquid Glass booking dialog (#137)`
- [ ] **Step 7: Update execution status.**

---

## Phase 2 — Payment page: glass two-column + v3 states

**Files:** Modify `booking/booking-pay.ts` + `.scss` · Update `booking-pay.spec.ts` (heading only) ·
Rewrite `booking-pay.a11y.spec.ts`, `booking-pay.contrast.spec.ts`.

**Build:** restyle the template to the responsive two-column glass layout (left: Payment-Element card
/ state cards; right: Order-summary aside with the `pay-button`), stacked single-column on mobile.
Restyle each state — ready ("Complete your payment" h1 kept for e2e stability + a "Payment details"
card sub-head), processing → **"Confirming your booking…"** spinner card, declined → retry-in-place
card, terminal CANCELLED → glass failure card with "Start a new booking" (Assumption D), awaiting →
"Payment received" glass card, missing → glass "No payment in progress". **State machine, poll,
`showElement`/`showPayButton`/`payLabel`, and every `data-testid` unchanged** (invariant #8). Confirmed
state adopts "You're booked." + the dashed booking-code card (Assumption B).

- [ ] **Step 1: Write/keep failing tests.** Keep the whole behavioral `booking-pay.spec.ts` (it must
  stay green with zero logic change — it is the invariant-#8 guard). Change only the one confirmed
  assertion the design touches:

```ts
// booking-pay.spec.ts — the confirmed transition test now asserts the unified heading via the DOM
it('shows the "You're booked." confirmed state after the backend reports CONFIRMED', async () => {
  // ... existing pay() + advanceTimers + flush CONFIRMED ...
  expect(comp.state()).toBe('confirmed');
  expect(host().querySelector('h1')?.textContent).toContain('You’re booked');
  expect(host().querySelector('[data-testid="booking-code"]')?.textContent).toContain('WXYZ345678');
});
```

- [ ] **Step 2: Run, verify** the behavioral suite still passes on the unchanged logic (the new
  heading assertion fails until the template changes) — `npm test -- booking-pay` .
- [ ] **Step 3: Implement** template + `booking-pay.scss` glass two-column (grid: `1fr` mobile →
  `minmax(0,1fr) 320px` wide; aside `position: sticky`); spinner `@keyframes` + reduced-motion guard
  colocated; all inks from `--riv-*`; CTA white text on `--riv-cta-grad`.
- [ ] **Step 4: Run, verify pass** — `npm test -- booking-pay` → PASS.
- [ ] **Step 5: a11y + contrast rewrite** to glass tokens (both themes): the pay page sits on the
  bare themed gradient with light card-glass panels; header "Secure checkout" chip; order-summary
  inks; "Pay €X" white on CTA grad; spinner/failed/taken decorative badges `aria-hidden` (heading
  carries meaning) documented as 1.4.11-exempt.
- [ ] **Step 6: Commit** — `feat(fe): Liquid Glass payment page + v3 states (#137)`
- [ ] **Step 7: Update execution status.**

---

## Phase 3 — Confirmed + Request-sent glass cards

**Files:** Modify `booking/booking-confirmation.ts` + `.scss`, `booking/request-confirmation.ts` +
`.scss` · Update `booking-confirmation.spec.ts`, `request-confirmation.spec.ts` · Rewrite
`booking-confirmation.a11y/.contrast.spec.ts` · **Add** `request-confirmation.a11y/.contrast.spec.ts`.

**Build (booking-confirmation):** "You're booked." glass card — ✓ badge, subhead
"Set {rowLabel} · spot {positionNo} at {venueName} on {formatBookingDate}", Includes/Paid summary
(no Guest row — Assumption C), dashed booking-code card ("Show this code to staff when you arrive."),
"Back to the beach" + "View or manage this booking" (`data-testid="manage-link"` → `/booking/:code`).
The `CONFIRMED`-guard `computed()` and the cold-load "No booking to show" are unchanged.

**Build (request-confirmation):** "Request sent" glass card — envelope badge, subhead + "you haven't
been charged", info box with the respond-by deadline (`formatDeadline`, `data-testid="request-deadline"`),
dashed "Request reference" + code (`data-testid="booking-code"`), "Track this request"
(`data-testid="status-link"` → `/booking/:code`) + "Back to the beach". The `PENDING_REQUEST`-guard
and cold-load message unchanged. Keep the "you'll only pay if the venue accepts" sense (copy may
move to the info box) — e2e asserts a phrase, updated in Phase 4.

- [ ] **Step 1: Write/adjust failing tests.**

```ts
// booking-confirmation.spec.ts
expect(host.querySelector('h1')?.textContent).toContain('You’re booked');
expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
// AWAITING guard unchanged: h1 → "No booking to show", no booking-code.

// request-confirmation.spec.ts — keep: h1 "Request sent", code, deadline "17:00", status-link href.
// request-confirmation.a11y.spec.ts (NEW): expectNoAxeViolations on the pending card + cold-load.
// request-confirmation.contrast.spec.ts (NEW): glass-token pairs, both themes.
```

- [ ] **Step 2: Run, verify fail** — `npm test -- request-confirmation booking-confirmation`.
- [ ] **Step 3: Implement** both templates + glass `.scss` (centered card on the themed gradient;
  card-glass surface; dashed code card; `--riv-*` inks; pop animation + reduced-motion guard).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: a11y + contrast** (rewrite confirmation's legacy specs to glass; add request's two).
- [ ] **Step 6: Commit** — `feat(fe): Liquid Glass confirmed + request-sent cards (#137)`
- [ ] **Step 7: Update execution status.**

---

## Phase 4 — Route flip + e2e alignment + full green

**Files:** Modify `app.routes.ts`, `app.spec.ts`, `e2e/booking-flow.e2e.ts`,
`e2e/request-to-book.e2e.ts`.

- [ ] **Step 1: Flip routes.** Remove `legacySurface: true` from `booking/confirmation`,
  `booking/pay`, `booking/requested` (keep it on `booking/:code`). Add those three paths to
  `RESTYLED_PATHS` in `app.spec.ts`. Run `npm test -- app` → the legacy-flags test passes.
- [ ] **Step 2: Align the e2e (playwright-cli loaded).** Update both specs to the 2-step flow: fill
  name/email/phone on Details → click **Continue** → on Review click **Continue to payment**
  (INSTANT) / **Send request** (REQUEST). Update the dialog accessible-name/heading assertions, the
  REQUEST note phrase ("won't be charged"), the request-sent phrase, and (Assumption B) the confirmed
  heading → "You're booked." on the pay path. Preserve every downstream `data-testid`
  (`booking-code`, `pay-button`, `pay-status`, `request-deadline`, `status-link`). Await
  `getAnimations().finished` before axe on the freshly-opened (animated) dialog/cards.
- [ ] **Step 3: Run the CI-safe e2e** — `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium
  npm run test:e2e:a11y` → all green (booking-flow: instant-confirm + stripe + SET_TAKEN;
  request-to-book: request + accepted-Pay-now + expired/declined).
- [ ] **Step 4: Full FE unit + lint** — `npm test` (FE) + `npm run lint` green.
- [ ] **Step 5: Generalization-audit pass** (date helper adoption; `&ngsp;` sweep).
- [ ] **Step 6: Commit** — `feat(fe): flip booking routes to glass + align e2e (#137)`
- [ ] **Step 7: Update execution status → all ✅; open the PR.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-02 | Phase 1 (read-only date label) | raw `{{ …bookingDate }}` renders | grep `bookingDate` in booking/ | booking-pay, booking-confirmation, request-confirmation | Adopt `formatBookingDate` on those surfaces in Phases 2–3 (their restyle) |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [ ] **AC-1..AC-7** (dialog): `npm test -- booking-dialog` green; e2e dialog steps green.
- [ ] **AC-8, AC-9** (pay / invariant #8): `npm test -- booking-pay` green (unchanged behavioral
  suite); e2e stripe paths green.
- [ ] **AC-10, AC-11** (confirmed / request): `npm test -- booking-confirmation request-confirmation` green.
- [ ] **AC-12** (a11y+contrast): all four `*.a11y.spec.ts` + `*.contrast.spec.ts` green; e2e axe green.
- [ ] **AC-13** (routes): `npm test -- app` green.
- [ ] **AC-14** (money): `€45` asserted on each surface.
- [ ] **AC-15** (code confined): `grep -rn "console\.\|logger" frontend/src/app/booking` shows no
  call taking the code; testids confine it to the four surfaces.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases (`venueName` input, `formatBookingDate`).
- [ ] **No JPA / backend change** — N/A here, but confirm the diff is FE-only (invariant #1).
- [ ] **Availability** section: no client-side confirmation added; 409 surfaced honestly (invariant #2/#8).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** — N/A (frontend-only); no cross-feature import (`booking/` → `core`/`shared` only).
- [ ] **Payment** — webhook-only confirmation preserved; money in minor units (invariants #5, #8).
- [ ] Timezone: booking-date label parses ISO parts (no `new Date(str)`); deadline in Europe/Tirane (invariant #6).
- [ ] Booking codes confined to the four surfaces + `/booking/:code`, never logged (invariant #7).
- [ ] Flyway — N/A (no schema change).
- [ ] **Frontend** standards met (v22 idioms, a11y, both-theme contrast) or deviation documented (R-2).
- [ ] Execution-status table at HEAD matches reality; PR Gates checkboxes ticked as each gate passes.
- [ ] Risk register has no stale `open` rows; Open Questions empty or deferred with the review-gate note.
