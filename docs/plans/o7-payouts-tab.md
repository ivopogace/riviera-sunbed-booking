# O7 — Payouts tab (ledger, statement, weather refund) Implementation Plan

> Implement with `implement` + `tdd`. Steps use checkbox syntax for tracking.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Build the operator console's **Payouts** tab — a per-venue payout ledger (per-entry
date, booking reference, gross / commission / net; refund **reversals as negative rows** with a
reason chip; an "Owed to you" hero + period-total row), a display-only **payout statement** modal
for the manual BKT batch, and a **weather-refund** action (per-date, confirm-gated) — all on the
**existing** owner-asserted endpoints. Swap the `payouts` child route from `ConsolePlaceholder` to
the new `PayoutsTab`; after O7 only `venue` remains a placeholder (for O8).

**Architecture:** **Frontend-only** — proven at the intake grill against today's code. A new
`PayoutsTab` (a console child route, mirroring O5 `DailyViewTab` / O6 `RequestsTab`) consumes two
**existing** owner-asserted endpoints: `GET /api/venues/{id}/payout-ledger` (the ledger) and
`POST /api/venues/{id}/weather-refund?date=` (the per-date weather refund). **No backend, no
schema, no new endpoint.** The three design-vs-reality forks were escalated and resolved the lean
way (see Open questions / Resolved): weather refund stays **per-date** (reuse the endpoint),
the statement is a **display-only** view over the ledger read (server stays authoritative for the
owed figure), and ledger rows render **no tourist identity** (a `bookingId` reference, not the
bearer-credential booking code). The one seam decision: the ledger + weather-refund clients go on
the **existing `OperatorConsoleService`** (the seam O5/O6 established), money renders via the
existing `formatMoney` (minor units, invariant #5) — the tab **renders and triggers; the backend
decides and moves the money** (invariants #8/#9/#10).

**Persistence:** N/A — frontend-only, no migration (invariant #1 JDBC-only unaffected; next free
Flyway number is **V22**, unclaimed — recorded for reference, not used here).

**Source of intent:** GitHub issue #173 (epic #141 operator console, slice O7). Design:
`docs/design/riviera-operator-console-v2.dc.html` (Payouts screen, lines 301–362; statement modal
445–496).

**Skills consulted (riviera-sdlc Skill-routing gate):**
- `riviera-plan-doc` — plan discipline + this template; ACs at the component boundary; the mandatory
  Payment & payout section even though no money moves *here*.
- `riviera-frontend` — placement: new tab is a lazy **console child route**; the ledger/weather
  clients go on `OperatorConsoleService` (not a new service — the one-way import rule + the O5/O6
  precedent); models in `operator-console.model.ts`; the unit+a11y+contrast spec trio per surface;
  the two-suite e2e split (CI-safe mocked in `frontend/e2e/`, local-only real-backend in
  `frontend/e2e/real-backend/`). **No `core/` promotion** — the Payouts tab has no cross-cutting
  singleton (unlike O6's badge store; the Payouts tab has no shell badge).
- `angular-developer` + angular-cli MCP (`get_best_practices`, v22) — signals/`computed`, `@Service`
  + `inject()`, native control flow, `class`/`style` bindings (no `ngClass`/`ngStyle`), no explicit
  `OnPush`/`standalone`, `new Date()` captured once at the boundary, accessible-name-not-colour.
- `riviera-tailwind` — hero + ledger + statement surfaces via the shared **`CardGlass` / `PanelGlass`
  directives** (never `@apply`); each surface sets its own radius; keep `data-testid` hooks;
  reversal/amber/red literals documented in the contrast spec; prove no colour drift via computed-style.
- `riviera-stripe-payments` — confirms the model the tab must not violate: **collect-only, no
  Connect**; the weather refund is **server-decided** (`booking` #10) and **server-executed**
  (`payment` #8, via the signature-verified webhook path) with the payout **reversal** posted by
  `payout` (#9) — the tab only triggers the per-date action and re-renders.
- `playwright-cli` (loaded at build) — CI-safe mocked e2e in `frontend/e2e/`; the money real-backend
  spec in `frontend/e2e/real-backend/`.
- `riviera-local-debug` (loaded before the first `npm`) — scoped-test discipline.
- `riviera-review-overlay` (review gate) — RV-FE-* (money from minor units, graceful conflict/error,
  a11y), RV-BE-9 (owner-assert preserved), RV-CT-* (webhook-as-truth, no self-refund), RV-PROC-1.
- **NOT loaded (and why):** `riviera-modulith` / `riviera-java-conventions` / `postgres` — **no
  backend, module, port, event, or SQL is touched**. The grill proved the two endpoints already
  exist, owner-asserted, with the response shapes the (lean) design needs.

**Branch:** `feature/o7-payouts-tab` (created off `main` `94ee3d7` before phase 0; local session,
not the cloud designated-branch case).

---

## Acceptance criteria (testable)

> Phrased at the component boundary (the FE inner surface): the tab's observable behaviour given a
> mocked/overridden `OperatorConsoleService`, independent of the exact Tailwind. All money math and
> the refund decision stay server-owned — the tab is a driving adapter that renders and triggers,
> never computes money (invariant #5/#9) and never decides/executes a refund (invariants #8/#10).

- [ ] **AC-1 (ledger renders from minor units):** Given a venue ledger with accruals and reversals,
  when `PayoutsTab` renders, then each row shows its date, a booking **reference** (`#<bookingId>`),
  and gross / commission / net rendered from **integer minor units** via `formatMoney` (invariant
  #5) — no float, no client money arithmetic. *Pinned by:* `payouts-tab.spec.ts › renders ledger rows from minor units`.
- [ ] **AC-2 (reversals negative + reason chip):** Given a `REVERSAL` entry, when the row renders,
  then it shows a **reason chip** (Weather / Policy) and a **negative** net; an `ACCRUAL` row shows a
  positive net and no chip. Reason is conveyed by text, not colour alone. *Pinned by:*
  `payouts-tab.spec.ts › reversal shows negative net + reason chip`.
- [ ] **AC-3 (owed total is the server's figure, not recomputed):** Given the ledger read's
  `netOwedMinor`, when the hero "Owed to you" and the period-total "owed" render, then **both equal
  `netOwedMinor` exactly** (display-only Σ; the FE never re-derives the authoritative owed figure,
  RV-FE-3 / invariant #9), and the hero shows the accrual + reversal counts and "paid by bank
  transfer" copy. *Pinned by:* `payouts-tab.spec.ts › owed total equals server netOwedMinor`.
- [ ] **AC-4 (statement modal, display-only):** Given a loaded ledger, when the operator clicks
  "View statement", then a modal renders the **same** entries + a "Total due" equal to `netOwedMinor`,
  the venue name (best-effort) + ledger currency, and the transfer-to block shows the IBAN/reference
  as an **"assigned at settlement"** placeholder (payout details not stored — reconciliation #4);
  "Close" dismisses it. *Pinned by:* `payouts-tab.spec.ts › statement modal renders + closes`.
- [ ] **AC-5 (weather refund is per-date + confirm-gated):** Given a selected date, when the operator
  triggers the weather refund, then an **amber inline confirm** appears with **whole-day** copy
  naming the date ("refund every online booking for <date>…"); "Issue full weather refund" calls
  `weatherRefund(venueId, date)`; "Cancel" makes **no** call. *Pinned by:*
  `payouts-tab.spec.ts › weather refund confirm calls per-date endpoint / cancel makes no call`.
- [ ] **AC-6 (weather refund outcome + reversal appears):** Given a confirmed weather refund, when
  the server returns `{ refundedCount, totalRefundedMinor, currency }`, then a transient notice
  reports the count + total from the response, and the ledger is **re-read** so the resulting
  `REVERSAL`(s) appear (eventually — the accrual reversal is posted by an `AFTER_COMMIT` listener,
  R-2); a `refundedCount` of 0 shows a "no confirmed bookings that day" no-op notice, not an error.
  *Pinned by:* `payouts-tab.spec.ts › weather refund reports outcome + re-reads ledger / zero is a no-op`.
- [ ] **AC-7 (owner-assert preserved / 403 + 401 copy):** Given a cross-venue or expired session,
  when the ledger read or the weather refund returns 403 `NOT_VENUE_OWNER` / 401, then the tab
  surfaces the mapped operator copy and a 401 triggers `operator.sessionLost()` — the server
  owner-assert on `/api/venues/{venueId}/**` is unchanged (invariant #13). *Pinned by:*
  `payouts-tab.spec.ts › maps 403 owner copy / 401 drops session`.
- [ ] **AC-8 (no bearer credential, no tourist identity):** Given any ledger, when the payouts region
  renders, then **no booking code and no guest name appear anywhere** — the "Booking" cell is the
  non-credential `#<bookingId>` reference (invariant #7 held: the read exposes no code, and the tab
  binds none; invariant #11 need-to-know: the `payout` read carries no identity). *Pinned by:*
  `payouts-tab.spec.ts › renders no booking code or guest name` + the e2e region assertion.
- [ ] **AC-9 (empty / loading / error states):** Given an empty ledger, the tab shows a "nothing owed
  yet" empty state (owed = €0); a load failure shows an error card (not a false empty); the initial
  read shows a loading state. *Pinned by:* `payouts-tab.spec.ts › empty / load-error / loading`.
- [ ] **AC-10 (route swap + placeholder retired):** Given the swap, then `/operator/:venueId/payouts`
  lazy-loads `PayoutsTab`, the `payouts` case + its spec test are removed from `console-placeholder`,
  `payouts` is dropped from `CONSOLE_TABS`, and **only `venue` remains a placeholder**; the shell's
  six-tab nav is unchanged (Payouts has no badge). *Pinned by:* `app.spec.ts › payouts loads PayoutsTab`
  + `console-placeholder.spec.ts` (only the venue case remains).
- [ ] **AC-11 (a11y + contrast):** axe finds no serious violations on the ledger, the statement modal,
  the weather-confirm, and the empty state; reversal/reason and the weather affordance are not
  colour-only; the porcelain glass surfaces pass composited-AA. *Pinned by:* `payouts-tab.a11y.spec.ts`,
  `payouts-tab.contrast.spec.ts`.
- [ ] **AC-12 (e2e):** The CI-safe mocked Playwright spec drives sign-in → Payouts tab → ledger
  renders (accruals + a negative reversal) → open/close the statement → pick a date + confirm a
  weather refund (a reversal appears on re-read) → the owner-copy path, all against `page.route`
  mocks, axe-clean, with **no booking code text** in the payouts region. *Pinned by:*
  `frontend/e2e/operator-payouts.e2e.ts`.

## Non-goals

- **Any backend change** — no new endpoint, controller, service, SQL, Flyway migration, module,
  port, or event. The grill proved the ledger read and the per-date weather refund already exist,
  owner-asserted. (Had any fork gone the "rich" way — per-booking refund, server statement, or
  enriched ledger — O7 would have been fullstack; all three went lean.)
- **Per-booking weather refunds.** The design draws per-row buttons; the endpoint is per venue+date
  and the ledger carries no service-date, so the action is **date-scoped** (user decision — Resolved).
- **A server-computed period statement.** The statement is a display-only view over the ledger read;
  actual settlement stays the cross-venue admin `payout-batch` machinery (unchanged, out of scope).
- **Showing booking codes or guest names on ledger rows.** Render without tourist identity (user
  decision — Resolved); invariant #7 (bearer credentials) + #11 (need-to-know) kept.
- **Any commission / payout / refund *math* on the client** (invariant #5/#9). The FE renders minor
  units and displays the server's owed figure; it never computes commission, net, or the owed total.
- **Retiring the venue editor** (`/venue-admin`) — that is O8 (#177). O7 adds a new tab and retires
  nothing (so the Behavior-parity ledger is N/A).
- **A live-refreshing ledger poll.** The ledger re-reads after a weather refund (to pull in the
  reversal); no background timer (unlike O6's urgency clock — there is no time-sensitive state here).

## Behavior-parity ledger (retirement / replacement slices only)

**N/A — new behavior, replaces nothing.** O7 swaps a **placeholder** (never a shipped surface) for
the real tab; no legacy behavior is being ported or dropped. (The VenueEditor / StaffDaily-class
retirement is O8 / was O6 — not here.) The one thing the swap touches is the `console-placeholder`
`payouts` case, which is placeholder copy with no behavior to preserve.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | FE recomputes the owed total and drifts from the server's `netOwedMinor` (money #5, ledger #9) | med | high | Render **`netOwedMinor` directly** as the authoritative owed figure in both the hero and the period-total; the period-total gross/commission are display-only Σ **presentation** of the same rows, never the source of "owed"; AC-3 asserts owed == server figure exactly; no float, `formatMoney` only | Ivo | open |
| R-2 | The weather-refund `REVERSAL` lags an immediate ledger re-read — it is posted by an `AFTER_COMMIT` `payout` listener via the event-publication registry, so it may not be present the instant the POST returns | med | med | Show the **immediate** outcome from the `WeatherRefundView` response (count + total); **re-read** the ledger after the POST so the reversal lands within the registry cycle; document the eventual-consistency window; the mocked e2e controls timing, the real-backend spec tolerates a short `waitFor` | Ivo | open |
| R-3 | The per-date weather refund fires against the wrong day (design was per-row; a mistaken default could refund a different day's bookings) | low | high | An **explicit date picker** (defaulting to today Europe/Tirane, #6) + a whole-day **confirm** naming the date; the server endpoint **requires** an explicit `date` param (no implicit "today"); confirm-gated, single call | Ivo | open |
| R-4 | Tourist identity / a bearer-credential booking code leaks into the ledger (invariants #7, #11) | low | high | The `PayoutLedgerView` model carries **only `bookingId`** (+ money + reason + `createdAt`); the template binds no code/guest; AC-8 + the e2e assert none present; the `payout` read itself carries no identity (unchanged) | Ivo | open |
| R-5 | Cross-venue ledger read or weather refund (BOLA, invariant #13) | low | high | **Unchanged** — the server owner-asserts every `/api/venues/{venueId}/**` in the application service (pinned by backend `CrossVenueDenialIT` + `WeatherRefundSecurityIT`); the tab maps 403 `NOT_VENUE_OWNER` → copy (AC-7); no client-side authz introduced | Ivo | open |
| R-6 | Colour/spacing drift porting the mock hero/table/modal to Tailwind porcelain | med | low | `payouts-tab.contrast.spec.ts` (composited AA) + computed-style discipline (`riviera-tailwind`); reversal-red + weather-amber literals documented; surfaces via `CardGlass`/`PanelGlass` directives (no `@apply`); each surface sets its own radius | Ivo | open |
| R-7 | A double-click issues two weather refunds for the same date | low | med | The server transition is **idempotent** — a re-run refunds nothing already cancelled (guarded `WHERE status='CONFIRMED'`, 0-row no-op, #8/#9); the confirm button disables while the call is in flight; confirm-gated (two-step) | Ivo | open |
| R-8 | The statement shows a fake/misleading IBAN or reference | low | med | Payout beneficiary details are **not stored** (reconciliation #4) and the payout currency (EUR vs ALL) is provisional; render IBAN + reference as an explicit **"assigned at settlement"** placeholder, never a fabricated value; amounts use the ledger's `currency` (EUR collection currency, #5) | Ivo | open |

## Open questions / Assumptions

_None outstanding — the three product/API forks were escalated (push + `AskUserQuestion`, per
riviera-sdlc) and resolved below; the endpoint existence was proven at the grill._

### Resolved
- **Endpoints present & owner-asserted? (fullstack-vs-FE)** — **Yes; frontend-only confirmed** at the
  intake grill against today's code. `GET /api/venues/{id}/payout-ledger` → `AdminPayoutLedgerController`
  → `ViewPayoutLedger.forVenue` → `PayoutLedgerQueryService.assertOwns` (invariant #13), role-gated in
  `SecurityConfig` before the public venue GET. `POST /api/venues/{id}/weather-refund?date=` →
  `AdminWeatherRefundController` → `WeatherRefundService.assertOwns`, reusing the cancellation spine
  (refund via signature-verified webhook path #8, payout `REVERSAL` #9, invariant #10). No new surface
  needed for the lean design.
- **Weather-refund granularity (per-DATE vs per-BOOKING)** — **Per-DATE, reuse the existing endpoint**
  (maintainer, 2026-07-10). Matches invariant #10's whole-day, admin-triggered model; per-booking would
  need a new endpoint + a single-booking refund path in `booking` (fullstack). The design's per-row
  buttons become a **date-picked** action (the ledger carries no service-date, so per-row can't map to
  the per-date endpoint anyway) — a documented, signed-off design deviation.
- **Statement system-of-record (display-only vs server statement)** — **Display-only client view**
  (maintainer, 2026-07-10). The ledger read is already the authoritative owed figure; the modal formats
  the same entries + total due (= `netOwedMinor`). RV-FE-3 allows a display-only Σ; actual settlement
  stays the admin `payout-batch`. IBAN/reference are "assigned at settlement" placeholders (R-8).
- **Ledger row identity (code+guest vs none)** — **No tourist identity — a `#<bookingId>` reference**
  (maintainer, 2026-07-10). Respects `payout`'s deliberate need-to-know boundary (#11) and avoids
  putting bearer-credential codes (#7) into a new surface. Softens issue AC "booking codes render as
  display-only" → satisfied by rendering **no** code at all; the reference is a non-credential id.
- **Shell change / badge?** — **None.** Payouts has no badge (only Requests does); swapping the child
  route's component leaves the shell nav and `app.spec.ts` tab assertions unchanged.

## Availability & concurrency (invariant #2)

> The tab writes **no** availability row directly. The weather refund is a **driving adapter over the
> existing** owner-asserted per-date endpoint; this section documents that the restyle preserves the
> invariants.

- **Write paths to `availability(set_id, booking_date)` in scope:** none written by this tab. The
  weather refund drives the **existing** server flow: for each `CONFIRMED` booking on the venue+date,
  the server transitions `CONFIRMED → CANCELLED` (reason `WEATHER`) and **frees** the `(set, date)`
  row via `AvailabilityClaim.release` (invariant #2) inside the server transaction — unchanged from
  what `WeatherRefundService` does today. The client only POSTs `?date=`.
- **Uniqueness guarantee:** unchanged — the DB `(set_id, booking_date)` unique constraint and the
  server-side release are untouched; the client triggers the same transitions.
- **Concurrency strategy (client):** the weather refund is confirm-gated and single-call; the button
  disables while in flight (R-7). The server transition is idempotent (guarded, 0-row no-op on a
  concurrent/second run), so a repeat is safe. The ledger re-reads after the call (R-2).
- **Pool rule (invariant #3):** unchanged — the tab never assigns pools.
- **Cutoff rule (invariant #4):** unchanged — the weather refund is a **full refund regardless of the
  cutoff** by design (#10), computed server-side; the client neither computes nor bypasses the cutoff.
- **Pinning test:** the invariant stays pinned by the existing backend `WeatherRefundServiceIT` /
  `WeatherRefundSecurityIT` (unchanged). FE side: AC-5/AC-6 pin the per-date trigger + re-read.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend module, port, or event is added or changed. The server ownership
is unchanged: `payout` owns/computes the ledger (`ViewPayoutLedger`), `booking` **decides** the
weather refund (`RefundForWeather`, invariant #10), `payment` **executes** it via Stripe (#8,
collect-only, no Connect), `payout` posts the **reversal** off `BookingCancelled` (#9), and `venue`
stores the commission rate that `payout` computed with. The tab consumes the two existing
owner-asserted HTTP adapters over these.

### Module ownership (§4a)

**N/A — no backend behaviour added or moved.** All change is in the Angular `operator/` feature. For
the record, the decision-vs-execution splits the tab must not violate (and doesn't — it only
triggers): the weather-refund **decision** stays in `booking` (never `payout`); the refund
**execution** stays in `payment` (never the client); the payout **reversal math** stays in `payout`
(never `venue` / never the FE). RV-BE-11 has nothing new to check; RV-CT-* checks the FE respects it.

## Payment & payout (invariants #5, #8, #9, #10)

> **Mandatory (money is on screen).** No money moves *through the tab* — but it renders payout money
> and triggers a refund, so the model it must honour is stated here. Loaded `riviera-stripe-payments`.

- **Model:** unchanged — **collect-only via Stripe, no Connect**; venue payout is a **ledger + a
  manual BKT bank transfer** (invariant #9). The statement is the operator's *view* of what is owed,
  not a settlement instrument; the founder settles out-of-app and marks the admin batch.
- **Confirmation / refund trigger:** the weather refund is **server-decided and server-executed** —
  the tab POSTs `?date=` and the server cancels + issues the **full** refund through the existing
  cancellation spine; the actual refund + the `CONFIRMED`/refunded state transitions are reconciled
  from the **signature-verified Stripe webhook** (invariant #8), never from this call's response. The
  tab **never self-confirms, never self-refunds, and reads no payment state** (RV-CT-3).
- **Idempotency:** the weather-refund transition is idempotent server-side (guarded `WHERE
  status='CONFIRMED'` → 0-row no-op on a repeat; #9 exactly-once reversal); the UI disables the
  confirm while in flight (R-7). No idempotency key is the client's job — the server derives it.
- **Money:** every amount (`grossMinor` / `commissionMinor` / `netMinor` / `netOwedMinor` /
  `totalRefundedMinor`) is **integer minor units + ISO currency** on the wire, rendered via
  `formatMoney` (invariant #5). The FE performs **no** money arithmetic — the owed total is the
  server's `netOwedMinor` (R-1); the period-total gross/commission are display-only Σ presentation.
- **Payout-ledger effect:** none is *caused* by the tab beyond triggering the existing weather
  refund, which reverses the accrual exactly once (server-side, #9). The tab **displays** accruals as
  positive net and reversals as negative net; the "owed" figure is the server's running net.
- **Refund policy applied:** the **weather exception** (full refund regardless of cutoff, #10),
  admin-triggered — computed and actioned server-side; the client supplies only `venueId` + `date`.
- **Pinning tests (existing, unchanged):** `WeatherRefundServiceIT`, `WeatherRefundSecurityIT`,
  `PayoutReversalIT`, `ReversalMathTest`. FE side: AC-3/AC-5/AC-6 pin display + trigger.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/payouts-tab.ts` (+ `.html`) | new | standalone console-tab component | signals + `computed` (rows, owed, counts; `selectedDate`, `weatherConfirm`, `statementOpen`, `refunding` state) | none — a native `<input type="date">` + buttons, no form control |
| FE-2 | `operator/operator-console.service.ts` (+ `.spec.ts`) | modify | add `payoutLedger(venueId)` + `weatherRefund(venueId, date)` + `payoutErrorOf` / `weatherRefundErrorOf` mappers | — | — |
| FE-3 | `operator/operator-console.model.ts` | modify | add `PayoutLedgerView`, `PayoutLedgerEntryView`, `PayoutEntryType`, `RefundReasonCode`, `WeatherRefundResult`, `WeatherRefundErrorCode`, `PayoutErrorCode` | — | — |
| FE-4 | `app.routes.ts` | modify | swap `payouts` child from `ConsolePlaceholder` → `PayoutsTab`; drop `payouts` from `CONSOLE_TABS` (only `venue` remains) | — | — |
| FE-5 | `operator/console-placeholder.ts` + `.spec.ts` | modify | drop the `payouts` case (only `venue` remains) + the placeholder spec's payouts test | — | — |
| FE-6 | `app.spec.ts` | modify | assert `payouts` loads `PayoutsTab` (mirroring the O5/O6 tab-graduation assertions); six-tab nav unchanged | — | — |
| FE-7 | `operator/payouts-tab.a11y.spec.ts` / `.contrast.spec.ts` | new | axe + composited-AA (hero, table, modal, amber confirm) | — | — |
| FE-8 | `frontend/e2e/operator-payouts.e2e.ts` | new | CI-safe mocked e2e | — | — |
| FE-9 | `frontend/e2e/real-backend/payouts.e2e.ts` | new (local-only) | real-backend money spec (may be deferred if the suite can't run in-session — see File structure) | — | — |

**Standards:** standalone (no `standalone:true`), no explicit `OnPush`, `inject()`, `@Service()`,
`@if`/`@for`, `class`/`style` bindings (no `ngClass`/`ngStyle`), signals + `computed`, no `as any` on
the contract. `new Date()` captured once at the boundary (`todayBookingDate(new Date())` for the date
default, mirroring `DailyViewTab`), never in the template. Reversal/weather state conveyed by
accessible name + text, not colour alone (WCAG AA). Reads `:venueId` from `route.parent` via
`parentVenueId` (child routes don't inherit it — the O1 finding). Always porcelain (inherited from
the console shell); glass via `CardGlass`/`PanelGlass`. Money via the existing `formatMoney`.

## FE↔BE contract

> **No API shape changes.** The tab consumes two existing owner-asserted endpoints verbatim.

- **Endpoints (existing, unchanged):**
  - `GET /api/venues/{venueId}/payout-ledger` → `PayoutLedgerView`:
    `{ venueId: number, currency: string, netOwedMinor: number, entries: PayoutLedgerEntryView[] }`
    where `PayoutLedgerEntryView = { type: 'ACCRUAL' | 'REVERSAL', bookingId: number, grossMinor:
    number, commissionMinor: number, netMinor: number, currency: string, reason: 'WEATHER' | 'POLICY'
    | 'CONFLICT' | null, createdAt: string /* ISO-8601 UTC */, runningNetMinor: number }`. Entries are
    oldest-first, each with its running net owed; `reason` is `null` on an `ACCRUAL`. **No booking
    code, no guest name, no set label, no service date** — `bookingId` is the only booking handle.
  - `POST /api/venues/{venueId}/weather-refund?date=YYYY-MM-DD` → `WeatherRefundResult`:
    `{ refundedCount: number, totalRefundedMinor: number, currency: string }`. `date` is an ISO
    `LocalDate` (Europe/Tirane civil day, #6); the server **requires** it. CSRF token rides the
    `apiSessionInterceptor` (it's a POST write).
- **Client typing:** hand-written typed methods on `OperatorConsoleService`; the response/error types
  live in `operator-console.model.ts`. RFC-7807 `code` mapped by `payoutErrorOf` / `weatherRefundErrorOf`
  (401 → `UNAUTHORIZED`, 403 → `NOT_VENUE_OWNER`, else `UNKNOWN`). No `as any`.
- **Money/date on the wire:** amounts are **integer minor units + ISO currency** (invariant #5),
  rendered via `formatMoney`; `createdAt` is a UTC instant rendered in `Europe/Tirane`; the weather
  `date` is an ISO `LocalDate`. The tab sends only a `date`; it computes no amounts.

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — service + model: `payoutLedger` / `weatherRefund` + error mapper + types + specs | ✅ | (this commit) — service spec 18/18, operator scope 139/139 green |
| 1 — `PayoutsTab` core: hero (owed) + ledger table + period total + empty/loading/error + unit spec | ✅ | (this commit) — payouts-tab spec 7/7, lint clean |
| 2 — weather-refund action (date picker + amber confirm + re-read) + statement modal + unit spec | ✅ | (this commit) — payouts 14/14 + statement 3/3, operator scope 156/156, lint clean |
| 3 — route swap + placeholder removal + a11y/contrast specs + `app.spec.ts` | ✅ | (this commit) — operator+app scope 184/184, lint + build clean |
| 4 — CI-safe mocked e2e (`operator-payouts.e2e.ts`) + local-only real-backend spec | ✅ | (this commit) — mocked suite 36/36; real-backend spec authored + `--list`-verified (not run in-session, see below) |

Legend: blank = not started, ⏳ = in progress, ✅ = done. Update in the SAME commit window as each phase.

---

## File structure

- `frontend/src/app/operator/payouts-tab.ts` (+ `.html`) — the new Payouts tab (hero, ledger table,
  period total, statement modal, weather-refund confirm).
- `frontend/src/app/operator/payouts-tab.spec.ts` — behaviour (AC-1..9).
- `frontend/src/app/operator/payouts-tab.a11y.spec.ts` — axe + accessible-name.
- `frontend/src/app/operator/payouts-tab.contrast.spec.ts` — composited porcelain AA (hero/table/modal/ambers).
- `frontend/src/app/operator/operator-console.service.ts` (+ `.spec.ts`) — add ledger + weather-refund clients + mappers.
- `frontend/src/app/operator/operator-console.model.ts` — add payout + weather-refund types.
- `frontend/src/app/app.routes.ts` — `payouts` → `PayoutsTab`; drop `payouts` from `CONSOLE_TABS`.
- `frontend/src/app/operator/console-placeholder.ts` + `.spec.ts` — drop the `payouts` case + its test.
- `frontend/src/app/app.spec.ts` — assert `payouts` loads `PayoutsTab`.
- `frontend/e2e/operator-payouts.e2e.ts` — CI-safe mocked e2e.
- `frontend/e2e/real-backend/payouts.e2e.ts` — local-only real-backend money spec. **Authored**; the
  real-backend suite is **never in CI** and may not be runnable in this session (needs a live backend
  + seeded ledger/confirmed booking) — if it can't be exercised locally, mark it deferred with the
  same rationale O6 used, and the CI-safe mocked spec is the verified FE coverage.

---

## Phase 0 — Ledger + weather-refund client + types (no UI)

**Files:** Modify `operator/operator-console.model.ts`, `operator/operator-console.service.ts` · Test
`operator/operator-console.service.spec.ts`.

- [ ] **Step 1 (red):** extend `operator-console.service.spec.ts` — `payoutLedger(venueId)` GETs
  `/api/venues/{id}/payout-ledger` and returns the typed `PayoutLedgerView`; `weatherRefund(venueId,
  date)` POSTs `/api/venues/{id}/weather-refund` with the `date` query param and returns
  `WeatherRefundResult`; `payoutErrorOf` / `weatherRefundErrorOf` map 403→`NOT_VENUE_OWNER`,
  401→`UNAUTHORIZED`, else→`UNKNOWN`.
- [ ] **Step 2:** run `operator-console.service.spec.ts` → FAIL (methods absent).
- [ ] **Step 3 (green):** add the types to `operator-console.model.ts` (`PayoutLedgerView`,
  `PayoutLedgerEntryView`, `PayoutEntryType`, `RefundReasonCode`, `WeatherRefundResult`,
  `WeatherRefundErrorCode`, `PayoutErrorCode`); add the two methods + the two mappers to
  `OperatorConsoleService` (mirroring the existing `HttpParams`/error-mapper idioms).
- [ ] **Step 4:** run `operator-console.service.spec.ts` → PASS. Broaden: `npm test -- operator` scope.
- [ ] **Step 5:** generalization pass — the 403/401 error-mapper shape repeats across mappers; keep
  the per-endpoint mapper (established pattern) unless a shared helper is clearly warranted → log.
- [ ] **Step 6–7:** commit `[phase 0]`; update the execution table in the same window.

## Phase 1 — PayoutsTab core (hero + ledger + period total)

**Files:** Create `operator/payouts-tab.ts` (+ `.html`), `operator/payouts-tab.spec.ts`.

- [ ] **Step 1 (red):** `payouts-tab.spec.ts` — AC-1 (rows from minor units, `#<bookingId>` ref, no
  code/guest), AC-2 (reversal negative + reason chip), AC-3 (hero + period-total owed == server
  `netOwedMinor`; accrual/reversal counts), AC-9 (empty / load-error / loading), AC-7 (403/401 on the
  ledger read → copy + `sessionLost`).
- [ ] **Step 2:** run `payouts-tab.spec.ts` → FAIL.
- [ ] **Step 3 (green):** build `PayoutsTab` — read `:venueId` via `parentVenueId`; load
  `payoutLedger`; `computed` rows (dateLabel from `createdAt`, `ref = '#'+bookingId`, gross/commission/
  net via `formatMoney`, `isReversal`, `reasonLabel`); hero owed = `netOwedMinor` via `formatMoney`;
  accrual/reversal counts; loading/error/empty states; the ledger table + period-total row. Best-effort
  venue name via `VenueService` for the statement (Phase 2). Surfaces via `CardGlass`/`PanelGlass`.
- [ ] **Step 4:** `payouts-tab.spec.ts` → PASS. Broaden: `npm test -- operator` scope.
- [ ] **Step 5:** generalization pass (money-view mapping `{minorUnits, currency}` from flat `*Minor`
  + `currency`) → log; reuse `formatMoney`, don't re-derive.
- [ ] **Step 6–7:** commit `[phase 1]`; update table.

## Phase 2 — Weather-refund action + statement modal

**Files:** Modify `operator/payouts-tab.ts` (+ `.html`), `operator/payouts-tab.spec.ts`.

- [ ] **Step 1 (red):** extend `payouts-tab.spec.ts` — AC-5 (a `<input type="date">` default = today
  Europe/Tirane; triggering the weather refund shows the amber confirm with whole-day copy naming the
  date; "Issue full weather refund" calls `weatherRefund(venueId, date)`; "Cancel" makes no call),
  AC-6 (success → notice from `{refundedCount, totalRefundedMinor}` + ledger re-read; `refundedCount`
  0 → no-op notice), AC-7 (403/401 on the refund → copy + `sessionLost`), AC-4 (statement modal opens
  with the same entries + total due == `netOwedMinor` + "assigned at settlement" IBAN/reference; Close
  dismisses).
- [ ] **Step 2:** run `payouts-tab.spec.ts` → FAIL where new.
- [ ] **Step 3 (green):** add `selectedDate` (signal, `onDateChange` like `DailyViewTab`),
  `weatherConfirm` state (two-step, disable while `refunding`), the weather-refund handler (POST →
  notice from the response → re-read the ledger for the reversal), and the `statementOpen` modal
  (display-only; venue name best-effort, ledger `currency`, IBAN/reference placeholder).
- [ ] **Step 4:** `payouts-tab.spec.ts` → PASS. Broaden: `npm test -- operator` scope.
- [ ] **Step 5:** generalization pass (the date-picker + reset idiom vs `DailyViewTab.onDateChange`;
  reuse `todayBookingDate`/`formatCivilDate`, don't re-inline) → log.
- [ ] **Step 6–7:** commit `[phase 2]`; update table.

## Phase 3 — Route swap, placeholder removal, a11y/contrast

**Files:** Create `operator/payouts-tab.a11y.spec.ts`, `.contrast.spec.ts` · Modify `app.routes.ts`,
`operator/console-placeholder.ts` (+ `.spec.ts`), `app.spec.ts`.

- [ ] **Step 1 (red):** a11y + contrast specs (hero, table, statement modal, amber confirm, empty);
  `app.spec.ts` "payouts loads PayoutsTab"; remove the placeholder spec's payouts test (venue case
  stays); run → FAIL where new.
- [ ] **Step 2 (green):** swap the `payouts` route to `PayoutsTab` + drop it from `CONSOLE_TABS`;
  remove the placeholder `payouts` case (only `venue` remains — update the interface doc-comment too).
- [ ] **Step 3:** `operator` scope specs + `app.spec.ts` + `console-placeholder.spec.ts` → PASS
  (six-tab nav unchanged; only `venue` placeholder remains).
- [ ] **Step 4:** `npm run lint` + `npm run build` clean.
- [ ] **Step 5:** generalization pass → log if any.
- [ ] **Step 6–7:** commit `[phase 3]`; update table.

## Phase 4 — CI-safe mocked e2e (+ real-backend)

**Files:** Create `frontend/e2e/operator-payouts.e2e.ts` (+ `real-backend/payouts.e2e.ts`).

- [ ] **Step 1:** author `operator-payouts.e2e.ts` — `page.route` a ledger (accruals + a negative
  reversal) + a `weather-refund` POST that flips the mocked ledger to include a fresh reversal; drive
  sign-in → Payouts → assert rows + owed + no code text → open/close statement → pick a date + confirm
  weather refund → reversal appears on re-read → an owner-copy (403) path; `expectNoSeriousAxeViolations`
  after each stage (awaiting `getAnimations().finished` on the animated modal first).
- [ ] **Step 2:** `npm run test:e2e:a11y` (the CI mocked suite) green incl. the new spec.
- [ ] **Step 3:** author `real-backend/payouts.e2e.ts` (seeded venue with a confirmed booking →
  ledger shows the accrual → weather refund the date → reversal appears). Run **iff** the real-backend
  suite is exercisable in-session; else mark deferred (O6 rationale) — the mocked spec is the verified
  coverage.
- [ ] **Step 4:** full pre-PR gate (see verification); commit `[phase 4]`; update table.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-07-11 | Phase 0 (two endpoints, identical error surface) | per-endpoint error mappers on `OperatorConsoleService` (`markErrorOf`/`releaseErrorOf`/`requestErrorOf`/`repriceErrorOf`/`layoutErrorOf`) | read `operator-console.service.ts` | ledger read + weather refund both fail only 403 `NOT_VENUE_OWNER` / 401 / else | Collapsed to **one** `payoutErrorOf` + one `PayoutErrorCode` for both (vs the plan's two mappers) — the surfaces are identical, so two would be Sonar-duplication. Plan updated to note the single mapper. |
| 2026-07-11 | Phase 2 (a11y lint on the inline modal backdrop) | template modals with a backdrop `(click)` | `ng lint` (`click-events-have-key-events` / `interactive-supports-focus`) | `BookingDialog`, `FindBooking` use a host-backdrop + `trapFocusWithin` component pattern | Extracted the statement into `PayoutStatement` (host backdrop = click/ESC dismiss, `role=dialog`, shared focus trap) instead of an eslint-disable — matches the two shipped modals; `LedgerRow` moved to the model to avoid an import cycle. |

---

## Acceptance-criteria verification (final)

> The gate before claiming done.

- [x] **AC-1..9:** `payouts-tab.spec.ts` (14) passes — ledger rows from minor units + `#bookingId`
  ref, reversal negative + reason chip, owed == server `netOwedMinor`, statement modal open/close +
  placeholder, per-date weather confirm + outcome + ledger re-read + zero no-op, 403/401 copy, no
  code/guest, empty/loading/error. `payout-statement.spec.ts` (3) covers the modal in isolation.
- [x] **AC-2 (service):** `operator-console.service.spec.ts` (18) passes — ledger GET, weather POST
  with the `date` query param, `payoutErrorOf` (403/401/else).
- [x] **AC-10:** `app.spec.ts` graduation test passes (`payouts` `loadComponent` → `PayoutsTab`);
  `console-placeholder.spec.ts` has only the venue case; `CONSOLE_TABS` = `[venue]`.
- [x] **AC-11:** `payouts-tab.a11y.spec.ts` (4, axe over ledger / weather-confirm / statement / empty)
  + `.contrast.spec.ts` (9, incl. `#a3372a` reversal, its `@0.12` chip tint, white on `#9a6410`) pass.
- [x] **AC-12:** full mocked suite `npm run test:e2e:a11y` **36/36** green incl. the 2
  `operator-payouts.e2e.ts` specs (happy path + 403 owner copy), axe-clean at each stage.
- [x] Full gate before PR: `npm run lint` **clean** · `npm test` **624/625** (the 1 failure is the
  pre-existing `booking.service.spec.ts` localStorage-isolation flake — **byte-identical to
  `origin/main`**, zero booking/ files touched by O7; documented by O6) · `npm run build` **clean**
  (only pre-existing SCSS-budget warnings) · `npm run test:e2e:a11y` **36/36**.
- [~] **Real-backend spec** (`e2e/real-backend/payouts.e2e.ts`): **authored + `--list`-verified**,
  **not executed in this session** — the real-backend suite needs the Spring `webServer` + Postgres,
  not exercised locally here. Its coverage boundary is honest: a payout accrual needs a CONFIRMED
  (webhook-verified, #8) booking the UI suite can't drive, so it proves the wired, owner-asserted
  empty-ledger read + no-op weather refund; the money math is pinned by backend ITs and the populated
  UI by the mocked spec. Run it when the real-backend suite is next exercised (O6 deferral precedent).

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test (AC-1..12 → the specs above).
- [x] No placeholders / TODO / TBD anywhere in the doc or the code.
- [x] **No JPA / no backend** introduced — frontend-only (invariant #1 unaffected; no migration; the
  diff is 15 files, all under `frontend/` + the plan doc).
- [x] Availability section: no new write path; the weather refund drives the existing server release
  (invariant #2 unchanged); cutoff/pool (#3/#4) untouched.
- [x] Modulith / Module-ownership sections justified N/A; decision-vs-execution split respected — the
  tab **triggers**, `booking` decides (#10), `payment` executes (#8), `payout` reverses (#9).
- [x] Payment/payout section filled: **collect-only, no Connect**; weather refund server-decided +
  server-executed; the tab never self-confirms/self-refunds (RV-CT-3); money in **minor units**,
  owed = server `netOwedMinor` (no FE money math, #5/#9 — pinned by the "owed = server figure" AC-3).
- [x] Booking codes **absent** (invariant #7) — no code binding; the reference is `#<bookingId>`; no
  guest name (need-to-know #11); asserted by unit (`no code/guest`) + e2e (`code` count 0).
- [x] Owner-assert preserved: `/api/venues/{venueId}/**` server check unchanged (invariant #13); 403
  `NOT_VENUE_OWNER` + 401 copy mapped (ledger read + weather refund), pinned by unit + e2e.
- [x] Timezone: `createdAt` UTC rendered in `Europe/Tirane` (`ledgerDateLabel`); the weather `date` an
  ISO `LocalDate` defaulting to today Europe/Tirane (`todayBookingDate`) (#6).
- [x] Frontend standards met; no `as any`; `PayoutsTab` placed as a console child route + the modal
  extracted to `PayoutStatement` (host-backdrop + shared focus trap) per `riviera-frontend`; surfaces
  via `CardGlass` (no `@apply`); contrast proven by maths (`.contrast.spec.ts`).
- [x] Route swap complete: `payouts` → `PayoutsTab`; placeholder `payouts` case + test removed; only
  `venue` remains a placeholder; six-tab nav unchanged (`app.spec.ts`).
- [x] Execution-status table at HEAD matches reality; Open Questions empty.

All boxes checked. The one full-suite unit failure is the pre-existing `booking.service.spec.ts` flake
(byte-identical to `origin/main`, no O7 files involved) — not a gap in this slice.

## Review gate — self-review (pre-PR, riviera-review-overlay, frontend scope)

Frontend-only diff, no wire-shape change → the RV-FE bank + the money/BOLA items. Walked; **no findings**.
- **RV-BE-9 / #13 (Blocker):** no backend change; the server owner-asserts the ledger read
  (`PayoutLedgerQueryService.assertOwns`) and the weather refund (`WeatherRefundService.assertOwns`),
  both pinned by `CrossVenueDenialIT` / `WeatherRefundSecurityIT` (unchanged). The tab maps 403
  `NOT_VENUE_OWNER` → copy on both surfaces (unit + e2e). Held.
- **RV-CT-3 / #8:** the tab triggers the weather refund and reads only the count/total; it never
  self-confirms or self-refunds — the refund is executed server-side via the Stripe webhook path. Held.
- **RV-FE-3 / #5, #9:** money renders from integer minor units via `formatMoney`; the owed figure is
  the server's `netOwedMinor`, never a client sum (AC-3 asserts it even when a naive Σ would differ);
  the period gross/commission are display-only presentation. Held.
- **#7 / #11:** no booking code and no guest identity render — the read exposes neither and the model
  carries only `bookingId`; the "Booking" cell is the non-credential `#<bookingId>` reference. Held.
- **RV-FE-1/7:** standalone, `inject()`, `@if`/`@for`, signals + `computed`, `class`/`style` bindings
  (no `ngClass`/`ngStyle`/`as any`/obsolete decorators — lint-clean); the modal is an accessible
  `role=dialog` with a focus trap; AA deviations (`#9a6410` for the amber, console teal/red inks)
  documented in the contrast spec (pure maths).
- **RV-FE-E2E:** CI-safe mocked spec in `frontend/e2e/` (role/test-id locators, per-test `page.route`,
  `expectNoSeriousAxeViolations`); the local-only real-backend spec placed in `frontend/e2e/real-backend/`.
- **RV-PROC-1:** the *Skills consulted* line covers every touched area (FE structure / Angular / Tailwind
  / payments / e2e); **no backend skills** loaded because no backend was touched (grill-proven).

The formal peer review + Sonar gate run on the PR (Sonar analyzes PRs + `main`); pre-PR local gates green.

## Sonar gate (PR #221)

CI all green (Backend, Frontend, CodeQL ×2, SonarCloud). The Sonar **quality gate passed**, but the
reported list was **not** empty — pulled from the API (not the gate conclusion): **1 new code smell**,
`typescript:S1301` at `console-placeholder.ts:47` ("replace this single-case `switch` by `if`"),
introduced by removing the `payouts` case (the switch was left with one case + default). Metrics:
new bugs 0 · new vulns 0 · new code smells 1 · new duplicated blocks 0 · duplicated density 0.0% ·
**new-code coverage 88.46%** (≥80). Fixed test-first (re-entry at Implement, frontend): refactored
`describeTab` to an `if` (behavior identical) + added a fallback-branch test; lint + placeholder spec
green. Re-checked CI + Sonar after the fix push. **No deferred findings.**

## Merge close-out

- **Merged** as squash PR #221 → `main` `c2dfc27` (user-authorized). #173 auto-closed (`completed`).
- **Epic #141 checklist ticked** — O7 #173 (#221 · c2dfc27), noted frontend-only; O8 (#177) remains.
- **CI (final):** Backend + Frontend (lint/test/build) + CodeQL ×2 all green. **Sonar gate green with the
  reported list cleared:** the first pass flagged 1 new code smell (`typescript:S1301`, single-case
  switch in `console-placeholder.ts`) which the green gate hid — fixed test-first, re-run reported
  **0 issues** (0 bugs/vulns/smells, 0 duplicated blocks) and **88.59% new-code coverage**.
- **Deferred findings:** none (review gate + Sonar both clean).
- **Docs-freshness (step 5)** over `94ee3d7..c2dfc27`: **1 finding, patched** — `CLAUDE.md:22–24`
  (epic-#141 status: "O6 … merged, O7–O8 remain" → **"… + O7 payouts tab … merged, O8 remains"**).
  `CONTEXT.md` / `RESPONSIBILITIES.md` / `docs/adr` / the `riviera-*` skills clean — O7 added no backend
  module/port/event/endpoint and renamed no substrate-cited identifier. Then `graphify update .` for the
  doc edits.
