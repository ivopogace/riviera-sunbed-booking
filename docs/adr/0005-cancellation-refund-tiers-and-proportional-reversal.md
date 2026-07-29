# ADR-0005: Cancellation refund tiers + proportional payout reversal

- **Status:** Accepted
- **Date:** 2026-06-29
- **Context slice:** U6 (issue #11) — view & cancel booking + cancellation policy/refund.

## Context

A tourist can cancel a confirmed booking. Invariant #10 fixes the spine: free cancellation
until the evening-before cutoff (`Europe/Tirane`) → full refund; after → "non-refundable (or
partial)". Two points were left open and decided here:

1. **What "partial" means.** The "(or partial)" in invariant #10 is a real policy lever, not a
   fixed number.
2. **What a cancellation does to the venue's payout.** Issue #11 says a cancel "posts a REVERSAL"
   unconditionally. But after the cutoff the tourist is non-refundable while the platform keeps
   the money — a blanket full reversal would pay the venue €0 for a spot it held, and once
   *partial* refunds exist a blanket reversal also lets the platform keep money the venue earned.
   The payout ledger must record what is **actually owed** (invariant #9).

## Decision

**Refund tiers (computed server-side, never from the client — invariant #10):**

- **Before the cutoff:** full refund (100% of the gross).
- **After the cutoff:** a **per-venue configurable** share — `venue.late_cancel_refund_bps`
  (basis points, `0..10000`, **default 0** = non-refundable). `refund = floorDiv(gross × bps,
  10000)`, rounded **down** (the platform keeps the sub-cent, consistent with commission rounding
  in ADR/U5). The set is always freed regardless of tier (invariant #2).

**Payout reversal mirrors the refund (proportional):**

- The `payout` REVERSAL is sized to the refunded amount `R`, derived from the booking's original
  ACCRUAL `(gross G, commission C)`: `reversal_gross = R`, `reversal_commission = floorDiv(C × R,
  G)`, `reversal_net = R − reversal_commission`. A full refund (`R = G`) reverses the whole
  accrual; a partial refund reverses the matching fraction; **`R = 0` posts no reversal** (the
  accrual stands — the venue keeps its share of money the platform kept).
- Reversal rows store **positive** magnitudes (the V9 `CHECK (net = gross − commission)` and
  `>= 0` constraints forbid negatives); the sign is carried by `entry_type = REVERSAL`, which the
  payout sum (U9) interprets. Exactly-once via `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO
  NOTHING` under the Event Publication Registry's at-least-once redelivery (invariant #9).

## Consequences

- The ledger stays economically consistent at every tier: the platform reverses only the venue's
  share of money it actually returned.
- One new venue column (`late_cancel_refund_bps`, V10); no payout schema change (V9 already admits
  `REVERSAL`).
- The reversal listener reads the prior ACCRUAL to mirror it. Cancellation is a human action long
  after confirmation, so the accrual (async, posted right after confirm-commit) is durably present;
  a missing accrual posts no reversal rather than a wrong one (accepted edge, like U5's R-7).
  **Amended by #428 — see the amendment below.**
- This **extends** issue #11's "posts a REVERSAL" to "posts a REVERSAL sized to the refund, or
  none". Recorded so a future session does not revert to a blanket reversal.

## Alternatives considered

- **Always full reversal on cancel** (issue #11 literal). Rejected: pays the venue €0 on a
  non-refundable late cancel and lets the platform keep the venue's share on a partial refund —
  breaks the "ledger = what is owed" principle (invariant #9).
- **Recompute the reversal from the current venue commission rate** instead of mirroring the stored
  accrual. Rejected: a commission-rate change between confirm and cancel would make the reversal
  fail to net the accrual out.
- **Fixed (non-configurable) partial %.** Rejected: venues differ; a per-venue bps column is one
  column and mirrors `commission_bps`.

## Amendment (2026-07-29, #428) — a missing accrual defers, it does not decline

One consequence above said *"a missing accrual posts no reversal rather than a wrong one (accepted
edge, like U5's R-7)"*. The **decision** it supports is unchanged and re-affirmed: the reversal is
still sized to the refund and still **mirrors the stored accrual** rather than recomputing from the
venue's current rate (that alternative stays rejected, for the reason given above — a rate change
between confirm and cancel would stop the reversal netting out). What is amended is only the handling
of the edge, because the premise underneath it was wrong.

**The premise.** "Cancellation is a human action long after confirmation, so the accrual is durably
present" reasons about *when the events happen*, but what matters is *when they are delivered*. The
accrual and the reversal are **independent Event Publication Registry publications**: a crash, or a
shed send, can leave `BookingConfirmed`'s payout listener outstanding until the next restart's
republish, while `BookingCancelled` is delivered and completed in between. The accrual then posts
*after* the only event that would have reversed it was consumed.

**Why "no reversal" was the wrong edge-handling.** Returning normally completed the reversal's
publication, so the outcome was permanent and invisible: the ledger kept an accrual for a refunded
booking, overstating what the venue is owed (invariant #9), with one `WARN` as the entire record. The
cited precedent also pointed the other way — U5's R-7 chose to **throw** on a missing commission rate
("loud over silent under-pay"), so the two halves of the same pair had opposite postures.

**The amendment.** A refunded cancellation that finds no ACCRUAL now **throws**, so its publication
stays outstanding, `riviera.outbox.pending` (a money-path signal `MoneyPathAlertCheck` already
watches) shows it, and the restart republish retries the reversal against a ledger that has the
accrual by then. `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO NOTHING` keeps that retry
exactly-once, so nothing about the arithmetic or the exactly-once guarantee changes. A refund only
exists for a captured payment, so the accrual is always *coming* — "empty" means **not yet**, never
**never**. Accepted cost: if the accrual is *permanently* broken, this publication parks in the
outbox and holds the gauge non-zero until someone acts — deliberately preferred to a ledger that
quietly pays out on a refunded booking.

Recorded so a future session does not "simplify" the throw back into a silent return. Rationale in
full on `BookingCancelledPayoutListener`; found by #428's generalization audit, filed as #431 and
fixed in PR #430.
