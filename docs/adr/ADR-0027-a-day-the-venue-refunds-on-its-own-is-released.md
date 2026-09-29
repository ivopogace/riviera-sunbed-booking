# ADR-0027: A day the venue refunds on its own is released, and the stay goes on around it

- **Status:** Accepted — decided by the owner 2026-09-29 (issue #1272); implemented by the slices under
  #1272. Amends ADR-0026 §3 for the reason it introduces; ADR-0026 stands as written for weather.
- **Date:** 2026-09-29
- **Relates to:** ADR-0026 (the day leg this reuses), ADR-0005 (the server-side policy the remainder
  keeps), ADR-0013 and ADR-0017 (the admin audit trail), ADR-0021 (the ledger's sign convention; the
  fee this does not charge), invariants #2, #5, #7, #9, #10, #13, `RESPONSIBILITIES.md` § `booking`,
  § `payment`, § `payout`, § `notification`, § *Platform edge*, `CONTEXT.md` § *Booking &
  availability*, § *Money*.

## Context

ADR-0026 taught the money model a partial refund on a live booking: one day of a stay refunded at its
own rate, a `DAY_REVERSAL` on the payout ledger, a `payment_refund` row per scope, and the stay goes on.
The only way in is the operator's weather refund for `(venue, date)`, which refunds every stay covering
that date and keeps every refunded day's set held, because the venue is closed and nobody can use it.

A venue also refunds one guest for reasons of its own: a pool closed for repair, a broken umbrella, a
goodwill gesture after a complaint. Nothing decided who may do that, at what grain, what becomes of the
set, and what the guest and the books are told. The mechanism is weather-shaped end to end — the
service day carries no reason, `BookingDayRefunded` carries none, the ledger's day reversal is fixed to
`WEATHER`, and the guest mail, the booking page, the daily view and the check-in refusal all say
"weather" — so a second reason is an entry point plus authorization, a stamp and copy, not a new money
path.

## Decision

1. **Two actors, one use case.** The venue's operator, on their own venue (invariant #13), and a
   platform admin through a mutating `/api/admin/**` action the edge audits (actor, path, status, the
   optional grounds header). The admin finds the booking by the guest's email and acts on the booking
   **id**: a booking code never sits in an audited path (invariant #7). The application service takes
   the actor and records it on the service day, without a foreign key, as the remodel receipt does.
2. **Per guest and day.** One booking, one service day: the operator acts from the staff daily view's
   row for the viewed date, the admin from the booking the lookup named. The venue-wide grain stays
   the weather refund; a reasoned "closure" of a whole date is not added.
3. **One fixed reason, `VENUE`, beside `WEATHER`.** Stamped on the service day, carried by
   `BookingDayRefunded` (as `BookingCancelled` carries its `RefundReason`), written on the ledger's
   `DAY_REVERSAL` and, for a lone one-day booking, on the cancellation. No free text reaches the guest,
   the ledger or the mail: an admin's grounds live in the audit trail alone, an operator offers none.
4. **The day is released.** Where a weather-refunded day keeps its set (ADR-0026 §3: the venue is
   closed, the guest may still be there), a `VENUE`-refunded day is a day the venue has decided the
   guest will not use, so the online claim for `(set, day)` is freed and the set is sellable again. The
   service day records **that it was released** as a stamp of its own, so the two kinds of refunded day
   are told apart by a fact, never inferred from the reason. A past day is refunded but not released,
   as the no-show sweep frees no past claim.
5. **A hole in a stay is visible, not hidden.** The staff daily view keeps the stay's row on the released
   date and marks it refunded and released, so a second guest on the same set that day reads as what it
   is. Check-in on that day is refused and says the spot was released. The sweep, the stay outcome and
   daily takings treat it as any refunded day (ADR-0026 §3); a stitched stay's move plan is untouched.
6. **A lone one-day booking is cancelled whole**, reason `VENUE`: refunding and releasing its only day
   leaves nothing of it, and a live booking with no set and nothing owed is a cancellation in disguise.
   Full refund whatever the cutoff (invariant #10), every day released, one `REVERSAL`, the
   cancellation mail — the weather refund's one-day leg with a different reason.
7. **Eligibility is the weather refund's.** A booking that happened (`CONFIRMED`, `COMPLETED` or
   `NO_SHOW`), a day neither attended nor already refunded, a missed day included, past or future. An
   attended day is never refunded; that stays out of scope.
8. **The money is ADR-0026's.** The day's own rate (`DayShare`), the same `DAY_REVERSAL` arithmetic —
   the commission comes back pro rata, and no `FEE`: the venue-change fee is a remodel's (ADR-0021), not
   a goodwill refund's. A later cancellation is quoted over the remainder, as today.
9. **The guest is told who and what, not why.** The mail and the booking page say the venue refunded
   the day and its amount and, for a day still ahead, that the spot is no longer held; they never
   speculate on grounds. The weather copy stays weather's.

## Consequences

- `RefundReason` gains `VENUE`, in lockstep with the booking and ledger check constraints, and serves
  the day reversal, the lone booking's cancellation and the outcome the operator reads.
- The service day gains a reason, a released stamp and the actor; `BookingDayRefunded` gains the
  reason; the daily view's row, the check-in refusal, the guest mail and the booking page branch on it.
- `booking` gains a per-guest day-refund use case behind an operator endpoint on the venue and an
  audited admin endpoint on the booking id, plus an admin lookup of a guest's bookings by email. The
  admin console gains the corresponding action; the operator console's daily view gains a row action
  with a two-step confirm, as the weather refund has.
- A released day can be booked by another guest while the stay's row still covers the date. Every read
  that lists a set's bookings on a date must tolerate two rows on one set, one of them refunded and
  released. The layout lock still counts the stay as live on that date, which is the conservative side.
- ADR-0026 §3's "nothing is released" now reads "for weather". The stated hazard — a hole the daily
  list, the layout lock and the map cannot represent — is answered by showing the hole (decision 5),
  not by avoiding it.

## Rejected alternatives

- **Keeping the day held for every reason** — idles a set the venue has just paid to take back; a
  guest who keeps using the day had nothing refunded.
- **Letting the operator choose hold or release per refund** — two code paths, two guest copies and a
  question staff cannot answer at the counter.
- **A venue-wide "closure with a reason"** — already the weather refund; the cases at hand are one
  guest's.
- **A list of reasons, or free text, shown to the guest** — grounds sanitized into a mail and a ledger
  are a liability and a drift surface; the audit trail already holds the admin's, and the venue's
  grounds are the venue's conversation with its guest.
- **The booking code in the admin path** — the audit filter records the path, so the bearer credential
  would be logged in clear (invariant #7); the email lookup then the id keeps it out.
- **Operator only, or admin only** — a guest complaint reaches the platform as often as the venue, and
  a venue must not need the platform to make a gesture on its own beach.
