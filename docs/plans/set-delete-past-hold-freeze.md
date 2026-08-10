# Stop a past staff hold from freezing a set's deletion Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow `removeSet`'s **availability** arm from `anyClaims` (any date, including
history) to `anyClaimsFrom(today)` — the same live question `editSet` asks — so a set whose only
residual state is a walk-in mark from a past season stops being permanently undeletable, while a
hold that has not yet passed still refuses the delete.

**Architecture:** The single decision is that a `set_availability` row whose day has gone is **not**
load-bearing, so it may CASCADE away with the set. Everything else about the guard is unchanged: the
probe still runs **under the set row's `FOR UPDATE` lock** (invariant #2), and the **booking** arm
stays `hasBookings` — any status, including terminal — because the RESTRICT `booking.set_id` FK
genuinely makes such a set undeletable, so refusing early is what turns a 500 into an honest 409.
After this slice the two per-set writes ask the **same** availability question and differ on **one**
axis only (which bookings count), which is a simplification of the rule, not a new special case.

**Persistence:** JDBC only (invariant #1). No migration, no schema change, no new SQL — the
`anyClaimsFrom` predicate already exists on `venue.spi.SetAvailabilityLookup` and is already
implemented by `availability`'s `JdbcSetAvailabilityLookup` (it rides `set_availability_uniq`).

**Source of intent:** GitHub issue #599 (deferred from #567's review gate, finding G-3).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that the
availability arm's only *independent* effect is past `STAFF_MARKED` rows, since a booking's row is
released on cancel while the booking itself keeps blocking via `hasBookings`; also caught that no
feature PR is in flight and no Flyway number is at stake) · `riviera-plan-doc` (this template —
forced the behavior-parity ledger that surfaced the hard-coded `DATE '2027-07-01'` time bomb in the
IT, and the generalization audit that surfaced `replaceLayout`) · `tdd` (service test red → narrow
the predicate → green, then the Testcontainers pin) · `riviera-modulith` (confirmed this needs **no**
new port and no `allowedDependencies` change — the narrower question is an existing `venue::spi`
method, so the `venue → availability` inversion is untouched) · `riviera-java-conventions` (the
shared live-hold arm extracted as one private predicate rather than duplicating the
`LocalDate.now(clock.withZone(TIRANE))` expression; Javadoc §6d — contract not archaeology) ·
`riviera-review-overlay` (review gate — see Execution status) · `riviera-local-debug` (scoped test
runs; Docker was available, so the ITs ran for real rather than skipping) · `riviera-docs-freshness`
(**ran** over `origin/main...HEAD`, **2 findings, both patched**: `RESPONSIBILITIES.md` §`venue`'s
two-axis asymmetry paragraph, and — the sweep's own catch, in a file the diff never touched —
`SetRejection.SET_IN_USE`'s Javadoc, which stated "a *remove* is refused by any hold on any date").
`postgres` **not** loaded — no migration, no schema, no new query. `angular-*`
/ `playwright-cli` **not** loaded — no user-facing frontend surface changes (see FE↔BE contract).

**Branch:** `claude/sdlc-599-y8iulw` — the cloud session's designated remote branch **stands in for**
`bugfix/set-delete-past-hold-freeze` (`riviera-sdlc` § Remote/cloud session addendum).

---

## Acceptance criteria (testable)

- [x] **AC-1:** Given a set whose only `set_availability` rows are dated **before today** in
      `Europe/Tirane`, and which carries no booking, when the owner calls
      `EditBeachMap.removeSet`, then the outcome is `ChangeOutcome.Applied` and the set is deleted
      (its historical rows going with it via CASCADE).
      *Pinned by:* `VenueAdminServiceTest.removeSetIsAllowedWhenTheOnlyHoldIsPast` +
      `VenueAdminControllerIT.removeSetDropsAPastStaffHoldWithTheSet`
- [x] **AC-2:** Given a set carrying a hold dated **today or later**, when the owner calls
      `removeSet`, then the outcome is `Rejected(SET_IN_USE)` and **neither** the set **nor** the
      hold is deleted (invariant #2 — no silent cascade of a live hold).
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetIsHeld` +
      `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409` (a **today**-dated hold, the
      inclusive boundary)
- [x] **AC-3:** Given a set carrying a booking of any status including a terminal one, and **no**
      live hold, when the owner calls `removeSet`, then the outcome is still
      `Rejected(SET_IN_USE)` — the booking arm is untouched, so the RESTRICT FK's 500 stays
      pre-empted.
      *Pinned by:* `VenueAdminServiceTest.removeSetIsRefusedWhenTheSetHasAnyBooking` +
      `VenueAdminControllerIT.removeSetOnABookedSetAnswers409NotAServerError`
- [x] **AC-4:** Given the delete guard runs, when it probes availability, then it asks
      `anyClaimsFrom` about **that set alone**, with **today in `Europe/Tirane`** (invariant #6),
      and only **after** taking the set row's lock (invariant #2).
      *Pinned by:* `VenueAdminServiceTest.removeSetAsksTheLiveHoldQuestionAboutTheSetAloneAndAfterTakingTheLock`
- [x] **AC-5:** Given an online claim for a future date racing a `removeSet` on the same set, when
      both run concurrently, then exactly one wins — unchanged by this slice.
      *Pinned by:* the existing `SetWriteVsClaimConcurrencyIT.claimAndRemoveCannotBothWin`

## Non-goals

- **Narrowing `replaceLayout`'s venue-wide `anyClaims` probe.** The same permanent-freeze shape
  exists there for a walk-in-only venue; it is dominated by that write's own `hasBookings(venueId)`
  arm for every venue that has ever sold online. Recorded in the Generalization-audit log and
  deferred to **#602** rather than widened into this slice — the maintainer's decision was
  taken on a set-scoped delete, and the bulk regenerate is a different write with its own stance.
- **Preserving past occupancy history** anywhere (a snapshot table, a soft-delete/decommission flag).
  Settled: not load-bearing — see Resolved, below.
- **Any change to the booking arm** of either per-set write.
- **Any change to `editSet`**, to the `409 SET_IN_USE` wire shape, or to `set_availability` itself.
- No Flyway migration, no new port, no frontend change.

## Behavior-parity ledger

> This slice changes an existing endpoint's behavior rather than retiring a surface, so the ledger
> is used as #567's own was: one row per observable behavior of `DELETE /api/venues/{v}/sets/{s}`.

| Old-surface behavior | Verdict (preserved / changed / dropped) | How the new surface does it, or why it's gone |
|---|---|---|
| `removeSet` on an unclaimed, never-booked set → `204` | preserved | both arms false; guard is a no-op |
| `removeSet` on a set holding a **future/today** `STAFF_MARKED` or `BOOKED_ONLINE` row → `409 SET_IN_USE`, hold kept | preserved | `anyClaimsFrom(setId, today)` under the row lock; AC-2 |
| `removeSet` on a set whose holds are **all in the past** → `409 SET_IN_USE`, forever | **changed** → `204`, set deleted, past rows CASCADE away | the bug (#599); AC-1 |
| `removeSet` on a set with a booking of any status → `409 SET_IN_USE` (pre-empting the FK 500) | preserved | `hasBookings(setId)` unchanged; AC-3 |
| `removeSet` on an unknown set → `404 NO_SUCH_SET` | preserved | `lockSet` returning empty is still the existence check |
| `removeSet` by a non-owner → `403 NOT_VENUE_OWNER` before any read | preserved | `assertOwns` is still the first statement (invariant #13) |
| A claim racing a `removeSet` — exactly one wins | preserved | the probe still runs after `lockSet`'s `FOR UPDATE`; AC-5 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | A hold dated **today** stops blocking (off-by-one on the boundary), so a walk-in marked this morning is cascaded away mid-service-day — a live invariant-#2 breach | low | high | `anyClaimsFrom` is `booking_date >= :from` (inclusive), and the cutoff is `today`, not `today+1`; the boundary is pinned end-to-end by making `VenueAdminControllerIT.removeSetKeepsAStaffHoldAndAnswers409` use a **today**-dated hold, plus the existing `AvailabilityLookupIT.anyClaimsFromCountsOnlyHoldsOnOrAfterTheCutoff` | agent | closed — `removeSetKeepsAStaffHoldAndAnswers409` now inserts a **today**-dated hold and still gets `409` with the row intact (`049d0c6`) |
| R-2 | Timezone: `today` computed in UTC instead of `Europe/Tirane` (invariant #6) puts the boundary up to 2h off | low | med | reuse the exact expression the edit guard already uses, extracted into one shared private predicate so the two cannot drift; asserted by AC-4's `anyClaimsFromDate` check | agent | closed — one `hasLiveHold` predicate serves both writes; the unit clock is 22:30Z on the 15th, i.e. the 16th in Tirane, so a UTC read fails the assertion (`d170d5d`) |
| R-3 | Date time-bomb in the ITs: `removeSetKeepsAStaffHoldAndAnswers409` pins its hold at a hard-coded `DATE '2027-07-01'`. Harmless while the guard was date-agnostic; once it is date-sensitive that test silently changes meaning in July 2027 (it would then be asserting the *past*-hold case while claiming the live one) | high (by 2027) | med | replace every hard-coded date in the touched ITs with one relative to `LocalDate.now(Europe/Tirane)`, the convention the edit-guard IT already follows | agent | closed — `VenueAdminControllerIT`'s hold dates are now relative; the generalization audit checked the other four `DATE '` literals and found none the narrowed guard reads (`049d0c6`) |
| R-4 | Data loss: past `set_availability` rows now disappear with the set, irreversibly | certain (by design) | low | accepted — the maintainer settled it (see Resolved). No API can read them once the set is gone: `DailyAvailabilityService` overlays `statesOn(venues.setIdsOf(venueId), date)`, i.e. it is driven by the **current** layout, so a deleted set's past days are already unreachable whether or not its rows survive | maintainer | accepted |
| R-5 | Loosening a guard reopens the race the guard closed — a claim committing between probe and delete | low | high | unchanged ordering: `lockSet` (`SELECT … FOR UPDATE`) **before** the probe, both inside one `@Transactional`; AC-4 pins the call order and AC-5 the real race (`SetWriteVsClaimConcurrencyIT`, whose `DAY` is `today+30`) | agent | closed — both ITs green, unchanged; and the stronger argument holds: no write path can create a row behind the cutoff |
| R-6 | Module-boundary leak (invariant #11) | low | med | no new port, no new grant: `anyClaimsFrom` is an existing `venue::spi` method already implemented by `availability`; `venue` still never imports `availability`. `ModularityTests` in the scoped run | agent | closed — structural net green (`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`) |
| R-7 | The now-misleading `isClaimedEver` name (and its Javadoc, plus `RESPONSIBILITIES.md`'s "refuses on any claim ever recorded") outlives the change and misleads the next reader | med | low | rename to `isLivelyClaimedOrEverBooked`, rewrite the two Javadocs and the `RESPONSIBILITIES.md` §`venue` asymmetry paragraph in the same slice; `riviera-docs-freshness` at close-out | agent | closed — renamed to `isLivelyClaimedOrEverBooked`; the sweep additionally caught `SetRejection.SET_IN_USE`'s Javadoc, which no review of the diff could have (`ec2bfd0`) |

## Open questions / Assumptions

*None open.*

### Resolved

- **Assumption:** No operator-facing report, export, or ops runbook reads `set_availability` for a
  **deleted** set's past dates. → **Confirmed** at plan time and unchanged since: the only consumer
  is `DailyAvailabilityService`, which overlays `statesOn(venues.setIdsOf(venueId), date)` — driven
  by the *current* layout, so a deleted set's past days were already unreachable. Nothing outside
  `availability` queries the table.

- **Open question (the issue's own "question to settle"):** is a past `set_availability` row worth
  retaining once its day has gone? → **No.** Settled by the maintainer via `AskUserQuestion` at the
  issue-intake gate: *narrow to `anyClaimsFrom(today)`*, booking arm unchanged. The grill's
  supporting facts: the row carries no money and no payout-ledger consequence (walk-ins are not
  collected through the platform); the occupancy history it represents is unreachable through any
  API once the set is deleted; and the only existing escape hatch — releasing each historical mark
  one date at a time via `StaffAvailabilityService#release`, which has no past-date guard — is
  undiscoverable.

## Availability & concurrency (invariant #2)

- **Write paths to `availability(set_id, booking_date)`:** unchanged by this slice — the online
  claim/release (`AvailabilityClaim`), the staff tap-to-mark/release (`StaffAvailabilityService`),
  and the CASCADE that follows a `set_position` delete. This slice touches only a **read** probe
  (`SetAvailabilityLookup#anyClaimsFrom`) and therefore only decides **whether** the CASCADE is
  allowed to happen.
- **Uniqueness guarantee:** `set_availability_uniq (set_id, booking_date)` — untouched; it is also
  the index the narrowed predicate rides.
- **Concurrency strategy:** unchanged — `venues.lockSet(venueId, setId)` takes `SELECT … FOR UPDATE`
  on the `set_position` row **before** the probe, inside one `@Transactional` unit. A concurrent
  claim's insert blocks on its FK's `FOR KEY SHARE` until this transaction ends, so it is either
  seen by the probe (→ `SET_IN_USE`) or fails cleanly against a deleted set (→ `NO_SUCH_SET`).
  Narrowing the *question* does not move the lock, and the surviving question still covers every
  hold a racing claim could create — a claim can only ever be made for **today or later**
  (invariant #4 closes the sale the evening before; `StaffAvailability#mark` refuses
  `DATE_IN_PAST`), which is exactly the window `anyClaimsFrom(today)` still asks about. **This is
  why the narrowing is race-safe rather than merely low-risk: no write path can create a row in the
  range the probe stopped asking about.**
- **Pool rule (invariant #3):** untouched — the delete removes a set from both pools at once; no
  pool flag is read or written here.
- **Cutoff rule (invariant #4):** not a booking path; the same-day rule is unaffected. It is,
  however, load-bearing for the argument above: it is what makes "no new row can appear in the
  past" true.
- **Pinning test:** `SetWriteVsClaimConcurrencyIT.claimAndRemoveCannotBothWin` (existing, `@RepeatedTest(6)`,
  both interleavings) — proves a claim and a delete of the same set cannot both win. It must stay
  green unchanged; its `DAY` is `today+30`, i.e. squarely inside the narrowed window.

## Spring Modulith — modules, interfaces, events

**Modules touched**

| # | Module | Existing/new | Aggregate root | Why this module owns it |
|---|---|---|---|---|
| M-1 | `venue` | existing | `Venue`, `BeachMap` | It owns the beach map and therefore the **policy** on when a layout write is refused; the probe it runs is its own guard, not availability's |

**Cross-module named interfaces (`api/` ports)**

| # | Module.api | Port | Public types | Consumers |
|---|---|---|---|---|
| NI-1 | `venue.spi` | `SetAvailabilityLookup#anyClaimsFrom(Collection<SetId>, LocalDate)` — **reused unchanged**, now called by `removeSet` as well as `editSet` | `SetId` | implemented by `availability`, called by `venue` |
| NI-2 | `venue.spi` | `BookingPresence#hasBookings(SetId)` — **unchanged**, still the delete's booking arm | `SetId` | implemented by `booking`, called by `venue` |

> `SetAvailabilityLookup#anyClaims` survives — `replaceLayout` remains its caller. No port is added,
> removed, or re-scoped; no `allowedDependencies` grant changes.

**Domain events (id-based payloads, invariant #11)**

`N/A — no event is published or consumed by this slice.` The per-set layout writes publish nothing.

### Module ownership (§4a)

| Capability (what the slice adds/changes) | Owner module | Justification |
|---|---|---|
| Decide **which** claims block a set delete (the policy: live holds, but any booking ever) | `venue` | `venue` Job: owns the beach map, set positions, and — since #567 — "refusing a layout write that a live claim depends on". Not `availability`'s: its Job is the per-`(set,date)` state and being its only writer, and `venue`'s Not-My-Job line ("Knowing whether a specific set is free on a date → `availability`") is honored by **asking** via the SPI rather than reading `set_availability` |
| Answer "does this set have a hold from today onwards?" | `availability` | unchanged — the existing `anyClaimsFrom` implementation; `venue` supplies the cutoff date because it owns the write's policy |

## Payment & payout (invariants #5, #8, #9, #10)

`N/A — no payment in scope.` A staff walk-in mark is never collected through the platform, so a
`STAFF_MARKED` row carries no money and no payout-ledger entry; deleting one has no ledger effect.
A set with any booking — the only rows that *do* carry money — is still refused by the untouched
booking arm.

## Angular — frontend surfaces touched

`N/A — backend-only.` The operator console's layout editor already renders `409 SET_IN_USE` from
the delete; this slice only changes **when** the server returns it, not the code, the shape, or the
copy. No component, route, service, or e2e spec changes, so `playwright-cli` is not routed.

## FE↔BE contract

`N/A — no contract change.` Same endpoint, same request, same `ProblemDetail` body and `SET_IN_USE`
code; only the server-side predicate behind the 409 narrows.

## Execution status

**Stage pointer:** `PR ready for review — review gate + Sonar gate due`

**Next action:** Run the review gate per `riviera-sdlc` `references/pr-gates.md` §1, then pull the Sonar new-issue list for PR #601.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Narrow the delete's availability arm (unit TDD) | ✅ | `d170d5d` |
| 1 — Pin it end-to-end + defuse the IT date bomb | ✅ | `049d0c6` |
| 2 — Docs sweep + close-out | ✅ | `ec2bfd0` |

**Local verification so far** (`riviera-local-debug` scoped runs, Docker available so the ITs ran
for real): `VenueAdminServiceTest` green (observed red first on AC-1/2/4);
`VenueAdminControllerIT` **40 tests, `skipped=0`**, all four `removeSet*` cases executed;
`SetWriteVsClaimConcurrencyIT` + `AvailabilityLookupIT` green unchanged; the structural net
(`ModularityTests`, `JdbcOnlyArchitectureTests`, `PackageShapeArchitectureTests`) green. The
end-to-end AC-1 test was written after phase 0's fix rather than before it, so it was never
observed red — its red-before-fix evidence is the unit test at the same predicate, which was.
CI owns the full suite.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding.
Every fix re-enters at Implement per the `riviera-sdlc` re-entry rule (run the
Skill-routing gate for what the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| F-1 | docs-freshness sweep (phase 2) | `SetRejection.SET_IN_USE`'s Javadoc stated "a *remove* is refused by any hold on any date" — false after phase 0, and in a file the diff never touched, so no review of the diff could have found it | fixed-in-`ec2bfd0` |

---

## File structure

- `docs/plans/set-delete-past-hold-freeze.md` — this plan
- `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java` — the narrowed delete predicate + the shared live-hold arm
- `platform/src/main/java/ai/riviera/platform/venue/application/EditBeachMap.java` — `removeSet`'s port Javadoc follows the new question
- `platform/src/main/java/ai/riviera/platform/venue/spi/SetAvailabilityLookup.java` — `anyClaims`/`anyClaimsFrom` Javadoc: `anyClaims` is now the bulk replace's question alone
- `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java` — AC-1/2/3/4 at the inner hexagon
- `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java` — AC-1/2 end-to-end; relative dates (R-3)
- `platform/src/main/java/ai/riviera/platform/venue/application/SetRejection.java` — `SET_IN_USE`'s Javadoc: both writes share the availability question (docs-freshness sweep)
- `RESPONSIBILITIES.md` — §`venue`: the two-axis asymmetry becomes one axis
- `docs/plans/per-set-layout-write-claim-guard.md` — #567's behavior table + its deferred-question note follow what shipped

---

## Phase 0 — Narrow the delete's availability arm (unit TDD)

**Files:** Modify `platform/src/main/java/ai/riviera/platform/venue/application/VenueAdminService.java:159-185` · Test `platform/src/test/java/ai/riviera/platform/venue/application/VenueAdminServiceTest.java`

- [x] **Step 1: Write the failing test** (AC-1), beside the existing `removeSet` tests

```java
@Test
void removeSetIsAllowedWhenTheOnlyHoldIsPast() {
	venues.venues.add(VENUE.value());
	venues.sets.put(SET.value(), VENUE.value());
	// History only: a walk-in marked last season, nothing still owed, no booking ever.
	availability.claimed = true;

	ChangeOutcome outcome = service.removeSet(OWNER, VENUE, SET);

	assertSame(ChangeOutcome.Applied.APPLIED, outcome,
			"last season's walk-in mark must not freeze the map forever");
	assertEquals(1, venues.deletedSets);
}
```

Then re-point the three existing tests at the live question:
`removeSetIsRefusedWhenTheSetIsHeld` sets `availability.liveClaimed = true` (not `claimed`), and
`removeSetAsksTheAvailabilityQuestionAboutTheSetAloneAndAfterTakingTheLock` becomes
`removeSetAsksTheLiveHoldQuestionAboutTheSetAloneAndAfterTakingTheLock` (AC-4), asserting
`anyClaimsFromAskedAbout == [SET]`, `callLog == [lockSet, anyClaimsFrom]`, and
`anyClaimsFromDate == TODAY_IN_TIRANE`.

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueAdminServiceTest*"` →
      FAIL: `removeSetIsAllowedWhenTheOnlyHoldIsPast` expected `Applied` but was
      `Rejected[SET_IN_USE]`, and the re-pointed tests fail on `anyClaims` vs `anyClaimsFrom`.

> Scope: target ONE test class with `--tests "*ClassName*"`. Not the full suite.

- [x] **Step 3: Minimal implementation**

```java
	if (isLivelyClaimedOrEverBooked(setId)) {
		return new ChangeOutcome.Rejected(SetRejection.SET_IN_USE);
	}
```

```java
	/**
	 * Whether any hold on this set is still ahead — dated today or later in {@code Europe/Tirane}
	 * (invariant #6). The arm both per-set layout writes share; a hold whose day has passed can
	 * neither be stranded by a move nor be missed by a delete, because no write path can create one
	 * (invariant #4 closes the sale the evening before, and a staff mark refuses a past date).
	 */
	private boolean hasLiveHold(SetId setId) {
		return availability.anyClaimsFrom(List.of(setId), LocalDate.now(clock.withZone(TIRANE)));
	}

	/**
	 * Whether anyone is still owed this exact spot — a live hold, or a booking that has not reached
	 * a terminal state. The <em>edit</em> question: an {@code UPDATE} of pool or coordinates strands
	 * only a guest who is still coming. Callers must already hold the row lock.
	 */
	private boolean isLivelyClaimed(SetId setId) {
		return hasLiveHold(setId) || bookings.hasLiveBookings(setId);
	}

	/**
	 * Whether a live hold or a booking of <em>any</em> status pins this set. The <em>delete</em>
	 * question, stricter than {@link #isLivelyClaimed} on the booking arm alone: the RESTRICT
	 * {@code booking.set_id} FK makes a set with any booking undeletable, so refusing early turns a
	 * server error into an honest conflict. History does not block on the availability arm — a past
	 * hold CASCADEs away with the set and describes a day that is gone.
	 * Rationale: RESPONSIBILITIES.md §venue. Callers must already hold the row lock.
	 */
	private boolean isLivelyClaimedOrEverBooked(SetId setId) {
		return hasLiveHold(setId) || bookings.hasBookings(setId);
	}
```

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueAdminServiceTest*"` → PASS

> Scope (end-of-phase regression): broaden to `--tests "*venue*"` plus `*ModularityTests*`.

- [x] **Step 5: Generalization-audit pass** — search every other date-agnostic claim probe
      (`git grep -n "anyClaims("`), decide per site, append to the log below.

- [x] **Step 6: Commit** — `git commit -m "Let a set whose holds are all history be deleted (#599)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 1 — Pin it end-to-end + defuse the IT date bomb

**Files:** Test `platform/src/test/java/ai/riviera/platform/venue/VenueAdminControllerIT.java:244-260`

- [x] **Step 1: Write the failing test** (AC-1 end-to-end) and re-date the live-hold IT (R-3)

```java
@Test
void removeSetDropsAPastStaffHoldWithTheSet() throws Exception {
	long venue = createVenue("Last Season Club");
	long setId = addSet(venue, setBody("Row A", 1, "STANDARD", "WALK_IN", 3000, "EUR", 1, 1));
	// Inserted directly: the staff-mark endpoint refuses a past date, which is how history accrues.
	jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
					+ "VALUES (:set, :day, 'STAFF_MARKED')")
			.param("set", setId)
			.param("day", LocalDate.now(ZoneId.of("Europe/Tirane")).minusDays(400))
			.update();

	mvc.perform(delete("/api/venues/{v}/sets/{s}", venue, setId).cookie(operatorSession).with(csrf()))
			.andExpect(status().isNoContent());

	assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set")
					.param("set", setId).query(Integer.class).single(),
			"a hold describing a day that is gone goes with the set (CASCADE)");
	mvc.perform(get("/api/venues/{id}", venue)).andExpect(jsonPath("$.sets.length()").value(0));
}
```

`removeSetKeepsAStaffHoldAndAnswers409` swaps its `DATE '2027-07-01'` literal for
`LocalDate.now(ZoneId.of("Europe/Tirane"))` — today, the inclusive boundary (AC-2, R-1, R-3).

- [x] **Step 2: Run it, verify it fails** — `./gradlew test --tests "*VenueAdminControllerIT*"` →
      FAIL: expected 204, got 409 (`SET_IN_USE`). *(Requires Docker; without a daemon the IT skips —
      then CI is the gate, per `riviera-local-debug`.)*

- [x] **Step 3: Minimal implementation** — none: phase 0's change is what makes it pass. If it does
      not, the phase-0 predicate is wrong and phase 0 re-opens.

- [x] **Step 4: Run it, verify it passes** — `./gradlew test --tests "*VenueAdminControllerIT*"
      --tests "*SetWriteVsClaimConcurrencyIT*" --tests "*AvailabilityLookupIT*"` → PASS

- [x] **Step 5: Generalization-audit pass** — grep the touched ITs for other hard-coded `DATE '`
      literals that a date-sensitive guard would silently reinterpret; append to the log.

- [x] **Step 6: Commit** — `git commit -m "Pin the delete guard's live-hold boundary end-to-end (#599)"`

- [x] **Step 7: Update plan-doc execution status** in the same commit window.

---

## Phase 2 — Docs sweep + close-out

**Files:** Modify `RESPONSIBILITIES.md` · `EditBeachMap.java` · `SetAvailabilityLookup.java` ·
`JdbcBookingPresenceIT.java` · `docs/plans/per-set-layout-write-claim-guard.md`

- [x] **Step 1:** `RESPONSIBILITIES.md` §`venue` — the asymmetry now runs along **one** axis (which
      bookings count), not two; both per-set writes ask the same live availability question, and the
      reason the delete keeps `hasBookings` is the FK alone.
- [x] **Step 2:** `EditBeachMap#removeSet` + `SetAvailabilityLookup#anyClaims`/`#anyClaimsFrom`
      Javadoc follow the new question (`anyClaims` is the bulk replace's guard alone).
- [x] **Step 3:** `docs/plans/per-set-layout-write-claim-guard.md` — mark #567's "delete keeps the
      any-claim reading" rows as superseded by #599, in the repo's own house style (a merged plan
      doc is corrected against what shipped — precedent: `09bcf36`).
- [x] **Step 4:** Run `riviera-docs-freshness` over the slice's range; record the result in
      *Skills consulted*.
- [x] **Step 5:** `node scripts/check-plan-file-structure.mjs --diff origin/main` and
      `node scripts/check-inline-comments.mjs --diff origin/main` → both clean.
- [x] **Step 6: Commit** — `git commit -m "Follow the narrowed delete guard through the docs (#599)"`

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-10 | phase 0 | Other date-agnostic claim probes carrying the same permanent-freeze shape | `git grep -n "anyClaims(" -- platform/src/main` | 3: the `venue.spi` declaration, its `availability` implementation, and **one** caller — `VenueAdminService#replaceLayout:266` (venue-wide) | **Subset.** `removeSet` narrowed here; `replaceLayout` deferred to **#602** (Non-goals). It carries the same shape only for a **walk-in-only** venue: its sibling arm `hasBookings(venueId)` already freezes the bulk regenerate permanently for any venue that has ever sold online, so narrowing the availability half alone changes nothing there. Widening a set-scoped decision to a venue-wide destructive write is the maintainer's call, not a fix-while-here |
| 2026-08-10 | phase 0 | Hard-coded `DATE '…'` literals a now date-sensitive guard would silently reinterpret | `git grep -n "DATE '" -- platform/src/test/java/ai/riviera/platform/venue` | 5 | **Subset.** `VenueAdminControllerIT:249` (the delete's staff hold) is re-dated relative to today in phase 1 — it is the only literal the narrowed guard reads. `:273` is a *booking* date behind the date-agnostic booking arm; `BeachMapReplaceIT:258` / `VenueRepriceIT:157` sit behind `anyClaims`/no probe and are dated 2035, so they stay valid even if the deferred `replaceLayout` narrowing lands. No change to those four |

---

## Acceptance-criteria verification (final)

- [x] **AC-1:** Run `./gradlew test --tests "*VenueAdminServiceTest*" --tests "*VenueAdminControllerIT*"` → PASS. Verified at commit `d170d5d` / `049d0c6`.
- [x] **AC-2:** Same run → `removeSetIsRefusedWhenTheSetIsHeld` + `removeSetKeepsAStaffHoldAndAnswers409` PASS with a **today**-dated hold. Verified at commit `d170d5d` / `049d0c6`.
- [x] **AC-3:** Same run → `removeSetIsRefusedWhenTheSetHasAnyBooking` + `removeSetOnABookedSetAnswers409NotAServerError` PASS. Verified at commit `d170d5d` / `049d0c6`.
- [x] **AC-4:** Same run → `removeSetAsksTheLiveHoldQuestionAboutTheSetAloneAndAfterTakingTheLock` PASS. Verified at commit `d170d5d` / `049d0c6`.
- [x] **AC-5:** Run `./gradlew test --tests "*SetWriteVsClaimConcurrencyIT*"` → PASS, unchanged. Verified at commit `d170d5d` / `049d0c6`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [x] Every AC has an implementing task and a verifying test.
- [x] No placeholders / TODO / TBD anywhere in the doc.
- [x] Type & method-signature consistency across phases.
- [x] **No JPA** introduced; no `spring-boot-starter-data-jpa`; no `@Entity` (invariant #1).
- [x] **Availability** section filled; concurrency test present and unchanged (invariant #2).
- [x] Pool + cutoff rules honored (invariants #3, #4).
- [x] **Modulith** section filled; no cross-module `application.*`/`adapter.*` imports; no new grant (invariant #11).
- [x] **Payment/payout** N/A justified; no money moves.
- [x] Refund policy untouched (invariant #10).
- [x] Timezone correct: the cutoff is `today` in `Europe/Tirane`, taken from the injected `Clock` (invariant #6).
- [x] Booking codes untouched (invariant #7).
- [x] No schema change, so no Flyway migration (invariant #12).
- [x] **Frontend** N/A justified.
- [x] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [x] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [x] **Close-out written in THIS PR** — the plan doc's final state is committed here, **merged via PR #601**.
- [ ] **The review gate ran in full** — per the invocation ladder in riviera-sdlc `references/pr-gates.md` §1 *plus* `riviera-review-overlay`.
