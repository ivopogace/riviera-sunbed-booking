# ADR-0025: A pending request is not a hold; the venue's accept claims the set

- **Status:** Accepted — implemented by the slice for issue #1264 (epic #1096, user stories 17–19,
  25–27; retires story 29).
- **Date:** 2026-09-27
- **Relates to:** `docs/architecture/multi-day-stays.md` § D5, D10 (amended by this ADR), invariants
  #2, #4, #7, `RESPONSIBILITIES.md` § `booking`, § `availability`, `CONTEXT.md` § *Booking &
  availability* (the retired "soft-hold").

## Context

Request-to-Book shipped (#98) as the Instant reserve minus the payment: a request claimed its
`set_availability (set, date)` row the moment it was sent, and only the venue's answer, the guest's
withdrawal or the 24h expiry freed it. That gave the guest "it is yours if they say yes" and kept one
claim path, at a price nobody had weighed: a guest who never pays a cent blocks a set for a day, and
under multi-day stays (#1203) a fortnight of days. The design doc's answer was to expire longer
requests sooner (story 29), which shrinks the damage without removing its cause.

Two shapes were on the table. **Hold and shrink** (Airbnb's shape, where the hold is defensible because
the guest has already paid) keeps the claim at request time and scales the window down with the
length. **No hold** (Booking.com's Request to Book) claims nothing until the host accepts; several
guests may request the same dates, the host picks, and acceptance is the claim.

The second shape also removes a latent hazard. `set_availability` records *that* a set is held, never
by whom (`held_by_booking_id` was deferred in V4), so every release recomputes `(set, date)` from the
booking. That is safe only while every live booking owns its rows; a request that holds nothing but
still "releases" would delete another guest's claim.

## Decision

1. **A `PENDING_REQUEST` booking writes no availability row.** The reserve at a Request-to-Book venue
   runs the same fences, refuses a day already taken (a read, answered `SET_TAKEN`), and inserts the
   pending row. Its days stay free on every tourist and staff read, and other guests may request them.
2. **Accept is the claim.** Inside one transaction the accept reads the pending row's set and span,
   claims every day with the existing `INSERT … ON CONFLICT DO NOTHING` (invariant #2, one primitive),
   and only then runs the guarded `PENDING_REQUEST → AWAITING_PAYMENT` (status and response deadline);
   a row that left pending meanwhile gives the days back. The payment call follows after commit, as the
   Instant reserve does. A day that cannot be claimed gives back the days won and the request declines
   itself with reason `SET_UNAVAILABLE`; the operator is told, the guest is mailed.
3. **The winner declines its rivals.** In the same transaction every other pending request on that set
   with an overlapping day becomes `DECLINED` with reason `ANOTHER_GUEST`, each publishing its own
   `BookingRequestDeclined`. Under two concurrent accepts the claim's `ON CONFLICT` decides, and the
   loser's self-decline and the winner's rival-decline meet on guarded `UPDATE`s that move zero rows
   for a row already terminal.
4. **Request termination releases nothing.** Decline, expiry, withdrawal and a remodel's decline end
   the row and publish as before, without touching `set_availability`. A remodel that disturbs a set
   declines its pending requests rather than moving them, whatever the remodel zone: there is no claim
   to re-seat and nothing for the freeze to pin, so the guest re-requests on the new layout. A failed
   payment set-up after accept reverts to pending *and* releases the claim the booking held when reverted.
   *Corrected 2026-10-01 (#1342):* "the freeze" is the remodel's `FROZEN` zone (`RemodelZone`). A
   pending request still counts as live for the layout-edit lock:
   `JdbcBookingPresence.LIVE_STATUSES` derives from `BookingStatus.canStillBeHonoured`, which
   includes `PENDING_REQUEST`, and `venue`'s `LiveClaims` asks it before a layout write touches the
   set.
5. **`decline_reason` is recorded on the row** (`VENUE`, `SET_UNAVAILABLE`, `ANOTHER_GUEST`; CHECK in
   lockstep with `booking.vocabulary.DeclineReason`) and rides `BookingRequestDeclined`, so the guest's
   view and the decline mail name it. The response window stays a flat `booking.request.expiry-window`
   capped at the day's sales close (invariant #4): with nothing held, its length is queue hygiene only.

## Consequences

- Nothing is at risk while a request is pending, so the multi-day slice (#1203) needs no expiry curve
  and holds no inventory for a fortnight; story 29 and the D10 sentence that relied on it are retired.
- A guest may lose a set they requested to a guest who requested later; the copy says the set is not
  held until the venue accepts, and the decline names the reason.
- The accepted request holds its claim from accept until it is paid or the abandoned-payment sweep
  cancels it (`accepted_at` + pay window), exactly as today.
- Pending requests that exist at deploy time lose their rows in the migration, so no row is stranded
  once the termination legs stop releasing.
- A stitched stay request (#1267) applies §2–§4 to the whole `stay`: the accept claims every stretch
  or none and a lost day declines the stay whole; a rival that is itself a stay declines whole; every
  termination leg moves every stretch together.

## Rejected alternatives

- **Hold and shrink the window** (`24h ÷ days`, floored) — bounds the damage, keeps its cause, and keeps
  every termination leg on the release path that cannot tell whose row it deletes.
- **Hold at request time, but record the holder** (`held_by_booking_id`) — makes release safe and the
  hold auditable, yet still lets an unpaid request block a set; and the column's owner (`availability`)
  would learn a `booking` concept.
- **Leave rival requests pending after an accept** and let the operator decline them by hand — an
  honest queue costs one more decision per rival for no information the operator lacks; the
  auto-decline keeps the queue true and the guest informed at once.
