# ADR-0024: A stitched stay is a group of bookings, not one booking with segments

- **Status:** Accepted — implemented by the slice for issue #1208 (epic #1096, user stories 6–10,
  13, 14, 20, 40, 41).
- **Date:** 2026-09-27
- **Relates to:** `docs/architecture/multi-day-stays.md` § D6, D7, D8, D13 (the design this ADR
  fixes in place), ADR-0005 (the per-booking refund it keeps whole), ADR-0018 (where the search rule
  lives), ADR-0021 (the ledger's exactly-once key it relies on), invariants #2, #5, #7, #9, #10,
  `RESPONSIBILITIES.md` § `booking`, § `payment`, § `itinerary`, `CONTEXT.md` § *Booking &
  availability*.

## Context

A stay that no single set is free for is offered as a **stitched itinerary**: a few same-set
stretches, fewest moves first and shortest second, at most three moves (D13). Once a guest books
one, something has to hold "these stretches are one holiday": one code every morning, one payment,
one cancellation, one request at a Request-to-Book venue later, one settlement per stretch when a
remodel disturbs it.

Two shapes were on the table. **Segments inside one booking** — a `booking` row whose set becomes a
child table of `(set, first_day, last_day)` — keeps the guest-facing identity where it is today, but
every read of `booking.set_id`, the remodel receipt's from/to pair, `BookingMoved`, the payout
ledger's `UNIQUE (booking_id, entry_type)` and the refund child table keyed by booking all have to
learn about segments, and a partial cancellation or refund becomes a new concept the ledger cannot
express without re-keying its exactly-once guard. **A group of bookings** — one ordinary booking per
stretch plus a small parent row — leaves every per-booking path alone and asks only that the
guest-facing paths resolve the parent's code.

The design (D6) chose the group at refine time for three reasons that still hold: the ledger permits
one `REVERSAL` per booking, ever; `booking.set_id` stays one foreign key; and the layout freeze
stays bounded by a stretch's few days rather than a fortnight. What the slice had to settle was the
**code**: `booking.code` is `UNIQUE`, and every guest, staff and mail path resolves a code to exactly
one row.

## Decision

1. **A stay is a `stay` row plus one `booking` row per stretch** (`booking.stay_id`, nullable: a lone
   booking has none). Each stretch is a booking as any other — one set, one span, one price, one
   accrual, one refund, one `booking_day` per day, one settlement under a remodel. `booking` is the
   sole writer of `stay`, and `ResponsibilitiesArchitectureTests` holds that.
2. **The stay's code is the guest's one bearer credential** (invariant #7). A stretch's own
   `booking.code` is derived (`<stayCode>-<n>`), keeps `UNIQUE (code)` and the per-booking tables
   intact, and is never shown nor honoured: every code lookup (`JdbcBookings.CODE_MATCH`) answers
   a lone booking's code or a stay's, never a row code. The code-gated view, cancel, check-in, the
   staff daily list, the confirmation mail's facts and review eligibility (once no stretch is still
   live) answer the stay's code. Check-in resolves it to the stretch whose day row is today's and
   stamps only that day.
3. **One collection for the group.** `payment.api.CheckoutPort` collects a list of shares under one
   PaymentIntent, one `payment_booking` share per stretch (the shape #1207 prepared); the webhook
   confirms each stretch, so `BookingConfirmed` and payout accrual stay per booking; the confirm that
   completes the stay also publishes `StayConfirmed`, which the stay's one confirmation mail rides
   (#1255). Refunds stay per stretch against the shared intent, as ADR-0005 and #1207 already say.
4. **A stay cancels whole, judged on the stay's first day.** Every stretch's refund is quoted with the
   window anchored on the stay's first day, so a stitched stay refunds exactly what a same-set stay of
   the same dates would (invariant #10). Each stretch then transitions, releases its days and
   publishes its own `BookingCancelled`, so payout reverses once per stretch (invariant #9).
5. **The search is a pure rule in `itinerary/domain`** (`ItinerarySearch`, ADR-0018): a shortest path
   over `(day, set)` with the cost `(moves, row changes, positions, rows)` compared lexicographically,
   mirroring the remodel move rule's distance order; the budget is `riviera.itinerary.max-switches`,
   default and ceiling three (D13). The reserve validates a plan's **shape** (contiguous, at least two
   stretches, consecutive stretches on different sets, one venue) and applies the single-booking
   fences to every stretch; it does not enforce the budget, which is what the search *offers*, not a
   booking rule.

## Consequences

- Every existing per-booking invariant, test and event holds for a stitched stay by construction; the
  new tests cover only the group: all-or-nothing claims across stretches, one intent with N shares,
  the stay code resolving at check-in, cancel and view, one reversal per stretch.
- A guest of a stitched stay receives **one** confirmation mail naming every stop, sent once every
  stretch is confirmed (#1255; the slice first shipped one mail per stretch, by owner decision).
- "Your spot today", the evening-before move reminder and the staff scan's today-set display build on
  the stay's code resolving (issue #1209).
- A signed-in guest's booking list shows a stitched stay as one row under the stay's code — the whole
  span, the summed amount, the first stretch's spot (`StayRecord.asBooking`); listing its stretches
  there is a later refinement.

## Rejected alternatives

- **Segments inside one booking** — see *Context*: it re-keys the ledger's exactly-once guard, widens
  `BookingCancelled`, `BookingMoved` and the receipt, and makes a partial refund a new ledger concept.
- **Sharing the stay's code across its `booking` rows** (relaxing `UNIQUE (code)`) — loses the
  `ON CONFLICT (code) DO NOTHING` collision guard that makes a bearer credential unique by
  construction, and turns a credential into an internal grouping key.
- **A group without a parent row** — leaves no place for the stay's code and span, and every group
  read becomes a self-join keyed on a credential.
