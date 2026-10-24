# Online-pool from-price on Discover Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A Discover "from €X" is always the price of a set the tourist can book online; a
walk-in-only venue is priced nowhere on Discover and says "Walk-in only".

**Architecture:** `JdbcVenueCatalog.toSummary` filters to `Pool.ONLINE` before taking the minimum,
so `VenueSummaryView.fromPrice` changes meaning on the wire (cheapest online set, `null` without
one) with no shape change. Every frontend surface already derives from that one field
(`lowestFromPrice` feeds the coast picker and pin crowd), so only the card's priceless wording
splits ("No sets yet" vs "Walk-in only").

**Source of intent:** #1628 (option A, decided by the wave-10 orchestrator under the owner's
delegation; rationale on the issue). Follow-up for the map read: #1647.

**Branch:** `feature/1628-online-pool-from-price`

## Acceptance criteria

- [x] **AC-1:** Given a venue with ONLINE sets at €45/€35 and a WALK_IN set at €30, when the
  discovery list is read, then its `fromPrice` is €35 and `availability.total` stays 3. *Seam:*
  `GET /api/venues` · *Pinned by:* `VenueListControllerIT.fromPriceIsTheCheapestOnlinePoolSetAndNullWithoutOne`
- [x] **AC-2:** Given a venue whose every set is WALK_IN, when the list is read, then its
  `fromPrice` is `null` and `availability.total` counts its sets. *Seam:* `GET /api/venues` ·
  *Pinned by:* same test
- [x] **AC-3:** Given a walk-in-only summary (`fromPrice: null`, sets > 0), when Discover renders,
  then its card reads "Walk-in only" (no "from"), its accessible name says ", walk-in only," and
  carries no "from", and the coast picker's from-price is the online seller's. *Seam:* `Home` ·
  *Pinned by:* `home.spec.ts › prices a walk-in-only venue nowhere…`, `discovery-flow.e2e.ts › a
  walk-in-only venue…`
- [x] **AC-4:** Given a venue with no sets, then its card still reads "No sets yet" and its name
  announces no price. *Pinned by:* `home.spec.ts › keeps the no-sets wording…`
- [x] **AC-5:** A null-priced card renders no price in the list row ("Walk-in only"), as a lone
  pin (a dot, name-only label), in a crowd pill and in the picker (no "from"). *Pinned by:*
  `venue-row.spec.ts › says walk-in only…`; existing `venue-pin-layer.spec.ts` (plain dot;
  unpriced crowd), `pin-crowding.spec.ts › lowestFromPrice`, `coast-picker.spec.ts` (unpriced D).
- [x] **AC-6:** `VenueSummary.sellsOnline` is required; `Home.toCard` reads it as sent (no
  `total > 0 &&`). *Pinned by:* `tsc` over specs + e2e; `home.spec.ts › the selling line`.

## Non-goals

- The free bar (`AvailabilitySummary`, `DailyAvailability`): stays both pools (option B rejected).
- The venue page's header from-price (`VenueMapView.fromPrice`): #1647.

## Risks

- **R-1:** Another reader assumed `fromPrice` non-null when sets exist → every consumer grepped
  (`priceLabel`, `lowestFromPrice`, pin layer, picker); all null-safe already.
- **R-2:** "No sets yet" on a walk-in-only venue would be false → the priceless wording splits
  on `total`.
- **R-3:** Sibling #1617 reshapes the e2e `MockVenueSummary` → after it merges, merge
  `origin/main` and make `sellsOnline` required there; `npm run typecheck:e2e` must pass.

## Open questions

### Resolved

- A vs B vs C — A (orchestrator, on the issue).
- Wording for a priceless venue with sets — "Walk-in only", the venue map legend's own term.

## FE↔BE contract

- `GET /api/venues` row: `fromPrice` same shape (`{minorUnits, currency} | null`), new meaning:
  cheapest ONLINE-pool set. `sellsOnline` always sent; now required in `VenueSummary`.

## Phases

- **Phase 0 — backend:** online-only `fromPrice` · red `VenueListControllerIT.fromPriceIsTheCheapestOnlinePoolSetAndNullWithoutOne`
- **Phase 1 — frontend:** "Walk-in only" wording + required `sellsOnline` · red `home.spec.ts`,
  `venue-row.spec.ts`; e2e `discovery-flow.e2e.ts`
- **Phase 2 — e2e type:** after #1617 merges, `sellsOnline` required in its shared
  `MockVenueSummary`; `npm run typecheck:e2e`

## Execution status

**Stage pointer:** review (round 1, high)

**Next action:** mark PR #1648 ready and run round 1 (`code-review:code-review`, high) + overlay.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — backend | ✅ | b09f1c4 |
| 1 — frontend | ✅ | e293e0c |
| 2 — e2e type | ✅ | (this commit) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.
