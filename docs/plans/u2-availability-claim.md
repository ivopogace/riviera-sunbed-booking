# U2 — Availability source-of-truth + concurrency-safe claim Implementation Plan

> **For agentic workers:** implement with `implement` + `tdd`, routed via `riviera-sdlc`.
> Backend-only slice; phases pull `postgres` (migration) + `codebase-design` (the claim
> seam). Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency and
> Spring-Modulith sections are first-class. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Introduce the authoritative `set_availability(set_id, booking_date)` table and a
concurrency-safe `claim(SetId, LocalDate)` operation such that two simultaneous claims for
the same `(set, date)` produce exactly one winner, only `ONLINE`-pool sets are claimable,
and the guarantee is enforced both in the database (a `UNIQUE` constraint) and in the claim
(an atomic `INSERT … ON CONFLICT DO NOTHING`). This is the mechanism behind invariant #2 —
the double-booking guard.

**Architecture:** The single most significant decision: **a claimed `(set, date)` is
represented by the *existence of a row*** in `set_availability` — `FREE` is the absence of
a row, and the atomic `INSERT … ON CONFLICT DO NOTHING` against `UNIQUE(set_id,
booking_date)` is the entire concurrency primitive (no `SELECT … FOR UPDATE` needed). The
claim writes `state = 'BOOKED_ONLINE'` directly: the domain's `AvailabilityState` enum has
no provisional `HELD` state, so row-existence *is* the hold and U5's `BookingConfirmed`
becomes an idempotent confirm. The `availability` module is the **only** writer of this
table (invariant #2). The pool rule (#3) is enforced by a query through `venue.api`, not by
reaching into venue's table.

**Persistence:** JDBC only (invariant #1). New Flyway migration `V4__availability.sql`
(table + `UNIQUE` + `CHECK` + FK + FK index). PK is `BIGINT GENERATED ALWAYS AS IDENTITY`
(per `postgres`). `booking_date` is `DATE` (a `LocalDate` in `Europe/Tirane`, invariant #6);
audit timestamps are `TIMESTAMPTZ`.

**Source of intent:** GitHub issue **#5** (`[U2]`); design spec
`docs/superpowers/specs/2026-06-25-riviera-sunbed-booking-design.md`; domain model
`docs/architecture/domain-model.md` §3.2 (availability aggregate) and §6.2 (state machine).

**Skills consulted:** `postgres` (BIGINT-identity PK not UUID; `TIMESTAMPTZ`; `CHECK
(state IN …)` over a native enum; index the FK column; the `UNIQUE(set_id, booking_date)`
serves both invariant #2 and the `ON CONFLICT` target). `codebase-design` (the claim is a
deep module — tiny interface `claim(SetId, LocalDate) → ClaimOutcome` hiding the pool
lookup + atomic insert; one adapter ⇒ a hypothetical seam, so the JDBC adapter implements
the `api/` port directly, mirroring `JdbcVenueCatalog`; `venue.api` gains one focused query
`poolOf(SetId)` rather than a new shallow port). `domain-modeling` (reused existing
glossary — `claim`, `FREE`/`BOOKED_ONLINE`, `(set, date)`; no new ADR — row-as-hold is a
mechanism choice, not a hard-to-reverse surprising decision). `riviera-plan-doc` (this
template). `tdd` (red→green, concurrency IT is the teeth).

**Branch:** `claude/riviera-sdlc-u2-fpvwts` (harness-designated; exists).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a fresh schema, when `V4` runs, then `set_availability` exists with a
  `UNIQUE(set_id, booking_date)` constraint and a `CHECK` on `state`. *Pinned by:*
  `AvailabilityMigrationIT.uniqueConstraintRejectsDuplicateSetDate`.
- [ ] **AC-2:** Given an `ONLINE` set with no row for date D, when `claim(setId, D)` is
  called, then it returns `CLAIMED` and a `BOOKED_ONLINE` row exists. *Pinned by:*
  `AvailabilityClaimIT.claimingFreeOnlineSetSucceeds`.
- [ ] **AC-3:** Given an `ONLINE` set already claimed for date D, when a second
  `claim(setId, D)` is called, then it returns `ALREADY_TAKEN` and no second row is
  created. *Pinned by:* `AvailabilityClaimIT.claimingTakenSetIsRejected`.
- [ ] **AC-4:** Given a `WALK_IN`-pool set, when `claim(setId, D)` is called, then it
  returns `NOT_ONLINE_POOL` and no row is created (invariant #3). *Pinned by:*
  `AvailabilityClaimIT.walkInSetIsNotClaimable`.
- [ ] **AC-5:** Given a non-existent set id, when `claim(setId, D)` is called, then it
  returns `NO_SUCH_SET`. *Pinned by:* `AvailabilityClaimIT.unknownSetIsRejected`.
- [ ] **AC-6:** Given two threads claiming the same `(set, date)` simultaneously, when both
  submit, then exactly one returns `CLAIMED` and the other `ALREADY_TAKEN`, and exactly one
  row exists. *Pinned by:* `ConcurrentClaimIT.exactlyOneOfTwoConcurrentClaimsWins`.
- [ ] **AC-7:** Given the whole module, when `ApplicationModules.verify()` runs, then the
  Modulith boundaries hold (availability → `venue.api` is a legal named-interface
  dependency; no internal imports). *Pinned by:* `ModularityTests.verifiesModularStructure`.
- [ ] **AC-8:** CI is green (build + tests + scans).

## Non-goals

- **No booking flow, no REST endpoint, no event.** U2 is the availability mechanism only;
  `BookingConfirmed`/`BookingCancelled` wiring is U5 (#9), the HTTP `409` mapping is U3 (#6).
- **No `held_by_booking_id`, no `version` column.** `BookingId` does not exist until U3; the
  only write path in U2 is INSERT (claim) — there is no in-place state mutation to guard with
  optimistic locking yet. Both are added by the slice that needs them (U3/U6/U8).
- **No release / un-mark / cancellation.** Freeing a set (DELETE the row) arrives with
  cancellation (U6) and staff un-mark (U8).
- **No cutoff enforcement (invariant #4).** "No same-day booking" is a booking-policy check
  above the claim; it belongs to U3. The claim itself is date-agnostic.
- **No rewiring of the venue read map to the real table.** See the drift note below.
- **No `STAFF_MARKED` write path.** The `CHECK` admits it (the table is the multi-channel
  source of truth) but U2 only writes `BOOKED_ONLINE`; staff tap-to-mark is U8.

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | Two clients claim the same `(set, date)` concurrently and both succeed (double-sell) | med | **critical** | `UNIQUE(set_id, booking_date)` **and** atomic `INSERT … ON CONFLICT DO NOTHING`; `ConcurrentClaimIT` fires two real threads against Testcontainers Postgres and proves one winner | agent | open |
| R-2 | A walk-in-pool set gets claimed online (invariant #3 breach) | low | high | claim checks pool via `venue.api.VenueCatalog#poolOf` before insert; `AvailabilityClaimIT.walkInSetIsNotClaimable` | agent | open |
| R-3 | availability reaches into venue's `set_position` table directly, leaking the module boundary (invariant #11) | med | med | pool lookup goes through `venue.api` (named interface), not raw SQL on venue's table; `ModularityTests` enforces | agent | open |
| R-4 | Naive `SELECT`-then-`INSERT` throws `DuplicateKeyException` on the loser instead of a clean outcome | med | med | use single-statement `ON CONFLICT DO NOTHING` and read rows-affected; concurrency IT would surface an exception | agent | open |
| R-5 | First cross-module dependency: `venue.api` not exposed as a Modulith named interface → `verify()` fails | high | low | add `@NamedInterface("api")` package-info to `venue.api` (and `availability.api`); caught immediately by `ModularityTests` | agent | open |

## Open questions / Assumptions

- **Assumption (decided):** `FREE` = absence of a row; a claim writes `state =
  'BOOKED_ONLINE'`. The domain enum has no `HELD`; row-existence is the provisional hold,
  and U5's `BookingConfirmed → BOOKED_ONLINE` is therefore idempotent. — *Owner:* agent ·
  *Resolves by:* this plan (one-line change for U3/U5 if a distinct hold state is wanted).
- **Assumption (decided):** `SetId` lives in `venue.api` (it is the identity of
  `SetPosition`, a venue-owned entity — domain model §3.1), alongside `VenueId`. — *Owner:*
  agent.
- **Drift caught at the issue-intake grill gate:** `V2__venue_beach_map.sql`'s comment says
  *"U2 replaces the read source without changing the API."* That is **deferred to U3**: the
  U1 read API (`GET /api/venues/{id}`) has no `booking_date` parameter, but real availability
  is per-`(set, date)` — a date-aware read belongs with the booking flow. Issue #5's ACs
  never required it; the `seed_availability` column stays the read source until U3. Recorded
  here so the breadcrumb in V2 is not mistaken for in-scope work. — *Owner:* agent ·
  *Resolves by:* U3 (#6).

## Availability & concurrency (invariant #2)

- **Write paths to `set_availability(set_id, booking_date)` in scope:** exactly one — the
  online `claim` (INSERT). (Release/staff-mark/cancellation are out of scope per Non-goals.)
- **Uniqueness guarantee:** `CONSTRAINT set_availability_uniq UNIQUE (set_id, booking_date)`
  — a set is holdable by at most one party per date. This same unique index is the
  `ON CONFLICT (set_id, booking_date)` arbiter.
- **Concurrency strategy:** atomic `INSERT … ON CONFLICT DO NOTHING`, reading
  rows-affected (`1` ⇒ `CLAIMED`, `0` ⇒ `ALREADY_TAKEN`). Chosen over `SELECT … FOR UPDATE`
  because there is no pre-existing row to lock — the row's *creation* is the claim, so the
  unique index does the mutual exclusion in one statement with no lock-ordering surface.
- **Pool rule (invariant #3):** before the insert, `claim` calls
  `venue.api.VenueCatalog#poolOf(SetId)`; a non-`ONLINE` pool returns `NOT_ONLINE_POOL`, an
  absent set returns `NO_SUCH_SET`. Pool is immutable layout data, so the check-then-claim
  has no meaningful TOCTOU window.
- **Cutoff rule (invariant #4):** N/A in U2 — enforced above the claim in U3 (see Non-goals).
- **Pinning test:** `ConcurrentClaimIT.exactlyOneOfTwoConcurrentClaimsWins` — two threads,
  one barrier, same `(set, date)`; asserts one `CLAIMED` + one `ALREADY_TAKEN` and a single
  row.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `availability` | existing (was empty) | `SetAvailability` | sole writer of `(set, date)` state (invariant #2) |
| M-2 | `venue` | existing | `Venue`, `BeachMap` | owns `SetPosition` and its `pool`; exposes `poolOf` + `SetId` |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `availability.api` | `AvailabilityClaim#claim(SetId, LocalDate)` | `ClaimOutcome`, `SetId` (from `venue.api`) | `booking` (U3) |
| NI-2 | `venue.api` | `VenueCatalog#poolOf(SetId)` | `SetId` | `availability` |

`venue.api` and `availability.api` are exposed via `@NamedInterface("api")` package-info —
the repo's first cross-module dependency, so this exposure lands here.

**Domain events:** N/A in U2 — the `claim` is a synchronous command (the caller needs the
result transactionally to decide claim vs reject), modelled by the domain sequence as a
direct call, not an event. `BookingConfirmed`/`BookingCancelled` wiring is U5/U6.

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no money moves in U2.

## Angular — frontend surfaces touched

N/A — backend-only mechanism slice (issue #5 is `area:backend`; the demoable proof is the
concurrency test, not a screen).

## FE↔BE contract

N/A — no API shape changes (no REST surface in U2).

## Execution status

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Migration + venue.api pool lookup | ✅ | implemented & verified together with phases 1–2 |
| 1 — Availability claim port + adapter | ✅ | (same slice) |
| 2 — Concurrency IT + full-suite verify | ✅ | full suite: 19 tests, 0 skipped, 0 failures |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

> Build note: phases were implemented and verified as one cohesive slice (migration,
> port, adapter, and all three ITs are tightly coupled). Honest red→green signal: the
> first run failed to compile (`WebCorsConfigTest` used a lambda for the now-two-method
> `VenueCatalog`) — fixed to an explicit stub — and `ModularityTests` was the genuine gate
> for the repo's first cross-module dependency (`availability → venue.api`), which passed
> once `venue.api` was exposed as a `@NamedInterface`.

---

## File structure

- `platform/src/main/resources/db/migration/V4__availability.sql` — the table, `UNIQUE`,
  `CHECK`, FK, FK index.
- `platform/src/main/java/ai/riviera/platform/venue/api/SetId.java` — typed set id (new).
- `platform/src/main/java/ai/riviera/platform/venue/api/VenueCatalog.java` — add
  `poolOf(SetId)`.
- `platform/src/main/java/ai/riviera/platform/venue/api/package-info.java` —
  `@NamedInterface("api")` (new).
- `platform/src/main/java/ai/riviera/platform/venue/infrastructure/out/JdbcVenueCatalog.java`
  — implement `poolOf`.
- `platform/src/main/java/ai/riviera/platform/availability/api/AvailabilityClaim.java` —
  command port (new).
- `platform/src/main/java/ai/riviera/platform/availability/api/ClaimOutcome.java` — result
  enum (new).
- `platform/src/main/java/ai/riviera/platform/availability/api/package-info.java` —
  `@NamedInterface("api")` (new).
- `platform/src/main/java/ai/riviera/platform/availability/infrastructure/out/JdbcAvailabilityClaim.java`
  — adapter implementing the port (new).
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityMigrationIT.java` —
  DB constraint (new).
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityClaimIT.java` —
  claim outcomes (new).
- `platform/src/test/java/ai/riviera/platform/availability/ConcurrentClaimIT.java` —
  concurrency (new).

---

## Phase 0 — Migration + venue.api pool lookup

**Files:** Create `V4__availability.sql`, `venue/api/SetId.java`,
`venue/api/package-info.java` · Modify `VenueCatalog.java`, `JdbcVenueCatalog.java` · Test
`AvailabilityMigrationIT.java`

- [ ] **Step 1:** Write `AvailabilityMigrationIT` asserting a duplicate `(set_id,
  booking_date)` INSERT throws (unique constraint) and a bad `state` is rejected (check).
- [ ] **Step 2:** Run `./gradlew test --tests "*AvailabilityMigrationIT*"` → FAIL (no table).
- [ ] **Step 3:** Add `V4`, `SetId`, `venue.api` `@NamedInterface`, `poolOf` on the port +
  adapter.
- [ ] **Step 4:** Run the same test → PASS.
- [ ] **Step 5:** Generalization audit (FK index present on every FK column — compare V2).
- [ ] **Step 6:** Commit `[U2] availability table + venue.api poolOf (#5)`.
- [ ] **Step 7:** Update execution status.

## Phase 1 — Availability claim port + adapter

**Files:** Create `availability/api/AvailabilityClaim.java`, `ClaimOutcome.java`,
`availability/api/package-info.java`, `JdbcAvailabilityClaim.java` · Test
`AvailabilityClaimIT.java`

- [ ] **Step 1:** Write `AvailabilityClaimIT` (free→CLAIMED, taken→ALREADY_TAKEN,
  walk-in→NOT_ONLINE_POOL, unknown→NO_SUCH_SET).
- [ ] **Step 2:** Run `--tests "*AvailabilityClaimIT*"` → FAIL.
- [ ] **Step 3:** Implement the port + JDBC adapter (pool check via `venue.api`, atomic
  `INSERT … ON CONFLICT DO NOTHING`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Generalization audit.
- [ ] **Step 6:** Commit `[U2] concurrency-safe availability claim (#5)`.
- [ ] **Step 7:** Update execution status.

## Phase 2 — Concurrency IT + full-suite verify

**Files:** Test `ConcurrentClaimIT.java`

- [ ] **Step 1:** Write `ConcurrentClaimIT` (two threads + barrier, same `(set, date)`).
- [ ] **Step 2:** Run `--tests "*ConcurrentClaimIT*"` → PASS (the unique index makes it
  green; a non-atomic impl would throw).
- [ ] **Step 3:** Run the full suite `./gradlew test` → all green incl. `ModularityTests`.
- [ ] **Step 4:** Commit `[U2] concurrent-claim integration test (#5)`.
- [ ] **Step 5:** Update execution status.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-06-28 | Phase 0 — FK index on `set_availability.set_id` | every FK column has a backing index (cf. V2's `set_position_venue_id_idx`) | reviewed V2 + V4 migrations | V2 creates a standalone FK index; V4's FK is the leading column of `UNIQUE(set_id, booking_date)` | **Deviation, recorded:** no standalone `set_id` index in V4 — the composite unique index already serves `set_id` lookups/cascade checks via its leftmost prefix, so a standalone one would be a duplicate (`postgres` index-optimization). V2 needed its index because `venue_id` is not the lead of any unique key there. The "index every FK column" rule holds; the backing index just comes from the unique constraint. |

---

## Acceptance-criteria verification (final)

- [x] **AC-1..AC-6:** `./gradlew test --tests "*Availability*" --tests "*ConcurrentClaim*"`
  → all green (AvailabilityMigrationIT 2, AvailabilityClaimIT 4, ConcurrentClaimIT 1).
- [x] **AC-7:** `./gradlew test --tests "*ModularityTests*"` → green.
- [ ] **AC-8:** CI green on the PR (pending push).

## Review gate outcome (SDLC)

Ran `riviera-review-overlay` + `/code-review origin/main...HEAD` (high effort, 8 finder
angles). **No Blocker/Major findings.** RV-BE-1 (availability single-source-of-truth,
invariant #2) verified PASS; RV-CT-3/RV-BE-7 (payment-confirmation) N/A — no money in U2.
All 12 invariants checked green; module-boundary/contract finder found no breakage.

Resolved minor findings:
- **Test hygiene:** bounded `Future.get` in `ConcurrentClaimIT` so a hang fails fast
  instead of blocking CI.
- **Hardened the #1-invariant test:** beyond the minimal 2-thread proof, added
  `manyConcurrentClaimsYieldExactlyOneWinner` — 16 contenders racing the same `(set, date)`,
  `@RepeatedTest(5)` with a distinct date per repetition — so a single lucky-scheduling pass
  can't mask a regression. Asserts exactly one `CLAIMED`, the rest `ALREADY_TAKEN` (never an
  exception or a second win), one row.
- **Process:** recorded the FK-index deviation (no standalone `set_id` index) in the
  Generalization-audit log.

Noted, not fixed (deliberate / out-of-scope):
- **TOCTOU on concurrent set deletion** → uncaught `DataIntegrityViolationException` from the
  FK if a set were deleted between the pool check and the insert. Unreachable in v1 (no
  set-deletion path exists); revisit when venue/set deletion lands.
- **Read map shows `seed_availability` until U3** — documented deferral (see drift note); the
  authoritative table is write-only until U3 makes booking dates first-class on the read side.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD.
- [ ] **No JPA** introduced (invariant #1).
- [ ] **Availability** section filled; concurrency test present (invariant #2).
- [ ] Pool rule honored (invariant #3); cutoff correctly out-of-scope (#4).
- [ ] **Modulith** section filled; no cross-module internal imports; `venue.api` exposed as
  named interface; no event payloads needed (invariant #11).
- [ ] Payment/payout N/A justified.
- [ ] Timezone: `booking_date` is `DATE` (Europe/Tirane calendar day), audit cols
  `TIMESTAMPTZ` (invariant #6).
- [ ] Flyway migration present; the invariant-#2 constraint is tested (invariant #12).
- [ ] Execution-status table matches reality.
- [ ] Open Questions empty or deferred with a slice reference.
