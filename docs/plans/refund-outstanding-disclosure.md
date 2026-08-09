# Refund-Outstanding Disclosure Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** A `CANCELLED` booking whose refund the gateway has **not yet accepted** says so
on `/booking/{code}` ("is being processed") instead of claiming the money is on its way to
the card; every other cancellation reads exactly as today.

**Architecture:** The gateway-acceptance fact already exists in the `payment` table
(`refunded_minor`, `refund_id`, `status`) — written by `StripePaymentGateway#markRefunded`,
read by nobody. The slice publishes it as a new `payment::api` query port
(`RefundStatusLookup#progressOf(BookingRef)` → `RefundProgress`), a **total, typed outcome**
whose `NO_COLLECTION` arm encodes the issue's trap #1 (absence of a payment row means "this
gateway never collected", never "the refund failed") — per-booking truth, strictly sharper
than the per-deployment `CollectionGuarantee` gate, while still asking `payment::api` rather
than sniffing profiles. `ViewBookingService` consults it lazily (only for `CANCELLED` +
positive refund decision) and discloses one new boolean, `refundOutstanding`, on the
code-gated read model; the frontend panel branches on it.

**Persistence:** JDBC only (invariant #1). **No schema change** — one new `SELECT` on the
existing `payment` table (V7 + V11). V40 stays free.

**Source of intent:** GitHub issue **#581** (provenance: finding F-6, declined at PR #580's
review gate; recorded in `docs/plans/cancelled-booking-explanation.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — confirmed the
issue against code: fact exists unread in `payment`; only Dependabot PRs in flight, no
Flyway collision; ownership split matches `RESPONSIBILITIES.md`) · `riviera-plan-doc` (this
template — forced the parity-ledger look at the shared `refundSentence` and the trap-#1
risk row) · `tdd` (each phase red-green at the service seam) · `riviera-review-overlay`
(review gate — due at ready-for-review) · `riviera-docs-freshness` (**ran** over
`9709fed..HEAD` — 1 finding: the stale `payment/api/package-info.java` port list, patched
in phase 1; the counting sweep's hits all count other subjects, none falsified) ·
`riviera-modulith` (port →
`payment/api/`, enum → `payment/vocabulary/`; no new grant — `booking` already lists
`payment::api` + `::vocabulary`) · `riviera-java-conventions` (enum outcome over boolean;
package-private service; text-block SQL; total port, no `Optional` leak) ·
`codebase-design` (one-method port, mapping hidden behind it; rejected widening
`RefundPort` — different consumer role, #94) · `domain-modeling` (fixed the decided /
accepted / settled vocabulary; `OUTSTANDING` used consistently BE↔wire↔FE) ·
`riviera-frontend` (all FE edits stay inside `booking/`; e2e in the CI-safe mocked suite) ·
`postgres` (to load at implement, before the SELECT — single-row lookup on the existing
`payment_booking_uniq` key expected) · `angular-developer` + angular-cli MCP (to load at
implement, before the panel edit) · `playwright-cli` (to load at implement, before the
mocked-suite spec).

**Branch:** `claude/sdlc-581-toozou` — the session's designated remote branch stands in for
`bugfix/refund-outstanding-disclosure` (riviera-sdlc cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a `CANCELLED` booking with a positive refund decision whose `payment`
  row shows `refunded_minor > 0` (gateway accepted), when the booking is viewed by code,
  then `BookingDetail.refundOutstanding` is `false`. *Pinned by:*
  `ViewBookingServiceTest.doesNotFlagAnAcceptedRefundAsOutstanding`
- [ ] **AC-2:** Given a `CANCELLED` booking with a positive refund decision whose `payment`
  row shows `status = SUCCEEDED` and `refunded_minor = 0` (collected, refund not yet
  accepted — the stuck-outbox case), when viewed by code, then `refundOutstanding` is
  `true`. *Pinned by:* `ViewBookingServiceTest.flagsAStuckRefundAsOutstanding`
- [ ] **AC-3:** Given a `CANCELLED` booking with a positive refund decision and **no
  `payment` row** (stub gateway — nothing ever collected), when viewed by code, then
  `refundOutstanding` is `false` and the detail is unchanged from today. *Pinned by:*
  `ViewBookingServiceTest.doesNotFlagARefundWhenNothingWasCollected`
- [ ] **AC-4:** Given a `CANCELLED` booking with **no refund decision** (`refund_minor`
  NULL or 0) or a booking in any non-cancelled status, when viewed by code, then the
  refund-status port is **never consulted** and `refundOutstanding` is `false`. *Pinned
  by:* `ViewBookingServiceTest.neverConsultsRefundStatusWithoutARefundDecision`
- [ ] **AC-5:** `RefundProgress` mapping is total: no row → `NO_COLLECTION`; row that never
  succeeded (`REQUIRES_PAYMENT`/`FAILED`/`CANCELED`) → `NO_COLLECTION`; `SUCCEEDED` with
  `refunded_minor = 0` → `OUTSTANDING`; `refunded_minor > 0` (incl. `PARTIALLY_REFUNDED`)
  → `ACCEPTED`. *Pinned by:* `RefundServiceTest` (`progress*` cases — the port landed on
  `RefundService`, mirroring `PaymentService` carrying `PaymentCredentialsLookup`) +
  `JdbcPaymentsIT.readsRefundStateBackAfterMarkRefunded` (real-Postgres read-back)
- [ ] **AC-6:** Given a view response with `refundOutstanding: true`, when the guest opens
  `/booking/{code}`, then the panel says the refund **is being processed** and contains
  neither "on its way" nor "to your card"; with `refundOutstanding: false` the copy is
  byte-identical to today. *Pinned by:* `booking-view.spec.ts` (both branches) +
  `booking-flow.e2e.ts` stuck-refund case (mocked suite, axe-clean)

## Non-goals

- **The cancellation/refund mail (#374) does not change.** It is sent once, at cancel time,
  *before* the refund attempt has even run — a settlement-aware mail needs a fact no event
  carries (its Javadoc states this), and #581's acceptance sketch scopes to the panel.
- **Settlement proper** (`charge.refund.updated` — Stripe accepting then failing later) —
  a third state the issue explicitly defers.
- **No weakening of the happy-path copy** (issue trap #2): "will be refunded to your card"
  stays for accepted refunds and for the stub profile.
- **No change to the refund outbox / re-drive machinery** (#454) — this slice only reads.

## Behavior-parity ledger

N/A — new behavior on an existing surface; nothing retired. The one shared-code hazard:
`refundSentence` (booking-view.ts) is shared between the cancelled panel and the in-session
cancel live region (F-7 on #578). The panel **branches before** calling it; the function
itself and the live region stay untouched — pinned by the existing `booking-view.spec.ts`
cases staying green.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | No-payment-row read as "refund failed" → every stub-profile cancellation shows "being processed" forever (issue trap #1) | med | high | `NO_COLLECTION` is a first-class outcome arm; AC-3 pins it; existing e2e payloads default `refundOutstanding: false`, proving the unchanged path | session | open |
| R-2 | Extra DB query on every booking view | low | low | consult only when `CANCELLED` && refund decision > 0 (mirrors the lazy `PaymentCredentialsLookup` consult); AC-4 pins it | session | open |
| R-3 | Boundary leak: `booking` reading `payment` internals | low | high | new port in `payment/api/` + enum in `payment/vocabulary/`; no new grant needed; `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` | session | open |
| R-4 | Copy regression on the shared `refundSentence` (also used by the in-session cancel live region) | med | med | panel branches on the flag *before* the shared sentence; existing specs (incl. "never claims a zero refund is on its way") must stay green | session | open |
| R-5 | Flipped-profile edge: deployment moves stub→stripe, old bookings have no row → a `CollectionGuarantee`-gated design would read "processing" forever | low | med | per-booking row presence (not deployment posture) decides; no row → `NO_COLLECTION` → unchanged copy | session | open |

## Open questions / Assumptions

### Resolved

- **Open question:** does `/my-bookings` make the same misleading claim? *Resolved at the
  phase-3 generalization audit: no — the list renders an amount label via `amountLabelFor`,
  no transit prose; the only claim-making surfaces are the panel (now branched) and the
  mail (`SmtpMailer.refundLine`, a non-goal by design).*

- **Assumption:** the `payment` row for a booking reaching the cancelled-with-refund view
  can only be `SUCCEEDED` / `REFUNDED` / `PARTIALLY_REFUNDED` at consult time. *Confirmed
  while writing the mapping: guest cancel requires `CONFIRMED` (collection succeeded); the
  sweep's cancel stamps no refund decision, so the never-succeeded arms of AC-5 are
  defense-in-depth only.* — `e957367`
- **Open question:** what does `BookingViewIT` assert? *Resolved: one wire-level
  `refundOutstanding=false` assertion on the existing weather-refund case — the stub
  profile can never produce a payment row, so the wire IT proves the `NO_COLLECTION` path;
  the `OUTSTANDING`/`ACCEPTED` arms are pinned at the service seam (AC-1/2) and the JDBC
  seam (AC-5), and `BookingDetailView.of` is a field copy.* — `5f2ae60`

## Availability & concurrency (invariant #2)

N/A — does not affect availability. The slice is a read-only projection: no
`availability(set_id, booking_date)` write path is touched, no booking state transition is
added or changed. The only writes in scope are test fixtures.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `payment` | existing | `Payment` | owns the gateway-acceptance fact (`refunded_minor`/`refund_id`/`status`, written on Stripe's accept) — publishing it is publishing its own state |
| M-2 | `booking` | existing | `Booking` | owns the code-gated view use case and the refund *decision*; decides what its read model discloses |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `payment.api` | `RefundStatusLookup#progressOf(BookingRef)` — **new** | `payment.vocabulary.RefundProgress` (new enum: `NO_COLLECTION` / `OUTSTANDING` / `ACCEPTED`), `BookingRef` (existing) | `booking` (`ViewBookingService`) |

Not widened instead: `RefundPort` (command, consumed by the refund listener — different
consumer role, #94 split) and `CollectionGuarantee` (deployment posture, not per-booking).
No new `allowedDependencies` grant: `booking/package-info.java` already lists
`payment::api` + `payment::vocabulary`.

**Domain events (id-based payloads, invariant #11)**

N/A — no event published, changed, or subscribed. (The refund is *driven* by the existing
`BookingCancelled` listener; this slice only reads the aftermath.)

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Answer "has the gateway accepted the refund for booking X?" | `payment` | `payment` Job: owns Stripe collection incl. refunds; the fact is its own table state. **Not** `booking` (its Not-My-Job: "talking to Stripe or moving money → `payment`") |
| Decide when/whether the view discloses `refundOutstanding` | `booking` | `booking` Job: owns the lifecycle + the view use case; mirrors the #390 `emailWithheld` split (booking gates, provider answers). **Not** `payment` (its Not-My-Job: "the booking lifecycle → `booking`") |
| Render the outstanding-refund copy | frontend `booking/` feature | the panel is `booking/booking-view.ts` (#578); no new folder |

## Payment & payout (invariants #5, #8, #9, #10)

**No money moves in this slice** — it is a read of money state. Stated for completeness:

- **Model:** collect-only via Stripe, **no Connect**; payout via manual BKT batch — untouched.
- **Source of truth honored (#8):** `refunded_minor`/`status` are written only after Stripe
  accepts the refund (`StripePaymentGateway` → `markRefunded`); the new port reads that,
  never a client-side signal.
- **Idempotency / refund policy / ledger:** untouched — the refund decision, the
  `booking-<id>-refund` idempotency key, the outbox re-drive (#454), and `payout`'s
  accrual/reversal are all upstream or orthogonal.
- **Money on the wire:** the flag is a boolean; amounts already flow as minor units + EUR.
- **Pinning tests:** `RefundStatusServiceTest`, `JdbcPaymentsIT.readsRefundStateBackAfterMarkRefunded`.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/booking-view.ts` (cancelled panel, #578) | existing | standalone component | existing signals; new `@if` branch on `b.refundOutstanding` | none |
| FE-2 | `booking/booking.model.ts` | existing | model | `refundOutstanding: boolean` on `BookingDetail` | — |

**Standards:** v22 control flow (`@if`), no `as any`, copy inline (no i18n layer exists).
Outstanding copy: **"Your refund of `{amount}` is being processed."** — states processing,
never arrival or card. Accepted/stub copy byte-identical to today.

## FE↔BE contract

- **Changed endpoint:** `GET /api/bookings/{code}` — `BookingDetailView` gains
  `boolean refundOutstanding` (always present; `true` only for `CANCELLED` + positive
  refund decision + gateway has collected but not accepted the refund).
- **Client typing:** hand-written `BookingDetail` in `booking/booking.model.ts` gains
  `refundOutstanding: boolean` (required — backend always serializes it).
- **Money/date on the wire:** unchanged (minor units + currency; ISO dates).

## Execution status

> Session-recovery anchor — update in the same commit window as the change it records,
> at every phase boundary and SDLC stage transition.

**Stage pointer:** PR — marking ready for review

**Next action:** verify this push's CI, mark PR #582 ready, run the review gate
(`/code-review` + overlay), then the Sonar gate re-pull.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — plan doc committed, draft PR opened (PR #582) | ✅ | `e9dcb54` |
| 1 — `payment`: `RefundProgress` + `RefundStatusLookup` + JDBC read | ✅ | `e957367` |
| 2 — `booking`: view consults port, discloses `refundOutstanding` | ✅ | `5f2ae60` |
| 3 — frontend: model + panel branch + unit/e2e specs | ✅ | `9c37662` |
| 4 — docs close-out (CONTEXT.md, RESPONSIBILITIES.md, docs-freshness run) + Sonar S1192 fix | ✅ | see below |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | sonar (phase-2 analysis) | `java:S1192` — `rs.getString("status")` in `JdbcPayments.findRefundState` duplicates the `PARAM_STATUS` constant's value | fixed in phase 4's commit (uses `PARAM_STATUS`) |

---

## File structure

- `docs/plans/refund-outstanding-disclosure.md` — this plan
- `platform/src/main/java/ai/riviera/platform/payment/vocabulary/RefundProgress.java` — new enum (published vocabulary)
- `platform/src/main/java/ai/riviera/platform/payment/api/RefundStatusLookup.java` — new query port
- `platform/src/main/java/ai/riviera/platform/payment/api/package-info.java` — freshness: name all the ports actually published
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundService.java` — implements the new port beside `RefundPort` (row → `RefundProgress` mapping)
- `platform/src/main/java/ai/riviera/platform/payment/application/RefundState.java` — internal status+refunded record returned by `Payments`
- `platform/src/main/java/ai/riviera/platform/payment/application/Payments.java` — new read for the refund state
- `platform/src/main/java/ai/riviera/platform/payment/adapter/out/JdbcPayments.java` — the `SELECT status, refunded_minor` query
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundServiceTest.java` — AC-5 arms
- `platform/src/test/java/ai/riviera/platform/payment/application/RefundFailureMetricTest.java` — constructor gains the unused `Payments` stub
- `platform/src/test/java/ai/riviera/platform/payment/application/PaymentServiceTest.java` — anonymous `Payments` stub gains the new method
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — shared `Payments` stub gains the new method
- `platform/src/test/java/ai/riviera/platform/payment/adapter/out/JdbcPaymentsIT.java` — read-back after `markRefunded`
- `platform/src/main/java/ai/riviera/platform/booking/application/view/ViewBookingService.java` — lazy consult
- `platform/src/main/java/ai/riviera/platform/booking/application/view/BookingDetail.java` — `refundOutstanding` field
- `platform/src/main/java/ai/riviera/platform/booking/adapter/in/BookingDetailView.java` — wire field
- `platform/src/test/java/ai/riviera/platform/booking/application/view/ViewBookingServiceTest.java` — AC-1..4
- `platform/src/test/java/ai/riviera/platform/booking/BookingViewIT.java` — existing cancelled cases assert `refundOutstanding=false` (stub profile)
- `frontend/src/app/booking/booking.model.ts` — `refundOutstanding: boolean`
- `frontend/src/app/booking/booking-view.ts` — panel branch + processing copy
- `frontend/src/app/booking/booking-view.spec.ts` — AC-6 branches + fixture field
- `frontend/src/app/booking/find-booking.spec.ts` — fixture gains the field (required on the type)
- `frontend/src/app/booking/my-bookings.spec.ts` — fixture gains the field
- `frontend/src/app/booking/booking.service.spec.ts` — fixtures gain the field
- `frontend/src/app/booking/booking-pay.spec.ts` — fixture gains the field
- `frontend/e2e/booking-flow.e2e.ts` — mocked-suite stuck-refund case
- `CONTEXT.md` — glossary: refund decided / accepted / settled, outstanding refund
- `RESPONSIBILITIES.md` — §`payment` (publishes the acceptance read), §`booking` (view disclosure)

---

## Phase 1 — `payment`: publish the acceptance fact

**Files:** Create `RefundProgress.java`, `RefundStatusLookup.java`,
`RefundStatusService.java`, `RefundStatusServiceTest.java` · Modify `Payments.java`,
`JdbcPayments.java`, `JdbcPaymentsIT.java`, `api/package-info.java`

- [ ] **Step 1: Write the failing tests** — `RefundStatusServiceTest` (all AC-5 arms
  against a fake `Payments`), `JdbcPaymentsIT.readsRefundStateBackAfterMarkRefunded`
- [ ] **Step 2: Run, verify FAIL** — `gradle test --tests "*RefundStatusServiceTest*"`
  (cloud recipe per `riviera-local-debug`)
- [ ] **Step 3: Minimal implementation** — enum + port + package-private service +
  `Payments` read + `JdbcPayments` SELECT
- [ ] **Step 4: Run, verify PASS** — service test + `JdbcPaymentsIT` (skips cleanly
  without Docker) + `--tests "*ModularityTests*" --tests "*PackageShape*" --tests
  "*PublishedSurfacePlacement*"`
- [ ] **Step 5: Generalization audit** — n/a unless a fix emerges
- [ ] **Step 6: Commit** — `<imperative subject> (#581)`
- [ ] **Step 7: Update execution status** in the same commit window

## Phase 2 — `booking`: disclose it on the code-gated view

**Files:** Modify `ViewBookingService.java`, `BookingDetail.java`,
`BookingDetailView.java`, `ViewBookingServiceTest.java`, `BookingViewIT.java`

- [ ] **Steps 1–2:** failing tests AC-1..AC-4 (mirror the `neverConsultsMailDelivery`
  pattern with a stub `RefundStatusLookup`) → RED
- [ ] **Step 3:** lazy consult in `toDetail`; new field on both records
- [ ] **Step 4:** `--tests "*ViewBookingServiceTest*" --tests "*BookingViewIT*"` +
  structural net → PASS
- [ ] **Step 5: Generalization audit** — other consumers of the refund decision
- [ ] **Steps 6–7:** commit + status

## Phase 3 — frontend: the processing copy

**Files:** Modify `booking.model.ts`, `booking-view.ts`, `booking-view.spec.ts`,
`booking-flow.e2e.ts`

- [ ] **Steps 1–2:** failing unit specs (outstanding → "is being processed", no "on its
  way"/"card"; not-outstanding → today's copy) + mocked e2e case → RED
- [ ] **Step 3:** model field + `@if` branch before `refundSentence`
- [ ] **Step 4:** `npm test` (booking specs) + the mocked e2e booking-flow spec → PASS
- [ ] **Step 5: Generalization audit** — `/my-bookings` copy check (open question above)
- [ ] **Steps 6–7:** commit + status

## Phase 4 — docs close-out

**Files:** Modify `CONTEXT.md`, `RESPONSIBILITIES.md`, this plan

- [ ] Glossary rows (refund decided/accepted/settled; outstanding refund) — `CONTEXT.md`
- [ ] `RESPONSIBILITIES.md` §`payment` + §`booking` one-liners for the new read
- [ ] `riviera-docs-freshness` run over `9709fed..HEAD`; record findings in Skills consulted
- [ ] Commit + status

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-09 | phase 3 | other surfaces claiming a refund is in transit | `grep -rn "on its way\|to your card" frontend/src platform/src/main` | `refundSentence` (branched this slice); `SmtpMailer.refundLine` + `BookingCancellationMail` Javadoc (mail — non-goal); `/my-bookings` shows only `amountLabelFor`, no claim | panel-only fix stands; no further sites |

---

## Acceptance-criteria verification (final)

> The gate before claiming done. Not a wish.

- [ ] **AC-1..AC-4:** run the `ViewBookingServiceTest` class → new cases PASS. Verified at `<sha>`.
- [ ] **AC-5:** run `RefundStatusServiceTest` + `JdbcPaymentsIT` → PASS. Verified at `<sha>`.
- [ ] **AC-6:** run the booking-view unit specs + the mocked e2e booking-flow spec → PASS. Verified at `<sha>`.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section justified N/A — read-only slice (invariant #2).
- [ ] Pool + cutoff rules untouched (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no event change (invariant #11).
- [ ] **Payment/payout** section filled — no money moves; webhook-written state is the read's source of truth (invariants #5, #8, #9).
- [ ] Refund policy untouched, still server-side (invariant #10).
- [ ] Timezone untouched (invariant #6). Booking codes never logged (invariant #7).
- [ ] No schema change → no migration (invariant #12).
- [ ] **Frontend** standards met; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — cites `merged via PR #NN`.
- [ ] **The review gate ran in full** — `/code-review` + `riviera-review-overlay`, per the
      invocation ladder in `references/pr-gates.md` §1.
