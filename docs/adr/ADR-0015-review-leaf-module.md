# ADR-0015: `review` is a leaf module — eligibility inverts through an SPI port, aggregation goes out as an event

- **Status:** Accepted (the epic delegated the ADR judgment to slice 1; the wiring was pinned by the
  boundary analysis in epic #810's pre-implementation addendum, 2026-08-29, and the
  `BookingCompleted` alternative was re-examined and rejected at the maintainer's request the same
  day)
- **Date:** 2026-08-29
- **Relates to:** #810 (the tourist-reviews epic), #811 (slice 1 — this decision's slice), ADR-0007
  (the graduated hexagonal module shape this follows), invariant #11 (Modulith boundaries are
  hexagonal and id-based), invariant #2 (the claim discipline this borrows for review uniqueness)

## Context

Reviews sit between three existing modules. A review is *about a stay* (`booking` owns the
check-in fact), it is *displayed on a venue* (`venue` owns `rating_tenths`/`reviews_count`), and it
is *written by a tourist* whose authorization is the booking code. The obvious reading of the
epic's implementation notes — "review consults booking's published surface" and "venue's listener
queries review's aggregate port" — draws the module graph

```
venue → review → booking → venue
```

because `booking` already depends on `venue::api`/`vocabulary`/`spi`. `ApplicationModules.verify()`
rejects that cycle, and the escape hatch of letting the event carry the computed score instead is
closed by invariant #11: event payloads carry technical ids, not business fields.

So the boundary had to be chosen deliberately rather than fallen into.

## Decision

**`review` is a leaf: `allowedDependencies = { "shared" }`.** Everything points *into* it, the
posture `operator` and `customer` already take. Concretely:

- **Eligibility inverts.** `review.spi.CompletedStays` is a driven port declared in the *consumer's*
  `spi` surface and **implemented by `booking`** (`JdbcCompletedStays`) — the exact
  `customer.spi.GuestBookingHistory` / `venue.spi.BookingPresence` precedent. `booking`'s grants gain
  `review::spi` + `review::vocabulary`; `review` never imports `booking`.
- **Aggregation goes out as an event.** `review.events.ReviewsChanged(VenueRef)` — ids only — reaches
  a `venue` `adapter/in` listener, which re-reads the aggregate through `review.api.VenueRatingSummary`
  and writes venue's **own** columns. A full recompute, never an increment, so the registry's
  at-least-once delivery converges. `venue` stays the sole writer of its table: `review` computes the
  values, `venue` stores them.
- **`review` publishes its own typed ids.** `review.vocabulary.VenueRef` / `BookingRef` rather than
  reusing `venue`'s or `booking`'s — the same published-own-ref move `operator.vocabulary.VenueRef`
  made, and what keeps the grant list at `shared` alone.

## Considered options

**`review → booking::api` (the epic body's "purpose-built port method on booking").** Superseded: it
is the cycle above. Rejected by the epic's own addendum before slice 1 started.

**A `BookingCompleted` domain event instead of the `CompletedStays` pull.** Re-examined at the
maintainer's request and rejected, on three independent grounds:

1. **It re-closes the same cycle.** `review` consuming `booking::events` adds the `review → booking`
   edge; with `venue → review` (the rating listener) and `booking → venue::api` both already fixed,
   `verify()` rejects the graph exactly as it does for `review → booking::api`.
2. **It would be eventually consistent where the product is not.** Epic story 6 is "review the moment
   I'm checked in". An event-fed eligibility projection still answers "not checked in yet" for a
   guest who opens their booking page in the seconds after the operator checks them in.
3. **It would need a backfill.** Bookings already `COMPLETED` at deploy have no event to replay, so
   an event-fed projection needs a one-off seed. The pull reads `booking.completed_at` directly and
   needs none.

Underneath all three is the house rule: events propagate *state changes to modules that react*;
`api`/`spi` ports answer *queries* (invariant #11). "Was this stay checked in, and when?" is a
lookup at the moment review needs it, not a change review reacts to. Check-in therefore keeps its
documented "publishes no event" stance, and the slice still uses an event where an event belongs —
`ReviewsChanged`, propagating a real state change to `venue`.

## Consequences

- The SQL half of the `review → venue` boundary is **machine-checked** (hardened at review-gate
  finding F-6, same PR): `ResponsibilitiesArchitectureTests` fails the build on any reference to
  `rating_tenths`/`reviews_count` outside `venue` and on SQL-shaped references to the `review`
  table outside `review` — the `set_availability` sole-writer mechanism, fixture-proven. The
  *policy* half (eligibility, window, rounding leaking into `venue`) needs no illegal import and
  stays review-checked via the RESPONSIBILITIES §`venue` line and RV-BE-11.
- **The aggregate is eventually consistent by design.** A submit returns before its venue row moves.
  Every surface reads the stored columns, so a guest can see their own rating land a moment later.
- **The two `api` ports are split by consumer role** (`VenueRatingSummary` for `venue`,
  `ReviewEligibility` for `booking`), so neither consumer sees the submit surface — that stays an
  internal `application` port whose only caller is review's own REST adapter.
