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
· `riviera-docs-freshness` (**ran** over `origin/main...HEAD`, **4 findings, all patched** —
`SetRejection`'s status-map Javadoc omitted `SET_IN_USE`; `riviera-java-conventions` §5 and
`riviera-modulith`'s case history both still cited `poolOf`; `u2-availability-claim.md` still
asserted "pool is immutable layout data", the exact premise this slice overturns)
· `riviera-modulith` (kept the set-scoped booking probe on the existing
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

- [x] **AC-1 (staff hold survives a remove):** Given set S carries a `STAFF_MARKED` hold on
      date D, when the owner calls `EditBeachMap.removeSet(owner, V, S)`, then the outcome is
      `Rejected(SET_IN_USE)` and the `set_availability` row for `(S, D)` still exists.
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetIsHeld` +
      `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409`
- [x] **AC-2 (a booked set answers 409, never 500):** Given set S has a `booking` row of any
      status, including a terminal one, when the owner calls `removeSet`, then the outcome is
      `Rejected(SET_IN_USE)` and no `DataIntegrityViolationException` is raised.
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetHasAnyBooking` +
      `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError`
- [x] **AC-3 (no pool flip under a LIVE claim):** Given set S is live-claimed (a hold dated today
      or later, or a booking in a non-terminal status), when the owner calls `editSet` with a command whose `pool`,
      `rowLabel`, `positionNo`, `gridX` or `gridY` differs from the stored row, then the
      outcome is `Rejected(SET_IN_USE)` and the stored pool is unchanged (invariant #3).
      *Pinned by:* `VenueAdminServiceTest.editSetIsRefusedWhenAClaimedSetWouldBeRepositioned`
- [x] **AC-4 (price and tier stay editable on a claimed set):** Given set S is live-claimed, when
      the owner calls `editSet` with a command that changes only `priceMinor`,
      `priceCurrency` or `tier`, then the outcome is `Applied` and the write lands.
      *Pinned by:* `VenueAdminServiceTest.editSetAppliesAPriceOnlyChangeToAClaimedSet`
- [x] **AC-5 (no regression on an unclaimed set):** Given set S has no hold and no booking,
      when the owner calls `editSet` (any fields) or `removeSet`, then the outcome is
      `Applied`. *Pinned by:* `VenueAdminServiceTest.editSetAppliesEveryChangeToAnUnclaimedSet`
      + the existing `VenueAdminControllerIT.removeSetTakesItOffTheMap`
- [x] **AC-6 (claim vs pool flip cannot both win):** Given an `ONLINE` set S with no hold,
      when `AvailabilityClaim.claim(S, D)` and an `editSet` flipping S to `WALK_IN` run
      concurrently, then either the claim is `CLAIMED` and the edit is `Rejected(SET_IN_USE)`,
      or the edit is `Applied` and the claim is `NOT_ONLINE_POOL` — never a `BOOKED_ONLINE`
      row on a `WALK_IN` set (invariants #2/#3).
      *Pinned by:* `SetWriteVsClaimConcurrencyIT.claimAndPoolFlipCannotBothWin`
- [x] **AC-7 (claim vs remove cannot both win):** Given an `ONLINE` set S with no hold, when
      `claim(S, D)` and `removeSet(S)` run concurrently, then either the claim is `CLAIMED`
      and the remove is `Rejected(SET_IN_USE)` with the hold intact, or the remove is
      `Applied` and the claim is `NO_SUCH_SET` — never a cascade-dropped hold, and never a raised
      `DataIntegrityViolationException` **on the online-claim path**. The staff tap-to-mark writer
      keeps its pre-existing unlocked read and its 500 in the same race (R-9, G-1) — narrowed here
      from the original wording, which overclaimed for both writers.
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
| `editSet` changing pool/position on a **live-claimed** set → `204` | **changed** → `409 SET_IN_USE` | the bug (invariant #3); AC-3 |
| `editSet` changing pool/position on a set whose claims are all history (cancelled/completed bookings, past holds) → `204` | preserved | the review-gate narrowing (F-2): the delete's any-claim question would have frozen the map permanently, and no FK forces it for an `UPDATE` |
| `editSet` changing only price/tier on a claimed set → `204` | preserved | `SetPlacement#disturbedBy` returns false, so the guard does not fire; AC-4 (the decision the user took at the plan gate) |
| `editSet` conflict detection (`CELL_TAKEN` / `DUPLICATE_POSITION` → 409) | preserved | `findConflict` still runs, after the claim guard |
| `editSet` on an unknown venue/set → `404` | preserved | `venueExists` then `lockSet` |
| `addSet` behavior, all paths | preserved | untouched — a set being created cannot already be claimed |
| `AvailabilityClaim.claim` outcomes (`CLAIMED`/`ALREADY_TAKEN`/`NOT_ONLINE_POOL`/`NO_SUCH_SET`) | preserved | same four outcomes; only the pool read's lock strength changes |
| `repriceRow` allowed on a venue with holds/bookings | preserved | `FOR KEY SHARE` does not conflict with its plain `UPDATE`'s `FOR NO KEY UPDATE` — the reason `FOR SHARE` was rejected |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The claim's pool read keeps its stale value across the block, so `editSet`'s `FOR UPDATE` serializes the writes but still admits `BOOKED_ONLINE` on a now-`WALK_IN` set (invariant #3) — the gap in the issue's own suggested direction | high (certain without the fix) | high | the claim reads `pool` under `FOR KEY SHARE` on the `set_position` row, so it either blocks and re-reads the new pool, or holds the lock and forces `editSet` to see its hold; AC-6 | agent | closed — `poolForClaim`, pinned by `SetWriteVsClaimConcurrencyIT` |
| R-2 | Lock-strength choice blocks work that must stay allowed — `FOR SHARE` would conflict with `repriceRow`'s `FOR NO KEY UPDATE` and stall repricing during bookings | med | med | `FOR KEY SHARE` chosen: conflicts with `FOR UPDATE` only; parity row in the ledger + AC covered by the existing `VenueRepriceIT` staying green | agent | closed — `FOR KEY SHARE` shipped |
| R-3 | Deadlock between the per-set write and the bulk `replaceLayout` (which takes the venue row then its set rows) | low | high | `editSet`/`removeSet` take **only** the one `set_position` row and never the venue row, so no cycle exists; `replaceLayout` waits on the set row and proceeds. Existing `VenueSetWriteConcurrencyIT` (replace vs reprice) must stay green | agent | closed — no venue-row lock taken by the per-set writes; CI runs both concurrency ITs |
| R-4 | Narrowing two shipped endpoints breaks an unknown caller | low | med | no frontend caller exists (grepped `frontend/src`); the change is 204→409 on inputs that were previously data-destroying or a 500; Behavior-parity ledger enumerates every path | agent | closed — ledger complete, no caller found |
| R-5 | Renaming `SetBookingFacts#poolOf` → `poolForClaim` is a published `api/` port change | low | med | exactly one production caller (`JdbcAvailabilityClaim`) plus two test doubles; the rename is the point — a locking read must not be reachable from a read path (it errors inside a `readOnly` transaction), so the name warns callers off | agent | closed — one caller + two doubles updated; substrate greps clean |
| R-6 | Per-venue authorization regressed while reordering the guards (invariant #13, BOLA) | low | high | `ownership.assertOwns` stays the **first** statement of both methods, before `venueExists` and before any lock; `CrossVenueDenialIT` pins it | agent | closed — `assertOwns` is still statement one in both methods |
| R-7 | Flyway version collision | none | — | **no migration in this slice**; the set-scoped booking probe rides `booking_set_date_idx` (V5). Open PRs at plan time were Dependabot-only, no `db/migration` diff | agent | closed — N/A |
| R-9 | A staff tap-to-mark racing a `removeSet` on an **unclaimed** set surfaces as a `500`: the mark's `setBookingInfo` read is unlocked, so its `set_availability` insert blocks on the delete's `FOR UPDATE` and then fails the FK against a set that is gone | low | low | **Accepted — and the review corrected my first wording of this row, which claimed "not a regression".** It *is* a widening: the delete used to take the row lock only for the DELETE statement itself, whereas it is now held across the claim probes too, so that interleaving goes from unlikely to near-certain once it starts. What stays true is the severity: it fails closed (the DB refuses; no phantom hold is written), only the status code is imprecise, and the guard removes the far worse case — a set carrying a hold is now refused outright rather than cascading it away. The fix would be to lock in `setBookingInfo`, which also serves the my-bookings list and mail-facts reads, where row locks on a list read are a worse hazard than the race (Generalization-audit log, Phase 3) | agent | accepted, wording corrected at the review gate |
| R-8 | **The Testcontainers ITs cannot run in this session**, so AC-1/AC-2 (HTTP) and AC-6/AC-7 (the two races) get no local green — a guard could ship unverified | high (certain) | high | Docker Hub returned `toomanyrequests` on `postgres:17`, so the daemon was stopped by pidfile per `docs/agents/docker-testcontainers.md` and the ITs now **skip cleanly** rather than fail for an environmental reason. Local verification is therefore unit-level only; **CI owns every IT in this slice**, and no phase may be declared green until its PR CI run is read (`riviera-sdlc` CI-gate rule). Every guard also has a unit-level twin in `VenueAdminServiceTest`, so the ITs are the concurrency proof, not the only proof of the policy | agent | **closed — CI ran them.** Evidence is per-file, not the build's green tick: Sonar reports 100% new-code coverage on `JdbcVenues`, `JdbcBookingPresence`, `JdbcAvailabilityClaim` and `JdbcVenueCatalog`, whose new methods are reachable **only** from Testcontainers ITs. A skipped-IT run would have left every one of them at 0% |

## Open questions / Assumptions

*(empty — see Resolved)*

### Resolved

- **Open question:** How broadly should `editSet` refuse on a claimed set — any edit, only
  claim-relevant fields, or only live claims? → **Resolved by the user at the plan gate
  (`AskUserQuestion`, this session): only claim-relevant fields.** `editSet` refuses when the
  command would change `pool`, `rowLabel`, `positionNo`, `gridX` or `gridY` on a claimed set;
  `tier` and price stay editable, consistent with `repriceRow` being deliberately allowed
  during bookings. `removeSet` has no such choice — the `booking.set_id` RESTRICT FK makes a
  booked set physically undeletable, so it refuses on any claim. — **Amended at the review gate:**
  the *claim definition* was a second axis this answer did not settle, and the review showed the
  any-status/any-date reading froze a set's position permanently after its first-ever booking. The
  user's follow-up call: `editSet` asks the **live** question (hold dated today or later, booking in
  a non-terminal status); `removeSet` keeps the any-claim question the FK forces. See F-2.
- **Assumption:** "claimed" means any `set_availability` row on **any** date or any `booking`
  row of **any** status, matching `replaceLayout`'s existing stance. → **Held for `removeSet`,
  overturned for `editSet` at the review gate (F-2).** The delete keeps the any-claim reading
  because the RESTRICT FK and the CASCADE make history genuinely load-bearing. The edit does not:
  nothing physical forces it, and the reading froze a set's position permanently after its
  first-ever booking. `editSet` now asks the live question. This assumption is exactly the kind the
  grill gate is supposed to catch and did not — it was recorded as confirmed because both ports
  *were* documented date/status-agnostic, which answered "what do these methods do?" rather than
  "what should this guard ask?".

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
| Answer "does this set have any hold, any date?" (delete guard) | `availability` | unchanged — `SetAvailabilityLookup#anyClaims` already exists and is already implemented there; `venue`'s Not-My-Job line ("Knowing whether a specific set is free on a date → `availability`") is honored by asking rather than reading the table |
| Answer "does this set have a hold from today onwards?" (edit guard) | `availability` | same Not-My-Job line, same port — `anyClaimsFrom` added beside `anyClaims`. `venue` supplies the cutoff date (it owns the write's policy) but never reads `set_availability` |
| Decide which booking statuses are still live | `booking` | `BookingStatus#isTerminal` + `BookingPresence#hasLiveBookings`. On `venue`'s **Not-My-Job**: "Creating or tracking bookings → `booking`" — a status list in `venue` would be exactly that leak, and would rot silently the next time the lifecycle grows a state |
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

**Stage pointer:** `all gates green — awaiting merge authorization`

**Next action:** Merge PR #597 once authorized. Every gate is green and evidenced: CI (all six
checks), the review gate (two high-effort rounds, 26 findings, 24 fixed / 2 rejected with rationale
/ 2 deferred), and Sonar (0 issues, 0 duplicated blocks, 0 hotspots, new-code coverage ≥ 80% —
pulled from the API, not read off the badge). After the merge only GitHub-only items remain:
confirm #567 closed; #598/#599 already carry the deferred findings.

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
| 3 — Close the claim race (`poolForClaim`, `FOR KEY SHARE`) + both concurrency ITs | ✅ | `d7b0f86` |
| 4 — Docs (RESPONSIBILITIES, o3 + u2 corrections, freshness audit) | ✅ | `920d92d` |

| 5 — Review-gate fix round (F-2..F-12) | ✅ | `810e1cc` |

| 6 — Re-review fix round (G-1..G-14) + follow-ups #598/#599 | ✅ | `f3afcbd` |
| 7 — Sonar-gate coverage gap on `anyClaimsFrom` | ✅ | `07afaa7` |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (repo hygiene) | The new `JdbcBookingPresenceIT` was missing from the plan's File-structure section | fixed-in-`aded935` |
| F-2 | review (`/code-review`, high) | `editSet`'s probe counted a booking of ANY status and ANY date, so one cancelled booking froze a set's position and pool forever — and no FK forces that for an `UPDATE` | fixed-in-`810e1cc` — **escalated to the user** (`AskUserQuestion`): editSet now asks the *live* question (`hasLiveBookings` + `anyClaimsFrom(today)`); `removeSet` keeps the any-claim question the FK does force |
| F-3 | review (round 1) | `ExecutorService.close()` blocks uninterruptibly, so a lock-order regression would hang CI instead of failing it | fixed-in-`810e1cc` — `race()` helper with `shutdownNow()` in a finally |
| F-4 | review (round 1) | Three of `disturbedBy`'s five conditions were never evaluated true by any test (`||` short-circuited first), so a copy-paste error there would ship green | fixed-in-`810e1cc` — `everyPlacementFieldOnItsOwnDisturbsAClaimedSet` exercises each field alone |
| F-5 | review (round 1) | The `SET_IN_USE` copy said "walk-in holds" but the guard also fires for `BOOKED_ONLINE` | fixed-in-`810e1cc` — "This set is booked or held" |
| F-6 | review (round 1) | `EditBeachMap`'s port Javadoc still advertised the pre-guard contract, though the plan listed the file as changed | fixed-in-`810e1cc` — both methods now document their rejection and why they differ |
| F-7 | review (round 1) | `FakeAvailability.anyClaims` ignored its argument, so nothing pinned that the per-set writes ask a set-scoped question | fixed-in-`810e1cc` — the fake records the ids; two tests assert `List.of(SET)` |
| F-8 | review (round 1) | `removeSetLocksTheSetRowBeforeProbingForClaims` asserted a call *count*, not the ordering it is named for | fixed-in-`810e1cc` — one shared `callLog` across both fakes asserts `[lockSet, anyClaims]` |
| F-9 | review (round 1) | `removeSet` discarded `deleteSet`'s rows-affected while the port still documented it as the existence signal | fixed-in-`810e1cc` — `updateSet`/`deleteSet` return `void`; the Javadoc states the lock is why |
| F-10 | review (round 1) | `editSet`'s `updated == 0` backstop became unreachable, and its test only passed by forcing the fake into a state the row lock makes impossible | fixed-in-`810e1cc` — branch and test removed with F-9 |
| F-11 | review (round 1) | `editSet` takes the exclusive lock before evaluating `disturbedBy`, so an allowed price-only edit briefly blocks concurrent claims on that set | **rejected, with rationale** — the proposed fix (read placement unlocked, escalate only when disturbed) reintroduces a lost update: a concurrent reposition committing between the unlocked read and the write would be silently reverted by the price-only edit writing back the stale placement. The contention is three short indexed statements on an operator action that has no UI caller; a lost layout write is worse than a millisecond of lock wait |
| F-12 | review (round 1) | Neither race test asserted that both interleavings actually occurred, so the branch proving `poolForClaim`'s lock could silently never run | fixed-in-`810e1cc` — repetitions 1–2 race simultaneously, 3–6 force each order via a head start; `@AfterAll` fails the class if either branch went unexercised |

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
- `platform/src/main/java/ai/riviera/platform/venue/api/package-info.java` — the surface doc's example follows the rename
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — `FOR KEY SHARE` on the pool read
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — `hasBookings(SetId)`
- `platform/src/main/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresence.java` — the set-scoped probe
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcAvailabilityClaim.java` — call the renamed port
- `platform/src/test/java/ai/riviera/platform/booking/adapter/out/JdbcBookingPresenceIT.java` — new; pins that the set-scoped probe isolates to its own set
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1..AC-5 unit level
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-1/AC-2 at HTTP
- `platform/src/test/java/ai/riviera/platform/venue/SetWriteVsClaimConcurrencyIT.java` — new; AC-6/AC-7
- `platform/src/test/java/ai/riviera/platform/availability/AvailabilityLookupIT.java` — the new date-scoped probe's boundary + empty-input contract
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `anyClaimsFrom`
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — its SQL
- `platform/src/main/java/ai/riviera/platform/booking/domain/BookingStatus.java` — `canStillBeHonoured`
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` — stub follows the port rename
- `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — `FakeCatalog` follows the port rename
- `RESPONSIBILITIES.md` — `venue` § the per-set guard + the locking-read contract
- `docs/plans/o3-layout-editor.md` — correct the superseded review-gate row that judged the single-set path unaffected
- `docs/plans/u2-availability-claim.md` — amend the "pool is immutable layout data" premise (docs-freshness)
- `.claude/skills/riviera-java-conventions/SKILL.md` — the `Optional`-port example follows the rename (docs-freshness)
- `.claude/skills/riviera-modulith/references/case-history.md` — the `SetBookingFacts` method list follows the rename (docs-freshness)

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
| 2026-08-10 | Phase 1+2 — the row-lock guard | check-then-act on `set_position` in a `venue` write | `grep -rn "setExists\|deleteSet\|updateSet\|repriceRow" platform/src/main` | `editSet`, `removeSet`, `repriceRow`, `addSet` | **Fixed 2 of 4.** `editSet`/`removeSet` now lock. `repriceRow` **skipped**: non-destructive, touches no set identity or pool, and is deliberately allowed on a claimed venue (a booking's charge is snapshotted at reserve time) — locking it would break that. `addSet` **skipped**: a set that does not exist yet cannot be claimed. |
| 2026-08-10 | Phase 3 — the locking pool read | unlocked read of `set_position` feeding a write decision | `grep -rn "poolOf\|setBookingInfo" platform/src/main` | `poolForClaim` (claim), `setBookingInfo` (staff mark, reserve), `setBookingInfos` (my-bookings, mail facts) | **Fixed 1 of 3.** Only the claim's pool read decides an invariant-#3 write, so only it locks. `setBookingInfo`/`setBookingInfos` **skipped deliberately**: they serve list and mail reads, where taking row locks on every set a page touches is a contention hazard far worse than the race it would close. Residual recorded as R-9. |
| 2026-08-10 | Phase 3 — lock ordering review | `SELECT … FOR UPDATE` without a deterministic order (`postgres` skill §5) | `grep -rn "FOR UPDATE" platform/src/main` | `lockSetsOfVenue` (no `ORDER BY`), `lockAndReadSetVersion`, `lockSet` (both single-row) | **Skipped, no reachable cycle.** Two `replaceLayout`s on one venue serialize on the venue row before reaching `lockSetsOfVenue`, and the per-set writes take exactly one row and never the venue row. Adding `ORDER BY id` would be a defensible tidy-up but changes a path this slice does not touch. |

---

## Acceptance-criteria verification (final)

> **Two halves, and the split is the point (R-8).** Every AC has a unit-level pin that ran
> locally, and the four that assert HTTP status or real concurrency also have a Testcontainers
> pin that **only CI can run this session**. An AC is ticked above when *some* pin proves it;
> this table says which run proved which half, so nobody reads a local green as an IT green.

| AC | Local (unit, `gradle --tests`) | CI (Testcontainers) |
|---|---|---|
| AC-1 | ✅ `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetIsHeld` | `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409` — CI |
| AC-2 | ✅ `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetHasAnyBooking` | `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError` — CI |
| AC-3 | ✅ `VenueAdminServiceTest.editSetIsRefusedWhenAClaimedSetWouldBeRepositioned` (+ `…WhenABookedSetWouldBeMovedToAnotherCell`) | `VenueAdminControllerIT.editSetKeepsAClaimedSetInItsPoolButStillTakesAPriceChange` — CI |
| AC-4 | ✅ `VenueAdminServiceTest.editSetAppliesAPriceOnlyChangeToAClaimedSet` | same IT as AC-3 — CI |
| AC-5 | ✅ `VenueAdminServiceTest.editSetAppliesEveryChangeToAnUnclaimedSet` | existing `VenueAdminControllerIT.removeSetTakesItOffTheMap` — CI |
| AC-6 | — (a real race needs a real database) | `SetWriteVsClaimConcurrencyIT.claimAndPoolFlipCannotBothWin` — **CI only** |
| AC-7 | — (a real race needs a real database) | `SetWriteVsClaimConcurrencyIT.claimAndRemoveCannotBothWin` — **CI only** |

Structural net run locally and green: `ModularityTests`, `JdbcOnlyArchitectureTests`,
`PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`,
`ErrorContractArchitectureTests`, `VenueApiRoleSplitTests`.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled; two concurrency ITs present, both forcing each interleaving (invariant #2).
- [x] Pool + cutoff rules honored — #3 is the slice's subject; #4 N/A (no booking-date arithmetic).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new module edge, so no `allowedDependencies` change (invariant #11).
- [x] **Payment/payout** N/A — no money moves.
- [x] Refund policy — N/A, untouched (invariant #10).
- [x] Timezone correct: the edit guard's cutoff is `LocalDate.now(Europe/Tirane)`, pinned by a clock at 22:30Z where UTC and Tirane differ (invariant #6).
- [x] Booking codes — N/A, none generated, read or logged (invariant #7).
- [x] Flyway — N/A, **no schema change**; the probes ride existing V5/V4 indexes (invariant #12).
- [x] **Frontend** — N/A, backend-only; no Angular caller of these endpoints exists.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND
      findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (two findings deferred to #598/#599).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing
      `merged via PR #597`, so no docs-only follow-up PR is needed after the merge.
- [x] **The review gate ran in full** — per the invocation ladder in riviera-sdlc
      `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone.
      Rung 1 of the ladder succeeded (`Skill("code-review")`), and it ran **twice** at high
      effort: once at ready-for-review (12 findings, F-2..F-12) and again over the fix round per
      the re-entry rule (14 more, G-1..G-14).

If any box is unchecked, the feature is not done. Record the gap in Open Questions.

### Review round 2 (re-review of the fix round, per the re-entry rule)

| # | Source | Finding | Status |
|---|---|---|---|
| G-1 | review (round 2) | AC-7 claims "never a raised `DataIntegrityViolationException`", but only the **online claim** path was fixed; the staff tap-to-mark writer still reads the set unlocked and still 500s when `removeSet` wins | **AC wording corrected + deferred to a follow-up issue.** The fix needs a locking variant of `setBookingInfo`, which also serves the my-bookings list and mail-facts reads — out of this slice's scope and a worse hazard done carelessly. R-9 already records the residual. **Follow-up: #598** |
| G-2 | review (round 2) | `SetWriteVsClaimConcurrencyIT.DAY` was a hard-coded `2027-09-12`: once real time passed it, the edit guard's date-scoped probe would stop seeing the hold and the AC-6 test would let both sides win | fixed-in-`91f2e0d` — `LocalDate.now(Europe/Tirane).plusDays(30)`, the form the sibling HTTP test already used |
| G-3 | review (round 2) | `removeSet`'s availability arm keeps the any-**date** question, so a single historical staff hold freezes a set's deletion permanently — the same freeze F-2 removed from `editSet`, and no FK forces it on the availability side | **deferred to a follow-up issue, deliberately not fixed here.** The user was asked precisely this scope question at the review gate and chose "only live claims block — for `editSet`", explicitly declining the option that also narrowed `removeSet`. Re-deciding it inside the fix round would overturn a decision made one turn earlier. **Follow-up: #599** |
| G-4 | review (round 2) | `@AfterAll` asserted over static state accumulated by **both** `@RepeatedTest` methods, so a scoped single-method run — the discipline this repo prescribes — failed spuriously | fixed-in-`91f2e0d` — each method asserts its own tally at its own last repetition |
| G-5 | review (round 2) | The fixed clock (09:00 UTC) made the invariant-#6 assertion untestable: the UTC and Tirane civil dates coincide, so dropping the zone conversion would still pass | fixed-in-`91f2e0d` — clock moved to 22:30Z, where Tirane is already the next day |
| G-6 | review (round 2) | `editSet`'s lock-before-probe ordering was unpinned (only `removeSet`'s was), so moving the probe above the lock would reopen the invariant-#2 window with a green suite | fixed-in-`91f2e0d` — `anyClaimsFrom` joins the shared `callLog`; the edit test asserts `[lockSet, anyClaimsFrom]` |
| G-7 | review (round 2) | `BookingStatus.isTerminal()` was a generically-named public predicate whose classification contradicts behaviour elsewhere (`NO_SHOW` is terminal yet still weather-refundable), inviting misuse | fixed-in-`91f2e0d` — renamed `canStillBeHonoured()` and documented as answering only the layout-edit question |
| G-8 | review (round 2) | `JdbcBookingPresence`'s class Javadoc still said every probe is status-agnostic and filters on `venue_id` only | fixed-in-`91f2e0d` |
| G-9 | review (round 2) | `BookingPresence#hasBookings(SetId)`'s contract still credited it with the reposition guard, which moved to `hasLiveBookings` | fixed-in-`91f2e0d` |
| G-10 | review (round 2) | `FakeVenues.forceSetExists` became dead when F-10's test was removed (and Sonar's bar is 0 new issues) | fixed-in-`91f2e0d` — field and its stale comment deleted |
| G-11 | review (round 2) | The per-set writes take a `set_position` lock without the venue row, breaking the documented venue→sets ordering — safe today only because neither path ever needs the venue lock | fixed-in-`91f2e0d` — **documented rather than re-locked**: taking the venue row would add contention for no present benefit, so `Venues#lockSet` now states the property, that it is a property of the callers rather than of the method, and what a future venue-row touch must do first |
| G-12 | review (round 2) | The amendment this PR writes into O3's plan doc stated the pre-narrowing policy — I wrote it before F-2 changed it | fixed-in-`91f2e0d` |
| G-13 | review (round 2) | `ZoneId.of("Europe/Tirane")` is copy-pasted a fourth time instead of living in the Shared Kernel | **rejected, with rationale** — `CLAUDE.md`'s `shared` admission bar is explicit that entry rests on **ownership, never reuse**, and that it "is not a home for code used in more than one place". A zone constant is the reuse case the bar names, so admitting it would be the precedent that grows the kernel the note warns against. Worth revisiting only as a deliberate "the platform owns its civil timezone" decision, which is not this slice |
| G-14 | CI guard (repo hygiene) | The inline-comment guard flagged a two-line comment at `VenueAdminServiceTest:728` that the branch diff does not add — a line-number drift artifact after 247 inserted lines | fixed-in-`91f2e0d` — collapsed to one line rather than shipping a red gate; the comment is better short anyway |

### Sonar gate (pulled from the API, not the badge)

Read against the final head, after confirming an analysis actually exists (`new_lines: 291`), so a
zero cannot be the unanalyzed-PR false clean:

| Metric | Value |
|---|---|
| Issues (`resolved=false`) | **0** |
| Security hotspots | 0 |
| `new_bugs` / `new_vulnerabilities` / `new_code_smells` | 0 / 0 / 0 |
| `new_duplicated_blocks` / density | 0 / 0.0% |
| `new_coverage` | 97.8% over 291 new lines |

The one uncovered new line was `JdbcSetAvailabilityLookup#anyClaimsFrom`'s empty-input short
circuit — under the gate's threshold, so it did not block, but it was a contract this slice
*documented* ("an empty input yields false without touching the database") and did not test.
Covered in phase 7 along with the cutoff's inclusive boundary, per the gate's "a coverage gap on
new code → add the missing tests" rule.
