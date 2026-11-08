# The payment port knows which venue is paid (#1690) Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every collection `booking` starts names the venue it pays, the payment row records it,
and a collection spanning two venues is refused as a typed outcome that reaches the guest as a
problem response, never as an unhandled exception.

**Architecture:** the payee is a typed id in `payment.vocabulary` (`PayeeRef`, shaped like
`BookingRef`, carrying a logical venue id so `payment` imports no `venue` type, #11). Each
`CollectionShare` names its payee, so mixing is representable and detectable at the port;
`PaymentService` verifies the payee is one before it touches the gateway and hands the gateway that
single `PayeeRef`. Stub and Stripe demo receive it and do nothing with it (ADR-0029 decision 11),
beyond Stripe recording it on the payment row.

**Source of intent:** issue #1690 under epic #284; ADR-0029 decisions 1, 7, 11.

**Branch:** `claude/1690-payee-venue-port-d5dd44` (the worktree's designated branch).

## Acceptance criteria

- [ ] **AC-1 port and gateway carry the payee.** Given a collection for venue 7, when
  `CheckoutPort.pay` runs, then `PaymentGateway.initiate` receives `PayeeRef(7)`, and the stub and
  Stripe adapters initiate it and ignore it: the provider call is identical for any payee.
  *Seam:* `CheckoutPort`, `PaymentGateway` · *Pinned by:* `PaymentServiceTest.handsTheOnePayeeToTheGateway`;
  `PaymentGatewayPayeeContract` (`StubPaymentGatewayPayeeContractTest`, `StripePaymentGatewayPayeeContractTest`).
- [ ] **AC-2 each collection path passes its own venue.** Given an instant booking, a stay, an
  accepted request or an accepted stay request, when it collects, then every share names the venue
  of that booking. *Seam:* `CheckoutPort` as seen by `booking` · *Pinned by:*
  `CreateBookingServiceTest.anInstantBookingPaysItsSetsVenue`,
  `CreateStayServiceTest.aStayPaysTheVenueOfEveryStretch`,
  `RespondToRequestServiceTest.acceptTransitionsThenIssuesPaymentRequest`,
  `RespondToRequestServiceTest.acceptStayPaysEveryStretchsVenue`.
- [ ] **AC-3 the row records it.** Given a registered collection, then its `payment` row carries
  `payee_venue_id`. *Seam:* `Payments.register` · *Pinned by:*
  `JdbcPaymentsIT.registerRecordsThePayeeVenue`, `StripePaymentGatewayTest` (`NewPayment` equality).
- [ ] **AC-4 a mixed collection is refused, typed.** Given shares naming two venues, when
  `CheckoutPort.pay` runs, then it returns `PaymentOutcome.MixedPayees`, no gateway call is made and
  nothing is registered. Given that outcome, the instant and stay create paths release every held
  stretch and return `Rejected.SPANS_VENUES` (`422 SPANS_VENUES`), and accept reverts and returns
  `PAYMENT_INIT_FAILED`. *Seam:* `CheckoutPort`, `CreateStay`, `CreateBooking`, `RespondToRequest`,
  `Rejections` · *Pinned by:* `PaymentServiceTest.refusesACollectionForTwoVenuesWithoutCallingTheGateway`,
  `CreateStayServiceTest.aMixedCollectionReleasesEveryStretchAndIsRejected`,
  `CreateBookingServiceTest.aMixedCollectionReleasesTheBookingAndIsRejected`,
  `RespondToRequestServiceTest.aMixedCollectionRevertsTheAcceptAsAFailedPaymentSetUp`,
  `RespondToRequestServiceTest.aMixedStayCollectionRevertsEveryStretch`,
  `RejectionsTest.aCollectionSpanningVenuesIsAClientProblem`.
- [ ] **AC-5 nothing else moves.** Existing Stripe and stub suites and the structural net stay green.
  *Pinned by:* `StripePaymentGatewayTest`, `StubPaymentGatewayTest`, the structural-net command.

## Non-goals

- Using the payee: no per-venue credentials, no lookup, no ceiling check (#102, #284 P2).
- Reshaping `PaymentOutcome.Pending` (#1691). `MixedPayees` is an added case, so #1691 only touches `Pending`.
- A frontend mapping for `SPANS_VENUES`: unreachable today (a stay belongs to one venue, V65), and
  `bookingErrorOf` already falls through to `UNKNOWN`.
- Tightening `payee_venue_id` to `NOT NULL`, or a foreign key (see Risks).

## Risks

- **R-1 a `Failed` outcome becomes an unhandled throw on the create paths.** `CreateBookingService`
  and `CreateStayService` turn `Failed` into `PaymentDeclinedException`, which no advice maps, so
  reusing `Failed` would be the exception-leak the issue forbids → `MixedPayees` is its own sealed
  case, mapped to a typed `Rejected`.
- **R-2 a mixed collection leaves claims held.** It is refused after the reserve commit → the new
  arms run the same compensation as `Failed` (release every stretch; accept: revert), pinned by the
  AC-4 tests.
- **R-3 a migration against non-empty non-prod data.** `payment_booking.booking_ref` is a logical
  reference and test data carries refs with no booking row (`PaymentRefundBackfillIT`), so a
  backfill cannot guarantee a value → the column is nullable and old rows stay empty (the issue's
  allowance; there are no live payments). No FK: `payment` stays independent of another module's
  table, as `booking_ref` does (#11, V7/V64). No index: nothing reads it yet.
- **R-4 V80 claimed.** Sibling #1688 takes V79 and merges first (orchestrator).

### Resolved

- *Backfill or leave empty?* Left empty (R-3).

## Availability & concurrency

The claim path (#2) is unchanged. The refusal arms release committed claims through the existing
guarded seams (`ReleaseAbandonedBooking`, `RequestClaimService.revert/revertStay`), which already
handle a concurrent confirm or remodel. Write paths to `set_availability` are unchanged.

## Modulith

No new port, event or grant: `booking` already holds `payment::api` + `::vocabulary`. New
vocabulary type `PayeeRef` (owner `payment`, consumer `booking`). The one-payee rule has one caller,
so it stays inline in `PaymentService` (ADR-0018 §1).

## Payment & payout

No money movement changes. Stripe's idempotency key, amount and metadata are untouched and pinned
by AC-1's contract. Nothing is sent to Stripe about the venue; no Connect field (ADR-0002,
`NoStripeConnectArchitectureTest`). The ledger is untouched (#9); the refund policy is untouched (#10).

## FE↔BE contract

New problem code `SPANS_VENUES` (`422`) on `POST` booking and stay create. Unreachable through
today's data; the SPA renders it as its generic failure.

## Phases

- **Phase 0 — the payee reaches the gateway and the row:** `PayeeRef`, the share, the port, the
  gateway, `NewPayment`, V80, `JdbcPayments` · red: `PaymentServiceTest.handsTheOnePayeeToTheGateway`,
  the contract, `JdbcPaymentsIT.registerRecordsThePayeeVenue`.
- **Phase 1 — every path passes its own venue:** the four collection calls in `booking`, written
  against a placeholder payee first · red: the four AC-2 tests.
- **Phase 2 — a mixed collection is refused, typed:** `MixedPayees`, the guard, the booking arms,
  `Rejected.SPANS_VENUES` · red: the AC-4 tests.

## Execution status

**Stage pointer:** PR (phases done; draft → merge `origin/main` → ready for review)

**Next action:** open the draft PR, merge latest `origin/main`, mark ready, run the review gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — payee to gateway and row | ✅ | |
| 1 — every path passes its venue | ✅ | |
| 2 — mixed collection refused | ✅ | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
