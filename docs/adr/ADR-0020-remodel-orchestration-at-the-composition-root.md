# ADR-0020: The remodel preview and commit are composed at the composition root, which is granted `venue`'s and `booking`'s published surfaces for it

- **Status:** Accepted — implemented by the slice for issue #1033 (epic #1027, user stories 19 and 21);
  the commit (#1034) takes the same seat.
- **Date:** 2026-09-09
- **Relates to:** ADR-0017 (the root as the home of edge mechanisms), ADR-0007 (module structure),
  invariants #2, #11, #13, `RESPONSIBILITIES.md` § *Platform edge*, `CompositionRootDisciplineTests`
  (the fitness function this decision edits).

## Context

A layout remodel that disturbs live claims needs two modules in one answer: `venue` knows what a
save would remove or renumber (the cell-keyed diff against the active map, and the walk-in holds it
reads through its availability SPI), and `booking` knows what each live booking on those sets would
become — moved to a free set of the same or better tier, refunded, released, declined, or a block.
The commit (#1034) needs both in one transaction: the layout write and the moved bookings' new
availability rows must land together or invariant #2 has a window.

`venue` may not depend on `booking`: `booking` already implements `venue.spi.BookingPresence` and
`venue.spi.SalesWindow` and consumes `venue::api`, so a `venue → booking::api` edge is a cycle that
`ApplicationModules.verify()` refuses. Three seats were on the table:

1. **A `booking`-hosted controller** under `/api/venues/{venueId}/beach-map/preview`, calling a new
   `venue::api` diff port. Modulith-clean today, but it makes `booking` the orchestrator of the
   venue's layout write at commit time — a module driving another module's table lifecycle through
   its API, which is the coupling the hexagonal split exists to avoid, and it puts a beach-map route
   in the booking module's adapter.
2. **`venue` calling `booking`** — the cycle above.
3. **The composition root**, on the precedent the settled edge already carries: session revocation
   is "edge-orchestrated and synchronous, bracketing the state change" (`AdminOperatorController`).
   The root is the one package that may depend on modules and that nothing depends on, so it can
   hold both ports without closing a cycle.

The epic chose the third (revision 2, 2026-09-08). What stood in the way is
`CompositionRootDisciplineTests`: its allowlist grants the root `customer`, `operator`,
`notification::api`, `challenge`, `audit::api` and `shared` only, and its Javadoc said "never the
booking spine". Its own violation message names the way through: "granting a new one is a deliberate
edit to this rule".

## Decision

1. **The remodel preview and the remodel commit live in the root package**, as driving adapters that
   compose `venue.api.BeachMapRemodel` and `booking.api.RemodelClaims` (and, for the commit, the
   apply ports the later slice adds). The preview is `RemodelPreviewController`.
2. **The root's grant map gains `venue` and `booking`, `api` + `vocabulary` only.** Never `spi`
   (the root implements nothing for a module), never `application`, `domain` or `adapter`, and
   nothing of `payment`, `payout` or `availability` — those remain out of bounds exactly as before.
   The test's Javadoc names this as the one sanctioned domain composition.
3. **Each module port asserts venue ownership itself** (`VenueOwnership#assertOwns` first, invariant
   #13). The edge resolves the principal and maps outcomes; it never becomes the authorization
   point, so no other driving adapter — a future module-internal caller included — can reach either
   port unasserted.
4. **The edge assembles, it does not decide.** Which sets a save disturbs is `venue`'s; the zone of a
   claim, its move candidate and its refund/release/decline split are `booking`'s; the root maps
   the two answers onto the five wire groups and the `keep` list. A rule that starts to grow at the
   root is the signal that it belongs in a module.

## Considered options

The three seats above. The first was the strongest alternative and would have left the discipline
test untouched; it was rejected because the commit's transaction would then be `booking` writing
`venue`'s layout through an API designed for it — a second writer of `set_position` by proxy — and
because the epic's decision, taken with the session-revocation precedent in view, was already the
root. A fourth option, an `availability`-like non-context module for "remodel", was not pursued: it
would own no table and no rule of its own, which is the test ADR-0017 sets for a module.

## Consequences

**Improves.** The two modules stay acyclic and each keeps its rule; the composition is in the one
place that may hold it; the discipline test stays an allowlist with two more rows, and its negative
proofs are unchanged.

**Costs.** The root now carries a domain-shaped adapter, so `PayoutModuleTest` — which bootstraps the
root — mocks two more ports, and `WebSliceStubs` supplies them to every web slice. A reviewer must
hold the line in item 4: the preview's assembly is the most the root may do.

**Revisit if:** a third module needs the remodel (a rule at the root would then be the smell item 4
names), or the commit's transaction turns out to need a module-internal port the root cannot be
granted — at which point the `booking`-hosted seat is the fallback and this ADR is superseded.
