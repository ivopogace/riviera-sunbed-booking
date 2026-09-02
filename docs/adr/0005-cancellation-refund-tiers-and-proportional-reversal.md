# ADR-0005: Cancellation refund tiers + proportional payout reversal

- **Status:** Accepted
- **Date:** 2026-06-29
- **Context slice:** U6 (issue #11) — view & cancel booking + cancellation policy/refund.

## Context

A tourist can cancel a confirmed booking. Invariant #10 fixes the spine: free cancellation until
the evening-before cutoff (`Europe/Tirane`) → full refund; after → "non-refundable (or partial)".
Three points were open and are decided here: what "partial" means; what a cancellation does to
the venue's payout (a blanket full reversal would pay the venue €0 for a spot it held after the
cutoff, and once partial refunds exist it also lets the platform keep money the venue earned —
the ledger must record what is **actually owed**, invariant #9); and how long "after the cutoff"
lasts, since a confirmed booking left cancellable forever lets a guest consume the stay and
reclaim money afterwards.

## Decision

**Cancellation is classified by a `CancellationWindow` with three values, computed in
`Europe/Tirane` by `BookingCutoff` (invariants #4/#6):**

- **`FREE`** — before the venue's evening-before cutoff. Full refund (100% of the gross).
- **`LATE`** — from that cutoff until the service day opens. A **per-venue configurable** share:
  `venue.late_cancel_refund_bps` (basis points, `0..10000`, **default 0** = non-refundable);
  `refund = floorDiv(gross × bps, 10000)`, rounded **down** (the platform keeps the sub-cent,
  consistent with commission rounding). The set is freed regardless of tier (invariant #2).
- **`CLOSED`** — from `00:00` on the booking date onward. The cancellation is **refused**
  (`CancelOutcome.WindowClosed` → `409 CANCELLATION_WINDOW_CLOSED`): nothing is refunded, the
  `(set, date)` row is not released, and **no `BookingCancelled` is published**, which is what
  keeps the refund and the reversal from happening at all rather than computing them as 0.
  Closing at the service day's *start*, not its end, is what closes consume-then-reclaim; the
  accepted cost is that `LATE` shrinks to the hours between the venue's cutoff and midnight,
  making `late_cancel_refund_bps` a narrow goodwill lever rather than a day-of-service one.

**Refund tiers are computed server-side, never from the client** (invariant #10).

**The payout reversal mirrors the refund (proportional):** the `payout` REVERSAL is sized to the
refunded amount `R`, derived from the booking's original ACCRUAL `(gross G, commission C)`:
`reversal_gross = R`, `reversal_commission = floorDiv(C × R, G)`, `reversal_net = R −
reversal_commission`. A full refund reverses the whole accrual; a partial refund reverses the
matching fraction; **`R = 0` posts no reversal** (the venue keeps its share of money the platform
kept). Reversal rows store **positive** magnitudes (the ledger's `CHECK (net = gross −
commission)` and `>= 0` constraints forbid negatives); the sign is carried by
`entry_type = REVERSAL`. Exactly-once via `UNIQUE(booking_id, REVERSAL)` + `ON CONFLICT DO
NOTHING` under the Event Publication Registry's at-least-once redelivery (invariant #9).

**A missing accrual defers, it does not decline.** The accrual and the reversal are independent
registry publications: a crash or a shed send can leave `BookingConfirmed`'s payout listener
outstanding until the next restart's republish while `BookingCancelled` is delivered in between.
A refunded cancellation that finds no ACCRUAL therefore **throws**, so its publication stays
outstanding, `riviera.outbox.pending` (a money-path signal `MoneyPathAlertCheck` watches) shows
it, and the republish retries against a ledger that has the accrual by then. A refund only exists
for a captured payment, so the accrual is always *coming* — "empty" means **not yet**, never
**never**. Accepted cost: a permanently broken accrual parks this publication in the outbox and
holds the gauge non-zero until someone acts — deliberately preferred to a ledger that quietly
overstates what the venue is owed. Rationale in full on `BookingCancelledPayoutListener`.

**Scope: the guest path only.** `WeatherRefundService` deliberately stays outside the window
fence. A storm is only known afterwards, the refund is full rather than a reclaimed share, and it
returns the venue's own money behind an `assertOwns` check (invariant #13). Pinned by
`WeatherRefundServiceIT.fullRefundRegardlessOfCutoff`, which seeds on a past date.

## Consequences

- The ledger stays economically consistent at every tier: the platform reverses only the venue's
  share of money it actually returned.
- The reversal listener reads the prior ACCRUAL to mirror it, never the venue's current rate.
- A future session must not "simplify" the missing-accrual throw back into a silent return, read
  "two tiers" as the whole rule, or fence the weather refund for symmetry.

## Alternatives considered

- **Always full reversal on cancel** (issue #11 literal). Rejected: pays the venue €0 on a
  non-refundable late cancel and lets the platform keep the venue's share on a partial refund.
- **Recompute the reversal from the current venue commission rate** instead of mirroring the
  stored accrual. Rejected: a commission-rate change between confirm and cancel would make the
  reversal fail to net the accrual out.
- **Fixed (non-configurable) partial %.** Rejected: venues differ; a per-venue bps column is one
  column and mirrors `commission_bps`.
- **A missing accrual posts no reversal** (the original edge handling). Rejected: returning
  normally completed the reversal's publication, so the ledger permanently overstated what the
  venue was owed with one `WARN` as the entire record.
- **Close the window by writing `COMPLETED` after the service day** instead of a `CLOSED` tier.
  Not what shipped here: the takings read filtered on `CONFIRMED` at the time, and `NO_SHOW`
  needed check-in data that did not exist. The check-in lifecycle later shipped on its own
  acceptance criteria; the fence is correct independently of it.

## Amendment log

- 2026-07-29, #428 — a missing accrual defers (throws) instead of declining.
- 2026-08-08, #566 — the third `CLOSED` tier at service-day open; the weather refund stays
  outside the fence.
