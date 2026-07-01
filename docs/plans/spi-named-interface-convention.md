# SPI named-interface convention + venue.spi split Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, routed via `riviera-sdlc`.
> Backend-structure + workflow-docs slice. Skill-routing gate: `riviera-modulith` (the
> boundary mechanics) + `riviera-java-conventions` (the Java). No DB, no frontend, no money.
> Invariant numbers refer to `CLAUDE.md`.

**Goal:** Introduce an explicit **`spi` named-interface** convention for cross-module **driven
(outbound) ports** — interfaces a module needs *another* module to implement — and apply it to
the one such port that exists today, `SetAvailabilityLookup` (issue #44), by moving it from
`venue.api` to a new `venue.spi`. Then **codify the rule into the workflow** (CLAUDE.md
invariant #11, the `riviera-modulith` skill, the `riviera-review-overlay` bank, and the
`riviera-sdlc` routing gate) so every future cross-module driven port follows it automatically.

**Background — why now.** `#44` used dependency inversion: `venue` needs "which sets are taken
on date D?" but cannot depend on `availability` (that would cycle, since `availability` already
depends on `venue::api`). So `venue` declared the driven port and `availability` implements it.
The port was parked in `venue.api` as a deliberate one-case simplification. `api/` semantically
means **inbound** ports others *call* (`VenueCatalog`); a driven port others *implement* is the
opposite role. Rather than wait for a second case, we make the distinction explicit now and bake
it into the rules so the codebase stays legible as more inverted ports appear.

**The rule being established.**
- **Inbound / driving port** (others call in) → `<module>.api`, `@NamedInterface("api")`.
- **Driven / outbound port implemented by the module's *own* infrastructure** → stays internal
  in `application.out` (not published).
- **Driven / outbound port that must be implemented by *another* module** (cross-module
  dependency inversion) → `<module>.spi`, `@NamedInterface("spi")`.
- **Least privilege:** the *implementing* module lists `<provider>::spi` (plus `<provider>::api`
  if it also calls it); modules that only *call* the provider list `<provider>::api` only.

**Architecture / Modulith.** `venue` gains a second named interface `spi` alongside `api`.
`SetAvailabilityLookup` moves to `venue.spi` (it still references `venue.api.SetId` — intra-module,
unrestricted). `availability`'s `allowedDependencies` becomes `{ "venue::api", "venue::spi" }`
(it needs `api` for `SetId`/`VenueCatalog.poolOf` and `spi` to implement the lookup). `booking`
is unchanged — it only *calls* venue, so it keeps `venue::api` only, never granted `venue::spi`
(the least-privilege win the split makes visible). The dependency graph is byte-for-byte the same
(`availability → venue`); `ModularityTests.verify()` is the gate.

**Why a test can't enforce "api vs spi" (so the review gate must).** Whether an interface is a
"call-me" (api) or "implement-me" (spi) port is *semantic* — not mechanically detectable by
`verify()`. So enforcement for future ports lives in the **review gate** (a new
`riviera-review-overlay` bank item) plus the skill docs, not in a brittle unit test. `verify()`
still guarantees the boundary is legal (named interfaces + `allowedDependencies`).

**Skills consulted:** `riviera-modulith` (the api-vs-spi convention, named-interface mechanics,
`allowedDependencies` per consumer, `verify()` contract — this slice both *applies* and *extends*
this skill). `riviera-java-conventions` (package move, package-private adapter unchanged, records,
javadoc). `riviera-plan-doc` (this doc). `tdd` (`ModularityTests.verify()` red→green is the teeth).
No `postgres` (no migration), no `angular-developer` (no frontend), no `riviera-stripe-payments`
(no money).

**Branch:** `claude/riviera-sdlc-issue-44-molx4o` (harness-designated; continuing on it — this is a
direct follow-on to #44's seam, not a separate feature line).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** `SetAvailabilityLookup` lives in `ai.riviera.platform.venue.spi`, exposed via a
  `@NamedInterface("spi")` `package-info`; nothing remains in `venue.api` for it. *Pinned by:*
  compilation + `ModularityTests`.
- [ ] **AC-2:** `availability` declares `allowedDependencies = { "venue::api", "venue::spi" }`
  and the build's module verification passes (no cycle; the boundary is legal). *Pinned by:*
  `ModularityTests.verifiesModularStructure`.
- [ ] **AC-3:** `booking` is **not** granted `venue::spi` (it only calls venue). *Pinned by:*
  `ModularityTests` (booking imports nothing from `venue.spi`) + inspection.
- [ ] **AC-4:** Behaviour is unchanged — the date-aware venue read still works end to end.
  *Pinned by:* `VenueReadControllerIT`, `AvailabilityLookupIT` stay green.
- [ ] **AC-5 (workflow):** The api-vs-spi rule is recorded in `CLAUDE.md` #11, the
  `riviera-modulith` skill, the `riviera-review-overlay` backend bank (a new item), and the
  `riviera-sdlc` routing gate. *Pinned by:* the diff + RV-PROC-1 self-check.
- [ ] **AC-6:** Full backend suite + scans green.

## Non-goals

- **No behaviour change**; pure structural relocation + documentation.
- **No new `spi` ports invented** — only the existing `SetAvailabilityLookup` moves.
- **No frontend / DB / money changes.**
- **No brittle "class X is in package Y" unit test** — api-vs-spi is semantic; the review gate
  enforces future cases (see rationale above).

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Moving the port breaks `verify()` because `availability` isn't granted `venue::spi` | high (expected red) | low | grant `venue::spi`; `ModularityTests` is the immediate gate (red→green) | agent | open |
| R-2 | A stale import to `venue.api.SetAvailabilityLookup` remains (main or test) | med | low | compiler catches it; grep-verified blast radius (4 referencing files) | agent | open |
| R-3 | `venue.spi` referencing `venue.api.SetId` is mistaken for a cross-interface violation | low | low | intra-module references are unrestricted; named interfaces gate only *cross-module* imports — `verify()` confirms | agent | open |
| R-4 | The convention is documented but not enforceable by a test, so it silently rots | med | med | encode it as a `riviera-review-overlay` bank item (RV-BE-3b) so the review gate checks every future cross-module port | agent | open |

## Open questions / Assumptions

### Resolved
- **Do it now vs wait for a 2nd case (user-decided):** establish the `spi` convention now and
  codify it, rather than waiting for a second inverted port. — *Owner:* user.
- **`SetId` stays in `venue.api`** (it is venue's published vocabulary, used by `booking`/
  `availability` broadly); only the driven *port* moves to `spi`. — *Owner:* agent.
- **Enforcement is process, not a unit test** (api-vs-spi is semantic). — *Owner:* agent.

## Availability & concurrency (invariant #2)

N/A — no write path, no availability logic changes. The relocated port is the same read-only
lookup; `set_availability` reads are untouched.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Change |
|---|---|---|
| M-1 | `venue` | new `spi` named interface; `SetAvailabilityLookup` moves `api → spi`; its catalog imports `venue.spi` (intra-module) |
| M-2 | `availability` | `allowedDependencies` += `venue::spi`; adapter imports `venue.spi.SetAvailabilityLookup` |

**Named interfaces after this slice**

| Module | `api` (inbound — others call) | `spi` (driven — others implement) |
|---|---|---|
| venue | `VenueCatalog`, `SetBookingInfo`, `SetId`, `VenueId`, `MoneyView`, `SetView`, `VenueMapView` | `SetAvailabilityLookup` |
| availability | `AvailabilityClaim`, `ClaimOutcome` | — |

**Domain events:** N/A.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money.

## Angular — frontend surfaces touched

N/A — backend structure + docs only.

## FE↔BE contract

N/A — no API shape change (the moved interface is internal cross-module wiring, not an HTTP shape).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — move port to venue.spi + grant venue::spi | ✅ | (this slice) |
| 1 — codify the rule (CLAUDE.md, riviera-modulith, review overlay, riviera-sdlc) | ✅ | (this slice) |
| 2 — verify (ModularityTests + ITs + full suite) + review gate | ✅ | (this slice) |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

> **Review-gate outcome (SDLC):** `riviera-review-overlay` + a focused independent reviewer over the
> diff. Full backend suite green (0 failures); `ModularityTests` green (boundary legal, acyclic);
> behavior ITs unchanged. RV-BE-3b verified PASS (driven port in `spi`; `availability` granted
> `venue::api`+`venue::spi`; `booking` not granted `venue::spi` — least privilege). RV-PROC-1 PASS.
> One **Minor** finding — a stale `RV-BE-14` cross-reference in risk R-4 — fixed (→ `RV-BE-3b`).

## Self-review checklist (before merge / PR)

- [ ] `ModularityTests.verifiesModularStructure()` green; no cycle; `availability` granted both
  named interfaces; `booking` granted only `venue::api`.
- [ ] No stale `venue.api.SetAvailabilityLookup` import remains.
- [ ] Behaviour ITs green (`VenueReadControllerIT`, `AvailabilityLookupIT`).
- [ ] Rule recorded in CLAUDE.md #11, `riviera-modulith`, `riviera-review-overlay` bank, and the
  `riviera-sdlc` routing gate (RV-PROC-1 stays truthful).
- [ ] Execution status matches reality; Open Questions resolved.
