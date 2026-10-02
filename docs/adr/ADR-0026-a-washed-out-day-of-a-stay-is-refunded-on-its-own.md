# ADR-0026: A washed-out day of a stay is refunded on its own, and the stay continues

- **Status:** Accepted — implemented by the slice for issue #1210 (epic #1096, design D5 option A,
  decided 2026-09-24). *Amended 2026-09-29 by ADR-0027:* §3 holds for weather only; the venue's own
  day refund (reason `VENUE`) releases its day. §7 holds for that reason too. *Amended 2026-10-02 by the
  slice for issue #1300:* §8, the remodel's complement to §7. *Amended 2026-10-02 by the slice for issue #1381:*
  §7 names where it is enforced outside the remodel.
- **Date:** 2026-09-28
- **Relates to:** `docs/architecture/multi-day-stays.md` § D5, D8, ADR-0020 (§8's *nothing left* is a sixth
  outcome of the remodel it composes), ADR-0005 (the server-side refund
  it leaves whole for the remainder), ADR-0021 (the ledger's sign convention it extends), ADR-0024 (a
  stay is a group of bookings, so a day belongs to one stretch), invariants #2, #5, #7, #8, #9, #10,
  `RESPONSIBILITIES.md` § `booking`, § `payment`, § `payout`, § `notification`.

## Context

The weather refund began as a one-day rule: an operator declares `(venue, date)` washed out and every
booking for that day is cancelled and refunded in full. Once a booking spans several days (#1201) a
storm mid-stay is a day of a holiday that goes on, and cancelling the whole stay for it is wrong in
both directions: the guest loses days they still want, the venue refunds days it will still serve. So
#1201 refunded the one-day bookings and merely **named** every overlapping stay for a manual refund.

The money model could not express the alternative. The payout ledger allows one `REVERSAL` per
booking, ever (`UNIQUE (booking_id, entry_type)`, invariant #9); `payment` records one refund per
booking's share (`payment_booking.refund_id`) with an absolute `refunded_minor` and the key
`booking-<id>-refund`; the guest cancellation policy quotes over the booking's whole amount. A day
refund is a **partial refund on a live booking**, followed possibly by a second refund when the guest
later cancels, and each of those three places would count it as the one refund a booking gets.

Three questions were open at intake and are answered by the owner (2026-09-28): whether a `COMPLETED`
stay's missed stormy day is refunded; what happens to the set on a refunded day; and whether a
one-day stretch of a stitched stay is a booking of its own or a day of the stay.

## Decision

1. **The day decides, not the status.** A booking that happened (`CONFIRMED`, `COMPLETED` or
   `NO_SHOW`; `BookingStatus#stormDayRefundable`) has its stormy day refunded iff that day is neither
   attended nor already refunded. A day the guest checked into keeps its money and the outcome names
   the booking by id; a day the sweep marked missed is refunded. A **lone one-day booking** keeps the
   whole-cancel leg exactly as before (a `COMPLETED` one-day booking attended its day, so both rules
   exclude it); **every other row — a stay, or any stretch of a stitched stay, one-day stretches
   included — takes the day leg.**
2. **The refund is the day's own rate, stamped on the service day.** `booking_day` gains
   `refunded_at` and `refund_minor` (V68), both or neither, never beside `attended_at`; missed and
   refunded may sit together. The amount is `DayShare.on(amount, first, last, day)`: every booking row
   is one set at one price, so the split is exact and a stitched stay refunds the rate of the stretch
   covering the date. `booking` publishes one `BookingDayRefunded` (id-based, the day, the amount) and
   is its sole writer.
3. **Nothing is released; the set stays the guest's on the refunded day.** *Amended 2026-09-29 by
   ADR-0027:* for weather only; a `VENUE`-refunded day is released and the hole shown. A release would let a second
   booking claim the set while the stay's row still covers the date, and the daily list, the layout
   lock and the beach map would disagree. Check-in on a refunded day answers `DayRefunded` and stamps
   nothing; the no-show sweep and the stay outcome ignore the day; daily takings exclude it. A check-in
   on the last unrefunded day resolves the stay, as the last day's did before.
4. **The ledger gains `DAY_REVERSAL`, keyed by the day.** `payout_ledger_entry.service_date` names it
   and the exactly-once key widens to `UNIQUE NULLS NOT DISTINCT (booking_id, entry_type,
   service_date)` (V69), so the three dateless types keep one row per booking and a day reverses at
   most once. Direction is the type (ADR-0021): every sum already reads "only an `ACCRUAL` adds", so
   the new type deducts with no query change. Each reversal reads what earlier reversals took
   (`Reversed`) and the one that brings the booking's reversed gross to its accrual returns the
   commission still held, so a booking reversed in parts nets exactly zero. A booking's reversals
   serialize on its accrual row (`findAccrual … FOR UPDATE`).
5. **`payment` holds one row per refund.** `payment_refund` (V70) carries each refund of a share with
   its `scope` — `BOOKING` for the whole share, `DAY` plus the service day — its `refund_id`, attempt
   and failure trace; `payment_booking.refunded_minor` becomes the running sum, so
   `refunded_minor ≤ amount_minor` still makes over-refunding a share impossible. `RefundPort` gains
   `refundDay`; the gateway key is `booking-<id>-day-<yyyy-MM-dd>-refund` and the Stripe refund is
   tagged `serviceDate` beside `bookingRef`, so adoption after a lost response is per scope. The
   whole-share key and `PaymentGatewayRefundContract` keep their shape; the contract gains the
   day-then-cancellation case.
6. **A later refund of the whole booking is the remainder.** `BookingRecord#remainingMinor` is the amount
   less the days refunded; `CancellationPolicy` quotes on it (invariant #10) and the cancel's tier is
   judged against it; a remodel's `VENUE_CHANGE` refund (`LiveClaim#remainingMinor`) is the remainder
   too. The cancel takes the booking row lock in a statement of its own before it reads the remainder, so a
   day refunded under that lock is counted, never refunded twice (#1281); the write stays guarded on the
   quoted remainder as the backstop. On the payment side the refunds of one share serialize on its intent's `payment`
   row (`FOR UPDATE` before the write, #1298), so the running sum never loses a concurrent refund.
7. **A stay whose every day ends up refunded stays live**, with nothing left to refund: no cancel, no
   release, no cancellation mail; the sweep resolves it as any stay. Rare, and the honest state. *Amended
   2026-10-02 by the slice for issue #1381:* enforced by the guest cancel (`CancelOutcome.NothingLeft`, a `409`;
   a stay's such stretch is set aside by `LiveRemainder` as a remodel-ended one is), the code-gated view
   (`cancellable` false, `nothingLeft` true, shown as "Refunded") and the move reminder (sent only for a move day
   the guest holds; a refunded departure day drops "instead of today's"). The outcome stays `NO_SHOW`.
8. **A remodel ends such a booking quietly, as *nothing left*** (*added 2026-10-02, issue #1300*). A
   `CONFIRMED` claim with no unrefunded day, outside the frozen zone, is classified *nothing left* before
   the move search, move-only included, so it never takes a candidate; a frozen one stays kept. The commit
   ends it with the guarded `CONFIRMED → CANCELLED` (`VENUE_CHANGE`, refund 0) under its row lock, frees each
   day it still holds once (#2) and writes a `NOTHING_LEFT` receipt line at amount and fee 0 (V75), which is
   the audit trail: no `BookingCancelled`, so no mail (in §7's spirit), no ledger entry (#9), no refund or
   void. The move and refund legs decide under the same lock, so a day refunded after classification
   settles the same way. Keyed on "no unrefunded day", never on a zero remainder: a €0-share day is still the guest's.

## Consequences

- The operator outcome separates cancelled one-day bookings from refunded stay days and lists the
  checked-in bookings it kept; the "stays for a manual refund" list is gone. The guest gets one mail
  per refunded day (`BookingDayRefunded` → `notification`) and the booking page lists the days.
- `payout` gains a listener and a fourth entry type; the console's ledger labels a day reversal by its
  day. `payment` gains a table and a port method; its owed-refund enumeration moves to
  `payment_refund`. `booking` gains an event, a listener pinned in `RegistryRefundOutbox`, a check-in
  outcome and a `DayAttendance` state.
- Per-day rounding: the parts of a booking's commission are floor-rounded and the last reversal
  closes the difference, so the ledger never carries a stray cent for a booking reversed whole.

## Rejected alternatives

- **A remodel skipping a booking with nothing left** (§8) — the layout write's live probe still sees a
  `CONFIRMED` booking on the set and refuses the save until the sweep closes it, and its weather-refunded
  days stay held on a set being removed. Treating it as an ordinary claim refunds €0 with a fee quoted, or
  moves it, taking a candidate from a real guest and mailing them about days they don't hold.

- **Cancelling the stay for the storm** (the one-day rule applied to a span) — refunds days the venue
  still serves and takes days the guest still wants.
- **A separate per-day reversal table** — duplicates the ledger's idempotency guard and splits the
  audit trail ADR-0021 kept whole; the ledger's sign convention already makes a new type a deduction.
- **Re-keying `UNIQUE (booking_id, entry_type)` on a day for every type** — the dateless types would
  lose their one-row-per-booking guard; `NULLS NOT DISTINCT` keeps it and adds the day only where a day
  exists.
- **Keeping the whole-refund columns on `payment_booking` and adding a day table** — two sources for
  the intent's derived status and the refund progress, and a second copy of the failure trace.
- **Releasing the refunded day's availability** (*for weather; ADR-0027 chooses it for the venue's own
  refund and shows the hole*) — a hole in a stay the daily list, the layout lock and
  the map cannot represent.
- **Dividing the stay's total by its days** — wrong across stretches of different rates; the stretch's
  own rate is exact.
