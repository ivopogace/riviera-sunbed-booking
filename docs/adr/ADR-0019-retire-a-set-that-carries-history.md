# ADR-0019: A set that carries booking history is retired, never deleted; the active map is a view, and every read but the facts port takes it

- **Status:** Accepted — implemented by the slice for issue #1030 (epic #1027, user stories 12–14).
- **Date:** 2026-09-08
- **Relates to:** ADR-0018 (the lifecycle is guarded SQL, per its §3), ADR-0007 (the adapter split
  it forces), invariants #2, #6, #12, `RESPONSIBILITIES.md` § `venue` (the exclude and exempt lists)
  and § *Machine-checked vs review-checked* (the fitness function), `CLAUDE.md` § *Commands* (the
  structural net's one admitted-by-decision member).

## Context

`booking.set_id` references `set_position` with `ON DELETE RESTRICT` (V5), so a set that has ever
carried a booking — a cancelled one from two seasons ago included — could never leave the beach
map: the per-set remove refused it forever, and the bulk replace refused the whole venue. Real
beaches re-lay their rows every season. Protecting a *live* claim is right and stays (invariant #2);
protecting a spot nobody is coming to is an artefact of a hard FK with no notion of a set that has
left the map.

Three ways out were on the table. **Delete anyway** by cascading or nulling the booking's set
reference: every booking, mail and payout line would lose the spot it named. **Snapshot** the row
label and position onto the booking at reserve time and delete the set: a backfill of every
existing booking, a second statement of layout data that the tree deliberately keeps live (a renamed
row reads live for a booked guest today), and nothing for a future move mail to point at.
**Retire**: keep the row, mark it, and take it out of every read that means "the map".

## Decision

1. **A nullable `retired_at TIMESTAMPTZ` on `set_position` is the whole lifecycle.** `NULL` is
   active; a value is retired and says when (invariant #6). The transition is forward-only and is
   guarded SQL, not a Java state machine (ADR-0018 §3): `UPDATE … SET retired_at = :at WHERE id = :id
   AND retired_at IS NULL`. The RESTRICT FK stays exactly as it is.
2. **Remove-set decides retire-or-delete on history, and refuses only on a live claim.** A hold dated
   today or later, or a non-terminal booking, refuses the remove (`SET_IN_USE`) — the same question a
   move asks. A set that passes it and carries any booking is retired; one that carries none is
   deleted. Both answer the same success on the wire.
3. **`active_set_position` is the one read surface for "the map".** A view, created in the same
   migration as the marker (V50), with an explicit column list. Every read that means the map selects
   from it: the tourist list and its counts, the map, the availability calendar, the operator's daily
   view, the layout locks and conflict probes, and **both claim paths** — the online claim and the
   staff walk-in mark resolve the set through `SetBookingFacts#poolForClaim`, a locking read on the
   view, so a retired set is `NO_SUCH_SET` to both and no hold is ever written onto it. Writes name
   the marker instead (`… AND retired_at IS NULL`), so a retired set is never re-labelled, repriced,
   re-pooled or deleted.
4. **One port keeps answering: `SetBookingFacts`.** Its `setBookingInfo` / `setBookingInfos` read the
   table bare, because cancel, the booking view, the mails and the staff booking lookup must name the
   spot the guest was told — and a later move mail must name the old, now-retired one. It is the same
   port that is deliberately unfenced by tourist visibility; the two exemptions have the same
   reason.
5. **The layout-uniqueness rules are rules about the active map.** The V2 cell and V12 grid
   constraints become partial unique indexes `WHERE retired_at IS NULL` under the same names, so a
   retired set's row/position and grid cell are free for the set that replaces it, and two active
   sets still cannot share either.
6. **The exclusion is enforced, not described.** `RetiredSetExclusionArchitectureTests` holds every
   production `CONSTANT_String` naming the bare `set_position` (an `INSERT INTO` excepted — a new row
   is active by construction) to naming `retired_at` in the same statement, exempting the class that
   implements `SetBookingFacts`. That exemption is a class, which is why the facts adapter is its own
   class (`JdbcSetBookingFacts`) beside `JdbcVenueCatalog`. The test joins the structural net by this
   decision although it names its table: a new JDBC adapter anywhere in the tree can break the rule
   it holds, which is the property the net exists to catch.

## Considered options

**Snapshot the spot onto the booking (rejected).** Solves the guest's view but not the operator's:
the diff-based save and the move mail (#1032, #1034) need the old set to still exist as a row with
an identity and a position, and the tree already treats layout labels as live data rather than
booking data. It also needs a backfill of every booking row; retire needs none.

**A `status` column with an enum (rejected).** Two states with no third in sight; a timestamp
carries the same fact plus when, and `IS NULL` is the natural partial-index predicate.

**Filter with `WHERE retired_at IS NULL` everywhere instead of a view (rejected).** Fifteen
statements today and every future one would each restate the rule; the view states it once, and
the fitness function can tell a view read from a bare one, which it could not do with a predicate
spelled fifteen ways.

**Exempt statements rather than a class in the fitness function (rejected).** The constant pool
does not say which method a string belongs to; a class-level exemption is what the tooling can
see, and it costs one adapter split that is a good split on its own terms — two published
conversations that read the same table with opposite intent.

## Consequences

- A set with finished bookings can be removed; its bookings, mails and payout lines keep resolving.
  A retired set's label and price are frozen: the row-scoped rename and reprice skip it, because it
  has no live guest to re-read a renamed row and a later mail must name what the guest was told.
- Every future read of the beach map must select from `active_set_position`; the build fails
  otherwise. A column a future read needs is a visible `CREATE OR REPLACE VIEW` in its migration.
- The bulk replace is untouched in behaviour — still refused on any booking — and its delete names
  the marker, so the invariant holds if #1032 relaxes that guard.
- The `LAYOUT_IN_USE` copy still tells the operator a booked venue is locked; #1032 retires that code.
- **Revisit if:** a second table grows a retirement marker (the fitness function then generalises
  or gets a sibling), or a consumer needs to *know* a set is retired rather than merely not see it
  (a `retired` fact on `SetBookingInfo` is the shape, deliberately not added now).
