# Cancelled-Booking Explanation Panel Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A guest opening `/booking/{code}` for a `CANCELLED` booking is told what happened
and whether money moved — distinguishing a never-charged release (abandoned-payment sweep /
`payment_intent.canceled`) from their own policy cancellation from a venue weather refund.

**Architecture:** The read model already knows the answer, it just never left the server:
`booking.cancel_reason` (V14: `POLICY`/`WEATHER`/`CONFLICT`) is written by `cancelConfirmed`
and left `NULL` by `cancelAwaitingPayment`. The single significant decision is to **carry that
existing column onto the code-gated view** rather than have the client guess from
`refundedAmount` alone — because guessing cannot separate a weather refund from a guest's own
cancellation, and telling a guest "you cancelled this" about a storm the venue called is the one
sentence that is actively wrong. Precedent is already in the repo: `BookingCancellationMail`
carries `RefundReason` for exactly this purpose ("a weather cancellation is one they never asked
for") — the in-app view should not be less informative than the email it accompanies.

**Persistence:** JDBC only (invariant #1). **No migration** — `booking.cancel_reason` exists
since `V14__cancellation_reason.sql`. Two `SELECT` lists gain the column; no DDL, no new index
(both reads are single-row/`account_id`-indexed and already select from `booking`).

**Source of intent:** GitHub issue #578 (found by the review gate on PR #577).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that this
is **not** frontend-only as labelled, and surfaced the "Paid €45.00" mislabel the issue never
mentioned) · `riviera-plan-doc` (this template — forced the Behavior-parity ledger, which is what
turned the legacy pre-V14 row into AC-6 instead of a production surprise) · `tdd` (each phase is
red→green: spec first, then the branch) · `riviera-review-overlay` (review gate — run at
ready-for-review) · `riviera-docs-freshness` (**ran** at close-out over the PR's merge range —
see Execution status) · `riviera-modulith` (confirmed the whole change is intra-`booking`: the
view record, its adapter DTO and the JDBC read are one module, so no new grant, no `api`/`spi`
question — and `RefundReason` is already `booking::vocabulary`) · `riviera-java-conventions`
(records for the DTO, the `Optional`-free nullable-field idiom the sibling fields already use,
text-block SQL, no magic strings) · `postgres` (verified the two `SELECT`s and the shared row
mapper; no index or DDL is warranted for an already-projected table) · `riviera-frontend`
(the panel stays inside `booking/`; the `CancelReason` union goes in `booking.model.ts`, not
`shared/`, because only this feature reads it — whereas the F-3 label rule *is* shared vocabulary,
so `amountLabelFor` sits in `shared/booking-status.ts` beside the `STATUS_META` it refines) · `riviera-tailwind` (reused the existing `BANNER`
recipe rather than `@apply`; at F-12 collapsed the cancelled/expired pair into one shared
`BANNER_NEUTRAL` so the two neutral banners cannot drift) ·
`angular-developer` + angular-cli MCP (v22 `@switch`/`@case` + signal idioms, a11y of the new
`aria-labelledby` region) · `playwright-cli` (the mocked-suite e2e spec) · `riviera-local-debug`
(scoped `--tests "*ViewBookingServiceTest*"` + Vitest-only runs; CI owns the full suite).

**Branch:** `claude/sdlc-578-8j01xy` — the **cloud-session designated branch stands in for
`bugfix/cancelled-booking-explanation`** (riviera-sdlc § Remote/cloud addendum). The literal
`bugfix/…` branch is deliberately not created.

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a booking cancelled by the abandoned-payment sweep (`CANCELLED`,
  `refundedAmount: null`), when the guest opens `/booking/{code}`, then a panel states the
  booking was cancelled because payment was not completed **and that no payment was taken**.
  *Pinned by:* `booking-view.spec.ts › explains a CANCELLED booking that was never charged`
- [x] **AC-2:** Given a booking cancelled under the policy with a refund
  (`cancelReason: 'POLICY'`, `refundedAmount > 0`), when the guest opens the view, then the
  panel attributes the cancellation to the guest and states the refunded amount.
  *Pinned by:* `booking-view.spec.ts › explains a POLICY cancellation with a refund`
- [x] **AC-3:** Given a booking cancelled under the policy after the cutoff
  (`cancelReason: 'POLICY'`, `refundedAmount.minorUnits === 0`), when the guest opens the view,
  then the panel states the cancellation was non-refundable — and **no** "Refunded" detail row
  renders (the existing `> 0` guard).
  *Pinned by:* `booking-view.spec.ts › explains a non-refundable POLICY cancellation`
- [x] **AC-4:** Given a venue weather refund (`cancelReason: 'WEATHER'`, `refundedAmount > 0`),
  when the guest opens the view, then the panel attributes the cancellation to the **venue**
  (never the guest) and states the full refund.
  *Pinned by:* `booking-view.spec.ts › attributes a WEATHER cancellation to the venue`
- [x] **AC-5:** Given a `CANCELLED` booking with `refundedAmount: null`, when the view renders
  the amount row, then its label reads `Amount`, **not** `Paid`.
  *Pinned by:* `booking-view.spec.ts › labels a never-charged cancellation Amount, not Paid`
- [x] **AC-6:** Given a `CANCELLED` booking with a refund but an unknown/absent reason (a
  pre-V14 row, or a future `CONFLICT`), when the guest opens the view, then the panel renders the
  neutral refunded copy and attributes the cancellation to nobody — it never throws and never
  falls through to an empty panel.
  *Pinned by:* `booking-view.spec.ts › falls back to neutral copy for an unknown cancel reason`
- [x] **AC-7:** Given a cancelled booking row whose `cancel_reason` is `WEATHER`, when the view
  use case assembles the detail, then `BookingDetail.cancelReason()` is `RefundReason.WEATHER`;
  and given a swept row whose `cancel_reason` is `NULL`, then it is `null`.
  *Pinned by:* `ViewBookingServiceTest.carriesTheCancellationReason` /
  `.reportsNoReasonForANeverChargedCancellation`
- [x] **AC-8:** Given the booking row persisted with `cancel_reason = 'POLICY'`, when the view use
  case reads it back, then `BookingDetail.cancelReason()` round-trips the enum; and given a row
  cancelled without a refund decision, then it reads back `null`. Pinned through `ViewBooking`
  rather than `Bookings#findByCode` — it covers the same `SELECT` + mapper step **plus** the detail
  assembly, and a column stamped but never projected is indistinguishable from a null one.
  *Pinned by:* `CancelBookingIT.cancellationReasonRoundTripsOntoTheBookingDetail` /
  `.aBookingThatWasNeverPaidHasNoCancellationReason`
- [x] **AC-9:** Given the mocked e2e suite serves a `CANCELLED`/never-charged detail, when the
  page loads, then the explanation panel is visible, **no `Paid` label renders**, and the page has
  no serious axe violations; the weather case is covered as a second spec because attribution is
  the finding a jsdom text assertion is weakest at.
  *Pinned by:* `frontend/e2e/booking-flow.e2e.ts › a swept booking explains itself and never claims
  the guest paid` / `› a weather-refunded booking is attributed to the venue`

## Non-goals

- ~~**The "My bookings" list**~~ — **retracted at the review gate (F-3).** The premise was that
  `MyBookingSummary` cannot make the distinction. True of the account-list path, but `buildView`
  also serves the per-code path, which already held a full `BookingDetail` — so the list contradicted
  the view on the same booking. `refundedAmount` is now on the list read model end-to-end and the
  label rule is single-sourced in `shared/booking-status.ts#amountLabelFor`. Still out of scope: the
  **cancellation reason** on list rows (the list states no reason, so it needs none).
- **Changing `STATUS_META.CANCELLED.amount`** itself. The map stays a pure status→label lookup;
  the refinement lives beside it in `amountLabelFor`, which callers holding the refund fact use.
- **Distinguishing the sweep from the `payment_intent.canceled` webhook.** Both mean the same
  thing to a guest — payment was never completed, nothing was taken — and both leave
  `cancel_reason NULL`. Separating them would need a new persisted fact for no guest-visible gain.
- **Backfilling `cancel_reason` for pre-V14 rows.** Handled by the AC-6 fallback, not by DDL.
- **Any new mail.** The sweep deliberately publishes no event (`cancelAwaitingPayment` is a bare
  status flip); giving it one is a `notification` slice, not this one.
- **`CONFLICT` copy.** Reserved and never written in v1; it takes the AC-6 neutral branch.

## Behavior-parity ledger (retirement / replacement slices only)

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `@switch (b.status)` renders **no** branch for `CANCELLED` (falls through to bare chip + rows) | changed → **a branch now renders** | new `@case ('CANCELLED')` panel; every other `@case` is untouched |
| "Refunded" detail row renders only when `refundedAmount.minorUnits > 0` | preserved | guard unchanged; AC-3 asserts a zero refund still renders no row |
| `cancel-result` live region announces the just-issued cancellation (`role="status"`) | preserved | untouched — it serves the *in-session* cancel; the new panel serves the *arriving* guest. Both can show at once by design (AC-2 asserts the panel, not the absence of the region) |
| Amount row label comes from `metaFor(status).amount` → `Paid` for `CANCELLED` | changed | detail view now refines it with `refundedAmount`; `STATUS_META` and the list are untouched (Non-goals) |
| `GET /api/bookings/{code}` response shape | changed (additive only) | one new nullable `cancelReason` field; every existing field byte-identical |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Copy attributes a **weather** cancellation to the guest ("you cancelled this") — the exact wrong sentence this slice exists to prevent | med | high | `WEATHER` is branched **before** the generic refunded branch; AC-4 pins the attribution wording | claude | open |
| R-2 | A pre-V14 cancelled row (refund set, `cancel_reason NULL`) hits an unhandled branch and renders an empty panel | low | med | Branch order ends in a neutral `@else`, never an exhaustive assumption; AC-6 pins it | claude | open |
| R-3 | Adding a column to the shared `mapBookingRecord` breaks `findByAccountId` (My bookings) — both reads share the mapper | med | med | Both `SELECT` lists updated in the same commit; `MyBookingsServiceTest` + the my-bookings e2e run in phase 1's scope | claude | open |
| R-4 | Exposing a cancellation reason on a code-gated view leaks something (D-8 oracle shape) | low | med | The field is about the holder's **own** booking, requires the bearer code (invariant #7), and is `NULL` until the booking is terminal — it answers nothing about any address or any other booking. No `CollectionGuarantee`-style gate needed; contrast `emailWithheld`, which is gated precisely because it is answerable *pre*-payment | claude | open |
| R-5 | `cancelReason` on the wire drifts from the SQL `CHECK` token set | low | low | The wire carries `RefundReason.name()`, already kept in lockstep with V14 by its own Javadoc; the FE union mirrors it and falls back rather than throwing (AC-6) | claude | open |
| R-6 | Money rendered from a non-integer / recomputed client value (invariant #5) | low | high | The panel renders `formatMoney(b.refundedAmount)` — the server's minor units, never arithmetic | claude | open |

## Open questions / Assumptions

- **Assumption:** A guest arriving at a swept booking wants "payment wasn't completed, you were
  not charged" rather than a precise cause. Grounded in the sweep having no other guest channel
  at all (it publishes no event → no mail). — *Owner:* claude · *Resolves by:* phase 2 review

### Resolved

- **Open question (from #578, "settle at planning"):** does a *reason* need to ride the wire to
  separate a sweep cancellation from a failed payment? — **Resolved: yes to the wire, no to that
  particular split.** The sweep and the failed-payment webhook are indistinguishable *and
  equivalent* to a guest (both never-charged, both `cancel_reason NULL`), so nothing new is
  persisted for them. The reason ships because of the split the issue did not name: **POLICY vs
  WEATHER**, which `refundedAmount` alone cannot separate and which the cancellation *email*
  already tells the guest. Confirmed with the user via `AskUserQuestion` before phase 0.

## Availability & concurrency (invariant #2)

`N/A — read-only slice; no write path to `availability(set_id, booking_date)` is added, changed,
or removed.` The two writers that produce a `CANCELLED` booking (`CancelBookingService` →
`AvailabilityClaim#release`, and `ReleaseAbandonedBooking` → the guarded
`cancelAwaitingPayment` + release) are **untouched**: this slice only *reads* the reason those
paths already persist. No new query participates in a transaction that holds a claim.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `booking` | existing | `Booking` | The cancellation reason is `booking`'s own persisted audit fact (V14), read by `booking`'s own view use case and rendered by `booking`'s own `adapter/in` DTO. Entirely intra-module. |

**Cross-module named interfaces (`api/` ports)**

`N/A — no new or changed cross-module port.` `RefundReason` already lives in
`booking.vocabulary` (published for `payout`'s reversal stamp and `notification`'s mail); this
slice adds no consumer of it outside `booking`, and adds no `allowedDependencies` grant.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event published, subscribed, moved, or renamed.` No Event Publication Registry
`event_type` rewrite is due.

### Module ownership (§4a)

All in `booking`, no boundary change. `booking`'s **Job** covers "bookings, booking codes,
lifecycle … cancellation-policy enforcement" and it already owns `cancel_reason` as the audit of
that decision; no other module's **Not My Job** list claims it (`payment`'s explicitly pushes the
refund *decision* back to `booking`, which is the same direction). The FE mirror stays in the
`booking/` feature folder for the same reason.

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no money moves.` This slice is a read-only projection of decisions already taken and
already actioned. It neither computes nor re-computes a refund: `refundedAmount` and
`cancelReason` are both server-persisted facts (invariant #10 keeps the decision server-side),
rendered as integer minor units via the shared `formatMoney` (invariant #5). No Stripe call, no
ledger row, no webhook path is touched — so #8/#9 are unaffected.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` | existing | standalone component | signals (existing `booking()`); new pure template branch + one `protected` helper | none |
| FE-2 | `booking/booking.model.ts` | existing | typed contract | — | none |

**Standards:** standalone components, `inject()`, `@if`/`@switch`, no `ngClass`/`ngStyle`,
Tailwind-only styling via the module-local `CLS` map (no `@apply`), status conveyed in **text**
not colour alone (WCAG AA), the new panel gets `aria-labelledby` matching its siblings. The
existing `request-state-title` id is **reused** by the new panel — it is a `@switch`, so at most
one branch renders and the id can never duplicate.

## FE↔BE contract

- **Changed endpoint:** `GET /api/bookings/{code}` — **additive only**. One new field
  `cancelReason: 'POLICY' | 'WEATHER' | 'CONFLICT' | null`, `null` for every non-cancelled
  booking and for a never-charged cancellation. No field is removed, renamed, or retyped, so an
  older FE build ignores it and keeps working.
- **Client typing:** hand-written typed `BookingDetail` interface plus a `CancelReason` union in
  `booking/booking.model.ts`; never `as any`. The renderer tolerates an unknown token (AC-6),
  matching the `metaFor` posture for FE/BE skew.
- **Money/date on the wire:** unchanged — integer minor units + ISO currency, ISO `LocalDate`.

## Execution status

**Stage pointer:** `review gate — findings fixed, re-review + sonar gate due`

**Next action:** Re-walk the overlay bank items over the fix diff, then pull the Sonar new-issue list for the final push.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Carry `cancel_reason` to the view use case (AC-7, AC-8) | ✅ | `<phase-0>` |
| 1 — Expose `cancelReason` on the wire + FE contract | ✅ | `<phase-1>` |
| 2 — The `CANCELLED` panel + amount-label fix (AC-1…AC-6) | ✅ | `<phase-2>` |
| 3 — e2e + a11y coverage (AC-9) | ✅ | `<phase-3>` |
| 4 — Review-gate findings (F-3…F-14) | ✅ | `<review>` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (`Repo hygiene (diff-scoped)`, run 31297913413) | The File-structure section omitted `WithdrawRequestServiceTest.java` — a construction site the generalization audit fixed, i.e. exactly the "not the interesting file" shape #533 exists to catch | fixed-in-`<phase-1>` |
| F-2 | CI (`Repo hygiene (diff-scoped)`, run 31298017413) | Same check, same class, one phase later: the four `BookingDetail` fixture specs widened by the new field were unlisted. Root cause was **when** the guard ran, not whether — it was run mid-phase, before the edits it would have caught. Guard now runs immediately before every push (Phase 2 step 4 amended) | fixed-in-`<phase-2>` |
| F-3 | review (`/code-review`, high) | **The list still said "Paid".** The AC-5 fix landed only in the detail view, but `buildView` serves *both* the account rows and the per-code rows of one list, and the per-code path already had the full `BookingDetail` — so the same swept booking read "Amount" in the view and "Paid €45.00" in the list. The Non-goal's premise (the list has no such data) held for one of the two call sites only | fixed-in-`<review>` — `refundedAmount` added to the list read model end-to-end, and the rule single-sourced as `shared/booking-status.ts#amountLabelFor` so both surfaces answer identically. An existing spec pinned `['CANCELLED', {}, 'Paid']` — the wrong behaviour — and was corrected |
| F-4 | review (`/code-review`, high) | The one expression putting `cancelReason` on the wire had no test at any layer; `BookingViewIT` (which asserts its siblings via `jsonPath`) was untouched, so mis-wiring it would ship a permanently-null reason and silently lose every weather attribution | fixed-in-`<review>` — `BookingViewIT.viewCarriesTheCancellationReasonOfAWeatherRefund` + a `doesNotExist` assertion on the live-booking case |
| F-5 | review (`/code-review`, high) | The `WEATHER` branch rendered the refund sentence unguarded while its sibling guarded on `minorUnits > 0`, so a zero-amount weather refund would read "€0.00 is on its way back to your card" | fixed-in-`<review>` — branch restructured so the guard is shared; pinned by an `it.each` over all three reasons |
| F-6 | review (`/code-review`, high) | "on its way back to your card" asserts a refund is in flight when the transfer can still be sitting in the refund outbox (#454) | **declined, with rationale.** The claim is the *decision*, which is exactly what the read model holds, and it is the repo's settled phrasing for it: `refundSentence` already says "will be refunded", and `BookingCancellationMail`'s contract states the copy must say the refund is on its way and never that it arrived, because "a 'your refund has settled' mail would need a fact no event carries today". Fixing F-7 made the panel *reuse* `refundSentence`, so it now makes the same claim as the surface beside it rather than a new one. A settlement-aware surface needs a fact to exist first — out of scope here |
| F-7 | review (`/code-review`, high) | After an in-session cancel the new panel and the pre-existing `cancel-result` live region stated the same refund in two different wordings (a11y: duplicated prose) | fixed-in-`<review>` — the panel now calls `refundSentence`, so there is one sentence with one author |
| F-8 | review (`/code-review`, high) | `'No refund applies under the cancellation policy.'` was duplicated verbatim between the template and `refundSentence` | fixed-in-`<review>` — same fix as F-7 |
| F-9 | review (`/code-review`, high) | `givenCancelledBooking` stubbed `collection.provenBeforeConfirmation()`, which a `CANCELLED` record can never reach — a dead stub reading as if the D-8 gate were exercised | fixed-in-`<review>` — stub dropped; the helper now also ties `cancelledAt` to the refund decision, so it can only build states production can produce |
| F-10 | review (`/code-review`, high) | `RefundReason.valueOf` in the **shared** row mapper: a fourth V14 token landing ahead of the enum would throw out of every row of `GET /api/me/bookings`, not just the one view that reads it — the backend taking the intolerant posture on the wider blast radius while R-5 gave the FE the tolerant one | fixed-in-`<review>` — `refundReasonOf` logs and degrades an unknown token to `null`, matching the FE posture and the `metaFor` precedent |
| F-11 | review (`/code-review`, high) | The never-charged IT hand-`UPDATE`d `CONFIRMED → CANCELLED`, a state production cannot produce (no `cancelled_at`, availability claim stranded) in a class whose siblings count availability rows | fixed-in-`<review>` — reworked to assert the null branch on a live booking, which needs no fake state; the real release path needs an `AWAITING_PAYMENT` row this stub-profile class cannot create |
| F-12 | review (`/code-review`, high) | `bannerCancelled`/`eyebrowCancelled` were byte-identical to their `expired` twins, so the added contrast row could never fail independently and a palette change had to be made twice | fixed-in-`<review>` — one `BANNER_NEUTRAL`/`EYEBROW_NEUTRAL` recipe shared by both |
| F-13 | review (`/code-review`, high) | The widened `BookingRecord` Javadoc said the three cancellation fields are null "until the booking is cancelled" and then corrected only `cancelReason`, leaving `cancelledAt` documented as non-null once cancelled — which a swept booking falsifies | fixed-in-`<review>` — the paragraph now states all three move together |
| F-14 | review (`/code-review`, high) | The two new e2e specs each inlined an eleven-field `CANCELLED` payload differing in two fields | fixed-in-`<review>` — `cancelledDetail()` helper |

---

## File structure

- `docs/plans/cancelled-booking-explanation.md` — this plan
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingRecord.java` — carry `cancelReason`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — carry `cancelReason`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — thread it through
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookings.java` — select `cancel_reason` in both reads + map it
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — the wire field
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-7
- `platform/src/test/java/ai/riviera/platform/booking/CancelBookingIT.java` — AC-8 round-trip
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — the wire-contract assertion (F-4)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/MyBookingSummary.java` — `refundedAmount` on the list row (F-3)
- `platform/src/main/java/ai/riviera/platform/booking/application/view/MyBookingsService.java` — maps it from the record (F-3)
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/MyBookingView.java` — puts it on the list wire (F-3)
- `frontend/src/app/shared/booking-status.ts` — `amountLabelFor`, the single-sourced label rule (F-3)
- `frontend/src/app/booking/my-bookings.ts` — consumes it, so list and view agree (F-3)
- `platform/src/test/java/ai/riviera/platform/booking/application/request/WithdrawRequestServiceTest.java` — construction site of the widened `BookingRecord` (generalization audit, R-3)
- `frontend/src/app/booking/booking.model.ts` — `CancelReason` union + `BookingDetail.cancelReason`
- `frontend/src/app/booking/booking-view.ts` — the `CANCELLED` panel + amount-label refinement
- `frontend/src/app/booking/booking-view.spec.ts` — AC-1…AC-6
- `frontend/src/app/booking/booking-pay.spec.ts` — `BookingDetail` fixture widened by the new field
- `frontend/src/app/booking/booking.service.spec.ts` — same (two fixture sites)
- `frontend/src/app/booking/find-booking.spec.ts` — same
- `frontend/src/app/booking/my-bookings.spec.ts` — same (the shared `detail()` builder)
- `frontend/src/app/booking/booking-view.contrast.spec.ts` — the new banner's AA proof
- `frontend/e2e/booking-flow.e2e.ts` — AC-9

---

## Phase 0 — Carry `cancel_reason` to the view use case

**Files:** Modify `BookingRecord.java` · `BookingDetail.java` · `ViewBookingService.java` ·
`JdbcBookings.java` · Test `ViewBookingServiceTest.java`, `CancelBookingIT.java`

- [ ] **Step 1: Write the failing test** (AC-7) — two cases in `ViewBookingServiceTest`:
      a `WEATHER` row surfaces `RefundReason.WEATHER`; a `NULL`-reason row surfaces `null`.
- [ ] **Step 2: Run it, verify it fails** —
      `gradle --no-daemon --console=plain test --tests "*ViewBookingServiceTest*"` → FAIL (no such accessor)
- [ ] **Step 3: Minimal implementation** — add the component to `BookingRecord` and
      `BookingDetail`, map `cancel_reason` in `mapBookingRecord`, add it to **both** `SELECT`
      lists (`findByCode`, `findByAccountId` — R-3), pass it in `toDetail`.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, then broaden to
      `--tests "*booking*"` for the module's unit tests plus the structural net
      (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`).
- [ ] **Step 5: Generalization-audit pass** — search every `BookingRecord` construction site
      (the mapper is shared with `findByAccountId`; `MyBookingsService` must still compile and pass).
- [ ] **Step 6: Commit** — `git commit -m "Carry the cancellation reason to the booking view use case (#578)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Expose `cancelReason` on the wire + FE contract

**Files:** Modify `BookingDetailView.java` · `frontend/src/app/booking/booking.model.ts`

- [ ] **Step 1:** Add `String cancelReason` to `BookingDetailView`, mapped null-safely from the
      enum (`d.cancelReason() == null ? null : d.cancelReason().name()`).
- [ ] **Step 2:** Add the `CancelReason` union + the nullable field to the FE `BookingDetail`.
- [ ] **Step 3: Run** — `gradle … --tests "*ViewBooking*"` and `npm test` (the FE compiles
      against the widened interface; existing fixtures need the new field).
- [ ] **Step 4: Commit** — `git commit -m "Expose the cancellation reason on the booking detail API (#578)"`
- [ ] **Step 5: Update plan-doc execution status.**

---

## Phase 2 — The `CANCELLED` panel + amount-label fix

**Files:** Modify `booking-view.ts` · Test `booking-view.spec.ts`, `booking-view.contrast.spec.ts`

- [ ] **Step 1: Write the failing specs** — AC-1…AC-6, each asserting the rendered sentence
      (text, not colour) via a `data-testid="booking-cancelled"` panel.
- [ ] **Step 2: Run, verify they fail** — `npm test -- booking-view` → FAIL
- [ ] **Step 3: Minimal implementation** — the `@case ('CANCELLED')` branch, ordered
      never-charged → `WEATHER` → refunded → non-refundable (R-1/R-2), plus the amount-label
      refinement for AC-5; add `bannerCancelled`/`eyebrowCancelled` to `CLS`.
- [ ] **Step 4: Run, verify they pass** — `npm test -- booking-view`, then `npm run lint`,
      `npm run test:a11y`, `npm test` (full Vitest — it is fast, unlike the Gradle suite). Then
      **both hygiene guards, immediately before the push** (`check-plan-file-structure.mjs
      --diff origin/main` and `check-inline-comments.mjs --diff origin/main`) — running them
      mid-phase is what let F-1 and F-2 reach CI.
- [ ] **Step 5: Generalization-audit pass** — does any other surface render a terminal status
      with no explanation? (`request-confirmation`, `my-bookings` — record the decision.)
- [ ] **Step 6: Commit** — `git commit -m "Explain a cancelled booking to the guest (#578)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — e2e + a11y coverage

**Files:** Modify `frontend/e2e/booking-flow.e2e.ts`

- [ ] **Step 1:** Add the mocked `CANCELLED`/never-charged route + assertions (AC-9), using
      `expectNoSeriousAxeViolations` from `e2e/support/axe.ts` — never a hand-rolled AxeBuilder.
- [x] **Step 2: Run** — `npm run test:e2e:a11y`. **Cloud-session note:** the sandbox ships
      Chromium 1194 while the pinned `@playwright/test` wants 1228, so the run needs
      `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` (the escape hatch the config already
      documents) — never `npx playwright install`. Full mocked suite: 155/155.
- [ ] **Step 3: Commit** — `git commit -m "Cover the cancelled-booking explanation with e2e (#578)"`
- [ ] **Step 4: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | Phase 0 — widened `BookingRecord` | every construction site of the record, since `mapBookingRecord` is shared by `findByCode` **and** `findByAccountId` (R-3) | `grep -rn "new BookingRecord(" platform/src --include=*.java` | 3 (the JDBC mapper + 2 test helpers) | Fixed all 3; `MyBookings*` re-run green, so the account-scoped read is unaffected |
| 2026-08-09 | Phase 2 — new "explain a terminal status" pattern | any other surface rendering a terminal booking status with no explanation | `grep -rln "@switch (.*status\|CANCELLED" src/app --include=*.ts` | 2 beyond the view (`booking-pay.ts`, `my-bookings.ts`) | **Skip both, no gap.** `booking-pay` already renders an honest terminal-failure panel for a server-side `CANCELLED`; `my-bookings` already carries a `'Booking cancelled'` subtitle and cannot say more — `MyBookingSummary` has neither `refundedAmount` nor a reason (the documented non-goal, and why AC-5 is fixed in the view rather than in shared `STATUS_META`) |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1…AC-6:** Run `npm test -- booking-view` → all green. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `gradle … --tests "*ViewBookingServiceTest*"` → PASS. Verified at `<sha>`.
- [ ] **AC-8:** Run `gradle … --tests "*CancelBookingIT*"` → PASS (or skipped without Docker →
      proven by CI). Verified at `<sha>`.
- [ ] **AC-9:** Run `npm run test:e2e:a11y` → PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (justified N/A — read-only slice); no write path touched (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new grant (invariant #11).
- [ ] **Payment/payout** section filled (N/A — no money moves); money rendered in minor units (invariant #5).
- [ ] Refund policy enforced server-side (invariant #10) — the client only renders persisted facts.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6) — untouched.
- [ ] Booking codes unguessable (invariant #7); no code logged by the new paths.
- [ ] Flyway migration present for schema changes (invariant #12) — **none needed**, V14 already ships the column.
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
