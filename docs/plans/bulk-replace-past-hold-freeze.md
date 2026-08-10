# Stop a past staff hold from freezing the bulk layout replace Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `replaceLayout`'s **availability** arm from `anyClaims` (any date, including
history) to `anyClaimsFrom(today)` — the question the two per-set writes already ask — so a
walk-in-only venue whose only residual state is a mark from a past season stops being permanently
locked out of the whole-map regenerate, while a hold that has not yet passed still refuses it.

**Architecture:** This applies #599's settled principle — **a `set_availability` row whose day has
gone is not load-bearing** — to the third and last layout write, which makes `anyClaims` unreachable
and lets the port shed it: after this slice `SetAvailabilityLookup` publishes **one** blocking
availability question instead of two, and all three layout writes ask it. The **booking** arm
(`hasBookings(venueId)`) is deliberately untouched: `replaceLayout` deletes every set, so the
RESTRICT `booking.set_id` FK genuinely forces it, and narrowing it would be a redesign of the write
rather than a predicate swap (see Non-goals).

**Persistence:** JDBC only (invariant #1). No migration, no schema change, no new SQL — the
`anyClaimsFrom` predicate already exists on `venue.spi.SetAvailabilityLookup`, is already
implemented by `availability`'s `JdbcSetAvailabilityLookup`, and already rides
`set_availability_uniq (set_id, booking_date)`. One query is **deleted** (`anyClaims`'s
`EXISTS`), none added.

**Source of intent:** GitHub issue #602 (deferred from #599, recorded in that slice's
Generalization-audit log).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
issue's severity framing went stale **the same day it was filed**: #603 shipped the console's
per-set *Edit sets* mode, so the bulk replace is no longer the only way to change a live venue's
map, which is what demoted option 2 from "where the usability lives" to a redesign nobody is
blocked on; also caught that `replaceLayout` is `anyClaims`' **sole** caller, making this a port
narrowing rather than the one-line predicate swap the issue describes) · `riviera-plan-doc` (this
template — the Behavior-parity ledger is what forced the row-by-row check that turned up the two
existing ITs whose future-dated holds keep them valid unchanged, so the slice adds a test rather
than re-dating four) · `tdd` (service test red → narrow the predicate → green, then the
Testcontainers pin) · `riviera-modulith` (the api-vs-spi check: **removing** a method from a
published `venue::spi` named interface is a published-surface change, so `ModularityTests` +
`PublishedSurfacePlacementArchitectureTests` are in the scoped run; confirmed no
`allowedDependencies` grant changes — the `venue → availability` inversion is untouched) ·
`riviera-java-conventions` (§6d — the deleted method's Javadoc does not migrate to `anyClaimsFrom`;
the surviving contract is stated, not the history of the one that went; the shared live-hold arm
widens to `Collection<SetId>` so all three writes share **one**
`LocalDate.now(clock.withZone(TIRANE))` expression rather than growing a second) · `postgres`
(index fit for the swapped call: `anyClaimsFrom`'s `set_id IN (…) AND booking_date >= :from` rides
the same `set_availability_uniq` composite the deleted `anyClaims` rode, with the range predicate
on the index's *second* column — strictly narrower, same leading column, same venue-sized IN-list,
so the plan is equal-or-better and no index changes) · `riviera-local-debug` (scoped test runs) ·
`riviera-review-overlay` (review gate — due at ready-for-review) · `riviera-docs-freshness`
(close-out sweep — due, and expected to be the largest part of this slice: `anyClaims` is named in
four merged plan docs and two `(any date)` Javadocs outside the code diff).
`angular-*` / `playwright-cli` **not** loaded — no user-facing frontend surface changes; the
console already renders `LAYOUT_IN_USE` and its copy stays correct (see FE↔BE contract).

**Branch:** `claude/sdlc-602-y3vcce` — the cloud session's designated remote branch **stands in
for** `bugfix/bulk-replace-past-hold-freeze` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [ ] **AC-1:** Given a venue with **no bookings** whose `set_availability` rows are all dated
      **before today** in `Europe/Tirane`, when the owner calls `EditBeachMap.replaceLayout` with a
      valid layout and the current token, then the outcome is `ReplaceLayoutOutcome.Replaced`, the
      map is replaced, and the historical rows go with the old sets via CASCADE.
      *Pinned by:* `VenueAdminServiceTest.replacesLayoutWhenTheOnlyHoldsArePast` +
      `BeachMapReplaceIT.replacesTheLayoutOfAWalkInOnlyVenueWhoseHoldsAreAllPast`
- [ ] **AC-2:** Given a venue holding a `set_availability` row dated **today or later**, when the
      owner calls `replaceLayout`, then the outcome is `Rejected(LAYOUT_IN_USE)`, **nothing** is
      deleted, the hold survives, and `set_version` is not advanced (invariant #2 — no silent
      cascade of a live hold).
      *Pinned by:* `VenueAdminServiceTest.rejectsReplaceWhenVenueHasLiveAvailabilityHold` (the
      inclusive **today** edge, under the fixed clock) +
      `BeachMapReplaceIT.rejectsWhenVenueHasWalkInHoldAndHoldSurvives` (existing, future-dated)
- [ ] **AC-3:** Given a venue with a booking of any status including a terminal one, and **no** live
      hold, when the owner calls `replaceLayout`, then the outcome is still
      `Rejected(LAYOUT_IN_USE)` — the booking arm is untouched, so the RESTRICT FK's 500 stays
      pre-empted.
      *Pinned by:* `VenueAdminServiceTest.rejectsReplaceWhenVenueHasBooking` +
      `BeachMapReplaceIT.rejectsWhenVenueHasBooking` (both existing, unchanged)
- [ ] **AC-4:** Given the replace guard runs, when it probes availability, then it asks
      `anyClaimsFrom` about **exactly the venue's locked set list**, with **today in
      `Europe/Tirane`** (invariant #6), and only **after** `lockSetsOfVenue` has taken the rows
      `FOR UPDATE` (invariant #2).
      *Pinned by:* `VenueAdminServiceTest.replaceAsksTheLiveHoldQuestionAboutTheLockedSetsAfterLockingThem`
- [ ] **AC-5:** Given `venue.spi.SetAvailabilityLookup`, then it declares **no** date-agnostic claim
      probe — all three layout writes ask the single `anyClaimsFrom` question, and the module
      structure still verifies.
      *Pinned by:* `VenueAdminServiceTest`'s fake no longer able to override `anyClaims` (the method
      is gone from the port, so a stale `@Override` fails compilation) + `ModularityTests` +
      `PublishedSurfacePlacementArchitectureTests`
- [ ] **AC-6:** Given a staff walk-in mark for a future date racing a `replaceLayout` on the same
      venue, when both run concurrently, then they never both succeed and a committed hold is never
      silently cascaded — unchanged by this slice.
      *Pinned by:* the existing `BeachMapReplaceIT.concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold`

## Non-goals

- **Narrowing `replaceLayout`'s `hasBookings(venueId)` arm** — issue #602's option 2. Declined by
  the maintainer at the issue-intake gate, and the grill supports it on two independent grounds.
  *Structural:* the write is `deleteAllSets` + `insertSets`, so the RESTRICT `booking.set_id` FK
  really does refuse; narrowing means turning the bulk replace into a diff/merge (or a
  soft-delete/decommission), which must first answer what a terminal booking's `set_id` points at
  after a regenerate and what the beach map shows for such a set. *Situational:* since #603 the
  console has a per-set **Edit sets** mode that works on a live venue, and the `LAYOUT_IN_USE` copy
  already routes the operator there — so no operator is actually stuck, which is what the issue
  assumed when it called this "where the actual usability of the bulk editor lives".
- **Preserving past occupancy history** (a snapshot table, a soft-delete flag). Settled by #599 and
  not reopened — the rows are unreachable through any API once their sets are gone.
- **Any change to `editSet`, `removeSet`, or `repriceRow`**, to the `409 LAYOUT_IN_USE` wire shape
  or code, or to `set_availability` itself.
- **Any frontend change.** The console's locked-layout copy stays correct — see FE↔BE contract.
- No Flyway migration, no new port, no `allowedDependencies` change.

## Behavior-parity ledger

> This slice changes an existing endpoint's behavior rather than retiring a surface, so the ledger
> is used as #567's and #599's were: one row per observable behavior of
> `PUT /api/venues/{v}/beach-map`.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `replaceLayout` on a venue with no holds and no bookings → `204`, map replaced | preserved | both arms false; guard is a no-op |
| `replaceLayout` on a venue holding a **future/today** `STAFF_MARKED` or `BOOKED_ONLINE` row → `409 LAYOUT_IN_USE`, hold kept, nothing deleted | preserved | `anyClaimsFrom(existing, today)` under `lockSetsOfVenue`'s `FOR UPDATE`; AC-2 |
| `replaceLayout` on a venue whose holds are **all in the past**, with no booking → `409 LAYOUT_IN_USE`, forever | **changed** → `204`, map replaced, past rows CASCADE away | the bug (#602); AC-1 |
| `replaceLayout` on a venue with a booking of any status → `409 LAYOUT_IN_USE` (pre-empting the FK 500) | preserved | `hasBookings(venueId)` unchanged; AC-3 |
| `replaceLayout` with a stale `expectedVersion` → `409 STALE_WRITE`, token untouched | preserved | `lockAndReadSetVersion` still runs **before** the claim probe; untouched |
| A `LAYOUT_IN_USE` reject leaves `set_version` unadvanced (no spurious bump) | preserved | `incrementSetVersion` is still success-path only; asserted in AC-2's unit test |
| `replaceLayout` with an empty / oversized / internally-conflicting layout → `400`/`409` before any probe | preserved | those guards all precede the version read and the probe; untouched |
| `replaceLayout` on an unknown venue → `404 NO_SUCH_VENUE` | preserved | `venueExists` is still the existence check |
| `replaceLayout` by a non-owner → `403 NOT_VENUE_OWNER` before any read | preserved | `assertOwns` is still the first statement (invariant #13) |
| A staff mark racing a replace — never both, hold never silently lost | preserved | the probe still runs after `lockSetsOfVenue`; AC-6 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A hold dated **today** stops blocking (off-by-one on the boundary), so a walk-in marked this morning is cascaded away mid-service-day — a live invariant-#2 breach, and worse here than in #599 because the replace sweeps the **whole venue** | low | high | `anyClaimsFrom` is `booking_date >= :from` (inclusive) and the cutoff is `today`, not `today+1`; the boundary is pinned where the clock is **controlled** — `VenueAdminServiceTest` under the fixed `CLOCK`, plus the existing `AvailabilityLookupIT.anyClaimsFromCountsOnlyHoldsOnOrAfterTheCutoff` on the SQL predicate. Deliberately **not** pinned with a today-dated hold in an IT: that is #599's finding F-4 (test-JVM clock vs application clock across midnight), and repeating it here would reintroduce a flake the last slice removed | agent | open |
| R-2 | Timezone: `today` computed in UTC instead of `Europe/Tirane` (invariant #6) puts the boundary up to 2h off | low | med | the existing `hasLiveHold` predicate **widens** to `Collection<SetId>` and serves all three writes, so there is exactly one `LocalDate.now(clock.withZone(TIRANE))` expression in the service and no second one to drift; AC-4 asserts the date the probe received against `TODAY_IN_TIRANE`, and the fixed `CLOCK` is 22:30Z (i.e. already tomorrow in Tirane) so a UTC read fails the assertion | agent | open |
| R-3 | Loosening a venue-wide guard reopens the race it closed — a mark or claim committing between probe and `deleteAllSets` | low | high | unchanged ordering: `lockSetsOfVenue` (`SELECT … FOR UPDATE`) **before** the probe, inside one `@Transactional`. AC-4 pins the call order and AC-6 the real race. The stronger argument also holds unchanged from #599: no write path can create a row behind the cutoff (invariant #4 closes the online sale the evening before; `StaffAvailability#mark` refuses `DATE_IN_PAST`), so the narrowing gives up **no** window a racing writer could use | agent | open |
| R-4 | Data loss: a walk-in-only venue's past `set_availability` rows now disappear when its map is regenerated, irreversibly and **venue-wide** rather than one set at a time | certain (by design) | low | accepted — the same fact #599 settled (R-4 there), with the same reasoning: no API can read a deleted set's past days, since `DailyAvailabilityService` overlays `statesOn` driven by the **current** layout. The wider scope does not change reachability, only how many unreachable rows go at once | maintainer | accepted |
| R-5 | Removing `anyClaims` from a **published** `venue::spi` named interface breaks a consumer this session did not find | low | med | the port has exactly one implementor (`availability`) and, after this slice, zero callers — verified by `git grep -n "anyClaims"` over `platform/src`, which returns only the declaration, the impl, the one caller being changed, and the test fake. A missed consumer cannot compile, so this fails loudly at build time, never at runtime. `ModularityTests` + `PublishedSurfacePlacementArchitectureTests` in the scoped run | agent | open |
| R-6 | Query-plan regression: the venue-wide call moves from a bare `set_id IN (…)` `EXISTS` to one carrying an extra `booking_date >= :from` | low | low | none needed — `set_availability_uniq (set_id, booking_date)` leads on `set_id` and carries `booking_date` second, so the added predicate is an index-range narrowing on the same scan, with the same IN-list size the old probe already used. `postgres` consulted; no index change | agent | open |
| R-7 | Stale prose outlives the change: four merged plan docs, two `(any date)` Javadocs and `RESPONSIBILITIES.md` describe a guard that no longer exists, and a future reader reinstates `anyClaims` as a "regression fix" | med | low | this is exactly #599's F-2/F-1 failure mode, so the docs sweep is a **planned phase** (phase 2), not a close-out afterthought: `EditBeachMap`, `ReplaceRejection`, `SetAvailabilityLookup`, `RESPONSIBILITIES.md` §`venue` in the code phases, then `riviera-docs-freshness` over the whole range for what the diff cannot show | agent | open |

## Open questions / Assumptions

*None open.*

### Deliberate non-change (flagged, not patched)

- **The operator-facing copy stays generic.** `VenueAdminController:239` ("This venue has bookings or
  walk-in holds, so its layout is locked.") and its frontend twin `layout-editor.ts` are imprecise
  after this slice — a venue whose holds are all history is no longer locked. They are **left alone
  on purpose**: they mirror the `SET_IN_USE` copy at `VenueAdminController:223` ("This set is booked
  or held…"), which #599 deliberately left generic for the identical reason, and changing one
  without the other breaks that parity. Sharpening both is a **product-copy decision for the
  maintainer**, not a freshness defect — raised here rather than taken unilaterally.

### Resolved

- **Open question (the issue's own "question to settle"):** narrow the availability arm only, or
  also reconsider `hasBookings(venueId)`? → **Option 1 alone.** Settled by the maintainer via
  `AskUserQuestion` at the issue-intake gate, against the grill's finding that #603 had already
  removed the urgency from option 2 (per-set *Edit sets* mode is the live-venue path, and the
  `LAYOUT_IN_USE` copy routes operators to it). Option 2 is recorded in Non-goals with its
  structural blocker, not carried as an open question.

- **Assumption:** no consumer outside `platform/src` calls `SetAvailabilityLookup#anyClaims`
  (a script, a fixture, a doc-generated client). → **Confirmed:** the port is an internal Java
  interface on a `@NamedInterface` package, reachable only from JVM code in this repo; `git grep`
  over the whole tree finds it in `platform/src` and in prose only. Removal is compile-checked.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged by this slice — the online
  claim/release (`AvailabilityClaim`), the staff tap-to-mark/release (`StaffAvailabilityService`),
  and the CASCADE that follows a `set_position` delete. This slice touches only a **read** probe
  and therefore only decides **whether** the CASCADE is allowed to happen.
- **Uniqueness guarantee:** `set_availability_uniq (set_id, booking_date)` — untouched; it is also
  the index the surviving predicate rides.
- **Concurrency strategy:** unchanged — `venues.lockSetsOfVenue(venueId)` takes `SELECT … FOR
  UPDATE` on every `set_position` row of the venue **before** the probe, inside one
  `@Transactional` unit, and after `lockAndReadSetVersion` has taken the venue row (the consistent
  venue-row-then-set-rows order that keeps replace and reprice deadlock-free). A concurrent mark's
  insert blocks on its FK's `FOR KEY SHARE` until this transaction ends, so it is either seen by
  the probe (→ `LAYOUT_IN_USE`) or fails cleanly against the replaced layout. Narrowing the
  *question* moves no lock, and the surviving question still covers every hold a racing writer
  could create — a hold can only ever be made for **today or later**, which is exactly the window
  `anyClaimsFrom(today)` still asks about. **This is why the narrowing is race-safe rather than
  merely low-risk: no write path can create a row in the range the probe stopped asking about.**
- **Pool rule (invariant #3):** untouched — the replace rewrites both pools wholesale; no pool flag
  is read by the guard.
- **Cutoff rule (invariant #4):** not a booking path, so the same-day rule is unaffected. It is,
  however, load-bearing for the argument above: it is what makes "no new row can appear in the
  past" true.
- **Pinning test:** `BeachMapReplaceIT.concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold`
  (existing, `@RepeatedTest(4)`, both interleavings) — proves a committed walk-in hold is never
  silently swept by a concurrent regenerate. It must stay green **unchanged**; its date is
  `LocalDate.now().plusYears(2)`, squarely inside the narrowed window.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | It owns the beach map and therefore the **policy** on when a layout write is refused; the probe it runs is its own guard, not availability's |
| M-2 | `availability` | existing | `SetAvailability` | Sole owner/reader of `set_availability`; the deleted `anyClaims` implementation is its code to remove |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `SetAvailabilityLookup#anyClaimsFrom(Collection<SetId>, LocalDate)` — **reused unchanged**, now the question all three layout writes ask | `SetId` | implemented by `availability`, called by `venue` |
| NI-2 | `venue.spi` | `SetAvailabilityLookup#anyClaims(Collection<SetId>)` — **REMOVED**; `replaceLayout` was its sole caller, so the method becomes unreachable with this slice | `SetId` | *(none after this slice)* |
| NI-3 | `venue.spi` | `BookingPresence#hasBookings(VenueId)` — **unchanged**, still the replace's booking arm | `VenueId` | implemented by `booking`, called by `venue` |

> A published surface **shrinks**; nothing is added. No `@ApplicationModule` grant changes — the
> `venue → availability` inversion and the `venue::spi` grant to `availability` are exactly as
> before, one method lighter.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event is published or consumed by this slice.` The layout writes publish nothing, so
there is no Event Publication Registry `event_type` rewrite to ship either.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide **which** claims block a whole-map regenerate (the policy: live holds, but any booking ever) | `venue` | `venue` Job: owns the beach map, set positions, and "refusing a layout write that a live claim depends on" (#567). Not `availability`'s: its Job is the per-`(set,date)` state and being its only writer, and `venue`'s Not-My-Job line ("Knowing whether a specific set is free on a date → `availability`") is honored by **asking** via the SPI rather than reading `set_availability` |
| Answer "do any of these sets have a hold from today onwards?" | `availability` | unchanged — the existing `anyClaimsFrom` implementation; `venue` supplies the cutoff date because it owns the write's policy |
| Stop answering "do any of these sets have a hold on any date?" | `availability` | the implementation is deleted where it lives, in the module that owns the table; `venue` only stops asking |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` A staff walk-in mark is never collected through the platform, so a
`STAFF_MARKED` row carries no money and no payout-ledger entry; deleting one has no ledger effect.
The rows that *do* carry money belong to bookings, and a venue with any booking is still refused by
the untouched booking arm — so this slice cannot reach a set that money depends on.

## Angular — frontend surfaces touched

**Comment-only — no behavior, no structure.** The docs-freshness sweep found two TSDoc blocks
stating the reversed fact, so the slice touches `frontend/` after all:

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `operator/layout-editor.ts` (class TSDoc) | existing | doc only | unchanged | unchanged |
| FE-2 | `operator/operator-console.service.ts` (`replaceLayout` TSDoc) | existing | doc only | unchanged | unchanged |

`riviera-frontend` is the **placement** authority and has nothing to decide here — no file is
created, moved, or re-foldered, and no import direction changes; the applicable rule is
`frontend/.claude/CLAUDE.md`'s TSDoc twin of `riviera-java-conventions` §6d (state the contract,
not the history). `angular-developer` / the angular-cli MCP are not routed: no Angular API, signal,
form, or template is touched. `playwright-cli` is not routed: **no observable behaviour changes**,
so there is no flow to drive and no e2e spec to add or amend.

The operator-facing **copy** is deliberately unchanged — see the deliberate non-change below.

## FE↔BE contract

`N/A — no contract change.` Same endpoint, same request body, same `ProblemDetail` shape and
`LAYOUT_IN_USE` code; only the server-side predicate behind the 409 narrows.

## Execution status

**Stage pointer:** `implement — phase 1 done, entering phase 2 (docs sweep)`

**Next action:** Phase 2 step 1 — `RESPONSIBILITIES.md` §`venue`, then the four merged plan docs,
then the `riviera-docs-freshness` sweep.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Narrow the replace’s availability arm + retire `anyClaims` (unit TDD) | ✅ | `9023c09` |
| 1 — Pin it end-to-end (Testcontainers) | ✅ | `cf83b39` |
| 2 — Docs sweep + close-out | ⏳ | |

**Local verification so far** (`riviera-local-debug` scoped runs; Docker available, so the ITs ran
for real): `VenueAdminServiceTest` green, observed **red first** on AC-1/2/4. `BeachMapReplaceIT`
**13 tests, `skipped=0`**, `AvailabilityLookupIT` **9 tests, `skipped=0`**. AC-1's end-to-end case
was also observed **genuinely red** — the replace guard was temporarily reverted to the any-date
question (`anyClaimsFrom(existing, LocalDate.EPOCH)`) and the new IT failed
`Status expected:<204> but was:<409>`, so the pin is proven to discriminate rather than merely
pass. The structural net (`ModularityTests`, `JdbcOnlyArchitectureTests`,
`PackageShapeArchitectureTests`, `PublishedSurfacePlacementArchitectureTests`) green after the
published surface shrank. CI owns the full suite.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | docs-freshness sweep (phase 2) | **A real test defect, not prose.** Deleting the fake's `anyClaims` override left `FakeAvailability.claimed` write-only, yet three tests still set it to model "history-only holds" — `editSetIsAllowedWhenTheOnlyBookingIsTerminalAndTheOnlyHoldIsPast`, `removeSetIsAllowedWhenTheOnlyHoldIsPast`, and this slice's own `replacesLayoutWhenTheOnlyHoldsArePast`. They were asserting "a past hold does not block" against a fake holding **nothing at all**, so all three would have stayed green if the narrowing regressed | fixed-in-`b19e630` — the fake now stores a **date** (`holdOn`) and `anyClaimsFrom` returns `holdOn != null && !holdOn.isBefore(from)`, so it discriminates exactly as the SQL does. Live-hold tests moved to `TODAY_IN_TIRANE` (pinning R-1's inclusive edge in the one place the clock is controlled), past-hold tests to `minusDays(400)`. **Verified load-bearing by mutation:** reverting the cutoff to `LocalDate.EPOCH` turns all three red (they passed before this fix) |
| F-2 | docs-freshness sweep (phase 2) | `frontend/src/app/operator/layout-editor.ts` class TSDoc: the bulk write "works only while the venue has never been booked or held — afterwards it answers `LAYOUT_IN_USE` permanently, and a trading venue never becomes unclaimed again". The strongest possible statement of the fact this slice reverses; a reader hitting a successful replace would file it as an invariant-#2 regression | fixed-in-`b19e630` — split into the booking half (still permanent) and the availability half (a walk-in-only venue whose marks are history becomes replaceable). Its sibling "narrower claim guards" also softened to "set-scoped", since the availability question is now identical across all three writes |
| F-3 | docs-freshness sweep (phase 2) | `BeachMapReplaceIT`'s class Javadoc (a file this slice **did** touch, in a block it did not) said the guard refuses "a booking or an availability hold" — contradicting the new test 220 lines below it | fixed-in-`b19e630` — qualified to "dated today or later", with the past-hold outcome stated |
| F-4 | docs-freshness sweep (phase 2) | `operator-console.service.ts#replaceLayout` TSDoc: "`LAYOUT_IN_USE` … means the venue has bookings or holds" — over-broad as an unqualified claim | fixed-in-`b19e630` — "or a hold dated today or later" |
| F-5 | docs-freshness sweep (phase 2) | **My own phase-2 edit introduced a counting error the sweep exists to remove:** `RESPONSIBILITIES.md` §`venue` read "All three **scopes** now guard", but there are three *writes* and only **two** scopes — and the rest of the sentence enumerates exactly two | fixed-in-`b19e630` — "All three **writes** now guard, with the **scope** following what the write destroys" |
| F-6 | docs-freshness sweep (phase 2) | `FakeBookings`'s Javadoc says "The **two** flags" but the class carries three (`hasBookings(VenueId)`, `hasBookings(SetId)`, `hasLiveBookings(SetId)`). **Pre-existing since #567**, not caused here; fixed opportunistically as it sits six lines from F-1 | fixed-in-`b19e630` — "three flags … both axes", naming the second axis explicitly |
| F-7 | docs-freshness sweep (phase 2) | `docs/plans/o3-layout-editor.md`'s **M-3 and NI-2 table rows** still described `anyClaims` as a live port method — the phase-2 patch had added a superseded note to that doc's guard narrative but missed its interface tables, which is the section a future session greps when asking "what ports exist" (exactly risk R-7's reversion path) | fixed-in-`b19e630` — superseded notes appended to both rows, mirroring the sibling doc's NI-3 wording |

---

## File structure

- `docs/plans/bulk-replace-past-hold-freeze.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — the narrowed replace predicate + the widened shared live-hold arm
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `anyClaims` removed; `anyClaimsFrom`'s Javadoc becomes the single availability question
- `platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java` — the `anyClaims` implementation and its `EXISTS` query removed
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — `replaceLayout`'s port Javadoc follows the new question
- `platform/src/main/java/ai/riviera/platform/venue/application/ReplaceRejection.java` — `LAYOUT_IN_USE`'s Javadoc drops "(any date)"
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1/2/3/4/5 at the inner hexagon; the fake sheds its `anyClaims` override and logs `lockSetsOfVenue`
- `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java` — AC-1 end-to-end
- `RESPONSIBILITIES.md` — §`venue`: all three layout writes share one availability question
- `docs/plans/set-delete-past-hold-freeze.md` — #599's "`anyClaims` survives" note follows what shipped
- `docs/plans/per-set-layout-write-claim-guard.md` — #567's `anyClaims` rows follow too
- `docs/plans/o3-layout-editor.md` — its guard description follows
- `docs/plans/set-version-concurrency.md` — its two `anyClaims` references follow
- `frontend/src/app/operator/layout-editor.ts` — class TSDoc: the bulk write's lock is no longer permanent for a walk-in-only venue (F-2)
- `frontend/src/app/operator/operator-console.service.ts` — `replaceLayout` TSDoc: `LAYOUT_IN_USE` qualified to a live hold (F-4)

---

## Phase 0 — Narrow the replace's availability arm + retire `anyClaims` (unit TDD)

**Files:** Modify `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java:166-197,256-268` ·
`platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java:41-53` ·
`platform/src/main/java/ai/riviera/platform/availability/adapter/out/JdbcSetAvailabilityLookup.java:63-75` ·
Test `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java`

- [ ] **Step 1: Write the failing tests** (AC-1/2/4), beside the existing bulk-replace tests

```java
	@Test
	void replacesLayoutWhenTheOnlyHoldsArePast() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());
		// History only: a walk-in-only venue's marks from last season, no booking ever.
		availability.claimed = true;

		ReplaceLayoutOutcome outcome = service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertSame(ReplaceLayoutOutcome.Replaced.REPLACED, outcome,
				"last season's walk-in marks must not freeze the whole map forever");
		assertEquals(1, venues.deletedAllCount);
		assertEquals(1, venues.incrementedSetVersions);
	}

	@Test
	void replaceAsksTheLiveHoldQuestionAboutTheLockedSetsAfterLockingThem() {
		venues.venues.add(VENUE.value());
		venues.existingSetIds.add(SET.value());

		service.replaceLayout(OWNER, VENUE, 0L, grid(2, 3));

		assertEquals(List.of(SET), availability.anyClaimsFromAskedAbout,
				"the probe must ask about exactly the sets the lock covers");
		assertEquals(List.of("lockSetsOfVenue", "anyClaimsFrom"), callLog,
				"the rows must be locked BEFORE the probe (invariant #2)");
		assertEquals(TODAY_IN_TIRANE, availability.anyClaimsFromDate,
				"the cutoff is today in Europe/Tirane, not UTC (invariant #6)");
	}
```

Then re-point the existing hold test at the live question: `rejectsReplaceWhenVenueHasAvailabilityHold`
becomes `rejectsReplaceWhenVenueHasLiveAvailabilityHold`, seeding `venues.existingSetIds` and setting
`availability.liveClaimed = true` (not `claimed`). `rejectsReplaceWhenVenueHasBooking` (AC-3) and
`replacesLayoutForUnclaimedVenue` are unchanged.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueAdminServiceTest*"` →
      FAIL: `replacesLayoutWhenTheOnlyHoldsArePast` expected `Replaced` but was
      `Rejected[LAYOUT_IN_USE]`; the two ordering/date assertions fail on `anyClaims` vs
      `anyClaimsFrom`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [ ] **Step 3: Minimal implementation** — widen the shared arm to a collection, point the replace
      at it, and delete the now-unreachable `anyClaims` from the port, its JDBC implementation, and
      the test fake (AC-5).

```java
	/**
	 * Whether a hold on any of these sets is still ahead — dated today or later in
	 * {@code Europe/Tirane} (invariant #6). The arm all three layout writes share: a hold whose day
	 * has passed can neither be stranded by a move nor be lost by a delete that matters, and no
	 * write path can add one behind this cutoff (invariant #4 closes the sale the evening before,
	 * and a staff mark refuses a past date) — which is why the probe stays race-safe under the row
	 * locks. Callers must already hold those locks.
	 */
	private boolean hasLiveHold(Collection<SetId> setIds) {
		return availability.anyClaimsFrom(setIds, LocalDate.now(clock.withZone(TIRANE)));
	}
```

`isLivelyClaimed` and `isLivelyClaimedOrEverBooked` call `hasLiveHold(List.of(setId))`; the replace's
guard becomes:

```java
		List<SetId> existing = venues.lockSetsOfVenue(venueId);
		if (hasLiveHold(existing) || bookings.hasBookings(venueId)) {
			return new ReplaceLayoutOutcome.Rejected(ReplaceRejection.LAYOUT_IN_USE);
		}
```

with its preceding comment's "(any date)" clause corrected to the live question, and
`SetAvailabilityLookup#anyClaimsFrom`'s Javadoc losing its "`anyClaims` stays the bulk replace's
question" sentence — the contract is now that this is the one blocking availability question
(`riviera-java-conventions` §6d: state the surviving contract, not the history of the removed one).

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueAdminServiceTest*"` → PASS

> Scope (end-of-phase regression): broaden to `--tests "*venue*"` plus the structural net
> (`*ModularityTests*`, `*JdbcOnlyArchitectureTests*`, `*PackageShapeArchitectureTests*`,
> `*PublishedSurfacePlacementArchitectureTests*`) — a published surface shrank (AC-5).

- [ ] **Step 5: Generalization-audit pass** — with `anyClaims` gone, re-run the #599 search
      (`git grep -n "anyClaims" -- platform/src`) to confirm zero survivors, and search for any
      remaining date-agnostic claim probe or `(any date)` prose; append to the log below.

- [ ] **Step 6: Commit** — `git commit -m "Let a venue whose holds are all history regenerate its map (#602)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Pin it end-to-end (Testcontainers)

**Files:** Test `platform/src/test/java/ai/riviera/platform/venue/BeachMapReplaceIT.java:248-274`

- [ ] **Step 1: Write the failing test** (AC-1 end-to-end), beside
      `rejectsWhenVenueHasWalkInHoldAndHoldSurvives`

```java
	@Test
	void replacesTheLayoutOfAWalkInOnlyVenueWhoseHoldsAreAllPast() throws Exception {
		long venue = createVenue("Last Season Club");
		putLayout(venue, layout(0,
				cell("A", 1, "STANDARD", "WALK_IN", 2000, 1, 1),
				cell("A", 2, "STANDARD", "WALK_IN", 2000, 2, 1)), 204);
		long heldSet = setIds(venue).getFirst();
		// Inserted directly: the staff-mark endpoint refuses a past date, which is how history accrues.
		jdbc.sql("""
				INSERT INTO set_availability (set_id, booking_date, state)
				VALUES (:s, :d, 'STAFF_MARKED')
				""")
				.param("s", heldSet)
				.param("d", LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(400))
				.update();

		mvc.perform(put("/api/venues/{v}/beach-map", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(layout(currentSetVersion(venue),
								cell("A", 1, "PREMIUM", "ONLINE", 3500, 1, 1))))
				.andExpect(status().isNoContent());

		assertEquals(0L, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
						.param("s", heldSet).query(Long.class).single(),
				"a hold describing a day that is gone goes with its set (CASCADE)");
		mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(1));
	}
```

The hold date is **relative to today**, not a `DATE '…'` literal — the date-bomb convention #599's
R-3 established. `rejectsWhenVenueHasWalkInHoldAndHoldSurvives` (AC-2) and `rejectsWhenVenueHasBooking`
(AC-3) need **no change**: their holds are dated 2035 and their booking is status-agnostic, so both
stay valid under the narrowed predicate — as #599's audit log predicted.

- [ ] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*BeachMapReplaceIT*"` →
      FAIL: expected 204, got 409 (`LAYOUT_IN_USE`). *(Requires Docker; without a daemon the IT
      skips — then CI is the gate, per `riviera-local-debug`.)*

- [ ] **Step 3: Minimal implementation** — none: phase 0's change is what makes it pass. If it does
      not, the phase-0 predicate is wrong and phase 0 re-opens.

- [ ] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*BeachMapReplaceIT*"
      --tests "*AvailabilityLookupIT*" --tests "*VenueSetWriteConcurrencyIT*"` → PASS, with AC-6's
      `concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold` green **unchanged**.

- [ ] **Step 5: Generalization-audit pass** — grep the venue ITs for hard-coded `DATE '` literals
      the now date-sensitive replace guard reads; append to the log.

- [ ] **Step 6: Commit** — `git commit -m "Pin the replace guard's live-hold boundary end-to-end (#602)"`

- [ ] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Docs sweep + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `EditBeachMap.java` · `ReplaceRejection.java` ·
`docs/plans/set-delete-past-hold-freeze.md` · `docs/plans/per-set-layout-write-claim-guard.md` ·
`docs/plans/o3-layout-editor.md` · `docs/plans/set-version-concurrency.md`

- [ ] **Step 1:** `RESPONSIBILITIES.md` §`venue` — the availability question is now **uniform across
      all three** layout writes; the surviving asymmetry is the booking arm alone, and its scope
      (venue-wide vs set-scoped) still follows what the write destroys.
- [ ] **Step 2:** `EditBeachMap#replaceLayout` and `ReplaceRejection#LAYOUT_IN_USE` Javadoc drop
      "(any date)" for the live question.
- [ ] **Step 3:** Correct the four merged plan docs against what shipped, in the repo's house style
      (precedent: `09bcf36`, and #599's own phase 2) — each `anyClaims` reference gets a superseded
      note rather than a rewrite, so the historical record stays readable.
- [ ] **Step 4:** Run `riviera-docs-freshness` over `origin/main...HEAD`, including the **counting
      sweep** — this slice takes `SetAvailabilityLookup` from four published methods to three and
      from two blocking availability questions to one, so any doc saying "the two questions" goes
      stale outside the diff. Record the result in *Skills consulted*.
- [ ] **Step 5:** `node scripts/check-plan-file-structure.mjs --diff origin/main` and
      `node scripts/check-inline-comments.mjs --diff origin/main` → both clean.
- [ ] **Step 6: Commit** — `git commit -m "Follow the narrowed replace guard through the docs (#602)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | phase 0 | Surviving callers of the retired date-agnostic probe | `git grep -n "anyClaims\b" -- platform/src` (excluding `anyClaimsFrom`) | 0 | **None to fix.** Confirms AC-5: the port method, its JDBC implementation, its one caller and the test fake's override are all gone, so no consumer can still ask the any-date question |
| 2026-08-10 | phase 0 | A second `LocalDate.now(clock…)` expression that could drift from the shared arm | `git grep -n "anyClaimsFrom\|hasBookings\|takenOn\|statesOn" -- …/venue/application` | 4 call sites, **1** date expression (`VenueAdminService:176`) | **Skip — already correct.** All three layout writes reach the cutoff through the single `hasLiveHold` predicate; `DailyAvailabilityService` takes its date from the caller (a read, not a guard). Nothing to converge |
| 2026-08-10 | phase 1 | Hard-coded `DATE '…'` literals the now date-sensitive replace guard reads | `git grep -n "DATE '" -- …/venue …/availability` | 4 | **Subset — one changed.** `BeachMapReplaceIT:260` (the hold behind `rejectsWhenVenueHasWalkInHoldAndHoldSurvives`) is the only literal the replace guard now reads; it is future-dated so the test is correct today, but it would flip meaning in 2035, so it moves to `LocalDate.now(TIRANE).plusDays(30)` — the relative-date convention #599's R-3 established. The other three are **not** read by the availability arm: `BeachMapReplaceIT:399` and `VenueAdminControllerIT:302` are *booking* dates behind the deliberately date-agnostic booking arm, and `VenueRepriceIT:157` sits behind a write that runs no claim probe at all. Unchanged |
| 2026-08-10 | phase 0 | `(any date)` prose describing the guard, in files review of the code diff would not open | `git grep -rn "any date" -- platform/src/main` | 2: `EditBeachMap:75`, `ReplaceRejection:22` | **Fix all — pulled forward from phase 2** rather than deferred, so no commit ships a Javadoc contradicting its own code (#599's F-1 lesson). Rewriting `EditBeachMap#replaceLayout` also surfaced an **unrelated** stale claim in the same block — "the token is bumped *before* the probe, so a rejected replace may still bump it — safe (only makes other tabs reload)" — which the `set-version-concurrency` F-4 fix reversed (the bump is success-path only, asserted by `rejectsReplaceWhenVenueHasBooking`). Corrected in the same edit |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** Run `./gradlew test --tests "*VenueAdminServiceTest*" --tests "*BeachMapReplaceIT*"` → PASS.
- [ ] **AC-2:** Same run → `rejectsReplaceWhenVenueHasLiveAvailabilityHold` + `rejectsWhenVenueHasWalkInHoldAndHoldSurvives` PASS.
- [ ] **AC-3:** Same run → `rejectsReplaceWhenVenueHasBooking` + `BeachMapReplaceIT.rejectsWhenVenueHasBooking` PASS.
- [ ] **AC-4:** Same run → `replaceAsksTheLiveHoldQuestionAboutTheLockedSetsAfterLockingThem` PASS.
- [ ] **AC-5:** Run the structural net (`*ModularityTests*`, `*PackageShapeArchitectureTests*`, `*PublishedSurfacePlacementArchitectureTests*`) → PASS, with `git grep -n "anyClaims" -- platform/src` returning nothing.
- [ ] **AC-6:** Run `./gradlew test --tests "*BeachMapReplaceIT*"` → `concurrentWalkInMarkAndReplaceNeverSilentlyLoseTheHold` PASS, unchanged.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases.
- [ ] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [ ] **Availability** section filled; concurrency test present and unchanged (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4).
- [ ] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; the published surface shrank with no grant change (invariant #11).
- [ ] **Payment/payout** N/A justified; no money moves.
- [ ] Refund policy untouched (invariant #10).
- [ ] Timezone correct: the cutoff is `today` in `Europe/Tirane`, taken from the injected `Clock` (invariant #6).
- [ ] Booking codes untouched (invariant #7).
- [ ] No schema change, so no Flyway migration (invariant #12).
- [ ] **Frontend** N/A justified.
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — the plan doc's final state is committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
