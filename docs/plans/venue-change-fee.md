# Venue-change fee Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A venue-caused refund costs the venue a fixed fee: a `FEE` payout-ledger entry the
cancelled-booking listener posts on `reason == VENUE_CHANGE`, deducted by every ledger sum in the
tree, visible on the venue's statement, on the remodel preview and receipt, and per venue on a new
admin tab.

**Architecture:** The fee is `payout`'s decision and lives in `payout`'s ledger; the sign lives in
the entry type, so `FEE` is stored as a non-negative magnitude and *subtracts*, exactly as `REVERSAL`
does. Nothing may depend on `payout` (the composition root least of all —
`CompositionRootDisciplineTests` names it), so the preview's and receipt's fee figure reaches them
through a **dependency inversion**: `booking.spi.VenueChangeFeeRate`, declared by `booking` and
implemented by `payout`, the same shape as `booking.spi.ConfirmationMailDelivery`.

**Persistence:** JDBC only (invariant #1). `V54__venue_change_fee.sql` admits `FEE` in
`payout_entry_type_check`, exempts it from `payout_net_check` with the sign convention written down,
and adds `remodel_receipt_outcome.fee_minor` so a receipt never re-prices when #1037 makes the fee
editable.

**Source of intent:** GitHub issue #1036 (epic #1027, revision 3, user stories 33–34).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
ticket's "the listener's early return on a zero refund is harmless because `VENUE_CHANGE` is always
full" went stale in #1035, which introduced a zero-refund `VENUE_CHANGE` release; and that the
ticket's "admin refunds page" does not exist) · `riviera-plan-doc` (this template — forced the
Module-ownership table that rejected putting the fee value at the composition root) · `tdd` (every
phase is one seam, one failing test, one implementation; the ledger-sum audit is written red-first
against a `FEE` row) · `riviera-review-overlay` (review gate — runs at ready-for-review) ·
`riviera-docs-freshness` (**runs** over `origin/main..HEAD` at close-out — the invariant #9 one-liner
is stated in four places this slice changes together) · `riviera-stripe-payments` (collect-only, no
Connect; the fee is a ledger row, never a Stripe object, and the listener stays the reversal's
transaction) · `postgres` (`CHECK (col IN (…))` over a native enum, `BIGINT` minor units, the
aggregate `FILTER` clause for the admin read, and: do not duplicate an index a constraint already
provides) · `riviera-modulith` (the `api`-vs-`spi` decision rule put `VenueChangeFeeRate` in
`booking.spi`, not `payout.api` — `payout` implements it, so an "implement-me" port in `api/` would
be RV-BE-3b) · `riviera-java-conventions` (records for the new value types, package-private adapter,
`@ConfigurationProperties` record for the fee, one-line-or-none inline comments) · `codebase-design`
(one port method added to the existing `RemodelClaims` conversation rather than a fifth narrow port)
· `domain-modeling` (the **Fee** glossary entry and ADR-0021; challenged "venue-caused refund"
against the two shapes `VENUE_CHANGE` now covers) · `riviera-frontend` (the new admin tab is a
feature-folder file under `admin/` with its own service; the tab slot goes in the console tab
contract, not appended) · `angular-developer` + **angular-cli MCP** (`get_best_practices` for
workspace `frontend`, framework v22 → confirmed: no `standalone: true`, no explicit `OnPush`, no
`@HostBinding`/`@HostListener`, `input()`/`output()` over decorators, `computed()` for derived state,
native `@if`/`@for`, `inject()`, and `@Service` over `@Injectable({providedIn:'root'})` for a new
singleton — which is why `AdminVenueChangeRefundsService` is `@Service()`; `search_documentation`
v22 for **signals/computed**, **linkedSignal**, **resource/httpResource**, **signal forms** and
**control flow**. What it changed: the fee totals became `computed()` off the existing entry signal
rather than a `linkedSignal` (nothing is written back, so `linkedSignal` would be wrong); the new
admin tab does **not** adopt `httpResource` — the docs say it fetches eagerly and its `value()`
throws in the error state, and every sibling admin tab is `@Service` + `HttpClient` +
`firstValueFrom` with the component holding page state, so matching the neighbours wins; **signal
forms** were checked and are not used — this slice adds no form) · `riviera-tailwind` (verified
against the **Tailwind CSS v4 docs**: theme variables come from `@theme`/`@theme inline` — the tree's
`@theme inline` mapping is what makes `text-riv-console-negative-ink` a first-class utility and lets
the console's own theme scope override it — and the docs point at `@layer components`, never
`@apply`, for sharing. What it changed: the fee row reuses the existing
`--riv-console-negative-ink` token and the reversal's own negative-ink class rather than a new token,
so the deduction reads identically in both console themes; arbitrary sizes stay `text-[12.5px]` per
the tree's idiom, and the CSS-variable shorthand `bg-(--x)` is not needed here) · `playwright-cli`
(the mocked suite gets the statement fee line; the real-backend suite is **not** extended — this
ticket does not ask for it) · `riviera-local-debug` (scoped `gradle --no-daemon` runs, the structural
net after the backend structure change, `PW_CHROMIUM_EXECUTABLE` for the mocked e2e).

**Branch:** `claude/stripe-fee-venue-change-fgstal` — the cloud session's designated remote branch
stands in for `feature/venue-change-fee` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given the ledger schema, when a row `(entry_type='FEE', gross 0, commission 0, net 500)`
  is inserted, then it is accepted; and when `(entry_type='FEE', gross 0, commission 0, net -1)` is
  inserted, then `payout_amounts_check` rejects it; and when `(entry_type='ACCRUAL', gross 0,
  commission 0, net 500)` is inserted, then `payout_net_check` still rejects it.
  *Seam:* the `payout_ledger_entry` table (Flyway V54) · *Pinned by:* `PayoutMigrationIT.feeRowIsAdmittedWithNoGrossAndNoCommission`, `PayoutMigrationIT.feeRowWithNegativeAmountRejected`, `PayoutMigrationIT.inconsistentNetRejected`
- [ ] **AC-2:** Given a confirmed booking that accrued, when `BookingCancelled(reason=VENUE_CHANGE,
  refundMinor>0)` is delivered, then the ledger holds exactly one `REVERSAL` and one `FEE` of the
  configured amount for that booking, in the event's currency, stamped `reason=VENUE_CHANGE`.
  *Seam:* `booking.events.BookingCancelled` → the `payout` ledger · *Pinned by:* `PayoutVenueChangeFeeIT.venueChangeRefundPostsAReversalAndOneFee`
- [ ] **AC-3:** Given the same event, when it is redelivered, then the ledger still holds exactly one
  `FEE` row for that booking. *Seam:* as AC-2 · *Pinned by:* `PayoutVenueChangeFeeIT.redeliveryPostsNoSecondFee`
- [ ] **AC-4:** Given a cancellation with `reason` `POLICY` or `WEATHER`, when it is delivered, then
  no `FEE` row exists for that booking. *Seam:* as AC-2 · *Pinned by:* `PayoutVenueChangeFeeIT.policyAndWeatherRefundsPostNoFee`
- [ ] **AC-5:** Given a remodel **release** of an unpaid booking — `BookingCancelled(reason=VENUE_CHANGE,
  refundMinor=0)` — when it is delivered, then neither a `REVERSAL` nor a `FEE` is posted.
  *Seam:* as AC-2 · *Pinned by:* `PayoutVenueChangeFeeIT.aReleaseThatReturnsNothingPostsNoFee`
- [ ] **AC-6:** Given a venue's ledger holding an `ACCRUAL` of 4250, a `REVERSAL` of 1000 and a `FEE`
  of 500, when the venue's ledger is read, then `netOwedMinor` is 2750 and the `FEE` row's running
  value shows the deduction. *Seam:* `payout.application.ViewPayoutLedger` · *Pinned by:* `PayoutLedgerViewIT.aFeeDeductsFromTheRunningNetOwed`
- [ ] **AC-7:** Given the same three rows inside one period, when the payout batch is generated, then
  the batch's `totalNetMinor` is 2750. *Seam:* `payout.application.PayoutReport#generate` · *Pinned by:* `PayoutBatchGenerationIT.aFeeDeductsFromTheBatchTotal`
- [ ] **AC-8:** Given two venues with `VENUE_CHANGE` reversals and fees, when an admin reads the
  venue-caused refunds, then each venue's row carries its refund count, the refunded total and the
  fee total, and a `POLICY` reversal on the same venue is excluded. *Seam:* `payout.application.ViewVenueChangeRefunds` · *Pinned by:* `AdminVenueChangeRefundsIT.listsVenueCausedRefundsPerVenueWithCountAmountAndFee`
- [ ] **AC-9:** Given a non-admin operator, when they call the venue-caused refunds endpoint, then
  they get `403`. *Seam:* `GET /api/admin/venue-change-refunds` · *Pinned by:* `AdminVenueChangeRefundsIT.aNonAdminOperatorIsForbidden`
- [ ] **AC-10:** Given a remodel preview whose picture refunds two bookings, when the operator reads
  it, then each refund line carries the fee per booking and the response carries the fee total
  (2 × the configured fee); and a picture that refunds nobody carries a zero total.
  *Seam:* `POST /api/venues/{venueId}/beach-map/preview` · *Pinned by:* `RemodelPreviewFeeIT.aRefundingPreviewQuotesTheFeePerBookingAndItsTotal`
- [ ] **AC-11:** Given a commit that refunded two bookings, when its receipt is read, then each
  refund line carries the fee that was charged and the receipt carries the fee total; a released or
  declined line carries no fee. *Seam:* `GET /api/venues/{venueId}/remodels/{receiptId}` · *Pinned by:* `RemodelReceiptFeeIT.aReceiptCarriesThePerRefundFeeAndTheTotal`
- [ ] **AC-12:** Given a `booking.spi.VenueChangeFeeRate` fake answering 500 EUR, when
  `RemodelClaims#venueChangeFee` is called, then it answers 500 EUR. *Seam:* `booking.api.RemodelClaims` · *Pinned by:* `RemodelClaimsServiceTest.quotesTheVenueChangeFeeItIsGiven`
- [ ] **AC-13:** Given a payouts-tab ledger containing a `FEE` entry, when the tab renders, then the
  fee row shows a negative net in the negative ink, is labelled as a venue-change fee, is not counted
  as a refund in the counts line, and the period gross/commission totals do not add it.
  *Seam:* the rendered `app-payouts-tab` · *Pinned by:* `payouts-tab.spec.ts › a FEE entry reads as a deduction, not an accrual`
- [ ] **AC-14:** Given the same ledger, when the statement modal opens, then it lists the fee row and
  its total due is the server's `netOwedMinor`. *Seam:* the rendered `app-payout-statement` · *Pinned by:* `payout-statement.spec.ts › lists a venue-change fee row as a deduction`
- [ ] **AC-15:** Given a preview whose picture refunds bookings, when the preview panel renders, then
  it states the fee per refunded booking and the fee total. *Seam:* the rendered
  `app-remodel-preview-panel` · *Pinned by:* `remodel-preview-panel.spec.ts › states the venue-change fee per refunded booking and the total`
- [ ] **AC-16:** Given a receipt with refunds, when the receipt panel renders, then it shows the fee
  per refunded booking and the fee total. *Seam:* the rendered `app-remodel-receipt-panel` · *Pinned by:* `remodel-receipt-panel.spec.ts › shows the fee charged per refunded booking and the total`
- [ ] **AC-17:** Given venue-caused refund rows, when the admin opens the new tab, then it lists one
  row per venue with count, refunded amount and fee total, and shows an empty state when there are
  none. *Seam:* the rendered `app-admin-venue-changes` at `/admin/venue-changes` · *Pinned by:* `admin-venue-changes.spec.ts › lists venue-caused refunds per venue with count, amount and fee`
- [ ] **AC-18:** Given each new or changed surface, when axe and the contrast maths run, then there
  are no serious violations and every new ink/fill pair meets AA. *Seam:* the rendered components ·
  *Pinned by:* `admin-venue-changes.a11y.spec.ts`, `admin-venue-changes.contrast.spec.ts`,
  `payouts-tab.a11y.spec.ts`, `payouts-tab.contrast.spec.ts`, `remodel-preview-panel.a11y.spec.ts`,
  `remodel-preview-panel.contrast.spec.ts`, `remodel-receipt-panel.a11y.spec.ts`,
  `remodel-receipt-panel.contrast.spec.ts`
- [ ] **AC-19:** Given the mocked e2e ledger fixture with a `FEE` row, when the operator opens the
  payouts tab and its statement, then the fee line is visible and the owed figure is the server's.
  *Seam:* the browser at `/operator/:venueId/payouts` · *Pinned by:* `frontend/e2e/operator-payouts.e2e.ts › the statement lists a venue-change fee as a deduction`
- [ ] **AC-20:** Given the backend tree, when the structural net runs, then `ModularityTests`
  (`payout` → `booking::spi`) and the four sibling architecture tests pass. *Seam:*
  `ApplicationModules.of(PlatformApplication.class).verify()` · *Pinned by:* `ModularityTests.verifiesModularStructure` + the structural-net command

## Non-goals

- **An admin-editable fee.** The fee stays `riviera.payout.venue-change-fee-minor`; #1037 owns the
  settings surface, the audit row and whatever effective-dating it needs.
- **A per-venue or tiered fee.** One platform-wide amount. The flat fee is regressive on a cheap
  booking (5 EUR on a 12 EUR set) — accepted for version one, per the ticket.
- **Charging a fee on a release or a decline.** Nothing was collected, so nothing is reversed and
  nothing is charged.
- **Re-pricing history.** A receipt's fee is stored at commit; no read multiplies today's rate by a
  past count.
- **A `FEE` for `POLICY`, `WEATHER` or `CONFLICT`.** `CONFLICT` is admin-actioned and deliberately
  fee-free.
- **Changing what a venue is paid out.** Settlement stays the manual BKT batch.
- **The real-backend Playwright suite.** The ticket asks for mocked e2e on the statement line only.

## Behavior-parity ledger (retirement / replacement slices only)

N/A — new behavior; it retires no surface. The one changed behavior is additive: two existing sums
gain a third entry type they already handled correctly by their `else` arm, and two frontend sums
gain the arm they lacked.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A ledger sum treats `FEE` as an accrual and the venue is silently overpaid (invariant #9) | med | high | Every sum in the tree is enumerated below and each read's test gains a `FEE` row whose expected total only holds if `FEE` deducts (AC-6, AC-7, AC-8, AC-13) | agent | open |
| R-2 | The two frontend sums (`payouts-tab.ts` `signedSum` and the row `sign`) branch on `type === 'REVERSAL'` and treat everything else as positive — a real defect the moment `FEE` exists | high | high | Invert both to "ACCRUAL adds, everything else subtracts" so a fourth type is a deduction by default; AC-13 fails without it | agent | open |
| R-3 | A moved guest's own free exit is also `VENUE_CHANGE` and would be charged unintentionally | high | med | Settled with the maintainer: **both shapes pay** — the venue caused the move that caused the exit, and charging only the forced refund leaves a loophole (move the guest somewhere they will abandon). Recorded in ADR-0021 and in `RefundReason`'s contract | maintainer | resolved — see Resolved |
| R-4 | The `FEE` posts but the `REVERSAL` defers (no accrual yet), leaving a fee with no refund | low | med | The fee is posted inside the same listener, *after* the accrual lookup, so a deferral throws before either row is written and the registry retries both together | agent | open |
| R-5 | `payout_net_check` relaxed too far and a malformed `ACCRUAL`/`REVERSAL` becomes storable | low | high | The exemption is keyed on `entry_type = 'FEE'` alone; `PayoutMigrationIT.inconsistentNetRejected` stays green unchanged (AC-1) | agent | open |
| R-6 | `PayoutLedgerEntry`'s canonical constructor duplicates `payout_net_check` and would reject a fee before the DB sees it | high | med | Relax the record's guard on the same key with the same one-line convention, and keep the DB as the enforcer of record | agent | open |
| R-7 | Flyway version collision on `V54` | low | med | `V54` is free on `main` (highest is `V53`) and no PR is open on the repo. If one appears, the branch that merges second renumbers | agent | open |
| R-8 | Granting the composition root `payout::api` to reach the fee would break `CompositionRootDisciplineTests`, whose Javadoc names `payout` as exactly what the root may not touch | high | high | The fee reaches the preview through `booking.spi.VenueChangeFeeRate` (an inversion `payout` implements) — no root grant, no rule change | agent | open |
| R-9 | `booking`'s `@ApplicationModuleTest` bootstraps without `payout`, so the new SPI bean is missing and the context fails (`riviera-local-debug` § blast radius) | med | med | Add `VenueChangeFeeRate` to that test's `@MockitoBean` list, as `ConfirmationMailDelivery` already is; run every `@ApplicationModuleTest` before pushing | agent | open |
| R-10 | The admin endpoint is a new `/api/admin/**` surface and could leak a booking code or a per-guest row | low | high | It returns venue-level aggregates only — ids, counts, amounts — never a booking id or code (invariant #7); role-gated, not venue-scoped (invariant #13 exemption) | agent | open |
| R-11 | Adding a tab out of slot fails `admin-console-tabs.spec.ts`'s subsequence contract | med | low | The label is added to `ADMIN_CONSOLE_TAB_GROUPS` in the Money group, in slot, not appended | agent | open |
| R-12 | A new `MoneyView`-bearing response field breaks the FE contract silently | low | med | Both new response fields are typed in `operator-console.model.ts`/`admin.model.ts` and asserted in the service specs; no `as any` | agent | open |

## Open questions / Assumptions

- **Assumption:** The fee's currency is the cancelled booking's currency (EUR in v1, invariant #5);
  the property carries minor units only, so a non-EUR collection currency would need the property to
  grow a currency. — *Owner:* agent · *Resolves by:* phase 2 (stated on the properties record)
- **Assumption:** A `FEE` row's `period_key` comes from the same `DEFAULT NOW()` the reversal's does,
  so a fee always lands in the period its refund did unless the two straddle midnight in
  `Europe/Tirane` — both are written in one transaction, so they cannot. — *Owner:* agent ·
  *Resolves by:* phase 2

### Resolved

- **Open question (from #1035's close-out):** `VENUE_CHANGE` covers two shapes — the remodel refunding
  a confirmed booking it could not move, and a moved guest taking their own free exit. Which pays the
  fee? → **Both.** Decided with the maintainer on 2026-09-10: the venue caused the move that caused
  the exit, so "the cost of changing a guest's deal" covers it; charging only the forced refund would
  reward moving a guest to a spot they abandon, and would need `payout` to read `endedByRemodel` off
  `BookingNotificationFacts` — a `notification`-role port. The listener therefore keys on
  `reason == VENUE_CHANGE` alone, exactly as the epic wrote it. Recorded in ADR-0021.
- **Open question:** the ticket's ACs name an "admin refunds page" that does not exist; the existing
  **Refunds** tab is the refund *outbox* lever. → **A new admin console tab**, decided with the
  maintainer on 2026-09-10, in the reserved **Money** group beside Commissions and the still-unbuilt
  Payouts slot.
- **Drift (issue-intake gate):** the ticket says "the listener's early return on a zero refund is
  harmless here because `VENUE_CHANGE` is always full". #1035 made that false — a remodel **release**
  publishes `BookingCancelled(reason=VENUE_CHANGE, refundMinor=0)`. The early return is now
  load-bearing rather than harmless: it is what keeps a release fee-free. Pinned by AC-5.

## Availability & concurrency (invariant #2)

N/A — does not affect availability. No `set_availability` row is read or written: the slice starts at
`BookingCancelled`, which `booking` publishes *after* it has already released the `(set, date)` row
synchronously. The new preview and receipt reads are read-only and touch no availability row. The one
concurrency property in scope is the ledger's own exactly-once guard, covered under Payment & payout.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payout` | existing | `payout_ledger_entry` | Job: owns the venue payout ledger and what a venue is owed. The fee is a ledger entry and its amount is payout's decision (epic: "`payout` decides the fee") |
| M-2 | `booking` | existing | `remodel_receipt_outcome` | Job: owns the remodel receipt and its lines. It records the fee it was handed, exactly as it already records the operator id and both spot labels |
| M-3 | root (composition) | existing | — | ADR-0020: the remodel preview response is assembled at the root from `venue::api` + `booking::api`. It gains no new module surface |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `booking.spi` | `VenueChangeFeeRate#perRefund()` | `booking.vocabulary.VenueChangeFee` | implemented by `payout`, called by `booking` |
| NI-2 | `booking.api` | `RemodelClaims#venueChangeFee()` (added method) | `booking.vocabulary.VenueChangeFee` | the composition root's `RemodelPreviewAssembler` |

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| EV-1 | `BookingCancelled` (unchanged) | `booking` | `{ bookingId, venueId, setId, bookingDate, refundMinor, currency, reason }` | `payout` (reversal **+ the new fee**), `notification`, `booking`'s own refund + intent-void listeners | async `AFTER_COMMIT`, registry-backed | `PayoutVenueChangeFeeIT` |

No event is added, moved or renamed, so no Flyway `event_type` rewrite is owed.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide the fee amount | `payout` | `payout` Job: "Own the venue payout ledger … and the manual BKT batch reporting"; the fee is what the platform deducts from what it owes. **Not** `booking` — its Not-My-Job is money owed to a venue, and `payout`'s Not-My-Job list sends refund *decisions* to `booking`, not fee *amounts* out of `payout` |
| Post the `FEE` ledger row | `payout` | Sole writer of `payout_ledger_entry` (CLAUDE.md module table); posted by the listener that already posts the reversal, in that transaction |
| Decide *that* a refund is venue-caused | `booking` | `booking` Job: the cancellation lifecycle and its reasons; it stamps `VENUE_CHANGE`, and `payout` only reads the reason off the event, as it already does for `POLICY`/`WEATHER` |
| Quote the fee on the remodel preview | `booking` (value from `payout`) | `booking.api.RemodelClaims` already answers what a remodel would do to every claim; what a refund in that picture costs the venue is the same conversation. The **amount** is not booking's — it comes through `booking.spi.VenueChangeFeeRate`, which `payout` implements (`riviera-modulith` § `api` vs `spi`: another module implements it ⇒ `spi`) |
| Record the fee on the receipt | `booking` | `booking` owns `remodel_receipt*`; the receipt is a snapshot record (it already snapshots both spot labels and the distance). Recording a handed-in amount is not deciding it |
| The per-venue venue-caused refund report | `payout` | Built from ledger data; `payout` is the only module that may read `payout_ledger_entry`. **Not** the root — `CompositionRootDisciplineTests` names `payout` as out of bounds for a root class |

## Payment & payout (invariants #5, #8, #9, #10)

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch. The fee moves no
  money at Stripe — it is a deduction from what the platform owes at settlement. Nothing in this
  slice touches a `PaymentIntent`, a refund call or a webhook.
- **Confirmation trigger:** unchanged — signature-verified webhook.
- **Idempotency:** the ledger's existing `UNIQUE (booking_id, entry_type)` gives one `FEE` per
  booking; the insert is the shared `ON CONFLICT (booking_id, entry_type) DO NOTHING` (AC-3). No new
  constraint.
- **Money:** integer minor units, EUR (invariant #5). The fee is stored as a **non-negative
  magnitude** with `gross = 0`, `commission = 0`, `net = <fee>`; **direction lives in the entry
  type**, as it already does for `REVERSAL`. Written into the migration header and into
  `EntryType`'s Javadoc.
- **Payout-ledger effect:** `payout = Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net`. Every sum in the
  tree is enumerated in the audit below.
- **Refund policy applied:** unchanged; the fee is a consequence of a refund already decided by
  `booking` under invariant #10, never a new refund decision.
- **Pinning tests:** `PayoutVenueChangeFeeIT`, `PayoutMigrationIT`, `PayoutLedgerViewIT`,
  `PayoutBatchGenerationIT`, `AdminVenueChangeRefundsIT`, `FeeMathTest`.

### The ledger-sum audit (invariant #9) — every aggregation over `payout_ledger_entry`

Enumerated by mechanism, not resemblance: every site that folds more than one ledger row into a
figure. Found with `git grep -n "payout_ledger_entry"` over `platform/src/main`, `git grep -n
"EntryType\."` over `platform/src`, and `git grep -n "signedSum\|netOwedMinor\|PayoutEntryType"` over
`frontend/src`. Five sites; each read's test gains a `FEE` row.

| # | Site | What it computes | Today's `FEE` behaviour | Action |
|---|---|---|---|---|
| S-1 | `JdbcPayoutLedger#netTotalsForPeriod` SQL `CASE WHEN entry_type = 'ACCRUAL' THEN net_minor ELSE -net_minor END` | the payout batch / BKT report total per venue+period | deducts — correct, but only by its `ELSE` arm | Lock it with a `FEE` row (AC-7); reword the comment to name the three types |
| S-2 | `PayoutLedgerQueryService` `row.entryType() == ACCRUAL ? net : -net` | the venue ledger's running net owed and `netOwedMinor` (the statement's "Total due") | deducts — correct by its `else` arm | Lock it with a `FEE` row (AC-6) |
| S-3 | `payouts-tab.ts` `signedSum` — `e.type === 'REVERSAL' ? -pick(e) : pick(e)` | the console statement's display-only period gross and commission totals | **adds** — a defect | Invert to "ACCRUAL adds, everything else subtracts" (AC-13) |
| S-4 | `payouts-tab.ts` row mapping — `const reversal = e.type === 'REVERSAL'; sign = reversal ? -1 : 1` | each statement row's signed net and its ink | **renders a fee as a positive accrual** | Branch on "is a deduction" instead of "is a reversal", and label the fee row (AC-13, AC-14) |
| S-5 | `JdbcPayoutLedger#venueChangeTotals` (new, this slice) | the admin tab's per-venue refund count, refunded total and fee total | n/a — new | Aggregate with `FILTER (WHERE entry_type = …)` so the fee is never mixed into the refunded amount (AC-8) |

Not ledger sums, checked and excluded: `JdbcDailyTakings` sums `booking.amount_minor`, not the ledger
(its own Javadoc says so); `PayoutReportService#generate` re-uses S-1 rather than summing;
`JdbcPayoutBatches#upsertDraft` stores S-1's answer; `JdbcPayoutLedger#findAccrual` reads one row and
filters `entry_type = 'ACCRUAL'` explicitly; `payouts-tab.ts`'s `accrualCount`/`reversalCount` filter
by exact type, so a fee joins neither count.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/payouts-tab.ts` + `.html` | existing | standalone component | Signals + `computed()` | none |
| FE-2 | `operator/payout-statement.ts` | existing | standalone component | `input()` signals | none |
| FE-3 | `operator/remodel-preview-panel.ts` + `.html` | existing | standalone component | `input()` + `computed()` | none |
| FE-4 | `operator/remodel-receipt-panel.ts` | existing | standalone component | `input()` + `computed()` | none |
| FE-5 | `admin/admin-venue-changes.ts` | **new** | standalone component | signals + `computed()`; loads via its service in `load()`, like every sibling admin tab | none |
| FE-6 | `admin/admin-venue-changes.service.ts` | **new** | `@Service()` + `HttpClient` + `firstValueFrom` | stateless | none |
| FE-7 | `admin/admin-console-tabs.ts`, `app.routes.ts` | existing | tab contract + lazy route | — | none |

**Standards:** standalone components, `inject()`, `@if`/`@for`, `input()`/`output()` signal APIs, no
`standalone: true`, no explicit `OnPush`, no `@HostBinding`/`@HostListener`, `class`/`style` bindings
over `ngClass`/`ngStyle`. No `NgOptimizedImage` (no images). No deviation to document.

## FE↔BE contract

- **New endpoint:** `GET /api/admin/venue-change-refunds` →
  `{ venues: [{ venueId, refundCount, refundedMinor, feeMinor, currency }] }`. ADMIN-gated. Venue
  names are resolved client-side from the existing admin venues list — `payout` has no tourist-facing
  venue-name port and `VenueApiRoleSplitTests` reserves `VenueCatalog` for tourist reads.
- **Changed responses:**
  `POST /api/venues/{venueId}/beach-map/preview` — each `refunds[]` entry gains `fee: MoneyView`, and
  the body gains `feeTotal: MoneyView`.
  `GET /api/venues/{venueId}/remodels/{receiptId}` — each `refunds[]` entry gains `fee: MoneyView`,
  and the body gains `feeTotal: MoneyView` (null when it refunded nobody, like `refundedTotal`).
  `GET /api/venues/{venueId}/payout-ledger` — no shape change; `entries[].type` can now be `FEE`, so
  the FE's `PayoutEntryType` union gains that member.
- **Client typing:** hand-written typed models (`operator/operator-console.model.ts`,
  `admin/admin.model.ts`); never `as any`.
- **Money/date on the wire:** amounts as integer minor units + currency; dates ISO `LocalDate`.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** Write `RemodelClaimsServiceTest.quotesTheVenueChangeFeeItIsGiven` red, then the
`booking.spi.VenueChangeFeeRate` inversion and its `payout` adapter.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Migration V54 + `FEE` entry type + the fee factory | ✅ | |
| 1 — The ledger-sum audit: a `FEE` row in every read's test | ✅ | |
| 2 — The listener posts the fee | ✅ | |
| 3 — The fee on the preview and the receipt | | |
| 4 — The admin venue-caused refunds read | | |
| 5 — Frontend: statement, preview, receipt, admin tab | | |
| 6 — Docs: invariant #9 in four places, ADR-0021, glossary | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix re-enters
at Implement per the `riviera-sdlc` re-entry rule.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/venue-change-fee.md` — this plan
- `docs/plans/venue-caused-cancellation.md` — retired in this PR (#1035's plan, due at this close-out)
- `docs/adr/ADR-0021-venue-change-fee-as-a-ledger-entry-type.md` — the decision and its rejected alternatives
- `platform/src/main/resources/db/migration/V54__venue_change_fee.sql` — `FEE` admitted, `payout_net_check` relaxed with the sign convention, `remodel_receipt_outcome.fee_minor`
- `platform/src/main/resources/application.properties` — the commented `riviera.payout.venue-change-fee-minor` default
- `platform/src/main/java/ai/riviera/platform/payout/domain/EntryType.java` — the `FEE` member + the sign convention
- `platform/src/main/java/ai/riviera/platform/payout/domain/PayoutLedgerEntry.java` — the `fee(...)` factory + the relaxed net guard
- `platform/src/main/java/ai/riviera/platform/payout/application/VenueChangeFeeProperties.java` — the configured amount
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/BookingCancelledPayoutListener.java` — posts the fee beside the reversal
- `platform/src/main/java/ai/riviera/platform/payout/adapter/out/PayoutVenueChangeFeeRate.java` — implements `booking.spi.VenueChangeFeeRate`
- `platform/src/main/java/ai/riviera/platform/payout/adapter/out/JdbcPayoutLedger.java` — the per-venue venue-change aggregate + the reworded period sum
- `platform/src/main/java/ai/riviera/platform/payout/application/PayoutLedger.java` — the new query on the port
- `platform/src/main/java/ai/riviera/platform/payout/application/PayoutLedgerQueryService.java` — the fold's comment
- `platform/src/main/java/ai/riviera/platform/payout/application/{ViewVenueChangeRefunds,VenueChangeRefundsService,VenueChangeRefundTotal}.java` — the admin read
- `platform/src/main/java/ai/riviera/platform/payout/adapter/in/{AdminVenueChangeRefundsController,VenueChangeRefundsView}.java` — the admin endpoint
- `platform/src/main/java/ai/riviera/platform/payout/package-info.java` — `booking::spi` grant
- `platform/src/main/java/ai/riviera/platform/booking/spi/VenueChangeFeeRate.java` — the inversion port
- `platform/src/main/java/ai/riviera/platform/booking/spi/package-info.java` — surface Javadoc
- `platform/src/main/java/ai/riviera/platform/booking/vocabulary/VenueChangeFee.java` — the published fee value
- `platform/src/main/java/ai/riviera/platform/booking/api/RemodelClaims.java` — `venueChangeFee()`
- `platform/src/main/java/ai/riviera/platform/booking/application/remodel/{RemodelClaimsService,ReceiptOutcome,RemodelReceipt,RemodelReceipts,NewReceipt}.java` — the stored fee
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcRemodelReceipts.java` — `fee_minor` write + read
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/RemodelReceiptView.java` — the fee on the wire
- `platform/src/main/java/ai/riviera/platform/{RemodelPreviewAssembler,RemodelPreviewResponse}.java` — the fee on the preview
- `platform/src/test/java/ai/riviera/platform/payout/**` — the payout tests below
- `platform/src/test/java/ai/riviera/platform/booking/**` — the booking tests below
- `platform/src/test/java/ai/riviera/platform/{RemodelPreviewFeeIT,RemodelPreviewAssemblerTest}.java` — the preview's fee
- `frontend/src/app/operator/{payouts-tab.ts,payouts-tab.html,payouts-tab.spec.ts,payouts-tab.a11y.spec.ts,payouts-tab.contrast.spec.ts}` — the fee row
- `frontend/src/app/operator/{payout-statement.ts,payout-statement.spec.ts}` — the statement's fee row
- `frontend/src/app/operator/{remodel-preview-panel.ts,remodel-preview-panel.html,remodel-preview-panel.spec.ts,remodel-preview-panel.a11y.spec.ts,remodel-preview-panel.contrast.spec.ts}` — the fee line
- `frontend/src/app/operator/{remodel-receipt-panel.ts,remodel-receipt-panel.spec.ts,remodel-receipt-panel.a11y.spec.ts,remodel-receipt-panel.contrast.spec.ts}` — the fee line
- `frontend/src/app/operator/operator-console.model.ts` — `PayoutEntryType` gains `FEE`; the preview/receipt fee fields
- `frontend/src/app/operator/operator-console.service.spec.ts` — the widened ledger fixture
- `frontend/src/app/admin/{admin-venue-changes.ts,admin-venue-changes.service.ts,admin-venue-changes.spec.ts,admin-venue-changes.a11y.spec.ts,admin-venue-changes.contrast.spec.ts}` — the new tab
- `frontend/src/app/admin/admin.model.ts` — the tab's response types
- `frontend/src/app/admin/admin-console-tabs.ts` — the label in its slot
- `frontend/src/app/app.routes.ts` — the lazy route
- `frontend/e2e/operator-payouts.e2e.ts` — the statement's fee line
- `frontend/e2e/support/operator-console.mocks.ts` — the fixture's `FEE` row
- `CLAUDE.md` · `CONTEXT.md` · `RESPONSIBILITIES.md` · `.claude/skills/riviera-stripe-payments/SKILL.md` — invariant #9's one-liner, together

---

## Phase 0 — Migration V54, the `FEE` entry type, the fee factory

**Files:** Create `platform/src/main/resources/db/migration/V54__venue_change_fee.sql` · Modify
`payout/domain/EntryType.java`, `payout/domain/PayoutLedgerEntry.java` · Test
`platform/src/test/java/ai/riviera/platform/payout/PayoutMigrationIT.java`,
`platform/src/test/java/ai/riviera/platform/payout/FeeMathTest.java`

- [ ] **Step 1: Write the failing tests** — in `PayoutMigrationIT`, a `FEE` row with
  `(gross 0, commission 0, net 500)` inserts; a `FEE` row with a negative net is rejected by
  `payout_amounts_check`; `inconsistentNetRejected` stays as-is and still rejects an `ACCRUAL` whose
  net ≠ gross − commission. In `FeeMathTest`, `PayoutLedgerEntry.fee(venue, booking, 500, "EUR")`
  builds `(FEE, 0, 0, 500, VENUE_CHANGE)`.
- [ ] **Step 2: Run them, verify they fail** —
  `gradle --no-daemon --console=plain test --tests "*PayoutMigrationIT*" --tests "*FeeMathTest*"`
  → FAIL (`payout_entry_type_check` violated; no `fee` factory).
- [ ] **Step 3: Minimal implementation** — V54 drops and re-creates `payout_entry_type_check` with
  `FEE`, drops and re-creates `payout_net_check` as
  `CHECK (entry_type = 'FEE' OR net_minor = gross_minor - commission_minor)`, leaves
  `payout_amounts_check` untouched, and adds `remodel_receipt_outcome.fee_minor BIGINT NOT NULL
  DEFAULT 0` with `CHECK (fee_minor >= 0 AND (kind = 'REFUND' OR fee_minor = 0))`. The header states
  the sign convention: *direction lives in the entry type — `ACCRUAL` adds, `REVERSAL` and `FEE`
  subtract; amounts are stored as non-negative magnitudes.* `EntryType` gains `FEE` with that
  sentence; `PayoutLedgerEntry` gains the `fee(...)` factory and relaxes its net guard on the same key.
- [ ] **Step 4: Run them, verify they pass** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every Java guard that mirrors a ledger DB
  CHECK. Enumerate with `git grep -n "net must equal\|netMinor != grossMinor"` over
  `platform/src/main/java`.
- [ ] **Step 6: Commit** — `git commit -m "Admit a FEE payout-ledger entry type and relax the net check for it (#1036)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — The ledger-sum audit: a `FEE` row in every read's test

**Files:** Modify `payout/PayoutLedgerViewIT.java`, `payout/PayoutBatchGenerationIT.java` · Modify
`payout/adapter/out/JdbcPayoutLedger.java` (comment), `payout/application/PayoutLedgerQueryService.java` (comment)

- [ ] **Step 1: Write the failing tests** — `PayoutLedgerViewIT.aFeeDeductsFromTheRunningNetOwed`
  (accrual 4250, reversal 1000, fee 500 → `netOwedMinor` 2750) and
  `PayoutBatchGenerationIT.aFeeDeductsFromTheBatchTotal` (same rows in one period → `totalNetMinor`
  2750). Both expectations are chosen so that a sum treating `FEE` as an accrual answers 3750 and
  fails.
- [ ] **Step 2: Run them, verify the shape** — `gradle --no-daemon --console=plain test --tests
  "*PayoutLedgerViewIT*" --tests "*PayoutBatchGenerationIT*"`. Both existing sums already deduct via
  their `else` arm, so these may pass on first run: that is the audit's *finding*, not a skipped
  step. Prove the test bites by flipping S-1's `CASE` to `entry_type IN ('ACCRUAL','FEE')` locally,
  seeing red, and reverting.
- [ ] **Step 3: Minimal implementation** — no behaviour change; reword S-1's and S-2's comments to
  name the three types and the convention rather than "ACCRUAL adds, REVERSAL subtracts".
- [ ] **Step 4: Run them, verify they pass** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every fold over ledger rows, backend and
  frontend. Enumerated by the commands in the audit table above; S-3/S-4 are frontend and land in
  phase 5, S-5 is new in phase 4.
- [ ] **Step 6: Commit** — `git commit -m "Pin every ledger sum against a FEE row (#1036)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 2 — The listener posts the fee

**Files:** Create `payout/application/VenueChangeFeeProperties.java`,
`platform/src/test/java/ai/riviera/platform/payout/PayoutVenueChangeFeeIT.java` · Modify
`payout/adapter/in/BookingCancelledPayoutListener.java`, `application.properties`

- [ ] **Step 1: Write the failing test** — `PayoutVenueChangeFeeIT` with the four cases: AC-2, AC-3,
  AC-4, AC-5.
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests
  "*PayoutVenueChangeFeeIT*"` → FAIL (no `FEE` row).
- [ ] **Step 3: Minimal implementation** — a `@ConfigurationProperties("riviera.payout")` record with
  `@DefaultValue("500") long venueChangeFeeMinor`; the listener posts
  `PayoutLedgerEntry.fee(...)` after the reversal, guarded by `event.reason() == VENUE_CHANGE`. It
  sits **after** the zero-refund early return and **after** the accrual lookup, so a release charges
  nothing and a deferral rolls both rows back together (R-4). One log line, ids only (invariant #7).
- [ ] **Step 4: Run it, verify it passes** — same command → PASS, then broaden to
  `--tests "*payout*"`.
- [ ] **Step 5: Generalization-audit pass** — population: every listener reacting to
  `BookingCancelled`. Enumerate with `git grep -rln "BookingCancelled" platform/src/main/java`; judge
  each for whether `VENUE_CHANGE` now means something it did not before.
- [ ] **Step 6: Commit** — `git commit -m "Post a FEE on a venue-caused refund from the cancelled-booking listener (#1036)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 3 — The fee on the preview and the receipt

**Files:** Create `booking/spi/VenueChangeFeeRate.java`, `booking/vocabulary/VenueChangeFee.java`,
`payout/adapter/out/PayoutVenueChangeFeeRate.java` · Modify `booking/api/RemodelClaims.java`,
`booking/application/remodel/{RemodelClaimsService,ReceiptOutcome,RemodelReceipt,NewReceipt,RemodelReceipts}.java`,
`booking/adapter/out/JdbcRemodelReceipts.java`, `booking/adapter/in/RemodelReceiptView.java`,
`RemodelPreviewAssembler.java`, `RemodelPreviewResponse.java`, both `package-info.java` files · Test
`RemodelClaimsServiceTest`, `RemodelReceiptFeeIT`, `RemodelPreviewFeeIT`

- [ ] **Step 1: Write the failing tests** — AC-12, then AC-11, then AC-10.
- [ ] **Step 2: Run them, verify they fail** — `gradle --no-daemon --console=plain test --tests
  "*RemodelClaimsServiceTest*"` → FAIL (no `venueChangeFee`).
- [ ] **Step 3: Minimal implementation** — the SPI, its `payout` adapter, the port method, the stored
  `feeMinor` on each `REFUND` receipt line, `RemodelReceipt#feeTotalMinor()`, and the two response
  shapes. `payout`'s `allowedDependencies` gains `booking::spi`; `booking`'s does not change.
- [ ] **Step 4: Run them, verify they pass** — the three classes, then
  `--tests "*RemodelReceipt*" --tests "*RemodelPreview*"`.
- [ ] **Step 5: Run the structural net** — the six-test command from CLAUDE.md § Commands, plus every
  `@ApplicationModuleTest` (`grep -rl '@ApplicationModuleTest' platform/src/test/java`), because a
  bean moved across a module edge (R-9).
- [ ] **Step 6: Generalization-audit pass** — population: every `@ApplicationModuleTest` whose module
  now misses a bean. Enumerate with the grep above.
- [ ] **Step 7: Commit** — `git commit -m "Quote the venue-change fee on the remodel preview and record it on the receipt (#1036)"`
- [ ] **Step 8: Update plan-doc execution status.**

---

## Phase 4 — The admin venue-caused refunds read

**Files:** Create `payout/application/{ViewVenueChangeRefunds,VenueChangeRefundsService,VenueChangeRefundTotal}.java`,
`payout/adapter/in/{AdminVenueChangeRefundsController,VenueChangeRefundsView}.java`,
`platform/src/test/java/ai/riviera/platform/payout/AdminVenueChangeRefundsIT.java` · Modify
`payout/application/PayoutLedger.java`, `payout/adapter/out/JdbcPayoutLedger.java`

- [ ] **Step 1: Write the failing test** — AC-8 and AC-9.
- [ ] **Step 2: Run it, verify it fails** — `gradle --no-daemon --console=plain test --tests
  "*AdminVenueChangeRefundsIT*"` → FAIL (404).
- [ ] **Step 3: Minimal implementation** — the aggregate keyed on `reason = 'VENUE_CHANGE'`, summing
  `gross_minor FILTER (WHERE entry_type = 'REVERSAL')` and `net_minor FILTER (WHERE entry_type =
  'FEE')` separately so the two never mix; the ADMIN-gated `GET /api/admin/venue-change-refunds`.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS.
- [ ] **Step 5: Generalization-audit pass** — population: every `/api/admin/**` read added since the
  audit fence landed; enumerate with `git grep -n '"/api/admin' platform/src/main/java` and confirm
  each is a GET (no audit row owed) or writes one.
- [ ] **Step 6: Commit** — `git commit -m "List venue-caused refunds per venue with count, amount and fee for the admin (#1036)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 5 — Frontend: statement, preview, receipt, admin tab

**Files:** every `frontend/` path in the File structure section

- [ ] **Step 1: Write the failing specs** — AC-13 first (the `signedSum` defect), then AC-14, AC-15,
  AC-16, AC-17, AC-18, AC-19.
- [ ] **Step 2: Run them, verify they fail** — `npm test` scoped to the touched specs.
- [ ] **Step 3: Minimal implementation** — invert S-3/S-4 to "ACCRUAL adds, everything else
  subtracts"; add the fee row's label and negative ink from the existing
  `--riv-console-negative-ink` token; the two panel fee lines; the new admin tab, its `@Service`,
  its slot in the tab contract and its lazy route.
- [ ] **Step 4: Run them, verify they pass** — `npm test`, `npm run lint`, `npm run format:check`,
  `npm run test:a11y`, then
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y`.
- [ ] **Step 5: Generalization-audit pass** — population: every frontend fold over ledger entries.
  Enumerate with `git grep -n "PayoutEntryType\|signedSum" frontend/src`.
- [ ] **Step 6: Commit** — `git commit -m "Show the venue-change fee on the statement, the preview, the receipt and a new admin tab (#1036)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Phase 6 — Docs: invariant #9 in four places, ADR-0021, glossary

**Files:** `CLAUDE.md`, `CONTEXT.md`, `RESPONSIBILITIES.md`,
`.claude/skills/riviera-stripe-payments/SKILL.md`, `docs/adr/ADR-0021-*.md`, delete
`docs/plans/venue-caused-cancellation.md`

- [ ] **Step 1:** Rewrite invariant #9's one-liner to `payout = Σ amounts − commission − fees` in
  CLAUDE.md, in `RESPONSIBILITIES.md` § `payout` **and** § *Invariants, long form* #9, in
  `CONTEXT.md` § *Payout ledger*, and in `riviera-stripe-payments` § *Payout* — one commit, so no
  reader ever sees two of the four disagree.
- [ ] **Step 2:** `CONTEXT.md` gains **Fee** — a payout-ledger entry that deducts what the platform
  charges a venue for a refund its own change caused; direction lives in the entry type. Glossary
  only, no implementation detail.
- [ ] **Step 3:** Write ADR-0021 — the fee as a ledger entry type, and the rejected alternatives: a
  negative accrual (breaks `payout_amounts_check` and every sum's sign convention), a separate fee
  table (loses the `UNIQUE (booking_id, entry_type)` idempotency the ledger already gives and splits
  the audit trail), and keeping the commission on a refunded booking (opaque to the venue, and it
  cannot express a fee on a booking whose accrual is fully reversed).
- [ ] **Step 4:** Retire `docs/plans/venue-caused-cancellation.md` (due at this close-out).
- [ ] **Step 5: Run `riviera-docs-freshness`** over `origin/main..HEAD`, including the counting sweep
  for "the two X" facts — `payout` gains its first `spi` consumer edge and its first admin GET, and
  `booking.spi` goes from one port to two.
- [ ] **Step 6: Commit** — `git commit -m "State invariant #9 with fees in all four places and record ADR-0021 (#1036)"`
- [ ] **Step 7: Update plan-doc execution status.**

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase. **Population** names the
> mechanism swept and how it was enumerated.

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-10 | phase 2 | Every listener on `BookingCancelled` — judged for whether `VENUE_CHANGE` now means something it did not | `git grep -rln "BookingCancelled" -- platform/src/main/java` then `git grep -n "ApplicationModuleListener\|TransactionalEventListener"` over the hits | 4 listeners (`BookingRefundListener`, `RemodelReleasePaymentListener`, `BookingCancellationMailListener`, this one) | None to change: the first two are already keyed on `VENUE_CHANGE` and the mail listener already discriminates the two shapes through `endedByRemodel` |
| 2026-09-10 | phase 1 | Every fold over ledger rows anywhere in the tree — named by mechanism (a site that turns more than one ledger row into a figure), enumerated by the table's own three commands, not by looking in `payout` | `git grep -n "payout_ledger_entry" -- platform/src/main` · `git grep -n "EntryType\." -- platform/src` · `git grep -n "signedSum\|netOwedMinor\|PayoutEntryType" -- frontend/src` | 5 (S-1…S-5) | S-1/S-2 pinned with a `FEE` row and their comments reworded to the convention; S-3/S-4 are defects fixed in phase 5; S-5 is new in phase 4 |
| 2026-09-10 | phase 0 | Every Java guard that mirrors a `payout_ledger_entry` CHECK — found by grepping the guards' own messages, not by looking where I expected them | `git grep -n "net must equal\|netMinor != grossMinor\|must be non-negative" -- platform/src/main/java` | 1 (`PayoutLedgerEntry`'s canonical constructor, both guards) | Relaxed the net guard on the same `entry_type = FEE` key as the DB; left the amounts guard binding, so a fee cannot be stored negative |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1 … AC-12, AC-20:** `gradle --no-daemon --console=plain test --tests "*Payout*" --tests
  "*Remodel*"` + the structural-net command → all green. Verified at commit `<sha>`.
- [ ] **AC-13 … AC-18:** `npm test && npm run test:a11y` → green. Verified at commit `<sha>`.
- [ ] **AC-19:** `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:a11y` → green.
  Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (N/A justified); no availability row is read or written.
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; the new port
      is `spi`, granted only to its implementor (invariant #11).
- [ ] **Payment/payout** section filled; webhooks still the source of truth; the fee idempotent via
      the existing unique guard; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10) — unchanged.
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for the period key (invariant #6).
- [ ] Booking codes unguessable and absent from every new surface (invariant #7).
- [ ] Flyway migration present; the relaxed and unchanged constraints both tested (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit**, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — the `riviera-sdlc` `references/pr-gates.md` §1 ladder *plus*
      `riviera-review-overlay`.
