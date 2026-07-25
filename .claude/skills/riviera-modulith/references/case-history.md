# Case history — why the structure looks the way it does

Short records of the decisions the SKILL.md body cites as "(case history)". The durable rules live
in the body and `references/boundaries.md`; this file keeps the why.

## ADR-0007: two templates by weight — landed

ADR-0007 replaced a one-size module shape with the thin/full templates: structure tracks weight,
and the asymmetry exploited is inside vs outside (Cockburn: *"code pertaining to the inside part
should not leak into the outside part"*), not left vs right. All modules use this shape; it is
machine-locked by `PackageShapeArchitectureTests`. Write new modules directly in it — graduation
from thin to full is a visible, reviewable refactor, a feature not a cost.

## ADR-0007 Amendment 1 (issue #95): the published-surface split

`api/` started as "the published surface" and was accumulating **three different kinds of thing**:
(1) ports ("call-me" interfaces), (2) published vocabulary (typed ids, value records — `SetId`,
`Money`), and (3) published domain events (`BookingConfirmed`). #95 split them into the distinct
named interfaces (`api`/`vocabulary`/`events`/`spi`) and introduced the least-privilege grant
matrix; `PublishedSurfacePlacementArchitectureTests` made the drift-fix a build failure instead of
a review judgment call. `riviera-review-overlay` RV-BE-3c verifies the rule stays green and judges
the cases the convention can't (e.g. whether a new type is genuinely vocabulary).

## Issue #94: the `VenueCatalog` role split

`VenueCatalog` had grown into a wide port serving unrelated consumer roles. #94 split it by role:
`VenueCatalog` (tourist reads), `SetBookingFacts` (`setBookingInfo`/`poolOf`), `VenueRates`
(`commissionBps`/`lateCancelRefundBps`) — pinned by `VenueApiRoleSplitTests`. The durable rule: a
wide port splits by consumer role; don't pile new methods onto `VenueCatalog`.

## Issue #44: the first `spi` (venue ↔ availability)

`venue` needed "which of these sets are taken on date D?" but a direct dependency on `availability`
would cycle (`availability` already depends on `venue::api`). The fix — the driven port
`SetAvailabilityLookup` in `venue.spi`, implemented by `availability` — established the `spi/`
convention. Full worked example: `references/boundaries.md`.

## Closed: `customer`'s adapter bucket — settled by graduation

`customer` kept its adapter in `adapter/out/` (rather than the Modulith-idiomatic `internal/`) to keep
the adapter vocabulary uniform and the ArchUnit allowed-set clean. The question is now **moot**:
`customer` was the thin module that raised it, and it graduated to the full template at S2 (#111),
gaining `adapter/in` at #101 Slice 2. **No module is thin today**, so there is no `adapter/out`-vs-
`internal/` decision outstanding — revisit only if a future serviceless module appears.
