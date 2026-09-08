# Retire instead of delete — the retired marker, the active-set view and the exclusion net Implementation Plan

> **For agentic workers:** implement this plan with `tdd` at the plan's named seams
> (`/implement` is the human's entry command; the model's route is `riviera-sdlc`'s
> Implement row). Steps use checkbox (`- [ ]`) syntax for tracking. The Availability &
> concurrency, Spring-Modulith, and Payment & payout sections are spec sections, not
> documentation. Invariant numbers refer to `CLAUDE.md`.

**Goal:** An operator removes a set whose only bookings are finished and the set leaves the map,
the availability calendar, the tourist list and counts, the daily view and both claim paths — while
every booking that ever named it still resolves to its row label and position in the guest's
booking view, the staff booking lookup and the mails; a set with a live hold or a live booking is
refused exactly as today, and a set with no booking is still deleted outright.

**Architecture:** A nullable `retired_at` marker on `set_position` (never a delete once the row
carries history — the `booking.set_id` RESTRICT FK stays), an `active_set_position` view in the
same migration for every read that must forget a retired set, and the two layout-uniqueness
constraints rewritten as **partial unique indexes over active rows** so a retired set's slot is
reusable. The exclusion is a forever tax on every future read, so it is *enforced* by a new
fitness function, `RetiredSetExclusionArchitectureTests`: every production SQL string naming the
bare table (outside an `INSERT INTO`) must name the marker, except in the one class implementing
the deliberately unfenced `SetBookingFacts` port — which is why that port's adapter is split out of
`JdbcVenueCatalog` into its own `JdbcSetBookingFacts`, so the exemption is a class, not a method.

**Persistence:** JDBC only (invariant #1). One migration, `V50__set_position_retired.sql`:
`ALTER TABLE set_position ADD COLUMN retired_at TIMESTAMPTZ`; drop `set_position_cell_uniq` and
`set_position_grid_uniq` (V2/V12 constraints) and recreate both as `CREATE UNIQUE INDEX … WHERE
retired_at IS NULL` under the same names; `CREATE VIEW active_set_position` with an explicit column
list. `V50` is free on `main` and no open PR claims it (zero open PRs at intake).

**Source of intent:** GitHub issue #1030 (parent epic #1027, revision 3 — user stories 12–14).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — surfaced four things
the ticket did not say: (1) the V2/V12 uniqueness constraints would make a retired set's
`(row_label, position_no)` and `(grid_x, grid_y)` slots unusable forever and turn a re-add at that
spot into a 500, so they become partial unique indexes over active rows; (2) the staff walk-in
mark resolves its set through the *exempt* `setBookingInfo`, so it would happily mark a retired
set — it gains the same locked claim-time gate the online claim already passes (`poolForClaim`,
empty for a retired set); (3) `JdbcVenueCatalog` implements the excluding `VenueCatalog` **and**
the exempt `SetBookingFacts`, so a class-level exemption would silence the very map/list/calendar
queries the test must drive — the facts adapter splits out; (4) `CLAUDE.md`'s structural-net
membership rule admits only target-free tests and this test names its table, so the sentence that
says "derived from the rule, not chosen" is amended to admit the one deliberate member rather than
left false; zero open PRs, `V50` free; the previous sibling #1029 closed out on the epic with PR
#1038, its plan doc is still in `docs/plans/` and retires in this PR's close-out) ·
`riviera-plan-doc` (this template — forced a seam per AC, the module-ownership table for a rule that
`venue` owns but `availability` and `booking` must honour, and the parity ledger for the
`removeSet` outcomes) · `tdd` (each phase red first at the named seam: the architecture test over the
compiled tree, the migration IT, the controller ITs, the service fake, the Vitest spec) ·
`riviera-review-overlay` (review gate — runs at ready-for-review on PR #1043; outcome recorded in the findings register) ·
`riviera-docs-freshness` (**due at close-out** over `origin/main..HEAD`; the counting sweep targets
"three `VenueCatalog` reads", "one bean, three narrow surfaces", "the five in the command", and
"forever" in `RESPONSIBILITIES.md` § `venue`; the plan-doc retirement removes
`docs/plans/set-batch-apply.md`) · `grilling` (the intake questions answered from the code; the
product calls are the epic's revision 3 and the ticket's exclude/exempt lists, taken verbatim) ·
`riviera-local-debug` (clone unshallowed; system Gradle 8.14 on the JDK 21 daemon compiling on the
JDK 25 toolchain; scoped `--tests`; the structural net after the adapter split and again after the
port change; dockerd present so single IT classes run locally;
`PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` for the mocked e2e) · `postgres` (a nullable
`TIMESTAMPTZ` marker, never a boolean — it records *when*; partial unique indexes carry the layout
rule for active rows and double as the partial index the excluding reads need, since
`(venue_id, …) WHERE retired_at IS NULL` is led by the column every read filters on, so no third
index; an explicit column list on the view so a later `ALTER TABLE ADD COLUMN` is a visible
`CREATE OR REPLACE VIEW` decision, not a silent omission; the locking reads (`FOR UPDATE`,
`FOR KEY SHARE`) go through the view — Postgres pushes a locking clause down to the base rows and
re-checks the view predicate after a lock wait, which is exactly the retire-vs-claim race this slice
needs closed) · `riviera-modulith` (no published-surface change: `SetBookingFacts` keeps its three
methods and gains contract text; `Venues` gains `retireSet` beside `deleteSet`; the facts adapter
split is two package-private classes in `venue/adapter/out` implementing the same ports — the
structural net is due after it; no `allowedDependencies` change, no event) ·
`riviera-java-conventions` (the marker is bound as the service's `Clock` instant, invariant #6;
the retire `UPDATE` is guarded `… AND retired_at IS NULL` so a retire is idempotent and never
re-stamps; `ChangeOutcome.Applied` stays the one success shape — the wire does not distinguish
retire from delete; §6c/§6d on every touched Javadoc, the "forever" rationale relocates to
`RESPONSIBILITIES.md` and ADR-0019) · `codebase-design` (the exemption boundary decides the
adapter split: one class per published conversation makes the fitness function's exemption a
class, which is the seam ArchUnit can see; `retireSet` is one more method on the existing `Venues`
write conversation, not a port) · `domain-modeling` (`CONTEXT.md` gains **Retired set**, the
**Set position** entry gains the lifecycle sentence; ADR-0019 records retire-over-delete-or-snapshot:
hard to reverse (schema + every read), surprising (the FK still points at a row no read returns),
a real trade-off (snapshotting labels onto the booking was the alternative)) · `riviera-frontend`
(the change stays inside `operator/`: `set-editor.ts`, `layout-editor.ts` (its locked-layout
banner's removal clause), `operator-console.model.ts`, `operator-console.service.ts`; e2e in the
CI-safe mocked suite; no folder or edge change) ·
`angular-developer` + angular-cli MCP (`list_projects`: one workspace, Angular 22, Vitest;
`get_best_practices` v22 loaded: signals for state, `computed` for derivations, native control
flow, no `standalone: true`/OnPush; `search_documentation` v22 verified `signal`/`computed`
(the touched `errorCode`/`attempted` signals stay plain `signal<…>` set from the write path — no
`computed` is warranted, the message is a method read in the template) and `@if` (the error
`<output>` stays under its existing `@if`); `linkedSignal`, `resource` and Signal Forms are not
used by this change and were not introduced — what changed because of the check: nothing new was
introduced, only the copy string and TSDoc) · `riviera-tailwind` (verified against
tailwindcss.com/docs that no styling decision is made here: the copy renders in the existing
`<output data-testid="set-error">` with its existing utilities; no new utility, token or class, so
no `@apply`, no contrast row changes — the existing contrast pair for the error output still
covers it) · `playwright-cli` (the mocked suite's `operator-set-editing.e2e.ts` already drives the
`409 SET_IN_USE` remove against set 13 via `page.route`; its copy assertion is re-pointed at the new
wording, and the mock stays a live-claimed set, which is the one case the server still refuses).

**Branch:** `claude/riviera-sunbed-retire-marker-ukgt2f` — the session's designated remote branch
stands in for `feature/retire-set-marker` (riviera-sdlc, remote addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a production class whose SQL names `set_position` outside an `INSERT INTO` and
  without `retired_at`, when the architecture test runs, then it fails naming the class; given the
  class implementing `SetBookingFacts` doing the same, then it passes; given SQL selecting from
  `active_set_position` or an `INSERT INTO set_position`, then it passes. *Seam:* the compiled
  production tree (`ArchitectureTestSupport.PRODUCTION_CLASSES`) and the fixture tree
  `ai.riviera.retirefixture` · *Pinned by:*
  `RetiredSetExclusionArchitectureTests.everySetTableReadOutsideTheFactsPortExcludesRetiredSets`,
  `.rogueSetTableReaderFixtureIsRejected`, `.theFactsPortAdapterIsExemptAndTheViewReadersPass`,
  `.theExemptionAndTheViewPathAreBothExercised`.
- [x] **AC-2:** Given the V50 migration, when the chain runs, then `set_position.retired_at` is a
  nullable `TIMESTAMPTZ`, `active_set_position` hides a row with `retired_at` set, a second active
  set at a retired set's `(row_label, position_no)` and `(grid_x, grid_y)` inserts, and two active
  sets on one cell are still refused by `set_position_grid_uniq`. *Seam:* the schema through
  `JdbcTemplate` · *Pinned by:* `SetRetireMigrationIT.retiredAtIsANullableInstant`,
  `.theActiveViewHidesARetiredSet`, `.aRetiredSetsSlotIsReusable`,
  `.activeSetsStillCannotShareACell`.
- [x] **AC-3:** Given a set whose only booking is `CANCELLED` (or `COMPLETED`), when the owner
  removes it, then the outcome is `Applied`, the row carries `retired_at`, and the booking row still
  references it; given a set with a `STAFF_MARKED` hold dated tomorrow or a `CONFIRMED` booking dated
  30 days out, then `Rejected(SET_IN_USE)`; given a set with no booking, then the row is deleted.
  *Seam:* `EditBeachMap#removeSet` (service) and `DELETE /api/venues/{v}/sets/{s}` (HTTP) ·
  *Pinned by:* `VenueAdminServiceTest.removeSetRetiresASetWithOnlyTerminalBookings`,
  `.removeSetIsRefusedWhenTheSetHasALiveBooking`, `.removeExistingSetDeletesIt` (kept),
  `SetRetireIT.removingASetWithAFinishedBookingRetiresItAndKeepsTheBooking`,
  `.removingASetWithALiveBookingIs409`, `VenueAdminControllerIT.removeSetTakesItOffTheMap` (kept:
  the no-booking delete).
- [x] **AC-4:** Given a retired set on a venue, when a tourist reads the list, the map and the
  availability calendar, then the set is absent from the map and both counts read it as gone;
  when the owner reads the daily availability view, then the set is absent; when the owner edits or
  removes it again, then `404 NO_SUCH_SET`; when the owner adds a set at the retired coordinates,
  then `201`. *Seam:* `GET /api/venues`, `GET /api/venues/{v}`,
  `GET /api/venues/{v}/availability-calendar`, `GET /api/venues/{v}/availability`,
  `PATCH|DELETE /api/venues/{v}/sets/{s}`, `POST /api/venues/{v}/sets` · *Pinned by:*
  `SetRetireIT.aRetiredSetIsGoneFromEveryExcludingRead`, `.aRetiredSetsSpotCanBeReused`.
- [x] **AC-5:** Given a retired set, when a tourist posts an online reserve for it, then
  `404 NO_SUCH_SET`; when staff mark it, then `404 NO_SUCH_SET`, and no `set_availability` row is
  written. *Seam:* `AvailabilityClaim#claim` and `StaffAvailability#mark` (service), pinned at the
  HTTP seam too · *Pinned by:* `RetiredSetClaimIT.theOnlineClaimRefusesARetiredSet`,
  `.theStaffMarkRefusesARetiredSet`, `SetRetireIT.bothClaimPathsRefuseARetiredSet`.
- [x] **AC-6:** Given a booking on a retired set, when the guest opens the booking view by code
  and the operator opens the staff daily bookings list for its date, then both render the set's
  row label and position; `SetBookingFacts#setBookingInfo` answers for the retired id. *Seam:*
  `GET /api/bookings/{code}`, `GET /api/venues/{v}/bookings?date=`, `SetBookingFacts` · *Pinned by:*
  `SetRetireIT.aBookingOnARetiredSetStillRendersItsSpot`,
  `SetBookingInfoIT.answersForARetiredSet`.
- [x] **AC-7:** Given the retire path racing a staff mark on the same set, when the retire commits
  first, then the mark answers `NO_SUCH_SET` and writes no hold; when the mark commits first, then
  the retire is `SET_IN_USE`. *Seam:* `EditBeachMap#removeSet` racing `StaffAvailability#mark` ·
  *Pinned by:* `SetRetireVsMarkConcurrencyIT.aRetireAndAMarkNeverBothWin`.
- [x] **AC-8:** Given the set editor receives `409 SET_IN_USE` on a remove, when the message renders,
  then it says the set is still held or still booked and no longer claims a booked set stays on the
  map for good. *Seam:* the `set-error` output of `operator/set-editor.ts`, driven through the
  mocked HTTP layer · *Pinned by:* `set-editor.spec.ts` "explainsARefusedRemove",
  `operator-set-editing.e2e.ts` "a booked set changes pool freely but cannot be moved or removed".
- [x] **AC-9:** The structural net (six members after this slice) is green, and the new member is in
  the `CLAUDE.md` and `riviera-local-debug` commands. *Seam:* the Gradle test task · *Pinned by:*
  the command itself.

## Non-goals

- The diff-based bulk save, `LAYOUT_IN_USE`'s retirement and set-scoped rejection (#1032).
- Pinned cells on the operator canvas (#1033); the remodel preview/commit and moves (#1034+).
- Un-retiring a set. Retirement is forward-only; a set that comes back is a new set.
- A `retired` flag on `SetBookingInfo` or any wire DTO — no consumer needs it yet (the move mail is a
  later slice and reads the facts port, which answers regardless).
- Distinguishing retire from delete on the wire: both are `204`, the set is gone from the map either
  way.
- Changing `docs/agents/gradle-proxy-trust.md`'s three-test command (a record of a run, per `CLAUDE.md`).

## Behavior-parity ledger (retirement / replacement slices only)

The old surface is `DELETE /api/venues/{v}/sets/{s}` and the per-set reads it feeds.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| 403 before any read for a non-owner | preserved | `ownership.assertOwns` stays the first act |
| 404 `NO_SUCH_VENUE` / `NO_SUCH_SET` | preserved, widened | `lockSet` selects from the view, so a retired id is `NO_SUCH_SET` too |
| 409 `SET_IN_USE` on a hold dated today or later | preserved | `hasLiveHold` unchanged, still after the row lock |
| 409 `SET_IN_USE` on a non-terminal booking | preserved | `bookings.hasLiveBookings(setId)` — the edit guard's arm, now the remove's too |
| 409 `SET_IN_USE` on a terminal-only booking | **changed** | retires instead (`Venues#retireSet`); the FK is honoured by keeping the row |
| 204 + hard delete on a set with no booking | preserved | `deleteSet`, now `… AND retired_at IS NULL` |
| a past hold CASCADEs away with the deleted set | preserved for the delete branch; for the retire branch the past hold stays with the retired row (history) | no cascade fires on an `UPDATE` |
| the `SET_IN_USE` detail "This set has a booking or a current hold." | preserved | wording still true: only a live claim refuses |
| the set editor's remove copy "booked at least once — stays on the map for good" | **changed** | the copy names only the live claim; the permanence claim is no longer true |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A staff mark or online claim lands on a set between the retire's probe and its commit (invariant #2) | med | high | the retire keeps `lockSet … FOR UPDATE` before the probe; both claim paths read the set through `poolForClaim` (`FOR KEY SHARE` through the view, re-checked after the lock wait) so a claim that waited on the retire sees the row gone; `SetRetireVsMarkConcurrencyIT` | session | closed — pinned by the tests named in the AC column, green locally |
| R-2 | The partial unique indexes let two *active* sets share a slot, or drop the name the 409 mapping / `BeachMapLayoutMigrationIT` expects | low | high | same index names; `SetRetireMigrationIT.activeSetsStillCannotShareACell` asserts the violation message names `set_position_grid_uniq`; `BeachMapLayoutMigrationIT` stays green | session | closed — pinned by the tests named in the AC column, green locally |
| R-3 | A read the ticket lists is missed, or a new adapter later forgets the view | med | high | the architecture test is written red first and fails on today's tree; it stays in the structural net so a future adapter trips it; the vacuity guard asserts the view path is exercised | session | closed — pinned by the tests named in the AC column, green locally |
| R-4 | A locking read through the view behaves differently from the table (`FOR UPDATE`/`FOR KEY SHARE` on `active_set_position`) | low | high | proven by the existing concurrency ITs (`SetWriteVsClaimConcurrencyIT`, `VenueSetWriteConcurrencyIT`, `BeachMapReplaceConcurrencyIT`) running against the view-backed adapters, plus AC-7 | session | closed — pinned by the tests named in the AC column, green locally |
| R-5 | Row-scoped writes (`repriceRow`, `renameRow`) touching retired rows, or a retired row blocking `ROW_NAME_TAKEN` / `NO_SUCH_ROW` | med | low | both `UPDATE`s take `AND retired_at IS NULL`; `distinctRowLabels` selects from the view; `VenueRowRenameIT`/`VenueRepriceIT` stay green | session | closed — pinned by the tests named in the AC column, green locally |
| R-6 | The bulk replace (`deleteAllSets`) deletes retired rows and hits the FK | low | med | the replace is still refused on any booking (`bookings.hasBookings(venueId)`), so a venue with a retired set never reaches the delete; the `DELETE` still takes `AND retired_at IS NULL` so the invariant holds even if #1032 relaxes the guard | session | closed — pinned by the tests named in the AC column, green locally |
| R-7 | The structural-net membership rule in `CLAUDE.md` excludes a test that names its table | certain | low | the ticket and the epic place it in the net; `CLAUDE.md`'s sentence is amended to name the one deliberate member and why (a new adapter anywhere can break it), so the rule stays honest | session | closed — pinned by the tests named in the AC column, green locally |
| R-8 | Ownership (BOLA, invariant #13) on every touched endpoint | low | high | no new endpoint; every touched service asserts ownership first; `CrossVenueDenialIT` unchanged | session | closed — pinned by the tests named in the AC column, green locally |
| R-9 | Sonar duplication from the adapter split (two adapters sharing column constants) | med | low | the facts adapter carries only its own three queries and mapper; shared constants stay where they are used | session | closed — pinned by the tests named in the AC column, green locally |

## Open questions / Assumptions

None open.

### Resolved

- The exempt port is the whole `SetBookingFacts` adapter, `poolForClaim` included, even though
  `poolForClaim` itself excludes retired sets — the fitness function exempts the class
  (`RetiredSetExclusionArchitectureTests`' Javadoc states it); `RetiredSetClaimIT` and
  `SetRetireVsMarkConcurrencyIT` pin the claim behaviour. *Resolved in phase 0/2.*
- A retired set keeps its last row label and price frozen — the row-scoped rename and reprice skip
  it (`… AND retired_at IS NULL`). *Resolved in phase 2; `RESPONSIBILITIES.md` § `venue` states it.*
- The uniqueness constraints become partial unique indexes over active rows, so a retired set's
  slot is reusable and a re-add at that spot is a `201`, not a 500 behind a clean conflict probe.
  *Resolved in phase 1; ADR-0019 §5 records it; `SetRetireMigrationIT` and `SetRetireIT` pin it.*

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** the online claim
  (`JdbcAvailabilityClaim#claim`), the staff mark (`StaffAvailabilityService#mark`), releases
  (cancel, decline, withdraw, expiry, the weather refund). This slice adds none and changes none of
  their SQL; it changes what the two *claim* paths see when they resolve the set.
- **Uniqueness guarantee:** `set_availability_uniq UNIQUE (set_id, booking_date)` — untouched.
- **Concurrency strategy:** the retire is a per-set write under `lockSet … FOR UPDATE` (taken
  before the claim probes, as today's delete). Both claim paths resolve the set through
  `SetBookingFacts#poolForClaim`, a `FOR KEY SHARE` read through `active_set_position`: it waits on
  the retire's `FOR UPDATE`, and after the wait Postgres re-evaluates the view's `retired_at IS NULL`
  against the committed row, so a claim that queued behind a retire answers `NO_SUCH_SET`. A mark
  that committed first leaves a hold dated today or later, which the retire's `hasLiveHold` probe
  sees under its lock. Pinned by AC-7.
- **Pool rule (invariant #3):** unchanged; `poolForClaim` still answers the pool, now only for
  active sets.
- **Cutoff rule (invariant #4):** unchanged; not touched by this slice.
- **Pinning test:** `SetRetireVsMarkConcurrencyIT.aRetireAndAMarkNeverBothWin`; the existing
  `SetWriteVsClaimConcurrencyIT` and `ConcurrentReservationIT` stay green against the view-backed
  reads.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Tables it writes | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `set_position` (+ the `active_set_position` view, read-only) | owns the beach map and set positions; the retire lifecycle is a layout write |
| M-2 | `availability` | existing | none in this slice (reads `SetBookingFacts` differently) | the staff mark must refuse a retired set — `availability` decides the mark, `venue` answers what is active |
| M-3 | `booking` | existing | none | reads only: the reserve fast path keeps `setBookingInfo`; the claim refuses downstream |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.api` | `SetBookingFacts#poolForClaim` — contract widened in Javadoc: empty for a retired set, the claim-time gate both claim paths pass | `Pool`, `SetId` | `availability` (online claim, and now the staff mark) |
| NI-2 | `venue.api` | `SetBookingFacts#setBookingInfo(s)` — contract stated: answers for a retired set | `SetBookingInfo` | `booking`, `notification`, `availability` (ownership resolution) |
| NI-3 | `venue.api` | `VenueCatalog` — no signature change; all three reads exclude retired sets | — | `venue`'s REST adapter |

**Domain events (id-based payloads, invariant #11)**

N/A — no event is published or changed; the retire is a synchronous layout write.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| retire vs delete on remove-set; the marker; the view | `venue` | Job: "the beach map / layout, set positions"; not on any Not-My-Job list |
| which reads forget a retired set | `venue` (its adapters) | the exclusion is a property of `venue`'s own SQL; `availability` and `booking` never name the table (`ResponsibilitiesArchitectureTests`) |
| the staff mark refuses a retired set | `availability` (decision) via `venue` (fact) | `availability` Job: the staff mark write; it asks `venue`'s port whether the set is claimable — `venue` never decides a mark |
| the online reserve refuses a retired set | `availability` (claim) | already the shape: `claim` answers `NO_SUCH_SET` off `poolForClaim`; `booking` maps it |
| the facts port keeps answering | `venue` | `SetBookingFacts` is `venue`'s unfenced port by settled rule |

## Payment & payout (invariants #5, #8, #9, #10)

N/A — no payment in scope. No booking amount, refund or ledger row is touched; a booking on a
retired set keeps its snapshotted price.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/set-editor.ts` (`inUseMessage`, the `SetWrite` doc) | existing | standalone component | existing `signal`s; copy only | — |
| FE-2 | `operator/operator-console.model.ts` (`SetWriteErrorCode` doc) | existing | type | — | — |
| FE-3 | `operator/operator-console.service.ts` (`removeSet` doc) | existing | `@Service` | — | — |

**Standards:** unchanged component shape; no new API. Verified against the angular-cli MCP (see
*Skills consulted*).

## FE↔BE contract

N/A — no contract change. `DELETE /api/venues/{v}/sets/{s}` keeps `204` / `404 NO_SUCH_SET` /
`409 SET_IN_USE` with the same detail; only *when* `SET_IN_USE` is answered narrows.

## Execution status

**Stage pointer:** `PR — marking ready for review; review gate next`

**Next action:** run the review gate (`code-review:code-review` + `riviera-review-overlay`) over the
PR's resolved range, then the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — architecture test + fixture, adapter split, join the net (red) | ✅ | "Add the retired-set exclusion net and split the set-facts adapter" |
| 1 — V50 migration + `SetRetireMigrationIT` | ✅ | "Add the retired marker, the active-set view…" |
| 2 — excluding reads via the view, writes name the marker, claim paths refuse (green) | ✅ | "Read the beach map through active_set_position…" |
| 3 — `removeSet` retires; service test, HTTP ITs, concurrency IT | ✅ | "Retire a set that carries finished bookings…" |
| 4 — frontend copy + spec + e2e | ✅ | "Name only the live claim in the set editor's remove refusal" |
| 5 — docs: ADR-0019, CONTEXT, RESPONSIBILITIES, CLAUDE.md, domain-model, plan retirement | ✅ | "Record the retire lifecycle…" |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register**

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | CI (full suite, phase-3 push) | Six full-suite-only failures: `RetiredSetClaimIT` and `SetBookingInfoIT` inserted rows on the seeded Miramar venue, breaking the two seed-count migration ITs; `VisibleOnlineSets.newest` (the booking ITs' "newest bookable set" picker) found a sibling test's retired set and the claim refused it. Fix: both tests create their own venue; the picker reads `active_set_position`. | fixed — "Keep the retire tests off the seed venue…" |

---

## File structure

- `docs/plans/retire-set-marker.md` — this plan
- `docs/plans/set-batch-apply.md` — retired (merged via PR #1038)
- `platform/src/main/resources/db/migration/V50__set_position_retired.sql` — marker, partial unique indexes, view
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireMigrationIT.java` — AC-2
- `platform/src/test/java/ai/riviera/platform/RetiredSetExclusionArchitectureTests.java` — AC-1
- `platform/src/test/java/ai/riviera/platform/ArchitectureTestSupport.java` — shared constant-pool string reader
- `platform/src/test/java/ai/riviera/retirefixture/package-info.java` · `platform/src/test/java/ai/riviera/retirefixture/rogue/adapter/out/RogueSetTableReader.java` · `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureActiveSetReader.java` · `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureSetRetirer.java` · `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureSetInserter.java` · `platform/src/test/java/ai/riviera/retirefixture/venue/adapter/out/FixtureSetFacts.java` — the negative/positive fixtures
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcSetBookingFacts.java` — the exempt port's adapter, split out
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenueCatalog.java` — map/list/calendar via the view; loses the facts methods
- `platform/src/main/java/ai/riviera/platform/venue/adapter/out/JdbcVenues.java` — view reads, marker-guarded writes, `retireSet`
- `platform/src/main/java/ai/riviera/platform/venue/application/Venues.java` — `retireSet`, contract text
- `platform/src/main/java/ai/riviera/platform/venue/application/BeachMapEditService.java` — the remove branches
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — `removeSet` contract
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — `SET_IN_USE` text
- `platform/src/main/java/ai/riviera/platform/venue/api/SetBookingFacts.java` — contract text
- `platform/src/main/java/ai/riviera/platform/venue/spi/BookingPresence.java` — contract text (`hasBookings(SetId)` now serves retire-or-delete)
- `platform/src/main/java/ai/riviera/platform/venue/package-info.java` — the state sentence
- `platform/src/main/java/ai/riviera/platform/availability/application/StaffAvailabilityService.java` — the claim-time gate
- `platform/src/main/java/ai/riviera/platform/booking/application/view/MyBookingsService.java` — the "always resolves" comment names the retire
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-3 service tests, `FakeVenues.retireSet`
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireIT.java` — AC-3/4/5/6 at the HTTP seam
- `platform/src/test/java/ai/riviera/platform/venue/SetRetireVsMarkConcurrencyIT.java` — AC-7
- `platform/src/test/java/ai/riviera/platform/venue/SetBookingInfoIT.java` — AC-6 port half
- `platform/src/test/java/ai/riviera/platform/availability/RetiredSetClaimIT.java` — AC-5 service half
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — the terminal-booking remove test becomes a retire test
- `platform/src/test/java/ai/riviera/platform/WebSliceStubs.java` · `platform/src/test/java/ai/riviera/platform/booking/application/reserve/CreateBookingServiceTest.java` — fakes, only if the port text forces a touch
- `frontend/src/app/operator/set-editor.ts` · `frontend/src/app/operator/set-editor.spec.ts` — AC-8
- `frontend/src/app/operator/layout-editor.ts` · `frontend/src/app/operator/layout-editor.spec.ts` — the locked-layout banner's per-set-remove clause ("held or still booked")
- `frontend/src/app/operator/operator-console.model.ts` · `frontend/src/app/operator/operator-console.service.ts` — TSDoc
- `frontend/e2e/operator-set-editing.e2e.ts` — AC-8 e2e
- `CLAUDE.md` — the structural-net command and membership sentence
- `.claude/skills/riviera-local-debug/SKILL.md` — the structural-net command
- `RESPONSIBILITIES.md` — § `venue` layout-write paragraph, the exclude/exempt list, § Machine-checked row
- `CONTEXT.md` — **Retired set**, **Set position**
- `docs/adr/ADR-0019-retire-a-set-that-carries-history.md` — the decision
- `docs/architecture/domain-model.md` — `set_position` columns + the view

---

## Phase 0 — The fitness function, red

**Files:** Create `RetiredSetExclusionArchitectureTests.java`, `ai/riviera/retirefixture/**` · Modify `ArchitectureTestSupport.java`, `JdbcVenueCatalog.java` (split) · Create `JdbcSetBookingFacts.java` · Modify `CLAUDE.md`, `riviera-local-debug/SKILL.md`

- [ ] Step 1: write the test — every production class's `CONSTANT_String` entries; an occurrence of whole-word `set_position` not preceded by `INSERT INTO` requires `retired_at` in the same string; classes assignable to `SetBookingFacts` exempt; fixture negatives and positives.
- [ ] Step 2: run `gradle test --tests "*RetiredSetExclusionArchitectureTests*"` → FAIL naming `JdbcVenueCatalog` and `JdbcVenues` (the split has happened, so the facts class is exempt and the catalogue is not).
- [ ] Step 3: split `JdbcSetBookingFacts` out; run the structural net → green (the adapter split is a structure change).
- [ ] Step 4: add the member to the two commands; amend the membership sentence.
- [ ] Step 5: commit red — `Add the retired-set exclusion net and split the set-facts adapter (#1030)`; open the draft PR.

## Phase 1 — V50

- [ ] `SetRetireMigrationIT` red (no column, no view) → V50 → green. Commit `Add the retired marker, the active-set view and active-only layout uniqueness (#1030)`.

## Phase 2 — Reads through the view, writes name the marker

- [ ] `RetiredSetClaimIT` red (a retired set is claimable and markable today) → `poolForClaim` via the view; `StaffAvailabilityService#mark` gates on it → green.
- [ ] Every excluding read → `active_set_position`; every `UPDATE`/`DELETE` → `AND retired_at IS NULL`; `retireSet` added. The architecture test turns green here. Commit `Read the beach map through active_set_position; both claim paths refuse a retired set (#1030)`.

## Phase 3 — Retire on remove

- [ ] `VenueAdminServiceTest` red → `BeachMapEditService.removeSet` three-way → green; `SetRetireIT`, `SetRetireVsMarkConcurrencyIT`, `SetBookingInfoIT` at the HTTP/port seams. Commit `Retire a set that carries finished bookings instead of refusing the remove (#1030)`.

## Phase 4 — Frontend copy

- [ ] `set-editor.spec.ts` red on the new wording → copy + TSDoc → green; e2e assertion; `npm run lint`, `npm run format:check`, `npm test`, mocked e2e for the file. Commit `Name only the live claim in the set editor's remove refusal (#1030)`.

## Phase 5 — Docs

- [ ] ADR-0019, `CONTEXT.md`, `RESPONSIBILITIES.md`, `CLAUDE.md` (already touched in 0), `domain-model.md`, `git rm docs/plans/set-batch-apply.md`; `riviera-docs-freshness` sweep. Commit with the last code-touching change or as part of it.

---

## Generalization-audit log

| Date | Trigger (commit/phase) | Population (mechanism + how enumerated) | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-09-08 | plan | every production SQL string naming `set_position` | `git ls-files platform/src/main/java \| xargs grep -ln set_position` + the arch test | `JdbcVenueCatalog` (5), `JdbcVenues` (16), Javadoc-only mentions in 7 files | reads → view; writes → marker; the test holds the population from now on |
| 2026-09-08 | F-1 (CI red) | test SQL that picks "a set" from `set_position` without a venue scope, on the shared Testcontainers DB | `grep -rn "FROM set_position" platform/src/test/java \| grep -iv "venue_id\|WHERE id ="` | 26 sites: one `ORDER BY id DESC` picker (`VisibleOnlineSets`), 24 `ORDER BY id LIMIT n` pickers (the oldest rows — the seed, never retired), one `count(DISTINCT pool)` | the DESC picker reads the view (a retired row is the newest); the ASC pickers cannot meet a retired row and stay; the two new tests stop inserting on the seed venue |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** `gradle test --tests "*RetiredSetExclusionArchitectureTests*"` → 4 tests pass (red on the pre-phase-2 tree: 15 statements named).
- [x] **AC-2:** `gradle test --tests "*SetRetireMigrationIT*"` → 4 pass, 0 skipped.
- [x] **AC-3:** `--tests "*VenueAdminServiceTest*" --tests "*SetRetireIT*" --tests "*VenueAdminControllerIT*"` → green.
- [x] **AC-4:** `SetRetireIT.aRetiredSetIsGoneFromEveryExcludingRead`, `.aRetiredSetsSpotCanBeReused` → green.
- [x] **AC-5:** `--tests "*RetiredSetClaimIT*"` (2) + `SetRetireIT.bothClaimPathsRefuseARetiredSet` → green.
- [x] **AC-6:** `SetRetireIT.aBookingOnARetiredSetStillRendersItsSpot`, `SetBookingInfoIT.answersForARetiredSet` → green.
- [x] **AC-7:** `--tests "*SetRetireVsMarkConcurrencyIT*"` → 6 repetitions, both orders exercised.
- [x] **AC-8:** `ng test --include='**/operator/set-editor.spec.ts' --include='**/operator/layout-editor.spec.ts'` + a11y/contrast pairs → 169 pass; `playwright test --config playwright.a11y.config.ts e2e/operator-set-editing.e2e.ts e2e/layout-editor.e2e.ts` → 28 pass.
- [x] **AC-9:** the six-member structural-net command → green after the adapter split and after the port change.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled (or justified N/A); concurrency test present (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; event payloads id-based (invariant #11).
- [x] **Payment/payout** section filled (or N/A); webhooks are source of truth; idempotent; money in minor units; payout exactly-once (invariants #5, #8, #9).
- [x] Refund policy enforced server-side (invariant #10).
- [x] Timezone correct: UTC stored, `Europe/Tirane` for cutoff/date (invariant #6).
- [x] Booking codes unguessable (invariant #7).
- [x] Flyway migration present for schema changes; invariant-enforcing constraints tested (invariant #12).
- [x] **Frontend** standards met or deviation documented; no `as any` on the contract.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register (no finding row left `open` without a decision).
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR, in its last code-touching commit** — the plan doc's final state is committed here, citing `merged via PR #NN`, and no docs-only commit follows it.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`, not the overlay alone. If tooling blocked the review, that is stated in the PR and its checkbox is left unticked.
