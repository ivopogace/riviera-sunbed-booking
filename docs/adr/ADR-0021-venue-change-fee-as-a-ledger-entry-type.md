# ADR-0021: The venue-change fee is a third payout-ledger entry type, and the entry type carries the sign

- **Status:** Accepted — implemented by the slice for issue #1036 (epic #1027, user stories 33–34).
- **Date:** 2026-09-10
- **Relates to:** ADR-0002 (collect-only, no Stripe Connect — the fee moves no money at the
  gateway), ADR-0005 (the proportional reversal it rides beside), ADR-0020 (the remodel's
  orchestration home, which is why the fee reaches the preview by inversion), invariants #5, #9,
  #11, #12, `RESPONSIBILITIES.md` § `payout`, `CONTEXT.md` § *Money*.

## Context

A remodel that strands a confirmed booking refunds it in full and reverses the venue's accrual, so
the venue keeps nothing from a guest its own change turned away. Story 33 asks for more than
neutrality: the venue should feel the cost of changing a guest's deal, as a fixed amount on its
payout statement. Two questions had to be answered together — **where the charge lives**, and
**which refunds earn it**.

Where it lives is constrained by what already exists. The ledger is the auditable record of what
the platform owes a venue (invariant #9), it is append-only, and it already gives exactly-once
posting per booking through `UNIQUE (booking_id, entry_type)`. It also enforces its own arithmetic:
`payout_amounts_check` forbids negative amounts, and `payout_net_check` binds
`net = gross − commission`. A fee has neither a gross nor a commission, so it does not fit those
checks as written.

Which refunds earn it is a product question the reason token cannot answer on its own. Since
issue #1035, `VENUE_CHANGE` covers **two** shapes: the remodel refunding a booking it could not
move, and a guest the remodel *moved* later taking the free exit that move earned them. Only the
commit receipt tells them apart, through `BookingNotificationFacts#endedByRemodel`.

## Decision

1. **The fee is a third `entry_type` on `payout_ledger_entry`: `FEE`.** Its `gross_minor` and
   `commission_minor` are both `0` and its `net_minor` is the whole charge, so V54 exempts `FEE`
   from `payout_net_check` — keyed on the entry type alone, leaving `ACCRUAL` and `REVERSAL` bound
   as before. `payout_amounts_check` still binds it. Idempotency needs nothing new:
   `UNIQUE (booking_id, entry_type)` already gives one `FEE` per booking under the Event Publication
   Registry's at-least-once redelivery.

2. **Direction lives in the entry type, never in the amount, and the default is "deducts".** A
   payout is `Σ ACCRUAL.net − Σ REVERSAL.net − Σ FEE.net`. Every sum in the tree is written as *only
   an `ACCRUAL` adds* rather than as *a `REVERSAL` subtracts*, so a fourth type is a deduction until
   someone says otherwise — the safe direction, since the failure mode of the other default is
   silently overpaying a venue. Each ledger read's test carries a `FEE` row whose expected total only
   holds if the fee deducts.

3. **It is posted by the existing cancelled-booking payout listener, keyed on
   `reason == VENUE_CHANGE` alone**, in the same transaction as the reversal. Its position in that
   method is load-bearing twice over: after the zero-refund return, so a remodel *release* of an
   unpaid booking stays free (nothing was collected, so nothing is reversed); and after the accrual
   lookup, so a deferred reversal defers its fee with it rather than charging for a refund the ledger
   has not yet reversed.

4. **Both `VENUE_CHANGE` shapes pay.** A guest's free exit exists only because the venue moved them,
   so "the cost of changing a guest's deal" covers it. Charging only the forced refund would also
   leave a loophole — move a guest somewhere they will abandon and the change is free — and would
   need `payout` to consume `endedByRemodel` off `BookingNotificationFacts`, a `notification`-role
   port, or a widened, registry-persisted event payload. Neither is worth buying a loophole.

5. **The amount is `riviera.payout.venue-change-fee-minor`, flat, platform-wide, default 500 (EUR).**
   The flat fee is regressive on a cheap booking — 5 EUR on a 12 EUR set — and that is accepted for
   version one. Issue #1037 makes it admin-editable and audited.

6. **It reaches the remodel preview by inversion, not by a new dependency on `payout`.** `payout`
   decides the amount, and nothing may depend on `payout` — `CompositionRootDisciplineTests` names it
   among the modules a root class may not touch, which is what keeps the edge from re-growing
   cross-module domain orchestration. So `booking` declares `booking.spi.VenueChangeFeeRate` and
   `payout` implements it, the shape `booking.spi.ConfirmationMailDelivery` and
   `customer.spi.GuestBookingHistory` already use. `RemodelClaims` gains one method on the
   conversation it already holds rather than a fifth narrow port.

7. **A commit records the rate it quoted onto its receipt line** (`remodel_receipt_outcome.fee_minor`),
   so a receipt reads back what the operator confirmed rather than today's rate — the lesson V39 taught
   for the commission schedule.

   It is deliberately **not** a pin on what the ledger charges, and cannot be one: the fee is a
   configured amount that the commit and the (asynchronous) payout listener each read, and the second
   shape the fee covers — a moved guest's free exit — charges one with no receipt line at all, because
   it writes no receipt outcome. Within a running instance the two reads are the same immutable bean and
   cannot differ. They can only diverge if the property changes in a deploy while a `BookingCancelled`
   publication is still outstanding, which is unreachable while the fee is a static property. **Making
   it editable is what makes that window real, so #1037 owes the rate an effective-dated schedule of its
   own**, exactly as the commission rate has one — a decision that belongs with the editing surface, not
   ahead of it.

## Consequences

- The venue's payout statement, the console's period totals, the BKT batch and the admin report all
  net the fee out with no per-read arithmetic of their own.
- A new entry type is now a schema change plus one CHECK edit, and the sums need no touching.
- `payout` gains its first implemented `spi`; `booking.spi` goes from one port to two. Its admin
  surface grows a second read beside the payout-batch report.
- A venue whose fees exceed its accruals in a period nets negative. The ledger and the batch already
  allow that (`payout_batch.total_net_minor` has no non-negative CHECK, deliberately); settlement is
  a manual BKT transfer, so a negative period is carried by the founder rather than by an automated
  debit.
- The two `VENUE_CHANGE` shapes remain indistinguishable in the ledger. An admin who needs to tell a
  forced refund from a guest's own exit reads the commit receipt, which is where that fact lives.

## Rejected alternatives

- **A negative `ACCRUAL`.** It would break `payout_amounts_check`, put direction in the amount where
  the ledger has always kept it in the entry type, and make every existing sum's `CASE` a lie.
- **A separate `venue_fee` table.** It would duplicate the ledger's idempotency guard, split the
  audit trail the ledger exists to be, and force every payout sum to join a second table — for a row
  that is, in every respect that matters, a ledger entry.
- **Keeping the commission on a refunded booking instead of charging a fee.** Opaque to the venue
  (the charge would appear as a refund that did not fully reverse), variable where the product wants
  a fixed cost, and unable to express a charge at all where the accrual is reversed in full.
- **Posting the fee from a new listener of its own.** It would need its own idempotency reasoning and
  its own deferral story, and could charge a fee for a refund whose reversal never posted.
- **Granting the composition root `payout::api`** so the preview could read the rate directly. It
  contradicts the composition-root rule by name and would reopen the pattern that rule exists to
  prevent, for one configured number.
