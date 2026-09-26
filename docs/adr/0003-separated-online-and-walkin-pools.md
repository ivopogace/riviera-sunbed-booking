# ADR-0003: Physically separate online and walk-in pools

- **Status:** Accepted
- **Date:** 2026-06-26

## Context

The central operational risk is the walk-in-vs-online collision: a guest physically
takes a set before staff mark it, while a tourist books the same set online. Software
alone can't fully prevent this — physical reality and the database are never perfectly
synced — and the whole model depends on venue staff keeping the map updated, which is
the weakest operational link.

## Decision

Each set carries a **pool** flag — **online** or **walk-in** — and the two pools are
**physically separate** sets (ideally a signposted, roped-off block of premium
front-row sets reserved exclusively for app bookings). An online booking can only
ever target an online-pool set. (Invariant #3; collision-prevention Layer 1.)

Combined with the evening-before cutoff (Layer 2, invariant #4), this means staff
open each day with a fixed "today's reservations" sheet and never seat walk-ins in
the online block — so there is no live race to lose.

> **Note (2026-09-26):** #4 was redefined on 2026-08-28 (#797). Sales for D now close at the
> venue's `sales_close` on D; only the `00:01` setting (no same-day sales) keeps Layer 2's
> fixed sheet at the day's open.
> The evening-before boundary survives as the free-cancellation cutoff (#10, #6).

## Consequences

- Dramatically reduces dependence on real-time staff "tap-to-mark" accuracy for
  correctness; the online block is simply "the app's beds."
- For v1 we do **not** need a complex shared live map syncing both channels in real
  time — that is deferred / may prove unnecessary.
- Venues control the ratio and can adjust it daily; the online pool's size caps
  online revenue per venue.

## Alternatives considered

- **One shared pool with real-time tap-to-mark syncing** — Rejected for v1:
  over-engineered and fragile; it puts correctness at the mercy of busy seasonal
  staff updating an app in real time.
