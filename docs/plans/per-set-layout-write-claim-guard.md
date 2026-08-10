# Per-set layout write claim guard Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Riviera discipline baked into this template:** the Availability & concurrency,
> Spring-Modulith, and Payment & payout sections are first-class spec sections, not
> documentation. Skipping the Availability section on a booking/map feature is how
> the double-booking bug ships. Invariant numbers refer to `CLAUDE.md`.

**Goal:** Stop the per-set `editSet`/`removeSet` writes from destroying or invalidating a
committed `(set, date)` claim — no cascade-dropped staff hold, no FK-violation 500, no pool
flip under a live booking, and no claim admitted against a pool that changed underneath it.

**Architecture:** The single significant decision is **where the lock goes on each side of the
race**. `venue`'s per-set writes take `SELECT … FOR UPDATE` on the one `set_position` row
(existence check, claim probe and write all under it); the online claim's pool read moves to
`FOR KEY SHARE` on that same row — the *exact* lock its own subsequent FK check already takes,
just acquired early enough that the pool it read cannot change before the `INSERT` commits.
`FOR KEY SHARE` conflicts with `FOR UPDATE` and with nothing else, so the two layout writes
serialize against a claim while concurrent claims and `repriceRow`'s plain `UPDATE`
(`FOR NO KEY UPDATE`) stay unblocked.

**Persistence:** JDBC only (invariant #1). Tables read/locked: `set_position`,
`set_availability`, `booking`. **No migration** — the guard is application-layer, and the
set-scoped booking probe rides the existing `booking_set_date_idx (set_id, booking_date)`
leftmost prefix (V5).

**Source of intent:** GitHub issue #567

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
per-set endpoints have **no frontend caller**, making this backend-only, and that the issue's
suggested fix is incomplete for scenario 4) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what turned "guard editSet" into an explicit per-field
verdict) · `tdd` (each AC red-first: unit guard tests, then the controller status, then the
two Testcontainers races) · `riviera-review-overlay` (review gate — runs at ready-for-review)
· `riviera-docs-freshness` (ran at close-out over the slice's merge range — see Execution
status) · `riviera-modulith` (kept the set-scoped booking probe on the existing
`venue.spi.BookingPresence` rather than minting a fifth port, and confirmed no
`allowedDependencies` change is needed) · `riviera-java-conventions` (typed outcome
`SetRejection.SET_IN_USE` over an exception; `SetPlacement` as a record with the policy
inside it) · `postgres` (chose `FOR KEY SHARE` over `FOR SHARE` for the claim's pool read, so
`repriceRow` keeps running during bookings; confirmed no new index) · `codebase-design`
(`SetPlacement#disturbedBy` hides *which* fields are claim-relevant behind one boolean, so the
policy has one home) · `riviera-local-debug` (scoped Gradle runs; system `gradle` + JDK-25
toolchain in this cloud session)

**Branch:** `claude/sdlc-567-256zjs` — the cloud session's designated remote branch, standing
in for `bugfix/per-set-layout-write-claim-guard` (`riviera-sdlc` § Remote/cloud addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1 (staff hold survives a remove):** Given set S carries a `STAFF_MARKED` hold on
      date D, when the owner calls `EditBeachMap.removeSet(owner, V, S)`, then the outcome is
      `Rejected(SET_IN_USE)` and the `set_availability` row for `(S, D)` still exists.
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetIsHeld` +
      `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409`
- [ ] **AC-2 (a booked set answers 409, never 500):** Given set S has a `booking` row of any
      status, including a terminal one, when the owner calls `removeSet`, then the outcome is
      `Rejected(SET_IN_USE)` and no `DataIntegrityViolationException` is raised.
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetHasAnyBooking` +
      `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError`
- [ ] **AC-3 (no pool flip under a claim):** Given set S is claimed (a hold on any date or a
      booking of any status), when the owner calls `editSet` with a command whose `pool`,
      `rowLabel`, `positionNo`, `gridX` or `gridY` differs from the stored row, then the
      outcome is `Rejected(SET_IN_USE)` and the stored pool is unchanged (invariant #3).
      *Pinned by:* `VenueAdminServiceTest.editSetIsRefusedWhenAClaimedSetWouldBeRepositioned`
- [ ] **AC-4 (price and tier stay editable on a claimed set):** Given set S is claimed, when
      the owner calls `editSet` with a command that changes only `priceMinor`,
      `priceCurrency` or `tier`, then the outcome is `Applied` and the write lands.
      *Pinned by:* `VenueAdminServiceTest.editSetAppliesAPriceOnlyChangeToAClaimedSet`
- [ ] **AC-5 (no regression on an unclaimed set):** Given set S has no hold and no booking,
      when the owner calls `editSet` (any fields) or `removeSet`, then the outcome is
      `Applied`. *Pinned by:* `VenueAdminServiceTest.editSetAppliesEveryChangeToAnUnclaimedSet`
      + the existing `VenueAdminControllerIT.removeSetTakesItOffTheMap`
- [ ] **AC-6 (claim vs pool flip cannot both win):** Given an `ONLINE` set S with no hold,
      when `AvailabilityClaim.claim(S, D)` and an `editSet` flipping S to `WALK_IN` run
      concurrently, then either the claim is `CLAIMED` and the edit is `Rejected(SET_IN_USE)`,
      or the edit is `Applied` and the claim is `NOT_ONLINE_POOL` — never a `BOOKED_ONLINE`
      row on a `WALK_IN` set (invariants #2/#3).
      *Pinned by:* `SetWriteVsClaimConcurrencyIT.claimAndPoolFlipCannotBothWin`
- [ ] **AC-7 (claim vs remove cannot both win):** Given an `ONLINE` set S with no hold, when
      `claim(S, D)` and `removeSet(S)` run concurrently, then either the claim is `CLAIMED`
      and the remove is `Rejected(SET_IN_USE)` with the hold intact, or the remove is
      `Applied` and the claim is `NO_SUCH_SET` — never a cascade-dropped hold and never a
      raised `DataIntegrityViolationException`.
      *Pinned by:* `SetWriteVsClaimConcurrencyIT.claimAndRemoveCannotBothWin`

## Non-goals

- **Retiring the per-set `POST`/`PATCH`/`DELETE …/sets` endpoints.** They have no frontend
  caller today (the console uses the bulk `PUT …/beach-map` + per-row reprice), but they are
  shipped API and O3 deliberately kept them (`docs/plans/o3-layout-editor.md` § Out of scope).
  Retiring them is a separate decision, not a bug fix.
- **Giving the per-set writes an `expectedVersion` optimistic-concurrency token.** `editSet`/
  `removeSet` do not participate in `set_version`; adding it would change the request bodies
  of shipped endpoints. The row lock closes the claim race this issue is about; lost-update
  between two operators editing the same set is a different problem.
- **Relaxing `replaceLayout`'s venue-wide `hasBookings(VenueId)` guard to the set-scoped
  probe.** The bulk path deletes every set, so venue-wide is the correct scope there. This
  slice adds a set-scoped question; it does not re-answer the venue-scoped one.
- **Widening `ApiErrorHandler` to map `DataIntegrityViolationException`.** The FK-violation
  500 is fixed by pre-empting the violation, not by re-mapping it — `CLAUDE.md` keeps
  non-duplicate `DataIntegrityViolationException` as a logged 500 on purpose.
- **Any frontend or e2e work.** No Angular surface calls these endpoints.

## Behavior-parity ledger (retirement / replacement slices only)

> The slice does not retire a surface, but it **narrows two shipped endpoints' accepted
> inputs**, which is the same risk in the other direction: a caller that used to succeed now
> gets a 409. Enumerated per behavior so review can check rather than re-derive.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `removeSet` on an unclaimed set → `204` | preserved | guard is a no-op when `anyClaims` and `hasBookings` are both false |
| `removeSet` on a set with a staff hold → `204`, hold silently CASCADE-dropped | **changed** → `409 SET_IN_USE`, hold kept | the bug (invariant #2); AC-1 |
| `removeSet` on a set with any booking → `500` (FK RESTRICT) | **changed** → `409 SET_IN_USE` | the guard pre-empts the FK violation; AC-2 |
| `removeSet` on an unknown set → `404 NO_SUCH_SET` | preserved | `lockSet` returning empty replaces the DELETE's rows-affected as the existence check |
| `editSet` on an unclaimed set, any fields → `204` | preserved | guard only fires when the set is claimed; AC-5 |
| `editSet` changing pool/position on a claimed set → `204` | **changed** → `409 SET_IN_USE` | the bug (invariant #3); AC-3 |
| `editSet` changing only price/tier on a claimed set → `204` | preserved | `SetPlacement#disturbedBy` returns false, so the guard does not fire; AC-4 (the decision the user took at the plan gate) |
| `editSet` conflict detection (`CELL_TAKEN` / `DUPLICATE_POSITION` → 409) | preserved | `findConflict` still runs, after the claim guard |
| `editSet` on an unknown venue/set → `404` | preserved | `venueExists` then `lockSet` |
| `addSet` behavior, all paths | preserved | untouched — a set being created cannot already be claimed |
| `AvailabilityClaim.claim` outcomes (`CLAIMED`/`ALREADY_TAKEN`/`NOT_ONLINE_POOL`/`NO_SUCH_SET`) | preserved | same four outcomes; only the pool read's lock strength changes |
| `repriceRow` allowed on a venue with holds/bookings | preserved | `FOR KEY SHARE` does not conflict with its plain `UPDATE`'s `FOR NO KEY UPDATE` — the reason `FOR SHARE` was rejected |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The claim's pool read keeps its stale value across the block, so `editSet`'s `FOR UPDATE` serializes the writes but still admits `BOOKED_ONLINE` on a now-`WALK_IN` set (invariant #3) — the gap in the issue's own suggested direction | high (certain without the fix) | high | the claim reads `pool` under `FOR KEY SHARE` on the `set_position` row, so it either blocks and re-reads the new pool, or holds the lock and forces `editSet` to see its hold; AC-6 | agent | open |
| R-2 | Lock-strength choice blocks work that must stay allowed — `FOR SHARE` would conflict with `repriceRow`'s `FOR NO KEY UPDATE` and stall repricing during bookings | med | med | `FOR KEY SHARE` chosen: conflicts with `FOR UPDATE` only; parity row in the ledger + AC covered by the existing `VenueRepriceIT` staying green | agent | open |
| R-3 | Deadlock between the per-set write and the bulk `replaceLayout` (which takes the venue row then its set rows) | low | high | `editSet`/`removeSet` take **only** the one `set_position` row and never the venue row, so no cycle exists; `replaceLayout` waits on the set row and proceeds. Existing `VenueSetWriteConcurrencyIT` (replace vs reprice) must stay green | agent | open |
| R-4 | Narrowing two shipped endpoints breaks an unknown caller | low | med | no frontend caller exists (grepped `frontend/src`); the change is 204→409 on inputs that were previously data-destroying or a 500; Behavior-parity ledger enumerates every path | agent | open |
| R-5 | Renaming `SetBookingFacts#poolOf` → `poolForClaim` is a published `api/` port change | low | med | exactly one production caller (`JdbcAvailabilityClaim`) plus two test doubles; the rename is the point — a locking read must not be reachable from a read path (it errors inside a `readOnly` transaction), so the name warns callers off | agent | open |
| R-6 | Per-venue authorization regressed while reordering the guards (invariant #13, BOLA) | low | high | `ownership.assertOwns` stays the **first** statement of both methods, before `venueExists` and before any lock; `CrossVenueDenialIT` pins it | agent | open |
| R-7 | Flyway version collision | none | — | **no migration in this slice**; the set-scoped booking probe rides `booking_set_date_idx` (V5). Open PRs at plan time were Dependabot-only, no `db/migration` diff | agent | closed — N/A |
| R-8 | **The Testcontainers ITs cannot run in this session**, so AC-1/AC-2 (HTTP) and AC-6/AC-7 (the two races) get no local green — a guard could ship unverified | high (certain) | high | Docker Hub returned `toomanyrequests` on `postgres:17`, so the daemon was stopped by pidfile per `docs/agents/docker-testcontainers.md` and the ITs now **skip cleanly** rather than fail for an environmental reason. Local verification is therefore unit-level only; **CI owns every IT in this slice**, and no phase may be declared green until its PR CI run is read (`riviera-sdlc` CI-gate rule). Every guard also has a unit-level twin in `VenueAdminServiceTest`, so the ITs are the concurrency proof, not the only proof of the policy | agent | open |

## Open questions / Assumptions

*(empty — see Resolved)*

### Resolved

- **Open question:** How broadly should `editSet` refuse on a claimed set — any edit, only
  claim-relevant fields, or only live claims? → **Resolved by the user at the plan gate
  (`AskUserQuestion`, this session): only claim-relevant fields.** `editSet` refuses when the
  command would change `pool`, `rowLabel`, `positionNo`, `gridX` or `gridY` on a claimed set;
  `tier` and price stay editable, consistent with `repriceRow` being deliberately allowed
  during bookings. `removeSet` has no such choice — the `booking.set_id` RESTRICT FK makes a
  booked set physically undeletable, so it refuses on any claim.
- **Assumption:** "claimed" means any `set_availability` row on **any** date or any `booking`
  row of **any** status, matching `replaceLayout`'s existing stance. → Confirmed against
  `SetAvailabilityLookup#anyClaims` and `BookingPresence#hasBookings`, both documented
  date-agnostic / status-agnostic; the set-scoped probe keeps the same semantics so the two
  layout paths answer "is this claimed?" identically.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged by this slice — online
  booking (`JdbcAvailabilityClaim.claim`), staff tap-to-mark
  (`StaffAvailabilityService.mark`), release on cancel/decline/expiry
  (`JdbcAvailabilityClaim.release`, `StaffAvailabilityService.release`). This slice adds **no
  writer**; it stops two `venue` writes from *destroying* rows those writers committed.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` (V4) —
  untouched.
- **Concurrency strategy:** two conflicting row locks on the one `set_position` row that both
  sides already reference.
  - `venue`'s `editSet`/`removeSet`: `SELECT … FROM set_position WHERE id = :setId AND
    venue_id = :venue FOR UPDATE`, taken **before** the claim probe, held to commit. This is
    the same technique `replaceLayout` uses via `lockSetsOfVenue`, narrowed to one row.
  - `availability`'s claim: `SELECT pool FROM set_position WHERE id = :id FOR KEY SHARE`,
    replacing the unlocked pool read. `FOR KEY SHARE` is precisely the lock the claim's own
    `INSERT` already takes for its FK check — the change is *when* it is acquired, not how
    strong it is, so no new blocking is introduced between concurrent claims.
  - Resulting serialization, both orders safe: claim first ⇒ the layout write blocks on
    `FOR UPDATE`, then its probe sees the committed hold ⇒ `SET_IN_USE`. Layout write first ⇒
    the claim blocks on its pool read, then re-reads the post-commit truth ⇒ `NOT_ONLINE_POOL`
    (flipped) or `NO_SUCH_SET` (removed). The check-then-act window the issue describes is
    closed on both sides, not one.
  - **Deadlock:** `editSet`/`removeSet` acquire exactly one lock and never the venue row, so
    they cannot participate in a cycle with `replaceLayout`/`repriceRow` (venue row → set
    rows). The claim acquires `set_position` before `set_availability`, the same order as
    before.
- **Pool rule (invariant #3):** enforced twice now — the claim still refuses a non-`ONLINE`
  set, and `editSet` can no longer move a set out of the `ONLINE` pool while a hold or booking
  references it. AC-3 and AC-6 pin the two halves.
- **Cutoff rule (invariant #4):** not affected — no booking-date arithmetic in scope.
- **Pinning test:** `SetWriteVsClaimConcurrencyIT.claimAndPoolFlipCannotBothWin` and
  `.claimAndRemoveCannotBothWin` — real Postgres, two threads on a latch, repeated to
  exercise both interleavings (the shape `StaffMarkVsOnlineClaimConcurrencyIT` and
  `VenueSetWriteConcurrencyIT` already use).

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | owns the beach map, set positions and the pool assignment — the writes being guarded are its own |
| M-2 | `booking` | existing | `Booking` | sole owner/reader of the `booking` table, so the set-scoped presence probe is answered here |
| M-3 | `availability` | existing | `SetAvailability` | sole writer of `set_availability`; its claim is the other side of the race |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#poolForClaim(SetId)` — **renamed** from `poolOf`, now a locking read (`FOR KEY SHARE`) | `SetId`, `Optional<String>` | `availability` |
| NI-2 | `venue.spi` | `BookingPresence#hasBookings(SetId)` — **added** beside the existing `hasBookings(VenueId)` | `SetId` | implemented by `booking`, called by `venue` |
| NI-3 | `venue.spi` | `SetAvailabilityLookup#anyClaims(Collection<SetId>)` — **reused unchanged**, called with a single-element list | `SetId` | implemented by `availability`, called by `venue` |

No `allowedDependencies` change: `venue → booking`/`availability` inversions and
`availability → venue::api` already exist. Adding a method to a granted named interface, and
renaming a method within one, changes no edge — `ModularityTests` must stay green as-is.

**Domain events (id-based payloads, invariant #11)**

| # | Event | Published by | Payload (ids) | Subscribers | Sync/async | Pinned by test |
|---|---|---|---|---|---|---|
| — | none | — | — | — | — | — |

No event: a refused layout edit changes no state, and an applied one changes venue-owned
static layout that the tourist map reads live. Same reasoning `replaceLayout` recorded.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide whether a per-set layout write is allowed against a claim | `venue` | `venue` Job: "own the beach map / layout, set positions, the online-vs-walk-in pool assignment" — this is the guard on its own write, exactly where `replaceLayout`'s twin already lives. Not `availability` (its Job is the per-`(set, date)` state, and "knowing whether a specific set is free" is on `venue`'s **Not-My-Job** list only as a *lookup*, which is why it asks through `spi`) |
| Answer "does this **set** have any booking?" | `booking` | `booking` Job: sole owner of the `booking` table. On `venue`'s **Not-My-Job**: "Creating or tracking bookings → `booking`". Dependency-inverted through `venue.spi.BookingPresence`, the same edge the venue-scoped probe already uses |
| Answer "does this set have any hold, any date?" | `availability` | unchanged — `SetAvailabilityLookup#anyClaims` already exists and is already implemented there; `venue`'s Not-My-Job line ("Knowing whether a specific set is free on a date → `availability`") is honored by asking rather than reading the table |
| Hold the claim's pool read under a lock | `venue` | the lock is on `set_position`, `venue`'s table; `availability` must not lock a table it does not own, so the locking read is a `venue.api` port method it calls (invariant #11) |
| Know *which* set fields a claim depends on | `venue` | `SetPlacement#disturbedBy` — pool + physical position are layout facts, `venue`'s Job. Kept in one record so the policy has a single home rather than an inline field-by-field comparison in the service |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` No money moves: the slice refuses two layout writes and changes
a lock. No `payment`/`payout` code, no amount arithmetic, no refund path. The only adjacent
money fact is that `repriceRow` must keep working during bookings, which R-2 protects.

## Angular — frontend surfaces touched

`N/A — backend-only.` Grepped `frontend/src`: no caller of `POST`/`PATCH`/`DELETE
/api/venues/{venueId}/sets/{setId}` exists. The operator console's Layout tab writes through
`PUT …/beach-map` (`operator-console.service.ts:117`) and the Pricing tab through
`PUT …/rows/{rowLabel}/price`; the only per-set calls are `…/sets/{setId}/availability`
(staff mark), which this slice does not touch. No e2e spec is due.

## FE↔BE contract

- **New/changed endpoints:** no new endpoint and no DTO change. Two existing endpoints gain
  one rejection: `PATCH /api/venues/{venueId}/sets/{setId}` and
  `DELETE /api/venues/{venueId}/sets/{setId}` may now answer **`409` with
  `code: "SET_IN_USE"`** (RFC-7807 `ProblemDetail` via `ApiProblem`, per
  `riviera-java-conventions` §6b). `DELETE` on a booked set changes from an unintended `500`
  to that `409`.
- **Client typing:** no client change — no Angular caller exists.
- **Money/date on the wire:** unchanged.

## Execution status

**Stage pointer:** `implement (phase 3)`

**Next action:** Close the check-then-claim race — rename `SetBookingFacts#poolOf` to
`poolForClaim` and read the pool under `FOR KEY SHARE`.

> **Phases 1 and 2 landed in one commit.** Phase 2's guard is what makes the `editSet` half of
> `VenueAdminControllerIT` pass, and the ITs cannot run locally (R-8), so splitting them would
> have pushed a knowingly-red test that no local run could have caught. Both guards share one
> `isClaimed` helper and one `SET_IN_USE` reason, so the diff is one thought.

> **Local verification is unit-level only this session (R-8).** Docker Hub rate-limited the
> `postgres:17` pull, so the daemon was stopped and every `*IT` **skips**. Read each push's CI
> run before building the next phase on it.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Set-scoped claim probe (`BookingPresence#hasBookings(SetId)`) | ✅ | `beb6892` |
| 1 — Guard `removeSet` under a row lock (`SET_IN_USE`) | ✅ | `e488dd0` |
| 2 — Guard `editSet` field-sensitively (`SetPlacement`) | ✅ | `e488dd0` |
| 3 — Close the claim race (`poolForClaim`, `FOR KEY SHARE`) | ⏳ | |
| 4 — Concurrency ITs + docs (RESPONSIBILITIES, close-out) | | |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `docs/plans/per-set-layout-write-claim-guard.md` — this plan doc
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — the two guards
- `platform/src/main/java/ai/riviera/platform/venue/application/SetPlacement.java` — new record; the claim-relevant fields + `disturbedBy`
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — `SET_IN_USE`
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `lockSet` port method
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — contract Javadoc for the narrowed methods
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — `lockSet` SQL (`FOR UPDATE`)
- `platform/src/main/java/ai/riviera/platform/venue/adapter/in/VenueAdminController.java` — `SET_IN_USE` → 409
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — `poolOf` → `poolForClaim`, locking contract
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `FOR KEY SHARE` on the pool read
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — `hasBookings(SetId)`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — the set-scoped probe
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcAvailabilityClaim.java` — call the renamed port
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — new; pins that the set-scoped probe isolates to its own set
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1..AC-5 unit level
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-1/AC-2 at HTTP
- `platform/src/test/java/ai/riviera/platform/venue/SetWriteVsClaimConcurrencyIT.java` — new; AC-6/AC-7
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stub follows the port rename
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — `FakeCatalog` follows the port rename
- `RESPONSIBILITIES.md` — `venue` § the per-set guard + the locking-read contract
- `docs/plans/o3-layout-editor.md` — correct the superseded review-gate row that judged the single-set path unaffected

---

## Phase 0 — Set-scoped claim probe

**Files:** Modify `venue/spi/BookingPresence.java` · `booking/adapter/out/JdbcBookingPresence.java` · Test `venue/application/VenueAdminServiceTest.java` (fake), new `booking/adapter/out/JdbcBookingPresenceIT.java` if the existing IT does not cover the set-scoped read

- [ ] **Step 1: Write the failing test** — a `JdbcBookingPresence` IT asserting
      `hasBookings(setId)` is true for a set with a terminal booking and false for a sibling
      set on the same venue (proving it is set-scoped, not venue-scoped).
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*JdbcBookingPresence*"` →
      FAIL (method does not exist / wrong scope)
- [ ] **Step 3: Minimal implementation** — add `hasBookings(SetId)` to the SPI and
      `SELECT EXISTS(SELECT 1 FROM booking WHERE set_id = :set)` to the adapter.
- [ ] **Step 4: Run it, verify it passes** — same command → PASS
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Answer booking presence per set, not only per venue (#567)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.
- [ ] **Step 8: Open the draft PR** — CI runs on `pull_request` only.

---

## Phase 1 — Guard `removeSet` under a row lock

**Files:** Modify `venue/application/{Venues,SetRejection,VenueAdminService,EditBeachMap}.java` ·
`venue/adapter/out/JdbcVenues.java` · `venue/adapter/in/VenueAdminController.java` ·
Test `venue/application/VenueAdminServiceTest.java` · `venue/VenueAdminControllerIT.java`

- [ ] **Step 1: Write the failing tests** — AC-1, AC-2 (unit + HTTP).
- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenueAdminServiceTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `Venues#lockSet` (`FOR UPDATE`, returning
      `Optional<SetPlacement>`), `SetRejection.SET_IN_USE` → 409, and the `removeSet` order:
      `assertOwns` → `venueExists` → `lockSet` → claim probe → `deleteSet`.
- [ ] **Step 4: Run them, verify they pass** — then `gradle test --tests "*venue*"`
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Refuse to remove a held or booked set (#567)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Guard `editSet` field-sensitively

**Files:** Create `venue/application/SetPlacement.java` · Modify
`venue/application/VenueAdminService.java` · Test `venue/application/VenueAdminServiceTest.java`

- [ ] **Step 1: Write the failing tests** — AC-3, AC-4, AC-5.
- [ ] **Step 2: Run them, verify they fail** — `gradle test --tests "*VenueAdminServiceTest*"` → FAIL
- [ ] **Step 3: Minimal implementation** — `SetPlacement#disturbedBy(SetCommand)` comparing
      pool + row label + position + grid; `editSet` rejects `SET_IN_USE` only when
      `disturbedBy` **and** the set is claimed.
- [ ] **Step 4: Run them, verify they pass** — then `gradle test --tests "*venue*"`
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Refuse to reposition or repool a claimed set (#567)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 3 — Close the check-then-claim race

**Files:** Modify `venue/api/SetBookingFacts.java` · `venue/adapter/out/JdbcVenueCatalog.java` ·
`availability/adapter/out/JdbcAvailabilityClaim.java` · Test `WebSliceStubs.java` ·
`booking/application/reserve/CreateBookingServiceTest.java`

- [ ] **Step 1: Write the failing test** — AC-6 (`SetWriteVsClaimConcurrencyIT`), which fails
      today because the claim's unlocked pool read admits a `BOOKED_ONLINE` row on a flipped set.
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*SetWriteVsClaimConcurrencyIT*"` → FAIL
- [ ] **Step 3: Minimal implementation** — rename `poolOf` → `poolForClaim`, `SELECT pool …
      FOR KEY SHARE`, update the one production caller and the two test doubles.
- [ ] **Step 4: Run it, verify it passes** — then `gradle test --tests "*venue*" --tests "*availability*"`
- [ ] **Step 5: Generalization-audit pass**
- [ ] **Step 6: Commit** — `git commit -m "Read the claim's pool under the lock its own insert takes (#567)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 4 — Concurrency coverage and docs

**Files:** Test `venue/SetWriteVsClaimConcurrencyIT.java` (AC-7) · Modify `RESPONSIBILITIES.md` ·
`docs/plans/o3-layout-editor.md` · this plan doc

- [ ] **Step 1: Write the failing test** — AC-7 (claim vs remove).
- [ ] **Step 2: Run it, verify it fails** — `gradle test --tests "*SetWriteVsClaimConcurrencyIT*"`
- [ ] **Step 3: Minimal implementation** — none expected beyond Phases 1–3; if the test fails
      for a reason the guards do not cover, that is a finding, not a test to weaken.
- [ ] **Step 4: Run it, verify it passes** — then the structural net:
      `gradle test --tests "*ModularityTests*" --tests "*JdbcOnlyArchitectureTests*" --tests "*PackageShapeArchitectureTests*" --tests "*PublishedSurfacePlacementArchitectureTests*"`
- [ ] **Step 5: Generalization-audit pass** — sweep every other `set_position` check-then-act.
- [ ] **Step 6: Commit** — `git commit -m "Pin the set-write vs claim races against real Postgres (#567)"`
- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `gradle test --tests "*VenueAdminServiceTest*" --tests "*VenueAdminControllerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-2:** Run `gradle test --tests "*VenueAdminServiceTest*" --tests "*VenueAdminControllerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-3:** Run `gradle test --tests "*VenueAdminServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-4:** Run `gradle test --tests "*VenueAdminServiceTest*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-5:** Run `gradle test --tests "*VenueAdminServiceTest*" --tests "*VenueAdminControllerIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-6:** Run `gradle test --tests "*SetWriteVsClaimConcurrencyIT*"` → PASS. Verified at commit `<sha>`.
- [ ] **AC-7:** Run `gradle test --tests "*SetWriteVsClaimConcurrencyIT*"` → PASS. Verified at commit `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [ ] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [ ] Refund policy enforced server-side (invariant #10).
- [ ] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [ ] Booking codes unguessable (invariant #7).
- [ ] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [ ] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #NN`, so no docs-only follow-up PR is needed after the merge.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      If tooling blocked the review, that is stated in the PR and its checkbox is left
      unticked.

If any box is unchecked, the feature is not done. Record the gap in Open Questions.
