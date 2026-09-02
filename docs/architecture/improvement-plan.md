# Riviera Sunbed Booking — Improvement Plan

> **What this is.** The sequenced improvement plan grounded in an inspection of `main` on
> 2026-07-01, folding together go-live readiness, the Modulith/DDD/hexagonal refinements, and the
> `operator` module the multi-operator launch forced. Most of it has shipped; what remains here is
> the status of each workstream and the **standing triggers** that still govern future work.
> `CLAUDE.md` owns the current module list and invariants; `RESPONSIBILITIES.md` the per-module
> contracts.

## Baseline (2026-07-01) and where each gap went

The inspection found the architecture disciplined and the hard parts done correctly — an acyclic
Modulith with deny-by-default `allowedDependencies`, the atomic `INSERT … ON CONFLICT` claim
(invariant #2), webhook-as-truth payments with idempotency keys (invariant #8), a Flyway-owned
Event Publication Registry, fitness-tested boundaries — and seven gaps:

| Gap found | Outcome |
|---|---|
| Authorization was a single shared `OPERATOR` account with no per-venue ownership (OWASP API #1, BOLA) | **Shipped**: the `operator` module, `assertOwns` → `403` in every venue-scoped application service, the cross-venue denial matrix (`CrossVenueDenialIT`), per-operator credentials, self-registration with admin approval (invariant #13) |
| `VenueCatalog` was a god-port serving four consumers | **Shipped** (#95): split by consumer role — `VenueCatalog`, `SetBookingFacts`, `VenueRates`, … — locked by `VenueApiRoleSplitTests` |
| Published `api` packages mixed ports with vocabulary and events | **Shipped** (#95, ADR-0007 Amendment 1): `api/` ports, `vocabulary/`, `events/`, `spi/`; locked by `PublishedSurfacePlacementArchitectureTests` |
| Request-to-Book not implemented | **Shipped** (#98): soft-hold on the shared claim, accept/decline, the deadline sweep, payment-request-on-accept |
| Validation and error handling ad-hoc, `{"error": CODE}` bodies | **Shipped** (#97): `ApiProblem` + one `ApiErrorHandler` advice (RFC-7807 + `code` extension, locked by `ErrorContractArchitectureTests`); validation stays centralized-explicit (`riviera-java-conventions` §6b) |
| No actuator / production hardening | **Shipped** (#75, #100): actuator lockdown (only `health` public), authenticated `/actuator/prometheus`, structured JSON logging + correlation ids, the money-path alert self-check (`docs/runbooks/observability.md`) |
| Single-instance assumptions load-bearing and undocumented | **Documented** (D3): [production-hardening.md → *Single instance only*](../deploy/production-hardening.md); scale-out preconditions below |

## Workstreams

**A — Launch blockers (multi-operator).** Shipped in full: A1 (`operator` module + ownership +
denial tests), A2 (per-operator credentials, secrets as deploy-environment variables), A3
(actuator, graceful shutdown).

**B — Architecture refinement.** B1 (`VenueCatalog` role split) and B2 (published-surface split)
shipped. B3 and B4 are standing triggers (below).

**C — Enforcement.** All five landed as fitness tests: C1 `PublishedSurfacePlacementArchitectureTests`,
C2 `VenueApiRoleSplitTests`, C3 the cross-venue denial matrix, C4 `ResponsibilitiesArchitectureTests`
(sole-writer, Stripe-reach, id-based events), C5 `PackageShapeArchitectureTests`. The split between
what these encode and what stays review-only is `RESPONSIBILITIES.md` § *Machine-checked vs
review-checked*. A DDD-stereotype library (annotate aggregates/events and verify them) was
considered and **deliberately not adopted** — the hand-written ArchUnit + `ModularityTests`
baseline covers what this project needs. Don't reintroduce one.

**D — Product scope and post-launch hardening.**
- D1 Request-to-Book — shipped (#98).
- D2 Validation + error contract — shipped (#97).
- D3 Single-instance constraint — documented; scale-out is a standing trigger (below).
- D4 Observability — shipped (#100).
- D5 GDPR / legal + backups — **partially shipped, #101 stays open**: right-to-erasure (ADR-0010),
  the retention sweep (ships **disabled** pending counsel's retention window), checkout
  privacy/terms links as clearly-marked **draft** documents. Remaining: the human-gated legal
  texts + DPAs (Albanian sh.p.k. + Paysera + Hetzner direction, ADR-0009), and backups/PITR, now
  **self-managed on the Hetzner move** (ADR-0004).
- D6 Disputes + reconciliation — **blocked by #284 (ADR-0009)**: the Paysera migration removes the
  Stripe adapter outright, so this is built against Paysera's event catalogue + transaction API;
  the invariant-#8 net is gateway-neutral, only the adapter changes.

## Standing triggers (not scheduled)

**B3 — split `booking` when any of:**
1. Comment/blank-stripped main-source code passes **~4,000 LOC** (measure:
   `find platform/src/main/java/ai/riviera/platform/booking -name '*.java' -exec cat {} + | grep -vE '^\s*$|^\s*//|^\s*/?\*' | wc -l`).
   Raw LOC is deliberately not a clause: half the module is the house-style rationale Javadoc, so
   raw LOC tracks documentation discipline, not conceptual load (the original ~3,500-raw-LOC clause
   fired at 5,735 raw / 2,750 code and was re-set, not acted on — #463).
2. A **third distinct scheduler** appears.
3. A **non-lifecycle concern lands** — anything that is not a state, a read, or a post-commit
   errand of the `Booking` aggregate.
4. **The refund-execution seam deepens** — it acquires its own persistent state (a refund table) or
   a second consumer of its surface.

The designated first cut when it fires: the refund-execution seam (the `BookingCancelled` listener
+ bounded executor + shed metric + admin re-drive), whose boundary is already the crispest and
which reuses `payout`'s listener-only shape on `booking::events`. Known first slices: the registry
listener id is the FQCN (`RegistryRefundOutbox.REFUND_LISTENER_ID`, so a move needs a roll-forward
registry migration — the `V18` precedent) plus re-keying `RefundListenerExecutorArchitectureTest`,
`RefundOutboxScopeIT` and `allowedDependencies`. The staff/operational read side is **not** part
of that cut; it belongs to B4. Chart the extraction through the normal SDLC (`to-spec` →
`to-issues`).

**B4 — a read-model module** if the dated read side grows more overlays (pricing seasons, weather
holds, promotions): a query module depending on `venue::api` and `availability::api` that owns the
composed browse/map views, collapsing the `venue::spi` inversion. Over-engineering until then.

**Scale-out** — the moment a second instance is on the table: ShedLock on every sweep and
rate-limit state in a shared store (Redis) first; the concrete failure modes are in
`docs/deploy/production-hardening.md`.
