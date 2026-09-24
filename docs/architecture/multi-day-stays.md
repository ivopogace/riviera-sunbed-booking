# Multi-day stays: range bookings, per-day attendance, stitched itineraries

Status: **sliced under epic #1096; D2 (per-day attendance) landed in PR #1211, the rest is not
yet built.** Decisions below were made at the refine stage (2026-09-12/13) against `main` @
`5bceef00`, grounded in four verification passes over the reserve path, the sweeps, the money paths
and the beach map. Each is a one-paragraph re-decision if reality disagrees. The per-module
contracts these decisions settle belong in `RESPONSIBILITIES.md` once a slice lands; the glossary
terms belong in `CONTEXT.md` at the same moment, not before — that file describes what exists.

Supersedes nothing. The product spec parked multi-day under *"Later (post-validation)"*
(`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`), never under the adjacent
"explicitly out of scope (YAGNI)" list — so this is the deferred work arriving, not a reversal.

## Problem Statement

**A tourist does not holiday for one day.** Someone flying into Dhërmi for ten to fifteen days
wants a sunbed for their whole stay. Today the platform sells one `(set, date)` at a time, so that
holiday is fourteen separate bookings: fourteen booking codes, fourteen payments, fourteen
proof-of-work challenges, fourteen cancellation decisions, fourteen confirmation mails.

It is worse than merely tedious. Because each day is claimed independently, **the tourist does not
even get the same set** — they are already stitching their stay together by hand, one day at a
time, discovering gaps only as they hit them and losing spots to whoever booked faster. The current
product is the worst available version of a stay: all of the moving about, none of the planning.

For a venue in **Request-to-Book** mode it is incoherent rather than merely tedious. Fourteen
days arrive as fourteen independent requests, and a venue that accepts twelve and declines two
has sold a guest a holiday with a hole in the middle of it — an outcome no venue would ever choose
deliberately, and one the current model lets them reach by accident. The Requests queue shows
fourteen cards for what is, to everyone involved, one decision.

## Solution

**A stay is one booking of a contiguous date range**, made once: one code, one payment, one
cancellation, one request for the venue to accept or decline.

Where a single set is free for the whole range, that is what the guest gets and the product
promise — pick your exact spot on the map — is unchanged.

Where no single set covers the range, the platform offers a **stitched itinerary**: the stay
covered by a small number of same-set runs, chosen to minimise the number of moves first and the
distance moved second. The guest sees "days 1–3 here, 4–8 two spots along, 9–13 one row back,
day 14 back here" before they pay, not after they arrive. This is the connecting-flight model,
and it is deliberate: a move is a legible, priceable downgrade from a direct.

The number of moves is **budgeted, not maximised**. Up to three moves, and never more (D13 raised
the default from two). Past that the honest answer is that this venue cannot host the whole stay, and the guest is
shown the longest run it *can* offer plus other venues — never a six-move itinerary.

### Why a stitched stay is the feature and same-set alone is not

Under independent per-day allocation, the chance that at least one set is free across every day
of a stay is `1 − (1 − fᴺ)ˢ` — f the free fraction, N the days, S the online sets. The exponent
decides everything, and for a 60-set venue it gives:

| Peak occupancy | 3 days | 7 days | 14 days |
|---|---|---|---|
| 85% | ~18% | ~0.01% | ~0% |
| 70% | ~78% | ~1.3% | ~0% |
| 50% | ~100% | ~38% | ~0.2% |

Same-set-for-the-whole-stay cannot be scavenged from the gaps single-day allocation leaves, at any
set count a beach can physically hold. It exists only if inventory is held back for it — a
commercial ask of venues, and out of scope here.

Stitching needs no such ask. A prototype DP (shortest path over `(day, set)`, cost = moves,
tie-broken on distance; 60 sets, 14 days, 20k trials, independent daily occupancy) gives:

| Occupancy | Coverable | 0 moves | ≤1 | ≤2 | ≤3 | Median |
|---|---|---|---|---|---|---|
| 50% | 100% | 0.3% | 30% | **97%** | 100% | 2 |
| 60% | 100% | 0.0% | 3% | **51%** | 97% | 2 |
| 70% | 100% | — | 0.1% | 5% | **46%** | 4 |
| 85% | 99.9% | — | — | — | 0.1% | 6 |

**The cliff becomes a slope.** A 14-day stay at 50% occupancy goes from 0.2% (same-set) to 97%
(≤2 moves). Coverage stays near-total even at 85%; what degrades is the number of moves, smoothly,
which is a property you can budget and explain. Median distance per move lands at three to five
positions along a row, or roughly one row back — not the other end of the beach.

Independence is the pessimistic assumption: once stays exist the availability grid gets blockier,
which lengthens runs. Weekend-aligned gaps could cut the other way; only real traffic settles it.

## User Stories

**Tourist — choosing**

1. As a tourist, I want to enter an arrival and departure date, so that I search for my whole
   holiday at once instead of one day at a time.
2. As a tourist, I want the beach map to tell me which sets are free for my **entire** stay, so
   that I am not choosing a spot that silently fails on day four.
3. As a tourist, I want a set that covers only part of my stay to be visibly different from one
   that covers none of it, so that a busy beach does not read as a full one.
4. As a tourist, I want to tap a partly-free set and be told exactly which of my days it covers,
   so that I can decide whether to shorten my stay instead of abandoning the venue.
5. As a tourist, I want the price quoted as a per-day rate and a total, so that I can compare
   venues on the number they advertise.
6. As a tourist whose stay no single set covers, I want to be offered an itinerary of two or three
   spots, so that I can still book this venue.
7. As a tourist, I want an itinerary anchored on the spot I actually tapped — starting or ending
   there where possible — so that the place I chose is still part of my holiday.
8. As a tourist, I want to see how far each move is, in rows and positions, so that I can judge
   whether it is a real inconvenience.
9. As a tourist, I want to see the itinerary as a timeline of days, so that I understand my stay
   before I pay rather than after I arrive.
10. As a tourist, I want to refuse an itinerary and see the longest single-set run instead, so that
    I can choose a shorter stay over a moving one.
11. As a tourist, I want to be told plainly when a venue cannot host my whole stay, so that I look
    elsewhere instead of assembling something unworkable by hand.
12. As a tourist whose venue cannot host me, I want other venues suggested for the same dates, so
    that the dead end is not the end of the search.

**Tourist — booking and holding**

13. As a tourist, I want one booking code for my whole stay, so that I present the same thing every
    morning.
14. As a tourist, I want to pay once for the whole stay, so that I am not charged fourteen times.
15. As a tourist, I want one confirmation mail naming every day and every spot, so that I have a
    single record to travel with.
16. As a tourist, I want one proof-of-work challenge for the stay, so that booking a fortnight is
    not fourteen times the friction of booking a day.
17. As a tourist at a Request-to-Book venue, I want to make one request for my whole stay, so that
    the venue answers once.
18. As a tourist, I want my request to be accepted or declined **whole**, so that I am never sold a
    holiday with a hole in it.
19. As a tourist, I want to withdraw my whole pending request in one action, so that retracting is
    as simple as requesting.
20. As a tourist, I want to cancel my whole stay in one action and get one refund decision, so that
    cancelling is not fourteen decisions.

**Tourist — during the stay**

21. As a tourist, I want to be checked in each morning with the same code, so that arriving on day
    six works exactly as day one did.
22. As a tourist on a stitched itinerary, I want a reminder the day before I move, so that I am not
    surprised at the lounger.
23. As a tourist, I want my booking page to show which spot is mine **today**, so that I never have
    to work it out from a list of ranges.
24. As a tourist, I want to review my stay after it ends rather than after my first morning, so
    that the review is about the holiday.

**Venue operator**

25. As a venue operator, I want one card per stay in my Requests queue, so that I make one decision
    about one guest's holiday.
26. As a venue operator, I want a stay request to show its full range, total value and every spot it
    would occupy, so that I can judge it without opening anything else.
27. As a venue operator, I want to accept or decline a stay as a whole, so that I cannot
    accidentally sell a broken holiday.
28. As a venue operator, I want to cap how long a stay may be at my venue, so that a fortnight-long
    request cannot tie up inventory I would rather sell daily.
29. As a venue operator, I want long requests to expire faster than short ones, so that an
    abandoned fifteen-day request does not hold fifteen days of inventory with no money at risk.
30. As a venue operator, I want my daily view to separate guests arriving today, staying today and
    leaving today, so that my staff know who to greet and which sets turn over.
31. As a venue operator, I want to see who has not yet checked in **today**, so that "nobody turned
    up" is a question I can answer on any day of a stay, not only the first.
32. As a venue operator, I want my daily takings to count the days actually served on that date,
    so that a fortnight's money does not land entirely on the arrival day.
33. As a venue operator, I want the layout editor's lock to name the whole span a guest holds, so
    that I can plan a remodel around it instead of discovering the freeze at save time.

**Staff**

34. As venue staff, I want scanning a stay's code to check the guest in for today only, so that a
    second scan tomorrow still works.
35. As venue staff, I want a second scan on the same day to say "already checked in today", so that
    the behaviour matches what I already know from single-day bookings.
36. As venue staff, I want a stay's set for today shown when I scan, so that I can point the guest
    at the right lounger on a move day.

**Platform**

37. As the platform, I want every day of a stay to hold its own `(set, date)` claim, so that
    invariant #2 is untouched and a set can still never be double-sold.
38. As the platform, I want a stay's claim to be all-or-nothing, so that a guest is never left
    holding a partial holiday because one day lost a race.
39. As the platform, I want every terminal transition to release **every** day it held, so that
    cancelling a stay never strands inventory nothing can reach.
40. As the platform, I want a stay's payout to accrue once and reverse once per segment, so that
    invariant #9 holds unchanged.
41. As a platform admin, I want a stay disturbed by a remodel to be settled per segment, so that one
    frozen day cannot veto a venue's whole layout change.

## Implementation Decisions

### D1 — Three slices, in this order

**Attendance → range bookings → stitching.** The order is load-bearing: attendance is the largest
and riskiest piece and can be landed *before* any product change, against today's single-day
bookings, where it is provably equivalent to current behaviour. Range bookings then arrive on an
attendance model that already works per day. Stitching arrives last because it is the only slice
that touches `payment`.

### D2 — Attendance becomes a per-day record; the status machine is left alone

`booking.status` is the **contract** state machine (pending → awaiting payment → confirmed →
cancelled) and is already correct for a stay. What is wrong today is that the same column also
carries **attendance**, which for a one-service day booking is the same fact and for a stay is not.

Attendance moves to a `booking`-owned child table, one row per service day, written when the booking
confirms:

```
booking_day (booking_id, service_date, attended_at, missed_at)
  UNIQUE (booking_id, service_date)
  CHECK (attended_at IS NULL OR missed_at IS NULL)
```

- **Check-in** stamps today's row under a guarded `UPDATE … WHERE booking_id = ? AND service_date =
  :today AND attended_at IS NULL AND missed_at IS NULL`. A second scan moves zero rows and answers
  "already checked in today" — the identical one-shot property the current transition gets from
  `status = 'CONFIRMED'`, scoped to a service day.
- **The no-show sweep** marks past unattended service days, then resolves the parent booking once its
  last service day has passed. Same batching shape, same guarded-update discipline, same scheduler — this
  deliberately does **not** add a fourth scheduler.
- **`COMPLETED` / `NO_SHOW` stay in `booking.status`**, redefined as *stay outcomes* written once
  when the last service day resolves. This is what keeps the blast radius small: `DailyTakings` still
  sums `CONFIRMED/COMPLETED/NO_SHOW`, `BookingStatus#canStillBeHonoured` still means the stay is
  live, and the weather refund's `CONFIRMED|NO_SHOW` admission is unchanged.
- `completed_at` changes meaning from "when the guest checked in" to "when the stay resolved". For
  existing single-service-day rows the two instants coincide exactly, which is what makes the migration
  safe and the equivalence provable.

Rejected: per-day states inside `booking.status`, which explodes `BookingTransition`
combinatorially and rewrites the tree's most carefully held fitness test. Rejected: attendance on
`set_availability` — `availability` is machine-enforced sole writer of that table
(`ResponsibilitiesArchitectureTests`) and attendance is a `booking` fact.

This also corrects a latent defect: the review window currently opens at check-in, so a stay would
become reviewable on its first morning. Keyed to the stay outcome it opens when the stay ends,
which is what `review`'s 60-day window was always measuring.

### D3 — A booking gains an end date; `set_availability` does not change

`booking.last_date` sits beside `booking_date` (which keeps its meaning: the **first** service day), and
every existing row is backfilled `last_date = booking_date`. Every current query therefore stays
literally true on day one, and the `booking_date = :date` equality predicates migrate to overlap
predicates one at a time rather than in one sweep.

**Invariant #2 is untouched.** A stay claims one `set_availability` row per service day, through the
existing `AvailabilityClaim` port called N times inside the one reserve transaction, which is
already all-or-nothing. No new concurrency primitive, no schema change to the source of truth, and
the `UNIQUE (set_id, booking_date)` guard does exactly what it does today.

### D4 — Two reads split that are one read today

"Arrivals today" and "guests on the beach today" are the same list under single-service day bookings and
different lists under stays. The staff daily view must answer both, and daily takings must count
**the service days served on that date**, not a stay's whole price on its arrival day. A stay spanning a
commission-rate change gets one accrual at the live rate while `commissionBpsOn(serviceDate)`
reports per service date — accepted, documented drift of the same shape ADR-0021 §7 accepted for
the venue-change fee.

### D5 — Every terminal transition releases every service day

Each release site today frees exactly one date, taken from the single `booking_date` its
`RETURNING` clause yields. There are seven: the guest cancel, the four remodel legs, the three
request-termination legs, and the abandoned-payment sweep. Under a range each must release the
whole span. This is the slice's highest-risk correctness item, because `set_availability` carries
**no link to a booking** (`held_by_booking_id` was deferred in V4 and never added), so a stranded
row is not merely unswept — nothing in the system can identify it, no sweep or constraint frees it,
and the only operator-facing delete filters on `state = 'STAFF_MARKED'`. Recovery would need direct
database access.

The weather refund is the same defect wearing a disguise: its `booking_date = :date` equality means
that once ranges exist, a storm mid-stay selects **nothing** and silently refunds nobody. It moves
to an overlap predicate, and it never skips a stay silently. Decided 2026-09-24 (option A): a
washed-out day refunds **that day's share** and the stay continues. That is a partial refund on a
live booking, which the payout ledger's one-reversal-per-booking guard (invariant #9) and
`payment`'s single refund cannot express. So it lands in its own slice, after the refund child
table (D8). Until then the overlap selection refunds one-service day bookings as today and **names**
every overlapping stay for a manual refund, instead of refunding nobody. The refund is the day's actual
rate (the set held that day), never the total divided by its days. A day the guest already
checked into is **not** refunded, the same as today's single-day rule, which admits only
`CONFIRMED|NO_SHOW`.

### D6 — A stay is a group of bookings, not one booking with segments

Each segment of a stitched stay is a booking exactly as a booking is today: one set, one date
range, one price, one accrual. A stay is a grouping over them, carrying the guest-facing identity.

This is the decision the whole stitching slice rests on, and it is chosen because it **dissolves**
three problems rather than managing them:

- `payout_once_per_booking UNIQUE (booking_id, entry_type)` permits one `REVERSAL` per booking,
  ever. Cancelling part of a stay becomes cancelling one segment — an ordinary whole-booking
  cancellation — so invariant #9's exactly-once guard needs no re-key and `BookingCancelled` needs
  no new field in a registry-persisted payload.
- `booking.set_id` stays a single foreign key, so every read model, the remodel receipt's from/to
  pair and `BookingMoved` are unchanged.
- The layout freeze shrinks. A live claim locks its set from creation until its status goes
  terminal, with no date bound; a single 15-service day claim would freeze a set — and, because a
  disturbed set is any removal *or renumber*, the whole column geometry to its right — for a
  fortnight. Segments are two to five service days, which keeps the freeze near today's scale.

**An ADR is owed here** (hard to reverse once stay data exists; surprising to a future reader who
will ask why a stay is not one booking; a genuine trade-off against the segments-in-one-booking
alternative). Proposed as a new ADR (numbered when written), to be written with the stitching slice.

The booking **code** becomes stay-level: one bearer credential for the guest (invariant #7
unchanged), with check-in resolving code → today's segment.

### D7 — The itinerary search is a new read-model module

This is improvement-plan trigger **B4** firing on its own terms: "a query module depending on
`venue::api` and `availability::api` that owns the composed browse/map views", due once the dated
read side grows more overlays. A stitched-itinerary search is exactly that overlay.

It keeps the search out of `booking`, which is already past three of four **B3** clauses (4,801
comment-stripped LOC against a ~4,000 threshold; the third scheduler on 2026-08-09; the refund seam
deepening on 2026-09-10). The ranking itself is pure — a shortest path over `(day, set)`, cost =
moves, tie-broken on distance — so it lands framework-free in the new module's `domain/` under
ADR-0018, beside a distance rule that mirrors `MoveRanking`'s (same row, then closest position,
then closest row).

The **switch budget is configuration, not a constant** (`riviera.<module>.max-switches`), because
the right value is an open product question and will move.

### D8 — Payment: one intent per stay, refunds per segment

One PaymentIntent covers the stay; the guest is charged once. Refunds are then per segment against
a shared intent, which `payment` cannot express today — `markRefunded` writes `refunded_minor` as
an absolute overwrite into a single `refund_id` column, and adoption is locked to "exactly one live
refund, for exactly the amount requested". `payment` therefore grows a refund child table keyed by
segment.

The Stripe idempotency key stays `booking-<segment-id>-refund`, so it remains unique per refund and
`PaymentGatewayRefundContract` keeps its shape. This is the highest-risk decision in the epic and
sits in the module with the most careful invariants in the tree; it is deliberately confined to the
last slice so the first two never touch it.

### D9 — Prerequisite: per-claim remodel settlement

A remodel today refuses its **entire** commit if any one claim is blocked, and a `FROZEN` claim
short-circuits before the candidate search so it can only block, never move. That is already a live
problem at one-day scale; with stays it is disabling. Per-claim settlement — settle what can be
settled, keep the rest — should land before or with the range-bookings slice. It is worth doing on
its own merits and is not strictly part of this epic.

### D10 — Stay length is a venue setting; the platform sets no maximum

Decided 2026-09-24, while prototyping the stay UI; it settles story 28's owner and default. There is
**no platform-wide maximum**: a stay may run to the end of the venue's season. Each venue may set a
maximum in days, owned by `venue` beside booking mode and sales-close, and unset means "any length
this season". The reserve path rejects a range longer than the venue's maximum, read through
`venue::api` the same way sales-close is.

Nothing in the design needs a fixed limit. Invariant #2 is one claim per `(set, date)` at any length,
and the itinerary search runs in microseconds at sixty days. The concerns a cap would answer are
answered elsewhere. Inventory held by an unanswered Request-to-Book stay is bounded by story 29's
shorter expiry for longer requests. The layout freeze is bounded by segment length (D6), which the
stitching keeps at two to five days whatever the stay length.

In the UI, the discovery page's calendar accepts any range up to the season's end. A venue whose
maximum is shorter than the chosen stay reads as unable to host ("stays of up to N days here"),
not as full. Its own calendar refuses end dates past its maximum, and its page offers new dates or
the venues that can host, never a plan.

### D11 — The discovery list carries a stay verdict per venue

For a range, the discovery page answers "which venues can host my stay" before the tourist opens any
of them. Each venue card and pin shows one of three states: same set for every day (with how many
sets), fits within the switch budget (with the number of moves), or cannot host (with the longest
single-set run, or D10's maximum when that is the reason). A single day keeps today's
sets-free count unchanged.

D7 specifies the itinerary search for **one** venue. The discovery list needs its verdict for every
venue in the one whole-coast request the page already makes, so the D7 module also owns a list read
beside its per-venue itinerary port. Each verdict is D7's pure ranking run once per venue, but a
peak-season coast query is N venues × S sets × D days of `set_availability`. It must be measured
before the range-bookings slice ships it, and it is scope the slicing has to count.

### D12 — A partly-free set is a dotted tile with a free-day count

Decided 2026-09-24 over two rejected alternatives: a diagonal split fill, and a strip of per-day
cells. Story 3's third tile state is `border-dotted` (2px) on the available fill, plus a count
badge ("9", or "9/14" where the tile is wide enough). The set's accessible name carries "free 9 of
14 days". It enters `map-tile.ts` as one more `MAP_TILE_STATES` entry and one `MAP_TILE_CLASS`
string, the same shape `taken`'s `border-dashed` already has.

Three facts decide it. Forced-colors mode drops non-`url()` `background-image` and author
background colours, but keeps border style. A split fill or a per-day strip would vanish under
high contrast. The dotted border and the badge's text survive, as `taken`'s dash does. Next,
the count is content that identifies the control at AA, so `docs/design/non-text-contrast.md`
rule 2 covers the tile with one measured ratio per theme, where a split would need two. Last,
the tile needs only a count per set, which D11's verdict already computes. A per-day strip would
ship a per-set × per-day grid to the client, and at D10's unbounded lengths its cells shrink
below a pixel.

The badge is `aria-hidden` inside the existing tile button, so it adds no touch target. Dotted
(partly free) and dashed (taken) sit close at hairline widths. The badge and the fill carry the
difference, and the venue page's contrast spec measures the 2px dotted border in all three
themes.

### D13 — The move budget is three, because a move happens between days

Decided 2026-09-24 by the owner, before the pilot test. The 'friction inside the holiday' worry in
*Further Notes* assumed a family relocating mid-stay with its things. That is not how the beach
works. A set is a full day, and guests arrive each morning and leave each evening with everything
they brought. A move therefore costs no packing. It only means a different set number on a
different morning, the way a different row does today when a tourist books day by day.

So the switch budget (D7's `max-switches`) defaults to **three**, and there is no separate "on
request" step. The hard ceiling stays at three: past it the guest gets the longest single-set run
and other venues, as before. Distance keeps its role as the tie-break, because a familiar corner
still matters to a family. It just no longer decides whether a plan is acceptable. At 70%
occupancy the epic's coverage table goes from 5% (≤2 moves) to 46% (≤3). Story 22's evening
reminder and story 23's "your spot today" carry the move, so a move day reads like any other
morning.

The pilot-venue call is still needed for the two missing numbers (peak-week occupancy, online set
count), and a tourist session can still disprove D13. But the budget no longer waits on either.

## Testing Decisions

A good test here asserts **external behaviour at the highest available seam** — what a caller of a
published port observes — never the shape of a row or the name of a private method. Existing seams
are reused in preference to new ones; the epic adds exactly one new seam (D7's itinerary port).

**Seam 1 — `CheckInBooking` + `MarkNoShows` (existing driving ports).** The equivalence proof is
the point of slicing attendance first: **the existing check-in and no-show integration tests stay
unchanged** and become the oracle. If `JdbcBookingTransitionTableIT`, `BookingMigrationIT` and the
check-in ITs pass untouched against the per-day implementation, single-day behaviour is
identical by construction rather than by inspection. New tests cover only what is new: a multi-day
booking checked in on successive days, a partially-attended stay resolving to its outcome, and a
guest who stops turning up mid-stay.

**Seam 2 — `CreateBooking` (existing port).** One new integration test carries invariant #2 for
ranges: an N-day claim is all-or-nothing under contention, with a concurrent single-day booking
on one of the days forcing the whole stay to lose. Prior art for the row-lock discipline is
`ConcurrentRequestTerminationIT`. A second test carries D5: every day is released on each of the
seven terminal transitions, asserted by re-claiming the whole range afterwards.

**Seam 3 — the itinerary port (new).** The ranking is pure and unit-tested exactly as `MoveRanking`
and `RemodelZones` are — fixed availability grids in, expected itinerary out, including the cases
that matter: no coverage at all, coverage only above the switch budget, a tie broken by distance,
and an anchor set that must appear first or last. One port-level test covers the composition over
real map and availability rows.

**Seam 4 — `CheckoutPort` and the refund contract.** `PaymentGatewayRefundContract` extends to
multiple refunds against one intent, keeping its at-most-once property per segment. Prior art is
the contract's existing coverage rule, which fails the build for an unclassified gateway.

**Fitness functions.** The new table needs its sole-writer rule in
`ResponsibilitiesArchitectureTests`; the new module needs `ModularityTests` and the package-shape
pair to pass with least-privilege grants. `RetiredSetExclusionArchitectureTests` must still hold —
a stay's reads touch `set_position` and every one of them selects from `active_set_position`.

**Frontend.** Vitest units for the date-range control, the third tile state and the itinerary
timeline; contrast specs for the new tile fill in all three themes; both Playwright suites, with
`riviera-review-overlay` RV-FE-E2E deciding which suite each spec belongs in.

## Out of Scope

- **Held-back stay inventory** — reserving sets for stays so itineraries need fewer moves. A
  commercial ask of venues and a separate decision; stitching deliberately needs no such ask.
- **Consolidation offers** — moving a stitched guest onto a single set when one frees up mid-stay.
  Genuinely attractive and the group-of-bookings shape supports it, but it is a later slice.
- **Per-day weather refunds** are no longer out of scope: D5 settles them as option A, refunding the
  washed-out day and keeping the stay, delivered in its own slice after D8.
- **Stays split across venues.** An itinerary is always within one venue.
- **Dynamic or seasonal pricing**, half-day and hourly units — all still "later" in the product
  spec.
- **Back-linking a guest's historical single-day bookings into a stay.** A permanent non-goal, for
  the same reason guest-booking back-linking is (`CONTEXT.md`, *Customer account*).
- **The B3 split of `booking`.** Named here because this epic makes it more pressing, but it is its
  own decision and its own PR.

## Further Notes

**Two numbers are still missing and one of them could reshape this.** Peak-week occupancy and
online set count, per venue. There is no data to answer from — the hosted database is Neon and
ADR-0004 accepts it only because the data is dummy — so this is a phone call to a pilot venue, not
a season of traffic. At ~50% free the switch budget is generous and stitching is comfortable; at
15% free the median itinerary is six moves and the venue should be refusing the stay. A validated
query exists and is ready to run the day there is real traffic.

**The switch budget is the product risk, not the algorithm.** The DP is forty lines and runs in
microseconds; nothing here is computationally hard. What is unknown is whether two moves reads to a
family like a connecting flight or like a bait-and-switch. The airline analogy holds for the
mechanism and breaks on the feeling: a connection is friction on the way to what you want, a
sunbed move is friction inside it, and the unit being moved is a family with towels, a cooler and
settled children. It is cheap to test with a mockup and should be tested **before** the DP is
built, not after. If the real budget turns out to be one move, D7 is unaffected — only the
configured value changes — but the coverage table above halves. D13 settles this: a move happens
between days, never inside one, so the budget is three.

**The strongest argument for the whole epic** is not that stays are a new capability. It is that
tourists are *already* stitching their holidays together by hand, with no plan, no guarantee and no
help. This does not introduce moving about; it introduces knowing about it in advance, choosing the
moves to be short, and paying once.
